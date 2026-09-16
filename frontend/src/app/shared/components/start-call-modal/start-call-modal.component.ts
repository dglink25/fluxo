import { Component, Input, Output, EventEmitter, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { VideoCallApiService } from '../../../core/services/video-call.service';
import { CallStateService } from '../../../core/services/call-state.service';

export interface CallParticipant {
  id: string;
  username: string;
  fullName?: string;
  avatarUrl?: string;
}

@Component({
  selector: 'flx-start-call-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="scm-overlay" (click)="close.emit()">
      <div class="scm-box" (click)="$event.stopPropagation()">

        <div class="scm-header">
          <div class="scm-title">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="var(--flx-accent,#166553)">
              <path d="M4 6.5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2l5 3V7.5l-5 3v-2a2 2 0 0 0-2-2H4z"/>
            </svg>
            <h3>Visioconférence</h3>
          </div>
          <button class="scm-close" (click)="close.emit()" aria-label="Fermer">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="scm-tabs">
          <button class="scm-tab" [class.active]="mode === 'instant'" (click)="mode = 'instant'">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>
            Lancer maintenant
          </button>
          <button class="scm-tab" [class.active]="mode === 'schedule'" (click)="mode = 'schedule'">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Planifier
          </button>
        </div>

        <div class="scm-field">
          <label>Titre {{ mode === 'schedule' ? '' : '(optionnel)' }}</label>
          <input class="scm-input" [(ngModel)]="title"
            [placeholder]="mode === 'schedule' ? 'Titre de la réunion' : 'Daily stand-up, Réunion projet…'" />
        </div>

        @if (mode === 'schedule') {
          <div class="scm-field">
            <label>Date et heure</label>
            <input class="scm-input" type="datetime-local" [(ngModel)]="scheduledAt" [min]="minDateTime" />
          </div>
        }

        @if (availableParticipants.length > 0) {
          <div class="scm-field">
            <label>Participants ({{ selectedIds.size }} / {{ availableParticipants.length }})</label>
            <div class="scm-participants">
              @for (p of availableParticipants; track p.id) {
                <label class="scm-p-row" [class.selected]="selectedIds.has(p.id)">
                  <input type="checkbox" [checked]="selectedIds.has(p.id)" (change)="toggleParticipant(p.id)" />
                  @if (p.avatarUrl) {
                    <img [src]="p.avatarUrl" [alt]="p.username" class="scm-avatar" />
                  } @else {
                    <div class="scm-avatar-ph">{{ p.username.slice(0,1).toUpperCase() }}</div>
                  }
                  <div class="scm-p-info">
                    <span class="scm-p-name">{{ p.fullName || p.username }}</span>
                    <span class="scm-p-user">&#64;{{ p.username }}</span>
                  </div>
                </label>
              }
            </div>
          </div>
        }

        @if (error()) {
          <p class="scm-error">{{ error() }}</p>
        }

        <div class="scm-actions">
          <button class="scm-btn scm-btn--ghost" (click)="close.emit()">Annuler</button>
          <button class="scm-btn scm-btn--primary" (click)="submit()" [disabled]="loading()">
            @if (loading()) {
              <span class="scm-spinner"></span>En cours…
            } @else if (mode === 'instant') {
              <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M5 3l14 9-14 9V3z"/></svg>
              Lancer l'appel
            } @else {
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              Planifier
            }
          </button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    /* OVERLAY — position:fixed, z-index très élevé, indépendant du parent */
    .scm-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      padding: 16px;
    }
    @media (max-width: 600px) {
      .scm-overlay { align-items: flex-end; padding: 0; }
    }

    /* BOÎTE */
    .scm-box {
      background: var(--flx-bg-raised, #ffffff);
      border: 1px solid var(--flx-border, #d7dedb);
      border-radius: 16px;
      padding: 24px;
      width: min(500px, calc(100vw - 32px));
      max-height: calc(100dvh - 32px);
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.3);
      animation: scmIn 0.2s ease;
    }
    @media (max-width: 600px) {
      .scm-box {
        width: 100%;
        border-radius: 20px 20px 0 0;
        padding: 20px 16px;
        padding-bottom: max(24px, env(safe-area-inset-bottom, 16px));
        max-height: 92dvh;
        animation: scmInMobile 0.25s cubic-bezier(0.32,1.2,0.64,1);
      }
    }
    @keyframes scmIn {
      from { opacity: 0; transform: scale(0.95) translateY(-8px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes scmInMobile {
      from { transform: translateY(110%); }
      to   { transform: translateY(0); }
    }

    /* HEADER */
    .scm-header {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    .scm-title {
      display: flex; align-items: center; gap: 8px;
    }
    .scm-title h3 {
      margin: 0; font-size: 17px; font-weight: 700;
      color: var(--flx-text, #16211d);
    }
    .scm-close {
      width: 34px; height: 34px; border-radius: 50%;
      border: none; background: var(--flx-bg-sunken, #e8ebea);
      color: var(--flx-text-muted, #57655f);
      display: grid; place-items: center; cursor: pointer; flex-shrink: 0;
    }
    .scm-close:hover { background: var(--flx-border, #d7dedb); }

    /* TABS */
    .scm-tabs {
      display: flex; gap: 4px;
      background: var(--flx-bg-sunken, #e8ebea);
      border-radius: 12px; padding: 4px;
    }
    .scm-tab {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 10px 8px; border-radius: 9px; border: none; background: transparent;
      color: var(--flx-text-muted, #57655f);
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: background 0.15s, color 0.15s; white-space: nowrap;
    }
    .scm-tab.active {
      background: var(--flx-accent, #166553); color: white;
      box-shadow: 0 2px 8px rgba(22,101,83,0.3);
    }
    .scm-tab:not(.active):hover { background: var(--flx-border, #d7dedb); }
    @media (max-width: 380px) {
      .scm-tab { font-size: 12px; padding: 9px 4px; }
    }

    /* CHAMPS */
    .scm-field { display: flex; flex-direction: column; gap: 7px; }
    .scm-field label {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.06em; color: var(--flx-text-muted, #57655f);
    }
    .scm-input {
      width: 100%; padding: 11px 14px; border-radius: 10px;
      border: 1.5px solid var(--flx-border, #d7dedb);
      background: var(--flx-bg-raised, #fff); color: var(--flx-text, #16211d);
      font-size: 14px; font-family: inherit; box-sizing: border-box;
      transition: border-color 0.15s;
    }
    .scm-input:focus {
      outline: none; border-color: var(--flx-accent, #166553);
      box-shadow: 0 0 0 3px rgba(22,101,83,0.12);
    }

    /* PARTICIPANTS */
    .scm-participants {
      display: flex; flex-direction: column; gap: 2px;
      border: 1.5px solid var(--flx-border, #d7dedb);
      border-radius: 10px; padding: 4px;
      max-height: 200px; overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }
    @media (max-width: 600px) { .scm-participants { max-height: 150px; } }

    .scm-p-row {
      display: flex; align-items: center; gap: 10px; padding: 9px 10px;
      border-radius: 8px; cursor: pointer; transition: background 0.1s; min-width: 0;
    }
    .scm-p-row:hover { background: var(--flx-bg-sunken, #e8ebea); }
    .scm-p-row.selected { background: rgba(22,101,83,0.08); }
    .scm-p-row input[type=checkbox] {
      width: 16px; height: 16px;
      accent-color: var(--flx-accent, #166553); flex-shrink: 0; cursor: pointer;
    }
    .scm-avatar {
      width: 34px; height: 34px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
    }
    .scm-avatar-ph {
      width: 34px; height: 34px; border-radius: 50%;
      background: var(--flx-accent, #166553); color: white;
      display: grid; place-items: center; font-size: 14px; font-weight: 700; flex-shrink: 0;
    }
    .scm-p-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
    .scm-p-name {
      font-size: 13px; font-weight: 600; color: var(--flx-text, #16211d);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .scm-p-user {
      font-size: 11px; color: var(--flx-text-muted, #57655f); font-family: monospace;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* ERREUR */
    .scm-error {
      background: rgba(220,38,38,0.08); color: #dc2626;
      border: 1px solid rgba(220,38,38,0.2);
      border-radius: 8px; padding: 10px 14px; font-size: 13px; line-height: 1.5; margin: 0;
    }

    /* ACTIONS */
    .scm-actions { display: flex; gap: 10px; padding-top: 4px; }
    @media (max-width: 600px) {
      .scm-actions { flex-direction: column-reverse; }
    }

    .scm-btn {
      flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px;
      padding: 12px 16px; border-radius: 10px; border: none;
      font-size: 14px; font-weight: 700; font-family: inherit;
      cursor: pointer; transition: background 0.15s, transform 0.08s; white-space: nowrap;
    }
    .scm-btn:active { transform: scale(0.97); }
    .scm-btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
    .scm-btn--ghost {
      background: var(--flx-bg-sunken, #e8ebea); color: var(--flx-text, #16211d);
      border: 1.5px solid var(--flx-border, #d7dedb);
    }
    .scm-btn--ghost:hover:not(:disabled) { background: var(--flx-border, #d7dedb); }
    .scm-btn--primary { background: var(--flx-accent, #166553); color: white; }
    .scm-btn--primary:hover:not(:disabled) { background: #0f4a3c; }

    .scm-spinner {
      width: 14px; height: 14px; border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.3); border-top-color: white;
      animation: scmSpin 0.7s linear infinite; flex-shrink: 0;
    }
    @keyframes scmSpin { to { transform: rotate(360deg); } }
  `],
})
export class StartCallModalComponent implements OnInit {
  @Input() channelId?: string;
  @Input() dmId?: string;
  @Input() projectId?: string;
  @Input() availableParticipants: CallParticipant[] = [];
  @Output() close       = new EventEmitter<void>();
  @Output() callStarted = new EventEmitter<{ roomId: string; callId: string; callUrl: string }>();

  mode: 'instant' | 'schedule' = 'instant';
  title       = '';
  scheduledAt = '';
  selectedIds = new Set<string>();
  loading     = signal(false);
  error       = signal('');

  get minDateTime(): string {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  }

  constructor(
    private videoCallApi: VideoCallApiService,
    private callState: CallStateService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.availableParticipants.forEach((p) => this.selectedIds.add(p.id));
  }

  toggleParticipant(id: string) {
    this.selectedIds.has(id) ? this.selectedIds.delete(id) : this.selectedIds.add(id);
  }

  submit() {
    this.error.set('');
    this.mode === 'schedule' ? this.scheduleCall() : this.startCall();
  }

  private startCall() {
    if (!this.channelId && !this.dmId) {
      this.error.set('Contexte manquant (channel ou DM requis).');
      return;
    }
    this.loading.set(true);
    this.videoCallApi.startCall({
      title: this.title.trim() || undefined,
      channelId: this.channelId,
      dmId: this.dmId,
      participantIds: [...this.selectedIds],
    }).subscribe({
      next: (call) => {
        this.loading.set(false);
        this.callState.setActive({
          callId: call.id,
          roomId: call.roomId,
          title: call.title ?? 'Visioconférence',
          hostName: call.host.fullName ?? call.host.username,
          callUrl: call.callUrl,
          minimized: false,
        });
        this.callStarted.emit({ roomId: call.roomId, callId: call.id, callUrl: call.callUrl });
        this.close.emit();
        this.router.navigate(['/call'], {
          queryParams: {
            room: call.roomId,
            callId: call.id,
            ...(this.channelId ? { channelId: this.channelId } : {}),
            ...(this.projectId ? { projectId: this.projectId } : {}),
            ...(this.dmId     ? { dmId:     this.dmId }     : {}),
          },
        });
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? "Erreur lors du lancement de l'appel.");
      },
    });
  }

  private scheduleCall() {
    if (!this.title.trim())  { this.error.set('Le titre est requis.'); return; }
    if (!this.scheduledAt)   { this.error.set('La date et l\'heure sont requises.'); return; }
    const dt = new Date(this.scheduledAt);
    if (dt <= new Date())    { this.error.set('La date doit être dans le futur.'); return; }
    if (!this.channelId && !this.dmId) { this.error.set('Contexte manquant.'); return; }

    this.loading.set(true);
    this.videoCallApi.scheduleCall({
      title: this.title.trim(),
      scheduledAt: dt.toISOString(),
      channelId: this.channelId,
      dmId: this.dmId,
      participantIds: [...this.selectedIds],
    }).subscribe({
      next: () => { this.loading.set(false); this.close.emit(); },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Erreur lors de la planification.');
      },
    });
  }
}
