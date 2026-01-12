-- AlterTable
ALTER TABLE "public"."Booking" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "refundAmount" DOUBLE PRECISION,
ADD COLUMN     "refundPercentage" INTEGER,
ADD COLUMN     "refundPolicyCode" TEXT,
ADD COLUMN     "refundPolicyLabel" TEXT;
