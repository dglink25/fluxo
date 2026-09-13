export type ProjectRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'READER';
export type ProjectVisibility = 'PRIVATE' | 'PUBLIC';

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  visibility: ProjectVisibility;
  archived: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number; members: number };
}

export interface ProjectMember {
  id: string;
  userId: string;
  role: ProjectRole;
  user: { id: string; username: string; fullName?: string | null; avatarUrl?: string | null };
}
