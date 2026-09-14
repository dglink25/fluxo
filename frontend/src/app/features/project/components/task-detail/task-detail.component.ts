import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TasksService } from '../../../../core/services/tasks.service';
import { ProjectsService } from '../../../../core/services/projects.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Task, TASK_STATUSES } from '../../../../core/models/task.model';
import { TaskComment } from '../../../../core/models/comment.model';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { environment } from '../../../../../environments/environment';

interface ProjectMember {
  id: string; userId: string; role: string;
  user: { id: string; username: string; fullName?: string | null; avatarUrl?: string | null };
}

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

  task = signal<(Task & { comments: TaskComment[]; assignees?: any[] }) | null>(null);
  loading = signal(true);
  statuses = TASK_STATUSES;

  // Membres du projet (pour l'assignation)
  projectMembers = signal<ProjectMember[]>([]);
  selectedAssigneeIds = signal<string[]>([]);

  // Sous-tâches
  newSubtaskTitle = '';
  addingSubtask = signal(false);

  // Commentaires avec fichier
  newComment = '';
  postingComment = signal(false);
  commentFile: File | null = null;
  commentFilePreview: string | null = null;
  uploadingFile = signal(false);

  constructor(
    private tasksService: TasksService,
    private projectsService: ProjectsService,
    public auth: AuthService,
    private http: HttpClient,
  ) {}

  ngOnInit() {
    this.load();
    this.loadMembers();
  }

  load() {
    this.loading.set(true);
    this.tasksService.getOne(this.projectId, this.taskId).subscribe({
      next: (task: any) => {
        this.task.set(task);
        // Initialiser les assignés sélectionnés
        const ids = (task.assignees ?? []).map((a: any) => a.userId);
        if (ids.length === 0 && task.assigneeId) ids.push(task.assigneeId);
        this.selectedAssigneeIds.set(ids);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadMembers() {
    this.projectsService.getMembers(this.projectId).subscribe({
      next: (data: any) => this.projectMembers.set(data.members ?? []),
      error: () => {},
    });
  }

  // ── Statut ────────────────────────────────────────────────────────────────

  canChangeStatus(): boolean {
    const me = this.auth.currentUser()?.id;
    const t = this.task();
    if (!t) return false;
    const isAssigned = t.assigneeId === me ||
      (t as any).assignees?.some((a: any) => a.userId === me);
    // Owner/Admin peuvent toujours changer
    const myRole = this.projectMembers().find((m) => m.userId === me)?.role;
    return isAssigned || ['OWNER', 'ADMIN'].includes(myRole ?? '');
  }

  updateStatus(status: Task['status']) {
    if (!this.canChangeStatus()) return;
    this.tasksService.updateStatus(this.projectId, this.taskId, status).subscribe(() => {
      this.task.update((t) => (t ? { ...t, status } : t));
      this.changed.emit();
    });
  }

  // ── Assignation ───────────────────────────────────────────────────────────

  isAssigned(userId: string): boolean {
    return this.selectedAssigneeIds().includes(userId);
  }

  toggleAssignee(userId: string) {
    this.selectedAssigneeIds.update((ids) =>
      ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId],
    );
  }

  saveAssignees() {
    this.tasksService.update(this.projectId, this.taskId, {
      assigneeIds: this.selectedAssigneeIds(),
    } as any).subscribe({
      next: (updated: any) => {
        this.task.update((t) => t ? { ...t, assigneeId: updated.assigneeId, assignees: updated.assignees } : t);
        this.changed.emit();
      },
      error: () => {},
    });
  }

  // ── Sous-tâches ───────────────────────────────────────────────────────────

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
        t ? { ...t, subtasks: t.subtasks?.map((s) => (s.id === subtaskId ? { ...s, done } : s)) } : t,
      );
      this.changed.emit();
    });
  }

  // ── Commentaires avec pièce jointe ────────────────────────────────────────

  onCommentFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.commentFile = file;
    // Prévisualisation pour les images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => { this.commentFilePreview = e.target?.result as string; };
      reader.readAsDataURL(file);
    } else {
      this.commentFilePreview = null;
    }
  }

  clearCommentFile() {
    this.commentFile = null;
    this.commentFilePreview = null;
  }

  postComment() {
    if (!this.newComment.trim() && !this.commentFile) return;
    this.postingComment.set(true);

    if (this.commentFile) {
      // Upload du fichier d'abord (base64 inline pour la démo — en prod utiliser S3)
      const reader = new FileReader();
      reader.onload = (e) => {
        const fileUrl = e.target?.result as string;
        this.tasksService.addCommentWithFile(
          this.projectId,
          this.taskId,
          this.newComment || this.commentFile!.name,
          fileUrl,
          this.commentFile!.name,
          this.commentFile!.type,
        ).subscribe({
          next: (comment) => {
            this.task.update((t) => (t ? { ...t, comments: [...t.comments, comment] } : t));
            this.newComment = '';
            this.commentFile = null;
            this.commentFilePreview = null;
            this.postingComment.set(false);
            this.changed.emit();
          },
          error: () => this.postingComment.set(false),
        });
      };
      reader.readAsDataURL(this.commentFile);
    } else {
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
  }

  // ── Utilitaires ───────────────────────────────────────────────────────────

  subtaskProgress(t: Task) {
    const total = t.subtasks?.length ?? 0;
    const done = t.subtasks?.filter((s) => s.done).length ?? 0;
    return total ? Math.round((done / total) * 100) : 0;
  }

  isImage(url: string | null | undefined): boolean {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url) || url.startsWith('data:image/');
  }

  isAudio(url: string | null | undefined, type?: string | null): boolean {
    return (type?.startsWith('audio/') ?? false) || /\.(mp3|ogg|wav|m4a|webm)$/i.test(url ?? '');
  }

  isVideo(url: string | null | undefined, type?: string | null): boolean {
    return (type?.startsWith('video/') ?? false) || /\.(mp4|webm|ogv|mov)$/i.test(url ?? '');
  }

  fileIcon(type?: string | null): string {
    if (!type) return 'DOC';
    if (type.startsWith('image/')) return 'IMG';
    if (type.startsWith('audio/')) return 'SON';
    if (type.startsWith('video/')) return 'VID';
    if (type.includes('pdf')) return 'PDF';
    if (type.includes('word')) return 'DOC';
    if (type.includes('sheet')) return 'XLS';
    return 'FIC';
  }

  assigneesLabel(): string {
    const t = this.task() as any;
    const all = t?.assignees ?? [];
    if (all.length === 0 && t?.assignee) return `@${t.assignee.username}`;
    if (all.length === 0) return 'Non assignée';
    if (all.length === 1) return `@${all[0].user?.username ?? ''}`;
    return `${all.length} personnes`;
  }
}
