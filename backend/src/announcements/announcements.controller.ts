import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRolesGuard } from '../common/guards/project-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AnnouncementsService, CreateAnnouncementDto } from './announcements.service';

@UseGuards(JwtAuthGuard, ProjectRolesGuard)
@Controller('projects/:projectId/announcements')
export class AnnouncementsController {
  constructor(private announcements: AnnouncementsService) {}

  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get()
  list(@Param('projectId') projectId: string) {
    return this.announcements.list(projectId);
  }

  @Roles('OWNER', 'ADMIN')
  @Post()
  create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.announcements.create(projectId, user.userId, dto);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':id/pin')
  pin(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('pinned') pinned: boolean,
  ) {
    return this.announcements.pin(id, user.userId, pinned ?? true);
  }
}
