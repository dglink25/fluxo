import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  /** Liste des projets où l'utilisateur est propriétaire ou membre */
  async findAllForUser(userId: string) {
    return this.prisma.project.findMany({
      where: {
        archived: false,
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      include: {
        _count: { select: { tasks: true, members: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateProjectDto) {
    // Générer un préfixe depuis le nom (3 lettres majuscules)
    const taskPrefix = dto.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 3)
      .padEnd(3, 'X') || 'FLX';

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: dto.name,
          description: dto.description,
          visibility: dto.visibility ?? 'PRIVATE',
          ownerId: userId,
          workspaceId: dto.workspaceId ?? null,
          taskPrefix,
        },
      });
      // Inscrire le créateur comme OWNER
      await tx.projectMember.create({
        data: { projectId: project.id, userId, role: 'OWNER' },
      });
      // Créer le channel général par défaut
      await tx.channel.create({
        data: { projectId: project.id, name: 'général' },
      });
      await tx.activity.create({
        data: {
          projectId: project.id,
          userId,
          type: 'PROJECT_CREATED',
          details: { name: project.name },
        },
      });
      return project;
    });
  }

  async findOne(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: { include: { user: { select: { id: true, username: true, avatarUrl: true, fullName: true } } } },
        owner: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
        _count: { select: { tasks: true } },
      },
    });
    if (!project) throw new NotFoundException('Projet introuvable');

    const isMember = project.members.some((m) => m.userId === userId);
    if (project.visibility === 'PRIVATE' && !isMember) {
      throw new ForbiddenException('Accès refusé à ce projet privé');
    }
    return project;
  }

  async update(projectId: string, dto: UpdateProjectDto) {
    return this.prisma.project.update({ where: { id: projectId }, data: dto });
  }

  async archive(projectId: string) {
    return this.prisma.project.update({ where: { id: projectId }, data: { archived: true } });
  }

  async remove(projectId: string) {
    return this.prisma.project.delete({ where: { id: projectId } });
  }

  async removeMember(projectId: string, targetUserId: string, actingUserId: string) {
    const result = await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
    await this.prisma.activity.create({
      data: {
        projectId,
        userId: actingUserId,
        type: 'MEMBER_REMOVED',
        targetId: targetUserId,
      },
    });
    return result;
  }

  async changeMemberRole(
    projectId: string,
    targetUserId: string,
    role: 'ADMIN' | 'MEMBER' | 'READER',
    actingUserId: string,
  ) {
    const result = await this.prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      data: { role },
    });
    await this.prisma.activity.create({
      data: {
        projectId,
        userId: actingUserId,
        type: 'MEMBER_ROLE_CHANGED',
        targetId: targetUserId,
        details: { newRole: role },
      },
    });
    return result;
  }

  async getMembersWithInvitations(projectId: string) {
    const [members, invitations] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: { projectId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy: [
          // OWNER en premier, puis ADMIN, puis MEMBER, puis READER
          { role: 'asc' },
          { addedAt: 'asc' },
        ],
      }),
      this.prisma.invitation.findMany({
        where: { projectId },
        include: {
          invitedBy: { select: { id: true, username: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { members, invitations };
  }

  async activityFeed(projectId: string) {
    return this.prisma.activity.findMany({
      where: { projectId },
      include: { user: { select: { username: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
