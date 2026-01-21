-- AlterTable
ALTER TABLE "public"."Booking" ADD COLUMN     "rescheduleApprovalAt" TIMESTAMP(3),
ADD COLUMN     "rescheduleApprovalStatus" TEXT;

-- AlterTable
ALTER TABLE "public"."Event" ADD COLUMN     "rescheduleReason" TEXT,
ADD COLUMN     "rescheduledAt" TIMESTAMP(3);
