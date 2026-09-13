import { Body, Controller, Get, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  @Get()
  async check() {
    let dbStatus = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    const smtpStatus = await this.mail.testConnection();

    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        api: 'ok',
        database: dbStatus,
        smtp: smtpStatus,
      },
    };
  }

  /**
   * Endpoint de test email — accessible sans authentification.
   * À utiliser uniquement en développement pour vérifier la config SMTP.
   * Désactiver en production via une variable d'environnement.
   */
  @Post('test-email')
  async testEmail(@Body() body: { to: string }) {
    if (process.env.NODE_ENV === 'production') {
      return { error: 'Endpoint désactivé en production' };
    }

    const to = body.to ?? 'test@example.com';

    const smtpStatus = await this.mail.testConnection();

    try {
      await this.mail.sendInvitationEmail(
        to,
        'Projet de démonstration Fluxo',
        `${process.env.FRONTEND_URL ?? 'http://localhost:4200'}/invitations/demo-token`,
      );
      return {
        sent: true,
        to,
        smtp: smtpStatus,
        message: `Email de test envoyé avec succès à ${to}`,
      };
    } catch (err: any) {
      return {
        sent: false,
        to,
        smtp: smtpStatus,
        error: err?.message ?? 'Erreur inconnue lors de l\'envoi',
      };
    }
  }
}
