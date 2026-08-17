BEGIN;

CREATE TYPE "DivisionRoleEnum" AS ENUM ('ENTRY', 'PHASE');
CREATE TYPE "DivisionPhaseEnum" AS ENUM ('LEAGUE', 'POOL', 'BRACKET', 'PLAYOFF');

ALTER TABLE "Divisions"
  ADD COLUMN "role" "DivisionRoleEnum" NOT NULL DEFAULT 'ENTRY',
  ADD COLUMN "phase" "DivisionPhaseEnum";

UPDATE "Divisions" AS d
SET
  "role" = 'PHASE',
  "phase" = CASE
    WHEN e."eventType" = 'LEAGUE' THEN 'PLAYOFF'::"DivisionPhaseEnum"
    WHEN e."eventType" = 'TOURNAMENT' THEN 'BRACKET'::"DivisionPhaseEnum"
  END
FROM "Events" AS e
WHERE d."eventId" = e."id"
  AND d."kind" = 'PLAYOFF'
  AND e."eventType" IN ('LEAGUE', 'TOURNAMENT');

UPDATE "Divisions" AS phase
SET "fieldIds" = CASE
  WHEN cardinality(source."fieldIds") > 0 THEN source."fieldIds"
  ELSE event."fieldIds"
END
FROM "Divisions" AS source, "Events" AS event
WHERE phase."role" = 'PHASE'
  AND phase."sourceDivisionId" = source."id"
  AND event."id" = phase."eventId"
  AND cardinality(phase."fieldIds") = 0;

ALTER TABLE "Matches"
  ADD COLUMN "placementState" TEXT NOT NULL DEFAULT 'UNPLACED';
UPDATE "Matches"
SET "placementState" = 'PLACED'
WHERE "fieldId" IS NOT NULL
   OR "start" IS NOT NULL;

CREATE TABLE "EventDivisionPhaseSources" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "entryDivisionId" TEXT NOT NULL,
  "phaseDivisionId" TEXT NOT NULL,
  "phase" "DivisionPhaseEnum" NOT NULL,
  "sortOrder" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventDivisionPhaseSources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventDivisionPhaseSources_entryDivisionId_phaseDivisionId_key"
  ON "EventDivisionPhaseSources" ("entryDivisionId", "phaseDivisionId");
CREATE INDEX "EventDivisionPhaseSources_eventId_phase_sortOrder_idx"
  ON "EventDivisionPhaseSources" ("eventId", "phase", "sortOrder");
CREATE INDEX "EventDivisionPhaseSources_entryDivisionId_idx"
  ON "EventDivisionPhaseSources" ("entryDivisionId");
CREATE INDEX "EventDivisionPhaseSources_phaseDivisionId_idx"
  ON "EventDivisionPhaseSources" ("phaseDivisionId");
INSERT INTO "EventDivisionPhaseSources" (
  "id",
  "eventId",
  "entryDivisionId",
  "phaseDivisionId",
  "phase",
  "sortOrder",
  "createdAt",
  "updatedAt"
)
SELECT
  concat('phase-source-', d."eventId", '-', d."id", '-', d."sourceDivisionId"),
  d."eventId",
  d."sourceDivisionId",
  d."id",
  d."phase",
  d."sortOrder",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Divisions" AS d
WHERE d."role" = 'PHASE'
  AND d."eventId" IS NOT NULL
  AND d."sourceDivisionId" IS NOT NULL
ON CONFLICT ("entryDivisionId", "phaseDivisionId") DO NOTHING;

CREATE TABLE "EventDivisionPhaseParticipants" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "phaseDivisionId" TEXT NOT NULL,
  "eventTeamId" TEXT NOT NULL,
  "sourceEntryDivisionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventDivisionPhaseParticipants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventDivisionPhaseParticipants_phaseDivisionId_eventTeamId_key"
  ON "EventDivisionPhaseParticipants" ("phaseDivisionId", "eventTeamId");
INSERT INTO "EventDivisionPhaseParticipants" (
  "id",
  "eventId",
  "phaseDivisionId",
  "eventTeamId",
  "sourceEntryDivisionId",
  "createdAt",
  "updatedAt"
)
SELECT
  concat('phase-participant-', d."eventId", '-', d."id", '-', btrim(team.team_id)),
  d."eventId",
  d."id",
  btrim(team.team_id),
  d."sourceDivisionId",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Divisions" AS d
CROSS JOIN LATERAL unnest(d."teamIds") AS team(team_id)
WHERE d."role" = 'PHASE'
  AND d."eventId" IS NOT NULL
  AND btrim(team.team_id) <> ''
ON CONFLICT ("phaseDivisionId", "eventTeamId") DO NOTHING;
CREATE INDEX "EventDivisionPhaseParticipants_eventId_phaseDivisionId_idx"
  ON "EventDivisionPhaseParticipants" ("eventId", "phaseDivisionId");
CREATE INDEX "EventDivisionPhaseParticipants_eventTeamId_idx"
  ON "EventDivisionPhaseParticipants" ("eventTeamId");

COMMIT;
