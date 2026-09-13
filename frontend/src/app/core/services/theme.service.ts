import { Injectable, signal, effect } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'fluxo-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>((localStorage.getItem(STORAGE_KEY) as ThemeMode) ?? 'system');

  private mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.mediaQuery.addEventListener('change', () => this.apply());

    effect(() => {
      const mode = this.mode();
      localStorage.setItem(STORAGE_KEY, mode);
      this.apply();
    });
  }

  setMode(mode: ThemeMode) {
    this.mode.set(mode);
  }

  private apply() {
    const resolved = this.mode() === 'system'
      ? (this.mediaQuery.matches ? 'dark' : 'light')
      : this.mode();
    document.documentElement.setAttribute('data-theme', resolved);
  }
}
