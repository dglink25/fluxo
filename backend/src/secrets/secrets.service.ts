import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// Clé de chiffrement — en production, utiliser un secret dédié via KMS ou Vault
// En dev, on dérive la clé depuis JWT_SECRET pour ne pas ajouter de variable
function getEncryptionKey(): Buffer {
  const base = process.env.SECRET_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'fluxo-dev-key-change-me';
  // Dériver une clé de 32 bytes avec SHA-256
  return crypto.createHash('sha256').update(base).digest();
}

function encrypt(plaintext: string): { valueEnc: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM;
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    valueEnc: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

function decrypt(valueEnc: string, iv: string, authTag: string): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'base64'),
  ) as crypto.DecipherGCM;
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(valueEnc, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

@Injectable()
export class SecretsService {
  constructor(private prisma: PrismaService) {}

  // ── Autorisation ────────────────────────────────────────────────────────────

  private async assertOwnerOrAdmin(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
      throw new ForbiddenException('Seuls les Owner et Admin peuvent gérer les secrets');
    }
    return member;
  }

  private async assertMember(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) throw new ForbiddenException("Vous n'êtes pas membre de ce projet");
    return member;
  }

  // ── Variables d'environnement ────────────────────────────────────────────────

  /** Liste les secrets (sans les valeurs), groupés par fichier */
  async listSecrets(projectId: string, userId: string) {
    await this.assertMember(projectId, userId);
    const secrets = await (this.prisma.secret as any).findMany({
      where: { projectId },
      select: {
        id: true, name: true, group: true, description: true,
        createdBy: true, createdAt: true, updatedAt: true,
      },
      orderBy: [{ group: 'asc' }, { name: 'asc' }],
    });
    return secrets;
  }

  /** Crée ou met à jour une variable dans un groupe donné */
  async upsertSecret(
    projectId: string,
    userId: string,
    name: string,
    value: string,
    description?: string,
    group = '.env',
  ) {
    await this.assertOwnerOrAdmin(projectId, userId);
    const { valueEnc, iv, authTag } = encrypt(value);

    return (this.prisma.secret as any).upsert({
      where: { projectId_group_name: { projectId, group, name } },
      create: { projectId, name, group, valueEnc, iv, authTag, description, createdBy: userId },
      update: { valueEnc, iv, authTag, description, updatedAt: new Date() },
      select: { id: true, name: true, group: true, description: true, createdAt: true, updatedAt: true },
    });
  }

  /** Importe plusieurs variables depuis un fichier .env parsé dans un groupe nommé */
  async importEnvFile(projectId: string, userId: string, content: string, group = '.env') {
    await this.assertOwnerOrAdmin(projectId, userId);

    const lines  = content.split('\n');
    const parsed: { name: string; value: string }[] = [];

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const name = line.slice(0, eqIdx).trim();
      let value  = line.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!name) continue;
      parsed.push({ name, value });
    }

    const results = await Promise.all(
      parsed.map((p) => this.upsertSecret(projectId, userId, p.name, p.value, undefined, group)),
    );
    return { imported: results.length, variables: results, group };
  }

  /** Révèle la valeur d'un secret et log l'accès */
  async revealSecret(secretId: string, userId: string, accessType: 'VIEW' | 'COPY') {
    const secret = await this.prisma.secret.findUnique({ where: { id: secretId } });
    if (!secret) throw new NotFoundException('Variable introuvable');
    await this.assertOwnerOrAdmin(secret.projectId, userId);
    await this.prisma.secretAccessLog.create({ data: { secretId, userId, accessType } });
    const value = decrypt(secret.valueEnc, secret.iv, secret.authTag);
    return { id: secret.id, name: secret.name, group: (secret as any).group ?? '.env', value };
  }

  /** Exporte toutes les variables d'un groupe en clair */
  async exportEnv(projectId: string, userId: string, group?: string) {
    await this.assertOwnerOrAdmin(projectId, userId);

    const where: any = { projectId };
    if (group) where.group = group;

    const secrets = await (this.prisma.secret as any).findMany({
      where,
      orderBy: [{ group: 'asc' }, { name: 'asc' }],
    });

    if (secrets.length > 0) {
      await this.prisma.secretAccessLog.createMany({
        data: secrets.map((s: any) => ({ secretId: s.id, userId, accessType: 'EXPORT' })),
      });
    }

    const lines: string[] = [];
    let currentGroup = '';
    for (const s of secrets) {
      const g = (s as any).group ?? '.env';
      if (!group && g !== currentGroup) {
        if (currentGroup) lines.push('');
        lines.push(`# ${g}`);
        currentGroup = g;
      }
      const value = decrypt(s.valueEnc, s.iv, s.authTag);
      lines.push(`${s.name}=${value}`);
    }

    return {
      content: lines.join('\n'),
      count: secrets.length,
      groups: [...new Set(secrets.map((s: any) => (s as any).group ?? '.env'))],
    };
  }

  /** Liste les groupes disponibles pour un projet */
  async listGroups(projectId: string, userId: string) {
    await this.assertMember(projectId, userId);
    const result = await (this.prisma.secret as any).findMany({
      where: { projectId },
      select: { group: true },
      distinct: ['group'],
      orderBy: { group: 'asc' },
    });
    return result.map((r: any) => r.group ?? '.env');
  }

  /** Supprime une variable */
  async deleteSecret(secretId: string, userId: string) {
    const secret = await this.prisma.secret.findUnique({ where: { id: secretId } });
    if (!secret) throw new NotFoundException('Variable introuvable');
    await this.assertOwnerOrAdmin(secret.projectId, userId);
    return this.prisma.secret.delete({ where: { id: secretId } });
  }

  /** Historique des accès d'une variable */
  async getSecretLogs(secretId: string, userId: string) {
    const secret = await this.prisma.secret.findUnique({ where: { id: secretId } });
    if (!secret) throw new NotFoundException('Variable introuvable');
    await this.assertOwnerOrAdmin(secret.projectId, userId);
    return this.prisma.secretAccessLog.findMany({
      where: { secretId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ── Fichiers confidentiels ───────────────────────────────────────────────────

  /** Liste les fichiers confidentiels (sans contenu) */
  async listConfidentialFiles(projectId: string, userId: string) {
    await this.assertMember(projectId, userId);
    return this.prisma.confidentialFile.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        fileType: true,
        description: true,
        sizeBytes: true,
        uploadedBy: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Upload un fichier confidentiel */
  async uploadConfidentialFile(
    projectId: string,
    userId: string,
    data: {
      name: string;
      fileType?: string;
      description?: string;
      content: string; // contenu brut (texte ou base64)
    },
  ) {
    await this.assertOwnerOrAdmin(projectId, userId);

    const { valueEnc, iv, authTag } = encrypt(data.content);

    return this.prisma.confidentialFile.create({
      data: {
        projectId,
        name: data.name,
        fileType: data.fileType ?? 'OTHER',
        description: data.description,
        contentEnc: valueEnc,
        iv,
        authTag,
        sizeBytes: Buffer.byteLength(data.content, 'utf8'),
        uploadedBy: userId,
      },
      select: {
        id: true,
        name: true,
        fileType: true,
        description: true,
        sizeBytes: true,
        uploadedBy: true,
        createdAt: true,
      },
    });
  }

  /** Télécharge le contenu d'un fichier confidentiel */
  async downloadConfidentialFile(fileId: string, userId: string) {
    const file = await this.prisma.confidentialFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('Fichier introuvable');

    await this.assertOwnerOrAdmin(file.projectId, userId);

    // Log accès
    await this.prisma.confidentialFileAccessLog.create({
      data: { fileId, userId, accessType: 'DOWNLOAD' },
    });

    const content = decrypt(file.contentEnc, file.iv, file.authTag);
    return { id: file.id, name: file.name, fileType: file.fileType, content };
  }

  /** Supprime un fichier confidentiel */
  async deleteConfidentialFile(fileId: string, userId: string) {
    const file = await this.prisma.confidentialFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('Fichier introuvable');
    await this.assertOwnerOrAdmin(file.projectId, userId);
    return this.prisma.confidentialFile.delete({ where: { id: fileId } });
  }
}
