import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard utilisé uniquement pour les routes de vérification du téléphone
 * (envoi/validation de l'OTP), accessible avec un JWT "pending_phone" ou "full".
 */
@Injectable()
export class PendingPhoneGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    if (err || !user) throw err ?? new ForbiddenException('Non authentifié');
    return user;
  }
}
