import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { RealtimeService } from '../../core/services/realtime.service';
import { AuthService } from '../../core/services/auth.service';

/**
 * Visioconférence WebRTC peer-to-peer.
 * - Signalisation via WebSocket (NestJS Gateway)
 * - STUN Google pour la traversée NAT
 * - Partage d'écran via getDisplayMedia
 * - Microphone et caméra activables/désactivables
 */
@Component({
  selector: 'flx-call',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './call.component.html',
  styleUrl: './call.component.scss',
})
export class CallComponent implements OnInit, OnDestroy {
  @ViewChild('localVideo') localVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef<HTMLVideoElement>;

  roomId = signal<string | null>(null);
  status = signal<'idle' | 'connecting' | 'connected' | 'ended'>('idle');
  localStream: MediaStream | null = null;
  remoteStream = signal<MediaStream | null>(null);
  screenStream: MediaStream | null = null;

  isMuted = signal(false);
  isCamOff = signal(false);
  isSharingScreen = signal(false);

  private pc: RTCPeerConnection | null = null;
  private readonly ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private realtime: RealtimeService,
    public auth: AuthService,
  ) {}

  async ngOnInit() {
    const room = this.route.snapshot.queryParamMap.get('room') ??
                 this.route.snapshot.paramMap.get('room');
    if (!room) { this.router.navigate(['/messaging']); return; }
    this.roomId.set(room);
    await this.startCall(room);
  }

  async startCall(room: string) {
    this.status.set('connecting');

    // Obtenir le flux local (caméra + micro)
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch {
      // Fallback : micro seulement
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      } catch {
        alert('Impossible d\'accéder à la caméra ou au microphone.');
        this.router.navigate(['/messaging']);
        return;
      }
    }

    // Afficher le flux local
    setTimeout(() => {
      if (this.localVideoRef?.nativeElement && this.localStream) {
        this.localVideoRef.nativeElement.srcObject = this.localStream;
      }
    }, 100);

    // Créer la connexion WebRTC
    this.pc = new RTCPeerConnection({ iceServers: this.ICE_SERVERS });

    // Ajouter les pistes locales
    this.localStream.getTracks().forEach((track) => {
      this.pc!.addTrack(track, this.localStream!);
    });

    // Recevoir le flux distant
    this.pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      this.remoteStream.set(remoteStream);
      setTimeout(() => {
        if (this.remoteVideoRef?.nativeElement) {
          this.remoteVideoRef.nativeElement.srcObject = remoteStream;
        }
      }, 100);
      this.status.set('connected');
    };

    // ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.realtime.emit('call:ice', { room, candidate: event.candidate });
      }
    };

    // Écouter les événements de signalisation
    this.realtime.on<any>('call:offer', async ({ offer, room: r }) => {
      if (r !== room) return;
      await this.pc!.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(answer);
      this.realtime.emit('call:answer', { room, answer });
    });

    this.realtime.on<any>('call:answer', async ({ answer, room: r }) => {
      if (r !== room) return;
      await this.pc!.setRemoteDescription(new RTCSessionDescription(answer));
      this.status.set('connected');
    });

    this.realtime.on<any>('call:ice', async ({ candidate, room: r }) => {
      if (r !== room) return;
      try { await this.pc!.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* noop */ }
    });

    this.realtime.on<any>('call:ended', ({ room: r }) => {
      if (r !== room) return;
      this.status.set('ended');
      this.cleanup();
    });

    // Rejoindre la salle et créer l'offre (initiateur)
    this.realtime.emit('call:join', { room });

    // Créer l'offre WebRTC
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.realtime.emit('call:offer', { room, offer });
  }

  toggleMute() {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach((t) => (t.enabled = this.isMuted()));
    this.isMuted.update((m) => !m);
  }

  toggleCamera() {
    if (!this.localStream) return;
    this.localStream.getVideoTracks().forEach((t) => (t.enabled = this.isCamOff()));
    this.isCamOff.update((c) => !c);
  }

  async toggleScreenShare() {
    if (this.isSharingScreen()) {
      // Arrêter le partage d'écran, revenir à la caméra
      this.screenStream?.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
      const camTrack = this.localStream?.getVideoTracks()[0];
      if (camTrack && this.pc) {
        const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(camTrack);
      }
      this.isSharingScreen.set(false);
    } else {
      try {
        this.screenStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
        const screenTrack = this.screenStream!.getVideoTracks()[0];
        if (this.pc) {
          const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
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

  private cleanup() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.pc?.close();
    this.pc = null;
    this.realtime.off('call:offer');
    this.realtime.off('call:answer');
    this.realtime.off('call:ice');
    this.realtime.off('call:ended');
  }

  ngOnDestroy() {
    this.cleanup();
  }
}
