import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Channel, ChatMessage, DirectMessageConversation } from '../models/message.model';

export interface ProjectChannelGroup {
  projectId: string;
  projectName: string;
  channels: Channel[];
}

@Injectable({ providedIn: 'root' })
export class MessagingService {
  constructor(private http: HttpClient) {}

  // ── Tous les channels ────────────────────────────────────────────────────

  listAllChannels() {
    return this.http.get<ProjectChannelGroup[]>(`${environment.apiUrl}/channels`);
  }

  searchUsers(query: string) {
    return this.http.get<any[]>(`${environment.apiUrl}/channels/users/search`, {
      params: { q: query },
    });
  }

  // ── Channels projet ──────────────────────────────────────────────────────

  listChannels(projectId: string) {
    return this.http.get<Channel[]>(
      `${environment.apiUrl}/projects/${projectId}/channels`,
    );
  }

  createChannel(projectId: string, name: string) {
    return this.http.post<Channel>(
      `${environment.apiUrl}/projects/${projectId}/channels`,
      { name },
    );
  }

  getProjectMembers(projectId: string) {
    return this.http.get<any[]>(
      `${environment.apiUrl}/projects/${projectId}/channels/members`,
    );
  }

  getChannelMessages(
    projectId: string,
    channelId: string,
    opts: { limit?: number; before?: string } = {},
  ) {
    let params = new HttpParams();
    if (opts.limit) params = params.set('limit', opts.limit.toString());
    if (opts.before) params = params.set('before', opts.before);
    return this.http.get<ChatMessage[]>(
      `${environment.apiUrl}/projects/${projectId}/channels/${channelId}/messages`,
      { params },
    );
  }

  sendToChannel(
    projectId: string,
    channelId: string,
    payload: { content: string; type?: string; fileUrl?: string },
  ) {
    return this.http.post<ChatMessage>(
      `${environment.apiUrl}/projects/${projectId}/channels/${channelId}/messages`,
      payload,
    );
  }

  searchChannelMessages(projectId: string, channelId: string, query: string) {
    return this.http.get<ChatMessage[]>(
      `${environment.apiUrl}/projects/${projectId}/channels/${channelId}/messages/search`,
      { params: { q: query } },
    );
  }

  toggleReaction(projectId: string, channelId: string, messageId: string, emoji: string) {
    return this.http.post(
      `${environment.apiUrl}/projects/${projectId}/channels/${channelId}/messages/${messageId}/reactions`,
      { emoji },
    );
  }

  // ── Messages directs ─────────────────────────────────────────────────────

  listDms() {
    return this.http.get<DirectMessageConversation[]>(`${environment.apiUrl}/dm`);
  }

  getOrCreateDm(targetUserId: string) {
    return this.http.post<DirectMessageConversation>(
      `${environment.apiUrl}/dm/${targetUserId}`,
      {},
    );
  }

  getDmMessages(dmId: string, opts: { limit?: number } = {}) {
    let params = new HttpParams();
    if (opts.limit) params = params.set('limit', opts.limit.toString());
    return this.http.get<ChatMessage[]>(`${environment.apiUrl}/dm/${dmId}/messages`, { params });
  }

  sendDm(dmId: string, payload: { content: string; type?: string; fileUrl?: string }) {
    return this.http.post<ChatMessage>(`${environment.apiUrl}/dm/${dmId}/messages`, payload);
  }

  markDmRead(dmId: string) {
    return this.http.post(`${environment.apiUrl}/dm/${dmId}/read`, {});
  }
}
