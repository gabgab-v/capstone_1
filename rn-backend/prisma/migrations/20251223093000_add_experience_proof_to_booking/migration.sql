-- Add optional experience proof document link for bookings
ALTER TABLE "Booking"
ADD COLUMN "experienceProofUrl" TEXT;
