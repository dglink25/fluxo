import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRolesGuard } from '../common/guards/project-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@UseGuards(JwtAuthGuard, ProjectRolesGuard)
@Controller('projects/:projectId/tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @Query('status') status?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('priority') priority?: string,
  ) {
    return this.tasksService.findAllForProject(projectId, { status, assigneeId, priority });
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get(':taskId')
  findOne(@Param('taskId') taskId: string) {
    return this.tasksService.findOne(taskId);
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Post()
  create(@Param('projectId') projectId: string, @CurrentUser() user: any, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(projectId, user.userId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Patch(':taskId')
  update(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(projectId, user.userId, taskId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Delete(':taskId')
  remove(@Param('taskId') taskId: string) {
    return this.tasksService.remove(taskId);
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Post(':taskId/subtasks')
  addSubtask(@Param('taskId') taskId: string, @Body('title') title: string) {
    return this.tasksService.addSubtask(taskId, title);
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Patch(':taskId/subtasks/:subtaskId')
  toggleSubtask(@Param('subtaskId') subtaskId: string, @Body('done') done: boolean) {
    return this.tasksService.toggleSubtask(subtaskId, done);
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Post(':taskId/comments')
  addComment(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: any,
    @Body('content') content: string,
    @Body('fileUrl') fileUrl?: string,
    @Body('fileName') fileName?: string,
    @Body('fileType') fileType?: string,
  ) {
    const attachment = fileUrl ? { fileUrl, fileName: fileName ?? fileUrl, fileType: fileType ?? 'FILE' } : undefined;
    return this.tasksService.addComment(projectId, taskId, user.userId, content ?? '', attachment);
  }
}
