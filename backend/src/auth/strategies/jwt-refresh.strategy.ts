import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './jwt.strategy';

/**
 * Strategy dédiée au refresh token.
 * Vérifie avec JWT_REFRESH_SECRET au lieu de JWT_SECRET.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_REFRESH_SECRET ?? 'change-moi-aussi',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub) throw new UnauthorizedException('Refresh token invalide');
    return {
      userId: payload.sub,
      email: payload.email,
      username: payload.username,
      scope: payload.scope,
    };
  }
}
