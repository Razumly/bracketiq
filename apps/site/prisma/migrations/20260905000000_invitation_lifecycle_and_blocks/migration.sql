ALTER TABLE "Invites"
  ADD COLUMN "actedBy" TEXT,
  ADD COLUMN "actingGuardianId" TEXT,
  ADD COLUMN "declineBlockScope" TEXT;

CREATE TABLE "TeamBlocks" (
  "id" TEXT PRIMARY KEY,
  "playerId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TeamBlocks_playerId_teamId_key" ON "TeamBlocks"("playerId", "teamId");
CREATE INDEX "TeamBlocks_teamId_playerId_idx" ON "TeamBlocks"("teamId", "playerId");

CREATE TABLE "InviteDeliveries" (
  "id" TEXT PRIMARY KEY,
  "inviteId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "requestedBy" TEXT,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failureCode" TEXT
);
CREATE UNIQUE INDEX "InviteDeliveries_inviteId_idempotencyKey_key" ON "InviteDeliveries"("inviteId", "idempotencyKey");
CREATE INDEX "InviteDeliveries_inviteId_createdAt_id_idx" ON "InviteDeliveries"("inviteId", "createdAt", "id");

-- Preserve the delivery evidence that the old row still contains.
INSERT INTO "InviteDeliveries" ("id", "inviteId", "idempotencyKey", "kind", "requestedBy", "status", "createdAt", "completedAt", "sentAt", "failureCode")
SELECT 'legacy_delivery:' || "id", "id", 'legacy', 'LEGACY', "createdBy",
  CASE WHEN UPPER("status") = 'FAILED' THEN 'FAILED' ELSE 'SENT' END,
  COALESCE("sentAt", "updatedAt", "createdAt", CURRENT_TIMESTAMP),
  COALESCE("sentAt", "updatedAt", "createdAt", CURRENT_TIMESTAMP), "sentAt",
  CASE WHEN UPPER("status") = 'FAILED' THEN 'LEGACY_DELIVERY_FAILURE' END
FROM "Invites" WHERE "type" = 'TEAM' AND ("sentAt" IS NOT NULL OR UPPER("status") = 'FAILED');

UPDATE "Invites" SET "status" = 'PENDING', "finalizedAt" = NULL
WHERE "type" = 'TEAM' AND ("status" IS NULL OR UPPER("status") IN ('PENDING', 'SENT', 'FAILED'));
UPDATE "Invites" SET "linkExpiresAt" = COALESCE("createdAt", CURRENT_TIMESTAMP) + INTERVAL '14 days'
WHERE "type" = 'TEAM' AND "status" = 'PENDING' AND "linkExpiresAt" IS NULL;
UPDATE "Invites" SET "status" = 'EXPIRED', "finalizedAt" = "linkExpiresAt"
WHERE "type" = 'TEAM' AND "status" = 'PENDING' AND "linkExpiresAt" <= CURRENT_TIMESTAMP;

-- Close duplicate live attempts now. Do not infer a past recipient decision.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "teamId", "userId" ORDER BY "createdAt" DESC NULLS LAST, "id" DESC) AS position
  FROM "Invites" WHERE "type" = 'TEAM' AND "status" = 'PENDING' AND "teamId" IS NOT NULL AND "userId" IS NOT NULL
)
UPDATE "Invites" SET "status" = 'CANCELLED', "finalizedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (SELECT "id" FROM ranked WHERE position > 1);

CREATE UNIQUE INDEX "Invites_one_pending_team_player_key" ON "Invites"("teamId", "userId")
WHERE "type" = 'TEAM' AND "status" = 'PENDING' AND "teamId" IS NOT NULL AND "userId" IS NOT NULL;
CREATE TABLE "InvitationRequests" (
  "teamId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "inviteId" TEXT NOT NULL,
  "fingerprint" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvitationRequests_pkey" PRIMARY KEY ("teamId", "senderId", "requestKey")
);
CREATE INDEX "InvitationRequests_inviteId_idx" ON "InvitationRequests"("inviteId");
INSERT INTO "InvitationRequests" ("teamId", "senderId", "requestKey", "inviteId", "createdAt")
SELECT DISTINCT ON ("teamId", "createdBy", "idempotencyKey") "teamId", "createdBy", "idempotencyKey", "id", COALESCE("createdAt", CURRENT_TIMESTAMP)
FROM "Invites"
WHERE "type" = 'TEAM' AND "teamId" IS NOT NULL AND "createdBy" IS NOT NULL AND "idempotencyKey" IS NOT NULL
ORDER BY "teamId", "createdBy", "idempotencyKey", "createdAt" ASC NULLS LAST, "id" ASC;

-- Use the last recorded change when a legacy final outcome has no time.
UPDATE "Invites" SET "finalizedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE "type" = 'TEAM' AND "status" IN ('ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED') AND "finalizedAt" IS NULL;

-- A late write cannot reopen an attempt or replace its final decision time.
CREATE FUNCTION preserve_team_invitation_outcome() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."type" = 'TEAM' AND OLD."status" IN ('ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED')
    AND (NEW."status" IS DISTINCT FROM OLD."status"
      OR NEW."finalizedAt" IS DISTINCT FROM OLD."finalizedAt"
      OR NEW."actedBy" IS DISTINCT FROM OLD."actedBy"
      OR NEW."actingGuardianId" IS DISTINCT FROM OLD."actingGuardianId"
      OR NEW."declineBlockScope" IS DISTINCT FROM OLD."declineBlockScope") THEN
    RAISE EXCEPTION 'The Team invitation already has a final outcome.' USING ERRCODE = '23514';
  END IF;
  IF NEW."type" = 'TEAM' AND NEW."status" IN ('ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED') AND NEW."finalizedAt" IS NULL THEN
    NEW."finalizedAt" := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_team_invitation_outcome BEFORE UPDATE ON "Invites"
  FOR EACH ROW EXECUTE FUNCTION preserve_team_invitation_outcome();

CREATE TABLE "TeamCreationRequests" (
  "teamId" TEXT PRIMARY KEY,
  "senderId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
