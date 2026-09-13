import { SetMetadata } from '@nestjs/common';
import { ProjectRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
/**
 * Rôles minimum requis sur le PROJET pour accéder à la route.
 * Usage: @Roles('OWNER', 'ADMIN')
 */
export const Roles = (...roles: ProjectRole[]) => SetMetadata(ROLES_KEY, roles);
