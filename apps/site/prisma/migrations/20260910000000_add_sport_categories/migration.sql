BEGIN;

CREATE TABLE "SportCategories" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "sportIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SportCategories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SportCategories_name_valid" CHECK (
      "name" = BTRIM("name")
      AND char_length("name") BETWEEN 1 AND 80
    ),
    CONSTRAINT "SportCategories_displayOrder_valid" CHECK ("displayOrder" >= 0)
);

CREATE UNIQUE INDEX "SportCategories_name_ci_key"
  ON "SportCategories" (LOWER(BTRIM("name")));

CREATE INDEX "SportCategories_displayOrder_name_idx"
  ON "SportCategories" ("displayOrder", "name");

-- Category membership stores Sport IDs without a foreign key because Sports
-- has existing denormalized references and no relational category join.
-- Resolve current IDs by canonical Sport name so this seed also works when a
-- pre-existing database chose a non-name Sport ID for the same canonical row.
INSERT INTO "SportCategories" ("id", "name", "sportIds", "displayOrder")
VALUES
(
  'soccer',
  'Soccer',
  ARRAY(
    SELECT s."id"
    FROM "Sports" AS s
    WHERE LOWER(BTRIM(s."name")) IN ('indoor soccer', 'grass soccer', 'beach soccer', 'futsal')
    ORDER BY CASE LOWER(BTRIM(s."name"))
      WHEN 'indoor soccer' THEN 1
      WHEN 'grass soccer' THEN 2
      WHEN 'beach soccer' THEN 3
      WHEN 'futsal' THEN 4
    END
  ),
  10
),
(
  'volleyball',
  'Volleyball',
  ARRAY(
    SELECT s."id"
    FROM "Sports" AS s
    WHERE LOWER(BTRIM(s."name")) IN ('indoor volleyball', 'beach volleyball', 'grass volleyball')
    ORDER BY CASE LOWER(BTRIM(s."name"))
      WHEN 'indoor volleyball' THEN 1
      WHEN 'beach volleyball' THEN 2
      WHEN 'grass volleyball' THEN 3
    END
  ),
  20
),
(
  'football',
  'Football',
  ARRAY(
    SELECT s."id"
    FROM "Sports" AS s
    WHERE LOWER(BTRIM(s."name")) IN ('football', 'flag football', 'australian football')
    ORDER BY CASE LOWER(BTRIM(s."name"))
      WHEN 'football' THEN 1
      WHEN 'flag football' THEN 2
      WHEN 'australian football' THEN 3
    END
  ),
  30
),
(
  'hockey',
  'Hockey',
  ARRAY(
    SELECT s."id"
    FROM "Sports" AS s
    WHERE LOWER(BTRIM(s."name")) IN ('hockey', 'field hockey', 'ball hockey')
    ORDER BY CASE LOWER(BTRIM(s."name"))
      WHEN 'hockey' THEN 1
      WHEN 'field hockey' THEN 2
      WHEN 'ball hockey' THEN 3
    END
  ),
  40
),
(
  'baseball',
  'Baseball',
  ARRAY(
    SELECT s."id"
    FROM "Sports" AS s
    WHERE LOWER(BTRIM(s."name")) IN ('baseball', 'softball')
    ORDER BY CASE LOWER(BTRIM(s."name"))
      WHEN 'baseball' THEN 1
      WHEN 'softball' THEN 2
    END
  ),
  50
)
ON CONFLICT ("id") DO NOTHING;

COMMIT;
