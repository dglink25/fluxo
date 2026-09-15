import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

  // ── Helpers ───────────────────────────────────────────────────────────────

  private taskInclude = {
    assignee: { select: { id: true, username: true, avatarUrl: true } },
    assignees: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } },
    subtasks: true,
    _count: { select: { comments: true } },
  };

  /**
   * Génère un code unique pour une tâche dans un projet.
   * Format : PREFIX-NNN (ex. FLX-001, API-042)
   * Le compteur est incrémenté atomiquement via une transaction Prisma.
   */
  private async generateTaskCode(projectId: string): Promise<string> {
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: { taskCounter: { increment: 1 } },
      select: { taskCounter: true, taskPrefix: true },
    });
    const num = project.taskCounter.toString().padStart(3, '0');
    return `${project.taskPrefix}-${num}`;
  }

  /** Toutes les tâches assignées à un utilisateur (pour le dashboard) */
  async findAllForUser(userId: string) {
    return this.prisma.task.findMany({
      where: {
        status: { not: 'DONE' },
        OR: [
          { assigneeId: userId },
          { assignees: { some: { userId } } },
        ],
      },
      include: {
        project: { select: { id: true, name: true } },
        ...this.taskInclude,
      },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      take: 20,
    });
  }

  async findAllForProject(
    projectId: string,
    filters: { status?: string; assigneeId?: string; priority?: string },
  ) {
    return this.prisma.task.findMany({
      where: {
        projectId,
        ...(filters.status ? { status: filters.status as any } : {}),
        ...(filters.priority ? { priority: filters.priority as any } : {}),
        ...(filters.assigneeId
          ? {
              OR: [
                { assigneeId: filters.assigneeId },
                { assignees: { some: { userId: filters.assigneeId } } },
              ],
            }
          : {}),
      },
      include: this.taskInclude,
      orderBy: [{ status: 'asc' }, { position: 'asc' }],
    });
  }

  async findOne(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: { select: { id: true, username: true, avatarUrl: true } },
        assignees: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } },
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
    const { assigneeIds, ...rest } = dto as any;

    // Générer un code unique pour la tâche (FLX-001, FLX-002, etc.)
    const code = await this.generateTaskCode(projectId);

    const task = await this.prisma.task.create({
      data: {
        projectId,
        code,
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? 'MEDIUM',
        assigneeId: dto.assigneeId ?? (assigneeIds?.[0] ?? null),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        labels: dto.labels ?? [],
        // Assignation multiple
        ...(assigneeIds?.length
          ? {
              assignees: {
                create: assigneeIds.map((uid: string) => ({ userId: uid })),
              },
            }
          : dto.assigneeId
          ? { assignees: { create: [{ userId: dto.assigneeId }] } }
          : {}),
      },
      include: this.taskInclude,
    });

    await this.prisma.activity.create({
      data: { projectId, userId, type: 'TASK_CREATED', targetId: task.id, details: { title: task.title } },
    });

    this.realtime.emitToProject(projectId, 'task:created', task);

    // Notifier chaque assigné
    const allAssignees = task.assignees.map((a: any) => a.userId);
    for (const aid of allAssignees) {
      if (aid !== userId) {
        await this.prisma.notification.create({
          data: { userId: aid, type: 'TASK_ASSIGNED', content: `Vous avez été assigné à « ${task.title} »` },
        });
        this.realtime.emitToUser(aid, 'notification:new', { type: 'TASK_ASSIGNED' });
      }
    }

    return task;
  }

  async update(projectId: string, userId: string, taskId: string, dto: UpdateTaskDto) {
    const existing = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { assignees: true },
    });
    if (!existing) throw new NotFoundException('Tâche introuvable');

    // ── Restriction de changement de statut ───────────────────────────────
    // Seul l'assigné principal OU un des assignés peut changer le statut
    if (dto.status) {
      const isAssigned =
        existing.assigneeId === userId ||
        existing.assignees.some((a) => a.userId === userId);

      // Owner / Admin peuvent toujours changer le statut
      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      });
      const isManager = member && ['OWNER', 'ADMIN'].includes(member.role);

      if (!isAssigned && !isManager) {
        throw new ForbiddenException('Seul un assigné peut changer le statut de cette tâche');
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined)       data['title']       = dto.title;
    if (dto.description !== undefined) data['description'] = dto.description;
    if (dto.status !== undefined)      data['status']      = dto.status;
    if (dto.priority !== undefined)    data['priority']    = dto.priority;
    if (dto.assigneeId !== undefined)  data['assigneeId']  = dto.assigneeId;
    if (dto.dueDate !== undefined)     data['dueDate']     = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.labels !== undefined)      data['labels']      = dto.labels;

    const { assigneeIds } = dto as any;

    // Mettre à jour les assignés si fournis
    if (assigneeIds !== undefined) {
      await this.prisma.taskAssignee.deleteMany({ where: { taskId } });
      if (assigneeIds.length > 0) {
        await this.prisma.taskAssignee.createMany({
          data: assigneeIds.map((uid: string) => ({ taskId, userId: uid })),
          skipDuplicates: true,
        });
      }
      data['assigneeId'] = assigneeIds[0] ?? null;
    }

    const task = await this.prisma.task.update({
      where: { id: taskId },
      data,
      include: this.taskInclude,
    });

    const actType = dto.status ? 'TASK_STATUS_CHANGED' : 'TASK_UPDATED';
    await this.prisma.activity.create({
      data: {
        projectId,
        userId,
        type: actType,
        targetId: taskId,
        details: dto.status ? { newStatus: dto.status } : { updatedFields: Object.keys(data) },
      },
    });

    this.realtime.emitToProject(projectId, 'task:updated', task);
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

  async addComment(
    projectId: string,
    taskId: string,
    userId: string,
    content: string,
    attachment?: { fileUrl: string; fileName: string; fileType: string },
  ) {
    const comment = await this.prisma.comment.create({
      data: {
        taskId,
        userId,
        content,
        ...(attachment ?? {}),
      },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });

    await this.prisma.activity.create({
      data: { projectId, userId, type: 'TASK_COMMENTED', targetId: taskId },
    });

    this.realtime.emitToProject(projectId, 'task:comment', { taskId, comment });

    // Mentions @username
    const mentions = content.match(/@([a-zA-Z0-9_.-]+)/g) ?? [];
    for (const mention of mentions) {
      const username = mention.slice(1);
      const mentioned = await this.prisma.user.findUnique({ where: { username }, select: { id: true } });
      if (mentioned && mentioned.id !== userId) {
        await this.prisma.notification.create({
          data: {
            userId: mentioned.id,
            type: 'MENTION',
            content: `Vous avez été mentionné dans un commentaire de tâche`,
          },
        });
        this.realtime.emitToUser(mentioned.id, 'notification:new', { type: 'MENTION' });
      }
    }

    return comment;
  }
}
