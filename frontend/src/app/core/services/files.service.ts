import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface FileComment {
  id: string;
  fileId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; username: string; fullName?: string | null; avatarUrl?: string | null };
}

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
  comments?: FileComment[];
}

@Injectable({ providedIn: 'root' })
export class FilesService {
  constructor(private http: HttpClient) {}

  list(projectId: string) {
    return this.http.get<ProjectFile[]>(`${environment.apiUrl}/projects/${projectId}/files`);
  }

  declare(projectId: string, payload: { name: string; size: number; mimeType: string; url: string }) {
    return this.http.post<ProjectFile>(`${environment.apiUrl}/projects/${projectId}/files`, payload);
  }

  addVersion(projectId: string, fileId: string, payload: { name: string; size: number; mimeType: string; url: string }) {
    return this.http.post<ProjectFile>(
      `${environment.apiUrl}/projects/${projectId}/files/${fileId}/versions`, payload,
    );
  }

  listComments(projectId: string, fileId: string) {
    return this.http.get<FileComment[]>(
      `${environment.apiUrl}/projects/${projectId}/files/${fileId}/comments`,
    );
  }

  addComment(projectId: string, fileId: string, content: string) {
    return this.http.post<FileComment>(
      `${environment.apiUrl}/projects/${projectId}/files/${fileId}/comments`,
      { content },
    );
  }

  deleteComment(projectId: string, fileId: string, commentId: string) {
    return this.http.delete(
      `${environment.apiUrl}/projects/${projectId}/files/${fileId}/comments/${commentId}`,
    );
  }
}
