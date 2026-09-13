import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InvitationsService } from '../../core/services/invitations.service';
import { NotificationsService } from '../../core/services/notifications.service';
import { Invitation } from '../../core/models/invitation.model';
import { Notification } from '../../core/models/notification.model';
import { forkJoin } from 'rxjs';

type ActiveTab = 'invitations' | 'notifications';

@Component({
  selector: 'flx-notifications',
  standalone: true,
  imports: [CommonModule, NavbarComponent, BottomNavComponent, IconComponent],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
})
export class NotificationsComponent implements OnInit {
  activeTab = signal<ActiveTab>('invitations');

  invitations = signal<Invitation[]>([]);
  notifications = signal<Notification[]>([]);
  loading = signal(true);
  respondingId = signal<string | null>(null);

  constructor(
    private invitationsService: InvitationsService,
    private notificationsService: NotificationsService,
    private router: Router,
  ) {}

  ngOnInit() {
    forkJoin({
      invitations: this.invitationsService.mine(),
      notifications: this.notificationsService.list(),
    }).subscribe({
      next: ({ invitations, notifications }) => {
        this.invitations.set(invitations);
        this.notifications.set(notifications);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  accept(invitation: Invitation) {
    this.respondingId.set(invitation.id);
    this.invitationsService.accept(invitation.token).subscribe({
      next: () => {
        this.invitations.update((list) => list.filter((i) => i.id !== invitation.id));
        this.respondingId.set(null);
        if (invitation.project?.id) this.router.navigate(['/projects', invitation.project.id]);
      },
      error: () => this.respondingId.set(null),
    });
  }

  decline(invitation: Invitation) {
    this.respondingId.set(invitation.id);
    this.invitationsService.decline(invitation.token).subscribe({
      next: () => {
        this.invitations.update((list) => list.filter((i) => i.id !== invitation.id));
        this.respondingId.set(null);
      },
      error: () => this.respondingId.set(null),
    });
  }

  markRead(notification: Notification) {
    if (notification.read) return;
    this.notificationsService.markRead(notification.id).subscribe(() => {
      this.notifications.update((list) =>
        list.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      );
    });
  }

  markAllRead() {
    this.notificationsService.markAllRead().subscribe(() => {
      this.notifications.update((list) => list.map((n) => ({ ...n, read: true })));
    });
  }

  unreadCount() {
    return this.notifications().filter((n) => !n.read).length;
  }

  notificationIcon(type: string): 'bell' | 'tasks' | 'mail' | 'check' | 'activity' {
    if (type.includes('TASK')) return 'tasks';
    if (type.includes('INVITATION')) return 'mail';
    if (type.includes('DELIVERABLE')) return 'check';
    return 'bell';
  }
}
