import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ThemeService } from './core/services/theme.service';
import { AuthService } from './core/services/auth.service';
import { RealtimeService } from './core/services/realtime.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'flx-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet></router-outlet>`,
})
export class AppComponent implements OnInit {
  constructor(
    private themeService: ThemeService,
    private auth: AuthService,
    private realtime: RealtimeService,
    private http: HttpClient,
  ) {}

  ngOnInit() {
    if (this.auth.isAuthenticated()) {
      this.realtime.connect();
      // Rafraîchir silencieusement le profil au démarrage via /users/me
      // (utilise l'accessToken courant, pas de besoin de refresh si pas expiré)
      this.http.get<any>(`${environment.apiUrl}/users/me`).subscribe({
        next: (user) => {
          if (user) {
            const current = this.auth.currentUser();
            if (current) {
              this.auth.currentUser.set({
                ...current,
                avatarUrl:     user.avatarUrl     ?? current.avatarUrl,
                fullName:      user.fullName      ?? current.fullName,
                provider:      user.provider      ?? current.provider,
                githubLinked:  user.githubLinked  ?? current.githubLinked,
                githubUsername: user.githubUsername ?? current.githubUsername,
              });
              localStorage.setItem('fluxo-user', JSON.stringify(this.auth.currentUser()));
            }
          }
        },
        error: () => {}, // silencieux — l'interceptor gère le refresh si 401
      });
    }
  }
}
