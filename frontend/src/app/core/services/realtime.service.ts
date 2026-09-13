import { Injectable, OnDestroy, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

/**
 * Service WebSocket (Socket.io) pour le temps réel.
 * - Connexion automatique quand l'utilisateur est authentifié
 * - Reconnexion automatique par Socket.io
 * - Expose des signaux réactifs pour l'UI
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  private socket: Socket | null = null;

  readonly isConnected = signal(false);
  readonly unreadNotifications = signal(0);
  readonly onlineUsers = signal<Set<string>>(new Set());

  constructor(private auth: AuthService) {}

  /** Connecter le WebSocket (appelé après authentification) */
  connect() {
    if (this.socket?.connected) return;

    const token = this.auth.getAccessToken();
    if (!token) return;

    // L'URL du socket est le backend sans le préfixe /api
    const wsUrl = environment.apiUrl.replace('/api', '');

    this.socket = io(`${wsUrl}/ws`, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    this.socket.on('connect', () => {
      this.isConnected.set(true);
    });

    this.socket.on('disconnect', () => {
      this.isConnected.set(false);
    });

    // Notifications temps réel
    this.socket.on('notification:new', () => {
      this.unreadNotifications.update((c) => c + 1);
    });

    // Présence
    this.socket.on('presence:online', (data: { userId: string }) => {
      this.onlineUsers.update((set) => new Set([...set, data.userId]));
    });

    this.socket.on('presence:offline', (data: { userId: string }) => {
      this.onlineUsers.update((set) => {
        const next = new Set(set);
        next.delete(data.userId);
        return next;
      });
    });
  }

  /** Déconnecter le WebSocket */
  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.isConnected.set(false);
  }

  /** Rejoindre la salle d'un projet */
  joinProject(projectId: string) {
    this.socket?.emit('project:join', { projectId });
  }

  /** Quitter la salle d'un projet */
  leaveProject(projectId: string) {
    this.socket?.emit('project:leave', { projectId });
  }

  /** Rejoindre un channel de messagerie */
  joinChannel(channelId: string) {
    this.socket?.emit('channel:join', { channelId });
  }

  /** Écouter un événement spécifique */
  on<T>(event: string, handler: (data: T) => void) {
    this.socket?.on(event, handler);
  }

  /** Retirer un écouteur */
  off(event: string) {
    this.socket?.off(event);
  }

  /** Émettre un événement */
  emit(event: string, data?: unknown) {
    this.socket?.emit(event, data);
  }

  /** Réinitialiser le compteur de notifications non lues */
  clearUnreadCount() {
    this.unreadNotifications.set(0);
  }

  ngOnDestroy() {
    this.disconnect();
  }
}
