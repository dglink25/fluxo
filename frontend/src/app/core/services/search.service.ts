import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface SearchResults {
  projects: {
    id: string;
    name: string;
    description?: string | null;
    visibility: string;
    _count: { tasks: number; members: number };
  }[];
  tasks: {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    priority: string;
    projectId: string;
    project: { name: string };
  }[];
  users: {
    id: string;
    username: string;
    fullName?: string | null;
    avatarUrl?: string | null;
  }[];
  messages: {
    id: string;
    content: string;
    createdAt: string;
    channelId?: string | null;
    sender: { id: string; username: string; avatarUrl?: string | null };
    channel?: { id: string; name: string; projectId: string } | null;
  }[];
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  constructor(private http: HttpClient) {}

  search(query: string) {
    return this.http.get<SearchResults>(`${environment.apiUrl}/search`, {
      params: { q: query },
    });
  }
}
