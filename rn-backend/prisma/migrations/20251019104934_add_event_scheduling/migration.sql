-- CreateEnum
CREATE TYPE "public"."EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "public"."Event" ADD COLUMN     "announceAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "maxParticipants" INTEGER,
ADD COLUMN     "minParticipants" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "registrationClosesAt" TIMESTAMP(3),
ADD COLUMN     "registrationOpensAt" TIMESTAMP(3),
ADD COLUMN     "startsAt" TIMESTAMP(3),
ADD COLUMN     "status" "public"."EventStatus" NOT NULL DEFAULT 'PUBLISHED';
