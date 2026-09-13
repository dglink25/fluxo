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
      "Cette invitation expire dans 7 jours.",
    ].join('\n');

    if (!this.apiKey) {
      this.logger.warn(`[DEV] CONVESSA_API_KEY absente — invitation pour ${phone} : ${inviteUrl}`);
      return { success: true, dev: true };
    }

    const res = await fetch(`${this.baseUrl}/api/v1/send`, {
      method: 'POST',
      headers: { 'X-Api-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, message }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.logger.error(`Échec d'envoi Convessa (${res.status}) : ${JSON.stringify(data)}`);
      throw new InternalServerErrorException(
        "Impossible d'envoyer l'invitation par WhatsApp pour le moment",
      );
    }
    return data;
  }
}
