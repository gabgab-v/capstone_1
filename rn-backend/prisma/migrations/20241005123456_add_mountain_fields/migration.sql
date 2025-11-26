-- Adds mountain suggestion fields for legacy databases missing these columns.
-- Safe to run multiple times thanks to IF NOT EXISTS checks.

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "preferredMountains" TEXT[] DEFAULT '{}'::text[];

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "mountainSuggestionsEnabled" BOOLEAN NOT NULL DEFAULT TRUE;

-- Ensure existing rows pick up defaults.
UPDATE "User" SET "preferredMountains" = COALESCE("preferredMountains", '{}'::text[]);
UPDATE "User" SET "mountainSuggestionsEnabled" = COALESCE("mountainSuggestionsEnabled", TRUE);

-- Enforce not-null on the array to match Prisma schema expectations.
ALTER TABLE "User"
ALTER COLUMN "preferredMountains" SET NOT NULL;
