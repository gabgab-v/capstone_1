-- CreateEnum
CREATE TYPE "public"."EventDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'EXPERT');

-- AlterTable
ALTER TABLE "public"."Event" ADD COLUMN     "difficulty" "public"."EventDifficulty" NOT NULL DEFAULT 'BEGINNER';
