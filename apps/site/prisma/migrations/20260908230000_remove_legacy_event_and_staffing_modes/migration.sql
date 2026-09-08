BEGIN;

UPDATE "Events"
SET "eventType" = 'EVENT'
WHERE "eventType"::text = 'AFFILIATE';

UPDATE "EventTemplates"
SET "eventType" = 'EVENT'
WHERE "eventType"::text = 'AFFILIATE';

UPDATE "Events"
SET "staffingPriority" = CASE "officialSchedulingMode"::text
  WHEN 'STAFFING' THEN 'OFFICIAL_COVERAGE_REQUIRED'
  WHEN 'TEAM_STAFFING' THEN 'TEAM_COVERAGE_REQUIRED'
  WHEN 'SCHEDULE' THEN 'BEST_AVAILABLE_COVERAGE'
  WHEN 'OFF' THEN 'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED'
  ELSE 'BEST_AVAILABLE_COVERAGE'
END::"StaffingPriorityEnum"
WHERE "staffingPriority" IS NULL;

UPDATE "EventTemplates"
SET "staffingPriority" = CASE "officialSchedulingMode"::text
  WHEN 'STAFFING' THEN 'OFFICIAL_COVERAGE_REQUIRED'
  WHEN 'TEAM_STAFFING' THEN 'TEAM_COVERAGE_REQUIRED'
  WHEN 'SCHEDULE' THEN 'BEST_AVAILABLE_COVERAGE'
  WHEN 'OFF' THEN 'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED'
  ELSE 'BEST_AVAILABLE_COVERAGE'
END::"StaffingPriorityEnum"
WHERE "staffingPriority" IS NULL;

ALTER TABLE "Events" DROP COLUMN "officialSchedulingMode";
ALTER TABLE "EventTemplates" DROP COLUMN "officialSchedulingMode";
DROP TYPE "EventsOfficialSchedulingModeEnum";

ALTER TYPE "EventsEventTypeEnum" RENAME TO "EventsEventTypeEnum_legacy";
CREATE TYPE "EventsEventTypeEnum" AS ENUM (
  'TOURNAMENT',
  'EVENT',
  'LEAGUE',
  'WEEKLY_EVENT',
  'TRYOUT'
);

ALTER TABLE "Events"
ALTER COLUMN "eventType" TYPE "EventsEventTypeEnum"
USING "eventType"::text::"EventsEventTypeEnum";

ALTER TABLE "EventTemplates"
ALTER COLUMN "eventType" TYPE "EventsEventTypeEnum"
USING "eventType"::text::"EventsEventTypeEnum";

DROP TYPE "EventsEventTypeEnum_legacy";

COMMIT;
