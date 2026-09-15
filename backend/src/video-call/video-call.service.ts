import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class VideoCallService {
  private readonly logger = new Logger(VideoCallService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private whatsapp: WhatsappService,
    private realtime: RealtimeGateway,
  ) {}

  // ── Lancer un appel immédiat ──────────────────────────────────────────────

  async startCall(hostId: string, input: {
    title?: string;
    channelId?: string;
    dmId?: string;
    participantIds: string[];
  }) {
    const call = await this.prisma.videoCall.create({
      data: {
        hostId,
        title: input.title,
        status: 'LIVE',
        startedAt: new Date(),
        channelId: input.channelId,
        dmId: input.dmId,
        participants: {
          create: [
            { userId: hostId },
            ...input.participantIds
              .filter((id) => id && id !== hostId)
              .map((userId) => ({ userId })),
          ],
        },
      },
      include: {
        host: { select: { id: true, username: true, fullName: true } },
        participants: { include: { user: { select: { id: true, email: true, phone: true, username: true, fullName: true } } } },
      },
    });

    const callUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:4200'}/call?room=${call.roomId}`;
    const hostName = call.host.fullName ?? call.host.username;
    const title = call.title ?? 'Visioconférence';

    // Message dans le channel ou DM
    await this.postCallMessage(call, callUrl, false);

    // Notifier tous les participants
    for (const p of call.participants) {
      if (p.userId === hostId) continue;
      const { user } = p;

      // Push in-app
      await this.prisma.notification.create({
        data: {
          userId: user.id,
          type: 'CALL_STARTED',
          content: `${hostName} a lancé une visioconférence "${title}". Rejoignez maintenant !`,
        },
      });
      this.realtime.emitToUser(user.id, 'call:invite', {
        callId: call.id, roomId: call.roomId, hostName, title, callUrl,
      });

      // Email
      if (user.email) {
        await this.mail.sendCallInviteEmail(user.email, hostName, title, callUrl, false).catch(() => {});
      }
      // WhatsApp
      if (user.phone) {
        await this.whatsapp.sendCallInviteMessage(user.phone, hostName, title, callUrl, false).catch(() => {});
      }
    }

    this.logger.log(`Appel ${call.id} lance par ${hostId}`);
    return { ...call, callUrl };
  }

  // ── Planifier un appel ────────────────────────────────────────────────────

  async scheduleCall(hostId: string, input: {
    title: string;
    scheduledAt: Date;
    channelId?: string;
    dmId?: string;
    participantIds: string[];
  }) {
    const call = await this.prisma.videoCall.create({
      data: {
        hostId,
        title: input.title,
        status: 'SCHEDULED',
        scheduledAt: input.scheduledAt,
        channelId: input.channelId,
        dmId: input.dmId,
        participants: {
          create: [
            { userId: hostId },
            ...input.participantIds
              .filter((id) => id && id !== hostId)
              .map((userId) => ({ userId })),
          ],
        },
      },
      include: {
        host: { select: { id: true, username: true, fullName: true } },
        participants: { include: { user: { select: { id: true, email: true, phone: true, username: true, fullName: true } } } },
      },
    });

    const callUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:4200'}/call?room=${call.roomId}`;
    const hostName = call.host.fullName ?? call.host.username;
    const title = call.title ?? 'Visioconférence planifiée';

    // Message dans le channel ou DM
    await this.postCallMessage(call, callUrl, true);

    // Notifier tous les participants
    for (const p of call.participants) {
      if (p.userId === hostId) continue;
      const { user } = p;

      await this.prisma.notification.create({
        data: {
          userId: user.id,
          type: 'CALL_SCHEDULED',
          content: `${hostName} a planifié une visioconférence "${title}" le ${input.scheduledAt.toLocaleString('fr-FR')}.`,
        },
      });
      this.realtime.emitToUser(user.id, 'call:scheduled', {
        callId: call.id, roomId: call.roomId, hostName, title, callUrl,
        scheduledAt: input.scheduledAt,
      });

      if (user.email) {
        await this.mail.sendCallInviteEmail(user.email, hostName, title, callUrl, true, input.scheduledAt).catch(() => {});
      }
      if (user.phone) {
        await this.whatsapp.sendCallInviteMessage(user.phone, hostName, title, callUrl, true, input.scheduledAt).catch(() => {});
      }
    }

    this.logger.log(`Appel planifie ${call.id} pour ${input.scheduledAt}`);
    return { ...call, callUrl };
  }

  // ── Terminer un appel ─────────────────────────────────────────────────────

  async endCall(callId: string, userId?: string) {
    const call = await this.prisma.videoCall.findUnique({
      where: { id: callId },
      include: {
        host: { select: { id: true, username: true, fullName: true } },
        participants: { include: { user: { select: { id: true } } } },
      },
    });
    if (!call) throw new NotFoundException('Appel introuvable');

    const updated = await this.prisma.videoCall.update({
      where: { id: callId },
      data: { status: 'ENDED', endedAt: new Date() },
    });

    // Notifier tous les participants que l'appel est terminé
    for (const p of call.participants) {
      this.realtime.emitToUser(p.userId, 'call:ended', {
        callId, roomId: call.roomId,
      });
    }

    return updated;
  }

  // ── Annuler un appel planifié ──────────────────────────────────────────────

  async cancelCall(callId: string, userId: string) {
    const call = await this.prisma.videoCall.findUnique({
      where: { id: callId },
      include: {
        host: { select: { id: true, username: true, fullName: true } },
        participants: {
          include: { user: { select: { id: true, email: true, phone: true } } },
        },
      },
    });
    if (!call) throw new NotFoundException('Appel introuvable');
    if (call.hostId !== userId) {
      throw new NotFoundException('Seul l\'hôte peut annuler cet appel');
    }

    const updated = await this.prisma.videoCall.update({
      where: { id: callId },
      data: { status: 'CANCELLED' },
    });

    const hostName = call.host.fullName ?? call.host.username;
    const title = call.title ?? 'Visioconférence';
    const scheduledAt = call.scheduledAt ?? new Date();

    for (const p of call.participants) {
      if (p.userId === userId) continue;
      const { user } = p;

      await this.prisma.notification.create({
        data: {
          userId: user.id,
          type: 'CALL_CANCELLED',
          content: `La visioconférence "${title}" a été annulée par ${hostName}.`,
        },
      });
      this.realtime.emitToUser(user.id, 'call:cancelled', { callId, title });

      if (user.email) {
        await this.mail.sendCallCancelledEmail(user.email, hostName, title, scheduledAt).catch(() => {});
      }
      if (user.phone) {
        await this.whatsapp.sendCallCancelledMessage(user.phone, hostName, title, scheduledAt).catch(() => {});
      }
    }

    return updated;
  }

  // ── Détail d'un appel ─────────────────────────────────────────────────────

  async getCall(callId: string) {
    const call = await this.prisma.videoCall.findUnique({
      where: { id: callId },
      include: {
        host: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
        participants: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } },
      },
    });
    if (!call) throw new NotFoundException('Appel introuvable');
    const callUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:4200'}/call?room=${call.roomId}`;
    return { ...call, callUrl };
  }

  // ── Lister les appels d'un channel/DM ─────────────────────────────────────

  async listForRoom(channelId?: string, dmId?: string) {
    return this.prisma.videoCall.findMany({
      where: {
        ...(channelId ? { channelId } : {}),
        ...(dmId ? { dmId } : {}),
        status: { in: ['LIVE', 'SCHEDULED'] },
      },
      include: {
        host: { select: { id: true, username: true, avatarUrl: true } },
        participants: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  // ── Rappels planifiés (appelés par le scheduler) ──────────────────────────

  async sendReminders(type: '1h' | '5min' | 'now') {
    const now = new Date();
    let windowStart: Date;
    let windowEnd: Date;

    switch (type) {
      case '1h':
        windowStart = new Date(now.getTime() + 55 * 60 * 1000);
        windowEnd   = new Date(now.getTime() + 65 * 60 * 1000);
        break;
      case '5min':
        windowStart = new Date(now.getTime() + 2 * 60 * 1000);
        windowEnd   = new Date(now.getTime() + 7 * 60 * 1000);
        break;
      case 'now':
        windowStart = new Date(now.getTime() - 2 * 60 * 1000);
        windowEnd   = new Date(now.getTime() + 2 * 60 * 1000);
        break;
    }

    const calls = await this.prisma.videoCall.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { gte: windowStart, lte: windowEnd },
        NOT: { remindersSent: { has: type } },
      },
      include: {
        host: { select: { id: true, username: true, fullName: true } },
        participants: {
          include: { user: { select: { id: true, email: true, phone: true, username: true } } },
        },
      },
    });

    for (const call of calls) {
      const callUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:4200'}/call?room=${call.roomId}`;
      const hostName = call.host.fullName ?? call.host.username;
      const title = call.title ?? 'Visioconférence';
      const timeLabel = type === '1h' ? '1 heure' : type === '5min' ? '5 minutes' : "maintenant";

      for (const p of call.participants) {
        const { user } = p;

        await this.prisma.notification.create({
          data: {
            userId: user.id,
            type: 'CALL_REMINDER',
            content: `Rappel : "${title}" commence dans ${timeLabel}.`,
          },
        });
        this.realtime.emitToUser(user.id, 'call:reminder', {
          callId: call.id, roomId: call.roomId, title, callUrl, timeLabel,
        });
        if (user.email) {
          await this.mail.sendCallReminderEmail(user.email, title, callUrl, timeLabel).catch(() => {});
        }
        if (user.phone) {
          await this.whatsapp.sendCallReminderMessage(user.phone, title, callUrl, timeLabel).catch(() => {});
        }
      }

      // Si c'est l'heure, passer en LIVE
      if (type === 'now') {
        await this.prisma.videoCall.update({
          where: { id: call.id },
          data: { status: 'LIVE', startedAt: new Date() },
        });
      }

      // Marquer le rappel comme envoyé
      await this.prisma.videoCall.update({
        where: { id: call.id },
        data: { remindersSent: { push: type } },
      });

      this.logger.log(`Rappel ${type} envoye pour appel ${call.id}`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async postCallMessage(call: any, callUrl: string, scheduled: boolean) {
    const hostName = call.host.fullName ?? call.host.username;
    const title = call.title ?? 'Visioconférence';
    let content: string;

    if (scheduled) {
      const dt = new Date(call.scheduledAt).toLocaleString('fr-FR', {
        dateStyle: 'full', timeStyle: 'short',
      });
      content = `Visioconférence planifiée par ${hostName} : "${title}" — ${dt} — ${callUrl}`;
    } else {
      content = `${hostName} a lancé une visioconférence "${title}". Rejoindre : ${callUrl}`;
    }

    if (call.channelId) {
      await this.prisma.message.create({
        data: {
          senderId: call.hostId,
          channelId: call.channelId,
          type: 'TEXT',
          content,
        },
      });
      this.realtime.emitToChannel(call.channelId, 'message:new', {
        id: 'call-msg', senderId: call.hostId, channelId: call.channelId,
        type: 'TEXT', content, createdAt: new Date(),
        sender: { id: call.hostId, username: call.host.username, avatarUrl: null },
        reactions: [],
        isCallMessage: true,
        callUrl,
        roomId: call.roomId,
      });
    } else if (call.dmId) {
      await this.prisma.message.create({
        data: {
          senderId: call.hostId,
          dmId: call.dmId,
          type: 'TEXT',
          content,
        },
      });
      this.realtime.emitToChannel(call.dmId, 'message:new', {
        id: 'call-msg', senderId: call.hostId, dmId: call.dmId,
        type: 'TEXT', content, createdAt: new Date(),
        sender: { id: call.hostId, username: call.host.username, avatarUrl: null },
        reactions: [],
        isCallMessage: true,
        callUrl,
        roomId: call.roomId,
      });
    }
  }
}
