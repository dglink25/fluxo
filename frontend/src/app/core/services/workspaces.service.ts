import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Workspace } from '../models/workspace.model';
import { Project } from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class WorkspacesService {
  private base = `${environment.apiUrl}/workspaces`;

  constructor(private http: HttpClient) {}

  list() {
    return this.http.get<Workspace[]>(this.base);
  }

  get(id: string) {
    return this.http.get<Workspace>(`${this.base}/${id}`);
  }

  create(payload: { name: string; description?: string }) {
    return this.http.post<Workspace>(this.base, payload);
  }

  update(id: string, payload: { name?: string; description?: string }) {
    return this.http.patch<Workspace>(`${this.base}/${id}`, payload);
  }

  remove(id: string) {
    return this.http.delete(`${this.base}/${id}`);
  }

  getProjects(workspaceId: string) {
    return this.http.get<Project[]>(`${this.base}/${workspaceId}/projects`);
  }
}
