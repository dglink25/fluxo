import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UseGuards,
  Logger,
  HttpCode,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRolesGuard } from '../common/guards/project-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GithubService } from './github.service';

class ConnectRepoDto {
  @IsString() repoFullName: string;
  @IsString() githubToken: string;
}

@Controller('projects/:projectId/github')
export class GithubController {
  private readonly logger = new Logger(GithubController.name);

  constructor(private github: GithubService) {}

  /** Connecter un dépôt GitHub (Owner uniquement, authentification requise) */
  @UseGuards(JwtAuthGuard, ProjectRolesGuard)
  @Roles('OWNER')
  @Post('connect')
  connectRepository(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() dto: ConnectRepoDto,
  ) {
    return this.github.connectRepository(projectId, user.userId, dto);
  }

  /**
   * Webhook GitHub — endpoint public (pas de JwtAuthGuard).
   * GitHub envoie un POST avec l'événement push.
   * On vérifie le X-GitHub-Event header pour n'accepter que les push.
   */
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Param('projectId') projectId: string,
    @Headers('x-github-event') event: string,
    @Headers('x-hub-signature-256') signature: string,
    @Body() payload: any,
  ) {
    if (event !== 'push') {
      this.logger.debug(`Événement GitHub ignoré : ${event}`);
      return { ok: true, skipped: true };
    }

    this.logger.log(`Webhook push reçu pour le projet ${projectId}`);
    return this.github.handlePushEvent(projectId, payload);
  }
}
