CREATE TYPE "AffiliateAgentGatewayJobStatus" AS ENUM (
  'QUEUED',
  'CLAIMED',
  'RETRY_WAIT',
  'COMPLETED',
  'PIPELINE_BLOCKED',
  'RECONCILIATION_REQUIRED'
);

CREATE TYPE "AffiliateAgentGatewayClaimStatus" AS ENUM (
  'ACTIVE',
  'COMPLETED',
  'FAILED',
  'EXPIRED',
  'REVOKED',
  'RECONCILIATION_REQUIRED'
);

CREATE TYPE "AffiliateAgentGatewayReceiptStatus" AS ENUM (
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'UNKNOWN'
);

CREATE TABLE "AffiliateAgentGatewayJobs" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "queue" TEXT NOT NULL,
  "lane" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "subjectJson" JSONB NOT NULL,
  "evidenceManifestJson" JSONB NOT NULL,
  "supplySourceId" TEXT,
  "expectedLifecycleGeneration" INTEGER,
  "status" "AffiliateAgentGatewayJobStatus" NOT NULL DEFAULT 'QUEUED',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimGeneration" INTEGER NOT NULL DEFAULT 0,
  "activeClaimId" TEXT,
  "parentClaimId" TEXT,
  "invocationFailureCount" INTEGER NOT NULL DEFAULT 0,
  "lastInvocationFailedAt" TIMESTAMP(3),
  "pipelineBlockedAt" TIMESTAMP(3),
  "terminalDisposition" TEXT,
  "resultHash" TEXT,
  "resultJson" JSONB,
  "terminalReceiptId" TEXT,
  "finishedAt" TIMESTAMP(3),
  "eventSequence" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "AffiliateAgentGatewayJobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AffiliateAgentGatewayJobs_lifecycle_generation_check"
    CHECK ("expectedLifecycleGeneration" IS NULL OR "expectedLifecycleGeneration" >= 0),
  CONSTRAINT "AffiliateAgentGatewayJobs_claim_generation_check"
    CHECK ("claimGeneration" >= 0),
  CONSTRAINT "AffiliateAgentGatewayJobs_invocation_failure_count_check"
    CHECK ("invocationFailureCount" BETWEEN 0 AND 3),
  CONSTRAINT "AffiliateAgentGatewayJobs_subject_json_check"
    CHECK (jsonb_typeof("subjectJson") = 'object'),
  CONSTRAINT "AffiliateAgentGatewayJobs_evidence_manifest_json_check"
    CHECK (jsonb_typeof("evidenceManifestJson") = 'object')
);

CREATE UNIQUE INDEX "AffiliateAgentGatewayJobs_dedupeKey_key"
  ON "AffiliateAgentGatewayJobs"("dedupeKey");
CREATE UNIQUE INDEX "AffiliateAgentGatewayJobs_activeClaimId_key"
  ON "AffiliateAgentGatewayJobs"("activeClaimId");
CREATE UNIQUE INDEX "AffiliateAgentGatewayJobs_terminalReceiptId_key"
  ON "AffiliateAgentGatewayJobs"("terminalReceiptId");
CREATE INDEX "AffiliateAgentGatewayJobs_role_lane_status_nextAttemptAt_priority_createdAt_idx"
  ON "AffiliateAgentGatewayJobs"("role", "lane", "status", "nextAttemptAt", "priority", "createdAt");
CREATE INDEX "AffiliateAgentGatewayJobs_queue_status_nextAttemptAt_idx"
  ON "AffiliateAgentGatewayJobs"("queue", "status", "nextAttemptAt");
CREATE INDEX "AffiliateAgentGatewayJobs_supplySourceId_status_idx"
  ON "AffiliateAgentGatewayJobs"("supplySourceId", "status");
CREATE INDEX "AffiliateAgentGatewayJobs_parentClaimId_idx"
  ON "AffiliateAgentGatewayJobs"("parentClaimId");

CREATE TABLE "AffiliateAgentGatewayClaims" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "jobId" TEXT NOT NULL,
  "parentClaimId" TEXT,
  "claimGeneration" INTEGER NOT NULL,
  "lifecycleGeneration" INTEGER,
  "queue" TEXT NOT NULL,
  "lane" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "invocationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "workspaceMode" TEXT NOT NULL,
  "workspaceAttestationHash" TEXT NOT NULL,
  "status" "AffiliateAgentGatewayClaimStatus" NOT NULL DEFAULT 'ACTIVE',
  "claimRequestId" TEXT NOT NULL,
  "claimRequestHash" TEXT NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL,
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL,
  "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
  "hardDeadlineAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "tokenNonce" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenKeyVersion" TEXT NOT NULL,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "tokenInvalidatedAt" TIMESTAMP(3),
  "deploymentContractVersion" INTEGER NOT NULL,
  "deploymentContractHash" TEXT NOT NULL,
  "roleContractVersion" INTEGER NOT NULL,
  "roleContractHash" TEXT NOT NULL,
  "promptTemplateVersion" INTEGER NOT NULL,
  "promptTemplateHash" TEXT NOT NULL,
  "supplyContractVersion" INTEGER NOT NULL,
  "supplyContractHash" TEXT NOT NULL,
  "claimEnvelopeHash" TEXT NOT NULL,
  "claimEnvelopeJson" JSONB NOT NULL,
  "evidenceManifestHash" TEXT NOT NULL,
  "permittedCommandHash" TEXT NOT NULL,
  "permittedCommands" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "schemaCorrectionCount" INTEGER NOT NULL DEFAULT 0,
  "terminalReceiptId" TEXT,
  "safeFailureCode" TEXT,
  "safeFailureSummary" TEXT,
  "diagnosticRetainUntil" TIMESTAMP(3),

  CONSTRAINT "AffiliateAgentGatewayClaims_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AffiliateAgentGatewayClaims_claim_generation_check"
    CHECK ("claimGeneration" > 0),
  CONSTRAINT "AffiliateAgentGatewayClaims_lifecycle_generation_check"
    CHECK ("lifecycleGeneration" IS NULL OR "lifecycleGeneration" >= 0),
  CONSTRAINT "AffiliateAgentGatewayClaims_schema_correction_count_check"
    CHECK ("schemaCorrectionCount" BETWEEN 0 AND 3),
  CONSTRAINT "AffiliateAgentGatewayClaims_lease_deadline_check"
    CHECK ("leaseExpiresAt" <= "hardDeadlineAt"),
  CONSTRAINT "AffiliateAgentGatewayClaims_token_deadline_check"
    CHECK ("tokenExpiresAt" = "hardDeadlineAt"),
  CONSTRAINT "AffiliateAgentGatewayClaims_reviewer_workspace_check"
    CHECK ("role" <> 'SUPPLY_REVIEWER' OR "workspaceMode" = 'READ_ONLY'),
  CONSTRAINT "AffiliateAgentGatewayClaims_terminal_state_check"
    CHECK (
      "status" NOT IN ('COMPLETED', 'FAILED', 'EXPIRED', 'REVOKED')
      OR ("endedAt" IS NOT NULL AND "tokenInvalidatedAt" IS NOT NULL)
    ),
  CONSTRAINT "AffiliateAgentGatewayClaims_envelope_json_check"
    CHECK (jsonb_typeof("claimEnvelopeJson") = 'object')
);

CREATE UNIQUE INDEX "AffiliateAgentGatewayClaims_invocationId_key"
  ON "AffiliateAgentGatewayClaims"("invocationId");
CREATE UNIQUE INDEX "AffiliateAgentGatewayClaims_workspaceId_key"
  ON "AffiliateAgentGatewayClaims"("workspaceId");
CREATE UNIQUE INDEX "AffiliateAgentGatewayClaims_claimRequestId_key"
  ON "AffiliateAgentGatewayClaims"("claimRequestId");
CREATE UNIQUE INDEX "AffiliateAgentGatewayClaims_tokenHash_key"
  ON "AffiliateAgentGatewayClaims"("tokenHash");
CREATE UNIQUE INDEX "AffiliateAgentGatewayClaims_terminalReceiptId_key"
  ON "AffiliateAgentGatewayClaims"("terminalReceiptId");
CREATE UNIQUE INDEX "AffiliateAgentGatewayClaims_jobId_claimGeneration_key"
  ON "AffiliateAgentGatewayClaims"("jobId", "claimGeneration");
CREATE UNIQUE INDEX "AffiliateAgentGatewayClaims_one_live_claim_per_job"
  ON "AffiliateAgentGatewayClaims"("jobId")
  WHERE "endedAt" IS NULL;
CREATE INDEX "AffiliateAgentGatewayClaims_jobId_status_claimedAt_idx"
  ON "AffiliateAgentGatewayClaims"("jobId", "status", "claimedAt");
CREATE INDEX "AffiliateAgentGatewayClaims_role_status_leaseExpiresAt_idx"
  ON "AffiliateAgentGatewayClaims"("role", "status", "leaseExpiresAt");
CREATE INDEX "AffiliateAgentGatewayClaims_hardDeadlineAt_status_idx"
  ON "AffiliateAgentGatewayClaims"("hardDeadlineAt", "status");
CREATE INDEX "AffiliateAgentGatewayClaims_parentClaimId_idx"
  ON "AffiliateAgentGatewayClaims"("parentClaimId");

CREATE TABLE "AffiliateAgentGatewayArtifacts" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimId" TEXT NOT NULL,
  "claimGeneration" INTEGER NOT NULL,
  "evidenceRef" TEXT NOT NULL,
  "evidenceKind" TEXT NOT NULL,
  "sourceArtifactId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "accessMode" TEXT NOT NULL DEFAULT 'READ_ONLY',
  "creatingClaimId" TEXT,
  "retentionClass" TEXT NOT NULL DEFAULT 'INDEFINITE',
  "retentionDeadline" TIMESTAMP(3),
  "isPinned" BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT "AffiliateAgentGatewayArtifacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AffiliateAgentGatewayArtifacts_claim_generation_check"
    CHECK ("claimGeneration" > 0),
  CONSTRAINT "AffiliateAgentGatewayArtifacts_byte_size_check"
    CHECK ("byteSize" >= 0),
  CONSTRAINT "AffiliateAgentGatewayArtifacts_access_mode_check"
    CHECK ("accessMode" = 'READ_ONLY')
);

CREATE UNIQUE INDEX "AffiliateAgentGatewayArtifacts_claimId_evidenceRef_key"
  ON "AffiliateAgentGatewayArtifacts"("claimId", "evidenceRef");
CREATE INDEX "AffiliateAgentGatewayArtifacts_claimId_evidenceKind_idx"
  ON "AffiliateAgentGatewayArtifacts"("claimId", "evidenceKind");
CREATE INDEX "AffiliateAgentGatewayArtifacts_sourceArtifactId_idx"
  ON "AffiliateAgentGatewayArtifacts"("sourceArtifactId");
CREATE INDEX "AffiliateAgentGatewayArtifacts_fileId_idx"
  ON "AffiliateAgentGatewayArtifacts"("fileId");
CREATE INDEX "AffiliateAgentGatewayArtifacts_contentHash_idx"
  ON "AffiliateAgentGatewayArtifacts"("contentHash");
CREATE INDEX "AffiliateAgentGatewayArtifacts_retentionClass_retentionDeadline_idx"
  ON "AffiliateAgentGatewayArtifacts"("retentionClass", "retentionDeadline");

CREATE TABLE "AffiliateAgentGatewayOperationReceipts" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "claimId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "claimGeneration" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "operationKind" TEXT NOT NULL,
  "commandName" TEXT,
  "requestHash" TEXT NOT NULL,
  "status" "AffiliateAgentGatewayReceiptStatus" NOT NULL DEFAULT 'PENDING',
  "responseHash" TEXT,
  "responseJson" JSONB,
  "safeErrorCode" TEXT,
  "externalOperationKey" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "reconcileAfter" TIMESTAMP(3),
  "retentionClass" TEXT NOT NULL DEFAULT 'INDEFINITE',
  "retentionDeadline" TIMESTAMP(3),

  CONSTRAINT "AffiliateAgentGatewayOperationReceipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AffiliateAgentGatewayOperationReceipts_claim_generation_check"
    CHECK ("claimGeneration" > 0),
  CONSTRAINT "AffiliateAgentGatewayOperationReceipts_response_json_check"
    CHECK ("responseJson" IS NULL OR jsonb_typeof("responseJson") = 'object')
);

CREATE UNIQUE INDEX "AffiliateAgentGatewayOperationReceipts_externalOperationKey_key"
  ON "AffiliateAgentGatewayOperationReceipts"("externalOperationKey");
CREATE UNIQUE INDEX "AffiliateAgentGatewayOperationReceipts_claimId_idempotencyKey_key"
  ON "AffiliateAgentGatewayOperationReceipts"("claimId", "idempotencyKey");
CREATE INDEX "AffiliateAgentGatewayOperationReceipts_jobId_createdAt_idx"
  ON "AffiliateAgentGatewayOperationReceipts"("jobId", "createdAt");
CREATE INDEX "AffiliateAgentGatewayOperationReceipts_claimId_operationKind_createdAt_idx"
  ON "AffiliateAgentGatewayOperationReceipts"("claimId", "operationKind", "createdAt");
CREATE INDEX "AffiliateAgentGatewayOperationReceipts_status_reconcileAfter_idx"
  ON "AffiliateAgentGatewayOperationReceipts"("status", "reconcileAfter");
CREATE INDEX "AffiliateAgentGatewayOperationReceipts_retentionClass_retentionDeadline_idx"
  ON "AffiliateAgentGatewayOperationReceipts"("retentionClass", "retentionDeadline");

CREATE TABLE "AffiliateAgentGatewayEvents" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "eventKey" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "claimId" TEXT,
  "receiptId" TEXT,
  "sequence" INTEGER NOT NULL,
  "eventType" TEXT NOT NULL,
  "actorKind" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "requestHash" TEXT,
  "inputHash" TEXT,
  "outputHash" TEXT,
  "reasonCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "payload" JSONB NOT NULL DEFAULT '{}',
  "retentionClass" TEXT NOT NULL DEFAULT 'INDEFINITE',
  "retentionDeadline" TIMESTAMP(3),

  CONSTRAINT "AffiliateAgentGatewayEvents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AffiliateAgentGatewayEvents_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "AffiliateAgentGatewayEvents_payload_check" CHECK (jsonb_typeof("payload") = 'object')
);

CREATE UNIQUE INDEX "AffiliateAgentGatewayEvents_eventKey_key"
  ON "AffiliateAgentGatewayEvents"("eventKey");
CREATE UNIQUE INDEX "AffiliateAgentGatewayEvents_jobId_sequence_key"
  ON "AffiliateAgentGatewayEvents"("jobId", "sequence");
CREATE INDEX "AffiliateAgentGatewayEvents_claimId_sequence_idx"
  ON "AffiliateAgentGatewayEvents"("claimId", "sequence");
CREATE INDEX "AffiliateAgentGatewayEvents_receiptId_idx"
  ON "AffiliateAgentGatewayEvents"("receiptId");
CREATE INDEX "AffiliateAgentGatewayEvents_eventType_createdAt_idx"
  ON "AffiliateAgentGatewayEvents"("eventType", "createdAt");
CREATE INDEX "AffiliateAgentGatewayEvents_retentionClass_retentionDeadline_idx"
  ON "AffiliateAgentGatewayEvents"("retentionClass", "retentionDeadline");

CREATE FUNCTION "reject_affiliate_agent_gateway_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Affiliate Agent Gateway events are immutable';
END;
$$;

CREATE TRIGGER "AffiliateAgentGatewayEvents_immutable"
BEFORE UPDATE OR DELETE ON "AffiliateAgentGatewayEvents"
FOR EACH ROW EXECUTE FUNCTION "reject_affiliate_agent_gateway_event_mutation"();

REVOKE ALL PRIVILEGES ON TABLE
  "AffiliateAgentGatewayJobs",
  "AffiliateAgentGatewayClaims",
  "AffiliateAgentGatewayArtifacts",
  "AffiliateAgentGatewayOperationReceipts",
  "AffiliateAgentGatewayEvents"
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bracketiq_affiliate_agent') THEN
    REVOKE ALL PRIVILEGES ON TABLE
      "AffiliateAgentGatewayJobs",
      "AffiliateAgentGatewayClaims",
      "AffiliateAgentGatewayArtifacts",
      "AffiliateAgentGatewayOperationReceipts",
      "AffiliateAgentGatewayEvents",
      "AffiliateCoverageAgentJobs",
      "AffiliateSourceMappingJobs",
      "AffiliateApprovalJobs",
      "AffiliateSourceIntakes",
      "AffiliateSourceIntakeArtifacts",
      "AffiliateImportSources",
      "AffiliateSourceMappings",
      "File"
    FROM bracketiq_affiliate_agent;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bracketiq_affiliate_gateway') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE
      "AffiliateAgentGatewayJobs",
      "AffiliateAgentGatewayClaims",
      "AffiliateAgentGatewayOperationReceipts"
    TO bracketiq_affiliate_gateway;

    GRANT SELECT, INSERT ON TABLE
      "AffiliateAgentGatewayArtifacts",
      "AffiliateAgentGatewayEvents"
    TO bracketiq_affiliate_gateway;
  END IF;
END;
$$;
