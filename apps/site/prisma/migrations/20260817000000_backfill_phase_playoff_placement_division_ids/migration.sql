UPDATE "Divisions" AS phase
SET "playoffPlacementDivisionIds" = source."playoffPlacementDivisionIds"
FROM "Divisions" AS source
WHERE phase."sourceDivisionId" = source."id"
  AND phase."eventId" = source."eventId"
  AND phase."role" = 'PHASE'
  AND source."role" = 'ENTRY'
  AND phase."phase" IN ('POOL', 'LEAGUE')
  AND phase."playoffPlacementDivisionIds" IS DISTINCT FROM source."playoffPlacementDivisionIds";
