import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MessageType } from '@prisma/client';

export interface SendMessageInput {
  type?: MessageType;
  content: string;
  fileUrl?: string;
}

@Injectable()
export class MessagingService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
  ) {}

  // ── Agrégation tous projets ───────────────────────────────────────────────

  async listAllChannels(userId: string) {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      include: {
        project: {
          include: { channels: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });
    return memberships
      .filter((m) => m.project.channels.length > 0)
      .map((m) => ({
        projectId: m.project.id,
        projectName: m.project.name,
        channels: m.project.channels,
      }));
  }

  async searchUsers(query: string, currentUserId: string) {
    return this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { email:    { contains: query, mode: 'insensitive' } },
          { fullName: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, username: true, fullName: true, avatarUrl: true },
      take: 15,
    });
  }

  async getProjectMembers(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) throw new ForbiddenException('Accès refusé');
    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
      },
    });
  }

  // ── Channels projet ───────────────────────────────────────────────────────

  async listChannels(projectId: string) {
    return this.prisma.channel.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getOrCreateDefaultChannel(projectId: string) {
    let channel = await this.prisma.channel.findFirst({
      where: { projectId, name: 'général' },
    });
    if (!channel) {
      channel = await this.prisma.channel.create({
        data: { projectId, name: 'général' },
      });
    }
    return channel;
  }

  async createChannel(projectId: string, userId: string, name: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
      throw new ForbiddenException('Seuls les OWNER et ADMIN peuvent créer des channels');
    }
    return this.prisma.channel.create({ data: { projectId, name } });
  }

  async updateChannel(channelId: string, userId: string, dto: { name?: string }) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { project: { include: { members: true } } },
    });
    if (!channel) throw new NotFoundException('Channel introuvable');
    const member = channel.project.members.find((m) => m.userId === userId);
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
      throw new ForbiddenException('Seuls les OWNER et ADMIN peuvent modifier ce channel');
    }
    return this.prisma.channel.update({
      where: { id: channelId },
      data: { ...(dto.name && { name: dto.name }) },
    });
  }

  async deleteChannel(channelId: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { project: { include: { members: true } } },
    });
    if (!channel) throw new NotFoundException('Channel introuvable');
    const member = channel.project.members.find((m) => m.userId === userId);
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
      throw new ForbiddenException('Accès refusé');
    }
    return this.prisma.channel.delete({ where: { id: channelId } });
  }

  // ── Messages channel ──────────────────────────────────────────────────────

  async getChannelMessages(
    channelId: string,
    userId: string,
    opts: { limit?: number; before?: string } = {},
  ) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { project: { include: { members: true } } },
    });
    if (!channel) throw new NotFoundException('Channel introuvable');
    const isMember = channel.project.members.some((m) => m.userId === userId);
    if (!isMember) throw new ForbiddenException('Accès refusé');

    const messages = await this.prisma.message.findMany({
      where: {
        channelId,
        ...(opts.before ? { createdAt: { lt: new Date(opts.before) } } : {}),
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        reactions: true,
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 50,
    });
    return messages.reverse();
  }

  async sendToChannel(channelId: string, senderId: string, input: SendMessageInput) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { project: { include: { members: true } } },
    });
    if (!channel) throw new NotFoundException('Channel introuvable');
    const isMember = channel.project.members.some((m) => m.userId === senderId);
    if (!isMember) throw new ForbiddenException('Accès refusé');

    const message = await this.prisma.message.create({
      data: {
        senderId,
        channelId,
        type: input.type ?? 'TEXT',
        content: input.content,
        fileUrl: input.fileUrl,
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        reactions: true,
      },
    });
    this.realtime.emitToChannel(channelId, 'message:new', message);
    return message;
  }

  async editMessage(messageId: string, userId: string, content: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message introuvable');
    if (message.senderId !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres messages');
    }
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        reactions: true,
      },
    });
    const roomId = message.channelId ?? message.dmId ?? '';
    this.realtime.emitToChannel(roomId, 'message:edited', updated);
    return updated;
  }

  async deleteMessage(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        channel: { include: { project: { include: { members: true } } } },
      },
    });
    if (!message) throw new NotFoundException('Message introuvable');

    const isAuthor  = message.senderId === userId;
    const member    = message.channel?.project.members.find((m) => m.userId === userId);
    const isManager = member && ['OWNER', 'ADMIN'].includes(member.role);

    if (!isAuthor && !isManager) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres messages');
    }
    await this.prisma.message.delete({ where: { id: messageId } });
    const roomId = message.channelId ?? message.dmId ?? '';
    this.realtime.emitToChannel(roomId, 'message:deleted', { id: messageId });
    return { deleted: true };
  }

  async searchChannelMessages(channelId: string, userId: string, query: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { project: { include: { members: true } } },
    });
    if (!channel) throw new NotFoundException('Channel introuvable');
    if (!channel.project.members.some((m) => m.userId === userId)) {
      throw new ForbiddenException('Accès refusé');
    }
    const hits = await this.prisma.message.findMany({
      where: { channelId, content: { contains: query, mode: 'insensitive' } },
      include: { sender: { select: { id: true, username: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return hits.reverse();
  }

  // ── Messages directs (DM) ─────────────────────────────────────────────────

  async getOrCreateDm(userId1: string, userId2: string) {
    // Chercher une DM existante à EXACTEMENT 2 participants
    const participations = await this.prisma.directMessageParticipant.findMany({
      where: { userId: userId1 },
      include: { dm: { include: { participants: true } } },
    });
    const existing = participations
      .map((p) => p.dm)
      .find(
        (dm) =>
          dm.participants.length === 2 &&
          dm.participants.some((p) => p.userId === userId2),
      );
    if (existing) return existing;

    return this.prisma.directMessage.create({
      data: {
        participants: { create: [{ userId: userId1 }, { userId: userId2 }] },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, username: true, avatarUrl: true } } },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }

  async getDmMessages(dmId: string, userId: string, opts: { limit?: number } = {}) {
    const dm = await this.prisma.directMessage.findUnique({
      where: { id: dmId },
      include: { participants: true },
    });
    if (!dm) throw new NotFoundException('Conversation introuvable');
    if (!dm.participants.some((p) => p.userId === userId)) {
      throw new ForbiddenException('Accès refusé');
    }
    const messages = await this.prisma.message.findMany({
      where: { dmId },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        reactions: true,
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 50,
    });
    return messages.reverse();
  }

  async sendDm(dmId: string, senderId: string, input: SendMessageInput) {
    const dm = await this.prisma.directMessage.findUnique({
      where: { id: dmId },
      include: { participants: true },
    });
    if (!dm) throw new NotFoundException('Conversation introuvable');
    if (!dm.participants.some((p) => p.userId === senderId)) {
      throw new ForbiddenException('Accès refusé');
    }
    const dmMessage = await this.prisma.message.create({
      data: {
        senderId,
        dmId,
        type: input.type ?? 'TEXT',
        content: input.content,
        fileUrl: input.fileUrl,
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        reactions: true,
      },
    });
    this.realtime.emitToChannel(dmId, 'message:new', dmMessage);
    const others = dm.participants.filter((p) => p.userId !== senderId);
    for (const p of others) {
      this.realtime.emitToUser(p.userId, 'notification:new', { type: 'DM' });
    }
    return dmMessage;
  }

  async listDms(userId: string) {
    const participations = await this.prisma.directMessageParticipant.findMany({
      where: { userId },
      include: {
        dm: {
          include: {
            participants: {
              include: {
                user: { select: { id: true, username: true, avatarUrl: true } },
              },
            },
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });
    return participations.map((p) => p.dm);
  }

  async markMessagesRead(roomId: string, userId: string, isChannel: boolean) {
    await this.prisma.message.updateMany({
      where: {
        ...(isChannel ? { channelId: roomId } : { dmId: roomId }),
        senderId: { not: userId },
        read: false,
      },
      data: { read: true },
    });
  }

  async toggleReaction(messageId: string, userId: string, emoji: string) {
    const existing = await this.prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    });
    if (existing) {
      return this.prisma.messageReaction.delete({
        where: { messageId_userId_emoji: { messageId, userId, emoji } },
      });
    }
    return this.prisma.messageReaction.create({
      data: { messageId, userId, emoji },
    });
  }
}
