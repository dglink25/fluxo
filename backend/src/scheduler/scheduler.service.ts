import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MailService } from '../mail/mail.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
    private mail: MailService,
  ) {}

  /**
   * Rappel d'échéance — tourne toutes les heures.
   * Cherche les tâches dont la dueDate est dans les prochaines 24h
   * et dont le rappel n'a pas encore été envoyé.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sendDueDateReminders() {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const tasksDue = await this.prisma.task.findMany({
      where: {
        status: { not: 'DONE' },
        dueDate: { gte: now, lte: in24h },
        assigneeId: { not: null },
      },
      include: {
        assignee: { select: { id: true, email: true, username: true } },
        project: { select: { name: true } },
      },
    });

    for (const task of tasksDue) {
      if (!task.assignee) continue;

      // Vérifier qu'on n'a pas déjà envoyé ce rappel aujourd'hui
      const existingNotif = await this.prisma.notification.findFirst({
        where: {
          userId: task.assignee.id,
          type: 'DUE_DATE_REMINDER',
          content: { contains: task.id },
          createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
        },
      });
      if (existingNotif) continue;

      const content = `La tâche « ${task.title} » dans le projet « ${task.project.name} » arrive à échéance dans moins de 24h.`;

      await this.prisma.notification.create({
        data: {
          userId: task.assignee.id,
          type: 'DUE_DATE_REMINDER',
          content: `${content} [taskId:${task.id}]`,
        },
      });

      // Notifier en temps réel
      this.realtime.emitToUser(task.assignee.id, 'notification:new', {
        type: 'DUE_DATE_REMINDER',
        content,
      });

      // Envoyer un email de rappel
      try {
        await this.mail.sendDueDateReminderEmail(
          task.assignee.email,
          task.title,
          task.project.name,
          task.dueDate!,
        );
      } catch (err) {
        this.logger.warn(`Impossible d'envoyer l'email de rappel pour la tâche ${task.id}: ${err}`);
      }
    }

    if (tasksDue.length > 0) {
      this.logger.log(`Rappels d'échéance envoyés pour ${tasksDue.length} tâche(s)`);
    }
  }

  /**
   * Nettoyage des OTP expirés — tourne toutes les nuits à 2h.
   */
  @Cron('0 2 * * *')
  async cleanupExpiredOtps() {
    const result = await this.prisma.phoneVerification.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { consumedAt: { not: null } },
        ],
      },
    });
    this.logger.log(`Nettoyage OTP : ${result.count} entrée(s) supprimée(s)`);
  }

  /**
   * Expiration automatique des invitations — tourne toutes les heures.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireInvitations() {
    const result = await this.prisma.invitation.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
    if (result.count > 0) {
      this.logger.log(`${result.count} invitation(s) expirée(s)`);
    }
  }
}
