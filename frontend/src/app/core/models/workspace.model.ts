import { ProjectRole } from './project.model';

export interface Workspace {
  id: string;
  name: string;
  description?: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  _count?: { projects: number; members: number };
  members?: WorkspaceMember[];
  owner?: { id: string; username: string; avatarUrl?: string | null };
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: ProjectRole;
  user?: { id: string; username: string; fullName?: string | null; avatarUrl?: string | null };
}
