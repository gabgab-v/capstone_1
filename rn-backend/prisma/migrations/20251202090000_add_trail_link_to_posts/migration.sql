ALTER TABLE "public"."Post"
ADD COLUMN "trailId" TEXT;

CREATE INDEX "Post_trailId_idx" ON "public"."Post"("trailId");

ALTER TABLE "public"."Post"
ADD CONSTRAINT "Post_trailId_fkey"
FOREIGN KEY ("trailId")
REFERENCES "public"."Trail"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
