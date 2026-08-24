CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TYPE "AffiliateSupplyLifecycleCommand" ADD VALUE IF NOT EXISTS 'CREATE_ROOT' BEFORE 'RECORD_MAPPING';

WITH legacy_roots AS (
  SELECT
    root."id",
    root."createdAt",
    root."identityKey",
    root."canonicalUrl",
    root."operatorDomain",
    root."targetKind",
    root."rolloutCohort",
    root."intakeId",
    root."liveSourceId",
    root."derivedStage",
    COALESCE(
      root."activeSupplyContractVersion",
      active_manifest."version",
      0
    ) AS "contractVersion",
    COALESCE(
      root."activeSupplyContractHash",
      active_manifest."contractHash",
      'LEGACY_ROOT:' || encode(digest(root."identityKey", 'sha256'), 'hex')
    ) AS "contractHash",
    concat(
      '{"evidenceRefs":',
      array_to_json(ARRAY[
        'identity:' || root."identityKey",
        'canonical-url:' || encode(
          digest(
            concat(
              '{"requestedUrl":',
              to_json(root."canonicalUrl")::text,
              ',"resolvedCanonicalUrl":',
              to_json(root."canonicalUrl")::text,
              '}'
            ),
            'sha256'
          ),
          'hex'
        )
      ]::TEXT[])::text,
      ',"identityKey":',
      to_json(root."identityKey")::text,
      ',"intakeId":',
      COALESCE(to_json(root."intakeId")::text, 'null'),
      ',"isRedirectVerified":false',
      ',"liveSourceId":',
      COALESCE(to_json(root."liveSourceId")::text, 'null'),
      ',"operatorDomain":',
      COALESCE(to_json(root."operatorDomain")::text, 'null'),
      ',"requestedUrl":',
      to_json(root."canonicalUrl")::text,
      ',"resolvedCanonicalUrl":',
      to_json(root."canonicalUrl")::text,
      ',"targetKind":',
      to_json(root."targetKind")::text,
      '}'
    ) AS "requestCanonicalJson"
  FROM "AffiliateSupplySources" AS root
  LEFT JOIN LATERAL (
    SELECT manifest."version", manifest."contractHash"
    FROM "AffiliateSupplyContractManifests" AS manifest
    WHERE manifest."rolloutCohort" = root."rolloutCohort"
      AND manifest."status" = 'ACTIVE'
    ORDER BY manifest."version" DESC
    LIMIT 1
  ) AS active_manifest ON TRUE
  WHERE root."lifecycleGeneration" = 0
    AND NOT EXISTS (
      SELECT 1
      FROM "AffiliateSupplyLifecycleTransitions" AS transition
      WHERE transition."supplySourceId" = root."id"
    )
),
legacy_rows AS (
  SELECT
    legacy.*,
    legacy."requestCanonicalJson"::JSONB AS "requestJson"
  FROM legacy_roots AS legacy
),
backfill_rows AS (
  SELECT
    backfill_data.*,
    backfill_data."resultCanonicalJson"::JSONB AS "resultJson"
  FROM (
    SELECT
      legacy.*,
      concat(
        '{"assessedAt":',
        to_json(
          to_char(legacy."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )::text,
        ',"automationHoldReason":null',
        ',"contractHash":',
        to_json(legacy."contractHash")::text,
        ',"contractVersion":',
        legacy."contractVersion"::text,
        ',"evidenceRefs":',
        array_to_json(ARRAY[
          'identity:' || legacy."identityKey",
          'canonical-url:' || encode(
            digest(
              concat(
                '{"requestedUrl":',
                to_json(legacy."canonicalUrl")::text,
                ',"resolvedCanonicalUrl":',
                to_json(legacy."canonicalUrl")::text,
                '}'
              ),
              'sha256'
            ),
            'hex'
          ),
          'supply-source:' || legacy."id"
        ]::TEXT[])::text,
        ',"freshnessStatus":"UNKNOWN"',
        ',"invariantViolations":[]',
        ',"isAutomationEnabled":false',
        ',"isTargetMet":false',
        ',"legacyBackfill":true',
        ',"lifecycleGeneration":1',
        ',"outcome":null',
        ',"qualifyingTargetIds":[]',
        ',"reasonCodes":["LEGACY_ROOT_BACKFILL"]',
        ',"repairPriority":4',
        ',"stage":',
        to_json(legacy."derivedStage"::text)::text,
        ',"supplySourceId":',
        to_json(legacy."id")::text,
        ',"targetContribution":0',
        ',"targetMinimum":0',
        ',"targets":[]}'
      ) AS "resultCanonicalJson"
    FROM legacy_rows AS legacy
  ) AS backfill_data
)
INSERT INTO "AffiliateSupplyLifecycleTransitions" (
  "id",
  "createdAt",
  "supplySourceId",
  "sequence",
  "generation",
  "fromStage",
  "toStage",
  "outcome",
  "command",
  "commandRef",
  "idempotencyKey",
  "requestHash",
  "resultHash",
  "contractVersion",
  "contractHash",
  "actorKind",
  "actorId",
  "reasonCodes",
  "evidenceRefs",
  "requestJson",
  "resultJson",
  "occurredAt",
  "retentionClass"
)
SELECT
  'legacy-root-transition:' || backfill."id",
  backfill."createdAt",
  backfill."id",
  1,
  1,
  NULL::"AffiliateSupplyLifecycleStage",
  backfill."derivedStage",
  NULL::"AffiliateSupplyLifecycleOutcome",
  'CREATE_ROOT'::"AffiliateSupplyLifecycleCommand",
  'legacy-root-backfill:' || backfill."identityKey",
  'root-creation:' || backfill."identityKey",
  encode(
    digest(
      concat(
        '{"command":"CREATE_ROOT"',
        ',"contractHash":',
        to_json(backfill."contractHash")::text,
        ',"contractVersion":',
        backfill."contractVersion"::text,
        ',"request":',
        backfill."requestCanonicalJson",
        ',"supplySourceId":',
        to_json(backfill."id")::text,
        '}'
      ),
      'sha256'
    ),
    'hex'
  ),
  encode(digest(backfill."resultCanonicalJson", 'sha256'), 'hex'),
  backfill."contractVersion",
  backfill."contractHash",
  'SYSTEM'::"AffiliateSupplyLifecycleActorKind",
  'affiliate-supply-legacy-root-backfill',
  ARRAY['LEGACY_ROOT_BACKFILL']::TEXT[],
  ARRAY[
    'identity:' || backfill."identityKey",
    'canonical-url:' || encode(
      digest(
        concat(
          '{"requestedUrl":',
          to_json(backfill."canonicalUrl")::text,
          ',"resolvedCanonicalUrl":',
          to_json(backfill."canonicalUrl")::text,
          '}'
        ),
        'sha256'
      ),
      'hex'
    ),
    'supply-source:' || backfill."id"
  ]::TEXT[],
  backfill."requestJson",
  backfill."resultJson",
  backfill."createdAt",
  'INDEFINITE'
FROM backfill_rows AS backfill;

UPDATE "AffiliateSupplySources" AS root
SET
  "lifecycleGeneration" = 1,
  "activeSupplyContractVersion" = transition."contractVersion",
  "activeSupplyContractHash" = transition."contractHash",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "AffiliateSupplyLifecycleTransitions" AS transition
WHERE transition."supplySourceId" = root."id"
  AND transition."command" = 'CREATE_ROOT'
  AND transition."actorId" = 'affiliate-supply-legacy-root-backfill'
  AND root."lifecycleGeneration" = 0;

UPDATE "AffiliateScrapeSources" AS live_source
SET
  "lifecycleGeneration" = 1,
  "activeSupplyContractVersion" = transition."contractVersion",
  "activeSupplyContractHash" = transition."contractHash",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "AffiliateSupplySources" AS root
JOIN "AffiliateSupplyLifecycleTransitions" AS transition
  ON transition."supplySourceId" = root."id"
WHERE transition."command" = 'CREATE_ROOT'
  AND transition."actorId" = 'affiliate-supply-legacy-root-backfill'
  AND live_source."lifecycleGeneration" = 0
  AND (
    live_source."id" = root."liveSourceId"
    OR live_source."supplySourceId" = root."id"
  );
