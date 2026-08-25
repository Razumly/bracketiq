ALTER TYPE "AffiliateSupplyLifecycleCommand"
  ADD VALUE IF NOT EXISTS 'LEGACY_RECONCILED';

CREATE TABLE "AffiliateSupplyReconciliationRuns" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRY_RUN',
  "operatorId" TEXT,
  "rolloutCohort" TEXT NOT NULL,
  "supplyContractVersion" INTEGER,
  "supplyContractHash" TEXT,
  "deploymentContractVersion" INTEGER,
  "deploymentContractHash" TEXT,
  "inputHash" TEXT NOT NULL,
  "outputHash" TEXT NOT NULL,
  "reportHash" TEXT NOT NULL,
  "counts" JSONB NOT NULL,
  "failedInvariants" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "resolutionRefs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reportJson" JSONB NOT NULL,
  "appliedAt" TIMESTAMP(3),
  "appliedBy" TEXT,
  "applyNonceHash" TEXT,

  CONSTRAINT "AffiliateSupplyReconciliationRuns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AffiliateSupplyReconciliationRuns_reportHash_key"
  ON "AffiliateSupplyReconciliationRuns"("reportHash");
CREATE INDEX "AffiliateSupplyReconciliationRuns_mode_status_createdAt_idx"
  ON "AffiliateSupplyReconciliationRuns"("mode", "status", "createdAt");
CREATE INDEX "AffiliateSupplyReconciliationRuns_rolloutCohort_createdAt_idx"
  ON "AffiliateSupplyReconciliationRuns"("rolloutCohort", "createdAt");
CREATE INDEX "AffiliateSupplyReconciliationRuns_inputHash_idx"
  ON "AffiliateSupplyReconciliationRuns"("inputHash");
