-- CreateEnum
CREATE TYPE "PostVisibility" AS ENUM ('PUBLIC', 'FRIENDS', 'PRIVATE');

-- AlterTable
ALTER TABLE "Post"
ADD COLUMN "visibility" "PostVisibility" NOT NULL DEFAULT 'PUBLIC';
