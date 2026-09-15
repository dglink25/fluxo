import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface StartCallPayload {
  title?: string;
  channelId?: string;
  dmId?: string;
  participantIds: string[];
}

export interface ScheduleCallPayload {
  title: string;
  scheduledAt: string; // ISO date string
  channelId?: string;
  dmId?: string;
  participantIds: string[];
}

export interface VideoCallResponse {
  id: string;
  roomId: string;
  title?: string;
  hostId: string;
  status: 'LIVE' | 'SCHEDULED' | 'ENDED' | 'CANCELLED';
  scheduledAt?: string;
  startedAt?: string;
  channelId?: string;
  dmId?: string;
  callUrl: string;
  host: { id: string; username: string; fullName?: string; avatarUrl?: string };
  participants: Array<{ userId: string; user: { id: string; username: string; avatarUrl?: string } }>;
}

@Injectable({ providedIn: 'root' })
export class VideoCallApiService {
  private readonly base = `${environment.apiUrl}/video-calls`;

  constructor(private http: HttpClient) {}

  startCall(payload: StartCallPayload): Observable<VideoCallResponse> {
    return this.http.post<VideoCallResponse>(`${this.base}/start`, payload);
  }

  scheduleCall(payload: ScheduleCallPayload): Observable<VideoCallResponse> {
    return this.http.post<VideoCallResponse>(`${this.base}/schedule`, payload);
  }

  endCall(callId: string): Observable<VideoCallResponse> {
    return this.http.delete<VideoCallResponse>(`${this.base}/${callId}`);
  }

  cancelCall(callId: string): Observable<VideoCallResponse> {
    return this.http.delete<VideoCallResponse>(`${this.base}/${callId}/cancel`);
  }

  getCall(callId: string): Observable<VideoCallResponse> {
    return this.http.get<VideoCallResponse>(`${this.base}/${callId}`);
  }

  listForRoom(channelId?: string, dmId?: string): Observable<VideoCallResponse[]> {
    const params: Record<string, string> = {};
    if (channelId) params['channelId'] = channelId;
    if (dmId) params['dmId'] = dmId;
    return this.http.get<VideoCallResponse[]>(this.base, { params });
  }
}
