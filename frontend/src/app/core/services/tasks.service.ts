import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Task, TaskStatus } from '../models/task.model';
import { TaskComment } from '../models/comment.model';

@Injectable({ providedIn: 'root' })
export class TasksService {
  constructor(private http: HttpClient) {}

  private base(projectId: string) {
    return `${environment.apiUrl}/projects/${projectId}/tasks`;
  }

  list(projectId: string, filters: { status?: string; assigneeId?: string; priority?: string } = {}) {
    let params = new HttpParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params = params.set(k, v); });
    return this.http.get<Task[]>(this.base(projectId), { params });
  }

  getOne(projectId: string, taskId: string) {
    return this.http.get<Task & { comments: TaskComment[] }>(`${this.base(projectId)}/${taskId}`);
  }

  create(projectId: string, payload: Partial<Task>) {
    return this.http.post<Task>(this.base(projectId), payload);
  }

  updateStatus(projectId: string, taskId: string, status: TaskStatus) {
    return this.http.patch<Task>(`${this.base(projectId)}/${taskId}`, { status });
  }

  update(projectId: string, taskId: string, payload: Partial<Task>) {
    return this.http.patch<Task>(`${this.base(projectId)}/${taskId}`, payload);
  }

  remove(projectId: string, taskId: string) {
    return this.http.delete(`${this.base(projectId)}/${taskId}`);
  }

  addSubtask(projectId: string, taskId: string, title: string) {
    return this.http.post<{ id: string; title: string; done: boolean }>(
      `${this.base(projectId)}/${taskId}/subtasks`,
      { title },
    );
  }

  toggleSubtask(projectId: string, taskId: string, subtaskId: string, done: boolean) {
    return this.http.patch(`${this.base(projectId)}/${taskId}/subtasks/${subtaskId}`, { done });
  }

  addComment(projectId: string, taskId: string, content: string) {
    return this.http.post<TaskComment>(`${this.base(projectId)}/${taskId}/comments`, { content });
  }

  addCommentWithFile(
    projectId: string,
    taskId: string,
    content: string,
    fileUrl: string,
    fileName: string,
    fileType: string,
  ) {
    return this.http.post<TaskComment>(`${this.base(projectId)}/${taskId}/comments`, {
      content,
      fileUrl,
      fileName,
      fileType,
    });
  }
}

