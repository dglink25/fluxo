import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly appUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private whatsapp: WhatsappService,
    private realtime: RealtimeGateway,
  ) {}

  // ── Lister les fichiers d'un projet ───────────────────────────────────────

  async listForProject(projectId: string, userId: string) {
    await this.assertMember(projectId, userId);
    return this.prisma.projectFile.findMany({
      where: { projectId, parentId: null },
      include: {
        uploader: { select: { id: true, username: true, avatarUrl: true } },
        children: {
          select: { id: true, version: true, url: true, createdAt: true },
          orderBy: { version: 'asc' },
        },
        // Les commentaires sont chargés séparément via GET /:fileId/comments
        // pour éviter que l'absence de la table FileComment en prod ne bloque
        // l'affichage de tous les fichiers.
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Déposer un fichier ────────────────────────────────────────────────────

  async create(
    projectId: string,
    userId: string,
    data: { name: string; size: number; mimeType: string; url: string },
  ) {
    await this.assertMember(projectId, userId);

    this.logger.log(`Création fichier: ${data.name} (${data.mimeType}, ${data.size} bytes) pour projet ${projectId}`);
    this.logger.log(`URL type: ${data.url.startsWith('data:') ? 'BASE64' : data.url.startsWith('https://') ? 'HTTPS' : 'OTHER'}`);

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
        uploader: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
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

    // Notifier en temps réel (synchrone — rapide)
    this.realtime.emitToProject(projectId, 'file:uploaded', { fileId: file.id, name: data.name });

    this.logger.log(`Fichier ${file.id} sauvegardé en BDD avec succès: ${file.name}`);

    // Notifier les collaborateurs en arrière-plan — ne bloque pas la réponse HTTP
    this.notifyCollaboratorsOnUpload(projectId, userId, file).catch((err) => {
      this.logger.warn(`Erreur notification upload: ${err?.message}`);
    });

    return file;
  }

  // ── Ajouter une version ───────────────────────────────────────────────────

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

    const file = await this.prisma.projectFile.create({
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
        uploader: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
      },
    });

    // Notifier collaborateurs pour la nouvelle version aussi
    await this.notifyCollaboratorsOnUpload(projectId, userId, file);

    return file;
  }

  // ── Commentaires sur fichier ──────────────────────────────────────────────

  async addComment(
    fileId: string,
    userId: string,
    content: string,
  ) {
    // Récupérer le fichier avec son déposeur et le projet
    const file = await this.prisma.projectFile.findUnique({
      where: { id: fileId },
      include: {
        uploader: { select: { id: true, username: true, fullName: true, email: true, phone: true } },
        project:  { select: { id: true, name: true } },
      },
    });
    if (!file) throw new NotFoundException('Fichier introuvable');

    // Vérifier que le commentateur est membre du projet
    await this.assertMember(file.projectId, userId);

    this.logger.log(`Ajout commentaire sur fichier ${fileId} par user ${userId}`);

    const comment = await this.prisma.fileComment.create({
      data: { fileId, userId, content },
      include: {
        user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
      },
    });

    this.logger.log(`Commentaire ${comment.id} créé avec succès`);

    // Émettre en temps réel
    this.realtime.emitToProject(file.projectId, 'file:comment', { fileId, comment });

    // Notifier le déposeur en arrière-plan — ne bloque pas la réponse HTTP
    if (file.uploadedBy !== userId) {
      this.notifyUploaderOnComment(file, userId, content).catch((err) => {
        this.logger.warn(`Erreur notification commentaire: ${err?.message}`);
      });
    }

    return comment;
  }

  private async notifyUploaderOnComment(
    file: any,
    commenterId: string,
    content: string,
  ) {
    const commenter = await this.prisma.user.findUnique({
      where: { id: commenterId },
      select: { username: true, fullName: true },
    });
    const commenterName = commenter?.fullName ?? commenter?.username ?? 'Un collaborateur';
    const uploaderName  = file.uploader.fullName ?? file.uploader.username;
    const appUrl = `${this.appUrl}/projects/${file.projectId}?view=documents`;

    await this.prisma.notification.create({
      data: {
        userId:  file.uploadedBy,
        type:    'FILE_COMMENTED',
        content: `${commenterName} a commenté votre fichier « ${file.name} »`,
      },
    });
    this.realtime.emitToUser(file.uploadedBy, 'notification:new', {
      type: 'FILE_COMMENTED',
      content: `${commenterName} a commenté « ${file.name} »`,
    });

    if (file.uploader.email) {
      await this.mail.sendFileCommentedEmail(
        file.uploader.email, uploaderName, commenterName,
        file.name, file.project.name, content, appUrl,
      ).catch(() => {});
    }
    if (file.uploader.phone) {
      await this.whatsapp.sendFileCommentedMessage(
        file.uploader.phone, uploaderName, commenterName,
        file.name, file.project.name, content, appUrl,
      ).catch(() => {});
    }
  }

  async listComments(fileId: string, userId: string) {
    this.logger.log(`Chargement commentaires pour fichier ${fileId}`);
    const file = await this.prisma.projectFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('Fichier introuvable');
    await this.assertMember(file.projectId, userId);

    const comments = await this.prisma.fileComment.findMany({
      where: { fileId },
      include: {
        user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    this.logger.log(`${comments.length} commentaire(s) trouvé(s) pour fichier ${fileId}`);
    return comments;
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.prisma.fileComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Commentaire introuvable');
    if (comment.userId !== userId) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres commentaires');
    }
    return this.prisma.fileComment.delete({ where: { id: commentId } });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Notifie tous les membres du projet qu'un nouveau fichier a été déposé.
   * Canaux : push in-app + email + WhatsApp.
   * Le déposeur lui-même n'est pas notifié.
   */
  private async notifyCollaboratorsOnUpload(
    projectId: string,
    uploaderId: string,
    file: { id: string; name: string; uploader: { username: string; fullName?: string | null } },
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, fullName: true, email: true, phone: true } },
          },
        },
      },
    });
    if (!project) return;

    const uploaderName = file.uploader.fullName ?? file.uploader.username;
    const appUrl = `${this.appUrl}/projects/${projectId}?view=documents`;

    for (const member of project.members) {
      if (member.userId === uploaderId) continue; // pas de notification au déposeur

      const { user } = member;
      const recipientName = user.fullName ?? user.username;

      // Push in-app
      await this.prisma.notification.create({
        data: {
          userId:  user.id,
          type:    'FILE_UPLOADED',
          content: `${uploaderName} a déposé le fichier « ${file.name} » dans « ${project.name} »`,
        },
      });
      this.realtime.emitToUser(user.id, 'notification:new', {
        type: 'FILE_UPLOADED',
        content: `${uploaderName} a déposé « ${file.name} »`,
      });

      // Email
      if (user.email) {
        await this.mail.sendFileUploadedEmail(
          user.email,
          recipientName,
          uploaderName,
          file.name,
          project.name,
          appUrl,
        ).catch(() => {});
      }

      // WhatsApp
      if (user.phone) {
        await this.whatsapp.sendFileUploadedMessage(
          user.phone,
          recipientName,
          uploaderName,
          file.name,
          project.name,
          appUrl,
        ).catch(() => {});
      }
    }
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
