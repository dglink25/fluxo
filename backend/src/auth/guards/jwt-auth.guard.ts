import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard standard : nécessite un JWT valide avec le scope complet ("full"),
 * c'est-à-dire un compte dont le numéro de téléphone a été vérifié.
 * Utiliser PendingPhoneGuard pour les routes de vérification du téléphone.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    if (err || !user) throw err ?? new ForbiddenException('Non authentifié');
    if (user.scope !== 'full') {
      throw new ForbiddenException('Numéro de téléphone non vérifié');
    }
    return user;
  }
}
