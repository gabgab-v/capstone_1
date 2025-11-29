-- CreateEnum
CREATE TYPE "public"."FacebookVerificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'VERIFIED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."OrganizerTrustTier" AS ENUM ('VERIFIED_ORGANIZER', 'PROVISIONAL', 'UNVERIFIED');

-- CreateTable
CREATE TABLE "public"."FacebookVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pageId" TEXT,
    "pageName" TEXT,
    "pageUrl" TEXT,
    "status" "public"."FacebookVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "score" INTEGER NOT NULL DEFAULT 0,
    "engagementScore" INTEGER,
    "hikingRatio" DOUBLE PRECISION,
    "postSample" JSONB,
    "failureReasons" JSONB,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacebookVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FacebookVerification_userId_key" ON "public"."FacebookVerification"("userId");

-- AddForeignKey
ALTER TABLE "public"."FacebookVerification" ADD CONSTRAINT "FacebookVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddColumns for trust score (optional, used for rollup)
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "organizerTrustScore" INTEGER;
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "organizerTrustTier" "public"."OrganizerTrustTier";
