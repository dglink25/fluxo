import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProjectsService } from '../../core/services/projects.service';
import { TasksService } from '../../core/services/tasks.service';
import { AuthService } from '../../core/services/auth.service';
import { HttpClient } from '@angular/common/http';
import { Project } from '../../core/models/project.model';
import { Task } from '../../core/models/task.model';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'flx-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NavbarComponent, BottomNavComponent, IconComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  githubLinkStatus = signal<'success' | 'error' | null>(null);

  projects        = signal<Project[]>([]);
  loadingProjects = signal(true);
  showCreateProject = signal(false);
  newName        = '';
  newDescription = '';
  newVisibility: 'PRIVATE' | 'PUBLIC' = 'PRIVATE';
  creating       = signal(false);

  // Tâches à échéance (toutes les tâches assignées à l'utilisateur, triées par dueDate)
  dueSoonTasks  = signal<(Task & { projectName?: string })[]>([]);
  loadingDue    = signal(false);

  constructor(
    private projectsService: ProjectsService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private http: HttpClient,
  ) {}

  ngOnInit() {
    this.loadProjects();
    this.loadDueTasks();
    this.handleGithubLinkReturn();
    this.repairMemberships(); // répare silencieusement les membres manquants
  }

  loadProjects() {
    this.loadingProjects.set(true);
    this.projectsService.list().subscribe({
      next: (projects) => { this.projects.set(projects); this.loadingProjects.set(false); },
      error: () => this.loadingProjects.set(false),
    });
  }

  /** Charge les tâches assignées à l'utilisateur avec une date d'échéance */
  loadDueTasks() {
    const me = this.authService.currentUser()?.id;
    if (!me) return;
    this.loadingDue.set(true);
    this.http.get<any[]>(`${environment.apiUrl}/tasks/mine`).subscribe({
      next: (tasks) => {
        // Trier par échéance croissante, exclure les DONE
        const sorted = tasks
          .filter((t) => t.dueDate && t.status !== 'DONE')
          .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        this.dueSoonTasks.set(sorted);
        this.loadingDue.set(false);
      },
      error: () => this.loadingDue.set(false),
    });
  }

  /** Indicateur d'urgence pour une tâche */
  dueLevel(task: Task): 'overdue' | 'today' | 'soon' | 'normal' {
    if (!task.dueDate) return 'normal';
    const now  = new Date();
    const due  = new Date(task.dueDate);
    const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diff < 0)  return 'overdue';
    if (diff < 1)  return 'today';
    if (diff <= 3) return 'soon';
    return 'normal';
  }

  createProject() {
    if (!this.newName.trim()) return;
    this.creating.set(true);
    this.projectsService
      .create({ name: this.newName, description: this.newDescription, visibility: this.newVisibility })
      .subscribe({
        next: (project) => {
          this.projects.update((list) => [project, ...list]);
          this.newName = ''; this.newDescription = ''; this.newVisibility = 'PRIVATE';
          this.showCreateProject.set(false); this.creating.set(false);
        },
        error: () => this.creating.set(false),
      });
  }

  /** Répare silencieusement les membres manquants (invitations acceptées) */
  private repairMemberships() {
    this.http.post(`${environment.apiUrl}/invitations/repair`, {}).subscribe({ error: () => {} });
  }

  private handleGithubLinkReturn() {
    const linkResult = this.route.snapshot.queryParamMap.get('github_link');
    if (!linkResult) return;
    if (linkResult === 'success') {
      this.githubLinkStatus.set('success');
      // Rafraîchir le profil via /users/me
      this.http.get<any>(`${environment.apiUrl}/users/me`).subscribe({
        next: (user) => {
          const current = this.authService.currentUser();
          if (current && user) {
            this.authService.currentUser.set({
              ...current,
              githubLinked: true,
              githubUsername: user.githubUsername ?? null,
            });
            localStorage.setItem('fluxo-user', JSON.stringify(this.authService.currentUser()));
          }
          setTimeout(() => this.githubLinkStatus.set(null), 4000);
        },
        error: () => setTimeout(() => this.githubLinkStatus.set(null), 4000),
      });
    } else {
      this.githubLinkStatus.set('error');
      setTimeout(() => this.githubLinkStatus.set(null), 5000);
    }
  }
}
