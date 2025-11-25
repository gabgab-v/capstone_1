-- Preserve previous preference snapshots whenever hikers update their settings
ALTER TABLE "User" ADD COLUMN "previousPreferences" JSONB;
