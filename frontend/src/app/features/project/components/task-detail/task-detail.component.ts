import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TasksService } from '../../../../core/services/tasks.service';
import { Task, TASK_STATUSES } from '../../../../core/models/task.model';
import { TaskComment } from '../../../../core/models/comment.model';
import { IconComponent } from '../../../../shared/components/icon/icon.component';

@Component({
  selector: 'flx-task-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './task-detail.component.html',
  styleUrl: './task-detail.component.scss',
})
export class TaskDetailComponent implements OnInit {
  @Input({ required: true }) projectId!: string;
  @Input({ required: true }) taskId!: string;
  @Output() close = new EventEmitter<void>();
  @Output() changed = new EventEmitter<void>();

  task = signal<(Task & { comments: TaskComment[] }) | null>(null);
  loading = signal(true);
  statuses = TASK_STATUSES;

  newSubtaskTitle = '';
  addingSubtask = signal(false);

  newComment = '';
  postingComment = signal(false);

  constructor(private tasksService: TasksService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.tasksService.getOne(this.projectId, this.taskId).subscribe({
      next: (task) => {
        this.task.set(task);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  updateStatus(status: Task['status']) {
    this.tasksService.updateStatus(this.projectId, this.taskId, status).subscribe(() => {
      this.task.update((t) => (t ? { ...t, status } : t));
      this.changed.emit();
    });
  }

  addSubtask() {
    if (!this.newSubtaskTitle.trim()) return;
    this.addingSubtask.set(true);
    this.tasksService.addSubtask(this.projectId, this.taskId, this.newSubtaskTitle).subscribe({
      next: (subtask) => {
        this.task.update((t) => (t ? { ...t, subtasks: [...(t.subtasks ?? []), subtask] } : t));
        this.newSubtaskTitle = '';
        this.addingSubtask.set(false);
        this.changed.emit();
      },
      error: () => this.addingSubtask.set(false),
    });
  }

  toggleSubtask(subtaskId: string, done: boolean) {
    this.tasksService.toggleSubtask(this.projectId, this.taskId, subtaskId, done).subscribe(() => {
      this.task.update((t) =>
        t
          ? { ...t, subtasks: t.subtasks?.map((s) => (s.id === subtaskId ? { ...s, done } : s)) }
          : t,
      );
      this.changed.emit();
    });
  }

  postComment() {
    if (!this.newComment.trim()) return;
    this.postingComment.set(true);
    this.tasksService.addComment(this.projectId, this.taskId, this.newComment).subscribe({
      next: (comment) => {
        this.task.update((t) => (t ? { ...t, comments: [...t.comments, comment] } : t));
        this.newComment = '';
        this.postingComment.set(false);
        this.changed.emit();
      },
      error: () => this.postingComment.set(false),
    });
  }

  subtaskProgress(t: Task) {
    const total = t.subtasks?.length ?? 0;
    const done = t.subtasks?.filter((s) => s.done).length ?? 0;
    return total ? Math.round((done / total) * 100) : 0;
  }
}
