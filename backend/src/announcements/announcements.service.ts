import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

@Injectable()
export class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
  ) {}

  async list(projectId: string) {
    // Les annonces sont stockées comme des Activity de type ANNOUNCEMENT avec un JSON riche
    return this.prisma.activity.findMany({
      where: { projectId, type: 'ANNOUNCEMENT' },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
      orderBy: [
        // épinglées d'abord, puis par date
        { createdAt: 'desc' },
      ],
    });
  }

  async create(projectId: string, userId: string, dto: CreateAnnouncementDto) {
    await this.assertOwnerOrAdmin(projectId, userId);

    const announcement = await this.prisma.activity.create({
      data: {
        projectId,
        userId,
        type: 'ANNOUNCEMENT',
        details: {
          title: dto.title,
          content: dto.content,
          pinned: dto.pinned ?? false,
        },
      },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });

    // Notifier tous les membres du projet
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, userId: { not: userId } },
    });

    await this.prisma.notification.createMany({
      data: members.map((m) => ({
        userId: m.userId,
        type: 'ANNOUNCEMENT',
        content: `Nouvelle annonce dans le projet : « ${dto.title} »`,
      })),
    });

    // Diffuser en temps réel
    this.realtime.emitToProject(projectId, 'announcement:new', announcement);
    for (const m of members) {
      this.realtime.emitToUser(m.userId, 'notification:new', { type: 'ANNOUNCEMENT' });
    }

    return announcement;
  }

  async pin(activityId: string, userId: string, pinned: boolean) {
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId } });
    if (!activity || activity.type !== 'ANNOUNCEMENT') {
      throw new NotFoundException('Annonce introuvable');
    }
    await this.assertOwnerOrAdmin(activity.projectId, userId);

    const details = (activity.details as any) ?? {};
    return this.prisma.activity.update({
      where: { id: activityId },
      data: { details: { ...details, pinned } },
    });
  }

  private async assertOwnerOrAdmin(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
      throw new ForbiddenException('Rôle insuffisant');
    }
  }
}
