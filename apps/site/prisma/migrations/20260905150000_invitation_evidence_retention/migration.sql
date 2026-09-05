ALTER TYPE "ModerationReportTargetTypeEnum" ADD VALUE 'TEAM_INVITATION';
ALTER TABLE "Invites" ADD COLUMN "supersededAt" TIMESTAMP(3);

CREATE TABLE "InvitationEvidence" (
  "reportId" TEXT PRIMARY KEY REFERENCES "ModerationReport"("id") ON DELETE CASCADE,
  "inviteId" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attemptCreatedAt" TIMESTAMP(3),
  "senderId" TEXT,
  "playerId" TEXT,
  "teamId" TEXT,
  "status" TEXT NOT NULL,
  "finalizedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "actedBy" TEXT,
  "actingGuardianId" TEXT,
  "declineBlockScope" TEXT,
  "deliveries" JSONB NOT NULL
);
CREATE INDEX "InvitationEvidence_inviteId_idx" ON "InvitationEvidence"("inviteId");
CREATE INDEX "InvitationEvidence_finalizedAt_reportId_idx" ON "InvitationEvidence"("finalizedAt", "reportId");

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "teamId", "userId" ORDER BY "createdAt" DESC NULLS LAST, "id" DESC) AS position
  FROM "Invites" WHERE "type" = 'TEAM' AND "teamId" IS NOT NULL AND "userId" IS NOT NULL
)
UPDATE "Invites" SET "supersededAt" = CURRENT_TIMESTAMP
WHERE "id" IN (SELECT "id" FROM ranked WHERE position > 1);

CREATE FUNCTION supersede_team_invitation_attempts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."type" = 'TEAM' AND NEW."teamId" IS NOT NULL AND NEW."userId" IS NOT NULL THEN
    UPDATE "Invites" SET "supersededAt" = CURRENT_TIMESTAMP
    WHERE "type" = 'TEAM' AND "teamId" = NEW."teamId" AND "userId" = NEW."userId"
      AND "id" <> NEW."id" AND "supersededAt" IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER supersede_team_invitation_attempts AFTER INSERT ON "Invites"
FOR EACH ROW EXECUTE FUNCTION supersede_team_invitation_attempts();

-- Keep the final outcome of an attempt reported while it was pending.
-- Do not copy contact, claim, or profile data into review evidence.
CREATE FUNCTION finalize_invitation_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."finalizedAt" IS NOT NULL THEN
    UPDATE "InvitationEvidence" SET "status" = NEW."status", "finalizedAt" = NEW."finalizedAt",
      "actedBy" = NEW."actedBy", "actingGuardianId" = NEW."actingGuardianId", "declineBlockScope" = NEW."declineBlockScope"
    WHERE "inviteId" = NEW."id" AND "finalizedAt" IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER finalize_invitation_evidence AFTER UPDATE ON "Invites"
FOR EACH ROW EXECUTE FUNCTION finalize_invitation_evidence();
