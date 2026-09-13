import { Body, Controller, Get, Param, Post, Patch, UseGuards } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRolesGuard } from '../common/guards/project-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DeliverablesService } from './deliverables.service';

class CreateDeliverableDto {
  @IsOptional() @IsString() type?: string;
  @IsString() url: string;
  @IsString() name: string;
  @IsOptional() @IsNumber() size?: number;
}

@UseGuards(JwtAuthGuard, ProjectRolesGuard)
@Controller('projects/:projectId/tasks/:taskId/deliverables')
export class DeliverablesController {
  constructor(private deliverables: DeliverablesService) {}

  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get()
  list(@Param('taskId') taskId: string) {
    return this.deliverables.listForTask(taskId);
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Post()
  create(
    @Param('taskId') taskId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateDeliverableDto,
  ) {
    return this.deliverables.create(taskId, user.userId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Patch(':deliverableId/submit')
  submit(@Param('deliverableId') id: string, @CurrentUser() user: any) {
    return this.deliverables.submit(id, user.userId);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':deliverableId/validate')
  validate(@Param('deliverableId') id: string, @CurrentUser() user: any) {
    return this.deliverables.validate(id, user.userId);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':deliverableId/refuse')
  refuse(
    @Param('deliverableId') id: string,
    @CurrentUser() user: any,
    @Body('refusalNote') refusalNote: string,
  ) {
    return this.deliverables.refuse(id, user.userId, refusalNote);
  }
}
