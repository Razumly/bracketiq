-- Normalize derived signer-role arrays without changing raw evidence signer labels.
WITH normalized AS (
  SELECT
    satisfaction."id",
    ARRAY(
      SELECT distinct_roles.normalized_role
      FROM (
        SELECT normalized_role, MIN(position) AS position
        FROM (
          SELECT
            raw_role.ordinality AS position,
            CASE NULLIF(
              REGEXP_REPLACE(UPPER(BTRIM(raw_role.role_value)), '[^A-Z0-9]', '', 'g'),
              ''
            )
              WHEN 'PARENTGUARDIAN' THEN 'Parent/Guardian'
              WHEN 'CHILD' THEN 'Child'
              WHEN 'PARTICIPANT' THEN 'Participant'
              ELSE NULLIF(BTRIM(raw_role.role_value), '')
            END AS normalized_role
          FROM unnest(satisfaction."requiredSignerRoles") WITH ORDINALITY AS raw_role(role_value, ordinality)
          WHERE NULLIF(BTRIM(raw_role.role_value), '') IS NOT NULL
        ) role_values
        WHERE role_values.normalized_role IS NOT NULL
        GROUP BY role_values.normalized_role
      ) distinct_roles
      ORDER BY distinct_roles.position
    ) AS required_signer_roles,
    ARRAY(
      SELECT distinct_roles.normalized_role
      FROM (
        SELECT normalized_role, MIN(position) AS position
        FROM (
          SELECT
            raw_role.ordinality AS position,
            CASE NULLIF(
              REGEXP_REPLACE(UPPER(BTRIM(raw_role.role_value)), '[^A-Z0-9]', '', 'g'),
              ''
            )
              WHEN 'PARENTGUARDIAN' THEN 'Parent/Guardian'
              WHEN 'CHILD' THEN 'Child'
              WHEN 'PARTICIPANT' THEN 'Participant'
              ELSE NULLIF(BTRIM(raw_role.role_value), '')
            END AS normalized_role
          FROM unnest(satisfaction."completedSignerRoles") WITH ORDINALITY AS raw_role(role_value, ordinality)
          WHERE NULLIF(BTRIM(raw_role.role_value), '') IS NOT NULL
        ) role_values
        WHERE role_values.normalized_role IS NOT NULL
        GROUP BY role_values.normalized_role
      ) distinct_roles
      ORDER BY distinct_roles.position
    ) AS completed_signer_roles
  FROM "DocumentRequirementSatisfactions" satisfaction
)
UPDATE "DocumentRequirementSatisfactions" satisfaction
SET
  "requiredSignerRoles" = normalized.required_signer_roles,
  "completedSignerRoles" = normalized.completed_signer_roles
FROM normalized
WHERE satisfaction."id" = normalized."id";

WITH normalized AS (
  SELECT
    contributor."id",
    ARRAY(
      SELECT distinct_roles.normalized_role
      FROM (
        SELECT normalized_role, MIN(position) AS position
        FROM (
          SELECT
            raw_role.ordinality AS position,
            CASE NULLIF(
              REGEXP_REPLACE(UPPER(BTRIM(raw_role.role_value)), '[^A-Z0-9]', '', 'g'),
              ''
            )
              WHEN 'PARENTGUARDIAN' THEN 'Parent/Guardian'
              WHEN 'CHILD' THEN 'Child'
              WHEN 'PARTICIPANT' THEN 'Participant'
              ELSE NULLIF(BTRIM(raw_role.role_value), '')
            END AS normalized_role
          FROM unnest(contributor."completedSignerRoles") WITH ORDINALITY AS raw_role(role_value, ordinality)
          WHERE NULLIF(BTRIM(raw_role.role_value), '') IS NOT NULL
        ) role_values
        WHERE role_values.normalized_role IS NOT NULL
        GROUP BY role_values.normalized_role
      ) distinct_roles
      ORDER BY distinct_roles.position
    ) AS completed_signer_roles
  FROM "DocumentRequirementSatisfactionEvidence" contributor
)
UPDATE "DocumentRequirementSatisfactionEvidence" contributor
SET "completedSignerRoles" = normalized.completed_signer_roles
FROM normalized
WHERE contributor."id" = normalized."id";
