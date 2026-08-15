BEGIN;

ALTER TABLE "Sports"
  ADD COLUMN "resourceLabelSingular" TEXT,
  ADD COLUMN "resourceLabelPlural" TEXT;

UPDATE "Sports"
SET
  "resourceLabelSingular" = CASE
    WHEN lower(btrim("name")) LIKE '%volleyball%'
      OR lower(btrim("name")) IN ('basketball', 'tennis', 'pickleball', 'badminton', 'racquetball', 'futsal')
      THEN 'Court'
    WHEN lower(btrim("name")) IN ('hockey', 'ball hockey')
      THEN 'Rink'
    WHEN lower(btrim("name")) IN ('baseball', 'softball')
      THEN 'Diamond'
    WHEN lower(btrim("name")) = 'table tennis'
      THEN 'Table'
    WHEN lower(btrim("name")) LIKE '%soccer%'
      OR lower(btrim("name")) IN ('football', 'flag football', 'field hockey', 'lacrosse', 'australian football', 'ultimate frisbee')
      THEN 'Field'
    ELSE 'Resource'
  END,
  "resourceLabelPlural" = CASE
    WHEN lower(btrim("name")) LIKE '%volleyball%'
      OR lower(btrim("name")) IN ('basketball', 'tennis', 'pickleball', 'badminton', 'racquetball', 'futsal')
      THEN 'Courts'
    WHEN lower(btrim("name")) IN ('hockey', 'ball hockey')
      THEN 'Rinks'
    WHEN lower(btrim("name")) IN ('baseball', 'softball')
      THEN 'Diamonds'
    WHEN lower(btrim("name")) = 'table tennis'
      THEN 'Tables'
    WHEN lower(btrim("name")) LIKE '%soccer%'
      OR lower(btrim("name")) IN ('football', 'flag football', 'field hockey', 'lacrosse', 'australian football', 'ultimate frisbee')
      THEN 'Fields'
    ELSE 'Resources'
  END;

ALTER TABLE "Sports"
  ALTER COLUMN "resourceLabelSingular" SET NOT NULL,
  ALTER COLUMN "resourceLabelSingular" SET DEFAULT 'Resource',
  ALTER COLUMN "resourceLabelPlural" SET NOT NULL,
  ALTER COLUMN "resourceLabelPlural" SET DEFAULT 'Resources',
  ADD CONSTRAINT "Sports_resourceLabelSingular_valid" CHECK (
    "resourceLabelSingular" = btrim("resourceLabelSingular")
    AND char_length("resourceLabelSingular") BETWEEN 1 AND 40
  ),
  ADD CONSTRAINT "Sports_resourceLabelPlural_valid" CHECK (
    "resourceLabelPlural" = btrim("resourceLabelPlural")
    AND char_length("resourceLabelPlural") BETWEEN 1 AND 40
  );

COMMIT;
