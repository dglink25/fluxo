import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { PendingPhoneGuard } from './guards/pending-phone.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ---- OAuth Google ----
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {
    // La redirection vers Google est gérée par le guard Passport.
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: any, @Res() res: Response) {
    return this.handleOAuthCallback(req, res);
  }

  // ---- OAuth GitHub ----
  @Get('github')
  @UseGuards(GithubAuthGuard)
  githubLogin() {
    // La redirection vers GitHub est gérée par le guard Passport.
  }

  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  async githubCallback(@Req() req: any, @Res() res: Response) {
    return this.handleOAuthCallback(req, res);
  }

  private async handleOAuthCallback(req: any, res: Response) {
    const user = await this.authService.findOrCreateFromOAuth(req.user);
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';

    if (!user.phoneVerified) {
      const pendingToken = this.authService.issuePendingToken(user);
      return res.redirect(`${frontendUrl}/auth/callback?pending=${pendingToken}`);
    }

    // Compte déjà entièrement vérifié : on émet directement les jetons complets
    const session = await this.authService.refresh(user.id);
    const params = new URLSearchParams({
      accessToken: (session as any).accessToken,
      refreshToken: (session as any).refreshToken,
    });
    return res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
  }

  // ---- Vérification du téléphone (WhatsApp OTP via Convessa) ----
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
  @UseGuards(JwtAuthGuard)
  refresh(@CurrentUser() user: any) {
    return this.authService.refresh(user.userId);
  }
}
