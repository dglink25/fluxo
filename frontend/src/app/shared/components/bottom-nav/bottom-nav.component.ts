import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent, IconName } from '../icon/icon.component';

interface NavItem {
  label: string;
  icon: IconName;
  route: string;
}

/**
 * Barre de navigation basse, visible uniquement sur mobile (voir media
 * query dans le style), dans l'esprit des applications type WhatsApp :
 * icônes + libellé, onglet actif mis en avant.
 */
@Component({
  selector: 'flx-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <nav class="bottom-nav">
      @for (item of items; track item.route) {
        <a
          class="tab"
          [routerLink]="item.route"
          routerLinkActive="active"
        >
          <flx-icon [name]="item.icon" [size]="22"></flx-icon>
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
    }
    .tab {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      padding: 6px 10px;
      color: var(--flx-text-faint);
      text-decoration: none !important;
      font-size: 11px;
      font-weight: 600;
      border-radius: var(--flx-radius-sm);
      min-width: 64px;
    }
    .tab.active { color: var(--flx-accent); }

    @media (min-width: 769px) {
      .bottom-nav { display: none; }
    }
  `],
})
export class BottomNavComponent {
  items: NavItem[] = [
    { label: 'Projets', icon: 'folder', route: '/dashboard' },
    { label: 'Notifications', icon: 'bell', route: '/notifications' },
    { label: 'Profil', icon: 'user', route: '/profile' },
  ];
}
