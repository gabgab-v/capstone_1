-- CreateEnum
CREATE TYPE "public"."IdentityVerificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'VERIFIED', 'FAILED', 'NEEDS_RESUBMISSION');

-- CreateTable
CREATE TABLE "public"."IdentityVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "public"."IdentityVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "score" INTEGER NOT NULL DEFAULT 0,
    "faceMatchScore" DOUBLE PRECISION,
    "livenessPassed" BOOLEAN,
    "extractedFields" JSONB,
    "validationFindings" JSONB,
    "failureReasons" JSONB,
    "documentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selfieUrl" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdentityVerification_userId_key" ON "public"."IdentityVerification"("userId");

-- AddForeignKey
ALTER TABLE "public"."IdentityVerification" ADD CONSTRAINT "IdentityVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
