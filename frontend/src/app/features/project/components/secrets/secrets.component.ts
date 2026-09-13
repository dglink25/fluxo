import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  SecretsService,
  Secret,
  ConfidentialFile,
  CONFIDENTIAL_FILE_TYPES,
} from '../../../../core/services/secrets.service';
import { AuthService } from '../../../../core/services/auth.service';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { environment } from '../../../../../environments/environment';

type ActiveTab = 'env' | 'files';
type EnvInputMode = 'manual' | 'import';

@Component({
  selector: 'flx-secrets',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './secrets.component.html',
  styleUrl: './secrets.component.scss',
})
export class SecretsComponent implements OnInit {
  @Input({ required: true }) projectId!: string;

  activeTab = signal<ActiveTab>('env');
  envMode = signal<EnvInputMode>('manual');

  // Variables d'env
  secrets = signal<(Secret & { revealed?: boolean; revealedValue?: string })[]>([]);
  loadingSecrets = signal(true);
  revealingId = signal<string | null>(null);
  deletingId = signal<string | null>(null);

  // Formulaire ajout/modif manuel
  showAddForm = signal(false);
  editingId = signal<string | null>(null);
  formName = '';
  formValue = '';
  formDescription = '';
  formVisible = false; // afficher le champ valeur en clair
  saving = signal(false);

  // Import .env
  importContent = '';
  importing = signal(false);
  importResult = signal<{ imported: number } | null>(null);

  // Toast
  toastMsg = signal<string | null>(null);
  toastType = signal<'success' | 'error'>('success');

  // Fichiers confidentiels
  confFiles = signal<ConfidentialFile[]>([]);
  loadingFiles = signal(true);

  showFileForm = signal(false);
  fileFormName = '';
  fileFormType = 'OTHER';
  fileFormDesc = '';
  fileFormContent = '';
  fileFormVisible = false;
  uploadingFile = signal(false);
  deletingFileId = signal<string | null>(null);

  fileTypes = CONFIDENTIAL_FILE_TYPES;

  constructor(private secretsService: SecretsService, public auth: AuthService) {}

  ngOnInit() {
    this.loadSecrets();
    this.loadFiles();
  }

  // ── Variables d'env ──────────────────────────────────────────────────────

  loadSecrets() {
    this.loadingSecrets.set(true);
    this.secretsService.listSecrets(this.projectId).subscribe({
      next: (s) => { this.secrets.set(s); this.loadingSecrets.set(false); },
      error: () => this.loadingSecrets.set(false),
    });
  }

  openAddForm() {
    this.editingId.set(null);
    this.formName = '';
    this.formValue = '';
    this.formDescription = '';
    this.formVisible = false;
    this.showAddForm.set(true);
  }

  editSecret(s: Secret) {
    this.editingId.set(s.id);
    this.formName = s.name;
    this.formValue = s.revealedValue ?? '';
    this.formDescription = s.description ?? '';
    this.formVisible = false;
    this.showAddForm.set(true);
    // Si pas encore révélé, charger la valeur pour l'édition
    if (!s.revealedValue) {
      this.secretsService.revealSecret(this.projectId, s.id).subscribe({
        next: (r) => { this.formValue = r.value; },
        error: () => {},
      });
    }
  }

  saveSecret() {
    if (!this.formName.trim() || !this.formValue.trim()) return;
    this.saving.set(true);
    this.secretsService
      .upsertSecret(this.projectId, this.formName.trim(), this.formValue, this.formDescription || undefined)
      .subscribe({
        next: (saved) => {
          this.secrets.update((list) => {
            const idx = list.findIndex((s) => s.id === saved.id || s.name === saved.name);
            if (idx >= 0) {
              const updated = [...list];
              updated[idx] = { ...saved };
              return updated;
            }
            return [saved, ...list];
          });
          this.showAddForm.set(false);
          this.saving.set(false);
          this.showToast(`Variable ${saved.name} enregistrée`, 'success');
        },
        error: (err) => {
          this.saving.set(false);
          this.showToast(err?.error?.message ?? 'Erreur lors de la sauvegarde', 'error');
        },
      });
  }

  toggleReveal(s: Secret & { revealed?: boolean; revealedValue?: string }) {
    if (s.revealed) {
      // Masquer
      this.secrets.update((list) =>
        list.map((item) => (item.id === s.id ? { ...item, revealed: false, revealedValue: undefined } : item)),
      );
      return;
    }
    this.revealingId.set(s.id);
    this.secretsService.revealSecret(this.projectId, s.id).subscribe({
      next: (r) => {
        this.secrets.update((list) =>
          list.map((item) => (item.id === s.id ? { ...item, revealed: true, revealedValue: r.value } : item)),
        );
        this.revealingId.set(null);
      },
      error: () => this.revealingId.set(null),
    });
  }

  copyVariable(s: Secret & { revealedValue?: string }) {
    this.secretsService.copySecret(this.projectId, s.id).subscribe({
      next: (r) => {
        const text = `${r.name}=${r.value}`;
        navigator.clipboard.writeText(text).then(() => {
          this.showToast(`${r.name} copié dans le presse-papiers`, 'success');
        });
      },
      error: () => this.showToast('Impossible de copier', 'error'),
    });
  }

  deleteSecret(s: Secret) {
    if (!confirm(`Supprimer la variable "${s.name}" ?`)) return;
    this.deletingId.set(s.id);
    this.secretsService.deleteSecret(this.projectId, s.id).subscribe({
      next: () => {
        this.secrets.update((list) => list.filter((item) => item.id !== s.id));
        this.deletingId.set(null);
        this.showToast(`${s.name} supprimée`, 'success');
      },
      error: () => this.deletingId.set(null),
    });
  }

  importEnvFile() {
    if (!this.importContent.trim()) return;
    this.importing.set(true);
    this.secretsService.importEnv(this.projectId, this.importContent).subscribe({
      next: (r) => {
        this.importResult.set(r);
        this.importing.set(false);
        this.importContent = '';
        this.loadSecrets();
        this.showToast(`${r.imported} variable(s) importée(s)`, 'success');
      },
      error: (err) => {
        this.importing.set(false);
        this.showToast(err?.error?.message ?? 'Erreur lors de l\'import', 'error');
      },
    });
  }

  onFileInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.importContent = e.target?.result as string ?? '';
    };
    reader.readAsText(file);
  }

  exportEnv() {
    this.secretsService.exportEnv(this.projectId).subscribe({
      next: (result) => {
        // Créer un Blob et déclencher le téléchargement côté client
        const blob = new Blob([result.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', '.env');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        this.showToast(`${result.count} variable(s) exportée(s)`, 'success');
      },
      error: (err) => this.showToast(err?.error?.message ?? 'Erreur export', 'error'),
    });
  }

  // ── Fichiers confidentiels ────────────────────────────────────────────────

  loadFiles() {
    this.loadingFiles.set(true);
    this.secretsService.listConfidentialFiles(this.projectId).subscribe({
      next: (f) => { this.confFiles.set(f); this.loadingFiles.set(false); },
      error: () => this.loadingFiles.set(false),
    });
  }

  onConfFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.fileFormName = file.name;
    // Détecter le type auto
    if (file.name.endsWith('.json')) {
      this.fileFormType = file.name.includes('firebase') ? 'FIREBASE_CONFIG' : 'GOOGLE_SERVICE_ACCOUNT';
    } else if (file.name.endsWith('.pem') || file.name.endsWith('.crt')) {
      this.fileFormType = 'CERTIFICATE';
    } else if (file.name.endsWith('.key')) {
      this.fileFormType = 'PRIVATE_KEY';
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      this.fileFormContent = e.target?.result as string ?? '';
    };
    reader.readAsText(file);
  }

  uploadFile() {
    if (!this.fileFormName.trim() || !this.fileFormContent.trim()) return;
    this.uploadingFile.set(true);
    this.secretsService
      .uploadConfidentialFile(this.projectId, {
        name: this.fileFormName,
        content: this.fileFormContent,
        fileType: this.fileFormType,
        description: this.fileFormDesc || undefined,
      })
      .subscribe({
        next: (f) => {
          this.confFiles.update((list) => [f, ...list]);
          this.showFileForm.set(false);
          this.fileFormName = '';
          this.fileFormContent = '';
          this.fileFormDesc = '';
          this.fileFormType = 'OTHER';
          this.uploadingFile.set(false);
          this.showToast(`${f.name} uploadé`, 'success');
        },
        error: (err) => {
          this.uploadingFile.set(false);
          this.showToast(err?.error?.message ?? 'Erreur lors de l\'upload', 'error');
        },
      });
  }

  downloadFile(f: ConfidentialFile) {
    this.secretsService.downloadConfidentialFile(this.projectId, f.id).subscribe({
      next: (result) => {
        // Créer un Blob et déclencher le téléchargement côté client
        const isJson = f.name.endsWith('.json') || f.fileType === 'GOOGLE_SERVICE_ACCOUNT' || f.fileType === 'FIREBASE_CONFIG';
        const mimeType = isJson ? 'application/json' : 'application/octet-stream';
        const blob = new Blob([result.content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', f.name);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        this.showToast(`${f.name} téléchargé`, 'success');
      },
      error: (err) => this.showToast(err?.error?.message ?? 'Erreur lors du téléchargement', 'error'),
    });
  }

  deleteFile(f: ConfidentialFile) {
    if (!confirm(`Supprimer le fichier "${f.name}" définitivement ?`)) return;
    this.deletingFileId.set(f.id);
    this.secretsService.deleteConfidentialFile(this.projectId, f.id).subscribe({
      next: () => {
        this.confFiles.update((list) => list.filter((item) => item.id !== f.id));
        this.deletingFileId.set(null);
        this.showToast(`${f.name} supprimé`, 'success');
      },
      error: () => this.deletingFileId.set(null),
    });
  }

  fileTypeLabel(type: string): string {
    return this.fileTypes.find((t) => t.value === type)?.label ?? type;
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  }

  countEnvLines(): number {
    return this.importContent
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
      .length;
  }

  // ── Toast ────────────────────────────────────────────────────────────────

  private showToast(msg: string, type: 'success' | 'error') {
    this.toastMsg.set(msg);
    this.toastType.set(type);
    setTimeout(() => this.toastMsg.set(null), 3500);
  }
}
