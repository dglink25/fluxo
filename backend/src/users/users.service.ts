import { Injectable, NotFoundException } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        avatarUrl: true,
        bio: true,
        phoneVerified: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  async findByUsername(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        fullName: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  async searchByUsername(query: string) {
    if (!query || query.trim().length < 2) return [];
    return this.prisma.user.findMany({
      where: { username: { contains: query.trim(), mode: 'insensitive' } },
      select: { id: true, username: true, fullName: true, avatarUrl: true },
      take: 10,
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName,
        bio: dto.bio,
      },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        avatarUrl: true,
        bio: true,
        phoneVerified: true,
      },
    });
  }

  /**
   * Heatmap d'activité GitHub-style : nombre d'activités par jour
   * sur les 365 derniers jours pour un utilisateur donné.
   * Retourne un tableau de { date: 'YYYY-MM-DD', count: number }
   */
  async getActivityHeatmap(userId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 364);

    const activities = await this.prisma.activity.findMany({
      where: {
        userId,
        createdAt: { gte: since },
      },
      select: { createdAt: true },
    });

    // Regrouper par jour
    const map = new Map<string, number>();
    for (const { createdAt } of activities) {
      const day = createdAt.toISOString().slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + 1);
    }

    return Array.from(map.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getPublicProfile(username: string) {
    const user = await this.findByUsername(username);

    const heatmap = await this.getActivityHeatmap(user.id);

    const publicProjects = await this.prisma.project.findMany({
      where: {
        visibility: 'PUBLIC',
        archived: false,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
        visibility: true,
        _count: { select: { tasks: true, members: true } },
      },
      take: 10,
      orderBy: { updatedAt: 'desc' },
    });

    return { ...user, heatmap, publicProjects };
  }
}
