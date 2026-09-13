import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async findAllForProject(
    projectId: string,
    filters: { status?: string; assigneeId?: string; priority?: string },
  ) {
    return this.prisma.task.findMany({
      where: {
        projectId,
        status: filters.status as any,
        assigneeId: filters.assigneeId,
        priority: filters.priority as any,
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
          include: { user: { select: { username: true, avatarUrl: true } } },
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
    });
    await this.prisma.activity.create({
      data: { projectId, userId, type: 'TASK_CREATED', targetId: task.id, details: { title: task.title } },
    });
    return task;
  }

  async update(projectId: string, userId: string, taskId: string, dto: UpdateTaskDto) {
    // Construire l'objet data de façon explicite pour éviter de passer
    // des champs non-Prisma ou de mauvais types (ex. assignee, subtasks…)
    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data['title'] = dto.title;
    if (dto.description !== undefined) data['description'] = dto.description;
    if (dto.status !== undefined) data['status'] = dto.status;
    if (dto.priority !== undefined) data['priority'] = dto.priority;
    if (dto.assigneeId !== undefined) data['assigneeId'] = dto.assigneeId;
    if (dto.dueDate !== undefined) data['dueDate'] = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.labels !== undefined) data['labels'] = dto.labels;

    const task = await this.prisma.task.update({
      where: { id: taskId },
      data,
    });

    if (dto.status) {
      await this.prisma.activity.create({
        data: {
          projectId,
          userId,
          type: 'TASK_STATUS_CHANGED',
          targetId: taskId,
          details: { newStatus: dto.status },
        },
      });
    } else if (Object.keys(data).some((k) => k !== 'status')) {
      await this.prisma.activity.create({
        data: {
          projectId,
          userId,
          type: 'TASK_UPDATED',
          targetId: taskId,
          details: { updatedFields: Object.keys(data) },
        },
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
      include: { user: { select: { username: true, avatarUrl: true } } },
    });
    await this.prisma.activity.create({
      data: { projectId, userId, type: 'TASK_COMMENTED', targetId: taskId },
    });
    return comment;
  }
}
