ALTER TABLE "AffiliateCoverageAgentJobs"
  ADD COLUMN "cohortPriority" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "priorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "priorityRank" INTEGER NOT NULL DEFAULT 2147483647,
  ADD COLUMN "isBlockingCoverage" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX "AffiliateCoverageAgentJobs_status_cohortPriority_isBlockingCoverage_priorityScore_priorityRank_createdAt_idx"
  ON "AffiliateCoverageAgentJobs"("status", "cohortPriority", "isBlockingCoverage", "priorityScore", "priorityRank", "createdAt");

CREATE TABLE "AffiliateCoverageCities" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "censusVintage" INTEGER NOT NULL,
  "placeGeoid" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "city" TEXT NOT NULL,
  "censusName" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "stateCode" TEXT NOT NULL,
  "population" INTEGER NOT NULL,
  "marketKey" TEXT NOT NULL,
  "marketName" TEXT NOT NULL,
  "cohort" TEXT NOT NULL,
  "populationWeight" DOUBLE PRECISION NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "AffiliateCoverageCities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AffiliateCoverageCities_placeGeoid_key" ON "AffiliateCoverageCities"("placeGeoid");
CREATE INDEX "AffiliateCoverageCities_active_cohort_rank_idx" ON "AffiliateCoverageCities"("active", "cohort", "rank");
CREATE INDEX "AffiliateCoverageCities_marketKey_idx" ON "AffiliateCoverageCities"("marketKey");

CREATE TABLE "AffiliateCoverageCells" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "cityId" TEXT NOT NULL,
  "marketKey" TEXT NOT NULL,
  "cohort" TEXT NOT NULL,
  "cohortPriority" INTEGER NOT NULL,
  "sportId" TEXT NOT NULL,
  "sportName" TEXT NOT NULL,
  "profileKey" TEXT NOT NULL,
  "coverageStatus" TEXT NOT NULL,
  "searchStatus" TEXT NOT NULL,
  "populationWeight" DOUBLE PRECISION NOT NULL,
  "gapSeverity" DOUBLE PRECISION NOT NULL,
  "profileWeight" DOUBLE PRECISION NOT NULL,
  "stalenessWeight" DOUBLE PRECISION NOT NULL,
  "priorityScore" DOUBLE PRECISION NOT NULL,
  "directPolicyKeyCount" INTEGER NOT NULL,
  "approvedSourceCount" INTEGER NOT NULL,
  "strategyFamilyCount" INTEGER NOT NULL,
  "unresolvedLeadCount" INTEGER NOT NULL,
  "consecutiveNoYieldCycles" INTEGER NOT NULL DEFAULT 0,
  "queryStrategyVersion" INTEGER NOT NULL,
  "evidenceQuality" TEXT NOT NULL,
  "lastAssessedAt" TIMESTAMP(3),
  "nextReviewAt" TIMESTAMP(3),
  "evidence" JSONB,
  CONSTRAINT "AffiliateCoverageCells_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AffiliateCoverageCells_cityId_sportId_profileKey_key" ON "AffiliateCoverageCells"("cityId", "sportId", "profileKey");
CREATE INDEX "AffiliateCoverageCells_cohortPriority_searchStatus_priorityScore_idx" ON "AffiliateCoverageCells"("cohortPriority", "searchStatus", "priorityScore");
CREATE INDEX "AffiliateCoverageCells_marketKey_searchStatus_idx" ON "AffiliateCoverageCells"("marketKey", "searchStatus");
CREATE INDEX "AffiliateCoverageCells_coverageStatus_searchStatus_idx" ON "AffiliateCoverageCells"("coverageStatus", "searchStatus");
CREATE INDEX "AffiliateCoverageCells_nextReviewAt_idx" ON "AffiliateCoverageCells"("nextReviewAt");

CREATE TABLE "AffiliateCoverageCellAssessments" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "cellId" TEXT NOT NULL,
  "cycleKey" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "campaignIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "strategyKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "strategyFamilyKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "newQualifiedPolicyKeyCount" INTEGER NOT NULL,
  "unresolvedLeadCount" INTEGER NOT NULL,
  "successfulQueryCount" INTEGER NOT NULL,
  "failedQueryCount" INTEGER NOT NULL,
  "queryStrategyVersion" INTEGER NOT NULL,
  "evidence" JSONB,
  CONSTRAINT "AffiliateCoverageCellAssessments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AffiliateCoverageCellAssessments_cellId_cycleKey_key" ON "AffiliateCoverageCellAssessments"("cellId", "cycleKey");
CREATE INDEX "AffiliateCoverageCellAssessments_cellId_createdAt_idx" ON "AffiliateCoverageCellAssessments"("cellId", "createdAt");
CREATE INDEX "AffiliateCoverageCellAssessments_decision_createdAt_idx" ON "AffiliateCoverageCellAssessments"("decision", "createdAt");

CREATE TABLE "AffiliateSourceDiscoveryQueryExecutions" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "runId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "queryKey" TEXT NOT NULL,
  "cityGeoid" TEXT,
  "targetCity" TEXT,
  "targetState" TEXT,
  "sportId" TEXT,
  "sportName" TEXT,
  "profileKey" TEXT NOT NULL,
  "strategyKey" TEXT NOT NULL,
  "strategyFamilyKey" TEXT NOT NULL,
  "queryText" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "returnedResultCount" INTEGER NOT NULL DEFAULT 0,
  "qualifiedDirectCount" INTEGER NOT NULL DEFAULT 0,
  "newQualifiedPolicyKeyCount" INTEGER NOT NULL DEFAULT 0,
  "intakeCreatedCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedCount" INTEGER NOT NULL DEFAULT 0,
  "qualifiedPolicyKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "newQualifiedPolicyKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "errorCode" TEXT,
  "metadata" JSONB,
  CONSTRAINT "AffiliateSourceDiscoveryQueryExecutions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AffiliateSourceDiscoveryQueryExecutions_runId_queryKey_key" ON "AffiliateSourceDiscoveryQueryExecutions"("runId", "queryKey");
CREATE INDEX "AffiliateSourceDiscoveryQueryExecutions_cityGeoid_sportId_profileKey_idx" ON "AffiliateSourceDiscoveryQueryExecutions"("cityGeoid", "sportId", "profileKey");
CREATE INDEX "AffiliateSourceDiscoveryQueryExecutions_runId_idx" ON "AffiliateSourceDiscoveryQueryExecutions"("runId");
CREATE INDEX "AffiliateSourceDiscoveryQueryExecutions_campaignId_idx" ON "AffiliateSourceDiscoveryQueryExecutions"("campaignId");
CREATE INDEX "AffiliateSourceDiscoveryQueryExecutions_strategyFamilyKey_idx" ON "AffiliateSourceDiscoveryQueryExecutions"("strategyFamilyKey");
