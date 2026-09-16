import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError, BehaviorSubject, filter, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

// ── État partagé du refresh en cours ─────────────────────────────────────────
// Ces variables vivent en dehors de la fonction interceptor pour être partagées
// entre toutes les requêtes parallèles qui pourraient toutes recevoir un 401.
let isRefreshing = false;
const refreshDone$ = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // Ne pas intercepter les appels au endpoint de refresh lui-même
  // pour éviter une boucle infinie
  if (req.url.includes('/auth/refresh')) {
    return next(req);
  }

  // Attacher le token courant
  const token = auth.getAccessToken() ?? auth.getPendingToken();
  const authedReq = token ? addToken(req, token) : req;

  return next(authedReq).pipe(
    catchError((err: HttpErrorResponse) => {
      // Gérer uniquement les 401 (token expiré)
      if (err.status !== 401) return throwError(() => err);

      // Si pas de refresh token disponible → déconnecter
      const refreshToken = auth.getRefreshToken();
      if (!refreshToken) {
        auth.logout();
        return throwError(() => err);
      }

      // ── Refresh en cours — attendre qu'il se termine ──────────────────────
      if (isRefreshing) {
        return refreshDone$.pipe(
          filter((t) => t !== null),
          take(1),
          switchMap((newToken) => next(addToken(req, newToken!))),
        );
      }

      // ── Démarrer le refresh ───────────────────────────────────────────────
      isRefreshing = true;
      refreshDone$.next(null);

      return auth.refreshAccessToken().pipe(
        switchMap((newToken) => {
          isRefreshing = false;
          refreshDone$.next(newToken);
          // Rejouer la requête originale avec le nouveau token
          return next(addToken(req, newToken));
        }),
        catchError((refreshErr) => {
          // Réinitialiser l'état même en cas d'erreur
          isRefreshing = false;
          refreshDone$.next(null);
          // Le refresh a vraiment échoué (refresh token expiré/révoqué)
          // → déconnecter proprement
          auth.logout();
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};

function addToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
