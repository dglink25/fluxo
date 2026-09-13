import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ProjectsService } from '../../../core/services/projects.service';
import { TasksService } from '../../../core/services/tasks.service';
import { Project } from '../../../core/models/project.model';
import { Task, TaskStatus, TASK_STATUSES } from '../../../core/models/task.model';
import { NavbarComponent } from '../../../shared/components/navbar/navbar.component';
import { BottomNavComponent } from '../../../shared/components/bottom-nav/bottom-nav.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { TaskCardComponent } from '../components/task-card/task-card.component';
import { InviteModalComponent } from '../components/invite-modal/invite-modal.component';
import { TaskDetailComponent } from '../components/task-detail/task-detail.component';
import { ActivityFeedComponent } from '../components/activity-feed/activity-feed.component';

type ViewMode = 'kanban' | 'list' | 'activity';

@Component({
  selector: 'flx-project-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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
  loading = signal(true);
  view = signal<ViewMode>('kanban');
  showInvite = signal(false);
  showNewTask = signal(false);
  openTaskId = signal<string | null>(null);
  draggedTask: Task | null = null;

  statuses = TASK_STATUSES;

  // Filtres (vue Liste)
  filterStatus = '';
  filterPriority = '';

  newTaskTitle = '';
  newTaskPriority: Task['priority'] = 'MEDIUM';
  creatingTask = signal(false);

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
  ) {}

  ngOnInit() {
    this.projectId = this.route.snapshot.paramMap.get('id')!;
    this.projectsService.get(this.projectId).subscribe((p) => this.project.set(p));
    this.loadTasks();
  }

  loadTasks() {
    this.loading.set(true);
    this.tasksService.list(this.projectId).subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  tasksByStatus(status: TaskStatus) {
    return this.tasks().filter((t) => t.status === status);
  }

  onDragStart(task: Task) {
    this.draggedTask = task;
  }

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

  onTaskDetailChanged() {
    // Une modification (statut, sous-tâche...) dans le détail peut affecter la liste/kanban
    this.loadTasks();
  }
}
