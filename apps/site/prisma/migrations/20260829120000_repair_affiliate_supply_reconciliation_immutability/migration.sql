-- Forward-only repair for issue #70.
--
-- 20260824170000 recorded synthetic CREATE_ROOT history for every repaired
-- root at generation one. This repair reasserts generation one and the
-- synthetic contract on matching root/live projections so the next append
-- is generation two.
-- The immutable transition is retained as explicit migration provenance;
-- governed writes and immutable lifecycle evidence are never rolled back.
-- Reconcile only an untouched root/live pair whose projections already carry
-- the synthetic generation-one values; pointer exclusivity avoids touching a
-- source shared by another root.
BEGIN;
UPDATE "AffiliateScrapeSources" AS live_source
SET
  "lifecycleGeneration" = 1,
  "activeSupplyContractVersion" = transition."contractVersion",
  "activeSupplyContractHash" = transition."contractHash",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "AffiliateSupplySources" AS root
JOIN "AffiliateSupplyLifecycleTransitions" AS transition
  ON transition."supplySourceId" = root."id"
WHERE transition."id" = 'legacy-root-transition:' || root."id"
  AND transition."command" = 'CREATE_ROOT'
  AND transition."actorKind" = 'SYSTEM'
  AND transition."actorId" = 'affiliate-supply-legacy-root-backfill'
  AND transition."sequence" = 1
  AND transition."generation" = 1
  AND transition."reasonCodes" @> ARRAY['LEGACY_ROOT_BACKFILL']::TEXT[]
  AND root."lifecycleGeneration" = 1
  AND root."activeSupplyContractVersion" IS NOT DISTINCT FROM transition."contractVersion"
  AND root."activeSupplyContractHash" IS NOT DISTINCT FROM transition."contractHash"
  AND (
    SELECT COUNT(*)
    FROM "AffiliateSupplyLifecycleTransitions" AS later_transition
    WHERE later_transition."supplySourceId" = root."id"
  ) = 1
  AND live_source."lifecycleGeneration" = 1
  AND live_source."activeSupplyContractVersion" IS NOT DISTINCT FROM transition."contractVersion"
  AND live_source."activeSupplyContractHash" IS NOT DISTINCT FROM transition."contractHash"
  AND (
    live_source."id" = root."liveSourceId"
    OR live_source."supplySourceId" = root."id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "AffiliateSupplySources" AS other_root
    WHERE other_root."id" <> root."id"
      AND (
        other_root."liveSourceId" = live_source."id"
        OR other_root."id" = live_source."supplySourceId"
      )
  );

UPDATE "AffiliateSupplySources" AS root
SET
  "lifecycleGeneration" = 1,
  "activeSupplyContractVersion" = transition."contractVersion",
  "activeSupplyContractHash" = transition."contractHash",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "AffiliateSupplyLifecycleTransitions" AS transition
WHERE transition."supplySourceId" = root."id"
  AND transition."id" = 'legacy-root-transition:' || root."id"
  AND transition."command" = 'CREATE_ROOT'
  AND transition."actorKind" = 'SYSTEM'
  AND transition."actorId" = 'affiliate-supply-legacy-root-backfill'
  AND transition."sequence" = 1
  AND transition."generation" = 1
  AND transition."reasonCodes" @> ARRAY['LEGACY_ROOT_BACKFILL']::TEXT[]
  AND root."lifecycleGeneration" = 1
  AND root."activeSupplyContractVersion" IS NOT DISTINCT FROM transition."contractVersion"
  AND root."activeSupplyContractHash" IS NOT DISTINCT FROM transition."contractHash"
  AND (
    SELECT COUNT(*)
    FROM "AffiliateSupplyLifecycleTransitions" AS later_transition
    WHERE later_transition."supplySourceId" = root."id"
  ) = 1;

-- The synthetic CREATE_ROOT transition remains immutable evidence and is
-- never deleted or mutated. Matching root/live projections stay aligned at
-- generation one, ensuring the next lifecycle append uses generation two.
-- Lifecycle derivation reads current authoritative source, mapping, approval,
-- refresh, and target evidence rather than treating this synthetic marker as
-- proof of any real lifecycle stage.

-- Reconciliation reports are immutable evidence. The one allowed update is the
-- guarded DRY_RUN -> APPLY promotion that adds exactly one durable session
-- binding and terminal apply metadata. Prisma's @updatedAt must be preserved.
CREATE OR REPLACE FUNCTION "reject_affiliate_supply_reconciliation_immutable_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  is_apply_promotion BOOLEAN;
BEGIN
  is_apply_promotion :=
    OLD."mode" = 'DRY_RUN'
    AND NEW."mode" = 'APPLY'
    AND OLD."status" IS DISTINCT FROM 'APPLIED'
    AND NEW."status" = 'APPLIED'
    AND OLD."appliedAt" IS NULL
    AND NEW."appliedAt" IS NOT NULL
    AND OLD."appliedBy" IS NULL
    AND NEW."appliedBy" IS NOT NULL
    AND btrim(NEW."appliedBy") <> ''
    AND OLD."applyNonceHash" IS NULL
    AND NEW."applyNonceHash" ~* '^[0-9a-f]{64}$'
    AND (
      (
        OLD."deploymentContractVersion" IS NULL
        AND OLD."deploymentContractHash" IS NULL
        AND NEW."deploymentContractVersion" IS NOT NULL
        AND NEW."deploymentContractHash" ~* '^[0-9a-f]{64}$'
      )
      OR (
        OLD."deploymentContractVersion" IS NOT NULL
        AND OLD."deploymentContractHash" ~* '^[0-9a-f]{64}$'
        AND NEW."deploymentContractVersion" = OLD."deploymentContractVersion"
        AND NEW."deploymentContractHash" = OLD."deploymentContractHash"
      )
    )
    AND jsonb_typeof(OLD."reportJson") = 'object'
    AND jsonb_typeof(NEW."reportJson") = 'object'
    AND NOT (OLD."reportJson" ? 'cutoverSessionId')
    AND NOT (OLD."reportJson" ? 'cutoverSessionHash')
    AND NEW."reportJson" ? 'cutoverSessionId'
    AND NEW."reportJson" ? 'cutoverSessionHash'
    AND NEW."reportJson" - 'cutoverSessionId' - 'cutoverSessionHash'
      = OLD."reportJson"
    AND NEW."reportJson"->>'cutoverSessionId' <> ''
    AND NEW."reportJson"->>'cutoverSessionHash' ~* '^[0-9a-f]{64}$';

  IF is_apply_promotion THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
      OR NEW."updatedAt" IS DISTINCT FROM OLD."updatedAt"
      OR NEW."operatorId" IS DISTINCT FROM OLD."operatorId"
      OR NEW."rolloutCohort" IS DISTINCT FROM OLD."rolloutCohort"
      OR NEW."supplyContractVersion" IS DISTINCT FROM OLD."supplyContractVersion"
      OR NEW."supplyContractHash" IS DISTINCT FROM OLD."supplyContractHash"
      OR NEW."inputHash" IS DISTINCT FROM OLD."inputHash"
      OR NEW."outputHash" IS DISTINCT FROM OLD."outputHash"
      OR NEW."reportHash" IS DISTINCT FROM OLD."reportHash"
      OR NEW."counts" IS DISTINCT FROM OLD."counts"
      OR NEW."failedInvariants" IS DISTINCT FROM OLD."failedInvariants"
      OR NEW."resolutionRefs" IS DISTINCT FROM OLD."resolutionRefs"
    THEN
      RAISE EXCEPTION 'Affiliate Supply reconciliation run evidence is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR NEW."updatedAt" IS DISTINCT FROM OLD."updatedAt"
    OR NEW."mode" IS DISTINCT FROM OLD."mode"
    OR NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."operatorId" IS DISTINCT FROM OLD."operatorId"
    OR NEW."rolloutCohort" IS DISTINCT FROM OLD."rolloutCohort"
    OR NEW."supplyContractVersion" IS DISTINCT FROM OLD."supplyContractVersion"
    OR NEW."supplyContractHash" IS DISTINCT FROM OLD."supplyContractHash"
    OR NEW."deploymentContractVersion" IS DISTINCT FROM OLD."deploymentContractVersion"
    OR NEW."deploymentContractHash" IS DISTINCT FROM OLD."deploymentContractHash"
    OR NEW."inputHash" IS DISTINCT FROM OLD."inputHash"
    OR NEW."outputHash" IS DISTINCT FROM OLD."outputHash"
    OR NEW."reportHash" IS DISTINCT FROM OLD."reportHash"
    OR NEW."counts" IS DISTINCT FROM OLD."counts"
    OR NEW."failedInvariants" IS DISTINCT FROM OLD."failedInvariants"
    OR NEW."resolutionRefs" IS DISTINCT FROM OLD."resolutionRefs"
    OR NEW."reportJson" IS DISTINCT FROM OLD."reportJson"
    OR NEW."appliedAt" IS DISTINCT FROM OLD."appliedAt"
    OR NEW."appliedBy" IS DISTINCT FROM OLD."appliedBy"
    OR NEW."applyNonceHash" IS DISTINCT FROM OLD."applyNonceHash"
  THEN
    RAISE EXCEPTION 'Affiliate Supply reconciliation run evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "AffiliateSupplyReconciliationRuns_immutable_evidence"
  ON "AffiliateSupplyReconciliationRuns";

CREATE TRIGGER "AffiliateSupplyReconciliationRuns_immutable_evidence"
  BEFORE UPDATE ON "AffiliateSupplyReconciliationRuns"
  FOR EACH ROW
  EXECUTE FUNCTION "reject_affiliate_supply_reconciliation_immutable_update"();

CREATE OR REPLACE FUNCTION "reject_affiliate_supply_reconciliation_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Affiliate Supply reconciliation run evidence is immutable';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS "AffiliateSupplyReconciliationRuns_immutable_delete"
  ON "AffiliateSupplyReconciliationRuns";

CREATE TRIGGER "AffiliateSupplyReconciliationRuns_immutable_delete"
  BEFORE DELETE ON "AffiliateSupplyReconciliationRuns"
  FOR EACH ROW
  EXECUTE FUNCTION "reject_affiliate_supply_reconciliation_delete"();
COMMIT;
