/*
  Warnings:

  - A unique constraint covering the columns `[projectId,code]` on the table `Task` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "taskCounter" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taskPrefix" TEXT NOT NULL DEFAULT 'FLX';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "code" TEXT;

-- CreateTable
CREATE TABLE "ProjectRepository" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "hookId" INTEGER,
    "connectedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectRepository_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRepository_projectId_repoFullName_key" ON "ProjectRepository"("projectId", "repoFullName");

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_code_key" ON "Task"("projectId", "code");

-- AddForeignKey
ALTER TABLE "ProjectRepository" ADD CONSTRAINT "ProjectRepository_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
