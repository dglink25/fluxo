import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { InvitationTarget, ProjectRole } from '@prisma/client';

const INVITATION_TTL_DAYS = 7;

export interface CreateInvitationInput {
  type: InvitationTarget;
  value: string; // email, téléphone (+229...) ou pseudo
  role?: ProjectRole;
}

@Injectable()
export class InvitationsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private whatsapp: WhatsappService,
    private realtime: RealtimeGateway,
  ) {}

  async create(projectId: string, invitedById: string, input: CreateInvitationInput) {
    switch (input.type) {
      case 'EMAIL':
        return this.createEmailInvitation(projectId, invitedById, input.value, input.role);
      case 'PHONE':
        return this.createPhoneInvitation(projectId, invitedById, input.value, input.role);
      case 'USERNAME':
        return this.createUsernameInvitation(projectId, invitedById, input.value, input.role);
      default:
        throw new BadRequestException("Type d'invitation invalide");
    }
  }

  private async createEmailInvitation(
    projectId: string,
    invitedById: string,
    email: string,
    role: ProjectRole = 'MEMBER',
  ) {
    const project = await this.getProjectOrThrow(projectId);
    await this.assertNotAlreadyMember(projectId, { email });

    const { invitation, inviteUrl } = await this.persistInvitation(
      projectId,
      invitedById,
      'EMAIL',
      email,
      role,
    );

    await this.mailService.sendInvitationEmail(email, project.name, inviteUrl);
    await this.logActivity(projectId, invitedById, 'INVITATION_SENT', {
      channel: 'email',
      target: email,
    });

    return invitation;
  }

  private async createPhoneInvitation(
    projectId: string,
    invitedById: string,
    phone: string,
    role: ProjectRole = 'MEMBER',
  ) {
    const project = await this.getProjectOrThrow(projectId);
    await this.assertNotAlreadyMember(projectId, { phone });

    const { invitation, inviteUrl } = await this.persistInvitation(
      projectId,
      invitedById,
      'PHONE',
      phone,
      role,
    );

    const inviter = await this.prisma.user.findUnique({ where: { id: invitedById } });
    await this.whatsapp.sendInvitationMessage(
      phone,
      project.name,
      inviter?.fullName ?? inviter?.username ?? 'Un collaborateur',
      inviteUrl,
    );
    await this.logActivity(projectId, invitedById, 'INVITATION_SENT', {
      channel: 'phone',
      target: phone,
    });

    return invitation;
  }

  private async createUsernameInvitation(
    projectId: string,
    invitedById: string,
    username: string,
    role: ProjectRole = 'MEMBER',
  ) {
    await this.getProjectOrThrow(projectId);

    const targetUser = await this.prisma.user.findUnique({ where: { username } });
    if (!targetUser) throw new NotFoundException(`Aucun compte avec le pseudo @${username}`);

    await this.assertNotAlreadyMember(projectId, { userId: targetUser.id });

    const { invitation } = await this.persistInvitation(
      projectId,
      invitedById,
      'USERNAME',
      username,
      role,
      targetUser.id,
    );

    await this.prisma.notification.create({
      data: {
        userId: targetUser.id,
        type: 'PROJECT_INVITATION',
        content: `Vous avez été invité·e à rejoindre un projet sur Fluxo`,
      },
    });
    await this.logActivity(projectId, invitedById, 'INVITATION_SENT', {
      channel: 'username',
      target: username,
    });

    return invitation;
  }

  private async persistInvitation(
    projectId: string,
    invitedById: string,
    targetType: InvitationTarget,
    targetValue: string,
    role: ProjectRole,
    invitedUserId?: string,
  ) {
    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.invitation.create({
      data: { projectId, invitedById, targetType, targetValue, role, token, expiresAt, invitedUserId },
    });

    const inviteUrl = `${process.env.FRONTEND_URL}/invitations/${token}`;
    return { invitation, inviteUrl };
  }

  private async assertNotAlreadyMember(
    projectId: string,
    by: { email?: string; phone?: string; userId?: string },
  ) {
    const alreadyMember = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        user: by.userId
          ? { id: by.userId }
          : by.email
            ? { email: by.email }
            : { phone: by.phone },
      },
    });
    if (alreadyMember) throw new ConflictException('Cette personne est déjà membre du projet');
  }

  private async getProjectOrThrow(projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projet introuvable');
    return project;
  }

  private async logActivity(projectId: string, userId: string, type: string, details?: unknown) {
    await this.prisma.activity.create({ data: { projectId, userId, type, details: details as any } });
  }

  async listForProject(projectId: string) {
    return this.prisma.invitation.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Invitations en attente adressées à l'utilisateur courant (par pseudo ou email) */
  async listMine(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();

    return this.prisma.invitation.findMany({
      where: {
        status: 'PENDING',
        OR: [
          { invitedUserId: userId },
          { targetType: 'EMAIL', targetValue: user.email },
          ...(user.phone ? [{ targetType: 'PHONE' as const, targetValue: user.phone }] : []),
        ],
      },
      include: {
        project: { select: { id: true, name: true, description: true } },
        invitedBy: { select: { username: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async accept(token: string, userId: string) {
    const invitation = await this.prisma.invitation.findUnique({ where: { token } });
    if (!invitation) throw new NotFoundException('Invitation introuvable');
    if (invitation.status !== 'PENDING') {
      // Si l'invitation est déjà acceptée, vérifier si le membre existe
      // et le créer si nécessaire (cas de re-tentative)
      if (invitation.status === 'ACCEPTED') {
        const existing = await this.prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId: invitation.projectId, userId } },
        });
        if (!existing) {
          await this.prisma.projectMember.create({
            data: { projectId: invitation.projectId, userId, role: invitation.role },
          });
        }
        return { projectId: invitation.projectId, role: invitation.role };
      }
      throw new BadRequestException(`Invitation déjà ${invitation.status.toLowerCase()}`);
    }
    if (invitation.expiresAt < new Date()) {
      await this.prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
      throw new BadRequestException('Invitation expirée');
    }

    // Vérifier que l'utilisateur n'est pas déjà membre
    const alreadyMember = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: invitation.projectId, userId } },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      // Marquer l'invitation comme acceptée et lier l'utilisateur
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', invitedUserId: userId },
      });

      let membership;
      if (alreadyMember) {
        membership = alreadyMember;
      } else {
        membership = await tx.projectMember.create({
          data: { projectId: invitation.projectId, userId, role: invitation.role },
        });
      }

      await tx.activity.create({
        data: { projectId: invitation.projectId, userId, type: 'MEMBER_JOINED' },
      });

      return membership;
    });

    // Notifier tous les membres existants via WebSocket + notification in-app
    const newUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, fullName: true },
    });
    const members = await this.prisma.projectMember.findMany({
      where: { projectId: invitation.projectId, NOT: { userId } },
    });
    const content = `${newUser?.fullName ?? newUser?.username ?? 'Un utilisateur'} a rejoint le projet.`;
    for (const member of members) {
      await this.prisma.notification.create({
        data: { userId: member.userId, type: 'MEMBER_JOINED', content },
      });
      this.realtime.emitToUser(member.userId, 'notification:new', {
        type: 'MEMBER_JOINED', content,
        projectId: invitation.projectId,
      });
    }
    // Notifier le projet (activité live)
    this.realtime.emitToProject(invitation.projectId, 'member:joined', {
      userId, username: newUser?.username, projectId: invitation.projectId,
    });

    return result;
  }

  async decline(token: string) {
    const invitation = await this.prisma.invitation.findUnique({ where: { token } });
    if (!invitation) throw new NotFoundException('Invitation introuvable');
    return this.prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'DECLINED' } });
  }

  /**
   * Répare les membres manquants : pour toutes les invitations ACCEPTED
   * liées à un utilisateur, crée le ProjectMember s'il n'existe pas.
   */
  async repairAcceptedInvitations(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) return { repaired: 0 };

    // Trouver toutes les invitations acceptées pour cet email ou userId
    const invitations = await this.prisma.invitation.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          { invitedUserId: userId },
          { targetType: 'EMAIL', targetValue: user.email },
        ],
      },
    });

    let repaired = 0;
    for (const inv of invitations) {
      const exists = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: inv.projectId, userId } },
      });
      if (!exists) {
        await this.prisma.projectMember.create({
          data: { projectId: inv.projectId, userId, role: inv.role },
        });
        repaired++;
      }
    }

    return { repaired };
  }

  async findByToken(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { project: { select: { name: true, description: true } } },
    });
    if (!invitation) throw new NotFoundException('Invitation introuvable');
    return invitation;
  }
}
