-- CreateEnum
CREATE TYPE "VideoCallStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "VideoCall" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "title" TEXT,
    "hostId" TEXT NOT NULL,
    "status" "VideoCallStatus" NOT NULL DEFAULT 'LIVE',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "channelId" TEXT,
    "dmId" TEXT,
    "remindersSent" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoCallParticipant" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3),

    CONSTRAINT "VideoCallParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoCall_roomId_key" ON "VideoCall"("roomId");

-- CreateIndex
CREATE INDEX "VideoCall_scheduledAt_status_idx" ON "VideoCall"("scheduledAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VideoCallParticipant_callId_userId_key" ON "VideoCallParticipant"("callId", "userId");

-- AddForeignKey
ALTER TABLE "VideoCall" ADD CONSTRAINT "VideoCall_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCallParticipant" ADD CONSTRAINT "VideoCallParticipant_callId_fkey" FOREIGN KEY ("callId") REFERENCES "VideoCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCallParticipant" ADD CONSTRAINT "VideoCallParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
