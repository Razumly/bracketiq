import { createHash } from "node:crypto";
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
  AffiliateAgentGatewayError,
  affiliateAgentRetryDelaySeconds,
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
  type AffiliateAgentSchemaCorrectionResult,
  type AffiliateAgentSubmitResultOutcome,
  type AffiliateAgentTerminalAcceptedResult,
} from "./agentGateway";
import type {
  AffiliateAgentClaimTokenScope,
  AffiliateAgentGatewayDependencies,
} from "./agentGatewayAdapters";
import {
  AFFILIATE_AGENT_PROMPT_TEMPLATES,
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  affiliateAgentClaimEnvelopeSchema,
  affiliateAgentContractBundleSchema,
  affiliateAgentCommandSchema,
  affiliateAgentEvidenceManifestSchema,
  affiliateAgentTerminalResultEnvelopeSchema,
  canonicalizeAffiliateAgentValue,
  hashAffiliateAgentValue,
  renderAffiliateAgentPrompt,
  type AffiliateAgentClaimEnvelope,
  type AffiliateAgentCommand,
  type AffiliateAgentContractBundle,
  type AffiliateAgentRoleContract,
  type AffiliateAgentTerminalResultEnvelope,
} from "./agentGatewayContracts";

const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

class AffiliateAgentClaimRaceError extends Error {}

const gatewayError = (
  code: ConstructorParameters<typeof AffiliateAgentGatewayError>[0]["code"],
  safeMessage: string,
  retryable = false,
  receiptId?: string,
): AffiliateAgentGatewayError =>
  new AffiliateAgentGatewayError({
    code,
    safeMessage,
    retryable,
    receiptId,
  });

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

const isClaimIdentityUniqueConflict = (error: unknown): boolean => {
  if (prismaErrorCode(error) !== "P2002") return false;
  const target = prismaUniqueTarget(error);
  const identityFields = new Set([
    "claimRequestId",
    "idempotencyKey",
    "invocationId",
    "workspaceId",
  ]);
  return target.some(
    (value) =>
      identityFields.has(value) ||
      [...identityFields].some((field) => value.includes(field)),
  );
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

const asPrismaJson = (value: unknown): Prisma.InputJsonValue =>
  // The canonicalizer rejects every value outside Prisma's JSON input domain.
  JSON.parse(canonicalizeAffiliateAgentValue(value)) as Prisma.InputJsonValue;

const addSeconds = (date: Date, seconds: number): Date =>
  new Date(date.getTime() + seconds * 1_000);

const assertIdentifier = (value: string, name: string): void => {
  if (!value.trim() || value.length > 200) {
    throw gatewayError("ROLE_NOT_ALLOWED", `${name} is invalid.`);
  }
};

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
  const supported =
    bundle.deploymentContract.gatewayVersion === 1 &&
    bundle.roleContracts.every((contract) => contract.version === 1) &&
    bundle.promptTemplates.every((template) => template.version === 1);
  if (!supported) {
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

const replayClaimGrant = (
  dependencies: AffiliateAgentGatewayDependencies,
  claim: ReplayableClaim,
  requestHash: string,
  bundle: AffiliateAgentContractBundle,
  roleContract: AffiliateAgentRoleContract,
): AffiliateAgentClaimGrant => {
  if (claim.claimRequestHash !== requestHash) {
    throw gatewayError(
      "IDEMPOTENCY_KEY_REUSED",
      "The claim idempotency key was used for different input.",
    );
  }
  if (claim.tokenKeyVersion !== dependencies.tokens.keyVersion) {
    throw gatewayError(
      "TOKEN_INVALID",
      "The claim token key version is not available.",
    );
  }
  const envelope = affiliateAgentClaimEnvelopeSchema.parse(
    claim.claimEnvelopeJson,
  );
  if (
    envelope.supplyContractVersion !== bundle.supplyContract.version ||
    envelope.supplyContractHash !== bundle.supplyContract.hash
  ) {
    throw gatewayError(
      "SUPPLY_CONTRACT_STALE",
      "The active Supply Contract changed after the claim.",
    );
  }
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

const validateClaimRequest = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: AffiliateAgentClaimRequest,
  now: Date,
): Promise<void> => {
  assertIdentifier(input.idempotencyKey, "Claim idempotency key");
  assertIdentifier(input.workerId, "Worker ID");
  assertIdentifier(input.invocationId, "Invocation ID");
  const attestation = input.workspaceAttestation;
  assertIdentifier(attestation.workspaceId, "Workspace ID");
  if (
    attestation.schemaVersion !== 1 ||
    attestation.executionClass !== "PRODUCTION_CODEX" ||
    attestation.workerId !== input.workerId ||
    attestation.invocationId !== input.invocationId
  ) {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "The workspace attestation does not match the claim request.",
    );
  }
  const issuedAt = new Date(attestation.issuedAt);
  const expiresAt = new Date(attestation.expiresAt);
  if (
    Number.isNaN(issuedAt.getTime()) ||
    Number.isNaN(expiresAt.getTime()) ||
    issuedAt > now ||
    expiresAt <= now ||
    !(await dependencies.workspaces.verify(attestation))
  ) {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "The workspace attestation is invalid or expired.",
    );
  }
  const credentialIsValid = await dependencies.credentials.verify({
    roleCredential: input.roleCredential,
    role: input.role,
    executionClass: attestation.executionClass,
    workerId: input.workerId,
    invocationId: input.invocationId,
  });
  if (!credentialIsValid) {
    throw gatewayError(
      "ROLE_CREDENTIAL_INVALID",
      "The role credential is invalid for this claim request.",
    );
  }
  if (input.role === "SUPPLY_REVIEWER" && attestation.mode !== "READ_ONLY") {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "Supply Reviewer work requires a read-only workspace.",
    );
  }
};

const claimAffiliateAgentJob = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: AffiliateAgentClaimRequest,
  bundle: AffiliateAgentContractBundle,
  roleContract: AffiliateAgentRoleContract,
  now: Date,
  requestHash: string,
): Promise<AffiliateAgentClaimGrant | null> => {
  const claimId = dependencies.identifiers.create("claim");
  const tokenNonce = dependencies.tokens.createNonce();
  const hardDeadlineAt = addSeconds(now, AFFILIATE_AGENT_HARD_DEADLINE_SECONDS);
  const leaseExpiresAt = new Date(
    Math.min(
      addSeconds(now, AFFILIATE_AGENT_LEASE_SECONDS).getTime(),
      hardDeadlineAt.getTime(),
    ),
  );

  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const stored = await dependencies.prisma.$transaction(
        async (transaction) => {
          const replay =
            await transaction.affiliateAgentGatewayClaims.findUnique({
              where: { claimRequestId: input.idempotencyKey },
            });
          if (replay) {
            return { kind: "REPLAY" as const, claim: replay };
          }

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
          if (
            reusedIdentity?.workspaceId ===
            input.workspaceAttestation.workspaceId
          ) {
            throw gatewayError(
              "REVIEW_WORKSPACE_INVALID",
              "The workspace identity was already used by another claim request.",
            );
          }

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
          const liveClaims =
            await transaction.affiliateAgentGatewayClaims.findMany({
              where: { status: "ACTIVE" },
              select: { jobId: true },
            });
          const liveJobIds = new Set<string>();
          if (
            liveClaims.some(({ jobId }) => {
              if (liveJobIds.has(jobId)) return true;
              liveJobIds.add(jobId);
              return false;
            })
          ) {
            throw gatewayError(
              "GATEWAY_ADMISSION_HALTED",
              "Gateway admission is halted because one job has duplicate live claims.",
            );
          }
          const haltedJobs =
            await transaction.affiliateAgentGatewayJobs.findMany({
              where: { status: "RECONCILIATION_REQUIRED" },
              select: { lane: true },
            });
          const haltedLanes = [...new Set(haltedJobs.map(({ lane }) => lane))];

          const job = await transaction.affiliateAgentGatewayJobs.findFirst({
            where: {
              role: input.role,
              status: { in: ["QUEUED", "RETRY_WAIT"] },
              activeClaimId: null,
              nextAttemptAt: { lte: now },
              lane:
                haltedLanes.length === 0 ? undefined : { notIn: haltedLanes },
            },
            orderBy: [
              { priority: "desc" },
              { createdAt: "asc" },
              { id: "asc" },
            ],
          });
          if (!job) return { kind: "NO_WORK" as const };

          const evidenceManifestResult =
            affiliateAgentEvidenceManifestSchema.safeParse(
              job.evidenceManifestJson,
            );
          if (!evidenceManifestResult.success) {
            throw gatewayError(
              input.role === "SUPPLY_REVIEWER"
                ? "REVIEW_WORKSPACE_INVALID"
                : "DEPLOYMENT_CONTRACT_STALE",
              "The claim evidence manifest is invalid.",
            );
          }
          const evidenceManifest = evidenceManifestResult.data;
          if (input.role === "SUPPLY_REVIEWER") {
            const subject =
              job.subjectJson !== null &&
              typeof job.subjectJson === "object" &&
              !Array.isArray(job.subjectJson)
                ? job.subjectJson
                : null;
            const producerWorkerId =
              subject && "producerWorkerId" in subject
                ? subject.producerWorkerId
                : null;
            const producerInvocationId =
              subject && "producerInvocationId" in subject
                ? subject.producerInvocationId
                : null;
            const producerWorkspaceId =
              subject && "producerWorkspaceId" in subject
                ? subject.producerWorkspaceId
                : null;
            if (
              producerWorkerId === input.workerId ||
              producerInvocationId === input.invocationId
            ) {
              throw gatewayError(
                "PRODUCER_REVIEWER_IDENTITY_REUSED",
                "The reviewer worker and invocation must differ from the producer.",
              );
            }
            if (
              producerWorkspaceId === input.workspaceAttestation.workspaceId
            ) {
              throw gatewayError(
                "REVIEW_WORKSPACE_INVALID",
                "The reviewer workspace must differ from the producer workspace.",
              );
            }
            const manifestKinds = evidenceManifest.entries.map(
              (entry) => entry.kind,
            );
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
            if (
              manifestKinds.some((kind) => allowedKinds[kind] !== true) ||
              requiredKinds.some((kind) => !manifestKinds.includes(kind))
            ) {
              throw gatewayError(
                "REVIEW_WORKSPACE_INVALID",
                "The reviewer manifest must contain only committed review evidence.",
              );
            }
          }
          if (job.expectedLifecycleGeneration !== null) {
            if (
              !job.supplySourceId ||
              dependencies.lifecycle.kind !== "AVAILABLE" ||
              (await dependencies.lifecycle.currentGeneration(
                job.supplySourceId,
              )) !== job.expectedLifecycleGeneration
            ) {
              throw gatewayError(
                "LIFECYCLE_GENERATION_STALE",
                "The Supply Source lifecycle generation is stale.",
              );
            }
          }
          const claimGeneration = job.claimGeneration + 1;
          const envelope = affiliateAgentClaimEnvelopeSchema.parse({
            schemaVersion: 1,
            queue: job.queue,
            lane: job.lane,
            jobId: job.id,
            claimId,
            supplySourceId: job.supplySourceId,
            claimGeneration,
            lifecycleGeneration: job.expectedLifecycleGeneration,
            deploymentContractVersion: bundle.deploymentContract.version,
            deploymentContractHash: bundle.deploymentContract.hash,
            supplyContractVersion: bundle.supplyContract.version,
            supplyContractHash: bundle.supplyContract.hash,
            roleContractVersion: roleContract.version,
            roleContractHash: roleContract.hash,
            promptTemplateVersion: roleContract.promptTemplateVersion,
            promptTemplateHash: roleContract.promptTemplateHash,
            role: input.role,
            executionClass: "PRODUCTION_CODEX",
            workerId: input.workerId,
            invocationId: input.invocationId,
            workspaceId: input.workspaceAttestation.workspaceId,
            claimedAt: now.toISOString(),
            expiresAt: hardDeadlineAt.toISOString(),
            evidenceManifest,
            subject: job.subjectJson,
            permittedCommands: roleContract.permittedCommands,
          });
          const tokenScope = tokenScopeForEnvelope(envelope);
          const claimed =
            await transaction.affiliateAgentGatewayJobs.updateMany({
              where: {
                id: job.id,
                status: { in: ["QUEUED", "RETRY_WAIT"] },
                activeClaimId: null,
                claimGeneration: job.claimGeneration,
                nextAttemptAt: { lte: now },
              },
              data: {
                status: "CLAIMED",
                activeClaimId: claimId,
                claimGeneration: { increment: 1 },
                terminalReceiptId: null,
                eventSequence: { increment: 1 },
              },
            });
          if (claimed.count !== 1) throw new AffiliateAgentClaimRaceError();

          const claim = await transaction.affiliateAgentGatewayClaims.create({
            data: {
              id: claimId,
              jobId: job.id,
              parentClaimId: job.parentClaimId,
              claimGeneration,
              lifecycleGeneration: job.expectedLifecycleGeneration,
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
              claimedAt: now,
              lastHeartbeatAt: now,
              leaseExpiresAt,
              hardDeadlineAt,
              endedAt: null,
              tokenNonce,
              tokenHash: dependencies.tokens.hashFor(tokenScope, tokenNonce),
              tokenKeyVersion: dependencies.tokens.keyVersion,
              tokenExpiresAt: hardDeadlineAt,
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
              evidenceManifestHash: evidenceManifest.hash,
              permittedCommandHash: tokenScope.permittedCommandHash,
              permittedCommands: [...roleContract.permittedCommands],
              schemaCorrectionCount: 0,
              terminalReceiptId: null,
              safeFailureCode: null,
              safeFailureSummary: null,
              diagnosticRetainUntil: null,
            },
          });

          if (evidenceManifest.entries.length > 0) {
            await transaction.affiliateAgentGatewayArtifacts.createMany({
              data: evidenceManifest.entries.map((entry) => ({
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
                retentionClass: entry.retention,
                isPinned: true,
              })),
            });
          }

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
              requestHash,
              inputHash: hashAffiliateAgentValue(envelope.subject),
              outputHash: hashAffiliateAgentValue({
                claimId,
                claimGeneration,
                leaseExpiresAt: leaseExpiresAt.toISOString(),
                hardDeadlineAt: hardDeadlineAt.toISOString(),
              }),
              payload: asPrismaJson({
                claimGeneration,
                workspaceId: input.workspaceAttestation.workspaceId,
              }),
              retentionClass: "INDEFINITE",
            },
          });
          return { kind: "CLAIMED" as const, claim, envelope };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      if (stored.kind === "NO_WORK") return null;
      if (stored.kind === "REPLAY") {
        return replayClaimGrant(
          dependencies,
          stored.claim,
          requestHash,
          bundle,
          roleContract,
        );
      }
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
    } catch (error) {
      const identityConflict = isClaimIdentityUniqueConflict(error);
      const jobRaceConflict = isClaimJobRaceUniqueConflict(error);
      const retryableConflict =
        error instanceof AffiliateAgentClaimRaceError ||
        prismaErrorCode(error) === "P2034" ||
        identityConflict;
      if (retryableConflict && attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS) {
        continue;
      }
      if (
        error instanceof AffiliateAgentClaimRaceError ||
        prismaErrorCode(error) === "P2034" ||
        jobRaceConflict
      ) {
        return null;
      }
      if (error instanceof AffiliateAgentGatewayError) throw error;
      throw gatewayError(
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
  bundle: AffiliateAgentContractBundle;
  roleContract: AffiliateAgentRoleContract;
}>;

type ClaimAuthorizationOptions = Readonly<{
  terminalReplayReceiptId?: string;
}>;

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

const authorizeClaimOperation = async (
  dependencies: AffiliateAgentGatewayDependencies,
  authorization: AffiliateAgentClaimAuthorization,
  now: Date,
  client: PrismaClient | Prisma.TransactionClient = dependencies.prisma,
  options: ClaimAuthorizationOptions = {},
): Promise<AuthorizedClaim> => {
  const claim = await client.affiliateAgentGatewayClaims.findUnique({
    where: { id: authorization.claimId },
  });
  if (!claim) {
    throw gatewayError("CLAIM_NOT_FOUND", "The claim does not exist.");
  }
  if (!dependencies.tokens.matches(authorization.token, claim.tokenHash)) {
    throw gatewayError("TOKEN_INVALID", "The claim token is invalid.");
  }
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
  const isTerminalReplay =
    options.terminalReplayReceiptId !== undefined &&
    ["COMPLETED", "FAILED"].includes(claim.status) &&
    claim.endedAt !== null &&
    claim.tokenInvalidatedAt !== null &&
    claim.terminalReceiptId === options.terminalReplayReceiptId;
  if (claim.hardDeadlineAt < now) {
    throw gatewayError(
      "HARD_DEADLINE_EXCEEDED",
      "The claim hard deadline has passed.",
    );
  }
  if (claim.tokenExpiresAt <= now) {
    throw gatewayError("TOKEN_EXPIRED", "The claim token has expired.");
  }
  if (claim.tokenInvalidatedAt !== null && !isTerminalReplay) {
    throw gatewayError("TOKEN_INVALIDATED", "The claim token is invalidated.");
  }
  if (claim.status !== "ACTIVE" && !isTerminalReplay) {
    throw gatewayError("CLAIM_NOT_ACTIVE", "The claim is not active.");
  }
  if (claim.leaseExpiresAt <= now) {
    throw gatewayError("LEASE_EXPIRED", "The claim lease has expired.");
  }

  const bundle = parseSupportedContractBundle(
    await dependencies.contracts.loadActiveBundle(),
  );
  if (
    bundle.supplyContract.version !== claim.supplyContractVersion ||
    bundle.supplyContract.hash !== claim.supplyContractHash
  ) {
    throw gatewayError(
      "SUPPLY_CONTRACT_STALE",
      "The active Supply Contract changed after the claim.",
    );
  }
  if (
    bundle.deploymentContract.version !== claim.deploymentContractVersion ||
    bundle.deploymentContract.hash !== claim.deploymentContractHash
  ) {
    throw gatewayError(
      "DEPLOYMENT_CONTRACT_STALE",
      "The active deployment contract changed after the claim.",
    );
  }
  const roleContract = activeRoleContract(bundle, authorization.role);
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

  if (claim.lifecycleGeneration !== null) {
    const supplySourceId = jobSupplySourceId(
      await client.affiliateAgentGatewayJobs.findUnique({
        where: { id: claim.jobId },
      }),
    );
    if (
      dependencies.lifecycle.kind !== "AVAILABLE" ||
      (await dependencies.lifecycle.currentGeneration(supplySourceId)) !==
        claim.lifecycleGeneration
    ) {
      throw gatewayError(
        "LIFECYCLE_GENERATION_STALE",
        "The Supply Source lifecycle generation changed after the claim.",
      );
    }
  }

  const job = await client.affiliateAgentGatewayJobs.findUnique({
    where: { id: claim.jobId },
  });
  const terminalJobMatchesClaim =
    claim.status === "COMPLETED"
      ? job?.status === "COMPLETED"
      : claim.status === "FAILED"
        ? job?.status === "RETRY_WAIT" || job?.status === "PIPELINE_BLOCKED"
        : false;
  const jobMatchesClaim = isTerminalReplay
    ? terminalJobMatchesClaim &&
      job?.activeClaimId === null &&
      job.claimGeneration === claim.claimGeneration &&
      job.terminalReceiptId === options.terminalReplayReceiptId
    : job?.status === "CLAIMED" &&
      job.activeClaimId === claim.id &&
      job.claimGeneration === claim.claimGeneration;
  if (!job || !jobMatchesClaim) {
    throw gatewayError("CLAIM_NOT_ACTIVE", "The claim is not active.");
  }
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
  return {
    claim,
    job,
    envelope: envelopeResult.data,
    bundle,
    roleContract,
  };
};

const jobSupplySourceId = (job: AffiliateAgentGatewayJobs | null): string => {
  if (!job?.supplySourceId) {
    throw gatewayError(
      "LIFECYCLE_GENERATION_STALE",
      "The claim has no Supply Source lifecycle scope.",
    );
  }
  return job.supplySourceId;
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

const performHeartbeat = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "HEARTBEAT" }>,
): Promise<AffiliateAgentHeartbeatResult> => {
  assertIdentifier(input.idempotencyKey, "Operation idempotency key");
  const now = dependencies.clock.now();
  const requestHash = operationRequestHash(input);

  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await dependencies.prisma.$transaction(
        async (transaction) => {
          const authorized = await authorizeClaimOperation(
            dependencies,
            input.authorization,
            now,
            transaction,
          );
          const leaseExpiresAt = new Date(
            Math.min(
              addSeconds(now, AFFILIATE_AGENT_LEASE_SECONDS).getTime(),
              authorized.claim.hardDeadlineAt.getTime(),
            ),
          );
          const existing =
            await transaction.affiliateAgentGatewayOperationReceipts.findUnique(
              {
                where: {
                  claimId_idempotencyKey: {
                    claimId: authorized.claim.id,
                    idempotencyKey: input.idempotencyKey,
                  },
                },
              },
            );
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
            if (existing.status === "SUCCEEDED") {
              return replayHeartbeat(existing.responseJson);
            }
            throw gatewayError(
              "OPERATION_IN_PROGRESS",
              "The operation is still in progress.",
              true,
            );
          }

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
    } catch (error) {
      const retryableConflict =
        error instanceof AffiliateAgentClaimRaceError ||
        prismaErrorCode(error) === "P2034";
      if (retryableConflict && attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS) {
        continue;
      }
      if (error instanceof AffiliateAgentGatewayError) throw error;
      throw gatewayError(
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
  if (read.sourceUrl !== null) {
    let sourceUrl: URL;
    try {
      sourceUrl = new URL(read.sourceUrl);
    } catch {
      throw gatewayError(
        "ARTIFACT_INTEGRITY_FAILED",
        "The artifact source URL is invalid.",
      );
    }
    if (
      !["http:", "https:"].includes(sourceUrl.protocol) ||
      sourceUrl.username !== "" ||
      sourceUrl.password !== "" ||
      read.sourceUrl.length > 2_048
    ) {
      throw gatewayError(
        "ARTIFACT_INTEGRITY_FAILED",
        "The artifact source URL is not safe.",
      );
    }
  }
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

const performArtifactRead = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "READ_ARTIFACT" }>,
): Promise<AffiliateAgentArtifactReadResult> => {
  assertIdentifier(input.idempotencyKey, "Operation idempotency key");
  assertIdentifier(input.evidenceRef, "Evidence reference");
  const now = dependencies.clock.now();
  const requestHash = operationRequestHash(input);
  const reserved = await dependencies.prisma.$transaction(
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
          replayed: true,
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
      return { authorized, artifact, receiptId, replayed: false };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
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
    throw gatewayError(
      "ARTIFACT_INTEGRITY_FAILED",
      "The artifact could not be read safely.",
    );
  }

  if (!reserved.replayed) {
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
            const responseMetadata = {
              kind: "ARTIFACT_READ" as const,
              receiptId: reserved.receiptId,
              evidenceRef: input.evidenceRef,
              sha256: reserved.artifact.contentHash,
              mimeType: reserved.artifact.mimeType,
              byteSize: reserved.artifact.byteSize,
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
            prismaErrorCode(error) === "P2034") &&
          attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS
        ) {
          continue;
        }
        if (error instanceof AffiliateAgentGatewayError) throw error;
        throw gatewayError(
          "INTERNAL_ERROR",
          "The artifact receipt could not be completed.",
          true,
        );
      }
    }
  }

  return {
    kind: "ARTIFACT_READ",
    receiptId: reserved.receiptId,
    evidenceRef: input.evidenceRef,
    sha256: reserved.artifact.contentHash,
    mimeType: reserved.artifact.mimeType,
    byteSize: reserved.artifact.byteSize,
    bytes: read.bytes,
  };
};

const replayCommand = (
  response: Prisma.JsonValue | null,
): AffiliateAgentCommandResult => {
  if (
    response === null ||
    typeof response !== "object" ||
    Array.isArray(response) ||
    response.kind !== "COMMAND_SUCCEEDED" ||
    typeof response.receiptId !== "string" ||
    typeof response.commandType !== "string" ||
    typeof response.responseHash !== "string" ||
    (response.safeOutput !== null &&
      (typeof response.safeOutput !== "object" ||
        Array.isArray(response.safeOutput)))
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored command receipt is invalid.",
    );
  }
  const commandType = (
    [
      "RUN_DISCOVERY_QUERY",
      "CAPTURE_CLAIM_URL",
      "VALIDATE_DECLARATIVE_PACKAGE",
      "COMMIT_DECLARATIVE_PACKAGE",
      "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
    ] as const
  ).find((candidate) => candidate === response.commandType);
  if (!commandType) {
    throw gatewayError("INTERNAL_ERROR", "The stored command type is invalid.");
  }
  const safeOutput =
    response.safeOutput === null
      ? null
      : (JSON.parse(
          canonicalizeAffiliateAgentValue(response.safeOutput),
        ) as Readonly<Record<string, unknown>>);
  return {
    kind: "COMMAND_SUCCEEDED",
    receiptId: response.receiptId,
    commandType,
    responseHash: response.responseHash,
    safeOutput,
  };
};

type RecoveredCaptureOutput = Readonly<{
  evidenceRef: string;
  artifactId: string;
  sha256: string;
  mimeType: string;
  byteSize: number;
}>;

const parseRecoveredCaptureOutput = (
  value: Readonly<Record<string, unknown>>,
): RecoveredCaptureOutput => {
  const allowedKeys: Readonly<Record<string, true>> = {
    artifactId: true,
    byteSize: true,
    evidenceRef: true,
    mimeType: true,
    sha256: true,
  };
  if (
    Object.keys(value).some((key) => allowedKeys[key] !== true) ||
    typeof value.evidenceRef !== "string" ||
    typeof value.artifactId !== "string" ||
    typeof value.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    typeof value.mimeType !== "string" ||
    value.mimeType.length === 0 ||
    typeof value.byteSize !== "number" ||
    !Number.isInteger(value.byteSize) ||
    value.byteSize < 0
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered capture output is invalid.",
    );
  }
  assertIdentifier(value.evidenceRef, "Capture evidence reference");
  assertIdentifier(value.artifactId, "Capture artifact identifier");
  return {
    evidenceRef: value.evidenceRef,
    artifactId: value.artifactId,
    sha256: value.sha256,
    mimeType: value.mimeType,
    byteSize: value.byteSize,
  };
};

const performExternalCommand = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: Extract<AffiliateAgentCommand, { type: "CAPTURE_CLAIM_URL" }>,
): Promise<AffiliateAgentCommandResult> => {
  const adapter = dependencies.commands.external.CAPTURE_CLAIM_URL;
  if (!adapter) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The capture command has no installed external adapter.",
    );
  }
  const now = dependencies.clock.now();
  const requestHash = operationRequestHash(input);
  const reserved = await dependencies.prisma.$transaction(
    async (transaction) => {
      const authorized = await authorizeClaimOperation(
        dependencies,
        input.authorization,
        now,
        transaction,
      );
      if (
        !authorized.roleContract.permittedCommands.includes(command.type) ||
        !authorized.claim.permittedCommands.includes(command.type)
      ) {
        throw gatewayError(
          "COMMAND_NOT_PERMITTED",
          "The capture command is not permitted for this claim.",
        );
      }
      for (const evidenceRef of new Set([
        command.data.urlRef,
        command.data.captureProfileRef,
      ])) {
        const scopedArtifact =
          await transaction.affiliateAgentGatewayArtifacts.findUnique({
            where: {
              claimId_evidenceRef: {
                claimId: authorized.claim.id,
                evidenceRef,
              },
            },
          });
        if (!scopedArtifact) {
          throw gatewayError(
            "COMMAND_NOT_PERMITTED",
            "The capture command references data outside the claim manifest.",
          );
        }
      }
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
        return {
          kind: "RESERVED" as const,
          receiptId: existing.id,
          externalOperationKey: existing.externalOperationKey,
          replayed: true,
          claimId: authorized.claim.id,
          jobId: authorized.job.id,
          claimGeneration: authorized.claim.claimGeneration,
          envelope: authorized.envelope,
          invocationId: authorized.claim.invocationId,
          role: authorized.claim.role,
        };
      }

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
          inputHash: hashAffiliateAgentValue(command),
          payload: asPrismaJson({ commandType: command.type }),
          retentionClass: "INDEFINITE",
        },
      });
      return {
        kind: "RESERVED" as const,
        receiptId,
        externalOperationKey,
        replayed: false,
        claimId: authorized.claim.id,
        jobId: authorized.job.id,
        claimGeneration: authorized.claim.claimGeneration,
        envelope: authorized.envelope,
        invocationId: authorized.claim.invocationId,
        role: authorized.claim.role,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  if (reserved.kind === "COMPLETED") return reserved.result;

  let recovered: Readonly<Record<string, unknown>> | null;
  try {
    recovered = reserved.replayed
      ? await adapter.recover(reserved.externalOperationKey)
      : await adapter.start(reserved.externalOperationKey, {
          claim: reserved.envelope,
          command,
        });
  } catch {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The capture response was lost and requires recovery.",
      true,
      reserved.receiptId,
    );
  }
  if (recovered === null) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The capture effect is unknown and requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
  const capture = parseRecoveredCaptureOutput(recovered);
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
  return dependencies.prisma.$transaction(
    async (transaction) => {
      const receipt =
        await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
          where: { id: reserved.receiptId },
        });
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
          "The capture receipt requires reconciliation.",
          false,
          reserved.receiptId,
        );
      }
      if (receipt.status === "SUCCEEDED") {
        return replayCommand(receipt.responseJson);
      }
      if (receipt.status !== "PENDING") {
        throw gatewayError(
          "PARTIAL_COMMAND_UNRESOLVED",
          "The capture receipt requires reconciliation.",
          false,
          reserved.receiptId,
        );
      }
      const job = await transaction.affiliateAgentGatewayJobs.findUnique({
        where: { id: reserved.jobId },
      });
      if (
        !job ||
        job.status !== "CLAIMED" ||
        job.activeClaimId !== reserved.claimId ||
        job.claimGeneration !== reserved.claimGeneration
      ) {
        throw gatewayError(
          "PARTIAL_COMMAND_UNRESOLVED",
          "The capture claim requires reconciliation.",
          false,
          reserved.receiptId,
        );
      }
      const artifact =
        await transaction.affiliateAgentGatewayArtifacts.findUnique({
          where: {
            claimId_evidenceRef: {
              claimId: reserved.claimId,
              evidenceRef: capture.evidenceRef,
            },
          },
        });
      if (
        artifact &&
        (artifact.fileId !== capture.artifactId ||
          artifact.contentHash !== capture.sha256)
      ) {
        throw gatewayError(
          "PARTIAL_COMMAND_UNRESOLVED",
          "The recovered artifact conflicts with stored claim evidence.",
          false,
          reserved.receiptId,
        );
      }
      if (!artifact) {
        await transaction.affiliateAgentGatewayArtifacts.createMany({
          data: [
            {
              id: dependencies.identifiers.create("artifact"),
              claimId: reserved.claimId,
              claimGeneration: reserved.claimGeneration,
              evidenceRef: capture.evidenceRef,
              evidenceKind: "CAPTURED_PAGE",
              sourceArtifactId: capture.artifactId,
              fileId: capture.artifactId,
              contentHash: capture.sha256,
              mimeType: capture.mimeType,
              byteSize: capture.byteSize,
              retentionClass: "INDEFINITE",
            },
          ],
        });
      }
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
            completedAt: now,
            reconcileAfter: null,
          },
        });
      const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany(
        {
          where: {
            id: reserved.jobId,
            status: "CLAIMED",
            activeClaimId: reserved.claimId,
            claimGeneration: reserved.claimGeneration,
            eventSequence: job.eventSequence,
          },
          data: { eventSequence: { increment: 1 } },
        },
      );
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
          sequence: job.eventSequence + 1,
          eventType: "EXTERNAL_COMMAND_SUCCEEDED",
          actorKind: "AGENT_INVOCATION",
          actorId: reserved.invocationId,
          role: reserved.role,
          requestHash,
          inputHash: hashAffiliateAgentValue(command),
          outputHash: responseHash,
          payload: asPrismaJson({ evidenceRef: capture.evidenceRef }),
          retentionClass: "INDEFINITE",
        },
      });
      return commandResult;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
};

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
  const now = dependencies.clock.now();
  const requestHash = operationRequestHash(input);
  const reserved = await dependencies.prisma.$transaction(
    async (transaction) => {
      const authorized = await authorizeClaimOperation(
        dependencies,
        input.authorization,
        now,
        transaction,
      );
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
      const subject = authorized.envelope.subject;
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
        return {
          kind: "RESERVED" as const,
          receiptId: existing.id,
          replayed: true,
          claimId: authorized.claim.id,
          jobId: authorized.job.id,
          claimGeneration: authorized.claim.claimGeneration,
          expectedGeneration: authorized.claim.lifecycleGeneration,
          inputHash: hashAffiliateAgentValue(command),
          commandRef: command.data.lifecycleCommandRef,
          recordedHumanActorId: subject.recordedHumanActorId,
          invocationId: authorized.claim.invocationId,
          role: authorized.claim.role,
        };
      }

      const receiptId = dependencies.identifiers.create("receipt");
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
          inputHash: hashAffiliateAgentValue(command),
          payload: asPrismaJson({
            caseId: subject.caseId,
            recordedHumanActorId: subject.recordedHumanActorId,
          }),
          retentionClass: "INDEFINITE",
        },
      });
      return {
        kind: "RESERVED" as const,
        receiptId,
        replayed: false,
        claimId: authorized.claim.id,
        jobId: authorized.job.id,
        claimGeneration: authorized.claim.claimGeneration,
        expectedGeneration: authorized.claim.lifecycleGeneration,
        inputHash: hashAffiliateAgentValue(command),
        commandRef: command.data.lifecycleCommandRef,
        recordedHumanActorId: subject.recordedHumanActorId,
        invocationId: authorized.claim.invocationId,
        role: authorized.claim.role,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  if (reserved.kind === "COMPLETED") return reserved.result;

  let safeOutput: Readonly<Record<string, unknown>> | null;
  try {
    safeOutput = reserved.replayed
      ? await authority.recover(reserved.receiptId)
      : await authority.execute({
          receiptId: reserved.receiptId,
          expectedGeneration: reserved.expectedGeneration,
          inputHash: reserved.inputHash,
          commandRef: reserved.commandRef,
        });
  } catch {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The lifecycle command response was lost and requires reconciliation.",
      true,
      reserved.receiptId,
    );
  }
  if (safeOutput === null) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The lifecycle command effect is unknown and requires reconciliation.",
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

  return dependencies.prisma.$transaction(
    async (transaction) => {
      const receipt =
        await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
          where: { id: reserved.receiptId },
        });
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
      if (receipt.status === "SUCCEEDED") {
        return replayCommand(receipt.responseJson);
      }
      if (receipt.status !== "PENDING") {
        throw gatewayError(
          "PARTIAL_COMMAND_UNRESOLVED",
          "The lifecycle receipt requires reconciliation.",
          false,
          reserved.receiptId,
        );
      }
      const job = await transaction.affiliateAgentGatewayJobs.findUnique({
        where: { id: reserved.jobId },
      });
      if (
        !job ||
        job.status !== "CLAIMED" ||
        job.activeClaimId !== reserved.claimId ||
        job.claimGeneration !== reserved.claimGeneration
      ) {
        throw gatewayError(
          "PARTIAL_COMMAND_UNRESOLVED",
          "The lifecycle claim requires reconciliation.",
          false,
          reserved.receiptId,
        );
      }
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
            completedAt: now,
            reconcileAfter: null,
          },
        });
      const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany(
        {
          where: {
            id: reserved.jobId,
            status: "CLAIMED",
            activeClaimId: reserved.claimId,
            claimGeneration: reserved.claimGeneration,
            eventSequence: job.eventSequence,
          },
          data: { eventSequence: { increment: 1 } },
        },
      );
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
          sequence: job.eventSequence + 1,
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
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
};

const performCommand = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
): Promise<AffiliateAgentCommandResult> => {
  assertIdentifier(input.idempotencyKey, "Operation idempotency key");
  const parsedCommand = affiliateAgentCommandSchema.safeParse(input.command);
  if (!parsedCommand.success) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The command does not match an allowed command schema.",
    );
  }
  if (parsedCommand.data.type === "CAPTURE_CLAIM_URL") {
    return performExternalCommand(dependencies, input, parsedCommand.data);
  }
  if (parsedCommand.data.type === "EXECUTE_RECORDED_LIFECYCLE_COMMAND") {
    return performLifecycleCommand(dependencies, input, parsedCommand.data);
  }
  if (
    parsedCommand.data.type !== "RUN_DISCOVERY_QUERY" &&
    parsedCommand.data.type !== "VALIDATE_DECLARATIVE_PACKAGE" &&
    parsedCommand.data.type !== "COMMIT_DECLARATIVE_PACKAGE"
  ) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The command is not available through a transactional adapter.",
    );
  }
  const transactionalCommand = parsedCommand.data;
  const now = dependencies.clock.now();
  const requestHash = operationRequestHash(input);

  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await dependencies.prisma.$transaction(
        async (transaction) => {
          const authorized = await authorizeClaimOperation(
            dependencies,
            input.authorization,
            now,
            transaction,
          );
          if (
            !authorized.roleContract.permittedCommands.includes(
              transactionalCommand.type,
            ) ||
            !authorized.claim.permittedCommands.includes(
              transactionalCommand.type,
            )
          ) {
            throw gatewayError(
              "COMMAND_NOT_PERMITTED",
              "The command is not permitted for this claim.",
            );
          }
          const existing =
            await transaction.affiliateAgentGatewayOperationReceipts.findUnique(
              {
                where: {
                  claimId_idempotencyKey: {
                    claimId: authorized.claim.id,
                    idempotencyKey: input.idempotencyKey,
                  },
                },
              },
            );
          if (existing) {
            if (
              existing.operationKind !== input.kind ||
              existing.commandName !== transactionalCommand.type ||
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
          }

          const receiptId = dependencies.identifiers.create("receipt");
          let safeOutput: Readonly<Record<string, unknown>> | null;
          if (transactionalCommand.type === "RUN_DISCOVERY_QUERY") {
            for (const evidenceRef of new Set([
              transactionalCommand.data.strategyRef,
              transactionalCommand.data.queryRef,
            ])) {
              const scopedArtifact =
                await transaction.affiliateAgentGatewayArtifacts.findUnique({
                  where: {
                    claimId_evidenceRef: {
                      claimId: authorized.claim.id,
                      evidenceRef,
                    },
                  },
                });
              if (!scopedArtifact) {
                throw gatewayError(
                  "COMMAND_NOT_PERMITTED",
                  "The command references data outside the claim manifest.",
                );
              }
            }
            const adapter =
              dependencies.commands.transactional.RUN_DISCOVERY_QUERY;
            if (!adapter) {
              throw gatewayError(
                "COMMAND_NOT_PERMITTED",
                "The command has no installed transactional adapter.",
              );
            }
            safeOutput = await adapter.execute({
              transaction,
              claim: authorized.envelope,
              command: transactionalCommand,
              receiptId,
            });
          } else if (
            transactionalCommand.type === "VALIDATE_DECLARATIVE_PACKAGE"
          ) {
            if (
              transactionalCommand.data.evidenceManifestHash !==
              authorized.envelope.evidenceManifest.hash
            ) {
              throw gatewayError(
                "COMMAND_NOT_PERMITTED",
                "The package validation manifest does not match the claim.",
              );
            }
            for (const evidenceRef of transactionalCommand.data.candidatePackage
              .evidenceRefs) {
              const scopedArtifact =
                await transaction.affiliateAgentGatewayArtifacts.findUnique({
                  where: {
                    claimId_evidenceRef: {
                      claimId: authorized.claim.id,
                      evidenceRef,
                    },
                  },
                });
              if (!scopedArtifact) {
                throw gatewayError(
                  "COMMAND_NOT_PERMITTED",
                  "The package references evidence outside the claim manifest.",
                );
              }
            }
            const adapter =
              dependencies.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE;
            if (!adapter) {
              throw gatewayError(
                "COMMAND_NOT_PERMITTED",
                "The command has no installed transactional adapter.",
              );
            }
            safeOutput = await adapter.execute({
              transaction,
              claim: authorized.envelope,
              command: transactionalCommand,
              receiptId,
            });
          } else {
            const validationReceipt =
              await transaction.affiliateAgentGatewayOperationReceipts.findUnique(
                {
                  where: {
                    id: transactionalCommand.data.validationReceiptId,
                  },
                },
              );
            const validationOutput =
              validationReceipt?.responseJson !== null &&
              typeof validationReceipt?.responseJson === "object" &&
              !Array.isArray(validationReceipt.responseJson) &&
              "safeOutput" in validationReceipt.responseJson &&
              validationReceipt.responseJson.safeOutput !== null &&
              typeof validationReceipt.responseJson.safeOutput === "object" &&
              !Array.isArray(validationReceipt.responseJson.safeOutput)
                ? validationReceipt.responseJson.safeOutput
                : null;
            if (
              validationReceipt?.claimId !== authorized.claim.id ||
              validationReceipt.status !== "SUCCEEDED" ||
              validationReceipt.commandName !==
                "VALIDATE_DECLARATIVE_PACKAGE" ||
              validationOutput?.validatedPackageHash !==
                transactionalCommand.data.validatedPackageHash
            ) {
              throw gatewayError(
                "COMMAND_NOT_PERMITTED",
                "The package commit does not match a successful validation receipt.",
              );
            }
            const adapter =
              dependencies.commands.transactional.COMMIT_DECLARATIVE_PACKAGE;
            if (!adapter) {
              throw gatewayError(
                "COMMAND_NOT_PERMITTED",
                "The command has no installed transactional adapter.",
              );
            }
            safeOutput = await adapter.execute({
              transaction,
              claim: authorized.envelope,
              command: transactionalCommand,
              receiptId,
            });
          }

          const canonicalOutput = canonicalizeAffiliateAgentValue(safeOutput);
          if (Buffer.byteLength(canonicalOutput, "utf8") > 16_384) {
            throw gatewayError(
              "INTERNAL_ERROR",
              "The command output exceeded the safe receipt limit.",
            );
          }
          const responseHash = hashAffiliateAgentValue({
            commandType: transactionalCommand.type,
            safeOutput,
          });
          const commandResult: AffiliateAgentCommandResult = {
            kind: "COMMAND_SUCCEEDED",
            receiptId,
            commandType: transactionalCommand.type,
            responseHash,
            safeOutput,
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
              commandName: transactionalCommand.type,
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
              eventKey: `command:${receiptId}`,
              jobId: authorized.job.id,
              claimId: authorized.claim.id,
              receiptId,
              sequence: authorized.job.eventSequence + 1,
              eventType: "CLAIM_COMMAND_SUCCEEDED",
              actorKind: "AGENT_INVOCATION",
              actorId: authorized.claim.invocationId,
              role: authorized.claim.role,
              requestHash,
              inputHash: hashAffiliateAgentValue(transactionalCommand),
              outputHash: responseHash,
              payload: asPrismaJson({
                commandType: transactionalCommand.type,
              }),
              retentionClass: "INDEFINITE",
            },
          });
          return commandResult;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const retryableConflict =
        error instanceof AffiliateAgentClaimRaceError ||
        prismaErrorCode(error) === "P2034";
      if (retryableConflict && attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS) {
        continue;
      }
      if (error instanceof AffiliateAgentGatewayError) throw error;
      throw gatewayError(
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

const replayTerminalResult = (
  response: Prisma.JsonValue | null,
  roleContract: AffiliateAgentRoleContract,
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
  const disposition = roleContract.terminalDispositions.find(
    (candidate) => candidate === response.disposition,
  );
  if (!disposition) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored terminal disposition is invalid.",
    );
  }
  return {
    kind: "TERMINAL_ACCEPTED",
    receiptId: response.receiptId,
    resultHash: response.resultHash,
    disposition,
    completedAt: response.completedAt,
  };
};

const replaySchemaCorrection = (
  response: Prisma.JsonValue | null,
): AffiliateAgentSchemaCorrectionResult => {
  if (
    response === null ||
    typeof response !== "object" ||
    Array.isArray(response) ||
    response.kind !== "SCHEMA_CORRECTION_REQUIRED" ||
    typeof response.receiptId !== "string" ||
    (response.submissionNumber !== 1 && response.submissionNumber !== 2) ||
    (response.remainingSubmissions !== 1 &&
      response.remainingSubmissions !== 2) ||
    !Array.isArray(response.issues) ||
    typeof response.correctionPrompt !== "string"
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored schema-correction receipt is invalid.",
    );
  }
  return JSON.parse(
    canonicalizeAffiliateAgentValue(response),
  ) as AffiliateAgentSchemaCorrectionResult;
};

const replayInvocationFailure = (
  response: Prisma.JsonValue | null,
): AffiliateAgentInvocationFailedResult => {
  if (
    response === null ||
    typeof response !== "object" ||
    Array.isArray(response) ||
    response.kind !== "INVOCATION_FAILED" ||
    typeof response.receiptId !== "string" ||
    typeof response.failureCode !== "string" ||
    ![1, 2, 3].includes(Number(response.invocationFailureCount)) ||
    (response.nextAttemptAt !== null &&
      typeof response.nextAttemptAt !== "string") ||
    typeof response.pipelineBlocked !== "boolean"
  ) {
    throw gatewayError(
      "INTERNAL_ERROR",
      "The stored invocation-failure receipt is invalid.",
    );
  }
  return JSON.parse(
    canonicalizeAffiliateAgentValue(response),
  ) as AffiliateAgentInvocationFailedResult;
};

const replaySubmitResult = (
  response: Prisma.JsonValue | null,
  roleContract: AffiliateAgentRoleContract,
): AffiliateAgentSubmitResultOutcome => {
  if (
    response !== null &&
    typeof response === "object" &&
    !Array.isArray(response)
  ) {
    if (response.kind === "TERMINAL_ACCEPTED") {
      return replayTerminalResult(response, roleContract);
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

const recordInvocationFailure = async (input: {
  dependencies: AffiliateAgentGatewayDependencies;
  transaction: Prisma.TransactionClient;
  authorized: AuthorizedClaim;
  idempotencyKey: string;
  operationKind: "SUBMIT_RESULT" | "RECORD_FAILURE";
  requestHash: string;
  failureCode: AffiliateAgentInvocationFailureCode;
  failedAt: Date;
  safeSummary: string;
  evidenceRefs: readonly string[];
  schemaCorrectionCount?: number;
}): Promise<AffiliateAgentInvocationFailedResult> => {
  const invocationFailureCount =
    input.authorized.job.invocationFailureCount + 1;
  if (invocationFailureCount < 1 || invocationFailureCount > 3) {
    throw gatewayError(
      "PIPELINE_BLOCKED",
      "The invocation retry budget is already exhausted.",
    );
  }
  const retryDelay = affiliateAgentRetryDelaySeconds(
    invocationFailureCount as 1 | 2 | 3,
  );
  const nextAttemptAt =
    retryDelay === null ? null : addSeconds(input.failedAt, retryDelay);
  const pipelineBlocked = retryDelay === null;
  const receiptId = input.dependencies.identifiers.create("receipt");
  const response: AffiliateAgentInvocationFailedResult = {
    kind: "INVOCATION_FAILED",
    receiptId,
    failureCode: input.failureCode,
    invocationFailureCount: invocationFailureCount as 1 | 2 | 3,
    nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
    pipelineBlocked,
  };
  const claimUpdated =
    await input.transaction.affiliateAgentGatewayClaims.updateMany({
      where: {
        id: input.authorized.claim.id,
        status: "ACTIVE",
        claimGeneration: input.authorized.claim.claimGeneration,
        tokenInvalidatedAt: null,
      },
      data: {
        status: "FAILED",
        terminalReceiptId: receiptId,
        tokenInvalidatedAt: input.failedAt,
        endedAt: input.failedAt,
        safeFailureCode: input.failureCode,
        safeFailureSummary: input.safeSummary,
        diagnosticRetainUntil: addSeconds(input.failedAt, 14 * 24 * 60 * 60),
        ...(input.schemaCorrectionCount === undefined
          ? {}
          : { schemaCorrectionCount: input.schemaCorrectionCount }),
      },
    });
  if (claimUpdated.count !== 1) {
    throw gatewayError(
      "CLAIM_NOT_ACTIVE",
      "The invocation failure lost the active claim compare-and-set.",
    );
  }
  const jobUpdated =
    await input.transaction.affiliateAgentGatewayJobs.updateMany({
      where: {
        id: input.authorized.job.id,
        status: "CLAIMED",
        activeClaimId: input.authorized.claim.id,
        claimGeneration: input.authorized.claim.claimGeneration,
        eventSequence: input.authorized.job.eventSequence,
      },
      data: {
        status: pipelineBlocked ? "PIPELINE_BLOCKED" : "RETRY_WAIT",
        activeClaimId: null,
        invocationFailureCount,
        lastInvocationFailedAt: input.failedAt,
        nextAttemptAt,
        pipelineBlockedAt: pipelineBlocked ? input.failedAt : null,
        terminalReceiptId: receiptId,
        finishedAt: pipelineBlocked ? input.failedAt : null,
        eventSequence: { increment: 1 },
      },
    });
  if (jobUpdated.count !== 1) throw new AffiliateAgentClaimRaceError();
  await input.transaction.affiliateAgentGatewayOperationReceipts.create({
    data: {
      id: receiptId,
      claimId: input.authorized.claim.id,
      jobId: input.authorized.job.id,
      claimGeneration: input.authorized.claim.claimGeneration,
      idempotencyKey: input.idempotencyKey,
      operationKind: input.operationKind,
      requestHash: input.requestHash,
      status: "SUCCEEDED",
      responseHash: hashAffiliateAgentValue(response),
      responseJson: asPrismaJson(response),
      startedAt: input.failedAt,
      completedAt: input.failedAt,
      retentionClass: "INDEFINITE",
    },
  });
  await input.transaction.affiliateAgentGatewayEvents.create({
    data: {
      id: input.dependencies.identifiers.create("event"),
      eventKey: `invocation-failure:${receiptId}`,
      jobId: input.authorized.job.id,
      claimId: input.authorized.claim.id,
      receiptId,
      sequence: input.authorized.job.eventSequence + 1,
      eventType: "CLAIM_INVOCATION_FAILED",
      actorKind: "AGENT_INVOCATION",
      actorId: input.authorized.claim.invocationId,
      role: input.authorized.claim.role,
      requestHash: input.requestHash,
      outputHash: hashAffiliateAgentValue(response),
      reasonCodes: [input.failureCode],
      payload: asPrismaJson({
        invocationFailureCount,
        nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
        pipelineBlocked,
      }),
      retentionClass: "INDEFINITE",
    },
  });
  return response;
};

const validateTerminalResultScope = (
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
  if (result.supplyContractHash !== authorized.claim.supplyContractHash) {
    throw gatewayError(
      "SUPPLY_CONTRACT_STALE",
      "The terminal result Supply Contract is stale.",
    );
  }
  if (
    result.roleContractVersion !== authorized.claim.roleContractVersion ||
    result.roleContractHash !== authorized.claim.roleContractHash
  ) {
    throw gatewayError(
      "DEPLOYMENT_CONTRACT_STALE",
      "The terminal result role contract is stale.",
    );
  }
  if (
    !authorized.roleContract.terminalDispositions.includes(result.disposition)
  ) {
    throw gatewayError(
      "TERMINAL_DISPOSITION_NOT_PERMITTED",
      "The terminal disposition is not permitted for this claim.",
    );
  }
  if (
    result.role === "SUPPLY_REVIEWER" &&
    authorized.envelope.role === "SUPPLY_REVIEWER" &&
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

const performTerminalResult = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>,
): Promise<AffiliateAgentSubmitResultOutcome> => {
  assertIdentifier(input.idempotencyKey, "Operation idempotency key");
  const now = dependencies.clock.now();

  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await dependencies.prisma.$transaction(
        async (transaction) => {
          const existing =
            await transaction.affiliateAgentGatewayOperationReceipts.findUnique(
              {
                where: {
                  claimId_idempotencyKey: {
                    claimId: input.authorization.claimId,
                    idempotencyKey: input.idempotencyKey,
                  },
                },
              },
            );
          const authorized = await authorizeClaimOperation(
            dependencies,
            input.authorization,
            now,
            transaction,
            existing?.status === "SUCCEEDED"
              ? { terminalReplayReceiptId: existing.id }
              : {},
          );
          const requestHash = operationRequestHash(input);
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
            if (existing.status === "SUCCEEDED") {
              return replaySubmitResult(
                existing.responseJson,
                authorized.roleContract,
              );
            }
            throw gatewayError(
              "OPERATION_IN_PROGRESS",
              "The terminal result is still in progress.",
              true,
            );
          }

          const parsedResult =
            affiliateAgentTerminalResultEnvelopeSchema.safeParse(input.result);
          if (!parsedResult.success) {
            const submissionNumber = authorized.claim.schemaCorrectionCount + 1;
            if (
              submissionNumber < 1 ||
              submissionNumber > AFFILIATE_AGENT_MAX_SCHEMA_CORRECTIONS
            ) {
              throw gatewayError(
                "SCHEMA_CORRECTIONS_EXHAUSTED",
                "The schema-correction budget is exhausted.",
              );
            }
            if (submissionNumber === AFFILIATE_AGENT_MAX_SCHEMA_CORRECTIONS) {
              return recordInvocationFailure({
                dependencies,
                transaction,
                authorized,
                idempotencyKey: input.idempotencyKey,
                operationKind: input.kind,
                requestHash,
                failureCode: "SCHEMA_CORRECTIONS_EXHAUSTED",
                failedAt: now,
                safeSummary:
                  "The invocation exhausted its schema-correction budget.",
                evidenceRefs: [],
                schemaCorrectionCount: submissionNumber,
              });
            }

            const receiptId = dependencies.identifiers.create("receipt");
            const remainingSubmissions =
              AFFILIATE_AGENT_MAX_SCHEMA_CORRECTIONS - submissionNumber;
            const issues = [...schemaCorrectionIssues];
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
          }
          validateTerminalResultScope(authorized, parsedResult.data);
          if (
            parsedResult.data.role === "MAPPING_PRODUCER" &&
            parsedResult.data.disposition === "PACKAGE_COMMITTED"
          ) {
            const commitReceipt =
              await transaction.affiliateAgentGatewayOperationReceipts.findUnique(
                {
                  where: {
                    id: parsedResult.data.payload.commitReceiptId,
                  },
                },
              );
            const commitOutput =
              commitReceipt?.responseJson !== null &&
              typeof commitReceipt?.responseJson === "object" &&
              !Array.isArray(commitReceipt.responseJson) &&
              "safeOutput" in commitReceipt.responseJson &&
              commitReceipt.responseJson.safeOutput !== null &&
              typeof commitReceipt.responseJson.safeOutput === "object" &&
              !Array.isArray(commitReceipt.responseJson.safeOutput)
                ? commitReceipt.responseJson.safeOutput
                : null;
            if (
              commitReceipt?.claimId !== authorized.claim.id ||
              commitReceipt.status !== "SUCCEEDED" ||
              commitReceipt.commandName !== "COMMIT_DECLARATIVE_PACKAGE" ||
              commitOutput?.packageHash !==
                parsedResult.data.payload.packageHash
            ) {
              throw gatewayError(
                "TERMINAL_DISPOSITION_NOT_PERMITTED",
                "The mapping result does not match a committed package receipt.",
              );
            }
          }
          if (
            parsedResult.data.role === "HUMAN_DIRECTED_EXECUTOR" &&
            authorized.envelope.role === "HUMAN_DIRECTED_EXECUTOR" &&
            parsedResult.data.disposition === "LIFECYCLE_COMMAND_EXECUTED"
          ) {
            const subject = authorized.envelope.subject;
            const lifecycleReceipt =
              await transaction.affiliateAgentGatewayOperationReceipts.findUnique(
                {
                  where: { id: parsedResult.data.payload.receiptId },
                },
              );
            if (
              parsedResult.data.payload.caseId !== subject.caseId ||
              parsedResult.data.payload.lifecycleCommandRef !==
                subject.lifecycleCommandRef ||
              lifecycleReceipt?.claimId !== authorized.claim.id ||
              lifecycleReceipt.status !== "SUCCEEDED" ||
              lifecycleReceipt.commandName !==
                "EXECUTE_RECORDED_LIFECYCLE_COMMAND"
            ) {
              throw gatewayError(
                "TERMINAL_DISPOSITION_NOT_PERMITTED",
                "The human-directed result does not match the recorded lifecycle command.",
              );
            }
          }

          for (const evidenceRef of parsedResult.data.evidenceRefs) {
            const scopedArtifact =
              await transaction.affiliateAgentGatewayArtifacts.findUnique({
                where: {
                  claimId_evidenceRef: {
                    claimId: authorized.claim.id,
                    evidenceRef,
                  },
                },
              });
            if (!scopedArtifact) {
              throw gatewayError(
                "EVIDENCE_REFERENCE_NOT_PERMITTED",
                "The terminal result references evidence outside the claim manifest.",
              );
            }
          }

          const receiptId = dependencies.identifiers.create("receipt");
          const resultHash = hashAffiliateAgentValue(parsedResult.data);
          const terminalResult: AffiliateAgentTerminalAcceptedResult = {
            kind: "TERMINAL_ACCEPTED",
            receiptId,
            resultHash,
            disposition: parsedResult.data.disposition,
            completedAt: now.toISOString(),
          };
          const claimCompleted =
            await transaction.affiliateAgentGatewayClaims.updateMany({
              where: {
                id: authorized.claim.id,
                status: "ACTIVE",
                claimGeneration: authorized.claim.claimGeneration,
                tokenInvalidatedAt: null,
              },
              data: {
                status: "COMPLETED",
                terminalReceiptId: receiptId,
                tokenInvalidatedAt: now,
                endedAt: now,
              },
            });
          if (claimCompleted.count !== 1) {
            throw gatewayError(
              "TOKEN_INVALIDATED",
              "The terminal result lost the active claim compare-and-set.",
            );
          }
          const jobCompleted =
            await transaction.affiliateAgentGatewayJobs.updateMany({
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
                terminalDisposition: parsedResult.data.disposition,
                resultHash,
                resultJson: asPrismaJson(parsedResult.data),
                terminalReceiptId: receiptId,
                finishedAt: now,
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
              startedAt: now,
              completedAt: now,
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
              reasonCodes: [...parsedResult.data.reasonCodes],
              payload: asPrismaJson({
                disposition: parsedResult.data.disposition,
                resultHash,
              }),
              retentionClass: "INDEFINITE",
            },
          });
          return terminalResult;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const retryableConflict =
        error instanceof AffiliateAgentClaimRaceError ||
        prismaErrorCode(error) === "P2034";
      if (retryableConflict && attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS) {
        continue;
      }
      if (error instanceof AffiliateAgentGatewayError) throw error;
      throw gatewayError(
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

const performFailure = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "RECORD_FAILURE" }>,
): Promise<AffiliateAgentInvocationFailedResult> => {
  assertIdentifier(input.idempotencyKey, "Operation idempotency key");
  const now = dependencies.clock.now();
  const supportedCodes: readonly AffiliateAgentInvocationFailureCode[] = [
    "MALFORMED_OUTPUT",
    "STALE_GENERATION",
    "PROCESS_CRASH",
    "TIMEOUT",
    "TERMINAL_SUBMISSION_FAILURE",
    "SCHEMA_CORRECTIONS_EXHAUSTED",
  ];

  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await dependencies.prisma.$transaction(
        async (transaction) => {
          const existing =
            await transaction.affiliateAgentGatewayOperationReceipts.findUnique(
              {
                where: {
                  claimId_idempotencyKey: {
                    claimId: input.authorization.claimId,
                    idempotencyKey: input.idempotencyKey,
                  },
                },
              },
            );
          const authorized = await authorizeClaimOperation(
            dependencies,
            input.authorization,
            now,
            transaction,
            existing?.status === "SUCCEEDED"
              ? { terminalReplayReceiptId: existing.id }
              : {},
          );
          const requestHash = operationRequestHash(input);
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
            if (existing.status === "SUCCEEDED") {
              return replayInvocationFailure(existing.responseJson);
            }
            throw gatewayError(
              "OPERATION_IN_PROGRESS",
              "The invocation failure is still in progress.",
              true,
            );
          }

          const failure = input.failure;
          const occurredAt = new Date(failure.occurredAt);
          if (
            failure.schemaVersion !== 1 ||
            !supportedCodes.includes(failure.code) ||
            Number.isNaN(occurredAt.getTime()) ||
            occurredAt < authorized.claim.claimedAt ||
            occurredAt > now ||
            !failure.safeSummary.trim() ||
            failure.safeSummary.length > 2_000 ||
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
          if (
            failure.lifecycleGeneration !== authorized.claim.lifecycleGeneration
          ) {
            throw gatewayError(
              "LIFECYCLE_GENERATION_STALE",
              "The invocation failure lifecycle generation is stale.",
            );
          }
          if (
            failure.supplyContractHash !== authorized.claim.supplyContractHash
          ) {
            throw gatewayError(
              "SUPPLY_CONTRACT_STALE",
              "The invocation failure Supply Contract is stale.",
            );
          }
          for (const evidenceRef of failure.evidenceRefs) {
            const artifact =
              await transaction.affiliateAgentGatewayArtifacts.findUnique({
                where: {
                  claimId_evidenceRef: {
                    claimId: authorized.claim.id,
                    evidenceRef,
                  },
                },
              });
            if (!artifact) {
              throw gatewayError(
                "EVIDENCE_REFERENCE_NOT_PERMITTED",
                "The invocation failure references evidence outside the claim manifest.",
              );
            }
          }
          return recordInvocationFailure({
            dependencies,
            transaction,
            authorized,
            idempotencyKey: input.idempotencyKey,
            operationKind: input.kind,
            requestHash,
            failureCode: failure.code,
            failedAt: now,
            safeSummary: failure.safeSummary.trim(),
            evidenceRefs: failure.evidenceRefs,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const retryableConflict =
        error instanceof AffiliateAgentClaimRaceError ||
        prismaErrorCode(error) === "P2034";
      if (retryableConflict && attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS) {
        continue;
      }
      if (error instanceof AffiliateAgentGatewayError) throw error;
      throw gatewayError(
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
  if (input?.reconcileBefore === undefined) return dependencies.clock.now();
  const before = new Date(input.reconcileBefore);
  if (Number.isNaN(before.getTime())) {
    throw gatewayError(
      "ROLE_NOT_ALLOWED",
      "The reconciliation boundary must be a valid timestamp.",
    );
  }
  return before;
};

const markReceiptReconciliationRequired = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  now: Date,
  impossibleState: boolean,
): Promise<"HALTED_LANE" | "HALTED_GATEWAY" | "UNCHANGED"> =>
  dependencies.prisma.$transaction(
    async (transaction) => {
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
      const stateIsImpossible =
        impossibleState ||
        !claim ||
        !job ||
        claim.jobId !== currentReceipt.jobId ||
        claim.claimGeneration !== currentReceipt.claimGeneration ||
        job.activeClaimId !== currentReceipt.claimId ||
        job.claimGeneration !== currentReceipt.claimGeneration ||
        claim.status !== "ACTIVE" ||
        job.status !== "CLAIMED";
      const safeErrorCode = stateIsImpossible
        ? "GATEWAY_ADMISSION_HALTED"
        : "PARTIAL_COMMAND_UNRESOLVED";
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

      if (claim?.status === "ACTIVE") {
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
            safeFailureSummary:
              "An external effect could not be determined safely.",
          },
        });
      }
      if (
        job?.status === "CLAIMED" &&
        claim &&
        job.activeClaimId === claim.id &&
        job.claimGeneration === claim.claimGeneration
      ) {
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
      }
      return stateIsImpossible ? "HALTED_GATEWAY" : "HALTED_LANE";
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

const finalizeRecoveredCaptureReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  recovered: Readonly<Record<string, unknown>>,
  now: Date,
): Promise<"COMPLETED" | "IMPOSSIBLE" | "UNCHANGED"> => {
  let capture: RecoveredCaptureOutput;
  try {
    capture = parseRecoveredCaptureOutput(recovered);
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
  } catch {
    return "IMPOSSIBLE";
  }
  const safeOutput = capture;
  const responseHash = hashAffiliateAgentValue({
    commandType: "CAPTURE_CLAIM_URL",
    safeOutput,
  });
  const commandResult: AffiliateAgentCommandResult = {
    kind: "COMMAND_SUCCEEDED",
    receiptId: receipt.id,
    commandType: "CAPTURE_CLAIM_URL",
    responseHash,
    safeOutput,
  };

  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await dependencies.prisma.$transaction(
        async (transaction) => {
          const currentReceipt =
            await transaction.affiliateAgentGatewayOperationReceipts.findUnique(
              {
                where: { id: receipt.id },
              },
            );
          if (currentReceipt?.status === "SUCCEEDED") return "UNCHANGED";
          if (
            !currentReceipt ||
            currentReceipt.status !== "PENDING" ||
            currentReceipt.commandName !== "CAPTURE_CLAIM_URL" ||
            currentReceipt.requestHash !== receipt.requestHash ||
            currentReceipt.externalOperationKey !== receipt.externalOperationKey
          ) {
            return "IMPOSSIBLE";
          }
          const [claim, job, artifact] = await Promise.all([
            transaction.affiliateAgentGatewayClaims.findUnique({
              where: { id: currentReceipt.claimId },
            }),
            transaction.affiliateAgentGatewayJobs.findUnique({
              where: { id: currentReceipt.jobId },
            }),
            transaction.affiliateAgentGatewayArtifacts.findUnique({
              where: {
                claimId_evidenceRef: {
                  claimId: currentReceipt.claimId,
                  evidenceRef: capture.evidenceRef,
                },
              },
            }),
          ]);
          if (
            !claim ||
            !job ||
            claim.jobId !== currentReceipt.jobId ||
            claim.claimGeneration !== currentReceipt.claimGeneration ||
            claim.status !== "ACTIVE" ||
            job.status !== "CLAIMED" ||
            job.activeClaimId !== currentReceipt.claimId ||
            job.claimGeneration !== currentReceipt.claimGeneration ||
            (artifact !== null &&
              (artifact.fileId !== capture.artifactId ||
                artifact.contentHash !== capture.sha256))
          ) {
            return "IMPOSSIBLE";
          }
          if (!artifact) {
            await transaction.affiliateAgentGatewayArtifacts.createMany({
              data: [
                {
                  id: dependencies.identifiers.create("artifact"),
                  claimId: currentReceipt.claimId,
                  claimGeneration: currentReceipt.claimGeneration,
                  evidenceRef: capture.evidenceRef,
                  evidenceKind: "CAPTURED_PAGE",
                  sourceArtifactId: capture.artifactId,
                  fileId: capture.artifactId,
                  contentHash: capture.sha256,
                  mimeType: capture.mimeType,
                  byteSize: capture.byteSize,
                  retentionClass: "INDEFINITE",
                },
              ],
              skipDuplicates: true,
            });
          }
          const receiptUpdated =
            await transaction.affiliateAgentGatewayOperationReceipts.updateMany(
              {
                where: {
                  id: currentReceipt.id,
                  status: "PENDING",
                  requestHash: currentReceipt.requestHash,
                },
                data: {
                  status: "SUCCEEDED",
                  responseHash,
                  responseJson: asPrismaJson(commandResult),
                  completedAt: now,
                  reconcileAfter: null,
                },
              },
            );
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
              inputHash: currentReceipt.requestHash,
              outputHash: responseHash,
              payload: asPrismaJson({ evidenceRef: capture.evidenceRef }),
              retentionClass: "INDEFINITE",
            },
          });
          return "COMPLETED";
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const retryableConflict =
        error instanceof AffiliateAgentClaimRaceError ||
        prismaErrorCode(error) === "P2034";
      if (retryableConflict && attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS) {
        continue;
      }
      if (error instanceof AffiliateAgentGatewayError) throw error;
      return "IMPOSSIBLE";
    }
  }
  return "IMPOSSIBLE";
};

const finalizeRecoveredLifecycleReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  safeOutput: Readonly<Record<string, unknown>>,
  now: Date,
): Promise<"COMPLETED"> => {
  if (
    receipt.commandName !== "EXECUTE_RECORDED_LIFECYCLE_COMMAND" ||
    receipt.requestHash === null
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered lifecycle receipt is invalid.",
      false,
      receipt.id,
    );
  }
  const claim =
    await dependencies.prisma.affiliateAgentGatewayClaims.findUnique({
      where: { id: receipt.claimId },
    });
  const job = await dependencies.prisma.affiliateAgentGatewayJobs.findUnique({
    where: { id: receipt.jobId },
  });
  if (
    !claim ||
    !job ||
    claim.status !== "ACTIVE" ||
    claim.jobId !== job.id ||
    claim.claimGeneration !== receipt.claimGeneration ||
    claim.lifecycleGeneration === null ||
    job.status !== "CLAIMED" ||
    job.activeClaimId !== claim.id ||
    job.claimGeneration !== receipt.claimGeneration
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered lifecycle claim state is inconsistent.",
      false,
      receipt.id,
    );
  }
  const envelope = affiliateAgentClaimEnvelopeSchema.parse(
    claim.claimEnvelopeJson,
  );
  if (envelope.role !== "HUMAN_DIRECTED_EXECUTOR") {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered lifecycle claim role is invalid.",
      false,
      receipt.id,
    );
  }
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
  return dependencies.prisma.$transaction(
    async (transaction) => {
      const current =
        await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
          where: { id: receipt.id },
        });
      if (current?.status === "SUCCEEDED") return "COMPLETED" as const;
      if (
        !current ||
        current.status !== "PENDING" ||
        current.claimId !== claim.id ||
        current.jobId !== job.id ||
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
      const currentJob = await transaction.affiliateAgentGatewayJobs.findUnique(
        {
          where: { id: job.id },
        },
      );
      if (
        !currentJob ||
        currentJob.status !== "CLAIMED" ||
        currentJob.activeClaimId !== claim.id ||
        currentJob.claimGeneration !== claim.claimGeneration
      ) {
        throw gatewayError(
          "PARTIAL_COMMAND_UNRESOLVED",
          "The recovered lifecycle job changed during reconciliation.",
          false,
          receipt.id,
        );
      }
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
            completedAt: now,
            reconcileAfter: null,
          },
        });
      const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany(
        {
          where: {
            id: job.id,
            status: "CLAIMED",
            activeClaimId: claim.id,
            claimGeneration: claim.claimGeneration,
            eventSequence: currentJob.eventSequence,
          },
          data: { eventSequence: { increment: 1 } },
        },
      );
      if (receiptUpdated.count !== 1 || jobUpdated.count !== 1) {
        throw new AffiliateAgentClaimRaceError();
      }
      await transaction.affiliateAgentGatewayEvents.create({
        data: {
          id: dependencies.identifiers.create("event"),
          eventKey: `lifecycle-command-succeeded:${receipt.id}`,
          jobId: job.id,
          claimId: claim.id,
          receiptId: receipt.id,
          sequence: currentJob.eventSequence + 1,
          eventType: "LIFECYCLE_COMMAND_SUCCEEDED",
          actorKind: "AGENT_INVOCATION",
          actorId: claim.invocationId,
          role: claim.role,
          requestHash: receipt.requestHash,
          outputHash: responseHash,
          payload: asPrismaJson({
            recordedHumanActorId: envelope.subject.recordedHumanActorId,
            executingAgentId: claim.workerId,
          }),
          retentionClass: "INDEFINITE",
        },
      });
      return "COMPLETED" as const;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
};

const reconcilePendingExternalReceipts = async (
  dependencies: AffiliateAgentGatewayDependencies,
  before: Date,
  limit: number,
): Promise<
  Readonly<{
    examined: number;
    recovered: number;
    completed: number;
    unresolved: number;
    admissionHalted: boolean;
  }>
> => {
  const receipts =
    await dependencies.prisma.affiliateAgentGatewayOperationReceipts.findMany({
      where: {
        status: "PENDING",
        reconcileAfter: { lte: before },
        commandName: {
          in: ["CAPTURE_CLAIM_URL", "EXECUTE_RECORDED_LIFECYCLE_COMMAND"],
        },
      },
      orderBy: [{ reconcileAfter: "asc" }, { id: "asc" }],
      take: limit,
    });
  let unresolved = 0;
  let admissionHalted = false;
  let recoveredCount = 0;
  let completed = 0;
  for (const receipt of receipts) {
    let recovered: Readonly<Record<string, unknown>> | null = null;
    let impossible = false;
    if (receipt.commandName === "CAPTURE_CLAIM_URL") {
      const adapter = dependencies.commands.external.CAPTURE_CLAIM_URL;
      if (typeof receipt.externalOperationKey !== "string" || !adapter) {
        impossible = true;
      } else {
        try {
          recovered = await adapter.recover(receipt.externalOperationKey);
        } catch {
          recovered = null;
        }
      }
    } else if (
      receipt.commandName === "EXECUTE_RECORDED_LIFECYCLE_COMMAND" &&
      dependencies.lifecycle.kind === "AVAILABLE"
    ) {
      try {
        recovered = await dependencies.lifecycle.recover(receipt.id);
      } catch {
        recovered = null;
      }
    } else {
      impossible = true;
    }
    if (impossible) {
      const marked = await markReceiptReconciliationRequired(
        dependencies,
        receipt,
        before,
        true,
      );
      if (marked !== "UNCHANGED") unresolved += 1;
      admissionHalted ||= marked !== "UNCHANGED";
      continue;
    }
    if (recovered === null) {
      const marked = await markReceiptReconciliationRequired(
        dependencies,
        receipt,
        before,
        false,
      );
      if (marked !== "UNCHANGED") unresolved += 1;
      admissionHalted ||= marked !== "UNCHANGED";
      continue;
    }
    recoveredCount += 1;
    try {
      const finalized =
        receipt.commandName === "CAPTURE_CLAIM_URL"
          ? await finalizeRecoveredCaptureReceipt(
              dependencies,
              receipt,
              recovered,
              before,
            )
          : await finalizeRecoveredLifecycleReceipt(
              dependencies,
              receipt,
              recovered,
              before,
            );
      if (finalized === "COMPLETED") {
        completed += 1;
        continue;
      }
      if (finalized === "UNCHANGED") continue;
    } catch {
      impossible = true;
    }
    const marked = await markReceiptReconciliationRequired(
      dependencies,
      receipt,
      before,
      true,
    );
    if (marked !== "UNCHANGED") unresolved += 1;
    admissionHalted ||= marked !== "UNCHANGED";
  }
  return {
    examined: receipts.length,
    recovered: recoveredCount,
    completed,
    unresolved,
    admissionHalted,
  };
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

const reconcileExpiredClaims = async (
  dependencies: AffiliateAgentGatewayDependencies,
  before: Date,
  limit: number,
): Promise<
  Readonly<{
    examined: number;
    expired: number;
    admissionHalted: boolean;
  }>
> => {
  if (limit === 0) {
    return { examined: 0, expired: 0, admissionHalted: false };
  }
  const claims = await dependencies.prisma.affiliateAgentGatewayClaims.findMany(
    {
      where: {
        status: "ACTIVE",
        OR: [
          { leaseExpiresAt: { lte: before } },
          { hardDeadlineAt: { lte: before } },
        ],
      },
      orderBy: [{ hardDeadlineAt: "asc" }, { leaseExpiresAt: "asc" }],
      take: limit,
    },
  );
  let expired = 0;
  let admissionHalted = false;
  for (const selectedClaim of claims) {
    let outcome: "UNCHANGED" | "IMPOSSIBLE" | "EXPIRED";
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
          const invocationFailureCount = job.invocationFailureCount + 1;
          const delay = affiliateAgentRetryDelaySeconds(
            invocationFailureCount as 1 | 2 | 3,
          );
          const pipelineBlocked = delay === null;
          const nextAttemptAt =
            delay === null ? null : addSeconds(before, delay);
          const jobUpdated =
            await transaction.affiliateAgentGatewayJobs.updateMany({
              where: {
                id: job.id,
                status: "CLAIMED",
                activeClaimId: claim.id,
                claimGeneration: claim.claimGeneration,
                invocationFailureCount: job.invocationFailureCount,
                eventSequence: job.eventSequence,
              },
              data: {
                status: pipelineBlocked ? "PIPELINE_BLOCKED" : "RETRY_WAIT",
                activeClaimId: null,
                invocationFailureCount: { increment: 1 },
                lastInvocationFailedAt: before,
                pipelineBlockedAt: pipelineBlocked ? before : null,
                nextAttemptAt,
                eventSequence: { increment: 1 },
              },
            });
          const claimUpdated =
            await transaction.affiliateAgentGatewayClaims.updateMany({
              where: {
                id: claim.id,
                status: "ACTIVE",
                claimGeneration: claim.claimGeneration,
                tokenInvalidatedAt: null,
                leaseExpiresAt: claim.leaseExpiresAt,
                hardDeadlineAt: claim.hardDeadlineAt,
              },
              data: {
                status: "EXPIRED",
                endedAt: before,
                tokenInvalidatedAt: before,
                safeFailureCode: "TIMEOUT",
                safeFailureSummary:
                  "The invocation lease or hard deadline expired.",
                diagnosticRetainUntil: addSeconds(before, 14 * 24 * 60 * 60),
              },
            });
          if (jobUpdated.count !== 1 || claimUpdated.count !== 1) {
            throw new AffiliateAgentClaimRaceError();
          }
          await transaction.affiliateAgentGatewayEvents.create({
            data: {
              id: dependencies.identifiers.create("event"),
              eventKey: `claim-expired:${claim.id}`,
              jobId: job.id,
              claimId: claim.id,
              sequence: job.eventSequence + 1,
              eventType: "CLAIM_EXPIRED",
              actorKind: "GATEWAY_RECONCILER",
              actorId: "affiliate-agent-gateway",
              role: claim.role,
              reasonCodes: ["TIMEOUT"],
              payload: asPrismaJson({
                invocationFailureCount,
                nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
                pipelineBlocked,
              }),
              retentionClass: "INDEFINITE",
            },
          });
          return "EXPIRED" as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof AffiliateAgentClaimRaceError ||
        prismaErrorCode(error) === "P2034" ||
        prismaErrorCode(error) === "P2028"
      ) {
        continue;
      }
      throw error;
    }
    if (outcome === "EXPIRED") {
      expired += 1;
      continue;
    }
    if (outcome === "IMPOSSIBLE") {
      admissionHalted ||= await markImpossibleExpiredClaim(
        dependencies,
        selectedClaim,
        before,
      );
    }
  }
  return { examined: claims.length, expired, admissionHalted };
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
  const admissionHalted =
    receipts.admissionHalted ||
    claims.admissionHalted ||
    (await dependencies.prisma.affiliateAgentGatewayJobs.findFirst({
      where: { status: "RECONCILIATION_REQUIRED" },
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
    admissionHalted,
  };
};

export function createPrismaAffiliateAgentGateway(
  dependencies: AffiliateAgentGatewayDependencies,
): AffiliateAgentGateway {
  return {
    async claim(input) {
      const now = dependencies.clock.now();
      await validateClaimRequest(dependencies, input, now);
      const requestHash = claimRequestHash(input);
      const bundle = parseSupportedContractBundle(
        await dependencies.contracts.loadActiveBundle(),
      );
      const roleContract = activeRoleContract(bundle, input.role);
      return claimAffiliateAgentJob(
        dependencies,
        input,
        bundle,
        roleContract,
        now,
        requestHash,
      );
    },
    async perform<T extends AffiliateAgentClaimOperation>(
      input: T,
    ): Promise<AffiliateAgentClaimOperationResult<T>> {
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
        return (await performTerminalResult(
          dependencies,
          input,
        )) as AffiliateAgentClaimOperationResult<T>;
      }
      if (input.kind === "RECORD_FAILURE") {
        return (await performFailure(
          dependencies,
          input,
        )) as AffiliateAgentClaimOperationResult<T>;
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
