import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProjectsService } from '../../core/services/projects.service';
import { AuthService } from '../../core/services/auth.service';
import { HttpClient } from '@angular/common/http';
import { Project } from '../../core/models/project.model';
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

  constructor(
    private projectsService: ProjectsService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private http: HttpClient,
  ) {}

  ngOnInit() {
    this.loadProjects();
    this.handleGithubLinkReturn();
  }

  loadProjects() {
    this.loadingProjects.set(true);
    this.projectsService.list().subscribe({
      next: (projects) => { this.projects.set(projects); this.loadingProjects.set(false); },
      error: () => this.loadingProjects.set(false),
    });
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

  private handleGithubLinkReturn() {
    const linkResult = this.route.snapshot.queryParamMap.get('github_link');
    if (!linkResult) return;
    if (linkResult === 'success') {
      this.githubLinkStatus.set('success');
      this.http.post<any>(`${environment.apiUrl}/auth/refresh`, {}).subscribe({
        next: (res) => {
          if (res.user) this.authService.storeFullSession(res);
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
