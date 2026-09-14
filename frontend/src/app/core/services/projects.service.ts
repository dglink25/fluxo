import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Project, ProjectVisibility } from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private base = `${environment.apiUrl}/projects`;

  constructor(private http: HttpClient) {}

  list() {
    return this.http.get<Project[]>(this.base);
  }

  get(id: string) {
    return this.http.get<Project>(`${this.base}/${id}`);
  }

  create(payload: { name: string; description?: string; visibility?: ProjectVisibility; workspaceId?: string }) {
    return this.http.post<Project>(this.base, payload);
  }

  update(projectId: string, payload: { name?: string; description?: string; visibility?: ProjectVisibility }) {
    return this.http.patch<Project>(`${this.base}/${projectId}`, payload);
  }

  delete(projectId: string) {
    return this.http.delete(`${this.base}/${projectId}`);
  }

  getMembers(projectId: string) {
    return this.http.get<any>(`${this.base}/${projectId}/members`);
  }

  changeMemberRole(projectId: string, userId: string, role: string) {
    return this.http.patch(`${this.base}/${projectId}/members/${userId}/role`, { role });
  }

  removeMember(projectId: string, userId: string) {
    return this.http.delete(`${this.base}/${projectId}/members/${userId}`);
  }

  /** Profil public d'un utilisateur */
  getPublicProfile(username: string) {
    return this.http.get<any>(`${environment.apiUrl}/users/profile/${username}`);
  }
}
