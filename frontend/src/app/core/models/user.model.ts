export type OAuthProvider = 'GOOGLE' | 'GITHUB';

export interface User {
  id: string;
  email: string;
  username: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  phoneVerified: boolean;
  provider: OAuthProvider;
  githubLinked: boolean;
  githubUsername?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}
