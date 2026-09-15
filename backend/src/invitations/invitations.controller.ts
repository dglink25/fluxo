import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { InvitationTarget, ProjectRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRolesGuard } from '../common/guards/project-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InvitationsService } from './invitations.service';

class CreateInvitationDto {
  @IsEnum(InvitationTarget)
  type: InvitationTarget;

  @IsString()
  @MinLength(2)
  value: string;

  @IsOptional()
  @IsEnum(ProjectRole)
  role?: ProjectRole;
}

@Controller('projects/:projectId/invitations')
@UseGuards(JwtAuthGuard, ProjectRolesGuard)
export class InvitationsController {
  constructor(private invitationsService: InvitationsService) {}

  @Roles('OWNER', 'ADMIN')
  @Post()
  create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.create(projectId, user.userId, dto);
  }

  @Roles('OWNER', 'ADMIN')
  @Get()
  list(@Param('projectId') projectId: string) {
    return this.invitationsService.listForProject(projectId);
  }
}

/** Contrôleur séparé : consultation/acceptation d'une invitation par token, et invitations reçues */
@Controller('invitations')
export class InvitationTokenController {
  constructor(private invitationsService: InvitationsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  mine(@CurrentUser() user: any) {
    return this.invitationsService.listMine(user.userId);
  }

  @Get(':token')
  find(@Param('token') token: string) {
    return this.invitationsService.findByToken(token);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':token/accept')
  accept(@Param('token') token: string, @CurrentUser() user: any) {
    return this.invitationsService.accept(token, user.userId);
  }

  /** Réparer : si une invitation est acceptée mais l'utilisateur pas dans les membres */
  @UseGuards(JwtAuthGuard)
  @Post('repair')
  async repairMemberships(@CurrentUser() user: any) {
    return this.invitationsService.repairAcceptedInvitations(user.userId);
  }

  @Post(':token/decline')
  decline(@Param('token') token: string) {
    return this.invitationsService.decline(token);
  }
}
