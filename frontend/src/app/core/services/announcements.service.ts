import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Announcement {
  id: string;
  projectId: string;
  type: string;
  createdAt: string;
  user: { id: string; username: string; avatarUrl?: string | null };
  details: {
    title: string;
    content: string;
    pinned: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class AnnouncementsService {
  private url(projectId: string) {
    return `${environment.apiUrl}/projects/${projectId}/announcements`;
  }

  constructor(private http: HttpClient) {}

  list(projectId: string) {
    return this.http.get<Announcement[]>(this.url(projectId));
  }

  create(projectId: string, payload: { title: string; content: string; pinned?: boolean }) {
    return this.http.post<Announcement>(this.url(projectId), payload);
  }

  pin(projectId: string, id: string, pinned: boolean) {
    return this.http.patch(`${this.url(projectId)}/${id}/pin`, { pinned });
  }
}
