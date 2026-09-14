import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { GithubLinkGuard } from './guards/github-link.guard';
import { PendingPhoneGuard } from './guards/pending-phone.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ──────────────────────────────────────────────────────────────
  // OAuth Google
  // ──────────────────────────────────────────────────────────────
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: any, @Res() res: Response) {
    return this.handleOAuthCallback(req, res);
  }

  // ──────────────────────────────────────────────────────────────
  // OAuth GitHub — connexion principale
  // ──────────────────────────────────────────────────────────────
  @Get('github')
  @UseGuards(GithubAuthGuard)
  githubLogin() {}

  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  async githubCallback(@Req() req: any, @Res() res: Response) {
    const linkUserId: string | undefined = req.cookies?.['gh_link_userId'];

    if (linkUserId) {
      // Flow "liaison" — on stocke le token GitHub sur le compte existant
      res.clearCookie('gh_link_userId');
      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
      try {
        await this.authService.linkGithubAccount(linkUserId, {
          githubAccessToken: req.user.githubAccessToken,
          githubUsername: req.user.githubUsername ?? req.user.username ?? '',
          githubProviderId: req.user.providerId,
        });
        return res.redirect(`${frontendUrl}/dashboard?github_link=success`);
      } catch {
        return res.redirect(`${frontendUrl}/dashboard?github_link=error&reason=link_failed`);
      }
    }

    // Flow normal — login/inscription
    return this.handleOAuthCallback(req, res);
  }

  // ──────────────────────────────────────────────────────────────
  // OAuth GitHub — liaison de compte (pour les users Google)
  // L'utilisateur doit être connecté (JWT valide) pour initier la liaison.
  // On stocke son userId dans le state afin de retrouver son compte au retour.
  // ──────────────────────────────────────────────────────────────

  /**
   * Endpoint PUBLIC — initie le flow OAuth GitHub pour lier un compte.
   * Le frontend appelle window.location.href = /api/auth/github/link/init?token=JWT
   * On vérifie le JWT ici et on stocke le userId dans un cookie httpOnly.
   */
  @Get('github/link/init')
  githubLinkInit(@Req() req: any, @Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
    const rawToken: string = req.query['token'] as string;

    if (!rawToken) {
      return res.redirect(`${frontendUrl}/dashboard?github_link=error&reason=no_token`);
    }

    let userId: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const jwt = require('jsonwebtoken');
      const payload: any = jwt.verify(rawToken, process.env.JWT_SECRET);
      userId = payload.sub;
    } catch {
      return res.redirect(`${frontendUrl}/dashboard?github_link=error&reason=invalid_token`);
    }

    res.cookie('gh_link_userId', userId, {
      httpOnly: true,
      maxAge: 10 * 60 * 1000,
      sameSite: 'lax',
    });

    // On utilise la même callback URL que le login GitHub principal,
    // mais on distingue le flow "link" via le cookie gh_link_userId.
    // Si gh_link_userId est présent au callback, c'est une liaison.
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID!,
      redirect_uri: process.env.GITHUB_CALLBACK_URL!,
      scope: 'user:email repo',
    });
    return res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  }

  /** Alias protégé — conservé mais la route /init est préférable */
  @Get('github/link')
  @UseGuards(JwtAuthGuard)
  githubLink(@Req() req: any, @Res() res: Response) {
    const userId = (req.user as any).userId;
    res.cookie('gh_link_userId', userId, {
      httpOnly: true,
      maxAge: 10 * 60 * 1000,
      sameSite: 'lax',
    });
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID!,
      redirect_uri:
        process.env.GITHUB_LINK_CALLBACK_URL ??
        `${process.env.BACKEND_URL ?? 'http://localhost:3000'}/api/auth/github/link/callback`,
      scope: 'user:email repo',
    });
    return res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  }

  @Get('github/link/callback')
  async githubLinkCallback(@Req() req: any, @Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
    const userId: string | undefined = req.cookies?.['gh_link_userId'];

    if (!userId) {
      return res.redirect(`${frontendUrl}/dashboard?github_link=error&reason=session`);
    }

    const code: string = req.query.code as string;
    if (!code) {
      return res.redirect(`${frontendUrl}/dashboard?github_link=error&reason=no_code`);
    }

    try {
      // Échange du code contre un access token
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri:
            process.env.GITHUB_LINK_CALLBACK_URL ??
            `${process.env.BACKEND_URL ?? 'http://localhost:3000'}/api/auth/github/link/callback`,
        }),
      });

      const tokenData = await tokenRes.json() as any;
      if (!tokenData.access_token) {
        return res.redirect(`${frontendUrl}/dashboard?github_link=error&reason=token`);
      }

      // Récupérer le profil GitHub
      const profileRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Fluxo-App',
        },
      });
      const ghProfile = await profileRes.json() as any;

      // Stocker le token GitHub sur le compte utilisateur
      await this.authService.linkGithubAccount(userId, {
        githubAccessToken: tokenData.access_token,
        githubUsername: ghProfile.login ?? '',
        githubProviderId: String(ghProfile.id),
      });

      res.clearCookie('gh_link_userId');
      return res.redirect(`${frontendUrl}/dashboard?github_link=success`);
    } catch {
      return res.redirect(`${frontendUrl}/dashboard?github_link=error&reason=unknown`);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // OTP WhatsApp (vérification téléphone)
  // ──────────────────────────────────────────────────────────────
  @Post('phone/send-otp')
  @UseGuards(PendingPhoneGuard)
  sendOtp(@CurrentUser() user: any, @Body() dto: SendOtpDto) {
    return this.authService.sendOtp(user.userId, dto.phone);
  }

  @Post('phone/verify-otp')
  @UseGuards(PendingPhoneGuard)
  verifyOtp(@CurrentUser() user: any, @Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(user.userId, dto.phone, dto.code);
  }

  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  refresh(@CurrentUser() user: any) {
    return this.authService.refresh(user.userId);
  }

  // ──────────────────────────────────────────────────────────────
  // Helpers privés
  // ──────────────────────────────────────────────────────────────
  private async handleOAuthCallback(req: any, res: Response) {
    const user = await this.authService.findOrCreateFromOAuth(req.user);
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';

    if (!user.phoneVerified) {
      const pendingToken = this.authService.issuePendingToken(user);
      return res.redirect(`${frontendUrl}/auth/callback?pending=${pendingToken}`);
    }

    const session = await this.authService.refresh(user.id);
    const params = new URLSearchParams({
      accessToken: (session as any).accessToken,
      refreshToken: (session as any).refreshToken,
    });
    return res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
  }
}
