import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityService } from '../../../../core/services/activity.service';
import { Activity, ActivityType } from '../../../../core/models/activity.model';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';

const ACTIVITY_META: Record<ActivityType, { icon: IconName; label: (a: Activity) => string }> = {
  PROJECT_CREATED: { icon: 'folder', label: () => 'a créé le projet' },
  PROJECT_ARCHIVED: { icon: 'folder', label: () => 'a archivé le projet' },
  TASK_CREATED: { icon: 'plus', label: (a) => `a créé la tâche "${a.details?.['title'] ?? ''}"` },
  TASK_UPDATED: { icon: 'tasks', label: () => 'a mis à jour une tâche' },
  TASK_STATUS_CHANGED: {
    icon: 'check',
    label: (a) => `a changé le statut d'une tâche vers "${a.details?.['newStatus'] ?? ''}"`,
  },
  TASK_COMMENTED: { icon: 'comment', label: () => 'a commenté une tâche' },
  INVITATION_SENT: {
    icon: 'mail',
    label: (a) => `a invité ${a.details?.['target'] ?? 'quelqu\'un'} (${a.details?.['channel'] ?? ''})`,
  },
  MEMBER_JOINED: { icon: 'user', label: () => 'a rejoint le projet' },
  MEMBER_REMOVED: { icon: 'x', label: () => 'a retiré un membre du projet' },
  MEMBER_ROLE_CHANGED: {
    icon: 'user',
    label: (a) => `a changé un rôle vers ${a.details?.['newRole'] ?? ''}`,
  },
  FILE_UPLOADED: { icon: 'clipboard', label: (a) => `a déposé un fichier "${a.details?.['name'] ?? ''}"` },
  DELIVERABLE_SUBMITTED: { icon: 'send', label: () => 'a soumis un livrable' },
  DELIVERABLE_VALIDATED: { icon: 'check', label: () => 'a validé un livrable' },
  COMMIT_LINKED: {
    icon: 'activity',
    label: (a) => `a lié un commit : ${(a.details?.['sha'] as string ?? '').slice(0, 7)}`,
  },
};

@Component({
  selector: 'flx-activity-feed',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './activity-feed.component.html',
  styleUrl: './activity-feed.component.scss',
})
export class ActivityFeedComponent implements OnInit {
  @Input({ required: true }) projectId!: string;

  activities = signal<Activity[]>([]);
  loading = signal(true);

  constructor(private activityService: ActivityService) {}

  ngOnInit() {
    this.activityService.list(this.projectId).subscribe({
      next: (activities) => {
        this.activities.set(activities);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  iconFor(type: ActivityType): IconName {
    return ACTIVITY_META[type]?.icon ?? 'activity';
  }

  labelFor(activity: Activity): string {
    return ACTIVITY_META[activity.type]?.label(activity) ?? activity.type;
  }
}
