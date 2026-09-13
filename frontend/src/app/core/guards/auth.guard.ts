import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { RealtimeService } from '../services/realtime.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const realtime = inject(RealtimeService);

  if (!auth.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }
  if (!auth.currentUser()?.phoneVerified) {
    router.navigate(['/verify-phone']);
    return false;
  }

  // Connecter le WebSocket si ce n'est pas encore fait
  realtime.connect();

  return true;
};
