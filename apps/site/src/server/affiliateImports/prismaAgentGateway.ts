import { createHash } from "node:crypto";
import { createId } from "@/lib/id";
import { z } from "zod";
import type {
  AffiliateAgentGatewayClaims,
  AffiliateAgentGatewayJobs,
  AffiliateAgentGatewayOperationReceipts,
  PrismaClient,
} from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import {
  AFFILIATE_AGENT_HARD_DEADLINE_SECONDS,
  AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
  AFFILIATE_AGENT_LEASE_SECONDS,
  AFFILIATE_AGENT_MAX_SCHEMA_CORRECTIONS,
  AFFILIATE_AGENT_WORKSPACE_ATTESTATION_ADMISSION_MARGIN_SECONDS,
  AffiliateAgentGatewayError,
  affiliateAgentReviewerEffectRecoveryRequestSchema,
  type AffiliateAgentClaimGrant,
  type AffiliateAgentArtifactReadResult,
  type AffiliateAgentCommandResult,
  type AffiliateAgentClaimAuthorization,
  type AffiliateAgentClaimOperation,
  type AffiliateAgentClaimOperationResult,
  type AffiliateAgentClaimRequest,
  type AffiliateAgentGateway,
  type AffiliateAgentHeartbeatResult,
  type AffiliateAgentInvocationFailedResult,
  type AffiliateAgentInvocationFailureCode,
  type AffiliateAgentReconcileReport,
  type AffiliateAgentReconcileRequest,
  type AffiliateAgentReviewerEffectRecoveryCurrentState,
  type AffiliateAgentReviewerEffectRecoveryOperator,
  type AffiliateAgentReviewerEffectRecoveryOutcome,
  type AffiliateAgentReviewerEffectRecoveryReport,
  type AffiliateAgentReviewerEffectRecoveryRequest,
  type AffiliateAgentSchemaCorrectionResult,
  type AffiliateAgentSubmitResultOutcome,
  type AffiliateAgentTerminalAcceptedResult,
} from "./agentGateway";
import type {
  AffiliateAgentClaimAdmission,
  AffiliateAgentClaimAdmissionContext,
  AffiliateAgentBoundedAdmissionLease,
  AffiliateAgentBoundedAdmissionLeaseRequest,
  AffiliateAgentClaimTokenScope,
  AffiliateAgentGatewayDependencies,
  AffiliateAgentInvocationReconciler,
  AffiliateAgentInvocationReconciliationRequest,
  AffiliateAgentInvocationReconciliationResult,
  AffiliateAgentReviewerTerminalResult,
  AffiliateAgentReviewerTerminalDisposition,
  AffiliateAgentTerminalEffectAdapter,
  AffiliateAgentTerminalEffectAdapterInput,
  AffiliateAgentTerminalEffectHandler,
} from "./agentGatewayAdapters";
import {
  AffiliateAgentSportEvidenceError,
  verifyAffiliateAgentLegacySportRepair,
  verifyAffiliateAgentSourceExclusionAssessment,
} from "./agentGatewayAdapters";
import { terminalResultSchemaCorrectionIssues } from "./affiliateAgentTerminalValidation";
import {
  AffiliateSourceExclusionAdmissionError,
  assertAffiliateSourceExclusionClaimBinding,
  assertAffiliateSourceExclusionExecutionReady,
} from "./affiliateSourceExclusionAdmission";
import {
  AffiliateLegacyRepairAdmissionError,
  assertAffiliateLegacyRepairScopeClaimBinding,
} from "./affiliateLegacyRepairAdmission";
import {
  AFFILIATE_AGENT_CONTINUATION_PRODUCER_PREFIX,
  AFFILIATE_AGENT_CONTINUATION_REVIEWER_PREFIX,
  AFFILIATE_AGENT_SOURCE_EXCLUSION_REVIEWER_PREFIX,
  isAffiliateAgentSingleClaimJob,
  AFFILIATE_AGENT_PROMPT_TEMPLATE_VERSION,
  AFFILIATE_AGENT_ROLE_CONTRACT_VERSION,
  AFFILIATE_AGENT_PROMPT_TEMPLATES,
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  AFFILIATE_AGENT_ROLES,
  affiliateAgentClaimEnvelopeSchema,
  parseAffiliateAgentProducerClaimEnvelopeForHistoricalRead,
  affiliateAgentContractBundleSchema,
  affiliateAgentCommandSchema,
  affiliateAgentDeclarativePackageCommitOutputSchema,
  affiliateAgentDeclarativePackageValidationOutputSchema,
  affiliateAgentEvidenceManifestSchema,
  affiliateAgentListingKindSchema,
  affiliateAgentQueuedMappingProducerSubjectSchema,
  affiliateAgentSubjectSchema,
  affiliateAgentTerminalResultEnvelopeSchema,
  canonicalizeAffiliateAgentValue,
  parseAffiliateAgentCaptureMetadata,
  hashAffiliateAgentValue,
  type AffiliateAgentCaptureMetadata,
  renderAffiliateAgentPrompt,
  type AffiliateAgentProducerClaimEnvelopeForHistoricalRead,
  type AffiliateAgentClaimEnvelope,
  type AffiliateAgentCommand,
  type AffiliateAgentContractBundle,
  type AffiliateAgentRoleContract,
  type AffiliateAgentSubject,
  type AffiliateAgentQueuedMappingProducerSubject,
  type AffiliateAgentRole,
  type AffiliateAgentTerminalResultEnvelope,
} from "./agentGatewayContracts";
import type {
  AffiliateOperationalAlertInput,
  AffiliateOperationalAlertWriter,
} from "./affiliateOperationalAlerts";
import { reconcileExpiredClaims } from "./prismaAgentGatewayExpiry";
import {
  affiliateSupplyDatabase,
  emitAffiliateSupplyLifecycleTransitionAlerts,
  materializeAffiliateCoverageDiscoveryResult,
  readAffiliateSupplySourceAssessment,
  type AffiliateSupplySourceReadAssessment,
} from "./affiliateSupplyPersistence";
import {
  validateAffiliateSupplyCommand,
  type AffiliateSupplyAssessment,
  type AffiliateSupplyContractPolicy,
} from "./affiliateSupplyLifecycle";
import { loadAffiliateSportsCatalogSnapshot } from "./affiliateSportsCatalog";
import {
  AffiliateAgentClaimRaceError,
  recordInvocationFailureTransition,
} from "./prismaAgentGatewayFailureTransitions";
const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;
export type AffiliateAgentClaimAdmissionController =
  AffiliateAgentClaimAdmission & Readonly<{
    open(): Promise<void>;
    close(): Promise<void>;
    openBoundedLease(
      request: AffiliateAgentBoundedAdmissionLeaseRequest,
    ): Promise<AffiliateAgentBoundedAdmissionLease>;
  }>;

const MAX_BOUNDED_ADMISSION_JOB_ID_LENGTH = 200;
type ActiveBoundedAdmissionLease = Readonly<{
  role: AffiliateAgentBoundedAdmissionLeaseRequest["role"];
  workerId: string;
  jobId?: string;
  expiresAt: Date;
  remainingClaims: number;
}>;

const normalizedBoundedAdmissionJobId = (
  value: unknown,
): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error("The bounded admission lease is invalid.");
  }
  const jobId = value.trim();
  if (!jobId || jobId.length > MAX_BOUNDED_ADMISSION_JOB_ID_LENGTH) {
    throw new Error("The bounded admission lease is invalid.");
  }
  return jobId;
};

const normalizedBoundedAdmissionRequest = (
  request: AffiliateAgentBoundedAdmissionLeaseRequest,
): Readonly<{
  workerId: string;
  jobId?: string;
}> => {
  const workerId = request.workerId.trim();
  if (
    !workerId
    || !Number.isSafeInteger(request.leaseSeconds)
    || request.leaseSeconds < 1
    || request.leaseSeconds > 1_200
  ) {
    throw new Error("The bounded admission lease is invalid.");
  }
  const jobId = normalizedBoundedAdmissionJobId(request.jobId);
  return jobId === undefined ? { workerId } : { workerId, jobId };
};

const isClaimedAdmissionResult = (value: unknown): boolean => (
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && "kind" in value
  && value.kind === "CLAIMED"
);

const activeBoundedAdmissionLeaseResult = (
  lease: ActiveBoundedAdmissionLease,
  request: AffiliateAgentBoundedAdmissionLeaseRequest,
  workerId: string,
  jobId: string | undefined,
): AffiliateAgentBoundedAdmissionLease => {
  if (
    lease.role === request.role
    && lease.workerId === workerId
    && lease.jobId === jobId
  ) {
    return {
      role: lease.role,
      workerId: lease.workerId,
      ...(lease.jobId === undefined ? {} : { jobId: lease.jobId }),
      expiresAt: lease.expiresAt.toISOString(),
      remainingClaims: lease.remainingClaims,
    };
  }
  throw new Error("A bounded admission lease is already active.");
};

export const createAffiliateAgentClaimAdmission = (
  initiallyOpen = false,
): AffiliateAgentClaimAdmissionController => {
  let open = initiallyOpen;
  let boundedAdmissionLease: ActiveBoundedAdmissionLease | null = null;
  let queue: Promise<void> = Promise.resolve();
  const expireBoundedAdmissionLease = (): void => {
    if (
      boundedAdmissionLease !== null
      && boundedAdmissionLease.expiresAt.getTime() <= Date.now()
    ) {
      open = false;
      boundedAdmissionLease = null;
    }
  };
  const isAdmissionOpen = (): boolean => {
    expireBoundedAdmissionLease();
    return open && (
      boundedAdmissionLease === null
      || boundedAdmissionLease.remainingClaims > 0
    );
  };
  const isAdmissionOpenFor = (
    context: AffiliateAgentClaimAdmissionContext,
  ): boolean => {
    if (!isAdmissionOpen()) return false;
    if (boundedAdmissionLease === null) return true;
    return (
      context.role === boundedAdmissionLease.role
      && context.workerId === boundedAdmissionLease.workerId
      && context.jobId === boundedAdmissionLease.jobId
    );
  };
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation, operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  return {
    isOpen: isAdmissionOpen,
    isOpenFor: isAdmissionOpenFor,
    withClaim: (operation, context) => enqueue(async () => {
      expireBoundedAdmissionLease();
      const jobId = boundedAdmissionLease?.jobId;
      const result = await operation(jobId);
      if (
        boundedAdmissionLease !== null
        && context?.role === boundedAdmissionLease.role
        && context.workerId === boundedAdmissionLease.workerId
        && (context.jobId === undefined || context.jobId === jobId)
        && boundedAdmissionLease.jobId === jobId
        && isClaimedAdmissionResult(result)
      ) {
        boundedAdmissionLease = {
          ...boundedAdmissionLease,
          remainingClaims: 0,
        };
        open = false;
      }
      return result;
    }),
    open: () =>
      enqueue(async () => {
        boundedAdmissionLease = null;
        open = true;
      }),
    openBoundedLease: (request) =>
      enqueue(async () => {
        const normalized = normalizedBoundedAdmissionRequest(request);
        expireBoundedAdmissionLease();
        if (
          boundedAdmissionLease !== null
          && boundedAdmissionLease.remainingClaims > 0
        ) {
          return activeBoundedAdmissionLeaseResult(
            boundedAdmissionLease,
            request,
            normalized.workerId,
            normalized.jobId,
          );
        }
        if (open && boundedAdmissionLease === null) {
          throw new Error("The global admission must be closed before a bounded lease opens.");
        }
        const expiresAt = new Date(Date.now() + request.leaseSeconds * 1_000);
        boundedAdmissionLease = {
          role: request.role,
          workerId: normalized.workerId,
          ...(normalized.jobId === undefined ? {} : { jobId: normalized.jobId }),
          expiresAt,
          remainingClaims: 1,
        };
        open = true;
        return {
          role: request.role,
          workerId: normalized.workerId,
          ...(normalized.jobId === undefined ? {} : { jobId: normalized.jobId }),
          expiresAt: expiresAt.toISOString(),
          remainingClaims: 1,
        };
      }),
    close: () =>
      enqueue(async () => {
        boundedAdmissionLease = null;
        open = false;
      }),
  };
};

const gatewayError = (
  code: ConstructorParameters<typeof AffiliateAgentGatewayError>[0]["code"],
  safeMessage: string,
  isRetryable = false,
  receiptId?: string,
): AffiliateAgentGatewayError =>
  new AffiliateAgentGatewayError({
    code,
    safeMessage,
    isRetryable,
    receiptId,
  });
const assertReplayClaimRequestHash = (
  claim: ReplayableClaim,
  requestHash: string,
): void => {
  if (claim.claimRequestHash !== requestHash) {
    throw gatewayError(
      "IDEMPOTENCY_KEY_REUSED",
      "The claim idempotency key was used for different input.",
    );
  }
};

const assertReplayClaimSupplyContract = (
  envelope: AffiliateAgentClaimEnvelope,
  bundle: AffiliateAgentContractBundle,
): void => {
  if (
    envelope.supplyContractVersion !== bundle.supplyContract.version ||
    envelope.supplyContractHash !== bundle.supplyContract.hash
  ) {
    throw gatewayError(
      "SUPPLY_CONTRACT_STALE",
      "The active Supply Contract changed after the claim.",
    );
  }
};

const assertReplayClaimDeploymentContract = (
  envelope: AffiliateAgentClaimEnvelope,
  bundle: AffiliateAgentContractBundle,
  roleContract: AffiliateAgentRoleContract,
): void => {
  if (
    envelope.deploymentContractVersion !== bundle.deploymentContract.version ||
    envelope.deploymentContractHash !== bundle.deploymentContract.hash ||
    envelope.roleContractVersion !== roleContract.version ||
    envelope.roleContractHash !== roleContract.hash ||
    envelope.promptTemplateVersion !== roleContract.promptTemplateVersion ||
    envelope.promptTemplateHash !== roleContract.promptTemplateHash
  ) {
    throw gatewayError(
      "DEPLOYMENT_CONTRACT_STALE",
      "The active deployment, role, or prompt contract changed after the claim.",
    );
  }
};

const replayClaimGrant = (
  dependencies: AffiliateAgentGatewayDependencies,
  claim: ReplayableClaim,
  requestHash: string,
  bundle: AffiliateAgentContractBundle,
  roleContract: AffiliateAgentRoleContract,
): AffiliateAgentClaimGrant => {
  assertReplayClaimRequestHash(claim, requestHash);
  if (claim.tokenKeyVersion !== dependencies.tokens.keyVersion) {
    throw gatewayError(
      "TOKEN_INVALID",
      "The claim token key version is not available.",
    );
  }
  const envelope = affiliateAgentClaimEnvelopeSchema.parse(
    claim.claimEnvelopeJson,
  );
  assertReplayClaimSupplyContract(envelope, bundle);
  assertReplayClaimDeploymentContract(envelope, bundle, roleContract);
  return {
    envelope,
    prompt: renderAffiliateAgentPrompt(roleContract, envelope),
    token: dependencies.tokens.issue(
      tokenScopeForEnvelope(envelope),
      claim.tokenNonce,
    ),
    heartbeatIntervalSeconds: AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
    leaseExpiresAt: claim.leaseExpiresAt.toISOString(),
    hardDeadlineAt: claim.hardDeadlineAt.toISOString(),
  };
};

type InvocationFailureAlertContext = Readonly<{
  jobId: string;
  claimId: string;
  invocationId: string;
  workerId: string;
  lifecycleGeneration: number | null;
  claimGeneration: number;
  queue: string | null;
}>;

const invocationFailureAlertInput = (
  context: InvocationFailureAlertContext,
  result: AffiliateAgentInvocationFailedResult,
  failureCode: string | null,
  safeSummary: string | null,
): AffiliateOperationalAlertInput => ({
  eventKey: `affiliate-agent-invocation-failed:${result.receiptId}`,
  category: "AGENT_INVOCATION_FAILURE",
  severity: result.isPipelineBlocked ? "critical" : "warning",
  title: result.isPipelineBlocked
    ? "Affiliate agent pipeline blocked"
    : "Affiliate agent invocation failed",
  detail: safeSummary ?? failureCode ?? "No failure summary recorded",
  subjectType: "AGENT_JOB",
  subjectId: context.jobId,
  queue: context.queue,
  lifecycleGeneration: context.lifecycleGeneration,
  claimGeneration: context.claimGeneration,
  workerId: context.workerId,
  attempt: result.invocationFailureCount,
  previousState: "CLAIMED",
  nextState: result.isPipelineBlocked ? "PIPELINE_BLOCKED" : "RETRY_WAIT",
  reasonCodes: failureCode ? [failureCode] : ["AGENT_INVOCATION_FAILED"],
  evidenceRefs: [],
  payload: {
    claimId: context.claimId,
    invocationId: context.invocationId,
    nextAttemptAt: result.nextAttemptAt,
  },
});

const normalizeInvocationAlertValue = <T>(
  value: T | null | undefined,
): T | null => value ?? null;

const normalizeInvocationAlertList = (
  values: readonly string[] | undefined,
): string[] => (values ? [...values] : []);

const normalizeInvocationAlertPayload = (
  payload: Record<string, unknown> | undefined,
): Prisma.InputJsonValue => asPrismaJson(payload ?? {});

const invocationFailureAlertCreateData = (
  input: AffiliateOperationalAlertInput,
) => ({
  id: createId(),
  eventKey: input.eventKey,
  category: input.category,
  severity: input.severity,
  title: input.title,
  detail: input.detail,
  subjectType: normalizeInvocationAlertValue(input.subjectType),
  subjectId: normalizeInvocationAlertValue(input.subjectId),
  rolloutCohort: normalizeInvocationAlertValue(input.rolloutCohort),
  contractVersion: normalizeInvocationAlertValue(input.contractVersion),
  supplySourceId: normalizeInvocationAlertValue(input.supplySourceId),
  coverageCellId: normalizeInvocationAlertValue(input.coverageCellId),
  demandId: normalizeInvocationAlertValue(input.demandId),
  waveId: normalizeInvocationAlertValue(input.waveId),
  queue: normalizeInvocationAlertValue(input.queue),
  lifecycleGeneration: normalizeInvocationAlertValue(input.lifecycleGeneration),
  claimGeneration: normalizeInvocationAlertValue(input.claimGeneration),
  workerId: normalizeInvocationAlertValue(input.workerId),
  attempt: normalizeInvocationAlertValue(input.attempt),
  previousState: normalizeInvocationAlertValue(input.previousState),
  nextState: normalizeInvocationAlertValue(input.nextState),
  reasonCodes: normalizeInvocationAlertList(input.reasonCodes),
  evidenceRefs: normalizeInvocationAlertList(input.evidenceRefs),
  inputHash: normalizeInvocationAlertValue(input.inputHash),
  outputHash: normalizeInvocationAlertValue(input.outputHash),
  payload: normalizeInvocationAlertPayload(input.payload),
});

const persistInvocationFailureAlertIntent = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  context: InvocationFailureAlertContext,
  result: AffiliateAgentInvocationFailedResult,
  failureCode: string | null,
  safeSummary: string | null,
): Promise<void> => {
  if (
    !dependencies.operationalAlert ||
    !transaction.affiliateOperationalAlerts
  ) {
    return;
  }
  const input = invocationFailureAlertInput(
    context,
    result,
    failureCode,
    safeSummary,
  );
  const existing =
    await transaction.affiliateOperationalAlerts.findUnique({
      where: { eventKey: input.eventKey },
    });
  if (existing) return;
  try {
    await transaction.affiliateOperationalAlerts.create({
      data: invocationFailureAlertCreateData(input),
    });
  } catch (error) {
    const raced =
      await transaction.affiliateOperationalAlerts.findUnique({
        where: { eventKey: input.eventKey },
      });
    if (!raced) throw error;
  }
};

const invocationFailureAlertContextFor = (
  authorization: AffiliateAgentClaimAuthorization,
  queue: string | null,
): InvocationFailureAlertContext => ({
  jobId: authorization.jobId,
  claimId: authorization.claimId,
  invocationId: authorization.invocationId,
  workerId: authorization.workerId,
  lifecycleGeneration: authorization.lifecycleGeneration,
  claimGeneration: authorization.claimGeneration,
  queue,
});
const invocationFailureAlertContextForAuthorizedClaim = (
  authorized: AuthorizedClaim,
): InvocationFailureAlertContext => ({
  jobId: authorized.job.id,
  claimId: authorized.claim.id,
  invocationId: authorized.claim.invocationId,
  workerId: authorized.claim.workerId,
  lifecycleGeneration: authorized.claim.lifecycleGeneration,
  claimGeneration: authorized.claim.claimGeneration,
  queue: authorized.job.queue,
});



const deliverInvocationFailureAlert = async (
  dependencies: AffiliateAgentGatewayDependencies,
  authorization: AffiliateAgentClaimAuthorization,
  result: AffiliateAgentInvocationFailedResult,
  failureCode: string | null,
  safeSummary: string | null,
): Promise<void> => {
  if (!dependencies.operationalAlert) return;
  const job = await dependencies.prisma.affiliateAgentGatewayJobs.findUnique({
    where: { id: authorization.jobId },
    select: { queue: true },
  });
  await dependencies.operationalAlert(
    invocationFailureAlertInput(
      invocationFailureAlertContextFor(
        authorization,
        job?.queue ?? null,
      ),
      result,
      failureCode,
      safeSummary,
    ),
  );
};

const reportInvocationFailure = async (
  dependencies: AffiliateAgentGatewayDependencies,
  authorization: AffiliateAgentClaimAuthorization,
  result: AffiliateAgentInvocationFailedResult,
  failureCode: string | null,
  safeSummary: string | null,
): Promise<void> => {
  try {
    await deliverInvocationFailureAlert(
      dependencies,
      authorization,
      result,
      failureCode,
      safeSummary,
    );
  } catch (error) {
    assertDatabaseAuthorizationFailure(error);
    console.error(
      "[affiliate:gateway] failed to report invocation failure alert",
      error,
    );
  }
};
const prismaErrorCode = (error: unknown): string | null => {
  if (
    error === null ||
    typeof error !== "object" ||
    !("code" in error) ||
    typeof error.code !== "string"
  ) {
    return null;
  }
  return error.code;
};
const stringProperty = (
  value: unknown,
  property: string,
): string | null => {
  if (value === null || typeof value !== "object" || !(property in value)) {
    return null;
  }
  const propertyValue = (value as Record<string, unknown>)[property];
  return typeof propertyValue === "string" ? propertyValue : null;
};

const nestedPrismaErrorMetaValue = (value: object): unknown => {
  if ("driverAdapterError" in value) {
    return value.driverAdapterError;
  }
  if ("cause" in value) return value.cause;
  return null;
};

const prismaErrorMetaCodeFromValue = (value: unknown): string | null => {
  for (let depth = 0; depth < 3; depth += 1) {
    if (value === null || typeof value !== "object") return null;
    const code = stringProperty(value, "code")
      ?? stringProperty(value, "originalCode");
    if (code) return code;
    value = nestedPrismaErrorMetaValue(value);
    if (value === null) return null;
  }
  return null;
};

const prismaErrorMetaCode = (error: unknown): string | null => {
  if (error === null || typeof error !== "object" || !("meta" in error)) {
    return null;
  }
  return prismaErrorMetaCodeFromValue(error.meta);
};

const isSerializableTransactionConflict = (error: unknown): boolean => {
  if (prismaErrorCode(error) === "P2034") return true;
  if (prismaErrorCode(error) !== "P2010") return false;
  if (prismaErrorMetaCode(error) === "40001") return true;
  if (
    typeof error !== "object" ||
    error === null ||
    !("message" in error) ||
    typeof error.message !== "string"
  ) {
    return false;
  }
  return (
    error.message.includes("40001") ||
    error.message.toLowerCase().includes("write conflict") ||
    error.message.toLowerCase().includes("deadlock")
  );
};
const databaseAuthorizationCodes = new Set([
  "P1000",
  "P1010",
  "28P01",
  "42501",
  "28000",
]);

const prismaErrorCodesFromValue = (
  value: unknown,
  depth = 0,
): readonly string[] => {
  if (value === null || typeof value !== "object" || depth > 2) return [];
  const record = value as Record<string, unknown>;
  const codes: string[] = [];
  for (const property of ["code", "originalCode", "sqlState", "sqlstate"]) {
    const code = record[property];
    if (typeof code === "string") codes.push(code.toUpperCase());
  }
  for (const nested of [record.driverAdapterError, record.cause, record.meta]) {
    codes.push(...prismaErrorCodesFromValue(nested, depth + 1));
  }
  return codes;
};

const isDatabaseAuthorizationFailure = (error: unknown): boolean => (
  prismaErrorCodesFromValue(error).some((code) =>
    databaseAuthorizationCodes.has(code),
  )
);

const GATEWAY_DATABASE_AUTHORIZATION_FAILURE_MESSAGE =
  "Gateway admission is halted because gateway database authorization failed.";

const gatewayErrorForPersistenceFailure = (
  error: unknown,
  code: ConstructorParameters<typeof AffiliateAgentGatewayError>[0]["code"],
  safeMessage: string,
  isRetryable = false,
  receiptId?: string,
): AffiliateAgentGatewayError => isDatabaseAuthorizationFailure(error)
  ? gatewayError(
    "GATEWAY_ADMISSION_HALTED",
    GATEWAY_DATABASE_AUTHORIZATION_FAILURE_MESSAGE,
  )
  : gatewayError(code, safeMessage, isRetryable, receiptId);


const prismaUniqueTarget = (error: unknown): readonly string[] => {
  if (
    error === null ||
    typeof error !== "object" ||
    !("meta" in error) ||
    error.meta === null ||
    typeof error.meta !== "object" ||
    !("target" in error.meta)
  ) {
    return [];
  }
  const { target } = error.meta;
  if (typeof target === "string") return [target];
  return Array.isArray(target)
    ? target.filter((value): value is string => typeof value === "string")
    : [];
};

const isClaimJobRaceUniqueConflict = (error: unknown): boolean => {
  if (prismaErrorCode(error) !== "P2002") return false;
  const target = prismaUniqueTarget(error);
  return target.some(
    (value) =>
      value === "jobId" ||
      value.includes("jobId_claimGeneration") ||
      value.includes("one_live_claim_per_job"),
  );
};
const isOperationReceiptUniqueConflict = (error: unknown): boolean => {
  if (prismaErrorCode(error) !== "P2002") return false;
  const target = prismaUniqueTarget(error);
  const hasSeparateCompositeFields =
    target.length === 2 &&
    target.includes("claimId") &&
    target.includes("idempotencyKey");
  return (
    hasSeparateCompositeFields ||
    target.some(
      (value) =>
        value.includes("claimId_idempotencyKey") ||
        (value.includes("claimId") && value.includes("idempotencyKey")),
    )
  );
};

const asPrismaJson = (value: unknown): Prisma.InputJsonValue =>
  // The canonicalizer rejects every value outside Prisma's JSON input domain.
  JSON.parse(canonicalizeAffiliateAgentValue(value)) as Prisma.InputJsonValue;

const runSerializableEffectTransaction = async <T>(
  dependencies: AffiliateAgentGatewayDependencies,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  error: Readonly<{
    code: ConstructorParameters<typeof AffiliateAgentGatewayError>[0]["code"];
    safeMessage: string;
    receiptId?: string;
  }>,
): Promise<T> => {
  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await dependencies.prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (cause) {
      assertDatabaseAuthorizationFailure(cause);
      const retryableConflict =
        cause instanceof AffiliateAgentClaimRaceError ||
        isSerializableTransactionConflict(cause) ||
        isOperationReceiptUniqueConflict(cause);
      if (retryableConflict) {
        if (attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS) {
          continue;
        }
        throw gatewayError(
          error.code,
          error.safeMessage,
          true,
          error.receiptId,
        );
      }
      if (cause instanceof AffiliateAgentGatewayError) throw cause;
      throw gatewayErrorForPersistenceFailure(
        cause,
        error.code,
        error.safeMessage,
        true,
        error.receiptId,
      );
    }
  }
  throw gatewayError(error.code, error.safeMessage, true, error.receiptId);
};

const addSeconds = (date: Date, seconds: number): Date =>
  new Date(date.getTime() + seconds * 1_000);

const MAX_GATEWAY_INPUT_BYTES = 256 * 1024;
const MAX_GATEWAY_INPUT_DEPTH = 32;
const MAX_GATEWAY_INPUT_KEYS = 512;
const MAX_GATEWAY_INPUT_STRING_LENGTH = 4_096;

const gatewayInputStringSchema = z
  .string()
  .min(1)
  .max(MAX_GATEWAY_INPUT_STRING_LENGTH);
const gatewayIdentifierSchema = gatewayInputStringSchema.max(200);

const assertIdentifier = (value: string, name: string): void => {
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw gatewayError("ROLE_NOT_ALLOWED", `${name} is invalid.`);
  }
};

type BoundedGatewayInputNode = Readonly<{
  value: unknown;
  depth: number;
}>;

const inspectBoundedGatewayObject = (
  currentValue: object,
  depth: number,
  pending: BoundedGatewayInputNode[],
  seen: Set<object>,
): number => {
  if (depth >= MAX_GATEWAY_INPUT_DEPTH) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The gateway input is too deeply nested.",
    );
  }
  if (seen.has(currentValue)) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The gateway input contains a repeated object.",
    );
  }
  seen.add(currentValue);
  const keys = Object.keys(currentValue);
  if (keys.length > MAX_GATEWAY_INPUT_KEYS) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The gateway input contains too many fields.",
    );
  }
  let byteSize = 0;
  for (const [key, nestedValue] of Object.entries(currentValue)) {
    byteSize += Buffer.byteLength(key, "utf8") + 2;
    pending.push({ value: nestedValue, depth: depth + 1 });
  }
  return byteSize;
};

const inspectBoundedGatewayInputValue = (
  currentValue: unknown,
  depth: number,
  pending: BoundedGatewayInputNode[],
  seen: Set<object>,
): number => {
  if (currentValue === null) return 4;
  if (typeof currentValue === "string") {
    const byteSize = Buffer.byteLength(currentValue, "utf8");
    if (currentValue.length > MAX_GATEWAY_INPUT_STRING_LENGTH) {
      throw gatewayError(
        "COMMAND_NOT_PERMITTED",
        "The gateway input string exceeds the allowed limit.",
      );
    }
    return byteSize;
  }
  if (typeof currentValue === "number" || typeof currentValue === "boolean") {
    return 8;
  }
  if (typeof currentValue !== "object") {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The gateway input contains an unsupported value.",
    );
  }
  return inspectBoundedGatewayObject(currentValue, depth, pending, seen);
};

const assertBoundedGatewayInput = (value: unknown): void => {
  const pending: BoundedGatewayInputNode[] = [{ value, depth: 0 }];
  const seen = new Set<object>();
  let byteSize = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    byteSize += inspectBoundedGatewayInputValue(
      current.value,
      current.depth,
      pending,
      seen,
    );
    if (byteSize > MAX_GATEWAY_INPUT_BYTES) {
      throw gatewayError(
        "COMMAND_NOT_PERMITTED",
        "The gateway input exceeds the allowed size.",
      );
    }
  }
};

const rejectMalformedGatewayInput = (message: string): never => {
  throw gatewayError("INTERNAL_ERROR", message);
};

const rejectMalformedCommandInput = (): never => {
  throw gatewayError(
    "COMMAND_NOT_PERMITTED",
    "The command is not permitted by the active role contract.",
  );
};
const isGatewayRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const claimRequestInputSchema = z
  .object({
    idempotencyKey: gatewayIdentifierSchema,
    roleCredential: gatewayInputStringSchema,
    role: z.enum(AFFILIATE_AGENT_ROLES),
    workerId: gatewayIdentifierSchema,
    invocationId: gatewayIdentifierSchema,
    workspaceAttestation: z
      .object({
        schemaVersion: z.literal(1),
        workspaceId: gatewayIdentifierSchema,
        mode: z.enum(["READ_ONLY", "READ_WRITE"]),
        executionClass: z.literal("PRODUCTION_OMP"),
        workerId: gatewayIdentifierSchema,
        invocationId: gatewayIdentifierSchema,
        issuedAt: gatewayInputStringSchema,
        expiresAt: gatewayInputStringSchema,
        signature: gatewayInputStringSchema,
      })
      .strict(),
  })
  .strict();

const claimAuthorizationInputSchema = z
  .object({
    token: gatewayInputStringSchema,
    jobId: gatewayIdentifierSchema,
    claimId: gatewayIdentifierSchema,
    claimGeneration: z.number().int().positive(),
    lifecycleGeneration: z.number().int().nonnegative().nullable(),
    role: z.enum(AFFILIATE_AGENT_ROLES),
    workerId: gatewayIdentifierSchema,
    invocationId: gatewayIdentifierSchema,
    supplyContractHash: gatewayInputStringSchema.max(64),
  })
  .strict();
const MAX_INVOCATION_FAILURE_SUMMARY_CHARACTERS = 2_000;

const invocationFailureInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    jobId: gatewayIdentifierSchema,
    claimId: gatewayIdentifierSchema,
    claimGeneration: z.number().int().positive(),
    lifecycleGeneration: z.number().int().nonnegative().nullable(),
    role: z.enum(AFFILIATE_AGENT_ROLES),
    workerId: gatewayIdentifierSchema,
    invocationId: gatewayIdentifierSchema,
    supplyContractHash: gatewayInputStringSchema.max(64),
    code: z.enum([
      "MALFORMED_OUTPUT",
      "STALE_GENERATION",
      "PROCESS_CRASH",
      "TIMEOUT",
      "TERMINAL_SUBMISSION_FAILURE",
      "SCHEMA_CORRECTIONS_EXHAUSTED",
    ]),
    occurredAt: gatewayInputStringSchema,
    evidenceRefs: z.array(gatewayIdentifierSchema).max(100),
    safeSummary: gatewayInputStringSchema.max(MAX_INVOCATION_FAILURE_SUMMARY_CHARACTERS),
  })
  .strict();

const claimOperationInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("HEARTBEAT"),
      idempotencyKey: gatewayIdentifierSchema,
      authorization: claimAuthorizationInputSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("READ_ARTIFACT"),
      idempotencyKey: gatewayIdentifierSchema,
      authorization: claimAuthorizationInputSchema,
      evidenceRef: gatewayIdentifierSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("EXECUTE_COMMAND"),
      idempotencyKey: gatewayIdentifierSchema,
      authorization: claimAuthorizationInputSchema,
      command: z.unknown(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("SUBMIT_RESULT"),
      idempotencyKey: gatewayIdentifierSchema,
      authorization: claimAuthorizationInputSchema,
      result: z.unknown(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("RECORD_FAILURE"),
      idempotencyKey: gatewayIdentifierSchema,
      authorization: claimAuthorizationInputSchema,
      failure: invocationFailureInputSchema,
    })
    .strict(),
]);

const assertClaimRequestSemanticHints = (
  value: Record<string, unknown>,
): void => {
  if (
    "role" in value &&
    typeof value.role === "string" &&
    !AFFILIATE_AGENT_ROLES.some((role) => role === value.role)
  ) {
    throw gatewayError("ROLE_NOT_ALLOWED", "The claim role is not allowed.");
  }
  const attestation = value.workspaceAttestation;
  if (
    isGatewayRecord(attestation) &&
    "executionClass" in attestation &&
    attestation.executionClass !== "PRODUCTION_OMP"
  ) {
    throw gatewayError(
      "ROLE_NOT_ALLOWED",
      "Only PRODUCTION_OMP claims may claim production Affiliate Agent work.",
    );
  }
};

function assertClaimRequestInput(
  value: unknown,
): asserts value is AffiliateAgentClaimRequest {
  assertBoundedGatewayInput(value);
  const parsed = claimRequestInputSchema.safeParse(value);
  if (parsed.success) return;
  if (isGatewayRecord(value)) assertClaimRequestSemanticHints(value);
  rejectMalformedGatewayInput("The claim request is invalid.");
}

function assertClaimOperationInput(
  value: unknown,
): asserts value is AffiliateAgentClaimOperation {
  assertBoundedGatewayInput(value);
  const parsed = claimOperationInputSchema.safeParse(value);
  const rawRecord = isGatewayRecord(value) ? value : null;
  if (!parsed.success) {
    if (
      rawRecord?.kind === "EXECUTE_COMMAND" &&
      !affiliateAgentCommandSchema.safeParse(rawRecord.command).success
    ) {
      rejectMalformedCommandInput();
    }
    rejectMalformedGatewayInput("The claim operation is invalid.");
    return;
  }
  if (
    parsed.data.kind === "EXECUTE_COMMAND" &&
    "command" in parsed.data &&
    !affiliateAgentCommandSchema.safeParse(parsed.data.command).success
  ) {
    rejectMalformedCommandInput();
  }
}

function assertInvocationReconciliationInput(
  value: unknown,
): asserts value is AffiliateAgentInvocationReconciliationRequest {
  assertBoundedGatewayInput(value);
  const parsed = claimOperationInputSchema.safeParse(value);
  if (!parsed.success || parsed.data.kind !== "RECORD_FAILURE") {
    rejectMalformedGatewayInput(
      "The invocation reconciliation request is invalid.",
    );
  }
}

const parseSupportedContractBundle = (
  value: unknown,
): AffiliateAgentContractBundle => {
  const parsed = affiliateAgentContractBundleSchema.safeParse(value);
  if (!parsed.success) {
    throw gatewayError(
      "DEPLOYMENT_CONTRACT_STALE",
      "The active Affiliate Agent contract bundle is invalid.",
    );
  }
  const bundle = parsed.data;
  const isSupported =
    bundle.deploymentContract.gatewayVersion === 1 &&
    bundle.roleContracts.every(
      (contract) => contract.version === AFFILIATE_AGENT_ROLE_CONTRACT_VERSION,
    ) &&
    bundle.promptTemplates.every(
      (template) => template.version === AFFILIATE_AGENT_PROMPT_TEMPLATE_VERSION,
    );
  if (!isSupported) {
    throw gatewayError(
      "DEPLOYMENT_CONTRACT_STALE",
      "The active Affiliate Agent contract bundle version is not supported.",
    );
  }
  return bundle;
};

const activeRoleContract = (
  bundle: AffiliateAgentContractBundle,
  role: AffiliateAgentClaimRequest["role"],
): AffiliateAgentRoleContract => {
  const contract = bundle.roleContracts.find(
    (candidate) => candidate.role === role,
  );
  const prompt = bundle.promptTemplates.find(
    (candidate) => candidate.role === role,
  );
  const registeredRole = AFFILIATE_AGENT_ROLE_CONTRACTS[role];
  const registeredPrompt = AFFILIATE_AGENT_PROMPT_TEMPLATES[role];
  if (
    !contract ||
    !prompt ||
    contract.hash !== registeredRole.hash ||
    contract.version !== registeredRole.version ||
    prompt.hash !== registeredPrompt.hash ||
    prompt.version !== registeredPrompt.version
  ) {
    throw gatewayError(
      "DEPLOYMENT_CONTRACT_STALE",
      "The active Affiliate Agent role or prompt contract is not supported.",
    );
  }
  return contract;
};

const claimRequestHash = (input: AffiliateAgentClaimRequest): string =>
  hashAffiliateAgentValue({
    idempotencyKey: input.idempotencyKey,
    roleCredential: input.roleCredential,
    role: input.role,
    workerId: input.workerId,
    invocationId: input.invocationId,
    workspaceAttestation: input.workspaceAttestation,
  });

const tokenScopeForEnvelope = (
  envelope: AffiliateAgentClaimEnvelope,
): AffiliateAgentClaimTokenScope => ({
  claimId: envelope.claimId,
  jobId: envelope.jobId,
  claimGeneration: envelope.claimGeneration,
  lifecycleGeneration: envelope.lifecycleGeneration,
  role: envelope.role,
  workerId: envelope.workerId,
  invocationId: envelope.invocationId,
  tokenExpiresAt: envelope.expiresAt,
  evidenceManifestHash: envelope.evidenceManifest.hash,
  permittedCommandHash: hashAffiliateAgentValue(envelope.permittedCommands),
  supplyContractHash: envelope.supplyContractHash,
});

type ReplayableClaim = Readonly<{
  claimRequestHash: string;
  claimEnvelopeJson: unknown;
  tokenNonce: string;
  tokenKeyVersion: string;
  leaseExpiresAt: Date;
  hardDeadlineAt: Date;
}>;


const assertClaimAttestationIdentity = (
  input: AffiliateAgentClaimRequest,
): void => {
  const { workspaceAttestation: attestation } = input;
  if (
    attestation.schemaVersion !== 1 ||
    attestation.workerId !== input.workerId ||
    attestation.invocationId !== input.invocationId
  ) {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "The workspace attestation does not match the claim request.",
    );
  }
  if (attestation.executionClass !== "PRODUCTION_OMP") {
    throw gatewayError(
      "ROLE_NOT_ALLOWED",
      "Only PRODUCTION_OMP claims may claim production Affiliate Agent work.",
    );
  }
};

const assertClaimWorkspaceAt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  attestation: AffiliateAgentClaimRequest["workspaceAttestation"],
  now: Date,
): Promise<{ issuedAt: Date; expiresAt: Date }> => {
  const issuedAt = new Date(attestation.issuedAt);
  const expiresAt = new Date(attestation.expiresAt);
  if (
    Number.isNaN(issuedAt.getTime()) ||
    Number.isNaN(expiresAt.getTime()) ||
    issuedAt > addSeconds(
      now,
      AFFILIATE_AGENT_WORKSPACE_ATTESTATION_ADMISSION_MARGIN_SECONDS,
    ) ||
    expiresAt <= now ||
    !(await dependencies.workspaces.verify(attestation))
  ) {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "The workspace attestation is invalid or expired.",
    );
  }
  return { issuedAt, expiresAt };
};

const assertClaimCredential = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: AffiliateAgentClaimRequest,
): Promise<void> => {
  const isCredentialValid = await dependencies.credentials.verify({
    roleCredential: input.roleCredential,
    role: input.role,
    executionClass: input.workspaceAttestation.executionClass,
    workerId: input.workerId,
    invocationId: input.invocationId,
  });
  if (!isCredentialValid) {
    throw gatewayError(
      "ROLE_CREDENTIAL_INVALID",
      "The role credential is invalid for this claim request.",
    );
  }
};

const assertClaimAdmissionWindow = (
  now: Date,
  issuedAt: Date,
  expiresAt: Date,
): void => {
  if (
    issuedAt > addSeconds(
      now,
      AFFILIATE_AGENT_WORKSPACE_ATTESTATION_ADMISSION_MARGIN_SECONDS,
    ) ||
    expiresAt <= now
  ) {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "The workspace attestation is invalid or expired.",
    );
  }
};

const assertClaimRoleRequirements = (
  dependencies: AffiliateAgentGatewayDependencies,
  input: AffiliateAgentClaimRequest,
): void => {
  if (
    input.role === "SUPPLY_REVIEWER" &&
    input.workspaceAttestation.mode !== "READ_ONLY"
  ) {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "Supply Reviewer work requires a read-only workspace.",
    );
  }
  if (input.role === "SUPPLY_REVIEWER" && !dependencies.terminalEffects) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "Supply Reviewer work requires a terminal effect adapter.",
    );
  }
};

const validateClaimRequest = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: AffiliateAgentClaimRequest,
  now: Date,
): Promise<void> => {
  assertIdentifier(input.idempotencyKey, "Claim idempotency key");
  assertIdentifier(input.workerId, "Worker ID");
  assertIdentifier(input.invocationId, "Invocation ID");
  assertIdentifier(input.workspaceAttestation.workspaceId, "Workspace ID");
  assertClaimAttestationIdentity(input);
  const { issuedAt, expiresAt } = await assertClaimWorkspaceAt(
    dependencies,
    input.workspaceAttestation,
    now,
  );
  await assertClaimCredential(dependencies, input);
  const admissionNow = dependencies.clock.now();
  assertClaimAdmissionWindow(admissionNow, issuedAt, expiresAt);
  assertClaimRoleRequirements(dependencies, input);
};
export const validateAffiliateAgentClaimForAdmission = async (
  dependencies: AffiliateAgentGatewayDependencies,
  value: unknown,
): Promise<AffiliateAgentClaimRequest> => {
  assertClaimRequestInput(value);
  await validateClaimRequest(dependencies, value, dependencies.clock.now());
  const bundle = parseSupportedContractBundle(
    await dependencies.contracts.loadActiveBundle(),
  );
  activeRoleContract(bundle, value.role);
  return value;
};
type ParsedQueuedSubject =
  | AffiliateAgentSubject
  | AffiliateAgentQueuedMappingProducerSubject;

const subjectPrimaryId = (subject: ParsedQueuedSubject): string => {
  switch (subject.type) {
    case "COVERAGE_PLANNER":
      return subject.coverageCellId;
    case "MAPPING_PRODUCER":
      return subject.mappingJobId;
    case "SUPPLY_REVIEWER":
    case "SOURCE_EXCLUSION_REVIEW":
      return subject.supplySourceId;
    case "HUMAN_DIRECTED_EXECUTOR":
      return subject.caseId;
  }
};

const parseQueuedSubject = (
  job: AffiliateAgentGatewayJobs,
  role: AffiliateAgentClaimRequest["role"],
): ParsedQueuedSubject => {
  if (
    role === "MAPPING_PRODUCER"
    && isGatewayRecord(job.subjectJson)
    && job.subjectJson.type === "MAPPING_PRODUCER"
    && job.subjectJson.listingKind !== undefined
    && !affiliateAgentListingKindSchema.safeParse(job.subjectJson.listingKind).success
  ) {
    throw gatewayError(
      "COMMAND_SCHEMA_INVALID",
      SOURCE_KIND_MISMATCH_SAFE_MESSAGE,
    );
  }
  const current = affiliateAgentSubjectSchema.safeParse(job.subjectJson);
  const parsed = current.success
    ? current
    : role === "MAPPING_PRODUCER"
      ? affiliateAgentQueuedMappingProducerSubjectSchema.safeParse(
          job.subjectJson,
        )
      : current;
  const roleSubjectMatches = parsed.success && (
    parsed.data.type === role
    || (
      role === "SUPPLY_REVIEWER"
      && parsed.data.type === "SOURCE_EXCLUSION_REVIEW"
    )
  );
  if (
    !parsed.success ||
    !roleSubjectMatches ||
    job.role !== role ||
    job.subjectType !== parsed.data.type ||
    job.subjectId !== subjectPrimaryId(parsed.data)
  ) {
    throw gatewayError(
      "DEPLOYMENT_CONTRACT_STALE",
      "The queued agent subject does not match its durable identity.",
    );
  }
  return parsed.data;
};


const SOURCE_KIND_MISMATCH_SAFE_MESSAGE =
  "The declarative package listing kind does not match the source target kind.";

const assertMappingProducerSourceKind = async (
  transaction: Prisma.TransactionClient,
  subject: ParsedQueuedSubject,
): Promise<AffiliateAgentSubject> => {
  if (subject.type !== "MAPPING_PRODUCER") return subject;
  const source = await transaction.affiliateSupplySources.findUnique({
    where: { id: subject.supplySourceId },
    select: { targetKind: true },
  });
  const sourceKind = typeof source?.targetKind === "string"
    ? source.targetKind.trim().toUpperCase()
    : null;
  const parsedSourceKind = affiliateAgentListingKindSchema.safeParse(sourceKind);
  if (
    !parsedSourceKind.success
    || (
      subject.listingKind !== undefined
      && parsedSourceKind.data !== subject.listingKind
    )
  ) {
    throw gatewayError(
      "COMMAND_SCHEMA_INVALID",
      SOURCE_KIND_MISMATCH_SAFE_MESSAGE,
    );
  }
  return {
    ...subject,
    listingKind: parsedSourceKind.data,
  };
};

type ClaimTransactionResult =
  | Readonly<{ kind: "REPLAY"; claim: AffiliateAgentGatewayClaims }>
  | Readonly<{ kind: "CLOSED" }>
  | Readonly<{ kind: "NO_WORK" }>
  | Readonly<{
      kind: "CLAIMED";
      claim: AffiliateAgentGatewayClaims;
      envelope: AffiliateAgentClaimEnvelope;
    }>;

type ClaimAdmissionTiming = Readonly<{
  now: Date;
  hardDeadlineAt: Date;
  leaseExpiresAt: Date;
}>;

const findClaimReplayOrClosed = async (
  transaction: Prisma.TransactionClient,
  idempotencyKey: string,
  admissionOpen: boolean,
  admissionJobId?: string,
): Promise<ClaimTransactionResult | null> => {
  const replay = await transaction.affiliateAgentGatewayClaims.findUnique({
    where: { claimRequestId: idempotencyKey },
  });
  if (replay) {
    if (admissionJobId !== undefined && replay.jobId !== admissionJobId) {
      return { kind: "CLOSED" };
    }
    return { kind: "REPLAY", claim: replay };
  }
  if (!admissionOpen) return { kind: "CLOSED" };
  return null;
};

const assertClaimAdmissionTiming = (
  attestationExpiresAt: Date,
  now: Date,
): ClaimAdmissionTiming => {
  if (attestationExpiresAt <= now) {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "The workspace attestation expired before claim admission.",
    );
  }
  const hardDeadlineAt = addSeconds(now, AFFILIATE_AGENT_HARD_DEADLINE_SECONDS);
  if (attestationExpiresAt < hardDeadlineAt) {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "The workspace attestation must cover the full invocation deadline.",
    );
  }
  const leaseExpiresAt = new Date(
    Math.min(
      addSeconds(now, AFFILIATE_AGENT_LEASE_SECONDS).getTime(),
      hardDeadlineAt.getTime(),
    ),
  );
  return { now, hardDeadlineAt, leaseExpiresAt };
};

const assertClaimIdentityAvailable = async (
  transaction: Prisma.TransactionClient,
  input: AffiliateAgentClaimRequest,
): Promise<void> => {
  const reusedIdentity =
    await transaction.affiliateAgentGatewayClaims.findFirst({
      where: {
        OR: [
          { invocationId: input.invocationId },
          { workspaceId: input.workspaceAttestation.workspaceId },
        ],
      },
    });
  if (reusedIdentity?.invocationId === input.invocationId) {
    throw gatewayError(
      "INVOCATION_MISMATCH",
      "The invocation identity was already used by another claim request.",
    );
  }
  if (reusedIdentity?.workspaceId === input.workspaceAttestation.workspaceId) {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "The workspace identity was already used by another claim request.",
    );
  }
};
const assertWorkerHasNoLiveClaim = async (
  transaction: Prisma.TransactionClient,
  workerId: string,
  now: Date,
): Promise<void> => {
  const liveClaim = await transaction.affiliateAgentGatewayClaims.findFirst({
    where: {
      workerId,
      status: "ACTIVE",
      leaseExpiresAt: { gt: now },
    },
    select: { id: true },
  });
  if (liveClaim !== null) {
    throw gatewayError(
      "DUPLICATE_LIVE_CLAIM",
      "The worker already owns an unexpired active claim.",
      true,
    );
  }
};

const findHaltedClaimLanes = async (
  transaction: Prisma.TransactionClient,
): Promise<readonly string[]> => {
  const globalHalt =
    await transaction.affiliateAgentGatewayOperationReceipts.findFirst({
      where: {
        status: "UNKNOWN",
        safeErrorCode: "GATEWAY_ADMISSION_HALTED",
      },
    });
  if (globalHalt) {
    throw gatewayError(
      "GATEWAY_ADMISSION_HALTED",
      "Gateway admission is halted until an impossible receipt state is resolved.",
    );
  }
  const impossibleClaim =
    await transaction.affiliateAgentGatewayClaims.findFirst({
      where: { safeFailureCode: "GATEWAY_ADMISSION_HALTED" },
      select: { id: true },
    });
  if (impossibleClaim) {
    throw gatewayError(
      "GATEWAY_ADMISSION_HALTED",
      "Gateway admission is halted until an impossible claim state is resolved.",
    );
  }
  const haltedJobs =
    await transaction.affiliateAgentGatewayJobs.findMany({
      where: { status: "RECONCILIATION_REQUIRED" },
      select: { lane: true },
    });
  return [...new Set(haltedJobs.map(({ lane }) => lane))];
};

const claimQueueForRole: Readonly<Record<AffiliateAgentClaimRequest["role"], string>> = {
  COVERAGE_PLANNER: "AFFILIATE_COVERAGE",
  MAPPING_PRODUCER: "AFFILIATE_MAPPING",
  SUPPLY_REVIEWER: "AFFILIATE_REVIEW",
  HUMAN_DIRECTED_EXECUTOR: "AFFILIATE_HUMAN_DIRECTED",
};

const findClaimableJob = async (
  transaction: Prisma.TransactionClient,
  input: AffiliateAgentClaimRequest,
  now: Date,
  haltedLanes: readonly string[],
  admissionJobId?: string,
): Promise<AffiliateAgentGatewayJobs | null> =>
  transaction.affiliateAgentGatewayJobs.findFirst({
    where: {
      role: input.role,
      queue: claimQueueForRole[input.role],
      status: { in: ["QUEUED", "RETRY_WAIT"] },
      activeClaimId: null,
      nextAttemptAt: { lte: now },
      lane:
        haltedLanes.length === 0 ? undefined : { notIn: [...haltedLanes] },
      ...(admissionJobId === undefined
        ? {
          NOT: [
            { dedupeKey: { startsWith: AFFILIATE_AGENT_CONTINUATION_PRODUCER_PREFIX } },
            { dedupeKey: { startsWith: AFFILIATE_AGENT_CONTINUATION_REVIEWER_PREFIX } },
            { dedupeKey: { startsWith: AFFILIATE_AGENT_SOURCE_EXCLUSION_REVIEWER_PREFIX } },
          ],
        }
        : { id: admissionJobId }),
    },
    orderBy: [
      { priority: "desc" },
      { createdAt: "asc" },
      { id: "asc" },
    ],
  });

const parseClaimEvidenceManifest = (
  job: AffiliateAgentGatewayJobs,
  role: AffiliateAgentClaimRequest["role"],
) => {
  const result = affiliateAgentEvidenceManifestSchema.safeParse(
    job.evidenceManifestJson,
  );
  if (!result.success) {
    throw gatewayError(
      role === "SUPPLY_REVIEWER"
        ? "REVIEW_WORKSPACE_INVALID"
        : "DEPLOYMENT_CONTRACT_STALE",
      "The claim evidence manifest is invalid.",
    );
  }
  return result.data;
};
const parseClaimEnvelope = (
  claim: AffiliateAgentGatewayClaims | null,
): AffiliateAgentClaimEnvelope | null => {
  if (!claim) return null;
  const result = affiliateAgentClaimEnvelopeSchema.safeParse(
    claim.claimEnvelopeJson,
  );
  return result.success ? result.data : null;
};

const parseProducerClaimEnvelope = (
  claim: AffiliateAgentGatewayClaims | null,
): AffiliateAgentProducerClaimEnvelopeForHistoricalRead | null => {
  if (!claim) return null;
  return parseAffiliateAgentProducerClaimEnvelopeForHistoricalRead(
    claim.claimEnvelopeJson,
  );
};

const parseClaimTerminalResult = (
  job: AffiliateAgentGatewayJobs | null,
): AffiliateAgentTerminalResultEnvelope | null => {
  if (!job) return null;
  const result = affiliateAgentTerminalResultEnvelopeSchema.safeParse(
    job.resultJson,
  );
  return result.success ? result.data : null;
};

type ProducerReviewContext = Readonly<{
  producerClaim: AffiliateAgentGatewayClaims | null;
  producerJob: AffiliateAgentGatewayJobs | null;
  producerEnvelope: AffiliateAgentProducerClaimEnvelopeForHistoricalRead | null;
  producerResult: AffiliateAgentTerminalResultEnvelope | null;
}>;

const loadProducerReviewContext = async (
  transaction: Prisma.TransactionClient,
  producerClaimId: string,
): Promise<ProducerReviewContext> => {
  const producerClaim =
    await transaction.affiliateAgentGatewayClaims.findUnique({
      where: { id: producerClaimId },
    });
  const producerJob = producerClaim
    ? await transaction.affiliateAgentGatewayJobs.findUnique({
        where: { id: producerClaim.jobId },
      })
    : null;
  return {
    producerClaim,
    producerJob,
    producerEnvelope: parseProducerClaimEnvelope(producerClaim),
    producerResult: parseClaimTerminalResult(producerJob),
  };
};

const producerPackageHash = (
  result: AffiliateAgentTerminalResultEnvelope | null,
): string | null => {
  if (
    result?.role === "MAPPING_PRODUCER" &&
    (result.disposition === "PACKAGE_COMMITTED" ||
      result.disposition === "BOUNDED_REPAIR_SUBMITTED")
  ) {
    return result.payload.packageHash;
  }
  return null;
};

const isProducerResultIdentityMatch = (
  result: AffiliateAgentTerminalResultEnvelope | null,
  producerClaim: AffiliateAgentGatewayClaims | null,
  producerJob: AffiliateAgentGatewayJobs | null,
): boolean => {
  if (!result) return false;
  return (
    result.jobId === producerJob?.id &&
    result.claimId === producerClaim?.id &&
    result.claimGeneration === producerClaim?.claimGeneration &&
    result.role === "MAPPING_PRODUCER"
  );
};

const isProducerClaimStateValid = (
  producerClaim: AffiliateAgentGatewayClaims | null,
  producerJob: AffiliateAgentGatewayJobs | null,
): boolean =>
  [
    producerClaim?.status === "COMPLETED",
    producerClaim?.role === "MAPPING_PRODUCER",
    producerClaim?.terminalReceiptId !== null,
    producerJob?.status === "COMPLETED",
    producerJob?.activeClaimId === null,
    producerJob?.terminalReceiptId === producerClaim?.terminalReceiptId,
  ].every(Boolean);

const isProducerClaimValid = (
  context: ProducerReviewContext,
  subject: Extract<AffiliateAgentSubject, { type: "SUPPLY_REVIEWER" }>,
  job: AffiliateAgentGatewayJobs,
): boolean => {
  const {
    producerClaim,
    producerJob,
    producerEnvelope,
    producerResult,
  } = context;
  const producerSubject =
    producerEnvelope?.subject.type === "MAPPING_PRODUCER"
      ? producerEnvelope.subject
      : null;
  return [
    isProducerClaimStateValid(producerClaim, producerJob),
    producerEnvelope !== null,
    producerResult !== null,
    producerEnvelope !== null &&
      hashAffiliateAgentValue(producerEnvelope) === producerClaim?.claimEnvelopeHash,
    producerSubject?.supplySourceId === subject.supplySourceId,
    hashAffiliateAgentValue(producerSubject?.repairContext ?? null)
      === hashAffiliateAgentValue(subject.repairContext ?? null),
    job.parentClaimId === subject.producerClaimId,
    producerClaim?.workerId === subject.producerWorkerId,
    producerClaim?.invocationId === subject.producerInvocationId,
    producerClaim?.workspaceId === subject.producerWorkspaceId,
    isProducerResultIdentityMatch(producerResult, producerClaim, producerJob),
    producerPackageHash(producerResult) === subject.committedPackageHash,
  ].every(Boolean);
};
type SourceExclusionReviewerSubject = Extract<
  AffiliateAgentSubject,
  { type: "SOURCE_EXCLUSION_REVIEW" }
>;

const isSourceExclusionProducerClaimValid = (
  context: ProducerReviewContext,
  subject: SourceExclusionReviewerSubject,
  job: AffiliateAgentGatewayJobs,
): boolean => {
  const {
    producerClaim,
    producerJob,
    producerEnvelope,
    producerResult,
  } = context;
  const producerSubject =
    producerEnvelope?.subject.type === "MAPPING_PRODUCER"
      ? producerEnvelope.subject
      : null;
  return [
    isProducerClaimStateValid(producerClaim, producerJob),
    producerEnvelope !== null,
    producerResult !== null,
    producerEnvelope !== null
      && hashAffiliateAgentValue(producerEnvelope) === producerClaim?.claimEnvelopeHash,
    producerSubject?.supplySourceId === subject.supplySourceId,
    producerSubject?.repairContext?.kind === subject.repairContext.kind,
    producerSubject?.repairContext?.intakeId === subject.repairContext.intakeId,
    producerSubject?.repairContext?.evidenceRunId === subject.repairContext.evidenceRunId,
    job.parentClaimId === subject.producerClaimId,
    producerClaim?.workerId === subject.producerWorkerId,
    producerClaim?.invocationId === subject.producerInvocationId,
    producerClaim?.workspaceId === subject.producerWorkspaceId,
    isProducerResultIdentityMatch(producerResult, producerClaim, producerJob),
    producerResult?.role === "MAPPING_PRODUCER",
    producerResult?.disposition === "CONTRACT_GAP",
    producerJob?.resultHash === subject.producerResultHash,
    producerResult !== null
      && hashAffiliateAgentValue(producerResult) === subject.producerResultHash,
  ].every(Boolean);
};
const assertSourceExclusionClaimBinding = async (
  input: Parameters<typeof assertAffiliateSourceExclusionClaimBinding>[0],
): Promise<void> => {
  try {
    await assertAffiliateSourceExclusionClaimBinding(input);
  } catch (error) {
    if (error instanceof AffiliateSourceExclusionAdmissionError) {
      throw gatewayError(
        "REVIEW_WORKSPACE_INVALID",
        "The source exclusion reviewer claim binding is invalid.",
      );
    }
    throw error;
  }
};
const assertSourceExclusionExecutionReady = async (
  input: Parameters<typeof assertAffiliateSourceExclusionExecutionReady>[0],
): Promise<void> => {
  try {
    await assertAffiliateSourceExclusionExecutionReady(input);
  } catch (error) {
    if (error instanceof AffiliateSourceExclusionAdmissionError) {
      throw gatewayError(
        "REVIEW_WORKSPACE_INVALID",
        "The source exclusion reviewer scope is no longer eligible.",
      );
    }
    throw error;
  }
};


const assertReviewerProducerAdmission = async (
  transaction: Prisma.TransactionClient,
  job: AffiliateAgentGatewayJobs,
  subject: AffiliateAgentSubject,
  input: AffiliateAgentClaimRequest,
): Promise<void> => {
  if (
    subject.type !== "SUPPLY_REVIEWER"
    && subject.type !== "SOURCE_EXCLUSION_REVIEW"
  ) {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "The reviewer subject is invalid.",
    );
  }
  const context = await loadProducerReviewContext(
    transaction,
    subject.producerClaimId,
  );
  const producerClaimIsValid = subject.type === "SOURCE_EXCLUSION_REVIEW"
    ? isSourceExclusionProducerClaimValid(context, subject, job)
    : isProducerClaimValid(context, subject, job);
  if (!producerClaimIsValid) {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "The reviewer claim must reference one completed matching producer claim.",
    );
  }
  if (
    subject.producerWorkerId === input.workerId
    || subject.producerInvocationId === input.invocationId
  ) {
    throw gatewayError(
      "PRODUCER_REVIEWER_IDENTITY_REUSED",
      "The reviewer worker and invocation must differ from the producer.",
    );
  }
  if (subject.producerWorkspaceId === input.workspaceAttestation.workspaceId) {

    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "The reviewer workspace must differ from the producer workspace.",
    );
  }
};

type ReviewerArtifact = Readonly<{
  evidenceKind: string;
  sourceArtifactId: string;
  fileId: string;
  contentHash: string;
  mimeType: string;
  byteSize: number;
  claimId: string;
  creatingClaimId: string | null;
}>;
const isReviewerArtifactOwnedByProducer = (
  kind: "COMMITTED_PACKAGE" | "DETERMINISTIC_VALIDATION" | "DURABLE_EVIDENCE",
  artifact: ReviewerArtifact,
  producerClaimId: string,
): boolean =>
  kind === "DURABLE_EVIDENCE"
    ? artifact.claimId === producerClaimId
      || artifact.creatingClaimId === producerClaimId
    : artifact.creatingClaimId === producerClaimId;

const isReviewerArtifactBound = (
  kind: "COMMITTED_PACKAGE" | "DETERMINISTIC_VALIDATION" | "DURABLE_EVIDENCE",
  entry: Readonly<{
    kind: string;
    artifactId: string;
    sha256: string;
    mimeType: string;
    byteSize: number;
  }> | undefined,
  artifacts: readonly ReviewerArtifact[],
  producerClaimId: string,
): boolean =>
  entry !== undefined
  && artifacts.some((artifact) =>
    [
      artifact.evidenceKind === kind,
      artifact.sourceArtifactId === entry.artifactId,
      artifact.fileId === entry.artifactId,
      artifact.contentHash === entry.sha256,
      artifact.mimeType === entry.mimeType,
      artifact.byteSize === entry.byteSize,
      isReviewerArtifactOwnedByProducer(kind, artifact, producerClaimId),
    ].every(Boolean),
  );

const hasValidReviewerManifest = (
  evidenceManifest: z.infer<typeof affiliateAgentEvidenceManifestSchema>,
  bundle: AffiliateAgentContractBundle,
  subject: Extract<AffiliateAgentSubject, { type: "SUPPLY_REVIEWER" }>,
  producerArtifacts: readonly ReviewerArtifact[],
): boolean => {
  const manifestKinds = evidenceManifest.entries.map((entry) => entry.kind);
  const allowedKinds: Readonly<Record<string, true>> = {
    ACTIVE_SUPPLY_CONTRACT: true,
    COMMITTED_PACKAGE: true,
    DETERMINISTIC_VALIDATION: true,
    DURABLE_EVIDENCE: true,
  };
  const requiredKinds = [
    "ACTIVE_SUPPLY_CONTRACT",
    "COMMITTED_PACKAGE",
    "DETERMINISTIC_VALIDATION",
    "DURABLE_EVIDENCE",
  ] as const;
  const activeContractEntry = evidenceManifest.entries.find(
    (entry) => entry.kind === "ACTIVE_SUPPLY_CONTRACT",
  );
  const committedPackageEntry = evidenceManifest.entries.find(
    (entry) => entry.kind === "COMMITTED_PACKAGE",
  );
  const producerEvidenceIsBound = (
    [
      "COMMITTED_PACKAGE",
      "DETERMINISTIC_VALIDATION",
      "DURABLE_EVIDENCE",
    ] as const
  ).every((kind) =>
    isReviewerArtifactBound(
      kind,
      evidenceManifest.entries.find((entry) => entry.kind === kind),
      producerArtifacts,
      subject.producerClaimId,
    ),
  );
  return [
    manifestKinds.every((kind) => allowedKinds[kind] === true),
    requiredKinds.every(
      (kind) => manifestKinds.filter((entryKind) => entryKind === kind).length === 1,
    ),
    activeContractEntry?.sha256 === bundle.supplyContract.hash,
    committedPackageEntry?.sha256 === subject.committedPackageHash,
    producerEvidenceIsBound,
  ].every(Boolean);
};

const assertReviewerManifest = async (
  transaction: Prisma.TransactionClient,
  evidenceManifest: z.infer<typeof affiliateAgentEvidenceManifestSchema>,
  bundle: AffiliateAgentContractBundle,
  subject: AffiliateAgentSubject,
): Promise<void> => {
  if (subject.type !== "SUPPLY_REVIEWER") return;
  const producerArtifacts =
    await transaction.affiliateAgentGatewayArtifacts.findMany({
      where: {
        OR: [
          { claimId: subject.producerClaimId },
          { creatingClaimId: subject.producerClaimId },
        ],
      },
    });
  if (!hasValidReviewerManifest(evidenceManifest, bundle, subject, producerArtifacts)) {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "The reviewer manifest must contain one exact copy of each committed review artifact.",
    );
  }
};

const loadHumanReviewContext = async (
  transaction: Prisma.TransactionClient,
  reviewerClaimId: string,
) => {
  const reviewerClaim =
    await transaction.affiliateAgentGatewayClaims.findUnique({
      where: { id: reviewerClaimId },
    });
  const reviewerJob = reviewerClaim
    ? await transaction.affiliateAgentGatewayJobs.findUnique({
        where: { id: reviewerClaim.jobId },
      })
    : null;
  const reviewerEnvelope = parseClaimEnvelope(reviewerClaim);
  const reviewerResult = parseClaimTerminalResult(reviewerJob);
  return {
    reviewerClaim,
    reviewerJob,
    reviewerEnvelope,
    reviewerResult:
      reviewerResult?.role === "SUPPLY_REVIEWER" &&
      reviewerResult.disposition === "HUMAN_REVIEW_REQUIRED"
        ? reviewerResult
        : null,
  };
};

const reviewerEntryMatchesHumanEvidence = (
  humanEntry: Readonly<{
    evidenceRef: string;
    artifactId: string;
    sha256: string;
    mimeType: string;
    byteSize: number;
  }>,
  evidenceRef: string,
  reviewerEnvelope: AffiliateAgentClaimEnvelope | null,
): boolean => {
  if (evidenceRef !== humanEntry.evidenceRef || !reviewerEnvelope) return false;
  return reviewerEnvelope.evidenceManifest.entries.some(
    (reviewerEntry) =>
      [
        reviewerEntry.evidenceRef === evidenceRef,
        reviewerEntry.kind === "DETERMINISTIC_VALIDATION" ||
          reviewerEntry.kind === "DURABLE_EVIDENCE",
        reviewerEntry.artifactId === humanEntry.artifactId,
        reviewerEntry.sha256 === humanEntry.sha256,
        reviewerEntry.mimeType === humanEntry.mimeType,
        reviewerEntry.byteSize === humanEntry.byteSize,
      ].every(Boolean),
  );
};

const isReviewerEvidenceMatch = (
  humanEntries: ReadonlyArray<{
    evidenceRef: string;
    artifactId: string;
    sha256: string;
    mimeType: string;
    byteSize: number;
  }>,
  reviewerEvidenceRefs: readonly string[] | undefined,
  reviewerEnvelope: AffiliateAgentClaimEnvelope | null,
): boolean =>
  reviewerEvidenceRefs !== undefined &&
  humanEntries.some((humanEntry) =>
    reviewerEvidenceRefs.some((evidenceRef) =>
      reviewerEntryMatchesHumanEvidence(
        humanEntry,
        evidenceRef,
        reviewerEnvelope,
      ),
    ),
  );
type HumanReviewContext = Readonly<{
  reviewerClaim: AffiliateAgentGatewayClaims | null;
  reviewerJob: AffiliateAgentGatewayJobs | null;
  reviewerEnvelope: AffiliateAgentClaimEnvelope | null;
  reviewerResult: AffiliateAgentTerminalResultEnvelope | null;
}>;

const isReviewerClaimStateValid = (
  reviewerClaim: AffiliateAgentGatewayClaims | null,
  reviewerJob: AffiliateAgentGatewayJobs | null,
): boolean =>
  [
    reviewerClaim !== null,
    reviewerClaim?.status === "COMPLETED",
    reviewerClaim?.role === "SUPPLY_REVIEWER",
    reviewerClaim?.terminalReceiptId !== null,
    reviewerJob !== null,
    reviewerJob?.status === "COMPLETED",
    reviewerJob?.activeClaimId === null,
    reviewerJob?.terminalReceiptId === reviewerClaim?.terminalReceiptId,
  ].every(Boolean);

const isReviewerEnvelopeValid = (
  reviewerClaim: AffiliateAgentGatewayClaims | null,
  reviewerEnvelope: AffiliateAgentClaimEnvelope | null,
): boolean =>
  [
    reviewerEnvelope !== null,
    reviewerEnvelope !== null &&
      hashAffiliateAgentValue(reviewerEnvelope) ===
        reviewerClaim?.claimEnvelopeHash,
  ].every(Boolean);

const isReviewerResultIdentityValid = (
  reviewerClaim: AffiliateAgentGatewayClaims | null,
  reviewerJob: AffiliateAgentGatewayJobs | null,
  reviewerResult: AffiliateAgentTerminalResultEnvelope | null,
): boolean =>
  [
    reviewerResult !== null,
    reviewerResult?.jobId === reviewerJob?.id,
    reviewerResult?.claimId === reviewerClaim?.id,
    reviewerResult?.claimGeneration === reviewerClaim?.claimGeneration,
  ].every(Boolean);

const isReviewerClaimValid = (
  context: HumanReviewContext,
  job: AffiliateAgentGatewayJobs,
  reviewerClaimId: string,
  reviewerEvidenceEntries: ReadonlyArray<{
    evidenceRef: string;
    artifactId: string;
    sha256: string;
    mimeType: string;
    byteSize: number;
  }>,
): boolean => {
  const { reviewerClaim, reviewerJob, reviewerEnvelope, reviewerResult } =
    context;
  const reviewerSubject =
    reviewerEnvelope?.subject.type === "SUPPLY_REVIEWER"
      ? reviewerEnvelope.subject
      : null;
  return [
    isReviewerClaimStateValid(reviewerClaim, reviewerJob),
    isReviewerEnvelopeValid(reviewerClaim, reviewerEnvelope),
    job.parentClaimId === reviewerClaimId,
    reviewerSubject?.supplySourceId === job.supplySourceId,
    isReviewerResultIdentityValid(reviewerClaim, reviewerJob, reviewerResult),
    isReviewerEvidenceMatch(
      reviewerEvidenceEntries,
      reviewerResult?.evidenceRefs,
      reviewerEnvelope,
    ),
  ].every(Boolean);
};

const assertHumanDirectedAdmission = async (
  transaction: Prisma.TransactionClient,
  job: AffiliateAgentGatewayJobs,
  subject: AffiliateAgentSubject,
  evidenceManifest: z.infer<typeof affiliateAgentEvidenceManifestSchema>,
): Promise<void> => {
  if (subject.type !== "HUMAN_DIRECTED_EXECUTOR") {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "The human-directed subject is invalid.",
    );
  }
  const humanDecisionEntries = evidenceManifest.entries.filter(
    (entry) => entry.kind === "HUMAN_DECISION",
  );
  const reviewerEvidenceEntries = evidenceManifest.entries.filter(
    (entry) => entry.kind === "REVIEWER_EVIDENCE",
  );
  const isHumanEvidenceKindsAllowed = evidenceManifest.entries.every(
    (entry) =>
      entry.kind === "HUMAN_DECISION" || entry.kind === "REVIEWER_EVIDENCE",
  );
  const context = await loadHumanReviewContext(
    transaction,
    subject.reviewerClaimId,
  );
  const isClaimValid = isReviewerClaimValid(
    context,
    job,
    subject.reviewerClaimId,
    reviewerEvidenceEntries,
  );
  if (
    !isHumanEvidenceKindsAllowed ||
    humanDecisionEntries.length !== 1 ||
    reviewerEvidenceEntries.length !== 1 ||
    humanDecisionEntries[0]?.sha256 !== subject.decisionHash ||
    !isClaimValid
  ) {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "The human claim must contain the exact decision and completed reviewer evidence.",
    );
  }
};

const readLifecycleGenerationInTransaction = async (
  transaction: Prisma.TransactionClient,
  supplySourceId: string,
): Promise<number> => {
  const rows = await transaction.$queryRaw<
    ReadonlyArray<{ lifecycleGeneration: number }>
  >(
    Prisma.sql`
      SELECT source."lifecycleGeneration" AS "lifecycleGeneration"
      FROM "AffiliateSupplySources" AS source
      WHERE source."id" = ${supplySourceId}
      FOR SHARE
    `,
  );
  const supplySource = rows[0];
  if (!supplySource) {
    throw gatewayError(
      "LIFECYCLE_GENERATION_STALE",
      "The Supply Source lifecycle generation is unavailable.",
    );
  }
  return supplySource.lifecycleGeneration;
};

const hasClaimLifecycleAdvance = async (
  transaction: Prisma.TransactionClient,
  input: AffiliateAgentClaimRequest,
  job: AffiliateAgentGatewayJobs,
  currentGeneration: number,
): Promise<boolean> => {
  if (
    input.role !== "MAPPING_PRODUCER"
    && input.role !== "SUPPLY_REVIEWER"
    && input.role !== "HUMAN_DIRECTED_EXECUTOR"
  ) {
    return false;
  }
  if (job.expectedLifecycleGeneration === null) return false;
  if (currentGeneration !== job.expectedLifecycleGeneration + 1) return false;
  return hasRecordedLifecycleAdvanceForJob(
    transaction,
    job,
    input.role,
    currentGeneration,
  );
};

const assertClaimLifecycleScope = async (
  dependencies: AffiliateAgentGatewayDependencies,
  transaction: Prisma.TransactionClient,
  input: AffiliateAgentClaimRequest,
  job: AffiliateAgentGatewayJobs,
): Promise<number | null> => {
  if (
    input.role !== "COVERAGE_PLANNER"
    && (!job.supplySourceId || job.expectedLifecycleGeneration === null)
  ) {
    throw gatewayError(
      "LIFECYCLE_GENERATION_STALE",
      "Non-coverage jobs require a Supply Source lifecycle generation.",
    );
  }
  if (job.expectedLifecycleGeneration === null) return null;
  if (!job.supplySourceId || dependencies.lifecycle.kind !== "AVAILABLE") {
    throw gatewayError(
      "LIFECYCLE_GENERATION_STALE",
      "The Supply Source lifecycle generation is stale.",
    );
  }
  const currentGeneration = await readLifecycleGenerationInTransaction(
    transaction,
    job.supplySourceId,
  );
  const hasLifecycleAdvanceRecorded = await hasClaimLifecycleAdvance(
    transaction,
    input,
    job,
    currentGeneration,
  );
  if (
    currentGeneration !== job.expectedLifecycleGeneration
    && !hasLifecycleAdvanceRecorded
  ) {
    throw gatewayError(
      "LIFECYCLE_GENERATION_STALE",
      "The Supply Source lifecycle generation is stale.",
    );
  }
  return currentGeneration;
};
type ClaimEvidenceManifest = z.infer<
  typeof affiliateAgentEvidenceManifestSchema
>;
type ClaimEvidenceEntry = ClaimEvidenceManifest["entries"][number];
type ClaimParentArtifact = Readonly<{
  sourceArtifactId: string;
  fileId: string;
  contentHash: string;
  mimeType: string;
  byteSize: number;
  creatingClaimId: string | null;
  claimId: string;
}>;

const createClaimEnvelope = (
  input: AffiliateAgentClaimRequest,
  bundle: AffiliateAgentContractBundle,
  roleContract: AffiliateAgentRoleContract,
  job: AffiliateAgentGatewayJobs,
  lifecycleGeneration: number | null,
  subject: AffiliateAgentSubject,
  evidenceManifest: ClaimEvidenceManifest,
  claimId: string,
  timing: ClaimAdmissionTiming,
): AffiliateAgentClaimEnvelope =>
  affiliateAgentClaimEnvelopeSchema.parse({
    schemaVersion: 1,
    queue: job.queue,
    lane: job.lane,
    jobId: job.id,
    claimId,
    supplySourceId: job.supplySourceId,
    claimGeneration: job.claimGeneration + 1,
    lifecycleGeneration,
    deploymentContractVersion: bundle.deploymentContract.version,
    deploymentContractHash: bundle.deploymentContract.hash,
    supplyContractVersion: bundle.supplyContract.version,
    supplyContractHash: bundle.supplyContract.hash,
    roleContractVersion: roleContract.version,
    roleContractHash: roleContract.hash,
    promptTemplateVersion: roleContract.promptTemplateVersion,
    promptTemplateHash: roleContract.promptTemplateHash,
    role: input.role,
    executionClass: "PRODUCTION_OMP",
    ...(isAffiliateAgentSingleClaimJob(job.dedupeKey) ? { executionBudget: "SINGLE_CLAIM" } : {}),
    workerId: input.workerId,
    invocationId: input.invocationId,
    workspaceId: input.workspaceAttestation.workspaceId,
    claimedAt: timing.now.toISOString(),
    expiresAt: timing.hardDeadlineAt.toISOString(),
    evidenceManifest,
    subject,
    permittedCommands: roleContract.permittedCommands,
  });

const findMatchingParentArtifact = (
  parentArtifacts: readonly ClaimParentArtifact[],
  entry: ClaimEvidenceEntry,
): ClaimParentArtifact | undefined =>
  parentArtifacts.find((artifact) =>
    [
      artifact.sourceArtifactId === entry.artifactId,
      artifact.fileId === entry.artifactId,
      artifact.contentHash === entry.sha256,
      artifact.mimeType === entry.mimeType,
      artifact.byteSize === entry.byteSize,
    ].every(Boolean),
  );

const persistClaimArtifacts = async (
  dependencies: AffiliateAgentGatewayDependencies,
  transaction: Prisma.TransactionClient,
  job: AffiliateAgentGatewayJobs,
  claimId: string,
  claimGeneration: number,
  evidenceManifest: ClaimEvidenceManifest,
): Promise<void> => {
  const parentArtifacts: readonly ClaimParentArtifact[] =
    job.parentClaimId === null
      ? []
      : await transaction.affiliateAgentGatewayArtifacts.findMany({
          where: { claimId: job.parentClaimId },
        });
  if (evidenceManifest.entries.length === 0) return;
  await transaction.affiliateAgentGatewayArtifacts.createMany({
    data: evidenceManifest.entries.map((entry) => {
      const parentArtifact = findMatchingParentArtifact(parentArtifacts, entry);
      return {
        id: dependencies.identifiers.create("artifact"),
        claimId,
        claimGeneration,
        evidenceRef: entry.evidenceRef,
        evidenceKind: entry.kind,
        sourceArtifactId: entry.artifactId,
        fileId: entry.artifactId,
        contentHash: entry.sha256,
        mimeType: entry.mimeType,
        byteSize: entry.byteSize,
        accessMode: "READ_ONLY",
        creatingClaimId:
          parentArtifact?.creatingClaimId ?? parentArtifact?.claimId ?? null,
        retentionClass: entry.retention,
        isPinned: true,
      };
    }),
  });
};

const createClaimRecord = async (
  dependencies: AffiliateAgentGatewayDependencies,
  transaction: Prisma.TransactionClient,
  input: AffiliateAgentClaimRequest,
  job: AffiliateAgentGatewayJobs,
  bundle: AffiliateAgentContractBundle,
  roleContract: AffiliateAgentRoleContract,
  envelope: AffiliateAgentClaimEnvelope,
  requestHash: string,
  claimId: string,
  tokenNonce: string,
  tokenScope: AffiliateAgentClaimTokenScope,
  timing: ClaimAdmissionTiming,
): Promise<AffiliateAgentGatewayClaims> =>
  transaction.affiliateAgentGatewayClaims.create({
    data: {
      id: claimId,
      jobId: job.id,
      parentClaimId: job.parentClaimId,
      claimGeneration: envelope.claimGeneration,
      lifecycleGeneration: envelope.lifecycleGeneration,
      queue: job.queue,
      lane: job.lane,
      role: input.role,
      workerId: input.workerId,
      invocationId: input.invocationId,
      workspaceId: input.workspaceAttestation.workspaceId,
      workspaceMode: input.workspaceAttestation.mode,
      workspaceAttestationHash: hashAffiliateAgentValue(
        input.workspaceAttestation,
      ),
      status: "ACTIVE",
      claimRequestId: input.idempotencyKey,
      claimRequestHash: requestHash,
      claimedAt: timing.now,
      lastHeartbeatAt: timing.now,
      leaseExpiresAt: timing.leaseExpiresAt,
      hardDeadlineAt: timing.hardDeadlineAt,
      endedAt: null,
      tokenNonce,
      tokenHash: dependencies.tokens.hashFor(tokenScope, tokenNonce),
      tokenKeyVersion: dependencies.tokens.keyVersion,
      tokenExpiresAt: timing.hardDeadlineAt,
      tokenInvalidatedAt: null,
      deploymentContractVersion: bundle.deploymentContract.version,
      deploymentContractHash: bundle.deploymentContract.hash,
      roleContractVersion: roleContract.version,
      roleContractHash: roleContract.hash,
      promptTemplateVersion: roleContract.promptTemplateVersion,
      promptTemplateHash: roleContract.promptTemplateHash,
      supplyContractVersion: bundle.supplyContract.version,
      supplyContractHash: bundle.supplyContract.hash,
      claimEnvelopeHash: hashAffiliateAgentValue(envelope),
      claimEnvelopeJson: asPrismaJson(envelope),
      evidenceManifestHash: envelope.evidenceManifest.hash,
      permittedCommandHash: tokenScope.permittedCommandHash,
      permittedCommands: [...roleContract.permittedCommands],
      schemaCorrectionCount: 0,
      terminalReceiptId: null,
      safeFailureCode: null,
      safeFailureSummary: null,
      diagnosticRetainUntil: null,
    },
  });

const persistClaimCreatedEvent = async (
  dependencies: AffiliateAgentGatewayDependencies,
  transaction: Prisma.TransactionClient,
  input: AffiliateAgentClaimRequest,
  job: AffiliateAgentGatewayJobs,
  envelope: AffiliateAgentClaimEnvelope,
  claimId: string,
  timing: ClaimAdmissionTiming,
): Promise<void> => {
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `claim:${claimId}`,
      jobId: job.id,
      claimId,
      sequence: job.eventSequence + 1,
      eventType: "CLAIM_CREATED",
      actorKind: "AGENT_WORKER",
      actorId: input.workerId,
      role: input.role,
      inputHash: hashAffiliateAgentValue(envelope.subject),
      outputHash: hashAffiliateAgentValue({
        claimId,
        claimGeneration: envelope.claimGeneration,
        leaseExpiresAt: timing.leaseExpiresAt.toISOString(),
        hardDeadlineAt: timing.hardDeadlineAt.toISOString(),
      }),
      payload: asPrismaJson({
        claimGeneration: envelope.claimGeneration,
        workspaceId: input.workspaceAttestation.workspaceId,
      }),
      retentionClass: "INDEFINITE",
    },
  });
};
const persistClaim = async (
  dependencies: AffiliateAgentGatewayDependencies,
  transaction: Prisma.TransactionClient,
  input: AffiliateAgentClaimRequest,
  job: AffiliateAgentGatewayJobs,
  subject: AffiliateAgentSubject,
  bundle: AffiliateAgentContractBundle,
  roleContract: AffiliateAgentRoleContract,
  requestHash: string,
  claimId: string,
  tokenNonce: string,
  timing: ClaimAdmissionTiming,
  lifecycleGeneration: number | null,
  evidenceManifest: ClaimEvidenceManifest,
): Promise<Readonly<{
  claim: AffiliateAgentGatewayClaims;
  envelope: AffiliateAgentClaimEnvelope;
}> > => {
  if (isAffiliateAgentSingleClaimJob(job.dedupeKey) && job.claimGeneration !== 0) {
    throw gatewayError("PIPELINE_BLOCKED", "The one-time continuation claim has already been consumed.");
  }
  const envelope = createClaimEnvelope(
    input,
    bundle,
    roleContract,
    job,
    lifecycleGeneration,
    subject,
    evidenceManifest,
    claimId,
    timing,
  );
  if (envelope.subject.type === "MAPPING_PRODUCER") {
    try {
      await assertAffiliateLegacyRepairScopeClaimBinding({
        prisma: transaction,
        job,
        claim: envelope,
      });
    } catch (error) {
      if (error instanceof AffiliateLegacyRepairAdmissionError) {
        throw gatewayError(
          "REVIEW_WORKSPACE_INVALID",
          "The scoped legacy repair claim binding is invalid.",
        );
      }
      throw error;
    }
  }
  if (envelope.subject.type === "SOURCE_EXCLUSION_REVIEW") {
    await assertSourceExclusionClaimBinding({
      prisma: transaction,
      job,
      claim: envelope,
    });
    await assertSourceExclusionExecutionReady({
      prisma: transaction,
      job,
      claim: envelope,
    });
  }
  const tokenScope = tokenScopeForEnvelope(envelope);
  const claimed = await transaction.affiliateAgentGatewayJobs.updateMany({
    where: {
      id: job.id,
      status: { in: ["QUEUED", "RETRY_WAIT"] },
      activeClaimId: null,
      claimGeneration: job.claimGeneration,
      expectedLifecycleGeneration: job.expectedLifecycleGeneration,
      nextAttemptAt: { lte: timing.now },
    },
    data: {
      status: "CLAIMED",
      activeClaimId: claimId,
      claimGeneration: { increment: 1 },
      expectedLifecycleGeneration: lifecycleGeneration,
      terminalReceiptId: null,
      eventSequence: { increment: 1 },
    },
  });
  if (claimed.count !== 1) throw new AffiliateAgentClaimRaceError();
  const claim = await createClaimRecord(
    dependencies,
    transaction,
    input,
    job,
    bundle,
    roleContract,
    envelope,
    requestHash,
    claimId,
    tokenNonce,
    tokenScope,
    timing,
  );
  await persistClaimArtifacts(
    dependencies,
    transaction,
    job,
    claimId,
    envelope.claimGeneration,
    evidenceManifest,
  );
  await persistClaimCreatedEvent(
    dependencies,
    transaction,
    input,
    job,
    envelope,
    claimId,
    timing,
  );
  return { claim, envelope };
};

const executeClaimTransaction = (
  dependencies: AffiliateAgentGatewayDependencies,
  input: AffiliateAgentClaimRequest,
  bundle: AffiliateAgentContractBundle,
  roleContract: AffiliateAgentRoleContract,
  requestHash: string,
  claimId: string,
  tokenNonce: string,
  attestationExpiresAt: Date,
  admissionOpen: boolean,
  admissionJobId?: string,
): Promise<ClaimTransactionResult> =>
  dependencies.prisma.$transaction(
    async (transaction) => {
      const replayOrClosed = await findClaimReplayOrClosed(
        transaction,
        input.idempotencyKey,
        admissionOpen,
        admissionJobId,
      );
      if (replayOrClosed) return replayOrClosed;
      const timing = assertClaimAdmissionTiming(
        attestationExpiresAt,
        dependencies.clock.now(),
      );
      await assertClaimIdentityAvailable(transaction, input);
      await assertWorkerHasNoLiveClaim(transaction, input.workerId, timing.now);
      const haltedLanes = await findHaltedClaimLanes(transaction);
      const job = await findClaimableJob(
        transaction,
        input,
        timing.now,
        haltedLanes,
        admissionJobId,
      );
      if (!job) return { kind: "NO_WORK" as const };
      const queuedSubject = parseQueuedSubject(job, input.role);
      const subject = await assertMappingProducerSourceKind(
        transaction,
        queuedSubject,
      );
      const evidenceManifest = parseClaimEvidenceManifest(job, input.role);
      if (input.role === "SUPPLY_REVIEWER") {
        await assertReviewerProducerAdmission(
          transaction,
          job,
          subject,
          input,
        );
        await assertReviewerManifest(
          transaction,
          evidenceManifest,
          bundle,
          subject,
        );
      }
      if (input.role === "HUMAN_DIRECTED_EXECUTOR") {
        await assertHumanDirectedAdmission(
          transaction,
          job,
          subject,
          evidenceManifest,
        );
      }
      const lifecycleGeneration = await assertClaimLifecycleScope(
        dependencies,
        transaction,
        input,
        job,
      );
      return { kind: "CLAIMED" as const, ...(await persistClaim(
        dependencies,
        transaction,
        input,
        job,
        subject,
        bundle,
        roleContract,
        requestHash,
        claimId,
        tokenNonce,
        timing,
        lifecycleGeneration,
        evidenceManifest,
      )) };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

const claimResultToGrant = (
  dependencies: AffiliateAgentGatewayDependencies,
  stored: ClaimTransactionResult,
  requestHash: string,
  bundle: AffiliateAgentContractBundle,
  roleContract: AffiliateAgentRoleContract,
  admissionJobId?: string,
): AffiliateAgentClaimGrant | null => {
  if (admissionJobId !== undefined) {
    if (
      (stored.kind === "REPLAY" && stored.claim.jobId !== admissionJobId)
      || (stored.kind === "CLAIMED"
        && (
          stored.claim.jobId !== admissionJobId
          || stored.envelope.jobId !== admissionJobId
        ))
    ) {
      return null;
    }
  }
  switch (stored.kind) {
    case "CLOSED":
    case "NO_WORK":
      return null;
    case "REPLAY":
      return replayClaimGrant(
        dependencies,
        stored.claim,
        requestHash,
        bundle,
        roleContract,
      );
    case "CLAIMED":
      return {
        envelope: stored.envelope,
        prompt: renderAffiliateAgentPrompt(roleContract, stored.envelope),
        token: dependencies.tokens.issue(
          tokenScopeForEnvelope(stored.envelope),
          stored.claim.tokenNonce,
        ),
        heartbeatIntervalSeconds: AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
        leaseExpiresAt: stored.claim.leaseExpiresAt.toISOString(),
        hardDeadlineAt: stored.claim.hardDeadlineAt.toISOString(),
        };
  }
};
const isClaimRaceOrSerializationConflict = (error: unknown): boolean =>
  error instanceof AffiliateAgentClaimRaceError ||
  isSerializableTransactionConflict(error) ||
  isClaimJobRaceUniqueConflict(error);


const claimAffiliateAgentJob = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: AffiliateAgentClaimRequest,
  bundle: AffiliateAgentContractBundle,
  roleContract: AffiliateAgentRoleContract,
  requestHash: string,
): Promise<AffiliateAgentClaimGrant | null> => {
  const claimId = dependencies.identifiers.create("claim");
  const tokenNonce = dependencies.tokens.createNonce();
  const attestationExpiresAt = new Date(input.workspaceAttestation.expiresAt);
  let admissionScopeCaptured = false;
  let admissionJobId: string | undefined;

  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const runClaimTransaction = (jobId?: string) => {
        if (admissionScopeCaptured && jobId !== admissionJobId) {
          return Promise.resolve({ kind: "CLOSED" as const });
        }
        if (!admissionScopeCaptured) {
          admissionScopeCaptured = true;
          admissionJobId = jobId;
        }
        const admissionContext: AffiliateAgentClaimAdmissionContext = {
          role: input.role,
          workerId: input.workerId,
          ...(jobId === undefined ? {} : { jobId }),
        };
        const admissionOpen = dependencies.claimAdmission?.isOpenFor
          ? dependencies.claimAdmission.isOpenFor(admissionContext)
          : dependencies.claimAdmission?.isOpen() ?? true;
        return executeClaimTransaction(
          dependencies,
          input,
          bundle,
          roleContract,
          requestHash,
          claimId,
          tokenNonce,
          attestationExpiresAt,
          admissionOpen,
          admissionJobId,
        );
      };
      const stored = dependencies.claimAdmission
        ? await dependencies.claimAdmission.withClaim(
          runClaimTransaction,
          {
            role: input.role,
            workerId: input.workerId,
            ...(admissionScopeCaptured && admissionJobId !== undefined
              ? { jobId: admissionJobId }
              : {}),
          },
        )
        : await runClaimTransaction();
      return claimResultToGrant(
        dependencies,
        stored,
        requestHash,
        bundle,
        roleContract,
        admissionJobId,
      );
    } catch (error) {
      const retryableConflict =
        error instanceof AffiliateAgentClaimRaceError ||
        isSerializableTransactionConflict(error);
      if (retryableConflict && attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS) {
        continue;
      }
      if (isClaimRaceOrSerializationConflict(error)) return null;
      if (error instanceof AffiliateAgentGatewayError) throw error;
      throw gatewayErrorForPersistenceFailure(
        error,
        "INTERNAL_ERROR",
        "The Affiliate Agent claim could not be completed.",
        true,
      );
    }
  }
  return null;
};

type AuthorizedClaim = Readonly<{
  claim: AffiliateAgentGatewayClaims;
  job: AffiliateAgentGatewayJobs;
  envelope: AffiliateAgentClaimEnvelope;
  bundle: AffiliateAgentContractBundle | null;
  roleContract: AffiliateAgentRoleContract;
}>;

type ClaimAuthorizationOptions = Readonly<{
  postEffectCompletionReceiptId?: string;
  trustedEffectCompletionReceiptId?: string;
  terminalReplayReceiptId?: string;
  isTrustedFailureRecording?: boolean;
}>;

type LifecycleAdvanceRole =
  | "MAPPING_PRODUCER"
  | "SUPPLY_REVIEWER"
  | "HUMAN_DIRECTED_EXECUTOR";

const lifecycleReceiptSafeOutput = (
  responseJson: unknown,
): Readonly<{ kind: string; safeOutput: Record<string, unknown> }> | null => {
  if (!isGatewayRecord(responseJson) || !isGatewayRecord(responseJson.safeOutput)) {
    return null;
  }
  if (typeof responseJson.kind !== "string") return null;
  return {
    kind: responseJson.kind,
    safeOutput: responseJson.safeOutput,
  };
};

const lifecycleReceiptMatchesRole = (
  receipt: AffiliateAgentGatewayOperationReceipts,
  role: LifecycleAdvanceRole,
): boolean => {
  if (receipt.status !== "SUCCEEDED") return false;
  if (role === "MAPPING_PRODUCER") {
    return (
      receipt.operationKind === "EXECUTE_COMMAND"
      && receipt.commandName === "COMMIT_DECLARATIVE_PACKAGE"
    );
  }
  if (role === "SUPPLY_REVIEWER") {
    return (
      receipt.operationKind === "TERMINAL_EFFECT"
      && receipt.commandName === "SUPPLY_REVIEWER_TERMINAL_EFFECT"
    );
  }
  return (
    receipt.operationKind === "EXECUTE_COMMAND"
    && receipt.commandName === "EXECUTE_RECORDED_LIFECYCLE_COMMAND"
  );
};

const lifecycleReceiptOutputMatchesRole = (
  receipt: AffiliateAgentGatewayOperationReceipts,
  role: LifecycleAdvanceRole,
  currentGeneration: number,
): Readonly<Record<string, unknown>> | null => {
  const parsed = lifecycleReceiptSafeOutput(receipt.responseJson);
  if (!parsed) return null;
  if (role === "SUPPLY_REVIEWER") {
    return (
      parsed.kind === "SUCCEEDED"
      && parsed.safeOutput.lifecycleGeneration === currentGeneration
    )
      ? parsed.safeOutput
      : null;
  }
  if (parsed.kind !== "COMMAND_SUCCEEDED") return null;
  if (role === "MAPPING_PRODUCER") return parsed.safeOutput;
  return parsed.safeOutput.lifecycleGeneration === currentGeneration
    ? parsed.safeOutput
    : null;
};

const humanLifecycleActorId = (
  claim: AffiliateAgentGatewayClaims,
): string | null => {
  const envelope = affiliateAgentClaimEnvelopeSchema.safeParse(
    claim.claimEnvelopeJson,
  );
  if (!envelope.success || envelope.data.subject.type !== "HUMAN_DIRECTED_EXECUTOR") {
    return null;
  }
  return envelope.data.subject.recordedHumanActorId;
};

type LifecycleTransitionRecord = Readonly<{
  idempotencyKey: string;
  actorKind: string;
  executingAgentId: string | null;
  actorId: string;
  command: string;
}>;

const lifecycleTransitionIdentityMatches = (
  transition: LifecycleTransitionRecord | null,
  receipt: AffiliateAgentGatewayOperationReceipts,
  claim: AffiliateAgentGatewayClaims,
  role: LifecycleAdvanceRole,
): boolean => transition !== null && [
  transition.idempotencyKey === receipt.id,
  transition.actorKind === role,
  transition.executingAgentId === claim.invocationId,
].every(Boolean);

const lifecycleTransitionActorMatches = (
  transition: LifecycleTransitionRecord,
  claim: AffiliateAgentGatewayClaims,
  role: LifecycleAdvanceRole,
): boolean => {
  const expectedActorId = role === "HUMAN_DIRECTED_EXECUTOR"
    ? humanLifecycleActorId(claim)
    : claim.workerId;
  return expectedActorId !== null && transition.actorId === expectedActorId;
};

const lifecycleTransitionCommandMatches = (
  transition: LifecycleTransitionRecord,
  role: LifecycleAdvanceRole,
  safeOutput: Readonly<Record<string, unknown>>,
): boolean => {
  if (role === "MAPPING_PRODUCER") {
    return transition.command === "RECORD_MAPPING";
  }
  if (role === "SUPPLY_REVIEWER") {
    return transition.command === safeOutput.command;
  }
  return true;
};

const lifecycleTransitionMatchesReceipt = async (
  client: PrismaClient | Prisma.TransactionClient,
  receipt: AffiliateAgentGatewayOperationReceipts,
  claim: AffiliateAgentGatewayClaims,
  role: LifecycleAdvanceRole,
  sourceId: string,
  currentGeneration: number,
  safeOutput: Readonly<Record<string, unknown>>,
): Promise<boolean> => {
  if (typeof client.affiliateSupplyLifecycleTransitions?.findFirst !== "function") {
    return false;
  }
  const transition = await client.affiliateSupplyLifecycleTransitions.findFirst({
    where: {
      supplySourceId: sourceId,
      generation: currentGeneration,
      commandRef: receipt.id,
    },
  });
  if (
    transition === null
    || !lifecycleTransitionIdentityMatches(transition, receipt, claim, role)
  ) {
    return false;
  }
  if (!lifecycleTransitionActorMatches(transition, claim, role)) {
    return false;
  }
  return lifecycleTransitionCommandMatches(transition, role, safeOutput);
};

const lifecycleAdvanceMatchesReceipt = async (
  client: PrismaClient | Prisma.TransactionClient,
  receipt: AffiliateAgentGatewayOperationReceipts,
  claim: AffiliateAgentGatewayClaims,
  role: LifecycleAdvanceRole,
  sourceId: string,
  currentGeneration: number,
): Promise<boolean> => {
  if (
    receipt.claimId !== claim.id
    || receipt.jobId !== claim.jobId
    || receipt.claimGeneration !== claim.claimGeneration
    || !lifecycleReceiptMatchesRole(receipt, role)
  ) {
    return false;
  }
  const safeOutput = lifecycleReceiptOutputMatchesRole(
    receipt,
    role,
    currentGeneration,
  );
  return safeOutput !== null
    && await lifecycleTransitionMatchesReceipt(
      client,
      receipt,
      claim,
      role,
      sourceId,
      currentGeneration,
      safeOutput,
    );
};

const hasRecordedLifecycleAdvanceForJob = async (
  client: PrismaClient | Prisma.TransactionClient,
  job: AffiliateAgentGatewayJobs,
  role: LifecycleAdvanceRole,
  currentGeneration: number,
): Promise<boolean> => {
  if (!job.supplySourceId) return false;
  const receipts = await client.affiliateAgentGatewayOperationReceipts.findMany({
    where: {
      jobId: job.id,
      claimGeneration: job.claimGeneration,
      status: "SUCCEEDED",
    },
  });
  for (const receipt of receipts) {
    const claim = await client.affiliateAgentGatewayClaims.findUnique({
      where: { id: receipt.claimId },
    });
    if (
      claim
      && claim.role === role
      && (!job.activeClaimId || job.activeClaimId === claim.id)
      && await lifecycleAdvanceMatchesReceipt(
        client,
        receipt,
        claim,
        role,
        job.supplySourceId,
        currentGeneration,
      )
    ) {
      return true;
    }
  }
  return false;
};

const hasRecordedLifecycleAdvance = async (
  client: PrismaClient | Prisma.TransactionClient,
  claim: AffiliateAgentGatewayClaims,
  currentGeneration: number,
): Promise<boolean> => {
  if (
    claim.role !== "MAPPING_PRODUCER"
    && claim.role !== "SUPPLY_REVIEWER"
    && claim.role !== "HUMAN_DIRECTED_EXECUTOR"
  ) {
    return false;
  }
  if (
    claim.lifecycleGeneration === null
    || currentGeneration !== claim.lifecycleGeneration + 1
  ) {
    return false;
  }
  const job = await client.affiliateAgentGatewayJobs.findUnique({
    where: { id: claim.jobId },
  });
  if (!job?.supplySourceId) return false;
  const receipts = await client.affiliateAgentGatewayOperationReceipts.findMany({
    where: {
      jobId: claim.jobId,
      claimId: claim.id,
      claimGeneration: claim.claimGeneration,
      status: "SUCCEEDED",
    },
  });
  for (const receipt of receipts) {
    if (
      await lifecycleAdvanceMatchesReceipt(
        client,
        receipt,
        claim,
        claim.role,
        job.supplySourceId,
        currentGeneration,
      )
    ) {
      return true;
    }
  }
  return false;
};

const operationRequestHash = (input: AffiliateAgentClaimOperation): string => {
  const { token, ...authorizationScope } = input.authorization;
  return hashAffiliateAgentValue({
    ...input,
    authorization: {
      ...authorizationScope,
      tokenHash: hashAffiliateAgentValue(token),
    },
  });
};

const assertClaimToken = (
  dependencies: AffiliateAgentGatewayDependencies,
  authorization: AffiliateAgentClaimAuthorization,
  claim: AffiliateAgentGatewayClaims,
  options: ClaimAuthorizationOptions,
): void => {
  if (
    options.trustedEffectCompletionReceiptId === undefined &&
    claim.tokenKeyVersion !== dependencies.tokens.keyVersion
  ) {
    throw gatewayError("TOKEN_INVALID", "The claim token is invalid.");
  }
  if (
    options.trustedEffectCompletionReceiptId === undefined &&
    !dependencies.tokens.matches(authorization.token, claim.tokenHash)
  ) {
    throw gatewayError("TOKEN_INVALID", "The claim token is invalid.");
  }
};

const assertClaimIdentity = (
  authorization: AffiliateAgentClaimAuthorization,
  claim: AffiliateAgentGatewayClaims,
): void => {
  if (claim.jobId !== authorization.jobId) {
    throw gatewayError("JOB_MISMATCH", "The claim job does not match.");
  }
  if (claim.role !== authorization.role) {
    throw gatewayError("ROLE_NOT_ALLOWED", "The claim role does not match.");
  }
  if (claim.workerId !== authorization.workerId) {
    throw gatewayError("WORKER_MISMATCH", "The claim worker does not match.");
  }
  if (claim.invocationId !== authorization.invocationId) {
    throw gatewayError(
      "INVOCATION_MISMATCH",
      "The claim invocation does not match.",
    );
  }
  if (claim.claimGeneration !== authorization.claimGeneration) {
    throw gatewayError(
      "CLAIM_GENERATION_STALE",
      "The claim generation is stale.",
    );
  }
  if (claim.lifecycleGeneration !== authorization.lifecycleGeneration) {
    throw gatewayError(
      "LIFECYCLE_GENERATION_STALE",
      "The lifecycle generation is stale.",
    );
  }
  if (claim.supplyContractHash !== authorization.supplyContractHash) {
    throw gatewayError(
      "SUPPLY_CONTRACT_STALE",
      "The Supply Contract is stale.",
    );
  }
};

const claimCompletionReceiptId = (
  options: ClaimAuthorizationOptions,
): string | undefined =>
  options.postEffectCompletionReceiptId ??
  options.trustedEffectCompletionReceiptId;

const assertPostEffectCompletionReceipt = async (
  client: PrismaClient | Prisma.TransactionClient,
  claim: AffiliateAgentGatewayClaims,
  completionReceiptId: string | undefined,
): Promise<boolean> => {
  if (completionReceiptId === undefined) return false;
  const isAllowed = await hasPostEffectCompletionReceipt(
    client,
    claim,
    completionReceiptId,
  );
  if (!isAllowed) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The post-effect terminal result is not eligible for completion.",
      false,
      completionReceiptId,
    );
  }
  return true;
};

const assertClaimExpiryWindow = (
  claim: AffiliateAgentGatewayClaims,
  now: Date,
  isPostEffectCompletionAllowed: boolean,
  isTrustedFailureRecording: boolean,
  isTerminalReplay: boolean,
): void => {
  if (
    !isPostEffectCompletionAllowed &&
    !isTrustedFailureRecording &&
    !isTerminalReplay &&
    claim.hardDeadlineAt < now
  ) {
    throw gatewayError(
      "HARD_DEADLINE_EXCEEDED",
      "The claim hard deadline has passed.",
    );
  }
  if (
    !isPostEffectCompletionAllowed &&
    !isTrustedFailureRecording &&
    !isTerminalReplay &&
    claim.tokenExpiresAt <= now
  ) {
    throw gatewayError("TOKEN_EXPIRED", "The claim token has expired.");
  }
};

const assertClaimStatus = (
  claim: AffiliateAgentGatewayClaims,
  isTerminalReplay: boolean,
  terminalReplayReceiptId: string | undefined,
): void => {
  if (claim.tokenInvalidatedAt !== null && !isTerminalReplay) {
    throw gatewayError("TOKEN_INVALIDATED", "The claim token is invalidated.");
  }
  if (claim.status === "ACTIVE") return;
  const isValidTerminalReplay =
    isTerminalReplay &&
    (claim.status === "COMPLETED" ||
      claim.status === "FAILED" ||
      claim.status === "EXPIRED") &&
    claim.terminalReceiptId === terminalReplayReceiptId;
  if (!isValidTerminalReplay) {
    throw gatewayError("CLAIM_NOT_ACTIVE", "The claim is not active.");
  }
};

const assertClaimSupplyContract = (
  activeBundle: AffiliateAgentContractBundle,
  claim: AffiliateAgentGatewayClaims,
): void => {
  if (
    activeBundle.supplyContract.version !== claim.supplyContractVersion ||
    activeBundle.supplyContract.hash !== claim.supplyContractHash
  ) {
    throw gatewayError(
      "SUPPLY_CONTRACT_STALE",
      "The active Supply Contract changed after the claim.",
    );
  }
};
const assertClaimDeploymentContract = (
  activeBundle: AffiliateAgentContractBundle,
  claim: AffiliateAgentGatewayClaims,
): void => {
  if (
    activeBundle.deploymentContract.version !==
      claim.deploymentContractVersion ||
    activeBundle.deploymentContract.hash !== claim.deploymentContractHash
  ) {
    throw gatewayError(
      "DEPLOYMENT_CONTRACT_STALE",
      "The active deployment contract changed after the claim.",
    );
  }
};

const assertClaimLease = (
  claim: AffiliateAgentGatewayClaims,
  now: Date,
  isPostEffectCompletionAllowed: boolean,
  isTrustedFailureRecording: boolean,
  isTerminalReplay: boolean,
): void => {
  if (
    !isPostEffectCompletionAllowed &&
    !isTrustedFailureRecording &&
    !isTerminalReplay &&
    claim.leaseExpiresAt <= now
  ) {
    throw gatewayError("LEASE_EXPIRED", "The claim lease has expired.");
  }
};


const assertClaimRoleContract = (
  roleContract: AffiliateAgentRoleContract,
  claim: AffiliateAgentGatewayClaims,
): void => {
  if (
    roleContract.version !== claim.roleContractVersion ||
    roleContract.hash !== claim.roleContractHash ||
    roleContract.promptTemplateVersion !== claim.promptTemplateVersion ||
    roleContract.promptTemplateHash !== claim.promptTemplateHash
  ) {
    throw gatewayError(
      "DEPLOYMENT_CONTRACT_STALE",
      "The active role or prompt contract changed after the claim.",
    );
  }
};

const loadAuthorizedContracts = async (
  dependencies: AffiliateAgentGatewayDependencies,
  claim: AffiliateAgentGatewayClaims,
  role: AffiliateAgentClaimAuthorization["role"],
): Promise<Readonly<{
  bundle: AffiliateAgentContractBundle;
  roleContract: AffiliateAgentRoleContract;
}> > => {
  const bundle = parseSupportedContractBundle(
    await dependencies.contracts.loadActiveBundle(),
  );
  assertClaimSupplyContract(bundle, claim);
  assertClaimDeploymentContract(bundle, claim);
  const roleContract = activeRoleContract(bundle, role);
  assertClaimRoleContract(roleContract, claim);
  return { bundle, roleContract };
};

const assertClaimRequiresLifecycle = async (
  transaction: Prisma.TransactionClient,
  claim: AffiliateAgentGatewayClaims,
): Promise<void> => {
  if (claim.role === "COVERAGE_PLANNER") return;
  const job = await transaction.affiliateAgentGatewayJobs.findUnique({
    where: { id: claim.jobId },
  });
  jobSupplySourceId(job);
  if (claim.lifecycleGeneration === null) {
    throw gatewayError(
      "LIFECYCLE_GENERATION_STALE",
      "Non-coverage claims require a Supply Source lifecycle generation.",
    );
  }
};

const assertClaimLifecycleGeneration = async (
  dependencies: AffiliateAgentGatewayDependencies,
  transaction: Prisma.TransactionClient,
  claim: AffiliateAgentGatewayClaims,
  isTrustedFailureRecording: boolean,
): Promise<void> => {
  if (claim.lifecycleGeneration === null || isTrustedFailureRecording) return;
  const supplySourceId = jobSupplySourceId(
    await transaction.affiliateAgentGatewayJobs.findUnique({
      where: { id: claim.jobId },
    }),
  );
  if (dependencies.lifecycle.kind !== "AVAILABLE") {
    throw gatewayError(
      "LIFECYCLE_GENERATION_STALE",
      "The Supply Source lifecycle is not available.",
    );
  }
  const currentGeneration = await readLifecycleGenerationInTransaction(
    transaction,
    supplySourceId,
  );
  const hasAdvance = await hasRecordedLifecycleAdvance(
    transaction,
    claim,
    currentGeneration,
  );
  if (
    currentGeneration !== claim.lifecycleGeneration &&
    !hasAdvance
  ) {
    throw gatewayError(
      "LIFECYCLE_GENERATION_STALE",
      "The Supply Source lifecycle generation changed after the claim.",
    );
  }
};

const isTerminalReplayJobMatch = (
  claim: AffiliateAgentGatewayClaims,
  job: AffiliateAgentGatewayJobs,
  terminalReplayReceiptId: string | undefined,
): boolean => {
  if (
    job.claimGeneration !== claim.claimGeneration ||
    job.terminalReceiptId !== terminalReplayReceiptId ||
    claim.terminalReceiptId !== terminalReplayReceiptId
  ) {
    return false;
  }
  if (claim.status === "COMPLETED") {
    return (
      job.status === "COMPLETED" &&
      job.activeClaimId === null
    );
  }
  if (claim.status === "FAILED" || claim.status === "EXPIRED") {
    return (
      (job.status === "RETRY_WAIT" || job.status === "PIPELINE_BLOCKED") &&
      job.activeClaimId === null
    );
  }
  return false;
};

const isActiveClaimJobMatch = (
  claim: AffiliateAgentGatewayClaims,
  job: AffiliateAgentGatewayJobs,
): boolean =>
  job.status === "CLAIMED" &&
  job.activeClaimId === claim.id &&
  job.claimGeneration === claim.claimGeneration;

function assertAuthorizedJob(
  claim: AffiliateAgentGatewayClaims,
  job: AffiliateAgentGatewayJobs | null,
  isTerminalReplay: boolean,
  terminalReplayReceiptId: string | undefined,
): asserts job is AffiliateAgentGatewayJobs {
  const matches =
    job !== null &&
    (isTerminalReplay
      ? isTerminalReplayJobMatch(claim, job, terminalReplayReceiptId)
      : isActiveClaimJobMatch(claim, job));
  if (!matches) {
    throw gatewayError("CLAIM_NOT_ACTIVE", "The claim is not active.");
  }
}

const parseAuthorizedClaimEnvelope = (
  claim: AffiliateAgentGatewayClaims,
): AffiliateAgentClaimEnvelope => {
  const envelopeResult = affiliateAgentClaimEnvelopeSchema.safeParse(
    claim.claimEnvelopeJson,
  );
  if (
    !envelopeResult.success ||
    hashAffiliateAgentValue(envelopeResult.data) !== claim.claimEnvelopeHash
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored claim envelope failed its integrity check.",
    );
  }
  return envelopeResult.data;
};

const authorizeClaimOperation = async (
  dependencies: AffiliateAgentGatewayDependencies,
  authorization: AffiliateAgentClaimAuthorization,
  now: Date,
  transaction: Prisma.TransactionClient,
  options: ClaimAuthorizationOptions = {},
): Promise<AuthorizedClaim> => {
  const claim = await transaction.affiliateAgentGatewayClaims.findUnique({
    where: { id: authorization.claimId },
  });
  if (!claim) {
    throw gatewayError("CLAIM_NOT_FOUND", "The claim does not exist.");
  }
  assertClaimToken(dependencies, authorization, claim, options);
  assertClaimIdentity(authorization, claim);
  const isTerminalReplay = options.terminalReplayReceiptId !== undefined;
  const isTrustedFailureRecording = options.isTrustedFailureRecording === true;
  const completionReceiptId = claimCompletionReceiptId(options);
  const isPostEffectCompletionAllowed =
    await assertPostEffectCompletionReceipt(
      transaction,
      claim,
      completionReceiptId,
    );
  assertClaimExpiryWindow(
    claim,
    now,
    isPostEffectCompletionAllowed,
    isTrustedFailureRecording,
    isTerminalReplay,
  );
  assertClaimStatus(
    claim,
    isTerminalReplay,
    options.terminalReplayReceiptId,
  );
  assertClaimLease(
    claim,
    now,
    isPostEffectCompletionAllowed,
    isTrustedFailureRecording,
    isTerminalReplay,
  );
  const { bundle, roleContract } = await loadAuthorizedContracts(
    dependencies,
    claim,
    authorization.role,
  );
  await assertClaimRequiresLifecycle(transaction, claim);
  await assertClaimLifecycleGeneration(
    dependencies,
    transaction,
    claim,
    isTrustedFailureRecording,
  );
  const authorizationNow = dependencies.clock.now();
  assertClaimExpiryWindow(
    claim,
    authorizationNow,
    isPostEffectCompletionAllowed,
    isTrustedFailureRecording,
    isTerminalReplay,
  );
  assertClaimLease(
    claim,
    authorizationNow,
    isPostEffectCompletionAllowed,
    isTrustedFailureRecording,
    isTerminalReplay,
  );
  const job = await transaction.affiliateAgentGatewayJobs.findUnique({
    where: { id: claim.jobId },
  });
  assertAuthorizedJob(
    claim,
    job,
    isTerminalReplay,
    options.terminalReplayReceiptId,
  );
  return {
    claim,
    job,
    envelope: parseAuthorizedClaimEnvelope(claim),
    bundle,
    roleContract,
  };
};
const authorizeClaimOperationInSerializableTransaction = (
  dependencies: AffiliateAgentGatewayDependencies,
  authorization: AffiliateAgentClaimAuthorization,
  now: Date,
  options: ClaimAuthorizationOptions = {},
): Promise<AuthorizedClaim> =>
  runSerializableEffectTransaction(
    dependencies,
    (transaction) =>
      authorizeClaimOperation(
        dependencies,
        authorization,
        now,
        transaction,
        options,
      ),
    {
      code: "INTERNAL_ERROR",
      safeMessage: "The claim could not be authorized.",
    },
  );

const jobSupplySourceId = (job: AffiliateAgentGatewayJobs | null): string => {
  if (!job?.supplySourceId) {
    throw gatewayError(
      "LIFECYCLE_GENERATION_STALE",
      "The claim has no Supply Source lifecycle scope.",
    );
  }
  return job.supplySourceId;
};
const assertClaimEvidenceRefs = async (
  transaction: Prisma.TransactionClient,
  claimId: string,
  evidenceRefs: readonly string[],
  errorCode: ConstructorParameters<
    typeof AffiliateAgentGatewayError
  >[0]["code"],
  safeMessage: string,
): Promise<void> => {
  const uniqueEvidenceRefs = [...new Set(evidenceRefs)];
  const artifacts =
    uniqueEvidenceRefs.length === 0
      ? []
      : await transaction.affiliateAgentGatewayArtifacts.findMany({
          where: {
            claimId,
            evidenceRef: { in: uniqueEvidenceRefs },
          },
          select: { evidenceRef: true },
        });
  const found = new Set(artifacts.map((artifact) => artifact.evidenceRef));
  if (
    found.size !== uniqueEvidenceRefs.length ||
    uniqueEvidenceRefs.some((ref) => !found.has(ref))
  ) {
    throw gatewayError(errorCode, safeMessage);
  }
};

const replayHeartbeat = (
  response: Prisma.JsonValue | null,
): AffiliateAgentHeartbeatResult => {
  if (
    response === null ||
    typeof response !== "object" ||
    Array.isArray(response) ||
    response.kind !== "HEARTBEAT_ACCEPTED" ||
    typeof response.receiptId !== "string" ||
    typeof response.heartbeatAt !== "string" ||
    typeof response.leaseExpiresAt !== "string"
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored heartbeat receipt is invalid.",
    );
  }
  return {
    kind: "HEARTBEAT_ACCEPTED",
    receiptId: response.receiptId,
    heartbeatAt: response.heartbeatAt,
    leaseExpiresAt: response.leaseExpiresAt,
  };
};

const resolveHeartbeatReplay = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  input: Extract<AffiliateAgentClaimOperation, { kind: "HEARTBEAT" }>,
  requestHash: string,
): Promise<AffiliateAgentHeartbeatResult | undefined> => {
  const existing =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: {
        claimId_idempotencyKey: {
          claimId: authorized.claim.id,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
  if (!existing) return undefined;
  if (
    existing.operationKind !== input.kind ||
    existing.requestHash !== requestHash
  ) {
    throw gatewayError(
      "IDEMPOTENCY_KEY_REUSED",
      "The operation idempotency key was used for different input.",
    );
  }
  if (existing.status === "SUCCEEDED") {
    return replayHeartbeat(existing.responseJson);
  }
  throw gatewayError(
    "OPERATION_IN_PROGRESS",
    "The operation is still in progress.",
    true,
  );
};

const executeHeartbeatTransaction = (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "HEARTBEAT" }>,
  requestHash: string,
): Promise<AffiliateAgentHeartbeatResult> =>
  dependencies.prisma.$transaction(
    async (transaction) => {
      const authorized = await authorizeClaimOperation(
        dependencies,
        input.authorization,
        dependencies.clock.now(),
        transaction,
      );
      const replay = await resolveHeartbeatReplay(
        transaction,
        authorized,
        input,
        requestHash,
      );
      if (replay) return replay;
      const now = dependencies.clock.now();
      if (
        authorized.claim.leaseExpiresAt <= now ||
        authorized.claim.hardDeadlineAt < now
      ) {
        throw gatewayError(
          authorized.claim.hardDeadlineAt < now
            ? "HARD_DEADLINE_EXCEEDED"
            : "LEASE_EXPIRED",
          "The claim expired before the heartbeat could be recorded.",
        );
      }
      const leaseExpiresAt = new Date(
        Math.min(
          addSeconds(now, AFFILIATE_AGENT_LEASE_SECONDS).getTime(),
          authorized.claim.hardDeadlineAt.getTime(),
        ),
      );
      const receiptId = dependencies.identifiers.create("receipt");
      const heartbeatResult: AffiliateAgentHeartbeatResult = {
        kind: "HEARTBEAT_ACCEPTED",
        receiptId,
        heartbeatAt: now.toISOString(),
        leaseExpiresAt: leaseExpiresAt.toISOString(),
      };
      const heartbeatUpdated =
        await transaction.affiliateAgentGatewayClaims.updateMany({
          where: {
            id: authorized.claim.id,
            status: "ACTIVE",
            claimGeneration: authorized.claim.claimGeneration,
            tokenInvalidatedAt: null,
            leaseExpiresAt: { gt: now },
            hardDeadlineAt: { gte: now },
          },
          data: {
            lastHeartbeatAt: now,
            leaseExpiresAt,
          },
        });
      if (heartbeatUpdated.count !== 1) {
        throw gatewayError(
          "CLAIM_NOT_ACTIVE",
          "The heartbeat lost the active claim compare-and-set.",
        );
      }
      await dependencies.workerHealth?.heartbeat({
        workerId: authorized.claim.workerId,
        role: authorized.claim.role as AffiliateAgentRole,
        now,
        leaseExpiresAt,
        database: affiliateSupplyDatabase(transaction),
      });
      const jobUpdated =
        await transaction.affiliateAgentGatewayJobs.updateMany({
          where: {
            id: authorized.job.id,
            status: "CLAIMED",
            activeClaimId: authorized.claim.id,
            claimGeneration: authorized.claim.claimGeneration,
            eventSequence: authorized.job.eventSequence,
          },
          data: { eventSequence: { increment: 1 } },
        });
      if (jobUpdated.count !== 1) {
        throw new AffiliateAgentClaimRaceError();
      }
      await transaction.affiliateAgentGatewayOperationReceipts.create({
        data: {
          id: receiptId,
          claimId: authorized.claim.id,
          jobId: authorized.job.id,
          claimGeneration: authorized.claim.claimGeneration,
          idempotencyKey: input.idempotencyKey,
          operationKind: input.kind,
          requestHash,
          status: "SUCCEEDED",
          responseHash: hashAffiliateAgentValue(heartbeatResult),
          responseJson: asPrismaJson(heartbeatResult),
          startedAt: now,
          completedAt: now,
          retentionClass: "INDEFINITE",
        },
      });
      await transaction.affiliateAgentGatewayEvents.create({
        data: {
          id: dependencies.identifiers.create("event"),
          eventKey: `heartbeat:${receiptId}`,
          jobId: authorized.job.id,
          claimId: authorized.claim.id,
          receiptId,
          sequence: authorized.job.eventSequence + 1,
          eventType: "CLAIM_HEARTBEAT_ACCEPTED",
          actorKind: "AGENT_INVOCATION",
          actorId: authorized.claim.invocationId,
          role: authorized.claim.role,
          requestHash,
          outputHash: hashAffiliateAgentValue(heartbeatResult),
          payload: asPrismaJson({
            leaseExpiresAt: leaseExpiresAt.toISOString(),
          }),
          retentionClass: "INDEFINITE",
        },
      });
      return heartbeatResult;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

const performHeartbeat = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "HEARTBEAT" }>,
): Promise<AffiliateAgentHeartbeatResult> => {
  assertIdentifier(input.idempotencyKey, "Operation idempotency key");
  const requestHash = operationRequestHash(input);
  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await executeHeartbeatTransaction(
        dependencies,
        input,
        requestHash,
      );
    } catch (error) {
      const retryableConflict =
        error instanceof AffiliateAgentClaimRaceError ||
        isSerializableTransactionConflict(error) ||
        isOperationReceiptUniqueConflict(error);
      if (retryableConflict && attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS) {
        continue;
      }
      if (error instanceof AffiliateAgentGatewayError) throw error;
      throw gatewayErrorForPersistenceFailure(
        error,
        "INTERNAL_ERROR",
        "The Affiliate Agent heartbeat could not be completed.",
        retryableConflict,
      );
    }
  }
  throw gatewayError(
    "INTERNAL_ERROR",
    "The Affiliate Agent heartbeat could not be completed.",
    true,
  );
};

const MAXIMUM_GATEWAY_ARTIFACT_BYTES = 8 * 1024 * 1024;
const MAXIMUM_GATEWAY_SAFE_OUTPUT_BYTES = 16_384;

const parseBoundedSafeOutput = (
  value: unknown,
  receiptId: string,
): Readonly<Record<string, unknown>> => {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid safe output.");
    }
    const canonical = canonicalizeAffiliateAgentValue(value);
    if (
      Buffer.byteLength(canonical, "utf8") > MAXIMUM_GATEWAY_SAFE_OUTPUT_BYTES
    ) {
      throw new Error("Unbounded safe output.");
    }
    return JSON.parse(canonical) as Readonly<Record<string, unknown>>;
  } catch {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The command returned invalid or unbounded safe output.",
      false,
      receiptId,
    );
  }
};

const assertArtifactContentIntegrity = (
  artifact: Readonly<{
    contentHash: string;
    mimeType: string;
    byteSize: number;
  }>,
  read: Readonly<{
    bytes: Uint8Array;
    mimeType: string;
    byteSize: number;
  }>,
): void => {
  if (
    artifact.byteSize > MAXIMUM_GATEWAY_ARTIFACT_BYTES ||
    read.byteSize > MAXIMUM_GATEWAY_ARTIFACT_BYTES ||
    read.byteSize !== read.bytes.byteLength ||
    read.byteSize !== artifact.byteSize ||
    read.mimeType !== artifact.mimeType ||
    createHash("sha256").update(read.bytes).digest("hex") !==
      artifact.contentHash
  ) {
    throw gatewayError(
      "ARTIFACT_INTEGRITY_FAILED",
      "The artifact failed its content integrity check.",
    );
  }
};

const assertSafeArtifactUrl = (
  urlValue: string | null,
  label: "source" | "final",
): void => {
  if (urlValue === null) return;
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw gatewayError(
      "ARTIFACT_INTEGRITY_FAILED",
      `The artifact ${label} URL is invalid.`,
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username !== "" ||
    url.password !== "" ||
    urlValue.length > 2_048
  ) {
    throw gatewayError(
      "ARTIFACT_INTEGRITY_FAILED",
      `The artifact ${label} URL is not safe.`,
    );
  }
};


const verifyArtifactRead = (
  artifact: Readonly<{
    contentHash: string;
    mimeType: string;
    byteSize: number;
  }>,
  read: Readonly<{
    bytes: Uint8Array;
    mimeType: string;
    byteSize: number;
    sourceUrl: string | null;
    finalUrl?: string | null;
  }>,
): void => {
  assertArtifactContentIntegrity(artifact, read);
  assertSafeArtifactUrl(read.sourceUrl, "source");
  assertSafeArtifactUrl(read.finalUrl ?? null, "final");
};

const storedArtifactReadUrl = (
  value: unknown,
  label: "source" | "final",
): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw gatewayError(
      "ARTIFACT_INTEGRITY_FAILED",
      `The stored artifact ${label} URL is invalid.`,
    );
  }
  assertSafeArtifactUrl(value, label);
  return value;
};

const artifactReadMetadataFromReceipt = (
  response: Prisma.JsonValue | null,
): Readonly<{ sourceUrl: string | null; finalUrl: string | null }> => {
  if (!isGatewayRecord(response) || response.kind !== "ARTIFACT_READ") {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored artifact-read receipt is invalid.",
    );
  }
  return {
    sourceUrl: storedArtifactReadUrl(response.sourceUrl, "source"),
    finalUrl: storedArtifactReadUrl(response.finalUrl, "final"),
  };
};

const failArtifactReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receiptId: string,
  now: Date,
): Promise<void> => {
  await dependencies.prisma.affiliateAgentGatewayOperationReceipts.updateMany({
    where: { id: receiptId, status: "PENDING" },
    data: {
      status: "FAILED",
      safeErrorCode: "ARTIFACT_INTEGRITY_FAILED",
      completedAt: now,
      reconcileAfter: null,
    },
  });
};
const failStaleArtifactReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receiptId: string,
  now: Date,
): Promise<boolean> => {
  const failed =
    await dependencies.prisma.affiliateAgentGatewayOperationReceipts.updateMany(
      {
        where: {
          id: receiptId,
          operationKind: "READ_ARTIFACT",
          status: "PENDING",
        },
        data: {
          status: "FAILED",
          safeErrorCode: "ARTIFACT_READ_INTERRUPTED",
          completedAt: now,
          reconcileAfter: null,
        },
      },
    );
  return failed.count === 1;
};

const performArtifactRead = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "READ_ARTIFACT" }>,
): Promise<AffiliateAgentArtifactReadResult> => {
  assertIdentifier(input.idempotencyKey, "Operation idempotency key");
  assertIdentifier(input.evidenceRef, "Evidence reference");
  const now = dependencies.clock.now();
  const requestHash = operationRequestHash(input);
  const reserved = await runSerializableEffectTransaction(
    dependencies,
    async (transaction) => {
      const authorized = await authorizeClaimOperation(
        dependencies,
        input.authorization,
        now,
        transaction,
      );
      const existing =
        await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
          where: {
            claimId_idempotencyKey: {
              claimId: authorized.claim.id,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
      if (existing) {
        if (
          existing.operationKind !== input.kind ||
          existing.requestHash !== requestHash
        ) {
          throw gatewayError(
            "IDEMPOTENCY_KEY_REUSED",
            "The operation idempotency key was used for different input.",
          );
        }
        if (existing.status === "PENDING") {
          throw gatewayError(
            "OPERATION_IN_PROGRESS",
            "The artifact read is still in progress.",
            true,
          );
        }
        if (existing.status !== "SUCCEEDED") {
          throw gatewayError(
            "ARTIFACT_INTEGRITY_FAILED",
            "The prior artifact read failed its integrity check.",
          );
        }
        const artifact =
          await transaction.affiliateAgentGatewayArtifacts.findUnique({
            where: {
              claimId_evidenceRef: {
                claimId: authorized.claim.id,
                evidenceRef: input.evidenceRef,
              },
            },
          });
        if (!artifact) {
          throw gatewayError(
            "ARTIFACT_NOT_PERMITTED",
            "The artifact is not in the claim evidence manifest.",
          );
        }
        return {
          authorized,
          artifact,
          receiptId: existing.id,
          replayResponseJson: existing.responseJson,
          isReplayed: true,
        };
      }

      const artifact =
        await transaction.affiliateAgentGatewayArtifacts.findUnique({
          where: {
            claimId_evidenceRef: {
              claimId: authorized.claim.id,
              evidenceRef: input.evidenceRef,
            },
          },
        });
      if (!artifact) {
        throw gatewayError(
          "ARTIFACT_NOT_PERMITTED",
          "The artifact is not in the claim evidence manifest.",
        );
      }
      if (artifact.byteSize > MAXIMUM_GATEWAY_ARTIFACT_BYTES) {
        throw gatewayError(
          "ARTIFACT_INTEGRITY_FAILED",
          "The artifact exceeds the gateway byte limit.",
        );
      }
      const receiptId = dependencies.identifiers.create("receipt");
      await transaction.affiliateAgentGatewayOperationReceipts.create({
        data: {
          id: receiptId,
          claimId: authorized.claim.id,
          jobId: authorized.job.id,
          claimGeneration: authorized.claim.claimGeneration,
          idempotencyKey: input.idempotencyKey,
          operationKind: input.kind,
          requestHash,
          status: "PENDING",
          startedAt: now,
          reconcileAfter: addSeconds(
            now,
            AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
          ),
          retentionClass: "INDEFINITE",
        },
      });
      return {
        authorized,
        artifact,
        receiptId,
        replayResponseJson: null,
        isReplayed: false,
      };
    },
    {
      code: "INTERNAL_ERROR",
      safeMessage: "The artifact read could not be reserved.",
    },
  );

  let read;
  try {
    read = await dependencies.artifacts.readImmutable({
      fileId: reserved.artifact.fileId,
      maximumBytes: MAXIMUM_GATEWAY_ARTIFACT_BYTES,
    });
    verifyArtifactRead(reserved.artifact, read);
  } catch (error) {
    await failArtifactReceipt(dependencies, reserved.receiptId, now);
    if (error instanceof AffiliateAgentGatewayError) throw error;
    throw gatewayErrorForPersistenceFailure(
      error,
      "ARTIFACT_INTEGRITY_FAILED",
      "The artifact could not be read safely.",
    );
  }
  const replayMetadata = reserved.isReplayed
    ? artifactReadMetadataFromReceipt(reserved.replayResponseJson)
    : null;
  const responseSourceUrl = reserved.isReplayed
    ? replayMetadata!.sourceUrl
    : read.sourceUrl;
  const responseFinalUrl = reserved.isReplayed
    ? replayMetadata!.finalUrl
    : read.finalUrl ?? null;

  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      await dependencies.prisma.$transaction(
        async (transaction) => {
          const authorized = await authorizeClaimOperation(
            dependencies,
            input.authorization,
            dependencies.clock.now(),
            transaction,
          );
          if (reserved.isReplayed) return;
          const responseMetadata = {
            kind: "ARTIFACT_READ" as const,
            receiptId: reserved.receiptId,
            evidenceRef: input.evidenceRef,
            sha256: reserved.artifact.contentHash,
            mimeType: reserved.artifact.mimeType,
            byteSize: reserved.artifact.byteSize,
            sourceUrl: read.sourceUrl,
            finalUrl: read.finalUrl ?? null,
          };
          const completed =
            await transaction.affiliateAgentGatewayOperationReceipts.updateMany(
              {
                where: {
                  id: reserved.receiptId,
                  status: "PENDING",
                  requestHash,
                },
                data: {
                  status: "SUCCEEDED",
                  responseHash: hashAffiliateAgentValue(responseMetadata),
                  responseJson: asPrismaJson(responseMetadata),
                  completedAt: dependencies.clock.now(),
                  reconcileAfter: null,
                },
              },
            );
          if (completed.count !== 1) {
            throw gatewayError(
              "OPERATION_IN_PROGRESS",
              "The artifact receipt could not be completed.",
              true,
            );
          }
          const jobUpdated =
            await transaction.affiliateAgentGatewayJobs.updateMany({
              where: {
                id: authorized.job.id,
                status: "CLAIMED",
                activeClaimId: authorized.claim.id,
                claimGeneration: authorized.claim.claimGeneration,
                eventSequence: authorized.job.eventSequence,
              },
              data: { eventSequence: { increment: 1 } },
            });
          if (jobUpdated.count !== 1) {
            throw new AffiliateAgentClaimRaceError();
          }
          await transaction.affiliateAgentGatewayEvents.create({
            data: {
              id: dependencies.identifiers.create("event"),
              eventKey: `artifact-read:${reserved.receiptId}`,
              jobId: authorized.job.id,
              claimId: authorized.claim.id,
              receiptId: reserved.receiptId,
              sequence: authorized.job.eventSequence + 1,
              eventType: "CLAIM_ARTIFACT_READ",
              actorKind: "AGENT_INVOCATION",
              actorId: authorized.claim.invocationId,
              role: authorized.claim.role,
              requestHash,
              outputHash: reserved.artifact.contentHash,
              payload: asPrismaJson({
                evidenceRef: input.evidenceRef,
                byteSize: reserved.artifact.byteSize,
              }),
              retentionClass: "INDEFINITE",
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      break;
    } catch (error) {
      if (
        (error instanceof AffiliateAgentClaimRaceError ||
          isSerializableTransactionConflict(error)) &&
        attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS
      ) {
        continue;
      }
      if (error instanceof AffiliateAgentGatewayError) throw error;
      throw gatewayErrorForPersistenceFailure(
        error,
        "INTERNAL_ERROR",
        "The artifact receipt could not be completed.",
        true,
      );
    }
  }

  return {
    kind: "ARTIFACT_READ",
    receiptId: reserved.receiptId,
    evidenceRef: input.evidenceRef,
    sha256: reserved.artifact.contentHash,
    mimeType: reserved.artifact.mimeType,
    byteSize: reserved.artifact.byteSize,
    sourceUrl: responseSourceUrl,
    finalUrl: responseFinalUrl,
    bytes: read.bytes,
  };
};

const assertStoredCommandResponseStrings = (
  response: Record<string, unknown>,
): void => {
  if (
    typeof response.receiptId !== "string" ||
    typeof response.commandType !== "string" ||
    typeof response.responseHash !== "string"
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored command receipt is invalid.",
    );
  }
};

const assertStoredCommandResponseSafeOutput = (
  response: Record<string, unknown>,
): void => {
  if (
    response.safeOutput !== null &&
    (!isGatewayRecord(response.safeOutput) ||
      Array.isArray(response.safeOutput))
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored command receipt is invalid.",
    );
  }
};

const parseStoredCommandResponse = (
  response: Prisma.JsonValue | null,
): Record<string, unknown> => {
  if (!isGatewayRecord(response) || response.kind !== "COMMAND_SUCCEEDED") {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored command receipt is invalid.",
    );
  }
  assertStoredCommandResponseStrings(response);
  assertStoredCommandResponseSafeOutput(response);
  return response;
};

const parseStoredCommandType = (
  commandType: string,
): Extract<
  AffiliateAgentCommand["type"],
  | "RUN_DISCOVERY_QUERY"
  | "CAPTURE_CLAIM_URL"
  | "VALIDATE_DECLARATIVE_PACKAGE"
  | "COMMIT_DECLARATIVE_PACKAGE"
  | "EXECUTE_RECORDED_LIFECYCLE_COMMAND"
> => {
  const parsed = (
    [
      "RUN_DISCOVERY_QUERY",
      "CAPTURE_CLAIM_URL",
      "VALIDATE_DECLARATIVE_PACKAGE",
      "COMMIT_DECLARATIVE_PACKAGE",
      "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
    ] as const
  ).find((candidate) => candidate === commandType);
  if (!parsed) {
    throw gatewayError("INTERNAL_ERROR", "The stored command type is invalid.");
  }
  return parsed;
};

const replayCommand = (
  response: Prisma.JsonValue | null,
): AffiliateAgentCommandResult => {
  const parsed = parseStoredCommandResponse(response);
  const commandType = parseStoredCommandType(parsed.commandType as string);
  const safeOutput =
    parsed.safeOutput === null
      ? null
      : (JSON.parse(
          canonicalizeAffiliateAgentValue(parsed.safeOutput),
        ) as Readonly<Record<string, unknown>>);
  return {
    kind: "COMMAND_SUCCEEDED",
    receiptId: parsed.receiptId as string,
    commandType,
    responseHash: parsed.responseHash as string,
    safeOutput,
  };
};

type AffiliateAgentExternalCommand = Extract<
  AffiliateAgentCommand,
  { type: "CAPTURE_CLAIM_URL" | "RUN_DISCOVERY_QUERY" }
>;

type RecoveredExternalOutput = Readonly<{
  evidenceRef: string;
  artifactId: string;
  sha256: string;
  mimeType: string;
  byteSize: number;
  captureMetadata?: AffiliateAgentCaptureMetadata;
}>;

const throwRecoveredExternalOutputError = (): never => {
  throw gatewayError(
    "PARTIAL_COMMAND_UNRESOLVED",
    "The recovered external command output is invalid.",
  );
};

const assertRecoveredExternalOutputKeys = (
  value: Record<string, unknown>,
): void => {
  const allowedKeys: Readonly<Record<string, true>> = {
    artifactId: true,
    byteSize: true,
    captureMetadata: true,
    evidenceRef: true,
    mimeType: true,
    sha256: true,
  };
  if (Object.keys(value).some((key) => allowedKeys[key] !== true)) {
    throwRecoveredExternalOutputError();
  }
};

const assertRecoveredExternalOutputIdentity = (
  value: Record<string, unknown>,
): void => {
  if (
    typeof value.evidenceRef !== "string" ||
    !value.evidenceRef.trim() ||
    value.evidenceRef.length > 200 ||
    typeof value.artifactId !== "string" ||
    !value.artifactId.trim() ||
    value.artifactId.length > 200 ||
    typeof value.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sha256)
  ) {
    throwRecoveredExternalOutputError();
  }
};

const assertRecoveredExternalOutputMimeType = (
  value: Record<string, unknown>,
): void => {
  if (
    typeof value.mimeType !== "string" ||
    value.mimeType.length === 0 ||
    value.mimeType.length > 200
  ) {
    throwRecoveredExternalOutputError();
  }
};

const assertRecoveredExternalOutputByteSize = (
  value: Record<string, unknown>,
): void => {
  if (
    typeof value.byteSize !== "number" ||
    !Number.isInteger(value.byteSize) ||
    value.byteSize < 0 ||
    value.byteSize > MAXIMUM_GATEWAY_ARTIFACT_BYTES
  ) {
    throwRecoveredExternalOutputError();
  }
};

const parseRecoveredExternalOutput = (
  value: Readonly<Record<string, unknown>>,
  commandType: AffiliateAgentExternalCommand["type"],
): RecoveredExternalOutput => {
  if (!isGatewayRecord(value)) {
    throwRecoveredExternalOutputError();
  }
  assertRecoveredExternalOutputKeys(value);
  assertRecoveredExternalOutputIdentity(value);
  assertRecoveredExternalOutputMimeType(value);
  assertRecoveredExternalOutputByteSize(value);
  let captureMetadata: AffiliateAgentCaptureMetadata | undefined;
  if (value.captureMetadata !== undefined) {
    if (commandType !== "CAPTURE_CLAIM_URL") {
      throwRecoveredExternalOutputError();
    }
    try {
      captureMetadata = parseAffiliateAgentCaptureMetadata(value.captureMetadata);
    } catch {
      throwRecoveredExternalOutputError();
    }
  }
  return {
    evidenceRef: value.evidenceRef as string,
    artifactId: value.artifactId as string,
    sha256: value.sha256 as string,
    mimeType: value.mimeType as string,
    byteSize: value.byteSize as number,
    ...(captureMetadata === undefined ? {} : { captureMetadata }),
  };
};

const ensureExternalArtifact = async (
  transaction: Prisma.TransactionClient,
  input: Readonly<{
    claimId: string;
    claimGeneration: number;
    evidenceKind: "CAPTURED_PAGE" | "PROVIDER_RESULT";
    output: RecoveredExternalOutput;
    rowId: string;
    receiptId: string;
  }>,
): Promise<void> => {
  const where = {
    claimId_evidenceRef: {
      claimId: input.claimId,
      evidenceRef: input.output.evidenceRef,
    },
  };
  const assertExactArtifact = (
    artifact: Readonly<{
      claimGeneration: number;
      evidenceKind: string;
      sourceArtifactId: string;
      fileId: string;
      contentHash: string;
      mimeType: string;
      byteSize: number;
      creatingClaimId: string | null;
    }> | null,
  ): void => {
    if (
      !artifact ||
      artifact.claimGeneration !== input.claimGeneration ||
      artifact.evidenceKind !== input.evidenceKind ||
      artifact.sourceArtifactId !== input.output.artifactId ||
      artifact.fileId !== input.output.artifactId ||
      artifact.contentHash !== input.output.sha256 ||
      artifact.mimeType !== input.output.mimeType ||
      artifact.byteSize !== input.output.byteSize ||
      artifact.creatingClaimId !== input.claimId
    ) {
      throw gatewayError(
        "PARTIAL_COMMAND_UNRESOLVED",
        "The recovered artifact conflicts with stored claim evidence.",
        false,
        input.receiptId,
      );
    }
  };
  const existing = await transaction.affiliateAgentGatewayArtifacts.findUnique({
    where,
  });
  if (existing) {
    assertExactArtifact(existing);
    return;
  }
  const inserted = await transaction.affiliateAgentGatewayArtifacts.createMany({
    data: [
      {
        id: input.rowId,
        claimId: input.claimId,
        claimGeneration: input.claimGeneration,
        evidenceRef: input.output.evidenceRef,
        evidenceKind: input.evidenceKind,
        sourceArtifactId: input.output.artifactId,
        fileId: input.output.artifactId,
        contentHash: input.output.sha256,
        mimeType: input.output.mimeType,
        byteSize: input.output.byteSize,
        creatingClaimId: input.claimId,
      },
    ],
    skipDuplicates: true,
  });
  if (inserted.count === 1) return;
  assertExactArtifact(
    await transaction.affiliateAgentGatewayArtifacts.findUnique({ where }),
  );
};

const resolveExternalReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: AffiliateAgentExternalCommand,
  requestHash: string,
) => {
      const existing =
        await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
          where: {
            claimId_idempotencyKey: {
              claimId: authorized.claim.id,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
      const now = dependencies.clock.now();
      if (existing) {
        if (
          existing.operationKind !== input.kind ||
          existing.commandName !== command.type ||
          existing.requestHash !== requestHash
        ) {
          throw gatewayError(
            "IDEMPOTENCY_KEY_REUSED",
            "The operation idempotency key was used for different input.",
          );
        }
        if (existing.status === "SUCCEEDED") {
          return {
            kind: "COMPLETED" as const,
            result: replayCommand(existing.responseJson),
          };
        }
        if (
          existing.status !== "PENDING" ||
          typeof existing.externalOperationKey !== "string"
        ) {
          throw gatewayError(
            "PARTIAL_COMMAND_UNRESOLVED",
            "The capture command requires reconciliation.",
            false,
            existing.id,
          );
        }
        if (existing.reconcileAfter === null || existing.reconcileAfter > now) {
          throw gatewayError(
            "OPERATION_IN_PROGRESS",
            "The external command is still in progress.",
            true,
            existing.id,
          );
        }
        return {
          kind: "RESERVED" as const,
          receiptId: existing.id,
          externalOperationKey: existing.externalOperationKey,
          isReplayed: true,
          claimId: authorized.claim.id,
          jobId: authorized.job.id,
          claimGeneration: authorized.claim.claimGeneration,
          envelope: authorized.envelope,
          invocationId: authorized.claim.invocationId,
          role: authorized.claim.role,
        };
      }
  return null;
};
type PriorExternalReplayContext = Readonly<{
  priorReceipt: AffiliateAgentGatewayOperationReceipts;
  priorOutput: RecoveredExternalOutput;
  expectedEvidenceKind: "PROVIDER_RESULT" | "CAPTURED_PAGE";
}>;

const loadPriorSucceededExternalReceipt = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  command: AffiliateAgentExternalCommand,
  commandHash: string,
): Promise<AffiliateAgentGatewayOperationReceipts | null> => {
  const priorSucceededEvent =
    await transaction.affiliateAgentGatewayEvents.findFirst({
      where: {
        jobId: authorized.job.id,
        eventType: "EXTERNAL_COMMAND_SUCCEEDED",
        inputHash: commandHash,
        receiptId: { not: null },
      },
      orderBy: [{ sequence: "desc" }],
    });
  if (!priorSucceededEvent?.receiptId) return null;
  const priorReceipt =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: priorSucceededEvent.receiptId },
    });
  if (
    !priorReceipt ||
    priorReceipt.status !== "SUCCEEDED" ||
    priorReceipt.jobId !== authorized.job.id ||
    priorReceipt.commandName !== command.type ||
    priorReceipt.operationKind !== "EXECUTE_COMMAND"
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The prior external command receipt is invalid.",
      false,
      priorSucceededEvent.receiptId,
    );
  }
  return priorReceipt;
};

const loadPriorExternalOutput = (
  priorReceipt: AffiliateAgentGatewayOperationReceipts,
  command: AffiliateAgentExternalCommand,
): RecoveredExternalOutput => {
  const priorResult = replayCommand(priorReceipt.responseJson);
  if (
    priorResult.commandType !== command.type ||
    priorResult.safeOutput === null
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The prior external command output is invalid.",
      false,
      priorReceipt.id,
    );
  }
  try {
    return parseRecoveredExternalOutput(priorResult.safeOutput, command.type);
  } catch {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The prior external command output is invalid.",
      false,
      priorReceipt.id,
    );
  }
};

const assertPriorExternalArtifact = (
  artifact: Awaited<
    ReturnType<
      Prisma.TransactionClient["affiliateAgentGatewayArtifacts"]["findUnique"]
    >
  >,
  priorReceipt: AffiliateAgentGatewayOperationReceipts,
  priorOutput: RecoveredExternalOutput,
  expectedEvidenceKind: "PROVIDER_RESULT" | "CAPTURED_PAGE",
): void => {
  if (
    !artifact ||
    artifact.claimGeneration !== priorReceipt.claimGeneration ||
    artifact.evidenceKind !== expectedEvidenceKind ||
    artifact.sourceArtifactId !== priorOutput.artifactId ||
    artifact.fileId !== priorOutput.artifactId ||
    artifact.contentHash !== priorOutput.sha256 ||
    artifact.mimeType !== priorOutput.mimeType ||
    artifact.byteSize !== priorOutput.byteSize
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The prior external command artifact is invalid.",
      false,
      priorReceipt.id,
    );
  }
};

const loadPriorExternalReplayContext = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  command: AffiliateAgentExternalCommand,
  commandHash: string,
): Promise<PriorExternalReplayContext | null> => {
  const priorReceipt = await loadPriorSucceededExternalReceipt(
    transaction,
    authorized,
    command,
    commandHash,
  );
  if (!priorReceipt) return null;
  const priorOutput = loadPriorExternalOutput(priorReceipt, command);
  const expectedEvidenceKind =
    command.type === "RUN_DISCOVERY_QUERY"
      ? "PROVIDER_RESULT"
      : "CAPTURED_PAGE";
  const priorArtifact =
    await transaction.affiliateAgentGatewayArtifacts.findUnique({
      where: {
        claimId_evidenceRef: {
          claimId: priorReceipt.claimId,
          evidenceRef: priorOutput.evidenceRef,
        },
      },
    });
  assertPriorExternalArtifact(
    priorArtifact,
    priorReceipt,
    priorOutput,
    expectedEvidenceKind,
  );
  return { priorReceipt, priorOutput, expectedEvidenceKind };
};

const completePriorExternalReplay = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: AffiliateAgentExternalCommand,
  requestHash: string,
  commandHash: string,
  now: Date,
  context: PriorExternalReplayContext,
) => {
  const receiptId = dependencies.identifiers.create("receipt");
  const responseHash = hashAffiliateAgentValue({
    commandType: command.type,
    safeOutput: context.priorOutput,
  });
  const commandResult: AffiliateAgentCommandResult = {
    kind: "COMMAND_SUCCEEDED",
    receiptId,
    commandType: command.type,
    responseHash,
    safeOutput: context.priorOutput,
  };
  const jobUpdated =
    await transaction.affiliateAgentGatewayJobs.updateMany({
      where: {
        id: authorized.job.id,
        status: "CLAIMED",
        activeClaimId: authorized.claim.id,
        claimGeneration: authorized.claim.claimGeneration,
        eventSequence: authorized.job.eventSequence,
      },
      data: { eventSequence: { increment: 1 } },
    });
  if (jobUpdated.count !== 1) throw new AffiliateAgentClaimRaceError();
  await ensureExternalArtifact(transaction, {
    claimId: authorized.claim.id,
    claimGeneration: authorized.claim.claimGeneration,
    evidenceKind: context.expectedEvidenceKind,
    output: context.priorOutput,
    rowId: dependencies.identifiers.create("artifact"),
    receiptId,
  });
  await transaction.affiliateAgentGatewayOperationReceipts.create({
    data: {
      id: receiptId,
      claimId: authorized.claim.id,
      jobId: authorized.job.id,
      claimGeneration: authorized.claim.claimGeneration,
      idempotencyKey: input.idempotencyKey,
      operationKind: input.kind,
      commandName: command.type,
      requestHash,
      status: "SUCCEEDED",
      responseHash,
      responseJson: asPrismaJson(commandResult),
      startedAt: now,
      completedAt: now,
      retentionClass: "INDEFINITE",
    },
  });
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `external-command-replayed:${receiptId}`,
      jobId: authorized.job.id,
      claimId: authorized.claim.id,
      receiptId,
      sequence: authorized.job.eventSequence + 1,
      eventType: "EXTERNAL_COMMAND_SUCCEEDED",
      actorKind: "AGENT_INVOCATION",
      actorId: authorized.claim.invocationId,
      role: authorized.claim.role,
      requestHash,
      inputHash: commandHash,
      outputHash: responseHash,
      payload: asPrismaJson({
        evidenceRef: context.priorOutput.evidenceRef,
        replayedFromReceiptId: context.priorReceipt.id,
      }),
      retentionClass: "INDEFINITE",
    },
  });
  return { kind: "COMPLETED" as const, result: commandResult };
};

const replayPriorExternalCommand = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: AffiliateAgentExternalCommand,
  requestHash: string,
  commandHash: string,
  now: Date,
) => {
  const context = await loadPriorExternalReplayContext(
    transaction,
    authorized,
    command,
    commandHash,
  );
  if (!context) return null;
  return completePriorExternalReplay(
    transaction,
    dependencies,
    authorized,
    input,
    command,
    requestHash,
    commandHash,
    now,
    context,
  );
};
const createExternalReservation = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: AffiliateAgentExternalCommand,
  requestHash: string,
  commandHash: string,
  now: Date,
) => {
      const receiptId = dependencies.identifiers.create("receipt");
      const externalOperationKey =
        dependencies.identifiers.create("external-operation");
      const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany(
        {
          where: {
            id: authorized.job.id,
            status: "CLAIMED",
            activeClaimId: authorized.claim.id,
            claimGeneration: authorized.claim.claimGeneration,
            eventSequence: authorized.job.eventSequence,
          },
          data: { eventSequence: { increment: 1 } },
        },
      );
      if (jobUpdated.count !== 1) throw new AffiliateAgentClaimRaceError();
      await transaction.affiliateAgentGatewayOperationReceipts.create({
        data: {
          id: receiptId,
          claimId: authorized.claim.id,
          jobId: authorized.job.id,
          claimGeneration: authorized.claim.claimGeneration,
          idempotencyKey: input.idempotencyKey,
          operationKind: input.kind,
          commandName: command.type,
          requestHash,
          status: "PENDING",
          externalOperationKey,
          startedAt: now,
          reconcileAfter: addSeconds(
            now,
            AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
          ),
          retentionClass: "INDEFINITE",
        },
      });
      await transaction.affiliateAgentGatewayEvents.create({
        data: {
          id: dependencies.identifiers.create("event"),
          eventKey: `external-command-reserved:${receiptId}`,
          jobId: authorized.job.id,
          claimId: authorized.claim.id,
          receiptId,
          sequence: authorized.job.eventSequence + 1,
          eventType: "EXTERNAL_COMMAND_RESERVED",
          actorKind: "AGENT_INVOCATION",
          actorId: authorized.claim.invocationId,
          role: authorized.claim.role,
          requestHash,
          inputHash: commandHash,
          payload: asPrismaJson({ commandType: command.type }),
          retentionClass: "INDEFINITE",
        },
      });
      return {
        kind: "RESERVED" as const,
        receiptId,
        externalOperationKey,
        isReplayed: false,
        claimId: authorized.claim.id,
        jobId: authorized.job.id,
        claimGeneration: authorized.claim.claimGeneration,
        envelope: authorized.envelope,
        invocationId: authorized.claim.invocationId,
        role: authorized.claim.role,
      };
};
const reserveExternalCommandTransaction = (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: AffiliateAgentExternalCommand,
  requestHash: string,
  commandHash: string,
) =>
  runSerializableEffectTransaction(
    dependencies,
    async (transaction) => {
      const authorized = await authorizeClaimOperation(
        dependencies,
        input.authorization,
        dependencies.clock.now(),
        transaction,
      );
      if (
        !authorized.roleContract.permittedCommands.includes(command.type) ||
        !authorized.claim.permittedCommands.includes(command.type)
      ) {
        throw gatewayError(
          "COMMAND_NOT_PERMITTED",
          "The external command is not permitted for this claim.",
        );
      }
      const existingResolution = await resolveExternalReceipt(
        dependencies,
        transaction,
        authorized,
        input,
        command,
        requestHash,
      );
      if (existingResolution) return existingResolution;
      const now = dependencies.clock.now();

      const pendingExternalReceipt =
        await transaction.affiliateAgentGatewayOperationReceipts.findFirst({
          where: {
            claimId: authorized.claim.id,
            status: "PENDING",
            commandName: {
              in: ["CAPTURE_CLAIM_URL", "RUN_DISCOVERY_QUERY"],
            },
          },
          orderBy: { id: "asc" },
          select: { id: true },
        });
      if (pendingExternalReceipt) {
        throw gatewayError(
          "PARTIAL_COMMAND_UNRESOLVED",
          "A prior external command requires reconciliation before another can start.",
          false,
          pendingExternalReceipt.id,
        );
      }
      const adapterIsInstalled =
        command.type === "RUN_DISCOVERY_QUERY"
          ? dependencies.commands.external.RUN_DISCOVERY_QUERY !== undefined
          : dependencies.commands.external.CAPTURE_CLAIM_URL !== undefined;
      if (!adapterIsInstalled) {
        throw gatewayError(
          "COMMAND_NOT_PERMITTED",
          "The external command has no installed adapter.",
        );
      }

      const claimListedRefs =
        command.type === "RUN_DISCOVERY_QUERY"
          ? [command.data.strategyRef, command.data.queryRef]
          : [command.data.urlRef, command.data.captureProfileRef];
      await assertClaimEvidenceRefs(
        transaction,
        authorized.claim.id,
        [...new Set(claimListedRefs)],
        "COMMAND_NOT_PERMITTED",
        "The external command references data outside the claim manifest.",
      );
      const priorResult = await replayPriorExternalCommand(
        transaction,
        dependencies,
        authorized,
        input,
        command,
        requestHash,
        commandHash,
        now,
      );
      if (priorResult) return priorResult;

      return createExternalReservation(
        transaction,
        dependencies,
        authorized,
        input,
        command,
        requestHash,
        commandHash,
        now,
      );
    },
    {
      code: "INTERNAL_ERROR",
      safeMessage: "The external command could not be reserved.",
    },
  );

const invokeExternalCommandAdapter = async (
  dependencies: AffiliateAgentGatewayDependencies,
  reserved: Readonly<{
    receiptId: string;
    externalOperationKey: string;
    isReplayed: boolean;
    envelope: AffiliateAgentClaimEnvelope;
  }>,
  command: AffiliateAgentExternalCommand,
): Promise<Readonly<Record<string, unknown>> | null> => {
  try {
    if (command.type === "RUN_DISCOVERY_QUERY") {
      const adapter = dependencies.commands.external.RUN_DISCOVERY_QUERY;
      if (!adapter) {
        throw gatewayError(
          "COMMAND_NOT_PERMITTED",
          "The discovery command has no installed external adapter.",
        );
      }
      return reserved.isReplayed
        ? await adapter.recover(reserved.externalOperationKey)
        : await adapter.start(reserved.externalOperationKey, {
            claim: reserved.envelope,
            command,
          });
    }
    const adapter = dependencies.commands.external.CAPTURE_CLAIM_URL;
    if (!adapter) {
      throw gatewayError(
        "COMMAND_NOT_PERMITTED",
        "The capture command has no installed external adapter.",
      );
    }
    return reserved.isReplayed
      ? await adapter.recover(reserved.externalOperationKey)
      : await adapter.start(reserved.externalOperationKey, {
          claim: reserved.envelope,
          command,
        });
  } catch (error) {
    if (error instanceof AffiliateAgentGatewayError) throw error;
    throw gatewayErrorForPersistenceFailure(
      error,
      "PARTIAL_COMMAND_UNRESOLVED",
      "The external command response was lost and requires recovery.",
      true,
      reserved.receiptId,
    );
  }
};

const readExternalCommandCapture = async (
  dependencies: AffiliateAgentGatewayDependencies,
  recovered: Readonly<Record<string, unknown>> | null,
  commandType: AffiliateAgentExternalCommand["type"],
  receiptId: string,
): Promise<RecoveredExternalOutput> => {
  if (recovered === null) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The external command effect is unknown and requires reconciliation.",
      false,
      receiptId,
    );
  }
  try {
    const capture = parseRecoveredExternalOutput(recovered, commandType);
    const artifactRead = await dependencies.artifacts.readImmutable({
      fileId: capture.artifactId,
      maximumBytes: MAXIMUM_GATEWAY_ARTIFACT_BYTES,
    });
    verifyArtifactRead(
      {
        contentHash: capture.sha256,
        mimeType: capture.mimeType,
        byteSize: capture.byteSize,
      },
      artifactRead,
    );
    return capture;
  } catch (error) {
    if (error instanceof AffiliateAgentGatewayError) throw error;
    throw gatewayErrorForPersistenceFailure(
      error,
      "PARTIAL_COMMAND_UNRESOLVED",
      "The external command evidence could not be verified.",
      true,
      receiptId,
    );
  }
};

type ExternalCommandReservation = Exclude<
  Awaited<ReturnType<typeof reserveExternalCommandTransaction>>,
  { kind: "COMPLETED" }
>;

type ExternalFinalizationState =
  | Readonly<{
      kind: "REPLAY";
      result: AffiliateAgentCommandResult;
    }>
  | Readonly<{
      kind: "PENDING";
      receipt: AffiliateAgentGatewayOperationReceipts;
      claim: AffiliateAgentGatewayClaims;
      job: AffiliateAgentGatewayJobs;
    }>;

function assertExternalReceiptIdentity(
  receipt: AffiliateAgentGatewayOperationReceipts | null,
  reserved: ExternalCommandReservation,
  command: AffiliateAgentExternalCommand,
  requestHash: string,
): asserts receipt is AffiliateAgentGatewayOperationReceipts {
  if (
    !receipt ||
    receipt.claimId !== reserved.claimId ||
    receipt.jobId !== reserved.jobId ||
    receipt.claimGeneration !== reserved.claimGeneration ||
    receipt.commandName !== command.type ||
    receipt.requestHash !== requestHash
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The external command receipt requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
}

function assertExternalClaimCanFinalize(
  claim: AffiliateAgentGatewayClaims | null,
  receipt: AffiliateAgentGatewayOperationReceipts,
  reserved: ExternalCommandReservation,
  now: Date,
): asserts claim is AffiliateAgentGatewayClaims {
  if (!claim || claim.status !== "ACTIVE") {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The capture claim requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
  if (
    (claim.leaseExpiresAt <= now && receipt.startedAt >= claim.leaseExpiresAt) ||
    (claim.hardDeadlineAt < now && receipt.startedAt >= claim.hardDeadlineAt)
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The capture claim requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
}

function assertExternalJobCanFinalize(
  job: AffiliateAgentGatewayJobs | null,
  reserved: ExternalCommandReservation,
): asserts job is AffiliateAgentGatewayJobs {
  if (!job || job.status !== "CLAIMED") {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The capture claim requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
  if (job.activeClaimId !== reserved.claimId) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The capture claim requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
  if (job.claimGeneration !== reserved.claimGeneration) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The capture claim requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
}

const loadExternalFinalizationState = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  reserved: ExternalCommandReservation,
  command: AffiliateAgentExternalCommand,
  requestHash: string,
): Promise<ExternalFinalizationState> => {
  const receipt =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: reserved.receiptId },
    });
  assertExternalReceiptIdentity(receipt, reserved, command, requestHash);
  if (receipt.status === "SUCCEEDED") {
    return { kind: "REPLAY", result: replayCommand(receipt.responseJson) };
  }
  if (receipt.status !== "PENDING") {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The capture receipt requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
  const [claim, job] = await Promise.all([
    transaction.affiliateAgentGatewayClaims.findUnique({
      where: { id: reserved.claimId },
    }),
    transaction.affiliateAgentGatewayJobs.findUnique({
      where: { id: reserved.jobId },
    }),
  ]);
  const finalizationNow = dependencies.clock.now();
  assertExternalClaimCanFinalize(claim, receipt, reserved, finalizationNow);
  assertExternalJobCanFinalize(job, reserved);
  return { kind: "PENDING", receipt, claim, job };
};

const externalArtifactEvidenceKind = (
  command: AffiliateAgentExternalCommand,
): "PROVIDER_RESULT" | "CAPTURED_PAGE" =>
  command.type === "RUN_DISCOVERY_QUERY" ? "PROVIDER_RESULT" : "CAPTURED_PAGE";

const coveragePlanningWaveFor = async (
  transaction: Prisma.TransactionClient,
  jobId: string,
): Promise<unknown> => {
  if (!("affiliateReplenishmentWaves" in transaction)) return null;
  const coverageWaves = transaction.affiliateReplenishmentWaves;
  if (
    !coverageWaves
    || typeof coverageWaves !== "object"
    || !("findFirst" in coverageWaves)
    || typeof coverageWaves.findFirst !== "function"
  ) {
    return null;
  }
  return coverageWaves.findFirst({
    where: { coveragePlanningJobId: jobId },
    select: { id: true },
  });
};

type DiscoveryProviderInput = Readonly<{
  provider: string;
  query: string;
  providerOutput: unknown;
}>;

const decodeDiscoveryProviderInput = async (
  dependencies: AffiliateAgentGatewayDependencies,
  reserved: ExternalCommandReservation,
  capture: RecoveredExternalOutput,
): Promise<DiscoveryProviderInput> => {
  try {
    const providerRead = await dependencies.artifacts.readImmutable({
      fileId: capture.artifactId,
      maximumBytes: MAXIMUM_GATEWAY_ARTIFACT_BYTES,
    });
    verifyArtifactRead(
      {
        contentHash: capture.sha256,
        mimeType: capture.mimeType,
        byteSize: capture.byteSize,
      },
      providerRead,
    );
    const providerOutput = JSON.parse(Buffer.from(providerRead.bytes).toString("utf8"));
    const providerRecord = isGatewayRecord(providerOutput)
      ? providerOutput
      : {};
    const request = isGatewayRecord(providerRecord.request)
      ? providerRecord.request
      : {};
    return {
      provider: typeof providerRecord.provider === "string"
        ? providerRecord.provider
        : "",
      query: typeof request.query === "string" ? request.query : "",
      providerOutput,
    };
  } catch (error) {
    if (error instanceof AffiliateAgentGatewayError) throw error;
    throw gatewayErrorForPersistenceFailure(
      error,
      "INTERNAL_ERROR",
      "The discovery provider output could not be decoded.",
      false,
      reserved.receiptId,
    );
  }
};

const materializeExternalDiscovery = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  reserved: ExternalCommandReservation,
  command: AffiliateAgentExternalCommand,
  capture: RecoveredExternalOutput,
  claim: AffiliateAgentGatewayClaims,
  coverageWave: unknown,
  completedAt: Date,
): Promise<Awaited<ReturnType<typeof materializeAffiliateCoverageDiscoveryResult>> | null> => {
  if (command.type !== "RUN_DISCOVERY_QUERY" || !coverageWave) return null;
  const { provider, query, providerOutput } =
    await decodeDiscoveryProviderInput(dependencies, reserved, capture);
  const envelope = parseClaimEnvelope(claim);
  if (!envelope) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The discovery claim envelope is invalid.",
      false,
      reserved.receiptId,
    );
  }
  return materializeAffiliateCoverageDiscoveryResult({
    database: affiliateSupplyDatabase(transaction),
    gatewayJobId: reserved.jobId,
    claimId: reserved.claimId,
    claimGeneration: reserved.claimGeneration,
    receiptId: reserved.receiptId,
    provider,
    query,
    providerOutput,
    evidenceManifest: envelope.evidenceManifest,
    providerEvidence: {
      evidenceRef: capture.evidenceRef,
      artifactId: capture.artifactId,
      sha256: capture.sha256,
      mimeType: capture.mimeType,
      byteSize: capture.byteSize,
    },
    now: completedAt,
  });
};

const completeExternalCommandFinalization = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  reserved: ExternalCommandReservation,
  command: AffiliateAgentExternalCommand,
  requestHash: string,
  commandHash: string,
  capture: RecoveredExternalOutput,
  responseHash: string,
  commandResult: AffiliateAgentCommandResult,
  completedAt: Date,
  state: Extract<ExternalFinalizationState, { kind: "PENDING" }>,
): Promise<AffiliateAgentCommandResult> => {
  await ensureExternalArtifact(transaction, {
    claimId: reserved.claimId,
    claimGeneration: reserved.claimGeneration,
    evidenceKind: externalArtifactEvidenceKind(command),
    output: capture,
    rowId: dependencies.identifiers.create("artifact"),
    receiptId: reserved.receiptId,
  });
  const discoveryMaterialization = await materializeExternalDiscovery(
    transaction,
    dependencies,
    reserved,
    command,
    capture,
    state.claim,
    await coveragePlanningWaveFor(transaction, reserved.jobId),
    completedAt,
  );
  const receiptUpdated =
    await transaction.affiliateAgentGatewayOperationReceipts.updateMany({
      where: {
        id: reserved.receiptId,
        status: "PENDING",
        requestHash,
      },
      data: {
        status: "SUCCEEDED",
        responseHash,
        responseJson: asPrismaJson(commandResult),
        completedAt,
        reconcileAfter: null,
      },
    });
  const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany({
    where: {
      id: reserved.jobId,
      status: "CLAIMED",
      activeClaimId: reserved.claimId,
      claimGeneration: reserved.claimGeneration,
      eventSequence: state.job.eventSequence,
    },
    data: { eventSequence: { increment: 1 } },
  });
  if (receiptUpdated.count !== 1 || jobUpdated.count !== 1) {
    throw new AffiliateAgentClaimRaceError();
  }
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `external-command-succeeded:${reserved.receiptId}`,
      jobId: reserved.jobId,
      claimId: reserved.claimId,
      receiptId: reserved.receiptId,
      sequence: state.job.eventSequence + 1,
      eventType: "EXTERNAL_COMMAND_SUCCEEDED",
      actorKind: "AGENT_INVOCATION",
      actorId: reserved.invocationId,
      role: reserved.role,
      requestHash,
      inputHash: commandHash,
      outputHash: responseHash,
      payload: asPrismaJson({
        evidenceRef: capture.evidenceRef,
        ...(discoveryMaterialization
          ? { discoveryMaterialization }
          : {}),
      }),
      retentionClass: "INDEFINITE",
    },
  });
  return commandResult;
};

const finalizeExternalCommand = (
  dependencies: AffiliateAgentGatewayDependencies,
  reserved: ExternalCommandReservation,
  command: AffiliateAgentExternalCommand,
  requestHash: string,
  commandHash: string,
  capture: RecoveredExternalOutput,
  responseHash: string,
  commandResult: AffiliateAgentCommandResult,
  completedAt: Date,
): Promise<AffiliateAgentCommandResult> =>
  runSerializableEffectTransaction(
    dependencies,
    async (transaction) => {
      const state = await loadExternalFinalizationState(
        transaction,
        dependencies,
        reserved,
        command,
        requestHash,
      );
      if (state.kind === "REPLAY") return state.result;
      return completeExternalCommandFinalization(
        transaction,
        dependencies,
        reserved,
        command,
        requestHash,
        commandHash,
        capture,
        responseHash,
        commandResult,
        completedAt,
        state,
      );
    },
    {
      code: "PARTIAL_COMMAND_UNRESOLVED",
      safeMessage: "The external command could not be finalized.",
      receiptId: reserved.receiptId,
    },
  );

const performExternalCommand = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: AffiliateAgentExternalCommand,
): Promise<AffiliateAgentCommandResult> => {
  const requestHash = operationRequestHash(input);
  const commandHash = hashAffiliateAgentValue(command);
  const reserved = await reserveExternalCommandTransaction(
    dependencies,
    input,
    command,
    requestHash,
    commandHash,
  );
  if (reserved.kind === "COMPLETED") return reserved.result;

  const recovered = await invokeExternalCommandAdapter(
    dependencies,
    reserved,
    command,
  );
  const capture = await readExternalCommandCapture(
    dependencies,
    recovered,
    command.type,
    reserved.receiptId,
  );
  const safeOutput = capture;
  const responseHash = hashAffiliateAgentValue({
    commandType: command.type,
    safeOutput,
  });
  const commandResult: AffiliateAgentCommandResult = {
    kind: "COMMAND_SUCCEEDED",
    receiptId: reserved.receiptId,
    commandType: command.type,
    responseHash,
    safeOutput,
  };
  const completedAt = dependencies.clock.now();
  return finalizeExternalCommand(
    dependencies,
    reserved,
    command,
    requestHash,
    commandHash,
    capture,
    responseHash,
    commandResult,
    completedAt,
  );
};

type AvailableLifecycleAuthority = Extract<
  AffiliateAgentGatewayDependencies["lifecycle"],
  { kind: "AVAILABLE" }
>;

type LifecycleIdentity = Readonly<{
  caseId: string;
  decisionHash: string;
  recordedHumanActorId: string;
  commandRef: string;
}>;
type HumanDirectedExecutorSubject = Extract<
  AffiliateAgentSubject,
  { type: "HUMAN_DIRECTED_EXECUTOR" }
>;

const assertHumanDirectedExecutorSubject = (
  subject: AffiliateAgentSubject,
): HumanDirectedExecutorSubject => {
  if (subject.type !== "HUMAN_DIRECTED_EXECUTOR") {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The lifecycle command requires a human-directed executor subject.",
    );
  }
  return subject;
};


const assertLifecycleCommandRole = (
  authorized: AuthorizedClaim,
  command: Extract<
    AffiliateAgentCommand,
    { type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" }
  >,
): void => {
  if (
    authorized.envelope.role !== "HUMAN_DIRECTED_EXECUTOR" ||
    !authorized.roleContract.permittedCommands.includes(command.type) ||
    !authorized.claim.permittedCommands.includes(command.type)
  ) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The lifecycle command is not permitted for this claim.",
    );
  }
};

const assertLifecycleCommandSubject = (
  authorized: AuthorizedClaim,
  command: Extract<
    AffiliateAgentCommand,
    { type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" }
  >,
): HumanDirectedExecutorSubject => {
  const subject = assertHumanDirectedExecutorSubject(
    authorized.envelope.subject,
  );
  if (
    command.data.caseId !== subject.caseId ||
    command.data.decisionHash !== subject.decisionHash ||
    command.data.lifecycleCommandRef !== subject.lifecycleCommandRef ||
    authorized.claim.lifecycleGeneration === null
  ) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The lifecycle command does not match the recorded human decision.",
    );
  }
  return subject;
};
const requireLifecycleGeneration = (authorized: AuthorizedClaim): number => {
  const generation = authorized.claim.lifecycleGeneration;
  if (generation === null) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The lifecycle command does not match the recorded human decision.",
    );
  }
  return generation;
};


const assertLifecycleCommandEvidence = (
  authorized: AuthorizedClaim,
): void => {
  const evidenceKinds = authorized.envelope.evidenceManifest.entries.map(
    (entry) => entry.kind,
  );
  if (
    !evidenceKinds.includes("HUMAN_DECISION") ||
    !evidenceKinds.includes("REVIEWER_EVIDENCE")
  ) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The lifecycle command lacks human decision or reviewer evidence.",
    );
  }
};

const assertResolvedLifecycleIdentity = (
  resolved: LifecycleIdentity | null,
  expected: LifecycleIdentity,
): void => {
  if (
    resolved === null ||
    resolved.caseId !== expected.caseId ||
    resolved.decisionHash !== expected.decisionHash ||
    resolved.recordedHumanActorId !== expected.recordedHumanActorId ||
    resolved.commandRef !== expected.commandRef
  ) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The lifecycle command does not match the recorded authority.",
    );
  }
};

const admitLifecycleCommand = async (
  authority: AvailableLifecycleAuthority,
  authorized: AuthorizedClaim,
  command: Extract<
    AffiliateAgentCommand,
    { type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" }
  >,
) => {
  assertLifecycleCommandRole(authorized, command);
  const subject = assertLifecycleCommandSubject(authorized, command);
  assertLifecycleCommandEvidence(authorized);
  const lifecycleIdentity: LifecycleIdentity = {
    caseId: subject.caseId,
    decisionHash: subject.decisionHash,
    recordedHumanActorId: subject.recordedHumanActorId,
    commandRef: command.data.lifecycleCommandRef,
  };
  const resolvedLifecycleIdentity =
    await authority.resolveRecordedCommand(lifecycleIdentity);
  assertResolvedLifecycleIdentity(
    resolvedLifecycleIdentity,
    lifecycleIdentity,
  );
  return { subject, lifecycleIdentity };
};

const resolveLifecycleReceipt = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: Extract<
    AffiliateAgentCommand,
    { type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" }
  >,
  requestHash: string,
  now: Date,
  lifecycleIdentity: LifecycleIdentity,
) => {
  const existing =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: {
        claimId_idempotencyKey: {
          claimId: authorized.claim.id,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
  if (!existing) return null;
  if (
    existing.operationKind !== input.kind ||
    existing.commandName !== command.type ||
    existing.requestHash !== requestHash
  ) {
    throw gatewayError(
      "IDEMPOTENCY_KEY_REUSED",
      "The operation idempotency key was used for different input.",
    );
  }
  if (existing.status === "SUCCEEDED") {
    return {
      kind: "COMPLETED" as const,
      result: replayCommand(existing.responseJson),
    };
  }
  if (existing.status !== "PENDING") {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The lifecycle command requires reconciliation.",
      false,
      existing.id,
    );
  }
  if (existing.reconcileAfter === null || existing.reconcileAfter > now) {
    throw gatewayError(
      "OPERATION_IN_PROGRESS",
      "The lifecycle command is still in progress.",
      true,
      existing.id,
    );
  }
  return {
    kind: "RESERVED" as const,
    receiptId: existing.id,
    isReplayed: true,
    claimId: authorized.claim.id,
    jobId: authorized.job.id,
    claimGeneration: authorized.claim.claimGeneration,
    expectedGeneration: requireLifecycleGeneration(authorized),
    supplyContractVersion: authorized.envelope.supplyContractVersion,
    supplyContractHash: authorized.envelope.supplyContractHash,
    inputHash: hashAffiliateAgentValue(command),
    identity: lifecycleIdentity,
    commandRef: command.data.lifecycleCommandRef,
    recordedHumanActorId: lifecycleIdentity.recordedHumanActorId,
    invocationId: authorized.claim.invocationId,
    role: authorized.claim.role,
  };
};

type PriorLifecycleReplay = Readonly<{
  priorReceipt: AffiliateAgentGatewayOperationReceipts;
  priorResult: AffiliateAgentCommandResult;
}>;

const parsePriorLifecycleResult = (
  priorReceipt: AffiliateAgentGatewayOperationReceipts,
  command: Extract<
    AffiliateAgentCommand,
    { type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" }
  >,
  expectedGeneration: number,
): AffiliateAgentCommandResult | null => {
  try {
    const priorResult = replayCommand(priorReceipt.responseJson);
    if (
      priorResult.commandType !== command.type ||
      priorResult.safeOutput === null ||
      priorResult.safeOutput.lifecycleGeneration !== expectedGeneration
    ) {
      return null;
    }
    return priorResult;
  } catch {
    return null;
  }
};

const hasLifecycleReplayPayload = (
  priorEvent: Awaited<
    ReturnType<
      Prisma.TransactionClient["affiliateAgentGatewayEvents"]["findFirst"]
    >
  >,
  command: Extract<
    AffiliateAgentCommand,
    { type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" }
  >,
  recordedHumanActorId: string,
): boolean => {
  if (!priorEvent || !isGatewayRecord(priorEvent.payload)) return false;
  return (
    priorEvent.payload.lifecycleCommandRef ===
      command.data.lifecycleCommandRef &&
    priorEvent.payload.recordedHumanActorId === recordedHumanActorId
  );
};

const findPriorLifecycleReplay = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  command: Extract<
    AffiliateAgentCommand,
    { type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" }
  >,
  expectedGeneration: number,
  recordedHumanActorId: string,
): Promise<PriorLifecycleReplay | null> => {
  const priorReceipts =
    await transaction.affiliateAgentGatewayOperationReceipts.findMany({
      where: {
        jobId: authorized.job.id,
        commandName: command.type,
        status: "SUCCEEDED",
      },
    });
  for (const priorReceipt of priorReceipts) {
    if (priorReceipt.claimId === authorized.claim.id) {
      throw gatewayError(
        "LIFECYCLE_GENERATION_STALE",
        "This claim already recorded the lifecycle command.",
        false,
        priorReceipt.id,
      );
    }
    const priorResult = parsePriorLifecycleResult(
      priorReceipt,
      command,
      expectedGeneration,
    );
    if (!priorResult) continue;
    const priorEvent =
      await transaction.affiliateAgentGatewayEvents.findFirst({
        where: {
          receiptId: priorReceipt.id,
          eventType: "LIFECYCLE_COMMAND_SUCCEEDED",
        },
      });
    if (!hasLifecycleReplayPayload(priorEvent, command, recordedHumanActorId)) {
      continue;
    }
    return { priorReceipt, priorResult };
  }
  return null;
};
const findPriorLifecycleReplayForClaim = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  command: Extract<
    AffiliateAgentCommand,
    { type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" }
  >,
  recordedHumanActorId: string,
): Promise<PriorLifecycleReplay | null> => {
  const expectedGeneration = requireLifecycleGeneration(authorized);
  const replay = await findPriorLifecycleReplay(
    transaction,
    authorized,
    command,
    expectedGeneration,
    recordedHumanActorId,
  );
  if (replay) return replay;
  return findPriorLifecycleReplay(
    transaction,
    authorized,
    command,
    expectedGeneration + 1,
    recordedHumanActorId,
  );
};

const completePriorLifecycleReplay = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: Extract<
    AffiliateAgentCommand,
    { type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" }
  >,
  requestHash: string,
  commandHash: string,
  now: Date,
  lifecycle: Readonly<{
    priorReceipt: AffiliateAgentGatewayOperationReceipts;
    priorResult: AffiliateAgentCommandResult;
  }>,
) => {
  const receiptId = dependencies.identifiers.create("receipt");
  const replayedResult: AffiliateAgentCommandResult = {
    ...lifecycle.priorResult,
    receiptId,
  };
  const responseHash = replayedResult.responseHash;
  const jobUpdated =
    await transaction.affiliateAgentGatewayJobs.updateMany({
      where: {
        id: authorized.job.id,
        status: "CLAIMED",
        activeClaimId: authorized.claim.id,
        claimGeneration: authorized.claim.claimGeneration,
        eventSequence: authorized.job.eventSequence,
      },
      data: { eventSequence: { increment: 1 } },
    });
  if (jobUpdated.count !== 1) {
    throw new AffiliateAgentClaimRaceError();
  }
  await transaction.affiliateAgentGatewayOperationReceipts.create({
    data: {
      id: receiptId,
      claimId: authorized.claim.id,
      jobId: authorized.job.id,
      claimGeneration: authorized.claim.claimGeneration,
      idempotencyKey: input.idempotencyKey,
      operationKind: input.kind,
      commandName: command.type,
      requestHash,
      status: "SUCCEEDED",
      responseHash,
      responseJson: asPrismaJson(replayedResult),
      startedAt: now,
      completedAt: now,
      reconcileAfter: null,
      retentionClass: "INDEFINITE",
    },
  });
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `lifecycle-command-replayed:${receiptId}`,
      jobId: authorized.job.id,
      claimId: authorized.claim.id,
      receiptId,
      sequence: authorized.job.eventSequence + 1,
      eventType: "LIFECYCLE_COMMAND_REPLAYED",
      actorKind: "AGENT_INVOCATION",
      actorId: authorized.claim.invocationId,
      role: authorized.claim.role,
      requestHash,
      inputHash: commandHash,
      outputHash: responseHash,
      payload: asPrismaJson({
        lifecycleCommandRef: command.data.lifecycleCommandRef,
        priorReceiptId: lifecycle.priorReceipt.id,
      }),
      retentionClass: "INDEFINITE",
    },
  });
  return {
    kind: "COMPLETED" as const,
    result: replayedResult,
  };
};

const createLifecycleReservation = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: Extract<
    AffiliateAgentCommand,
    { type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" }
  >,
  requestHash: string,
  commandHash: string,
  now: Date,
  subject: HumanDirectedExecutorSubject,
  lifecycleIdentity: LifecycleIdentity,
) => {
  const receiptId = dependencies.identifiers.create("receipt");
  const jobUpdated =
    await transaction.affiliateAgentGatewayJobs.updateMany({
      where: {
        id: authorized.job.id,
        status: "CLAIMED",
        activeClaimId: authorized.claim.id,
        claimGeneration: authorized.claim.claimGeneration,
        eventSequence: authorized.job.eventSequence,
      },
      data: { eventSequence: { increment: 1 } },
    });
  if (jobUpdated.count !== 1) throw new AffiliateAgentClaimRaceError();
  await transaction.affiliateAgentGatewayOperationReceipts.create({
    data: {
      id: receiptId,
      claimId: authorized.claim.id,
      jobId: authorized.job.id,
      claimGeneration: authorized.claim.claimGeneration,
      idempotencyKey: input.idempotencyKey,
      operationKind: input.kind,
      commandName: command.type,
      requestHash,
      status: "PENDING",
      externalOperationKey: `lifecycle:${receiptId}`,
      startedAt: now,
      reconcileAfter: addSeconds(
        now,
        AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
      ),
      retentionClass: "INDEFINITE",
    },
  });
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `lifecycle-command-reserved:${receiptId}`,
      jobId: authorized.job.id,
      claimId: authorized.claim.id,
      receiptId,
      sequence: authorized.job.eventSequence + 1,
      eventType: "LIFECYCLE_COMMAND_RESERVED",
      actorKind: "AGENT_INVOCATION",
      actorId: authorized.claim.invocationId,
      role: authorized.claim.role,
      requestHash,
      inputHash: commandHash,
      payload: asPrismaJson({
        caseId: subject.caseId,
        decisionHash: subject.decisionHash,
        recordedHumanActorId: subject.recordedHumanActorId,
        lifecycleCommandRef: command.data.lifecycleCommandRef,
      }),
      retentionClass: "INDEFINITE",
    },
  });
  return {
    kind: "RESERVED" as const,
    receiptId,
    isReplayed: false,
    claimId: authorized.claim.id,
    jobId: authorized.job.id,
    claimGeneration: authorized.claim.claimGeneration,
    expectedGeneration: requireLifecycleGeneration(authorized),
    supplyContractVersion: authorized.envelope.supplyContractVersion,
    supplyContractHash: authorized.envelope.supplyContractHash,
    inputHash: commandHash,
    identity: lifecycleIdentity,
    commandRef: command.data.lifecycleCommandRef,
    recordedHumanActorId: subject.recordedHumanActorId,
    invocationId: authorized.claim.invocationId,
    role: authorized.claim.role,
  };
};

const reserveLifecycleCommand = (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: Extract<
    AffiliateAgentCommand,
    { type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" }
  >,
  authority: AvailableLifecycleAuthority,
  requestHash: string,
  commandHash: string,
) =>
  runSerializableEffectTransaction(
    dependencies,
    async (transaction) => {
      const authorized = await authorizeClaimOperation(
        dependencies,
        input.authorization,
        dependencies.clock.now(),
        transaction,
      );
      const admission = await admitLifecycleCommand(
        authority,
        authorized,
        command,
      );
      const now = dependencies.clock.now();
      const existing = await resolveLifecycleReceipt(
        transaction,
        dependencies,
        authorized,
        input,
        command,
        requestHash,
        now,
        admission.lifecycleIdentity,
      );
      if (existing) return existing;
      const prior = await findPriorLifecycleReplayForClaim(
        transaction,
        authorized,
        command,
        admission.subject.recordedHumanActorId,
      );
      if (prior) {
        return completePriorLifecycleReplay(
          transaction,
          dependencies,
          authorized,
          input,
          command,
          requestHash,
          commandHash,
          now,
          prior,
        );
      }
      return createLifecycleReservation(
        transaction,
        dependencies,
        authorized,
        input,
        command,
        requestHash,
        commandHash,
        now,
        admission.subject,
        admission.lifecycleIdentity,
      );
    },
    {
      code: "INTERNAL_ERROR",
      safeMessage: "The lifecycle command could not be reserved.",
    },
  );

type LifecycleCommandReservation = Exclude<
  Awaited<ReturnType<typeof reserveLifecycleCommand>>,
  { kind: "COMPLETED" }
>;

type LifecycleFinalizationState =
  | Readonly<{
      kind: "REPLAY";
      result: AffiliateAgentCommandResult;
    }>
  | Readonly<{
      kind: "PENDING";
      receipt: AffiliateAgentGatewayOperationReceipts;
      claim: AffiliateAgentGatewayClaims;
      job: AffiliateAgentGatewayJobs;
    }>;

function assertLifecycleReceiptIdentity(
  receipt: AffiliateAgentGatewayOperationReceipts | null,
  reserved: LifecycleCommandReservation,
  command: Extract<
    AffiliateAgentCommand,
    { type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" }
  >,
  requestHash: string,
): asserts receipt is AffiliateAgentGatewayOperationReceipts {
  if (
    !receipt ||
    receipt.claimId !== reserved.claimId ||
    receipt.jobId !== reserved.jobId ||
    receipt.claimGeneration !== reserved.claimGeneration ||
    receipt.commandName !== command.type ||
    receipt.requestHash !== requestHash
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The lifecycle receipt requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
}

function assertLifecycleClaimCanFinalize(
  claim: AffiliateAgentGatewayClaims | null,
  receipt: AffiliateAgentGatewayOperationReceipts,
  reserved: LifecycleCommandReservation,
  now: Date,
): asserts claim is AffiliateAgentGatewayClaims {
  if (!claim || claim.status !== "ACTIVE") {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The lifecycle claim requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
  if (
    (claim.leaseExpiresAt <= now && receipt.startedAt >= claim.leaseExpiresAt) ||
    (claim.hardDeadlineAt < now && receipt.startedAt >= claim.hardDeadlineAt)
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The lifecycle claim requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
}

function assertLifecycleJobCanFinalize(
  job: AffiliateAgentGatewayJobs | null,
  reserved: LifecycleCommandReservation,
): asserts job is AffiliateAgentGatewayJobs {
  if (!job || job.status !== "CLAIMED") {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The lifecycle claim requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
  if (job.activeClaimId !== reserved.claimId) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The lifecycle claim requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
  if (job.claimGeneration !== reserved.claimGeneration) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The lifecycle claim requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
}

const loadLifecycleFinalizationState = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  reserved: LifecycleCommandReservation,
  command: Extract<
    AffiliateAgentCommand,
    { type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" }
  >,
  requestHash: string,
): Promise<LifecycleFinalizationState> => {
  const receipt =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: reserved.receiptId },
    });
  assertLifecycleReceiptIdentity(receipt, reserved, command, requestHash);
  if (receipt.status === "SUCCEEDED") {
    return { kind: "REPLAY", result: replayCommand(receipt.responseJson) };
  }
  if (receipt.status !== "PENDING") {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The lifecycle receipt requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
  const [claim, job] = await Promise.all([
    transaction.affiliateAgentGatewayClaims.findUnique({
      where: { id: reserved.claimId },
    }),
    transaction.affiliateAgentGatewayJobs.findUnique({
      where: { id: reserved.jobId },
    }),
  ]);
  const finalizationNow = dependencies.clock.now();
  assertLifecycleClaimCanFinalize(claim, receipt, reserved, finalizationNow);
  assertLifecycleJobCanFinalize(job, reserved);
  return { kind: "PENDING", receipt, claim, job };
};

const completeLifecycleFinalization = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  reserved: LifecycleCommandReservation,
  requestHash: string,
  commandResult: AffiliateAgentCommandResult,
  responseHash: string,
  completedAt: Date,
  state: Extract<LifecycleFinalizationState, { kind: "PENDING" }>,
): Promise<AffiliateAgentCommandResult> => {
  const receiptUpdated =
    await transaction.affiliateAgentGatewayOperationReceipts.updateMany({
      where: {
        id: reserved.receiptId,
        status: "PENDING",
        requestHash,
      },
      data: {
        status: "SUCCEEDED",
        responseHash,
        responseJson: asPrismaJson(commandResult),
        completedAt,
        reconcileAfter: null,
      },
    });
  const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany({
    where: {
      id: reserved.jobId,
      status: "CLAIMED",
      activeClaimId: reserved.claimId,
      claimGeneration: reserved.claimGeneration,
      eventSequence: state.job.eventSequence,
    },
    data: { eventSequence: { increment: 1 } },
  });
  if (receiptUpdated.count !== 1 || jobUpdated.count !== 1) {
    throw new AffiliateAgentClaimRaceError();
  }
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `lifecycle-command-succeeded:${reserved.receiptId}`,
      jobId: reserved.jobId,
      claimId: reserved.claimId,
      receiptId: reserved.receiptId,
      sequence: state.job.eventSequence + 1,
      eventType: "LIFECYCLE_COMMAND_SUCCEEDED",
      actorKind: "AGENT_INVOCATION",
      actorId: reserved.invocationId,
      role: reserved.role,
      requestHash,
      inputHash: reserved.inputHash,
      outputHash: responseHash,
      payload: asPrismaJson({
        recordedHumanActorId: reserved.recordedHumanActorId,
        lifecycleCommandRef: reserved.commandRef,
      }),
      retentionClass: "INDEFINITE",
    },
  });
  return commandResult;
};

const finalizeLifecycleCommand = (
  dependencies: AffiliateAgentGatewayDependencies,
  reserved: LifecycleCommandReservation,
  command: Extract<
    AffiliateAgentCommand,
    { type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" }
  >,
  requestHash: string,
  commandResult: AffiliateAgentCommandResult,
  responseHash: string,
  completedAt: Date,
): Promise<AffiliateAgentCommandResult> =>
  runSerializableEffectTransaction(
    dependencies,
    async (transaction) => {
      const state = await loadLifecycleFinalizationState(
        transaction,
        dependencies,
        reserved,
        command,
        requestHash,
      );
      if (state.kind === "REPLAY") return state.result;
      return completeLifecycleFinalization(
        transaction,
        dependencies,
        reserved,
        requestHash,
        commandResult,
        responseHash,
        completedAt,
        state,
      );
    },
    {
      code: "PARTIAL_COMMAND_UNRESOLVED",
      safeMessage: "The lifecycle command could not be finalized.",
      receiptId: reserved.receiptId,
    },
  );

const performLifecycleCommand = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: Extract<
    AffiliateAgentCommand,
    { type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" }
  >,
): Promise<AffiliateAgentCommandResult> => {
  if (dependencies.lifecycle.kind !== "AVAILABLE") {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The lifecycle authority is not installed.",
    );
  }
  const authority = dependencies.lifecycle;
  const requestHash = operationRequestHash(input);
  const commandHash = hashAffiliateAgentValue(command);
  const reserved = await reserveLifecycleCommand(
    dependencies,
    input,
    command,
    authority,
    requestHash,
    commandHash,
  );
  if (reserved.kind === "COMPLETED") return reserved.result;

  let recoveredSafeOutput: Readonly<Record<string, unknown>> | null;
  try {
    recoveredSafeOutput = reserved.isReplayed
      ? await authority.recover(reserved.receiptId)
      : await authority.execute({
          receiptId: reserved.receiptId,
          expectedGeneration: reserved.expectedGeneration,
          supplyContractVersion: reserved.supplyContractVersion,
          supplyContractHash: reserved.supplyContractHash,
          inputHash: reserved.inputHash,
          identity: reserved.identity,
          invocationId: reserved.invocationId,
        });
  } catch (error) {
    assertDatabaseAuthorizationFailure(error);
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The lifecycle command response was lost and requires reconciliation.",
      true,
      reserved.receiptId,
    );
  }
  if (recoveredSafeOutput === null) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The lifecycle command effect is unknown and requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
  const safeOutput = parseBoundedSafeOutput(
    recoveredSafeOutput,
    reserved.receiptId,
  );
  if (
    reserved.expectedGeneration === null ||
    safeOutput.lifecycleGeneration !== reserved.expectedGeneration + 1
  ) {
    throw gatewayError(
      "LIFECYCLE_TRANSITION_CONFLICT",
      "The lifecycle command did not return the next lifecycle generation.",
      false,
      reserved.receiptId,
    );
  }
  const responseHash = hashAffiliateAgentValue({
    commandType: command.type,
    safeOutput,
  });
  const commandResult: AffiliateAgentCommandResult = {
    kind: "COMMAND_SUCCEEDED",
    receiptId: reserved.receiptId,
    commandType: command.type,
    responseHash,
    safeOutput,
  };
  const completedAt = dependencies.clock.now();

  return finalizeLifecycleCommand(
    dependencies,
    reserved,
    command,
    requestHash,
    commandResult,
    responseHash,
    completedAt,
  );
};
type PackageCommitReplay = Readonly<{
  duplicateReceipt: AffiliateAgentGatewayOperationReceipts;
  duplicateResult: AffiliateAgentCommandResult | null;
}>;

const findPackageCommitReplay = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  command: Extract<
    AffiliateAgentCommand,
    { type: "COMMIT_DECLARATIVE_PACKAGE" }
  >,
): Promise<PackageCommitReplay | null> => {
  const priorReceipts =
    await transaction.affiliateAgentGatewayOperationReceipts.findMany({
      where: {
        jobId: authorized.job.id,
        commandName: "COMMIT_DECLARATIVE_PACKAGE",
        status: "SUCCEEDED",
      },
    });
  let priorCommitReceipt: AffiliateAgentGatewayOperationReceipts | null = null;
  let duplicateReceipt: AffiliateAgentGatewayOperationReceipts | null = null;
  let duplicateResult: AffiliateAgentCommandResult | null = null;
  for (const prior of priorReceipts) {
    priorCommitReceipt = prior;
    try {
      const priorResult = replayCommand(prior.responseJson);
      if (
        priorResult.commandType === "COMMIT_DECLARATIVE_PACKAGE" &&
        priorResult.safeOutput?.packageHash ===
          command.data.validatedPackageHash
      ) {
        duplicateReceipt = prior;
        duplicateResult = priorResult;
        break;
      }
    } catch {
      break;
    }
  }
  if (!priorCommitReceipt) return null;
  return {
    duplicateReceipt: duplicateReceipt ?? priorCommitReceipt,
    duplicateResult,
  };
};

const blockDuplicatePackageCommit = async (
  dependencies: AffiliateAgentGatewayDependencies,
  transaction: Prisma.TransactionClient,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: Extract<
    AffiliateAgentCommand,
    { type: "COMMIT_DECLARATIVE_PACKAGE" }
  >,
  authorized: AuthorizedClaim,
): Promise<AffiliateAgentCommandResult | "BLOCKED" | null> => {
  const replay = await findPackageCommitReplay(
    transaction,
    authorized,
    command,
  );
  if (!replay) return null;
  const { duplicateReceipt, duplicateResult } = replay;
  const now = dependencies.clock.now();
  if (duplicateResult !== null) {
    const receiptId = dependencies.identifiers.create("receipt");
    const replayedResult: AffiliateAgentCommandResult = {
      ...duplicateResult,
      receiptId,
    };
    const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany({
      where: {
        id: authorized.job.id,
        status: "CLAIMED",
        activeClaimId: authorized.claim.id,
        claimGeneration: authorized.claim.claimGeneration,
        eventSequence: authorized.job.eventSequence,
      },
      data: { eventSequence: { increment: 1 } },
    });
    if (jobUpdated.count !== 1) {
      throw new AffiliateAgentClaimRaceError();
    }
    await transaction.affiliateAgentGatewayOperationReceipts.create({
      data: {
        id: receiptId,
        claimId: authorized.claim.id,
        jobId: authorized.job.id,
        claimGeneration: authorized.claim.claimGeneration,
        idempotencyKey: input.idempotencyKey,
        operationKind: input.kind,
        commandName: command.type,
        requestHash: operationRequestHash(input),
        status: "SUCCEEDED",
        responseHash: replayedResult.responseHash,
        responseJson: asPrismaJson(replayedResult),
        startedAt: now,
        completedAt: now,
        reconcileAfter: null,
        retentionClass: "INDEFINITE",
      },
    });
    await transaction.affiliateAgentGatewayEvents.create({
      data: {
        id: dependencies.identifiers.create("event"),
        eventKey: `commit-replayed:${receiptId}`,
        jobId: authorized.job.id,
        claimId: authorized.claim.id,
        receiptId,
        sequence: authorized.job.eventSequence + 1,
        eventType: "COMMIT_REPLAYED",
        actorKind: "AGENT_INVOCATION",
        actorId: authorized.claim.invocationId,
        role: authorized.claim.role,
        requestHash: operationRequestHash(input),
        inputHash: hashAffiliateAgentValue(command),
        outputHash: replayedResult.responseHash,
        payload: asPrismaJson({
          packageHash: command.data.validatedPackageHash,
          priorCommitReceiptId: duplicateReceipt.id,
        }),
        retentionClass: "INDEFINITE",
      },
    });
    return replayedResult;
  }
  const claimUpdated = await transaction.affiliateAgentGatewayClaims.updateMany(
    {
      where: {
        id: authorized.claim.id,
        status: "ACTIVE",
        claimGeneration: authorized.claim.claimGeneration,
        tokenInvalidatedAt: null,
      },
      data: {
        status: "RECONCILIATION_REQUIRED",
        tokenInvalidatedAt: now,
        endedAt: now,
        safeFailureCode: "COMMIT_REPLAY_BLOCKED",
        safeFailureSummary:
          "A committed package already exists for this gateway job.",
      },
    },
  );
  const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany({
    where: {
      id: authorized.job.id,
      status: "CLAIMED",
      activeClaimId: authorized.claim.id,
      claimGeneration: authorized.claim.claimGeneration,
      eventSequence: authorized.job.eventSequence,
    },
    data: {
      status: "PIPELINE_BLOCKED",
      activeClaimId: null,
      pipelineBlockedAt: now,
      nextAttemptAt: null,
      eventSequence: { increment: 1 },
    },
  });
  if (claimUpdated.count !== 1 || jobUpdated.count !== 1) {
    throw new AffiliateAgentClaimRaceError();
  }
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `commit-replay-blocked:${authorized.job.id}:${authorized.claim.claimGeneration}`,
      jobId: authorized.job.id,
      claimId: authorized.claim.id,
      receiptId: duplicateReceipt.id,
      sequence: authorized.job.eventSequence + 1,
      eventType: "COMMIT_REPLAY_BLOCKED",
      actorKind: "AGENT_INVOCATION",
      actorId: authorized.claim.invocationId,
      role: authorized.claim.role,
      requestHash: operationRequestHash(input),
      inputHash: hashAffiliateAgentValue(command),
      payload: asPrismaJson({
        packageHash: command.data.validatedPackageHash,
        priorCommitReceiptId: duplicateReceipt.id,
      }),
      retentionClass: "INDEFINITE",
    },
  });
  return "BLOCKED";
};

type TransactionalCommand = Extract<
  AffiliateAgentCommand,
  { type: "VALIDATE_DECLARATIVE_PACKAGE" | "COMMIT_DECLARATIVE_PACKAGE" }
>;

const assertTransactionalCommandPermission = (
  authorized: AuthorizedClaim,
  command: TransactionalCommand,
): void => {
  if (
    !authorized.roleContract.permittedCommands.includes(command.type) ||
    !authorized.claim.permittedCommands.includes(command.type)
  ) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The command is not permitted for this claim.",
    );
  }
};

const resolveTransactionalReplay = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: TransactionalCommand,
  requestHash: string,
): Promise<AffiliateAgentCommandResult | null> => {
  const existing =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: {
        claimId_idempotencyKey: {
          claimId: authorized.claim.id,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
  if (!existing) return null;
  if (
    existing.operationKind !== input.kind ||
    existing.commandName !== command.type ||
    existing.requestHash !== requestHash
  ) {
    throw gatewayError(
      "IDEMPOTENCY_KEY_REUSED",
      "The operation idempotency key was used for different input.",
    );
  }
  if (existing.status === "SUCCEEDED") {
    return replayCommand(existing.responseJson);
  }
  throw gatewayError(
    "OPERATION_IN_PROGRESS",
    "The command is still in progress.",
    true,
  );
};

const executePackageValidation = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  command: Extract<
    AffiliateAgentCommand,
    { type: "VALIDATE_DECLARATIVE_PACKAGE" }
  >,
  receiptId: string,
): Promise<Readonly<Record<string, unknown>>> => {
  const claimSupplySourceId =
    authorized.envelope.role === "MAPPING_PRODUCER"
      ? authorized.envelope.subject.supplySourceId
      : null;
  if (
    claimSupplySourceId === null ||
    command.data.candidatePackage.supplySourceId !== claimSupplySourceId
  ) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The package Supply Source does not match the claim.",
    );
  }
  if (
    authorized.envelope.role === "MAPPING_PRODUCER"
    && command.data.candidatePackage.listingKind
      !== authorized.envelope.subject.listingKind
  ) {
    throw gatewayError(
      "COMMAND_SCHEMA_INVALID",
      SOURCE_KIND_MISMATCH_SAFE_MESSAGE,
    );
  }
  if (
    command.data.evidenceManifestHash !==
    authorized.envelope.evidenceManifest.hash
  ) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The package validation manifest does not match the claim.",
    );
  }
  await assertClaimEvidenceRefs(
    transaction,
    authorized.claim.id,
    [
      command.data.candidatePackage.listUrlRef,
      ...command.data.candidatePackage.evidenceRefs,
    ],
    "COMMAND_NOT_PERMITTED",
    "The package references evidence outside the claim manifest.",
  );
  const adapter =
    dependencies.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE;
  if (!adapter) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The command has no installed transactional adapter.",
    );
  }
  return adapter.execute({
    transaction,
    claim: authorized.envelope,
    command,
    receiptId,
  });
};

const extractValidationOutput = (
  validationReceipt: AffiliateAgentGatewayOperationReceipts | null,
): unknown => {
  const response = validationReceipt?.responseJson;
  if (!isGatewayRecord(response) || !("safeOutput" in response)) return null;
  return response.safeOutput;
};

function assertValidationReceiptOwnership(
  validationReceipt: AffiliateAgentGatewayOperationReceipts | null,
  authorized: AuthorizedClaim,
): asserts validationReceipt is AffiliateAgentGatewayOperationReceipts {
  if (
    !validationReceipt ||
    validationReceipt.claimId !== authorized.claim.id ||
    validationReceipt.jobId !== authorized.job.id ||
    validationReceipt.claimGeneration !== authorized.claim.claimGeneration
  ) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The package commit does not match a successful validation receipt.",
    );
  }
}

const assertSuccessfulValidationReceipt = (
  validationReceipt: AffiliateAgentGatewayOperationReceipts | null,
  validationOutput: ReturnType<
    typeof affiliateAgentDeclarativePackageValidationOutputSchema.safeParse
  >,
  authorized: AuthorizedClaim,
  command: Extract<
    AffiliateAgentCommand,
    { type: "COMMIT_DECLARATIVE_PACKAGE" }
  >,
): void => {
  assertValidationReceiptOwnership(validationReceipt, authorized);
  if (validationReceipt.operationKind !== "EXECUTE_COMMAND") {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The package commit does not match a successful validation receipt.",
    );
  }
  if (
    validationReceipt.status !== "SUCCEEDED" ||
    validationReceipt.commandName !== "VALIDATE_DECLARATIVE_PACKAGE"
  ) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The package commit does not match a successful validation receipt.",
    );
  }
  if (
    !validationOutput.success ||
    validationOutput.data.isValid !== true ||
    validationOutput.data.validatedPackageHash !==
      command.data.validatedPackageHash
  ) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The package commit does not match a successful validation receipt.",
    );
  }
};

const executePackageCommit = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  command: Extract<
    AffiliateAgentCommand,
    { type: "COMMIT_DECLARATIVE_PACKAGE" }
  >,
  receiptId: string,
): Promise<Readonly<Record<string, unknown>>> => {
  const validationReceipt =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: command.data.validationReceiptId },
    });
  const validationOutput =
    affiliateAgentDeclarativePackageValidationOutputSchema.safeParse(
      extractValidationOutput(validationReceipt),
    );
  assertSuccessfulValidationReceipt(
    validationReceipt,
    validationOutput,
    authorized,
    command,
  );
  const adapter =
    dependencies.commands.transactional.COMMIT_DECLARATIVE_PACKAGE;
  if (!adapter) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The command has no installed transactional adapter.",
    );
  }
  return adapter.execute({
    transaction,
    claim: authorized.envelope,
    command,
    receiptId,
  });
};

const executeTransactionalAdapter = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  command: TransactionalCommand,
  receiptId: string,
): Promise<Readonly<Record<string, unknown>>> =>
  command.type === "VALIDATE_DECLARATIVE_PACKAGE"
    ? executePackageValidation(
        transaction,
        dependencies,
        authorized,
        command,
        receiptId,
      )
    : executePackageCommit(
        transaction,
        dependencies,
        authorized,
        command,
        receiptId,
      );

const validatePackageValidationOutput = (
  safeOutput: Readonly<Record<string, unknown>>,
  command: Extract<
    AffiliateAgentCommand,
    { type: "VALIDATE_DECLARATIVE_PACKAGE" }
  >,
  receiptId: string,
): Readonly<Record<string, unknown>> => {
  const parsedOutput =
    affiliateAgentDeclarativePackageValidationOutputSchema.safeParse(
      safeOutput,
    );
  if (
    !parsedOutput.success ||
    parsedOutput.data.validatedPackageHash !==
      hashAffiliateAgentValue(command.data.candidatePackage)
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The package validation adapter returned invalid output.",
      false,
      receiptId,
    );
  }
  return parsedOutput.data;
};

const validatePackageCommitOutput = (
  safeOutput: Readonly<Record<string, unknown>>,
  command: Extract<
    AffiliateAgentCommand,
    { type: "COMMIT_DECLARATIVE_PACKAGE" }
  >,
  receiptId: string,
): Readonly<Record<string, unknown>> => {
  const parsedOutput =
    affiliateAgentDeclarativePackageCommitOutputSchema.safeParse(safeOutput);
  if (
    !parsedOutput.success ||
    parsedOutput.data.packageHash !== command.data.validatedPackageHash
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The package commit adapter returned invalid output.",
      false,
      receiptId,
    );
  }
  return parsedOutput.data;
};

const validateTransactionalOutput = (
  safeOutput: Readonly<Record<string, unknown>>,
  command: TransactionalCommand,
  receiptId: string,
): Readonly<Record<string, unknown>> =>
  command.type === "VALIDATE_DECLARATIVE_PACKAGE"
    ? validatePackageValidationOutput(safeOutput, command, receiptId)
    : validatePackageCommitOutput(safeOutput, command, receiptId);

const buildTransactionalCommandResult = (
  safeOutput: Readonly<Record<string, unknown>>,
  command: TransactionalCommand,
  receiptId: string,
): Readonly<{
  commandResult: AffiliateAgentCommandResult;
  responseHash: string;
}> => {
  const canonicalOutput = canonicalizeAffiliateAgentValue(safeOutput);
  if (Buffer.byteLength(canonicalOutput, "utf8") > 16_384) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The command output exceeded the safe receipt limit.",
    );
  }
  const responseHash = hashAffiliateAgentValue({
    commandType: command.type,
    safeOutput,
  });
  return {
    responseHash,
    commandResult: {
      kind: "COMMAND_SUCCEEDED",
      receiptId,
      commandType: command.type,
      responseHash,
      safeOutput,
    },
  };
};

const persistTransactionalCommandResult = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: TransactionalCommand,
  requestHash: string,
  startedAt: Date,
  completedAt: Date,
  result: Readonly<{
    commandResult: AffiliateAgentCommandResult;
    responseHash: string;
  }>,
): Promise<AffiliateAgentCommandResult> => {
  const jobUpdated =
    await transaction.affiliateAgentGatewayJobs.updateMany({
      where: {
        id: authorized.job.id,
        status: "CLAIMED",
        activeClaimId: authorized.claim.id,
        claimGeneration: authorized.claim.claimGeneration,
        eventSequence: authorized.job.eventSequence,
      },
      data: { eventSequence: { increment: 1 } },
    });
  if (jobUpdated.count !== 1) {
    throw new AffiliateAgentClaimRaceError();
  }
  await transaction.affiliateAgentGatewayOperationReceipts.create({
    data: {
      id: result.commandResult.receiptId,
      claimId: authorized.claim.id,
      jobId: authorized.job.id,
      claimGeneration: authorized.claim.claimGeneration,
      idempotencyKey: input.idempotencyKey,
      operationKind: input.kind,
      commandName: command.type,
      requestHash,
      status: "SUCCEEDED",
      responseHash: result.responseHash,
      responseJson: asPrismaJson(result.commandResult),
      startedAt,
      completedAt,
    },
  });
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `command:${result.commandResult.receiptId}`,
      jobId: authorized.job.id,
      claimId: authorized.claim.id,
      receiptId: result.commandResult.receiptId,
      sequence: authorized.job.eventSequence + 1,
      eventType: "CLAIM_COMMAND_SUCCEEDED",
      actorKind: "AGENT_INVOCATION",
      actorId: authorized.claim.invocationId,
      role: authorized.claim.role,
      requestHash,
      inputHash: hashAffiliateAgentValue(command),
      outputHash: result.responseHash,
      payload: asPrismaJson({ commandType: command.type }),
      retentionClass: "INDEFINITE",
    },
  });
  return result.commandResult;
};

const executeTransactionalCommandTransaction = (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: TransactionalCommand,
  requestHash: string,
) =>
  dependencies.prisma.$transaction(
    async (transaction) => {
      const authorized = await authorizeClaimOperation(
        dependencies,
        input.authorization,
        dependencies.clock.now(),
        transaction,
      );
      assertTransactionalCommandPermission(authorized, command);
      const now = dependencies.clock.now();
      const replay = await resolveTransactionalReplay(
        transaction,
        authorized,
        input,
        command,
        requestHash,
      );
      if (replay) return replay;
      if (command.type === "COMMIT_DECLARATIVE_PACKAGE") {
        const duplicateCommit = await blockDuplicatePackageCommit(
          dependencies,
          transaction,
          input,
          command,
          authorized,
        );
        if (duplicateCommit !== null) return duplicateCommit;
      }
      const receiptId = dependencies.identifiers.create("receipt");
      const adapterOutput = await executeTransactionalAdapter(
        transaction,
        dependencies,
        authorized,
        command,
        receiptId,
      );
      const safeOutput = validateTransactionalOutput(
        adapterOutput,
        command,
        receiptId,
      );
      const finalizationNow = dependencies.clock.now();
      if (
        authorized.claim.leaseExpiresAt <= finalizationNow ||
        authorized.claim.hardDeadlineAt < finalizationNow
      ) {
        throw gatewayError(
          "LEASE_EXPIRED",
          "The claim lease expired before command completion.",
        );
      }
      const result = buildTransactionalCommandResult(
        safeOutput,
        command,
        receiptId,
      );
      return persistTransactionalCommandResult(
        transaction,
        dependencies,
        authorized,
        input,
        command,
        requestHash,
        now,
        finalizationNow,
        result,
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

const emitGatewayOperationalAlerts = async (
  writer: AffiliateOperationalAlertWriter,
  inputs: readonly AffiliateOperationalAlertInput[],
): Promise<void> => {
  for (const input of inputs) {
    const result = await writer(input);
    if (result.deliveries.some((delivery) => delivery.status === "FAILED")) {
      throw new Error("The configured operational alert delivery failed.");
    }
  }
};

const flushPersistedLifecycleAlerts = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receiptId: string,
): Promise<void> => {
  const operationalAlert = dependencies.operationalAlert;
  if (!operationalAlert) return;
  try {
    const transition = await dependencies.prisma.affiliateSupplyLifecycleTransitions?.findUnique({
      where: { idempotencyKey: receiptId },
    });
    if (!transition) return;
    await emitAffiliateSupplyLifecycleTransitionAlerts(
      transition,
      (inputs) => emitGatewayOperationalAlerts(operationalAlert, inputs),
    );
  } catch (error) {
    assertDatabaseAuthorizationFailure(error);
    throw gatewayError(
      "INTERNAL_ERROR",
      "The committed lifecycle alert could not be delivered.",
      true,
      receiptId,
    );
  }
};

const performTransactionalCommand = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: TransactionalCommand,
  requestHash: string,
): Promise<AffiliateAgentCommandResult> => {
  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const transactionalResult =
        await executeTransactionalCommandTransaction(
          dependencies,
          input,
          command,
          requestHash,
        );
      if (transactionalResult === "BLOCKED") {
        throw gatewayError(
          "PARTIAL_COMMAND_UNRESOLVED",
          "The package commit was blocked because it already succeeded.",
        );
      }
      await flushPersistedLifecycleAlerts(
        dependencies,
        transactionalResult.receiptId,
      );
      return transactionalResult;
    } catch (error) {
      const retryableConflict =
        error instanceof AffiliateAgentClaimRaceError ||
        isSerializableTransactionConflict(error);
      if (retryableConflict && attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS) {
        continue;
      }
      if (error instanceof AffiliateAgentGatewayError) throw error;
      throw gatewayErrorForPersistenceFailure(
        error,
        "INTERNAL_ERROR",
        "The Affiliate Agent command could not be completed.",
        retryableConflict,
      );
    }
  }
  throw gatewayError(
    "INTERNAL_ERROR",
    "The Affiliate Agent command could not be completed.",
    true,
  );
};

const performCommand = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
): Promise<AffiliateAgentCommandResult> => {
  assertIdentifier(input.idempotencyKey, "Operation idempotency key");
  const requestHash = operationRequestHash(input);
  const parsedCommand = affiliateAgentCommandSchema.safeParse(input.command);
  if (!parsedCommand.success) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The command does not match an allowed command schema.",
    );
  }
  if (
    parsedCommand.data.type === "CAPTURE_CLAIM_URL" ||
    parsedCommand.data.type === "RUN_DISCOVERY_QUERY"
  ) {
    return performExternalCommand(dependencies, input, parsedCommand.data);
  }
  if (parsedCommand.data.type === "EXECUTE_RECORDED_LIFECYCLE_COMMAND") {
    return performLifecycleCommand(dependencies, input, parsedCommand.data);
  }
  if (
    parsedCommand.data.type !== "VALIDATE_DECLARATIVE_PACKAGE" &&
    parsedCommand.data.type !== "COMMIT_DECLARATIVE_PACKAGE"
  ) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The command is not available through a transactional adapter.",
    );
  }
  const transactionalCommand = parsedCommand.data;
  return performTransactionalCommand(
    dependencies,
    input,
    transactionalCommand,
    requestHash,
  );
};

const replayTerminalResult = (
  response: Prisma.JsonValue | null,
): AffiliateAgentTerminalAcceptedResult => {
  if (
    response === null ||
    typeof response !== "object" ||
    Array.isArray(response) ||
    response.kind !== "TERMINAL_ACCEPTED" ||
    typeof response.receiptId !== "string" ||
    typeof response.resultHash !== "string" ||
    typeof response.disposition !== "string" ||
    typeof response.completedAt !== "string"
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored terminal receipt is invalid.",
    );
  }
  return {
    kind: "TERMINAL_ACCEPTED",
    receiptId: response.receiptId,
    resultHash: response.resultHash,
    disposition:
      response.disposition as AffiliateAgentTerminalAcceptedResult["disposition"],
    completedAt: response.completedAt,
  };
};

const assertStoredSchemaCorrectionResponse = (
  response: Prisma.JsonValue | null,
): Record<string, unknown> => {
  if (
    !isGatewayRecord(response) ||
    response.kind !== "SCHEMA_CORRECTION_REQUIRED"
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored schema-correction receipt is invalid.",
    );
  }
  if (
    typeof response.receiptId !== "string" ||
    (response.submissionNumber !== 1 && response.submissionNumber !== 2) ||
    (response.remainingSubmissions !== 1 &&
      response.remainingSubmissions !== 2)
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored schema-correction receipt is invalid.",
    );
  }
  if (
    !Array.isArray(response.issues) ||
    typeof response.correctionPrompt !== "string"
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored schema-correction receipt is invalid.",
    );
  }
  return response;
};

const replaySchemaCorrection = (
  response: Prisma.JsonValue | null,
): AffiliateAgentSchemaCorrectionResult =>
  JSON.parse(
    canonicalizeAffiliateAgentValue(
      assertStoredSchemaCorrectionResponse(response),
    ),
  ) as AffiliateAgentSchemaCorrectionResult;

const assertStoredInvocationFailureResponse = (
  response: Prisma.JsonValue | null,
): Record<string, unknown> => {
  if (
    !isGatewayRecord(response) ||
    response.kind !== "INVOCATION_FAILED"
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored invocation-failure receipt is invalid.",
    );
  }
  if (
    typeof response.receiptId !== "string" ||
    typeof response.failureCode !== "string" ||
    ![1, 2, 3].includes(Number(response.invocationFailureCount))
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored invocation-failure receipt is invalid.",
    );
  }
  if (
    response.nextAttemptAt !== null &&
    typeof response.nextAttemptAt !== "string"
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored invocation-failure receipt is invalid.",
    );
  }
  if (typeof response.isPipelineBlocked !== "boolean") {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored invocation-failure receipt is invalid.",
    );
  }
  return response;
};

const replayInvocationFailure = (
  response: Prisma.JsonValue | null,
): AffiliateAgentInvocationFailedResult =>
  JSON.parse(
    canonicalizeAffiliateAgentValue(
      assertStoredInvocationFailureResponse(response),
    ),
  ) as AffiliateAgentInvocationFailedResult;

const replaySubmitResult = (
  response: Prisma.JsonValue | null,
): AffiliateAgentSubmitResultOutcome => {
  if (
    response !== null &&
    typeof response === "object" &&
    !Array.isArray(response)
  ) {
    if (response.kind === "TERMINAL_ACCEPTED") {
      return replayTerminalResult(response);
    }
    if (response.kind === "SCHEMA_CORRECTION_REQUIRED") {
      return replaySchemaCorrection(response);
    }
    if (response.kind === "INVOCATION_FAILED") {
      return replayInvocationFailure(response);
    }
  }
  throw gatewayError(
    "INTERNAL_ERROR",
    "The stored result-submission receipt is invalid.",
  );
};

const schemaCorrectionIssues = [
  {
    path: [] as (string | number)[],
    code: "INVALID_VALUE" as const,
    message: "The result does not match an allowed terminal schema.",
  },
] as const;


const terminalResultEvidenceCorrectionIssues = (
  error: unknown,
): AffiliateAgentSchemaCorrectionResult["issues"] => {
  if (error instanceof AffiliateAgentSportEvidenceError) {
    return error.issues.map(issue => ({
      ...issue,
      path: issue.path[0] === "sportEvidence" ? ["payload", ...issue.path] : issue.path,
    }));
  }
  return [{
    path: ["payload", "sportEvidence"],
    code: "INVALID_VALUE",
    message: "Verify the sport evidence against the claim catalog and stored artifacts.",
  }];
};
const INVOCATION_FAILURE_PENDING_EFFECT_MESSAGE =
  "The invocation failure has a pending external effect.";

const findPendingClaimEffect = async (
  client: PrismaClient | Prisma.TransactionClient,
  claimId: string,
): Promise<Readonly<{ id: string }> | null> =>
  client.affiliateAgentGatewayOperationReceipts.findFirst({
    where: {
      claimId,
      status: "PENDING",
      OR: [
        {
          commandName: {
            in: [
              "CAPTURE_CLAIM_URL",
              "COMMIT_DECLARATIVE_PACKAGE",
              "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
              "RUN_DISCOVERY_QUERY",
              AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND,
            ],
          },
        },
        { operationKind: "READ_ARTIFACT" },
      ],
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });

const assertNoPendingClaimEffects = async (
  transaction: Prisma.TransactionClient,
  claimId: string,
): Promise<void> => {
  const pendingEffect = await findPendingClaimEffect(transaction, claimId);
  if (pendingEffect) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      INVOCATION_FAILURE_PENDING_EFFECT_MESSAGE,
      false,
      pendingEffect.id,
    );
  }
};

type InvocationFailureEnvelope = Extract<
  AffiliateAgentClaimOperation,
  { kind: "RECORD_FAILURE" }
>["failure"];

const SUPPORTED_INVOCATION_FAILURE_CODES: readonly AffiliateAgentInvocationFailureCode[] =
  [
    "MALFORMED_OUTPUT",
    "STALE_GENERATION",
    "PROCESS_CRASH",
    "TIMEOUT",
    "TERMINAL_SUBMISSION_FAILURE",
    "SCHEMA_CORRECTIONS_EXHAUSTED",
  ];

type InvocationFailureReplayMetadata = Readonly<{
  existing: AffiliateAgentGatewayOperationReceipts | null;
  terminalClaim: Pick<
    AffiliateAgentGatewayClaims,
    "status" | "terminalReceiptId"
  > | null;
  terminalReplayReceiptId: string | undefined;
}>;

const loadInvocationFailureReplayMetadata = async (
  transaction: Prisma.TransactionClient,
  input: Extract<AffiliateAgentClaimOperation, { kind: "RECORD_FAILURE" }>,
  options: Readonly<{ isCompletedReplayAllowed?: boolean }>,
): Promise<InvocationFailureReplayMetadata> => {
  const existing =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: {
        claimId_idempotencyKey: {
          claimId: input.authorization.claimId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
  const terminalClaim =
    options.isCompletedReplayAllowed && existing === null
      ? await transaction.affiliateAgentGatewayClaims.findUnique({
          where: { id: input.authorization.claimId },
          select: { status: true, terminalReceiptId: true },
        })
      : null;
  const terminalReplayReceiptId =
    existing?.status === "SUCCEEDED"
      ? existing.id
      : terminalClaim &&
          (terminalClaim.status === "COMPLETED" ||
            terminalClaim.status === "EXPIRED")
        ? (terminalClaim.terminalReceiptId ?? undefined)
        : undefined;
  return { existing, terminalClaim, terminalReplayReceiptId };
};

const assertInvocationFailureReplayIdentity = (
  existing: AffiliateAgentGatewayOperationReceipts,
  input: Extract<AffiliateAgentClaimOperation, { kind: "RECORD_FAILURE" }>,
  requestHash: string,
): void => {
  if (
    existing.operationKind !== input.kind ||
    existing.requestHash !== requestHash
  ) {
    throw gatewayError(
      "IDEMPOTENCY_KEY_REUSED",
      "The operation idempotency key was used for different input.",
    );
  }
};

const resolveExpiredInvocationFailureReplay = async (
  transaction: Prisma.TransactionClient,
  input: Extract<AffiliateAgentClaimOperation, { kind: "RECORD_FAILURE" }>,
  terminalClaim: InvocationFailureReplayMetadata["terminalClaim"],
): Promise<AffiliateAgentInvocationFailedResult | null> => {
  if (
    terminalClaim?.status !== "EXPIRED" ||
    terminalClaim.terminalReceiptId === null
  ) {
    return null;
  }
  const terminalReceipt =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: terminalClaim.terminalReceiptId },
    });
  if (
    terminalReceipt?.status !== "SUCCEEDED" ||
    terminalReceipt.operationKind !== input.kind
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The expired claim terminal failure receipt is invalid.",
    );
  }
  return replayInvocationFailure(terminalReceipt.responseJson);
};

const resolveInvocationFailureReplay = async (
  transaction: Prisma.TransactionClient,
  input: Extract<AffiliateAgentClaimOperation, { kind: "RECORD_FAILURE" }>,
  metadata: InvocationFailureReplayMetadata,
  requestHash: string,
): Promise<
  AffiliateAgentInvocationFailedResult | Readonly<{ kind: "TERMINAL_ACCEPTED" }> | null
> => {
  const { existing, terminalClaim } = metadata;
  if (existing) {
    assertInvocationFailureReplayIdentity(existing, input, requestHash);
    if (existing.status === "SUCCEEDED") {
      return replayInvocationFailure(existing.responseJson);
    }
    throw gatewayError(
      "OPERATION_IN_PROGRESS",
      "The invocation failure is still in progress.",
      true,
    );
  }
  const expiredReplay = await resolveExpiredInvocationFailureReplay(
    transaction,
    input,
    terminalClaim,
  );
  if (expiredReplay) return expiredReplay;
  if (
    terminalClaim?.status === "COMPLETED" &&
    terminalClaim.terminalReceiptId !== null
  ) {
    return { kind: "TERMINAL_ACCEPTED" as const };
  }
  return null;
};

const assertInvocationFailureTiming = (
  failure: InvocationFailureEnvelope,
  authorized: AuthorizedClaim,
  now: Date,
): void => {
  const occurredAt = new Date(failure.occurredAt);
  if (
    failure.schemaVersion !== 1 ||
    !SUPPORTED_INVOCATION_FAILURE_CODES.includes(failure.code) ||
    Number.isNaN(occurredAt.getTime()) ||
    occurredAt < authorized.claim.claimedAt ||
    occurredAt > now
  ) {
    throw gatewayError(
      "RESULT_SCHEMA_INVALID",
      "The invocation failure envelope is invalid.",
    );
  }
};

const assertInvocationFailureSummary = (
  failure: InvocationFailureEnvelope,
): void => {
  if (!failure.safeSummary.trim() || failure.safeSummary.length > 2_000) {
    throw gatewayError(
      "RESULT_SCHEMA_INVALID",
      "The invocation failure envelope is invalid.",
    );
  }
};

const assertInvocationFailureEvidenceRefs = (
  failure: InvocationFailureEnvelope,
): void => {
  if (
    failure.evidenceRefs.some(
      (reference, index) =>
        !reference.trim() ||
        reference.length > 200 ||
        (index > 0 && failure.evidenceRefs[index - 1] >= reference),
    )
  ) {
    throw gatewayError(
      "RESULT_SCHEMA_INVALID",
      "The invocation failure envelope is invalid.",
    );
  }
};

const assertInvocationFailureIdentity = (
  failure: InvocationFailureEnvelope,
  authorized: AuthorizedClaim,
): void => {
  if (failure.jobId !== authorized.claim.jobId) {
    throw gatewayError(
      "JOB_MISMATCH",
      "The invocation failure job does not match.",
    );
  }
  if (failure.claimId !== authorized.claim.id) {
    throw gatewayError(
      "CLAIM_NOT_FOUND",
      "The invocation failure claim does not match.",
    );
  }
  if (failure.role !== authorized.claim.role) {
    throw gatewayError(
      "ROLE_NOT_ALLOWED",
      "The invocation failure role does not match.",
    );
  }
  if (failure.workerId !== authorized.claim.workerId) {
    throw gatewayError(
      "WORKER_MISMATCH",
      "The invocation failure worker does not match.",
    );
  }
  if (failure.invocationId !== authorized.claim.invocationId) {
    throw gatewayError(
      "INVOCATION_MISMATCH",
      "The invocation failure invocation does not match.",
    );
  }
  if (failure.claimGeneration !== authorized.claim.claimGeneration) {
    throw gatewayError(
      "CLAIM_GENERATION_STALE",
      "The invocation failure claim generation is stale.",
    );
  }
  if (failure.lifecycleGeneration !== authorized.claim.lifecycleGeneration) {
    throw gatewayError(
      "LIFECYCLE_GENERATION_STALE",
      "The invocation failure lifecycle generation is stale.",
    );
  }
  if (failure.supplyContractHash !== authorized.claim.supplyContractHash) {
    throw gatewayError(
      "SUPPLY_CONTRACT_STALE",
      "The invocation failure Supply Contract is stale.",
    );
  }
};

const assertInvocationFailureEnvelope = (
  failure: InvocationFailureEnvelope,
  authorized: AuthorizedClaim,
  now: Date,
): void => {
  assertInvocationFailureTiming(failure, authorized, now);
  assertInvocationFailureSummary(failure);
  assertInvocationFailureEvidenceRefs(failure);
  assertInvocationFailureIdentity(failure, authorized);
};

const recordInvocationFailureTransaction = (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  input: Extract<AffiliateAgentClaimOperation, { kind: "RECORD_FAILURE" }>,
  requestHash: string,
  now: Date,
): Promise<AffiliateAgentInvocationFailedResult> => {
  const failure = input.failure;
  return (async () => {
    await assertClaimEvidenceRefs(
      transaction,
      authorized.claim.id,
      failure.evidenceRefs,
      "EVIDENCE_REFERENCE_NOT_PERMITTED",
      "The invocation failure references evidence outside the claim manifest.",
    );
    await assertNoPendingClaimEffects(transaction, authorized.claim.id);
    const result = await recordInvocationFailureTransition({
      dependencies,
      transaction,
      claim: authorized.claim,
      job: authorized.job,
      idempotencyKey: input.idempotencyKey,
      operationKind: input.kind,
      requestHash,
      failureCode: failure.code,
      failedAt: now,
      safeSummary: failure.safeSummary.trim(),
      evidenceRefs: failure.evidenceRefs,
      claimStatus: "FAILED",
      claimCasFailure: "GATEWAY_ERROR",
      actorKind: "AGENT_INVOCATION",
      actorId: authorized.claim.invocationId,
      eventType: "CLAIM_INVOCATION_FAILED",
    });
    await persistInvocationFailureAlertIntent(
      transaction,
      dependencies,
      invocationFailureAlertContextForAuthorizedClaim(authorized),
      result,
      failure.code,
      failure.safeSummary.trim(),
    );
    return result;
  })();
};

const executeInvocationFailureTransaction = (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "RECORD_FAILURE" }>,
  options: Readonly<{
    isCompletedReplayAllowed?: boolean;
    isTrustedFailureRecording?: boolean;
  }>,
  requestHash: string,
  now: Date,
) =>
  dependencies.prisma.$transaction(
    async (transaction) => {
      const metadata = await loadInvocationFailureReplayMetadata(
        transaction,
        input,
        options,
      );
      const authorized = await authorizeClaimOperation(
        dependencies,
        input.authorization,
        now,
        transaction,
        {
          ...(metadata.terminalReplayReceiptId === undefined ||
          metadata.terminalReplayReceiptId === null
            ? {}
            : { terminalReplayReceiptId: metadata.terminalReplayReceiptId }),
          ...(options.isTrustedFailureRecording
            ? { isTrustedFailureRecording: true }
            : {}),
        },
      );
      const replay = await resolveInvocationFailureReplay(
        transaction,
        input,
        metadata,
        requestHash,
      );
      if (replay) return replay;
      assertInvocationFailureEnvelope(input.failure, authorized, now);
      return recordInvocationFailureTransaction(
        transaction,
        dependencies,
        authorized,
        input,
        requestHash,
        now,
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

const performFailure = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "RECORD_FAILURE" }>,
  options: Readonly<{
    isCompletedReplayAllowed?: boolean;
    isTrustedFailureRecording?: boolean;
  }> = {},
): Promise<
  AffiliateAgentInvocationFailedResult | Readonly<{ kind: "TERMINAL_ACCEPTED" }>
> => {
  assertIdentifier(input.idempotencyKey, "Operation idempotency key");
  const requestHash = operationRequestHash(input);

  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const now = dependencies.clock.now();
      return await executeInvocationFailureTransaction(
        dependencies,
        input,
        options,
        requestHash,
        now,
      );
    } catch (error) {
      const retryableConflict =
        error instanceof AffiliateAgentClaimRaceError ||
        isSerializableTransactionConflict(error);
      if (retryableConflict && attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS) {
        continue;
      }
      if (error instanceof AffiliateAgentGatewayError) throw error;
      throw gatewayErrorForPersistenceFailure(
        error,
        "INTERNAL_ERROR",
        "The invocation failure could not be recorded.",
        retryableConflict,
      );
    }
  }
  throw gatewayError(
    "INTERNAL_ERROR",
    "The invocation failure could not be recorded.",
    true,
  );
};

const validateTerminalResultIdentity = (
  authorized: AuthorizedClaim,
  result: AffiliateAgentTerminalResultEnvelope,
): void => {
  if (result.jobId !== authorized.claim.jobId) {
    throw gatewayError(
      "JOB_MISMATCH",
      "The terminal result job does not match.",
    );
  }
  if (result.claimId !== authorized.claim.id) {
    throw gatewayError(
      "CLAIM_NOT_FOUND",
      "The terminal result claim does not match.",
    );
  }
  if (result.role !== authorized.claim.role) {
    throw gatewayError(
      "ROLE_NOT_ALLOWED",
      "The terminal result role does not match.",
    );
  }
  if (result.workerId !== authorized.claim.workerId) {
    throw gatewayError(
      "WORKER_MISMATCH",
      "The terminal result worker does not match.",
    );
  }
  if (result.invocationId !== authorized.claim.invocationId) {
    throw gatewayError(
      "INVOCATION_MISMATCH",
      "The terminal result invocation does not match.",
    );
  }
  if (result.claimGeneration !== authorized.claim.claimGeneration) {
    throw gatewayError(
      "CLAIM_GENERATION_STALE",
      "The terminal result claim generation is stale.",
    );
  }
  if (result.lifecycleGeneration !== authorized.claim.lifecycleGeneration) {
    throw gatewayError(
      "LIFECYCLE_GENERATION_STALE",
      "The terminal result lifecycle generation is stale.",
    );
  }
};

const validateTerminalResultDeploymentContract = (
  authorized: AuthorizedClaim,
  result: AffiliateAgentTerminalResultEnvelope,
): void => {
  if (
    result.deploymentContractVersion !==
      authorized.claim.deploymentContractVersion ||
    result.deploymentContractHash !== authorized.claim.deploymentContractHash ||
    result.supplyContractVersion !== authorized.claim.supplyContractVersion ||
    result.promptTemplateVersion !== authorized.claim.promptTemplateVersion ||
    result.promptTemplateHash !== authorized.claim.promptTemplateHash
  ) {
    throw gatewayError(
      "DEPLOYMENT_CONTRACT_STALE",
      "The terminal result contract identity is stale.",
    );
  }
};

const validateTerminalResultSupplyContract = (
  authorized: AuthorizedClaim,
  result: AffiliateAgentTerminalResultEnvelope,
): void => {
  if (result.supplyContractHash !== authorized.claim.supplyContractHash) {
    throw gatewayError(
      "SUPPLY_CONTRACT_STALE",
      "The terminal result Supply Contract is stale.",
    );
  }
};

const validateTerminalResultRoleContract = (
  authorized: AuthorizedClaim,
  result: AffiliateAgentTerminalResultEnvelope,
): void => {
  if (
    result.roleContractVersion !== authorized.claim.roleContractVersion ||
    result.roleContractHash !== authorized.claim.roleContractHash
  ) {
    throw gatewayError(
      "DEPLOYMENT_CONTRACT_STALE",
      "The terminal result role contract is stale.",
    );
  }
};

const validateReviewerExactTarget = (
  authorized: AuthorizedClaim,
  result: AffiliateAgentTerminalResultEnvelope,
): void => {
  if (
    result.role === "SUPPLY_REVIEWER" &&
    result.disposition === "EXACT_TARGET_REJECTED" &&
    authorized.envelope.subject.type === "SUPPLY_REVIEWER" &&
    "targetId" in result.payload &&
    "targetType" in result.payload &&
    (result.payload.targetId !== authorized.envelope.subject.targetId ||
      result.payload.targetType !== authorized.envelope.subject.targetType)
  ) {
    throw gatewayError(
      "TERMINAL_DISPOSITION_NOT_PERMITTED",
      "The reviewer result does not target the exact claimed target.",
    );
  }
};

const validateTerminalResultDisposition = (
  authorized: AuthorizedClaim,
  result: AffiliateAgentTerminalResultEnvelope,
): void => {
  if (!authorized.roleContract.terminalDispositions.includes(result.disposition)) {
    throw gatewayError(
      "TERMINAL_DISPOSITION_NOT_PERMITTED",
      "The terminal disposition is not permitted for this claim.",
    );
  }
};

const validateReviewerCommittedPackage = (
  authorized: AuthorizedClaim,
  result: AffiliateAgentTerminalResultEnvelope,
): void => {
  if (
    result.role === "SUPPLY_REVIEWER" &&
    authorized.envelope.role === "SUPPLY_REVIEWER" &&
    authorized.envelope.subject.type === "SUPPLY_REVIEWER" &&
    "committedPackageHash" in result.payload &&
    result.payload.committedPackageHash !==
      authorized.envelope.subject.committedPackageHash
  ) {
    throw gatewayError(
      "TERMINAL_DISPOSITION_NOT_PERMITTED",
      "The reviewer result does not target the committed package in the claim.",
    );
  }
};

const validateReviewerSupplySource = (
  authorized: AuthorizedClaim,
  result: AffiliateAgentTerminalResultEnvelope,
): void => {
  if (
    result.role === "SUPPLY_REVIEWER" &&
    authorized.envelope.role === "SUPPLY_REVIEWER" &&
    (result.disposition === "REGRESSION_ASSESSED" ||
      result.disposition === "SOURCE_EXCLUSION_ASSESSED") &&
    result.payload.supplySourceId !== authorized.envelope.subject.supplySourceId
  ) {
    throw gatewayError(
      "TERMINAL_DISPOSITION_NOT_PERMITTED",
      "The reviewer result does not target the Supply Source in the claim.",
    );
  }
};

const validateNestedTerminalEvidence = (
  result: AffiliateAgentTerminalResultEnvelope,
): void => {
  const nestedEvidenceRefs =
    result.role === "COVERAGE_PLANNER" &&
    result.disposition === "FAILED_CAPTURE_EVIDENCE_RECORDED"
      ? [result.payload.captureEvidenceRef]
      : result.role === "COVERAGE_PLANNER" &&
          result.disposition === "SOURCE_EXCLUSION_PROPOSED"
        ? result.payload.policyEvidenceRefs
        : [];
  if (
    nestedEvidenceRefs.some(
      (evidenceRef) => !result.evidenceRefs.includes(evidenceRef),
    )
  ) {
    throw gatewayError(
      "EVIDENCE_REFERENCE_NOT_PERMITTED",
      "Nested terminal evidence must be included in the result evidence set.",
    );
  }
};
const validateSourceExclusionTerminalScope = (
  authorized: AuthorizedClaim,
  result: AffiliateAgentTerminalResultEnvelope,
): void => {
  if (authorized.envelope.subject.type !== "SOURCE_EXCLUSION_REVIEW") return;
  if (
    result.disposition !== "SOURCE_EXCLUSION_ASSESSED"
    && result.disposition !== "HUMAN_REVIEW_REQUIRED"
  ) {
    throw gatewayError(
      "TERMINAL_DISPOSITION_NOT_PERMITTED",
      "A source exclusion review permits only source assessment or human review.",
    );
  }
  if (result.evidenceRefs.length === 0) {
    throw gatewayError(
      "EVIDENCE_REFERENCE_NOT_PERMITTED",
      "Source exclusion reviewer results require claim-owned evidence.",
    );
  }
};


const validateTerminalResultScope = (
  authorized: AuthorizedClaim,
  result: AffiliateAgentTerminalResultEnvelope,
): void => {
  validateTerminalResultIdentity(authorized, result);
  validateTerminalResultDeploymentContract(authorized, result);
  validateTerminalResultSupplyContract(authorized, result);
  validateTerminalResultRoleContract(authorized, result);
  validateSourceExclusionTerminalScope(authorized, result);
  validateReviewerExactTarget(authorized, result);
  validateTerminalResultDisposition(authorized, result);
  validateReviewerCommittedPackage(authorized, result);
  validateReviewerSupplySource(authorized, result);
  validateNestedTerminalEvidence(result);
  const subject = authorized.envelope.subject;
  if (
    result.role === "MAPPING_PRODUCER"
    && result.disposition === "CONTRACT_GAP"
    && (result.payload.sportEvidence || result.reasonCodes.some((code) => code.startsWith("SPORT_")))
    && (subject.type !== "MAPPING_PRODUCER" || !subject.repairContext)
  ) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "Sport repair outcomes require a claim-bound legacy sport repair context.",
    );
  }
  if (
    subject.type === "SUPPLY_REVIEWER"
    && subject.repairContext?.kind === "LEGACY_SPORT_REPAIR"
    && !["APPROVED", "PRODUCER_REPAIR_REQUIRED", "HUMAN_REVIEW_REQUIRED"].includes(result.disposition)
  ) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "Legacy sport repair permits package review only, not activation or publication.",
    );
  }
};
const AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND =
  "SUPPLY_REVIEWER_TERMINAL_EFFECT";
const AFFILIATE_AGENT_TERMINAL_EFFECT_OPERATION = "TERMINAL_EFFECT";
const REVIEWER_EFFECT_RECOVERY_AUDIT_EVENT = "REVIEWER_EFFECT_RECOVERY_AUTHORIZED";
const REVIEWER_EFFECT_RECOVERY_FAILED_EVENT = "REVIEWER_EFFECT_RECOVERY_FAILED";
const REVIEWER_EFFECT_RECOVERY_COMPLETED_EVENT = "REVIEWER_EFFECT_RECOVERY_COMPLETED";
const REVIEWER_EFFECT_RECOVERY_LEASE_SECONDS = 30;
const matchesPostEffectReceiptBase = (
  receipt: AffiliateAgentGatewayOperationReceipts | null,
  claim: AffiliateAgentGatewayClaims,
): receipt is AffiliateAgentGatewayOperationReceipts => {
  if (
    receipt === null ||
    receipt.status !== "SUCCEEDED" ||
    receipt.claimId !== claim.id ||
    receipt.jobId !== claim.jobId
  ) {
    return false;
  }
  if (
    receipt.claimGeneration !== claim.claimGeneration ||
    receipt.startedAt >= claim.leaseExpiresAt ||
    receipt.startedAt >= claim.hardDeadlineAt
  ) {
    return false;
  }
  return true;
};

const matchesPostEffectReceiptCommand = (
  receipt: AffiliateAgentGatewayOperationReceipts,
  claim: AffiliateAgentGatewayClaims,
): boolean => {
  if (claim.role === "SUPPLY_REVIEWER") {
    return (
      receipt.operationKind === AFFILIATE_AGENT_TERMINAL_EFFECT_OPERATION &&
      receipt.commandName === AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND
    );
  }
  if (claim.role === "HUMAN_DIRECTED_EXECUTOR") {
    return (
      receipt.operationKind === "EXECUTE_COMMAND" &&
      receipt.commandName === "EXECUTE_RECORDED_LIFECYCLE_COMMAND"
    );
  }
  return false;
};

const hasPostEffectCompletionReceipt = async (
  client: PrismaClient | Prisma.TransactionClient,
  claim: AffiliateAgentGatewayClaims,
  receiptId: string,
): Promise<boolean> => {
  const receipt =
    await client.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: receiptId },
    });
  return (
    matchesPostEffectReceiptBase(receipt, claim) &&
    matchesPostEffectReceiptCommand(receipt, claim)
  );
};

const REVIEWER_TERMINAL_EFFECT_FAILURE_CODE =
  "REVIEWER_TERMINAL_EFFECT_FAILED" as const;
const REVIEWER_TERMINAL_EFFECT_FAILURE_REASON_CODES = [
  "LIFECYCLE_GENERATION_STALE",
  "SUPPLY_CONTRACT_STALE",
  "COMMAND_AUTHORITY_NOT_PERMITTED",
  "LEGACY_RECONCILIATION_WRITER_REQUIRED",
  "REVIEWER_OUTCOME_NOT_PERMITTED",
  "EVIDENCE_REQUIRED",
  "APPROVAL_PRECONDITION_FAILED",
  "APPROVAL_LIFECYCLE_EVIDENCE_MISSING",
  "ACTIVATION_PRECONDITION_FAILED",
  "PUBLICATION_PRECONDITION_FAILED",
  "TARGET_REJECTION_PRECONDITION_FAILED",
  "REFRESH_PRECONDITION_FAILED",
  "EMPTY_REFRESH_PRECONDITION_FAILED",
  "UNCLASSIFIED",
] as const;
type ReviewerTerminalEffectFailureReasonCode =
  (typeof REVIEWER_TERMINAL_EFFECT_FAILURE_REASON_CODES)[number];
const reviewerTerminalEffectFailureReasonCodeSchema = z.enum(
  REVIEWER_TERMINAL_EFFECT_FAILURE_REASON_CODES,
);
const reviewerTerminalEffectFailureDiagnosticSchema = z
  .object({
    code: z.literal(REVIEWER_TERMINAL_EFFECT_FAILURE_CODE),
    stage: z.enum(["EXECUTE", "RECOVER"]),
    reasonCodes: reviewerTerminalEffectFailureReasonCodeSchema
      .array()
      .min(1)
      .max(REVIEWER_TERMINAL_EFFECT_FAILURE_REASON_CODES.length),
  })
  .strict();
type ReviewerTerminalEffectFailureDiagnostic = Readonly<{
  code: typeof REVIEWER_TERMINAL_EFFECT_FAILURE_CODE;
  stage: "EXECUTE" | "RECOVER";
  reasonCodes: readonly ReviewerTerminalEffectFailureReasonCode[];
}>;

const mergeReviewerTerminalEffectFailureDiagnostics = (
  existing: readonly ReviewerTerminalEffectFailureDiagnostic[],
  incoming: readonly ReviewerTerminalEffectFailureDiagnostic[],
): readonly ReviewerTerminalEffectFailureDiagnostic[] => {
  const merged = [...existing];
  for (const diagnostic of incoming) {
    if (
      merged.some(
        (candidate) =>
          candidate.stage === diagnostic.stage
          && canonicalizeAffiliateAgentValue(candidate.reasonCodes)
            === canonicalizeAffiliateAgentValue(diagnostic.reasonCodes),
      )
    ) {
      continue;
    }
    if (merged.length >= 2) break;
    merged.push(diagnostic);
  }
  return merged;
};


const reviewerTerminalEffectFailureDiagnosticFor = (
  error: unknown,
  stage: "EXECUTE" | "RECOVER",
): ReviewerTerminalEffectFailureDiagnostic => {
  const message = error instanceof Error ? error.message : "";
  const prefix = "Affiliate lifecycle command rejected: ";
  let reasonCodes: ReviewerTerminalEffectFailureReasonCode[] = ["UNCLASSIFIED"];
  if (
    message.startsWith(prefix)
    && message.length <= 2_048
  ) {
    const allowed = new Set<string>(
      REVIEWER_TERMINAL_EFFECT_FAILURE_REASON_CODES,
    );
    const parsed = message
      .slice(prefix.length)
      .split(",")
      .map((reason) => reason.trim())
      .filter((reason): reason is ReviewerTerminalEffectFailureReasonCode =>
        allowed.has(reason),
      );
    if (parsed.length > 0) {
      reasonCodes = Array.from(new Set(parsed)).slice(
        0,
        REVIEWER_TERMINAL_EFFECT_FAILURE_REASON_CODES.length,
      );
    }
  }
  return {
    code: REVIEWER_TERMINAL_EFFECT_FAILURE_CODE,
    stage,
    reasonCodes,
  };
};

type ReviewerTerminalEffectInvocation = Readonly<{
  recovered: Readonly<Record<string, unknown>> | null;
  failureDiagnostics: readonly ReviewerTerminalEffectFailureDiagnostic[];
}>;

type ReviewerTerminalEffectReceiptState =
  | Readonly<{
      kind: "PENDING";
      result: AffiliateAgentReviewerTerminalResult;
      terminalIdempotencyKey: string;
      terminalRequestHash: string;
      failureDiagnostics?: readonly ReviewerTerminalEffectFailureDiagnostic[];
    }>
  | Readonly<{
      kind: "SUCCEEDED";
      result: AffiliateAgentReviewerTerminalResult;
      resultHash: string;
      safeOutput: Readonly<Record<string, unknown>>;
      terminalIdempotencyKey: string;
      terminalRequestHash: string;
      failureDiagnostics?: readonly ReviewerTerminalEffectFailureDiagnostic[];
    }>;
type SucceededReviewerTerminalEffectState = Extract<
  ReviewerTerminalEffectReceiptState,
  { kind: "SUCCEEDED" }
>;

type ReviewerTerminalEffectReservation = Readonly<{
  receipt: AffiliateAgentGatewayOperationReceipts;
  isReplayed: boolean;
  terminalIdempotencyKey: string;
  terminalRequestHash: string;
  failureDiagnostics?: readonly ReviewerTerminalEffectFailureDiagnostic[];
}>;

const reviewerTerminalEffectRequestHash = (
  claim: AffiliateAgentGatewayClaims,
  result: AffiliateAgentReviewerTerminalResult,
): string =>
  hashAffiliateAgentValue({
    commandName: AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND,
    claimId: claim.id,
    claimGeneration: claim.claimGeneration,
    result,
  });

const reviewerTerminalEffectIdempotencyKey = (): string =>
  "reviewer-terminal-effect";
const invokeReviewerTerminalEffect = async <
  D extends AffiliateAgentReviewerTerminalDisposition,
>(
  handler: AffiliateAgentTerminalEffectHandler<D>,
  input: AffiliateAgentTerminalEffectAdapterInput<D>,
  operation: "EXECUTE" | "RECOVER",
): Promise<Readonly<Record<string, unknown>> | null> => {
  if (operation === "EXECUTE") {
    return handler.execute(input);
  }
  return handler.recover(input);
};

const runReviewerTerminalEffect = async (
  adapter: AffiliateAgentTerminalEffectAdapter,
  input: AffiliateAgentTerminalEffectAdapterInput,
  operation: "EXECUTE" | "RECOVER",
): Promise<Readonly<Record<string, unknown>> | null> => {
  const commonInput = {
    receiptId: input.receiptId,
    claim: input.claim,
  };
  switch (input.result.disposition) {
    case "APPROVED":
      return invokeReviewerTerminalEffect(
        adapter.APPROVED,
        { ...commonInput, result: input.result },
        operation,
      );
    case "ACTIVATED":
      return invokeReviewerTerminalEffect(
        adapter.ACTIVATED,
        { ...commonInput, result: input.result },
        operation,
      );
    case "PRODUCER_REPAIR_REQUIRED":
      return invokeReviewerTerminalEffect(
        adapter.PRODUCER_REPAIR_REQUIRED,
        { ...commonInput, result: input.result },
        operation,
      );
    case "REGRESSION_ASSESSED":
      return invokeReviewerTerminalEffect(
        adapter.REGRESSION_ASSESSED,
        { ...commonInput, result: input.result },
        operation,
      );
    case "SOURCE_EXCLUSION_ASSESSED":
      return invokeReviewerTerminalEffect(
        adapter.SOURCE_EXCLUSION_ASSESSED,
        { ...commonInput, result: input.result },
        operation,
      );
    case "EXACT_TARGET_REJECTED":
      return invokeReviewerTerminalEffect(
        adapter.EXACT_TARGET_REJECTED,
        { ...commonInput, result: input.result },
        operation,
      );
    case "HUMAN_REVIEW_REQUIRED":
      return invokeReviewerTerminalEffect(
        adapter.HUMAN_REVIEW_REQUIRED,
        { ...commonInput, result: input.result },
        operation,
      );
  }
  throw new Error("Unsupported reviewer terminal disposition.");
};

const assertReviewerTerminalEffectRecord = (
  value: Prisma.JsonValue | null,
): Record<string, unknown> => {
  if (
    !isGatewayRecord(value) ||
    typeof value.kind !== "string"
  ) {
    throw new Error("Invalid terminal effect state.");
  }
  return value;
};

const parseReviewerTerminalEffectFailureDiagnostics = (
  value: unknown,
): readonly ReviewerTerminalEffectFailureDiagnostic[] | undefined => {
  if (value === undefined) return undefined;
  const parsed = z
    .array(reviewerTerminalEffectFailureDiagnosticSchema)
    .max(2)
    .safeParse(value);
  if (!parsed.success) {
    throw new Error("Invalid reviewer terminal effect failure diagnostic.");
  }
  return parsed.data as readonly ReviewerTerminalEffectFailureDiagnostic[];
};

const parsePendingReviewerTerminalEffect = (
  value: Record<string, unknown>,
): ReviewerTerminalEffectReceiptState => {
  const result = affiliateAgentTerminalResultEnvelopeSchema.safeParse(
    value.result,
  );
  if (
    !result.success ||
    result.data.role !== "SUPPLY_REVIEWER" ||
    typeof value.terminalIdempotencyKey !== "string" ||
    typeof value.terminalRequestHash !== "string"
  ) {
    throw new Error("Invalid pending terminal effect state.");
  }
  const failureDiagnostics = parseReviewerTerminalEffectFailureDiagnostics(
    value.failureDiagnostics,
  );
  return {
    kind: "PENDING",
    result: result.data,
    terminalIdempotencyKey: value.terminalIdempotencyKey,
    terminalRequestHash: value.terminalRequestHash,
    ...(failureDiagnostics === undefined ? {} : { failureDiagnostics }),
  };
};

const parseSucceededReviewerTerminalEffect = (
  value: Record<string, unknown>,
  receiptId: string,
): ReviewerTerminalEffectReceiptState => {
  if (
    value.kind !== "SUCCEEDED" ||
    typeof value.resultHash !== "string" ||
    typeof value.terminalIdempotencyKey !== "string" ||
    typeof value.terminalRequestHash !== "string"
  ) {
    throw new Error("Invalid completed terminal effect state.");
  }
  const result = affiliateAgentTerminalResultEnvelopeSchema.safeParse(
    value.result,
  );
  if (!result.success || result.data.role !== "SUPPLY_REVIEWER") {
    throw new Error("Invalid completed terminal effect result.");
  }
  const failureDiagnostics = parseReviewerTerminalEffectFailureDiagnostics(
    value.failureDiagnostics,
  );
  return {
    kind: "SUCCEEDED",
    result: result.data,
    resultHash: value.resultHash,
    safeOutput: parseBoundedSafeOutput(value.safeOutput, receiptId),
    terminalIdempotencyKey: value.terminalIdempotencyKey,
    terminalRequestHash: value.terminalRequestHash,
    ...(failureDiagnostics === undefined ? {} : { failureDiagnostics }),
  };
};

const parseReviewerTerminalEffectState = (
  value: Prisma.JsonValue | null,
  receiptId: string,
): ReviewerTerminalEffectReceiptState => {
  try {
    const record = assertReviewerTerminalEffectRecord(value);
    return record.kind === "PENDING"
      ? parsePendingReviewerTerminalEffect(record)
      : parseSucceededReviewerTerminalEffect(record, receiptId);
  } catch {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect receipt is invalid.",
      false,
      receiptId,
    );
  }
};

const resolveReviewerTerminalEffectReservationReplay = async (
  transaction: Prisma.TransactionClient,
  claimId: string,
  idempotencyKey: string,
  requestHash: string,
  terminalIdempotencyKey: string,
  terminalRequestHash: string,
): Promise<ReviewerTerminalEffectReservation | null> => {
  const existing =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: {
        claimId_idempotencyKey: {
          claimId,
          idempotencyKey,
        },
      },
    });
  if (!existing) return null;
  if (
    existing.operationKind !== AFFILIATE_AGENT_TERMINAL_EFFECT_OPERATION ||
    existing.commandName !== AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND ||
    existing.requestHash !== requestHash
  ) {
    throw gatewayError(
      "IDEMPOTENCY_KEY_REUSED",
      "The reviewer terminal effect key was used for different input.",
    );
  }
  if (existing.status === "SUCCEEDED" || existing.status === "PENDING") {
    const existingState = parseReviewerTerminalEffectState(
      existing.responseJson,
      existing.id,
    );
    if (
      existingState.terminalIdempotencyKey !== terminalIdempotencyKey ||
      existingState.terminalRequestHash !== terminalRequestHash
    ) {
      throw gatewayError(
        "IDEMPOTENCY_KEY_REUSED",
        "The reviewer terminal effect terminal identity changed.",
      );
    }
    return {
      receipt: existing,
      isReplayed: existing.status === "PENDING",
      terminalIdempotencyKey: existingState.terminalIdempotencyKey,
      terminalRequestHash: existingState.terminalRequestHash,
      ...(existingState.failureDiagnostics === undefined
        ? {}
        : { failureDiagnostics: existingState.failureDiagnostics }),
    };
  }
  throw gatewayError(
    "PARTIAL_COMMAND_UNRESOLVED",
    "The reviewer terminal effect requires reconciliation.",
    false,
    existing.id,
  );
};

const assertReviewerTerminalEffectTiming = (
  authorized: AuthorizedClaim,
  now: Date,
): void => {
  if (authorized.claim.hardDeadlineAt < now) {
    throw gatewayError(
      "HARD_DEADLINE_EXCEEDED",
      "The claim hard deadline passed before the reviewer effect was reserved.",
    );
  }
  if (authorized.claim.leaseExpiresAt <= now) {
    throw gatewayError(
      "LEASE_EXPIRED",
      "The claim lease expired before the reviewer effect was reserved.",
    );
  }
};

const persistReviewerTerminalEffectReservation = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  result: AffiliateAgentReviewerTerminalResult,
  requestHash: string,
  idempotencyKey: string,
  terminalIdempotencyKey: string,
  terminalRequestHash: string,
  now: Date,
): Promise<ReviewerTerminalEffectReservation> => {
  const receiptId = dependencies.identifiers.create("receipt");
  const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany({
    where: {
      id: authorized.job.id,
      status: "CLAIMED",
      activeClaimId: authorized.claim.id,
      claimGeneration: authorized.claim.claimGeneration,
      eventSequence: authorized.job.eventSequence,
    },
    data: { eventSequence: { increment: 1 } },
  });
  if (jobUpdated.count !== 1) throw new AffiliateAgentClaimRaceError();
  const pendingState: ReviewerTerminalEffectReceiptState = {
    kind: "PENDING",
    result,
    terminalIdempotencyKey,
    terminalRequestHash,
  };
  const receipt =
    await transaction.affiliateAgentGatewayOperationReceipts.create({
      data: {
        id: receiptId,
        claimId: authorized.claim.id,
        jobId: authorized.job.id,
        claimGeneration: authorized.claim.claimGeneration,
        idempotencyKey,
        operationKind: AFFILIATE_AGENT_TERMINAL_EFFECT_OPERATION,
        commandName: AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND,
        requestHash,
        status: "PENDING",
        responseJson: asPrismaJson(pendingState),
        startedAt: now,
        reconcileAfter: addSeconds(
          now,
          AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
        ),
        retentionClass: "INDEFINITE",
      },
    });
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `terminal-effect-reserved:${receiptId}`,
      jobId: authorized.job.id,
      claimId: authorized.claim.id,
      receiptId,
      sequence: authorized.job.eventSequence + 1,
      eventType: "TERMINAL_EFFECT_RESERVED",
      actorKind: "AGENT_INVOCATION",
      actorId: authorized.claim.invocationId,
      role: authorized.claim.role,
      requestHash,
      inputHash: hashAffiliateAgentValue(result),
      payload: asPrismaJson({
        disposition: result.disposition,
      }),
      retentionClass: "INDEFINITE",
    },
  });
  return {
    receipt,
    isReplayed: false,
    terminalIdempotencyKey,
    terminalRequestHash,
  };
};

const reserveReviewerTerminalEffectTransaction = async (
  dependencies: AffiliateAgentGatewayDependencies,
  transaction: Prisma.TransactionClient,
  authorization: AffiliateAgentClaimAuthorization,
  result: AffiliateAgentReviewerTerminalResult,
  requestHash: string,
  idempotencyKey: string,
  terminalIdempotencyKey: string,
  terminalRequestHash: string,
  postEffectCompletionReceiptId: string | undefined,
): Promise<ReviewerTerminalEffectReservation> => {
  const authorized = await authorizeClaimOperation(
    dependencies,
    authorization,
    dependencies.clock.now(),
    transaction,
    postEffectCompletionReceiptId === undefined
      ? undefined
      : { postEffectCompletionReceiptId },
  );
  if (authorized.envelope.subject.type === "SOURCE_EXCLUSION_REVIEW") {
    await assertSourceExclusionClaimBinding({
      prisma: transaction,
      job: authorized.job,
      claim: authorized.envelope,
    });
  }
  validateTerminalResultScope(authorized, result);
  await assertClaimEvidenceRefs(
    transaction,
    authorized.claim.id,
    result.evidenceRefs,
    "EVIDENCE_REFERENCE_NOT_PERMITTED",
    "The reviewer terminal effect references evidence outside the claim manifest.",
  );
  const replay = await resolveReviewerTerminalEffectReservationReplay(
    transaction,
    authorized.claim.id,
    idempotencyKey,
    requestHash,
    terminalIdempotencyKey,
    terminalRequestHash,
  );
  if (replay) return replay;
  if (authorized.envelope.subject.type === "SOURCE_EXCLUSION_REVIEW") {
    await assertSourceExclusionExecutionReady({
      prisma: transaction,
      job: authorized.job,
      claim: authorized.envelope,
    });
  }
  const now = dependencies.clock.now();
  assertReviewerTerminalEffectTiming(authorized, now);
  return persistReviewerTerminalEffectReservation(
    transaction,
    dependencies,
    authorized,
    result,
    requestHash,
    idempotencyKey,
    terminalIdempotencyKey,
    terminalRequestHash,
    now,
  );
};

const reserveReviewerTerminalEffect = async (
  dependencies: AffiliateAgentGatewayDependencies,
  authorization: AffiliateAgentClaimAuthorization,
  result: AffiliateAgentReviewerTerminalResult,
  requestHash: string,
  idempotencyKey: string,
  terminalIdempotencyKey: string,
  terminalRequestHash: string,
  postEffectCompletionReceiptId?: string,
): Promise<ReviewerTerminalEffectReservation> =>
  runSerializableEffectTransaction(
    dependencies,
    (transaction) =>
      reserveReviewerTerminalEffectTransaction(
        dependencies,
        transaction,
        authorization,
        result,
        requestHash,
        idempotencyKey,
        terminalIdempotencyKey,
        terminalRequestHash,
        postEffectCompletionReceiptId,
      ),
    {
      code: "INTERNAL_ERROR",
      safeMessage: "The reviewer terminal effect could not be reserved.",
    },
  );

function assertReviewerEffectReceiptMatches(
  current: AffiliateAgentGatewayOperationReceipts | null,
  reservation: ReviewerTerminalEffectReservation,
  requestHash: string,
): asserts current is AffiliateAgentGatewayOperationReceipts {
  if (
    !current ||
    current.claimId !== reservation.receipt.claimId ||
    current.jobId !== reservation.receipt.jobId ||
    current.claimGeneration !== reservation.receipt.claimGeneration ||
    current.commandName !== AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND ||
    current.requestHash !== requestHash
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect receipt changed during finalization.",
      false,
      reservation.receipt.id,
    );
  }
}
const resolveReviewerEffectFinalizationReplay = (
  current: AffiliateAgentGatewayOperationReceipts,
  reservation: ReviewerTerminalEffectReservation,
  state: SucceededReviewerTerminalEffectState,
): Readonly<Record<string, unknown>> | null => {
  if (current.status === "SUCCEEDED") {
    const completed = parseReviewerTerminalEffectState(
      current.responseJson,
      current.id,
    );
    if (current.responseHash !== hashAffiliateAgentValue(completed)) {
      throw gatewayError(
        "PARTIAL_COMMAND_UNRESOLVED",
        "The reviewer terminal effect receipt is invalid.",
        false,
        current.id,
      );
    }
    if (
      completed.kind !== "SUCCEEDED" ||
      completed.resultHash !== state.resultHash ||
      completed.terminalIdempotencyKey !==
        reservation.terminalIdempotencyKey ||
      completed.terminalRequestHash !== reservation.terminalRequestHash
    ) {
      throw gatewayError(
        "IDEMPOTENCY_KEY_REUSED",
        "The reviewer terminal effect result does not match its receipt.",
      );
    }
    return completed.safeOutput;
  }
  if (current.status !== "PENDING") {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect receipt requires reconciliation.",
      false,
      current.id,
    );
  }
  const pending = parseReviewerTerminalEffectState(
    current.responseJson,
    current.id,
  );
  if (
    pending.kind !== "PENDING" ||
    pending.terminalIdempotencyKey !== reservation.terminalIdempotencyKey ||
    pending.terminalRequestHash !== reservation.terminalRequestHash
  ) {
    throw gatewayError(
      "IDEMPOTENCY_KEY_REUSED",
      "The reviewer terminal effect terminal identity changed.",
    );
  }
  return null;
};

function assertReviewerEffectClaimState(
  claim: AffiliateAgentGatewayClaims | null,
  current: AffiliateAgentGatewayOperationReceipts,
  finalizationNow: Date,
): asserts claim is AffiliateAgentGatewayClaims {
  if (!claim) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect claim requires reconciliation.",
      false,
      current.id,
    );
  }
  if (
    claim.status !== "ACTIVE" ||
    claim.claimGeneration !== current.claimGeneration
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect claim requires reconciliation.",
      false,
      current.id,
    );
  }
  if (
    claim.leaseExpiresAt <= finalizationNow &&
    current.startedAt >= claim.leaseExpiresAt
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect claim requires reconciliation.",
      false,
      current.id,
    );
  }
  if (
    claim.hardDeadlineAt < finalizationNow &&
    current.startedAt >= claim.hardDeadlineAt
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect claim requires reconciliation.",
      false,
      current.id,
    );
  }
}

function assertReviewerEffectJobState(
  job: AffiliateAgentGatewayJobs | null,
  claim: AffiliateAgentGatewayClaims,
  current: AffiliateAgentGatewayOperationReceipts,
): asserts job is AffiliateAgentGatewayJobs {
  if (!job) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect claim requires reconciliation.",
      false,
      current.id,
    );
  }
  if (
    job.status !== "CLAIMED" ||
    job.activeClaimId !== claim.id ||
    job.claimGeneration !== current.claimGeneration
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect claim requires reconciliation.",
      false,
      current.id,
    );
  }
}

const persistReviewerEffectFinalization = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  current: AffiliateAgentGatewayOperationReceipts,
  claim: AffiliateAgentGatewayClaims,
  job: AffiliateAgentGatewayJobs,
  result: AffiliateAgentReviewerTerminalResult,
  requestHash: string,
  responseHash: string,
  state: SucceededReviewerTerminalEffectState,
  completedAt: Date,
  safeOutput: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>> => {
  const receiptUpdated =
    await transaction.affiliateAgentGatewayOperationReceipts.updateMany({
      where: {
        id: current.id,
        status: "PENDING",
        requestHash,
      },
      data: {
        status: "SUCCEEDED",
        responseHash,
        responseJson: asPrismaJson(state),
        completedAt,
        reconcileAfter: null,
      },
    });
  const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany({
    where: {
      id: job.id,
      status: "CLAIMED",
      activeClaimId: claim.id,
      claimGeneration: claim.claimGeneration,
      eventSequence: job.eventSequence,
    },
    data: { eventSequence: { increment: 1 } },
  });
  if (receiptUpdated.count !== 1 || jobUpdated.count !== 1) {
    throw new AffiliateAgentClaimRaceError();
  }
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `terminal-effect-succeeded:${current.id}`,
      jobId: job.id,
      claimId: claim.id,
      receiptId: current.id,
      sequence: job.eventSequence + 1,
      eventType: "TERMINAL_EFFECT_SUCCEEDED",
      actorKind: "AGENT_INVOCATION",
      actorId: claim.invocationId,
      role: claim.role,
      requestHash,
      inputHash: hashAffiliateAgentValue(result),
      outputHash: responseHash,
      payload: asPrismaJson({
        disposition: result.disposition,
      }),
      retentionClass: "INDEFINITE",
    },
  });
  return safeOutput;
};

const finalizeReviewerTerminalEffectTransaction = async (
  dependencies: AffiliateAgentGatewayDependencies,
  transaction: Prisma.TransactionClient,
  reservation: ReviewerTerminalEffectReservation,
  result: AffiliateAgentReviewerTerminalResult,
  requestHash: string,
  state: SucceededReviewerTerminalEffectState,
  completedAt: Date,
  safeOutput: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>> => {
  const current =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: reservation.receipt.id },
    });
  assertReviewerEffectReceiptMatches(current, reservation, requestHash);
  const replay = resolveReviewerEffectFinalizationReplay(
    current,
    reservation,
    state,
  );
  if (replay) return replay;
  const pendingState = parseReviewerTerminalEffectState(
    current.responseJson,
    current.id,
  );
  if (pendingState.kind !== "PENDING") {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect receipt requires reconciliation.",
      false,
      current.id,
    );
  }
  const mergedFailureDiagnostics =
    mergeReviewerTerminalEffectFailureDiagnostics(
      pendingState.failureDiagnostics ?? [],
      state.failureDiagnostics ?? [],
    );
  const finalState: SucceededReviewerTerminalEffectState = {
    ...state,
    ...(mergedFailureDiagnostics.length === 0
      ? {}
      : { failureDiagnostics: mergedFailureDiagnostics }),
  };
  const finalResponseHash = hashAffiliateAgentValue(finalState);
  const [claim, job] = await Promise.all([
    transaction.affiliateAgentGatewayClaims.findUnique({
      where: { id: current.claimId },
    }),
    transaction.affiliateAgentGatewayJobs.findUnique({
      where: { id: current.jobId },
    }),
  ]);
  const finalizationNow = dependencies.clock.now();
  assertReviewerEffectClaimState(claim, current, finalizationNow);
  assertReviewerEffectJobState(job, claim, current);
  return persistReviewerEffectFinalization(
    transaction,
    dependencies,
    current,
    claim,
    job,
    result,
    requestHash,
    finalResponseHash,
    finalState,
    completedAt,
    safeOutput,
  );
};

const finalizeReviewerTerminalEffect = async (
  dependencies: AffiliateAgentGatewayDependencies,
  reservation: ReviewerTerminalEffectReservation,
  result: AffiliateAgentReviewerTerminalResult,
  requestHash: string,
  safeOutput: Readonly<Record<string, unknown>>,
  failureDiagnostics: readonly ReviewerTerminalEffectFailureDiagnostic[] = [],
): Promise<Readonly<Record<string, unknown>>> => {
  const mergedFailureDiagnostics =
    mergeReviewerTerminalEffectFailureDiagnostics(
      reservation.failureDiagnostics ?? [],
      failureDiagnostics,
    );
  const state: SucceededReviewerTerminalEffectState = {
    kind: "SUCCEEDED",
    result,
    resultHash: hashAffiliateAgentValue(result),
    safeOutput,
    terminalIdempotencyKey: reservation.terminalIdempotencyKey,
    terminalRequestHash: reservation.terminalRequestHash,
    ...(mergedFailureDiagnostics.length === 0
      ? {}
      : { failureDiagnostics: mergedFailureDiagnostics }),
  };
  const completedAt = dependencies.clock.now();
  return runSerializableEffectTransaction(
    dependencies,
    (transaction) =>
      finalizeReviewerTerminalEffectTransaction(
        dependencies,
        transaction,
        reservation,
        result,
        requestHash,
        state,
        completedAt,
        safeOutput,
      ),
    {
      code: "PARTIAL_COMMAND_UNRESOLVED",
      safeMessage: "The reviewer terminal effect could not be finalized.",
      receiptId: reservation.receipt.id,
    },
  );
};

const assertDatabaseAuthorizationFailure = (error: unknown): void => {
  if (isDatabaseAuthorizationFailure(error)) {
    throw gatewayError(
      "GATEWAY_ADMISSION_HALTED",
      GATEWAY_DATABASE_AUTHORIZATION_FAILURE_MESSAGE,
    );
  }
};

const persistReviewerTerminalEffectFailureDiagnosticsTransaction = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  diagnostics: readonly ReviewerTerminalEffectFailureDiagnostic[],
): Promise<void> => {
  if (diagnostics.length === 0) return;
  const current =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: receipt.id },
    });
  if (
    !current
    || current.operationKind !== AFFILIATE_AGENT_TERMINAL_EFFECT_OPERATION
    || current.commandName !== AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND
    || (
      current.status !== "PENDING"
      && current.status !== "SUCCEEDED"
      && current.status !== "UNKNOWN"
    )
  ) {
    return;
  }
  const state = parseReviewerTerminalEffectState(
    current.responseJson,
    current.id,
  );
  if (
    (current.status === "SUCCEEDED") !== (state.kind === "SUCCEEDED")
    || (
      state.kind === "SUCCEEDED"
      && current.responseHash !== hashAffiliateAgentValue(state)
    )
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect receipt is invalid.",
      false,
      current.id,
    );
  }
  const existing = state.failureDiagnostics ?? [];
  const merged = mergeReviewerTerminalEffectFailureDiagnostics(
    existing,
    diagnostics,
  );
  if (state.kind !== "SUCCEEDED") {
    const diagnosticsChanged =
      canonicalizeAffiliateAgentValue(existing)
      !== canonicalizeAffiliateAgentValue(merged);
    if (diagnosticsChanged) {
      const nextState = {
        ...state,
        failureDiagnostics: merged,
      };
      const updated =
        await transaction.affiliateAgentGatewayOperationReceipts.updateMany({
          where: {
            id: current.id,
            status: current.status,
            requestHash: current.requestHash,
          },
          data: {
            responseJson: asPrismaJson(nextState),
            ...(current.status === "PENDING"
              && (current.safeErrorCode === null
                || current.safeErrorCode === undefined)
              ? { safeErrorCode: "PARTIAL_COMMAND_UNRESOLVED" }
              : {}),
          },
        });
      if (updated.count !== 1) return;
    }
  }
  const eventKey =
    `terminal-effect-failure:${current.id}:${hashAffiliateAgentValue(merged)}`;
  const existingEvent =
    await transaction.affiliateAgentGatewayEvents.findFirst({
      where: { eventKey },
    });
  if (existingEvent) return;
  const [claim, job] = await Promise.all([
    transaction.affiliateAgentGatewayClaims.findUnique({
      where: { id: current.claimId },
    }),
    transaction.affiliateAgentGatewayJobs.findUnique({
      where: { id: current.jobId },
    }),
  ]);
  if (!claim || !job || typeof job.eventSequence !== "number") return;
  const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany({
    where: {
      id: job.id,
      eventSequence: job.eventSequence,
    },
    data: { eventSequence: { increment: 1 } },
  });
  if (jobUpdated.count !== 1) return;
  const reasonCodes = Array.from(
    new Set(merged.flatMap((diagnostic) => diagnostic.reasonCodes)),
  ).sort();
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey,
      jobId: job.id,
      claimId: claim.id,
      receiptId: current.id,
      sequence: job.eventSequence + 1,
      eventType: "TERMINAL_EFFECT_FAILURE_RECORDED",
      actorKind: "AGENT_INVOCATION",
      actorId: claim.invocationId,
      role: claim.role,
      requestHash: current.requestHash,
      inputHash: hashAffiliateAgentValue(state.result),
      reasonCodes,
      payload: asPrismaJson({
        code: REVIEWER_TERMINAL_EFFECT_FAILURE_CODE,
        diagnostics: merged,
      }),
      retentionClass: "INDEFINITE",
    },
  });
};

const persistReviewerTerminalEffectFailureDiagnostics = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  diagnostics: readonly ReviewerTerminalEffectFailureDiagnostic[],
): Promise<void> => {
  await runSerializableEffectTransaction(
    dependencies,
    (transaction) =>
      persistReviewerTerminalEffectFailureDiagnosticsTransaction(
        transaction,
        dependencies,
        receipt,
        diagnostics,
      ),
    {
      code: "PARTIAL_COMMAND_UNRESOLVED",
      safeMessage: "The reviewer terminal effect failure could not be retained.",
      receiptId: receipt.id,
    },
  );
};

const runReviewerTerminalEffectWithRecovery = async (
  adapter: AffiliateAgentTerminalEffectAdapter,
  input: AffiliateAgentTerminalEffectAdapterInput,
  isReplayed: boolean,
  persistFailureDiagnostic?: (
    diagnostic: ReviewerTerminalEffectFailureDiagnostic,
  ) => Promise<void>,
): Promise<ReviewerTerminalEffectInvocation> => {
  if (isReplayed) {
    try {
      return {
        recovered: await runReviewerTerminalEffect(adapter, input, "RECOVER"),
        failureDiagnostics: [],
      };
    } catch (error) {
      assertDatabaseAuthorizationFailure(error);
      const diagnostic = reviewerTerminalEffectFailureDiagnosticFor(
        error,
        "RECOVER",
      );
      await persistFailureDiagnostic?.(diagnostic);
      return {
        recovered: null,
        failureDiagnostics: [diagnostic],
      };
    }
  }
  try {
    return {
      recovered: await runReviewerTerminalEffect(adapter, input, "EXECUTE"),
      failureDiagnostics: [],
    };
  } catch (error) {
    assertDatabaseAuthorizationFailure(error);
    const executeDiagnostic = reviewerTerminalEffectFailureDiagnosticFor(
      error,
      "EXECUTE",
    );
    await persistFailureDiagnostic?.(executeDiagnostic);
    try {
      return {
        recovered: await runReviewerTerminalEffect(adapter, input, "RECOVER"),
        failureDiagnostics: [executeDiagnostic],
      };
    } catch (recoveryError) {
      assertDatabaseAuthorizationFailure(recoveryError);
      const recoveryDiagnostic = reviewerTerminalEffectFailureDiagnosticFor(
        recoveryError,
        "RECOVER",
      );
      await persistFailureDiagnostic?.(recoveryDiagnostic);
      return {
        recovered: null,
        failureDiagnostics: [executeDiagnostic, recoveryDiagnostic],
      };
    }
  }
};

const ensureReviewerTerminalEffect = async (
  dependencies: AffiliateAgentGatewayDependencies,
  authorization: AffiliateAgentClaimAuthorization,
  authorized: AuthorizedClaim,
  result: AffiliateAgentReviewerTerminalResult,
  terminalIdempotencyKey: string,
  terminalRequestHash: string,
  postEffectCompletionReceiptId?: string,
): Promise<string> => {
  const adapter = dependencies.terminalEffects;
  if (!adapter) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The reviewer terminal effect adapter is not installed.",
    );
  }
  const requestHash = reviewerTerminalEffectRequestHash(
    authorized.claim,
    result,
  );
  const idempotencyKey = reviewerTerminalEffectIdempotencyKey();
  const reservation = await reserveReviewerTerminalEffect(
    dependencies,
    authorization,
    result,
    requestHash,
    idempotencyKey,
    terminalIdempotencyKey,
    terminalRequestHash,
    postEffectCompletionReceiptId,
  );
  if (reservation.receipt.status === "SUCCEEDED") {
    const state = parseReviewerTerminalEffectState(
      reservation.receipt.responseJson,
      reservation.receipt.id,
    );
    if (
      state.kind !== "SUCCEEDED" ||
      state.resultHash !== hashAffiliateAgentValue(result) ||
      reservation.receipt.responseHash !== hashAffiliateAgentValue(state)
    ) {
      throw gatewayError(
        "IDEMPOTENCY_KEY_REUSED",
        "The reviewer terminal effect result does not match its receipt.",
      );
    }
    return reservation.receipt.id;
  }
  const effectInput = {
    receiptId: reservation.receipt.id,
    claim: authorized.envelope,
    result,
  };
  const invocation = await runReviewerTerminalEffectWithRecovery(
    adapter,
    effectInput,
    reservation.isReplayed,
    async (diagnostic) => {
      await persistReviewerTerminalEffectFailureDiagnostics(
        dependencies,
        reservation.receipt,
        [diagnostic],
      );
    },
  );
  const failureDiagnostics = mergeReviewerTerminalEffectFailureDiagnostics(
    reservation.failureDiagnostics ?? [],
    invocation.failureDiagnostics,
  );
  if (invocation.recovered === null) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect requires reconciliation.",
      false,
      reservation.receipt.id,
    );
  }
  let safeOutput: Readonly<Record<string, unknown>>;
  try {
    safeOutput = parseBoundedSafeOutput(
      invocation.recovered,
      reservation.receipt.id,
    );
  } catch (error) {
    await markReceiptReconciliationRequired(
      dependencies,
      reservation.receipt,
      dependencies.clock.now(),
      true,
    );
    throw error;
  }
  await finalizeReviewerTerminalEffect(
    dependencies,
    reservation,
    result,
    requestHash,
    safeOutput,
    failureDiagnostics,
  );
  return reservation.receipt.id;
};
type RecoveredReviewerEffectRecords = Readonly<{
  claim: AffiliateAgentGatewayClaims;
  job: AffiliateAgentGatewayJobs;
  currentEffect: AffiliateAgentGatewayOperationReceipts;
}>;

function assertRecoveredReviewerEffectRecords(
  records: Readonly<{
    claim: AffiliateAgentGatewayClaims | null;
    job: AffiliateAgentGatewayJobs | null;
    currentEffect: AffiliateAgentGatewayOperationReceipts | null;
  }>,
  effectReceipt: AffiliateAgentGatewayOperationReceipts,
): asserts records is RecoveredReviewerEffectRecords {
  if (!records.claim || !records.job || !records.currentEffect) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered reviewer result claim does not exist.",
      false,
      effectReceipt.id,
    );
  }
}

const assertRecoveredReviewerEffectCurrent = (
  currentEffect: AffiliateAgentGatewayOperationReceipts,
  claim: AffiliateAgentGatewayClaims,
  job: AffiliateAgentGatewayJobs,
  effectReceipt: AffiliateAgentGatewayOperationReceipts,
  result: AffiliateAgentReviewerTerminalResult,
): void => {
  if (
    currentEffect.status !== "SUCCEEDED" ||
    currentEffect.commandName !== AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND ||
    currentEffect.claimId !== claim.id ||
    currentEffect.jobId !== job.id ||
    currentEffect.claimGeneration !== claim.claimGeneration ||
    currentEffect.requestHash !== effectReceipt.requestHash ||
    currentEffect.requestHash !== reviewerTerminalEffectRequestHash(claim, result)
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered reviewer effect is not durably completed.",
      false,
      effectReceipt.id,
    );
  }
};

const parseRecoveredReviewerEffectState = (
  currentEffect: AffiliateAgentGatewayOperationReceipts,
  effectReceipt: AffiliateAgentGatewayOperationReceipts,
  result: AffiliateAgentReviewerTerminalResult,
): Extract<ReviewerTerminalEffectReceiptState, { kind: "SUCCEEDED" }> => {
  const completedEffectState = parseReviewerTerminalEffectState(
    currentEffect.responseJson,
    currentEffect.id,
  );
  if (
    completedEffectState.kind !== "SUCCEEDED" ||
    currentEffect.responseHash === null ||
    currentEffect.responseHash !== hashAffiliateAgentValue(completedEffectState) ||
    completedEffectState.resultHash !== hashAffiliateAgentValue(result) ||
    hashAffiliateAgentValue(completedEffectState.result) !==
      hashAffiliateAgentValue(result)
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered reviewer effect result is not durably completed.",
      false,
      effectReceipt.id,
    );
  }
  return completedEffectState;
};

const recoveredReviewerAuthorization = (
  claim: AffiliateAgentGatewayClaims,
): AffiliateAgentClaimAuthorization => ({
  token: "",
  jobId: claim.jobId,
  claimId: claim.id,
  claimGeneration: claim.claimGeneration,
  lifecycleGeneration: claim.lifecycleGeneration,
  role: claim.role as AffiliateAgentClaimAuthorization["role"],
  workerId: claim.workerId,
  invocationId: claim.invocationId,
  supplyContractHash: claim.supplyContractHash,
});

const recoveredReviewerAuthorizationOptions = (
  claim: AffiliateAgentGatewayClaims,
  job: AffiliateAgentGatewayJobs,
  effectReceipt: AffiliateAgentGatewayOperationReceipts,
): ClaimAuthorizationOptions => ({
  trustedEffectCompletionReceiptId: effectReceipt.id,
  ...(claim.status === "COMPLETED" &&
  job.status === "COMPLETED" &&
  claim.terminalReceiptId !== null
    ? { terminalReplayReceiptId: claim.terminalReceiptId }
    : {}),
});

const resolveCompletedRecoveredReviewerResult = async (
  transaction: Prisma.TransactionClient,
  claim: AffiliateAgentGatewayClaims,
  job: AffiliateAgentGatewayJobs,
  completedEffectState: Extract<
    ReviewerTerminalEffectReceiptState,
    { kind: "SUCCEEDED" }
  >,
  effectReceipt: AffiliateAgentGatewayOperationReceipts,
): Promise<AffiliateAgentTerminalAcceptedResult | null> => {
  if (
    claim.status !== "COMPLETED" ||
    job.status !== "COMPLETED" ||
    claim.terminalReceiptId === null
  ) {
    return null;
  }
  const terminalReceipt =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: claim.terminalReceiptId },
    });
  if (
    !terminalReceipt ||
    terminalReceipt.idempotencyKey !==
      completedEffectState.terminalIdempotencyKey ||
    terminalReceipt.requestHash !== completedEffectState.terminalRequestHash
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered reviewer terminal receipt is missing or changed.",
      false,
      effectReceipt.id,
    );
  }
  return replayTerminalResult(terminalReceipt.responseJson);
};

const findRecoveredReviewerResultReplay = async (
  transaction: Prisma.TransactionClient,
  claimId: string,
  idempotencyKey: string,
  requestHash: string,
  effectReceipt: AffiliateAgentGatewayOperationReceipts,
): Promise<AffiliateAgentTerminalAcceptedResult | null> => {
  const existing =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: {
        claimId_idempotencyKey: {
          claimId,
          idempotencyKey,
        },
      },
    });
  if (!existing) return null;
  if (existing.status === "SUCCEEDED" && existing.requestHash === requestHash) {
    return replayTerminalResult(existing.responseJson);
  }
  throw gatewayError(
    "PARTIAL_COMMAND_UNRESOLVED",
    "The recovered reviewer terminal result receipt changed.",
    false,
    existing.id,
  );
};

const persistRecoveredReviewerTerminalResult = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  claim: AffiliateAgentGatewayClaims,
  job: AffiliateAgentGatewayJobs,
  result: AffiliateAgentReviewerTerminalResult,
  effectReceipt: AffiliateAgentGatewayOperationReceipts,
  resultHash: string,
  requestHash: string,
  idempotencyKey: string,
  now: Date,
): Promise<AffiliateAgentTerminalAcceptedResult> => {
  const receiptId = dependencies.identifiers.create("receipt");
  const terminalResult: AffiliateAgentTerminalAcceptedResult = {
    kind: "TERMINAL_ACCEPTED",
    receiptId,
    resultHash,
    disposition: result.disposition,
    completedAt: now.toISOString(),
  };
  const claimCompleted =
    await transaction.affiliateAgentGatewayClaims.updateMany({
      where: {
        id: claim.id,
        status: "ACTIVE",
        claimGeneration: claim.claimGeneration,
        tokenInvalidatedAt: null,
      },
      data: {
        status: "COMPLETED",
        terminalReceiptId: receiptId,
        tokenInvalidatedAt: now,
        endedAt: now,
      },
    });
  const jobCompleted = await transaction.affiliateAgentGatewayJobs.updateMany({
    where: {
      id: job.id,
      status: "CLAIMED",
      activeClaimId: claim.id,
      claimGeneration: claim.claimGeneration,
      eventSequence: job.eventSequence,
    },
    data: {
      status: "COMPLETED",
      activeClaimId: null,
      terminalDisposition: result.disposition,
      resultHash,
      resultJson: asPrismaJson(result),
      terminalReceiptId: receiptId,
      finishedAt: now,
      eventSequence: { increment: 1 },
    },
  });
  if (claimCompleted.count !== 1 || jobCompleted.count !== 1) {
    throw new AffiliateAgentClaimRaceError();
  }
  await transaction.affiliateAgentGatewayOperationReceipts.create({
    data: {
      id: receiptId,
      claimId: claim.id,
      jobId: job.id,
      claimGeneration: claim.claimGeneration,
      idempotencyKey,
      operationKind: "SUBMIT_RESULT",
      requestHash,
      status: "SUCCEEDED",
      responseHash: hashAffiliateAgentValue(terminalResult),
      responseJson: asPrismaJson(terminalResult),
      startedAt: now,
      completedAt: now,
      retentionClass: "INDEFINITE",
    },
  });
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `terminal:recovered:${receiptId}`,
      jobId: job.id,
      claimId: claim.id,
      receiptId,
      sequence: job.eventSequence + 1,
      eventType: "CLAIM_TERMINAL_RESULT_ACCEPTED",
      actorKind: "AGENT_INVOCATION",
      actorId: claim.invocationId,
      role: claim.role,
      requestHash,
      inputHash: resultHash,
      outputHash: hashAffiliateAgentValue(terminalResult),
      reasonCodes: [...result.reasonCodes],
      payload: asPrismaJson({
        disposition: result.disposition,
        resultHash,
        recoveredFromReceiptId: effectReceipt.id,
      }),
      retentionClass: "INDEFINITE",
    },
  });
  return terminalResult;
};

const completeRecoveredReviewerTerminalResultTransaction = async (
  dependencies: AffiliateAgentGatewayDependencies,
  transaction: Prisma.TransactionClient,
  effectReceipt: AffiliateAgentGatewayOperationReceipts,
  result: AffiliateAgentReviewerTerminalResult,
): Promise<AffiliateAgentTerminalAcceptedResult> => {
  const [claim, job, currentEffect] = await Promise.all([
    transaction.affiliateAgentGatewayClaims.findUnique({
      where: { id: effectReceipt.claimId },
    }),
    transaction.affiliateAgentGatewayJobs.findUnique({
      where: { id: effectReceipt.jobId },
    }),
    transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: effectReceipt.id },
    }),
  ]);
  const records = { claim, job, currentEffect };
  assertRecoveredReviewerEffectRecords(records, effectReceipt);
  assertRecoveredReviewerEffectCurrent(
    records.currentEffect,
    records.claim,
    records.job,
    effectReceipt,
    result,
  );
  const completedEffectState = parseRecoveredReviewerEffectState(
    records.currentEffect,
    effectReceipt,
    result,
  );
  await authorizeClaimOperation(
    dependencies,
    recoveredReviewerAuthorization(records.claim),
    dependencies.clock.now(),
    transaction,
    recoveredReviewerAuthorizationOptions(records.claim, records.job, effectReceipt),
  );
  const completedReplay = await resolveCompletedRecoveredReviewerResult(
    transaction,
    records.claim,
    records.job,
    completedEffectState,
    effectReceipt,
  );
  if (completedReplay) return completedReplay;
  const now = dependencies.clock.now();
  await assertNoPendingClaimEffects(transaction, records.claim.id);
  await assertClaimEvidenceRefs(
    transaction,
    records.claim.id,
    result.evidenceRefs,
    "EVIDENCE_REFERENCE_NOT_PERMITTED",
    "The recovered reviewer result references evidence outside the claim manifest.",
  );
  const resultHash = hashAffiliateAgentValue(result);
  const requestHash = completedEffectState.terminalRequestHash;
  const idempotencyKey = completedEffectState.terminalIdempotencyKey;
  const replay = await findRecoveredReviewerResultReplay(
    transaction,
    records.claim.id,
    idempotencyKey,
    requestHash,
    effectReceipt,
  );
  if (replay) return replay;
  return persistRecoveredReviewerTerminalResult(
    transaction,
    dependencies,
    records.claim,
    records.job,
    result,
    effectReceipt,
    resultHash,
    requestHash,
    idempotencyKey,
    now,
  );
};

const completeRecoveredReviewerTerminalResult = async (
  dependencies: AffiliateAgentGatewayDependencies,
  effectReceipt: AffiliateAgentGatewayOperationReceipts,
  result: AffiliateAgentReviewerTerminalResult,
): Promise<AffiliateAgentTerminalAcceptedResult> =>
  runSerializableEffectTransaction(
    dependencies,
    (transaction) =>
      completeRecoveredReviewerTerminalResultTransaction(
        dependencies,
        transaction,
        effectReceipt,
        result,
      ),
    {
      code: "PARTIAL_COMMAND_UNRESOLVED",
      safeMessage:
        "The recovered reviewer terminal result could not be completed.",
      receiptId: effectReceipt.id,
    },
  );

type TerminalResultPreparation = Readonly<{
  kind: "EXECUTE";
  input: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>;
  requestHash: string;
  parsedResult: AffiliateAgentTerminalResultEnvelope | null;
  postEffectCompletionReceiptId: string | undefined;
  reviewerTerminalEffectReceiptId: string | undefined;
  hasExistingReceipt: boolean;
}>;

type TerminalResultPreparationOutcome =
  | TerminalResultPreparation
  | Readonly<{
      kind: "REPLAY";
      result: AffiliateAgentSubmitResultOutcome;
    }>
  | Readonly<{
      kind: "CORRECTION";
      result: AffiliateAgentSubmitResultOutcome;
    }>;

const replayTerminalResultReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>,
  receipt: AffiliateAgentGatewayOperationReceipts,
  requestHash: string,
  transaction: Prisma.TransactionClient,
): Promise<AffiliateAgentSubmitResultOutcome> => {
  if (
    receipt.operationKind !== input.kind ||
    receipt.requestHash !== requestHash
  ) {
    throw gatewayError(
      "IDEMPOTENCY_KEY_REUSED",
      "The operation idempotency key was used for different input.",
    );
  }
  const replayResult = replaySubmitResult(receipt.responseJson);
  const replayAuthorizationOptions =
    replayResult.kind === "TERMINAL_ACCEPTED" ||
    replayResult.kind === "INVOCATION_FAILED"
      ? { terminalReplayReceiptId: receipt.id }
      : undefined;
  await authorizeClaimOperation(
    dependencies,
    input.authorization,
    dependencies.clock.now(),
    transaction,
    replayAuthorizationOptions,
  );
  return replayResult;
};

const resolveTerminalResultPostEffectReceiptId = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>,
  parsedResult: AffiliateAgentTerminalResultEnvelope | null,
): Promise<string | undefined> => {
  if (!parsedResult) return undefined;
  if (parsedResult.role === "SUPPLY_REVIEWER") {
    const effectReceipt =
      await dependencies.prisma.affiliateAgentGatewayOperationReceipts.findUnique(
        {
          where: {
            claimId_idempotencyKey: {
              claimId: input.authorization.claimId,
              idempotencyKey: reviewerTerminalEffectIdempotencyKey(),
            },
          },
        },
      );
    return effectReceipt?.status === "SUCCEEDED"
      ? effectReceipt.id
      : undefined;
  }
  if (
    parsedResult.role === "HUMAN_DIRECTED_EXECUTOR" &&
    parsedResult.disposition === "LIFECYCLE_COMMAND_EXECUTED"
  ) {
    return parsedResult.payload.receiptId;
  }
  return undefined;
};

const retainPostEffectReceiptUnlessClaimIsActive = async (
  dependencies: AffiliateAgentGatewayDependencies,
  claimId: string,
  receiptId: string | undefined,
): Promise<string | undefined> => {
  if (receiptId === undefined) return undefined;
  const claimTiming =
    await dependencies.prisma.affiliateAgentGatewayClaims.findUnique({
      where: { id: claimId },
      select: {
        leaseExpiresAt: true,
        hardDeadlineAt: true,
        tokenExpiresAt: true,
      },
    });
  const now = dependencies.clock.now();
  if (
    claimTiming !== null &&
    claimTiming.leaseExpiresAt > now &&
    claimTiming.hardDeadlineAt >= now &&
    claimTiming.tokenExpiresAt > now
  ) {
    return undefined;
  }
  return receiptId;
};

const assertTerminalResultPendingEffectsResolved = async (
  dependencies: AffiliateAgentGatewayDependencies,
  claimId: string,
): Promise<void> => {
  const pendingEffects = await reconcilePendingEffectsForClaim(
    dependencies,
    claimId,
  );
  if (pendingEffects.isAdmissionHalted || pendingEffects.unresolved > 0) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "A claim effect is still being reconciled.",
      true,
    );
  }
};

const resolveRecoveredTerminalResultReplay = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>,
  requestHash: string,
): Promise<AffiliateAgentSubmitResultOutcome | null> => {
  const recoveredTerminalReceipt =
    await dependencies.prisma.affiliateAgentGatewayOperationReceipts.findUnique(
      {
        where: {
          claimId_idempotencyKey: {
            claimId: input.authorization.claimId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      },
    );
  if (recoveredTerminalReceipt?.status !== "SUCCEEDED") return null;
  return runSerializableEffectTransaction(
    dependencies,
    (transaction) =>
      replayTerminalResultReceipt(
        dependencies,
        input,
        recoveredTerminalReceipt,
        requestHash,
        transaction,
      ),
    {
      code: "INTERNAL_ERROR",
      safeMessage: "The terminal result could not be replayed.",
    },
  );
};

const verifyLegacySportRepairTerminal = async (
  dependencies: AffiliateAgentGatewayDependencies,
  database: Pick<PrismaClient, "sports">,
  authorized: AuthorizedClaim,
  result: AffiliateAgentTerminalResultEnvelope,
): Promise<void> => {
  if (
    authorized.envelope.subject.type !== "MAPPING_PRODUCER"
    || !authorized.envelope.subject.repairContext
    || result.role !== "MAPPING_PRODUCER"
    || result.disposition !== "CONTRACT_GAP"
  ) return;
  const sportEvidence = result.payload.sportEvidence;
  if (!sportEvidence || sportEvidence.sportDeterminations.length === 0) {
    throw new AffiliateAgentSportEvidenceError([{
      path: sportEvidence ? ["sportEvidence", "sportDeterminations"] : ["sportEvidence"],
      code: "MISSING_VALUE",
      message: "Provide a nonempty sport assessment with claim-owned citations.",
    }]);
  }
  const resultEvidenceRefs = new Set(result.evidenceRefs);
  for (let determinationIndex = 0; determinationIndex < sportEvidence.sportDeterminations.length; determinationIndex += 1) {
    const citations = sportEvidence.sportDeterminations[determinationIndex].evidence;
    for (let citationIndex = 0; citationIndex < citations.length; citationIndex += 1) {
      const citation = citations[citationIndex];
      const manifestEntry = authorized.envelope.evidenceManifest.entries.find(
        (entry) => entry.artifactId === citation.artifactId && entry.kind === citation.artifactKind,
      );
      if (!manifestEntry) {
        throw new AffiliateAgentSportEvidenceError([{
          path: ["sportEvidence", "sportDeterminations", determinationIndex, "evidence", citationIndex,
            authorized.envelope.evidenceManifest.entries.some(entry => entry.artifactId === citation.artifactId)
              ? "artifactKind" : "artifactId"],
          code: "INVALID_VALUE",
          message: "Use the artifact identifier and kind from the claim manifest.",
        }]);
      }
      if (!resultEvidenceRefs.has(manifestEntry.evidenceRef)) {
        throw new AffiliateAgentSportEvidenceError([{
          path: ["evidenceRefs"],
          code: "MISSING_VALUE",
          message: "Include the manifest evidenceRef for every cited artifact.",
        }]);
      }
    }
  }
  const reviewReady = (
    sportEvidence.sportDeterminations.length > 0
    && sportEvidence.sportDeterminations.every(
      (determination) =>
        determination.status === "RESOLVED"
        || determination.status === "BLACKLISTED",
    )
    && sportEvidence.sportDeterminations.some(
      (determination) => determination.status === "RESOLVED",
    )
  );
  const observedSportNames = reviewReady
    ? Array.from(
        new Set(
          sportEvidence.sportDeterminations.flatMap(
            (determination) => determination.canonicalSportNames,
          ),
        ),
      ).sort()
    : undefined;
  await verifyAffiliateAgentLegacySportRepair({
    prisma: database,
    artifacts: dependencies.artifacts,
    claim: authorized.envelope,
    sportEvidence,
    resultKind: reviewReady ? "REVIEW_REQUIRED" : "HUMAN_REVIEW_REQUIRED",
    reasonCodes: result.reasonCodes,
    ...(observedSportNames === undefined ? {} : { observedSportNames }),
  });
};
const verifySourceExclusionTerminal = async (
  dependencies: AffiliateAgentGatewayDependencies,
  database: Pick<PrismaClient, "sports">,
  authorized: AuthorizedClaim,
  result: AffiliateAgentTerminalResultEnvelope,
): Promise<void> => {
  if (
    authorized.envelope.subject.type !== "SOURCE_EXCLUSION_REVIEW"
    || result.role !== "SUPPLY_REVIEWER"
    || result.disposition !== "SOURCE_EXCLUSION_ASSESSED"
    || result.payload.recommendation !== "EXCLUDE"
  ) return;
  await verifyAffiliateAgentSourceExclusionAssessment({
    prisma: database,
    artifacts: dependencies.artifacts,
    claim: authorized.envelope,
    result,
  });
};


const isTerminalResultEvidenceCorrection = (
  error: unknown,
): boolean => (
  error instanceof AffiliateAgentGatewayError
  && error.code === "EVIDENCE_REFERENCE_NOT_PERMITTED"
);

const prepareTerminalResult = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>,
): Promise<TerminalResultPreparationOutcome> => {
  const requestHash = operationRequestHash(input);
  const existing =
    await dependencies.prisma.affiliateAgentGatewayOperationReceipts.findUnique(
      {
        where: {
          claimId_idempotencyKey: {
            claimId: input.authorization.claimId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      },
    );
  if (existing?.status === "SUCCEEDED") {
    return {
      kind: "REPLAY",
      result: await runSerializableEffectTransaction(
        dependencies,
        (transaction) =>
          replayTerminalResultReceipt(
            dependencies,
            input,
            existing,
            requestHash,
            transaction,
          ),
        {
          code: "INTERNAL_ERROR",
          safeMessage: "The terminal result could not be replayed.",
        },
      ),
    };
  }
  const parsedResultBeforeTransaction =
    affiliateAgentTerminalResultEnvelopeSchema.safeParse(input.result);
  const parsedResult = parsedResultBeforeTransaction.success
    ? parsedResultBeforeTransaction.data
    : null;
  const reviewerTerminalEffectReceiptIdBeforeRetention =
    await resolveTerminalResultPostEffectReceiptId(
      dependencies,
      input,
      parsedResult,
    );
  let postEffectCompletionReceiptId =
    await retainPostEffectReceiptUnlessClaimIsActive(
      dependencies,
      input.authorization.claimId,
      reviewerTerminalEffectReceiptIdBeforeRetention,
    );
  const authorizationOptions =
    postEffectCompletionReceiptId === undefined
      ? undefined
      : { postEffectCompletionReceiptId };
  const initialAuthorization = await authorizeClaimOperationInSerializableTransaction(
    dependencies,
    input.authorization,
    dependencies.clock.now(),
    authorizationOptions,
  );
  await assertTerminalResultPendingEffectsResolved(
    dependencies,
    input.authorization.claimId,
  );
  const recoveredReplay = await resolveRecoveredTerminalResultReplay(
    dependencies,
    input,
    requestHash,
  );
  if (recoveredReplay) {
    return { kind: "REPLAY", result: recoveredReplay };
  }
  const sourceExclusionEffectAlreadySucceeded =
    reviewerTerminalEffectReceiptIdBeforeRetention !== undefined
    && initialAuthorization.envelope.subject.type === "SOURCE_EXCLUSION_REVIEW"
    && parsedResult?.role === "SUPPLY_REVIEWER"
    && parsedResult?.disposition === "SOURCE_EXCLUSION_ASSESSED"
    && parsedResult?.payload.recommendation === "EXCLUDE";
  if (parsedResult && !sourceExclusionEffectAlreadySucceeded) {
    try {
      await verifyLegacySportRepairTerminal(
        dependencies,
        dependencies.prisma,
        initialAuthorization,
        parsedResult,
      );
      await verifySourceExclusionTerminal(
        dependencies,
        dependencies.prisma,
        initialAuthorization,
        parsedResult,
      );
    } catch (error) {
      if (
        isTerminalResultEvidenceCorrection(error)
        && initialAuthorization.envelope.subject.type === "SOURCE_EXCLUSION_REVIEW"
        && parsedResult.role === "SUPPLY_REVIEWER"
        && parsedResult.disposition === "SOURCE_EXCLUSION_ASSESSED"
        && parsedResult.payload.recommendation === "EXCLUDE"
      ) {
        return {
          kind: "CORRECTION",
          result: await persistSourceExclusionTerminalCorrection(
            dependencies,
            input,
            requestHash,
            authorizationOptions,
            terminalResultEvidenceCorrectionIssues(error),
          ),
        };
      }
      if (!isTerminalResultEvidenceCorrection(error)) throw error;
    }
  }
  let reviewerTerminalEffectReceiptId: string | undefined;
  if (existing === null && parsedResult?.role === "SUPPLY_REVIEWER") {
    const authorized = await authorizeClaimOperationInSerializableTransaction(
      dependencies,
      input.authorization,
      dependencies.clock.now(),
      authorizationOptions,
    );
    validateTerminalResultScope(authorized, parsedResult);
    reviewerTerminalEffectReceiptId = await ensureReviewerTerminalEffect(
      dependencies,
      input.authorization,
      authorized,
      parsedResult,
      input.idempotencyKey,
      requestHash,
      postEffectCompletionReceiptId,
    );
  }
  return {
    kind: "EXECUTE",
    input,
    requestHash,
    parsedResult,
    postEffectCompletionReceiptId,
    reviewerTerminalEffectReceiptId,
    hasExistingReceipt: existing !== null,
  };
};

type TerminalResultTransactionReplay = Readonly<{
  existing: AffiliateAgentGatewayOperationReceipts | null;
  result: AffiliateAgentSubmitResultOutcome | null;
}>;

const resolveTerminalResultTransactionReplay = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>,
  requestHash: string,
): Promise<TerminalResultTransactionReplay> => {
  const existing =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: {
        claimId_idempotencyKey: {
          claimId: input.authorization.claimId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
  if (existing?.status === "SUCCEEDED") {
    return {
      existing,
      result: await replayTerminalResultReceipt(
        dependencies,
        input,
        existing,
        requestHash,
        transaction,
      ),
    };
  }
  return { existing, result: null };
};

function assertReviewerTerminalEffectReceipt(
  effectReceipt: AffiliateAgentGatewayOperationReceipts | null,
  expectedReceiptId: string | undefined,
  expectedRequestHash: string,
  authorized: AuthorizedClaim,
  result: AffiliateAgentReviewerTerminalResult,
): asserts effectReceipt is AffiliateAgentGatewayOperationReceipts {
  if (
    !effectReceipt ||
    effectReceipt.id !== expectedReceiptId ||
    effectReceipt.status !== "SUCCEEDED" ||
    effectReceipt.requestHash !== expectedRequestHash
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect is not durably completed.",
      false,
      effectReceipt?.id,
    );
  }
  if (
    effectReceipt.startedAt >= authorized.claim.leaseExpiresAt ||
    effectReceipt.startedAt >= authorized.claim.hardDeadlineAt
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect is not durably completed.",
      false,
      effectReceipt.id,
    );
  }
  if (result.role !== "SUPPLY_REVIEWER") {
    throw new Error("Reviewer terminal effect result role changed.");
  }
}

const assertReviewerTerminalEffectResult = (
  effectState: ReviewerTerminalEffectReceiptState | null,
  result: AffiliateAgentReviewerTerminalResult,
  effectReceipt: AffiliateAgentGatewayOperationReceipts,
): void => {
  if (
    effectState?.kind !== "SUCCEEDED" ||
    effectState.resultHash !== hashAffiliateAgentValue(result)
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect is not durably completed.",
      false,
      effectReceipt.id,
    );
  }
};

const assertReviewerTerminalEffectCompleted = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  result: AffiliateAgentTerminalResultEnvelope,
  expectedReceiptId: string | undefined,
): Promise<void> => {
  if (result.role !== "SUPPLY_REVIEWER") return;
  const expectedRequestHash = reviewerTerminalEffectRequestHash(
    authorized.claim,
    result,
  );
  const effectReceipt =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: {
        claimId_idempotencyKey: {
          claimId: authorized.claim.id,
          idempotencyKey: reviewerTerminalEffectIdempotencyKey(),
        },
      },
    });
  assertReviewerTerminalEffectReceipt(
    effectReceipt,
    expectedReceiptId,
    expectedRequestHash,
    authorized,
    result,
  );
  const effectState = parseReviewerTerminalEffectState(
    effectReceipt.responseJson,
    effectReceipt.id,
  );
  assertReviewerTerminalEffectResult(effectState, result, effectReceipt);
};

const tryReplayCommandReceipt = (
  receipt: AffiliateAgentGatewayOperationReceipts | null,
): AffiliateAgentCommandResult | null => {
  if (receipt === null || receipt.responseJson === null) return null;
  try {
    return replayCommand(receipt.responseJson);
  } catch {
    return null;
  }
};

const assertMappingCommitReceiptOwnership = (
  commitReceipt: AffiliateAgentGatewayOperationReceipts | null,
  authorized: AuthorizedClaim,
): void => {
  if (
    commitReceipt?.claimId !== authorized.claim.id ||
    commitReceipt?.jobId !== authorized.job.id ||
    commitReceipt?.claimGeneration !== authorized.claim.claimGeneration
  ) {
    throw gatewayError(
      "TERMINAL_DISPOSITION_NOT_PERMITTED",
      "The mapping result does not match a committed package receipt.",
    );
  }
};

const assertMappingCommitReceiptOperation = (
  commitReceipt: AffiliateAgentGatewayOperationReceipts | null,
): void => {
  if (
    commitReceipt?.operationKind !== "EXECUTE_COMMAND" ||
    commitReceipt?.status !== "SUCCEEDED" ||
    commitReceipt?.commandName !== "COMMIT_DECLARATIVE_PACKAGE"
  ) {
    throw gatewayError(
      "TERMINAL_DISPOSITION_NOT_PERMITTED",
      "The mapping result does not match a committed package receipt.",
    );
  }
};

const assertMappingCommitReceiptIdentity = (
  commitReceipt: AffiliateAgentGatewayOperationReceipts | null,
  authorized: AuthorizedClaim,
): void => {
  assertMappingCommitReceiptOwnership(commitReceipt, authorized);
  assertMappingCommitReceiptOperation(commitReceipt);
};

const assertMappingCommitReceiptOutput = (
  commitReceipt: AffiliateAgentGatewayOperationReceipts | null,
  commitResult: AffiliateAgentCommandResult | null,
  packageHash: string,
): void => {
  if (
    commitResult?.receiptId !== commitReceipt?.id ||
    commitResult?.commandType !== "COMMIT_DECLARATIVE_PACKAGE" ||
    commitResult?.safeOutput?.packageHash !== packageHash
  ) {
    throw gatewayError(
      "TERMINAL_DISPOSITION_NOT_PERMITTED",
      "The mapping result does not match a committed package receipt.",
    );
  }
};

const assertMappingTerminalResultCommitted = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  result: AffiliateAgentTerminalResultEnvelope,
): Promise<void> => {
  if (
    result.role !== "MAPPING_PRODUCER" ||
    (result.disposition !== "PACKAGE_COMMITTED" &&
      result.disposition !== "BOUNDED_REPAIR_SUBMITTED")
  ) {
    return;
  }
  if (
    result.disposition === "BOUNDED_REPAIR_SUBMITTED" &&
    authorized.envelope.role === "MAPPING_PRODUCER" &&
    result.payload.repairPass !== authorized.envelope.subject.pass
  ) {
    throw gatewayError(
      "TERMINAL_DISPOSITION_NOT_PERMITTED",
      "The repair pass does not match the Mapping Producer claim.",
    );
  }
  const commitReceipt =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: result.payload.commitReceiptId },
    });
  const commitResult = tryReplayCommandReceipt(commitReceipt);
  assertMappingCommitReceiptIdentity(commitReceipt, authorized);
  assertMappingCommitReceiptOutput(
    commitReceipt,
    commitResult,
    result.payload.packageHash,
  );
};

const lifecycleGenerationFromCommandResult = (
  commandResult: AffiliateAgentCommandResult | null,
): number | null => {
  const lifecycleGeneration = commandResult?.safeOutput?.lifecycleGeneration;
  return typeof lifecycleGeneration === "number" &&
    Number.isInteger(lifecycleGeneration)
    ? lifecycleGeneration
    : null;
};

const assertHumanLifecycleResultTarget = (
  result: Extract<
    AffiliateAgentTerminalResultEnvelope,
    Readonly<{
      role: "HUMAN_DIRECTED_EXECUTOR";
      disposition: "LIFECYCLE_COMMAND_EXECUTED";
    }>
  >,
  subject: Extract<AffiliateAgentSubject, { type: "HUMAN_DIRECTED_EXECUTOR" }>,
): void => {
  if (
    result.payload.caseId !== subject.caseId ||
    result.payload.lifecycleCommandRef !== subject.lifecycleCommandRef
  ) {
    throw gatewayError(
      "TERMINAL_DISPOSITION_NOT_PERMITTED",
      "The human-directed result does not match the recorded lifecycle command.",
    );
  }
};

const assertHumanLifecycleReceiptOperation = (
  lifecycleReceipt: AffiliateAgentGatewayOperationReceipts | null,
  lifecycleCommandResult: AffiliateAgentCommandResult | null,
  authorized: AuthorizedClaim,
): void => {
  if (
    lifecycleReceipt?.claimId !== authorized.claim.id ||
    lifecycleReceipt.status !== "SUCCEEDED" ||
    lifecycleReceipt.commandName !==
      "EXECUTE_RECORDED_LIFECYCLE_COMMAND" ||
    lifecycleCommandResult?.receiptId !== lifecycleReceipt.id ||
    lifecycleCommandResult?.commandType !==
      "EXECUTE_RECORDED_LIFECYCLE_COMMAND"
  ) {
    throw gatewayError(
      "TERMINAL_DISPOSITION_NOT_PERMITTED",
      "The human-directed result does not match the recorded lifecycle command.",
    );
  }
};

const assertHumanLifecycleReceiptIdentity = (
  lifecycleReceipt: AffiliateAgentGatewayOperationReceipts | null,
  lifecycleCommandResult: AffiliateAgentCommandResult | null,
  authorized: AuthorizedClaim,
  result: Extract<
    AffiliateAgentTerminalResultEnvelope,
    Readonly<{
      role: "HUMAN_DIRECTED_EXECUTOR";
      disposition: "LIFECYCLE_COMMAND_EXECUTED";
    }>
  >,
  subject: Extract<AffiliateAgentSubject, { type: "HUMAN_DIRECTED_EXECUTOR" }>,
): void => {
  assertHumanLifecycleResultTarget(result, subject);
  assertHumanLifecycleReceiptOperation(
    lifecycleReceipt,
    lifecycleCommandResult,
    authorized,
  );
};

const assertHumanLifecycleGeneration = (
  authorized: AuthorizedClaim,
  lifecycleGeneration: number | null,
): void => {
  if (
    authorized.claim.lifecycleGeneration === null
    || (
      lifecycleGeneration !== authorized.claim.lifecycleGeneration
      && lifecycleGeneration !== authorized.claim.lifecycleGeneration + 1
    )
  ) {
    throw gatewayError(
      "TERMINAL_DISPOSITION_NOT_PERMITTED",
      "The human-directed result does not match the recorded lifecycle command.",
    );
  }
};

const assertHumanLifecycleCommandRecorded = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  result: AffiliateAgentTerminalResultEnvelope,
): Promise<void> => {
  if (
    result.role !== "HUMAN_DIRECTED_EXECUTOR" ||
    authorized.envelope.role !== "HUMAN_DIRECTED_EXECUTOR" ||
    result.disposition !== "LIFECYCLE_COMMAND_EXECUTED"
  ) {
    return;
  }
  const subject = authorized.envelope.subject;
  const lifecycleReceipt =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: result.payload.receiptId },
    });
  const lifecycleCommandResult = tryReplayCommandReceipt(lifecycleReceipt);
  assertHumanLifecycleReceiptIdentity(
    lifecycleReceipt,
    lifecycleCommandResult,
    authorized,
    result,
    subject,
  );
  assertHumanLifecycleGeneration(
    authorized,
    lifecycleGenerationFromCommandResult(lifecycleCommandResult),
  );
};

const assertSchemaCorrectionBudget = (submissionNumber: number): void => {
  if (
    submissionNumber < 1 ||
    submissionNumber > AFFILIATE_AGENT_MAX_SCHEMA_CORRECTIONS
  ) {
    throw gatewayError(
      "SCHEMA_CORRECTIONS_EXHAUSTED",
      "The schema-correction budget is exhausted.",
    );
  }
};

const recordExhaustedSchemaCorrection = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  input: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>,
  requestHash: string,
  now: Date,
  submissionNumber: number,
  correctionIssues: AffiliateAgentSchemaCorrectionResult["issues"],
): Promise<AffiliateAgentInvocationFailedResult> => {
  await assertNoPendingClaimEffects(transaction, authorized.claim.id);
  const safeSummary = [
    "The invocation exhausted its schema-correction budget.",
    ...correctionIssues.map(issue => `${JSON.stringify(issue.path)} ${issue.code}: ${issue.message}`),
  ].join("\n").slice(0, MAX_INVOCATION_FAILURE_SUMMARY_CHARACTERS);
  const result = await recordInvocationFailureTransition({
    dependencies,
    transaction,
    claim: authorized.claim,
    job: authorized.job,
    idempotencyKey: input.idempotencyKey,
    operationKind: input.kind,
    requestHash,
    failureCode: "SCHEMA_CORRECTIONS_EXHAUSTED",
    failedAt: now,
    safeSummary,
    evidenceRefs: [],
    claimCasFailure: "GATEWAY_ERROR",
    claimStatus: "FAILED",
    actorKind: "AGENT_INVOCATION",
    actorId: authorized.claim.invocationId,
    eventType: "CLAIM_INVOCATION_FAILED",
    schemaCorrectionCount: submissionNumber,
  });
  await persistInvocationFailureAlertIntent(
    transaction,
    dependencies,
    invocationFailureAlertContextForAuthorizedClaim(authorized),
    result,
    "SCHEMA_CORRECTIONS_EXHAUSTED",
    safeSummary,
  );
  return result;
};

const persistSchemaCorrection = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  input: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>,
  requestHash: string,
  now: Date,
  submissionNumber: number,
  correctionIssues: AffiliateAgentSchemaCorrectionResult["issues"] = schemaCorrectionIssues,
): Promise<AffiliateAgentSchemaCorrectionResult> => {
  const receiptId = dependencies.identifiers.create("receipt");
  const remainingSubmissions =
    AFFILIATE_AGENT_MAX_SCHEMA_CORRECTIONS - submissionNumber;
  const issues = [...correctionIssues];
  const correctionResult: AffiliateAgentSchemaCorrectionResult = {
    kind: "SCHEMA_CORRECTION_REQUIRED",
    receiptId,
    submissionNumber: submissionNumber as 1 | 2,
    remainingSubmissions: remainingSubmissions as 1 | 2,
    issues,
    correctionPrompt: [
      `Correct terminal result submission ${submissionNumber}. Remaining submissions: ${remainingSubmissions}.`,
      canonicalizeAffiliateAgentValue({ issues }),
    ].join("\n"),
  };
  const claimUpdated =
    await transaction.affiliateAgentGatewayClaims.updateMany({
      where: {
        id: authorized.claim.id,
        status: "ACTIVE",
        claimGeneration: authorized.claim.claimGeneration,
        tokenInvalidatedAt: null,
      },
      data: { schemaCorrectionCount: submissionNumber },
    });
  if (claimUpdated.count !== 1) {
    throw gatewayError(
      "CLAIM_NOT_ACTIVE",
      "The schema correction lost the active claim compare-and-set.",
    );
  }
  const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany({
    where: {
      id: authorized.job.id,
      status: "CLAIMED",
      activeClaimId: authorized.claim.id,
      claimGeneration: authorized.claim.claimGeneration,
      eventSequence: authorized.job.eventSequence,
    },
    data: { eventSequence: { increment: 1 } },
  });
  if (jobUpdated.count !== 1) {
    throw new AffiliateAgentClaimRaceError();
  }
  await transaction.affiliateAgentGatewayOperationReceipts.create({
    data: {
      id: receiptId,
      claimId: authorized.claim.id,
      jobId: authorized.job.id,
      claimGeneration: authorized.claim.claimGeneration,
      idempotencyKey: input.idempotencyKey,
      operationKind: input.kind,
      requestHash,
      status: "SUCCEEDED",
      responseHash: hashAffiliateAgentValue(correctionResult),
      responseJson: asPrismaJson(correctionResult),
      startedAt: now,
      completedAt: now,
      retentionClass: "INDEFINITE",
    },
  });
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `schema-correction:${receiptId}`,
      jobId: authorized.job.id,
      claimId: authorized.claim.id,
      receiptId,
      sequence: authorized.job.eventSequence + 1,
      eventType: "CLAIM_SCHEMA_CORRECTION_REQUIRED",
      actorKind: "AGENT_INVOCATION",
      actorId: authorized.claim.invocationId,
      role: authorized.claim.role,
      requestHash,
      outputHash: hashAffiliateAgentValue(correctionResult),
      payload: asPrismaJson({
        submissionNumber,
        remainingSubmissions,
      }),
      retentionClass: "INDEFINITE",
    },
  });
  return correctionResult;
};

const handleInvalidTerminalResult = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  input: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>,
  requestHash: string,
  now: Date,
  correctionIssues: AffiliateAgentSchemaCorrectionResult["issues"] =
    schemaCorrectionIssues,
): Promise<AffiliateAgentSchemaCorrectionResult | AffiliateAgentInvocationFailedResult> => {
  const submissionNumber = authorized.claim.schemaCorrectionCount + 1;
  assertSchemaCorrectionBudget(submissionNumber);
  if (submissionNumber === AFFILIATE_AGENT_MAX_SCHEMA_CORRECTIONS) {
    return recordExhaustedSchemaCorrection(
      transaction,
      dependencies,
      authorized,
      input,
      requestHash,
      now,
      submissionNumber,
      correctionIssues,
    );
  }
  return persistSchemaCorrection(
    transaction,
    dependencies,
    authorized,
    input,
    requestHash,
    now,
    submissionNumber,
    correctionIssues,
  );
};
const persistSourceExclusionTerminalCorrection = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>,
  requestHash: string,
  authorizationOptions: ClaimAuthorizationOptions | undefined,
  correctionIssues: AffiliateAgentSchemaCorrectionResult["issues"],
): Promise<AffiliateAgentSubmitResultOutcome> =>
  runSerializableEffectTransaction(
    dependencies,
    async (transaction) => {
      const now = dependencies.clock.now();
      const authorized = await authorizeClaimOperation(
        dependencies,
        input.authorization,
        now,
        transaction,
        authorizationOptions,
      );
      await assertNoPendingClaimEffects(transaction, authorized.claim.id);
      return handleInvalidTerminalResult(
        transaction,
        dependencies,
        authorized,
        input,
        requestHash,
        now,
        correctionIssues,
      );
    },
    {
      code: "INTERNAL_ERROR",
      safeMessage: "The source exclusion terminal result correction could not be recorded.",
    },
  );


const assertTerminalCompletionTiming = (
  authorized: AuthorizedClaim,
  completionNow: Date,
  isPostEffectCompletionAllowed: boolean,
): void => {
  if (
    !isPostEffectCompletionAllowed &&
    authorized.claim.hardDeadlineAt < completionNow
  ) {
    throw gatewayError(
      "HARD_DEADLINE_EXCEEDED",
      "The claim hard deadline passed before terminal completion.",
    );
  }
  if (
    !isPostEffectCompletionAllowed &&
    authorized.claim.leaseExpiresAt <= completionNow
  ) {
    throw gatewayError(
      "LEASE_EXPIRED",
      "The claim lease expired before terminal completion.",
    );
  }
};

type GatewayDomainDelegate = Readonly<{
  findFirst?: (args: unknown) => Promise<unknown>;
  findUnique?: (args: unknown) => Promise<unknown>;
  findMany?: (args: unknown) => Promise<unknown>;
  update?: (args: unknown) => Promise<unknown>;
  updateMany?: (args: unknown) => Promise<unknown>;
  upsert?: (args: unknown) => Promise<unknown>;
  create?: (args: unknown) => Promise<unknown>;
}>;

const gatewayDomainDelegate = (
  transaction: Prisma.TransactionClient,
  name: string,
): GatewayDomainDelegate | undefined => {
  const value = (transaction as unknown as Record<string, unknown>)[name];
  return value !== null && typeof value === "object"
    ? value as GatewayDomainDelegate
    : undefined;
};

const gatewayDomainRecord = (
  value: unknown,
): Record<string, unknown> | null => (
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

type CoveragePlannerTerminalResult = Extract<
  AffiliateAgentTerminalResultEnvelope,
  Readonly<{ role: "COVERAGE_PLANNER" }>
>;

type MappingProducerTerminalResult =
  | Extract<
      AffiliateAgentTerminalResultEnvelope,
      Readonly<{
        role: "MAPPING_PRODUCER";
        disposition: "PACKAGE_COMMITTED";
      }>
    >
  | Extract<
      AffiliateAgentTerminalResultEnvelope,
      Readonly<{
        role: "MAPPING_PRODUCER";
        disposition: "BOUNDED_REPAIR_SUBMITTED";
      }>
    >
  | Extract<
      AffiliateAgentTerminalResultEnvelope,
      Readonly<{
        role: "MAPPING_PRODUCER";
        disposition: "SOURCE_INCOMPATIBLE";
      }>
    >
  | Extract<
      AffiliateAgentTerminalResultEnvelope,
      Readonly<{
        role: "MAPPING_PRODUCER";
        disposition: "CONTRACT_GAP";
      }>
    >;
type MappingProducerSuccessTerminalResult = Exclude<
  MappingProducerTerminalResult,
  Extract<
    MappingProducerTerminalResult,
    Readonly<{
      disposition: "SOURCE_INCOMPATIBLE" | "CONTRACT_GAP";
    }>
  >
>;

type MappingProducerFailureTerminalResult = Exclude<
  MappingProducerTerminalResult,
  MappingProducerSuccessTerminalResult
>;

const isMappingProducerSuccessTerminalResult = (
  result: MappingProducerTerminalResult,
): result is MappingProducerSuccessTerminalResult =>
  result.disposition === "PACKAGE_COMMITTED"
  || result.disposition === "BOUNDED_REPAIR_SUBMITTED";

type GovernedTerminalDomainResult =
  | CoveragePlannerTerminalResult
  | MappingProducerTerminalResult;

const appendGatewayDomainEvidenceRefs = (
  current: unknown,
  result: AffiliateAgentTerminalResultEnvelope,
  jobId: string,
): string[] => Array.from(new Set([
  ...(Array.isArray(current)
    ? current.filter((value): value is string => typeof value === "string")
    : []),
  `gateway-job:${jobId}`,
  ...result.evidenceRefs,
]));
type CoveragePlannerWaveTransition = Readonly<{
  waveData: Record<string, unknown>;
  demandStatus: "OPEN" | "PAUSED" | null;
  demandReason: string | null;
  demandNextEligibleAt: Date | null;
  searchSaturatedUntil: Date | null;
}>;

const coveragePlannerBaseWaveData = (
  currentEvidenceRefs: unknown,
  result: CoveragePlannerTerminalResult,
  jobId: string,
): Record<string, unknown> => ({
  resultJson: asPrismaJson(result),
  evidenceRefs: appendGatewayDomainEvidenceRefs(
    currentEvidenceRefs,
    result,
    jobId,
  ),
  provider: "COVERAGE_PLANNER",
});

const coveragePlannerCampaignTransition = (
  baseWaveData: Record<string, unknown>,
  result: Extract<
    CoveragePlannerTerminalResult,
    Readonly<{ disposition: "CAMPAIGN_PROPOSED" }>
  >,
): CoveragePlannerWaveTransition => ({
  waveData: {
    ...baseWaveData,
    status: "ACTIVE",
    terminalAt: null,
    retryAt: null,
    campaignId: result.payload.campaignProposalRefs[0],
    evidenceRefs: Array.from(new Set([
      ...(Array.isArray(baseWaveData.evidenceRefs)
        ? baseWaveData.evidenceRefs.filter(
            (value): value is string => typeof value === "string",
          )
        : []),
      `campaign:${result.payload.campaignProposalRefs[0]}`,
    ])),
    errorCode: null,
  },
  demandStatus: "OPEN",
  demandReason: "CAMPAIGN_DISPATCHED",
  demandNextEligibleAt: null,
  searchSaturatedUntil: null,
});

const coveragePlannerCaptureFailureTransition = (
  baseWaveData: Record<string, unknown>,
  now: Date,
): CoveragePlannerWaveTransition => {
  const retryAt = new Date(now.getTime() + 30 * 60 * 1000);
  return {
    waveData: {
      ...baseWaveData,
      status: "WAITING",
      terminalAt: null,
      retryAt,
      errorCode: "COVERAGE_PLANNING_CAPTURE_FAILED",
    },
    demandStatus: null,
    demandReason: null,
    demandNextEligibleAt: null,
    searchSaturatedUntil: null,
  };
};

const coveragePlannerPauseTransition = (
  baseWaveData: Record<string, unknown>,
  now: Date,
  errorCode: string,
): CoveragePlannerWaveTransition => ({
  waveData: {
    ...baseWaveData,
    status: "PAUSED",
    terminalAt: now,
    retryAt: null,
    errorCode,
  },
  demandStatus: "PAUSED",
  demandReason: errorCode,
  demandNextEligibleAt: null,
  searchSaturatedUntil: null,
});

const coveragePlannerNoActionTransition = (
  baseWaveData: Record<string, unknown>,
  result: Extract<
    CoveragePlannerTerminalResult,
    Readonly<{ disposition: "NO_ACTION" }>
  >,
  now: Date,
): CoveragePlannerWaveTransition => {
  const isSearchSaturated = result.payload.basis === "SEARCH_SATURATED";
  const retryAt = isSearchSaturated
    ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
    : null;
  return {
    waveData: {
      ...baseWaveData,
      status: "SUCCEEDED",
      terminalAt: now,
      retryAt,
      marginalYield: 0,
      errorCode: null,
    },
    demandStatus: "OPEN",
    demandReason: isSearchSaturated
      ? "SEARCH_SATURATION"
      : "COVERAGE_PLANNING_NO_ACTION",
    demandNextEligibleAt: retryAt,
    searchSaturatedUntil: retryAt,
  };
};

const coveragePlannerWaveTransitionFor = (
  currentEvidenceRefs: unknown,
  result: CoveragePlannerTerminalResult,
  jobId: string,
  now: Date,
): CoveragePlannerWaveTransition => {
  const baseWaveData = coveragePlannerBaseWaveData(
    currentEvidenceRefs,
    result,
    jobId,
  );
  switch (result.disposition) {
    case "CAMPAIGN_PROPOSED":
      return coveragePlannerCampaignTransition(baseWaveData, result);
    case "FAILED_CAPTURE_EVIDENCE_RECORDED":
      return coveragePlannerCaptureFailureTransition(baseWaveData, now);
    case "SOURCE_EXCLUSION_PROPOSED":
      return coveragePlannerPauseTransition(
        baseWaveData,
        now,
        "COVERAGE_PLANNING_SOURCE_EXCLUDED",
      );
    case "CONTRACT_GAP":
      return coveragePlannerPauseTransition(
        baseWaveData,
        now,
        "COVERAGE_PLANNING_CONTRACT_GAP",
      );
    case "NO_ACTION":
      return coveragePlannerNoActionTransition(baseWaveData, result, now);
  }
  throw gatewayError(
    "INTERNAL_ERROR",
    "The coverage planner terminal disposition is unsupported.",
  );
};

const coveragePlannerDemandReasonCodesFor = (
  demand: Record<string, unknown>,
  transition: CoveragePlannerWaveTransition,
): string[] => {
  const currentReasonCodes = Array.isArray(demand.reasonCodes)
    ? demand.reasonCodes.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  return transition.demandReason === null
    ? currentReasonCodes
    : Array.from(new Set([...currentReasonCodes, transition.demandReason]));
};

const updateCoveragePlannerDemand = async (
  demands: GatewayDomainDelegate | undefined,
  transition: CoveragePlannerWaveTransition,
  effect: Readonly<Record<string, unknown>>,
  demandId: string,
): Promise<Readonly<Record<string, unknown>>> => {
  if (!demands?.findUnique || !demands.update) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The coverage planner terminal result is missing its replenishment demand.",
    );
  }
  const demand = gatewayDomainRecord(await demands.findUnique({
    where: { id: demandId },
  }));
  if (!demand) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The coverage planner terminal result references a missing replenishment demand.",
    );
  }
  await demands.update({
    where: { id: demand.id },
    data: {
      status: transition.demandStatus,
      activeWaveId: null,
      nextEligibleAt: transition.demandNextEligibleAt,
      searchSaturatedUntil: transition.searchSaturatedUntil,
      generation: Number(demand.generation ?? 0) + 1,
      reasonCodes: coveragePlannerDemandReasonCodesFor(demand, transition),
    },
  });
  return { ...effect, demandId };
};

const applyCoveragePlannerDemandEffect = async (
  demands: GatewayDomainDelegate | undefined,
  wave: Record<string, unknown>,
  transition: CoveragePlannerWaveTransition,
): Promise<Readonly<Record<string, unknown>>> => {
  const effect = {
    kind: "COVERAGE_PLANNER_TERMINAL_EFFECT",
    waveId: String(wave.id),
    status: String(transition.waveData.status),
  };
  if (transition.demandStatus === null) return effect;
  const demandId = typeof wave.demandId === "string" ? wave.demandId.trim() : "";
  if (!demandId) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The coverage planner terminal result is missing its replenishment demand.",
    );
  }
  return updateCoveragePlannerDemand(
    demands,
    transition,
    effect,
    demandId,
  );
};

type CoveragePlannerDispatchResult = Readonly<{
  campaignIds: readonly string[];
  intakeIds: readonly string[];
  mappingJobIds: readonly string[];
  producerJobIds: readonly string[];
  discoveryResultIds: readonly string[];
}>;

const coveragePlannerStringValue = (value: unknown): string | null => (
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null
);

const coveragePlannerLineageValue = (
  metadata: Record<string, unknown>,
  key: string,
): unknown => metadata[key]
  ?? gatewayDomainRecord(metadata.coverageLineage)?.[key]
  ?? gatewayDomainRecord(metadata.lineage)?.[key];

const coveragePlannerEvidenceManifestFor = (
  campaign: Record<string, unknown>,
  discoveryResult: Record<string, unknown>,
): Record<string, unknown> => {
  const campaignMetadata = gatewayDomainRecord(campaign.metadata) ?? {};
  const resultMetadata = gatewayDomainRecord(discoveryResult.metadata) ?? {};
  const candidate = campaignMetadata.evidenceManifest
    ?? resultMetadata.evidenceManifest;
  if (candidate === undefined) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign discovery result has no durable evidence manifest.",
    );
  }
  const parsed = affiliateAgentEvidenceManifestSchema.safeParse(candidate);
  if (!parsed.success || parsed.data.entries.length === 0) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign downstream evidence manifest must contain durable entries.",
    );
  }
  return parsed.data;
};

type CoveragePlannerDispatchDelegates = Readonly<{
  campaigns: GatewayDomainDelegate;
  discoveryResults: GatewayDomainDelegate;
  intakes: GatewayDomainDelegate;
  pages: GatewayDomainDelegate | undefined;
  mappingJobs: GatewayDomainDelegate;
  gatewayJobs: GatewayDomainDelegate;
  sources: GatewayDomainDelegate;
  supplySources: GatewayDomainDelegate;
  demands: GatewayDomainDelegate;
}>;

type CoveragePlannerDispatchDelegateCandidates = Readonly<{
  [Key in keyof CoveragePlannerDispatchDelegates]:
    GatewayDomainDelegate | undefined;
}>;

const hasCoveragePlannerLineageDelegates = (
  delegates: CoveragePlannerDispatchDelegateCandidates,
): boolean => Boolean(
  delegates.campaigns?.findUnique
  && delegates.discoveryResults?.findMany
  && delegates.intakes?.findUnique,
);

const hasCoveragePlannerJobDelegates = (
  delegates: CoveragePlannerDispatchDelegateCandidates,
): boolean => Boolean(
  delegates.mappingJobs?.findFirst
  && delegates.mappingJobs.upsert
  && delegates.mappingJobs.update
  && delegates.gatewayJobs?.upsert,
);

const hasCoveragePlannerSourceDelegates = (
  delegates: CoveragePlannerDispatchDelegateCandidates,
): boolean => Boolean(
  delegates.sources?.findUnique
  && delegates.supplySources?.findUnique
  && delegates.demands?.findUnique,
);

const requireCoveragePlannerDispatchDelegates = (
  delegates: CoveragePlannerDispatchDelegateCandidates,
): CoveragePlannerDispatchDelegates => {
  if (
    !hasCoveragePlannerLineageDelegates(delegates)
    || !hasCoveragePlannerJobDelegates(delegates)
    || !hasCoveragePlannerSourceDelegates(delegates)
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "Coverage campaign dispatch requires complete durable lineage delegates.",
    );
  }
  return {
    campaigns: delegates.campaigns!,
    discoveryResults: delegates.discoveryResults!,
    intakes: delegates.intakes!,
    pages: delegates.pages,
    mappingJobs: delegates.mappingJobs!,
    gatewayJobs: delegates.gatewayJobs!,
    sources: delegates.sources!,
    supplySources: delegates.supplySources!,
    demands: delegates.demands!,
  };
};

const coveragePlannerDispatchDelegatesFor = (
  transaction: Prisma.TransactionClient,
): CoveragePlannerDispatchDelegates => {
  const delegates: CoveragePlannerDispatchDelegateCandidates = {
    campaigns: gatewayDomainDelegate(
      transaction,
      "affiliateSourceDiscoveryCampaigns",
    ),
    discoveryResults: gatewayDomainDelegate(
      transaction,
      "affiliateSourceDiscoveryResults",
    ),
    intakes: gatewayDomainDelegate(transaction, "affiliateSourceIntakes"),
    pages: gatewayDomainDelegate(transaction, "affiliateSourceIntakePages"),
    mappingJobs: gatewayDomainDelegate(
      transaction,
      "affiliateSourceMappingJobs",
    ),
    gatewayJobs: gatewayDomainDelegate(
      transaction,
      "affiliateAgentGatewayJobs",
    ),
    sources: gatewayDomainDelegate(transaction, "affiliateScrapeSources"),
    supplySources: gatewayDomainDelegate(transaction, "affiliateSupplySources"),
    demands: gatewayDomainDelegate(
      transaction,
      "affiliateReplenishmentDemands",
    ),
  };
  return requireCoveragePlannerDispatchDelegates(delegates);
};

type CoveragePlannerDispatchContext = Readonly<{
  subject: Extract<
    AffiliateAgentClaimEnvelope["subject"],
    Readonly<{ type: "COVERAGE_PLANNER" }>
  >;
  demand: Record<string, unknown>;
  expectedContractVersion: number;
  expectedContractHash: string;
  expectedRolloutCohort: string;
  priority: number;
  evidenceManifest: Record<string, unknown>;
  parentClaimId: string;
  delegates: CoveragePlannerDispatchDelegates;
}>;

const coveragePlannerDispatchDemandFor = async (
  delegates: CoveragePlannerDispatchDelegates,
  wave: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const demandId = coveragePlannerStringValue(wave.demandId);
  if (!demandId) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The coverage campaign result has no replenishment demand.",
    );
  }
  const demand = gatewayDomainRecord(await delegates.demands.findUnique!({
    where: { id: demandId },
  }));
  if (!demand) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The coverage campaign result references a missing replenishment demand.",
    );
  }
  return demand;
};

const coveragePlannerDispatchGenerationsMatch = (
  demandGeneration: number,
  waveDemandGeneration: number,
): boolean => demandGeneration === waveDemandGeneration
  && Number.isSafeInteger(demandGeneration)
  && Number.isSafeInteger(waveDemandGeneration);

const coveragePlannerDispatchContractMatches = (
  authorized: AuthorizedClaim,
  wave: Record<string, unknown>,
  expectedContractVersion: number,
  expectedContractHash: string | null,
  expectedRolloutCohort: string | null,
): boolean => Number.isSafeInteger(expectedContractVersion)
  && expectedContractHash !== null
  && expectedRolloutCohort !== null
  && wave.rolloutCohort === expectedRolloutCohort
  && authorized.claim.supplyContractVersion === expectedContractVersion
  && authorized.claim.supplyContractHash === expectedContractHash;

const assertCoveragePlannerDispatchContext = (
  authorized: AuthorizedClaim,
  subject: Extract<
    AffiliateAgentClaimEnvelope["subject"],
    Readonly<{ type: "COVERAGE_PLANNER" }>
  >,
  wave: Record<string, unknown>,
  demand: Record<string, unknown>,
  demandGeneration: number,
  waveDemandGeneration: number,
  expectedContractVersion: number,
  expectedContractHash: string | null,
  expectedRolloutCohort: string | null,
  expectedAssessmentCycleId: string,
): void => {
  const generationsMatch = coveragePlannerDispatchGenerationsMatch(
    demandGeneration,
    waveDemandGeneration,
  );
  const subjectMatches = demand.targetKey === subject.coverageCellId
    && subject.assessmentCycleId === expectedAssessmentCycleId;
  const contractMatches = coveragePlannerDispatchContractMatches(
    authorized,
    wave,
    expectedContractVersion,
    expectedContractHash,
    expectedRolloutCohort,
  );
  if (!generationsMatch || !subjectMatches || !contractMatches) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The coverage campaign result does not match its demand, cycle, or contract.",
    );
  }
};

const coveragePlannerDispatchContextFor = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  wave: Record<string, unknown>,
): Promise<CoveragePlannerDispatchContext> => {
  const subject = authorized.envelope.subject;
  if (subject.type !== "COVERAGE_PLANNER") {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The coverage planner terminal result has no coverage subject.",
    );
  }
  const delegates = coveragePlannerDispatchDelegatesFor(transaction);
  const demand = await coveragePlannerDispatchDemandFor(delegates, wave);
  const expectedContractVersion = Number(demand.contractVersion);
  const demandGeneration = Number(demand.generation);
  const waveDemandGeneration = Number(wave.demandGeneration);
  const expectedContractHash = coveragePlannerStringValue(demand.contractHash);
  const expectedRolloutCohort = coveragePlannerStringValue(demand.rolloutCohort);
  const expectedAssessmentCycleId =
    `${demand.id}:generation:${String(waveDemandGeneration)}`;
  assertCoveragePlannerDispatchContext(
    authorized,
    subject,
    wave,
    demand,
    demandGeneration,
    waveDemandGeneration,
    expectedContractVersion,
    expectedContractHash,
    expectedRolloutCohort,
    expectedAssessmentCycleId,
  );
  return {
    subject,
    demand,
    expectedContractVersion,
    expectedContractHash: expectedContractHash!,
    expectedRolloutCohort: expectedRolloutCohort!,
    priority: Number(authorized.job.priority ?? 0),
    evidenceManifest: gatewayDomainRecord(
      authorized.envelope.evidenceManifest,
    ) ?? {},
    parentClaimId: authorized.claim.id,
    delegates,
  };
};

type CoveragePlannerCampaignLineage = Readonly<{
  metadata: Record<string, unknown> | null;
  demandId: unknown;
  cellMatches: boolean;
  assessmentCycleId: unknown;
  rolloutCohort: unknown;
  contractVersion: unknown;
  contractHash: unknown;
  waveId: unknown;
}>;

const coveragePlannerCampaignMetadataFor = (
  campaign: Record<string, unknown> | null,
): Record<string, unknown> | null => campaign === null
  ? null
  : gatewayDomainRecord(campaign.metadata) ?? {};

const coveragePlannerCampaignLineageValueFor = (
  metadata: Record<string, unknown>,
  key: string,
  fallbackKey: string,
): unknown => coveragePlannerLineageValue(metadata, key)
  ?? coveragePlannerLineageValue(metadata, fallbackKey);

const coveragePlannerCampaignCellMatchesFor = (
  context: CoveragePlannerDispatchContext,
  metadata: Record<string, unknown>,
): boolean => {
  const directCellId = coveragePlannerLineageValue(metadata, "coverageCellId");
  if (directCellId === context.subject.coverageCellId) return true;
  const coverageCellIds = coveragePlannerLineageValue(metadata, "coverageCellIds");
  return Array.isArray(coverageCellIds)
    && coverageCellIds.includes(context.subject.coverageCellId);
};


const coveragePlannerCampaignLineageFor = (
  context: CoveragePlannerDispatchContext,
  campaign: Record<string, unknown> | null,
): CoveragePlannerCampaignLineage => {
  const metadata = coveragePlannerCampaignMetadataFor(campaign);
  const source = metadata ?? {};
  return {
    metadata,
    demandId: coveragePlannerCampaignLineageValueFor(
      source,
      "demandId",
      "coverageDemandId",
    ),
    cellMatches: coveragePlannerCampaignCellMatchesFor(context, source),
    assessmentCycleId: coveragePlannerCampaignLineageValueFor(
      source,
      "assessmentCycleId",
      "coverageAssessmentCycleId",
    ),
    rolloutCohort: coveragePlannerCampaignLineageValueFor(
      source,
      "rolloutCohort",
      "coverageRolloutCohort",
    ),
    contractVersion: coveragePlannerCampaignLineageValueFor(
      source,
      "contractVersion",
      "coverageContractVersion",
    ),
    contractHash: coveragePlannerCampaignLineageValueFor(
      source,
      "contractHash",
      "coverageContractHash",
    ),
    waveId: coveragePlannerCampaignLineageValueFor(
      source,
      "waveId",
      "coverageWaveId",
    ),
  };
};

const coveragePlannerCampaignIdentityMatches = (
  context: CoveragePlannerDispatchContext,
  wave: Record<string, unknown>,
  lineage: CoveragePlannerCampaignLineage,
): boolean => lineage.demandId === context.demand.id
  && lineage.cellMatches
  && lineage.assessmentCycleId === context.subject.assessmentCycleId
  && lineage.waveId === wave.id;

const coveragePlannerCampaignContractMatches = (
  context: CoveragePlannerDispatchContext,
  lineage: CoveragePlannerCampaignLineage,
): boolean => lineage.rolloutCohort === context.expectedRolloutCohort
  && Number(lineage.contractVersion) === context.expectedContractVersion
  && lineage.contractHash === context.expectedContractHash;

const requireCoveragePlannerCampaign = (
  context: CoveragePlannerDispatchContext,
  wave: Record<string, unknown>,
  campaign: Record<string, unknown> | null,
  lineage: CoveragePlannerCampaignLineage,
): Record<string, unknown> => {
  if (
    !campaign
    || campaign.status === "ARCHIVED"
    || lineage.metadata === null
    || !coveragePlannerCampaignIdentityMatches(context, wave, lineage)
    || !coveragePlannerCampaignContractMatches(context, lineage)
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The coverage campaign reference is not bound to the claimed planning lineage.",
    );
  }
  return campaign;
};

const coveragePlannerCampaignFor = async (
  context: CoveragePlannerDispatchContext,
  campaignId: string,
  wave: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const campaign = gatewayDomainRecord(await context.delegates.campaigns.findUnique!({
    where: { id: campaignId },
  }));
  const lineage = coveragePlannerCampaignLineageFor(context, campaign);
  return requireCoveragePlannerCampaign(context, wave, campaign, lineage);
};

const coveragePlannerEligibleDiscoveryResultsFor = async (
  discoveryResults: GatewayDomainDelegate,
  campaignId: string,
): Promise<Record<string, unknown>[]> => {
  const rows = await discoveryResults.findMany?.({
    where: { campaignId },
    orderBy: [{ score: "desc" }, { createdAt: "asc" }],
  });
  return Array.isArray(rows)
    ? rows
      .map(gatewayDomainRecord)
      .filter((row): row is Record<string, unknown> => {
        if (!row) return false;
        const status = coveragePlannerStringValue(row.status);
        if (status === "BLOCKED" || status === "REJECTED") return false;
        const dispatch = gatewayDomainRecord(
          gatewayDomainRecord(row.metadata)?.coveragePlannerDispatch,
        );
        return !coveragePlannerStringValue(dispatch?.producerJobId);
      })
    : [];
};

type CoveragePlannerIntakeIdentity = Readonly<{
  canonicalUrl: string;
  name: string;
  urlKey: string;
}>;

const coveragePlannerIntakeIdentityFor = (
  discoveryResult: Record<string, unknown>,
): CoveragePlannerIntakeIdentity => {
  const canonicalUrl = coveragePlannerStringValue(discoveryResult.canonicalUrl);
  const name = coveragePlannerStringValue(discoveryResult.title);
  const urlKey = coveragePlannerStringValue(discoveryResult.urlKey);
  if (!canonicalUrl || !name || !urlKey) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign discovery result cannot materialize an intake without durable identity.",
    );
  }
  return { canonicalUrl, name, urlKey };
};

const coveragePlannerSourceTypeHintsFor = (
  discoveryResult: Record<string, unknown>,
): unknown[] => Array.isArray(discoveryResult.sourceTypeHints)
  ? discoveryResult.sourceTypeHints
  : [];

const insertCoveragePlannerIntake = async (
  intakes: GatewayDomainDelegate,
  campaign: Record<string, unknown>,
  discoveryResult: Record<string, unknown>,
  identity: CoveragePlannerIntakeIdentity,
): Promise<Record<string, unknown>> => {
  const sourceKey = `campaign:${campaign.id}:result:${discoveryResult.id}`;
  const intake = gatewayDomainRecord(await intakes.upsert?.({
    where: { sourceKey },
    create: {
      id: createId(),
      name: identity.name,
      sourceKey,
      region: campaign.region ?? null,
      baseUrl: identity.canonicalUrl,
      status: "DRAFT",
      complianceStatus: "UNREVIEWED",
      targetKindHints: coveragePlannerSourceTypeHintsFor(discoveryResult),
      notes: null,
      affiliateSourceId: discoveryResult.matchingSourceId ?? null,
      supplySourceId: discoveryResult.supplySourceId ?? null,
    },
    update: {},
  }));
  if (!intake) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign intake could not be materialized.",
    );
  }
  return intake;
};

const upsertCoveragePlannerIntakePage = async (
  pages: GatewayDomainDelegate | undefined,
  intake: Record<string, unknown>,
  discoveryResult: Record<string, unknown>,
  identity: CoveragePlannerIntakeIdentity,
): Promise<void> => {
  if (!pages?.upsert) return;
  await pages.upsert({
    where: { urlKey: identity.urlKey },
    create: {
      id: createId(),
      intakeId: intake.id,
      supplySourceId: discoveryResult.supplySourceId ?? null,
      url: identity.canonicalUrl,
      canonicalUrl: identity.canonicalUrl,
      urlKey: identity.urlKey,
      role: "LISTING",
      targetKindHints: coveragePlannerSourceTypeHintsFor(discoveryResult),
      status: "ACTIVE",
      discoverySource: "COVERAGE_PLANNER",
    },
    update: {},
  });
};

const materializeCoveragePlannerIntake = async (
  intakes: GatewayDomainDelegate,
  pages: GatewayDomainDelegate | undefined,
  campaign: Record<string, unknown>,
  discoveryResult: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const identity = coveragePlannerIntakeIdentityFor(discoveryResult);
  const intake = await insertCoveragePlannerIntake(
    intakes,
    campaign,
    discoveryResult,
    identity,
  );
  await upsertCoveragePlannerIntakePage(
    pages,
    intake,
    discoveryResult,
    identity,
  );
  return intake;
};

const coveragePlannerIntakeFor = async (
  context: CoveragePlannerDispatchContext,
  campaign: Record<string, unknown>,
  discoveryResult: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const { intakes, pages } = context.delegates;
  const intakeId = coveragePlannerStringValue(discoveryResult.matchingIntakeId);
  const intake = intakeId
    ? gatewayDomainRecord(await intakes.findUnique?.({ where: { id: intakeId } }))
    : await materializeCoveragePlannerIntake(
      intakes,
      pages,
      campaign,
      discoveryResult,
    );
  if (intakeId && !intake) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign discovery result references a missing intake.",
    );
  }
  return intake!;
};

type CoveragePlannerSourceLineage = Readonly<{
  intake: Record<string, unknown>;
  source: Record<string, unknown>;
  sourceId: string;
  supplySource: Record<string, unknown>;
  supplySourceId: string;
}>;

type CoveragePlannerScrapeSourceLink = Readonly<{
  source: Record<string, unknown>;
  sourceId: string;
}>;

const coveragePlannerScrapeSourceFor = async (
  sources: GatewayDomainDelegate,
  intake: Record<string, unknown>,
  discoveryResult: Record<string, unknown>,
): Promise<CoveragePlannerScrapeSourceLink> => {
  const resultSourceId = coveragePlannerStringValue(discoveryResult.matchingSourceId);
  const intakeSourceId = coveragePlannerStringValue(intake.affiliateSourceId);
  if (intake.affiliateSourceId != null && !intakeSourceId) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign intake has an invalid persisted scrape source link.",
    );
  }
  if (resultSourceId && intakeSourceId && resultSourceId !== intakeSourceId) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign discovery result conflicts with its persisted scrape source.",
    );
  }
  const sourceId = resultSourceId ?? intakeSourceId;
  if (!sourceId) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign intake has no durable scrape source.",
    );
  }
  const source = gatewayDomainRecord(await sources.findUnique!({
    where: { id: sourceId },
  }));
  if (!source) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign intake scrape source was not found.",
    );
  }
  return { source, sourceId };
};

type CoveragePlannerSupplySourceLink = Readonly<{
  supplySource: Record<string, unknown>;
  supplySourceId: string;
}>;

const coveragePlannerSupplySourceContractMatches = (
  context: CoveragePlannerDispatchContext,
  supplySource: Record<string, unknown> | null,
): boolean => supplySource !== null
  && supplySource.rolloutCohort === context.expectedRolloutCohort
  && (
    supplySource.activeSupplyContractVersion === null
    || supplySource.activeSupplyContractVersion === context.expectedContractVersion
  )
  && (
    supplySource.activeSupplyContractHash === null
    || supplySource.activeSupplyContractHash === context.expectedContractHash
  );

const coveragePlannerSupplySourceIdFor = (
  intake: Record<string, unknown>,
  discoveryResult: Record<string, unknown>,
  source: Record<string, unknown>,
): string => {
  const resultSupplySourceId = coveragePlannerStringValue(
    discoveryResult.supplySourceId,
  );
  const intakeSupplySourceId = coveragePlannerStringValue(intake.supplySourceId);
  if (intake.supplySourceId != null && !intakeSupplySourceId) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign intake has an invalid persisted Supply Source link.",
    );
  }
  if (
    resultSupplySourceId
    && intakeSupplySourceId
    && resultSupplySourceId !== intakeSupplySourceId
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign discovery result conflicts with its persisted Supply Source.",
    );
  }
  const sourceSupplySourceId = coveragePlannerStringValue(source.supplySourceId);
  const supplySourceId =
    resultSupplySourceId ?? intakeSupplySourceId ?? sourceSupplySourceId;
  if (!supplySourceId || source.supplySourceId !== supplySourceId) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign intake source is not bound to its Supply Source.",
    );
  }
  return supplySourceId;
};

const coveragePlannerSupplySourceFor = async (
  context: CoveragePlannerDispatchContext,
  supplySources: GatewayDomainDelegate,
  intake: Record<string, unknown>,
  discoveryResult: Record<string, unknown>,
  source: Record<string, unknown>,
): Promise<CoveragePlannerSupplySourceLink> => {
  const supplySourceId = coveragePlannerSupplySourceIdFor(
    intake,
    discoveryResult,
    source,
  );
  const supplySource = gatewayDomainRecord(await supplySources.findUnique!({
    where: { id: supplySourceId },
  }));
  if (!coveragePlannerSupplySourceContractMatches(context, supplySource)) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign Supply Source does not match the claimed contract.",
    );
  }
  return { supplySource: supplySource!, supplySourceId };
};

const compareAndSetCoveragePlannerIntakeSources = async (
  intakes: GatewayDomainDelegate,
  intake: Record<string, unknown>,
  sourceId: string,
  supplySourceId: string,
  missingAffiliateSource: boolean,
  missingSupplySource: boolean,
): Promise<void> => {
  if (!intakes.updateMany) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign intake link cannot be completed with a compare-and-set.",
    );
  }
  const updated = await intakes.updateMany({
    where: {
      id: intake.id,
      ...(missingAffiliateSource ? { affiliateSourceId: null } : {}),
      ...(missingSupplySource ? { supplySourceId: null } : {}),
    },
    data: {
      ...(missingAffiliateSource ? { affiliateSourceId: sourceId } : {}),
      ...(missingSupplySource ? { supplySourceId } : {}),
    },
  });
  if (
    updated !== undefined
    && typeof updated === "object"
    && Number((updated as Record<string, unknown>).count) !== 1
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign intake source links changed before compare-and-set.",
    );
  }
};

const linkCoveragePlannerIntakeSources = async (
  intakes: GatewayDomainDelegate,
  intake: Record<string, unknown>,
  sourceId: string,
  supplySourceId: string,
): Promise<void> => {
  const missingAffiliateSource = intake.affiliateSourceId === null
    || intake.affiliateSourceId === undefined;
  const missingSupplySource = intake.supplySourceId === null
    || intake.supplySourceId === undefined;
  if (!missingAffiliateSource && !missingSupplySource) return;
  await compareAndSetCoveragePlannerIntakeSources(
    intakes,
    intake,
    sourceId,
    supplySourceId,
    missingAffiliateSource,
    missingSupplySource,
  );
};

const coveragePlannerSourceLineageFor = async (
  context: CoveragePlannerDispatchContext,
  intake: Record<string, unknown>,
  discoveryResult: Record<string, unknown>,
): Promise<CoveragePlannerSourceLineage> => {
  const { intakes, sources, supplySources } = context.delegates;
  const { source, sourceId } = await coveragePlannerScrapeSourceFor(
    sources,
    intake,
    discoveryResult,
  );
  const { supplySource, supplySourceId } = await coveragePlannerSupplySourceFor(
    context,
    supplySources,
    intake,
    discoveryResult,
    source,
  );
  await linkCoveragePlannerIntakeSources(
    intakes,
    intake,
    sourceId,
    supplySourceId,
  );
  return {
    intake: {
      ...intake,
      affiliateSourceId: sourceId,
      supplySourceId,
    },
    source,
    sourceId,
    supplySource,
    supplySourceId,
  };
};

const coveragePlannerMappingJobFor = async (
  mappingJobs: GatewayDomainDelegate,
  campaign: Record<string, unknown>,
  discoveryResult: Record<string, unknown>,
  intake: Record<string, unknown>,
  sourceId: string,
  supplySourceId: string,
): Promise<Record<string, unknown>> => {
  const existingMappingJob = gatewayDomainRecord(await mappingJobs.findFirst?.({
    where: { intakeId: intake.id, sourceId, supplySourceId },
    orderBy: { createdAt: "desc" },
  }));
  const mappingJob = existingMappingJob ?? gatewayDomainRecord(await mappingJobs.upsert?.({
    where: { id: `gateway-mapping:${campaign.id}:${discoveryResult.id}` },
    create: {
      id: `gateway-mapping:${campaign.id}:${discoveryResult.id}`,
      intakeId: intake.id,
      supplySourceId,
      sourceId,
      mappingId: null,
      status: "QUEUED",
      claimedAt: null,
      leaseExpiresAt: null,
      workerId: null,
      attemptCount: 0,
      legacyIdentityMigrationEligible: false,
      branch: null,
      commit: null,
      resultSummary: null,
      errorMessage: null,
      finishedAt: null,
    },
    update: {},
  }));
  if (
    !mappingJob
    || mappingJob.sourceId !== sourceId
    || mappingJob.supplySourceId !== supplySourceId
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign mapping job is not bound to its source lineage.",
    );
  }
  return mappingJob;
};

type CoveragePlannerDiscoveryDispatch = Readonly<{
  intakeId: string;
  mappingJobId: string;
  producerJobId: string;
  discoveryResultId: string;
}>;

const updateCoveragePlannerMappingDispatch = async (
  context: CoveragePlannerDispatchContext,
  campaign: Record<string, unknown>,
  discoveryResult: Record<string, unknown>,
  mappingJob: Record<string, unknown>,
  manifest: Record<string, unknown>,
): Promise<void> => {
  const resultMetadata = gatewayDomainRecord(discoveryResult.metadata) ?? {};
  const currentMappingSummary =
    gatewayDomainRecord(mappingJob.resultSummary) ?? {};
  const evidenceRefs = Array.isArray(manifest.entries)
    ? manifest.entries
      .map((entry) => gatewayDomainRecord(entry)?.evidenceRef)
      .filter((entry): entry is string => typeof entry === "string")
    : [];
  await context.delegates.mappingJobs.update!({
    where: { id: mappingJob.id },
    data: {
      resultSummary: asPrismaJson({
        ...currentMappingSummary,
        coveragePlannerDispatch: {
          campaignId: campaign.id,
          discoveryResultId: discoveryResult.id,
          canonicalUrl: discoveryResult.canonicalUrl ?? null,
          originalUrl: discoveryResult.originalUrl ?? null,
          latestQuery: discoveryResult.latestQuery ?? null,
          profileKey: resultMetadata.profileKey
            ?? resultMetadata.captureProfileKey
            ?? null,
          evidenceRefs,
        },
      }),
    },
  });
};

const enqueueCoveragePlannerProducer = async (
  context: CoveragePlannerDispatchContext,
  campaign: Record<string, unknown>,
  discoveryResult: Record<string, unknown>,
  mappingJob: Record<string, unknown>,
  sourceLineage: CoveragePlannerSourceLineage,
  manifest: Record<string, unknown>,
  now: Date,
): Promise<Record<string, unknown>> => {
  const producerDedupeKey = [
    "coverage-planner-producer",
    campaign.id,
    discoveryResult.id,
    String(context.demand.generation),
    String(context.expectedContractVersion),
    context.expectedContractHash,
  ].join(":");
  const producerJob = gatewayDomainRecord(await context.delegates.gatewayJobs.upsert?.({
    where: { dedupeKey: producerDedupeKey },
    create: {
      id: createId(),
      dedupeKey: producerDedupeKey,
      queue: "AFFILIATE_MAPPING",
      lane: "MAPPING_PRODUCTION",
      role: "MAPPING_PRODUCER",
      subjectType: "MAPPING_PRODUCER",
      subjectId: mappingJob.id,
      subjectJson: asPrismaJson({
        type: "MAPPING_PRODUCER",
        supplySourceId: sourceLineage.supplySourceId,
        mappingJobId: mappingJob.id,
        pass: 1,
      }),
      evidenceManifestJson: asPrismaJson(manifest),
      supplySourceId: sourceLineage.supplySourceId,
      expectedLifecycleGeneration: Number(
        sourceLineage.supplySource.lifecycleGeneration ?? 0,
      ),
      priority: context.priority,
      nextAttemptAt: now,
      claimGeneration: 0,
      parentClaimId: context.parentClaimId,
    },
    update: {},
  }));
  if (!producerJob) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign mapping producer job could not be enqueued.",
    );
  }
  return producerJob;
};

const markCoveragePlannerDiscoveryDispatched = async (
  context: CoveragePlannerDispatchContext,
  campaign: Record<string, unknown>,
  discoveryResult: Record<string, unknown>,
  sourceLineage: CoveragePlannerSourceLineage,
  mappingJob: Record<string, unknown>,
  producerJob: Record<string, unknown>,
  now: Date,
): Promise<void> => {
  const currentMetadata = gatewayDomainRecord(discoveryResult.metadata) ?? {};
  const dispatchMetadata = {
    status: "PRODUCER_QUEUED",
    campaignId: campaign.id,
    discoveryResultId: discoveryResult.id,
    intakeId: sourceLineage.intake.id,
    mappingJobId: mappingJob.id,
    producerJobId: producerJob.id,
    dispatchedAt: now.toISOString(),
  };
  const resultData = {
    status: "INTAKE_CREATED",
    metadata: asPrismaJson({
      ...currentMetadata,
      coveragePlannerDispatch: dispatchMetadata,
    }),
  };
  if (context.delegates.discoveryResults.updateMany) {
    await context.delegates.discoveryResults.updateMany({
      where: { id: discoveryResult.id },
      data: resultData,
    });
  } else if (context.delegates.discoveryResults.update) {
    await context.delegates.discoveryResults.update({
      where: { id: discoveryResult.id },
      data: resultData,
    });
  }
};

const dispatchCoveragePlannerDiscoveryResult = async (
  context: CoveragePlannerDispatchContext,
  campaign: Record<string, unknown>,
  discoveryResult: Record<string, unknown>,
  now: Date,
): Promise<CoveragePlannerDiscoveryDispatch> => {
  const intake = await coveragePlannerIntakeFor(context, campaign, discoveryResult);
  const sourceLineage = await coveragePlannerSourceLineageFor(
    context,
    intake,
    discoveryResult,
  );
  const mappingJob = await coveragePlannerMappingJobFor(
    context.delegates.mappingJobs,
    campaign,
    discoveryResult,
    sourceLineage.intake,
    sourceLineage.sourceId,
    sourceLineage.supplySourceId,
  );
  const manifest = coveragePlannerEvidenceManifestFor(campaign, discoveryResult);
  await updateCoveragePlannerMappingDispatch(
    context,
    campaign,
    discoveryResult,
    mappingJob,
    manifest,
  );
  const producerJob = await enqueueCoveragePlannerProducer(
    context,
    campaign,
    discoveryResult,
    mappingJob,
    sourceLineage,
    manifest,
    now,
  );
  await markCoveragePlannerDiscoveryDispatched(
    context,
    campaign,
    discoveryResult,
    sourceLineage,
    mappingJob,
    producerJob,
    now,
  );
  return {
    intakeId: String(sourceLineage.intake.id),
    mappingJobId: String(mappingJob.id),
    producerJobId: String(producerJob.id),
    discoveryResultId: String(discoveryResult.id),
  };
};

const assertCoveragePlannerProviderRun = async (
  transaction: Prisma.TransactionClient,
  discoveryResult: Record<string, unknown>,
): Promise<void> => {
  const runId = coveragePlannerStringValue(discoveryResult.latestRunId);
  const runDelegate = gatewayDomainDelegate(
    transaction,
    "affiliateSourceDiscoveryRuns",
  );
  if (!runId || !runDelegate?.findUnique) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign discovery result has no durable discovery run.",
    );
  }
  const run = gatewayDomainRecord(await runDelegate.findUnique({
    where: { id: runId },
  }));
  if (
    !run
    || run.campaignId !== discoveryResult.campaignId
    || run.status !== "SUCCEEDED"
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign discovery result is not backed by a successful discovery run.",
    );
  }
};

const coveragePlannerProviderEvidenceRowsFor = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
): Promise<Readonly<{ receiptRows: unknown; artifactRows: unknown }>> => {
  const receipts = gatewayDomainDelegate(
    transaction,
    "affiliateAgentGatewayOperationReceipts",
  );
  const artifacts = gatewayDomainDelegate(
    transaction,
    "affiliateAgentGatewayArtifacts",
  );
  if (!receipts?.findMany || !artifacts?.findMany) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign discovery result has no receipt and artifact lineage delegates.",
    );
  }
  const [receiptRows, artifactRows] = await Promise.all([
    receipts.findMany({
      where: {
        claimId: authorized.claim.id,
        claimGeneration: authorized.claim.claimGeneration,
        operationKind: "EXECUTE_COMMAND",
        commandName: "RUN_DISCOVERY_QUERY",
        status: "SUCCEEDED",
      },
    }),
    artifacts.findMany({
      where: {
        claimId: authorized.claim.id,
        claimGeneration: authorized.claim.claimGeneration,
        evidenceKind: "PROVIDER_RESULT",
      },
    }),
  ]);
  return { receiptRows, artifactRows };
};

const gatewayDomainRecordsFor = (
  value: unknown,
): Record<string, unknown>[] => Array.isArray(value)
  ? value
    .map(gatewayDomainRecord)
    .filter((row): row is Record<string, unknown> => row !== null)
  : [];

const coveragePlannerSuccessfulProviderOutputsFor = (
  receiptRows: unknown,
): Record<string, unknown>[] => gatewayDomainRecordsFor(receiptRows)
  .map((receipt) => gatewayDomainRecord(
    gatewayDomainRecord(receipt.responseJson)?.safeOutput,
  ))
  .filter((output): output is Record<string, unknown> => output !== null);

const coveragePlannerHasMatchingProviderEvidence = (
  successfulOutputs: readonly Record<string, unknown>[],
  providerArtifacts: readonly Record<string, unknown>[],
): boolean => successfulOutputs.some((output) => (
  providerArtifacts.some((artifact) => (
    artifact.evidenceRef === output.evidenceRef
    && artifact.contentHash === output.sha256
    && Number(artifact.byteSize) === Number(output.byteSize)
    && artifact.mimeType === output.mimeType
  ))
));

const assertCoveragePlannerProviderEvidence = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  discoveryResult: Record<string, unknown>,
): Promise<void> => {
  await assertCoveragePlannerProviderRun(transaction, discoveryResult);
  const { receiptRows, artifactRows } =
    await coveragePlannerProviderEvidenceRowsFor(transaction, authorized);
  const providerArtifacts = gatewayDomainRecordsFor(artifactRows);
  const successfulOutputs =
    coveragePlannerSuccessfulProviderOutputsFor(receiptRows);
  if (!coveragePlannerHasMatchingProviderEvidence(
    successfulOutputs,
    providerArtifacts,
  )) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The campaign discovery result has no claim-owned successful provider evidence.",
    );
  }
};

const applyCoveragePlannerCampaignDispatch = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  wave: Record<string, unknown>,
  result: Extract<
    CoveragePlannerTerminalResult,
    Readonly<{ disposition: "CAMPAIGN_PROPOSED" }>
  >,
  now: Date,
): Promise<CoveragePlannerDispatchResult> => {
  const context = await coveragePlannerDispatchContextFor(
    transaction,
    authorized,
    wave,
  );
  const refs = result.payload.campaignProposalRefs;
  if (refs.length === 0) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The coverage campaign result has no durable campaign references.",
    );
  }
  const campaignIds: string[] = [];
  const intakeIds: string[] = [];
  const mappingJobIds: string[] = [];
  const producerJobIds: string[] = [];
  const discoveryResultIds: string[] = [];
  for (const campaignId of refs) {
    const campaign = await coveragePlannerCampaignFor(context, campaignId, wave);
    const discoveryResults = await coveragePlannerEligibleDiscoveryResultsFor(
      context.delegates.discoveryResults,
      campaignId,
    );
    if (discoveryResults.length === 0) {
      throw gatewayError(
        "INTERNAL_ERROR",
        "The coverage campaign has no eligible discovery results for dispatch.",
      );
    }
    for (const discoveryResult of discoveryResults) {
      await assertCoveragePlannerProviderEvidence(
        transaction,
        authorized,
        discoveryResult,
      );
      const dispatched = await dispatchCoveragePlannerDiscoveryResult(
        context,
        campaign,
        discoveryResult,
        now,
      );
      campaignIds.push(campaignId);
      intakeIds.push(dispatched.intakeId);
      mappingJobIds.push(dispatched.mappingJobId);
      producerJobIds.push(dispatched.producerJobId);
      discoveryResultIds.push(dispatched.discoveryResultId);
    }
  }
  return {
    campaignIds,
    intakeIds,
    mappingJobIds,
    producerJobIds,
    discoveryResultIds,
  };
};

const applyCoveragePlannerTerminalDomainEffect = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  result: CoveragePlannerTerminalResult,
  jobId: string,
  now: Date,
): Promise<Readonly<Record<string, unknown>> | null> => {
  const waves = gatewayDomainDelegate(transaction, "affiliateReplenishmentWaves");
  const demands = gatewayDomainDelegate(transaction, "affiliateReplenishmentDemands");
  if (!waves?.findFirst || !waves.update) return null;
  const wave = gatewayDomainRecord(await waves.findFirst({
    where: { coveragePlanningJobId: jobId },
    orderBy: { createdAt: "desc" },
  }));
  if (!wave) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The coverage planner terminal result has no replenishment wave.",
    );
  }
  const transition = coveragePlannerWaveTransitionFor(
    wave.evidenceRefs,
    result,
    jobId,
    now,
  );
  const campaignDispatch = result.disposition === "CAMPAIGN_PROPOSED"
    ? await applyCoveragePlannerCampaignDispatch(
        transaction,
        authorized,
        wave,
        result,
        now,
      )
    : null;
  await waves.update({
    where: { id: wave.id },
    data: transition.waveData,
  });
  const demandEffect = await applyCoveragePlannerDemandEffect(demands, wave, transition);
  return campaignDispatch === null
    ? demandEffect
    : { ...demandEffect, ...campaignDispatch };
};

const reviewerTargetTypeFor = (
  targetType: unknown,
  sourceTargetKind: unknown,
): "EVENT" | "FACILITY" | "ORGANIZATION" => {
  const target = String(targetType ?? "").toUpperCase();
  if (target === "EVENT" || target === "FACILITY" || target === "ORGANIZATION") {
    return target;
  }
  const sourceKind = String(sourceTargetKind ?? "").toUpperCase();
  return sourceKind === "RENTAL"
    ? "FACILITY"
    : sourceKind === "CLUB"
      ? "ORGANIZATION"
      : "EVENT";
};

const reviewerManifestEntryForArtifact = (
  kind: "COMMITTED_PACKAGE" | "DETERMINISTIC_VALIDATION" | "DURABLE_EVIDENCE",
  evidenceRef: string,
  artifact: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  if (!artifact) {
    throw gatewayError(
      "INTERNAL_ERROR",
      `The producer is missing its ${kind.toLowerCase()} artifact.`,
    );
  }
  return {
    evidenceRef,
    kind,
    artifactId: String(artifact.sourceArtifactId ?? artifact.fileId),
    sha256: String(artifact.contentHash),
    mimeType: String(artifact.mimeType),
    byteSize: Number(artifact.byteSize),
    retention: "INDEFINITE",
  };
};

type MappingProducerLineage = Readonly<{
  mappingJobId: string;
  supplySourceId: string;
  mappingJob: Record<string, unknown>;
  source: Record<string, unknown> | null;
}>;

const mappingSourceFor = async (
  sources: GatewayDomainDelegate | undefined,
  sourceId: string,
): Promise<Record<string, unknown> | null> => {
  if (!sources?.findUnique) return null;
  return gatewayDomainRecord(await sources.findUnique({
    where: { id: sourceId },
  }));
};

const mappingProducerLineageFor = async (
  mappingJobs: GatewayDomainDelegate,
  sources: GatewayDomainDelegate | undefined,
  authorized: AuthorizedClaim,
): Promise<MappingProducerLineage> => {
  const mappingSubject = authorized.envelope.subject;
  if (mappingSubject.type !== "MAPPING_PRODUCER") {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The mapping producer terminal result has no mapping job lineage.",
    );
  }
  const { mappingJobId, supplySourceId } = mappingSubject;
  const mappingJob = gatewayDomainRecord(await mappingJobs.findUnique?.({
    where: { id: mappingJobId },
  }));
  const sourceId = typeof mappingJob?.sourceId === "string"
    ? mappingJob.sourceId.trim()
    : "";
  if (
    !mappingJob
    || mappingJob.supplySourceId !== supplySourceId
    || sourceId.length === 0
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The mapping producer terminal result is not bound to its mapping job source.",
    );
  }
  const source = await mappingSourceFor(sources, sourceId);
  if (!source || source.supplySourceId !== supplySourceId) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The mapping producer terminal result is not bound to its supply source.",
    );
  }
  return { mappingJobId, supplySourceId, mappingJob, source };
};

const updateMappingProducerLineage = async (
  mappingJobs: GatewayDomainDelegate,
  lineage: MappingProducerLineage,
  result: MappingProducerSuccessTerminalResult,
  now: Date,
): Promise<void> => {
  const mappingSummary = gatewayDomainRecord(lineage.mappingJob.resultSummary) ?? {};
  await mappingJobs.update?.({
    where: { id: lineage.mappingJob.id },
    data: {
      sourceId: lineage.source?.id ?? lineage.mappingJob.sourceId ?? null,
      mappingId: lineage.source?.activeMappingId ?? lineage.mappingJob.mappingId ?? null,
      status: "COMPLETED",
      commit: result.payload.commitReceiptId,
      resultSummary: asPrismaJson({
        ...mappingSummary,
        gatewayTerminalResult: result,
      }),
      errorMessage: null,
      finishedAt: now,
      claimedAt: null,
      workerId: null,
      leaseExpiresAt: null,
    },
  });
};

const mappingProducerFailureFor = (
  result: MappingProducerFailureTerminalResult,
): Readonly<Record<string, unknown>> => result.disposition === "SOURCE_INCOMPATIBLE"
  ? {
      kind: result.disposition,
      incompatibilityCode: result.payload.incompatibilityCode,
    }
  : {
      kind: result.disposition,
      contractArea: result.payload.contractArea,
      requestedChange: result.payload.requestedChange,
    };

const mappingProducerFailureMessageFor = (
  result: MappingProducerFailureTerminalResult,
): string => result.disposition === "SOURCE_INCOMPATIBLE"
  ? `The producer marked the source incompatible: ${result.payload.incompatibilityCode}.`
  : `The producer reported a Supply Contract gap in ${result.payload.contractArea}.`;

const updateMappingProducerFailureSource = async (
  sources: GatewayDomainDelegate | undefined,
  lineage: MappingProducerLineage,
  result: MappingProducerFailureTerminalResult,
  failure: Readonly<Record<string, unknown>>,
): Promise<void> => {
  const sourceId = typeof lineage.source?.id === "string"
    ? lineage.source.id.trim()
    : "";
  if (!sourceId || !sources?.updateMany) return;
  const sourceMetadata = gatewayDomainRecord(lineage.source?.metadata) ?? {};
  await sources.updateMany({
    where: {
      id: sourceId,
      supplySourceId: lineage.supplySourceId,
    },
    data: {
      status: result.disposition === "SOURCE_INCOMPATIBLE"
        ? "QUARANTINED"
        : "REVIEW_REQUIRED",
      autoScrapeEnabled: false,
      metadata: asPrismaJson({
        ...sourceMetadata,
        mappingTerminalOutcome: failure,
      }),
    },
  });
};

const updateMappingProducerFailure = async (
  mappingJobs: GatewayDomainDelegate,
  sources: GatewayDomainDelegate | undefined,
  lineage: MappingProducerLineage,
  result: MappingProducerFailureTerminalResult,
  now: Date,
): Promise<Readonly<Record<string, unknown>>> => {
  const failure = mappingProducerFailureFor(result);
  await mappingJobs.update?.({
    where: { id: lineage.mappingJob.id },
    data: {
      status: "REVIEW_REQUIRED",
      resultSummary: asPrismaJson({
        ...(gatewayDomainRecord(lineage.mappingJob.resultSummary) ?? {}),
        gatewayTerminalResult: result,
        terminalOutcome: failure,
      }),
      errorMessage: mappingProducerFailureMessageFor(result),
      finishedAt: now,
      claimedAt: null,
      workerId: null,
      leaseExpiresAt: null,
    },
  });
  await updateMappingProducerFailureSource(sources, lineage, result, failure);
  return {
    kind: "MAPPING_PRODUCER_TERMINAL_EFFECT",
    mappingJobId: lineage.mappingJobId,
    reviewerJobId: null,
    terminalOutcome: failure,
  };
};

const mappingReviewerArtifactsFor = (
  artifactRows: readonly Record<string, unknown>[],
  packageHash: string,
  claimId: string,
  claimGeneration: number,
): Readonly<{
  committedArtifact: Record<string, unknown> | undefined;
  deterministicArtifact: Record<string, unknown> | undefined;
  durableArtifact: Record<string, unknown> | undefined;
}> => {
  const currentClaimArtifacts = artifactRows.filter(
    (artifact) => artifact.claimId === claimId
      && Number(artifact.claimGeneration) === claimGeneration,
  );
  return {
    committedArtifact: currentClaimArtifacts.find(
      (artifact) => artifact.evidenceKind === "COMMITTED_PACKAGE"
        && artifact.contentHash === packageHash,
    ),
    deterministicArtifact: currentClaimArtifacts.find(
      (artifact) => artifact.evidenceKind === "DETERMINISTIC_VALIDATION",
    ),
    durableArtifact: currentClaimArtifacts.find(
      (artifact) => artifact.evidenceKind === "DURABLE_EVIDENCE",
    ),
  };
};

const mappingReviewerManifestFor = (
  authorized: AuthorizedClaim,
  artifacts: ReturnType<typeof mappingReviewerArtifactsFor>,
): Record<string, unknown> => {
  const activeSupplyContract = authorized.bundle?.supplyContract;
  if (
    !activeSupplyContract
    || activeSupplyContract.hash !== authorized.claim.supplyContractHash
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The active Supply Contract artifact is not bound to the producer claim.",
    );
  }
  const { hash: _contractHash, ...activeSupplyContractPreimage } =
    activeSupplyContract;
  const activeSupplyContractBytes = Buffer.from(
    canonicalizeAffiliateAgentValue(activeSupplyContractPreimage),
    "utf8",
  );
  const preimage = {
    schemaVersion: 1 as const,
    entries: [
      {
        evidenceRef: "active-contract",
        kind: "ACTIVE_SUPPLY_CONTRACT" as const,
        artifactId: `supply-contract:${activeSupplyContract.hash}`,
        sha256: activeSupplyContract.hash,
        mimeType: "application/json",
        byteSize: activeSupplyContractBytes.byteLength,
        retention: "INDEFINITE" as const,
      },
      reviewerManifestEntryForArtifact(
        "COMMITTED_PACKAGE",
        "committed-package",
        artifacts.committedArtifact,
      ),
      reviewerManifestEntryForArtifact(
        "DETERMINISTIC_VALIDATION",
        "deterministic-validation",
        artifacts.deterministicArtifact,
      ),
      reviewerManifestEntryForArtifact(
        "DURABLE_EVIDENCE",
        "durable-evidence",
        artifacts.durableArtifact,
      ),
    ],
  };
  return {
    ...preimage,
    hash: hashAffiliateAgentValue(preimage),
  };
};

const mappingReviewerTargetFor = async (
  targets: GatewayDomainDelegate | undefined,
  lineage: MappingProducerLineage,
): Promise<Readonly<{ targetId: string; targetType: "EVENT" | "FACILITY" | "ORGANIZATION" }>> => {
  const target = targets?.findFirst
    ? gatewayDomainRecord(await targets.findFirst({
        where: {
          supplySourceId: lineage.supplySourceId,
          status: "PUBLISHED",
        },
        orderBy: { createdAt: "desc" },
      }))
    : null;
  return {
    targetId: String(
      target?.targetId
      ?? lineage.source?.id
      ?? lineage.supplySourceId,
    ),
    targetType: reviewerTargetTypeFor(
      target?.targetType,
      lineage.source?.targetKind,
    ),
  };
};

const upsertMappingReviewerJob = async (
  gatewayJobs: GatewayDomainDelegate,
  authorized: AuthorizedClaim,
  result: MappingProducerSuccessTerminalResult,
  now: Date,
  lineage: MappingProducerLineage,
  target: Readonly<{
    targetId: string;
    targetType: "EVENT" | "FACILITY" | "ORGANIZATION";
  }>,
  evidenceManifest: Record<string, unknown>,
): Promise<Record<string, unknown> | null> => {
  const reviewPass = result.disposition === "BOUNDED_REPAIR_SUBMITTED"
    ? result.payload.repairPass
    : 1;
  const reviewerJobDedupeKey = isAffiliateAgentSingleClaimJob(authorized.job.dedupeKey)
    ? `${AFFILIATE_AGENT_CONTINUATION_REVIEWER_PREFIX}${authorized.claim.id}`
    : [
        "mapping-review",
        authorized.claim.id,
        result.payload.packageHash,
        reviewPass,
      ].join(":");
  return gatewayDomainRecord(await gatewayJobs.upsert?.({
    where: { dedupeKey: reviewerJobDedupeKey },
    create: {
      id: createId(),
      dedupeKey: reviewerJobDedupeKey,
      queue: "AFFILIATE_REVIEW",
      lane: "SUPPLY_REVIEW",
      role: "SUPPLY_REVIEWER",
      subjectType: "SUPPLY_REVIEWER",
      subjectId: lineage.supplySourceId,
      parentClaimId: authorized.claim.id,
      subjectJson: asPrismaJson({
        type: "SUPPLY_REVIEWER",
        supplySourceId: lineage.supplySourceId,
        producerClaimId: authorized.claim.id,
        producerWorkerId: authorized.claim.workerId,
        producerInvocationId: authorized.claim.invocationId,
        producerWorkspaceId: authorized.claim.workspaceId,
        committedPackageHash: result.payload.packageHash,
        targetId: target.targetId,
        targetType: target.targetType,
        reviewPass,
        ...(authorized.envelope.subject.type === "MAPPING_PRODUCER"
          && authorized.envelope.subject.repairContext
          ? { repairContext: authorized.envelope.subject.repairContext }
          : {}),
      }),
      evidenceManifestJson: asPrismaJson(evidenceManifest),
      supplySourceId: lineage.supplySourceId,
      expectedLifecycleGeneration: Number(lineage.source?.lifecycleGeneration),
      status: "QUEUED",
      priority: Number(authorized.job.priority ?? 0),
      nextAttemptAt: now,
      claimGeneration: 0,
    },
    update: {},
  }));
};

type MappingDomainDelegates = Readonly<{
  mappingJobs: GatewayDomainDelegate;
  gatewayJobs: GatewayDomainDelegate | undefined;
  artifacts: GatewayDomainDelegate | undefined;
}>;

const mappingDomainDelegatesFor = (
  transaction: Prisma.TransactionClient,
): MappingDomainDelegates | null => {
  const mappingJobs = gatewayDomainDelegate(
    transaction,
    "affiliateSourceMappingJobs",
  );
  if (!mappingJobs?.findUnique || !mappingJobs.update) return null;
  return {
    mappingJobs,
    gatewayJobs: gatewayDomainDelegate(
      transaction,
      "affiliateAgentGatewayJobs",
    ),
    artifacts: gatewayDomainDelegate(
      transaction,
      "affiliateAgentGatewayArtifacts",
    ),
  };
};

const mappingArtifactRowsFor = async (
  artifacts: GatewayDomainDelegate,
  claimId: string,
  claimGeneration: number,
): Promise<Record<string, unknown>[]> => {
  const result = await artifacts.findMany?.({
    where: { claimId, claimGeneration },
  });
  return Array.isArray(result)
    ? result.map(gatewayDomainRecord).filter(
        (value): value is Record<string, unknown> => value !== null,
      )
    : [];
};
const committedMappingProducerLineageFor = async (
  sources: GatewayDomainDelegate | undefined,
  lineage: MappingProducerLineage,
): Promise<MappingProducerLineage> => {
  const committedSourceId = typeof lineage.source?.id === "string"
    ? lineage.source.id.trim()
    : "";
  const committedSource = committedSourceId.length > 0
    ? await mappingSourceFor(sources, committedSourceId)
    : null;
  if (!committedSource || committedSource.supplySourceId !== lineage.supplySourceId) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The committed mapping source could not be re-read after the producer transition.",
    );
  }
  return {
    ...lineage,
    source: committedSource,
  };
};

const applyMappingProducerSuccessDomainEffect = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  result: MappingProducerSuccessTerminalResult,
  now: Date,
  delegates: MappingDomainDelegates,
  lineage: MappingProducerLineage,
  sources: GatewayDomainDelegate | undefined,
): Promise<Readonly<Record<string, unknown>>> => {
  const { mappingJobs, gatewayJobs, artifacts } = delegates;
  await updateMappingProducerLineage(mappingJobs, lineage, result, now);
  const committedLineage = await committedMappingProducerLineageFor(
    sources,
    lineage,
  );
  if (!gatewayJobs?.upsert || !artifacts?.findMany) {
    return {
      kind: "MAPPING_PRODUCER_TERMINAL_EFFECT",
      mappingJobId: lineage.mappingJobId,
      reviewerJobId: null,
    };
  }
  const artifactRows = await mappingArtifactRowsFor(
    artifacts,
    authorized.claim.id,
    authorized.claim.claimGeneration,
  );
  const reviewerArtifacts = mappingReviewerArtifactsFor(
    artifactRows,
    result.payload.packageHash,
    authorized.claim.id,
    authorized.claim.claimGeneration,
  );
  const evidenceManifest = mappingReviewerManifestFor(
    authorized,
    reviewerArtifacts,
  );
  const target = await mappingReviewerTargetFor(
    gatewayDomainDelegate(transaction, "affiliateSupplyTargets"),
    committedLineage,
  );
  const reviewerJob = await upsertMappingReviewerJob(
    gatewayJobs,
    authorized,
    result,
    now,
    committedLineage,
    target,
    evidenceManifest,
  );
  return {
    kind: "MAPPING_PRODUCER_TERMINAL_EFFECT",
    mappingJobId: lineage.mappingJobId,
    reviewerJobId: reviewerJob?.id ?? null,
  };
};

const applyMappingProducerTerminalDomainEffect = async (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  result: MappingProducerTerminalResult,
  now: Date,
): Promise<Readonly<Record<string, unknown>> | null> => {
  const delegates = mappingDomainDelegatesFor(transaction);
  if (!delegates) return null;
  const sources = gatewayDomainDelegate(transaction, "affiliateScrapeSources");
  const lineage = await mappingProducerLineageFor(
    delegates.mappingJobs,
    sources,
    authorized,
  );
  if (!isMappingProducerSuccessTerminalResult(result)) {
    return updateMappingProducerFailure(
      delegates.mappingJobs,
      sources,
      lineage,
      result,
      now,
    );
  }
  return applyMappingProducerSuccessDomainEffect(
    transaction,
    authorized,
    result,
    now,
    delegates,
    lineage,
    sources,
  );
};

const isMappingProducerTerminalResult = (
  result: AffiliateAgentTerminalResultEnvelope,
): result is MappingProducerTerminalResult =>
  result.role === "MAPPING_PRODUCER"
  && (
    result.disposition === "PACKAGE_COMMITTED"
    || result.disposition === "BOUNDED_REPAIR_SUBMITTED"
    || result.disposition === "SOURCE_INCOMPATIBLE"
    || result.disposition === "CONTRACT_GAP"
  );

const isGovernedTerminalDomainResult = (
  result: AffiliateAgentTerminalResultEnvelope,
): result is GovernedTerminalDomainResult =>
  result.role === "COVERAGE_PLANNER"
  || isMappingProducerTerminalResult(result);

const governedTerminalDomainReady = (
  transaction: Prisma.TransactionClient,
  result: GovernedTerminalDomainResult,
): boolean => {
  if (result.role === "COVERAGE_PLANNER") {
    const waves = gatewayDomainDelegate(
      transaction,
      "affiliateReplenishmentWaves",
    );
    return Boolean(waves?.findFirst && waves.update);
  }
  const mappingJobs = gatewayDomainDelegate(
    transaction,
    "affiliateSourceMappingJobs",
  );
  return Boolean(mappingJobs?.findUnique && mappingJobs.update);
};

const applyGovernedTerminalDomainResult = (
  transaction: Prisma.TransactionClient,
  authorized: AuthorizedClaim,
  result: GovernedTerminalDomainResult,
  now: Date,
): Promise<Readonly<Record<string, unknown>> | null> =>
  result.role === "COVERAGE_PLANNER"
    ? applyCoveragePlannerTerminalDomainEffect(
        transaction,
        authorized,
        result,
        authorized.job.id,
        now,
      )
    : applyMappingProducerTerminalDomainEffect(
        transaction,
        authorized,
        result,
        now,
      );

const terminalEffectReceiptDelegateFor = (
  transaction: Prisma.TransactionClient,
): GatewayDomainDelegate | null => {
  const receipts = gatewayDomainDelegate(
    transaction,
    "affiliateAgentGatewayOperationReceipts",
  );
  return receipts?.findUnique && receipts.create && receipts.updateMany
    ? receipts
    : null;
};

const replayGovernedTerminalDomainEffect = async (
  receipts: GatewayDomainDelegate,
  claimId: string,
  effectRequestHash: string,
): Promise<string | null> => {
  const existing = gatewayDomainRecord(await receipts.findUnique?.({
    where: {
      claimId_idempotencyKey: {
        claimId,
        idempotencyKey: "governed-terminal-domain-effect",
      },
    },
  }));
  if (!existing) return null;
  if (existing.status === "SUCCEEDED" && existing.requestHash === effectRequestHash) {
    return String(existing.id);
  }
  throw gatewayError(
    "PARTIAL_COMMAND_UNRESOLVED",
    "The governed terminal domain effect requires reconciliation.",
    false,
    String(existing.id),
  );
};

const applyGovernedTerminalDomainEffect = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  result: AffiliateAgentTerminalResultEnvelope,
  requestHash: string,
): Promise<string | null> => {
  if (!isGovernedTerminalDomainResult(result)) return null;
  const receipts = terminalEffectReceiptDelegateFor(transaction);
  if (!receipts) return null;
  if (!governedTerminalDomainReady(transaction, result)) return null;
  const effectRequestHash = hashAffiliateAgentValue({
    terminalRequestHash: requestHash,
    claimId: authorized.claim.id,
    claimGeneration: authorized.claim.claimGeneration,
    result,
  });
  const replayedReceiptId = await replayGovernedTerminalDomainEffect(
    receipts,
    authorized.claim.id,
    effectRequestHash,
  );
  if (replayedReceiptId !== null) return replayedReceiptId;
  const receiptId = dependencies.identifiers.create("receipt");
  const now = dependencies.clock.now();
  await receipts.create?.({
    data: {
      id: receiptId,
      claimId: authorized.claim.id,
      jobId: authorized.job.id,
      claimGeneration: authorized.claim.claimGeneration,
      idempotencyKey: "governed-terminal-domain-effect",
      operationKind: "TERMINAL_EFFECT",
      commandName: "GOVERNED_TERMINAL_DOMAIN_EFFECT",
      requestHash: effectRequestHash,
      status: "PENDING",
      responseJson: asPrismaJson({ kind: "PENDING", result }),
      startedAt: now,
      reconcileAfter: now,
      retentionClass: "INDEFINITE",
    },
  });
  const safeOutput = await applyGovernedTerminalDomainResult(
    transaction,
    authorized,
    result,
    now,
  );
  if (safeOutput === null) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The governed terminal domain effect did not produce a domain result.",
    );
  }
  const responseHash = hashAffiliateAgentValue(safeOutput);
  const updated = await receipts.updateMany?.({
    where: {
      id: receiptId,
      status: "PENDING",
      requestHash: effectRequestHash,
    },
    data: {
      status: "SUCCEEDED",
      responseHash,
      responseJson: asPrismaJson({
        kind: "SUCCEEDED",
        result,
        safeOutput,
      }),
      completedAt: now,
      reconcileAfter: null,
    },
  });
  if (gatewayDomainRecord(updated)?.count !== 1) {
    throw new AffiliateAgentClaimRaceError();
  }
  return receiptId;
};

const persistTerminalResultCompletion = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  authorized: AuthorizedClaim,
  input: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>,
  result: AffiliateAgentTerminalResultEnvelope,
  requestHash: string,
  postEffectCompletionReceiptId: string | undefined,
  reviewerTerminalEffectReceiptId: string | undefined,
  completionNow: Date,
): Promise<AffiliateAgentTerminalAcceptedResult> => {
  const receiptId = dependencies.identifiers.create("receipt");
  const resultHash = hashAffiliateAgentValue(result);
  const terminalResult: AffiliateAgentTerminalAcceptedResult = {
    kind: "TERMINAL_ACCEPTED",
    receiptId,
    resultHash,
    disposition: result.disposition,
    completedAt: completionNow.toISOString(),
  };
  const claimCompleted =
    await transaction.affiliateAgentGatewayClaims.updateMany({
      where: {
        id: authorized.claim.id,
        status: "ACTIVE",
        claimGeneration: authorized.claim.claimGeneration,
        tokenInvalidatedAt: null,
        ...(postEffectCompletionReceiptId === undefined &&
        reviewerTerminalEffectReceiptId === undefined
          ? {
              leaseExpiresAt: { gt: completionNow },
              hardDeadlineAt: { gte: completionNow },
            }
          : {}),
      },
      data: {
        status: "COMPLETED",
        terminalReceiptId: receiptId,
        tokenInvalidatedAt: completionNow,
        endedAt: completionNow,
      },
    });
  if (claimCompleted.count !== 1) {
    throw gatewayError(
      "TOKEN_INVALIDATED",
      "The terminal result lost the active claim compare-and-set.",
    );
  }
  const jobCompleted = await transaction.affiliateAgentGatewayJobs.updateMany({
    where: {
      id: authorized.job.id,
      status: "CLAIMED",
      activeClaimId: authorized.claim.id,
      claimGeneration: authorized.claim.claimGeneration,
      eventSequence: authorized.job.eventSequence,
    },
    data: {
      status: "COMPLETED",
      activeClaimId: null,
      terminalDisposition: result.disposition,
      resultHash,
      resultJson: asPrismaJson(result),
      terminalReceiptId: receiptId,
      finishedAt: completionNow,
      eventSequence: { increment: 1 },
    },
  });
  if (jobCompleted.count !== 1) {
    throw new AffiliateAgentClaimRaceError();
  }
  await transaction.affiliateAgentGatewayOperationReceipts.create({
    data: {
      id: receiptId,
      claimId: authorized.claim.id,
      jobId: authorized.job.id,
      claimGeneration: authorized.claim.claimGeneration,
      idempotencyKey: input.idempotencyKey,
      operationKind: input.kind,
      requestHash,
      status: "SUCCEEDED",
      responseHash: hashAffiliateAgentValue(terminalResult),
      responseJson: asPrismaJson(terminalResult),
      startedAt: completionNow,
      completedAt: completionNow,
      retentionClass: "INDEFINITE",
    },
  });
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `terminal:${receiptId}`,
      jobId: authorized.job.id,
      claimId: authorized.claim.id,
      receiptId,
      sequence: authorized.job.eventSequence + 1,
      eventType: "CLAIM_TERMINAL_RESULT_ACCEPTED",
      actorKind: "AGENT_INVOCATION",
      actorId: authorized.claim.invocationId,
      role: authorized.claim.role,
      requestHash,
      inputHash: resultHash,
      outputHash: hashAffiliateAgentValue(terminalResult),
      reasonCodes: [...result.reasonCodes],
      payload: asPrismaJson({
        disposition: result.disposition,
        resultHash,
      }),
      retentionClass: "INDEFINITE",
    },
  });
  return terminalResult;
};

const terminalResultTransactionAuthorizationOptions = (
  reviewerTerminalEffectReceiptId: string | undefined,
  postEffectCompletionReceiptId: string | undefined,
): ClaimAuthorizationOptions | undefined =>
  reviewerTerminalEffectReceiptId !== undefined
    ? { postEffectCompletionReceiptId: reviewerTerminalEffectReceiptId }
    : postEffectCompletionReceiptId === undefined
      ? undefined
      : { postEffectCompletionReceiptId };

const executePreparedTerminalResultTransaction = (
  dependencies: AffiliateAgentGatewayDependencies,
  preparation: TerminalResultPreparation,
) =>
  dependencies.prisma.$transaction(
    async (transaction) => {
      const replay = await resolveTerminalResultTransactionReplay(
        transaction,
        dependencies,
        preparation.input,
        preparation.requestHash,
      );
      if (replay.result) return replay.result;
      const now = dependencies.clock.now();
      const authorized = await authorizeClaimOperation(
        dependencies,
        preparation.input.authorization,
        now,
        transaction,
        terminalResultTransactionAuthorizationOptions(
          preparation.reviewerTerminalEffectReceiptId,
          preparation.postEffectCompletionReceiptId,
        ),
      );
      if (replay.existing) {
        if (
          replay.existing.operationKind !== preparation.input.kind ||
          replay.existing.requestHash !== preparation.requestHash
        ) {
          throw gatewayError(
            "IDEMPOTENCY_KEY_REUSED",
            "The operation idempotency key was used for different input.",
          );
        }
        throw gatewayError(
          "OPERATION_IN_PROGRESS",
          "The terminal result is still in progress.",
          true,
        );
      }
      const parsedResult = affiliateAgentTerminalResultEnvelopeSchema.safeParse(
        preparation.input.result,
      );
      if (!parsedResult.success) {
        return handleInvalidTerminalResult(
          transaction,
          dependencies,
          authorized,
          preparation.input,
          preparation.requestHash,
          now,
          terminalResultSchemaCorrectionIssues(
            authorized.envelope.role,
            preparation.input.result,
            parsedResult.error,
          ),
        );
      }
      validateTerminalResultScope(authorized, parsedResult.data);
      const sourceExclusionEffectAlreadySucceededInTransaction =
        authorized.envelope.subject.type === "SOURCE_EXCLUSION_REVIEW"
        && parsedResult.data.role === "SUPPLY_REVIEWER"
        && parsedResult.data.disposition === "SOURCE_EXCLUSION_ASSESSED"
        && parsedResult.data.payload.recommendation === "EXCLUDE"
        && preparation.reviewerTerminalEffectReceiptId !== undefined
        && (await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
          where: { id: preparation.reviewerTerminalEffectReceiptId },
        }))?.status === "SUCCEEDED";
      try {
        await verifyLegacySportRepairTerminal(
          dependencies,
          transaction,
          authorized,
          parsedResult.data,
        );
        if (!sourceExclusionEffectAlreadySucceededInTransaction) {
          await verifySourceExclusionTerminal(
            dependencies,
            transaction,
            authorized,
            parsedResult.data,
          );
        }
        if (authorized.envelope.subject.type === "SOURCE_EXCLUSION_REVIEW") {
          await assertSourceExclusionClaimBinding({
            prisma: transaction,
            job: authorized.job,
            claim: authorized.envelope,
          });
        }
      } catch (error) {
        if (!isTerminalResultEvidenceCorrection(error)) throw error;
        return handleInvalidTerminalResult(
          transaction,
          dependencies,
          authorized,
          preparation.input,
          preparation.requestHash,
          now,
          terminalResultEvidenceCorrectionIssues(error),
        );
      }
      await assertReviewerTerminalEffectCompleted(
        transaction,
        authorized,
        parsedResult.data,
        preparation.reviewerTerminalEffectReceiptId,
      );
      await assertMappingTerminalResultCommitted(
        transaction,
        authorized,
        parsedResult.data,
      );
      await assertHumanLifecycleCommandRecorded(
        transaction,
        authorized,
        parsedResult.data,
      );
      await assertClaimEvidenceRefs(
        transaction,
        authorized.claim.id,
        parsedResult.data.evidenceRefs,
        "EVIDENCE_REFERENCE_NOT_PERMITTED",
        "The terminal result references evidence outside the claim manifest.",
      );
      await applyGovernedTerminalDomainEffect(
        transaction,
        dependencies,
        authorized,
        parsedResult.data,
        preparation.requestHash,
      );
      await assertNoPendingClaimEffects(transaction, authorized.claim.id);
      const completionNow = dependencies.clock.now();
      const isPostEffectCompletionAllowed =
        preparation.postEffectCompletionReceiptId !== undefined ||
        preparation.reviewerTerminalEffectReceiptId !== undefined;
      assertTerminalCompletionTiming(
        authorized,
        completionNow,
        isPostEffectCompletionAllowed,
      );
      return persistTerminalResultCompletion(
        transaction,
        dependencies,
        authorized,
        preparation.input,
        parsedResult.data,
        preparation.requestHash,
        preparation.postEffectCompletionReceiptId,
        preparation.reviewerTerminalEffectReceiptId,
        completionNow,
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

const shouldRetryTerminalResultAfterError = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>,
  error: unknown,
  retryableConflict: boolean,
  attempt: number,
): Promise<boolean> => {
  if (retryableConflict && attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS) {
    return true;
  }
  if (
    !(error instanceof AffiliateAgentGatewayError) ||
    error.code !== "PARTIAL_COMMAND_UNRESOLVED" ||
    error.safeMessage !== INVOCATION_FAILURE_PENDING_EFFECT_MESSAGE ||
    error.receiptId === undefined
  ) {
    return false;
  }
  const pendingEffects = await reconcilePendingEffectsForClaim(
    dependencies,
    input.authorization.claimId,
  );
  return pendingEffects.examined > 0 && pendingEffects.unresolved === 0;
};

const executePreparedTerminalResult = async (
  dependencies: AffiliateAgentGatewayDependencies,
  preparation: TerminalResultPreparation,
): Promise<AffiliateAgentSubmitResultOutcome> => {
  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await executePreparedTerminalResultTransaction(
        dependencies,
        preparation,
      );
    } catch (error) {
      const retryableConflict =
        error instanceof AffiliateAgentClaimRaceError ||
        isSerializableTransactionConflict(error);
      if (
        await shouldRetryTerminalResultAfterError(
          dependencies,
          preparation.input,
          error,
          retryableConflict,
          attempt,
        )
      ) {
        continue;
      }
      if (error instanceof AffiliateAgentGatewayError) throw error;
      throw gatewayErrorForPersistenceFailure(
        error,
        "INTERNAL_ERROR",
        "The terminal result could not be completed.",
        retryableConflict,
      );
    }
  }
  throw gatewayError(
    "INTERNAL_ERROR",
    "The terminal result could not be completed.",
    true,
  );

};
const performTerminalResult = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>,
): Promise<AffiliateAgentSubmitResultOutcome> => {
  assertIdentifier(input.idempotencyKey, "Operation idempotency key");
  const preparation = await prepareTerminalResult(dependencies, input);
  if (preparation.kind === "REPLAY" || preparation.kind === "CORRECTION") {
    return preparation.result;
  }
  return executePreparedTerminalResult(dependencies, preparation);
};

const reconcileLimit = (input?: AffiliateAgentReconcileRequest): number => {
  const limit = input?.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw gatewayError(
      "ROLE_NOT_ALLOWED",
      "The reconciliation limit must be an integer from 1 through 100.",
    );
  }
  return limit;
};

const reconcileBefore = (
  dependencies: AffiliateAgentGatewayDependencies,
  input?: AffiliateAgentReconcileRequest,
): Date => {
  const now = dependencies.clock.now();
  if (input?.reconcileBefore === undefined) return now;
  const before = new Date(input.reconcileBefore);
  if (Number.isNaN(before.getTime()) || before > now) {
    throw gatewayError(
      "ROLE_NOT_ALLOWED",
      "The reconciliation boundary must be valid and not in the future.",
    );
  }
  return before;
};

const isImpossibleReconciliationState = (
  claim: AffiliateAgentGatewayClaims | null,
  job: AffiliateAgentGatewayJobs | null,
  receipt: AffiliateAgentGatewayOperationReceipts,
  isImpossibleState: boolean,
): boolean => {
  if (isImpossibleState || !claim || !job) return true;
  if (
    claim.jobId !== receipt.jobId ||
    claim.claimGeneration !== receipt.claimGeneration
  ) {
    return true;
  }
  if (
    job.activeClaimId !== receipt.claimId ||
    job.claimGeneration !== receipt.claimGeneration
  ) {
    return true;
  }
  return claim.status !== "ACTIVE" || job.status !== "CLAIMED";
};

const reconciliationSafeErrorCode = (
  stateImpossible: boolean,
): "GATEWAY_ADMISSION_HALTED" | "PARTIAL_COMMAND_UNRESOLVED" =>
  stateImpossible
    ? "GATEWAY_ADMISSION_HALTED"
    : "PARTIAL_COMMAND_UNRESOLVED";

const updateReconciliationClaim = async (
  transaction: Prisma.TransactionClient,
  claim: AffiliateAgentGatewayClaims | null,
  safeErrorCode: "GATEWAY_ADMISSION_HALTED" | "PARTIAL_COMMAND_UNRESOLVED",
  now: Date,
): Promise<void> => {
  if (claim?.status !== "ACTIVE") return;
  await transaction.affiliateAgentGatewayClaims.updateMany({
    where: {
      id: claim.id,
      status: "ACTIVE",
      claimGeneration: claim.claimGeneration,
      tokenInvalidatedAt: null,
    },
    data: {
      status: "RECONCILIATION_REQUIRED",
      tokenInvalidatedAt: now,
      safeFailureCode: safeErrorCode,
      safeFailureSummary: "An external effect could not be determined safely.",
    },
  });
};

const updateReconciliationJob = async (
  transaction: Prisma.TransactionClient,
  claim: AffiliateAgentGatewayClaims | null,
  job: AffiliateAgentGatewayJobs | null,
): Promise<void> => {
  if (
    job?.status !== "CLAIMED" ||
    !claim ||
    job.activeClaimId !== claim.id ||
    job.claimGeneration !== claim.claimGeneration
  ) {
    return;
  }
  await transaction.affiliateAgentGatewayJobs.updateMany({
    where: {
      id: job.id,
      status: "CLAIMED",
      activeClaimId: claim.id,
      claimGeneration: claim.claimGeneration,
    },
    data: {
      status: "RECONCILIATION_REQUIRED",
      nextAttemptAt: null,
    },
  });
};

const markReceiptReconciliationRequiredTransaction = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  now: Date,
  isImpossibleState: boolean,
): Promise<"HALTED_LANE" | "HALTED_GATEWAY" | "UNCHANGED"> => {
  const currentReceipt =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: receipt.id },
    });
  if (!currentReceipt || currentReceipt.status !== "PENDING") {
    return "UNCHANGED";
  }
  const [claim, job] = await Promise.all([
    transaction.affiliateAgentGatewayClaims.findUnique({
      where: { id: currentReceipt.claimId },
    }),
    transaction.affiliateAgentGatewayJobs.findUnique({
      where: { id: currentReceipt.jobId },
    }),
  ]);
  const stateImpossible = isImpossibleReconciliationState(
    claim,
    job,
    currentReceipt,
    isImpossibleState,
  );
  const safeErrorCode = reconciliationSafeErrorCode(stateImpossible);
  const receiptUpdated =
    await transaction.affiliateAgentGatewayOperationReceipts.updateMany({
      where: {
        id: currentReceipt.id,
        status: "PENDING",
        requestHash: currentReceipt.requestHash,
      },
      data: {
        status: "UNKNOWN",
        safeErrorCode,
        completedAt: now,
        reconcileAfter: null,
      },
    });
  if (receiptUpdated.count !== 1) return "UNCHANGED";
  await updateReconciliationClaim(transaction, claim, safeErrorCode, now);
  await updateReconciliationJob(transaction, claim, job);
  return stateImpossible ? "HALTED_GATEWAY" : "HALTED_LANE";
};

const markReceiptReconciliationRequired = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  now: Date,
  isImpossibleState: boolean,
): Promise<"HALTED_LANE" | "HALTED_GATEWAY" | "UNCHANGED"> =>
  dependencies.prisma.$transaction(
    (transaction) =>
      markReceiptReconciliationRequiredTransaction(
        transaction,
        dependencies,
        receipt,
        now,
        isImpossibleState,
      ),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

type ExternalFinalizationContext =
  | Readonly<{ kind: "UNCHANGED" | "IMPOSSIBLE" }>
  | Readonly<{
      kind: "READY";
      currentReceipt: AffiliateAgentGatewayOperationReceipts;
      reservedEvent: Readonly<{ inputHash: string }>;
      claim: AffiliateAgentGatewayClaims;
      job: AffiliateAgentGatewayJobs;
    }>;

const matchesExternalReceipt = (
  currentReceipt: AffiliateAgentGatewayOperationReceipts | null,
  receipt: AffiliateAgentGatewayOperationReceipts,
  commandType: string,
): boolean => {
  if (!currentReceipt || currentReceipt.status !== "PENDING") return false;
  if (currentReceipt.commandName !== commandType) return false;
  if (currentReceipt.requestHash !== receipt.requestHash) return false;
  return currentReceipt.externalOperationKey === receipt.externalOperationKey;
};

const loadExternalFinalizationContext = async (
  transaction: Prisma.TransactionClient,
  receipt: AffiliateAgentGatewayOperationReceipts,
  commandType: string,
): Promise<ExternalFinalizationContext> => {
  const currentReceipt =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: receipt.id },
    });
  if (currentReceipt?.status === "SUCCEEDED") return { kind: "UNCHANGED" };
  if (
    !currentReceipt ||
    !matchesExternalReceipt(currentReceipt, receipt, commandType)
  ) {
    return { kind: "IMPOSSIBLE" };
  }
  const reservedEvent =
    await transaction.affiliateAgentGatewayEvents.findFirst({
      where: {
        receiptId: currentReceipt.id,
        eventType: "EXTERNAL_COMMAND_RESERVED",
      },
    });
  if (!reservedEvent || typeof reservedEvent.inputHash !== "string") {
    return { kind: "IMPOSSIBLE" };
  }
  const [claim, job] = await Promise.all([
    transaction.affiliateAgentGatewayClaims.findUnique({
      where: { id: currentReceipt.claimId },
    }),
    transaction.affiliateAgentGatewayJobs.findUnique({
      where: { id: currentReceipt.jobId },
    }),
  ]);
  if (!claim || !job) return { kind: "IMPOSSIBLE" };
  return {
    kind: "READY",
    currentReceipt,
    reservedEvent: { inputHash: reservedEvent.inputHash },
    claim,
    job,
  };
};

const isExternalFinalizationStateValid = (
  context: Extract<ExternalFinalizationContext, Readonly<{ kind: "READY" }>>,
  now: Date,
): boolean => {
  const { currentReceipt, claim, job } = context;
  if (claim.jobId !== currentReceipt.jobId) return false;
  if (claim.claimGeneration !== currentReceipt.claimGeneration) return false;
  if (claim.status !== "ACTIVE") return false;
  if (
    claim.leaseExpiresAt <= now &&
    currentReceipt.startedAt >= claim.leaseExpiresAt
  ) {
    return false;
  }
  if (
    claim.hardDeadlineAt < now &&
    currentReceipt.startedAt >= claim.hardDeadlineAt
  ) {
    return false;
  }
  if (job.status !== "CLAIMED") return false;
  if (job.activeClaimId !== currentReceipt.claimId) return false;
  return job.claimGeneration === currentReceipt.claimGeneration;
};

const completeExternalFinalization = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  context: Extract<ExternalFinalizationContext, Readonly<{ kind: "READY" }>>,
  capture: RecoveredExternalOutput,
  artifactRowId: string,
  responseHash: string,
  commandResult: AffiliateAgentCommandResult,
  completedAt: Date,
): Promise<"COMPLETED"> => {
  const { currentReceipt, reservedEvent, claim, job } = context;
  await ensureExternalArtifact(transaction, {
    claimId: currentReceipt.claimId,
    claimGeneration: currentReceipt.claimGeneration,
    evidenceKind:
      currentReceipt.commandName === "RUN_DISCOVERY_QUERY"
        ? "PROVIDER_RESULT"
        : "CAPTURED_PAGE",
    output: capture,
    rowId: artifactRowId,
    receiptId: currentReceipt.id,
  });
  const receiptUpdated =
    await transaction.affiliateAgentGatewayOperationReceipts.updateMany({
      where: {
        id: currentReceipt.id,
        status: "PENDING",
        requestHash: currentReceipt.requestHash,
      },
      data: {
        status: "SUCCEEDED",
        responseHash,
        responseJson: asPrismaJson(commandResult),
        completedAt,
        reconcileAfter: null,
      },
    });
  const jobUpdated =
    await transaction.affiliateAgentGatewayJobs.updateMany({
      where: {
        id: job.id,
        status: "CLAIMED",
        activeClaimId: claim.id,
        claimGeneration: claim.claimGeneration,
        eventSequence: job.eventSequence,
      },
      data: { eventSequence: { increment: 1 } },
    });
  if (receiptUpdated.count !== 1 || jobUpdated.count !== 1) {
    throw new AffiliateAgentClaimRaceError();
  }
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `external-command-succeeded:${currentReceipt.id}`,
      jobId: job.id,
      claimId: claim.id,
      receiptId: currentReceipt.id,
      sequence: job.eventSequence + 1,
      eventType: "EXTERNAL_COMMAND_SUCCEEDED",
      actorKind: "GATEWAY_RECONCILER",
      actorId: "affiliate-agent-gateway",
      role: claim.role,
      requestHash: currentReceipt.requestHash,
      inputHash: reservedEvent.inputHash,
      outputHash: responseHash,
      payload: asPrismaJson({ evidenceRef: capture.evidenceRef }),
      retentionClass: "INDEFINITE",
    },
  });
  return "COMPLETED";
};

const loadRecoveredExternalOutput = async (
  dependencies: AffiliateAgentGatewayDependencies,
  recovered: Readonly<Record<string, unknown>>,
  commandType: "CAPTURE_CLAIM_URL" | "RUN_DISCOVERY_QUERY",
): Promise<RecoveredExternalOutput | null> => {
  try {
    const capture = parseRecoveredExternalOutput(recovered, commandType);
    const artifactRead = await dependencies.artifacts.readImmutable({
      fileId: capture.artifactId,
      maximumBytes: MAXIMUM_GATEWAY_ARTIFACT_BYTES,
    });
    verifyArtifactRead(
      {
        contentHash: capture.sha256,
        mimeType: capture.mimeType,
        byteSize: capture.byteSize,
      },
      artifactRead,
    );
    return capture;
  } catch (error) {
    assertDatabaseAuthorizationFailure(error);
    return null;
  }
};

const executeRecoveredExternalReceiptTransaction = (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  commandType: "CAPTURE_CLAIM_URL" | "RUN_DISCOVERY_QUERY",
  capture: RecoveredExternalOutput,
  artifactRowId: string,
  responseHash: string,
  commandResult: AffiliateAgentCommandResult,
  completedAt: Date,
): Promise<"COMPLETED" | "IMPOSSIBLE" | "UNCHANGED"> =>
  dependencies.prisma.$transaction(
    async (transaction) => {
      const context = await loadExternalFinalizationContext(
        transaction,
        receipt,
        commandType,
      );
      if (context.kind !== "READY") return context.kind;
      if (
        !isExternalFinalizationStateValid(
          context,
          dependencies.clock.now(),
        )
      ) {
        return "IMPOSSIBLE";
      }
      return completeExternalFinalization(
        transaction,
        dependencies,
        context,
        capture,
        artifactRowId,
        responseHash,
        commandResult,
        completedAt,
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

const finalizeRecoveredExternalReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  recovered: Readonly<Record<string, unknown>>,
): Promise<"COMPLETED" | "IMPOSSIBLE" | "LANE_FAILURE" | "UNCHANGED"> => {
  if (
    receipt.commandName !== "CAPTURE_CLAIM_URL" &&
    receipt.commandName !== "RUN_DISCOVERY_QUERY"
  ) {
    return "IMPOSSIBLE";
  }
  const commandType = receipt.commandName;
  const capture = await loadRecoveredExternalOutput(
    dependencies,
    recovered,
    commandType,
  );
  if (capture === null) return "LANE_FAILURE";
  const completedAt = dependencies.clock.now();
  const safeOutput = capture;
  const responseHash = hashAffiliateAgentValue({
    commandType,
    safeOutput,
  });
  const commandResult: AffiliateAgentCommandResult = {
    kind: "COMMAND_SUCCEEDED",
    receiptId: receipt.id,
    commandType,
    responseHash,
    safeOutput,
  };
  const artifactRowId = dependencies.identifiers.create("artifact");

  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await executeRecoveredExternalReceiptTransaction(
        dependencies,
        receipt,
        commandType,
        capture,
        artifactRowId,
        responseHash,
        commandResult,
        completedAt,
      );
    } catch (error) {
      const retryableConflict =
        error instanceof AffiliateAgentClaimRaceError ||
        isSerializableTransactionConflict(error);
      if (retryableConflict && attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS) {
        continue;
      }
      if (error instanceof AffiliateAgentGatewayError) throw error;
      assertDatabaseAuthorizationFailure(error);
      return "IMPOSSIBLE";
    }
  }
  return "IMPOSSIBLE";
};

type RecoveredLifecycleState = Readonly<{
  claim: AffiliateAgentGatewayClaims;
  job: AffiliateAgentGatewayJobs;
}>;

type RecoveredLifecycleReceipt = AffiliateAgentGatewayOperationReceipts &
  Readonly<{
    commandName: "EXECUTE_RECORDED_LIFECYCLE_COMMAND";
    requestHash: string;
  }>;

function assertRecoveredLifecycleReceipt(
  receipt: AffiliateAgentGatewayOperationReceipts,
): asserts receipt is RecoveredLifecycleReceipt {
  if (receipt.commandName !== "EXECUTE_RECORDED_LIFECYCLE_COMMAND") {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered lifecycle receipt is invalid.",
      false,
      receipt.id,
    );
  }
  if (receipt.requestHash === null) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered lifecycle receipt is invalid.",
      false,
      receipt.id,
    );
  }
}

const isRecoveredLifecycleStateValid = (
  receipt: AffiliateAgentGatewayOperationReceipts,
  claim: AffiliateAgentGatewayClaims,
  job: AffiliateAgentGatewayJobs,
): boolean => {
  if (claim.status !== "ACTIVE") return false;
  if (claim.jobId !== job.id) return false;
  if (claim.claimGeneration !== receipt.claimGeneration) return false;
  if (claim.lifecycleGeneration === null) return false;
  if (job.status !== "CLAIMED") return false;
  if (job.activeClaimId !== claim.id) return false;
  return job.claimGeneration === receipt.claimGeneration;
};

const loadRecoveredLifecycleState = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
): Promise<RecoveredLifecycleState> => {
  const claim =
    await dependencies.prisma.affiliateAgentGatewayClaims.findUnique({
      where: { id: receipt.claimId },
    });
  const job = await dependencies.prisma.affiliateAgentGatewayJobs.findUnique({
    where: { id: receipt.jobId },
  });
  if (!claim || !job || !isRecoveredLifecycleStateValid(receipt, claim, job)) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered lifecycle claim state is inconsistent.",
      false,
      receipt.id,
    );
  }
  return { claim, job };
};

const assertRecoveredLifecycleGeneration = (
  safeOutput: Readonly<Record<string, unknown>>,
  claim: AffiliateAgentGatewayClaims,
  receiptId: string,
): void => {
  const lifecycleGeneration = claim.lifecycleGeneration;
  if (
    lifecycleGeneration !== null &&
    safeOutput.lifecycleGeneration === lifecycleGeneration + 1
  ) {
    return;
  }
  throw gatewayError(
    "LIFECYCLE_TRANSITION_CONFLICT",
    "The recovered lifecycle command did not return the next lifecycle generation.",
    false,
    receiptId,
  );
};

const parseRecoveredLifecycleEnvelope = (
  claim: AffiliateAgentGatewayClaims,
  receiptId: string,
): Extract<
  AffiliateAgentClaimEnvelope,
  Readonly<{ role: "HUMAN_DIRECTED_EXECUTOR" }>
> => {
  const envelope = affiliateAgentClaimEnvelopeSchema.parse(
    claim.claimEnvelopeJson,
  );
  if (envelope.role !== "HUMAN_DIRECTED_EXECUTOR") {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered lifecycle claim role is invalid.",
      false,
      receiptId,
    );
  }
  return envelope;
};

function assertCurrentLifecycleReceipt(
  current: AffiliateAgentGatewayOperationReceipts | null,
  receipt: AffiliateAgentGatewayOperationReceipts,
  claim: AffiliateAgentGatewayClaims,
  job: AffiliateAgentGatewayJobs,
): asserts current is AffiliateAgentGatewayOperationReceipts {
  if (!current) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered lifecycle receipt changed during reconciliation.",
      false,
      receipt.id,
    );
  }
  if (current.status !== "PENDING") {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered lifecycle receipt changed during reconciliation.",
      false,
      receipt.id,
    );
  }
  if (current.claimId !== claim.id || current.jobId !== job.id) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered lifecycle receipt changed during reconciliation.",
      false,
      receipt.id,
    );
  }
  if (
    current.claimGeneration !== claim.claimGeneration ||
    current.requestHash !== receipt.requestHash
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered lifecycle receipt changed during reconciliation.",
      false,
      receipt.id,
    );
  }
}

const isLifecycleReceiptWithinDeadline = (
  current: AffiliateAgentGatewayOperationReceipts,
  claim: AffiliateAgentGatewayClaims,
  now: Date,
): boolean => {
  if (
    claim.leaseExpiresAt <= now &&
    current.startedAt >= claim.leaseExpiresAt
  ) {
    return false;
  }
  if (
    claim.hardDeadlineAt < now &&
    current.startedAt >= claim.hardDeadlineAt
  ) {
    return false;
  }
  return true;
};

const isCurrentLifecycleStateValid = (
  current: AffiliateAgentGatewayOperationReceipts,
  currentClaim: AffiliateAgentGatewayClaims,
  currentJob: AffiliateAgentGatewayJobs,
  expectedClaim: AffiliateAgentGatewayClaims,
  expectedJob: AffiliateAgentGatewayJobs,
  now: Date,
): boolean => {
  if (currentClaim.status !== "ACTIVE") return false;
  if (currentClaim.jobId !== expectedJob.id) return false;
  if (currentClaim.claimGeneration !== expectedClaim.claimGeneration) {
    return false;
  }
  if (currentClaim.lifecycleGeneration !== expectedClaim.lifecycleGeneration) {
    return false;
  }
  if (!isLifecycleReceiptWithinDeadline(current, currentClaim, now)) {
    return false;
  }
  if (currentJob.status !== "CLAIMED") return false;
  if (currentJob.activeClaimId !== currentClaim.id) return false;
  return currentJob.claimGeneration === currentClaim.claimGeneration;
};

const assertCurrentLifecycleState = (
  current: AffiliateAgentGatewayOperationReceipts,
  currentClaim: AffiliateAgentGatewayClaims | null,
  currentJob: AffiliateAgentGatewayJobs | null,
  expectedClaim: AffiliateAgentGatewayClaims,
  expectedJob: AffiliateAgentGatewayJobs,
  receiptId: string,
  now: Date,
): Readonly<{
  claim: AffiliateAgentGatewayClaims;
  job: AffiliateAgentGatewayJobs;
}> => {
  if (
    !currentClaim ||
    !currentJob ||
    !isCurrentLifecycleStateValid(
      current,
      currentClaim,
      currentJob,
      expectedClaim,
      expectedJob,
      now,
    )
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered lifecycle job changed during reconciliation.",
      false,
      receiptId,
    );
  }
  return { claim: currentClaim, job: currentJob };
};

const lifecycleCommandRefFromReservedEvent = (
  payload: Prisma.JsonValue | null,
): string | null => {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const lifecycleCommandRef = payload.lifecycleCommandRef;
  return typeof lifecycleCommandRef === "string"
    ? lifecycleCommandRef
    : null;
};

const finalizeRecoveredLifecycleTransaction = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  claim: AffiliateAgentGatewayClaims,
  job: AffiliateAgentGatewayJobs,
  envelope: Extract<
    AffiliateAgentClaimEnvelope,
    Readonly<{ role: "HUMAN_DIRECTED_EXECUTOR" }>
  >,
  responseHash: string,
  commandResult: AffiliateAgentCommandResult,
  completedAt: Date,
): Promise<"COMPLETED"> => {
  const receiptUpdated =
    await transaction.affiliateAgentGatewayOperationReceipts.updateMany({
      where: {
        id: receipt.id,
        status: "PENDING",
        requestHash: receipt.requestHash,
      },
      data: {
        status: "SUCCEEDED",
        responseHash,
        responseJson: asPrismaJson(commandResult),
        completedAt,
        reconcileAfter: null,
      },
    });
  const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany({
    where: {
      id: job.id,
      status: "CLAIMED",
      activeClaimId: claim.id,
      claimGeneration: claim.claimGeneration,
      eventSequence: job.eventSequence,
    },
    data: { eventSequence: { increment: 1 } },
  });
  if (receiptUpdated.count !== 1 || jobUpdated.count !== 1) {
    throw new AffiliateAgentClaimRaceError();
  }
  const reservedEvent =
    await transaction.affiliateAgentGatewayEvents.findFirst({
      where: {
        receiptId: receipt.id,
        eventType: "LIFECYCLE_COMMAND_RESERVED",
      },
    });
  const lifecycleCommandRef = lifecycleCommandRefFromReservedEvent(
    reservedEvent?.payload ?? null,
  );
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `lifecycle-command-succeeded:${receipt.id}`,
      jobId: job.id,
      claimId: claim.id,
      receiptId: receipt.id,
      sequence: job.eventSequence + 1,
      eventType: "LIFECYCLE_COMMAND_SUCCEEDED",
      actorKind: "AGENT_INVOCATION",
      actorId: claim.invocationId,
      role: claim.role,
      requestHash: receipt.requestHash,
      outputHash: responseHash,
      payload: asPrismaJson({
        recordedHumanActorId: envelope.subject.recordedHumanActorId,
        executingAgentId: claim.workerId,
        ...(lifecycleCommandRef === null ? {} : { lifecycleCommandRef }),
      }),
      retentionClass: "INDEFINITE",
    },
  });
  return "COMPLETED";
};

const finalizeRecoveredLifecycleReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  recoveredSafeOutput: Readonly<Record<string, unknown>>,
): Promise<"COMPLETED"> => {
  assertRecoveredLifecycleReceipt(receipt);
  const safeOutput = parseBoundedSafeOutput(recoveredSafeOutput, receipt.id);
  const { claim, job } = await loadRecoveredLifecycleState(
    dependencies,
    receipt,
  );
  assertRecoveredLifecycleGeneration(safeOutput, claim, receipt.id);
  const envelope = parseRecoveredLifecycleEnvelope(claim, receipt.id);
  const completedAt = dependencies.clock.now();
  const responseHash = hashAffiliateAgentValue({
    commandType: receipt.commandName,
    safeOutput,
  });
  const commandResult: AffiliateAgentCommandResult = {
    kind: "COMMAND_SUCCEEDED",
    receiptId: receipt.id,
    commandType: receipt.commandName,
    responseHash,
    safeOutput,
  };
  return runSerializableEffectTransaction(
    dependencies,
    async (transaction) => {
      const current =
        await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
          where: { id: receipt.id },
        });
      if (current?.status === "SUCCEEDED") return "COMPLETED" as const;
      assertCurrentLifecycleReceipt(current, receipt, claim, job);
      const [currentClaim, currentJob] = await Promise.all([
        transaction.affiliateAgentGatewayClaims.findUnique({
          where: { id: claim.id },
        }),
        transaction.affiliateAgentGatewayJobs.findUnique({
          where: { id: job.id },
        }),
      ]);
      const currentState = assertCurrentLifecycleState(
        current,
        currentClaim,
        currentJob,
        claim,
        job,
        receipt.id,
        dependencies.clock.now(),
      );
      return finalizeRecoveredLifecycleTransaction(
        transaction,
        dependencies,
        receipt,
        currentState.claim,
        currentState.job,
        envelope,
        responseHash,
        commandResult,
        completedAt,
      );
    },
    {
      code: "PARTIAL_COMMAND_UNRESOLVED",
      safeMessage: "The recovered lifecycle receipt could not be finalized.",
      receiptId: receipt.id,
    },
  );
};

const findActiveReviewerTerminalEffectReceiptIds = async (
  client: PrismaClient,
  limit: number | undefined,
  claimId?: string,
): Promise<readonly string[]> => {
  const claimFilter =
    claimId === undefined
      ? Prisma.sql``
      : Prisma.sql`AND claim."id" = ${claimId}`;
  const rows = await client.$queryRaw<ReadonlyArray<{ id: string }>>(
    Prisma.sql`
      SELECT receipt."id"
      FROM "AffiliateAgentGatewayOperationReceipts" AS receipt
      INNER JOIN "AffiliateAgentGatewayClaims" AS claim
        ON claim."id" = receipt."claimId"
      WHERE claim."status" = 'ACTIVE'
        AND (
          (
            claim."role" = 'SUPPLY_REVIEWER'
            AND receipt."status" = 'SUCCEEDED'
            AND receipt."operationKind" = ${AFFILIATE_AGENT_TERMINAL_EFFECT_OPERATION}
            AND receipt."commandName" = ${AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND}
          )
        )
      ${claimFilter}
      ORDER BY receipt."id" ASC
      LIMIT ${limit ?? 1}
    `,
  );
  return rows.map(({ id }) => id);
};

type ReconciliationReceiptRecovery = Readonly<{
  recovered: Readonly<Record<string, unknown>> | null;
  reviewerTerminalEffectResult: AffiliateAgentReviewerTerminalResult | null;
  reviewerTerminalEffectReservation: ReviewerTerminalEffectReservation | null;
  reviewerTerminalEffectFailureDiagnostics?: readonly ReviewerTerminalEffectFailureDiagnostic[];
  isImpossible: boolean;
}>;

const impossibleReceiptRecovery = (): ReconciliationReceiptRecovery => ({
  recovered: null,
  reviewerTerminalEffectResult: null,
  reviewerTerminalEffectReservation: null,
  isImpossible: true,
});

const recoverExternalReconciliationReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
): Promise<ReconciliationReceiptRecovery> => {
  const adapter =
    receipt.commandName === "RUN_DISCOVERY_QUERY"
      ? dependencies.commands.external.RUN_DISCOVERY_QUERY
      : dependencies.commands.external.CAPTURE_CLAIM_URL;
  if (typeof receipt.externalOperationKey !== "string" || !adapter) {
    return impossibleReceiptRecovery();
  }
  try {
    return {
      recovered: await adapter.recover(receipt.externalOperationKey),
      reviewerTerminalEffectResult: null,
      reviewerTerminalEffectReservation: null,
      isImpossible: false,
    };
  } catch {
    return {
      recovered: null,
      reviewerTerminalEffectResult: null,
      reviewerTerminalEffectReservation: null,
      isImpossible: false,
    };
  }
};

const recoverLifecycleReconciliationReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
): Promise<ReconciliationReceiptRecovery> => {
  if (dependencies.lifecycle.kind !== "AVAILABLE") {
    return impossibleReceiptRecovery();
  }
  try {
    return {
      recovered: await dependencies.lifecycle.recover(receipt.id),
      reviewerTerminalEffectResult: null,
      reviewerTerminalEffectReservation: null,
      isImpossible: false,
    };
  } catch {
    return {
      recovered: null,
      reviewerTerminalEffectResult: null,
      reviewerTerminalEffectReservation: null,
      isImpossible: false,
    };
  }
};

type ReviewerTerminalRecoveryContext = Readonly<{
  claim: AffiliateAgentGatewayClaims | null;
  job: AffiliateAgentGatewayJobs | null;
  envelope: AffiliateAgentClaimEnvelope | null;
  pendingEffectState: Extract<
    ReviewerTerminalEffectReceiptState,
    Readonly<{ kind: "PENDING" }>
  > | null;
  completedEffectState: Extract<
    ReviewerTerminalEffectReceiptState,
    Readonly<{ kind: "SUCCEEDED" }>
  > | null;
  reviewerResult: AffiliateAgentReviewerTerminalResult | null;
}>;

const parseReviewerTerminalEffectStateSafely = (
  receipt: AffiliateAgentGatewayOperationReceipts,
  shouldParse: boolean,
): ReviewerTerminalEffectReceiptState | null => {
  if (!shouldParse) return null;
  try {
    const state = parseReviewerTerminalEffectState(
      receipt.responseJson,
      receipt.id,
    );
    if (
      state.kind === "SUCCEEDED"
      && (
        receipt.responseHash === null
        || receipt.responseHash !== hashAffiliateAgentValue(state)
      )
    ) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
};

const reviewerTerminalEffectStateParts = (
  effectState: ReviewerTerminalEffectReceiptState | null,
): Pick<
  ReviewerTerminalRecoveryContext,
  "pendingEffectState" | "completedEffectState" | "reviewerResult"
> => {
  const pendingEffectState =
    effectState?.kind === "PENDING" ? effectState : null;
  const completedEffectState =
    effectState?.kind === "SUCCEEDED" ? effectState : null;
  return {
    pendingEffectState,
    completedEffectState,
    reviewerResult:
      pendingEffectState?.result ?? completedEffectState?.result ?? null,
  };
};

const loadReviewerTerminalRecoveryContext = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
): Promise<ReviewerTerminalRecoveryContext> => {
  const [claim, job] = await Promise.all([
    dependencies.prisma.affiliateAgentGatewayClaims.findUnique({
      where: { id: receipt.claimId },
    }),
    dependencies.prisma.affiliateAgentGatewayJobs.findUnique({
      where: { id: receipt.jobId },
    }),
  ]);
  const parsedEnvelope = claim
    ? affiliateAgentClaimEnvelopeSchema.safeParse(claim.claimEnvelopeJson)
    : null;
  const envelope =
    parsedEnvelope?.success === true ? parsedEnvelope.data : null;
  const effectState = parseReviewerTerminalEffectStateSafely(
    receipt,
    claim !== null && envelope !== null,
  );
  return {
    claim,
    job,
    envelope,
    ...reviewerTerminalEffectStateParts(effectState),
  };
};

const matchesReviewerClaimJobIdentity = (
  receipt: AffiliateAgentGatewayOperationReceipts,
  claim: AffiliateAgentGatewayClaims,
  job: AffiliateAgentGatewayJobs,
): boolean => {
  if (claim.status !== "ACTIVE") return false;
  if (job.status !== "CLAIMED") return false;
  if (job.activeClaimId !== claim.id) return false;
  if (job.claimGeneration !== claim.claimGeneration) return false;
  if (claim.jobId !== job.id) return false;
  if (receipt.jobId !== job.id) return false;
  if (receipt.claimId !== claim.id) return false;
  return receipt.claimGeneration === claim.claimGeneration;
};

const matchesReviewerClaimEnvelopeIdentity = (
  claim: AffiliateAgentGatewayClaims,
  envelope: AffiliateAgentClaimEnvelope,
  job: AffiliateAgentGatewayJobs,
): boolean => {
  if (claim.claimEnvelopeHash !== hashAffiliateAgentValue(envelope)) {
    return false;
  }
  if (envelope.jobId !== job.id) return false;
  if (envelope.claimId !== claim.id) return false;
  if (envelope.claimGeneration !== claim.claimGeneration) return false;
  if (envelope.role !== claim.role) return false;
  if (envelope.workerId !== claim.workerId) return false;
  if (envelope.invocationId !== claim.invocationId) return false;
  return envelope.workspaceId === claim.workspaceId;
};

const matchesReviewerEffectReceiptIdentity = (
  receipt: AffiliateAgentGatewayOperationReceipts,
  claim: AffiliateAgentGatewayClaims,
  reviewerResult: AffiliateAgentReviewerTerminalResult,
  pendingEffectState: Extract<
    ReviewerTerminalEffectReceiptState,
    Readonly<{ kind: "PENDING" }>
  > | null,
  completedEffectState: Extract<
    ReviewerTerminalEffectReceiptState,
    Readonly<{ kind: "SUCCEEDED" }>
  > | null,
): boolean => {
  if (reviewerResult.role !== "SUPPLY_REVIEWER") return false;
  if (receipt.status === "PENDING" && pendingEffectState === null) {
    return false;
  }
  if (receipt.status === "PENDING" && pendingEffectState !== null) {
    return matchesReviewerEffectRequest(receipt, claim, reviewerResult);
  }
  if (receipt.status === "SUCCEEDED" && completedEffectState === null) {
    return false;
  }
  if (receipt.status !== "SUCCEEDED" || completedEffectState === null) {
    return false;
  }
  return matchesReviewerEffectRequest(receipt, claim, reviewerResult);
};

const matchesReviewerEffectRequest = (
  receipt: AffiliateAgentGatewayOperationReceipts,
  claim: AffiliateAgentGatewayClaims,
  reviewerResult: AffiliateAgentReviewerTerminalResult,
): boolean => {
  if (receipt.idempotencyKey !== reviewerTerminalEffectIdempotencyKey()) {
    return false;
  }
  return (
    receipt.requestHash ===
    reviewerTerminalEffectRequestHash(claim, reviewerResult)
  );
};

const reviewerResultEvidenceTargetsEnvelope = (
  envelope: AffiliateAgentClaimEnvelope,
  reviewerResult: AffiliateAgentReviewerTerminalResult,
): boolean => {
  for (const evidenceRef of reviewerResult.evidenceRefs) {
    if (
      !envelope.evidenceManifest.entries.some(
        (entry) => entry.evidenceRef === evidenceRef,
      )
    ) {
      return false;
    }
  }
  return true;
};

const reviewerResultTargetsCommittedPackage = (
  subject: AffiliateAgentClaimEnvelope["subject"],
  reviewerResult: Extract<
    AffiliateAgentReviewerTerminalResult,
    Readonly<{
      disposition:
        | "APPROVED"
        | "ACTIVATED"
        | "PRODUCER_REPAIR_REQUIRED";
    }>
  >,
): boolean => {
  if (!("committedPackageHash" in subject)) return false;
  return (
    reviewerResult.payload.committedPackageHash ===
    subject.committedPackageHash
  );
};

const reviewerResultTargetsSupplySource = (
  subject: AffiliateAgentClaimEnvelope["subject"],
  reviewerResult: Extract<
    AffiliateAgentReviewerTerminalResult,
    Readonly<{
      disposition:
        | "REGRESSION_ASSESSED"
        | "SOURCE_EXCLUSION_ASSESSED";
    }>
  >,
): boolean => {
  if (!("supplySourceId" in subject)) return false;
  return reviewerResult.payload.supplySourceId === subject.supplySourceId;
};

const reviewerResultTargetsRejectedTarget = (
  subject: AffiliateAgentClaimEnvelope["subject"],
  reviewerResult: Extract<
    AffiliateAgentReviewerTerminalResult,
    Readonly<{ disposition: "EXACT_TARGET_REJECTED" }>
  >,
): boolean => {
  if (!("targetId" in subject) || !("targetType" in subject)) return false;
  if (reviewerResult.payload.targetId !== subject.targetId) return false;
  return reviewerResult.payload.targetType === subject.targetType;
};

const reviewerResultTargetsSubject = (
  envelope: AffiliateAgentClaimEnvelope,
  reviewerResult: AffiliateAgentReviewerTerminalResult,
): boolean => {
  const subject = envelope.subject;
  switch (reviewerResult.disposition) {
    case "APPROVED":
    case "ACTIVATED":
    case "PRODUCER_REPAIR_REQUIRED":
      return reviewerResultTargetsCommittedPackage(subject, reviewerResult);
    case "REGRESSION_ASSESSED":
    case "SOURCE_EXCLUSION_ASSESSED":
      return reviewerResultTargetsSupplySource(subject, reviewerResult);
    case "EXACT_TARGET_REJECTED":
      return reviewerResultTargetsRejectedTarget(subject, reviewerResult);
    default:
      return true;
  }
};

const reviewerResultTargetsEnvelope = (
  envelope: AffiliateAgentClaimEnvelope | null,
  reviewerResult: AffiliateAgentReviewerTerminalResult | null,
): boolean => {
  if (!envelope || !reviewerResult) return false;
  if (!reviewerResultEvidenceTargetsEnvelope(envelope, reviewerResult)) {
    return false;
  }
  return reviewerResultTargetsSubject(envelope, reviewerResult);
};

const reviewerTerminalRecoveryIsValid = (
  receipt: AffiliateAgentGatewayOperationReceipts,
  context: ReviewerTerminalRecoveryContext,
): boolean => {
  const { claim, job, envelope, reviewerResult } = context;
  if (!claim || !job || !envelope || !reviewerResult) return false;
  if (!matchesReviewerClaimJobIdentity(receipt, claim, job)) return false;
  if (!matchesReviewerClaimEnvelopeIdentity(claim, envelope, job)) {
    return false;
  }
  return matchesReviewerEffectReceiptIdentity(
    receipt,
    claim,
    reviewerResult,
    context.pendingEffectState,
    context.completedEffectState,
  );
};

const reviewerTerminalRecoveryReservation = (
  receipt: AffiliateAgentGatewayOperationReceipts,
  effectState:
    | Extract<
        ReviewerTerminalEffectReceiptState,
        Readonly<{ kind: "PENDING" }>
      >
    | Extract<
        ReviewerTerminalEffectReceiptState,
        Readonly<{ kind: "SUCCEEDED" }>
      >,
): ReviewerTerminalEffectReservation => ({
  receipt,
  isReplayed: true,
  terminalIdempotencyKey: effectState.terminalIdempotencyKey,
  terminalRequestHash: effectState.terminalRequestHash,
  ...(effectState.failureDiagnostics === undefined
    ? {}
    : { failureDiagnostics: effectState.failureDiagnostics }),
});

type ValidReviewerTerminalRecovery = Readonly<{
  claim: AffiliateAgentGatewayClaims;
  envelope: AffiliateAgentClaimEnvelope;
  reviewerResult: AffiliateAgentReviewerTerminalResult;
  effectState: ReviewerTerminalEffectReceiptState;
}>;

const reviewerTerminalRecoveryParts = (
  context: ReviewerTerminalRecoveryContext,
): ValidReviewerTerminalRecovery | null => {
  const effectState =
    context.completedEffectState ?? context.pendingEffectState;
  if (
    !context.claim ||
    !context.envelope ||
    !context.reviewerResult ||
    !effectState
  ) {
    return null;
  }
  return {
    claim: context.claim,
    envelope: context.envelope,
    reviewerResult: context.reviewerResult,
    effectState,
  };
};

const recoverPendingReviewerTerminalReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  claim: AffiliateAgentGatewayClaims,
  envelope: AffiliateAgentClaimEnvelope,
  reviewerResult: AffiliateAgentReviewerTerminalResult,
  reservation: ReviewerTerminalEffectReservation,
): Promise<ReconciliationReceiptRecovery> => {
  const adapter = dependencies.terminalEffects;
  if (!adapter) return impossibleReceiptRecovery();
  try {
    const invocation = await runReviewerTerminalEffectWithRecovery(
      adapter,
      {
        receiptId: receipt.id,
        claim: envelope,
        result: reviewerResult,
      },
      true,
      async (diagnostic) => {
        await persistReviewerTerminalEffectFailureDiagnostics(
          dependencies,
          receipt,
          [diagnostic],
        );
      },
    );
    const failureDiagnostics = mergeReviewerTerminalEffectFailureDiagnostics(
      reservation.failureDiagnostics ?? [],
      invocation.failureDiagnostics,
    );
    return {
      recovered: invocation.recovered,
      reviewerTerminalEffectResult: reviewerResult,
      reviewerTerminalEffectReservation: reservation,
      reviewerTerminalEffectFailureDiagnostics: failureDiagnostics,
      isImpossible: false,
    };
  } catch (error) {
    assertDatabaseAuthorizationFailure(error);
    return {
      recovered: null,
      reviewerTerminalEffectResult: reviewerResult,
      reviewerTerminalEffectReservation: reservation,
      reviewerTerminalEffectFailureDiagnostics:
        reservation.failureDiagnostics ?? [],
      isImpossible: false,
    };
  }
};

const recoverReviewerTerminalReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
): Promise<ReconciliationReceiptRecovery> => {
  const context = await loadReviewerTerminalRecoveryContext(
    dependencies,
    receipt,
  );
  if (!reviewerTerminalRecoveryIsValid(receipt, context)) {
    return impossibleReceiptRecovery();
  }
  const validRecovery = reviewerTerminalRecoveryParts(context);
  if (!validRecovery) return impossibleReceiptRecovery();
  if (
    !reviewerResultTargetsEnvelope(
      validRecovery.envelope,
      validRecovery.reviewerResult,
    )
  ) {
    return impossibleReceiptRecovery();
  }
  const reservation = reviewerTerminalRecoveryReservation(
    receipt,
    validRecovery.effectState,
  );
  if (validRecovery.effectState.kind === "SUCCEEDED") {
    return {
      recovered: validRecovery.effectState.safeOutput,
      reviewerTerminalEffectResult: validRecovery.reviewerResult,
      reviewerTerminalEffectReservation: reservation,
      reviewerTerminalEffectFailureDiagnostics:
        validRecovery.effectState.failureDiagnostics ?? [],
      isImpossible: false,
    };
  }
  return recoverPendingReviewerTerminalReceipt(
    dependencies,
    receipt,
    validRecovery.claim,
    validRecovery.envelope,
    validRecovery.reviewerResult,
    reservation,
  );
};

const recoverReconciliationReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
): Promise<ReconciliationReceiptRecovery> => {
  if (
    receipt.commandName === "CAPTURE_CLAIM_URL" ||
    receipt.commandName === "RUN_DISCOVERY_QUERY"
  ) {
    return recoverExternalReconciliationReceipt(dependencies, receipt);
  }
  if (receipt.commandName === "EXECUTE_RECORDED_LIFECYCLE_COMMAND") {
    return recoverLifecycleReconciliationReceipt(dependencies, receipt);
  }
  if (receipt.commandName === AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND) {
    return recoverReviewerTerminalReceipt(dependencies, receipt);
  }
  return impossibleReceiptRecovery();
};

type ReconciliationReceiptOutcome = Readonly<{
  recovered: boolean;
  completed: boolean;
  unresolved: boolean;
  isAdmissionHalted: boolean;
}>;

const unchangedReceiptOutcome = (): ReconciliationReceiptOutcome => ({
  recovered: false,
  completed: false,
  unresolved: false,
  isAdmissionHalted: false,
});

const findReceiptsForReconciliation = async (
  dependencies: AffiliateAgentGatewayDependencies,
  before: Date,
  limit: number | undefined,
  claimId: string | undefined,
  includeNotDue: boolean,
): Promise<readonly AffiliateAgentGatewayOperationReceipts[]> => {
  const reviewerTerminalEffectReceiptIds =
    await findActiveReviewerTerminalEffectReceiptIds(
      dependencies.prisma,
      limit,
      claimId,
    );
  return dependencies.prisma.affiliateAgentGatewayOperationReceipts.findMany({
    where: {
      ...(claimId === undefined ? {} : { claimId }),
      OR: [
        {
          status: "PENDING",
          ...(claimId === undefined || !includeNotDue
            ? { reconcileAfter: { lte: before } }
            : {}),
          OR: [
            {
              commandName: {
                in: [
                  "CAPTURE_CLAIM_URL",
                  "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
                  "RUN_DISCOVERY_QUERY",
                  AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND,
                ],
              },
            },
            { operationKind: "READ_ARTIFACT" },
          ],
        },
        ...(reviewerTerminalEffectReceiptIds.length === 0
          ? []
          : [
              {
                status: "SUCCEEDED" as const,
                id: { in: [...reviewerTerminalEffectReceiptIds] },
              },
            ]),
      ],
    },
    orderBy: [{ reconcileAfter: "asc" }, { id: "asc" }],
    ...(limit === undefined ? {} : { take: limit }),
  });
};

const markReceiptForReconciliation = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  now: Date,
  isImpossibleState: boolean,
  recovered = false,
): Promise<ReconciliationReceiptOutcome> => {
  const marked = await markReceiptReconciliationRequired(
    dependencies,
    receipt,
    now,
    isImpossibleState,
  );
  return {
    recovered,
    completed: false,
    unresolved: marked !== "UNCHANGED" || isImpossibleState,
    isAdmissionHalted: isImpossibleState || marked === "HALTED_GATEWAY",
  };
};

const reconcileArtifactReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  reconciliationNow: Date,
  includeNotDue: boolean,
): Promise<ReconciliationReceiptOutcome> => {
  if (
    !includeNotDue &&
    receipt.reconcileAfter !== null &&
    receipt.reconcileAfter > reconciliationNow
  ) {
    return {
      ...unchangedReceiptOutcome(),
      unresolved: true,
    };
  }
  await failStaleArtifactReceipt(
    dependencies,
    receipt.id,
    dependencies.clock.now(),
  );
  return unchangedReceiptOutcome();
};

const reconcileMissingRecovery = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  reconciliationNow: Date,
  includeNotDue: boolean,
): Promise<ReconciliationReceiptOutcome> => {
  if (
    includeNotDue &&
    receipt.reconcileAfter !== null &&
    receipt.reconcileAfter > reconciliationNow
  ) {
    return {
      ...unchangedReceiptOutcome(),
      unresolved: true,
    };
  }
  return markReceiptForReconciliation(
    dependencies,
    receipt,
    dependencies.clock.now(),
    false,
  );
};

const finalizeRecoveredReviewerTerminalReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  reviewerTerminalEffectResult: AffiliateAgentReviewerTerminalResult,
  reviewerTerminalEffectReservation: ReviewerTerminalEffectReservation,
  recovered: Readonly<Record<string, unknown>>,
  failureDiagnostics: readonly ReviewerTerminalEffectFailureDiagnostic[] = [],
): Promise<"COMPLETED"> => {
  await finalizeReviewerTerminalEffect(
    dependencies,
    reviewerTerminalEffectReservation,
    reviewerTerminalEffectResult,
    receipt.requestHash,
    parseBoundedSafeOutput(recovered, receipt.id),
    failureDiagnostics,
  );
  await completeRecoveredReviewerTerminalResult(
    dependencies,
    receipt,
    reviewerTerminalEffectResult,
  );
  return "COMPLETED";
};

const finalizeReconciliationReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  recovered: Readonly<Record<string, unknown>>,
  reviewerTerminalEffectResult: AffiliateAgentReviewerTerminalResult | null,
  reviewerTerminalEffectReservation: ReviewerTerminalEffectReservation | null,
  reviewerTerminalEffectFailureDiagnostics: readonly ReviewerTerminalEffectFailureDiagnostic[] = [],
): Promise<"COMPLETED" | "IMPOSSIBLE" | "LANE_FAILURE" | "UNCHANGED"> => {
  if (
    receipt.commandName === "CAPTURE_CLAIM_URL" ||
    receipt.commandName === "RUN_DISCOVERY_QUERY"
  ) {
    return finalizeRecoveredExternalReceipt(dependencies, receipt, recovered);
  }
  if (
    receipt.commandName === AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND &&
    reviewerTerminalEffectResult !== null &&
    reviewerTerminalEffectReservation !== null
  ) {
    return finalizeRecoveredReviewerTerminalReceipt(
      dependencies,
      receipt,
      reviewerTerminalEffectResult,
      reviewerTerminalEffectReservation,
      recovered,
      reviewerTerminalEffectFailureDiagnostics,
    );
  }
  return finalizeRecoveredLifecycleReceipt(dependencies, receipt, recovered);
};

const reconcileRecoveredReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  recovery: ReconciliationReceiptRecovery,
): Promise<ReconciliationReceiptOutcome> => {
  const recovered = recovery.recovered;
  if (recovered === null) {
    return reconcileMissingRecovery(
      dependencies,
      receipt,
      dependencies.clock.now(),
      false,
    );
  }
  try {
    const finalized = await finalizeReconciliationReceipt(
      dependencies,
      receipt,
      recovered,
      recovery.reviewerTerminalEffectResult,
      recovery.reviewerTerminalEffectReservation,
      recovery.reviewerTerminalEffectFailureDiagnostics ?? [],
    );
    if (finalized === "COMPLETED") {
      return {
        recovered: true,
        completed: true,
        unresolved: false,
        isAdmissionHalted: false,
      };
    }
    if (finalized === "UNCHANGED") {
      return {
        recovered: true,
        completed: false,
        unresolved: false,
        isAdmissionHalted: false,
      };
    }
    if (finalized === "LANE_FAILURE") {
      return markReceiptForReconciliation(
        dependencies,
        receipt,
        dependencies.clock.now(),
        false,
        true,
      );
    }
  } catch {
    return markReceiptForReconciliation(
      dependencies,
      receipt,
      dependencies.clock.now(),
      true,
      true,
    );
  }
  return markReceiptForReconciliation(
    dependencies,
    receipt,
    dependencies.clock.now(),
    true,
    true,
  );
};

const reconcileOnePendingExternalReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  reconciliationNow: Date,
  includeNotDue: boolean,
): Promise<ReconciliationReceiptOutcome> => {
  if (receipt.operationKind === "READ_ARTIFACT") {
    return reconcileArtifactReceipt(
      dependencies,
      receipt,
      reconciliationNow,
      includeNotDue,
    );
  }
  const recovery = await recoverReconciliationReceipt(dependencies, receipt);
  if (recovery.isImpossible) {
    return markReceiptForReconciliation(
      dependencies,
      receipt,
      dependencies.clock.now(),
      true,
    );
  }
  if (recovery.recovered === null) {
    return reconcileMissingRecovery(
      dependencies,
      receipt,
      reconciliationNow,
      includeNotDue,
    );
  }
  return reconcileRecoveredReceipt(dependencies, receipt, recovery);
};

const reconcilePendingExternalReceipts = async (
  dependencies: AffiliateAgentGatewayDependencies,
  before: Date,
  limit: number | undefined,
  claimId?: string,
  includeNotDue = false,
): Promise<
  Readonly<{
    examined: number;
    recovered: number;
    completed: number;
    unresolved: number;
    isAdmissionHalted: boolean;
  }>
> => {
  const receipts = await findReceiptsForReconciliation(
    dependencies,
    before,
    limit,
    claimId,
    includeNotDue,
  );
  let unresolved = 0;
  let isAdmissionHalted = false;
  let recoveredCount = 0;
  let completed = 0;
  for (const receipt of receipts) {
    const outcome = await reconcileOnePendingExternalReceipt(
      dependencies,
      receipt,
      dependencies.clock.now(),
      includeNotDue,
    );
    if (outcome.recovered) recoveredCount += 1;
    if (outcome.completed) completed += 1;
    if (outcome.unresolved) unresolved += 1;
    if (outcome.isAdmissionHalted) isAdmissionHalted = true;
  }
  return {
    examined: receipts.length,
    recovered: recoveredCount,
    completed,
    unresolved,
    isAdmissionHalted,
  };
};
const reconcilePendingEffectsForClaim = async (
  dependencies: AffiliateAgentGatewayDependencies,
  claimId: string,
  includeNotDue = false,
) =>
  reconcilePendingExternalReceipts(
    dependencies,
    dependencies.clock.now(),
    undefined,
    claimId,
    includeNotDue,
  );
const performReconciledFailure = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: AffiliateAgentInvocationReconciliationRequest,
): Promise<AffiliateAgentInvocationReconciliationResult> => {
  const result = await performFailure(dependencies, input, {
    isCompletedReplayAllowed: true,
    isTrustedFailureRecording: true,
  });
  if (result.kind === "INVOCATION_FAILED") {
    await reportInvocationFailure(
      dependencies,
      input.authorization,
      result,
      input.failure.code,
      input.failure.safeSummary,
    );
    return {
      kind: "INVOCATION_FAILED",
      failureCode: result.failureCode,
      invocationFailureCount: result.invocationFailureCount,
      nextAttemptAt: result.nextAttemptAt,
      isPipelineBlocked: result.isPipelineBlocked,
    };
  }
  return { kind: "TERMINAL_ACCEPTED" };
};


const assertInvocationPendingEffectsReady = (
  pendingEffects: Readonly<{
    isAdmissionHalted: boolean;
    unresolved: number;
  }>,
): void => {
  if (pendingEffects.isAdmissionHalted) {
    throw gatewayError(
      "GATEWAY_ADMISSION_HALTED",
      "Gateway admission is halted until an impossible receipt state is resolved.",
    );
  }
  if (pendingEffects.unresolved > 0) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The invocation has an unresolved external effect.",
    );
  }
};

const isInvocationPendingEffectError = (
  error: unknown,
): boolean => error instanceof AffiliateAgentGatewayError
  && error.code === "PARTIAL_COMMAND_UNRESOLVED"
  && error.safeMessage === INVOCATION_FAILURE_PENDING_EFFECT_MESSAGE
  && error.receiptId !== undefined;

const retryInvocationAfterPendingEffect = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: AffiliateAgentInvocationReconciliationRequest,
): Promise<AffiliateAgentInvocationReconciliationResult | null> => {
  const recovered = await reconcilePendingEffectsForClaim(
    dependencies,
    input.authorization.claimId,
    true,
  );
  if (recovered.isAdmissionHalted) {
    throw gatewayError(
      "GATEWAY_ADMISSION_HALTED",
      "Gateway admission is halted until an impossible receipt state is resolved.",
    );
  }
  if (recovered.examined > 0 && recovered.unresolved === 0) {
    return performReconciledFailure(dependencies, input);
  }
  return null;
};

const reconcileExactInvocation = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: AffiliateAgentInvocationReconciliationRequest,
): Promise<AffiliateAgentInvocationReconciliationResult> => {
  const pendingEffects = await reconcilePendingExternalReceipts(
    dependencies,
    dependencies.clock.now(),
    undefined,
    input.authorization.claimId,
    true,
  );
  assertInvocationPendingEffectsReady(pendingEffects);

  try {
    return await performReconciledFailure(dependencies, input);
  } catch (error) {
    if (isInvocationPendingEffectError(error)) {
      const recovered = await retryInvocationAfterPendingEffect(
        dependencies,
        input,
      );
      if (recovered !== null) return recovered;
    }
    throw error;
  }
};

const reconcileAffiliateAgentGateway = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input?: AffiliateAgentReconcileRequest,
): Promise<AffiliateAgentReconcileReport> => {
  const limit = reconcileLimit(input);
  const before = reconcileBefore(dependencies, input);
  const receipts = await reconcilePendingExternalReceipts(
    dependencies,
    before,
    limit,
  );
  const claims = await reconcileExpiredClaims(
    dependencies,
    before,
    Math.max(0, limit - receipts.examined),
  );
  const isAdmissionHalted =
    receipts.isAdmissionHalted ||
    claims.isAdmissionHalted ||
    (await dependencies.prisma.affiliateAgentGatewayClaims.findFirst({
      where: {
        status: "RECONCILIATION_REQUIRED",
        safeFailureCode: "GATEWAY_ADMISSION_HALTED",
      },
      select: { id: true },
    })) !== null ||
    (await dependencies.prisma.affiliateAgentGatewayOperationReceipts.findFirst(
      {
        where: {
          status: "UNKNOWN",
          safeErrorCode: "GATEWAY_ADMISSION_HALTED",
        },
        select: { id: true },
      },
    )) !== null;
  return {
    examinedClaims: claims.examined,
    expiredClaims: claims.expired,
    examinedReceipts: receipts.examined,
    recoveredReceipts: receipts.recovered,
    completedReceipts: receipts.completed,
    unresolvedReceipts: receipts.unresolved,
    isAdmissionHalted,
  };
};


const reviewerEffectRecoveryOperatorSchema = z.object({
  operatorId: gatewayIdentifierSchema,
}).strict();

type ReviewerEffectRecoveryTransition = Readonly<{
  id: string;
  supplySourceId: string;
  generation: number;
  command: string;
  commandRef: string | null;
  idempotencyKey: string;
  requestHash: string;
  resultHash: string;
  contractVersion: number;
  contractHash: string;
  actorKind: string;
  actorId: string;
  executingAgentId: string | null;
  toStage: string;
  requestJson: Prisma.JsonValue;
  resultJson: Prisma.JsonValue;
}>;

type ReviewerEffectRecoveryRows = Readonly<{
  receipt: AffiliateAgentGatewayOperationReceipts | null;
  claim: AffiliateAgentGatewayClaims | null;
  job: AffiliateAgentGatewayJobs | null;
  envelope: AffiliateAgentClaimEnvelope | null;
  effectState: ReviewerTerminalEffectReceiptState | null;
  reviewerResult: AffiliateAgentReviewerTerminalResult | null;
  producerContext: ProducerReviewContext | null;
  sourceRead: AffiliateSupplySourceReadAssessment | null;
  activeBundle: AffiliateAgentContractBundle | null;
  currentCatalogHash: string | null;
  priorApprovalTransition: ReviewerEffectRecoveryTransition | null;
  sourceExclusionTransition: ReviewerEffectRecoveryTransition | null;
  sourceExclusionBindingValid: boolean;
  sourceExclusionExecutionReady: boolean;
  sourceExclusionEvidenceValid: boolean;
  otherActiveClaimIds: readonly string[];
  approvedAdapterAvailable: boolean;
  sourceExclusionAdapterAvailable: boolean;
  reviewerHumanAdapterAvailable: boolean;
}>;

type ReviewerEffectRecoveryEvaluation = Readonly<{
  eligible: boolean;
  reasonCodes: readonly string[];
  reportHash: string;
  transitionAlreadyRecorded: boolean;
}>;

const reviewerEffectRecoveryCurrentState = (
  rows: ReviewerEffectRecoveryRows,
): AffiliateAgentReviewerEffectRecoveryCurrentState => ({
  receipt: rows.receipt?.status ?? null,
  claim: rows.claim?.status ?? null,
  job: rows.job?.status ?? null,
  sourceStage: rows.sourceRead?.assessment.stage ?? null,
  sourceLifecycleGeneration:
    rows.sourceRead?.assessment.lifecycleGeneration ?? null,
});

const recoveryError = (
  code:
    | "REVIEWER_EFFECT_RECOVERY_NOT_ELIGIBLE"
    | "REVIEWER_EFFECT_RECOVERY_STALE"
    | "REVIEWER_EFFECT_RECOVERY_IN_PROGRESS"
    | "REVIEWER_EFFECT_RECOVERY_HASH_MISMATCH"
    | "INTERNAL_ERROR",
  safeMessage: string,
  receiptId?: string,
): AffiliateAgentGatewayError => gatewayError(code, safeMessage, false, receiptId);

const isRecoverySha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);

const parseRecoveryEnvelope = (
  claim: AffiliateAgentGatewayClaims | null,
): AffiliateAgentClaimEnvelope | null => {
  if (!claim) return null;
  const parsed = affiliateAgentClaimEnvelopeSchema.safeParse(
    claim.claimEnvelopeJson,
  );
  return parsed.success ? parsed.data : null;
};

const parseRecoveryEffectState = (
  receipt: AffiliateAgentGatewayOperationReceipts | null,
): ReviewerTerminalEffectReceiptState | null => {
  if (
    !receipt
    || receipt.operationKind !== AFFILIATE_AGENT_TERMINAL_EFFECT_OPERATION
    || receipt.commandName !== AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND
  ) {
    return null;
  }
  try {
    return parseReviewerTerminalEffectState(receipt.responseJson, receipt.id);
  } catch {
    return null;
  }
};

const recoveryTransitionRequestHash = (
  value: ReviewerEffectRecoveryTransition,
): string | null => {
  if (!isGatewayRecord(value.requestJson)) return null;
  const {
    __affiliateInvariantAlertContract: _alertIntent,
    ...request
  } = value.requestJson;
  return hashAffiliateAgentValue({
    supplySourceId: value.supplySourceId,
    command: value.command,
    contractVersion: value.contractVersion,
    contractHash: value.contractHash,
    request,
  });
};

const recoveryTransitionFor = (
  value: ReviewerEffectRecoveryTransition | null,
  receiptId: string,
  claim: AffiliateAgentGatewayClaims | null,
  result: AffiliateAgentReviewerTerminalResult | null,
  sourceRead: AffiliateSupplySourceReadAssessment | null,
): boolean => {
  if (!value || !claim || !result || !sourceRead || !value.id) return false;
  const request = isGatewayRecord(value.requestJson)
    ? value.requestJson
    : null;
  const transitionResult = isGatewayRecord(value.resultJson)
    ? value.resultJson
    : null;
  const committedPackageHash = recoveryCommittedPackageHash(result);
  return (
    value.supplySourceId === sourceRead.snapshot.supplySourceId
    && value.commandRef === receiptId
    && value.idempotencyKey === receiptId
    && value.command === "APPROVE"
    && value.toStage === "APPROVED"
    && value.generation === sourceRead.assessment.lifecycleGeneration
    && value.actorKind === "SUPPLY_REVIEWER"
    && value.actorId === claim.workerId
    && value.executingAgentId === result.invocationId
    && value.contractVersion === result.supplyContractVersion
    && value.contractHash === result.supplyContractHash
    && value.requestHash === recoveryTransitionRequestHash(value)
    && value.resultHash === hashAffiliateAgentValue(value.resultJson)
    && transitionResult?.supplySourceId === sourceRead.snapshot.supplySourceId
    && transitionResult?.lifecycleGeneration === value.generation
    && transitionResult?.stage === value.toStage
    && request?.commandRef === receiptId
    && request.sourceId === sourceRead.rootId
    && (request.mappingId === undefined
      || request.mappingId === sourceRead.snapshot.source.activeMappingId)
    && request.packageHash === committedPackageHash
    && request.reviewerClaimId === claim.id
    && request.reviewerClaimGeneration === result.claimGeneration
    && request.reviewerInvocationId === result.invocationId
    && claim.lifecycleGeneration !== null
    && value.generation === claim.lifecycleGeneration + 1
    && request.reviewerWorkerId === claim.workerId
  );
};
const sourceExclusionTransitionFor = (
  value: ReviewerEffectRecoveryTransition | null,
  receiptId: string,
  claim: AffiliateAgentGatewayClaims | null,
  result: AffiliateAgentReviewerTerminalResult | null,
  sourceRead: AffiliateSupplySourceReadAssessment | null,
): boolean => {
  const subject = claim
    ? parseRecoveryEnvelope(claim)?.subject
    : null;
  if (
    !value
    || !claim
    || !result
    || !sourceRead
    || !subject
    || subject.type !== "SOURCE_EXCLUSION_REVIEW"
    || result.disposition !== "SOURCE_EXCLUSION_ASSESSED"
    || result.payload.recommendation !== "EXCLUDE"
  ) {
    return false;
  }
  const request = isGatewayRecord(value.requestJson)
    ? value.requestJson
    : null;
  const transitionResult = isGatewayRecord(value.resultJson)
    ? value.resultJson
    : null;
  return (
    value.supplySourceId === sourceRead.snapshot.supplySourceId
    && value.commandRef === receiptId
    && value.idempotencyKey === receiptId
    && value.command === "EXCLUDE_SOURCE"
    && value.toStage === "SOURCE_EXCLUDED"
    && claim.lifecycleGeneration !== null
    && value.generation === claim.lifecycleGeneration + 1
    && value.actorKind === "SUPPLY_REVIEWER"
    && value.actorId === claim.workerId
    && value.executingAgentId === result.invocationId
    && value.contractVersion === result.supplyContractVersion
    && value.contractHash === result.supplyContractHash
    && value.requestHash === recoveryTransitionRequestHash(value)
    && value.resultHash === hashAffiliateAgentValue(value.resultJson)
    && transitionResult?.supplySourceId === sourceRead.snapshot.supplySourceId
    && transitionResult?.lifecycleGeneration === value.generation
    && transitionResult?.stage === "SOURCE_EXCLUDED"
    && transitionResult?.outcome === "SOURCE_EXCLUDED"
    && request !== null
    && request.commandRef === receiptId
    && request.sourceId === sourceRead.rootId
    && request.reviewerClaimId === claim.id
    && request.reviewerClaimGeneration === result.claimGeneration
    && request.reviewerInvocationId === result.invocationId
    && request.reviewerSupplySourceId === sourceRead.snapshot.supplySourceId
    && request.reviewerWorkerId === claim.workerId
    && request.reviewerOutcome === "SOURCE_EXCLUSION_EXCLUDE"
    && request.exclusionRequestHash === subject.requestHash
    && request.producerResultHash === subject.producerResultHash
    && request.reviewerResultHash === hashAffiliateAgentValue(result)
    && request.evidenceRefs !== undefined
    && hashAffiliateAgentValue(request.evidenceRefs)
      === hashAffiliateAgentValue(result.evidenceRefs)
    && request.sportEvidence !== undefined
    && hashAffiliateAgentValue(request.sportEvidence)
      === hashAffiliateAgentValue(result.payload.sportEvidence)
  );
};
const recoveryCommittedPackageHash = (
  result: AffiliateAgentReviewerTerminalResult | null,
): string | null => (
  result?.disposition === "APPROVED"
    ? result.payload.committedPackageHash
    : null
);

const recoveryAssessmentFingerprint = (
  assessment: AffiliateSupplyAssessment | null,
): Readonly<Record<string, unknown>> | null => {
  if (!assessment) return null;
  const { assessedAt: _assessedAt, ...stable } = assessment;
  return stable;
};

const recoveryEffectStateFingerprint = (
  state: ReviewerTerminalEffectReceiptState | null,
): Readonly<Record<string, unknown>> | null => {
  if (!state) return null;
  return state.kind === "PENDING"
    ? {
      kind: state.kind,
      result: state.result,
      terminalIdempotencyKey: state.terminalIdempotencyKey,
      terminalRequestHash: state.terminalRequestHash,
    }
    : {
      kind: state.kind,
      result: state.result,
      resultHash: state.resultHash,
      safeOutput: state.safeOutput,
      terminalIdempotencyKey: state.terminalIdempotencyKey,
      terminalRequestHash: state.terminalRequestHash,
    };
};
const recoveryProducerContextFingerprint = (
  context: ProducerReviewContext | null,
): Readonly<Record<string, unknown>> | null => {
  if (!context) return null;
  const producerClaim = context.producerClaim
    ? {
      id: context.producerClaim.id,
      jobId: context.producerClaim.jobId,
      parentClaimId: context.producerClaim.parentClaimId,
      claimGeneration: context.producerClaim.claimGeneration,
      lifecycleGeneration: context.producerClaim.lifecycleGeneration,
      queue: context.producerClaim.queue,
      lane: context.producerClaim.lane,
      role: context.producerClaim.role,
      workerId: context.producerClaim.workerId,
      invocationId: context.producerClaim.invocationId,
      workspaceId: context.producerClaim.workspaceId,
      status: context.producerClaim.status,
      claimRequestId: context.producerClaim.claimRequestId,
      claimRequestHash: context.producerClaim.claimRequestHash,
      claimEnvelopeHash: context.producerClaim.claimEnvelopeHash,
      evidenceManifestHash: context.producerClaim.evidenceManifestHash,
      permittedCommandHash: context.producerClaim.permittedCommandHash,
      permittedCommands: context.producerClaim.permittedCommands,
      deploymentContractVersion: context.producerClaim.deploymentContractVersion,
      deploymentContractHash: context.producerClaim.deploymentContractHash,
      roleContractVersion: context.producerClaim.roleContractVersion,
      roleContractHash: context.producerClaim.roleContractHash,
      promptTemplateVersion: context.producerClaim.promptTemplateVersion,
      promptTemplateHash: context.producerClaim.promptTemplateHash,
      supplyContractVersion: context.producerClaim.supplyContractVersion,
      supplyContractHash: context.producerClaim.supplyContractHash,
      terminalReceiptId: context.producerClaim.terminalReceiptId,
      safeFailureCode: context.producerClaim.safeFailureCode,
      safeFailureSummary: context.producerClaim.safeFailureSummary,
      tokenInvalidatedAt: context.producerClaim.tokenInvalidatedAt?.toISOString() ?? null,
    }
    : null;
  const producerJob = context.producerJob
    ? {
      id: context.producerJob.id,
      dedupeKey: context.producerJob.dedupeKey,
      queue: context.producerJob.queue,
      lane: context.producerJob.lane,
      role: context.producerJob.role,
      subjectType: context.producerJob.subjectType,
      subjectId: context.producerJob.subjectId,
      subjectJsonHash: hashAffiliateAgentValue(context.producerJob.subjectJson),
      evidenceManifestHash: hashAffiliateAgentValue(
        context.producerJob.evidenceManifestJson,
      ),
      supplySourceId: context.producerJob.supplySourceId,
      expectedLifecycleGeneration: context.producerJob.expectedLifecycleGeneration,
      status: context.producerJob.status,
      priority: context.producerJob.priority,
      nextAttemptAt: context.producerJob.nextAttemptAt?.toISOString() ?? null,
      claimGeneration: context.producerJob.claimGeneration,
      activeClaimId: context.producerJob.activeClaimId,
      parentClaimId: context.producerJob.parentClaimId,
      invocationFailureCount: context.producerJob.invocationFailureCount,
      pipelineBlockedAt: context.producerJob.pipelineBlockedAt?.toISOString() ?? null,
      terminalDisposition: context.producerJob.terminalDisposition,
      resultHash: context.producerJob.resultHash,
      resultJsonHash: hashAffiliateAgentValue(
        context.producerJob.resultJson ?? null,
      ),
      terminalReceiptId: context.producerJob.terminalReceiptId,
      finishedAt: context.producerJob.finishedAt?.toISOString() ?? null,
    }
    : null;
  const producerEnvelopeHash = context.producerEnvelope
    ? hashAffiliateAgentValue(context.producerEnvelope)
    : null;
  const producerResultHash = context.producerResult
    ? hashAffiliateAgentValue(context.producerResult)
    : null;
  const producerClaimRowHash = hashAffiliateAgentValue(producerClaim);
  const producerJobRowHash = hashAffiliateAgentValue(producerJob);
  return {
    producerClaimRowHash,
    producerJobRowHash,
    producerEnvelopeHash,
    producerResultHash,
    producerProofHash: hashAffiliateAgentValue({
      producerClaimRowHash,
      producerJobRowHash,
      producerEnvelopeHash,
      producerResultHash,
    }),
  };
};
const recoveryFingerprint = (
  request: AffiliateAgentReviewerEffectRecoveryRequest,
  rows: ReviewerEffectRecoveryRows,
  eligible: boolean,
  reasonCodes: readonly string[],
  transitionAlreadyRecorded: boolean,
): Readonly<Record<string, unknown>> => ({
  schemaVersion: 1,
  receiptId: request.receiptId,
  jobId: request.jobId,
  claimId: request.claimId,
  supplySourceId: request.supplySourceId,
  reason: request.reason,
  eligible,
  reasonCodes: [...reasonCodes],
  transitionAlreadyRecorded,
  currentState: reviewerEffectRecoveryCurrentState(rows),
  receipt: rows.receipt
    ? {
      claimId: rows.receipt.claimId,
      jobId: rows.receipt.jobId,
      claimGeneration: rows.receipt.claimGeneration,
      operationKind: rows.receipt.operationKind,
      commandName: rows.receipt.commandName,
      idempotencyKey: rows.receipt.idempotencyKey,
      requestHash: rows.receipt.requestHash,
      responseHash: rows.receipt.responseHash,
      responseStateHash: hashAffiliateAgentValue(
        recoveryEffectStateFingerprint(rows.effectState),
      ),
      status: rows.receipt.status,
      safeErrorCode: rows.receipt.safeErrorCode,
      startedAt: rows.receipt.startedAt.toISOString(),
      completedAt: rows.receipt.completedAt?.toISOString() ?? null,
      reconcileAfter: rows.receipt.reconcileAfter?.toISOString() ?? null,
    }
    : null,
  claim: rows.claim
    ? {
      id: rows.claim.id,
      jobId: rows.claim.jobId,
      parentClaimId: rows.claim.parentClaimId,
      claimGeneration: rows.claim.claimGeneration,
      lifecycleGeneration: rows.claim.lifecycleGeneration,
      queue: rows.claim.queue,
      lane: rows.claim.lane,
      role: rows.claim.role,
      workerId: rows.claim.workerId,
      invocationId: rows.claim.invocationId,
      workspaceId: rows.claim.workspaceId,
      status: rows.claim.status,
      claimRequestId: rows.claim.claimRequestId,
      claimRequestHash: rows.claim.claimRequestHash,
      claimEnvelopeHash: rows.claim.claimEnvelopeHash,
      evidenceManifestHash: rows.claim.evidenceManifestHash,
      permittedCommandHash: rows.claim.permittedCommandHash,
      permittedCommands: rows.claim.permittedCommands,
      deploymentContractVersion: rows.claim.deploymentContractVersion,
      deploymentContractHash: rows.claim.deploymentContractHash,
      roleContractVersion: rows.claim.roleContractVersion,
      roleContractHash: rows.claim.roleContractHash,
      promptTemplateVersion: rows.claim.promptTemplateVersion,
      promptTemplateHash: rows.claim.promptTemplateHash,
      supplyContractVersion: rows.claim.supplyContractVersion,
      supplyContractHash: rows.claim.supplyContractHash,
      leaseExpiresAt: rows.claim.leaseExpiresAt.toISOString(),
      hardDeadlineAt: rows.claim.hardDeadlineAt.toISOString(),
      tokenExpiresAt: rows.claim.tokenExpiresAt.toISOString(),
      tokenInvalidatedAt: rows.claim.tokenInvalidatedAt?.toISOString() ?? null,
      terminalReceiptId: rows.claim.terminalReceiptId,
      safeFailureCode: rows.claim.safeFailureCode,
      safeFailureSummary: rows.claim.safeFailureSummary,
    }
    : null,
  job: rows.job
    ? {
      id: rows.job.id,
      dedupeKey: rows.job.dedupeKey,
      queue: rows.job.queue,
      lane: rows.job.lane,
      role: rows.job.role,
      subjectType: rows.job.subjectType,
      subjectId: rows.job.subjectId,
      subjectJsonHash: hashAffiliateAgentValue(rows.job.subjectJson),
      evidenceManifestHash: hashAffiliateAgentValue(rows.job.evidenceManifestJson),
      supplySourceId: rows.job.supplySourceId,
      expectedLifecycleGeneration: rows.job.expectedLifecycleGeneration,
      status: rows.job.status,
      priority: rows.job.priority,
      nextAttemptAt: rows.job.nextAttemptAt?.toISOString() ?? null,
      claimGeneration: rows.job.claimGeneration,
      activeClaimId: rows.job.activeClaimId,
      parentClaimId: rows.job.parentClaimId,
      invocationFailureCount: rows.job.invocationFailureCount,
      lastInvocationFailedAt: rows.job.lastInvocationFailedAt?.toISOString() ?? null,
      pipelineBlockedAt: rows.job.pipelineBlockedAt?.toISOString() ?? null,
      terminalDisposition: rows.job.terminalDisposition,
      resultHash: rows.job.resultHash,
      resultJsonHash: hashAffiliateAgentValue(rows.job.resultJson ?? null),
      terminalReceiptId: rows.job.terminalReceiptId,
      finishedAt: rows.job.finishedAt?.toISOString() ?? null,
    }
    : null,
  envelopeHash: rows.envelope
    ? hashAffiliateAgentValue(rows.envelope)
    : null,
  reviewerResultHash: rows.reviewerResult
    ? hashAffiliateAgentValue(rows.reviewerResult)
    : null,
  effectStateHash: hashAffiliateAgentValue(
    recoveryEffectStateFingerprint(rows.effectState),
  ),
  sourceAssessment: recoveryAssessmentFingerprint(
    rows.sourceRead?.assessment ?? null,
  ),
  source: rows.sourceRead
    ? {
      sourceId: rows.sourceRead.snapshot.source.id,
      rootId: rows.sourceRead.rootId,
      rootAutomationHoldReason: rows.sourceRead.rootAutomationHoldReason,
      rootLiveSourceId: rows.sourceRead.rootLiveSourceId,
      persistedLiveSource: rows.sourceRead.persistedLiveSource
        ? {
          id: rows.sourceRead.persistedLiveSource.id,
          supplySourceId: rows.sourceRead.persistedLiveSource.supplySourceId,
          activeMappingId: rows.sourceRead.persistedLiveSource.activeMappingId,
        }
        : null,
      rootAutomationReviewRequired: rows.sourceRead.rootAutomationReviewRequired,
      sourceAutomationReviewRequired: rows.sourceRead.sourceAutomationReviewRequired,
      identityKey: rows.sourceRead.snapshot.source.identityKey ?? null,
      canonicalUrl: rows.sourceRead.snapshot.source.canonicalUrl ?? null,
      targetKind: rows.sourceRead.snapshot.source.targetKind ?? null,
      status: rows.sourceRead.snapshot.source.status ?? null,
      activeMappingId: rows.sourceRead.snapshot.source.activeMappingId ?? null,
      activeSupplyContractVersion:
        rows.sourceRead.snapshot.source.activeSupplyContractVersion ?? null,
      activeSupplyContractHash:
        rows.sourceRead.snapshot.source.activeSupplyContractHash ?? null,
      lifecycleGeneration: rows.sourceRead.snapshot.source.lifecycleGeneration,
      isAutomationEnabled: rows.sourceRead.snapshot.source.isAutomationEnabled ?? null,
      autoScrapeEnabled: rows.sourceRead.snapshot.source.autoScrapeEnabled,
      isAutomationOnHold: rows.sourceRead.snapshot.source.isAutomationOnHold ?? null,
      automationHoldReason:
        rows.sourceRead.snapshot.source.automationHoldReason ?? null,
      isExcluded: rows.sourceRead.snapshot.source.isExcluded ?? null,
      operatorDomain: rows.sourceRead.snapshot.source.operatorDomain ?? null,
      metadataHash: hashAffiliateAgentValue(
        rows.sourceRead.snapshot.source.metadata ?? null,
      ),
      mapping: rows.sourceRead.snapshot.mapping
        ? {
          id: rows.sourceRead.snapshot.mapping.id,
          version: rows.sourceRead.snapshot.mapping.version,
          isActive: rows.sourceRead.snapshot.mapping.isActive,
          validatedAt: rows.sourceRead.snapshot.mapping.validatedAt instanceof Date
            ? rows.sourceRead.snapshot.mapping.validatedAt.toISOString()
            : rows.sourceRead.snapshot.mapping.validatedAt ?? null,
          isSchemaValid: rows.sourceRead.snapshot.mapping.isSchemaValid,
          packageHash: rows.sourceRead.snapshot.mapping.packageHash ?? null,
          evidenceRefs: rows.sourceRead.snapshot.mapping.evidenceRefs ?? [],
          evidenceKinds: rows.sourceRead.snapshot.mapping.evidenceKinds ?? [],
          mappingHash: hashAffiliateAgentValue(
            rows.sourceRead.snapshot.mapping.mapping ?? null,
          ),
          validationOutputHash: hashAffiliateAgentValue(
            rows.sourceRead.snapshot.mapping.validationOutput ?? null,
          ),
        }
        : null,
      mappingJob: rows.sourceRead.snapshot.mappingJob
        ? {
          id: rows.sourceRead.snapshot.mappingJob.id,
          status: rows.sourceRead.snapshot.mappingJob.status,
          sourceId: rows.sourceRead.snapshot.mappingJob.sourceId ?? null,
          mappingId: rows.sourceRead.snapshot.mappingJob.mappingId ?? null,
          resultSummaryHash: hashAffiliateAgentValue(
            rows.sourceRead.snapshot.mappingJob.resultSummary ?? null,
          ),
          evidenceRefs: rows.sourceRead.snapshot.mappingJob.evidenceRefs ?? [],
        }
        : null,
      catalogHash: rows.currentCatalogHash,
    }
    : null,
  contract: rows.sourceRead
    ? {
      version: rows.sourceRead.contract.version,
      hash: rows.sourceRead.contract.hash,
    }
    : null,
  activeGatewayContract: rows.activeBundle
    ? {
      version: rows.activeBundle.supplyContract.version,
      hash: rows.activeBundle.supplyContract.hash,
    }
    : null,
  producerContext: recoveryProducerContextFingerprint(rows.producerContext),
  priorApprovalTransition: rows.priorApprovalTransition
    ? {
      id: rows.priorApprovalTransition.id,
      supplySourceId: rows.priorApprovalTransition.supplySourceId,
      generation: rows.priorApprovalTransition.generation,
      command: rows.priorApprovalTransition.command,
      commandRef: rows.priorApprovalTransition.commandRef,
      idempotencyKey: rows.priorApprovalTransition.idempotencyKey,
      requestHash: rows.priorApprovalTransition.requestHash,
      resultHash: rows.priorApprovalTransition.resultHash,
      requestJsonHash: hashAffiliateAgentValue(
        rows.priorApprovalTransition.requestJson,
      ),
      resultJsonHash: hashAffiliateAgentValue(
        rows.priorApprovalTransition.resultJson,
      ),
      contractVersion: rows.priorApprovalTransition.contractVersion,
      contractHash: rows.priorApprovalTransition.contractHash,
      actorKind: rows.priorApprovalTransition.actorKind,
      actorId: rows.priorApprovalTransition.actorId,
      executingAgentId: rows.priorApprovalTransition.executingAgentId,
      toStage: rows.priorApprovalTransition.toStage,
    }
    : null,
  sourceExclusionSafety: {
    transitionId: rows.sourceExclusionTransition?.id ?? null,
    transitionRequestHash: rows.sourceExclusionTransition?.requestHash ?? null,
    transitionResultHash: rows.sourceExclusionTransition?.resultHash ?? null,
    bindingValid: rows.sourceExclusionBindingValid,
    executionReady: rows.sourceExclusionExecutionReady,
    evidenceValid: rows.sourceExclusionEvidenceValid,
    adapterAvailable: rows.sourceExclusionAdapterAvailable,
    humanAdapterAvailable: rows.reviewerHumanAdapterAvailable,
  },
  otherActiveClaimIds: [...rows.otherActiveClaimIds].sort(),
});

const reviewerEffectRecoveryReportHash = (
  request: AffiliateAgentReviewerEffectRecoveryRequest,
  rows: ReviewerEffectRecoveryRows,
  eligible: boolean,
  reasonCodes: readonly string[],
  transitionAlreadyRecorded: boolean,
): string => hashAffiliateAgentValue(
  recoveryFingerprint(
    request,
    rows,
    eligible,
    reasonCodes,
    transitionAlreadyRecorded,
  ),
);

const parseRecoveryTransition = (
  value: ReviewerEffectRecoveryTransition | null,
): ReviewerEffectRecoveryTransition | null => (
  value && typeof value.id === "string" ? value : null
);

const loadReviewerEffectRecoveryRows = async (
  dependencies: AffiliateAgentGatewayDependencies,
  transaction: Prisma.TransactionClient,
  request: AffiliateAgentReviewerEffectRecoveryRequest,
): Promise<ReviewerEffectRecoveryRows> => {
  const receipt =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: request.receiptId },
    });
  const [claim, job] = await Promise.all([
    transaction.affiliateAgentGatewayClaims.findUnique({
      where: { id: request.claimId },
    }),
    transaction.affiliateAgentGatewayJobs.findUnique({
      where: { id: request.jobId },
    }),
  ]);
  const envelope = parseRecoveryEnvelope(claim);
  const effectState = parseRecoveryEffectState(receipt);
  const reviewerResult =
    effectState?.kind === "PENDING" || effectState?.kind === "SUCCEEDED"
      ? effectState.result
      : null;
  const producerContext =
    envelope?.subject.type === "SUPPLY_REVIEWER"
      || envelope?.subject.type === "SOURCE_EXCLUSION_REVIEW"
      ? await loadProducerReviewContext(
        transaction,
        envelope.subject.producerClaimId,
      )
      : null;
  let sourceRead: AffiliateSupplySourceReadAssessment | null = null;
  try {
    sourceRead = await readAffiliateSupplySourceAssessment({
      supplySourceId: request.supplySourceId,
      db: affiliateSupplyDatabase(transaction),
      now: dependencies.clock.now(),
    });
  } catch {
    sourceRead = null;
  }
  let activeBundle: AffiliateAgentContractBundle | null = null;
  try {
    activeBundle = parseSupportedContractBundle(
      await dependencies.contracts.loadActiveBundle(),
    );
  } catch {
    activeBundle = null;
  }
  let currentCatalogHash: string | null = null;
  try {
    currentCatalogHash = (
      await loadAffiliateSportsCatalogSnapshot(transaction)
    ).sha256;
  } catch {
    currentCatalogHash = null;
  }
  const priorApprovalTransitionRaw = await transaction
    .affiliateSupplyLifecycleTransitions.findFirst({
      where: {
        supplySourceId: request.supplySourceId,
        commandRef: request.receiptId,
      },
      orderBy: { generation: "desc" },
    });
  const priorApprovalTransition = parseRecoveryTransition(
    priorApprovalTransitionRaw as ReviewerEffectRecoveryTransition | null,
  );
  const sourceExclusionClaim =
    envelope?.subject.type === "SOURCE_EXCLUSION_REVIEW"
      ? envelope
      : null;
  const sourceExclusionTransition = sourceExclusionClaim
    ? priorApprovalTransition
    : null;
  const sourceExclusionTransitionAlreadyRecorded = sourceExclusionClaim !== null
    && sourceExclusionTransitionFor(
      sourceExclusionTransition,
      request.receiptId,
      claim,
      reviewerResult,
      sourceRead,
    );
  let sourceExclusionBindingValid = sourceExclusionClaim === null;
  if (sourceExclusionClaim && job) {
    try {
      await assertAffiliateSourceExclusionClaimBinding({
        prisma: transaction,
        job,
        claim: sourceExclusionClaim,
      });
      sourceExclusionBindingValid = true;
    } catch (error) {
      if (!(error instanceof AffiliateSourceExclusionAdmissionError)) throw error;
    }
  }
  let sourceExclusionExecutionReady = sourceExclusionClaim === null;
  if (
    sourceExclusionClaim
    && sourceExclusionBindingValid
    && !sourceExclusionTransitionAlreadyRecorded
    && job
  ) {
    try {
      await assertAffiliateSourceExclusionExecutionReady({
        prisma: transaction,
        job,
        claim: sourceExclusionClaim,
      });
      sourceExclusionExecutionReady = true;
    } catch (error) {
      if (!(error instanceof AffiliateSourceExclusionAdmissionError)) throw error;
    }
  }
  let sourceExclusionEvidenceValid = !(
    sourceExclusionClaim
    && reviewerResult?.disposition === "SOURCE_EXCLUSION_ASSESSED"
    && reviewerResult.payload.recommendation === "EXCLUDE"
  );
  if (
    sourceExclusionClaim
    && sourceExclusionBindingValid
    && !sourceExclusionTransitionAlreadyRecorded
    && reviewerResult?.disposition === "SOURCE_EXCLUSION_ASSESSED"
    && reviewerResult.payload.recommendation === "EXCLUDE"
  ) {
    try {
      await verifyAffiliateAgentSourceExclusionAssessment({
        prisma: transaction,
        artifacts: dependencies.artifacts,
        claim: sourceExclusionClaim,
        result: reviewerResult,
      });
      sourceExclusionEvidenceValid = true;
    } catch {
      sourceExclusionEvidenceValid = false;
    }
  }
  const sourceJobs = await transaction.affiliateAgentGatewayJobs.findMany({
    where: { supplySourceId: request.supplySourceId },
    select: { id: true, status: true, activeClaimId: true },
  });
  const sourceJobIds = sourceJobs.map((sourceJob) => sourceJob.id);
  const activeClaims = sourceJobIds.length === 0
    ? []
    : await transaction.affiliateAgentGatewayClaims.findMany({
      where: {
        jobId: { in: sourceJobIds },
        status: "ACTIVE",
      },
      select: { id: true },
    });
  const otherActiveClaimIds = activeClaims
    .map((activeClaim) => activeClaim.id)
    .filter((id) => id !== request.claimId);
  const activeSourceJobIds = sourceJobs
    .filter((sourceJob) => (
      sourceJob.activeClaimId !== null
      && (
        sourceJob.id !== request.jobId
        || sourceJob.activeClaimId !== request.claimId
      )
    ))
    .map((sourceJob) => sourceJob.id);
  return {
    receipt,
    claim,
    job,
    envelope,
    effectState,
    reviewerResult,
    producerContext,
    sourceRead,
    activeBundle,
    currentCatalogHash,
    priorApprovalTransition,
    sourceExclusionTransition,
    sourceExclusionBindingValid,
    sourceExclusionExecutionReady,
    sourceExclusionEvidenceValid,
    otherActiveClaimIds: [
      ...otherActiveClaimIds,
      ...activeSourceJobIds.map((id) => `job:${id}`),
    ],
    approvedAdapterAvailable: Boolean(

      dependencies.terminalEffects?.APPROVED
      && typeof dependencies.terminalEffects.APPROVED.recover === "function",
    ),
    sourceExclusionAdapterAvailable: Boolean(
      dependencies.terminalEffects?.SOURCE_EXCLUSION_ASSESSED
      && typeof dependencies.terminalEffects.SOURCE_EXCLUSION_ASSESSED.recover === "function",
    ),
    reviewerHumanAdapterAvailable: Boolean(
      dependencies.terminalEffects?.HUMAN_REVIEW_REQUIRED
      && typeof dependencies.terminalEffects.HUMAN_REVIEW_REQUIRED.recover === "function",
    ),
};
};
const evaluateSourceExclusionEffectRecovery = (
  request: AffiliateAgentReviewerEffectRecoveryRequest,
  rows: ReviewerEffectRecoveryRows,
): ReviewerEffectRecoveryEvaluation => {
  const reasonCodes: string[] = [];
  const {
    receipt,
    claim,
    job,
    envelope,
    effectState,
    reviewerResult,
  } = rows;
  const source = rows.sourceRead?.snapshot.source ?? null;
  const sourceSubject = envelope?.subject.type === "SOURCE_EXCLUSION_REVIEW"
    ? envelope.subject
    : null;
  const transitionAlreadyRecorded = sourceExclusionTransitionFor(
    rows.sourceExclusionTransition,
    request.receiptId,
    claim,
    reviewerResult,
    rows.sourceRead,
  );
  const sourceAssessmentResult = (
    reviewerResult?.disposition === "SOURCE_EXCLUSION_ASSESSED"
      ? reviewerResult
      : null
  );
  const isSourceAssessment = sourceAssessmentResult !== null;
  const isSourceExclusion = sourceAssessmentResult?.payload.recommendation === "EXCLUDE";
  const sourceIdentityValid = Boolean(
    rows.sourceRead
    && source
    && rows.sourceRead.rootId === request.supplySourceId
    && rows.sourceRead.snapshot.supplySourceId === request.supplySourceId
    && rows.sourceRead.rootLiveSourceId === source.id
    && rows.sourceRead.persistedLiveSource?.id === source.id
    && rows.sourceRead.persistedLiveSource.supplySourceId === request.supplySourceId,
  );
  const producerProofValid = (
    sourceSubject !== null
    && job !== null
    && rows.producerContext !== null
    && isSourceExclusionProducerClaimValid(
      rows.producerContext,
      sourceSubject,
      job,
    )
  );
  if (
    !receipt
    || receipt.claimId !== request.claimId
    || receipt.jobId !== request.jobId
    || receipt.claimGeneration !== claim?.claimGeneration
  ) {
    reasonCodes.push("RECEIPT_IDENTITY_MISMATCH");
  }
  if (
    !claim
    || claim.id !== request.claimId
    || claim.jobId !== request.jobId
    || !envelope
    || envelope.claimId !== request.claimId
    || envelope.jobId !== request.jobId
    || envelope.supplySourceId !== request.supplySourceId
    || envelope.role !== "SUPPLY_REVIEWER"
    || envelope.subject.type !== "SOURCE_EXCLUSION_REVIEW"
    || claim.role !== "SUPPLY_REVIEWER"
    || claim.status !== "RECONCILIATION_REQUIRED"
    || claim.tokenInvalidatedAt === null
  ) {
    reasonCodes.push("CLAIM_NOT_QUARANTINED");
  }
  if (
    !job
    || job.id !== request.jobId
    || job.supplySourceId !== request.supplySourceId
    || job.role !== "SUPPLY_REVIEWER"
    || job.subjectType !== "SOURCE_EXCLUSION_REVIEW"
    || job.status !== "RECONCILIATION_REQUIRED"
    || job.activeClaimId !== request.claimId
    || job.claimGeneration !== claim?.claimGeneration
  ) {
    reasonCodes.push("JOB_NOT_QUARANTINED");
  }
  if (
    !receipt
    || receipt.status !== "UNKNOWN"
    || receipt.safeErrorCode !== "PARTIAL_COMMAND_UNRESOLVED"
    || receipt.responseHash !== null
  ) {
    reasonCodes.push("RECEIPT_NOT_UNKNOWN_PARTIAL");
  }
  if (
    !receipt
    || receipt.operationKind !== AFFILIATE_AGENT_TERMINAL_EFFECT_OPERATION
    || receipt.commandName !== AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND
    || receipt.idempotencyKey !== reviewerTerminalEffectIdempotencyKey()
  ) {
    reasonCodes.push("NOT_REVIEWER_TERMINAL_EFFECT");
  }
  if (!envelope || !claim || hashAffiliateAgentValue(envelope) !== claim.claimEnvelopeHash) {
    reasonCodes.push("CLAIM_ENVELOPE_INVALID");
  }
  if (
    !effectState
    || effectState.kind !== "PENDING"
    || !reviewerResult
    || !isRecoverySha256(effectState.terminalRequestHash)
    || effectState.terminalIdempotencyKey.trim().length === 0
  ) {
    reasonCodes.push("RETAINED_RESULT_INVALID");
  }
  if (
    !receipt
    || !claim
    || !reviewerResult
    || receipt.requestHash !== reviewerTerminalEffectRequestHash(claim, reviewerResult)
  ) {
    reasonCodes.push("EFFECT_REQUEST_HASH_INVALID");
  }
  if (
    !claim
    || !envelope
    || !job
    || !matchesReviewerClaimEnvelopeIdentity(claim, envelope, job)
    || !reviewerResult
    || reviewerResult.role !== "SUPPLY_REVIEWER"
    || reviewerResult.jobId !== claim.jobId
    || reviewerResult.claimId !== claim.id
    || reviewerResult.claimGeneration !== claim.claimGeneration
    || reviewerResult.lifecycleGeneration !== claim.lifecycleGeneration
    || reviewerResult.workerId !== claim.workerId
    || reviewerResult.invocationId !== claim.invocationId
    || reviewerResult.deploymentContractVersion !== claim.deploymentContractVersion
    || reviewerResult.deploymentContractHash !== claim.deploymentContractHash
    || reviewerResult.roleContractVersion !== claim.roleContractVersion
    || reviewerResult.roleContractHash !== claim.roleContractHash
    || reviewerResult.promptTemplateVersion !== claim.promptTemplateVersion
    || reviewerResult.promptTemplateHash !== claim.promptTemplateHash
    || reviewerResult.supplyContractVersion !== claim.supplyContractVersion
    || reviewerResult.supplyContractHash !== claim.supplyContractHash
    || (
      reviewerResult.disposition !== "SOURCE_EXCLUSION_ASSESSED"
      && reviewerResult.disposition !== "HUMAN_REVIEW_REQUIRED"
    )
  ) {
    reasonCodes.push("REVIEWER_RESULT_IDENTITY_INVALID");
  }
  if (
    !envelope
    || !reviewerResult
    || !reviewerResultTargetsEnvelope(envelope, reviewerResult)
  ) {
    reasonCodes.push("EVIDENCE_REFERENCE_INVALID");
  }
  if (
    !sourceSubject
    || !sourceIdentityValid
    || !rows.sourceExclusionBindingValid
  ) {
    reasonCodes.push("SOURCE_EVIDENCE_STALE");
  }
  if (
    !producerProofValid
    || !claim
    || claim.lifecycleGeneration === null
    || claim.lifecycleGeneration === undefined
  ) {
    reasonCodes.push("PRODUCER_PROOF_INVALID");
  }
  if (sourceAssessmentResult && sourceAssessmentResult.evidenceRefs.length === 0) {
    reasonCodes.push("EVIDENCE_REFERENCE_INVALID");
  }
  if (isSourceExclusion && !transitionAlreadyRecorded) {
    if (!rows.sourceExclusionExecutionReady) {
      reasonCodes.push("SOURCE_EVIDENCE_STALE");
    }
    if (!rows.sourceExclusionEvidenceValid) {
      reasonCodes.push("EVIDENCE_REFERENCE_INVALID");
    }
    if (!rows.currentCatalogHash) {
      reasonCodes.push("SPORTS_CATALOG_STALE");
    }
  } else if (!isSourceExclusion && !rows.sourceExclusionExecutionReady) {
    reasonCodes.push("SOURCE_EVIDENCE_STALE");
  }
  if (
    !transitionAlreadyRecorded
    && (
      !rows.activeBundle
      || !claim
      || rows.activeBundle.supplyContract.version !== claim.supplyContractVersion
      || rows.activeBundle.supplyContract.hash !== claim.supplyContractHash
      || !rows.sourceRead
      || rows.sourceRead.contract.version !== claim.supplyContractVersion
      || rows.sourceRead.contract.hash !== claim.supplyContractHash
    )
  ) {
    reasonCodes.push("SUPPLY_CONTRACT_STALE");
  }
  if (
    rows.priorApprovalTransition
    && !transitionAlreadyRecorded
  ) {
    reasonCodes.push("AMBIGUOUS_PRIOR_EFFECT");
  }
  if (rows.otherActiveClaimIds.length > 0) {
    reasonCodes.push("OTHER_ACTIVE_CLAIM");
  }
  if (!transitionAlreadyRecorded && !rows.activeBundle) {
    reasonCodes.push("ACTIVE_CONTRACT_UNAVAILABLE");
  }
  if (
    reviewerResult?.disposition === "SOURCE_EXCLUSION_ASSESSED"
    && !rows.sourceExclusionAdapterAvailable
  ) {
    reasonCodes.push("SOURCE_EXCLUSION_ADAPTER_UNAVAILABLE");
  }
  if (
    reviewerResult?.disposition === "HUMAN_REVIEW_REQUIRED"
    && !rows.reviewerHumanAdapterAvailable
  ) {
    reasonCodes.push("HUMAN_REVIEW_ADAPTER_UNAVAILABLE");
  }
  const uniqueReasonCodes = Array.from(new Set(reasonCodes)).sort();
  const eligible = uniqueReasonCodes.length === 0;
  const finalReasonCodes = eligible
    ? transitionAlreadyRecorded
      ? ["ELIGIBLE", "LIFECYCLE_ALREADY_RECORDED"]
      : ["ELIGIBLE"]
    : uniqueReasonCodes;
  return {
    eligible,
    reasonCodes: finalReasonCodes,
    reportHash: reviewerEffectRecoveryReportHash(
      request,
      rows,
      eligible,
      finalReasonCodes,
      transitionAlreadyRecorded,
    ),
    transitionAlreadyRecorded,
  };
};

const evaluateReviewerEffectRecovery = (
  request: AffiliateAgentReviewerEffectRecoveryRequest,
  rows: ReviewerEffectRecoveryRows,
): ReviewerEffectRecoveryEvaluation => {
  if (rows.envelope?.subject.type === "SOURCE_EXCLUSION_REVIEW") {
    return evaluateSourceExclusionEffectRecovery(request, rows);
  }
  const reasonCodes: string[] = [];
  const { receipt, claim, job, envelope, effectState, reviewerResult } = rows;
  const source = rows.sourceRead?.snapshot.source ?? null;
  const mapping = rows.sourceRead?.snapshot.mapping ?? null;
  const rootAutomationReview = rows.sourceRead?.rootAutomationReviewRequired ?? null;
  const sourceAutomationReview = rows.sourceRead?.sourceAutomationReviewRequired ?? null;
  const rootHasLegacyRepairHold =
    rootAutomationReview?.hold === true
    && rootAutomationReview.reason === "LEGACY_SPORT_REPAIR";
  const sourceMetadataHasLegacyRepairHold =
    sourceAutomationReview?.hold === true
    && sourceAutomationReview.reason === "LEGACY_SPORT_REPAIR";
  const sourceHasLegacyRepairHold =
    rootHasLegacyRepairHold || sourceMetadataHasLegacyRepairHold;
  const hasNonLegacyAutomationHold = Boolean(
    (rootAutomationReview?.hold === true && !rootHasLegacyRepairHold)
    || (sourceAutomationReview?.hold === true && !sourceMetadataHasLegacyRepairHold)
  );
  const reviewerProducerIdentityReused = Boolean(
    claim
    && rows.producerContext?.producerClaim
    && (
      claim.workerId === rows.producerContext.producerClaim.workerId
      || claim.invocationId === rows.producerContext.producerClaim.invocationId
      || claim.workspaceId === rows.producerContext.producerClaim.workspaceId
    )
  );
  const sourceMappingBound = Boolean(
    source
    && mapping
    && rows.sourceRead
    && rows.sourceRead.rootId === request.supplySourceId
    && rows.sourceRead.rootLiveSourceId !== null
    && rows.sourceRead.persistedLiveSource !== null
    && rows.sourceRead.rootLiveSourceId === rows.sourceRead.persistedLiveSource.id
    && rows.sourceRead.persistedLiveSource.id === source.id
    && rows.sourceRead.persistedLiveSource.supplySourceId === rows.sourceRead.rootId
    && rows.sourceRead.persistedLiveSource.activeMappingId === mapping.id
    && source.activeMappingId === mapping.id
    && mapping.isSchemaValid === true
    && mapping.isActive === false,
  );
  const transitionAlreadyRecorded = recoveryTransitionFor(
    rows.priorApprovalTransition,
    request.receiptId,
    claim,
    reviewerResult,
    rows.sourceRead,
  );
  const sourceStageAllowsRecovery = Boolean(
    rows.sourceRead
    && (
      rows.sourceRead.assessment.stage === "MAPPED"
      || (
        rows.sourceRead.assessment.stage === "APPROVED"
        && transitionAlreadyRecorded
      )
    ),
  );
  const sourceLifecycleGenerationAllowsRecovery = Boolean(
    rows.sourceRead
    && claim
    && (
      rows.sourceRead.assessment.lifecycleGeneration === claim.lifecycleGeneration
      || (
        transitionAlreadyRecorded
        && rows.sourceRead.assessment.stage === "APPROVED"
        && rows.priorApprovalTransition !== null
        && rows.sourceRead.assessment.lifecycleGeneration
          === rows.priorApprovalTransition.generation
      )
    )
  );
  if (
    !receipt
    || receipt.claimId !== request.claimId
    || receipt.jobId !== request.jobId
    || receipt.claimGeneration !== claim?.claimGeneration
  ) {
    reasonCodes.push("RECEIPT_IDENTITY_MISMATCH");
  }
  if (
    !claim
    || claim.id !== request.claimId
    || claim.jobId !== request.jobId
    || !envelope
    || envelope.claimId !== request.claimId
    || envelope.jobId !== request.jobId
    || envelope.supplySourceId !== request.supplySourceId
    || claim.role !== "SUPPLY_REVIEWER"
    || claim.status !== "RECONCILIATION_REQUIRED"
    || claim.tokenInvalidatedAt === null
  ) {
    reasonCodes.push("CLAIM_NOT_QUARANTINED");
  }
  if (
    !job
    || job.id !== request.jobId
    || job.supplySourceId !== request.supplySourceId
    || job.status !== "RECONCILIATION_REQUIRED"
    || job.activeClaimId !== request.claimId
    || job.claimGeneration !== claim?.claimGeneration
  ) {
    reasonCodes.push("JOB_NOT_QUARANTINED");
  }
  if (
    !receipt
    || receipt.status !== "UNKNOWN"
    || receipt.safeErrorCode !== "PARTIAL_COMMAND_UNRESOLVED"
    || receipt.responseHash !== null
  ) {
    reasonCodes.push("RECEIPT_NOT_UNKNOWN_PARTIAL");
  }
  if (
    !receipt
    || receipt.operationKind !== AFFILIATE_AGENT_TERMINAL_EFFECT_OPERATION
    || receipt.commandName !== AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND
    || receipt.idempotencyKey !== reviewerTerminalEffectIdempotencyKey()
  ) {
    reasonCodes.push("NOT_REVIEWER_TERMINAL_EFFECT");
  }
  if (!envelope || !claim || hashAffiliateAgentValue(envelope) !== claim.claimEnvelopeHash) {
    reasonCodes.push("CLAIM_ENVELOPE_INVALID");
  }
  if (
    !effectState
    || effectState.kind !== "PENDING"
    || !reviewerResult
    || !isRecoverySha256(effectState.terminalRequestHash)
    || effectState.terminalIdempotencyKey.trim().length === 0
  ) {
    reasonCodes.push("RETAINED_RESULT_INVALID");
  }
  if (
    !receipt
    || !claim
    || !reviewerResult
    || receipt.requestHash !== reviewerTerminalEffectRequestHash(claim, reviewerResult)
  ) {
    reasonCodes.push("EFFECT_REQUEST_HASH_INVALID");
  }
  if (
    !claim
    || !envelope
    || !job
    || !matchesReviewerClaimEnvelopeIdentity(claim, envelope, job)
    || !reviewerResult
    || reviewerResult.jobId !== claim.jobId
    || reviewerResult.claimId !== claim.id
    || reviewerResult.claimGeneration !== claim.claimGeneration
    || reviewerResult.lifecycleGeneration !== claim.lifecycleGeneration
    || reviewerResult.workerId !== claim.workerId
    || reviewerResult.invocationId !== claim.invocationId
    || reviewerResult.deploymentContractVersion !== claim.deploymentContractVersion
    || reviewerResult.deploymentContractHash !== claim.deploymentContractHash
    || reviewerResult.roleContractVersion !== claim.roleContractVersion
    || reviewerResult.roleContractHash !== claim.roleContractHash
    || reviewerResult.promptTemplateVersion !== claim.promptTemplateVersion
    || reviewerResult.promptTemplateHash !== claim.promptTemplateHash
    || reviewerResult.supplyContractVersion !== claim.supplyContractVersion
    || reviewerResult.supplyContractHash !== claim.supplyContractHash
    || reviewerResult.disposition !== "APPROVED"
  ) {
    reasonCodes.push("REVIEWER_RESULT_IDENTITY_INVALID");
  }
  if (
    !envelope
    || !reviewerResult
    || !reviewerResultTargetsEnvelope(envelope, reviewerResult)
  ) {
    reasonCodes.push("EVIDENCE_REFERENCE_INVALID");
  }
  if (
    !envelope
    || envelope.supplySourceId !== request.supplySourceId
    || envelope.subject.type !== "SUPPLY_REVIEWER"
    || envelope.subject.supplySourceId !== request.supplySourceId
    || envelope.subject.repairContext?.kind !== "LEGACY_SPORT_REPAIR"
    || !reviewerResult
    || recoveryCommittedPackageHash(reviewerResult)
      !== envelope.subject.committedPackageHash
  ) {
    reasonCodes.push("LEGACY_APPROVAL_SCOPE_INVALID");
  }
  if (
    rows.producerContext === null
    || !envelope
    || envelope.subject.type !== "SUPPLY_REVIEWER"
    || !job
    || !isProducerClaimValid(
      rows.producerContext,
      envelope.subject,
      job,
    )
  ) {
    reasonCodes.push("PRODUCER_PROOF_INVALID");
  }
  if (reviewerProducerIdentityReused) {
    reasonCodes.push("PRODUCER_REVIEWER_IDENTITY_REUSED");
  }
  if (
    !rows.sourceRead
    || rows.sourceRead.snapshot.supplySourceId !== request.supplySourceId
    || !reviewerResult
    || recoveryCommittedPackageHash(reviewerResult) !== mapping?.packageHash
    || !sourceMappingBound
  ) {
    reasonCodes.push("PACKAGE_OR_SOURCE_DRIFT");
  }
  if (
    !rows.sourceRead
    || !claim
    || !sourceLifecycleGenerationAllowsRecovery
    || rows.sourceRead.snapshot.source.activeSupplyContractVersion
      !== rows.sourceRead.contract.version
    || rows.sourceRead.snapshot.source.activeSupplyContractHash
      !== rows.sourceRead.contract.hash
    || rows.sourceRead.assessment.invariantViolations.length > 0
    || !sourceHasLegacyRepairHold
    || rows.sourceRead.rootAutomationHoldReason !== "LEGACY_SPORT_REPAIR"
    || hasNonLegacyAutomationHold
    || source?.isAutomationEnabled === true
    || source?.autoScrapeEnabled === true
    || source?.isExcluded === true
    || source?.status?.toUpperCase() === "HUMAN_REVIEW_REQUIRED"
    || source?.status?.toUpperCase() === "EXCLUDED"
  ) {
    reasonCodes.push("SOURCE_EVIDENCE_STALE");
  }
  if (
    !rows.sourceRead
    || !rows.activeBundle
    || !claim
    || rows.activeBundle.supplyContract.version !== claim.supplyContractVersion
    || rows.activeBundle.supplyContract.hash !== claim.supplyContractHash
    || rows.sourceRead.contract.version !== claim.supplyContractVersion
    || rows.sourceRead.contract.hash !== claim.supplyContractHash
  ) {
    reasonCodes.push("SUPPLY_CONTRACT_STALE");
  }
  if (
    !rows.currentCatalogHash
    || !envelope
    || envelope.subject.type !== "SUPPLY_REVIEWER"
    || envelope.subject.repairContext?.kind !== "LEGACY_SPORT_REPAIR"
    || rows.currentCatalogHash !== envelope.subject.repairContext.sportsCatalog.sha256
  ) {
    reasonCodes.push("SPORTS_CATALOG_STALE");
  }
  if (!sourceStageAllowsRecovery || !reviewerResult) {
    reasonCodes.push("APPROVAL_PRECONDITION_FAILED");
  }
  if (
    rows.sourceRead
    && reviewerResult
    && claim
    && rows.sourceRead.assessment.stage === "MAPPED"
    && claim.lifecycleGeneration !== null
    && claim.lifecycleGeneration !== undefined
  ) {
    const decision = validateAffiliateSupplyCommand({
      command: "APPROVE",
      authority: "SUPPLY_REVIEWER",
      expectedLifecycleGeneration: claim.lifecycleGeneration ?? -1,
      currentLifecycleGeneration: rows.sourceRead.assessment.lifecycleGeneration,
      activeContractVersion: rows.sourceRead.contract.version,
      activeContractHash: rows.sourceRead.contract.hash,
      commandContractVersion: reviewerResult.supplyContractVersion,
      commandContractHash: reviewerResult.supplyContractHash,
      evidenceRefs: reviewerResult.evidenceRefs,
      reviewerOutcome: "APPROVED",
      assessment: rows.sourceRead.assessment,
    });
    if (!decision.isAccepted) reasonCodes.push(...decision.reasonCodes);
  }
  if (rows.priorApprovalTransition && !transitionAlreadyRecorded) {
    reasonCodes.push("AMBIGUOUS_PRIOR_EFFECT");
  }
  if (rows.otherActiveClaimIds.length > 0) {
    reasonCodes.push("OTHER_ACTIVE_CLAIM");
  }
  if (!rows.activeBundle) reasonCodes.push("ACTIVE_CONTRACT_UNAVAILABLE");
  if (!rows.approvedAdapterAvailable) {
    reasonCodes.push("APPROVED_ADAPTER_UNAVAILABLE");
  }
  const uniqueReasonCodes = Array.from(new Set(reasonCodes)).sort();
  const eligible = uniqueReasonCodes.length === 0;
  return {
    eligible,
    reasonCodes: eligible
      ? transitionAlreadyRecorded
        ? ["ELIGIBLE", "LIFECYCLE_ALREADY_RECORDED"]
        : ["ELIGIBLE"]
      : uniqueReasonCodes,
    reportHash: reviewerEffectRecoveryReportHash(
      request,
      rows,
      eligible,
      eligible
        ? transitionAlreadyRecorded
          ? ["ELIGIBLE", "LIFECYCLE_ALREADY_RECORDED"]
          : ["ELIGIBLE"]
        : uniqueReasonCodes,
      transitionAlreadyRecorded,
    ),
    transitionAlreadyRecorded,
  };
};


const recoveryEventPayload = (
  rows: ReviewerEffectRecoveryRows,
  request: AffiliateAgentReviewerEffectRecoveryRequest,
  operator: AffiliateAgentReviewerEffectRecoveryOperator,
  reportHash: string,
  attempt: number,
  phase: "AUTHORIZED" | "FAILED" | "COMPLETED",
  failureReasonCodes: readonly string[] = [],
): Record<string, unknown> => ({
  schemaVersion: 1,
  phase,
  attempt,
  operatorId: operator.operatorId,
  reason: request.reason,
  reportHash,
  receiptId: request.receiptId,
  jobId: request.jobId,
  claimId: request.claimId,
  supplySourceId: request.supplySourceId,
  failureReasonCodes: [...failureReasonCodes],
  priorStatusEvidence: {
    receiptStatus: rows.receipt?.status ?? null,
    receiptSafeErrorCode: rows.receipt?.safeErrorCode ?? null,
    receiptRequestHash: rows.receipt?.requestHash ?? null,
    receiptResponseHash: rows.receipt?.responseHash ?? null,
    receiptResponseSnapshot: rows.receipt?.responseJson ?? null,
    receiptResponseSnapshotHash: hashAffiliateAgentValue(
      rows.receipt?.responseJson ?? null,
    ),
    receiptStartedAt: rows.receipt?.startedAt?.toISOString() ?? null,
    receiptCompletedAt: rows.receipt?.completedAt?.toISOString() ?? null,
    receiptReconcileAfter: rows.receipt?.reconcileAfter?.toISOString() ?? null,
    claimStatus: rows.claim?.status ?? null,
    claimLeaseExpiresAt: rows.claim?.leaseExpiresAt?.toISOString() ?? null,
    claimHardDeadlineAt: rows.claim?.hardDeadlineAt?.toISOString() ?? null,
    claimTokenExpiresAt: rows.claim?.tokenExpiresAt?.toISOString() ?? null,
    claimTokenInvalidatedAt: rows.claim?.tokenInvalidatedAt?.toISOString() ?? null,
    claimSafeFailureCode: rows.claim?.safeFailureCode ?? null,
    claimSafeFailureSummary: rows.claim?.safeFailureSummary ?? null,
    jobStatus: rows.job?.status ?? null,
    jobActiveClaimId: rows.job?.activeClaimId ?? null,
    jobClaimGeneration: rows.job?.claimGeneration ?? null,
    envelopeHash: rows.claim?.claimEnvelopeHash ?? null,
    retainedResultHash: rows.reviewerResult
      ? hashAffiliateAgentValue(rows.reviewerResult)
      : null,
    retainedResultStateHash: hashAffiliateAgentValue(
      recoveryEffectStateFingerprint(rows.effectState),
    ),
  },
});

type ReviewerEffectRecoveryAuditEvent = Readonly<{
  id: string;
  eventKey: string;
  eventType: string;
  inputHash: string | null;
  payload: Prisma.JsonValue;
  createdAt: Date;
}>;

const recoveryAuditPayloadRecord = (
  event: ReviewerEffectRecoveryAuditEvent | null,
): Record<string, unknown> | null => (
  event && isGatewayRecord(event.payload) ? event.payload : null
);

const appendReviewerEffectRecoveryEvent = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  input: Readonly<{
    eventType: string;
    eventKey: string;
    requestHash: string | null;
    reportHash: string;
    jobId: string;
    claimId: string;
    receiptId: string;
    role: string;
    actorId: string;
    payload: Record<string, unknown>;
    reasonCodes?: readonly string[];
    outputHash?: string | null;
  }>,
): Promise<number> => {
  const existing = await transaction.affiliateAgentGatewayEvents.findUnique({
    where: { eventKey: input.eventKey },
  });
  if (existing) return 0;
  const job = await transaction.affiliateAgentGatewayJobs.findUnique({
    where: { id: input.jobId },
  });
  if (!job) {
    throw recoveryError(
      "REVIEWER_EFFECT_RECOVERY_STALE",
      "The reviewer recovery job no longer exists.",
      input.receiptId,
    );
  }
  const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany({
    where: {
      id: job.id,
      eventSequence: job.eventSequence,
    },
    data: { eventSequence: { increment: 1 } },
  });
  if (jobUpdated.count !== 1) throw new AffiliateAgentClaimRaceError();
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: input.eventKey,
      jobId: input.jobId,
      claimId: input.claimId,
      receiptId: input.receiptId,
      sequence: job.eventSequence + 1,
      eventType: input.eventType,
      actorKind: "OPERATOR_RECOVERY",
      actorId: input.actorId,
      role: input.role,
      requestHash: input.requestHash,
      inputHash: input.reportHash,
      outputHash: input.outputHash ?? null,
      reasonCodes: [...(input.reasonCodes ?? [])],
      payload: asPrismaJson(input.payload),
      retentionClass: "INDEFINITE",
    },
  });
  return 2;
};

const loadRecoveryAuditEvents = async (
  transaction: Prisma.TransactionClient,
  receiptId: string,
  reportHash?: string,
): Promise<{
  events: readonly ReviewerEffectRecoveryAuditEvent[];
  authorization: ReviewerEffectRecoveryAuditEvent | null;
  failed: ReviewerEffectRecoveryAuditEvent | null;
  completed: ReviewerEffectRecoveryAuditEvent | null;
}> => {
  const events = await transaction.affiliateAgentGatewayEvents.findMany({
    where: {
      receiptId,
      inputHash: reportHash,
      eventType: {
        in: [
          REVIEWER_EFFECT_RECOVERY_AUDIT_EVENT,
          REVIEWER_EFFECT_RECOVERY_FAILED_EVENT,
          REVIEWER_EFFECT_RECOVERY_COMPLETED_EVENT,
        ],
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  }) as ReviewerEffectRecoveryAuditEvent[];
  const authorization = events.find(
    (event) => event.eventType === REVIEWER_EFFECT_RECOVERY_AUDIT_EVENT,
  ) ?? null;
  const failed = events.find(
    (event) => event.eventType === REVIEWER_EFFECT_RECOVERY_FAILED_EVENT,
  ) ?? null;
  const completed = events.find(
    (event) => event.eventType === REVIEWER_EFFECT_RECOVERY_COMPLETED_EVENT,
  ) ?? null;
  return {
    events,
    authorization,
    failed,
    completed,
  };
};
const recoveryAuditSummaryFor = (
  events: readonly ReviewerEffectRecoveryAuditEvent[],
  reportHash?: string,
): {
  events: readonly ReviewerEffectRecoveryAuditEvent[];
  authorization: ReviewerEffectRecoveryAuditEvent | null;
  failed: ReviewerEffectRecoveryAuditEvent | null;
  completed: ReviewerEffectRecoveryAuditEvent | null;
} => {
  const filtered = reportHash === undefined
    ? events
    : events.filter((event) => event.inputHash === reportHash);
  return {
    events: filtered,
    authorization: filtered.find(
      (event) => event.eventType === REVIEWER_EFFECT_RECOVERY_AUDIT_EVENT,
    ) ?? null,
    failed: filtered.find(
      (event) => event.eventType === REVIEWER_EFFECT_RECOVERY_FAILED_EVENT,
    ) ?? null,
    completed: filtered.find(
      (event) => event.eventType === REVIEWER_EFFECT_RECOVERY_COMPLETED_EVENT,
    ) ?? null,
  };
};

const recoveryReport = (
  request: AffiliateAgentReviewerEffectRecoveryRequest,
  rows: ReviewerEffectRecoveryRows,
  reportHash: string,
  outcome: AffiliateAgentReviewerEffectRecoveryOutcome,
  replayed: boolean,
  writeCount: number,
  evaluation?: ReviewerEffectRecoveryEvaluation,
): AffiliateAgentReviewerEffectRecoveryReport => ({
  schemaVersion: 1,
  mode: request.mode,
  eligible: outcome === "PREVIEW"
    ? evaluation?.eligible ?? true
    : outcome === "COMPLETED" || outcome === "REPLAYED",
  reasonCodes: outcome === "PREVIEW"
    ? evaluation?.reasonCodes ?? ["ELIGIBLE"]
    : outcome === "RECONCILIATION_REQUIRED"
      ? ["RECOVERY_FAILED", "RECONCILIATION_REQUIRED"]
      : ["ELIGIBLE"],
  reportHash,
  receiptId: request.receiptId,
  jobId: request.jobId,
  claimId: request.claimId,
  supplySourceId: request.supplySourceId,
  currentState: reviewerEffectRecoveryCurrentState(rows),
  outcome,
  replayed,
  writeCount,
});

type ReviewerEffectRecoveryReservation =
  | Readonly<{
    kind: "RESERVED";
    rows: ReviewerEffectRecoveryRows;
    evaluation: ReviewerEffectRecoveryEvaluation;
    reportHash: string;
    attempt: number;
    eventKey: string;
    writeCount: number;
  }>
  | Readonly<{
    kind: "RESUME";
    rows: ReviewerEffectRecoveryRows;
    reportHash: string;
  }>
  | Readonly<{
    kind: "REPLAY";
    rows: ReviewerEffectRecoveryRows;
    reportHash: string;
    outcome: "COMPLETED" | "RECONCILIATION_REQUIRED";
  }>;

const recoveryLeaseExpiresAt = (
  dependencies: AffiliateAgentGatewayDependencies,
): Date => addSeconds(
  dependencies.clock.now(),
  REVIEWER_EFFECT_RECOVERY_LEASE_SECONDS,
);

const recoveryAttemptFor = (
  events: readonly ReviewerEffectRecoveryAuditEvent[],
): number => events.reduce((highest, event) => {
  const payload = recoveryAuditPayloadRecord(event);
  const attempt = payload?.attempt;
  return typeof attempt === "number" && Number.isInteger(attempt)
    ? Math.max(highest, attempt)
    : highest;
}, 0);

const reserveReviewerEffectRecovery = async (
  dependencies: AffiliateAgentGatewayDependencies,
  request: AffiliateAgentReviewerEffectRecoveryRequest,
  operator: AffiliateAgentReviewerEffectRecoveryOperator,
  expectedReportHash: string,
): Promise<ReviewerEffectRecoveryReservation> => runSerializableEffectTransaction(
  dependencies,
  async (transaction) => {
    const rows = await loadReviewerEffectRecoveryRows(
      dependencies,
      transaction,
      request,
    );
    const auditHistory = await loadRecoveryAuditEvents(
      transaction,
      request.receiptId,
    );
    const audits = recoveryAuditSummaryFor(
      auditHistory.events,
      expectedReportHash,
    );
    if (audits.completed) {
      const payload = recoveryAuditPayloadRecord(audits.completed);
      const outcome = payload?.outcome === "RECONCILIATION_REQUIRED"
        ? "RECONCILIATION_REQUIRED"
        : "COMPLETED";
      return {
        kind: "REPLAY",
        rows,
        reportHash: expectedReportHash,
        outcome,
      };
    }
    if (
      audits.authorization
      && rows.receipt?.status === "SUCCEEDED"
      && rows.effectState?.kind === "SUCCEEDED"
      && rows.receipt.responseHash === hashAffiliateAgentValue(rows.effectState)
    ) {
      return {
        kind: "RESUME",
        rows,
        reportHash: expectedReportHash,
      };
    }
    const auditEvents = auditHistory.events;
    const latestAudit = auditEvents[0] ?? null;
    const latestPayload = recoveryAuditPayloadRecord(latestAudit);
    if (
      latestAudit?.eventType === REVIEWER_EFFECT_RECOVERY_AUDIT_EVENT
      && typeof latestPayload?.leaseExpiresAt === "string"
      && new Date(latestPayload.leaseExpiresAt) > dependencies.clock.now()
    ) {
      throw recoveryError(
        "REVIEWER_EFFECT_RECOVERY_IN_PROGRESS",
        "Another reviewer recovery is in progress.",
        request.receiptId,
      );
    }
    const evaluation = evaluateReviewerEffectRecovery(request, rows);
    if (!evaluation.eligible) {
      throw recoveryError(
        "REVIEWER_EFFECT_RECOVERY_NOT_ELIGIBLE",
        "The reviewer effect is not eligible for guarded recovery.",
        request.receiptId,
      );
    }
    if (evaluation.reportHash !== expectedReportHash) {
      throw recoveryError(
        "REVIEWER_EFFECT_RECOVERY_STALE",
        "The reviewer recovery preview is stale.",
        request.receiptId,
      );
    }
    const attempt = recoveryAttemptFor(auditEvents) + 1;
    const eventKey = [
      "reviewer-effect-recovery:authorized",
      request.receiptId,
      expectedReportHash,
      String(attempt),
    ].join(":");
    const payload = {
      ...recoveryEventPayload(
        rows,
        request,
        operator,
        expectedReportHash,
        attempt,
        "AUTHORIZED",
      ),
      leaseExpiresAt: recoveryLeaseExpiresAt(dependencies).toISOString(),
    };
    const writeCount = await appendReviewerEffectRecoveryEvent(
      transaction,
      dependencies,
      {
        eventType: REVIEWER_EFFECT_RECOVERY_AUDIT_EVENT,
        eventKey,
        requestHash: rows.receipt?.requestHash ?? null,
        reportHash: expectedReportHash,
        jobId: request.jobId,
        claimId: request.claimId,
        receiptId: request.receiptId,
        role: "SUPPLY_REVIEWER",
        actorId: operator.operatorId,
        payload,
        reasonCodes: ["AUTHORIZED"],
      },
    );
    return {
      kind: "RESERVED",
      rows,
      evaluation,
      reportHash: expectedReportHash,
      attempt,
      eventKey,
      writeCount,
    };
  },
  {
    code: "REVIEWER_EFFECT_RECOVERY_STALE",
    safeMessage: "The reviewer recovery state changed during reservation.",
    receiptId: request.receiptId,
  },
);

const finalizeOperatorReviewerEffectTransaction = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  result: AffiliateAgentReviewerTerminalResult,
  safeOutput: Readonly<Record<string, unknown>>,
  operatorId: string,
): Promise<Readonly<{ outcome: "COMPLETED" | "REPLAYED"; writeCount: number }>> => {
  const current =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: receipt.id },
    });
  if (!current) {
    throw recoveryError(
      "REVIEWER_EFFECT_RECOVERY_STALE",
      "The reviewer effect receipt no longer exists.",
      receipt.id,
    );
  }
  if (current.status === "SUCCEEDED") return { outcome: "REPLAYED", writeCount: 0 };
  if (
    current.status !== "UNKNOWN"
    || current.requestHash !== receipt.requestHash
    || current.responseHash !== null
  ) {
    throw recoveryError(
      "REVIEWER_EFFECT_RECOVERY_STALE",
      "The reviewer effect receipt changed during recovery.",
      receipt.id,
    );
  }
  const [claim, job] = await Promise.all([
    transaction.affiliateAgentGatewayClaims.findUnique({
      where: { id: current.claimId },
    }),
    transaction.affiliateAgentGatewayJobs.findUnique({
      where: { id: current.jobId },
    }),
  ]);
  if (
    !claim
    || !job
    || claim.status !== "RECONCILIATION_REQUIRED"
    || job.status !== "RECONCILIATION_REQUIRED"
    || job.activeClaimId !== claim.id
    || claim.tokenInvalidatedAt === null
    || claim.claimGeneration !== current.claimGeneration
  ) {
    throw recoveryError(
      "REVIEWER_EFFECT_RECOVERY_STALE",
      "The reviewer quarantine changed during recovery.",
      receipt.id,
    );
  }
  const pendingState = parseReviewerTerminalEffectState(
    current.responseJson,
    current.id,
  );
  if (
    pendingState.kind !== "PENDING"
    || hashAffiliateAgentValue(pendingState.result) !== hashAffiliateAgentValue(result)
  ) {
    throw recoveryError(
      "REVIEWER_EFFECT_RECOVERY_STALE",
      "The retained reviewer result changed during recovery.",
      receipt.id,
    );
  }
  const finalState: SucceededReviewerTerminalEffectState = {
    kind: "SUCCEEDED",
    result,
    resultHash: hashAffiliateAgentValue(result),
    safeOutput,
    terminalIdempotencyKey: pendingState.terminalIdempotencyKey,
    terminalRequestHash: pendingState.terminalRequestHash,
    ...(pendingState.failureDiagnostics === undefined
      ? {}
      : { failureDiagnostics: pendingState.failureDiagnostics }),
  };
  const responseHash = hashAffiliateAgentValue(finalState);
  const completedAt = dependencies.clock.now();
  const receiptUpdated =
    await transaction.affiliateAgentGatewayOperationReceipts.updateMany({
      where: {
        id: current.id,
        status: "UNKNOWN",
        requestHash: current.requestHash,
        responseHash: null,
      },
      data: {
        status: "SUCCEEDED",
        responseHash,
        responseJson: asPrismaJson(finalState),
        completedAt,
        reconcileAfter: null,
      },
    });
  const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany({
    where: {
      id: job.id,
      status: "RECONCILIATION_REQUIRED",
      activeClaimId: claim.id,
      claimGeneration: claim.claimGeneration,
      eventSequence: job.eventSequence,
    },
    data: { eventSequence: { increment: 1 } },
  });
  if (receiptUpdated.count !== 1 || jobUpdated.count !== 1) {
    throw new AffiliateAgentClaimRaceError();
  }
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `terminal-effect-succeeded:${current.id}`,
      jobId: job.id,
      claimId: claim.id,
      receiptId: current.id,
      sequence: job.eventSequence + 1,
      eventType: "TERMINAL_EFFECT_SUCCEEDED",
      actorKind: "OPERATOR_RECOVERY",
      actorId: operatorId,
      role: claim.role,
      requestHash: current.requestHash,
      inputHash: hashAffiliateAgentValue(result),
      outputHash: responseHash,
      payload: asPrismaJson({
        disposition: result.disposition,
        recovered: true,
      }),
      retentionClass: "INDEFINITE",
    },
  });
  return { outcome: "COMPLETED", writeCount: 3 };
};

const finalizeOperatorReviewerEffect = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  result: AffiliateAgentReviewerTerminalResult,
  safeOutput: Readonly<Record<string, unknown>>,
  operatorId: string,
): Promise<Readonly<{ outcome: "COMPLETED" | "REPLAYED"; writeCount: number }>> => runSerializableEffectTransaction(
  dependencies,
  (transaction) =>
    finalizeOperatorReviewerEffectTransaction(
      transaction,
      dependencies,
      receipt,
      result,
      safeOutput,
      operatorId,
    ),
  {
    code: "REVIEWER_EFFECT_RECOVERY_STALE",
    safeMessage: "The reviewer effect could not be finalized.",
    receiptId: receipt.id,
  },
);

const completeOperatorReviewerResultTransaction = async (
  transaction: Prisma.TransactionClient,
  dependencies: AffiliateAgentGatewayDependencies,
  effectReceipt: AffiliateAgentGatewayOperationReceipts,
  result: AffiliateAgentReviewerTerminalResult,
  operatorId: string,
): Promise<Readonly<{ outcome: "COMPLETED" | "REPLAYED"; writeCount: number }>> => {
  const [claim, job, currentEffect] = await Promise.all([
    transaction.affiliateAgentGatewayClaims.findUnique({
      where: { id: effectReceipt.claimId },
    }),
    transaction.affiliateAgentGatewayJobs.findUnique({
      where: { id: effectReceipt.jobId },
    }),
    transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: { id: effectReceipt.id },
    }),
  ]);
  if (!claim || !job || !currentEffect) {
    throw recoveryError(
      "REVIEWER_EFFECT_RECOVERY_STALE",
      "The reviewer recovery records no longer exist.",
      effectReceipt.id,
    );
  }
  const state = parseReviewerTerminalEffectState(
    currentEffect.responseJson,
    currentEffect.id,
  );
  if (
    currentEffect.status !== "SUCCEEDED"
    || state.kind !== "SUCCEEDED"
    || state.resultHash !== hashAffiliateAgentValue(result)
    || currentEffect.responseHash !== hashAffiliateAgentValue(state)
  ) {
    throw recoveryError(
      "REVIEWER_EFFECT_RECOVERY_STALE",
      "The recovered reviewer effect is not complete.",
      effectReceipt.id,
    );
  }
  if (
    claim.status === "COMPLETED"
    && job.status === "COMPLETED"
    && claim.terminalReceiptId !== null
  ) {
    const terminalReceipt =
      await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
        where: { id: claim.terminalReceiptId },
      });
    if (!terminalReceipt) {
      throw recoveryError(
        "REVIEWER_EFFECT_RECOVERY_STALE",
        "The recovered reviewer terminal receipt is missing.",
        effectReceipt.id,
      );
    }
    return { outcome: "REPLAYED", writeCount: 0 };
  }
  if (
    claim.status !== "RECONCILIATION_REQUIRED"
    || job.status !== "RECONCILIATION_REQUIRED"
    || job.activeClaimId !== claim.id
    || claim.tokenInvalidatedAt === null
  ) {
    throw recoveryError(
      "REVIEWER_EFFECT_RECOVERY_STALE",
      "The reviewer quarantine changed before completion.",
      effectReceipt.id,
    );
  }
  await assertClaimEvidenceRefs(
    transaction,
    claim.id,
    result.evidenceRefs,
    "EVIDENCE_REFERENCE_NOT_PERMITTED",
    "The recovered reviewer result references unknown evidence.",
  );
  const resultHash = hashAffiliateAgentValue(result);
  const requestHash = state.terminalRequestHash;
  const idempotencyKey = state.terminalIdempotencyKey;
  const now = dependencies.clock.now();
  const existing =
    await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
      where: {
        claimId_idempotencyKey: {
          claimId: claim.id,
          idempotencyKey,
        },
      },
    });
  if (
    existing
    && existing.status === "SUCCEEDED"
    && existing.requestHash === requestHash
  ) {
    const completed = replayTerminalResult(existing.responseJson);
    const claimUpdated =
      await transaction.affiliateAgentGatewayClaims.updateMany({
        where: {
          id: claim.id,
          status: "RECONCILIATION_REQUIRED",
          claimGeneration: claim.claimGeneration,
          tokenInvalidatedAt: { not: null },
        },
        data: {
          status: "COMPLETED",
          terminalReceiptId: existing.id,
          endedAt: now,
        },
      });
    const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany({
      where: {
        id: job.id,
        status: "RECONCILIATION_REQUIRED",
        activeClaimId: claim.id,
        claimGeneration: claim.claimGeneration,
        eventSequence: job.eventSequence,
      },
      data: {
        status: "COMPLETED",
        activeClaimId: null,
        terminalDisposition: result.disposition,
        resultHash,
        resultJson: asPrismaJson(result),
        terminalReceiptId: existing.id,
        finishedAt: now,
        eventSequence: { increment: 1 },
      },
    });
    if (claimUpdated.count !== 1 || jobUpdated.count !== 1) {
      throw new AffiliateAgentClaimRaceError();
    }
    return {
      outcome: completed.kind === "TERMINAL_ACCEPTED" ? "COMPLETED" : "REPLAYED",
      writeCount: 2,
    };
  }
  if (
    existing
    && (
      existing.requestHash !== requestHash
      || (existing.status !== "PENDING" && existing.status !== "UNKNOWN")
    )
  ) {
    throw recoveryError(
      "REVIEWER_EFFECT_RECOVERY_STALE",
      "The retained terminal result receipt changed.",
      effectReceipt.id,
    );
  }
  const terminalReceiptId = existing?.id ?? dependencies.identifiers.create("receipt");
  const terminalResult: AffiliateAgentTerminalAcceptedResult = {
    kind: "TERMINAL_ACCEPTED",
    receiptId: terminalReceiptId,
    resultHash,
    disposition: result.disposition,
    completedAt: now.toISOString(),
  };
  const claimUpdated =
    await transaction.affiliateAgentGatewayClaims.updateMany({
      where: {
        id: claim.id,
        status: "RECONCILIATION_REQUIRED",
        claimGeneration: claim.claimGeneration,
        tokenInvalidatedAt: { not: null },
      },
      data: {
        status: "COMPLETED",
        terminalReceiptId: terminalReceiptId,
        endedAt: now,
      },
    });
  const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany({
    where: {
      id: job.id,
      status: "RECONCILIATION_REQUIRED",
      activeClaimId: claim.id,
      claimGeneration: claim.claimGeneration,
      eventSequence: job.eventSequence,
    },
    data: {
      status: "COMPLETED",
      activeClaimId: null,
      terminalDisposition: result.disposition,
      resultHash,
      resultJson: asPrismaJson(result),
      terminalReceiptId,
      finishedAt: now,
      eventSequence: { increment: 1 },
    },
  });
  if (claimUpdated.count !== 1 || jobUpdated.count !== 1) {
    throw new AffiliateAgentClaimRaceError();
  }
  if (existing) {
    const receiptUpdated =
      await transaction.affiliateAgentGatewayOperationReceipts.updateMany({
        where: {
          id: existing.id,
          status: existing.status,
          requestHash,
        },
        data: {
          status: "SUCCEEDED",
          responseHash: hashAffiliateAgentValue(terminalResult),
          responseJson: asPrismaJson(terminalResult),
          startedAt: existing.startedAt,
          completedAt: now,
          reconcileAfter: null,
        },
      });
    if (receiptUpdated.count !== 1) throw new AffiliateAgentClaimRaceError();
  } else {
    await transaction.affiliateAgentGatewayOperationReceipts.create({
      data: {
        id: terminalReceiptId,
        claimId: claim.id,
        jobId: job.id,
        claimGeneration: claim.claimGeneration,
        idempotencyKey,
        operationKind: "SUBMIT_RESULT",
        requestHash,
        status: "SUCCEEDED",
        responseHash: hashAffiliateAgentValue(terminalResult),
        responseJson: asPrismaJson(terminalResult),
        startedAt: now,
        completedAt: now,
        retentionClass: "INDEFINITE",
      },
    });
  }
  await transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: dependencies.identifiers.create("event"),
      eventKey: `terminal:recovered:${terminalReceiptId}`,
      jobId: job.id,
      claimId: claim.id,
      receiptId: terminalReceiptId,
      sequence: job.eventSequence + 1,
      eventType: "CLAIM_TERMINAL_RESULT_ACCEPTED",
      actorKind: "OPERATOR_RECOVERY",
      actorId: operatorId,
      role: claim.role,
      requestHash,
      inputHash: resultHash,
      outputHash: hashAffiliateAgentValue(terminalResult),
      reasonCodes: [...result.reasonCodes],
      payload: asPrismaJson({
        disposition: result.disposition,
        resultHash,
        recoveredFromReceiptId: effectReceipt.id,
      }),
      retentionClass: "INDEFINITE",
    },
  });
  return { outcome: "COMPLETED", writeCount: 4 };
};

const completeOperatorReviewerResult = async (
  dependencies: AffiliateAgentGatewayDependencies,
  effectReceipt: AffiliateAgentGatewayOperationReceipts,
  result: AffiliateAgentReviewerTerminalResult,
  operatorId: string,
): Promise<Readonly<{ outcome: "COMPLETED" | "REPLAYED"; writeCount: number }>> => runSerializableEffectTransaction(
  dependencies,
  (transaction) =>
    completeOperatorReviewerResultTransaction(
      transaction,
      dependencies,
      effectReceipt,
      result,
      operatorId,
    ),
  {
    code: "REVIEWER_EFFECT_RECOVERY_STALE",
    safeMessage: "The recovered reviewer result could not be completed.",
    receiptId: effectReceipt.id,
  },
);
const readReviewerEffectRecoveryState = async (
  dependencies: AffiliateAgentGatewayDependencies,
  request: AffiliateAgentReviewerEffectRecoveryRequest,
): Promise<ReviewerEffectRecoveryRows> => dependencies.prisma.$transaction(
  (transaction) =>
    loadReviewerEffectRecoveryRows(dependencies, transaction, request),
  { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
);

const appendReviewerEffectRecoveryFailure = async (
  dependencies: AffiliateAgentGatewayDependencies,
  request: AffiliateAgentReviewerEffectRecoveryRequest,
  operator: AffiliateAgentReviewerEffectRecoveryOperator,
  rows: ReviewerEffectRecoveryRows,
  reportHash: string,
  attempt: number,
  failureReasonCodes: readonly string[],
): Promise<number> => runSerializableEffectTransaction(
  dependencies,
  async (transaction) => {
    const currentRows = await loadReviewerEffectRecoveryRows(
      dependencies,
      transaction,
      request,
    );
    return appendReviewerEffectRecoveryEvent(
      transaction,
      dependencies,
      {
        eventType: REVIEWER_EFFECT_RECOVERY_FAILED_EVENT,
        eventKey: [
          "reviewer-effect-recovery:failed",
          request.receiptId,
          reportHash,
          String(attempt),
        ].join(":"),
        requestHash: currentRows.receipt?.requestHash ?? rows.receipt?.requestHash ?? null,
        reportHash,
        jobId: request.jobId,
        claimId: request.claimId,
        receiptId: request.receiptId,
        role: "SUPPLY_REVIEWER",
        actorId: operator.operatorId,
        payload: {
          ...recoveryEventPayload(
            currentRows,
            request,
            operator,
            reportHash,
            attempt,
            "FAILED",
            failureReasonCodes,
          ),
          outcome: "RECONCILIATION_REQUIRED",
        },
        reasonCodes: failureReasonCodes,
      },
    );
  },
  {
    code: "REVIEWER_EFFECT_RECOVERY_STALE",
    safeMessage: "The reviewer recovery failure could not be recorded.",
    receiptId: request.receiptId,
  },
);

export const recoverAffiliateAgentReviewerEffect = async (
  dependencies: AffiliateAgentGatewayDependencies,
  requestValue: unknown,
  operatorValue: unknown,
): Promise<AffiliateAgentReviewerEffectRecoveryReport> => {
  const requestParsed = affiliateAgentReviewerEffectRecoveryRequestSchema.safeParse(requestValue);
  const operatorParsed = reviewerEffectRecoveryOperatorSchema.safeParse(operatorValue);
  if (!requestParsed.success || !operatorParsed.success) {
    throw recoveryError(
      "INTERNAL_ERROR",
      "The reviewer recovery request is invalid.",
    );
  }
  const request = requestParsed.data;
  const operator = operatorParsed.data;
  if (dependencies.claimAdmission?.isOpen()) {
    throw gatewayError(
      "GATEWAY_ADMISSION_HALTED",
      "Reviewer effect recovery requires closed gateway admission.",
    );
  }
  const initialRows = await readReviewerEffectRecoveryState(
    dependencies,
    request,
  );
  const initialEvaluation = evaluateReviewerEffectRecovery(request, initialRows);
  if (request.mode === "PREVIEW") {
    return recoveryReport(
      request,
      initialRows,
      initialEvaluation.reportHash,
      "PREVIEW",
      false,
      0,
      initialEvaluation,
    );
  }
  if (!request.expectedReportHash) {
    throw recoveryError(
      "REVIEWER_EFFECT_RECOVERY_HASH_MISMATCH",
      "APPLY requires the PREVIEW report hash.",
      request.receiptId,
    );
  }
  if (!isRecoverySha256(request.expectedReportHash)) {
    throw recoveryError(
      "REVIEWER_EFFECT_RECOVERY_HASH_MISMATCH",
      "The PREVIEW report hash is invalid.",
      request.receiptId,
    );
  }
  const reservation = await reserveReviewerEffectRecovery(
    dependencies,
    request,
    operator,
    request.expectedReportHash,
  );
  if (reservation.kind === "REPLAY") {
    return recoveryReport(
      request,
      reservation.rows,
      reservation.reportHash,
      reservation.outcome === "COMPLETED" ? "REPLAYED" : "RECONCILIATION_REQUIRED",
      true,
      0,
    );
  }
  if (reservation.kind === "RESUME") {
    if (!reservation.rows.reviewerResult || !reservation.rows.receipt) {
      throw recoveryError(
        "REVIEWER_EFFECT_RECOVERY_STALE",
        "The recovered reviewer result is missing.",
        request.receiptId,
      );
    }
    const resumeReceipt = reservation.rows.receipt;
    const resumeResult = reservation.rows.reviewerResult;
    let committedWriteCount = 0;
    try {
      const completion = await completeOperatorReviewerResult(
        dependencies,
        resumeReceipt,
        resumeResult,
        operator.operatorId,
      );
      committedWriteCount += completion.writeCount;
      const currentRows = await readReviewerEffectRecoveryState(
        dependencies,
        request,
      );
      const completionAuditWrites = await runSerializableEffectTransaction(
        dependencies,
        (transaction) => appendReviewerEffectRecoveryEvent(
          transaction,
          dependencies,
          {
            eventType: REVIEWER_EFFECT_RECOVERY_COMPLETED_EVENT,
            eventKey: [
              "reviewer-effect-recovery:completed",
              request.receiptId,
              reservation.reportHash,
            ].join(":"),
            requestHash: resumeReceipt.requestHash,
            reportHash: reservation.reportHash,
            jobId: request.jobId,
            claimId: request.claimId,
            receiptId: request.receiptId,
            role: "SUPPLY_REVIEWER",
            actorId: operator.operatorId,
            payload: {
              ...recoveryEventPayload(
                currentRows,
                request,
                operator,
                reservation.reportHash,
                0,
                "COMPLETED",
              ),
              outcome: "COMPLETED",
            },
            reasonCodes: ["COMPLETED"],
          },
        ),
        {
          code: "REVIEWER_EFFECT_RECOVERY_STALE",
          safeMessage: "The reviewer recovery completion could not be recorded.",
          receiptId: request.receiptId,
        },
      );
      committedWriteCount += completionAuditWrites;
      return recoveryReport(
        request,
        currentRows,
        reservation.reportHash,
        completion.outcome === "REPLAYED" ? "REPLAYED" : "COMPLETED",
        true,
        committedWriteCount,
      );
    } catch (error) {
      if (error instanceof AffiliateAgentGatewayError) {
        const failureAuditWrites = await appendReviewerEffectRecoveryFailure(
          dependencies,
          request,
          operator,
          reservation.rows,
          reservation.reportHash,
          0,
          ["COMPLETION_FAILED"],
        );
        const currentRows = await readReviewerEffectRecoveryState(
          dependencies,
          request,
        );
        return recoveryReport(
          request,
          currentRows,
          reservation.reportHash,
          "RECONCILIATION_REQUIRED",
          false,
          committedWriteCount + failureAuditWrites,
        );
      }
      throw error;
    }
  }
  if (
    !reservation.rows.reviewerResult
    || !reservation.rows.envelope
    || !reservation.rows.receipt
  ) {
    throw recoveryError(
      "REVIEWER_EFFECT_RECOVERY_STALE",
      "The retained reviewer effect is incomplete.",
      request.receiptId,
    );
  }
  const effectReceipt = reservation.rows.receipt;
  const reviewerEnvelope = reservation.rows.envelope;
  const approvedResult = reservation.rows.reviewerResult;
  if (!effectReceipt || !reviewerEnvelope || !approvedResult) {
    throw recoveryError(
      "REVIEWER_EFFECT_RECOVERY_STALE",
      "The retained reviewer effect is incomplete.",
      request.receiptId,
    );
  }
  const isSourceExclusionRecovery =
    reviewerEnvelope.subject.type === "SOURCE_EXCLUSION_REVIEW";
  if (
    (!isSourceExclusionRecovery && approvedResult.disposition !== "APPROVED")
    || (
      isSourceExclusionRecovery
      && approvedResult.disposition !== "SOURCE_EXCLUSION_ASSESSED"
      && approvedResult.disposition !== "HUMAN_REVIEW_REQUIRED"
    )
  ) {
    throw recoveryError(
      "REVIEWER_EFFECT_RECOVERY_STALE",
      "The retained reviewer result is not permitted for this claim.",
      request.receiptId,
    );
  }
  const terminalEffects = dependencies.terminalEffects;
  const recoveryHandler =
    approvedResult.disposition === "APPROVED"
      ? terminalEffects?.APPROVED
      : approvedResult.disposition === "SOURCE_EXCLUSION_ASSESSED"
        ? terminalEffects?.SOURCE_EXCLUSION_ASSESSED
        : terminalEffects?.HUMAN_REVIEW_REQUIRED;
  if (
    !terminalEffects
    || !recoveryHandler
    || typeof recoveryHandler.recover !== "function"
  ) {
    throw recoveryError(
      "REVIEWER_EFFECT_RECOVERY_NOT_ELIGIBLE",
      "The retained reviewer effect adapter is unavailable.",
      request.receiptId,
    );
  }
  let recovered: Readonly<Record<string, unknown>> | null = null;
  let failureReasonCodes: readonly string[] = [];
  const adapter = terminalEffects;
  const invocation = await runReviewerTerminalEffectWithRecovery(
    adapter,
    {
      receiptId: effectReceipt.id,
      claim: reviewerEnvelope,
      result: approvedResult,
    },
    true,
    async (diagnostic) => {
      await persistReviewerTerminalEffectFailureDiagnostics(
        dependencies,
        effectReceipt,
        [diagnostic],
      );
    },
  );
  recovered = invocation.recovered;
  const diagnosticReasonCodes = invocation.failureDiagnostics.flatMap(
    (diagnostic) => diagnostic.reasonCodes,
  );
  failureReasonCodes = diagnosticReasonCodes.length > 0
    ? Array.from(new Set(
      diagnosticReasonCodes.map((code) => (
        code === "UNCLASSIFIED" ? "RECOVERY_FAILED" : code
      )),
    )).sort()
    : recovered === null
      ? ["RECOVERY_UNRESOLVED"]
      : [];
  if (recovered === null) {
    const failureAuditWrites = await appendReviewerEffectRecoveryFailure(
      dependencies,
      request,
      operator,
      reservation.rows,
      reservation.reportHash,
      reservation.attempt,
      failureReasonCodes,
    );
    const currentRows = await readReviewerEffectRecoveryState(
      dependencies,
      request,
    );
    return recoveryReport(
      request,
      currentRows,
      reservation.reportHash,
      "RECONCILIATION_REQUIRED",
      false,
      reservation.writeCount + failureAuditWrites,
    );
  }
  let safeOutput: Readonly<Record<string, unknown>>;
  try {
    safeOutput = parseBoundedSafeOutput(
      recovered,
      effectReceipt.id,
    );
  } catch {
    const failureAuditWrites = await appendReviewerEffectRecoveryFailure(
      dependencies,
      request,
      operator,
      reservation.rows,
      reservation.reportHash,
      reservation.attempt,
      ["RECOVERY_OUTPUT_INVALID"],
    );
    const currentRows = await readReviewerEffectRecoveryState(
      dependencies,
      request,
    );
    return recoveryReport(
      request,
      currentRows,
      reservation.reportHash,
      "RECONCILIATION_REQUIRED",
      false,
      reservation.writeCount + failureAuditWrites,
    );
  }
  let committedWriteCount = reservation.writeCount;
  try {
    const finalized = await finalizeOperatorReviewerEffect(
      dependencies,
      effectReceipt,
      approvedResult,
      safeOutput,
      operator.operatorId,
    );
    committedWriteCount += finalized.writeCount;
    const completed = await completeOperatorReviewerResult(
      dependencies,
      effectReceipt,
      approvedResult,
      operator.operatorId,
    );
    committedWriteCount += completed.writeCount;
    const currentRows = await readReviewerEffectRecoveryState(
      dependencies,
      request,
    );
    const completionAuditWrites = await runSerializableEffectTransaction(
      dependencies,
      (transaction) => appendReviewerEffectRecoveryEvent(
        transaction,
        dependencies,
        {
          eventType: REVIEWER_EFFECT_RECOVERY_COMPLETED_EVENT,
          eventKey: [
            "reviewer-effect-recovery:completed",
            request.receiptId,
            reservation.reportHash,
          ].join(":"),
          requestHash: reservation.rows.receipt?.requestHash ?? null,
          reportHash: reservation.reportHash,
          jobId: request.jobId,
          claimId: request.claimId,
          receiptId: request.receiptId,
          role: "SUPPLY_REVIEWER",
          actorId: operator.operatorId,
          payload: {
            ...recoveryEventPayload(
              currentRows,
              request,
              operator,
              reservation.reportHash,
              reservation.attempt,
              "COMPLETED",
            ),
            outcome: "COMPLETED",
          },
          reasonCodes: ["COMPLETED"],
        },
      ),
      {
        code: "REVIEWER_EFFECT_RECOVERY_STALE",
        safeMessage: "The reviewer recovery completion could not be recorded.",
        receiptId: request.receiptId,
      },
    );
    committedWriteCount += completionAuditWrites;
    return recoveryReport(
      request,
      currentRows,
      reservation.reportHash,
      completed.outcome === "REPLAYED" ? "REPLAYED" : "COMPLETED",
      false,
      committedWriteCount,
    );
  } catch (error) {
    if (!(error instanceof AffiliateAgentGatewayError)) throw error;
    const failureAuditWrites = await appendReviewerEffectRecoveryFailure(
      dependencies,
      request,
      operator,
      reservation.rows,
      reservation.reportHash,
      reservation.attempt,
      ["COMPLETION_FAILED"],
    );
    const currentRows = await readReviewerEffectRecoveryState(
      dependencies,
      request,
    );
    return recoveryReport(
      request,
      currentRows,
      reservation.reportHash,
      "RECONCILIATION_REQUIRED",
      false,
      committedWriteCount + failureAuditWrites,
    );
  }
};
export function createPrismaAffiliateAgentInvocationReconciler(
  dependencies: AffiliateAgentGatewayDependencies,
): AffiliateAgentInvocationReconciler {
  return {
    async reconcileInvocation(input) {
      assertInvocationReconciliationInput(input);
      return reconcileExactInvocation(dependencies, input);
    },
  };
}

export function createPrismaAffiliateAgentGateway(
  dependencies: AffiliateAgentGatewayDependencies,
): AffiliateAgentGateway {
  return {
    async claim(input) {
      assertClaimRequestInput(input);
      try {
        const now = dependencies.clock.now();
        await validateClaimRequest(dependencies, input, now);
        const requestHash = claimRequestHash(input);
        const bundle = parseSupportedContractBundle(
          await dependencies.contracts.loadActiveBundle(),
        );
        const roleContract = activeRoleContract(bundle, input.role);
        await dependencies.workerHealth?.heartbeat({
          workerId: input.workerId,
          role: input.role,
          now: dependencies.clock.now(),
        });
        return await claimAffiliateAgentJob(
          dependencies,
          input,
          bundle,
          roleContract,
          requestHash,
        );
      } catch (error) {
        if (error instanceof AffiliateAgentGatewayError) throw error;
        throw gatewayErrorForPersistenceFailure(
          error,
          "INTERNAL_ERROR",
          "The Affiliate Agent claim could not be completed.",
          true,
        );
      }
    },
    async perform<T extends AffiliateAgentClaimOperation>(
      input: T,
    ): Promise<AffiliateAgentClaimOperationResult<T>> {
      assertClaimOperationInput(input);
      if (input.kind === "HEARTBEAT") {
        return (await performHeartbeat(
          dependencies,
          input,
        )) as AffiliateAgentClaimOperationResult<T>;
      }
      if (input.kind === "READ_ARTIFACT") {
        return (await performArtifactRead(
          dependencies,
          input,
        )) as AffiliateAgentClaimOperationResult<T>;
      }
      if (input.kind === "EXECUTE_COMMAND") {
        return (await performCommand(
          dependencies,
          input,
        )) as AffiliateAgentClaimOperationResult<T>;
      }
      if (input.kind === "SUBMIT_RESULT") {
        const result = await performTerminalResult(dependencies, input);
        if (result.kind === "INVOCATION_FAILED") {
          await reportInvocationFailure(
            dependencies,
            input.authorization,
            result,
            result.failureCode,
            null,
          );
        }
        return result as AffiliateAgentClaimOperationResult<T>;
      }
      if (input.kind === "RECORD_FAILURE") {
        const result = await performFailure(dependencies, input);
        if (result.kind === "INVOCATION_FAILED") {
          await reportInvocationFailure(
            dependencies,
            input.authorization,
            result,
            input.failure.code,
            input.failure.safeSummary,
          );
        }
        return result as AffiliateAgentClaimOperationResult<T>;
      }
      throw gatewayError(
        "ROLE_NOT_ALLOWED",
        "This claim operation is not available in the current gateway slice.",
      );
    },
    async reconcile(
      input?: AffiliateAgentReconcileRequest,
    ): Promise<AffiliateAgentReconcileReport> {
      return reconcileAffiliateAgentGateway(dependencies, input);
    },
  };
}
