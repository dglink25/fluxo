import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

export class CreateDocumentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  taskId?: string;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;
}

/**
 * Documents collaboratifs par projet.
 * Chaque sauvegarde crée une nouvelle version dans l'historique.
 * L'édition collaborative en temps réel via CRDT/OT est gérée
 * côté frontend (Yjs) et synchronisée via WebSocket.
 */
@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  async list(projectId: string, userId: string) {
    await this.assertMember(projectId, userId);
    // Documents stockés comme Activities de type DOCUMENT_CREATED / DOCUMENT_UPDATED
    // Structure : details = { title, content, taskId?, version }
    return this.prisma.activity.findMany({
      where: { projectId, type: { in: ['DOCUMENT_CREATED', 'DOCUMENT_SNAPSHOT'] } },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getVersions(documentId: string, userId: string) {
    const doc = await this.prisma.activity.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document introuvable');
    await this.assertMember(doc.projectId, userId);

    // Toutes les snapshots de ce document (identifiées par targetId = documentId)
    return this.prisma.activity.findMany({
      where: {
        projectId: doc.projectId,
        type: 'DOCUMENT_SNAPSHOT',
        targetId: documentId,
      },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(projectId: string, userId: string, dto: CreateDocumentDto) {
    await this.assertMember(projectId, userId);

    const doc = await this.prisma.activity.create({
      data: {
        projectId,
        userId,
        type: 'DOCUMENT_CREATED',
        details: {
          title: dto.title,
          content: dto.content ?? '',
          taskId: dto.taskId ?? null,
          version: 1,
        },
      },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });

    return doc;
  }

  async update(documentId: string, userId: string, dto: UpdateDocumentDto) {
    const doc = await this.prisma.activity.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document introuvable');
    await this.assertMember(doc.projectId, userId);

    const currentDetails = (doc.details as Record<string, any>) ?? {};
    const currentVersion = (currentDetails['version'] as number) ?? 1;

    // Sauvegarder la version précédente comme snapshot
    await this.prisma.activity.create({
      data: {
        projectId: doc.projectId,
        userId,
        type: 'DOCUMENT_SNAPSHOT',
        targetId: documentId,
        details: {
          ...currentDetails,
          snapshotAt: new Date().toISOString(),
        },
      },
    });

    // Mettre à jour le document principal
    return this.prisma.activity.update({
      where: { id: documentId },
      data: {
        details: {
          ...currentDetails,
          ...(dto.title ? { title: dto.title } : {}),
          ...(dto.content !== undefined ? { content: dto.content } : {}),
          version: currentVersion + 1,
          lastEditedBy: userId,
          lastEditedAt: new Date().toISOString(),
        },
      },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });
  }

  async remove(documentId: string, userId: string) {
    const doc = await this.prisma.activity.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document introuvable');

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: doc.projectId, userId } },
    });
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
      throw new ForbiddenException('Rôle insuffisant pour supprimer un document');
    }

    await this.prisma.activity.deleteMany({
      where: { targetId: documentId, type: 'DOCUMENT_SNAPSHOT' },
    });
    return this.prisma.activity.delete({ where: { id: documentId } });
  }

  private async assertMember(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) throw new ForbiddenException("Vous n'êtes pas membre de ce projet");
  }
}
