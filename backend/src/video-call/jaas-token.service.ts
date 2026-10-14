import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Service de génération de JWT pour JaaS (8x8 Jitsi as a Service).
 *
 * Le JWT est signé avec RS256 en utilisant la clé privée RSA générée
 * sur https://jaas.8x8.vc → API keys → Generate.
 *
 * Sans clé configurée, retourne null → le frontend utilise le mode
 * sans authentification (limité à 5 min sur meet.jit.si, illimité
 * sur 8x8.vc avec le JWT).
 */
@Injectable()
export class JaasTokenService {
  private readonly logger = new Logger(JaasTokenService.name);

  private readonly appId      = process.env.JAAS_APP_ID      ?? '';
  private readonly keyId      = process.env.JAAS_KEY_ID       ?? '';
  private readonly privateKey = process.env.JAAS_PRIVATE_KEY  ?? '';

  get isConfigured(): boolean {
    return !!(this.appId && this.keyId && this.privateKey);
  }

  /**
   * Génère un JWT JaaS pour un utilisateur et une salle donnée.
   *
   * @param user    Informations sur l'utilisateur connecté
   * @param room    Nom de la salle (roomId de la BDD)
   * @param isMod   true si l'utilisateur est modérateur (hôte)
   * @param ttlSec  Durée de validité en secondes (défaut : 24h)
   */
  generateToken(
    user: { id: string; username: string; fullName?: string | null; email?: string | null; avatarUrl?: string | null },
    room: string,
    isMod = false,
    ttlSec = 86400, // 24 heures
  ): string | null {
    if (!this.isConfigured) {
      this.logger.warn('JaaS non configuré (JAAS_APP_ID / JAAS_KEY_ID / JAAS_PRIVATE_KEY manquants)');
      return null;
    }

    const now = Math.floor(Date.now() / 1000);

    const header = {
      // kid = keyId tel quel (il contient déjà appId/64f625)
      kid: this.keyId,
      typ: 'JWT',
      alg: 'RS256',
    };

    const payload = {
      aud:  'jitsi',
      iss:  'chat',
      iat:  now,
      exp:  now + ttlSec,
      nbf:  now - 5,
      sub:  this.appId,
      context: {
        features: {
          livestreaming:       false,
          'file-upload':       false,
          'outbound-call':     false,
          'sip-outbound-call': false,
          transcription:       false,
          'list-visitors':     false,
          recording:           false,
          flip:                false,
        },
        user: {
          'hidden-from-recorder': false,
          moderator:  isMod,
          name:       user.fullName ?? user.username,
          id:         user.id,
          avatar:     user.avatarUrl ?? '',
          email:      user.email ?? '',
        },
      },
      // '*' = accès à toutes les salles de l'AppID
      // Le nom de la salle côté Jitsi est "appId/fluxo-roomId"
      // donc on met '*' pour que le JWT soit valide sur n'importe quelle salle
      room: '*',
    };

    try {
      const headerB64  = this.base64url(JSON.stringify(header));
      const payloadB64 = this.base64url(JSON.stringify(payload));
      const signing    = `${headerB64}.${payloadB64}`;

      // Normaliser la clé privée (supporte \n littéraux ou retours à la ligne réels)
      const pem = this.privateKey
        .replace(/\\n/g, '\n')
        .trim();

      const sign      = crypto.createSign('RSA-SHA256');
      sign.update(signing);
      sign.end();
      const signature = sign.sign(pem);
      const sigB64    = Buffer.from(signature).toString('base64url');

      return `${signing}.${sigB64}`;
    } catch (err: any) {
      this.logger.error(`Erreur génération JWT JaaS : ${err?.message}`);
      return null;
    }
  }

  private base64url(input: string): string {
    return Buffer.from(input)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}
