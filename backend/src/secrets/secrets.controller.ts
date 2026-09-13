import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRolesGuard } from '../common/guards/project-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SecretsService } from './secrets.service';

// ── DTOs ──────────────────────────────────────────────────────────────────────

class UpsertSecretDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  value: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class ImportEnvDto {
  @IsString()
  @MinLength(1)
  content: string;
}

class UploadConfidentialFileDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  fileType?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

// ── Controller Variables d'environnement ──────────────────────────────────────

@UseGuards(JwtAuthGuard, ProjectRolesGuard)
@Controller('projects/:projectId/secrets')
export class SecretsController {
  constructor(private secrets: SecretsService) {}

  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get()
  list(@Param('projectId') projectId: string, @CurrentUser() user: any) {
    return this.secrets.listSecrets(projectId, user.userId);
  }

  @Roles('OWNER', 'ADMIN')
  @Put()
  upsert(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() dto: UpsertSecretDto,
  ) {
    return this.secrets.upsertSecret(
      projectId,
      user.userId,
      dto.name,
      dto.value,
      dto.description,
    );
  }

  @Roles('OWNER', 'ADMIN')
  @Post('import')
  importEnv(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() dto: ImportEnvDto,
  ) {
    return this.secrets.importEnvFile(projectId, user.userId, dto.content);
  }

  /**
   * Export .env — retourne le contenu en JSON pour que le frontend
   * crée le téléchargement côté client (évite le token en query param).
   */
  @Roles('OWNER', 'ADMIN')
  @Get('export')
  async exportEnv(@Param('projectId') projectId: string, @CurrentUser() user: any) {
    return this.secrets.exportEnv(projectId, user.userId);
  }

  @Roles('OWNER', 'ADMIN')
  @Get(':secretId/reveal')
  reveal(@Param('secretId') secretId: string, @CurrentUser() user: any) {
    return this.secrets.revealSecret(secretId, user.userId, 'VIEW');
  }

  @Roles('OWNER', 'ADMIN')
  @Get(':secretId/copy-value')
  copyValue(@Param('secretId') secretId: string, @CurrentUser() user: any) {
    return this.secrets.revealSecret(secretId, user.userId, 'COPY');
  }

  @Roles('OWNER', 'ADMIN')
  @Get(':secretId/logs')
  logs(@Param('secretId') secretId: string, @CurrentUser() user: any) {
    return this.secrets.getSecretLogs(secretId, user.userId);
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':secretId')
  delete(@Param('secretId') secretId: string, @CurrentUser() user: any) {
    return this.secrets.deleteSecret(secretId, user.userId);
  }
}

// ── Controller Fichiers confidentiels ─────────────────────────────────────────

@UseGuards(JwtAuthGuard, ProjectRolesGuard)
@Controller('projects/:projectId/confidential-files')
export class ConfidentialFilesController {
  constructor(private secrets: SecretsService) {}

  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get()
  list(@Param('projectId') projectId: string, @CurrentUser() user: any) {
    return this.secrets.listConfidentialFiles(projectId, user.userId);
  }

  @Roles('OWNER', 'ADMIN')
  @Post()
  upload(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() dto: UploadConfidentialFileDto,
  ) {
    return this.secrets.uploadConfidentialFile(projectId, user.userId, dto);
  }

  /**
   * Téléchargement — retourne le contenu en JSON pour téléchargement côté client.
   */
  @Roles('OWNER', 'ADMIN')
  @Get(':fileId/download')
  async download(@Param('fileId') fileId: string, @CurrentUser() user: any) {
    return this.secrets.downloadConfidentialFile(fileId, user.userId);
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':fileId')
  delete(@Param('fileId') fileId: string, @CurrentUser() user: any) {
    return this.secrets.deleteConfidentialFile(fileId, user.userId);
  }
}
