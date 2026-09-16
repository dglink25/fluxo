import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

/**
 * Intégration avec le service Convessa (API WhatsApp)
 * Documentation : https://convessa.epac-uac-optica-chapter.bj/
 *
 * Utilisée uniquement pour l'envoi du code de vérification (OTP) par
 * WhatsApp lors de la validation du numéro de téléphone à l'inscription.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly apiKey = process.env.CONVESSA_API_KEY;
  private readonly baseUrl = process.env.CONVESSA_API_URL ?? 'https://convessa.epac-uac-optica-chapter.bj';

  async sendOtpMessage(phone: string, code: string, ttlMinutes: number) {
    const message = this.buildOtpMessage(code, ttlMinutes);

    if (!this.apiKey) {
      // Mode développement : pas de clé Convessa configurée, on logge le code
      this.logger.warn(`[DEV] CONVESSA_API_KEY absente — code OTP pour ${phone} : ${code}`);
      return { success: true, dev: true };
    }

    const res = await fetch(`${this.baseUrl}/api/v1/send`, {
      method: 'POST',
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: phone, message }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      this.logger.error(`Échec d'envoi Convessa (${res.status}) : ${JSON.stringify(data)}`);
      throw new InternalServerErrorException(
        "Impossible d'envoyer le code de vérification par WhatsApp pour le moment",
      );
    }

    return data;
  }

  /**
   * Message WhatsApp formaté (gras/monospace supportés nativement par WhatsApp
   * via *texte* et `code`). Un bouton "copier" natif n'existe pas dans un
   * message WhatsApp classique (seuls texte/image/document/audio sont
   * supportés par l'API) — la mise en forme ci-dessous vise donc la lisibilité
   * maximale du code plutôt qu'un vrai bouton interactif.
   */
  private buildOtpMessage(code: string, ttlMinutes: number): string {
    return [
      '*Fluxo* — Vérification de votre numéro',
      '',
      'Voici votre code de vérification :',
      '',
      `\`${code}\``,
      '',
      `Ce code expire dans ${ttlMinutes} minutes. Ne le partagez avec personne.`,
      '',
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
    ].join('\n');
  }

  async sendCommitLinkedMessage(
    phone: string, taskTitle: string, code: string, sha: string,
    commitMsg: string, author: string, newStatus: string | null,
  ) {
    const statusLine = newStatus ? `\nNouveau statut : *${newStatus}*` : '';
    const message = [
      `*Fluxo* — Commit lié à la tâche`,
      '',
      `Tâche : *[${code}] ${taskTitle}*`,
      `Commit : \`${sha}\` par ${author}`,
      commitMsg ? `Message : "${commitMsg.slice(0, 80)}"` : '',
      statusLine,
      '',
      'Connectez-vous à Fluxo pour voir les détails.',
    ].filter(Boolean).join('\n');

    return this.send(phone, message);
  }

  async sendCommitWarningMessage(
    phone: string, code: string, sha: string, commitMsg: string,
  ) {
    const codeLabel = code === 'aucun' ? 'aucun code de tâche' : `code *${code}* introuvable`;
    const message = [
      `*Fluxo* — Push détecté sans correspondance`,
      '',
      `Commit : \`${sha}\``,
      `Problème : ${codeLabel}`,
      commitMsg ? `Message : "${commitMsg.slice(0, 80)}"` : '',
      '',
      'Format attendu : `git commit -m "message -_close(FLX-001)"`',
    ].filter(Boolean).join('\n');

    return this.send(phone, message);
  }

  private async send(phone: string, message: string) {
    if (!this.apiKey) {
      this.logger.warn(`[DEV] CONVESSA absent — message pour ${phone} : ${message.slice(0, 60)}...`);
      return { success: true, dev: true };
    }
    const res = await fetch(`${this.baseUrl}/api/v1/send`, {
      method: 'POST',
      headers: { 'X-Api-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.logger.error(`Echec Convessa (${res.status}) : ${JSON.stringify(data)}`);
    }
    return data;
  }

  async sendInvitationMessage(
    phone: string,
    projectName: string,
    inviterName: string,
    inviteUrl: string,
  ) {
    const message = [
      '*Fluxo* — Invitation à collaborer',
      '',
      `${inviterName} vous invite à rejoindre le projet *${projectName}*.`,
      '',
      `${inviteUrl}`,
      '',
      'Cette invitation expire dans 7 jours.',
    ].join('\n');

    return this.send(phone, message);
  }

  async sendCallInviteMessage(
    phone: string,
    hostName: string,
    title: string,
    callUrl: string,
    scheduled: boolean,
    scheduledAt?: Date,
  ) {
    let message: string;
    if (scheduled && scheduledAt) {
      const dt = scheduledAt.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
      message = [
        '*Fluxo* — Visioconférence planifiée',
        '',
        `*${hostName}* a planifié une visioconférence :`,
        `*${title}*`,
        `${dt}`,
        '',
        `Rejoindre : ${callUrl}`,
      ].join('\n');
    } else {
      message = [
        '*Fluxo* — Visioconférence en cours',
        '',
        `*${hostName}* a lancé une visioconférence :`,
        `*${title}*`,
        '',
        `Rejoindre maintenant : ${callUrl}`,
      ].join('\n');
    }
    return this.send(phone, message);
  }

  async sendCallReminderMessage(
    phone: string,
    title: string,
    callUrl: string,
    timeLabel: string,
  ) {
    const message = [
      '*Fluxo* — Rappel de visioconférence',
      '',
      `La visioconférence *${title}* commence dans *${timeLabel}*.`,
      '',
      `Rejoindre : ${callUrl}`,
    ].join('\n');
    return this.send(phone, message);
  }

  async sendCallCancelledMessage(
    phone: string,
    hostName: string,
    title: string,
    scheduledAt: Date,
  ) {
    const dt = scheduledAt.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
    const message = [
      '*Fluxo* — Visioconférence annulée',
      '',
      `La visioconférence *${title}* prévue le ${dt} a été annulée par *${hostName}*.`,
    ].join('\n');
    return this.send(phone, message);
  }

  async sendTaskAssignedMessage(
    phone: string,
    recipientName: string,
    assignerName: string,
    taskLabel: string,
    projectName: string,
  ) {
    const message = [
      '*Fluxo Tâche assignée*',
      '',
      `Bonjour *${recipientName}*,`,
      '',
      `*${assignerName}* vous a assigné la tâche :`,
      `*${taskLabel}*`,
      `*Projet : ${projectName}*`,
      '',
      'Connectez-vous à Fluxo pour voir les détails.',
    ].join('\n');
    return this.send(phone, message);
  }

  // ── Dépôt de fichier ──────────────────────────────────────────────────────

  /**
   * Notification formelle envoyée à tous les collaborateurs du projet
   * lorsqu'un nouveau document est déposé.
   */
  async sendFileUploadedMessage(
    phone: string,
    recipientName: string,
    uploaderName: string,
    fileName: string,
    projectName: string,
    appUrl: string,
  ) {
    const message = [
      '*Fluxo Nouveau document partagé*',
      '',
      `Bonjour *${recipientName}*,`,
      '',
      `Nous vous informons qu'un nouveau document vient d'être déposé dans le projet *${projectName}*.`,
      '',
      `*Fichier :* ${fileName}`,
      `*Déposé par :* ${uploaderName}`,
      '',
      'Vous pouvez consulter et commenter ce document en vous connectant à la plateforme :',
      appUrl,
      '',
      'Cordialement,',
      '*L\'équipe Fluxo*',
    ].join('\n');
    return this.send(phone, message);
  }

  /**
   * Notification formelle envoyée au déposeur du fichier
   * lorsqu'un collaborateur y laisse un commentaire.
   */
  async sendFileCommentedMessage(
    phone: string,
    recipientName: string,
    commenterName: string,
    fileName: string,
    projectName: string,
    commentPreview: string,
    appUrl: string,
  ) {
    const preview = commentPreview.length > 120
      ? commentPreview.slice(0, 117) + '…'
      : commentPreview;

    const message = [
      '*Fluxo Commentaire sur votre document*',
      '',
      `Bonjour *${recipientName}*,`,
      '',
      `*${commenterName}* a laissé un commentaire sur le document *${fileName}*`,
      `dans le projet *${projectName}* :`,
      '',
      `_« ${preview} »_`,
      '',
      'Pour consulter et répondre à ce commentaire, connectez-vous à la plateforme :',
      appUrl,
      '',
      'Cordialement,',
      '*L\'équipe Fluxo*',
    ].join('\n');
    return this.send(phone, message);
  }
}
