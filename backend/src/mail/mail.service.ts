import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

/**
 * Service d'envoi d'emails — supporte :
 * 1. Nodemailer SMTP Gmail avec App Password (recommandé)
 * 2. Resend si RESEND_API_KEY est configurée
 * 3. Console (dev) si rien n'est configuré
 *
 * Pour Gmail, vous devez :
 * 1. Activer la vérification en 2 étapes sur votre compte Google
 * 2. Générer un "Mot de passe d'application" sur https://myaccount.google.com/apppasswords
 * 3. Utiliser ce mot de passe de 16 caractères dans MAIL_PASSWORD
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private resend: any = null;

  constructor() {
    const smtpHost = process.env.MAIL_HOST;
    const smtpUser = process.env.MAIL_USERNAME;
    const smtpPass = process.env.MAIL_PASSWORD;

    if (smtpHost && smtpUser && smtpPass) {
      // Nettoyer le mot de passe — les App Passwords Google ont des espaces
      // qu'on doit supprimer : "xxxx xxxx xxxx xxxx" → "xxxxxxxxxxxxxxxx"
      const cleanPass = smtpPass.replace(/\s+/g, '');
      const port = Number(process.env.MAIL_PORT ?? 587);
      const isSSL = port === 465;

      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: isSSL,
        auth: {
          user: smtpUser,
          pass: cleanPass,
        },
        tls: { rejectUnauthorized: false },
        debug: false,
        logger: false,
      });

      this.logger.log(`MailService: SMTP configuré — ${smtpUser} via ${smtpHost}:${port}`);
    } else {
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Resend } = require('resend');
        this.resend = new Resend(resendKey);
        this.logger.log('MailService: Resend configuré');
      } else {
        this.logger.warn(
          'MailService: Aucun backend email configuré.\n' +
          '  → Pour Gmail : activez la vérification en 2 étapes, puis générez un\n' +
          '    Mot de passe d\'application sur https://myaccount.google.com/apppasswords\n' +
          '    et mettez-le dans MAIL_PASSWORD (sans espaces).',
        );
      }
    }
  }

  /** Envoie un email via le backend configuré */
  private async send(to: string, subject: string, html: string): Promise<void> {
    const from =
      process.env.MAIL_FROM ??
      `Fluxo <${process.env.MAIL_USERNAME ?? 'no-reply@fluxo.app'}>`;

    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({ from, to, subject, html });
        this.logger.log(`✅ Email envoyé via SMTP : ${info.messageId} → ${to}`);
        // Si Ethereal (test), afficher le lien de prévisualisation
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
          this.logger.log(`📧 Prévisualisation email (Ethereal) : ${previewUrl}`);
        }
        return;
      } catch (smtpErr: any) {
        this.logger.error(`❌ Échec SMTP : ${smtpErr?.message}`);
        // Fallback : utiliser Ethereal en dev pour ne pas bloquer
        if (process.env.NODE_ENV !== 'production') {
          await this.sendViaEthereal(to, subject, html, from);
          return;
        }
        throw smtpErr;
      }
    }

    if (this.resend) {
      await this.resend.emails.send({ from, to, subject, html });
      this.logger.log(`✅ Email envoyé via Resend → ${to}`);
      return;
    }

    // Aucun backend — utiliser Ethereal en dev
    if (process.env.NODE_ENV !== 'production') {
      await this.sendViaEthereal(to, subject, html, from);
      return;
    }

    this.logger.warn('📭 Email non envoyé (aucun backend configuré)');
    this.logger.log(`   To: ${to} | Subject: ${subject}`);
  }

  /** Envoie via Ethereal (email de test gratuit, prévisualisation dans les logs) */
  private async sendViaEthereal(to: string, subject: string, html: string, from: string): Promise<void> {
    try {
      const testAccount = await nodemailer.createTestAccount();
      const testTransporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      const info = await testTransporter.sendMail({ from, to, subject, html });
      const previewUrl = nodemailer.getTestMessageUrl(info);
      this.logger.warn('📧 Email envoyé via Ethereal (mode test) :');
      this.logger.warn(`   Destinataire réel : ${to}`);
      this.logger.warn(`   Prévisualisation  : ${previewUrl}`);
    } catch (err: any) {
      this.logger.error(`Impossible d'envoyer via Ethereal : ${err?.message}`);
    }
  }

  async sendInvitationEmail(to: string, projectName: string, inviteUrl: string) {
    const subject = `Invitation au projet "${projectName}" sur Fluxo`;
    const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#166553;padding:24px;text-align:center;">
            <span style="font-size:32px;font-weight:900;color:white;letter-spacing:-1px;">Fluxo</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <h2 style="color:#111827;margin:0 0 12px;">Vous êtes invité·e à collaborer !</h2>
            <p style="color:#374151;margin:0 0 24px;line-height:1.6;">
              Vous avez été invité·e à rejoindre le projet
              <strong style="color:#166553;">${projectName}</strong>.
            </p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${inviteUrl}"
                 style="display:inline-block;background:#166553;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">
                Accepter l'invitation
              </a>
            </div>
            <p style="color:#9ca3af;font-size:12px;margin:0;">
              Ce lien expire dans 7 jours. Si vous n'attendiez pas cette invitation, ignorez cet email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:16px 36px;text-align:center;border-top:1px solid #e5e7eb;">
            <span style="color:#6b7280;font-size:12px;">© 2026 Fluxo — Gestion de projet collaborative</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    await this.send(to, subject, html);
  }

  async sendDueDateReminderEmail(
    to: string,
    taskTitle: string,
    projectName: string,
    dueDate: Date,
  ) {
    const formattedDate = dueDate.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
    const subject = `⏰ Rappel d'échéance : « ${taskTitle} »`;
    const html = `
<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f3f4f6;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#166553;padding:24px;text-align:center;">
            <span style="font-size:32px;font-weight:900;color:white;letter-spacing:-1px;">Fluxo</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <h2 style="color:#111827;margin:0 0 12px;">⏰ Rappel d'échéance</h2>
            <p style="color:#374151;line-height:1.6;">
              La tâche <strong style="color:#166553;">${taskTitle}</strong>
              dans le projet <strong>${projectName}</strong>
              arrive à échéance le <strong>${formattedDate}</strong>.
            </p>
            <p style="color:#9ca3af;font-size:12px;margin-top:24px;">
              Connectez-vous à Fluxo pour mettre à jour son statut.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    await this.send(to, subject, html);
  }

  /** Test de connexion SMTP */
  async testConnection(): Promise<{ ok: boolean; message: string; hint?: string }> {
    if (!this.transporter) {
      if (this.resend) return { ok: true, message: 'Resend configuré (pas de SMTP)' };
      return {
        ok: false,
        message: 'Aucun backend email configuré',
        hint:
          'Pour activer les emails :\n' +
          '  Option A (Gmail) :\n' +
          '    1. Activez la vérification en 2 étapes sur votre compte Google\n' +
          '    2. Allez sur https://myaccount.google.com/apppasswords\n' +
          '    3. Créez un App Password pour "Fluxo"\n' +
          '    4. Mettez le code 16 chars dans MAIL_PASSWORD du .env\n' +
          '  Option B (Resend) :\n' +
          '    1. Créez un compte sur https://resend.com (gratuit 3000 emails/mois)\n' +
          '    2. Générez une API key\n' +
          '    3. Mettez-la dans RESEND_API_KEY du .env',
      };
    }
    try {
      await this.transporter.verify();
      return { ok: true, message: `Connexion SMTP réussie (${process.env.MAIL_HOST})` };
    } catch (err: any) {
      const isGmailBadCreds = err?.message?.includes('BadCredentials') || err?.message?.includes('Username and Password');
      return {
        ok: false,
        message: `Erreur SMTP : ${err?.message ?? 'inconnue'}`,
        hint: isGmailBadCreds
          ? '→ Gmail : Votre MAIL_PASSWORD doit être un App Password Google (16 chars).\n' +
            '  Allez sur https://myaccount.google.com/apppasswords pour en générer un.\n' +
            '  Assurez-vous que la vérification en 2 étapes est activée.'
          : undefined,
      };
    }
  }
}
