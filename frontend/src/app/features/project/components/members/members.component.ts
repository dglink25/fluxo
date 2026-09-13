import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectsService } from '../../../../core/services/projects.service';
import { InvitationsService } from '../../../../core/services/invitations.service';
import { AuthService } from '../../../../core/services/auth.service';
import { IconComponent } from '../../../../shared/components/icon/icon.component';

export interface ProjectMemberFull {
  id: string;
  userId: string;
  role: string;
  addedAt: string;
  user: {
    id: string;
    username: string;
    fullName?: string | null;
    avatarUrl?: string | null;
    email: string;
  };
}

export interface InvitationFull {
  id: string;
  targetType: string;
  targetValue: string;
  role: string;
  status: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  invitedBy?: { username: string; avatarUrl?: string | null };
}

@Component({
  selector: 'flx-members',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './members.component.html',
  styleUrl: './members.component.scss',
})
export class MembersComponent implements OnInit {
  @Input({ required: true }) projectId!: string;
  @Output() invite = new EventEmitter<void>();

  members = signal<ProjectMemberFull[]>([]);
  invitations = signal<InvitationFull[]>([]);
  loading = signal(true);

  // Changement de rôle en ligne
  changingRoleId = signal<string | null>(null);
  removingId = signal<string | null>(null);

  toast = signal<{ msg: string; type: 'success' | 'error' } | null>(null);

  readonly roles = ['ADMIN', 'MEMBER', 'READER'] as const;

  constructor(
    private projectsService: ProjectsService,
    private invitationsService: InvitationsService,
    public auth: AuthService,
  ) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.projectsService.getMembers(this.projectId).subscribe({
      next: (data: any) => {
        this.members.set(data.members ?? []);
        this.invitations.set(data.invitations ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  isMe(member: ProjectMemberFull): boolean {
    return member.userId === this.auth.currentUser()?.id;
  }

  isOwner(member: ProjectMemberFull): boolean {
    return member.role === 'OWNER';
  }

  currentUserRole(): string {
    const me = this.auth.currentUser()?.id;
    return this.members().find((m) => m.userId === me)?.role ?? 'READER';
  }

  canManage(): boolean {
    return ['OWNER', 'ADMIN'].includes(this.currentUserRole());
  }

  changeRole(member: ProjectMemberFull, newRole: string) {
    if (member.role === newRole) return;
    this.changingRoleId.set(member.id);
    this.projectsService.changeMemberRole(this.projectId, member.userId, newRole).subscribe({
      next: () => {
        this.members.update((list) =>
          list.map((m) => (m.id === member.id ? { ...m, role: newRole } : m)),
        );
        this.changingRoleId.set(null);
        this.showToast(`Rôle de @${member.user.username} changé en ${newRole}`, 'success');
      },
      error: (err) => {
        this.changingRoleId.set(null);
        this.showToast(err?.error?.message ?? 'Erreur lors du changement de rôle', 'error');
      },
    });
  }

  removeMember(member: ProjectMemberFull) {
    if (!confirm(`Retirer @${member.user.username} du projet ?`)) return;
    this.removingId.set(member.id);
    this.projectsService.removeMember(this.projectId, member.userId).subscribe({
      next: () => {
        this.members.update((list) => list.filter((m) => m.id !== member.id));
        this.removingId.set(null);
        this.showToast(`@${member.user.username} retiré du projet`, 'success');
      },
      error: (err) => {
        this.removingId.set(null);
        this.showToast(err?.error?.message ?? 'Erreur lors du retrait', 'error');
      },
    });
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      PENDING: 'En attente',
      ACCEPTED: 'Acceptée',
      DECLINED: 'Refusée',
      EXPIRED: 'Expirée',
    };
    return map[status] ?? status;
  }

  targetTypeLabel(type: string): string {
    const map: Record<string, string> = {
      EMAIL: 'Email',
      PHONE: 'Téléphone',
      USERNAME: 'Pseudo',
    };
    return map[type] ?? type;
  }

  pendingInvitations(): InvitationFull[] {
    return this.invitations().filter((i) => i.status === 'PENDING');
  }

  private showToast(msg: string, type: 'success' | 'error') {
    this.toast.set({ msg, type });
    setTimeout(() => this.toast.set(null), 3500);
  }
}
