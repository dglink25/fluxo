import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  ElementRef,
  ViewChild,
  NgZone,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { RealtimeService } from '../../core/services/realtime.service';
import { AuthService } from '../../core/services/auth.service';
import { CallStateService } from '../../core/services/call-state.service';
import { VideoCallApiService } from '../../core/services/video-call.service';
import { MessagingService } from '../../core/services/messaging.service';

interface ChatMessage {
  id: string;
  content: string;
  sender: { id: string; username: string; avatarUrl?: string };
  createdAt: Date;
}

/**
 * Visioconférence WebRTC peer-to-peer.
 * Supporte : modal flottant, partage de lien, chat latéral, partage d'écran.
 */
@Component({
  selector: 'flx-call',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './call.component.html',
  styleUrl: './call.component.scss',
})
export class CallComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('localVideo')  localVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef<HTMLVideoElement>;

  roomId    = signal<string | null>(null);
  callId    = signal<string | null>(null);
  projectId = signal<string | null>(null);
  status    = signal<'idle' | 'connecting' | 'connected' | 'ended'>('idle');
  localStream:  MediaStream | null = null;
  remoteStream  = signal<MediaStream | null>(null);
  screenStream: MediaStream | null = null;

  isMuted          = signal(false);
  isCamOff         = signal(false);
  isSharingScreen  = signal(false);
  isChatOpen       = signal(false);
  linkCopied       = signal(false);

  // Chat
  chatMessages     = signal<ChatMessage[]>([]);
  chatInput        = '';
  channelId        = signal<string | null>(null);
  dmId             = signal<string | null>(null);

  private isInitiator = false;
  private pc: RTCPeerConnection | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  private readonly ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

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

  async ngOnInit() {
    const room    = this.route.snapshot.queryParamMap.get('room') ??
                   this.route.snapshot.paramMap.get('room');
    const cId     = this.route.snapshot.queryParamMap.get('callId');
    const chanId  = this.route.snapshot.queryParamMap.get('channelId');
    const projId  = this.route.snapshot.queryParamMap.get('projectId');
    const dId     = this.route.snapshot.queryParamMap.get('dmId');

    if (!room) { this.router.navigate(['/messaging']); return; }

    this.roomId.set(room);
    if (cId)    this.callId.set(cId);
    if (chanId) this.channelId.set(chanId);
    if (projId) this.projectId.set(projId);
    if (dId)    this.dmId.set(dId);

    // Marquer l'appel comme actif dans le service global
    this.callState.setActive({
      callId: cId ?? '',
      roomId: room,
      title: this.route.snapshot.queryParamMap.get('title') ?? 'Visioconférence',
      hostName: '',
      callUrl: this.buildCallUrl(room),
      minimized: false,
    });

    await this.initMedia();
    this.setupSignaling(room);
    this.setupChatListener();
    this.realtime.emit('call:join', { room });

    // Charger l'historique du chat si on a un channel/DM
    if (chanId || dId) {
      this.loadChatHistory();
    }
  }

  ngAfterViewInit() {
    this.attachLocalVideo();
  }

  // ── Média ────────────────────────────────────────────────────────────────

  private async initMedia() {
    this.status.set('connecting');
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        this.isCamOff.set(true);
      } catch {
        alert('Impossible d\'accéder à la caméra ou au microphone.');
        this.router.navigate(['/messaging']);
        return;
      }
    }
    this.callState.localStream.set(this.localStream);
    this.attachLocalVideo();
  }

  private attachLocalVideo() {
    if (this.localStream && this.localVideoRef?.nativeElement) {
      this.localVideoRef.nativeElement.srcObject = this.localStream;
    }
  }

  // ── RTCPeerConnection ────────────────────────────────────────────────────

  private createPeerConnection(room: string): RTCPeerConnection {
    if (this.pc) this.pc.close();

    const pc = new RTCPeerConnection({ iceServers: this.ICE_SERVERS });

    this.localStream?.getTracks().forEach((t) => pc.addTrack(t, this.localStream!));

    pc.ontrack = (event) => {
      this.ngZone.run(() => {
        const [stream] = event.streams;
        this.remoteStream.set(stream);
        this.callState.remoteStream.set(stream);
        setTimeout(() => {
          if (this.remoteVideoRef?.nativeElement) {
            this.remoteVideoRef.nativeElement.srcObject = stream;
          }
        }, 50);
        this.status.set('connected');
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.realtime.emit('call:ice', { room, candidate: event.candidate.toJSON() });
      }
    };

    pc.oniceconnectionstatechange = () => {
      this.ngZone.run(() => {
        const state = pc.iceConnectionState;
        if (state === 'connected' || state === 'completed') {
          this.status.set('connected');
        } else if (state === 'failed' || state === 'disconnected') {
          this.status.set('connecting');
        }
      });
    };

    this.pc = pc;
    return pc;
  }

  // ── Signalisation ────────────────────────────────────────────────────────

  private setupSignaling(room: string) {
    this.realtime.on<{ room: string; isInitiator: boolean }>('call:joined', (data) => {
      if (data.room !== room) return;
      this.isInitiator = data.isInitiator;
    });

    this.realtime.on<{ room: string }>('call:peer-joined', async (data) => {
      if (data.room !== room) return;
      if (this.isInitiator) {
        await this.ngZone.run(() => this.createOffer(room));
      }
    });

    this.realtime.on<{ room: string; offer: RTCSessionDescriptionInit }>('call:offer', async (data) => {
      if (data.room !== room) return;
      await this.ngZone.run(async () => {
        const pc = this.createPeerConnection(room);
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        for (const c of this.pendingCandidates) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* noop */ }
        }
        this.pendingCandidates = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.realtime.emit('call:answer', { room, answer: pc.localDescription });
      });
    });

    this.realtime.on<{ room: string; answer: RTCSessionDescriptionInit }>('call:answer', async (data) => {
      if (data.room !== room) return;
      await this.ngZone.run(async () => {
        if (!this.pc) return;
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        for (const c of this.pendingCandidates) {
          try { await this.pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* noop */ }
        }
        this.pendingCandidates = [];
      });
    });

    this.realtime.on<{ room: string; candidate: RTCIceCandidateInit }>('call:ice', async (data) => {
      if (data.room !== room) return;
      if (this.pc?.remoteDescription) {
        try { await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch { /* noop */ }
      } else {
        this.pendingCandidates.push(data.candidate);
      }
    });

    this.realtime.on<{ room: string }>('call:ended', (data) => {
      if (data.room !== room) return;
      this.ngZone.run(() => {
        this.status.set('ended');
        this.cleanup();
      });
    });
  }

  private async createOffer(room: string) {
    const pc = this.createPeerConnection(room);
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    this.realtime.emit('call:offer', { room, offer: pc.localDescription });
  }

  // ── Chat ─────────────────────────────────────────────────────────────────

  private setupChatListener() {
    this.realtime.on<any>('message:new', (msg) => {
      this.ngZone.run(() => {
        const chanId = this.channelId();
        const dId    = this.dmId();
        if ((chanId && msg.channelId === chanId) || (dId && msg.dmId === dId)) {
          this.chatMessages.update((msgs) => [...msgs, {
            id: msg.id,
            content: msg.content,
            sender: msg.sender,
            createdAt: new Date(msg.createdAt),
          }]);
        }
      });
    });
  }

  private loadChatHistory() {
    const chanId  = this.channelId();
    const projId  = this.projectId();
    const dId     = this.dmId();
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

  toggleChat() {
    this.isChatOpen.update((v) => !v);
  }

  // ── Partage de lien ───────────────────────────────────────────────────────

  buildCallUrl(room: string): string {
    const base = window.location.origin;
    const params = new URLSearchParams({ room });
    if (this.callId()) params.set('callId', this.callId()!);
    if (this.channelId()) params.set('channelId', this.channelId()!);
    if (this.projectId()) params.set('projectId', this.projectId()!);
    if (this.dmId()) params.set('dmId', this.dmId()!);
    return `${base}/call?${params.toString()}`;
  }

  async copyLink() {
    const url = this.buildCallUrl(this.roomId()!);
    try {
      await navigator.clipboard.writeText(url);
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 2000);
    } catch {
      // Fallback pour les navigateurs sans clipboard API
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 2000);
    }
  }

  openInNewTab() {
    const url = this.buildCallUrl(this.roomId()!);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // ── Contrôles ────────────────────────────────────────────────────────────

  toggleMute() {
    if (!this.localStream) return;
    const muted = !this.isMuted();
    this.localStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.isMuted.set(muted);
  }

  toggleCamera() {
    if (!this.localStream) return;
    const off = !this.isCamOff();
    this.localStream.getVideoTracks().forEach((t) => (t.enabled = !off));
    this.isCamOff.set(off);
    setTimeout(() => this.attachLocalVideo(), 50);
  }

  async toggleScreenShare() {
    if (this.isSharingScreen()) {
      this.screenStream?.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
      const camTrack = this.localStream?.getVideoTracks()[0];
      if (camTrack && this.pc) {
        const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(camTrack);
      }
      this.isSharingScreen.set(false);
    } else {
      try {
        this.screenStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
        const screenTrack = this.screenStream!.getVideoTracks()[0];
        if (this.pc) {
          const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) await sender.replaceTrack(screenTrack);
        }
        screenTrack.onended = () => this.toggleScreenShare();
        this.isSharingScreen.set(true);
      } catch { /* Annulé */ }
    }
  }

  /** Réduire en modal flottant et naviguer */
  minimize() {
    this.callState.minimize();
    this.router.navigate(['/dashboard']);
  }

  endCall() {
    const cId = this.callId();
    if (cId) {
      this.videoCallApi.endCall(cId).subscribe({ error: () => {} });
    }
    this.realtime.emit('call:end', { room: this.roomId() });
    this.status.set('ended');
    this.cleanup();
    this.callState.clear();
    this.router.navigate(['/messaging']);
  }

  // ── Nettoyage ────────────────────────────────────────────────────────────

  private cleanup() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.pc?.close();
    this.pc = null;
    this.localStream = null;
    this.realtime.off('call:joined');
    this.realtime.off('call:peer-joined');
    this.realtime.off('call:offer');
    this.realtime.off('call:answer');
    this.realtime.off('call:ice');
    this.realtime.off('call:ended');
    this.realtime.off('message:new');
  }

  ngOnDestroy() {
    // Si on détruit le composant sans raccrocher → on réduit en modal
    const active = this.callState.activeCall();
    if (active && !active.minimized && this.status() !== 'ended') {
      this.callState.minimize();
      // Garder les streams actifs pour le modal
    } else {
      this.cleanup();
    }
  }
}
