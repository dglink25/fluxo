export type InvitationTargetType = 'EMAIL' | 'PHONE' | 'USERNAME';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export interface Invitation {
  id: string;
  projectId: string;
  targetType: InvitationTargetType;
  targetValue: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'READER';
  status: InvitationStatus;
  token: string;
  expiresAt: string;
  createdAt: string;
  project?: { id: string; name: string; description?: string | null };
  invitedBy?: { username: string; avatarUrl?: string | null };
}
