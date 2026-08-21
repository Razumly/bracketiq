-- Expand signed evidence with explicit provenance, subject identity, and scope.
CREATE TYPE "SignedDocumentProvenanceEnum" AS ENUM (
  'BOLDSIGN',
  'BRACKETIQ',
  'IMPORTED'
);

CREATE TYPE "DocumentRequirementSatisfactionScopeTypeEnum" AS ENUM (
  'ORGANIZATION',
  'EVENT_PARTICIPATION',
  'TEAM_MEMBERSHIP'
);

CREATE TYPE "DocumentRequirementSatisfactionStatusEnum" AS ENUM (
  'SATISFIED',
  'INVALIDATED'
);

CREATE TYPE "DocumentEvidenceAuditEventTypeEnum" AS ENUM (
  'IMPORT',
  'VOID'
);

ALTER TABLE "SignedDocuments"
  ADD COLUMN "providerDocumentId" TEXT,
  ADD COLUMN "provenance" "SignedDocumentProvenanceEnum" NOT NULL DEFAULT 'BRACKETIQ',
  ADD COLUMN "signerUserId" TEXT,
  ADD COLUMN "documentSubjectId" TEXT,
  ADD COLUMN "scopeType" "DocumentRequirementSatisfactionScopeTypeEnum",
  ADD COLUMN "scopeId" TEXT,
  ADD COLUMN "importedFileId" TEXT,
  ADD COLUMN "contentHash" TEXT,
  ADD COLUMN "historicalSigningDate" TIMESTAMP(3),
  ADD COLUMN "sourceNote" TEXT,
  ADD COLUMN "importedAt" TIMESTAMP(3),
  ADD COLUMN "uploaderId" TEXT,
  ADD COLUMN "attestationText" TEXT,
  ADD COLUMN "attestationVersion" TEXT;

CREATE TABLE "DocumentSubjects" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "DocumentSubjects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentRequirementSatisfactions" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "organizationId" TEXT NOT NULL,
  "documentRequirementId" TEXT NOT NULL,
  "templateDocumentId" TEXT NOT NULL,
  "documentSubjectId" TEXT NOT NULL,
  "scopeType" "DocumentRequirementSatisfactionScopeTypeEnum" NOT NULL,
  "scopeId" TEXT NOT NULL,
  "sourceEvidenceId" TEXT NOT NULL,
  "status" "DocumentRequirementSatisfactionStatusEnum" NOT NULL DEFAULT 'SATISFIED',
  "isComplete" BOOLEAN NOT NULL DEFAULT FALSE,
  "requiredSignerRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "completedSignerRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "invalidatedAt" TIMESTAMP(3),
  CONSTRAINT "DocumentRequirementSatisfactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentEvidenceAuditEvents" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "organizationId" TEXT NOT NULL,
  "signedDocumentId" TEXT NOT NULL,
  "eventType" "DocumentEvidenceAuditEventTypeEnum" NOT NULL,
  "actorUserId" TEXT,
  "reason" TEXT,
  "note" TEXT,
  "payload" JSONB,
  CONSTRAINT "DocumentEvidenceAuditEvents_pkey" PRIMARY KEY ("id")
);

-- A subject is the customer represented by the evidence. A guardian signer
-- row points at its child through hostId, while a direct row points at userId.
INSERT INTO "DocumentSubjects" ("id", "createdAt", "updatedAt", "organizationId", "userId")
SELECT DISTINCT
  'document-subject:' || sd."organizationId" || ':' || COALESCE(sd."hostId", sd."userId"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  sd."organizationId",
  COALESCE(sd."hostId", sd."userId")
FROM "SignedDocuments" sd
WHERE sd."organizationId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "SignedDocuments" sd
SET
  "signerUserId" = sd."userId",
  "documentSubjectId" = CASE
    WHEN sd."organizationId" IS NOT NULL
      THEN 'document-subject:' || sd."organizationId" || ':' || COALESCE(sd."hostId", sd."userId")
    ELSE NULL
  END,
  "provenance" = CASE
    WHEN UPPER(COALESCE(td."type"::text, '')) = 'PDF' THEN 'BOLDSIGN'::"SignedDocumentProvenanceEnum"
    ELSE 'BRACKETIQ'::"SignedDocumentProvenanceEnum"
  END,
  "providerDocumentId" = CASE
    WHEN UPPER(COALESCE(td."type"::text, '')) = 'PDF' THEN sd."signedDocumentId"
    ELSE NULL
  END,
  "scopeType" = CASE
    WHEN COALESCE(td."signOnce", false) THEN 'ORGANIZATION'::"DocumentRequirementSatisfactionScopeTypeEnum"
    WHEN sd."teamId" IS NOT NULL THEN 'TEAM_MEMBERSHIP'::"DocumentRequirementSatisfactionScopeTypeEnum"
    WHEN sd."eventId" IS NOT NULL THEN 'EVENT_PARTICIPATION'::"DocumentRequirementSatisfactionScopeTypeEnum"
    WHEN sd."organizationId" IS NOT NULL THEN 'ORGANIZATION'::"DocumentRequirementSatisfactionScopeTypeEnum"
    ELSE NULL
  END,
  "scopeId" = CASE
    WHEN COALESCE(td."signOnce", false) OR sd."eventId" IS NULL AND sd."teamId" IS NULL
      THEN sd."organizationId"
    WHEN sd."teamId" IS NOT NULL THEN sd."teamId"
    ELSE sd."eventId"
  END
FROM "TemplateDocuments" td
WHERE td."id" = sd."templateId";

INSERT INTO "DocumentRequirementSatisfactions" (
  "id",
  "createdAt",
  "updatedAt",
  "organizationId",
  "documentRequirementId",
  "templateDocumentId",
  "documentSubjectId",
  "scopeType",
  "scopeId",
  "sourceEvidenceId",
  "status",
  "isComplete",
  "requiredSignerRoles",
  "completedSignerRoles"
)
SELECT
  'document-satisfaction:' || sd."id",
  COALESCE(sd."createdAt", CURRENT_TIMESTAMP),
  COALESCE(sd."updatedAt", CURRENT_TIMESTAMP),
  sd."organizationId",
  td."documentRequirementId",
  sd."templateId",
  sd."documentSubjectId",
  sd."scopeType",
  sd."scopeId",
  sd."id",
  'SATISFIED'::"DocumentRequirementSatisfactionStatusEnum",
  TRUE,
  COALESCE(td."signerRoles", ARRAY[]::TEXT[]),
  CASE WHEN sd."signerRole" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY[sd."signerRole"] END
FROM "SignedDocuments" sd
JOIN "TemplateDocuments" td ON td."id" = sd."templateId"
WHERE UPPER(COALESCE(sd."status", '')) IN ('SIGNED', 'COMPLETED')
  AND sd."organizationId" IS NOT NULL
  AND sd."documentSubjectId" IS NOT NULL
  AND sd."scopeType" IS NOT NULL
  AND sd."scopeId" IS NOT NULL;

-- A satisfaction stores the Version used for the completed Requirement.
-- Freeze that Version before later material edits can occur.
CREATE OR REPLACE FUNCTION "freeze_document_template_version_from_satisfaction"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "TemplateDocuments"
  SET "frozenAt" = COALESCE("frozenAt", CURRENT_TIMESTAMP),
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = NEW."templateDocumentId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document Template Version % does not exist.', NEW."templateDocumentId"
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DocumentRequirementSatisfactions_freeze_document_template_version"
BEFORE INSERT OR UPDATE OF "templateDocumentId" ON "DocumentRequirementSatisfactions"
FOR EACH ROW
EXECUTE FUNCTION "freeze_document_template_version_from_satisfaction"();

UPDATE "TemplateDocuments" AS "version"
SET "frozenAt" = COALESCE("version"."frozenAt", CURRENT_TIMESTAMP),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM "DocumentRequirementSatisfactions" AS "satisfaction"
  WHERE "satisfaction"."templateDocumentId" = "version"."id"
);

CREATE UNIQUE INDEX "DocumentSubjects_organizationId_userId_key"
  ON "DocumentSubjects"("organizationId", "userId");
CREATE INDEX "DocumentSubjects_userId_idx"
  ON "DocumentSubjects"("userId");

CREATE INDEX "DocumentRequirementSatisfactions_organizationId_documentSubjectId_idx"
  ON "DocumentRequirementSatisfactions"("organizationId", "documentSubjectId");
CREATE INDEX "DocumentRequirementSatisfactions_documentRequirementId_templateDocumentId_idx"
  ON "DocumentRequirementSatisfactions"("documentRequirementId", "templateDocumentId");
CREATE INDEX "DocumentRequirementSatisfactions_scopeType_scopeId_idx"
  ON "DocumentRequirementSatisfactions"("scopeType", "scopeId");
CREATE INDEX "DocumentRequirementSatisfactions_sourceEvidenceId_idx"
  ON "DocumentRequirementSatisfactions"("sourceEvidenceId");

CREATE INDEX "DocumentEvidenceAuditEvents_signedDocumentId_createdAt_idx"
  ON "DocumentEvidenceAuditEvents"("signedDocumentId", "createdAt");
CREATE INDEX "DocumentEvidenceAuditEvents_organizationId_createdAt_idx"
  ON "DocumentEvidenceAuditEvents"("organizationId", "createdAt");

CREATE UNIQUE INDEX "SignedDocuments_import_identity_key"
  ON "SignedDocuments"(
    "organizationId",
    "contentHash",
    "documentSubjectId",
    "templateId",
    "scopeType",
    "scopeId"
  );
CREATE INDEX "SignedDocuments_documentSubjectId_idx"
  ON "SignedDocuments"("documentSubjectId");
CREATE INDEX "SignedDocuments_providerDocumentId_idx"
  ON "SignedDocuments"("providerDocumentId");
CREATE INDEX "SignedDocuments_scopeType_scopeId_idx"
  ON "SignedDocuments"("scopeType", "scopeId");
