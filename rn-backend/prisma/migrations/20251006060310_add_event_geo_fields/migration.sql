-- AlterTable
ALTER TABLE "public"."Event" ADD COLUMN     "locationBounds" JSONB,
ADD COLUMN     "locationLatitude" DOUBLE PRECISION,
ADD COLUMN     "locationLongitude" DOUBLE PRECISION,
ADD COLUMN     "locationName" TEXT,
ADD COLUMN     "locationZoomLevel" DOUBLE PRECISION,
ADD COLUMN     "trailDistanceMeters" DOUBLE PRECISION,
ADD COLUMN     "trailGeoJson" JSONB,
ADD COLUMN     "trailId" TEXT;

-- CreateIndex
CREATE INDEX "Event_trailId_idx" ON "public"."Event"("trailId");

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_trailId_fkey" FOREIGN KEY ("trailId") REFERENCES "public"."Trail"("id") ON DELETE SET NULL ON UPDATE CASCADE;
