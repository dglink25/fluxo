import {
  Component, OnInit, OnDestroy, signal, NgZone, ElementRef, ViewChild, AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RealtimeService } from '../../core/services/realtime.service';
import { AuthService } from '../../core/services/auth.service';
import { CallStateService } from '../../core/services/call-state.service';
import { VideoCallApiService } from '../../core/services/video-call.service';
import { MessagingService } from '../../core/services/messaging.service';
import { environment } from '../../../environments/environment';

interface ChatMessage {
  id: string;
  content: string;
  sender: { id: string; username: string; avatarUrl?: string };
  createdAt: Date;
}

declare const JitsiMeetExternalAPI: any;

/**
 * Visioconférence via Jitsi Meet.
 * - Multiparticipants (comme Google Meet)
 * - Tout possesseur du lien peut rejoindre
 * - Partage d'écran, chat, réactions — tout inclus natif
 * - Fonctionne sans TURN server propre
 */
@Component({
  selector: 'flx-call',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './call.component.html',
  styleUrl: './call.component.scss',
})
export class CallComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('jitsiContainer') jitsiContainerRef!: ElementRef<HTMLDivElement>;

  roomId    = signal<string | null>(null);
  callId    = signal<string | null>(null);
  title     = signal<string>('Visioconférence');
  status    = signal<'loading' | 'ready' | 'ended'>('loading');
  linkCopied = signal(false);

  // Chat latéral (messages du channel/DM source)
  isChatOpen   = signal(false);
  chatMessages = signal<ChatMessage[]>([]);
  chatInput    = '';
  channelId    = signal<string | null>(null);
  projectId    = signal<string | null>(null);
  dmId         = signal<string | null>(null);

  private jitsiApi: any = null;
  private jitsiLoaded   = false;
  private _pendingJwt:  string | null | undefined = undefined;
  private _pendingRoom: string | undefined = undefined;

  /** Serveur JaaS */
  private readonly JITSI_DOMAIN = '8x8.vc';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private realtime: RealtimeService,
    public auth: AuthService,
    private ngZone: NgZone,
    private callState: CallStateService,
    private videoCallApi: VideoCallApiService,
    private messagingService: MessagingService,
  ) {}

  ngOnInit() {
    const room    = this.route.snapshot.queryParamMap.get('room')    ?? this.route.snapshot.paramMap.get('room');
    const cId     = this.route.snapshot.queryParamMap.get('callId');
    const chanId  = this.route.snapshot.queryParamMap.get('channelId');
    const projId  = this.route.snapshot.queryParamMap.get('projectId');
    const dId     = this.route.snapshot.queryParamMap.get('dmId');
    const t       = this.route.snapshot.queryParamMap.get('title');

    if (!room) { this.router.navigate(['/messaging']); return; }

    this.roomId.set(room);
    if (cId)    this.callId.set(cId);
    if (chanId) this.channelId.set(chanId);
    if (projId) this.projectId.set(projId);
    if (dId)    this.dmId.set(dId);
    if (t)      this.title.set(t);

    this.callState.setActive({
      callId:    cId ?? '',
      roomId:    room,
      title:     t ?? 'Visioconférence',
      hostName:  '',
      callUrl:   this.buildCallUrl(room),
      minimized: false,
    });

    this.setupChatListener();
    if (chanId && projId) this.loadChatHistory();
    else if (dId) this.loadChatHistory();

    // Charger le script Jitsi puis récupérer le JWT JaaS
    this.loadJitsiScript().then(() => {
      const room = this.roomId()!;
      // Demander un JWT JaaS au backend (durée illimitée)
      this.videoCallApi.getJaasToken(room).subscribe({
        next: (data) => {
          if (this.jitsiContainerRef) {
            this.initJitsi(data.jwt, data.isConfigured ? data.room : undefined);
          } else {
            // attendre ngAfterViewInit
            this.jitsiLoaded = true;
            this._pendingJwt  = data.jwt;
            this._pendingRoom = data.isConfigured ? data.room : undefined;
          }
        },
        error: () => {
          // Fallback sans JWT
          if (this.jitsiContainerRef) this.initJitsi(null);
          else { this.jitsiLoaded = true; this._pendingJwt = null; }
        },
      });
    }).catch(() => {
      this.status.set('ready'); // erreur de chargement du script
    });
  }

  ngAfterViewInit() {
    if (this.jitsiLoaded && this.jitsiContainerRef && !this.jitsiApi && this._pendingJwt !== undefined) {
      this.initJitsi(this._pendingJwt, this._pendingRoom);
    }
  }

  // ── Chargement SDK Jitsi ────────────────────────────────────────────────

  private loadJitsiScript(): Promise<void> {
    // Utiliser le script JaaS (8x8.vc) si AppID configuré, sinon fallback meet.jit.si
    const appId = environment.jaasAppId;
    const scriptSrc = appId
      ? `https://8x8.vc/${appId}/external_api.js`
      : `https://meet.jit.si/external_api.js`;

    if (typeof JitsiMeetExternalAPI !== 'undefined') {
      this.jitsiLoaded = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const existing = document.getElementById('jitsi-api-script');
      if (existing) {
        existing.addEventListener('load', () => { this.jitsiLoaded = true; resolve(); });
        return;
      }
      const script   = document.createElement('script');
      script.id      = 'jitsi-api-script';
      script.src     = scriptSrc;
      script.async   = true;
      script.onload  = () => { this.jitsiLoaded = true; resolve(); };
      script.onerror = () => reject(new Error('Impossible de charger Jitsi'));
      document.head.appendChild(script);
    });
  }

  // ── Initialiser Jitsi ────────────────────────────────────────────────────

  private initJitsi(jwt?: string | null, jaasRoom?: string) {
    const room = this.roomId();
    if (!room || !this.jitsiContainerRef?.nativeElement) return;

    const user    = this.auth.currentUser();
    const appId   = environment.jaasAppId;

    // Domaine et nom de la salle selon le mode (JaaS ou public)
    const domain   = appId ? '8x8.vc' : 'meet.jit.si';
    const roomName = jaasRoom ?? (appId ? `${appId}/fluxo-${room}` : `fluxo-${room}`);

    const options: any = {
      roomName,
      parentNode: this.jitsiContainerRef.nativeElement,
      width:      '100%',
      height:     '100%',
      configOverwrite: {
        startWithAudioMuted:  false,
        startWithVideoMuted:  false,
        prejoinPageEnabled:   false,
        enableLobbyChat:      false,
        requireDisplayName:   false,
        defaultLanguage:      'fr',
        // Désactiver la salle d'attente par défaut (l'hôte peut l'activer si besoin)
        lobby: { autoKnock: false, enableChat: false },
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK:      false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        APP_NAME:                  'Fluxo',
        NATIVE_APP_NAME:           'Fluxo',
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'desktop', 'fullscreen',
          'fodeviceselection', 'hangup', 'chat', 'raisehand',
          'videoquality', 'tileview', 'select-background', 'settings',
        ],
      },
      userInfo: {
        displayName: user?.fullName ?? user?.username ?? 'Participant',
        email:       user?.email ?? '',
      },
    };

    // Ajouter le JWT si disponible (mode JaaS — durée illimitée)
    if (jwt) {
      options.jwt = jwt;
    }

    try {
      this.jitsiApi = new JitsiMeetExternalAPI(domain, options);
      this.jitsiApi.addEventListeners({
        videoConferenceJoined: () => this.ngZone.run(() => this.status.set('ready')),
        videoConferenceLeft:   () => this.ngZone.run(() => this.leaveCall()),
        readyToClose:          () => this.ngZone.run(() => this.leaveCall()),
      });
      this.status.set('ready');
    } catch (e) {
      console.error('Erreur initialisation Jitsi:', e);
      this.status.set('ready');
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  buildCallUrl(room: string): string {
    const base   = window.location.origin;
    const params = new URLSearchParams({ room });
    if (this.callId())    params.set('callId',    this.callId()!);
    if (this.channelId()) params.set('channelId', this.channelId()!);
    if (this.projectId()) params.set('projectId', this.projectId()!);
    if (this.dmId())      params.set('dmId',      this.dmId()!);
    if (this.title())     params.set('title',     this.title());
    return `${base}/call?${params.toString()}`;
  }

  /** URL directe Jitsi — tout le monde peut rejoindre avec ce lien */
  get jitsiUrl(): string {
    return `https://${this.JITSI_DOMAIN}/fluxo-${this.roomId()}`;
  }

  async copyLink() {
    const url = this.buildCallUrl(this.roomId()!);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    this.linkCopied.set(true);
    setTimeout(() => this.linkCopied.set(false), 2500);
  }

  openInNewTab() {
    window.open(this.jitsiUrl, '_blank', 'noopener,noreferrer');
  }

  minimize() {
    this.callState.minimize();
    this.router.navigate(['/dashboard']);
  }

  leaveCall() {
    const cId = this.callId();
    if (cId) this.videoCallApi.endCall(cId).subscribe({ error: () => {} });
    this.status.set('ended');
    this.cleanup();
    this.callState.clear();
    setTimeout(() => this.router.navigate(['/messaging']), 800);
  }

  // ── Chat ─────────────────────────────────────────────────────────────────

  private setupChatListener() {
    this.realtime.on<any>('message:new', (msg) => {
      this.ngZone.run(() => {
        const chanId = this.channelId();
        const dId    = this.dmId();
        if ((chanId && msg.channelId === chanId) || (dId && msg.dmId === dId)) {
          this.chatMessages.update((msgs) => [...msgs, {
            id: msg.id, content: msg.content, sender: msg.sender, createdAt: new Date(msg.createdAt),
          }]);
        }
      });
    });
  }

  private loadChatHistory() {
    const chanId = this.channelId();
    const projId = this.projectId();
    const dId    = this.dmId();
    if (chanId && projId) {
      this.messagingService.getChannelMessages(projId, chanId).subscribe({
        next: (msgs) => this.chatMessages.set(msgs.map((m: any) => ({
          id: m.id, content: m.content, sender: m.sender, createdAt: new Date(m.createdAt),
        }))),
        error: () => {},
      });
    } else if (dId) {
      this.messagingService.getDmMessages(dId).subscribe({
        next: (msgs) => this.chatMessages.set(msgs.map((m: any) => ({
          id: m.id, content: m.content, sender: m.sender, createdAt: new Date(m.createdAt),
        }))),
        error: () => {},
      });
    }
  }

  sendChatMessage() {
    const content = this.chatInput.trim();
    if (!content) return;
    const chanId = this.channelId();
    const projId = this.projectId();
    const dId    = this.dmId();
    this.chatInput = '';
    if (chanId && projId) {
      this.messagingService.sendToChannel(projId, chanId, { content }).subscribe({ error: () => {} });
    } else if (dId) {
      this.messagingService.sendDm(dId, { content }).subscribe({ error: () => {} });
    }
  }

  toggleChat() { this.isChatOpen.update((v) => !v); }

  // ── Nettoyage ────────────────────────────────────────────────────────────

  private cleanup() {
    if (this.jitsiApi) {
      try { this.jitsiApi.dispose(); } catch { /* noop */ }
      this.jitsiApi = null;
    }
    this.realtime.off('message:new');
  }

  ngOnDestroy() {
    const active = this.callState.activeCall();
    if (active && !active.minimized && this.status() !== 'ended') {
      this.callState.minimize();
    } else {
      this.cleanup();
    }
  }
}
