import { Injectable, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';

/**
 * Service de notifications push Web Push.
 * Utilise l'API Service Worker Angular pour s'abonner aux notifications.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  readonly permission = signal<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );

  readonly supported = typeof Notification !== 'undefined' && 'serviceWorker' in navigator;

  constructor(private swPush: SwPush) {
    // Écouter les messages entrants
    this.swPush.messages.subscribe((msg: any) => {
      // Le SW affiche la notification automatiquement
      // Ici on peut mettre à jour l'UI
    });
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (!this.supported) return 'denied';
    const result = await Notification.requestPermission();
    this.permission.set(result);
    return result;
  }

  /** Affiche une notification locale (sans SW, pour les tests) */
  showLocal(title: string, body: string, icon = '/assets/icons/icon-192.png') {
    if (this.permission() === 'granted') {
      new Notification(title, { body, icon });
    }
  }
}
