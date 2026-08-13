-- MatchSegments is the canonical source for per-segment winners and scores.
-- Backfill any rows created after the original segment migration before removing the legacy array.
INSERT INTO "MatchSegments" (
  "id",
  "createdAt",
  "updatedAt",
  "eventId",
  "matchId",
  "sequence",
  "status",
  "scores",
  "winnerEventTeamId",
  "startedAt",
  "endedAt"
)
SELECT
  "Matches"."id" || '_segment_' || series.index,
  COALESCE("Matches"."createdAt", NOW()),
  COALESCE("Matches"."updatedAt", NOW()),
  "Matches"."eventId",
  "Matches"."id",
  series.index,
  CASE
    WHEN COALESCE("Matches"."setResults"[series.index], 0) IN (1, 2) THEN 'COMPLETE'
    WHEN COALESCE("Matches"."team1Points"[series.index], 0) > 0
      OR COALESCE("Matches"."team2Points"[series.index], 0) > 0 THEN 'IN_PROGRESS'
    ELSE 'NOT_STARTED'
  END,
  jsonb_build_object(
    COALESCE("Matches"."team1Id", 'team1'),
    COALESCE("Matches"."team1Points"[series.index], 0),
    COALESCE("Matches"."team2Id", 'team2'),
    COALESCE("Matches"."team2Points"[series.index], 0)
  ),
  CASE COALESCE("Matches"."setResults"[series.index], 0)
    WHEN 1 THEN "Matches"."team1Id"
    WHEN 2 THEN "Matches"."team2Id"
    ELSE NULL
  END,
  CASE
    WHEN COALESCE("Matches"."team1Points"[series.index], 0) > 0
      OR COALESCE("Matches"."team2Points"[series.index], 0) > 0 THEN "Matches"."start"
    ELSE NULL
  END,
  CASE
    WHEN COALESCE("Matches"."setResults"[series.index], 0) IN (1, 2) THEN "Matches"."end"
    ELSE NULL
  END
FROM "Matches"
CROSS JOIN LATERAL generate_series(
  1,
  GREATEST(
    COALESCE(cardinality("Matches"."team1Points"), 0),
    COALESCE(cardinality("Matches"."team2Points"), 0),
    COALESCE(cardinality("Matches"."setResults"), 0)
  )
) AS series(index)
ON CONFLICT ("matchId", "sequence") DO NOTHING;

ALTER TABLE "Matches" DROP COLUMN "setResults";
