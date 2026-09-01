-- Forward-only repair for issue #70.
--
-- APPLY persists a canonical post-apply legacy snapshot hash in reportJson so
-- replay can prove that raw legacy evidence has not changed. Permit that one
-- additional report field during the guarded DRY_RUN -> APPLY promotion; all
-- other reconciliation evidence remains immutable.
BEGIN;
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
    AND OLD."status" = 'READY'
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
    AND NOT (OLD."reportJson" ? 'postApplyLegacySnapshotHash')
    AND NEW."reportJson" ? 'cutoverSessionId'
    AND NEW."reportJson" ? 'cutoverSessionHash'
    AND NEW."reportJson" ? 'postApplyLegacySnapshotHash'
    AND NEW."reportJson" - 'cutoverSessionId' - 'cutoverSessionHash'
      - 'postApplyLegacySnapshotHash' = OLD."reportJson"
    AND NEW."reportJson"->>'cutoverSessionId' <> ''
    AND NEW."reportJson"->>'cutoverSessionHash' ~* '^[0-9a-f]{64}$'
    AND NEW."reportJson"->>'postApplyLegacySnapshotHash' ~* '^[0-9a-f]{64}$';

  -- Prisma's @updatedAt field is the only additional column allowed to change.
  IF is_apply_promotion THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
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
COMMIT;
