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
    // Si l'utilisateur est déjà connecté, rafraîchir silencieusement
    // pour mettre à jour avatarUrl, provider, githubLinked, etc.
    if (this.auth.isAuthenticated()) {
      this.realtime.connect();
      const token = this.auth.getAccessToken();
      if (token) {
        this.http.post<any>(`${environment.apiUrl}/auth/refresh`, {}).subscribe({
          next: (session) => {
            if (!session.pending && session.user) {
              this.auth.storeFullSession({
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
                user: session.user,
              });
            }
          },
          error: () => {}, // silencieux — session peut-être expirée
        });
      }
    }
  }
}
