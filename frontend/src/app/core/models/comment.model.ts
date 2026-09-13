export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  createdAt: string;
  user: { id: string; username: string; avatarUrl?: string | null };
}
