import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Task, TaskAssignee } from '../../../../core/models/task.model';

@Component({
  selector: 'flx-task-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article
      class="flx-card task"
      draggable="true"
      (dragstart)="dragStart.emit(task)"
      (click)="open.emit(task)"
      [class]="'priority-' + task.priority.toLowerCase()"
    >
      <header>
        <span class="id flx-mono">#{{ task.id.slice(0, 6) }}</span>
        <span class="priority flx-mono">{{ priorityLabel[task.priority] }}</span>
      </header>
      <h4>{{ task.title }}</h4>
      @if (task.subtasks && task.subtasks.length) {
        <div class="subtasks">
          <div class="bar"><div class="fill" [style.width.%]="subtaskProgress()"></div></div>
          <span class="flx-mono">{{ doneCount() }}/{{ task.subtasks.length }}</span>
        </div>
      }
      <footer>
        @if (task.labels.length) {
          <div class="labels">
            @for (label of task.labels; track label) {
              <span class="label">{{ label }}</span>
            }
          </div>
        }
        <!-- Assignés (multiples ou unique) -->
        <div class="assignees">
          @for (a of visibleAssignees(); track a.userId) {
            <div class="assignee-chip" [title]="'@'+a.user.username">
              @if (a.user.avatarUrl) {
                <img [src]="a.user.avatarUrl" [alt]="a.user.username" />
              } @else {
                <span>{{ initial(a.user.username) }}</span>
              }
            </div>
          }
          @if (extraCount() > 0) {
            <div class="assignee-chip extra">+{{ extraCount() }}</div>
          }
          @if (visibleAssignees().length === 0 && task.assignee) {
            <span class="assignee flx-mono">&#64;{{ task.assignee.username }}</span>
          }
        </div>
      </footer>
    </article>
  `,
  styles: [`
    .task {
      padding: 14px;
      margin-bottom: 10px;
      cursor: pointer;
      border-left: 3px solid var(--flx-border);
      transition: box-shadow 0.12s, border-color 0.12s;
    }
    .task:hover { box-shadow: var(--flx-shadow-2); }
    .task.priority-urgent { border-left-color: #dc2626; }
    .task.priority-high   { border-left-color: #d97706; }
    .task.priority-medium { border-left-color: #2563eb; }
    .task.priority-low    { border-left-color: var(--flx-text-faint); }

    header { display: flex; justify-content: space-between; margin-bottom: 6px; }
    .id, .priority { font-size: 11px; color: var(--flx-text-faint); }
    h4 { font-size: 14px; font-weight: 600; margin: 0 0 8px; word-break: break-word; }

    .subtasks { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .bar { flex: 1; height: 4px; border-radius: 2px; background: var(--flx-bg-sunken); overflow: hidden; }
    .fill { height: 100%; background: var(--flx-accent); }
    .subtasks span { font-size: 11px; color: var(--flx-text-faint); }

    footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .labels { display: flex; gap: 4px; flex-wrap: wrap; flex: 1; min-width: 0; }
    .label {
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 999px;
      background: var(--flx-bg-sunken);
      color: var(--flx-text-muted);
      white-space: nowrap;
    }

    /* Assignés */
    .assignees { display: flex; align-items: center; flex-shrink: 0; }
    .assignee-chip {
      width: 22px; height: 22px;
      border-radius: 50%;
      background: var(--flx-accent-soft);
      color: var(--flx-accent);
      border: 2px solid var(--flx-bg-raised);
      overflow: hidden;
      display: grid; place-items: center;
      font-size: 9px; font-weight: 800;
      margin-left: -4px;
    }
    .assignees .assignee-chip:first-child { margin-left: 0; }
    .assignee-chip img { width: 100%; height: 100%; object-fit: cover; }
    .assignee-chip.extra { background: var(--flx-bg-sunken); color: var(--flx-text-faint); }
    .assignee { font-size: 11px; color: var(--flx-text-muted); }
  `],
})
export class TaskCardComponent {
  @Input({ required: true }) task!: Task;
  @Output() dragStart = new EventEmitter<Task>();
  @Output() open = new EventEmitter<Task>();

  priorityLabel: Record<string, string> = {
    LOW: 'basse', MEDIUM: 'moyenne', HIGH: 'haute', URGENT: 'urgente',
  };

  doneCount() {
    return this.task.subtasks?.filter((s) => s.done).length ?? 0;
  }

  subtaskProgress() {
    const total = this.task.subtasks?.length ?? 0;
    return total ? (this.doneCount() / total) * 100 : 0;
  }

  visibleAssignees(): TaskAssignee[] {
    return (this.task.assignees ?? []).slice(0, 3);
  }

  extraCount(): number {
    return Math.max(0, (this.task.assignees?.length ?? 0) - 3);
  }

  initial(username?: string | null): string {
    return username ? username.slice(0, 1).toUpperCase() : '?';
  }
}
