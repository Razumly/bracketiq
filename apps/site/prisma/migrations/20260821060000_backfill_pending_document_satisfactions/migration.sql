-- Mark migrated evidence as pending until every required signer role is present.
UPDATE "DocumentRequirementSatisfactions"
SET "status" = 'PENDING',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "isComplete" = FALSE;
