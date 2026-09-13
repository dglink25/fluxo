import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

@Injectable()
export class WorkspacesService {
  constructor(private prisma: PrismaService) {}

  /** Crée un workspace et en désigne le créateur comme owner */
  async create(userId: string, dto: CreateWorkspaceDto) {
    return this.prisma.workspace.create({
      data: {
        name: dto.name,
        description: dto.description,
        ownerId: userId,
        members: {
          create: { userId, role: 'OWNER' },
        },
      },
    });
  }

  /** Workspaces où l'utilisateur est owner ou membre */
  async findAllForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
      include: {
        _count: { select: { projects: true, members: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(userId: string, workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        owner: { select: { id: true, username: true, avatarUrl: true } },
        members: {
          include: {
            user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
          },
        },
        _count: { select: { projects: true } },
      },
    });
    if (!workspace) throw new NotFoundException('Workspace introuvable');

    const isMember = workspace.members.some((m) => m.userId === userId);
    if (!isMember) throw new ForbiddenException('Accès refusé');
    return workspace;
  }

  async update(userId: string, workspaceId: string, dto: UpdateWorkspaceDto) {
    await this.assertOwner(userId, workspaceId);
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: dto,
    });
  }

  async remove(userId: string, workspaceId: string) {
    await this.assertOwner(userId, workspaceId);
    return this.prisma.workspace.delete({ where: { id: workspaceId } });
  }

  async getProjects(userId: string, workspaceId: string) {
    await this.findOne(userId, workspaceId); // vérifie l'accès
    return this.prisma.project.findMany({
      where: { workspaceId, archived: false },
      include: { _count: { select: { tasks: true, members: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async assertOwner(userId: string, workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace introuvable');
    if (workspace.ownerId !== userId) {
      throw new ForbiddenException(
        'Seul le propriétaire peut modifier ou supprimer ce workspace',
      );
    }
    return workspace;
  }
}
