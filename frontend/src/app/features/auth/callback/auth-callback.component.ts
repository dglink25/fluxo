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
      width: 28px; height: 28px; border-radius: 50%;
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
    const pending      = params.get('pending');
    const accessToken  = params.get('accessToken');
    const refreshToken = params.get('refreshToken');

    // ── Flux "téléphone en attente" ──────────────────────────────────────────
    if (pending) {
      this.auth.storePendingToken(pending);
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

    // ── Flux normal OAuth (tokens dans l'URL) ────────────────────────────────
    if (accessToken && refreshToken) {
      // Stocker les tokens d'abord
      localStorage.setItem('fluxo-access-token',  accessToken);
      localStorage.setItem('fluxo-refresh-token', refreshToken);

      // Récupérer le profil complet via /users/me (utilise l'accessToken qu'on vient de stocker)
      this.http.get<any>(`${environment.apiUrl}/users/me`).subscribe({
        next: (user) => {
          // Stocker la session complète avec le profil à jour
          this.auth.storeFullSession({
            accessToken,
            refreshToken,
            user: {
              ...user,
              // S'assurer que les champs OAuth sont présents
              provider:      user.provider      ?? 'GOOGLE',
              githubLinked:  user.githubLinked  ?? false,
              githubUsername: user.githubUsername ?? null,
            },
          });

          const pendingInvite = sessionStorage.getItem('fluxo-pending-invite');
          if (pendingInvite) {
            sessionStorage.removeItem('fluxo-pending-invite');
            this.router.navigate(['/invitations', pendingInvite]);
          } else {
            this.router.navigate(['/dashboard']);
          }
        },
        error: () => {
          // /users/me a échoué (token peut-être invalide) → login
          localStorage.removeItem('fluxo-access-token');
          localStorage.removeItem('fluxo-refresh-token');
          this.router.navigate(['/login']);
        },
      });
      return;
    }

    this.router.navigate(['/login']);
  }
}
