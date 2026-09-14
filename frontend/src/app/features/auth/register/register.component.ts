/**
 * Fluxo utilise exclusivement l'authentification OAuth (Google/GitHub).
 * Il n'y a pas d'inscription par email/mot de passe.
 * Ce composant redirige simplement vers la page de connexion.
 */
import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'flx-register',
  standalone: true,
  template: '',
})
export class RegisterComponent {
  constructor(router: Router) {
    router.navigate(['/login'], { replaceUrl: true });
  }
}
