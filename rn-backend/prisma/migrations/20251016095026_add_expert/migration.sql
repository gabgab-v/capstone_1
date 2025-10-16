-- DropForeignKey
ALTER TABLE "public"."ExpertApplication" DROP CONSTRAINT "ExpertApplication_userId_fkey";

-- AlterTable
ALTER TABLE "public"."ExpertApplication" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "public"."ExpertApplication" ADD CONSTRAINT "ExpertApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
