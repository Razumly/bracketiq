-- Replenishment admission permits one non-terminal wave per rollout cohort.
-- Preserve the oldest live wave for each cohort before adding the unique index.
CREATE TEMP TABLE "_AffiliateReplenishmentWaveCohortLosers" ON COMMIT DROP AS
SELECT "id"
FROM (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "rolloutCohort"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "waveRank"
  FROM "AffiliateReplenishmentWaves"
  WHERE "status" IN ('PLANNED', 'ACTIVE', 'WAITING')
) AS ranked
WHERE "waveRank" > 1;

-- Repoint demands from paused duplicates to the surviving live wave.
UPDATE "AffiliateReplenishmentDemands" AS demand
SET
  "activeWaveId" = (
    SELECT survivor."id"
    FROM "AffiliateReplenishmentWaves" AS loser
    LEFT JOIN LATERAL (
      SELECT candidate."id"
      FROM "AffiliateReplenishmentWaves" AS candidate
      WHERE candidate."rolloutCohort" = loser."rolloutCohort"
        AND candidate."demandId" = demand."id"
        AND candidate."status" IN ('PLANNED', 'ACTIVE', 'WAITING')
        AND candidate."id" NOT IN (
          SELECT "id"
          FROM "_AffiliateReplenishmentWaveCohortLosers"
        )
      ORDER BY candidate."createdAt" ASC, candidate."id" ASC
      LIMIT 1
    ) AS survivor ON TRUE
    WHERE loser."id" = demand."activeWaveId"
      AND loser."id" IN (
        SELECT "id"
        FROM "_AffiliateReplenishmentWaveCohortLosers"
      )
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE demand."activeWaveId" IN (
  SELECT "id"
  FROM "_AffiliateReplenishmentWaveCohortLosers"
);

UPDATE "AffiliateReplenishmentWaves"
SET
  "status" = 'PAUSED',
  "terminalAt" = COALESCE("terminalAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP,
  "errorCode" = COALESCE("errorCode", 'COHORT_ADMISSION_RECONCILIATION'),
  "resultJson" = COALESCE("resultJson", '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260822150000_enforce_replenishment_wave_cohort_admission',
      'pausedDuplicate', true
    )
WHERE "id" IN (SELECT "id" FROM "_AffiliateReplenishmentWaveCohortLosers");

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateReplenishmentWaves_one_live_per_cohort"
  ON "AffiliateReplenishmentWaves" ("rolloutCohort")
  WHERE "status" IN ('PLANNED', 'ACTIVE', 'WAITING');
