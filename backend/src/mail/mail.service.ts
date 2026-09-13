import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

/**
 * Service d'envoi d'emails (invitations, vérification de compte...).
 * Utilise Resend. Si RESEND_API_KEY n'est pas configurée (ex. en dev),
 * les emails sont simplement affichés dans la console.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend | null = null;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      this.resend = new Resend(apiKey);
    }
  }

  async sendInvitationEmail(to: string, projectName: string, inviteUrl: string) {
    const subject = `Invitation à rejoindre le projet "${projectName}" sur Fluxo`;
    const html = `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color:#166553;">Vous êtes invité·e sur Fluxo</h2>
        <p>Vous avez été invité·e à rejoindre le projet <strong>${projectName}</strong>.</p>
        <p><a href="${inviteUrl}" style="background:#166553;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;">Accepter l'invitation</a></p>
        <p style="color:#888;font-size:12px;">Ce lien expire dans 7 jours.</p>
      </div>`;

    if (!this.resend) {
      this.logger.warn(`[DEV] Email non envoyé (RESEND_API_KEY absente). Destinataire: ${to}`);
      this.logger.log(`Lien d'invitation: ${inviteUrl}`);
      return;
    }

    await this.resend.emails.send({
      from: process.env.MAIL_FROM ?? 'Fluxo <no-reply@fluxo.app>',
      to,
      subject,
      html,
    });
  }
}
