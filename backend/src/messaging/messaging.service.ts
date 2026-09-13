import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessageType } from '@prisma/client';

export interface SendMessageInput {
  type?: MessageType;
  content: string;
  fileUrl?: string;
}

@Injectable()
export class MessagingService {
  constructor(private prisma: PrismaService) {}

  // ── Channels projet ────────────────────────────────────────────────────────

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

  async getChannelMessages(
    channelId: string,
    userId: string,
    opts: { limit?: number; before?: string } = {},
  ) {
    // Vérifier l'accès au channel via le projet
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

    return messages.reverse(); // retourner dans l'ordre chronologique
  }

  async sendToChannel(channelId: string, senderId: string, input: SendMessageInput) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { project: { include: { members: true } } },
    });
    if (!channel) throw new NotFoundException('Channel introuvable');

    const isMember = channel.project.members.some((m) => m.userId === senderId);
    if (!isMember) throw new ForbiddenException('Accès refusé');

    return this.prisma.message.create({
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
  }

  async searchChannelMessages(channelId: string, userId: string, query: string) {
    // Vérifier accès
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { project: { include: { members: true } } },
    });
    if (!channel) throw new NotFoundException('Channel introuvable');
    if (!channel.project.members.some((m) => m.userId === userId)) {
      throw new ForbiddenException('Accès refusé');
    }

    const hits = await this.prisma.message.findMany({
      where: {
        channelId,
        content: { contains: query, mode: 'insensitive' },
      },
      include: { sender: { select: { id: true, username: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return hits.reverse();
  }

  // ── Messages directs (DM) ──────────────────────────────────────────────────

  /** Trouver ou créer une conversation DM entre deux utilisateurs */
  async getOrCreateDm(userId1: string, userId2: string) {
    // Chercher une DM existante entre ces deux utilisateurs
    const existing = await this.prisma.directMessage.findFirst({
      where: {
        participants: {
          every: { userId: { in: [userId1, userId2] } },
        },
      },
      include: { participants: true },
    });

    if (existing && existing.participants.length === 2) return existing;

    return this.prisma.directMessage.create({
      data: {
        participants: {
          create: [{ userId: userId1 }, { userId: userId2 }],
        },
      },
      include: { participants: true },
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

    return this.prisma.message.create({
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
  }

  /** Lister les DMs d'un utilisateur */
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
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    return participations.map((p) => p.dm);
  }

  /** Marquer les messages d'un channel/DM comme lus */
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

  /** Réagir à un message avec un emoji */
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
