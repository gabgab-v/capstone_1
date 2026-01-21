-- AlterTable
ALTER TABLE "public"."Event" ADD COLUMN     "reschedulePollClosesAt" TIMESTAMP(3),
ADD COLUMN     "reschedulePollOpensAt" TIMESTAMP(3),
ADD COLUMN     "reschedulePollStatus" TEXT;
