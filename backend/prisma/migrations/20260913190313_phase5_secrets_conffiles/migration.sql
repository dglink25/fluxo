-- CreateEnum
CREATE TYPE "SecretAccessType" AS ENUM ('VIEW', 'COPY', 'EXPORT');

-- CreateTable
CREATE TABLE "Secret" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "valueEnc" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Secret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecretAccessLog" (
    "id" TEXT NOT NULL,
    "secretId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecretAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfidentialFile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileType" TEXT NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "contentEnc" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfidentialFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfidentialFileAccessLog" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfidentialFileAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Secret_projectId_name_key" ON "Secret"("projectId", "name");

-- CreateIndex
CREATE INDEX "ConfidentialFile_projectId_idx" ON "ConfidentialFile"("projectId");

-- AddForeignKey
ALTER TABLE "Secret" ADD CONSTRAINT "Secret_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretAccessLog" ADD CONSTRAINT "SecretAccessLog_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "Secret"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfidentialFile" ADD CONSTRAINT "ConfidentialFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfidentialFileAccessLog" ADD CONSTRAINT "ConfidentialFileAccessLog_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ConfidentialFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
