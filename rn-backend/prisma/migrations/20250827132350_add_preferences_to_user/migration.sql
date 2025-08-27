-- AlterTable
ALTER TABLE "User" ADD COLUMN     "budgetRange" TEXT,
ADD COLUMN     "experienceLevel" TEXT,
ADD COLUMN     "preferredDifficulty" TEXT,
ADD COLUMN     "preferredDurationHrs" DOUBLE PRECISION,
ADD COLUMN     "preferredTrailType" TEXT,
ADD COLUMN     "role" TEXT;
