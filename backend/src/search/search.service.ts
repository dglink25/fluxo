import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  /**
   * Recherche globale dans les projets, tâches, utilisateurs et messages
   * accessibles par l'utilisateur courant.
   * Minimum 2 caractères, respect des droits d'accès.
   */
  async search(query: string, userId: string) {
    if (!query || query.trim().length < 2) return { projects: [], tasks: [], users: [], messages: [] };

    const q = query.trim();

    // IDs des projets accessibles par l'utilisateur
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    });
    const projectIds = memberships.map((m) => m.projectId);

    // Projets publics + projets de l'utilisateur
    const [projects, tasks, users, messages] = await Promise.all([
      this.prisma.project.findMany({
        where: {
          archived: false,
          OR: [
            { visibility: 'PUBLIC', name: { contains: q, mode: 'insensitive' } },
            { id: { in: projectIds }, name: { contains: q, mode: 'insensitive' } },
            { id: { in: projectIds }, description: { contains: q, mode: 'insensitive' } },
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
      }),

      this.prisma.task.findMany({
        where: {
          projectId: { in: projectIds },
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          projectId: true,
          project: { select: { name: true } },
        },
        take: 15,
      }),

      this.prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: q, mode: 'insensitive' } },
            { fullName: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          username: true,
          fullName: true,
          avatarUrl: true,
        },
        take: 10,
      }),

      this.prisma.message.findMany({
        where: {
          content: { contains: q, mode: 'insensitive' },
          channel: { project: { id: { in: projectIds } } },
        },
        select: {
          id: true,
          content: true,
          createdAt: true,
          channelId: true,
          sender: { select: { id: true, username: true, avatarUrl: true } },
          channel: { select: { id: true, name: true, projectId: true } },
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { projects, tasks, users, messages };
  }
}
