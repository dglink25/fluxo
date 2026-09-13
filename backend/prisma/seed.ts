import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
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

  const project = await prisma.project.create({
    data: {
      name: 'Projet de démonstration',
      description: 'Projet créé automatiquement pour tester Fluxo',
      ownerId: owner.id,
      members: { create: { userId: owner.id, role: 'OWNER' } },
      tasks: {
        create: [
          { title: 'Configurer le dépôt Git', status: 'DONE', priority: 'MEDIUM' },
          { title: 'Définir le schéma de base de données', status: 'IN_PROGRESS', priority: 'HIGH' },
          { title: 'Concevoir la page de connexion', status: 'TODO', priority: 'MEDIUM' },
          { title: "Écrire les tests d'authentification", status: 'TODO', priority: 'LOW' },
        ],
      },
    },
  });

  console.log('Données de démonstration créées');
  console.log('  Compte de démo : alice@fluxo.app (connexion OAuth uniquement, ce compte seed sert de fixture)');
  console.log(`  Projet : ${project.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
