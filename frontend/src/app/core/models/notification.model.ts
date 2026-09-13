export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'MENTION'
  | 'DUE_DATE_REMINDER'
  | 'PROJECT_INVITATION'
  | 'ANNOUNCEMENT'
  | 'DELIVERABLE_READY'
  | 'DELIVERABLE_VALIDATED'
  | 'DELIVERABLE_REFUSED';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  content: string;
  read: boolean;
  createdAt: string;
}
