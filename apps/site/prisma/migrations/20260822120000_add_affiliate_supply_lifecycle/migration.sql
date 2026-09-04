DO $$
BEGIN
  CREATE TYPE "AffiliateSupplyLifecycleStage" AS ENUM ('PRE_MAPPED', 'MAPPED', 'APPROVED', 'ACTIVATED', 'PUBLISHED', 'SOURCE_EXCLUDED', 'HUMAN_REVIEW_REQUIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AffiliateSupplyContractManifestStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AffiliateSupplyTargetStatus" AS ENUM ('PUBLISHED', 'LAST_KNOWN_GOOD', 'REJECTED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AffiliateReplenishmentDemandStatus" AS ENUM ('OPEN', 'CLOSED', 'PAUSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AffiliateReplenishmentWaveStatus" AS ENUM ('PLANNED', 'ACTIVE', 'WAITING', 'SUCCEEDED', 'FAILED', 'PAUSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AffiliateScrapeSources" ADD COLUMN IF NOT EXISTS "supplySourceId" TEXT;
ALTER TABLE "AffiliateScrapeSources" ADD COLUMN IF NOT EXISTS "lifecycleGeneration" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AffiliateScrapeSources" ADD COLUMN IF NOT EXISTS "activeSupplyContractVersion" INTEGER;
ALTER TABLE "AffiliateScrapeSources" ADD COLUMN IF NOT EXISTS "activeSupplyContractHash" TEXT;
ALTER TABLE "AffiliateScrapeMappings" ADD COLUMN IF NOT EXISTS "supplySourceId" TEXT;
ALTER TABLE "AffiliateScrapeRuns" ADD COLUMN IF NOT EXISTS "supplySourceId" TEXT;
ALTER TABLE "AffiliateSourceIntakes" ADD COLUMN IF NOT EXISTS "supplySourceId" TEXT;
ALTER TABLE "AffiliateSourceIntakePages" ADD COLUMN IF NOT EXISTS "supplySourceId" TEXT;
ALTER TABLE "AffiliateSourceIntakeRuns" ADD COLUMN IF NOT EXISTS "supplySourceId" TEXT;
ALTER TABLE "AffiliateSourceIntakeArtifacts" ADD COLUMN IF NOT EXISTS "supplySourceId" TEXT;
ALTER TABLE "AffiliateSourceMappingJobs" ADD COLUMN IF NOT EXISTS "supplySourceId" TEXT;
ALTER TABLE "AffiliateApprovalJobs" ADD COLUMN IF NOT EXISTS "supplySourceId" TEXT;
ALTER TABLE "AffiliateImportCandidates" ADD COLUMN IF NOT EXISTS "supplySourceId" TEXT;

CREATE INDEX IF NOT EXISTS "AffiliateScrapeSources_supplySourceId_status_idx"
  ON "AffiliateScrapeSources" ("supplySourceId", "status");
CREATE INDEX IF NOT EXISTS "AffiliateScrapeMappings_supplySourceId_idx"
  ON "AffiliateScrapeMappings" ("supplySourceId");
CREATE INDEX IF NOT EXISTS "AffiliateScrapeRuns_supplySourceId_createdAt_idx"
  ON "AffiliateScrapeRuns" ("supplySourceId", "createdAt");
CREATE INDEX IF NOT EXISTS "AffiliateSourceIntakes_supplySourceId_status_idx"
  ON "AffiliateSourceIntakes" ("supplySourceId", "status");
CREATE INDEX IF NOT EXISTS "AffiliateSourceIntakePages_supplySourceId_status_idx"
  ON "AffiliateSourceIntakePages" ("supplySourceId", "status");
CREATE INDEX IF NOT EXISTS "AffiliateSourceIntakeRuns_supplySourceId_createdAt_idx"
  ON "AffiliateSourceIntakeRuns" ("supplySourceId", "createdAt");
CREATE INDEX IF NOT EXISTS "AffiliateSourceIntakeArtifacts_supplySourceId_createdAt_idx"
  ON "AffiliateSourceIntakeArtifacts" ("supplySourceId", "createdAt");
CREATE INDEX IF NOT EXISTS "AffiliateSourceMappingJobs_supplySourceId_status_createdAt_idx"
  ON "AffiliateSourceMappingJobs" ("supplySourceId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "AffiliateApprovalJobs_supplySourceId_status_idx"
  ON "AffiliateApprovalJobs" ("supplySourceId", "status");
CREATE INDEX IF NOT EXISTS "AffiliateImportCandidates_supplySourceId_status_idx"
  ON "AffiliateImportCandidates" ("supplySourceId", "status");

CREATE TABLE IF NOT EXISTS "AffiliateSupplySources" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "identityKey" TEXT NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "pathKey" TEXT NOT NULL,
  "operatorDomain" TEXT,
  "targetKind" TEXT NOT NULL DEFAULT 'EVENT',
  "rolloutCohort" TEXT NOT NULL DEFAULT 'DEFAULT',
  "intakeId" TEXT,
  "liveSourceId" TEXT,
  "predecessorId" TEXT,
  "successorId" TEXT,
  "lifecycleGeneration" INTEGER NOT NULL DEFAULT 0,
  "activeSupplyContractVersion" INTEGER,
  "activeSupplyContractHash" TEXT,
  "derivedStage" "AffiliateSupplyLifecycleStage" NOT NULL DEFAULT 'PRE_MAPPED',
  "derivedOutcome" TEXT,
  "freshnessStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "targetContribution" INTEGER NOT NULL DEFAULT 0,
  "repairPriority" INTEGER NOT NULL DEFAULT 4,
  "isAutomationEnabled" BOOLEAN NOT NULL DEFAULT false,
  "isExcluded" BOOLEAN NOT NULL DEFAULT false,
  "automationHoldReason" TEXT,
  "excludedAt" TIMESTAMP(3),
  "lastSuccessfulRefreshAt" TIMESTAMP(3),
  "lastAssessmentAt" TIMESTAMP(3),
  "assessmentJson" JSONB,
  "invariantViolations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  CONSTRAINT "AffiliateSupplySources_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateSupplySources_identityKey_key"
  ON "AffiliateSupplySources" ("identityKey");
CREATE INDEX IF NOT EXISTS "AffiliateSupplySources_canonicalUrl_idx"
  ON "AffiliateSupplySources" ("canonicalUrl");
CREATE INDEX IF NOT EXISTS "AffiliateSupplySources_rolloutCohort_derivedStage_idx"
  ON "AffiliateSupplySources" ("rolloutCohort", "derivedStage");
CREATE INDEX IF NOT EXISTS "AffiliateSupplySources_derivedStage_freshnessStatus_idx"
  ON "AffiliateSupplySources" ("derivedStage", "freshnessStatus");
CREATE INDEX IF NOT EXISTS "AffiliateSupplySources_intakeId_idx"
  ON "AffiliateSupplySources" ("intakeId");
CREATE INDEX IF NOT EXISTS "AffiliateSupplySources_liveSourceId_idx"
  ON "AffiliateSupplySources" ("liveSourceId");
CREATE INDEX IF NOT EXISTS "AffiliateSupplySources_predecessorId_idx"
  ON "AffiliateSupplySources" ("predecessorId");
CREATE INDEX IF NOT EXISTS "AffiliateSupplySources_successorId_idx"
  ON "AffiliateSupplySources" ("successorId");

CREATE TABLE IF NOT EXISTS "AffiliateSupplyContractManifests" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "rolloutCohort" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "AffiliateSupplyContractManifestStatus" NOT NULL DEFAULT 'DRAFT',
  "contractHash" TEXT NOT NULL,
  "contractJson" JSONB NOT NULL,
  "componentHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "activatedByUserId" TEXT,
  "activatedAt" TIMESTAMP(3),
  "retiredAt" TIMESTAMP(3),
  "impactReport" JSONB,
  CONSTRAINT "AffiliateSupplyContractManifests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateSupplyContractManifests_rolloutCohort_version_key"
  ON "AffiliateSupplyContractManifests" ("rolloutCohort", "version");
CREATE INDEX IF NOT EXISTS "AffiliateSupplyContractManifests_rolloutCohort_status_idx"
  ON "AffiliateSupplyContractManifests" ("rolloutCohort", "status");
CREATE INDEX IF NOT EXISTS "AffiliateSupplyContractManifests_contractHash_idx"
  ON "AffiliateSupplyContractManifests" ("contractHash");
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateSupplyContractManifests_one_active_per_rollout_key"
  ON "AffiliateSupplyContractManifests" ("rolloutCohort")
  WHERE "status" = 'ACTIVE';


CREATE TABLE IF NOT EXISTS "AffiliateSupplyLifecycleTransitions" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "supplySourceId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "generation" INTEGER NOT NULL,
  "fromStage" "AffiliateSupplyLifecycleStage",
  "toStage" "AffiliateSupplyLifecycleStage" NOT NULL,
  "outcome" TEXT,
  "command" TEXT NOT NULL,
  "commandRef" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "resultHash" TEXT NOT NULL,
  "contractVersion" INTEGER NOT NULL,
  "contractHash" TEXT NOT NULL,
  "actorKind" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "executingAgentId" TEXT,
  "reasonCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "evidenceRefs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requestJson" JSONB NOT NULL,
  "resultJson" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retentionClass" TEXT NOT NULL DEFAULT 'INDEFINITE',
  CONSTRAINT "AffiliateSupplyLifecycleTransitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateSupplyLifecycleTransitions_idempotencyKey_key"
  ON "AffiliateSupplyLifecycleTransitions" ("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateSupplyLifecycleTransitions_supplySourceId_sequence_key"
  ON "AffiliateSupplyLifecycleTransitions" ("supplySourceId", "sequence");
CREATE INDEX IF NOT EXISTS "AffiliateSupplyLifecycleTransitions_supplySourceId_generation_idx"
  ON "AffiliateSupplyLifecycleTransitions" ("supplySourceId", "generation");
CREATE INDEX IF NOT EXISTS "AffiliateSupplyLifecycleTransitions_supplySourceId_commandRef_idx"
  ON "AffiliateSupplyLifecycleTransitions" ("supplySourceId", "commandRef");
CREATE INDEX IF NOT EXISTS "AffiliateSupplyLifecycleTransitions_contractHash_idx"
  ON "AffiliateSupplyLifecycleTransitions" ("contractHash");

CREATE TABLE IF NOT EXISTS "AffiliateSupplyTargets" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "supplySourceId" TEXT NOT NULL,
  "candidateId" TEXT,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "marketKey" TEXT,
  "sportId" TEXT,
  "sourceProfile" TEXT NOT NULL,
  "status" "AffiliateSupplyTargetStatus" NOT NULL DEFAULT 'PUBLISHED',
  "publishedAt" TIMESTAMP(3),
  "lastSuccessfulRefreshAt" TIMESTAMP(3),
  "freshnessExpiresAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "evidenceRefs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "evidenceHash" TEXT,
  "metadata" JSONB,
  CONSTRAINT "AffiliateSupplyTargets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateSupplyTargets_supplySourceId_targetType_targetId_key"
  ON "AffiliateSupplyTargets" ("supplySourceId", "targetType", "targetId");
CREATE INDEX IF NOT EXISTS "AffiliateSupplyTargets_supplySourceId_status_freshnessExpiresAt_idx"
  ON "AffiliateSupplyTargets" ("supplySourceId", "status", "freshnessExpiresAt");
CREATE INDEX IF NOT EXISTS "AffiliateSupplyTargets_marketKey_sportId_sourceProfile_status_idx"
  ON "AffiliateSupplyTargets" ("marketKey", "sportId", "sourceProfile", "status");
CREATE INDEX IF NOT EXISTS "AffiliateSupplyTargets_candidateId_idx"
  ON "AffiliateSupplyTargets" ("candidateId");

CREATE TABLE IF NOT EXISTS "AffiliateReplenishmentDemands" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "targetKey" TEXT NOT NULL,
  "marketKey" TEXT NOT NULL,
  "sportId" TEXT NOT NULL,
  "sourceProfile" TEXT NOT NULL,
  "rolloutCohort" TEXT NOT NULL,
  "contractVersion" INTEGER NOT NULL,
  "contractHash" TEXT NOT NULL,
  "minimumFreshPublishedSupply" INTEGER NOT NULL,
  "observedFreshPublishedSupply" INTEGER NOT NULL DEFAULT 0,
  "priority" INTEGER NOT NULL DEFAULT 4,
  "status" "AffiliateReplenishmentDemandStatus" NOT NULL DEFAULT 'OPEN',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "nextEligibleAt" TIMESTAMP(3),
  "searchSaturatedUntil" TIMESTAMP(3),
  "activeWaveId" TEXT,
  "generation" INTEGER NOT NULL DEFAULT 0,

  "reasonCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "evidenceJson" JSONB,
  CONSTRAINT "AffiliateReplenishmentDemands_pkey" PRIMARY KEY ("id")
);
DROP INDEX IF EXISTS "AffiliateReplenishmentDemands_targetKey_contractVersion_contractHash_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateReplenishmentDemands_rolloutCohort_targetKey_contractVersion_contractHash_key"
  ON "AffiliateReplenishmentDemands" ("rolloutCohort", "targetKey", "contractVersion", "contractHash");
CREATE INDEX IF NOT EXISTS "AffiliateReplenishmentDemands_status_priority_nextEligibleAt_idx"
  ON "AffiliateReplenishmentDemands" ("status", "priority", "nextEligibleAt");
CREATE INDEX IF NOT EXISTS "AffiliateReplenishmentDemands_rolloutCohort_marketKey_sportId_sourceProfile_status_idx"
  ON "AffiliateReplenishmentDemands" ("rolloutCohort", "marketKey", "sportId", "sourceProfile", "status");
CREATE INDEX IF NOT EXISTS "AffiliateReplenishmentDemands_activeWaveId_idx"
  ON "AffiliateReplenishmentDemands" ("activeWaveId");

CREATE TABLE IF NOT EXISTS "AffiliateReplenishmentWaves" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "demandId" TEXT NOT NULL,
  "rolloutCohort" TEXT NOT NULL,
  "status" "AffiliateReplenishmentWaveStatus" NOT NULL DEFAULT 'PLANNED',
  "campaignId" TEXT,
  "coveragePlanningJobId" TEXT,
  "provider" TEXT,
  "providerOperationKey" TEXT,
  "startedAt" TIMESTAMP(3),
  "terminalAt" TIMESTAMP(3),
  "retryAt" TIMESTAMP(3),
  "marginalYield" INTEGER,
  "errorCode" TEXT,
  "resultJson" JSONB,
  "demandGeneration" INTEGER NOT NULL,
  "evidenceRefs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "AffiliateReplenishmentWaves_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateReplenishmentWaves_providerOperationKey_key"
  ON "AffiliateReplenishmentWaves" ("providerOperationKey");
CREATE INDEX IF NOT EXISTS "AffiliateReplenishmentWaves_demandId_status_idx"
  ON "AffiliateReplenishmentWaves" ("demandId", "status");
CREATE INDEX IF NOT EXISTS "AffiliateReplenishmentWaves_status_retryAt_createdAt_idx"
  ON "AffiliateReplenishmentWaves" ("status", "retryAt", "createdAt");
CREATE INDEX IF NOT EXISTS "AffiliateReplenishmentWaves_rolloutCohort_status_idx"
  ON "AffiliateReplenishmentWaves" ("rolloutCohort", "status");

CREATE TABLE IF NOT EXISTS "AffiliateAgentWorkerHealth" (
  "id" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'HEALTHY',
  "heartbeatAt" TIMESTAMP(3) NOT NULL,
  "leaseExpiresAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AffiliateAgentWorkerHealth_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateAgentWorkerHealth_workerId_role_key"
  ON "AffiliateAgentWorkerHealth" ("workerId", "role");
CREATE INDEX IF NOT EXISTS "AffiliateAgentWorkerHealth_role_status_heartbeatAt_idx"
  ON "AffiliateAgentWorkerHealth" ("role", "status", "heartbeatAt");

CREATE OR REPLACE FUNCTION "affiliate_supply_lifecycle_transition_immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Affiliate Supply lifecycle transitions are immutable.';
END;
$$;
DROP TRIGGER IF EXISTS "AffiliateSupplyLifecycleTransitions_immutable" ON "AffiliateSupplyLifecycleTransitions";
CREATE TRIGGER "AffiliateSupplyLifecycleTransitions_immutable"
  BEFORE UPDATE OR DELETE ON "AffiliateSupplyLifecycleTransitions"
  FOR EACH ROW
  EXECUTE FUNCTION "affiliate_supply_lifecycle_transition_immutable"();

CREATE OR REPLACE FUNCTION "affiliate_supply_contract_manifest_immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Affiliate Supply Contracts are immutable.';
  END IF;
  IF OLD."rolloutCohort" IS DISTINCT FROM NEW."rolloutCohort"
    OR OLD."version" IS DISTINCT FROM NEW."version"
    OR OLD."contractHash" IS DISTINCT FROM NEW."contractHash"
    OR OLD."contractJson" IS DISTINCT FROM NEW."contractJson"
    OR OLD."componentHashes" IS DISTINCT FROM NEW."componentHashes"
  THEN
    RAISE EXCEPTION 'Affiliate Supply Contract content is immutable.';
  END IF;
  IF OLD."status" = 'ACTIVE'
    AND NEW."status" NOT IN ('ACTIVE', 'RETIRED')
  THEN
    RAISE EXCEPTION 'An active Affiliate Supply Contract can only be retired.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "AffiliateSupplyContractManifests_immutable_content" ON "AffiliateSupplyContractManifests";
CREATE TRIGGER "AffiliateSupplyContractManifests_immutable_content"
  BEFORE UPDATE OR DELETE ON "AffiliateSupplyContractManifests"
  FOR EACH ROW
  EXECUTE FUNCTION "affiliate_supply_contract_manifest_immutable"();