import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProjectsService } from '../../../core/services/projects.service';
import { TasksService } from '../../../core/services/tasks.service';
import { FilesService, ProjectFile } from '../../../core/services/files.service';
import { DeliverablesService, Deliverable } from '../../../core/services/deliverables.service';
import { AnnouncementsService, Announcement } from '../../../core/services/announcements.service';
import { DocumentsService, ProjectDocument } from '../../../core/services/documents.service';
import { MessagingService } from '../../../core/services/messaging.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { Project } from '../../../core/models/project.model';
import { Task, TaskStatus, TASK_STATUSES } from '../../../core/models/task.model';
import { Channel } from '../../../core/models/message.model';
import { NavbarComponent } from '../../../shared/components/navbar/navbar.component';
import { BottomNavComponent } from '../../../shared/components/bottom-nav/bottom-nav.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { TaskCardComponent } from '../components/task-card/task-card.component';
import { InviteModalComponent } from '../components/invite-modal/invite-modal.component';
import { TaskDetailComponent } from '../components/task-detail/task-detail.component';
import { ActivityFeedComponent } from '../components/activity-feed/activity-feed.component';

type ViewMode = 'kanban' | 'list' | 'activity' | 'files' | 'deliverables' | 'documents' | 'announcements' | 'messaging';

@Component({
  selector: 'flx-project-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    NavbarComponent,
    BottomNavComponent,
    IconComponent,
    TaskCardComponent,
    InviteModalComponent,
    TaskDetailComponent,
    ActivityFeedComponent,
  ],
  templateUrl: './project-detail.component.html',
  styleUrl: './project-detail.component.scss',
})
export class ProjectDetailComponent implements OnInit {
  project = signal<Project | null>(null);
  tasks = signal<Task[]>([]);
  files = signal<ProjectFile[]>([]);
  deliverables = signal<Deliverable[]>([]);
  announcements = signal<Announcement[]>([]);
  documents = signal<ProjectDocument[]>([]);
  channels = signal<Channel[]>([]);

  loading = signal(true);
  view = signal<ViewMode>('kanban');
  showInvite = signal(false);
  showNewTask = signal(false);
  openTaskId = signal<string | null>(null);
  draggedTask: Task | null = null;

  statuses = TASK_STATUSES;

  // Filtres liste
  filterStatus = '';
  filterPriority = '';

  // Formulaires
  newTaskTitle = '';
  newTaskPriority: Task['priority'] = 'MEDIUM';
  creatingTask = signal(false);

  newAnnouncementTitle = '';
  newAnnouncementContent = '';
  newAnnouncementPinned = false;
  creatingAnnouncement = signal(false);
  showAnnouncementForm = signal(false);

  newDocTitle = '';
  newDocContent = '';
  creatingDoc = signal(false);
  showDocForm = signal(false);

  projectId!: string;

  filteredTasks = computed(() =>
    this.tasks().filter((t) => {
      if (this.filterStatus && t.status !== this.filterStatus) return false;
      if (this.filterPriority && t.priority !== this.filterPriority) return false;
      return true;
    }),
  );

  constructor(
    private route: ActivatedRoute,
    private projectsService: ProjectsService,
    private tasksService: TasksService,
    private filesService: FilesService,
    private deliverablesService: DeliverablesService,
    private announcementsService: AnnouncementsService,
    private documentsService: DocumentsService,
    private messagingService: MessagingService,
    private realtime: RealtimeService,
  ) {}

  ngOnInit() {
    this.projectId = this.route.snapshot.paramMap.get('id')!;
    this.projectsService.get(this.projectId).subscribe((p) => this.project.set(p));
    this.loadTasks();
    this.loadChannels();

    // Rejoindre la salle WebSocket du projet
    this.realtime.joinProject(this.projectId);

    // Écouter les événements temps réel
    this.realtime.on<Task>('task:created', (task) => {
      this.tasks.update((list) => {
        if (list.find((t) => t.id === task.id)) return list;
        return [...list, task];
      });
    });
    this.realtime.on<Task>('task:updated', (task) => {
      this.tasks.update((list) => list.map((t) => (t.id === task.id ? { ...t, ...task } : t)));
    });
  }

  loadTasks() {
    this.loading.set(true);
    this.tasksService.list(this.projectId).subscribe({
      next: (tasks) => { this.tasks.set(tasks); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadChannels() {
    this.messagingService.listChannels(this.projectId).subscribe({
      next: (channels) => this.channels.set(channels),
      error: () => {},
    });
  }

  loadFiles() {
    this.filesService.list(this.projectId).subscribe({
      next: (files) => this.files.set(files),
      error: () => {},
    });
  }

  loadAnnouncements() {
    this.announcementsService.list(this.projectId).subscribe({
      next: (items) => this.announcements.set(items),
      error: () => {},
    });
  }

  loadDocuments() {
    this.documentsService.list(this.projectId).subscribe({
      next: (docs) => this.documents.set(docs),
      error: () => {},
    });
  }

  setView(v: ViewMode) {
    this.view.set(v);
    if (v === 'files') this.loadFiles();
    if (v === 'announcements') this.loadAnnouncements();
    if (v === 'documents') this.loadDocuments();
  }

  tasksByStatus(status: TaskStatus) {
    return this.tasks().filter((t) => t.status === status);
  }

  onDragStart(task: Task) { this.draggedTask = task; }

  onDrop(status: TaskStatus) {
    if (!this.draggedTask || this.draggedTask.status === status) return;
    const task = this.draggedTask;
    this.tasks.update((list) => list.map((t) => (t.id === task.id ? { ...t, status } : t)));
    this.tasksService.updateStatus(this.projectId, task.id, status).subscribe();
    this.draggedTask = null;
  }

  createTask() {
    if (!this.newTaskTitle.trim()) return;
    this.creatingTask.set(true);
    this.tasksService
      .create(this.projectId, { title: this.newTaskTitle, priority: this.newTaskPriority })
      .subscribe({
        next: (task) => {
          this.tasks.update((list) => [...list, task]);
          this.newTaskTitle = '';
          this.showNewTask.set(false);
          this.creatingTask.set(false);
        },
        error: () => this.creatingTask.set(false),
      });
  }

  createAnnouncement() {
    if (!this.newAnnouncementTitle.trim()) return;
    this.creatingAnnouncement.set(true);
    this.announcementsService
      .create(this.projectId, {
        title: this.newAnnouncementTitle,
        content: this.newAnnouncementContent,
        pinned: this.newAnnouncementPinned,
      })
      .subscribe({
        next: (a) => {
          this.announcements.update((list) => [a, ...list]);
          this.newAnnouncementTitle = '';
          this.newAnnouncementContent = '';
          this.newAnnouncementPinned = false;
          this.showAnnouncementForm.set(false);
          this.creatingAnnouncement.set(false);
        },
        error: () => this.creatingAnnouncement.set(false),
      });
  }

  createDocument() {
    if (!this.newDocTitle.trim()) return;
    this.creatingDoc.set(true);
    this.documentsService
      .create(this.projectId, { title: this.newDocTitle, content: this.newDocContent })
      .subscribe({
        next: (doc) => {
          this.documents.update((list) => [doc, ...list]);
          this.newDocTitle = '';
          this.newDocContent = '';
          this.showDocForm.set(false);
          this.creatingDoc.set(false);
        },
        error: () => this.creatingDoc.set(false),
      });
  }

  onTaskDetailChanged() {
    this.loadTasks();
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  }
}
