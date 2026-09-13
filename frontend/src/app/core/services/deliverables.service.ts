import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type DeliverableStatus = 'DRAFT' | 'SUBMITTED' | 'VALIDATED' | 'REFUSED';

export interface Deliverable {
  id: string;
  taskId: string;
  type: string;
  url: string;
  name: string;
  size?: number | null;
  status: DeliverableStatus;
  refusalNote?: string | null;
  submittedAt?: string | null;
  validatedAt?: string | null;
  createdAt: string;
  author: { id: string; username: string; avatarUrl?: string | null };
  validator?: { id: string; username: string; avatarUrl?: string | null } | null;
}

@Injectable({ providedIn: 'root' })
export class DeliverablesService {
  private url(projectId: string, taskId: string) {
    return `${environment.apiUrl}/projects/${projectId}/tasks/${taskId}/deliverables`;
  }

  constructor(private http: HttpClient) {}

  list(projectId: string, taskId: string) {
    return this.http.get<Deliverable[]>(this.url(projectId, taskId));
  }

  create(
    projectId: string,
    taskId: string,
    payload: { url: string; name: string; size?: number; type?: string },
  ) {
    return this.http.post<Deliverable>(this.url(projectId, taskId), payload);
  }

  submit(projectId: string, taskId: string, deliverableId: string) {
    return this.http.patch<Deliverable>(`${this.url(projectId, taskId)}/${deliverableId}/submit`, {});
  }

  validate(projectId: string, taskId: string, deliverableId: string) {
    return this.http.patch<Deliverable>(`${this.url(projectId, taskId)}/${deliverableId}/validate`, {});
  }

  refuse(projectId: string, taskId: string, deliverableId: string, refusalNote: string) {
    return this.http.patch<Deliverable>(`${this.url(projectId, taskId)}/${deliverableId}/refuse`, {
      refusalNote,
    });
  }
}
