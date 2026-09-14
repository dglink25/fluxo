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
import { ActivatedRoute, Router } from '@angular/router';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { RealtimeService } from '../../core/services/realtime.service';
import { AuthService } from '../../core/services/auth.service';

/**
 * Visioconférence WebRTC peer-to-peer.
 *
 * Flux de signalisation :
 *  1. Les deux participants rejoignent la salle (call:join)
 *  2. Le backend notifie via call:peer-joined quand 2 personnes sont présentes
 *  3. Le 1er arrivé (initiateur) crée l'offre
 *  4. Le 2ème reçoit call:offer, répond avec call:answer
 *  5. Échange des ICE candidates → connexion établie
 */
@Component({
  selector: 'flx-call',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './call.component.html',
  styleUrl: './call.component.scss',
})
export class CallComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('localVideo')  localVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef<HTMLVideoElement>;

  roomId    = signal<string | null>(null);
  status    = signal<'idle' | 'connecting' | 'connected' | 'ended'>('idle');
  localStream:  MediaStream | null = null;
  remoteStream  = signal<MediaStream | null>(null);
  screenStream: MediaStream | null = null;

  isMuted        = signal(false);
  isCamOff       = signal(false);
  isSharingScreen = signal(false);

  // true = cet utilisateur a rejoint en premier (il créera l'offre)
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
  ) {}

  async ngOnInit() {
    const room = this.route.snapshot.queryParamMap.get('room') ??
                 this.route.snapshot.paramMap.get('room');
    if (!room) { this.router.navigate(['/messaging']); return; }
    this.roomId.set(room);
    await this.initMedia();
    this.setupSignaling(room);
    // Rejoindre la salle — le backend indique si on est initiateur
    this.realtime.emit('call:join', { room });
  }

  ngAfterViewInit() {
    // Dès que la vue est prête, attacher le flux local s'il est déjà dispo
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
      }
    }
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

    // Ajouter les pistes locales
    this.localStream?.getTracks().forEach((t) => pc.addTrack(t, this.localStream!));

    // Flux distant reçu
    pc.ontrack = (event) => {
      this.ngZone.run(() => {
        const [stream] = event.streams;
        this.remoteStream.set(stream);
        // Attacher après que Angular ait rendu l'élément <video>
        setTimeout(() => {
          if (this.remoteVideoRef?.nativeElement) {
            this.remoteVideoRef.nativeElement.srcObject = stream;
          }
        }, 50);
        this.status.set('connected');
      });
    };

    // ICE candidates → envoyer au pair
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.realtime.emit('call:ice', { room, candidate: event.candidate.toJSON() });
      }
    };

    // Changement d'état de connexion ICE
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
    // Le backend répond à call:join avec call:joined indiquant l'ordre d'arrivée
    this.realtime.on<{ room: string; isInitiator: boolean }>('call:joined', (data) => {
      if (data.room !== room) return;
      this.isInitiator = data.isInitiator;
    });

    // Un 2ème participant a rejoint → l'initiateur crée l'offre
    this.realtime.on<{ room: string }>('call:peer-joined', async (data) => {
      if (data.room !== room) return;
      if (this.isInitiator) {
        await this.ngZone.run(() => this.createOffer(room));
      }
    });

    // Réception d'une offre → créer la réponse
    this.realtime.on<{ room: string; offer: RTCSessionDescriptionInit }>('call:offer', async (data) => {
      if (data.room !== room) return;
      await this.ngZone.run(async () => {
        const pc = this.createPeerConnection(room);
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        // Appliquer les candidates en attente
        for (const c of this.pendingCandidates) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* noop */ }
        }
        this.pendingCandidates = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.realtime.emit('call:answer', { room, answer: pc.localDescription });
      });
    });

    // Réception de la réponse
    this.realtime.on<{ room: string; answer: RTCSessionDescriptionInit }>('call:answer', async (data) => {
      if (data.room !== room) return;
      await this.ngZone.run(async () => {
        if (!this.pc) return;
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        // Appliquer les candidates en attente
        for (const c of this.pendingCandidates) {
          try { await this.pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* noop */ }
        }
        this.pendingCandidates = [];
      });
    });

    // ICE candidates
    this.realtime.on<{ room: string; candidate: RTCIceCandidateInit }>('call:ice', async (data) => {
      if (data.room !== room) return;
      if (this.pc?.remoteDescription) {
        try { await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch { /* noop */ }
      } else {
        // Remote description pas encore définie → mettre en attente
        this.pendingCandidates.push(data.candidate);
      }
    });

    // Appel terminé par l'autre participant
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
    // Ré-attacher après changement d'état du template
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

  endCall() {
    this.realtime.emit('call:end', { room: this.roomId() });
    this.status.set('ended');
    this.cleanup();
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
  }

  ngOnDestroy() {
    this.cleanup();
  }
}
