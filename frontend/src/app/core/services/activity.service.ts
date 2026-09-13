import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Activity } from '../models/activity.model';

@Injectable({ providedIn: 'root' })
export class ActivityService {
  constructor(private http: HttpClient) {}

  list(projectId: string) {
    return this.http.get<Activity[]>(`${environment.apiUrl}/projects/${projectId}/activity`);
  }
}
