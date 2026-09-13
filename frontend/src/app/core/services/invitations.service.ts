import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Invitation, InvitationTargetType } from '../models/invitation.model';

@Injectable({ providedIn: 'root' })
export class InvitationsService {
  constructor(private http: HttpClient) {}

  send(projectId: string, type: InvitationTargetType, value: string, role: string = 'MEMBER') {
    return this.http.post<Invitation>(
      `${environment.apiUrl}/projects/${projectId}/invitations`,
      { type, value, role },
    );
  }

  listForProject(projectId: string) {
    return this.http.get<Invitation[]>(`${environment.apiUrl}/projects/${projectId}/invitations`);
  }

  /** Invitations en attente adressées à l'utilisateur connecté */
  mine() {
    return this.http.get<Invitation[]>(`${environment.apiUrl}/invitations/me`);
  }

  accept(token: string) {
    return this.http.post(`${environment.apiUrl}/invitations/${token}/accept`, {});
  }

  decline(token: string) {
    return this.http.post(`${environment.apiUrl}/invitations/${token}/decline`, {});
  }
}
