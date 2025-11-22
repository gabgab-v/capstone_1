-- Add optional originTrailId to support sharing trails between users
ALTER TABLE "Trail"
ADD COLUMN "originTrailId" TEXT;

ALTER TABLE "Trail"
ADD CONSTRAINT "Trail_originTrailId_fkey"
FOREIGN KEY ("originTrailId") REFERENCES "Trail"("id") ON DELETE SET NULL ON UPDATE CASCADE;
