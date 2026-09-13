import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor() {
    super({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL,
      scope: ['user:email'],
    });
  }

  async validate(_accessToken: string, _refreshToken: string, profile: any, done: any) {
    const email =
      profile.emails?.[0]?.value ?? `${profile.username}@users.noreply.github.com`;
    done(null, {
      provider: 'GITHUB',
      providerId: profile.id,
      email,
      fullName: profile.displayName ?? profile.username,
      avatarUrl: profile.photos?.[0]?.value,
      username: profile.username,
    });
  }
}
