import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface ProjectFile {
  id: string;
  projectId: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
  version: number;
  createdAt: string;
  uploader: { id: string; username: string; avatarUrl?: string | null };
  children?: { id: string; version: number; url: string; createdAt: string }[];
}

@Injectable({ providedIn: 'root' })
export class FilesService {
  constructor(private http: HttpClient) {}

  list(projectId: string) {
    return this.http.get<ProjectFile[]>(`${environment.apiUrl}/projects/${projectId}/files`);
  }

  /** Déclarer un fichier uploadé (l'upload réel se fait directement vers S3/Cloudinary côté client) */
  declare(projectId: string, payload: { name: string; size: number; mimeType: string; url: string }) {
    return this.http.post<ProjectFile>(`${environment.apiUrl}/projects/${projectId}/files`, payload);
  }

  addVersion(
    projectId: string,
    fileId: string,
    payload: { name: string; size: number; mimeType: string; url: string },
  ) {
    return this.http.post<ProjectFile>(
      `${environment.apiUrl}/projects/${projectId}/files/${fileId}/versions`,
      payload,
    );
  }
}
