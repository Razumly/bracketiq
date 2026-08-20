import { createHash } from "node:crypto";
import type {
  AffiliateAgentGatewayClaims,
  AffiliateAgentGatewayJobs,
  PrismaClient,
} from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import {
  AFFILIATE_AGENT_HARD_DEADLINE_SECONDS,
  AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
  AFFILIATE_AGENT_LEASE_SECONDS,
  AffiliateAgentGatewayError,
  type AffiliateAgentClaimGrant,
  type AffiliateAgentArtifactReadResult,
  type AffiliateAgentCommandResult,
  type AffiliateAgentClaimAuthorization,
  type AffiliateAgentClaimOperation,
  type AffiliateAgentClaimOperationResult,
  type AffiliateAgentClaimRequest,
  type AffiliateAgentTerminalAcceptedResult,
  type AffiliateAgentHeartbeatResult,
  type AffiliateAgentGateway,
  type AffiliateAgentReconcileReport,
  type AffiliateAgentReconcileRequest,
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
): AffiliateAgentGatewayError =>
  new AffiliateAgentGatewayError({ code, safeMessage, retryable });

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
    bundle.supplyContract.version === 1 &&
    bundle.deploymentContract.version === 1 &&
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
  if (input.role !== "COVERAGE_PLANNER") {
    throw gatewayError(
      "ROLE_NOT_ALLOWED",
      "This gateway slice admits Coverage Planner work only.",
    );
  }
};

const claimCoveragePlannerJob = async (
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

          const job = await transaction.affiliateAgentGatewayJobs.findFirst({
            where: {
              role: "COVERAGE_PLANNER",
              status: "QUEUED",
              activeClaimId: null,
              nextAttemptAt: { lte: now },
            },
            orderBy: [
              { priority: "desc" },
              { createdAt: "asc" },
              { id: "asc" },
            ],
          });
          if (!job) return { kind: "NO_WORK" as const };

          const evidenceManifest = affiliateAgentEvidenceManifestSchema.parse(
            job.evidenceManifestJson,
          );
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
                status: "QUEUED",
                activeClaimId: null,
                claimGeneration: job.claimGeneration,
                nextAttemptAt: { lte: now },
              },
              data: {
                status: "CLAIMED",
                activeClaimId: claimId,
                claimGeneration: { increment: 1 },
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
      const retryableConflict =
        error instanceof AffiliateAgentClaimRaceError ||
        prismaErrorCode(error) === "P2034" ||
        prismaErrorCode(error) === "P2002";
      if (retryableConflict && attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS) {
        continue;
      }
      if (retryableConflict) return null;
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
    claim.status === "COMPLETED" &&
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
  const jobMatchesClaim = isTerminalReplay
    ? job?.status === "COMPLETED" &&
      job.activeClaimId === null &&
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
  const commandType = affiliateAgentCommandSchema.safeParse({
    type: response.commandType,
    data: {
      strategyRef: "stored-command-reference",
      queryRef: "stored-command-reference",
    },
  });
  if (!commandType.success || commandType.data.type !== "RUN_DISCOVERY_QUERY") {
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
    commandType: commandType.data.type,
    responseHash: response.responseHash,
    safeOutput,
  };
};

const performCommand = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
): Promise<AffiliateAgentCommandResult> => {
  assertIdentifier(input.idempotencyKey, "Operation idempotency key");
  const parsedCommand = affiliateAgentCommandSchema.safeParse(input.command);
  if (
    !parsedCommand.success ||
    parsedCommand.data.type !== "RUN_DISCOVERY_QUERY"
  ) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The command is not available in this gateway slice.",
    );
  }
  const discoveryCommand = parsedCommand.data;
  const adapter = dependencies.commands.transactional.RUN_DISCOVERY_QUERY;
  if (!adapter) {
    throw gatewayError(
      "COMMAND_NOT_PERMITTED",
      "The command has no installed transactional adapter.",
    );
  }
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
              discoveryCommand.type,
            ) ||
            !authorized.claim.permittedCommands.includes(discoveryCommand.type)
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
              existing.commandName !== discoveryCommand.type ||
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

          const requiredRefs = [
            discoveryCommand.data.strategyRef,
            discoveryCommand.data.queryRef,
          ];
          for (const evidenceRef of new Set(requiredRefs)) {
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

          const receiptId = dependencies.identifiers.create("receipt");
          const safeOutput = await adapter.execute({
            transaction,
            claim: authorized.envelope,
            command: discoveryCommand,
            receiptId,
          });
          const canonicalOutput = canonicalizeAffiliateAgentValue(safeOutput);
          if (Buffer.byteLength(canonicalOutput, "utf8") > 16_384) {
            throw gatewayError(
              "INTERNAL_ERROR",
              "The command output exceeded the safe receipt limit.",
            );
          }
          const responseHash = hashAffiliateAgentValue({
            commandType: discoveryCommand.type,
            safeOutput,
          });
          const commandResult: AffiliateAgentCommandResult = {
            kind: "COMMAND_SUCCEEDED",
            receiptId,
            commandType: discoveryCommand.type,
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
              commandName: discoveryCommand.type,
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
              inputHash: hashAffiliateAgentValue(discoveryCommand),
              outputHash: responseHash,
              payload: asPrismaJson({
                commandType: discoveryCommand.type,
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
  const disposition =
    AFFILIATE_AGENT_ROLE_CONTRACTS.COVERAGE_PLANNER.terminalDispositions.find(
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
};

const performTerminalResult = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>,
): Promise<AffiliateAgentTerminalAcceptedResult> => {
  assertIdentifier(input.idempotencyKey, "Operation idempotency key");
  const parsedResult = affiliateAgentTerminalResultEnvelopeSchema.safeParse(
    input.result,
  );
  if (!parsedResult.success) {
    throw gatewayError(
      "RESULT_SCHEMA_INVALID",
      "The terminal result does not match the role result schema.",
    );
  }
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
          validateTerminalResultScope(authorized, parsedResult.data);
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
              return replayTerminalResult(existing.responseJson);
            }
            throw gatewayError(
              "OPERATION_IN_PROGRESS",
              "The terminal result is still in progress.",
              true,
            );
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

const rejectFailureAdmission = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "RECORD_FAILURE" }>,
): Promise<never> => {
  await dependencies.prisma.$transaction(
    async (transaction) => {
      await authorizeClaimOperation(
        dependencies,
        input.authorization,
        dependencies.clock.now(),
        transaction,
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  throw gatewayError(
    "ROLE_NOT_ALLOWED",
    "Invocation failure admission is not available in this gateway slice.",
  );
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
      return claimCoveragePlannerJob(
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
        return (await rejectFailureAdmission(
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
      _input?: AffiliateAgentReconcileRequest,
    ): Promise<AffiliateAgentReconcileReport> {
      throw gatewayError(
        "GATEWAY_ADMISSION_HALTED",
        "Restart reconciliation is not available in this gateway slice.",
      );
    },
  };
}
