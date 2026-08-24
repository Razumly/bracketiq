BEGIN;

-- Track every evidence row that contributes to an aggregate Satisfaction.
CREATE TABLE "DocumentRequirementSatisfactionEvidence" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "satisfactionId" TEXT NOT NULL,
  "signedDocumentId" TEXT NOT NULL,
  CONSTRAINT "DocumentRequirementSatisfactionEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentRequirementSatisfactionEvidence_satisfactionId_signedDocumentId_key"
  ON "DocumentRequirementSatisfactionEvidence"("satisfactionId", "signedDocumentId");
CREATE INDEX "DocumentRequirementSatisfactionEvidence_satisfactionId_idx"
  ON "DocumentRequirementSatisfactionEvidence"("satisfactionId");
CREATE INDEX "DocumentRequirementSatisfactionEvidence_signedDocumentId_idx"
  ON "DocumentRequirementSatisfactionEvidence"("signedDocumentId");

-- Recover an Organization only when every available owner agrees. Template,
-- Event, and Team ownership are independent evidence sources.
CREATE TEMP TABLE "_document_evidence_owner_repair" AS
WITH candidate_owners AS (
  SELECT sd."id", td."organizationId"
  FROM "SignedDocuments" sd
  JOIN "TemplateDocuments" td ON td."id" = sd."templateId"
  WHERE sd."organizationId" IS NULL
    AND td."organizationId" IS NOT NULL
  UNION
  SELECT sd."id", event."organizationId"
  FROM "SignedDocuments" sd
  JOIN "Events" event ON event."id" = sd."eventId"
  WHERE sd."organizationId" IS NULL
    AND event."organizationId" IS NOT NULL
  UNION
  SELECT sd."id", team."organizationId"
  FROM "SignedDocuments" sd
  JOIN "Teams" team ON team."id" = sd."teamId"
  WHERE sd."organizationId" IS NULL
    AND team."organizationId" IS NOT NULL
  UNION
  SELECT sd."id", event."organizationId"
  FROM "SignedDocuments" sd
  JOIN "EventTeams" event_team ON event_team."id" = sd."teamId"
  JOIN "Events" event ON event."id" = event_team."eventId"
  WHERE sd."organizationId" IS NULL
    AND event."organizationId" IS NOT NULL
), unique_owners AS (
  SELECT "id", MIN("organizationId") AS organization_id
  FROM candidate_owners
  GROUP BY "id"
  HAVING COUNT(DISTINCT "organizationId") = 1
)
SELECT "id", organization_id
FROM unique_owners;

UPDATE "SignedDocuments" sd
SET "organizationId" = owners.organization_id
FROM "_document_evidence_owner_repair" owners
WHERE sd."id" = owners."id"
  AND sd."organizationId" IS NULL;

-- Rebuild derived identity fields for evidence repaired from an owner source.
UPDATE "SignedDocuments" sd
SET
  "signerUserId" = sd."userId",
  "documentSubjectId" = CASE
    WHEN COALESCE(sd."hostId", sd."userId") IS NOT NULL
      THEN 'document-subject:' || sd."organizationId" || ':' || COALESCE(sd."hostId", sd."userId")
    ELSE NULL
  END,
  "scopeType" = CASE
    WHEN COALESCE(td."signOnce", false) THEN 'ORGANIZATION'::"DocumentRequirementSatisfactionScopeTypeEnum"
    WHEN sd."teamId" IS NOT NULL THEN 'TEAM_MEMBERSHIP'::"DocumentRequirementSatisfactionScopeTypeEnum"
    WHEN sd."eventId" IS NOT NULL THEN 'EVENT_PARTICIPATION'::"DocumentRequirementSatisfactionScopeTypeEnum"
    ELSE 'ORGANIZATION'::"DocumentRequirementSatisfactionScopeTypeEnum"
  END,
  "scopeId" = CASE
    WHEN COALESCE(td."signOnce", false) OR (sd."eventId" IS NULL AND sd."teamId" IS NULL)
      THEN sd."organizationId"
    WHEN sd."teamId" IS NOT NULL THEN sd."teamId"
    ELSE sd."eventId"
  END
FROM "TemplateDocuments" td
WHERE td."id" = sd."templateId"
  AND sd."organizationId" IS NOT NULL
  AND (
    sd."documentSubjectId" IS NULL
    OR sd."scopeType" IS NULL
    OR sd."scopeId" IS NULL
  );
-- Create repaired Document Subjects with the source evidence timestamps.
INSERT INTO "DocumentSubjects" (
  "id", "createdAt", "updatedAt", "organizationId", "userId"
)
SELECT
  sd."documentSubjectId",
  COALESCE(MIN(sd."createdAt"), CURRENT_TIMESTAMP),
  COALESCE(MAX(COALESCE(sd."updatedAt", sd."createdAt")), CURRENT_TIMESTAMP),
  sd."organizationId",
  COALESCE(sd."hostId", sd."userId")
FROM "SignedDocuments" sd
JOIN "_document_evidence_owner_repair" repaired ON repaired."id" = sd."id"
WHERE sd."organizationId" IS NOT NULL
  AND sd."documentSubjectId" IS NOT NULL
  AND COALESCE(sd."hostId", sd."userId") IS NOT NULL
GROUP BY
  sd."documentSubjectId",
  sd."organizationId",
  COALESCE(sd."hostId", sd."userId")
ON CONFLICT ("id") DO UPDATE
SET
  "createdAt" = CASE
    WHEN "DocumentSubjects"."createdAt" IS NULL THEN EXCLUDED."createdAt"
    WHEN EXCLUDED."createdAt" IS NULL THEN "DocumentSubjects"."createdAt"
    ELSE LEAST("DocumentSubjects"."createdAt", EXCLUDED."createdAt")
  END,
  "updatedAt" = CASE
    WHEN "DocumentSubjects"."updatedAt" IS NULL THEN EXCLUDED."updatedAt"
    WHEN EXCLUDED."updatedAt" IS NULL THEN "DocumentSubjects"."updatedAt"
    ELSE GREATEST("DocumentSubjects"."updatedAt", EXCLUDED."updatedAt")
  END;
-- Preserve source evidence timestamps for every repaired or existing Subject.
WITH subject_timestamps AS (
  SELECT
    sd."documentSubjectId" AS document_subject_id,
    MIN(sd."createdAt") AS created_at,
    MAX(COALESCE(sd."updatedAt", sd."createdAt")) AS updated_at
  FROM "SignedDocuments" sd
  WHERE sd."documentSubjectId" IS NOT NULL
  GROUP BY sd."documentSubjectId"
)
UPDATE "DocumentSubjects" subject
SET
  "createdAt" = COALESCE(timestamps.created_at, subject."createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE(
    timestamps.updated_at,
    timestamps.created_at,
    subject."updatedAt",
    CURRENT_TIMESTAMP
  )
FROM subject_timestamps timestamps
WHERE subject."id" = timestamps.document_subject_id;

-- Backfill newly eligible owner-repaired evidence without duplicating an active
-- Satisfaction identity. Completion still requires every normalized signer role.
WITH eligible AS (
  SELECT
    sd."id" AS evidence_id,
    sd."createdAt" AS created_at,
    sd."organizationId" AS organization_id,
    td."documentRequirementId" AS document_requirement_id,
    sd."templateId" AS template_id,
    sd."documentSubjectId" AS document_subject_id,
    sd."scopeType" AS scope_type,
    sd."scopeId" AS scope_id,
    sd."signerRole" AS signer_role,
    CASE
      WHEN COALESCE(array_length(td."signerRoles", 1), 0) > 0 THEN td."signerRoles"
      WHEN REGEXP_REPLACE(
        UPPER(COALESCE(td."requiredSignerType", 'PARTICIPANT')),
        '[[:space:]/-]+',
        '_',
        'g'
      ) IN ('PARENT_GUARDIAN_CHILD', 'PARENT_GUARDING_CHILD', 'PARENT_GUARDIAN_AND_CHILD')
        THEN ARRAY['Parent/Guardian', 'Child']::TEXT[]
      WHEN REGEXP_REPLACE(
        UPPER(COALESCE(td."requiredSignerType", 'PARTICIPANT')),
        '[[:space:]/-]+',
        '_',
        'g'
      ) = 'PARENT_GUARDIAN'
        THEN ARRAY['Parent/Guardian']::TEXT[]
      WHEN REGEXP_REPLACE(
        UPPER(COALESCE(td."requiredSignerType", 'PARTICIPANT')),
        '[[:space:]/-]+',
        '_',
        'g'
      ) = 'CHILD'
        THEN ARRAY['Child']::TEXT[]
      ELSE ARRAY['Participant']::TEXT[]
    END AS required_signer_roles
  FROM "SignedDocuments" sd
  JOIN "TemplateDocuments" td ON td."id" = sd."templateId"
  WHERE UPPER(COALESCE(sd."status", '')) IN ('SIGNED', 'COMPLETED')
    AND sd."organizationId" IS NOT NULL
    AND sd."documentSubjectId" IS NOT NULL
    AND sd."scopeType" IS NOT NULL
    AND sd."scopeId" IS NOT NULL
), representative AS (
  SELECT DISTINCT ON (
    organization_id,
    document_requirement_id,
    template_id,
    document_subject_id,
    scope_type,
    scope_id
  )
    *
  FROM eligible
  ORDER BY
    organization_id,
    document_requirement_id,
    template_id,
    document_subject_id,
    scope_type,
    scope_id,
    created_at NULLS LAST,
    evidence_id
), grouped AS (
  SELECT
    organization_id,
    document_requirement_id,
    template_id,
    document_subject_id,
    scope_type,
    scope_id,
    COALESCE(
      array_agg(DISTINCT signer_role ORDER BY signer_role)
        FILTER (WHERE signer_role IS NOT NULL),
      ARRAY[]::TEXT[]
    ) AS completed_signer_roles
  FROM eligible
  GROUP BY
    organization_id,
    document_requirement_id,
    template_id,
    document_subject_id,
    scope_type,
    scope_id
), scored AS (
  SELECT
    representative.*,
    grouped.completed_signer_roles,
    NOT EXISTS (
      SELECT 1
      FROM unnest(representative.required_signer_roles) AS required_role(role)
      WHERE NULLIF(
        regexp_replace(UPPER(COALESCE(required_role.role, '')), '[^A-Z0-9]', '', 'g'),
        ''
      ) IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM eligible completed
          WHERE completed.organization_id = representative.organization_id
            AND completed.document_requirement_id = representative.document_requirement_id
            AND completed.template_id = representative.template_id
            AND completed.document_subject_id = representative.document_subject_id
            AND completed.scope_type = representative.scope_type
            AND completed.scope_id = representative.scope_id
            AND NULLIF(
              regexp_replace(UPPER(COALESCE(completed.signer_role, '')), '[^A-Z0-9]', '', 'g'),
              ''
            ) = NULLIF(
              regexp_replace(UPPER(COALESCE(required_role.role, '')), '[^A-Z0-9]', '', 'g'),
              ''
            )
        )
    ) AS is_complete
  FROM representative
  JOIN grouped
    ON grouped.organization_id = representative.organization_id
    AND grouped.document_requirement_id = representative.document_requirement_id
    AND grouped.template_id = representative.template_id
    AND grouped.document_subject_id = representative.document_subject_id
    AND grouped.scope_type = representative.scope_type
    AND grouped.scope_id = representative.scope_id
)
INSERT INTO "DocumentRequirementSatisfactions" (
  "id", "createdAt", "updatedAt", "organizationId", "documentRequirementId",
  "templateDocumentId", "documentSubjectId", "scopeType", "scopeId",
  "sourceEvidenceId", "status", "isComplete", "requiredSignerRoles",
  "completedSignerRoles"
)
SELECT
  'document-satisfaction:' || scored.evidence_id,
  COALESCE(scored.created_at, CURRENT_TIMESTAMP),
  COALESCE(scored.created_at, CURRENT_TIMESTAMP),
  scored.organization_id,
  scored.document_requirement_id,
  scored.template_id,
  scored.document_subject_id,
  scored.scope_type,
  scored.scope_id,
  scored.evidence_id,
  CASE
    WHEN scored.is_complete THEN 'SATISFIED'::"DocumentRequirementSatisfactionStatusEnum"
    ELSE 'PENDING'::"DocumentRequirementSatisfactionStatusEnum"
  END,
  scored.is_complete,
  scored.required_signer_roles,
  scored.completed_signer_roles
FROM scored
WHERE NOT EXISTS (
  SELECT 1
  FROM "DocumentRequirementSatisfactions" existing
  WHERE existing."organizationId" = scored.organization_id
    AND existing."documentRequirementId" = scored.document_requirement_id
    AND existing."templateDocumentId" = scored.template_id
    AND existing."documentSubjectId" = scored.document_subject_id
    AND existing."scopeType" = scored.scope_type
    AND existing."scopeId" = scored.scope_id
    AND existing."status" <> 'INVALIDATED'::"DocumentRequirementSatisfactionStatusEnum"
);

-- Link every active evidence row to one current aggregate Satisfaction. This
-- makes later voids safe without reviving historical invalidated aggregates.
WITH current_satisfactions AS (
  SELECT DISTINCT ON (
    satisfaction."organizationId",
    satisfaction."documentRequirementId",
    satisfaction."templateDocumentId",
    satisfaction."documentSubjectId",
    satisfaction."scopeType",
    satisfaction."scopeId"
  )
    satisfaction."id",
    satisfaction."organizationId",
    satisfaction."documentRequirementId",
    satisfaction."templateDocumentId",
    satisfaction."documentSubjectId",
    satisfaction."scopeType",
    satisfaction."scopeId",
    satisfaction."status",
    satisfaction."updatedAt",
    satisfaction."createdAt"
  FROM "DocumentRequirementSatisfactions" satisfaction
  WHERE satisfaction."status" <> 'INVALIDATED'::"DocumentRequirementSatisfactionStatusEnum"
  ORDER BY
    satisfaction."organizationId",
    satisfaction."documentRequirementId",
    satisfaction."templateDocumentId",
    satisfaction."documentSubjectId",
    satisfaction."scopeType",
    satisfaction."scopeId",
    satisfaction."updatedAt" DESC NULLS LAST,
    satisfaction."createdAt" DESC NULLS LAST,
    satisfaction."id" DESC
)
INSERT INTO "DocumentRequirementSatisfactionEvidence" (
  "id", "createdAt", "updatedAt", "satisfactionId", "signedDocumentId"
)
SELECT DISTINCT
  'document-satisfaction-evidence:' || satisfaction."id" || ':' || evidence."id",
  COALESCE(evidence."createdAt", CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP,
  satisfaction."id",
  evidence."id"
FROM current_satisfactions satisfaction
JOIN "SignedDocuments" evidence
  ON evidence."organizationId" = satisfaction."organizationId"
  AND evidence."templateId" = satisfaction."templateDocumentId"
  AND evidence."documentSubjectId" = satisfaction."documentSubjectId"
  AND evidence."scopeType" = satisfaction."scopeType"
  AND evidence."scopeId" = satisfaction."scopeId"
WHERE UPPER(COALESCE(evidence."status", '')) IN ('SIGNED', 'COMPLETED')
ON CONFLICT ("satisfactionId", "signedDocumentId") DO NOTHING;

COMMIT;
