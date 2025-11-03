-- CreateEnum
CREATE TYPE "public"."BookingRequestOutcome" AS ENUM ('PENDING', 'SUCCESS', 'REJECTED', 'RATE_LIMITED', 'ERROR');

-- CreateEnum
CREATE TYPE "public"."BookingAccessAction" AS ENUM ('VIEW_BOOKINGS', 'VIEW_PAYMENT_RECEIPTS');

-- CreateTable
CREATE TABLE "public"."BookingRequestLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT,
    "bookingId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "ipAddress" TEXT,
    "outcome" "public"."BookingRequestOutcome" NOT NULL DEFAULT 'PENDING',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BookingAccessLog" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "action" "public"."BookingAccessAction" NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingRequestLog_userId_createdAt_idx" ON "public"."BookingRequestLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRequestLog_userId_idempotencyKey_key" ON "public"."BookingRequestLog"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BookingAccessLog_organizerId_createdAt_idx" ON "public"."BookingAccessLog"("organizerId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingAccessLog_eventId_createdAt_idx" ON "public"."BookingAccessLog"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."BookingRequestLog" ADD CONSTRAINT "BookingRequestLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingRequestLog" ADD CONSTRAINT "BookingRequestLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingRequestLog" ADD CONSTRAINT "BookingRequestLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingAccessLog" ADD CONSTRAINT "BookingAccessLog_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingAccessLog" ADD CONSTRAINT "BookingAccessLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
