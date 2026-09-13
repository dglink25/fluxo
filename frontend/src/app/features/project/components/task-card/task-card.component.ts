import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Task } from '../../../../core/models/task.model';

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
        @if (task.labels?.length) {
          <div class="labels">
            @for (label of task.labels; track label) {
              <span class="label">{{ label }}</span>
            }
          </div>
        }
        @if (task.assignee) {
          <span class="assignee flx-mono" [title]="task.assignee.username">
            &#64;{{ task.assignee.username }}
          </span>
        }
      </footer>
    </article>
  `,
  styles: [`
    .task {
      padding: 14px;
      margin-bottom: 10px;
      cursor: pointer;
      border-left: 3px solid var(--flx-border);
    }
    .task.priority-urgent { border-left-color: #dc2626; }
    .task.priority-high { border-left-color: #d97706; }
    .task.priority-medium { border-left-color: #2563eb; }
    .task.priority-low { border-left-color: var(--flx-text-faint); }
    header { display: flex; justify-content: space-between; margin-bottom: 6px; }
    .id, .priority { font-size: 11px; color: var(--flx-text-faint); }
    h4 { font-size: 14px; font-weight: 600; margin: 0 0 8px; }
    .subtasks { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .bar { flex: 1; height: 4px; border-radius: 2px; background: var(--flx-bg-sunken); overflow: hidden; }
    .fill { height: 100%; background: var(--flx-accent); }
    .subtasks span { font-size: 11px; color: var(--flx-text-faint); }
    footer { display: flex; justify-content: space-between; align-items: center; }
    .labels { display: flex; gap: 6px; flex-wrap: wrap; }
    .label { font-size: 10px; padding: 2px 7px; border-radius: 999px; background: var(--flx-bg-sunken); color: var(--flx-text-muted); }
    .assignee { font-size: 11px; color: var(--flx-text-muted); }
  `],
})
export class TaskCardComponent {
  @Input({ required: true }) task!: Task;
  @Output() dragStart = new EventEmitter<Task>();
  @Output() open = new EventEmitter<Task>();

  priorityLabel: Record<string, string> = { LOW: 'basse', MEDIUM: 'moyenne', HIGH: 'haute', URGENT: 'urgente' };

  doneCount() {
    return this.task.subtasks?.filter((s) => s.done).length ?? 0;
  }
  subtaskProgress() {
    const total = this.task.subtasks?.length ?? 0;
    return total ? (this.doneCount() / total) * 100 : 0;
  }
}
