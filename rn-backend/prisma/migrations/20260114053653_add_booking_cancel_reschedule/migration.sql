-- AlterTable
ALTER TABLE "public"."Booking" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "rescheduleReason" TEXT,
ADD COLUMN     "rescheduleRequestedAt" TIMESTAMP(3);
