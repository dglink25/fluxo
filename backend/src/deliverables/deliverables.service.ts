import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeliverableStatus } from '@prisma/client';

@Injectable()
export class DeliverablesService {
  constructor(private prisma: PrismaService) {}

  async listForTask(taskId: string) {
    return this.prisma.deliverable.findMany({
      where: { taskId },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        validator: { select: { id: true, username: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    taskId: string,
    userId: string,
    data: { type?: string; url: string; name: string; size?: number },
  ) {
    const task = await this.getTaskOrThrow(taskId);
    await this.assertMember(task.projectId, userId);

    return this.prisma.deliverable.create({
      data: {
        taskId,
        authorId: userId,
        type: data.type ?? 'FILE',
        url: data.url,
        name: data.name,
        size: data.size,
        status: 'DRAFT',
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
      },
    });
  }

  async submit(deliverableId: string, userId: string) {
    const deliverable = await this.getOrThrow(deliverableId);
    if (deliverable.authorId !== userId) throw new ForbiddenException('Accès refusé');
    if (deliverable.status !== 'DRAFT') {
      throw new BadRequestException('Seul un brouillon peut être soumis');
    }

    const updated = await this.prisma.deliverable.update({
      where: { id: deliverableId },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });

    // Notifier les owners/admins du projet
    await this.notifyProjectManagers(deliverable.task.projectId, deliverableId);

    return updated;
  }

  async validate(deliverableId: string, userId: string) {
    const deliverable = await this.getOrThrow(deliverableId);
    await this.assertOwnerOrAdmin(deliverable.task.projectId, userId);
    if (deliverable.status !== 'SUBMITTED') {
      throw new BadRequestException('Seul un livrable soumis peut être validé');
    }

    const updated = await this.prisma.deliverable.update({
      where: { id: deliverableId },
      data: { status: 'VALIDATED', validatorId: userId, validatedAt: new Date() },
    });

    await this.prisma.activity.create({
      data: {
        projectId: deliverable.task.projectId,
        userId,
        type: 'DELIVERABLE_VALIDATED',
        targetId: deliverableId,
      },
    });

    // Notifier l'auteur
    await this.prisma.notification.create({
      data: {
        userId: deliverable.authorId,
        type: 'DELIVERABLE_VALIDATED',
        content: `Votre livrable "${deliverable.name}" a été validé.`,
      },
    });

    return updated;
  }

  async refuse(deliverableId: string, userId: string, refusalNote: string) {
    const deliverable = await this.getOrThrow(deliverableId);
    await this.assertOwnerOrAdmin(deliverable.task.projectId, userId);
    if (deliverable.status !== 'SUBMITTED') {
      throw new BadRequestException('Seul un livrable soumis peut être refusé');
    }

    const updated = await this.prisma.deliverable.update({
      where: { id: deliverableId },
      data: { status: 'REFUSED', refusalNote, validatorId: userId },
    });

    await this.prisma.notification.create({
      data: {
        userId: deliverable.authorId,
        type: 'DELIVERABLE_REFUSED',
        content: `Votre livrable "${deliverable.name}" a été refusé. Motif : ${refusalNote}`,
      },
    });

    return updated;
  }

  private async getOrThrow(id: string) {
    const d = await this.prisma.deliverable.findUnique({
      where: { id },
      include: { task: true },
    });
    if (!d) throw new NotFoundException('Livrable introuvable');
    return d;
  }

  private async getTaskOrThrow(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Tâche introuvable');
    return task;
  }

  private async assertMember(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) throw new ForbiddenException('Vous n\'êtes pas membre de ce projet');
  }

  private async assertOwnerOrAdmin(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
      throw new ForbiddenException('Rôle insuffisant');
    }
  }

  private async notifyProjectManagers(projectId: string, deliverableId: string) {
    const managers = await this.prisma.projectMember.findMany({
      where: { projectId, role: { in: ['OWNER', 'ADMIN'] } },
    });
    await this.prisma.notification.createMany({
      data: managers.map((m) => ({
        userId: m.userId,
        type: 'DELIVERABLE_READY',
        content: 'Un livrable a été soumis pour validation.',
      })),
    });
  }
}
