ALTER TABLE "Divisions"
ADD COLUMN "isSystemGenerated" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Divisions"
SET "isSystemGenerated" = true
WHERE "role" = 'PHASE'
  AND "sourceDivisionId" IS NOT NULL
  AND "phase" IS NOT NULL
  AND "id" = "sourceDivisionId" || '__phase__' || lower("phase"::text);
