ALTER TABLE "Events"
  ADD COLUMN "scheduleEndConstraint" TIMESTAMP(3),
  ADD COLUMN "generatedScheduleEnd" TIMESTAMP(3);

ALTER TABLE "EventTemplates"
  ADD COLUMN "scheduleEndConstraint" TIMESTAMP(3),
  ADD COLUMN "generatedScheduleEnd" TIMESTAMP(3);

UPDATE "Events"
SET "scheduleEndConstraint" = "end"
WHERE "noFixedEndDateTime" = FALSE
  AND "end" IS NOT NULL;

UPDATE "Events"
SET "generatedScheduleEnd" = "end"
WHERE "noFixedEndDateTime" = TRUE
  AND "end" IS NOT NULL;
