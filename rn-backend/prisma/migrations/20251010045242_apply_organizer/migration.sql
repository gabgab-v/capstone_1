-- DropForeignKey
ALTER TABLE "public"."OrganizerApplication" DROP CONSTRAINT "OrganizerApplication_userId_fkey";

-- AlterTable
ALTER TABLE "public"."OrganizerApplication" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "public"."OrganizerApplication" ADD CONSTRAINT "OrganizerApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
