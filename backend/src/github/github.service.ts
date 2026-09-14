import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/**
 * Format de commit Fluxo :
 *   git commit -m "message -_close(FLX-001)"
 *   git commit -m "fix bug -_inprogress(FLX-042)"
 *   git commit -m "review -_review(FLX-007)"
 *
 * Statuts supportés :
 *   close / done / terminé       → DONE
 *   inprogress / in_progress     → IN_PROGRESS
 *   review / inreview / in_review → IN_REVIEW
 *   todo / open                  → TODO
 */
@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  // Regex : -_statut(CODE) ou -_statut(CODE,CODE2,...) en fin de message
  private readonly commitRegex = /-_([a-z_]+)\(([^)]+)\)/gi;

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private whatsapp: WhatsappService,
    private realtime: RealtimeGateway,
  ) {}

  // ── Helpers token ─────────────────────────────────────────────────────────

  async getTokenForUser(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { githubAccessToken: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (!user.githubAccessToken) {
      throw new UnauthorizedException('Aucun compte GitHub lié. Liez votre compte depuis l\'onglet GitHub.');
    }
    return user.githubAccessToken;
  }

  // ── API GitHub — liste repos ──────────────────────────────────────────────

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
      name: r.name, fullName: r.full_name,
      private: r.private, description: r.description ?? null,
    }));
  }

  // ── Gestion des repos connectés (persistés en BDD) ────────────────────────

  /** Liste les repos connectés à un projet */
  async listProjectRepositories(projectId: string) {
    return this.prisma.projectRepository.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Connecter un dépôt (crée le webhook + persiste en BDD) */
  async connectRepository(projectId: string, userId: string, repoFullName: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projet introuvable');

    const token = await this.getTokenForUser(userId);
    const { hookId } = await this.setupWebhook(token, repoFullName, projectId);

    // Upsert — si le repo est déjà connecté, on met juste à jour le hookId
    const repo = await this.prisma.projectRepository.upsert({
      where: { projectId_repoFullName: { projectId, repoFullName } },
      create: { projectId, repoFullName, hookId, connectedBy: userId },
      update: { hookId, connectedBy: userId },
    });

    await this.prisma.activity.create({
      data: {
        projectId, userId, type: 'GIT_CONNECTED',
        details: { repoFullName, hookId },
      },
    });

    this.logger.log(`Depot ${repoFullName} connecte au projet ${projectId}`);
    return repo;
  }

  /** Déconnecter un dépôt */
  async disconnectRepository(projectId: string, repoFullName: string, userId: string) {
    const repo = await this.prisma.projectRepository.findUnique({
      where: { projectId_repoFullName: { projectId, repoFullName } },
    });
    if (!repo) throw new NotFoundException('Depot non connecte');

    // Tenter de supprimer le webhook GitHub
    try {
      const token = await this.getTokenForUser(userId);
      if (repo.hookId && repo.hookId > 0) {
        await fetch(`https://api.github.com/repos/${repoFullName}/hooks/${repo.hookId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Fluxo-App' },
        });
      }
    } catch {
      // Pas bloquant si ça échoue
    }

    await this.prisma.projectRepository.delete({
      where: { projectId_repoFullName: { projectId, repoFullName } },
    });

    return { disconnected: true };
  }

  private async setupWebhook(token: string, repoFullName: string, projectId: string) {
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
        name: 'web', active: true, events: ['push'],
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
    this.logger.log(`Webhook cree (id ${data.id}) -> ${webhookUrl}`);
    return { hookId: data.id as number };
  }

  // ── Traitement du webhook push ────────────────────────────────────────────

  async handlePushEvent(projectId: string, payload: any) {
    const commits: any[] = payload.commits ?? [];
    const pusherName: string = payload.pusher?.name ?? payload.sender?.login ?? 'Inconnu';
    const results: { sha: string; code: string; status?: string; found: boolean }[] = [];

    for (const commit of commits) {
      const message: string  = commit.message ?? '';
      const sha: string      = (commit.id as string ?? '').slice(0, 7);
      const author: string   = commit.author?.name ?? pusherName;
      const commitUrl: string = commit.url ?? '';

      // Trouver tous les -_statut(CODE) dans le message
      this.commitRegex.lastIndex = 0;
      let m: RegExpExecArray | null;
      let hasMatch = false;

      while ((m = this.commitRegex.exec(message)) !== null) {
        hasMatch = true;
        const rawStatus = m[1].toLowerCase();
        const codes = m[2].split(',').map((c) => c.trim().toUpperCase());
        const newStatus = this.parseStatus(rawStatus);

        for (const code of codes) {
          const result = await this.processCommitCode(
            projectId, code, newStatus, sha, author, message, commitUrl,
          );
          results.push({ sha, code, status: newStatus ?? undefined, found: result.found });
        }
      }

      // Aucun code dans le message — notifier l'auteur uniquement
      if (!hasMatch) {
        await this.notifyNoCode(projectId, sha, author, message);
      }
    }

    return { processed: commits.length, results };
  }

  private parseStatus(raw: string): string | null {
    if (['close', 'done', 'termine', 'terminé', 'closed', 'fix', 'fixes', 'resolves', 'resolved'].includes(raw)) return 'DONE';
    if (['inprogress', 'in_progress', 'progress', 'wip', 'started'].includes(raw)) return 'IN_PROGRESS';
    if (['review', 'inreview', 'in_review', 'pr'].includes(raw)) return 'IN_REVIEW';
    if (['todo', 'open', 'reopen'].includes(raw)) return 'TODO';
    return null;
  }

  private async processCommitCode(
    projectId: string, code: string, newStatus: string | null,
    sha: string, author: string, message: string, commitUrl: string,
  ): Promise<{ found: boolean }> {
    const shortMsg = message.split('\n')[0].slice(0, 120);

    // Chercher la tâche par code dans ce projet
    const task = await this.prisma.task.findFirst({
      where: { projectId, code },
      include: { assignees: { include: { user: { select: { id: true, email: true, phone: true, username: true } } } } },
    });

    if (!task) {
      // Code non trouvé — notifier l'auteur du push
      await this.notifyCodeNotFound(projectId, sha, code, author, message);
      return { found: false };
    }

    // Enregistrer l'activité commit
    const ownerId = await this.getProjectOwner(projectId);
    await this.prisma.activity.create({
      data: {
        projectId,
        userId: task.assigneeId ?? ownerId,
        type: 'COMMIT_LINKED',
        targetId: task.id,
        details: { sha, author, message: shortMsg, url: commitUrl, newStatus, code },
      },
    });

    // Mettre à jour le statut si applicable
    let statusChanged = false;
    if (newStatus && task.status !== newStatus) {
      await this.prisma.task.update({ where: { id: task.id }, data: { status: newStatus as any } });
      await this.prisma.activity.create({
        data: {
          projectId, userId: task.assigneeId ?? ownerId,
          type: 'TASK_STATUS_CHANGED', targetId: task.id,
          details: { oldStatus: task.status, newStatus, via: 'git_commit', sha, code },
        },
      });
      statusChanged = true;
      this.logger.log(`Tache ${code} (${task.id}) -> ${newStatus} via commit ${sha}`);
    }

    // Notifier TOUS les membres
    await this.notifyAllMembers(projectId, task, code, sha, shortMsg, author, newStatus, statusChanged);

    return { found: true };
  }

  private async notifyAllMembers(
    projectId: string, task: any, code: string, sha: string,
    commitMsg: string, author: string, newStatus: string | null, statusChanged: boolean,
  ) {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, email: true, phone: true, username: true, fullName: true } },
      },
    });

    const statusLabel = newStatus ? ` → statut ${newStatus}` : '';
    const inAppContent = `[${code}] Commit ${sha} par ${author}${statusLabel} : "${commitMsg}"`;

    for (const member of members) {
      // Notification in-app
      await this.prisma.notification.create({
        data: { userId: member.userId, type: 'COMMIT_LINKED', content: inAppContent },
      });
      this.realtime.emitToUser(member.userId, 'notification:new', {
        type: 'COMMIT_LINKED', content: inAppContent, sha, code,
        taskId: task.id, newStatus,
      });

      const { email, phone, username } = member.user;

      // Email
      if (email) {
        await this.mail.sendCommitLinkedEmail(
          email, task.title, code, sha, commitMsg, author, newStatus,
        ).catch(() => {});
      }

      // WhatsApp (si numéro vérifié)
      if (phone) {
        await this.whatsapp.sendCommitLinkedMessage(
          phone, task.title, code, sha, commitMsg, author, newStatus,
        ).catch(() => {});
      }
    }
  }

  private async notifyCodeNotFound(
    projectId: string, sha: string, code: string, author: string, message: string,
  ) {
    // Chercher le pusher par son nom GitHub ou le owner du projet
    const ownerId = await this.getProjectOwner(projectId);
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { email: true, phone: true },
    });

    const msg = `Push detecte (${sha}) mais le code ${code} n'a pas ete trouve dans ce projet. Verifiez votre commit.`;

    if (owner?.email) {
      await this.mail.sendCommitWarningEmail(owner.email, code, sha, message).catch(() => {});
    }
    if (owner?.phone) {
      await this.whatsapp.sendCommitWarningMessage(owner.phone, code, sha, message).catch(() => {});
    }

    this.logger.warn(`Code ${code} non trouve dans le projet ${projectId} (commit ${sha})`);
  }

  private async notifyNoCode(
    projectId: string, sha: string, author: string, message: string,
  ) {
    const ownerId = await this.getProjectOwner(projectId);
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { email: true, phone: true },
    });

    const shortMsg = message.split('\n')[0].slice(0, 80);
    const warningMsg = `Push detecte (${sha}) sans code de tache. Message : "${shortMsg}". Utilisez -_statut(CODE) pour lier un commit.`;

    if (owner?.email) {
      await this.mail.sendCommitWarningEmail(owner.email, 'aucun', sha, message).catch(() => {});
    }
    if (owner?.phone) {
      await this.whatsapp.sendCommitWarningMessage(owner.phone, 'aucun', sha, shortMsg).catch(() => {});
    }
  }

  private async getProjectOwner(projectId: string): Promise<string> {
    const m = await this.prisma.projectMember.findFirst({
      where: { projectId, role: 'OWNER' },
    });
    return m?.userId ?? '';
  }
}
