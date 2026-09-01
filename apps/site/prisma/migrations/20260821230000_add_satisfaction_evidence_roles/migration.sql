-- Preserve the signer roles contributed by each evidence row.
ALTER TABLE "DocumentRequirementSatisfactionEvidence"
  ADD COLUMN "completedSignerRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Re-derive required roles from each immutable Version.
WITH derived AS (
  SELECT
    satisfaction."id" AS satisfaction_id,
    CASE
      WHEN COALESCE(array_length(template."signerRoles", 1), 0) > 0
        THEN template."signerRoles"
      WHEN REGEXP_REPLACE(
        UPPER(COALESCE(template."requiredSignerType", 'PARTICIPANT')),
        '[[:space:]/-]+',
        '_',
        'g'
      ) IN ('PARENT_GUARDIAN_CHILD', 'PARENT_GUARDING_CHILD', 'PARENT_GUARDIAN_AND_CHILD')
        THEN ARRAY['Parent/Guardian', 'Child']::TEXT[]
      WHEN REGEXP_REPLACE(
        UPPER(COALESCE(template."requiredSignerType", 'PARTICIPANT')),
        '[[:space:]/-]+',
        '_',
        'g'
      ) = 'PARENT_GUARDIAN'
        THEN ARRAY['Parent/Guardian']::TEXT[]
      WHEN REGEXP_REPLACE(
        UPPER(COALESCE(template."requiredSignerType", 'PARTICIPANT')),
        '[[:space:]/-]+',
        '_',
        'g'
      ) = 'CHILD'
        THEN ARRAY['Child']::TEXT[]
      ELSE ARRAY['Participant']::TEXT[]
    END AS required_signer_roles
  FROM "DocumentRequirementSatisfactions" satisfaction
  JOIN "TemplateDocuments" template
    ON template."id" = satisfaction."templateDocumentId"
)
UPDATE "DocumentRequirementSatisfactions" satisfaction
SET "requiredSignerRoles" = derived.required_signer_roles
FROM derived
WHERE satisfaction."id" = derived.satisfaction_id;

-- Imported evidence is an attested complete document. It contributes every
-- signer role required by its Satisfaction, even when no structured signer
-- identity was stored.
UPDATE "DocumentRequirementSatisfactionEvidence" AS contributor
SET "completedSignerRoles" = CASE
  WHEN UPPER(COALESCE(evidence."provenance"::text, '')) = 'IMPORTED'
    THEN satisfaction."requiredSignerRoles"
  WHEN evidence."signerRole" IS NOT NULL
    AND NULLIF(BTRIM(evidence."signerRole"), '') IS NOT NULL
    THEN ARRAY[evidence."signerRole"]
  ELSE ARRAY[]::TEXT[]
END
FROM "SignedDocuments" AS evidence,
  "DocumentRequirementSatisfactions" AS satisfaction
WHERE contributor."signedDocumentId" = evidence."id"
  AND contributor."satisfactionId" = satisfaction."id";

-- Recompute active aggregates after role snapshots are restored. Normalize
-- role labels so Parent/Guardian and parent_guardian compare as one role.
WITH active AS (
  SELECT
    satisfaction."id" AS satisfaction_id,
    satisfaction."requiredSignerRoles" AS required_signer_roles,
    COALESCE(BOOL_OR(evidence."id" IS NOT NULL), FALSE) AS has_active_evidence,
    COALESCE(
      array_agg(DISTINCT completed_role."role" ORDER BY completed_role."role")
        FILTER (
          WHERE completed_role."role" IS NOT NULL
            AND NULLIF(BTRIM(completed_role."role"), '') IS NOT NULL
        ),
      ARRAY[]::TEXT[]
    ) AS completed_signer_roles
  FROM "DocumentRequirementSatisfactions" satisfaction
  LEFT JOIN "DocumentRequirementSatisfactionEvidence" contributor
    ON contributor."satisfactionId" = satisfaction."id"
  LEFT JOIN "SignedDocuments" evidence
    ON evidence."id" = contributor."signedDocumentId"
    AND UPPER(COALESCE(evidence."status", '')) IN ('SIGNED', 'COMPLETED')
  LEFT JOIN LATERAL unnest(
    CASE
      WHEN evidence."id" IS NULL THEN ARRAY[]::TEXT[]
      ELSE contributor."completedSignerRoles"
    END
  ) AS completed_role("role") ON TRUE
  GROUP BY satisfaction."id", satisfaction."requiredSignerRoles"
), scored AS (
  SELECT
    active.*,
    active.has_active_evidence
      AND (
        COALESCE(array_length(active.required_signer_roles, 1), 0) = 0
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(active.required_signer_roles) AS required_role("role")
          WHERE NOT EXISTS (
            SELECT 1
            FROM unnest(active.completed_signer_roles) AS completed_role("role")
            WHERE NULLIF(
              regexp_replace(UPPER(COALESCE(required_role."role", '')), '[^A-Z0-9]', '', 'g'),
              ''
            ) = NULLIF(
              regexp_replace(UPPER(COALESCE(completed_role."role", '')), '[^A-Z0-9]', '', 'g'),
              ''
            )
          )
        )
      ) AS is_complete
  FROM active
)
UPDATE "DocumentRequirementSatisfactions" satisfaction
SET
  "updatedAt" = CURRENT_TIMESTAMP,
  "completedSignerRoles" = scored.completed_signer_roles,
  "status" = CASE
    WHEN scored.is_complete THEN 'SATISFIED'::"DocumentRequirementSatisfactionStatusEnum"
    WHEN scored.has_active_evidence THEN 'PENDING'::"DocumentRequirementSatisfactionStatusEnum"
    ELSE 'INVALIDATED'::"DocumentRequirementSatisfactionStatusEnum"
  END,
  "isComplete" = scored.is_complete,
  "invalidatedAt" = CASE
    WHEN scored.has_active_evidence THEN NULL
    ELSE COALESCE(satisfaction."invalidatedAt", CURRENT_TIMESTAMP)
  END
FROM scored
WHERE satisfaction."id" = scored.satisfaction_id;
