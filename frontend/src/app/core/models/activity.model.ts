export type ActivityType =
  | 'PROJECT_CREATED'
  | 'PROJECT_ARCHIVED'
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_COMMENTED'
  | 'INVITATION_SENT'
  | 'MEMBER_JOINED'
  | 'MEMBER_REMOVED'
  | 'MEMBER_ROLE_CHANGED'
  | 'FILE_UPLOADED'
  | 'DELIVERABLE_SUBMITTED'
  | 'DELIVERABLE_VALIDATED'
  | 'COMMIT_LINKED';

export interface Activity {
  id: string;
  projectId: string;
  userId: string;
  type: ActivityType;
  targetId?: string | null;
  details?: Record<string, any> | null;
  createdAt: string;
  user: { username: string; avatarUrl?: string | null };
}
