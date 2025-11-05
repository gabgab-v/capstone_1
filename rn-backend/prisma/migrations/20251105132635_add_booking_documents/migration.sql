-- Add documentation fields to bookings and extend difficulty enum
ALTER TABLE "public"."Booking"
ADD COLUMN "waiverUrl" TEXT,
ADD COLUMN "medicalCertificateUrl" TEXT,
ADD COLUMN "trailPolicyUrl" TEXT;

DO $$
BEGIN
    ALTER TYPE "public"."EventDifficulty" ADD VALUE 'TECHNICAL';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
