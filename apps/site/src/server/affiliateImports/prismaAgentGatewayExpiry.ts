import type {
  AffiliateAgentGatewayClaims,
  PrismaClient,
} from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";

import type { AffiliateAgentGatewayDependencies } from "./agentGatewayAdapters";
import { hashAffiliateAgentValue } from "./agentGatewayContracts";
import {
  AffiliateAgentClaimRaceError,
  recordInvocationFailureTransition,
} from "./prismaAgentGatewayFailureTransitions";

const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;
const AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND =
  "SUPPLY_REVIEWER_TERMINAL_EFFECT";
const AFFILIATE_AGENT_TERMINAL_EFFECT_OPERATION = "TERMINAL_EFFECT";

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
      continue;
    }
    if (outcome === "IMPOSSIBLE") {
      isAdmissionHalted ||= await markImpossibleExpiredClaim(
        dependencies,
        selectedClaim,
        dependencies.clock.now(),
      );
    }
  }
  return {
    examined: claims.length,
    expired,
    isAdmissionHalted,
  };
};
