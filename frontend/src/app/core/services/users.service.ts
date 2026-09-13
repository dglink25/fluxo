import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface UserSearchResult {
  id: string;
  username: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  constructor(private http: HttpClient) {}

  search(query: string) {
    return this.http.get<UserSearchResult[]>(`${environment.apiUrl}/users/search`, {
      params: { q: query },
    });
  }
}
