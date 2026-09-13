import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsEmail, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService, UpdateProfileDto } from './users.service';
import { MailService } from '../mail/mail.service';

class TestEmailDto {
  @IsEmail()
  to: string;

  @IsString()
  subject: string;
}

@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private mail: MailService,
  ) {}

  /** Recherche d'utilisateurs par pseudo (accès authentifié) */
  @UseGuards(JwtAuthGuard)
  @Get('search')
  search(@Query('q') q: string) {
    return this.usersService.searchByUsername(q ?? '');
  }

  /** Profil de l'utilisateur courant */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return this.usersService.findById(user.userId);
  }

  /** Mise à jour du profil de l'utilisateur courant */
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.userId, dto);
  }

  /** Heatmap d'activité de l'utilisateur courant */
  @UseGuards(JwtAuthGuard)
  @Get('me/heatmap')
  myHeatmap(@CurrentUser() user: any) {
    return this.usersService.getActivityHeatmap(user.userId);
  }

  /**
   * Test d'envoi d'email — envoie un email de test au destinataire fourni.
   * Utile pour vérifier la configuration SMTP en développement.
   */
  @UseGuards(JwtAuthGuard)
  @Post('test-email')
  async testEmail(@Body() dto: TestEmailDto, @CurrentUser() user: any) {
    const smtpStatus = await this.mail.testConnection();
    await this.mail.sendInvitationEmail(
      dto.to,
      'Projet de test Fluxo',
      `${process.env.FRONTEND_URL ?? 'http://localhost:4200'}/invitations/test-token`,
    );
    return {
      sent: true,
      to: dto.to,
      smtp: smtpStatus,
      message: `Email de test envoyé à ${dto.to}`,
    };
  }

  /** Profil public d'un utilisateur par username */
  @Get('profile/:username')
  publicProfile(@Param('username') username: string) {
    return this.usersService.getPublicProfile(username);
  }

  /** Profil par ID (accès authentifié) */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
