CREATE TABLE "EventRegistrationDrafts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL DEFAULT '',
    "occurrenceDate" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "selectedTeamId" TEXT,
    "selectedDivisionId" TEXT,
    "selectedDivisionTypeKey" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "step" TEXT NOT NULL DEFAULT 'review',
    "completedSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "registrationId" TEXT,
    "teamCreationId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventRegistrationDrafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventRegistrationTeamPreferences" (
    "accountId" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventRegistrationTeamPreferences_pkey" PRIMARY KEY ("accountId", "sport")
);

CREATE INDEX "EventRegistrationDrafts_accountId_updatedAt_idx" ON "EventRegistrationDrafts"("accountId", "updatedAt");
CREATE UNIQUE INDEX "EventRegistrationDrafts_accountId_eventId_slotId_occurrence_key" ON "EventRegistrationDrafts"("accountId", "eventId", "slotId", "occurrenceDate");

-- Complete the preference in the registration transaction, including payment completion.
CREATE FUNCTION remember_completed_registration_team() RETURNS TRIGGER AS $$
DECLARE
  canonical_team_id TEXT;
  sport_key TEXT;
BEGIN
  IF NEW."registrantType" <> 'TEAM' OR NEW."rosterRole" <> 'PARTICIPANT'
    OR NEW."status" NOT IN ('ACTIVE', 'BLOCKED') OR NEW."acceptedAt" IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."acceptedAt" IS NOT NULL
    AND OLD."status" IN ('ACTIVE', 'BLOCKED') AND OLD."rosterRole" = 'PARTICIPANT' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "AuthUser" WHERE "id" = NEW."createdBy") THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE((SELECT "parentTeamId" FROM "EventTeams" WHERE "id" = NEW."registrantId"), NEW."registrantId")
    INTO canonical_team_id;
  SELECT lower(trim("sportIds"[1])) INTO sport_key FROM "Events" WHERE "id" = NEW."eventId";
  IF sport_key IS NULL OR sport_key = ''
    OR NOT EXISTS (SELECT 1 FROM "Teams" WHERE "id" = canonical_team_id) THEN
    RETURN NEW;
  END IF;
  INSERT INTO "EventRegistrationTeamPreferences" ("accountId", "sport", "teamId", "registrationId", "completedAt")
    VALUES (NEW."createdBy", sport_key, canonical_team_id, NEW."id", NEW."acceptedAt")
    ON CONFLICT ("accountId", "sport") DO UPDATE
      SET "teamId" = EXCLUDED."teamId", "registrationId" = EXCLUDED."registrationId", "completedAt" = EXCLUDED."completedAt"
      WHERE "EventRegistrationTeamPreferences"."completedAt" <= EXCLUDED."completedAt";
  UPDATE "EventRegistrationDrafts"
    SET "completedAt" = NEW."acceptedAt", "registrationId" = NEW."id", "revision" = "revision" + 1,
      "updatedAt" = NEW."acceptedAt"
    WHERE "accountId" = NEW."createdBy" AND "eventId" = NEW."eventId" AND "selectedTeamId" = canonical_team_id
      AND "slotId" = COALESCE(NEW."slotId", '') AND "occurrenceDate" = COALESCE(NEW."occurrenceDate", '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_registration_remember_team
  AFTER INSERT OR UPDATE ON "EventRegistrations"
  FOR EACH ROW EXECUTE FUNCTION remember_completed_registration_team();

INSERT INTO "EventRegistrationTeamPreferences" ("accountId", "sport", "teamId", "registrationId", "completedAt")
SELECT DISTINCT ON (r."createdBy", lower(trim(e."sportIds"[1])))
  r."createdBy", lower(trim(e."sportIds"[1])), t."id", r."id", r."acceptedAt"
FROM "EventRegistrations" r
JOIN "AuthUser" a ON a."id" = r."createdBy"
JOIN "Events" e ON e."id" = r."eventId"
LEFT JOIN "EventTeams" et ON et."id" = r."registrantId"
JOIN "Teams" t ON t."id" = COALESCE(et."parentTeamId", r."registrantId")
WHERE r."registrantType" = 'TEAM' AND r."rosterRole" = 'PARTICIPANT'
  AND r."status" IN ('ACTIVE', 'BLOCKED') AND r."acceptedAt" IS NOT NULL
  AND COALESCE(trim(e."sportIds"[1]), '') <> ''
ORDER BY r."createdBy", lower(trim(e."sportIds"[1])), r."acceptedAt" DESC, r."id";
