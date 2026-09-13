import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { WorkspacesService } from '../../../core/services/workspaces.service';
import { ProjectsService } from '../../../core/services/projects.service';
import { Workspace } from '../../../core/models/workspace.model';
import { Project } from '../../../core/models/project.model';
import { NavbarComponent } from '../../../shared/components/navbar/navbar.component';
import { BottomNavComponent } from '../../../shared/components/bottom-nav/bottom-nav.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'flx-project-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NavbarComponent, BottomNavComponent, IconComponent],
  templateUrl: './project-list.component.html',
  styleUrl: './project-list.component.scss',
})
export class ProjectListComponent implements OnInit {
  workspace = signal<Workspace | null>(null);
  projects = signal<Project[]>([]);
  loading = signal(true);
  showCreateForm = signal(false);

  newName = '';
  newDescription = '';
  newVisibility: 'PRIVATE' | 'PUBLIC' = 'PRIVATE';
  creating = signal(false);

  workspaceId!: string;

  constructor(
    private route: ActivatedRoute,
    private workspacesService: WorkspacesService,
    private projectsService: ProjectsService,
  ) {}

  ngOnInit() {
    this.workspaceId = this.route.snapshot.paramMap.get('workspaceId')!;
    this.workspacesService.get(this.workspaceId).subscribe((w) => this.workspace.set(w));
    this.loadProjects();
  }

  loadProjects() {
    this.loading.set(true);
    this.workspacesService.getProjects(this.workspaceId).subscribe({
      next: (projects) => {
        this.projects.set(projects);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  createProject() {
    if (!this.newName.trim()) return;
    this.creating.set(true);
    this.projectsService
      .create({
        name: this.newName,
        description: this.newDescription,
        visibility: this.newVisibility,
      })
      .subscribe({
        next: (project) => {
          this.projects.update((list) => [project, ...list]);
          this.newName = '';
          this.newDescription = '';
          this.showCreateForm.set(false);
          this.creating.set(false);
        },
        error: () => this.creating.set(false),
      });
  }
}
