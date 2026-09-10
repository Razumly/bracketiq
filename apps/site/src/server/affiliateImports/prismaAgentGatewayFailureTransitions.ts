import type {
  AffiliateAgentGatewayClaims,
  AffiliateAgentGatewayJobs,
  Prisma,
} from "@/generated/prisma/client";

import {
  AffiliateAgentGatewayError,
  affiliateAgentRetryDelaySeconds,
  type AffiliateAgentInvocationFailedResult,
  type AffiliateAgentInvocationFailureCode,
} from "./agentGateway";
import type { AffiliateAgentGatewayDependencies } from "./agentGatewayAdapters";
import {
  canonicalizeAffiliateAgentValue,
  isAffiliateAgentSingleClaimJob,
  hashAffiliateAgentValue,
} from "./agentGatewayContracts";

export class AffiliateAgentClaimRaceError extends Error {}

const asPrismaJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(canonicalizeAffiliateAgentValue(value)) as Prisma.InputJsonValue;

const gatewayError = (
  code: ConstructorParameters<typeof AffiliateAgentGatewayError>[0]["code"],
  safeMessage: string,
): AffiliateAgentGatewayError =>
  new AffiliateAgentGatewayError({
    code,
    isRetryable: false,
    safeMessage,
  });

type InvocationFailureTransitionInput = Readonly<{
  dependencies: AffiliateAgentGatewayDependencies;
  transaction: Prisma.TransactionClient;
  claim: AffiliateAgentGatewayClaims;
  job: AffiliateAgentGatewayJobs;
  idempotencyKey: string;
  operationKind: "SUBMIT_RESULT" | "RECORD_FAILURE";
  requestHash: string;
  failureCode: AffiliateAgentInvocationFailureCode;
  failedAt: Date;
  safeSummary: string;
  evidenceRefs: readonly string[];
  claimStatus: "FAILED" | "EXPIRED";
  claimCasFailure: "GATEWAY_ERROR" | "RACE";
  actorKind: "AGENT_INVOCATION" | "GATEWAY_RECONCILER";
  actorId: string;
  eventType: "CLAIM_INVOCATION_FAILED" | "CLAIM_EXPIRED";
  schemaCorrectionCount?: number;
}>;

export const recordInvocationFailureTransition = async (
  input: InvocationFailureTransitionInput,
): Promise<AffiliateAgentInvocationFailedResult> => {
  const invocationFailureCount = input.job.invocationFailureCount + 1;
  if (invocationFailureCount < 1 || invocationFailureCount > 3) {
    throw gatewayError(
      "PIPELINE_BLOCKED",
      "The invocation retry budget is already exhausted.",
    );
  }
  const retryDelay = affiliateAgentRetryDelaySeconds(
    invocationFailureCount as 1 | 2 | 3,
  );
  const isPipelineBlocked = retryDelay === null || isAffiliateAgentSingleClaimJob(input.job.dedupeKey);
  const nextAttemptAt = isPipelineBlocked
    ? null
    : new Date(input.failedAt.getTime() + retryDelay! * 1_000);
  const receiptId = input.dependencies.identifiers.create("receipt");
  const response: AffiliateAgentInvocationFailedResult = {
    kind: "INVOCATION_FAILED",
    receiptId,
    failureCode: input.failureCode,
    invocationFailureCount: invocationFailureCount as 1 | 2 | 3,
    nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
    isPipelineBlocked,
  };
  const responseHash = hashAffiliateAgentValue(response);
  const claimUpdated =
    await input.transaction.affiliateAgentGatewayClaims.updateMany({
      where: {
        id: input.claim.id,
        status: "ACTIVE",
        claimGeneration: input.claim.claimGeneration,
        tokenInvalidatedAt: null,
        ...(input.claimStatus === "EXPIRED"
          ? {
              leaseExpiresAt: input.claim.leaseExpiresAt,
              hardDeadlineAt: input.claim.hardDeadlineAt,
            }
          : {}),
      },
      data: {
        status: input.claimStatus,
        terminalReceiptId: receiptId,
        tokenInvalidatedAt: input.failedAt,
        endedAt: input.failedAt,
        safeFailureCode: input.failureCode,
        safeFailureSummary: input.safeSummary,
        diagnosticRetainUntil: new Date(
          input.failedAt.getTime() + 14 * 24 * 60 * 60 * 1_000,
        ),
        ...(input.schemaCorrectionCount === undefined
          ? {}
          : { schemaCorrectionCount: input.schemaCorrectionCount }),
      },
    });
  if (claimUpdated.count !== 1) {
    if (input.claimCasFailure === "RACE") {
      throw new AffiliateAgentClaimRaceError();
    }
    throw new AffiliateAgentGatewayError({
      code: "CLAIM_NOT_ACTIVE",
      isRetryable: false,
      safeMessage:
        "The invocation failure lost the active claim compare-and-set.",
    });
  }
  const jobUpdated =
    await input.transaction.affiliateAgentGatewayJobs.updateMany({
      where: {
        id: input.job.id,
        status: "CLAIMED",
        activeClaimId: input.claim.id,
        claimGeneration: input.claim.claimGeneration,
        eventSequence: input.job.eventSequence,
      },
      data: {
        status: isPipelineBlocked ? "PIPELINE_BLOCKED" : "RETRY_WAIT",
        activeClaimId: null,
        invocationFailureCount,
        lastInvocationFailedAt: input.failedAt,
        nextAttemptAt,
        pipelineBlockedAt: isPipelineBlocked ? input.failedAt : null,
        terminalReceiptId: receiptId,
        finishedAt: isPipelineBlocked ? input.failedAt : null,
        eventSequence: { increment: 1 },
      },
    });
  if (jobUpdated.count !== 1) throw new AffiliateAgentClaimRaceError();
  await input.transaction.affiliateAgentGatewayOperationReceipts.create({
    data: {
      id: receiptId,
      claimId: input.claim.id,
      jobId: input.job.id,
      claimGeneration: input.claim.claimGeneration,
      idempotencyKey: input.idempotencyKey,
      operationKind: input.operationKind,
      requestHash: input.requestHash,
      status: "SUCCEEDED",
      responseHash,
      responseJson: asPrismaJson(response),
      startedAt: input.failedAt,
      completedAt: input.failedAt,
      retentionClass: "INDEFINITE",
    },
  });
  await input.transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: input.dependencies.identifiers.create("event"),
      eventKey:
        input.eventType === "CLAIM_EXPIRED"
          ? `claim-expired:${input.claim.id}`
          : `invocation-failure:${receiptId}`,
      jobId: input.job.id,
      claimId: input.claim.id,
      receiptId,
      sequence: input.job.eventSequence + 1,
      eventType: input.eventType,
      actorKind: input.actorKind,
      actorId: input.actorId,
      role: input.claim.role,
      requestHash: input.requestHash,
      outputHash: responseHash,
      reasonCodes: [input.failureCode],
      payload: asPrismaJson({
        evidenceRefs: [...input.evidenceRefs],
        invocationFailureCount,
        nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
        isPipelineBlocked,
        ...(input.eventType === "CLAIM_EXPIRED"
          ? { terminalFailureReceiptId: receiptId }
          : {}),
      }),
      retentionClass: "INDEFINITE",
    },
  });
  if (input.dependencies.operationalAlert) {
    const isClaimExpired = input.eventType === "CLAIM_EXPIRED";
    await input.dependencies.operationalAlert(
      {
        eventKey: isClaimExpired
          ? `affiliate-agent-claim-expired:${input.claim.id}`
          : `affiliate-agent-invocation-failed:${receiptId}`,
        category: isClaimExpired
          ? "AGENT_LEASE_EXPIRED"
          : "AGENT_INVOCATION_FAILURE",
        severity: isClaimExpired || isPipelineBlocked ? "critical" : "warning",
        title: isClaimExpired
          ? "Affiliate agent claim expired"
          : isPipelineBlocked
            ? "Affiliate agent pipeline blocked"
            : "Affiliate agent invocation failed",
        detail: input.safeSummary,
        subjectType: "AGENT_JOB",
        subjectId: input.job.id,
        queue: input.job.queue,
        lifecycleGeneration: input.claim.lifecycleGeneration,
        claimGeneration: input.claim.claimGeneration,
        workerId: input.claim.workerId,
        attempt: invocationFailureCount,
        previousState: "CLAIMED",
        nextState: isPipelineBlocked ? "PIPELINE_BLOCKED" : "RETRY_WAIT",
        reasonCodes: [input.failureCode],
        evidenceRefs: [...input.evidenceRefs],
        payload: {
          claimId: input.claim.id,
          invocationId: input.claim.invocationId,
          receiptId,
          eventType: input.eventType,
        },
      },
      { db: input.transaction, isDeliveryEnabled: false },
    );
  }
  return response;
};
