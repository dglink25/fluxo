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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private workspacesService: WorkspacesService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.workspacesService.findAllForUser(user.userId);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateWorkspaceDto) {
    return this.workspacesService.create(user.userId, dto);
  }

  @Get(':workspaceId')
  findOne(@CurrentUser() user: any, @Param('workspaceId') workspaceId: string) {
    return this.workspacesService.findOne(user.userId, workspaceId);
  }

  @Patch(':workspaceId')
  update(
    @CurrentUser() user: any,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(user.userId, workspaceId, dto);
  }

  @Delete(':workspaceId')
  remove(@CurrentUser() user: any, @Param('workspaceId') workspaceId: string) {
    return this.workspacesService.remove(user.userId, workspaceId);
  }

  @Get(':workspaceId/projects')
  getProjects(@CurrentUser() user: any, @Param('workspaceId') workspaceId: string) {
    return this.workspacesService.getProjects(user.userId, workspaceId);
  }
}
