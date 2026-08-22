ALTER TABLE "EventRegistrations"
ADD COLUMN "acceptedAt" TIMESTAMP(3);

UPDATE "EventRegistrations"
SET "acceptedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE "acceptedAt" IS NULL
  AND "rosterRole" = 'PARTICIPANT'
  AND "status" IN ('ACTIVE', 'BLOCKED')
  AND (
    "registrantType" = 'TEAM'
    OR (
      "registrantType" IN ('SELF', 'CHILD')
      AND "eventTeamId" IS NULL
      AND "sourceTeamRegistrationId" IS NULL
    )
  );
