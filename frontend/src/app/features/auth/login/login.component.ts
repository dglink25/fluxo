import { Component, OnInit, signal } from '@angular/core';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Vous avez refusé l\'accès. Réessayez et autorisez Fluxo à accéder à votre compte.',
  oauth_error:   'Une erreur est survenue lors de la connexion. Veuillez réessayer.',
  session:       'Session expirée. Veuillez vous reconnecter.',
  token:         'Erreur de token. Veuillez réessayer.',
  link_failed:   'La liaison du compte a échoué. Veuillez réessayer.',
};

@Component({
  selector: 'flx-login',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  errorMessage = signal<string | null>(null);

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    // Si déjà connecté et vérifié, aller directement au dashboard
    if (this.auth.isAuthenticated() && this.auth.currentUser()?.phoneVerified) {
      this.router.navigate(['/dashboard']);
      return;
    }

    // Afficher le message d'erreur OAuth si présent dans l'URL
    const error = this.route.snapshot.queryParamMap.get('error');
    if (error) {
      const msg = ERROR_MESSAGES[error] ?? `Erreur de connexion : ${error}. Veuillez réessayer.`;
      this.errorMessage.set(msg);
      // Nettoyer l'URL sans recharger
      this.router.navigate([], {
        replaceUrl: true,
        queryParams: {},
      });
    }
  }

  loginWith(provider: 'google' | 'github') {
    this.errorMessage.set(null);
    this.auth.loginWithProvider(provider);
  }
}
