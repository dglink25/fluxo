import {
  Body, Controller, Delete, Get, Headers,
  HttpCode, Logger, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRolesGuard } from '../common/guards/project-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GithubService } from './github.service';

class ConnectRepoDto {
  @IsString() repoFullName: string;
}

@Controller('projects/:projectId/github')
export class GithubController {
  private readonly logger = new Logger(GithubController.name);

  constructor(private github: GithubService) {}

  /** Liste les repos GitHub disponibles (via token stocké) */
  @UseGuards(JwtAuthGuard, ProjectRolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Get('repos')
  async listAvailableRepos(@CurrentUser() user: any) {
    const token = await this.github.getTokenForUser(user.userId);
    return this.github.listUserRepos(token);
  }

  /** Liste les repos connectés au projet (depuis la BDD) */
  @UseGuards(JwtAuthGuard, ProjectRolesGuard)
  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get('connected')
  listConnected(@Param('projectId') projectId: string) {
    return this.github.listProjectRepositories(projectId);
  }

  /** Connecter un dépôt au projet */
  @UseGuards(JwtAuthGuard, ProjectRolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Post('connect')
  connectRepository(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() dto: ConnectRepoDto,
  ) {
    return this.github.connectRepository(projectId, user.userId, dto.repoFullName);
  }

  /** Déconnecter un dépôt */
  @UseGuards(JwtAuthGuard, ProjectRolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Delete('disconnect')
  disconnectRepository(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Query('repo') repo: string,
  ) {
    return this.github.disconnectRepository(projectId, repo, user.userId);
  }

  /** Webhook GitHub — push events */
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Param('projectId') projectId: string,
    @Headers('x-github-event') event: string,
    @Body() payload: any,
  ) {
    if (event !== 'push') {
      return { ok: true, skipped: true };
    }
    this.logger.log(`Webhook push recu pour le projet ${projectId}`);
    return this.github.handlePushEvent(projectId, payload);
  }
}
