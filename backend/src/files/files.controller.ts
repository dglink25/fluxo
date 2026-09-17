import {
  Body, Controller, Delete, Get, Param, Post, UseGuards,
} from '@nestjs/common';
import { IsNumber, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRolesGuard } from '../common/guards/project-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FilesService } from './files.service';

class CreateFileDto {
  @IsString()
  name: string;

  @Type(() => Number)
  @IsNumber()
  size: number;

  @IsString()
  mimeType: string;

  @IsString()
  url: string;
}

class CreateFileCommentDto {
  @IsString()
  @MinLength(1)
  content: string;
}

@UseGuards(JwtAuthGuard, ProjectRolesGuard)
@Controller('projects/:projectId/files')
export class FilesController {
  constructor(private filesService: FilesService) {}

  /** GET /projects/:projectId/files — Lister les fichiers */
  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get()
  list(@Param('projectId') projectId: string, @CurrentUser() user: any) {
    return this.filesService.listForProject(projectId, user.userId);
  }

  /** POST /projects/:projectId/files — Déposer un nouveau fichier */
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Post()
  create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateFileDto,
  ) {
    return this.filesService.create(projectId, user.userId, dto);
  }

  /** POST /projects/:projectId/files/:fileId/versions — Nouvelle version */
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Post(':fileId/versions')
  addVersion(
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateFileDto,
  ) {
    return this.filesService.addVersion(projectId, fileId, user.userId, dto);
  }

  /** GET /projects/:projectId/files/:fileId/comments — Lister les commentaires */
  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get(':fileId/comments')
  listComments(
    @Param('fileId') fileId: string,
    @CurrentUser() user: any,
  ) {
    return this.filesService.listComments(fileId, user.userId);
  }

  /** POST /projects/:projectId/files/:fileId/comments — Commenter un fichier */
  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Post(':fileId/comments')
  addComment(
    @Param('fileId') fileId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateFileCommentDto,
  ) {
    return this.filesService.addComment(fileId, user.userId, dto.content);
  }

  /** DELETE /projects/:projectId/files/:fileId/comments/:commentId */
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Delete(':fileId/comments/:commentId')
  deleteComment(
    @Param('commentId') commentId: string,
    @CurrentUser() user: any,
  ) {
    return this.filesService.deleteComment(commentId, user.userId);
  }
}
