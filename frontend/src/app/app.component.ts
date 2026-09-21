import { Component, OnInit, signal, AfterViewInit } from '@angular/core';
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
      <div class="pip-container">
        <div class="pip-content">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="var(--flx-accent,#166553)">
            <path d="M4 6.5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2l5 3V7.5l-5 3v-2a2 2 0 0 0-2-2H4z"/>
          </svg>
          <div class="pip-info">
            <span class="pip-title">{{ callState.activeCall()?.title }}</span>
            <span class="pip-live">● En cours</span>
          </div>
        </div>
        <div class="pip-actions">
          <button class="pip-btn pip-btn--expand" (click)="expandCall()" title="Revenir à l'appel">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </button>
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
    /* ── PiP Container — barre compacte ── */
    .pip-container {
      position: fixed;
      bottom: 80px;
      right: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      background: #161b22;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 14px;
      padding: 10px 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      z-index: 9999;
      animation: pipIn 0.25s cubic-bezier(0.34,1.56,0.64,1);
      cursor: default;
    }
    @keyframes pipIn {
      from { transform: scale(0.7) translateY(10px); opacity: 0; }
      to   { transform: scale(1) translateY(0);      opacity: 1; }
    }

    .pip-content {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .pip-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .pip-title {
      font-size: 13px;
      font-weight: 600;
      color: white;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
    }
    .pip-live {
      font-size: 11px;
      color: #4ade80;
      font-weight: 600;
    }

    .pip-actions {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }
    .pip-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px; height: 32px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      transition: transform 0.1s, background 0.15s;
    }
    .pip-btn:active { transform: scale(0.92); }
    .pip-btn--expand {
      background: rgba(255,255,255,0.15);
    }
    .pip-btn--expand:hover { background: rgba(255,255,255,0.25); }
    .pip-btn--hangup {
      background: #dc2626;
    }
    .pip-btn--hangup:hover { background: #b91c1c; }
  `],
})
export class AppComponent implements OnInit, AfterViewInit {
  isDragging = false;

  constructor(
    private themeService: ThemeService,
    private auth: AuthService,
    private realtime: RealtimeService,
    private http: HttpClient,
    public callState: CallStateService,
    private videoCallApi: VideoCallApiService,
    private router: Router,
  ) {}

  ngOnInit() {
    if (this.auth.isAuthenticated()) {
      // ── Refresh proactif au démarrage ─────────────────────────────────────
      // Couvre le cas "retour après plusieurs heures d'inactivité" :
      // si l'accessToken est expiré/sur le point d'expirer, on refresh d'abord,
      // puis on connecte le WebSocket et on sync le profil.
      if (this.auth.isAccessTokenExpiredOrExpiring()) {
        this.auth.refreshAccessToken().subscribe({
          next: () => {
            this.realtime.connect();
            this.syncUserProfile();
          },
          error: () => {
            // Refresh token aussi expiré → déconnexion propre
            this.auth.logout();
          },
        });
      } else {
        this.realtime.connect();
        this.syncUserProfile();
      }
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

  private syncUserProfile() {
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
