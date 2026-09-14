import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  private readonly closeRegex  = /(?:closes|fixes|resolves)\s+#TASK-([a-f0-9-]+)/gi;
  private readonly refRegex    = /#TASK-([a-f0-9-]+)/gi;

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private realtime: RealtimeGateway,
  ) {}

  // ── Récupération du token GitHub ───────────────────────────────────────────

  /** Retourne le token GitHub stocké pour un utilisateur */
  async getTokenForUser(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { githubAccessToken: true, provider: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (!user.githubAccessToken) {
      throw new UnauthorizedException(
        'Aucun compte GitHub lié. Veuillez lier votre compte GitHub depuis l\'onglet GitHub.',
      );
    }
    return user.githubAccessToken;
  }

  /** Liste les dépôts accessibles via un token GitHub */
  async listUserRepos(token: string) {
    const res = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=updated&type=all',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Fluxo-App',
        },
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`GitHub API ${res.status}: ${JSON.stringify(err)}`);
    }
    const repos: any[] = await res.json();
    return repos.map((r) => ({
      name:        r.name,
      fullName:    r.full_name,
      private:     r.private,
      description: r.description ?? null,
    }));
  }

  /** Configure automatiquement un webhook GitHub sur le dépôt */
  private async setupWebhook(
    token: string, repoFullName: string, projectId: string,
  ): Promise<{ hookId: number }> {
    const apiBase = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const webhookUrl = `${apiBase}/api/projects/${projectId}/github/webhook`;

    const res = await fetch(`https://api.github.com/repos/${repoFullName}/hooks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Fluxo-App',
      },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['push'],
        config: { url: webhookUrl, content_type: 'json', insecure_ssl: '0' },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 422) {
        this.logger.warn(`Webhook deja existant pour ${repoFullName}`);
        return { hookId: 0 };
      }
      this.logger.warn(`Webhook non cree (${res.status}) : ${JSON.stringify(err)}`);
      return { hookId: 0 };
    }

    const data = await res.json();
    this.logger.log(`Webhook GitHub cree (id ${data.id}) -> ${webhookUrl}`);
    return { hookId: data.id };
  }

  // ── Connexion dépôt ────────────────────────────────────────────────────────

  async connectRepository(
    projectId: string,
    userId: string,
    data: { repoFullName: string; githubToken: string },
  ) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projet introuvable');

    // Créer le webhook automatiquement
    const { hookId } = await this.setupWebhook(data.githubToken, data.repoFullName, projectId);

    await this.prisma.activity.create({
      data: {
        projectId,
        userId,
        type: 'GIT_CONNECTED',
        details: { repoFullName: data.repoFullName, hookId },
      },
    });

    this.logger.log(`Depot ${data.repoFullName} connecte au projet ${projectId}`);
    return { connected: true, repoFullName: data.repoFullName, projectId, hookId };
  }

  // ── Traitement du webhook push ─────────────────────────────────────────────

  async handlePushEvent(projectId: string, payload: any) {
    const commits: any[] = payload.commits ?? [];
    const linkedTasks: string[] = [];

    for (const commit of commits) {
      const message:   string = commit.message ?? '';
      const sha:       string = (commit.id as string ?? '').slice(0, 7);
      const author:    string = commit.author?.name ?? 'Inconnu';
      const commitUrl: string = commit.url ?? '';

      // 1. closes/fixes/resolves → fermeture automatique
      this.closeRegex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = this.closeRegex.exec(message)) !== null) {
        await this.linkCommitToTask(projectId, m[1], sha, author, message, commitUrl, true);
        linkedTasks.push(m[1]);
      }

      // 2. Simples références
      this.refRegex.lastIndex = 0;
      while ((m = this.refRegex.exec(message)) !== null) {
        if (!linkedTasks.includes(m[1])) {
          await this.linkCommitToTask(projectId, m[1], sha, author, message, commitUrl, false);
          linkedTasks.push(m[1]);
        }
      }
    }

    return { processed: commits.length, linkedTasks };
  }

  private async linkCommitToTask(
    projectId: string, taskId: string, sha: string,
    author: string, message: string, commitUrl: string, closeTask: boolean,
  ) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, projectId } });
    if (!task) return; // référence invalide — ignorer silencieusement

    const shortMsg = message.split('\n')[0].slice(0, 120);

    // Enregistrer le commit dans le fil d'activité
    const ownerId = await this.getProjectOwner(projectId);
    await this.prisma.activity.create({
      data: {
        projectId,
        userId: task.assigneeId ?? ownerId,
        type: 'COMMIT_LINKED',
        targetId: taskId,
        details: { sha, author, message: shortMsg, url: commitUrl, closedTask: closeTask },
      },
    });

    // Fermeture automatique si demandée
    if (closeTask && task.status !== 'DONE') {
      await this.prisma.task.update({ where: { id: taskId }, data: { status: 'DONE' } });
      await this.prisma.activity.create({
        data: {
          projectId,
          userId: task.assigneeId ?? ownerId,
          type: 'TASK_STATUS_CHANGED',
          targetId: taskId,
          details: { newStatus: 'DONE', via: 'git_commit', sha },
        },
      });
      this.logger.log(`Tache ${taskId} fermee via commit ${sha}`);
    }

    // ── Notifications à TOUS les membres du projet ──────────────────────────
    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, email: true, username: true } } },
    });

    const content = `Nouveau commit lie a la tache : "${shortMsg}" par ${author}`;

    for (const member of members) {
      // Notification in-app
      await this.prisma.notification.create({
        data: { userId: member.userId, type: 'COMMIT_LINKED', content },
      });
      // WebSocket temps réel
      this.realtime.emitToUser(member.userId, 'notification:new', {
        type: 'COMMIT_LINKED',
        content,
        sha,
        taskId,
      });
    }

    // Email à l'assigné si la tâche est fermée automatiquement
    if (closeTask && task.assigneeId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: task.assigneeId },
        select: { email: true },
      });
      if (assignee?.email) {
        await this.mail.sendTaskClosedByCommitEmail(
          assignee.email, task.title, sha, shortMsg,
        ).catch(() => {}); // ne pas bloquer si l'email échoue
      }
    }
  }

  private async getProjectOwner(projectId: string): Promise<string> {
    const m = await this.prisma.projectMember.findFirst({
      where: { projectId, role: 'OWNER' },
    });
    return m?.userId ?? '';
  }
}
