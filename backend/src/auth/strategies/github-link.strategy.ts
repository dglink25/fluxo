import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';

/**
 * Strategy utilisée uniquement pour lier un compte GitHub à un compte
 * existant (ex. : utilisateur inscrit via Google qui veut connecter GitHub).
 * Callback différent de la strategy principale pour ne pas écraser la session.
 */
@Injectable()
export class GithubLinkStrategy extends PassportStrategy(Strategy, 'github-link') {
  constructor() {
    super({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_LINK_CALLBACK_URL ??
        `${process.env.BACKEND_URL ?? 'http://localhost:3000'}/api/auth/github/link/callback`,
      scope: ['user:email', 'repo'],
    });
  }

  async validate(accessToken: string, _refreshToken: string, profile: any, done: any) {
    done(null, {
      githubAccessToken: accessToken,
      githubUsername: profile.username,
      providerId: profile.id,
    });
  }
}
