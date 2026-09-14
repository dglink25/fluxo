import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
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

  /**
   * Liste les dépôts GitHub accessibles avec le token fourni.
   * Utilisé pour le sélecteur de repo dans le frontend.
   * Accessible par les Owners uniquement.
   */
  @UseGuards(JwtAuthGuard, ProjectRolesGuard)
  @Roles('OWNER')
  @Get('repos')
  listRepos(@Query('token') token: string) {
    if (!token) {
      return { error: 'Parametre token manquant' };
    }
    return this.github.listUserRepos(token);
  }

  /** Connecter un dépôt GitHub au projet (crée le webhook automatiquement) */
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
   * Webhook GitHub — reçoit les événements push.
   * Endpoint public (pas de JWT) — GitHub envoie directement ici.
   */
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Param('projectId') projectId: string,
    @Headers('x-github-event') event: string,
    @Body() payload: any,
  ) {
    if (event !== 'push') {
      this.logger.debug(`Evenement GitHub ignore : ${event}`);
      return { ok: true, skipped: true };
    }
    this.logger.log(`Webhook push recu pour le projet ${projectId}`);
    return this.github.handlePushEvent(projectId, payload);
  }
}
