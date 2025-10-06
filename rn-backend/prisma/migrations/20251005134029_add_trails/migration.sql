-- CreateTable
CREATE TABLE "public"."Trail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "totalDistanceMeters" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "geoJson" JSONB NOT NULL,
    "samples" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trail_userId_startedAt_idx" ON "public"."Trail"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "public"."Trail" ADD CONSTRAINT "Trail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
