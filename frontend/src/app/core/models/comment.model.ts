export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: string;
  user: { username: string; avatarUrl?: string | null };
}
