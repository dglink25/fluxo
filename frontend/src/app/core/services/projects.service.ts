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
}
