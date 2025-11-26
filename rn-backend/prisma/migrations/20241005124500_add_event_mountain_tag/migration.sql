-- Adds an optional mountainTag to events for discovery and display.

ALTER TABLE "Event"
ADD COLUMN IF NOT EXISTS "mountainTag" TEXT;
