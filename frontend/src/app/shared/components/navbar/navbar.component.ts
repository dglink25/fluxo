import { Component, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { NotificationsService } from '../../../core/services/notifications.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';

@Component({
  selector: 'flx-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, ThemeToggleComponent],
  template: `
    <header class="bar">

      <!-- Logo -->
      <a routerLink="/dashboard" class="brand" aria-label="Fluxo">
        <img src="assets/logo_fluxo.png" alt="Fluxo" class="brand-logo" />
        <span class="brand-name">Fluxo</span>
      </a>

      <!-- Nav desktop -->
      <nav class="nav-links">
        <a routerLink="/dashboard"   routerLinkActive="active" class="nav-link">Projets</a>
        <a routerLink="/messaging"   routerLinkActive="active" class="nav-link">Messages</a>
        <a routerLink="/search"      routerLinkActive="active" class="nav-link">Recherche</a>
        <a routerLink="/notifications" routerLinkActive="active" class="nav-link notif-link">
          Notifications
          @if (realtime.unreadNotifications() > 0) {
            <span class="notif-badge">{{ realtime.unreadNotifications() > 9 ? '9+' : realtime.unreadNotifications() }}</span>
          }
        </a>
      </nav>

      <!-- Droite -->
      <div class="right">
        <flx-theme-toggle></flx-theme-toggle>

        @if (auth.currentUser(); as user) {
          <!-- Avatar cliquable vers profil -->
          <a routerLink="/profile" class="avatar-btn" [title]="'@' + user.username">
            @if (user.avatarUrl) {
              <img [src]="user.avatarUrl" [alt]="user.username" class="avatar-img" />
            } @else {
              <span class="avatar-initials">{{ user.username.slice(0,1).toUpperCase() }}</span>
            }
          </a>
          <!-- Déconnexion desktop -->
          <button class="logout-btn desktop-only" (click)="auth.logout()" title="Déconnexion">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Déconnexion
          </button>
        }
      </div>

    </header>
  `,
  styles: [`
    .bar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 24px; height: 57px;
      border-bottom: 1px solid var(--flx-border);
      background: var(--flx-bg-raised);
      position: sticky; top: 0; z-index: 30; gap: 12px;
    }

    /* Logo */
    .brand {
      display: inline-flex; flex-direction: column; align-items: center;
      gap: 1px; text-decoration: none !important; color: var(--flx-text) !important;
      flex-shrink: 0;
    }
    .brand-logo {
      display: block; width: 40px; height: 40px;
      object-fit: contain;
      filter: drop-shadow(0 2px 6px rgba(22,101,83,0.3));
    }
    .brand-name { font-size: 10px; font-weight: 800; letter-spacing: 0.05em; }

    /* Nav desktop */
    .nav-links {
      display: flex; align-items: center; gap: 2px; flex: 1; padding-left: 8px;
    }
    .nav-link {
      position: relative; padding: 6px 12px; border-radius: var(--flx-radius-md);
      font-size: 14px; font-weight: 600; color: var(--flx-text-muted);
      text-decoration: none !important; transition: background 0.12s, color 0.12s;
      display: flex; align-items: center; gap: 6px;
    }
    .nav-link:hover { background: var(--flx-bg-sunken); color: var(--flx-text); }
    .nav-link.active { color: var(--flx-accent); background: var(--flx-accent-soft); }

    .notif-badge {
      background: #dc2626; color: white; font-size: 10px; font-weight: 700;
      padding: 1px 5px; border-radius: 999px; line-height: 1.4; min-width: 16px;
      text-align: center; font-family: var(--flx-font-mono);
    }

    /* Droite */
    .right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

    /* Avatar */
    .avatar-btn {
      width: 34px; height: 34px; border-radius: 50%; overflow: hidden;
      display: grid; place-items: center; text-decoration: none !important;
      border: 2px solid var(--flx-border); transition: border-color 0.12s; flex-shrink: 0;
    }
    .avatar-btn:hover { border-color: var(--flx-accent); }
    .avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .avatar-initials {
      width: 100%; height: 100%; background: var(--flx-accent-soft); color: var(--flx-accent);
      display: grid; place-items: center; font-size: 14px; font-weight: 700;
    }

    /* Déconnexion */
    .logout-btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
      font-size: 13px; font-weight: 600; border-radius: var(--flx-radius-md);
      border: 1px solid var(--flx-border); background: none;
      color: var(--flx-text-muted); cursor: pointer;
      transition: background 0.12s, color 0.12s;
    }
    .logout-btn:hover { background: var(--flx-bg-sunken); color: var(--flx-text); }

    @media (max-width: 768px) {
      .nav-links { display: none; }
      .desktop-only { display: none !important; }
      .bar { padding: 0 14px; }
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
    if (this.auth.isAuthenticated()) {
      this.realtime.connect();
      this.notificationsService.countUnread().subscribe({
        next: ({ count }) => this.realtime.unreadNotifications.set(count),
        error: () => {},
      });
    }
  }
}
