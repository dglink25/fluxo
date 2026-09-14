import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ProjectsService } from '../../../core/services/projects.service';
import { TasksService } from '../../../core/services/tasks.service';
import { FilesService, ProjectFile } from '../../../core/services/files.service';
import { AnnouncementsService, Announcement } from '../../../core/services/announcements.service';
import { DocumentsService, ProjectDocument } from '../../../core/services/documents.service';
import { MessagingService } from '../../../core/services/messaging.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { AuthService } from '../../../core/services/auth.service';
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
import { SecretsComponent } from '../components/secrets/secrets.component';
import { MembersComponent } from '../components/members/members.component';
import { environment } from '../../../../environments/environment';

type ViewMode =
  | 'kanban' | 'list' | 'activity' | 'members'
  | 'documents' | 'announcements' | 'messaging' | 'secrets' | 'github';

@Component({
  selector: 'flx-project-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    NavbarComponent, BottomNavComponent, IconComponent,
    TaskCardComponent, InviteModalComponent, TaskDetailComponent,
    ActivityFeedComponent, SecretsComponent, MembersComponent,
  ],
  templateUrl: './project-detail.component.html',
  styleUrl: './project-detail.component.scss',
})
export class ProjectDetailComponent implements OnInit {

  // ── État principal ─────────────────────────────────────────────────────────
  project      = signal<Project | null>(null);
  tasks        = signal<Task[]>([]);
  files        = signal<ProjectFile[]>([]);
  documents    = signal<ProjectDocument[]>([]);
  announcements = signal<Announcement[]>([]);
  channels     = signal<Channel[]>([]);
  members      = signal<any[]>([]);
  invitations  = signal<any[]>([]);
  githubCommits = signal<any[]>([]);

  loading    = signal(true);
  view       = signal<ViewMode>('kanban');
  showInvite = signal(false);
  showNewTask = signal(false);
  openTaskId = signal<string | null>(null);
  draggedTask: Task | null = null;
  projectId!: string;

  statuses = TASK_STATUSES;

  // ── Filtres ────────────────────────────────────────────────────────────────
  filterStatus = '';
  filterPriority = '';

  filteredTasks = computed(() =>
    this.tasks().filter((t) => {
      if (this.filterStatus   && t.status   !== this.filterStatus)   return false;
      if (this.filterPriority && t.priority !== this.filterPriority) return false;
      return true;
    }),
  );

  // ── Formulaire tâche enrichi ───────────────────────────────────────────────
  newTaskTitle = '';
  newTaskPriority: Task['priority'] = 'MEDIUM';
  newTaskAssigneeIds: string[] = [];
  newTaskDueDate = '';
  newTaskLabels = '';
  creatingTask = signal(false);

  // ── Formulaire annonce ─────────────────────────────────────────────────────
  newAnnouncementTitle   = '';
  newAnnouncementContent = '';
  newAnnouncementPinned  = false;
  showAnnouncementForm   = signal(false);
  creatingAnnouncement   = signal(false);

  // ── Formulaire document / fichier ──────────────────────────────────────────
  showDocForm     = signal(false);
  docFormType: 'file' | 'text' = 'file';
  docFileSelected = false;
  docFileMime     = '';
  newDocTitle     = '';
  newDocContent   = '';
  creatingDoc     = signal(false);

  // ── Intégration GitHub ────────────────────────────────────────────────────
  githubConnectedRepos = signal<{ id: string; repoFullName: string; createdAt: string }[]>([]);
  connectingGithub   = signal(false);
  githubRepo         = '';
  githubRepos        = signal<{ name: string; fullName: string; private: boolean; description: string | null }[]>([]);
  loadingRepos       = signal(false);
  showRepoSelect     = signal(false);

  /** Vrai si l'utilisateur connecté a un compte GitHub lié */
  get currentUser() { return this.authService.currentUser(); }
  get githubIsLinked(): boolean { return !!this.currentUser?.githubLinked; }
  get isGithubProvider(): boolean { return this.currentUser?.provider === 'GITHUB'; }

  get webhookUrl(): string {
    return `${environment.apiUrl}/projects/${this.projectId}/github/webhook`;
  }

  // ── Injections ────────────────────────────────────────────────────────────
  constructor(
    private route: ActivatedRoute,
    private projectsService: ProjectsService,
    private tasksService: TasksService,
    private filesService: FilesService,
    private announcementsService: AnnouncementsService,
    private documentsService: DocumentsService,
    private messagingService: MessagingService,
    private realtime: RealtimeService,
    private http: HttpClient,
    private authService: AuthService,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit() {
    this.projectId = this.route.snapshot.paramMap.get('id')!;
    this.projectsService.get(this.projectId).subscribe((p) => this.project.set(p));
    this.loadTasks();
    this.loadChannels();
    this.realtime.joinProject(this.projectId);
    // Temps réel
    this.realtime.on<Task>('task:created', (t) => {
      if (!this.tasks().find((x) => x.id === t.id)) this.tasks.update((l) => [...l, t]);
    });
    this.realtime.on<Task>('task:updated', (t) => {
      this.tasks.update((l) => l.map((x) => (x.id === t.id ? { ...x, ...t } : x)));
    });
  }

  // ── Chargements ───────────────────────────────────────────────────────────
  loadTasks() {
    this.loading.set(true);
    this.tasksService.list(this.projectId).subscribe({
      next: (t) => { this.tasks.set(t); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadChannels() {
    this.messagingService.listChannels(this.projectId).subscribe({
      next: (c) => this.channels.set(c), error: () => {},
    });
  }

  loadFiles() {
    this.filesService.list(this.projectId).subscribe({
      next: (f) => this.files.set(f), error: () => {},
    });
  }

  loadDocuments() {
    this.documentsService.list(this.projectId).subscribe({
      next: (d) => this.documents.set(d), error: () => {},
    });
  }

  loadAnnouncements() {
    this.announcementsService.list(this.projectId).subscribe({
      next: (a) => this.announcements.set(a), error: () => {},
    });
  }

  loadMembers() {
    this.projectsService.getMembers(this.projectId).subscribe({
      next: (data: any) => {
        this.members.set(data.members ?? []);
        this.invitations.set(data.invitations ?? []);
      },
      error: () => {},
    });
  }

  loadGithubCommits() {
    this.http.get<any[]>(`${environment.apiUrl}/projects/${this.projectId}/activity`)
      .subscribe({
        next: (activities) => {
          this.githubCommits.set(
            activities.filter((a) => a.type === 'COMMIT_LINKED')
          );
        },
        error: () => {},
      });
    // Charger aussi les repos connectés depuis la BDD
    this.http.get<any[]>(`${environment.apiUrl}/projects/${this.projectId}/github/connected`)
      .subscribe({
        next: (repos) => this.githubConnectedRepos.set(repos),
        error: () => {},
      });
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  setView(v: ViewMode) {
    this.view.set(v);
    if (v === 'documents')     { this.loadFiles(); this.loadDocuments(); }
    if (v === 'announcements') this.loadAnnouncements();
    if (v === 'members')       this.loadMembers();
    if (v === 'github')        this.loadGithubCommits();
  }

  // ── Kanban drag & drop ────────────────────────────────────────────────────
  tasksByStatus(status: TaskStatus) {
    return this.tasks().filter((t) => t.status === status);
  }

  onDragStart(task: Task) { this.draggedTask = task; }

  onDrop(status: TaskStatus) {
    if (!this.draggedTask || this.draggedTask.status === status) return;
    const task = this.draggedTask;
    this.tasks.update((l) => l.map((t) => (t.id === task.id ? { ...t, status } : t)));
    this.tasksService.updateStatus(this.projectId, task.id, status).subscribe();
    this.draggedTask = null;
  }

  // ── Tâches ────────────────────────────────────────────────────────────────
  openNewTaskForm() {
    this.showNewTask.set(true);
    this.loadMembers();
  }

  toggleNewTaskAssignee(userId: string) {
    this.newTaskAssigneeIds = this.newTaskAssigneeIds.includes(userId)
      ? this.newTaskAssigneeIds.filter((id) => id !== userId)
      : [...this.newTaskAssigneeIds, userId];
  }

  createTask() {
    if (!this.newTaskTitle.trim()) return;
    this.creatingTask.set(true);
    const labels = this.newTaskLabels
      ? this.newTaskLabels.split(',').map((l) => l.trim()).filter(Boolean)
      : [];
    this.tasksService.create(this.projectId, {
      title:      this.newTaskTitle,
      priority:   this.newTaskPriority,
      assigneeId: this.newTaskAssigneeIds[0] ?? undefined,
      dueDate:    this.newTaskDueDate || undefined,
      labels,
    }).subscribe({
      next: (task) => {
        this.tasks.update((l) => [...l, task]);
        this.newTaskTitle = ''; this.newTaskPriority = 'MEDIUM';
        this.newTaskAssigneeIds = []; this.newTaskDueDate = ''; this.newTaskLabels = '';
        this.showNewTask.set(false); this.creatingTask.set(false);
      },
      error: () => this.creatingTask.set(false),
    });
  }

  onTaskDetailChanged() { this.loadTasks(); }

  // ── Annonces ──────────────────────────────────────────────────────────────
  createAnnouncement() {
    if (!this.newAnnouncementTitle.trim()) return;
    this.creatingAnnouncement.set(true);
    this.announcementsService.create(this.projectId, {
      title:   this.newAnnouncementTitle,
      content: this.newAnnouncementContent,
      pinned:  this.newAnnouncementPinned,
    }).subscribe({
      next: (a) => {
        this.announcements.update((l) => [a, ...l]);
        this.newAnnouncementTitle = ''; this.newAnnouncementContent = '';
        this.newAnnouncementPinned = false;
        this.showAnnouncementForm.set(false); this.creatingAnnouncement.set(false);
      },
      error: () => this.creatingAnnouncement.set(false),
    });
  }

  // ── Documents / Fichiers ──────────────────────────────────────────────────
  onDocFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    this.newDocTitle    = file.name;
    this.docFileMime    = file.type;
    this.docFileSelected = true;
    const reader = new FileReader();
    reader.onload = (e) => { this.newDocContent = (e.target?.result as string) ?? ''; };
    if (file.type.startsWith('text') || file.name.match(/\.(json|md|csv|xml|yaml|yml)$/i)) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);   // base64 pour les binaires
    }
  }

  createDocument() {
    if (!this.newDocTitle.trim()) return;
    this.creatingDoc.set(true);
    this.documentsService.create(this.projectId, {
      title:   this.newDocTitle,
      content: this.newDocContent,
    }).subscribe({
      next: (doc) => {
        this.documents.update((l) => [doc, ...l]);
        this.newDocTitle = ''; this.newDocContent = ''; this.docFileSelected = false;
        this.showDocForm.set(false); this.creatingDoc.set(false);
      },
      error: () => this.creatingDoc.set(false),
    });
  }

  // ── GitHub ────────────────────────────────────────────────────────────────

  /** Charge les repos disponibles (token stocké côté backend) */
  loadGithubRepos() {
    this.loadingRepos.set(true);
    this.http
      .get<any[]>(`${environment.apiUrl}/projects/${this.projectId}/github/repos`)
      .subscribe({
        next: (repos) => {
          this.githubRepos.set(repos);
          this.showRepoSelect.set(true);
          this.loadingRepos.set(false);
        },
        error: (err) => {
          this.loadingRepos.set(false);
          this.showRepoSelect.set(false);
          alert('Impossible de charger les depots : ' + (err?.error?.message ?? 'Erreur'));
        },
      });
  }

  selectRepo(fullName: string) {
    this.githubRepo = fullName;
    this.showRepoSelect.set(false);
  }

  connectGithub() {
    if (!this.githubRepo.trim()) return;
    this.connectingGithub.set(true);
    this.http
      .post<any>(`${environment.apiUrl}/projects/${this.projectId}/github/connect`, {
        repoFullName: this.githubRepo,
      })
      .subscribe({
        next: (repo) => {
          // Persiste dans la liste des repos connectés
          this.githubConnectedRepos.update((list) => {
            const exists = list.find((r) => r.repoFullName === repo.repoFullName);
            return exists ? list : [...list, repo];
          });
          this.githubRepo = '';
          this.showRepoSelect.set(false);
          this.connectingGithub.set(false);
          this.loadGithubCommits();
        },
        error: () => this.connectingGithub.set(false),
      });
  }

  disconnectRepo(repoFullName: string) {
    if (!confirm(`Déconnecter ${repoFullName} du projet ?`)) return;
    this.http
      .delete(`${environment.apiUrl}/projects/${this.projectId}/github/disconnect?repo=${encodeURIComponent(repoFullName)}`)
      .subscribe({
        next: () => this.githubConnectedRepos.update((l) => l.filter((r) => r.repoFullName !== repoFullName)),
        error: () => {},
      });
  }

  /** Redirige vers le flux OAuth GitHub pour lier son compte */
  linkGithubAccount() {
    const token = this.authService.getAccessToken();
    if (!token) return;
    window.location.href = `${environment.apiUrl}/auth/github/link/init?token=${encodeURIComponent(token)}`;
  }

  isRepoConnected(fullName: string): boolean {
    return this.githubConnectedRepos().some((r) => r.repoFullName === fullName);
  }

  copyWebhookUrl() {
    navigator.clipboard.writeText(this.webhookUrl).catch(() => {});
  }

  // ── Modifier / Supprimer projet ───────────────────────────────────────────
  showEditProject = signal(false);
  editProjectName = '';
  editProjectDescription = '';
  editProjectVisibility: 'PRIVATE' | 'PUBLIC' = 'PRIVATE';
  savingProject = signal(false);
  deletingProject = signal(false);

  openEditProject() {
    const p = this.project();
    if (!p) return;
    this.editProjectName = p.name;
    this.editProjectDescription = p.description ?? '';
    this.editProjectVisibility = p.visibility as 'PRIVATE' | 'PUBLIC';
    this.showEditProject.set(true);
  }

  saveProject() {
    if (!this.editProjectName.trim()) return;
    this.savingProject.set(true);
    this.projectsService.update(this.projectId, {
      name: this.editProjectName,
      description: this.editProjectDescription,
      visibility: this.editProjectVisibility,
    }).subscribe({
      next: (updated) => {
        this.project.update((p) => p ? { ...p, ...updated } : p);
        this.showEditProject.set(false);
        this.savingProject.set(false);
      },
      error: () => this.savingProject.set(false),
    });
  }

  deleteProject() {
    if (!confirm(`Supprimer définitivement le projet "${this.project()?.name}" ? Cette action est irréversible.`)) return;
    this.deletingProject.set(true);
    this.projectsService.delete(this.projectId).subscribe({
      next: () => { import('@angular/router').then(m => { /* navigate to dashboard */ }); window.location.href = '/dashboard'; },
      error: () => this.deletingProject.set(false),
    });
  }

  // ── Utilitaires ───────────────────────────────────────────────────────────
  fileEmoji(mimeType: string): string {
    if (!mimeType)                                            return 'FIC';
    if (mimeType.startsWith('image/'))                       return 'IMG';
    if (mimeType.startsWith('video/'))                       return 'VID';
    if (mimeType.startsWith('audio/'))                       return 'SON';
    if (mimeType.includes('pdf'))                            return 'PDF';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'DOC';
    if (mimeType.includes('sheet') || mimeType.includes('excel'))   return 'XLS';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'PPT';
    if (mimeType.includes('zip') || mimeType.includes('archive'))  return 'ZIP';
    if (mimeType.includes('json') || mimeType.includes('xml'))     return 'CFG';
    return 'FIC';
  }

  formatFileSize(bytes: number): string {
    if (!bytes || bytes < 1024)        return `${bytes ?? 0} o`;
    if (bytes < 1024 * 1024)           return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  }

  /** Télécharge un document texte comme fichier .md */
  downloadTextDoc(doc: any) {
    const content = doc.details.content ?? '';
    const title = doc.details.title ?? 'document';
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
