ALTER TABLE "Events"
ADD COLUMN "automatedScheduling" BOOLEAN NOT NULL DEFAULT true;
UPDATE "Events"
SET "automatedScheduling" = false
WHERE "eventType" IN ('EVENT', 'TRYOUT', 'AFFILIATE');
