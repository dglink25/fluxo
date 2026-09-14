import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { OAuthProvider } from '@prisma/client';

const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES ?? 3);
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 30;

export interface OAuthProfile {
  provider: 'GOOGLE' | 'GITHUB';
  providerId: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  username?: string;
  githubAccessToken?: string;
  githubUsername?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private whatsapp: WhatsappService,
  ) {}

  /** Appelé depuis les callbacks Google/GitHub : crée le compte si besoin */
  async findOrCreateFromOAuth(profile: OAuthProfile) {
    const provider = profile.provider as OAuthProvider;

    // 1. Chercher d'abord le compte avec provider + providerId
    let user = await this.prisma.user.findUnique({
      where: { provider_providerId: { provider, providerId: profile.providerId } },
    });

    // Compte OAuth déjà lié : mettre à jour le token GitHub si présent
    if (user) {
      if (profile.githubAccessToken) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            githubAccessToken: profile.githubAccessToken,
            githubUsername: profile.githubUsername ?? user.githubUsername,
          },
        });
      }
      return user;
    }

    // 2. Vérifier si un utilisateur existe déjà avec cet email
    user = await this.prisma.user.findUnique({ where: { email: profile.email } });

    // 3. L'email existe déjà : on rattache le compte OAuth existant
    if (user) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          provider,
          providerId: profile.providerId,
          avatarUrl: profile.avatarUrl ?? user.avatarUrl,
          fullName: profile.fullName ?? user.fullName,
          ...(profile.githubAccessToken && {
            githubAccessToken: profile.githubAccessToken,
            githubUsername: profile.githubUsername,
          }),
        },
      });
      return user;
    }

    // 4. Aucun utilisateur avec cet email : créer un nouveau compte
    const username = await this.generateUniqueUsername(
      profile.username ?? profile.email.split('@')[0],
    );

    user = await this.prisma.user.create({
      data: {
        email: profile.email,
        username,
        fullName: profile.fullName,
        avatarUrl: profile.avatarUrl,
        provider,
        providerId: profile.providerId,
        ...(profile.githubAccessToken && {
          githubAccessToken: profile.githubAccessToken,
          githubUsername: profile.githubUsername,
        }),
      },
    });

    return user;
  }

  /**
   * Liaison GitHub pour un utilisateur déjà connecté (ex. inscrit via Google).
   * Stocke son token GitHub sans changer son provider principal.
   */
  async linkGithubAccount(
    userId: string,
    data: { githubAccessToken: string; githubUsername: string; githubProviderId: string },
  ) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        githubAccessToken: data.githubAccessToken,
        githubUsername: data.githubUsername,
      },
    });
    return user;
  }

  /** Récupère le token GitHub stocké d'un utilisateur */
  async getGithubToken(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { githubAccessToken: true },
    });
    return user?.githubAccessToken ?? null;
  }


  /** Jeton émis juste après l'OAuth : accès limité, uniquement pour vérifier le téléphone */
  issuePendingToken(user: { id: string; email: string; username: string }) {
    return this.jwt.sign(
      { sub: user.id, email: user.email, username: user.username, scope: 'pending_phone' },
      { secret: process.env.JWT_SECRET, expiresIn: '30m' },
    );
  }

  async sendOtp(userId: string, phone: string) {
    const existingOwner = await this.prisma.user.findFirst({
      where: { phone, phoneVerified: true, NOT: { id: userId } },
    });
    if (existingOwner) {
      throw new ConflictException('Ce numéro est déjà utilisé par un autre compte');
    }

    const lastCode = await this.prisma.phoneVerification.findFirst({
      where: { userId, phone },
      orderBy: { createdAt: 'desc' },
    });
    if (lastCode) {
      const secondsSinceLast = (Date.now() - lastCode.createdAt.getTime()) / 1000;
      if (secondsSinceLast < OTP_RESEND_COOLDOWN_SECONDS) {
        throw new BadRequestException(
          `Veuillez patienter ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLast)}s avant de redemander un code`,
        );
      }
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await this.prisma.phoneVerification.create({
      data: { userId, phone, codeHash, expiresAt },
    });

    await this.whatsapp.sendOtpMessage(phone, code, OTP_TTL_MINUTES);

    return { sent: true, expiresInSeconds: OTP_TTL_MINUTES * 60 };
  }

  async verifyOtp(userId: string, phone: string, code: string) {
    const verification = await this.prisma.phoneVerification.findFirst({
      where: { userId, phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification) throw new NotFoundException('Aucun code en attente pour ce numéro');

    if (verification.expiresAt < new Date()) {
      throw new BadRequestException('Code expiré, demandez-en un nouveau');
    }
    if (verification.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Trop de tentatives, demandez un nouveau code');
    }

    const valid = await bcrypt.compare(code, verification.codeHash);
    if (!valid) {
      await this.prisma.phoneVerification.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Code incorrect');
    }

    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { phone, phoneVerified: true },
      }),
      this.prisma.phoneVerification.update({
        where: { id: verification.id },
        data: { consumedAt: new Date() },
      }),
    ]);

    return this.buildAuthResponse(user);
  }

  async refresh(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (!user.phoneVerified) {
      const pendingToken = this.issuePendingToken(user);
      return {
        accessToken: pendingToken,
        refreshToken: null,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.fullName,
          avatarUrl: user.avatarUrl,
          phoneVerified: false,
          provider: user.provider,
          githubLinked: !!user.githubAccessToken,
          githubUsername: user.githubUsername ?? null,
        },
        pending: true,
      };
    }
    return this.buildAuthResponse(user);
  }

  private async generateUniqueUsername(base: string): Promise<string> {
    const clean = base.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 16) || 'user';
    let candidate = clean;
    let i = 0;
    while (await this.prisma.user.findUnique({ where: { username: candidate } })) {
      i += 1;
      candidate = `${clean}${i}`;
    }
    return candidate;
  }

  private buildAuthResponse(user: {
    id: string;
    email: string;
    username: string;
    fullName: string | null;
    avatarUrl: string | null;
    phoneVerified: boolean;
    provider?: string;
    githubAccessToken?: string | null;
    githubUsername?: string | null;
  }) {
    const payload = { sub: user.id, email: user.email, username: user.username, scope: 'full' as const };
    const accessToken = this.jwt.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    });
    const refreshToken = this.jwt.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        phoneVerified: user.phoneVerified,
        provider: user.provider ?? 'GOOGLE',
        githubLinked: !!user.githubAccessToken,
        githubUsername: user.githubUsername ?? null,
      },
    };
  }
}
