import type {
  AffiliateAgentGatewayClaims,
  PrismaClient,
} from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import type { AffiliateAgentGatewayDependencies } from "./agentGatewayAdapters";
import { hashAffiliateAgentValue } from "./agentGatewayContracts";

import type {
  AffiliateOperationalAlertInput,
  AffiliateOperationalAlertWriter,
} from "./affiliateOperationalAlerts";
import {
  AffiliateAgentClaimRaceError,
  recordInvocationFailureTransition,
} from "./prismaAgentGatewayFailureTransitions";

const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;
const AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND =
  "SUPPLY_REVIEWER_TERMINAL_EFFECT";
const AFFILIATE_AGENT_TERMINAL_EFFECT_OPERATION = "TERMINAL_EFFECT";

const emitClaimExpiryAlertWithRetry = async (
  writer: AffiliateOperationalAlertWriter,
  input: AffiliateOperationalAlertInput,
): Promise<void> => {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await writer(input);
      const failedDeliveries = result.deliveries.filter(
        (delivery) => delivery.status === "FAILED",
      );
      if (failedDeliveries.length === 0) return;
      lastError = new Error(
        `Claim expiry alert delivery failed on ${failedDeliveries.length} channel(s).`,
      );
    } catch (error) {
      lastError = error;
    }
  }
  console.error(
    "[affiliate:gateway] failed to persist claim expiry alert after retry",
    lastError,
  );
};

const findReconcileableExpiredClaimIds = async (
  client: PrismaClient,
  before: Date,
  limit: number,
): Promise<readonly string[]> => {
  const rows = await client.$queryRaw<ReadonlyArray<{ id: string }>>(
    Prisma.sql`
      SELECT claim."id"
      FROM "AffiliateAgentGatewayClaims" AS claim
      WHERE claim."status" = 'ACTIVE'
        AND (
          claim."leaseExpiresAt" <= ${before}
          OR claim."hardDeadlineAt" <= ${before}
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "AffiliateAgentGatewayOperationReceipts" AS receipt
          WHERE receipt."claimId" = claim."id"
            AND receipt."jobId" = claim."jobId"
            AND receipt."claimGeneration" = claim."claimGeneration"
            AND receipt."status" = 'SUCCEEDED'
            AND receipt."operationKind" = 'EXECUTE_COMMAND'
            AND receipt."commandName" = 'EXECUTE_RECORDED_LIFECYCLE_COMMAND'
            AND claim."hardDeadlineAt" > ${before}
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "AffiliateAgentGatewayOperationReceipts" AS pending_receipt
          WHERE pending_receipt."claimId" = claim."id"
            AND pending_receipt."status" = 'PENDING'
            AND (
              pending_receipt."operationKind" = 'READ_ARTIFACT'
              OR pending_receipt."commandName" IN (
                'CAPTURE_CLAIM_URL',
                'EXECUTE_RECORDED_LIFECYCLE_COMMAND',
                'RUN_DISCOVERY_QUERY',
                'SUPPLY_REVIEWER_TERMINAL_EFFECT'
              )
            )
        )
      ORDER BY claim."hardDeadlineAt" ASC, claim."leaseExpiresAt" ASC, claim."id" ASC
      LIMIT ${limit}
    `,
  );
  return rows.map(({ id }) => id);
};

const markImpossibleExpiredClaim = async (
  dependencies: AffiliateAgentGatewayDependencies,
  claim: AffiliateAgentGatewayClaims,
  now: Date,
): Promise<boolean> =>
  dependencies.prisma.$transaction(
    async (transaction) => {
      const current = await transaction.affiliateAgentGatewayClaims.findUnique({
        where: { id: claim.id },
      });
      if (!current || current.status !== "ACTIVE") return false;
      const job = await transaction.affiliateAgentGatewayJobs.findUnique({
        where: { id: current.jobId },
      });
      const claimUpdated =
        await transaction.affiliateAgentGatewayClaims.updateMany({
          where: {
            id: current.id,
            status: "ACTIVE",
            claimGeneration: current.claimGeneration,
            tokenInvalidatedAt: null,
          },
          data: {
            status: "RECONCILIATION_REQUIRED",
            tokenInvalidatedAt: now,
            safeFailureCode: "GATEWAY_ADMISSION_HALTED",
            safeFailureSummary:
              "The expired claim does not match its authoritative job state.",
          },
        });
      if (
        job?.status === "CLAIMED" &&
        job.activeClaimId === current.id &&
        job.claimGeneration === current.claimGeneration
      ) {
        await transaction.affiliateAgentGatewayJobs.updateMany({
          where: {
            id: job.id,
            status: "CLAIMED",
            activeClaimId: current.id,
            claimGeneration: current.claimGeneration,
          },
          data: {
            status: "RECONCILIATION_REQUIRED",
            nextAttemptAt: null,
          },
        });
      }
      return claimUpdated.count === 1;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

export const reconcileExpiredClaims = async (
  dependencies: AffiliateAgentGatewayDependencies,
  before: Date,
  limit: number,
): Promise<
  Readonly<{
    examined: number;
    expired: number;
    isAdmissionHalted: boolean;
  }>
> => {
  if (limit === 0) {
    return { examined: 0, expired: 0, isAdmissionHalted: false };
  }
  const selectedClaimIds = await findReconcileableExpiredClaimIds(
    dependencies.prisma,
    before,
    limit,
  );
  const selectedClaims =
    selectedClaimIds.length === 0
      ? []
      : await dependencies.prisma.affiliateAgentGatewayClaims.findMany({
          where: { id: { in: [...selectedClaimIds] } },
        });
  const claimsById = new Map(
    selectedClaims.map((claim) => [claim.id, claim] as const),
  );
  const claims = selectedClaimIds.flatMap((claimId) => {
    const claim = claimsById.get(claimId);
    return claim === undefined ? [] : [claim];
  });
  let expired = 0;
  let isAdmissionHalted = false;
  for (const selectedClaim of claims) {
    let outcome: "UNCHANGED" | "IMPOSSIBLE" | "EXPIRED" = "UNCHANGED";
    for (
      let attempt = 1;
      attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        outcome = await dependencies.prisma.$transaction(
          async (transaction) => {
            const claim =
              await transaction.affiliateAgentGatewayClaims.findUnique({
                where: { id: selectedClaim.id },
              });
            if (
              !claim ||
              claim.status !== "ACTIVE" ||
              (claim.leaseExpiresAt > before && claim.hardDeadlineAt > before)
            ) {
              return "UNCHANGED" as const;
            }
            const pendingEffect =
              await transaction.affiliateAgentGatewayOperationReceipts.findFirst(
                {
                  where: {
                    claimId: claim.id,
                    OR: [
                      {
                        status: "PENDING",
                        commandName: {
                          in: [
                            "CAPTURE_CLAIM_URL",
                            "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
                            "RUN_DISCOVERY_QUERY",
                            AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND,
                          ],
                        },
                      },
                      { status: "PENDING", operationKind: "READ_ARTIFACT" },
                      {
                        status: "SUCCEEDED",
                        AND: [
                          { startedAt: { lt: claim.leaseExpiresAt } },
                          { startedAt: { lt: claim.hardDeadlineAt } },
                        ],
                        OR: [
                          {
                            operationKind:
                              AFFILIATE_AGENT_TERMINAL_EFFECT_OPERATION,
                            commandName:
                              AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND,
                          },
                        ],
                      },
                    ],
                  },
                },
              );
            if (pendingEffect) return "UNCHANGED" as const;
            const succeededLifecycleEffect =
              await transaction.affiliateAgentGatewayOperationReceipts.findFirst(
                {
                  where: {
                    claimId: claim.id,
                    jobId: claim.jobId,
                    claimGeneration: claim.claimGeneration,
                    status: "SUCCEEDED",
                    operationKind: "EXECUTE_COMMAND",
                    commandName: "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
                  },
                  select: { id: true },
                },
              );
            if (
              succeededLifecycleEffect !== null &&
              claim.hardDeadlineAt > before
            ) {
              return "UNCHANGED" as const;
            }
            const job = await transaction.affiliateAgentGatewayJobs.findUnique({
              where: { id: claim.jobId },
            });
            if (
              !job ||
              job.status !== "CLAIMED" ||
              job.activeClaimId !== claim.id ||
              job.claimGeneration !== claim.claimGeneration ||
              job.invocationFailureCount < 0 ||
              job.invocationFailureCount >= 3
            ) {
              return "IMPOSSIBLE" as const;
            }
            const failureRecordedAt = dependencies.clock.now();
            const failureIdempotencyKey = `supervisor-expiry-${claim.id}`;
            const failureRequestHash = hashAffiliateAgentValue({
              kind: "RECORD_FAILURE",
              idempotencyKey: failureIdempotencyKey,
              claimId: claim.id,
              claimGeneration: claim.claimGeneration,
              failureCode: "TIMEOUT",
              failedAt: failureRecordedAt.toISOString(),
            });
            await recordInvocationFailureTransition({
              dependencies,
              transaction,
              claim,
              job,
              idempotencyKey: failureIdempotencyKey,
              operationKind: "RECORD_FAILURE",
              requestHash: failureRequestHash,
              failureCode: "TIMEOUT",
              failedAt: failureRecordedAt,
              safeSummary: "The invocation lease or hard deadline expired.",
              evidenceRefs: [],
              claimStatus: "EXPIRED",
              claimCasFailure: "RACE",
              actorKind: "GATEWAY_RECONCILER",
              actorId: "affiliate-agent-gateway",
              eventType: "CLAIM_EXPIRED",
            });
            return "EXPIRED" as const;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        break;
      } catch (error) {
        const retryableConflict =
          error instanceof AffiliateAgentClaimRaceError ||
          (error !== null &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "P2034");
        if (retryableConflict) {
          if (attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS) continue;
          break;
        }
        throw error;
      }
    }
    if (outcome === "EXPIRED") {
      expired += 1;
      if (dependencies.operationalAlert) {
        await emitClaimExpiryAlertWithRetry(
          dependencies.operationalAlert,
          {
            eventKey: `affiliate-agent-claim-expired:${selectedClaim.id}`,
            category: "AGENT_LEASE_EXPIRED",
            severity: "critical",
            title: "Affiliate agent claim expired",
            detail: "The gateway expired an active claim after its lease or hard deadline.",
            subjectType: "AGENT_JOB",
            subjectId: selectedClaim.jobId,
            queue: selectedClaim.queue,
            claimGeneration: selectedClaim.claimGeneration,
            workerId: selectedClaim.workerId,
            previousState: "CLAIMED",
            nextState: "RETRY_WAIT",
            reasonCodes: ["LEASE_EXPIRED"],
            payload: { claimId: selectedClaim.id },
          },
        );
      }
      continue;
    }
    if (outcome === "IMPOSSIBLE") {
      const halted = await markImpossibleExpiredClaim(
        dependencies,
        selectedClaim,
        dependencies.clock.now(),
      );
      isAdmissionHalted ||= halted;
      if (halted && dependencies.operationalAlert) {
        try {
          await dependencies.operationalAlert({
            eventKey: `affiliate-agent-admission-halted:${selectedClaim.jobId}`,
            category: "AGENT_ADMISSION_HALTED",
            severity: "critical",
            title: "Affiliate agent admission halted",
            detail: "The gateway could not safely reconcile an expired claim.",
            subjectType: "AGENT_JOB",
            subjectId: selectedClaim.jobId,
            queue: selectedClaim.queue,
            claimGeneration: selectedClaim.claimGeneration,
            workerId: selectedClaim.workerId,
            previousState: "CLAIMED",
            nextState: "RECONCILIATION_REQUIRED",
            reasonCodes: ["GATEWAY_ADMISSION_HALTED", "LEASE_EXPIRED"],
            payload: { claimId: selectedClaim.id },
          });
        } catch (error) {
          console.error("[affiliate:gateway] failed to persist admission halt alert", error);
        }
      }
    }
  }
  return {
    examined: claims.length,
    expired,
    isAdmissionHalted,
  };
};
