import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRolesGuard } from '../common/guards/project-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  DocumentsService,
  CreateDocumentDto,
  UpdateDocumentDto,
} from './documents.service';

@UseGuards(JwtAuthGuard, ProjectRolesGuard)
@Controller('projects/:projectId/documents')
export class DocumentsController {
  constructor(private documents: DocumentsService) {}

  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get()
  list(@Param('projectId') projectId: string, @CurrentUser() user: any) {
    return this.documents.list(projectId, user.userId);
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Post()
  create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.documents.create(projectId, user.userId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Patch(':documentId')
  update(
    @Param('documentId') documentId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documents.update(documentId, user.userId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get(':documentId/versions')
  versions(@Param('documentId') documentId: string, @CurrentUser() user: any) {
    return this.documents.getVersions(documentId, user.userId);
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':documentId')
  remove(@Param('documentId') documentId: string, @CurrentUser() user: any) {
    return this.documents.remove(documentId, user.userId);
  }
}
