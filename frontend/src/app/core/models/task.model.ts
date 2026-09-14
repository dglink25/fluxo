export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface TaskAssignee {
  userId: string;
  user: { id: string; username: string; avatarUrl?: string | null };
}

export interface Task {
  id: string;
  projectId: string;
  code?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string | null;
  assignee?: { id: string; username: string; avatarUrl?: string | null } | null;
  assignees?: TaskAssignee[];
  dueDate?: string | null;
  labels: string[];
  subtasks?: { id: string; title: string; done: boolean }[];
}

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'TODO', label: 'À faire' },
  { value: 'IN_PROGRESS', label: 'En cours' },
  { value: 'IN_REVIEW', label: 'En révision' },
  { value: 'DONE', label: 'Terminé' },
];
