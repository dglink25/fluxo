import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  OnInit,
} from '@angular/core';
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
    <div class="modal-overlay" (click)="close.emit()">
      <div class="modal-box call-modal" (click)="$event.stopPropagation()">

        <div class="modal-header">
          <h3>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="var(--flx-accent)" style="margin-right:8px;vertical-align:-3px">
              <path d="M4 6.5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2l5 3V7.5l-5 3v-2a2 2 0 0 0-2-2H4z"/>
            </svg>
            Visioconférence
          </h3>
          <button class="modal-close" (click)="close.emit()">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- Onglets Lancer / Planifier -->
        <div class="call-tabs">
          <button class="call-tab" [class.active]="mode === 'instant'" (click)="mode = 'instant'">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="margin-right:5px"><path d="M5 3l14 9-14 9V3z"/></svg>
            Lancer maintenant
          </button>
          <button class="call-tab" [class.active]="mode === 'schedule'" (click)="mode = 'schedule'">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="margin-right:5px">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Planifier
          </button>
        </div>

        <!-- Titre (optionnel pour instant, requis pour planifié) -->
        <div class="field">
          <label>Titre {{ mode === 'schedule' ? '' : '(optionnel)' }}</label>
          <input class="flx-input" [(ngModel)]="title"
            [placeholder]="mode === 'schedule' ? 'Titre de la réunion' : 'Réunion rapide, Daily stand-up…'"
          />
        </div>

        <!-- Date/heure (seulement pour planifier) -->
        @if (mode === 'schedule') {
          <div class="field">
            <label>Date et heure</label>
            <input class="flx-input" type="datetime-local" [(ngModel)]="scheduledAt"
              [min]="minDateTime" />
          </div>
        }

        <!-- Participants -->
        @if (availableParticipants.length > 0) {
          <div class="field">
            <label>Participants ({{ selectedIds.size }} sélectionné{{ selectedIds.size > 1 ? 's' : '' }})</label>
            <div class="participants-list">
              @for (p of availableParticipants; track p.id) {
                <label class="participant-row" [class.selected]="selectedIds.has(p.id)">
                  <input type="checkbox"
                    [checked]="selectedIds.has(p.id)"
                    (change)="toggleParticipant(p.id)" />
                  @if (p.avatarUrl) {
                    <img [src]="p.avatarUrl" [alt]="p.username" class="p-avatar" />
                  } @else {
                    <div class="p-avatar-ph">{{ p.username.slice(0,1).toUpperCase() }}</div>
                  }
                  <div class="p-info">
                    <span>{{ p.fullName || p.username }}</span>
                    <span class="p-user">&#64;{{ p.username }}</span>
                  </div>
                </label>
              }
            </div>
          </div>
        }

        @if (error()) {
          <p class="call-error">{{ error() }}</p>
        }

        <div class="modal-actions" style="flex-wrap:wrap;">
          <button class="flx-btn flx-btn--ghost" style="flex:1;min-width:120px;justify-content:center" (click)="close.emit()">Annuler</button>
          <button class="flx-btn flx-btn--primary" style="flex:1;min-width:140px;justify-content:center" (click)="submit()" [disabled]="loading()">
            @if (loading()) {
              <span class="flx-spinner" style="width:14px;height:14px;border-width:2px"></span>
              <span>En cours…</span>
            } @else if (mode === 'instant') {
              <svg viewBox="0 0 24 24" width="15" height="15" fill="white"><path d="M5 3l14 9-14 9V3z"/></svg>
              Lancer l'appel
            } @else {
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              Planifier l'appel
            }
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* ── Wrapper modal (le composant rend dans un modal-overlay du parent) ── */
    .call-modal {
      max-width: 480px;
      width: 100%;
      /* Sur mobile le parent modal-box gère déjà calc(100vw - 32px) */
    }

    /* ── Onglets ── */
    .call-tabs {
      display: flex;
      gap: 4px;
      background: var(--flx-bg-sunken, #e8ebea);
      border-radius: 10px;
      padding: 4px;
      margin-bottom: 4px;
    }

    .call-tab {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 9px 8px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: var(--flx-text-muted, #57655f);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      white-space: nowrap;
      min-width: 0;
    }
    .call-tab svg { flex-shrink: 0; }
    .call-tab.active {
      background: var(--flx-accent, #166553);
      color: white;
    }
    .call-tab:not(.active):hover {
      background: var(--flx-border, #d7dedb);
    }

    /* ── Champs ── */
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .field label {
      font-size: 11px;
      font-weight: 700;
      color: var(--flx-text-muted, #57655f);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    /* ── Liste participants ── */
    .participants-list {
      max-height: 200px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 2px;
      border: 1px solid var(--flx-border, #d7dedb);
      border-radius: 10px;
      padding: 4px;
      /* Scroll natif sur iOS */
      -webkit-overflow-scrolling: touch;
    }

    .participant-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.1s;
      /* Empêche le texte de sortir sur petits écrans */
      min-width: 0;
    }
    .participant-row input[type=checkbox] {
      accent-color: var(--flx-accent, #166553);
      flex-shrink: 0;
      width: 16px;
      height: 16px;
    }
    .participant-row.selected {
      background: rgba(22,101,83,0.08);
    }
    .participant-row:hover {
      background: var(--flx-bg-sunken, #e8ebea);
    }

    .p-avatar {
      width: 34px; height: 34px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }
    .p-avatar-ph {
      width: 34px; height: 34px;
      border-radius: 50%;
      background: var(--flx-accent, #166553);
      color: white;
      display: grid;
      place-items: center;
      font-size: 14px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .p-info {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0; /* permet au texte de tronquer */
      flex: 1;
    }
    .p-info span:first-child {
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--flx-text, #16211d);
    }
    .p-user {
      font-size: 11px;
      color: var(--flx-text-muted, #57655f);
      font-family: monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ── Erreur ── */
    .call-error {
      background: rgba(220,38,38,0.08);
      color: #dc2626;
      border: 1px solid rgba(220,38,38,0.2);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.4;
    }

    /* ── Mobile ── */
    @media (max-width: 480px) {
      .call-tab {
        font-size: 12px;
        padding: 8px 4px;
        gap: 3px;
      }
      /* Masquer le texte des onglets sur très petit écran, garder juste l'icône */
      @media (max-width: 340px) {
        .call-tab span { display: none; }
      }
      .participants-list {
        max-height: 160px;
      }
      .p-avatar, .p-avatar-ph {
        width: 30px; height: 30px;
        font-size: 12px;
      }
    }
  `],
})
export class StartCallModalComponent implements OnInit {
  @Input() channelId?: string;
  @Input() dmId?: string;
  @Input() projectId?: string;
  @Input() availableParticipants: CallParticipant[] = [];
  @Output() close     = new EventEmitter<void>();
  @Output() callStarted = new EventEmitter<{ roomId: string; callId: string; callUrl: string }>();

  mode: 'instant' | 'schedule' = 'instant';
  title        = '';
  scheduledAt  = '';
  selectedIds  = new Set<string>();
  loading      = signal(false);
  error        = signal('');

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
    // Sélectionner tous les participants par défaut
    this.availableParticipants.forEach((p) => this.selectedIds.add(p.id));
  }

  toggleParticipant(id: string) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  submit() {
    this.error.set('');
    if (this.mode === 'schedule') {
      this.scheduleCall();
    } else {
      this.startCall();
    }
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
            ...(this.dmId ? { dmId: this.dmId } : {}),
          },
        });
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Erreur lors du lancement de l\'appel.');
      },
    });
  }

  private scheduleCall() {
    if (!this.title.trim()) { this.error.set('Le titre est requis pour un appel planifié.'); return; }
    if (!this.scheduledAt)  { this.error.set('La date et l\'heure sont requises.'); return; }
    const dt = new Date(this.scheduledAt);
    if (dt <= new Date()) { this.error.set('La date doit être dans le futur.'); return; }
    if (!this.channelId && !this.dmId) { this.error.set('Contexte manquant.'); return; }

    this.loading.set(true);
    this.videoCallApi.scheduleCall({
      title: this.title.trim(),
      scheduledAt: dt.toISOString(),
      channelId: this.channelId,
      dmId: this.dmId,
      participantIds: [...this.selectedIds],
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.close.emit();
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Erreur lors de la planification.');
      },
    });
  }
}
