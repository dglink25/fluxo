import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { InvitationsService } from '../../../../core/services/invitations.service';
import { UsersService, UserSearchResult } from '../../../../core/services/users.service';
import { InvitationTargetType } from '../../../../core/models/invitation.model';
import { IconComponent } from '../../../../shared/components/icon/icon.component';

type Tab = 'EMAIL' | 'PHONE' | 'USERNAME';

@Component({
  selector: 'flx-invite-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './invite-modal.component.html',
  styleUrl: './invite-modal.component.scss',
})
export class InviteModalComponent {
  @Input({ required: true }) projectId!: string;
  @Output() close = new EventEmitter<void>();

  tab = signal<Tab>('EMAIL');
  tabs: { value: Tab; label: string; icon: 'mail' | 'phone' | 'user' }[] = [
    { value: 'EMAIL', label: 'Email', icon: 'mail' },
    { value: 'PHONE', label: 'Téléphone', icon: 'phone' },
    { value: 'USERNAME', label: 'Pseudo', icon: 'user' },
  ];

  email = '';
  phone = '';
  usernameQuery = '';
  selectedUser = signal<UserSearchResult | null>(null);
  searchResults = signal<UserSearchResult[]>([]);
  private searchInput$ = new Subject<string>();

  role = 'MEMBER';
  sending = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);

  constructor(
    private invitationsService: InvitationsService,
    private usersService: UsersService,
  ) {
    this.searchInput$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => this.usersService.search(q)),
      )
      .subscribe((results) => this.searchResults.set(results));
  }

  switchTab(tab: Tab) {
    this.tab.set(tab);
    this.error.set(null);
    this.success.set(null);
  }

  onUsernameQueryChange(value: string) {
    this.usernameQuery = value;
    this.selectedUser.set(null);
    if (value.trim().length >= 2) this.searchInput$.next(value.trim());
    else this.searchResults.set([]);
  }

  pickUser(user: UserSearchResult) {
    this.selectedUser.set(user);
    this.searchResults.set([]);
  }

  get canSubmit(): boolean {
    if (this.sending()) return false;
    if (this.tab() === 'EMAIL') return !!this.email;
    if (this.tab() === 'PHONE') return !!this.phone;
    return !!this.selectedUser();
  }

  submit() {
    const type: InvitationTargetType = this.tab();
    const value =
      type === 'EMAIL' ? this.email : type === 'PHONE' ? this.phone : this.selectedUser()!.username;

    this.error.set(null);
    this.sending.set(true);
    this.invitationsService.send(this.projectId, type, value, this.role).subscribe({
      next: () => {
        this.sending.set(false);
        this.success.set(this.successMessage(type, value));
        this.email = '';
        this.phone = '';
        this.usernameQuery = '';
        this.selectedUser.set(null);
      },
      error: (err) => {
        this.sending.set(false);
        this.error.set(err?.error?.message ?? "Impossible d'envoyer l'invitation");
      },
    });
  }

  private successMessage(type: InvitationTargetType, value: string): string {
    if (type === 'EMAIL') return `Invitation envoyée à ${value}`;
    if (type === 'PHONE') return `Invitation envoyée par WhatsApp au ${value}`;
    return `Invitation envoyée à @${value}`;
  }
}
