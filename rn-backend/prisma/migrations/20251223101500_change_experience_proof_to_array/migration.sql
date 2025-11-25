-- Convert single experience proof link to multiple files
ALTER TABLE "Booking"
DROP COLUMN IF EXISTS "experienceProofUrl",
ADD COLUMN "experienceProofUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
