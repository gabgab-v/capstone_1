-- CreateTable
CREATE TABLE "public"."OrganizerReview" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizerReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizerReview_organizerId_idx" ON "public"."OrganizerReview"("organizerId");

-- CreateIndex
CREATE INDEX "OrganizerReview_reviewerId_idx" ON "public"."OrganizerReview"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerReview_organizerId_reviewerId_key" ON "public"."OrganizerReview"("organizerId", "reviewerId");

-- AddForeignKey
ALTER TABLE "public"."OrganizerReview" ADD CONSTRAINT "OrganizerReview_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrganizerReview" ADD CONSTRAINT "OrganizerReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
