import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Notification } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private base = `${environment.apiUrl}/notifications`;

  constructor(private http: HttpClient) {}

  /** Toutes les notifications de l'utilisateur */
  list() {
    return this.http.get<Notification[]>(this.base);
  }

  /** Nombre de notifications non lues */
  countUnread() {
    return this.http.get<{ count: number }>(`${this.base}/unread-count`);
  }

  /** Marquer une notification comme lue */
  markRead(id: string) {
    return this.http.patch(`${this.base}/${id}/read`, {});
  }

  /** Marquer toutes comme lues */
  markAllRead() {
    return this.http.patch(`${this.base}/read-all`, {});
  }
}
