import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService, ThemeMode } from '../../../core/services/theme.service';
import { IconComponent, IconName } from '../icon/icon.component';

@Component({
  selector: 'flx-theme-toggle',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="toggle" role="radiogroup" aria-label="Thème de l'interface">
      <button
        *ngFor="let opt of options"
        class="opt"
        type="button"
        role="radio"
        [attr.aria-checked]="theme.mode() === opt.value"
        [class.active]="theme.mode() === opt.value"
        (click)="theme.setMode(opt.value)"
        [title]="opt.label"
      >
        <flx-icon [name]="opt.icon" [size]="15"></flx-icon>
      </button>
    </div>
  `,
  styles: [`
    .toggle {
      display: inline-flex;
      background: var(--flx-bg-sunken);
      border: 1px solid var(--flx-border);
      border-radius: 999px;
      padding: 3px;
      gap: 2px;
    }
    .opt {
      border: none;
      background: transparent;
      width: 30px;
      height: 30px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      color: var(--flx-text-muted);
    }
    .opt.active {
      background: var(--flx-bg-raised);
      color: var(--flx-accent);
      box-shadow: var(--flx-shadow-1);
    }
  `],
})
export class ThemeToggleComponent {
  options: { value: ThemeMode; label: string; icon: IconName }[] = [
    { value: 'light', label: 'Clair', icon: 'sun' },
    { value: 'system', label: 'Système', icon: 'system' },
    { value: 'dark', label: 'Sombre', icon: 'moon' },
  ];

  constructor(public theme: ThemeService) {}
}
