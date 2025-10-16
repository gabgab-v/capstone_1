-- CreateEnum
CREATE TYPE "ExpertApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "experienceLevelLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "expertBadgeAwarded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "expertVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ExpertApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "summitName" TEXT NOT NULL,
    "summitDate" TIMESTAMP(3),
    "peakPhotoUrl" TEXT NOT NULL,
    "certificateUrl" TEXT NOT NULL,
    "additionalNotes" TEXT,
    "status" "ExpertApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpertApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpertApplication_userId_key" ON "ExpertApplication"("userId");

-- AddForeignKey
ALTER TABLE "ExpertApplication"
ADD CONSTRAINT "ExpertApplication_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExpertApplication"
ADD CONSTRAINT "ExpertApplication_reviewerId_fkey"
FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
