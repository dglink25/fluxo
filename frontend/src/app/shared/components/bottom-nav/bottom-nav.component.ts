import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { RealtimeService } from '../../../core/services/realtime.service';
import { IconComponent, IconName } from '../icon/icon.component';

interface NavItem {
  label: string;
  icon: IconName;
  route: string;
}

/**
 * Barre de navigation basse — visible uniquement sur mobile (≤ 768px).
 * 5 onglets : Projets · Messagerie · Recherche · Notifications · Profil.
 * Style adaptatif, badge de notifications temps réel.
 */
@Component({
  selector: 'flx-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <nav class="bottom-nav" aria-label="Navigation principale">
      @for (item of items; track item.route) {
        <a
          class="tab"
          [routerLink]="item.route"
          routerLinkActive="active"
          [attr.aria-label]="item.label"
        >
          <div class="icon-wrap">
            <flx-icon [name]="item.icon" [size]="22"></flx-icon>
            @if (item.route === '/notifications' && realtime.unreadNotifications() > 0) {
              <span class="badge">
                {{ realtime.unreadNotifications() > 9 ? '9+' : realtime.unreadNotifications() }}
              </span>
            }
          </div>
          <span>{{ item.label }}</span>
        </a>
      }
    </nav>
  `,
  styles: [`
    .bottom-nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      justify-content: space-around;
      background: var(--flx-bg-raised);
      border-top: 1px solid var(--flx-border);
      padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
      z-index: 40;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.06);
    }

    .tab {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      padding: 5px 8px;
      color: var(--flx-text-faint);
      text-decoration: none !important;
      font-size: 10px;
      font-weight: 600;
      border-radius: var(--flx-radius-sm);
      flex: 1;
      max-width: 72px;
      transition: color 0.12s;
    }
    .tab.active { color: var(--flx-accent); }
    .tab:hover { color: var(--flx-text); }

    .icon-wrap {
      position: relative;
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
    }

    .badge {
      position: absolute;
      top: -4px;
      right: -8px;
      background: #dc2626;
      color: white;
      font-size: 9px;
      font-weight: 700;
      font-family: var(--flx-font-mono);
      padding: 1px 4px;
      border-radius: 999px;
      line-height: 1.2;
      min-width: 14px;
      text-align: center;
    }

    @media (min-width: 769px) {
      .bottom-nav { display: none; }
    }
  `],
})
export class BottomNavComponent {
  items: NavItem[] = [
    { label: 'Projets',  icon: 'folder',   route: '/dashboard'      },
    { label: 'Messages', icon: 'comment',   route: '/messaging'      },
    { label: 'Chercher', icon: 'search',    route: '/search'         },
    { label: 'Notifs',   icon: 'bell',      route: '/notifications'  },
    { label: 'Profil',   icon: 'user',      route: '/profile'        },
  ];

  constructor(public realtime: RealtimeService) {}
}
