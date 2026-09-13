import { Component, Input } from '@angular/core';
import { NgSwitch, NgSwitchCase } from '@angular/common';

export type IconName =
  | 'home'
  | 'folder'
  | 'tasks'
  | 'bell'
  | 'user'
  | 'plus'
  | 'sun'
  | 'moon'
  | 'system'
  | 'mail'
  | 'lock'
  | 'logout'
  | 'chevron-right'
  | 'check'
  | 'x'
  | 'phone'
  | 'whatsapp'
  | 'google'
  | 'github'
  | 'kanban'
  | 'list'
  | 'clipboard'
  | 'refresh'
  | 'comment'
  | 'activity'
  | 'search'
  | 'send';

/**
 * Bibliothèque d'icônes internes (SVG "line icons", trait 1.8px).
 * Aucune dépendance externe — chaque icône est un vrai tracé vectoriel.
 */
@Component({
  selector: 'flx-icon',
  standalone: true,
  imports: [NgSwitch, NgSwitchCase],
  template: `
    <svg
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 24 24"
      fill="none"
      [style.color]="color"
      aria-hidden="true"
    >
      <ng-container [ngSwitch]="name">
        <g *ngSwitchCase="'home'">
          <path d="M4 11.5 12 4l8 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <g *ngSwitchCase="'folder'">
          <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.2a1.5 1.5 0 0 1 1.2.6l1 1.4H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-11Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </g>
        <g *ngSwitchCase="'tasks'">
          <rect x="4" y="4.5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.8"/>
          <path d="M8 10.5h8M8 14.5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M7.5 7.5h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
        </g>
        <g *ngSwitchCase="'bell'">
          <path d="M6 10a6 6 0 1 1 12 0c0 3.2 1 4.6 1.5 5.2a.7.7 0 0 1-.5 1.2H5a.7.7 0 0 1-.5-1.2C5 14.6 6 13.2 6 10Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M9.5 19a2.5 2.5 0 0 0 5 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </g>
        <g *ngSwitchCase="'user'">
          <circle cx="12" cy="8" r="3.3" stroke="currentColor" stroke-width="1.8"/>
          <path d="M5 19c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </g>
        <g *ngSwitchCase="'plus'">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </g>
        <g *ngSwitchCase="'sun'">
          <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8"/>
          <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </g>
        <g *ngSwitchCase="'moon'">
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </g>
        <g *ngSwitchCase="'system'">
          <rect x="3.5" y="5" width="17" height="11" rx="1.5" stroke="currentColor" stroke-width="1.8"/>
          <path d="M9 19.5h6M12 16v3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </g>
        <g *ngSwitchCase="'mail'">
          <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/>
          <path d="M4.5 7 12 12.5 19.5 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <g *ngSwitchCase="'lock'">
          <rect x="5" y="10.5" width="14" height="9" rx="2" stroke="currentColor" stroke-width="1.8"/>
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </g>
        <g *ngSwitchCase="'logout'">
          <path d="M9 5H6a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 6 19h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M14 8.5 18 12l-4 3.5M18 12H9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <g *ngSwitchCase="'chevron-right'">
          <path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <g *ngSwitchCase="'check'">
          <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <g *ngSwitchCase="'x'">
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </g>
        <g *ngSwitchCase="'phone'">
          <path d="M7 3.5h2.2l1.3 4-2 1.4a11 11 0 0 0 5.6 5.6l1.4-2 4 1.3V16a2 2 0 0 1-2 2c-6.6 0-12-5.4-12-12a2 2 0 0 1 2-2.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </g>
        <g *ngSwitchCase="'whatsapp'">
          <path d="M4 20l1.2-3.6A7.9 7.9 0 1 1 8.5 19L4 20Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M9 9.3c0 3 2.6 5.6 5.6 5.6.5 0 .9-.5.7-1l-.4-1a.8.8 0 0 0-.9-.4l-.9.3a5 5 0 0 1-2.4-2.4l.3-.9a.8.8 0 0 0-.4-.9l-1-.4c-.5-.2-1 .2-1 .7Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </g>
        <g *ngSwitchCase="'google'">
          <path d="M20.6 12.2c0-.7-.06-1.35-.18-2H12v3.8h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.55 2.7-3.85 2.7-6.7Z" fill="currentColor"/>
          <path d="M12 21c2.4 0 4.4-.8 5.9-2.15l-2.9-2.2c-.8.55-1.85.85-3 .85-2.3 0-4.25-1.55-4.95-3.65H4.05v2.3A9 9 0 0 0 12 21Z" fill="currentColor" opacity=".75"/>
          <path d="M7.05 13.85a5.4 5.4 0 0 1 0-3.7v-2.3H4.05a9 9 0 0 0 0 8.3l3-2.3Z" fill="currentColor" opacity=".5"/>
          <path d="M12 6.8c1.3 0 2.5.45 3.4 1.35l2.55-2.55A9 9 0 0 0 4.05 7.85l3 2.3C7.75 8.05 9.7 6.8 12 6.8Z" fill="currentColor" opacity=".9"/>
        </g>
        <g *ngSwitchCase="'github'">
          <path d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.65-.2.65-.5v-1.8c-2.65.6-3.2-1.15-3.2-1.15-.45-1.1-1.05-1.4-1.05-1.4-.85-.6.05-.6.05-.6.95.05 1.45 1 1.45 1 .85 1.4 2.2 1 2.75.75.1-.6.35-1 .6-1.25-2.1-.25-4.35-1.05-4.35-4.65 0-1.05.35-1.9 1-2.55-.1-.25-.45-1.25.1-2.6 0 0 .8-.25 2.65.95a9.1 9.1 0 0 1 4.8 0c1.85-1.2 2.65-.95 2.65-.95.55 1.35.2 2.35.1 2.6.65.65 1 1.5 1 2.55 0 3.6-2.25 4.4-4.4 4.65.35.3.65.9.65 1.85v2.75c0 .3.15.6.65.5A9.5 9.5 0 0 0 12 2.5Z" fill="currentColor"/>
        </g>
        <g *ngSwitchCase="'kanban'">
          <rect x="4" y="4.5" width="4.6" height="15" rx="1.2" stroke="currentColor" stroke-width="1.8"/>
          <rect x="9.7" y="4.5" width="4.6" height="9.5" rx="1.2" stroke="currentColor" stroke-width="1.8"/>
          <rect x="15.4" y="4.5" width="4.6" height="12.5" rx="1.2" stroke="currentColor" stroke-width="1.8"/>
        </g>
        <g *ngSwitchCase="'list'">
          <path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
        </g>
        <g *ngSwitchCase="'clipboard'">
          <rect x="6" y="5.5" width="12" height="15" rx="1.8" stroke="currentColor" stroke-width="1.8"/>
          <path d="M9.5 5.5V4.8A1.8 1.8 0 0 1 11.3 3h1.4a1.8 1.8 0 0 1 1.8 1.8v.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M9 12h6M9 15.5h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </g>
        <g *ngSwitchCase="'refresh'">
          <path d="M4.5 12a7.5 7.5 0 0 1 12.6-5.5M19.5 12a7.5 7.5 0 0 1-12.6 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M16.5 4.5v3.5H13M7.5 19.5V16H11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <g *ngSwitchCase="'comment'">
          <path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-3.8 3v-3H6.5a2 2 0 0 1-2-2v-8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </g>
        <g *ngSwitchCase="'activity'">
          <path d="M3.5 12h3.5l2-6 4 12 2-6h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <g *ngSwitchCase="'search'">
          <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" stroke-width="1.8"/>
          <path d="m19 19-4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </g>
        <g *ngSwitchCase="'send'">
          <path d="M4.5 11.5 19.5 4l-6 15.5-2.8-6.7L4.5 11.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M10.7 12.8 19.5 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </g>
      </ng-container>
    </svg>
  `,
})
export class IconComponent {
  @Input({ required: true }) name!: IconName;
  @Input() size = 20;
  @Input() color = 'currentColor';
}
