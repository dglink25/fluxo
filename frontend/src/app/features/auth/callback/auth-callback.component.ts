import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

/**
 * Page transitoire : reçoit les jetons dans l'URL après la redirection
 * OAuth depuis le backend (Google/GitHub), puis route vers la suite du
 * parcours (vérification du téléphone, ou tableau de bord).
 */
@Component({
  selector: 'flx-auth-callback',
  standalone: true,
  template: `
    <div class="loading-screen">
      <div class="spinner"></div>
      <p>Connexion en cours…</p>
    </div>
  `,
  styles: [`
    .loading-screen {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      gap: 16px;
      color: var(--flx-text-muted);
      background: var(--flx-bg);
    }
    .spinner {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 3px solid var(--flx-border);
      border-top-color: var(--flx-accent);
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class AuthCallbackComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
    private http: HttpClient,
  ) {}

  ngOnInit() {
    const params = this.route.snapshot.queryParamMap;
    const pending = params.get('pending');
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');

    if (pending) {
      this.auth.storePendingToken(pending);
      // Vérifier si une invitation était en attente avant le login
      const pendingInvite = sessionStorage.getItem('fluxo-pending-invite');
      if (pendingInvite) {
        this.router.navigate(['/verify-phone'], {
          queryParams: { redirectTo: `/invitations/${pendingInvite}` },
        });
      } else {
        this.router.navigate(['/verify-phone']);
      }
      return;
    }

    if (accessToken && refreshToken) {
      // On récupère le profil complet via /auth/refresh pour peupler currentUser.
      localStorage.setItem('fluxo-access-token', accessToken);
      this.http.post<any>(`${environment.apiUrl}/auth/refresh`, {}).subscribe({
        next: (session) => {
          if (session.pending) {
            // Le téléphone n'est pas encore vérifié
            this.auth.storePendingToken(session.accessToken);
            this.router.navigate(['/verify-phone']);
            return;
          }
          this.auth.storeFullSession({
            accessToken: session.accessToken ?? accessToken,
            refreshToken: session.refreshToken ?? refreshToken,
            user: session.user,
          });
          // Reprendre une invitation en attente s'il y en a une
          const pendingInvite = sessionStorage.getItem('fluxo-pending-invite');
          if (pendingInvite) {
            sessionStorage.removeItem('fluxo-pending-invite');
            this.router.navigate(['/invitations', pendingInvite]);
          } else {
            this.router.navigate(['/dashboard']);
          }
        },
        error: () => this.router.navigate(['/login']),
      });
      return;
    }

    this.router.navigate(['/login']);
  }
}
