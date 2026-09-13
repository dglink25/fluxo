import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { NotificationsService } from '../../../core/services/notifications.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'flx-navbar',
  standalone: true,
  imports: [RouterLink, ThemeToggleComponent, IconComponent],
  template: `
    <header class="bar">
      <a routerLink="/dashboard" class="brand" aria-label="Fluxo — accueil">
        <span class="brand-logo" aria-hidden="true">
          <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="navGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0B6B2E"/>
                <stop offset="35%" stop-color="#1FA34A"/>
                <stop offset="70%" stop-color="#3FCB5C"/>
                <stop offset="100%" stop-color="#0A5C28"/>
              </linearGradient>
              <linearGradient id="navGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#4FD66E"/>
                <stop offset="50%" stop-color="#A8F0A8"/>
                <stop offset="100%" stop-color="#1FA34A"/>
              </linearGradient>
              <radialGradient id="navShadow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="rgba(0,0,0,0.3)"/>
                <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
              </radialGradient>
            </defs>
            <ellipse cx="60" cy="74" rx="32" ry="3" fill="url(#navShadow)"/>
            <path d="M60 40 C 60 20, 40 8, 24 8 C 8 8, 4 22, 4 34 C 4 48, 12 58, 26 58 C 40 58, 50 48, 60 40 Z" fill="url(#navGrad1)"/>
            <path d="M60 40 C 60 20, 80 8, 96 8 C 112 8, 116 22, 116 34 C 116 48, 108 58, 94 58 C 80 58, 70 48, 60 40 Z" fill="url(#navGrad1)"/>
            <path d="M60 40 C 52 30, 42 22, 28 22 C 18 22, 12 28, 12 36 C 12 44, 20 50, 30 50 C 42 50, 52 46, 60 40 Z" fill="url(#navGrad2)" opacity="0.9"/>
            <path d="M60 40 C 68 30, 78 22, 92 22 C 102 22, 108 28, 108 36 C 108 44, 100 50, 90 50 C 78 50, 68 46, 60 40 Z" fill="url(#navGrad2)" opacity="0.9"/>
            <path d="M42 34 C 52 30, 56 42, 62 44 C 68 46, 74 42, 78 34" stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round"/>
          </svg>
        </span>
        <span class="brand-name">Fluxo</span>
      </a>
      <div class="right">
        <flx-theme-toggle></flx-theme-toggle>
        <a routerLink="/notifications" class="notif-btn desktop-only" [attr.aria-label]="'Notifications'">
          <flx-icon name="bell" [size]="18"></flx-icon>
          @if (realtime.unreadNotifications() > 0) {
            <span class="notif-badge">{{ realtime.unreadNotifications() > 9 ? '9+' : realtime.unreadNotifications() }}</span>
          }
        </a>
        <a routerLink="/search" class="notif-btn desktop-only" aria-label="Recherche">
          <flx-icon name="search" [size]="18"></flx-icon>
        </a>
        <a routerLink="/messaging" class="notif-btn desktop-only" aria-label="Messagerie">
          <flx-icon name="comment" [size]="18"></flx-icon>
        </a>
        @if (auth.currentUser(); as user) {
          <span class="user flx-mono desktop-only">&#64;{{ user.username }}</span>
          <button class="flx-btn flx-btn--ghost desktop-only" (click)="auth.logout()">
            <flx-icon name="logout" [size]="15"></flx-icon>
            Déconnexion
          </button>
        }
      </div>
    </header>
  `,
  styles: [`
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 28px;
      border-bottom: 1px solid var(--flx-border);
      background: var(--flx-bg-raised);
      position: sticky;
      top: 0;
      z-index: 30;
    }

    .brand {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      text-decoration: none !important;
      color: var(--flx-text) !important;
      line-height: 1;
      transition: transform 0.2s ease;
    }
    .brand:hover { transform: translateY(-1px); }
    .brand-logo {
      display: block;
      width: 44px;
      height: 30px;
      filter: drop-shadow(0 3px 6px rgba(22, 101, 83, 0.25));
    }
    .brand-logo svg { width: 100%; height: 100%; display: block; }
    .brand-name {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
      color: var(--flx-text);
    }

    .right {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .user {
      color: var(--flx-text-muted);
      font-size: 13px;
    }

    /* Bouton notifications */
    .notif-btn {
      position: relative;
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: var(--flx-radius-md);
      color: var(--flx-text-muted);
      transition: background 0.12s, color 0.12s;
      text-decoration: none !important;
    }
    .notif-btn:hover {
      background: var(--flx-bg-sunken);
      color: var(--flx-text);
    }
    .notif-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      background: #dc2626;
      color: white;
      font-size: 10px;
      font-weight: 700;
      font-family: var(--flx-font-mono);
      padding: 2px 5px;
      border-radius: 999px;
      line-height: 1;
      min-width: 16px;
      text-align: center;
    }

    @media (max-width: 768px) {
      .desktop-only { display: none; }
      .bar { padding: 10px 16px; }
    }
  `],
})
export class NavbarComponent implements OnInit {
  constructor(
    public auth: AuthService,
    public realtime: RealtimeService,
    private notificationsService: NotificationsService,
  ) {}

  ngOnInit() {
    // Charger le compteur initial de notifications non lues
    if (this.auth.isAuthenticated()) {
      this.notificationsService.countUnread().subscribe({
        next: ({ count }) => this.realtime.unreadNotifications.set(count),
        error: () => {},
      });
    }
  }
}