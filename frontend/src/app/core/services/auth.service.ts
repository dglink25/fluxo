import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, User } from '../models/user.model';

const ACCESS_TOKEN_KEY  = 'fluxo-access-token';
const REFRESH_TOKEN_KEY = 'fluxo-refresh-token';
const PENDING_TOKEN_KEY = 'fluxo-pending-token';
const USER_KEY          = 'fluxo-user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser = signal<User | null>(this.readStoredUser());
  readonly isAuthenticated = computed(() => !!this.currentUser());

  constructor(private http: HttpClient, private router: Router) {}

  /** Redirige le navigateur vers le flux OAuth du backend (Google ou GitHub) */
  loginWithProvider(provider: 'google' | 'github') {
    window.location.href = `${environment.apiUrl}/auth/${provider}`;
  }

  /** Jeton temporaire reçu juste après l'OAuth, avant vérification du téléphone */
  storePendingToken(token: string) {
    localStorage.setItem(PENDING_TOKEN_KEY, token);
  }

  getPendingToken(): string | null {
    return localStorage.getItem(PENDING_TOKEN_KEY);
  }

  storeFullSession(res: AuthResponse) {
    localStorage.removeItem(PENDING_TOKEN_KEY);
    localStorage.setItem(ACCESS_TOKEN_KEY, res.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.currentUser.set(res.user);
  }

  sendPhoneOtp(phone: string) {
    return this.http.post<{ sent: boolean; expiresInSeconds: number }>(
      `${environment.apiUrl}/auth/phone/send-otp`,
      { phone },
    );
  }

  verifyPhoneOtp(phone: string, code: string) {
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/phone/verify-otp`, { phone, code })
      .pipe(tap((res) => this.storeFullSession(res)));
  }

  logout() {
    // Déconnecter le WebSocket (lazy pour éviter la dépendance circulaire)
    try {
      const realtimeToken = localStorage.getItem('fluxo-realtime-ref');
      if (realtimeToken) { /* handled by RealtimeService watching isAuthenticated */ }
    } catch { /* noop */ }
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(PENDING_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  /**
   * Vérifie si l'accessToken est expiré (ou expire dans moins de 60s).
   * Décode le JWT localement sans vérification de signature.
   */
  isAccessTokenExpiredOrExpiring(): boolean {
    const token = this.getAccessToken();
    if (!token) return true;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiresAt = payload.exp * 1000; // en ms
      return Date.now() >= expiresAt - 60_000; // 60s de marge
    } catch {
      return true;
    }
  }

  /**
   * Utilise le refreshToken pour obtenir un nouveau accessToken.
   * Appelé automatiquement par l'interceptor sur les 401.
   * Retourne le nouveau accessToken (string).
   */
  refreshAccessToken() {
    const refreshToken = this.getRefreshToken();
    // On envoie le refreshToken dans le header pour que le backend puisse vérifier
    return this.http.post<AuthResponse>(
      `${environment.apiUrl}/auth/refresh`,
      {},
      { headers: { Authorization: `Bearer ${refreshToken}` } },
    ).pipe(
      tap((res) => {
        // Mettre à jour les tokens sans toucher à la session utilisateur
        localStorage.setItem(ACCESS_TOKEN_KEY, res.accessToken);
        if (res.refreshToken) {
          localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
        }
        if (res.user) {
          localStorage.setItem(USER_KEY, JSON.stringify(res.user));
          this.currentUser.set(res.user);
        }
      }),
      map((res) => res.accessToken),
    );
  }

  private readStoredUser(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}
