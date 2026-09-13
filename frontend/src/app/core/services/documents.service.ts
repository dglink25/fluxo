import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface ProjectDocument {
  id: string;
  projectId: string;
  type: string;
  createdAt: string;
  user: { id: string; username: string; avatarUrl?: string | null };
  details: {
    title: string;
    content: string;
    taskId?: string | null;
    version: number;
    lastEditedBy?: string;
    lastEditedAt?: string;
  };
}

@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private url(projectId: string) {
    return `${environment.apiUrl}/projects/${projectId}/documents`;
  }

  constructor(private http: HttpClient) {}

  list(projectId: string) {
    return this.http.get<ProjectDocument[]>(this.url(projectId));
  }

  create(projectId: string, payload: { title: string; content?: string; taskId?: string; fileType?: string }) {
    return this.http.post<ProjectDocument>(this.url(projectId), payload);
  }

  update(projectId: string, docId: string, payload: { title?: string; content?: string }) {
    return this.http.patch<ProjectDocument>(`${this.url(projectId)}/${docId}`, payload);
  }

  versions(projectId: string, docId: string) {
    return this.http.get<ProjectDocument[]>(`${this.url(projectId)}/${docId}/versions`);
  }

  remove(projectId: string, docId: string) {
    return this.http.delete(`${this.url(projectId)}/${docId}`);
  }
}
