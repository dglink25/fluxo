import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service d'intégration GitHub.
 * - Connecte un dépôt à un projet via le token OAuth GitHub
 * - Traite les webhooks push pour lier commits ↔ tâches
 * - Supporte les mots-clés : closes, fixes, resolves + #TASK-{id}
 */
@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  // Regex pour détecter les références : closes #TASK-uuid, fixes #TASK-uuid, etc.
  private readonly closeKeywordRegex =
    /(?:closes|fixes|resolves)\s+#TASK-([a-f0-9-]+)/gi;

  // Regex pour simple référence : #TASK-uuid
  private readonly refRegex = /#TASK-([a-f0-9-]+)/gi;

  constructor(private prisma: PrismaService) {}

  /** Connecter un dépôt GitHub à un projet */
  async connectRepository(
    projectId: string,
    userId: string,
    data: { repoFullName: string; githubToken: string },
  ) {
    // Pour l'instant on stocke la config dans les détails du projet
    // Dans un système de production, utiliser une table GitIntegration dédiée
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projet introuvable');

    // Créer une activité de connexion
    await this.prisma.activity.create({
      data: {
        projectId,
        userId,
        type: 'GIT_CONNECTED',
        details: { repoFullName: data.repoFullName },
      },
    });

    this.logger.log(`Dépôt ${data.repoFullName} connecté au projet ${projectId}`);
    return { connected: true, repoFullName: data.repoFullName, projectId };
  }

  /**
   * Traiter un événement push GitHub.
   * Analyse chaque message de commit pour lier tâches et mettre à jour statuts.
   */
  async handlePushEvent(projectId: string, payload: any) {
    const commits: any[] = payload.commits ?? [];
    const linkedTasks: string[] = [];

    for (const commit of commits) {
      const message: string = commit.message ?? '';
      const sha: string = (commit.id as string).slice(0, 7);
      const author: string = commit.author?.name ?? 'Inconnu';
      const commitUrl: string = commit.url ?? '';

      // 1. Chercher closes/fixes/resolves #TASK-{id}
      let match: RegExpExecArray | null;
      this.closeKeywordRegex.lastIndex = 0;
      while ((match = this.closeKeywordRegex.exec(message)) !== null) {
        const taskId = match[1];
        await this.linkCommitToTask(projectId, taskId, sha, author, message, commitUrl, true);
        linkedTasks.push(taskId);
      }

      // 2. Chercher les simples références #TASK-{id}
      this.refRegex.lastIndex = 0;
      while ((match = this.refRegex.exec(message)) !== null) {
        const taskId = match[1];
        if (!linkedTasks.includes(taskId)) {
          await this.linkCommitToTask(projectId, taskId, sha, author, message, commitUrl, false);
          linkedTasks.push(taskId);
        }
      }
    }

    return { processed: commits.length, linkedTasks };
  }

  private async linkCommitToTask(
    projectId: string,
    taskId: string,
    sha: string,
    author: string,
    message: string,
    commitUrl: string,
    closeTask: boolean,
  ) {
    // Vérifier que la tâche appartient bien au projet
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
    });

    if (!task) {
      // Référence invalide : ignorer silencieusement (requis par les specs)
      this.logger.debug(`Tâche ${taskId} non trouvée dans le projet ${projectId}, ignorée`);
      return;
    }

    // Enregistrer le lien dans le fil d'activité
    await this.prisma.activity.create({
      data: {
        projectId,
        userId: task.assigneeId ?? (await this.getProjectOwner(projectId)),
        type: 'COMMIT_LINKED',
        targetId: taskId,
        details: {
          sha,
          author,
          message: message.split('\n')[0].slice(0, 120), // première ligne, tronquée
          url: commitUrl,
          closedTask: closeTask,
        },
      },
    });

    // Si fermeture automatique demandée
    if (closeTask && task.status !== 'DONE') {
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: 'DONE' },
      });
      await this.prisma.activity.create({
        data: {
          projectId,
          userId: task.assigneeId ?? (await this.getProjectOwner(projectId)),
          type: 'TASK_STATUS_CHANGED',
          targetId: taskId,
          details: { newStatus: 'DONE', via: 'git_commit', sha },
        },
      });
      this.logger.log(`Tâche ${taskId} fermée automatiquement via commit ${sha}`);
    }
  }

  private async getProjectOwner(projectId: string): Promise<string> {
    const owner = await this.prisma.projectMember.findFirst({
      where: { projectId, role: 'OWNER' },
    });
    return owner?.userId ?? '';
  }
}
