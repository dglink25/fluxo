import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Secret {
  id: string;
  name: string;
  group: string;          // fichier source (.env, .env.develop, .env.production, etc.)
  description?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  revealedValue?: string;
}

export interface ConfidentialFile {
  id: string;
  name: string;
  fileType: string;
  description?: string | null;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
}

export const CONFIDENTIAL_FILE_TYPES = [
  { value: 'GOOGLE_SERVICE_ACCOUNT', label: 'Compte de service Google (JSON)', ext: '.json' },
  { value: 'CERTIFICATE',            label: 'Certificat SSL/TLS',             ext: '.crt / .pem' },
  { value: 'PRIVATE_KEY',            label: 'Clé privée',                     ext: '.key / .pem' },
  { value: 'FIREBASE_CONFIG',        label: 'Config Firebase',                ext: '.json' },
  { value: 'AWS_CREDENTIALS',        label: 'Credentials AWS',                ext: '.csv / .json' },
  { value: 'OTHER',                  label: 'Autre fichier confidentiel',      ext: '*' },
];

@Injectable({ providedIn: 'root' })
export class SecretsService {
  constructor(private http: HttpClient) {}

  private base(projectId: string) {
    return `${environment.apiUrl}/projects/${projectId}`;
  }

  // ── Variables d'environnement ─────────────────────────────────────────────

  listSecrets(projectId: string) {
    return this.http.get<Secret[]>(`${this.base(projectId)}/secrets`);
  }

  upsertSecret(projectId: string, name: string, value: string, description?: string, group = '.env') {
    return this.http.put<Secret>(`${this.base(projectId)}/secrets`, { name, value, description, group });
  }

  importEnv(projectId: string, content: string, group = '.env') {
    return this.http.post<{ imported: number; group: string }>(
      `${this.base(projectId)}/secrets/import`,
      { content, group },
    );
  }

  exportEnv(projectId: string, group?: string) {
    const headers: Record<string, string> = {};
    if (group) headers['x-env-group'] = group;
    return this.http.get<{ content: string; count: number; groups: string[] }>(
      `${this.base(projectId)}/secrets/export`,
      { headers },
    );
  }

  listGroups(projectId: string) {
    return this.http.get<string[]>(`${this.base(projectId)}/secrets/groups`);
  }

  revealSecret(projectId: string, secretId: string) {
    return this.http.get<{ id: string; name: string; value: string }>(
      `${this.base(projectId)}/secrets/${secretId}/reveal`,
    );
  }

  copySecret(projectId: string, secretId: string) {
    return this.http.get<{ id: string; name: string; value: string }>(
      `${this.base(projectId)}/secrets/${secretId}/copy-value`,
    );
  }

  deleteSecret(projectId: string, secretId: string) {
    return this.http.delete(`${this.base(projectId)}/secrets/${secretId}`);
  }

  getSecretLogs(projectId: string, secretId: string) {
    return this.http.get<any[]>(`${this.base(projectId)}/secrets/${secretId}/logs`);
  }

  // ── Fichiers confidentiels ────────────────────────────────────────────────

  listConfidentialFiles(projectId: string) {
    return this.http.get<ConfidentialFile[]>(`${this.base(projectId)}/confidential-files`);
  }

  uploadConfidentialFile(
    projectId: string,
    payload: { name: string; content: string; fileType?: string; description?: string },
  ) {
    return this.http.post<ConfidentialFile>(`${this.base(projectId)}/confidential-files`, payload);
  }

  downloadConfidentialFile(projectId: string, fileId: string) {
    return this.http.get<{ id: string; name: string; fileType: string; content: string }>(
      `${this.base(projectId)}/confidential-files/${fileId}/download`,
    );
  }

  deleteConfidentialFile(projectId: string, fileId: string) {
    return this.http.delete(`${this.base(projectId)}/confidential-files/${fileId}`);
  }
}
