import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'flx-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet></router-outlet>`,
})
export class AppComponent {
  // L'injection suffit à initialiser le thème (clair/sombre/système) au démarrage.
  constructor(private themeService: ThemeService) {}
}
