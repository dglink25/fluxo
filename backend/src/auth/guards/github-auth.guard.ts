import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const oauthError = req.query?.error;

    if (oauthError) {
      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(oauthError)}`);
      return false;
    }

    return super.canActivate(context) as Promise<boolean>;
  }
}
