import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FilesService {
  constructor(private prisma: PrismaService) {}

  async listForProject(projectId: string, userId: string) {
    await this.assertMember(projectId, userId);
    // Retourner uniquement les fichiers "racine" (version la plus récente)
    return this.prisma.projectFile.findMany({
      where: { projectId, parentId: null },
      include: {
        uploader: { select: { id: true, username: true, avatarUrl: true } },
        children: {
          select: { id: true, version: true, url: true, createdAt: true },
          orderBy: { version: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    projectId: string,
    userId: string,
    data: { name: string; size: number; mimeType: string; url: string },
  ) {
    await this.assertMember(projectId, userId);

    const file = await this.prisma.projectFile.create({
      data: {
        projectId,
        uploadedBy: userId,
        name: data.name,
        size: data.size,
        mimeType: data.mimeType,
        url: data.url,
        version: 1,
      },
      include: {
        uploader: { select: { id: true, username: true, avatarUrl: true } },
      },
    });

    await this.prisma.activity.create({
      data: {
        projectId,
        userId,
        type: 'FILE_UPLOADED',
        targetId: file.id,
        details: { name: data.name },
      },
    });

    return file;
  }

  async addVersion(
    projectId: string,
    parentId: string,
    userId: string,
    data: { name: string; size: number; mimeType: string; url: string },
  ) {
    await this.assertMember(projectId, userId);
    const parent = await this.prisma.projectFile.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Fichier introuvable');

    const latestVersion = await this.prisma.projectFile.count({
      where: { OR: [{ id: parentId }, { parentId }] },
    });

    return this.prisma.projectFile.create({
      data: {
        projectId,
        uploadedBy: userId,
        name: data.name,
        size: data.size,
        mimeType: data.mimeType,
        url: data.url,
        version: latestVersion + 1,
        parentId,
      },
      include: {
        uploader: { select: { id: true, username: true, avatarUrl: true } },
      },
    });
  }

  private async assertMember(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { members: true },
    });
    if (!project) throw new NotFoundException('Projet introuvable');
    const isMember = project.members.some((m) => m.userId === userId);
    if (project.visibility === 'PRIVATE' && !isMember) {
      throw new ForbiddenException('Accès refusé');
    }
  }
}
