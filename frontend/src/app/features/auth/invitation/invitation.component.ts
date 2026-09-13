import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';
import { InvitationsService } from '../../../core/services/invitations.service';
import { environment } from '../../../../environments/environment';
import { IconComponent } from '../../../shared/components/icon/icon.component';

type PageState = 'loading' | 'preview' | 'accepting' | 'accepted' | 'error';

@Component({
  selector: 'flx-invitation',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  template: `
    <div class="invite-screen">
      <div class="flx-card invite-card">

        <!-- Logo -->
        <div class="brand-logo" aria-hidden="true">
          <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" width="72" height="48">
            <defs>
              <linearGradient id="invGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0B6B2E"/>
                <stop offset="50%" stop-color="#1FA34A"/>
                <stop offset="100%" stop-color="#0A5C28"/>
              </linearGradient>
            </defs>
            <path d="M60 40 C 60 20, 40 8, 24 8 C 8 8, 4 22, 4 34 C 4 48, 12 58, 26 58 C 40 58, 50 48, 60 40 Z" fill="url(#invGrad)"/>
            <path d="M60 40 C 60 20, 80 8, 96 8 C 112 8, 116 22, 116 34 C 116 48, 108 58, 94 58 C 80 58, 70 48, 60 40 Z" fill="url(#invGrad)"/>
            <path d="M42 34 C 52 30, 56 42, 62 44 C 68 46, 74 42, 78 34" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>
          </svg>
        </div>

        @switch (state()) {
          @case ('loading') {
            <div class="flx-spinner" style="margin: 32px auto"></div>
            <p class="sub">Vérification de l'invitation…</p>
          }

          @case ('preview') {
            @if (invitation()) {
              <h1>Vous êtes invité·e</h1>
              <p class="project-name">{{ invitation()!.project?.name }}</p>
              <p class="sub">Rôle proposé : <strong class="flx-mono">{{ invitation()!.role }}</strong></p>

              @if (auth.isAuthenticated()) {
                <button class="flx-btn flx-btn--primary full" (click)="accept()">
                  <flx-icon name="check" [size]="16" color="white"></flx-icon>
                  Accepter l'invitation
                </button>
                <button class="flx-btn flx-btn--ghost full" (click)="decline()">
                  Refuser
                </button>
              } @else {
                <p class="sub auth-hint">Connectez-vous pour accepter cette invitation.</p>
                <button class="flx-btn flx-btn--primary full" (click)="loginThenAccept('google')">
                  Continuer avec Google
                </button>
                <button class="flx-btn flx-btn--ghost full" (click)="loginThenAccept('github')">
                  Continuer avec GitHub
                </button>
              }
            }
          }

          @case ('accepting') {
            <div class="flx-spinner" style="margin: 32px auto"></div>
            <p class="sub">Rejoindre le projet…</p>
          }

          @case ('accepted') {
            <div class="success-icon"><flx-icon name="check" [size]="32" color="white"></flx-icon></div>
            <h1>Bienvenue dans l'équipe !</h1>
            <p class="sub">Vous avez rejoint le projet avec succès.</p>
            @if (projectId()) {
              <a class="flx-btn flx-btn--primary full" [routerLink]="['/projects', projectId()]">
                Accéder au projet
              </a>
            } @else {
              <a class="flx-btn flx-btn--primary full" routerLink="/dashboard">
                Voir mes projets
              </a>
            }
          }

          @case ('error') {
            <div class="error-icon"><flx-icon name="x" [size]="28" color="#dc2626"></flx-icon></div>
            <h1>Invitation invalide</h1>
            <p class="sub">{{ errorMessage() }}</p>
            <a class="flx-btn flx-btn--ghost full" routerLink="/dashboard">
              Retourner à l'accueil
            </a>
          }
        }

      </div>
    </div>
  `,
  styles: [`
    .invite-screen {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 24px 16px;
      background: var(--flx-bg);
    }
    .invite-card {
      width: 100%;
      max-width: 420px;
      padding: 40px 36px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      text-align: center;
    }
    .brand-logo {
      filter: drop-shadow(0 4px 10px rgba(22, 101, 83, 0.25));
      margin-bottom: 4px;
    }
    h1 { font-size: 22px; font-weight: 800; margin: 0; }
    .project-name {
      font-size: 18px;
      font-weight: 700;
      color: var(--flx-accent);
      margin: 0;
    }
    .sub { font-size: 13px; color: var(--flx-text-muted); margin: 0; }
    .auth-hint { font-size: 13px; color: var(--flx-text-muted); }
    .full { width: 100%; justify-content: center; padding: 13px; }
    .success-icon {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--flx-accent);
      display: grid;
      place-items: center;
    }
    .error-icon {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #dc262618;
      border: 2px solid #dc262630;
      display: grid;
      place-items: center;
    }
    @media (max-width: 480px) {
      .invite-card { padding: 32px 24px; }
    }
  `],
})
export class InvitationComponent implements OnInit {
  state = signal<PageState>('loading');
  invitation = signal<any>(null);
  projectId = signal<string | null>(null);
  errorMessage = signal('Ce lien est invalide ou a expiré.');

  private token!: string;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    public auth: AuthService,
    private invitations: InvitationsService,
  ) {}

  ngOnInit() {
    this.token = this.route.snapshot.paramMap.get('token')!;
    if (!this.token) {
      this.state.set('error');
      return;
    }

    // Charger les détails de l'invitation
    this.http.get<any>(`${environment.apiUrl}/invitations/${this.token}`).subscribe({
      next: (inv) => {
        this.invitation.set(inv);
        this.state.set('preview');
      },
      error: (err) => {
        this.errorMessage.set(
          err?.error?.message ?? 'Ce lien d\'invitation est invalide ou a expiré.',
        );
        this.state.set('error');
      },
    });
  }

  accept() {
    this.state.set('accepting');
    this.invitations.accept(this.token).subscribe({
      next: (membership: any) => {
        this.projectId.set(this.invitation()?.projectId ?? null);
        this.state.set('accepted');
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message ?? "Impossible d'accepter l'invitation.");
        this.state.set('error');
      },
    });
  }

  decline() {
    this.invitations.decline(this.token).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: () => this.router.navigate(['/dashboard']),
    });
  }

  loginThenAccept(provider: 'google' | 'github') {
    // Stocker le token dans sessionStorage pour le retrouver après le retour OAuth
    sessionStorage.setItem('fluxo-pending-invite', this.token);
    this.auth.loginWithProvider(provider);
  }
}
