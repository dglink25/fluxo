import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /** Notifications non lues de l'utilisateur, triées par date décroissante */
  async findUnread(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Marquer une ou toutes les notifications comme lues */
  async markRead(userId: string, notificationId?: string) {
    if (notificationId) {
      return this.prisma.notification.updateMany({
        where: { id: notificationId, userId },
        data: { read: true },
      });
    }
    // Marquer tout comme lu
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  /** Créer une notification (utilisé par d'autres services) */
  async create(userId: string, type: string, content: string) {
    return this.prisma.notification.create({
      data: { userId, type, content },
    });
  }

  /** Nombre de notifications non lues */
  async countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }
}
