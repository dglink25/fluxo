import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRolesGuard } from '../common/guards/project-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@UseGuards(JwtAuthGuard, ProjectRolesGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.projectsService.findAllForUser(user.userId);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user.userId, dto);
  }

  @Get(':projectId')
  findOne(@CurrentUser() user: any, @Param('projectId') projectId: string) {
    return this.projectsService.findOne(user.userId, projectId);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':projectId')
  update(@Param('projectId') projectId: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(projectId, dto);
  }

  @Roles('OWNER')
  @Patch(':projectId/archive')
  archive(@Param('projectId') projectId: string) {
    return this.projectsService.archive(projectId);
  }

  @Roles('OWNER')
  @Delete(':projectId')
  remove(@Param('projectId') projectId: string) {
    return this.projectsService.remove(projectId);
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':projectId/members/:userId')
  removeMember(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    return this.projectsService.removeMember(projectId, userId, user.userId);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':projectId/members/:userId/role')
  changeMemberRole(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body('role') role: 'ADMIN' | 'MEMBER' | 'READER',
    @CurrentUser() user: any,
  ) {
    return this.projectsService.changeMemberRole(projectId, userId, role, user.userId);
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get(':projectId/activity')
  activity(@Param('projectId') projectId: string) {
    return this.projectsService.activityFeed(projectId);
  }
}
