-- CreateTable
CREATE TABLE "public"."EventComment" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventComment_eventId_createdAt_idx" ON "public"."EventComment"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "EventComment_userId_idx" ON "public"."EventComment"("userId");

-- AddForeignKey
ALTER TABLE "public"."EventComment" ADD CONSTRAINT "EventComment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventComment" ADD CONSTRAINT "EventComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
