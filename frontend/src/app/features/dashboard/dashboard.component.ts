import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { WorkspacesService } from '../../core/services/workspaces.service';
import { ProjectsService } from '../../core/services/projects.service';
import { Workspace } from '../../core/models/workspace.model';
import { Project } from '../../core/models/project.model';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component';
import { IconComponent } from '../../shared/components/icon/icon.component';

type ActiveTab = 'workspaces' | 'projects';

@Component({
  selector: 'flx-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NavbarComponent, BottomNavComponent, IconComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  activeTab = signal<ActiveTab>('workspaces');

  // Workspaces
  workspaces = signal<Workspace[]>([]);
  loadingWorkspaces = signal(true);
  showCreateWorkspace = signal(false);
  newWsName = '';
  newWsDescription = '';
  creatingWs = signal(false);

  // Projets (tous projets de l'utilisateur, sans workspace)
  projects = signal<Project[]>([]);
  loadingProjects = signal(true);
  showCreateProject = signal(false);
  newName = '';
  newDescription = '';
  newVisibility: 'PRIVATE' | 'PUBLIC' = 'PRIVATE';
  creating = signal(false);

  constructor(
    private workspacesService: WorkspacesService,
    private projectsService: ProjectsService,
  ) {}

  ngOnInit() {
    this.loadWorkspaces();
    this.loadProjects();
  }

  loadWorkspaces() {
    this.loadingWorkspaces.set(true);
    this.workspacesService.list().subscribe({
      next: (ws) => { this.workspaces.set(ws); this.loadingWorkspaces.set(false); },
      error: () => this.loadingWorkspaces.set(false),
    });
  }

  loadProjects() {
    this.loadingProjects.set(true);
    this.projectsService.list().subscribe({
      next: (projects) => { this.projects.set(projects); this.loadingProjects.set(false); },
      error: () => this.loadingProjects.set(false),
    });
  }

  createWorkspace() {
    if (!this.newWsName.trim()) return;
    this.creatingWs.set(true);
    this.workspacesService.create({ name: this.newWsName, description: this.newWsDescription }).subscribe({
      next: (ws) => {
        this.workspaces.update((list) => [ws, ...list]);
        this.newWsName = '';
        this.newWsDescription = '';
        this.showCreateWorkspace.set(false);
        this.creatingWs.set(false);
      },
      error: () => this.creatingWs.set(false),
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
          this.newName = '';
          this.newDescription = '';
          this.showCreateProject.set(false);
          this.creating.set(false);
        },
        error: () => this.creating.set(false),
      });
  }
}
