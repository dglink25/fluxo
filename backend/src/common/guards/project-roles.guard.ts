import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Vérifie que l'utilisateur courant a bien un rôle suffisant sur le
 * projet ciblé par la route (paramètre :projectId dans l'URL).
 * Hiérarchie : OWNER > ADMIN > MEMBER > READER
 */
@Injectable()
export class ProjectRolesGuard implements CanActivate {
  private hierarchy: ProjectRole[] = ['OWNER', 'ADMIN', 'MEMBER', 'READER'] as any;

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<ProjectRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const projectId = req.params.projectId ?? req.params.id ?? req.body?.projectId;
    const userId = req.user?.userId;
    if (!projectId || !userId) throw new ForbiddenException('Accès refusé');

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!membership) throw new ForbiddenException("Vous n'êtes pas membre de ce projet");

    const allowedMinIndex = Math.min(
      ...requiredRoles.map((r) => this.hierarchy.indexOf(r)),
    );
    const userIndex = this.hierarchy.indexOf(membership.role);

    if (userIndex > allowedMinIndex) {
      throw new ForbiddenException('Rôle insuffisant pour cette action');
    }
    req.projectMembership = membership;
    return true;
  }
}
