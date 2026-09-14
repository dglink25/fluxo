import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  /**
   * Si Google renvoie error=access_denied (ou autre erreur OAuth),
   * on redirige immédiatement vers le frontend AVANT que Passport
   * tente de valider le code — évitant ainsi ERR_HTTP_HEADERS_SENT.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const oauthError = req.query?.error;

    if (oauthError) {
      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(oauthError)}`);
      return false; // stoppe le pipeline — le controller ne sera pas appelé
    }

    // Flux normal — déléguer à Passport
    return super.canActivate(context) as Promise<boolean>;
  }
}
