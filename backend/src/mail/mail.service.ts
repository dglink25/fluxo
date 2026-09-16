import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

/**
 * Service d'envoi d'emails.
 * Backends supportés (par ordre de priorité) :
 *  1. Nodemailer SMTP (Gmail App Password recommandé)
 *  2. Resend (RESEND_API_KEY)
 *  3. Ethereal — email de test en dev (lien de prévisualisation dans les logs)
 *
 * Anti-spam : headers X-Priority, plaintext alternatif, pool de connexions.
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
      // Les App Passwords Gmail peuvent contenir des espaces ("xxxx xxxx xxxx xxxx")
      const cleanPass = smtpPass.replace(/\s+/g, '');
      const port = Number(process.env.MAIL_PORT ?? 587);
      const isSSL = port === 465;

      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: isSSL,
        auth: { user: smtpUser, pass: cleanPass },
        tls: { rejectUnauthorized: false },
        // Pool de connexions pour éviter les timeouts et améliorer la réputation
        pool: true,
        maxConnections: 3,
        rateDelta: 2000,
        rateLimit: 3,
        debug: false,
        logger: false,
      });

      this.logger.log(`MailService: SMTP configure — ${smtpUser} via ${smtpHost}:${port}`);
    } else {
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Resend } = require('resend');
        this.resend = new Resend(resendKey);
        this.logger.log('MailService: Resend configure');
      } else {
        this.logger.warn(
          'MailService: Aucun backend email configure.\n' +
          '  -> Gmail : activez la verification en 2 etapes puis generez un App Password\n' +
          '     sur https://myaccount.google.com/apppasswords\n' +
          '     et copiez le code 16 chars dans MAIL_PASSWORD (.env).',
        );
      }
    }
  }

  /**
   * Envoie un email via le backend configuré.
   * Le paramètre `text` (version plaintext) est obligatoire pour éviter le spam.
   */
  private async send(to: string, subject: string, html: string, text: string): Promise<void> {
    // MAIL_FROM doit correspondre exactement à l'adresse SMTP pour éviter le spam
    const from = process.env.MAIL_FROM ?? `Fluxo <${process.env.MAIL_USERNAME ?? 'no-reply@fluxo.app'}>`;

    // Headers anti-spam
    const antiSpamHeaders = {
      'X-Priority': '3',
      'X-MSMail-Priority': 'Normal',
      'X-Mailer': 'Fluxo Mailer 1.0',
      'Precedence': 'bulk',
      'List-Unsubscribe': `<mailto:${process.env.MAIL_USERNAME ?? 'no-reply@fluxo.app'}?subject=unsubscribe>`,
    };

    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from,
          to,
          subject,
          html,
          text,           // Toujours inclure une version plaintext — réduit le score spam
          headers: antiSpamHeaders,
          messageId: `<${Date.now()}.${Math.random().toString(36).slice(2)}@fluxo.app>`,
        });
        this.logger.log(`Email envoye via SMTP : ${info.messageId} -> ${to}`);
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
          this.logger.log(`Apercu email (Ethereal) : ${previewUrl}`);
        }
        return;
      } catch (smtpErr: any) {
        this.logger.error(`Echec SMTP : ${smtpErr?.message}`);
        if (process.env.NODE_ENV !== 'production') {
          await this.sendViaEthereal(to, subject, html, text, from);
          return;
        }
        throw smtpErr;
      }
    }

    if (this.resend) {
      await this.resend.emails.send({ from, to, subject, html, text, headers: antiSpamHeaders });
      this.logger.log(`Email envoye via Resend -> ${to}`);
      return;
    }

    // Dev sans configuration — Ethereal
    if (process.env.NODE_ENV !== 'production') {
      await this.sendViaEthereal(to, subject, html, text, from);
      return;
    }

    this.logger.warn(`Email non envoye (aucun backend configure). Destinataire: ${to}`);
  }

  private async sendViaEthereal(
    to: string, subject: string, html: string, text: string, from: string,
  ): Promise<void> {
    try {
      const testAccount = await nodemailer.createTestAccount();
      const t = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      const info = await t.sendMail({ from, to, subject, html, text });
      const previewUrl = nodemailer.getTestMessageUrl(info);
      this.logger.warn(`Email envoye via Ethereal (mode test)`);
      this.logger.warn(`  Destinataire reel : ${to}`);
      this.logger.warn(`  Apercu            : ${previewUrl}`);
    } catch (err: any) {
      this.logger.error(`Impossible d'envoyer via Ethereal : ${err?.message}`);
    }
  }

  // ── Emails métier ─────────────────────────────────────────────────────────

  async sendInvitationEmail(to: string, projectName: string, inviteUrl: string) {
    const subject = `Invitation au projet "${projectName}" sur Fluxo`;
    const text = `Vous avez ete invite(e) a rejoindre le projet "${projectName}" sur Fluxo.\n\nAcceptez ici : ${inviteUrl}\n\nCe lien expire dans 7 jours.`;
    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
        style="background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#166553;padding:24px;text-align:center;">
            <span style="font-size:28px;font-weight:900;color:white;letter-spacing:-1px;">Fluxo</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <h2 style="color:#111827;margin:0 0 12px;font-size:20px;">Invitation a collaborer</h2>
            <p style="color:#374151;margin:0 0 20px;line-height:1.6;font-size:15px;">
              Vous avez ete invite(e) a rejoindre le projet
              <strong style="color:#166553;">${projectName}</strong>.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${inviteUrl}"
                 style="display:inline-block;background:#166553;color:white;padding:14px 32px;
                        border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
                Accepter l'invitation
              </a>
            </div>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
            <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.5;">
              Ce lien expire dans 7 jours.<br/>
              Si vous n'attendiez pas cette invitation, ignorez cet email.<br/>
              Lien : <a href="${inviteUrl}" style="color:#166553;">${inviteUrl}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:14px 36px;text-align:center;border-top:1px solid #e5e7eb;">
            <span style="color:#9ca3af;font-size:11px;">
              Fluxo — Gestion de projet collaborative
            </span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    await this.send(to, subject, html, text);
  }

  async sendDueDateReminderEmail(
    to: string, taskTitle: string, projectName: string, dueDate: Date,
  ) {
    const formattedDate = dueDate.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    });
    const subject = `Rappel d'echeance : "${taskTitle}"`;
    const text = `La tache "${taskTitle}" dans le projet "${projectName}" arrive a echeance le ${formattedDate}.\n\nConnectez-vous a Fluxo pour mettre a jour son statut.`;
    const html = `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
        style="background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#166553;padding:24px;text-align:center;">
            <span style="font-size:28px;font-weight:900;color:white;letter-spacing:-1px;">Fluxo</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <h2 style="color:#111827;margin:0 0 12px;font-size:20px;">Rappel d'echeance</h2>
            <p style="color:#374151;line-height:1.6;font-size:15px;">
              La tache <strong style="color:#166553;">${taskTitle}</strong>
              dans le projet <strong>${projectName}</strong>
              arrive a echeance le <strong>${formattedDate}</strong>.
            </p>
            <p style="color:#9ca3af;font-size:12px;margin-top:20px;">
              Connectez-vous a Fluxo pour mettre a jour son statut.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    await this.send(to, subject, html, text);
  }

  async sendTaskClosedByCommitEmail(
    to: string, taskTitle: string, sha: string, commitMessage: string,
  ) {
    const subject = `Tache fermee automatiquement — commit ${sha}`;
    const text = `La tache "${taskTitle}" a ete fermee automatiquement par le commit ${sha}.\n\nMessage : "${commitMessage}"\n\nConnectez-vous a Fluxo pour voir les details.`;
    const html = `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
        style="background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#166553;padding:24px;text-align:center;">
            <span style="font-size:28px;font-weight:900;color:white;letter-spacing:-1px;">Fluxo</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <h2 style="color:#111827;margin:0 0 12px;font-size:20px;">Tache fermee automatiquement</h2>
            <p style="color:#374151;line-height:1.6;font-size:15px;">
              La tache <strong style="color:#166553;">${taskTitle}</strong>
              a ete fermee automatiquement par le commit
              <code style="background:#f3f4f6;padding:2px 8px;border-radius:4px;font-family:monospace;">${sha}</code>.
            </p>
            <p style="color:#6b7280;font-size:13px;font-style:italic;margin:12px 0;">"${commitMessage}"</p>
            <p style="color:#9ca3af;font-size:12px;margin-top:20px;">
              Connectez-vous a Fluxo pour voir les details.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    await this.send(to, subject, html, text);
  }

  /** Email commit lié à une tâche — notifie tous les membres */
  async sendCommitLinkedEmail(
    to: string, taskTitle: string, code: string, sha: string,
    commitMsg: string, author: string, newStatus: string | null,
  ) {
    const statusLine = newStatus ? `<p style="color:#374151;">Nouveau statut : <strong style="color:#166553;">${newStatus}</strong></p>` : '';
    const statusText = newStatus ? `Nouveau statut : ${newStatus}\n` : '';
    const subject = `[${code}] Commit ${sha} — ${taskTitle}`;
    const text = `Commit ${sha} lié à la tâche [${code}] "${taskTitle}".\nAuteur : ${author}\n${statusText}Message : "${commitMsg}"\n\nConnectez-vous à Fluxo pour voir les détails.`;
    const html = `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
        style="background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#166553;padding:20px;text-align:center;">
          <span style="font-size:24px;font-weight:900;color:white;">Fluxo</span>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <h2 style="color:#111827;margin:0 0 12px;font-size:18px;">
            Nouveau commit lié à <code style="background:#f3f4f6;padding:2px 8px;border-radius:4px;">${code}</code>
          </h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;">
            Tâche : <strong>${taskTitle}</strong><br/>
            Commit : <code style="font-family:monospace;">${sha}</code><br/>
            Auteur : ${author}
          </p>
          ${statusLine}
          <p style="background:#f9fafb;border-left:3px solid #166553;padding:10px 14px;font-style:italic;color:#6b7280;margin:16px 0;font-size:13px;">"${commitMsg}"</p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:12px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <span style="color:#9ca3af;font-size:11px;">Fluxo — Gestion de projet collaborative</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
    await this.send(to, subject, html, text);
  }

  /** Email d'avertissement — code non trouvé ou commit sans code */
  async sendCommitWarningEmail(to: string, code: string, sha: string, commitMsg: string) {
    const codeLabel = code === 'aucun' ? 'aucun code de tâche' : `code ${code} introuvable`;
    const subject = `[Fluxo] Push détecté — ${codeLabel}`;
    const text = `Un push a été détecté (commit ${sha}) mais ${codeLabel} n'a pas pu être identifié.\n\nMessage du commit : "${commitMsg}"\n\nUtilisez le format : git commit -m "message -_statut(CODE)"`;
    const html = `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
        style="background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#d97706;padding:20px;text-align:center;">
          <span style="font-size:24px;font-weight:900;color:white;">Fluxo</span>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <h2 style="color:#111827;margin:0 0 12px;font-size:18px;">Push détecté sans correspondance</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;">
            Le commit <code style="font-family:monospace;">${sha}</code> a été reçu
            mais <strong>${codeLabel}</strong> dans ce projet.
          </p>
          <p style="background:#fef3c7;border-left:3px solid #d97706;padding:10px 14px;font-size:13px;margin:16px 0;">
            <strong>Format attendu :</strong><br/>
            <code>git commit -m "message -_close(FLX-001)"</code>
          </p>
          <p style="color:#6b7280;font-size:13px;font-style:italic;">"${commitMsg}"</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
    await this.send(to, subject, html, text);
  }

  async sendCallInviteEmail(
    to: string,
    hostName: string,
    title: string,
    callUrl: string,
    scheduled: boolean,
    scheduledAt?: Date,
  ) {
    const subject = scheduled
      ? `Visioconférence planifiée : "${title}"`
      : `${hostName} vous invite à rejoindre "${title}"`;

    let contextBlock: string;
    let textContext: string;
    if (scheduled && scheduledAt) {
      const dt = scheduledAt.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
      contextBlock = `<p style="color:#374151;margin:0 0 20px;line-height:1.6;font-size:15px;">
              <strong style="color:#166553;">${hostName}</strong> a planifié une visioconférence :<br/>
              <strong>${title}</strong><br/>
              ${dt}
            </p>`;
      textContext = `${hostName} a planifié une visioconférence "${title}" le ${dt}.`;
    } else {
      contextBlock = `<p style="color:#374151;margin:0 0 20px;line-height:1.6;font-size:15px;">
              <strong style="color:#166553;">${hostName}</strong> a lancé une visioconférence :<br/>
              <strong>${title}</strong><br/>
              Elle est en cours maintenant.
            </p>`;
      textContext = `${hostName} a lancé une visioconférence "${title}". Elle est en cours maintenant.`;
    }

    const text = `${textContext}\n\nRejoindre : ${callUrl}`;
    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
        style="background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#166553;padding:24px;text-align:center;">
            <span style="font-size:28px;font-weight:900;color:white;letter-spacing:-1px;">Fluxo</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <h2 style="color:#111827;margin:0 0 12px;font-size:20px;">
              ${scheduled ? 'Visioconférence planifiée' : 'Visioconférence en cours'}
            </h2>
            ${contextBlock}
            <div style="text-align:center;margin:28px 0;">
              <a href="${callUrl}"
                 style="display:inline-block;background:#166553;color:white;padding:14px 32px;
                        border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
                ${scheduled ? 'Ajouter à mon agenda' : 'Rejoindre maintenant'}
              </a>
            </div>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
            <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.5;">
              Lien direct : <a href="${callUrl}" style="color:#166553;">${callUrl}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:14px 36px;text-align:center;border-top:1px solid #e5e7eb;">
            <span style="color:#9ca3af;font-size:11px;">Fluxo — Gestion de projet collaborative</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    await this.send(to, subject, html, text);
  }

  async sendCallReminderEmail(
    to: string,
    title: string,
    callUrl: string,
    timeLabel: string,
  ) {
    const subject = `Rappel : "${title}" commence dans ${timeLabel}`;
    const text = `La visioconférence "${title}" commence dans ${timeLabel}.\n\nRejoindre : ${callUrl}`;
    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
        style="background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#166553;padding:24px;text-align:center;">
            <span style="font-size:28px;font-weight:900;color:white;letter-spacing:-1px;">Fluxo</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <h2 style="color:#111827;margin:0 0 12px;font-size:20px;">Rappel de visioconférence</h2>
            <p style="color:#374151;margin:0 0 20px;line-height:1.6;font-size:15px;">
              La visioconférence <strong style="color:#166553;">${title}</strong>
              commence dans <strong>${timeLabel}</strong>.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${callUrl}"
                 style="display:inline-block;background:#166553;color:white;padding:14px 32px;
                        border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
                Rejoindre la visioconférence
              </a>
            </div>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
            <p style="color:#9ca3af;font-size:12px;margin:0;">
              Lien : <a href="${callUrl}" style="color:#166553;">${callUrl}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:14px 36px;text-align:center;border-top:1px solid #e5e7eb;">
            <span style="color:#9ca3af;font-size:11px;">Fluxo — Gestion de projet collaborative</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    await this.send(to, subject, html, text);
  }

  async sendCallCancelledEmail(
    to: string,
    hostName: string,
    title: string,
    scheduledAt: Date,
  ) {
    const dt = scheduledAt.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
    const subject = `Visioconférence annulée : "${title}"`;
    const text = `La visioconférence "${title}" prévue le ${dt} a été annulée par ${hostName}.`;
    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
        style="background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#6b7280;padding:24px;text-align:center;">
            <span style="font-size:28px;font-weight:900;color:white;letter-spacing:-1px;">Fluxo</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <h2 style="color:#111827;margin:0 0 12px;font-size:20px;">Visioconférence annulée</h2>
            <p style="color:#374151;line-height:1.6;font-size:15px;">
              La visioconférence <strong style="color:#dc2626;">${title}</strong>
              prévue le <strong>${dt}</strong> a été annulée par
              <strong>${hostName}</strong>.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:14px 36px;text-align:center;border-top:1px solid #e5e7eb;">
            <span style="color:#9ca3af;font-size:11px;">Fluxo — Gestion de projet collaborative</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    await this.send(to, subject, html, text);
  }

  async sendTaskAssignedEmail(
    to: string,
    recipientName: string,
    assignerName: string,
    taskLabel: string,
    projectName: string,
  ) {
    const subject = `Nouvelle tâche assignée : ${taskLabel}`;
    const text = `Bonjour ${recipientName},\n\n${assignerName} vous a assigné la tâche « ${taskLabel} » dans le projet « ${projectName} ».\n\nConnectez-vous à Fluxo pour voir les détails.`;
    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
        style="background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#166553;padding:24px;text-align:center;">
            <span style="font-size:28px;font-weight:900;color:white;letter-spacing:-1px;">Fluxo</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <h2 style="color:#111827;margin:0 0 12px;font-size:20px;">Nouvelle tâche assignée</h2>
            <p style="color:#374151;margin:0 0 16px;line-height:1.6;font-size:15px;">
              Bonjour <strong>${recipientName}</strong>,
            </p>
            <p style="color:#374151;margin:0 0 20px;line-height:1.6;font-size:15px;">
              <strong style="color:#166553;">${assignerName}</strong> vous a assigné la tâche :
            </p>
            <div style="background:#f0fdf4;border-left:4px solid #166553;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:20px;">
              <p style="margin:0;font-size:15px;font-weight:700;color:#111827;">${taskLabel}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Projet : ${projectName}</p>
            </div>
            <div style="text-align:center;margin:24px 0;">
              <a href="${process.env.FRONTEND_URL ?? 'http://localhost:4200'}/dashboard"
                 style="display:inline-block;background:#166553;color:white;padding:13px 28px;
                        border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
                Voir la tâche sur Fluxo
              </a>
            </div>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
            <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.5;">
              Si vous pensez avoir reçu cet email par erreur, ignorez-le.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:14px 36px;text-align:center;border-top:1px solid #e5e7eb;">
            <span style="color:#9ca3af;font-size:11px;">Fluxo — Gestion de projet collaborative</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    await this.send(to, subject, html, text);
  }

  async sendFileUploadedEmail(
    to: string,
    recipientName: string,
    uploaderName: string,
    fileName: string,
    projectName: string,
    appUrl: string,
  ) {
    const subject = `[${projectName}] Nouveau document partagé : ${fileName}`;
    const text = `Bonjour ${recipientName},\n\n${uploaderName} vient de déposer un nouveau document "${fileName}" dans le projet "${projectName}".\n\nConsultez-le ici : ${appUrl}\n\nCordialement,\nL'équipe Fluxo`;
    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
        style="background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#166553;padding:24px;text-align:center;">
            <span style="font-size:28px;font-weight:900;color:white;letter-spacing:-1px;">Fluxo</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <h2 style="color:#111827;margin:0 0 8px;font-size:20px;">Nouveau document partagé</h2>
            <p style="color:#374151;margin:0 0 20px;line-height:1.6;font-size:15px;">
              Bonjour <strong>${recipientName}</strong>,
            </p>
            <p style="color:#374151;margin:0 0 20px;line-height:1.6;font-size:15px;">
              Un nouveau document vient d'être déposé dans le projet
              <strong style="color:#166553;">${projectName}</strong>.
            </p>
            <div style="background:#f0fdf4;border-left:4px solid #166553;padding:16px 20px;border-radius:0 10px 10px 0;margin-bottom:24px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:4px 0;font-size:13px;color:#6b7280;width:100px;">Fichier</td>
                  <td style="padding:4px 0;font-size:14px;font-weight:700;color:#111827;">${fileName}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-size:13px;color:#6b7280;">Déposé par</td>
                  <td style="padding:4px 0;font-size:14px;color:#374151;">${uploaderName}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-size:13px;color:#6b7280;">Projet</td>
                  <td style="padding:4px 0;font-size:14px;color:#374151;">${projectName}</td>
                </tr>
              </table>
            </div>
            <div style="text-align:center;margin:24px 0;">
              <a href="${appUrl}"
                 style="display:inline-block;background:#166553;color:white;padding:13px 32px;
                        border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
                Consulter le document
              </a>
            </div>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
            <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.5;">
              Vous recevez cet email car vous êtes collaborateur du projet <em>${projectName}</em>.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:14px 36px;text-align:center;border-top:1px solid #e5e7eb;">
            <span style="color:#9ca3af;font-size:11px;">Fluxo — Gestion de projet collaborative</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    await this.send(to, subject, html, text);
  }

  async sendFileCommentedEmail(
    to: string,
    recipientName: string,
    commenterName: string,
    fileName: string,
    projectName: string,
    commentPreview: string,
    appUrl: string,
  ) {
    const preview = commentPreview.length > 200
      ? commentPreview.slice(0, 197) + '…'
      : commentPreview;

    const subject = `[${projectName}] Nouveau commentaire sur "${fileName}"`;
    const text = `Bonjour ${recipientName},\n\n${commenterName} a commenté votre document "${fileName}" dans le projet "${projectName}" :\n\n"${preview}"\n\nRépondez ici : ${appUrl}\n\nCordialement,\nL'équipe Fluxo`;
    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
        style="background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#166553;padding:24px;text-align:center;">
            <span style="font-size:28px;font-weight:900;color:white;letter-spacing:-1px;">Fluxo</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <h2 style="color:#111827;margin:0 0 8px;font-size:20px;">Commentaire sur votre document</h2>
            <p style="color:#374151;margin:0 0 20px;line-height:1.6;font-size:15px;">
              Bonjour <strong>${recipientName}</strong>,
            </p>
            <p style="color:#374151;margin:0 0 16px;line-height:1.6;font-size:15px;">
              <strong style="color:#166553;">${commenterName}</strong> a laissé un commentaire
              sur votre document <strong>${fileName}</strong>
              dans le projet <strong>${projectName}</strong> :
            </p>
            <div style="background:#f9fafb;border-left:4px solid #d1d5db;border-radius:0 8px 8px 0;
                        padding:14px 18px;margin-bottom:24px;">
              <p style="margin:0;font-size:14px;color:#374151;font-style:italic;line-height:1.6;">
                « ${preview} »
              </p>
            </div>
            <div style="text-align:center;margin:24px 0;">
              <a href="${appUrl}"
                 style="display:inline-block;background:#166553;color:white;padding:13px 32px;
                        border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
                Voir le commentaire
              </a>
            </div>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
            <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.5;">
              Vous recevez cet email car vous avez déposé un document dans <em>${projectName}</em>.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:14px 36px;text-align:center;border-top:1px solid #e5e7eb;">
            <span style="color:#9ca3af;font-size:11px;">Fluxo — Gestion de projet collaborative</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    await this.send(to, subject, html, text);
  }

  /** Test de connexion SMTP (utilisé par /api/health) */
  async testConnection(): Promise<{ ok: boolean; message: string; hint?: string }> {
    if (!this.transporter) {
      if (this.resend) return { ok: true, message: 'Resend configure (pas de SMTP)' };
      return {
        ok: false,
        message: 'Aucun backend email configure',
        hint: 'Configurez MAIL_HOST/MAIL_USERNAME/MAIL_PASSWORD ou RESEND_API_KEY dans .env',
      };
    }
    try {
      await this.transporter.verify();
      return { ok: true, message: `Connexion SMTP reussie (${process.env.MAIL_HOST})` };
    } catch (err: any) {
      const isBadCreds = err?.message?.includes('BadCredentials') ||
                         err?.message?.includes('Username and Password');
      return {
        ok: false,
        message: `Erreur SMTP : ${err?.message ?? 'inconnue'}`,
        hint: isBadCreds
          ? 'Gmail : utilisez un App Password (16 chars) genere sur myaccount.google.com/apppasswords'
          : undefined,
      };
    }
  }
}
