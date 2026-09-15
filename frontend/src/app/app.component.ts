import { Component, OnInit, signal, ViewChild, ElementRef, AfterViewInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ThemeService } from './core/services/theme.service';
import { AuthService } from './core/services/auth.service';
import { RealtimeService } from './core/services/realtime.service';
import { CallStateService } from './core/services/call-state.service';
import { VideoCallApiService } from './core/services/video-call.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'flx-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: `
    <router-outlet></router-outlet>

    <!-- ── Modal flottant PiP (actif quand l'appel est minimisé) ── -->
    @if (callState.activeCall()?.minimized) {
      <div class="pip-container" [class.dragging]="isDragging">
        <!-- Vidéo distante (ou locale si pas encore de pair) -->
        <div class="pip-video-wrap">
          @if (callState.remoteStream()) {
            <video #pipVideo class="pip-video" autoplay playsinline></video>
          } @else if (callState.localStream()) {
            <video #pipVideoLocal class="pip-video pip-video--mirror" autoplay playsinline muted></video>
          } @else {
            <div class="pip-placeholder">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="rgba(255,255,255,0.3)">
                <path d="M4 6.5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2l5 3V7.5l-5 3v-2a2 2 0 0 0-2-2H4z"/>
              </svg>
            </div>
          }

          <!-- Overlay titre -->
          <div class="pip-title-bar">
            <span class="pip-title">{{ callState.activeCall()?.title }}</span>
            <span class="pip-live-dot"></span>
          </div>
        </div>

        <!-- Contrôles PiP -->
        <div class="pip-controls">
          <!-- Agrandir -->
          <button class="pip-btn pip-btn--expand" (click)="expandCall()" title="Agrandir">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </button>
          <!-- Raccrocher -->
          <button class="pip-btn pip-btn--hangup" (click)="hangupFromPip()" title="Raccrocher">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="white">
              <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    /* ── PiP Container ── */
    .pip-container {
      position: fixed;
      bottom: 80px;
      right: 20px;
      width: 220px;
      border-radius: 16px;
      overflow: hidden;
      background: #0d1117;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1);
      z-index: 9999;
      cursor: grab;
      user-select: none;
      animation: pipIn 0.25s cubic-bezier(0.34,1.56,0.64,1);
    }
    .pip-container.dragging { cursor: grabbing; }

    @keyframes pipIn {
      from { transform: scale(0.6) translateY(20px); opacity: 0; }
      to   { transform: scale(1)   translateY(0);    opacity: 1; }
    }

    .pip-video-wrap {
      position: relative;
      width: 100%;
      aspect-ratio: 4/3;
      background: #1c2128;
      overflow: hidden;
    }
    .pip-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .pip-video--mirror { transform: scaleX(-1); }

    .pip-placeholder {
      width: 100%; height: 100%;
      display: grid;
      place-items: center;
    }

    .pip-title-bar {
      position: absolute;
      top: 0; left: 0; right: 0;
      background: linear-gradient(to bottom, rgba(0,0,0,0.6), transparent);
      padding: 8px 10px 16px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pip-title {
      font-size: 11px;
      font-weight: 600;
      color: white;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }
    .pip-live-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: #4ade80;
      flex-shrink: 0;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.5; transform: scale(0.7); }
    }

    .pip-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(6px);
    }
    .pip-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px; height: 32px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      transition: transform 0.1s, background 0.15s;

      &:active { transform: scale(0.92); }
    }
    .pip-btn--expand {
      background: rgba(255,255,255,0.15);
      &:hover { background: rgba(255,255,255,0.25); }
    }
    .pip-btn--hangup {
      background: #dc2626;
      &:hover { background: #b91c1c; }
    }
  `],
})
export class AppComponent implements OnInit, AfterViewInit {
  @ViewChild('pipVideo')      pipVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('pipVideoLocal') pipVideoLocalRef?: ElementRef<HTMLVideoElement>;

  isDragging = false;
  private dragOffset = { x: 0, y: 0 };

  constructor(
    private themeService: ThemeService,
    private auth: AuthService,
    private realtime: RealtimeService,
    private http: HttpClient,
    public callState: CallStateService,
    private videoCallApi: VideoCallApiService,
    private router: Router,
  ) {
    // Synchroniser les streams vidéo avec les éléments <video> du PiP
    effect(() => {
      const remote = this.callState.remoteStream();
      setTimeout(() => {
        if (remote && this.pipVideoRef?.nativeElement) {
          this.pipVideoRef.nativeElement.srcObject = remote;
        }
      }, 50);
    });

    effect(() => {
      const local = this.callState.localStream();
      setTimeout(() => {
        if (local && this.pipVideoLocalRef?.nativeElement) {
          this.pipVideoLocalRef.nativeElement.srcObject = local;
        }
      }, 50);
    });
  }

  ngOnInit() {
    if (this.auth.isAuthenticated()) {
      this.realtime.connect();
      this.http.get<any>(`${environment.apiUrl}/users/me`).subscribe({
        next: (user) => {
          if (user) {
            const current = this.auth.currentUser();
            if (current) {
              this.auth.currentUser.set({
                ...current,
                avatarUrl:      user.avatarUrl      ?? current.avatarUrl,
                fullName:       user.fullName        ?? current.fullName,
                provider:       user.provider        ?? current.provider,
                githubLinked:   user.githubLinked    ?? current.githubLinked,
                githubUsername: user.githubUsername  ?? current.githubUsername,
              });
              localStorage.setItem('fluxo-user', JSON.stringify(this.auth.currentUser()));
            }
          }
        },
        error: () => {},
      });
    }

    // Écouter les invitations d'appel entrant via WebSocket
    this.realtime.on<{ callId: string; roomId: string; hostName: string; title: string; callUrl: string }>(
      'call:invite',
      (data) => {
        // Toast/notification d'appel entrant — on navigue si l'utilisateur confirme
        if (confirm(`📹 ${data.hostName} vous invite à rejoindre "${data.title}". Rejoindre ?`)) {
          this.router.navigate(['/call'], { queryParams: { room: data.roomId, callId: data.callId } });
        }
      },
    );
  }

  ngAfterViewInit() {}

  expandCall() {
    const call = this.callState.activeCall();
    if (!call) return;
    this.callState.maximize();
    this.router.navigate(['/call'], {
      queryParams: { room: call.roomId, callId: call.callId || undefined },
    });
  }

  hangupFromPip() {
    const call = this.callState.activeCall();
    if (call?.callId) {
      this.videoCallApi.endCall(call.callId).subscribe({ error: () => {} });
    }
    this.realtime.emit('call:end', { room: call?.roomId });
    this.callState.clear();
  }
}
