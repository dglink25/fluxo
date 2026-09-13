import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ── Utilisateur owner ────────────────────────────────────────────────────
  const owner = await prisma.user.upsert({
    where: { email: 'alice@fluxo.app' },
    update: {},
    create: {
      email: 'alice@fluxo.app',
      username: 'alice',
      fullName: 'Alice Dupont',
      provider: 'GOOGLE',
      providerId: 'seed-google-alice',
      phone: '+22900000000',
      phoneVerified: true,
    },
  });

  // ── Workspace ─────────────────────────────────────────────────────────────
  const workspace = await prisma.workspace.upsert({
    where: { id: 'seed-workspace' },
    update: {},
    create: {
      id: 'seed-workspace',
      name: 'Mon organisation',
      description: 'Workspace de démonstration Fluxo',
      ownerId: owner.id,
      members: { create: { userId: owner.id, role: 'OWNER' } },
    },
  });

  // ── Projet ───────────────────────────────────────────────────────────────
  const existingProject = await prisma.project.findFirst({
    where: { name: 'Projet de démonstration', ownerId: owner.id },
  });

  const project = existingProject ?? await prisma.project.create({
    data: {
      name: 'Projet de démonstration',
      description: 'Projet créé automatiquement pour tester Fluxo',
      ownerId: owner.id,
      workspaceId: workspace.id,
      members: { create: { userId: owner.id, role: 'OWNER' } },
      tasks: {
        create: [
          { title: 'Configurer le dépôt Git',                  status: 'DONE',        priority: 'MEDIUM', position: 1 },
          { title: 'Définir le schéma de base de données',     status: 'IN_PROGRESS', priority: 'HIGH',   position: 1 },
          { title: 'Concevoir la page de connexion',           status: 'IN_REVIEW',   priority: 'MEDIUM', position: 1 },
          { title: "Écrire les tests d'authentification",      status: 'TODO',        priority: 'LOW',    position: 1 },
          { title: 'Mettre en place la messagerie temps réel', status: 'TODO',        priority: 'HIGH',   position: 2 },
        ],
      },
    },
  });

  // ── Channel général ───────────────────────────────────────────────────────
  const existingChannel = await prisma.channel.findFirst({
    where: { projectId: project.id, name: 'général' },
  });
  if (!existingChannel) {
    await prisma.channel.create({
      data: { projectId: project.id, name: 'général' },
    });
  }

  console.log('✅ Données de démonstration créées/mises à jour');
  console.log('   Compte    : alice@fluxo.app (connexion via Google OAuth)');
  console.log(`   Workspace : ${workspace.name}`);
  console.log(`   Projet    : ${project.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
