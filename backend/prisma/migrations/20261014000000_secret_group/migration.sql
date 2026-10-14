-- Ajouter la colonne group avec valeur par défaut '.env'
ALTER TABLE "Secret" ADD COLUMN "group" TEXT NOT NULL DEFAULT '.env';

-- Supprimer l'ancienne contrainte unique
DROP INDEX IF EXISTS "Secret_projectId_name_key";

-- Créer la nouvelle contrainte unique (projectId + group + name)
ALTER TABLE "Secret" ADD CONSTRAINT "Secret_projectId_group_name_key"
  UNIQUE ("projectId", "group", "name");

-- Index pour les requêtes par groupe
CREATE INDEX IF NOT EXISTS "Secret_projectId_group_idx" ON "Secret"("projectId", "group");
