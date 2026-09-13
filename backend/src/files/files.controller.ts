import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsNumber, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRolesGuard } from '../common/guards/project-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FilesService } from './files.service';

class CreateFileDto {
  @IsString() name: string;
  @IsNumber() size: number;
  @IsString() mimeType: string;
  @IsString() url: string;
}

@UseGuards(JwtAuthGuard, ProjectRolesGuard)
@Controller('projects/:projectId/files')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get()
  list(@Param('projectId') projectId: string, @CurrentUser() user: any) {
    return this.filesService.listForProject(projectId, user.userId);
  }

  /** Déclarer un fichier uploadé (l'upload réel se fait côté client vers S3/Cloudinary) */
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Post()
  create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateFileDto,
  ) {
    return this.filesService.create(projectId, user.userId, dto);
  }

  /** Ajouter une nouvelle version d'un fichier existant */
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
}
