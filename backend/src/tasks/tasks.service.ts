import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
  ) {}

  async findAllForProject(
    projectId: string,
    filters: { status?: string; assigneeId?: string; priority?: string },
  ) {
    return this.prisma.task.findMany({
      where: {
        projectId,
        ...(filters.status ? { status: filters.status as any } : {}),
        ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
        ...(filters.priority ? { priority: filters.priority as any } : {}),
      },
      include: {
        assignee: { select: { id: true, username: true, avatarUrl: true } },
        subtasks: true,
        _count: { select: { comments: true } },
      },
      orderBy: [{ status: 'asc' }, { position: 'asc' }],
    });
  }

  async findOne(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: { select: { id: true, username: true, avatarUrl: true } },
        subtasks: true,
        comments: {
          include: { user: { select: { id: true, username: true, avatarUrl: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!task) throw new NotFoundException('Tâche introuvable');
    return task;
  }

  async create(projectId: string, userId: string, dto: CreateTaskDto) {
    const task = await this.prisma.task.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? 'MEDIUM',
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        labels: dto.labels ?? [],
      },
      include: {
        assignee: { select: { id: true, username: true, avatarUrl: true } },
        subtasks: true,
        _count: { select: { comments: true } },
      },
    });

    await this.prisma.activity.create({
      data: {
        projectId,
        userId,
        type: 'TASK_CREATED',
        targetId: task.id,
        details: { title: task.title },
      },
    });

    // Diffuser l'événement en temps réel aux membres du projet
    this.realtime.emitToProject(projectId, 'task:created', task);

    // Notifier l'assigné si différent du créateur
    if (task.assigneeId && task.assigneeId !== userId) {
      await this.prisma.notification.create({
        data: {
          userId: task.assigneeId,
          type: 'TASK_ASSIGNED',
          content: `Vous avez été assigné à la tâche « ${task.title} »`,
        },
      });
      this.realtime.emitToUser(task.assigneeId, 'notification:new', {
        type: 'TASK_ASSIGNED',
        content: `Vous avez été assigné à la tâche « ${task.title} »`,
      });
    }

    return task;
  }

  async update(projectId: string, userId: string, taskId: string, dto: UpdateTaskDto) {
    // Construire l'objet data de façon explicite pour éviter de passer
    // des champs non-Prisma ou de mauvais types
    const data: Record<string, unknown> = {};
    if (dto.title !== undefined)       data['title']      = dto.title;
    if (dto.description !== undefined) data['description'] = dto.description;
    if (dto.status !== undefined)      data['status']     = dto.status;
    if (dto.priority !== undefined)    data['priority']   = dto.priority;
    if (dto.assigneeId !== undefined)  data['assigneeId'] = dto.assigneeId;
    if (dto.dueDate !== undefined)     data['dueDate']    = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.labels !== undefined)      data['labels']     = dto.labels;

    const task = await this.prisma.task.update({
      where: { id: taskId },
      data,
      include: {
        assignee: { select: { id: true, username: true, avatarUrl: true } },
        subtasks: true,
        _count: { select: { comments: true } },
      },
    });

    const activityType = dto.status ? 'TASK_STATUS_CHANGED' : 'TASK_UPDATED';
    const activityDetails = dto.status
      ? { newStatus: dto.status }
      : { updatedFields: Object.keys(data) };

    await this.prisma.activity.create({
      data: {
        projectId,
        userId,
        type: activityType,
        targetId: taskId,
        details: activityDetails,
      },
    });

    // Diffuser en temps réel
    this.realtime.emitToProject(projectId, 'task:updated', task);

    // Notifier le nouvel assigné si changé
    if (dto.assigneeId && dto.assigneeId !== userId) {
      await this.prisma.notification.create({
        data: {
          userId: dto.assigneeId,
          type: 'TASK_ASSIGNED',
          content: `Vous avez été assigné à la tâche « ${task.title} »`,
        },
      });
      this.realtime.emitToUser(dto.assigneeId, 'notification:new', {
        type: 'TASK_ASSIGNED',
        content: `Vous avez été assigné à la tâche « ${task.title} »`,
      });
    }

    return task;
  }

  async remove(taskId: string) {
    return this.prisma.task.delete({ where: { id: taskId } });
  }

  async addSubtask(taskId: string, title: string) {
    return this.prisma.subTask.create({ data: { taskId, title } });
  }

  async toggleSubtask(subtaskId: string, done: boolean) {
    return this.prisma.subTask.update({ where: { id: subtaskId }, data: { done } });
  }

  async addComment(projectId: string, taskId: string, userId: string, content: string) {
    const comment = await this.prisma.comment.create({
      data: { taskId, userId, content },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });

    await this.prisma.activity.create({
      data: { projectId, userId, type: 'TASK_COMMENTED', targetId: taskId },
    });

    // Diffuser le commentaire en temps réel
    this.realtime.emitToProject(projectId, 'task:comment', { taskId, comment });

    // Détecter les mentions @username dans le contenu
    const mentions = content.match(/@([a-zA-Z0-9_.-]+)/g) ?? [];
    for (const mention of mentions) {
      const username = mention.slice(1);
      const mentioned = await this.prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });
      if (mentioned && mentioned.id !== userId) {
        await this.prisma.notification.create({
          data: {
            userId: mentioned.id,
            type: 'MENTION',
            content: `@${await this.getUsernameById(userId)} vous a mentionné dans un commentaire`,
          },
        });
        this.realtime.emitToUser(mentioned.id, 'notification:new', { type: 'MENTION' });
      }
    }

    return comment;
  }

  private async getUsernameById(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    return user?.username ?? userId;
  }
}
