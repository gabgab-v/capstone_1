import { prisma } from "@/lib/prisma";

const BOOKING_COLUMN_QUERIES = [
  'ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "rescheduleApprovalStatus" TEXT;',
  'ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "rescheduleApprovalAt" TIMESTAMP(3);',
];

export async function ensureBookingColumns() {
  for (const query of BOOKING_COLUMN_QUERIES) {
    try {
      await prisma.$executeRawUnsafe(query);
    } catch (error) {
      console.error("ensureBookingColumns error:", {
        query,
        message: error?.message || error,
      });
    }
  }
}
