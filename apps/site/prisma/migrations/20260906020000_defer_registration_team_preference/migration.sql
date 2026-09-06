-- Read the final registration state after all related writes complete.
DROP TRIGGER event_registration_remember_team ON "EventRegistrations";

CREATE OR REPLACE FUNCTION remember_completed_registration_team() RETURNS TRIGGER AS $$
DECLARE
  final_registration "EventRegistrations"%ROWTYPE;
  canonical_team_id TEXT;
  sport_key TEXT;
BEGIN
  SELECT * INTO final_registration FROM "EventRegistrations" WHERE "id" = NEW."id";
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF final_registration."registrantType" <> 'TEAM' OR final_registration."rosterRole" <> 'PARTICIPANT'
    OR final_registration."status" NOT IN ('ACTIVE', 'BLOCKED') OR final_registration."acceptedAt" IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."acceptedAt" IS NOT NULL
    AND OLD."status" IN ('ACTIVE', 'BLOCKED') AND OLD."rosterRole" = 'PARTICIPANT' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "AuthUser" WHERE "id" = final_registration."createdBy") THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE((SELECT "parentTeamId" FROM "EventTeams" WHERE "id" = final_registration."registrantId"), final_registration."registrantId")
    INTO canonical_team_id;
  SELECT lower(trim("sportIds"[1])) INTO sport_key FROM "Events" WHERE "id" = final_registration."eventId";
  IF sport_key IS NULL OR sport_key = ''
    OR NOT EXISTS (SELECT 1 FROM "Teams" WHERE "id" = canonical_team_id) THEN
    RETURN NEW;
  END IF;
  INSERT INTO "EventRegistrationTeamPreferences" ("accountId", "sport", "teamId", "registrationId", "completedAt")
    VALUES (final_registration."createdBy", sport_key, canonical_team_id, final_registration."id", final_registration."acceptedAt")
    ON CONFLICT ("accountId", "sport") DO UPDATE
      SET "teamId" = EXCLUDED."teamId", "registrationId" = EXCLUDED."registrationId", "completedAt" = EXCLUDED."completedAt"
      WHERE "EventRegistrationTeamPreferences"."completedAt" <= EXCLUDED."completedAt";
  UPDATE "EventRegistrationDrafts"
    SET "completedAt" = final_registration."acceptedAt", "registrationId" = final_registration."id", "revision" = "revision" + 1,
      "updatedAt" = final_registration."acceptedAt"
    WHERE "accountId" = final_registration."createdBy" AND "eventId" = final_registration."eventId" AND "selectedTeamId" = canonical_team_id
      AND "slotId" = COALESCE(final_registration."slotId", '') AND "occurrenceDate" = COALESCE(final_registration."occurrenceDate", '')
      AND ("completedAt" IS DISTINCT FROM final_registration."acceptedAt" OR "registrationId" IS DISTINCT FROM final_registration."id");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER event_registration_remember_team
  AFTER INSERT OR UPDATE ON "EventRegistrations"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION remember_completed_registration_team();
