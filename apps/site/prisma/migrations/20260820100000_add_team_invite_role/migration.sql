-- Keep the existing eventId column and values unchanged.
-- Add invite columns as nullable so existing rows remain valid during the backfill.
ALTER TABLE "Invites"
  ADD COLUMN IF NOT EXISTS "staffTypes" TEXT[],
  ADD COLUMN IF NOT EXISTS "role" TEXT,
  ADD COLUMN IF NOT EXISTS "isAssigned" BOOLEAN;

-- Legacy rows can have a null staffTypes array. Normalize them before role derivation.
UPDATE "Invites"
SET "staffTypes" = ARRAY[]::TEXT[]
WHERE "staffTypes" IS NULL;

UPDATE "Invites"
SET
  "role" = CASE
    WHEN "type" = 'TEAM' AND 'MANAGER' = ANY(COALESCE("staffTypes", ARRAY[]::TEXT[])) THEN 'team_manager'
    WHEN "type" = 'TEAM' AND 'HEAD_COACH' = ANY(COALESCE("staffTypes", ARRAY[]::TEXT[])) THEN 'team_head_coach'
    WHEN "type" = 'TEAM' AND 'ASSISTANT_COACH' = ANY(COALESCE("staffTypes", ARRAY[]::TEXT[])) THEN 'team_assistant_coach'
    ELSE 'player'
  END,
  "isAssigned" = COALESCE("isAssigned", false)
WHERE "role" IS NULL OR "isAssigned" IS NULL;

-- Finalize the Prisma contract after all existing rows have safe values.
ALTER TABLE "Invites"
  ALTER COLUMN "staffTypes" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "staffTypes" SET NOT NULL,
  ALTER COLUMN "role" SET DEFAULT 'player',
  ALTER COLUMN "role" SET NOT NULL,
  ALTER COLUMN "isAssigned" SET DEFAULT false,
  ALTER COLUMN "isAssigned" SET NOT NULL;
