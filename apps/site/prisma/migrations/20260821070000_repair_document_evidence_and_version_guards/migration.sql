-- Keep upgrades compatible with databases that applied the initial evidence migration.
ALTER TABLE "SignedDocuments"
  ALTER COLUMN "userId" DROP NOT NULL;

-- Reinstall the complete immutable Version guard for databases that applied the
-- earlier trigger before the Requirement lineage fields were enforced.
CREATE OR REPLACE FUNCTION "enforce_immutable_document_template_version"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."frozenAt" IS NOT NULL AND (
    NEW."frozenAt" IS DISTINCT FROM OLD."frozenAt"
    OR NEW."documentRequirementId" IS DISTINCT FROM OLD."documentRequirementId"
    OR NEW."versionSequence" IS DISTINCT FROM OLD."versionSequence"
    OR NEW."templateId" IS DISTINCT FROM OLD."templateId"
    OR NEW."type" IS DISTINCT FROM OLD."type"
    OR NEW."signOnce" IS DISTINCT FROM OLD."signOnce"
    OR NEW."requiredSignerType" IS DISTINCT FROM OLD."requiredSignerType"
    OR NEW."roleIndex" IS DISTINCT FROM OLD."roleIndex"
    OR NEW."roleIndexes" IS DISTINCT FROM OLD."roleIndexes"
    OR NEW."signerRoles" IS DISTINCT FROM OLD."signerRoles"
    OR NEW."content" IS DISTINCT FROM OLD."content"
    OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
  ) THEN
    RAISE EXCEPTION 'Document Template Version % is frozen and cannot be materially edited.', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Repair Satisfaction rows created by the initial migration. The old migration
-- created one row per signer and marked every row complete. Keep one evidence
-- row per requirement, Subject, and scope, then compute completion from all
-- preserved signer rows.
CREATE TEMP TABLE "_document_evidence_repair" ON COMMIT DROP AS
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
      WHEN UPPER(COALESCE(td."requiredSignerType", 'PARTICIPANT')) = 'PARENT_GUARDIAN_CHILD'
        THEN ARRAY['Parent/Guardian', 'Child']::TEXT[]
      WHEN UPPER(COALESCE(td."requiredSignerType", 'PARTICIPANT')) = 'PARENT_GUARDIAN'
        THEN ARRAY['Parent/Guardian']::TEXT[]
      WHEN UPPER(COALESCE(td."requiredSignerType", 'PARTICIPANT')) = 'CHILD'
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
),
representative AS (
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
),
grouped AS (
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
),
scored AS (
  SELECT
    representative.*,
    grouped.completed_signer_roles,
    NOT EXISTS (
      SELECT 1
      FROM unnest(representative.required_signer_roles) AS required_role(role)
      WHERE NULLIF(
        regexp_replace(
          UPPER(COALESCE(required_role.role, '')),
          '[^A-Z0-9]',
          '',
          'g'
        ),
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
              regexp_replace(
                UPPER(COALESCE(completed.signer_role, '')),
                '[^A-Z0-9]',
                '',
                'g'
              ),
              ''
            ) = NULLIF(
              regexp_replace(
                UPPER(COALESCE(required_role.role, '')),
                '[^A-Z0-9]',
                '',
                'g'
              ),
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
SELECT
  scored.evidence_id AS representative_evidence_id,
  scored.organization_id,
  scored.document_requirement_id,
  scored.template_id,
  scored.document_subject_id,
  scored.scope_type,
  scored.scope_id,
  scored.required_signer_roles,
  scored.completed_signer_roles,
  scored.is_complete
FROM scored;

UPDATE "DocumentRequirementSatisfactions" AS satisfaction
SET
  "status" = CASE
    WHEN repair.is_complete THEN 'SATISFIED'::"DocumentRequirementSatisfactionStatusEnum"
    ELSE 'PENDING'::"DocumentRequirementSatisfactionStatusEnum"
  END,
  "isComplete" = repair.is_complete,
  "requiredSignerRoles" = repair.required_signer_roles,
  "completedSignerRoles" = repair.completed_signer_roles,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_document_evidence_repair" AS repair
WHERE satisfaction."sourceEvidenceId" = repair.representative_evidence_id;

DELETE FROM "DocumentRequirementSatisfactions" AS satisfaction
USING "SignedDocuments" AS evidence,
      "_document_evidence_repair" AS repair
WHERE satisfaction."sourceEvidenceId" = evidence."id"
  AND evidence."organizationId" = repair.organization_id
  AND evidence."templateId" = repair.template_id
  AND evidence."documentSubjectId" = repair.document_subject_id
  AND evidence."scopeType" = repair.scope_type
  AND evidence."scopeId" = repair.scope_id
  AND satisfaction."sourceEvidenceId" <> repair.representative_evidence_id;
