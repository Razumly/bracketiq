import { createHash } from "node:crypto";
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
  AffiliateAgentInvocationReconciler,
  AffiliateAgentInvocationReconciliationRequest,
  AffiliateAgentInvocationReconciliationResult,
  AffiliateAgentReviewerTerminalResult,
  AffiliateAgentTerminalEffectAdapter,
  AffiliateAgentTerminalEffectAdapterInput,
} from "./agentGatewayAdapters";
import {
  AFFILIATE_AGENT_PROMPT_TEMPLATES,
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  AFFILIATE_AGENT_ROLES,
  affiliateAgentClaimEnvelopeSchema,
  affiliateAgentContractBundleSchema,
  affiliateAgentCommandSchema,
  affiliateAgentDeclarativePackageCommitOutputSchema,
  affiliateAgentDeclarativePackageValidationOutputSchema,
  affiliateAgentEvidenceManifestSchema,
  affiliateAgentSubjectSchema,
  affiliateAgentTerminalResultEnvelopeSchema,
  canonicalizeAffiliateAgentValue,
  hashAffiliateAgentValue,
  renderAffiliateAgentPrompt,
  type AffiliateAgentClaimEnvelope,
  type AffiliateAgentCommand,
  type AffiliateAgentContractBundle,
  type AffiliateAgentRoleContract,
  type AffiliateAgentSubject,
  type AffiliateAgentRole,
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
const isOperationReceiptUniqueConflict = (error: unknown): boolean => {
  if (prismaErrorCode(error) !== "P2002") return false;
  return prismaUniqueTarget(error).some(
    (value) =>
      value.includes("claimId_idempotencyKey") ||
      (value.includes("claimId") && value.includes("idempotencyKey")),
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
      const retryableConflict =
        cause instanceof AffiliateAgentClaimRaceError ||
        prismaErrorCode(cause) === "P2034" ||
        isOperationReceiptUniqueConflict(cause);
      if (retryableConflict && attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS) {
        continue;
      }
      if (cause instanceof AffiliateAgentGatewayError) throw cause;
      throw gatewayError(
        error.code,
        error.safeMessage,
        retryableConflict,
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

const assertBoundedGatewayInput = (value: unknown): void => {
  const pending: Array<{ value: unknown; depth: number }> = [
    { value, depth: 0 },
  ];
  const seen = new Set<object>();
  let byteSize = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    const { value: currentValue, depth } = current;
    if (currentValue === null) {
      byteSize += 4;
    } else if (typeof currentValue === "string") {
      byteSize += Buffer.byteLength(currentValue, "utf8");
      if (currentValue.length > MAX_GATEWAY_INPUT_STRING_LENGTH) {
        throw gatewayError(
          "COMMAND_NOT_PERMITTED",
          "The gateway input string exceeds the allowed limit.",
        );
      }
    } else if (
      typeof currentValue === "number" ||
      typeof currentValue === "boolean"
    ) {
      byteSize += 8;
    } else if (typeof currentValue === "object") {
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
      for (const [key, nestedValue] of Object.entries(currentValue)) {
        byteSize += Buffer.byteLength(key, "utf8") + 2;
        pending.push({ value: nestedValue, depth: depth + 1 });
      }
    } else {
      throw gatewayError(
        "COMMAND_NOT_PERMITTED",
        "The gateway input contains an unsupported value.",
      );
    }
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
        executionClass: z.literal("PRODUCTION_CODEX"),
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
]);

function assertClaimRequestInput(
  value: unknown,
): asserts value is AffiliateAgentClaimRequest {
  assertBoundedGatewayInput(value);
  const parsed = claimRequestInputSchema.safeParse(value);
  if (parsed.success) return;
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    if (
      "role" in value &&
      typeof value.role === "string" &&
      !AFFILIATE_AGENT_ROLES.includes(value.role as AffiliateAgentRole)
    ) {
      throw gatewayError("ROLE_NOT_ALLOWED", "The claim role is not allowed.");
    }
    if (
      "workspaceAttestation" in value &&
      value.workspaceAttestation !== null &&
      typeof value.workspaceAttestation === "object" &&
      !Array.isArray(value.workspaceAttestation) &&
      "executionClass" in value.workspaceAttestation &&
      value.workspaceAttestation.executionClass !== "PRODUCTION_CODEX"
    ) {
      throw gatewayError(
        "ROLE_NOT_ALLOWED",
        "Offline evaluation cannot claim production Affiliate Agent work.",
      );
    }
  }
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
    attestation.workerId !== input.workerId ||
    attestation.invocationId !== input.invocationId
  ) {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "The workspace attestation does not match the claim request.",
    );
  }
  if (attestation.executionClass !== "PRODUCTION_CODEX") {
    throw gatewayError(
      "ROLE_NOT_ALLOWED",
      "Offline evaluation cannot claim production Affiliate Agent work.",
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
  const admissionNow = dependencies.clock.now();
  if (issuedAt > admissionNow || expiresAt <= admissionNow) {
    throw gatewayError(
      "REVIEW_WORKSPACE_INVALID",
      "The workspace attestation is invalid or expired.",
    );
  }
  if (input.role === "SUPPLY_REVIEWER" && attestation.mode !== "READ_ONLY") {
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
const subjectPrimaryId = (subject: AffiliateAgentSubject): string => {
  switch (subject.type) {
    case "COVERAGE_PLANNER":
      return subject.coverageCellId;
    case "MAPPING_PRODUCER":
      return subject.mappingJobId;
    case "SUPPLY_REVIEWER":
      return subject.supplySourceId;
    case "HUMAN_DIRECTED_EXECUTOR":
      return subject.caseId;
  }
};

const parseQueuedSubject = (
  job: AffiliateAgentGatewayJobs,
  role: AffiliateAgentClaimRequest["role"],
): AffiliateAgentSubject => {
  const parsed = affiliateAgentSubjectSchema.safeParse(job.subjectJson);
  if (
    !parsed.success ||
    parsed.data.type !== role ||
    job.role !== parsed.data.type ||
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
          const now = dependencies.clock.now();
          if (attestationExpiresAt <= now) {
            throw gatewayError(
              "REVIEW_WORKSPACE_INVALID",
              "The workspace attestation expired before claim admission.",
            );
          }
          const hardDeadlineAt = new Date(
            Math.min(
              addSeconds(now, AFFILIATE_AGENT_HARD_DEADLINE_SECONDS).getTime(),
              attestationExpiresAt.getTime(),
            ),
          );
          const leaseExpiresAt = new Date(
            Math.min(
              addSeconds(now, AFFILIATE_AGENT_LEASE_SECONDS).getTime(),
              hardDeadlineAt.getTime(),
            ),
          );

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
          const subject = parseQueuedSubject(job, input.role);

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
            if (subject.type !== "SUPPLY_REVIEWER") {
              throw gatewayError(
                "REVIEW_WORKSPACE_INVALID",
                "The reviewer subject is invalid.",
              );
            }
            const producerClaim =
              await transaction.affiliateAgentGatewayClaims.findUnique({
                where: { id: subject.producerClaimId },
              });
            const producerJob = producerClaim
              ? await transaction.affiliateAgentGatewayJobs.findUnique({
                  where: { id: producerClaim.jobId },
                })
              : null;
            const producerEnvelope = producerClaim
              ? affiliateAgentClaimEnvelopeSchema.safeParse(
                  producerClaim.claimEnvelopeJson,
                )
              : null;
            const producerResult = producerJob
              ? affiliateAgentTerminalResultEnvelopeSchema.safeParse(
                  producerJob.resultJson,
                )
              : null;
            const producerPackageHash =
              producerResult?.success &&
              producerResult.data.role === "MAPPING_PRODUCER" &&
              (producerResult.data.disposition === "PACKAGE_COMMITTED" ||
                producerResult.data.disposition === "BOUNDED_REPAIR_SUBMITTED")
                ? producerResult.data.payload.packageHash
                : null;
            const producerSubject =
              producerEnvelope?.success &&
              producerEnvelope.data.subject.type === "MAPPING_PRODUCER"
                ? producerEnvelope.data.subject
                : null;
            const producerResultIdentityMatches =
              producerResult?.success &&
              producerResult.data.jobId === producerJob?.id &&
              producerResult.data.claimId === producerClaim?.id &&
              producerResult.data.claimGeneration ===
                producerClaim?.claimGeneration &&
              producerResult.data.role === "MAPPING_PRODUCER";
            const producerClaimIsValid =
              producerClaim?.status === "COMPLETED" &&
              producerClaim.role === "MAPPING_PRODUCER" &&
              producerClaim.terminalReceiptId !== null &&
              producerJob?.status === "COMPLETED" &&
              producerJob.activeClaimId === null &&
              producerJob.terminalReceiptId ===
                producerClaim.terminalReceiptId &&
              producerEnvelope?.success === true &&
              hashAffiliateAgentValue(producerEnvelope.data) ===
                producerClaim.claimEnvelopeHash &&
              producerSubject?.supplySourceId === subject.supplySourceId &&
              job.parentClaimId === subject.producerClaimId &&
              producerClaim.workerId === subject.producerWorkerId &&
              producerClaim.invocationId === subject.producerInvocationId &&
              producerClaim.workspaceId === subject.producerWorkspaceId &&
              producerResultIdentityMatches &&
              producerPackageHash === subject.committedPackageHash;
            if (!producerClaimIsValid) {
              throw gatewayError(
                "REVIEW_WORKSPACE_INVALID",
                "The reviewer claim must reference one completed matching producer claim.",
              );
            }
            if (
              subject.producerWorkerId === input.workerId ||
              subject.producerInvocationId === input.invocationId
            ) {
              throw gatewayError(
                "PRODUCER_REVIEWER_IDENTITY_REUSED",
                "The reviewer worker and invocation must differ from the producer.",
              );
            }
            if (
              subject.producerWorkspaceId ===
              input.workspaceAttestation.workspaceId
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
            const producerArtifacts =
              await transaction.affiliateAgentGatewayArtifacts.findMany({
                where: {
                  OR: [
                    { claimId: subject.producerClaimId },
                    { creatingClaimId: subject.producerClaimId },
                  ],
                },
              });
            const producerEvidenceIsBound = (
              ["DETERMINISTIC_VALIDATION", "DURABLE_EVIDENCE"] as const
            ).every((kind) => {
              const entry = evidenceManifest.entries.find(
                (candidate) => candidate.kind === kind,
              );
              return (
                entry !== undefined &&
                producerArtifacts.some(
                  (artifact) =>
                    artifact.evidenceKind === kind &&
                    artifact.sourceArtifactId === entry.artifactId &&
                    artifact.fileId === entry.artifactId &&
                    artifact.contentHash === entry.sha256 &&
                    artifact.mimeType === entry.mimeType &&
                    artifact.byteSize === entry.byteSize &&
                    (artifact.claimId === subject.producerClaimId ||
                      artifact.creatingClaimId === subject.producerClaimId),
                )
              );
            });
            const activeContractEntry = evidenceManifest.entries.find(
              (entry) => entry.kind === "ACTIVE_SUPPLY_CONTRACT",
            );
            const committedPackageEntry = evidenceManifest.entries.find(
              (entry) => entry.kind === "COMMITTED_PACKAGE",
            );
            if (
              manifestKinds.some((kind) => allowedKinds[kind] !== true) ||
              requiredKinds.some(
                (kind) =>
                  manifestKinds.filter((entryKind) => entryKind === kind)
                    .length !== 1,
              ) ||
              activeContractEntry?.sha256 !== bundle.supplyContract.hash ||
              committedPackageEntry?.sha256 !== subject.committedPackageHash ||
              !producerEvidenceIsBound
            ) {
              throw gatewayError(
                "REVIEW_WORKSPACE_INVALID",
                "The reviewer manifest must contain one exact copy of each committed review artifact.",
              );
            }
          }
          if (input.role === "HUMAN_DIRECTED_EXECUTOR") {
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
            const humanEvidenceKindsAreAllowed = evidenceManifest.entries.every(
              (entry) =>
                entry.kind === "HUMAN_DECISION" ||
                entry.kind === "REVIEWER_EVIDENCE",
            );
            const reviewerClaim =
              await transaction.affiliateAgentGatewayClaims.findUnique({
                where: { id: subject.reviewerClaimId },
              });
            const reviewerJob = reviewerClaim
              ? await transaction.affiliateAgentGatewayJobs.findUnique({
                  where: { id: reviewerClaim.jobId },
                })
              : null;
            const reviewerEnvelope = reviewerClaim
              ? affiliateAgentClaimEnvelopeSchema.safeParse(
                  reviewerClaim.claimEnvelopeJson,
                )
              : null;
            const reviewerResult = reviewerJob
              ? affiliateAgentTerminalResultEnvelopeSchema.safeParse(
                  reviewerJob.resultJson,
                )
              : null;
            const reviewerSubject =
              reviewerEnvelope?.success &&
              reviewerEnvelope.data.subject.type === "SUPPLY_REVIEWER"
                ? reviewerEnvelope.data.subject
                : null;
            const reviewerResultData =
              reviewerResult?.success &&
              reviewerResult.data.role === "SUPPLY_REVIEWER" &&
              reviewerResult.data.disposition === "HUMAN_REVIEW_REQUIRED"
                ? reviewerResult.data
                : null;
            const reviewerEvidenceMatches = reviewerEvidenceEntries.some(
              (humanEntry) =>
                reviewerResultData?.evidenceRefs.some((evidenceRef) =>
                  evidenceRef === humanEntry.evidenceRef &&
                  reviewerEnvelope?.success === true
                    ? reviewerEnvelope.data.evidenceManifest.entries.some(
                        (reviewerEntry) =>
                          reviewerEntry.evidenceRef === evidenceRef &&
                          (reviewerEntry.kind === "DETERMINISTIC_VALIDATION" ||
                            reviewerEntry.kind === "DURABLE_EVIDENCE") &&
                          reviewerEntry.artifactId === humanEntry.artifactId &&
                          reviewerEntry.sha256 === humanEntry.sha256 &&
                          reviewerEntry.mimeType === humanEntry.mimeType &&
                          reviewerEntry.byteSize === humanEntry.byteSize,
                      )
                    : false,
                ) === true,
            );
            const reviewerClaimIsValid =
              reviewerClaim?.status === "COMPLETED" &&
              reviewerClaim.role === "SUPPLY_REVIEWER" &&
              reviewerClaim.terminalReceiptId !== null &&
              reviewerJob?.status === "COMPLETED" &&
              reviewerJob.activeClaimId === null &&
              reviewerJob.terminalReceiptId ===
                reviewerClaim.terminalReceiptId &&
              reviewerEnvelope?.success === true &&
              hashAffiliateAgentValue(reviewerEnvelope.data) ===
                reviewerClaim.claimEnvelopeHash &&
              job.parentClaimId === subject.reviewerClaimId &&
              reviewerSubject?.supplySourceId === job.supplySourceId &&
              reviewerResultData?.jobId === reviewerJob.id &&
              reviewerResultData.claimId === reviewerClaim.id &&
              reviewerResultData.claimGeneration ===
                reviewerClaim.claimGeneration &&
              reviewerEvidenceMatches;
            if (
              !humanEvidenceKindsAreAllowed ||
              humanDecisionEntries.length !== 1 ||
              reviewerEvidenceEntries.length !== 1 ||
              humanDecisionEntries[0]?.sha256 !== subject.decisionHash ||
              !reviewerClaimIsValid
            ) {
              throw gatewayError(
                "REVIEW_WORKSPACE_INVALID",
                "The human claim must contain the exact decision and completed reviewer evidence.",
              );
            }
          }
          if (
            input.role !== "COVERAGE_PLANNER" &&
            (!job.supplySourceId || job.expectedLifecycleGeneration === null)
          ) {
            throw gatewayError(
              "LIFECYCLE_GENERATION_STALE",
              "Non-coverage jobs require a Supply Source lifecycle generation.",
            );
          }
          if (job.expectedLifecycleGeneration !== null) {
            if (
              !job.supplySourceId ||
              dependencies.lifecycle.kind !== "AVAILABLE"
            ) {
              throw gatewayError(
                "LIFECYCLE_GENERATION_STALE",
                "The Supply Source lifecycle generation is stale.",
              );
            }
            const currentGeneration =
              await dependencies.lifecycle.currentGeneration(
                job.supplySourceId,
              );
            const lifecycleAdvanceRecorded =
              input.role === "HUMAN_DIRECTED_EXECUTOR" &&
              currentGeneration === job.expectedLifecycleGeneration + 1 &&
              (await hasRecordedLifecycleAdvanceForJob(
                transaction,
                job.id,
                currentGeneration,
              ));
            if (
              currentGeneration !== job.expectedLifecycleGeneration &&
              !lifecycleAdvanceRecorded
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
          const parentArtifacts =
            job.parentClaimId === null
              ? []
              : await transaction.affiliateAgentGatewayArtifacts.findMany({
                  where: { claimId: job.parentClaimId },
                });

          if (evidenceManifest.entries.length > 0) {
            await transaction.affiliateAgentGatewayArtifacts.createMany({
              data: evidenceManifest.entries.map((entry) => {
                const parentArtifact = parentArtifacts.find(
                  (artifact) =>
                    artifact.sourceArtifactId === entry.artifactId &&
                    artifact.fileId === entry.artifactId &&
                    artifact.contentHash === entry.sha256 &&
                    artifact.mimeType === entry.mimeType &&
                    artifact.byteSize === entry.byteSize,
                );
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
                    parentArtifact?.creatingClaimId ??
                    parentArtifact?.claimId ??
                    null,
                  retentionClass: entry.retention,
                  isPinned: true,
                };
              }),
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
        identityConflict ||
        jobRaceConflict;
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
  bundle: AffiliateAgentContractBundle | null;
  roleContract: AffiliateAgentRoleContract;
}>;

type ClaimAuthorizationOptions = Readonly<{
  postEffectCompletionReceiptId?: string;
  terminalReplayReceiptId?: string;
}>;

const hasRecordedLifecycleAdvanceForJob = async (
  client: PrismaClient | Prisma.TransactionClient,
  jobId: string,
  currentGeneration: number,
): Promise<boolean> => {
  const receipts = await client.affiliateAgentGatewayOperationReceipts.findMany(
    {
      where: {
        jobId,
        commandName: "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
        status: "SUCCEEDED",
      },
      select: { responseJson: true },
    },
  );
  return receipts.some(({ responseJson: response }) => {
    if (
      response === null ||
      typeof response !== "object" ||
      Array.isArray(response) ||
      response.kind !== "COMMAND_SUCCEEDED" ||
      typeof response.safeOutput !== "object" ||
      response.safeOutput === null ||
      Array.isArray(response.safeOutput)
    ) {
      return false;
    }
    return response.safeOutput.lifecycleGeneration === currentGeneration;
  });
};

const hasRecordedLifecycleAdvance = async (
  client: PrismaClient | Prisma.TransactionClient,
  claim: AffiliateAgentGatewayClaims,
  currentGeneration: number,
): Promise<boolean> => {
  if (
    claim.role !== "HUMAN_DIRECTED_EXECUTOR" ||
    claim.lifecycleGeneration === null ||
    currentGeneration !== claim.lifecycleGeneration + 1
  ) {
    return false;
  }
  return hasRecordedLifecycleAdvanceForJob(
    client,
    claim.jobId,
    currentGeneration,
  );
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
  if (claim.tokenKeyVersion !== dependencies.tokens.keyVersion) {
    throw gatewayError("TOKEN_INVALID", "The claim token is invalid.");
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
  const isTerminalReplay = options.terminalReplayReceiptId !== undefined;
  const allowPostEffectCompletion =
    options.postEffectCompletionReceiptId !== undefined &&
    (await hasPostEffectCompletionReceipt(
      client,
      claim,
      options.postEffectCompletionReceiptId,
    ));
  if (
    options.postEffectCompletionReceiptId !== undefined &&
    !allowPostEffectCompletion
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The post-effect terminal result is not eligible for completion.",
      false,
      options.postEffectCompletionReceiptId,
    );
  }
  if (!allowPostEffectCompletion && claim.hardDeadlineAt < now) {
    throw gatewayError(
      "HARD_DEADLINE_EXCEEDED",
      "The claim hard deadline has passed.",
    );
  }
  if (!allowPostEffectCompletion && claim.tokenExpiresAt <= now) {
    throw gatewayError("TOKEN_EXPIRED", "The claim token has expired.");
  }
  if (claim.tokenInvalidatedAt !== null && !isTerminalReplay) {
    throw gatewayError("TOKEN_INVALIDATED", "The claim token is invalidated.");
  }
  if (
    claim.status !== "ACTIVE" &&
    !(
      isTerminalReplay &&
      (claim.status === "COMPLETED" || claim.status === "FAILED") &&
      claim.terminalReceiptId === options.terminalReplayReceiptId
    )
  ) {
    throw gatewayError("CLAIM_NOT_ACTIVE", "The claim is not active.");
  }
  if (!allowPostEffectCompletion && claim.leaseExpiresAt <= now) {
    throw gatewayError("LEASE_EXPIRED", "The claim lease has expired.");
  }

  const activeBundle = parseSupportedContractBundle(
    await dependencies.contracts.loadActiveBundle(),
  );
  if (
    activeBundle.supplyContract.version !== claim.supplyContractVersion ||
    activeBundle.supplyContract.hash !== claim.supplyContractHash
  ) {
    throw gatewayError(
      "SUPPLY_CONTRACT_STALE",
      "The active Supply Contract changed after the claim.",
    );
  }
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
  const roleContract = activeRoleContract(activeBundle, authorization.role);
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

  if (
    claim.role !== "COVERAGE_PLANNER" &&
    (jobSupplySourceId(
      await client.affiliateAgentGatewayJobs.findUnique({
        where: { id: claim.jobId },
      }),
    ) === null ||
      claim.lifecycleGeneration === null)
  ) {
    throw gatewayError(
      "LIFECYCLE_GENERATION_STALE",
      "Non-coverage claims require a Supply Source lifecycle generation.",
    );
  }
  if (claim.lifecycleGeneration !== null) {
    const supplySourceId = jobSupplySourceId(
      await client.affiliateAgentGatewayJobs.findUnique({
        where: { id: claim.jobId },
      }),
    );
    if (dependencies.lifecycle.kind !== "AVAILABLE") {
      throw gatewayError(
        "LIFECYCLE_GENERATION_STALE",
        "The Supply Source lifecycle is not available.",
      );
    }
    const currentGeneration =
      await dependencies.lifecycle.currentGeneration(supplySourceId);
    if (
      currentGeneration !== claim.lifecycleGeneration &&
      !(await hasRecordedLifecycleAdvance(client, claim, currentGeneration))
    ) {
      throw gatewayError(
        "LIFECYCLE_GENERATION_STALE",
        "The Supply Source lifecycle generation changed after the claim.",
      );
    }
  }

  const authorizationNow = dependencies.clock.now();
  if (!allowPostEffectCompletion && claim.hardDeadlineAt < authorizationNow) {
    throw gatewayError(
      "HARD_DEADLINE_EXCEEDED",
      "The claim hard deadline has passed.",
    );
  }
  if (!allowPostEffectCompletion && claim.tokenExpiresAt <= authorizationNow) {
    throw gatewayError("TOKEN_EXPIRED", "The claim token has expired.");
  }
  if (!allowPostEffectCompletion && claim.leaseExpiresAt <= authorizationNow) {
    throw gatewayError("LEASE_EXPIRED", "The claim lease has expired.");
  }

  const job = await client.affiliateAgentGatewayJobs.findUnique({
    where: { id: claim.jobId },
  });
  const jobMatchesClaim = isTerminalReplay
    ? job?.claimGeneration === claim.claimGeneration &&
      job.terminalReceiptId === options.terminalReplayReceiptId &&
      claim.terminalReceiptId === options.terminalReplayReceiptId &&
      ((claim.status === "COMPLETED" &&
        job.status === "COMPLETED" &&
        job.activeClaimId === null) ||
        (claim.status === "FAILED" &&
          (job.status === "RETRY_WAIT" || job.status === "PIPELINE_BLOCKED") &&
          job.activeClaimId === null))
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
    bundle: activeBundle,
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
      return await dependencies.prisma.$transaction(
        async (transaction) => {
          const authorized = await authorizeClaimOperation(
            dependencies,
            input.authorization,
            dependencies.clock.now(),
            transaction,
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
}>;

const parseRecoveredExternalOutput = (
  value: Readonly<Record<string, unknown>>,
): RecoveredExternalOutput => {
  const allowedKeys: Readonly<Record<string, true>> = {
    artifactId: true,
    byteSize: true,
    evidenceRef: true,
    mimeType: true,
    sha256: true,
  };
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => allowedKeys[key] !== true) ||
    typeof value.evidenceRef !== "string" ||
    typeof value.artifactId !== "string" ||
    typeof value.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    typeof value.mimeType !== "string" ||
    value.mimeType.length === 0 ||
    value.mimeType.length > 200 ||
    typeof value.byteSize !== "number" ||
    !Number.isInteger(value.byteSize) ||
    value.byteSize < 0 ||
    value.byteSize > MAXIMUM_GATEWAY_ARTIFACT_BYTES ||
    typeof value.evidenceRef !== "string" ||
    !value.evidenceRef.trim() ||
    value.evidenceRef.length > 200 ||
    typeof value.artifactId !== "string" ||
    !value.artifactId.trim() ||
    value.artifactId.length > 200
  ) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The recovered external command output is invalid.",
    );
  }
  return {
    evidenceRef: value.evidenceRef,
    artifactId: value.artifactId,
    sha256: value.sha256,
    mimeType: value.mimeType,
    byteSize: value.byteSize,
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

const performExternalCommand = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: AffiliateAgentExternalCommand,
): Promise<AffiliateAgentCommandResult> => {
  const requestHash = operationRequestHash(input);
  const commandHash = hashAffiliateAgentValue(command);
  const reserved = await runSerializableEffectTransaction(
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
          replayed: true,
          claimId: authorized.claim.id,
          jobId: authorized.job.id,
          claimGeneration: authorized.claim.claimGeneration,
          envelope: authorized.envelope,
          invocationId: authorized.claim.invocationId,
          role: authorized.claim.role,
        };
      }
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
      if (priorSucceededEvent?.receiptId) {
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
        let priorOutput: RecoveredExternalOutput;
        try {
          priorOutput = parseRecoveredExternalOutput(priorResult.safeOutput);
        } catch {
          throw gatewayError(
            "PARTIAL_COMMAND_UNRESOLVED",
            "The prior external command output is invalid.",
            false,
            priorReceipt.id,
          );
        }
        const priorArtifact =
          await transaction.affiliateAgentGatewayArtifacts.findUnique({
            where: {
              claimId_evidenceRef: {
                claimId: priorReceipt.claimId,
                evidenceRef: priorOutput.evidenceRef,
              },
            },
          });
        const expectedEvidenceKind =
          command.type === "RUN_DISCOVERY_QUERY"
            ? "PROVIDER_RESULT"
            : "CAPTURED_PAGE";
        if (
          !priorArtifact ||
          priorArtifact.claimGeneration !== priorReceipt.claimGeneration ||
          priorArtifact.evidenceKind !== expectedEvidenceKind ||
          priorArtifact.sourceArtifactId !== priorOutput.artifactId ||
          priorArtifact.fileId !== priorOutput.artifactId ||
          priorArtifact.contentHash !== priorOutput.sha256 ||
          priorArtifact.mimeType !== priorOutput.mimeType ||
          priorArtifact.byteSize !== priorOutput.byteSize
        ) {
          throw gatewayError(
            "PARTIAL_COMMAND_UNRESOLVED",
            "The prior external command artifact is invalid.",
            false,
            priorReceipt.id,
          );
        }
        const receiptId = dependencies.identifiers.create("receipt");
        const responseHash = hashAffiliateAgentValue({
          commandType: command.type,
          safeOutput: priorOutput,
        });
        const commandResult: AffiliateAgentCommandResult = {
          kind: "COMMAND_SUCCEEDED",
          receiptId,
          commandType: command.type,
          responseHash,
          safeOutput: priorOutput,
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
          evidenceKind: expectedEvidenceKind,
          output: priorOutput,
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
              evidenceRef: priorOutput.evidenceRef,
              replayedFromReceiptId: priorReceipt.id,
            }),
            retentionClass: "INDEFINITE",
          },
        });
        return { kind: "COMPLETED" as const, result: commandResult };
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
          inputHash: commandHash,
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
    {
      code: "INTERNAL_ERROR",
      safeMessage: "The external command could not be reserved.",
    },
  );
  if (reserved.kind === "COMPLETED") return reserved.result;

  let recovered: Readonly<Record<string, unknown>> | null;
  try {
    if (command.type === "RUN_DISCOVERY_QUERY") {
      const adapter = dependencies.commands.external.RUN_DISCOVERY_QUERY;
      if (!adapter) {
        throw gatewayError(
          "COMMAND_NOT_PERMITTED",
          "The discovery command has no installed external adapter.",
        );
      }
      recovered = reserved.replayed
        ? await adapter.recover(reserved.externalOperationKey)
        : await adapter.start(reserved.externalOperationKey, {
            claim: reserved.envelope,
            command,
          });
    } else {
      const adapter = dependencies.commands.external.CAPTURE_CLAIM_URL;
      if (!adapter) {
        throw gatewayError(
          "COMMAND_NOT_PERMITTED",
          "The capture command has no installed external adapter.",
        );
      }
      recovered = reserved.replayed
        ? await adapter.recover(reserved.externalOperationKey)
        : await adapter.start(reserved.externalOperationKey, {
            claim: reserved.envelope,
            command,
          });
    }
  } catch (error) {
    if (error instanceof AffiliateAgentGatewayError) throw error;
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The external command response was lost and requires recovery.",
      true,
      reserved.receiptId,
    );
  }
  if (recovered === null) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The external command effect is unknown and requires reconciliation.",
      false,
      reserved.receiptId,
    );
  }
  let capture: RecoveredExternalOutput;
  try {
    capture = parseRecoveredExternalOutput(recovered);
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
  } catch (error) {
    if (error instanceof AffiliateAgentGatewayError) throw error;
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The external command evidence could not be verified.",
      true,
      reserved.receiptId,
    );
  }
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
  return runSerializableEffectTransaction(
    dependencies,
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
          "The external command receipt requires reconciliation.",
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
      const [claim, job] = await Promise.all([
        transaction.affiliateAgentGatewayClaims.findUnique({
          where: { id: reserved.claimId },
        }),
        transaction.affiliateAgentGatewayJobs.findUnique({
          where: { id: reserved.jobId },
        }),
      ]);
      const finalizationNow = dependencies.clock.now();
      if (
        !claim ||
        claim.status !== "ACTIVE" ||
        (claim.leaseExpiresAt <= finalizationNow &&
          receipt.startedAt >= claim.leaseExpiresAt) ||
        (claim.hardDeadlineAt < finalizationNow &&
          receipt.startedAt >= claim.hardDeadlineAt) ||
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
      await ensureExternalArtifact(transaction, {
        claimId: reserved.claimId,
        claimGeneration: reserved.claimGeneration,
        evidenceKind:
          command.type === "RUN_DISCOVERY_QUERY"
            ? "PROVIDER_RESULT"
            : "CAPTURED_PAGE",
        output: capture,
        rowId: dependencies.identifiers.create("artifact"),
        receiptId: reserved.receiptId,
      });
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
            completedAt: completedAt,
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
    {
      code: "PARTIAL_COMMAND_UNRESOLVED",
      safeMessage: "The external command could not be finalized.",
      receiptId: reserved.receiptId,
    },
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
  const requestHash = operationRequestHash(input);
  const reserved = await runSerializableEffectTransaction(
    dependencies,
    async (transaction) => {
      const authorized = await authorizeClaimOperation(
        dependencies,
        input.authorization,
        dependencies.clock.now(),
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
      const lifecycleIdentity = {
        caseId: subject.caseId,
        decisionHash: subject.decisionHash,
        recordedHumanActorId: subject.recordedHumanActorId,
        commandRef: command.data.lifecycleCommandRef,
      };
      const resolvedLifecycleIdentity =
        await authority.resolveRecordedCommand(lifecycleIdentity);
      if (
        resolvedLifecycleIdentity === null ||
        resolvedLifecycleIdentity.caseId !== lifecycleIdentity.caseId ||
        resolvedLifecycleIdentity.decisionHash !==
          lifecycleIdentity.decisionHash ||
        resolvedLifecycleIdentity.recordedHumanActorId !==
          lifecycleIdentity.recordedHumanActorId ||
        resolvedLifecycleIdentity.commandRef !== lifecycleIdentity.commandRef
      ) {
        throw gatewayError(
          "COMMAND_NOT_PERMITTED",
          "The lifecycle command does not match the recorded authority.",
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
          replayed: true,
          claimId: authorized.claim.id,
          jobId: authorized.job.id,
          claimGeneration: authorized.claim.claimGeneration,
          expectedGeneration: authorized.claim.lifecycleGeneration,
          inputHash: hashAffiliateAgentValue(command),
          identity: lifecycleIdentity,
          commandRef: command.data.lifecycleCommandRef,
          recordedHumanActorId: subject.recordedHumanActorId,
          invocationId: authorized.claim.invocationId,
          role: authorized.claim.role,
        };
      }
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
        let priorResult: AffiliateAgentCommandResult;
        try {
          priorResult = replayCommand(priorReceipt.responseJson);
        } catch {
          continue;
        }
        if (
          priorResult.commandType !== command.type ||
          priorResult.safeOutput === null ||
          priorResult.safeOutput.lifecycleGeneration !==
            authorized.claim.lifecycleGeneration! + 1
        ) {
          continue;
        }
        const priorEvent =
          await transaction.affiliateAgentGatewayEvents.findFirst({
            where: {
              receiptId: priorReceipt.id,
              eventType: "LIFECYCLE_COMMAND_SUCCEEDED",
            },
          });
        const priorPayload = priorEvent?.payload;
        if (
          priorPayload === null ||
          typeof priorPayload !== "object" ||
          Array.isArray(priorPayload) ||
          priorPayload.lifecycleCommandRef !==
            command.data.lifecycleCommandRef ||
          priorPayload.recordedHumanActorId !== subject.recordedHumanActorId
        ) {
          continue;
        }
        const receiptId = dependencies.identifiers.create("receipt");
        const replayedResult: AffiliateAgentCommandResult = {
          ...priorResult,
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
            inputHash: hashAffiliateAgentValue(command),
            outputHash: responseHash,
            payload: asPrismaJson({
              lifecycleCommandRef: command.data.lifecycleCommandRef,
              priorReceiptId: priorReceipt.id,
            }),
            retentionClass: "INDEFINITE",
          },
        });
        return {
          kind: "COMPLETED" as const,
          result: replayedResult,
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
        replayed: false,
        claimId: authorized.claim.id,
        jobId: authorized.job.id,
        claimGeneration: authorized.claim.claimGeneration,
        expectedGeneration: authorized.claim.lifecycleGeneration,
        inputHash: hashAffiliateAgentValue(command),
        identity: lifecycleIdentity,
        commandRef: command.data.lifecycleCommandRef,
        recordedHumanActorId: subject.recordedHumanActorId,
        invocationId: authorized.claim.invocationId,
        role: authorized.claim.role,
      };
    },
    {
      code: "INTERNAL_ERROR",
      safeMessage: "The lifecycle command could not be reserved.",
    },
  );
  if (reserved.kind === "COMPLETED") return reserved.result;

  let recoveredSafeOutput: Readonly<Record<string, unknown>> | null;
  try {
    recoveredSafeOutput = reserved.replayed
      ? await authority.recover(reserved.receiptId)
      : await authority.execute({
          receiptId: reserved.receiptId,
          expectedGeneration: reserved.expectedGeneration,
          inputHash: reserved.inputHash,
          identity: reserved.identity,
        });
  } catch {
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

  return runSerializableEffectTransaction(
    dependencies,
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
      const [claim, job] = await Promise.all([
        transaction.affiliateAgentGatewayClaims.findUnique({
          where: { id: reserved.claimId },
        }),
        transaction.affiliateAgentGatewayJobs.findUnique({
          where: { id: reserved.jobId },
        }),
      ]);
      const finalizationNow = dependencies.clock.now();
      if (
        !claim ||
        claim.status !== "ACTIVE" ||
        (claim.leaseExpiresAt <= finalizationNow &&
          receipt.startedAt >= claim.leaseExpiresAt) ||
        (claim.hardDeadlineAt < finalizationNow &&
          receipt.startedAt >= claim.hardDeadlineAt) ||
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
            completedAt: completedAt,
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
    {
      code: "PARTIAL_COMMAND_UNRESOLVED",
      safeMessage: "The lifecycle command could not be finalized.",
      receiptId: reserved.receiptId,
    },
  );
};
const blockDuplicatePackageCommit = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "EXECUTE_COMMAND" }>,
  command: Extract<
    AffiliateAgentCommand,
    { type: "COMMIT_DECLARATIVE_PACKAGE" }
  >,
): Promise<AffiliateAgentCommandResult | "BLOCKED" | null> =>
  runSerializableEffectTransaction(
    dependencies,
    async (transaction) => {
      const authorized = await authorizeClaimOperation(
        dependencies,
        input.authorization,
        dependencies.clock.now(),
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
      if (existing) return null;
      const priorReceipts =
        await transaction.affiliateAgentGatewayOperationReceipts.findMany({
          where: {
            jobId: authorized.job.id,
            commandName: "COMMIT_DECLARATIVE_PACKAGE",
            status: "SUCCEEDED",
          },
        });
      let priorCommitReceipt: AffiliateAgentGatewayOperationReceipts | null =
        null;
      let duplicateReceipt: AffiliateAgentGatewayOperationReceipts | null =
        null;
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
      duplicateReceipt ??= priorCommitReceipt;
      const now = dependencies.clock.now();
      if (duplicateResult !== null) {
        const receiptId = dependencies.identifiers.create("receipt");
        const replayedResult: AffiliateAgentCommandResult = {
          ...duplicateResult,
          receiptId,
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
      const claimUpdated =
        await transaction.affiliateAgentGatewayClaims.updateMany({
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
        });
      const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany(
        {
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
        },
      );
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
      return "BLOCKED" as const;
    },
    {
      code: "PARTIAL_COMMAND_UNRESOLVED",
      safeMessage:
        "The package commit was blocked because it already succeeded.",
    },
  );

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
  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      if (transactionalCommand.type === "COMMIT_DECLARATIVE_PACKAGE") {
        const duplicateCommit = await blockDuplicatePackageCommit(
          dependencies,
          input,
          transactionalCommand,
        );
        if (duplicateCommit === "BLOCKED") {
          throw gatewayError(
            "PARTIAL_COMMAND_UNRESOLVED",
            "The package commit was blocked because it already succeeded.",
          );
        }
        if (duplicateCommit !== null) return duplicateCommit;
      }

      return await dependencies.prisma.$transaction(
        async (transaction) => {
          const authorized = await authorizeClaimOperation(
            dependencies,
            input.authorization,
            dependencies.clock.now(),
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
          const now = dependencies.clock.now();
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
          if (transactionalCommand.type === "VALIDATE_DECLARATIVE_PACKAGE") {
            const claimSupplySourceId =
              authorized.envelope.role === "MAPPING_PRODUCER"
                ? authorized.envelope.subject.supplySourceId
                : null;
            if (
              claimSupplySourceId === null ||
              transactionalCommand.data.candidatePackage.supplySourceId !==
                claimSupplySourceId
            ) {
              throw gatewayError(
                "COMMAND_NOT_PERMITTED",
                "The package Supply Source does not match the claim.",
              );
            }
            if (
              transactionalCommand.data.evidenceManifestHash !==
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
                transactionalCommand.data.candidatePackage.listUrlRef,
                ...transactionalCommand.data.candidatePackage.evidenceRefs,
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
            const validationOutputCandidate =
              validationReceipt?.responseJson !== null &&
              typeof validationReceipt?.responseJson === "object" &&
              !Array.isArray(validationReceipt.responseJson) &&
              "safeOutput" in validationReceipt.responseJson
                ? validationReceipt.responseJson.safeOutput
                : null;
            const validationOutput =
              affiliateAgentDeclarativePackageValidationOutputSchema.safeParse(
                validationOutputCandidate,
              );
            if (
              validationReceipt?.claimId !== authorized.claim.id ||
              validationReceipt?.jobId !== authorized.job.id ||
              validationReceipt?.claimGeneration !==
                authorized.claim.claimGeneration ||
              validationReceipt.operationKind !== "EXECUTE_COMMAND" ||
              validationReceipt.status !== "SUCCEEDED" ||
              validationReceipt.commandName !==
                "VALIDATE_DECLARATIVE_PACKAGE" ||
              !validationOutput.success ||
              validationOutput.data.valid !== true ||
              validationOutput.data.validatedPackageHash !==
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
          if (transactionalCommand.type === "VALIDATE_DECLARATIVE_PACKAGE") {
            const parsedOutput =
              affiliateAgentDeclarativePackageValidationOutputSchema.safeParse(
                safeOutput,
              );
            if (
              !parsedOutput.success ||
              parsedOutput.data.validatedPackageHash !==
                hashAffiliateAgentValue(
                  transactionalCommand.data.candidatePackage,
                )
            ) {
              throw gatewayError(
                "PARTIAL_COMMAND_UNRESOLVED",
                "The package validation adapter returned invalid output.",
                false,
                receiptId,
              );
            }
            safeOutput = parsedOutput.data;
          } else {
            const parsedOutput =
              affiliateAgentDeclarativePackageCommitOutputSchema.safeParse(
                safeOutput,
              );
            if (
              !parsedOutput.success ||
              parsedOutput.data.packageHash !==
                transactionalCommand.data.validatedPackageHash
            ) {
              throw gatewayError(
                "PARTIAL_COMMAND_UNRESOLVED",
                "The package commit adapter returned invalid output.",
                false,
                receiptId,
              );
            }
            safeOutput = parsedOutput.data;
          }

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

const recordInvocationFailure = async (input: {
  dependencies: AffiliateAgentGatewayDependencies;
  transaction: Prisma.TransactionClient;
  authorized: Pick<AuthorizedClaim, "claim" | "job">;
  idempotencyKey: string;
  operationKind: "SUBMIT_RESULT" | "RECORD_FAILURE";
  requestHash: string;
  failureCode: AffiliateAgentInvocationFailureCode;
  failedAt: Date;
  safeSummary: string;
  evidenceRefs: readonly string[];
  schemaCorrectionCount?: number;
}): Promise<AffiliateAgentInvocationFailedResult> => {
  await assertNoPendingClaimEffects(
    input.transaction,
    input.authorized.claim.id,
  );
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
  const pipelineBlocked = retryDelay === null;
  const nextAttemptAt = pipelineBlocked
    ? null
    : addSeconds(input.failedAt, retryDelay!);
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
        evidenceRefs: [...input.evidenceRefs],
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
const AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND =
  "SUPPLY_REVIEWER_TERMINAL_EFFECT";
const AFFILIATE_AGENT_TERMINAL_EFFECT_OPERATION = "TERMINAL_EFFECT";
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
    receipt !== null &&
    receipt.status === "SUCCEEDED" &&
    receipt.claimId === claim.id &&
    receipt.jobId === claim.jobId &&
    receipt.claimGeneration === claim.claimGeneration &&
    receipt.startedAt < claim.leaseExpiresAt &&
    receipt.startedAt < claim.hardDeadlineAt &&
    ((claim.role === "SUPPLY_REVIEWER" &&
      receipt.operationKind === AFFILIATE_AGENT_TERMINAL_EFFECT_OPERATION &&
      receipt.commandName === AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND) ||
      (claim.role === "HUMAN_DIRECTED_EXECUTOR" &&
        receipt.operationKind === "EXECUTE_COMMAND" &&
        receipt.commandName === "EXECUTE_RECORDED_LIFECYCLE_COMMAND"))
  );
};

type ReviewerTerminalEffectReceiptState =
  | Readonly<{
      kind: "PENDING";
      result: AffiliateAgentReviewerTerminalResult;
      terminalIdempotencyKey: string;
      terminalRequestHash: string;
    }>
  | Readonly<{
      kind: "SUCCEEDED";
      result: AffiliateAgentReviewerTerminalResult;
      resultHash: string;
      safeOutput: Readonly<Record<string, unknown>>;
      terminalIdempotencyKey: string;
      terminalRequestHash: string;
    }>;

type ReviewerTerminalEffectReservation = Readonly<{
  receipt: AffiliateAgentGatewayOperationReceipts;
  replayed: boolean;
  terminalIdempotencyKey: string;
  terminalRequestHash: string;
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
    case "APPROVED": {
      const scopedInput = { ...commonInput, result: input.result };
      return operation === "EXECUTE"
        ? adapter.APPROVED.execute(scopedInput)
        : adapter.APPROVED.recover(scopedInput);
    }
    case "ACTIVATED": {
      const scopedInput = { ...commonInput, result: input.result };
      return operation === "EXECUTE"
        ? adapter.ACTIVATED.execute(scopedInput)
        : adapter.ACTIVATED.recover(scopedInput);
    }
    case "PRODUCER_REPAIR_REQUIRED": {
      const scopedInput = { ...commonInput, result: input.result };
      return operation === "EXECUTE"
        ? adapter.PRODUCER_REPAIR_REQUIRED.execute(scopedInput)
        : adapter.PRODUCER_REPAIR_REQUIRED.recover(scopedInput);
    }
    case "REGRESSION_ASSESSED": {
      const scopedInput = { ...commonInput, result: input.result };
      return operation === "EXECUTE"
        ? adapter.REGRESSION_ASSESSED.execute(scopedInput)
        : adapter.REGRESSION_ASSESSED.recover(scopedInput);
    }
    case "SOURCE_EXCLUSION_ASSESSED": {
      const scopedInput = { ...commonInput, result: input.result };
      return operation === "EXECUTE"
        ? adapter.SOURCE_EXCLUSION_ASSESSED.execute(scopedInput)
        : adapter.SOURCE_EXCLUSION_ASSESSED.recover(scopedInput);
    }
    case "EXACT_TARGET_REJECTED": {
      const scopedInput = { ...commonInput, result: input.result };
      return operation === "EXECUTE"
        ? adapter.EXACT_TARGET_REJECTED.execute(scopedInput)
        : adapter.EXACT_TARGET_REJECTED.recover(scopedInput);
    }
    case "HUMAN_REVIEW_REQUIRED": {
      const scopedInput = { ...commonInput, result: input.result };
      return operation === "EXECUTE"
        ? adapter.HUMAN_REVIEW_REQUIRED.execute(scopedInput)
        : adapter.HUMAN_REVIEW_REQUIRED.recover(scopedInput);
    }
  }
  throw new Error("Unsupported reviewer terminal disposition.");
};

const parseReviewerTerminalEffectState = (
  value: Prisma.JsonValue | null,
  receiptId: string,
): ReviewerTerminalEffectReceiptState => {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof value.kind !== "string"
    ) {
      throw new Error("Invalid terminal effect state.");
    }
    if (value.kind === "PENDING") {
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
      return {
        kind: "PENDING",
        result: result.data,
        terminalIdempotencyKey: value.terminalIdempotencyKey,
        terminalRequestHash: value.terminalRequestHash,
      };
    }
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
    return {
      kind: "SUCCEEDED",
      result: result.data,
      resultHash: value.resultHash,
      safeOutput: parseBoundedSafeOutput(value.safeOutput, receiptId),
      terminalIdempotencyKey: value.terminalIdempotencyKey,
      terminalRequestHash: value.terminalRequestHash,
    };
  } catch {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect receipt is invalid.",
      false,
      receiptId,
    );
  }
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
    async (transaction) => {
      const authorized = await authorizeClaimOperation(
        dependencies,
        authorization,
        dependencies.clock.now(),
        transaction,
        postEffectCompletionReceiptId === undefined
          ? undefined
          : { postEffectCompletionReceiptId },
      );
      validateTerminalResultScope(authorized, result);
      await assertClaimEvidenceRefs(
        transaction,
        authorized.claim.id,
        result.evidenceRefs,
        "EVIDENCE_REFERENCE_NOT_PERMITTED",
        "The reviewer terminal effect references evidence outside the claim manifest.",
      );
      const existing =
        await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
          where: {
            claimId_idempotencyKey: {
              claimId: authorized.claim.id,
              idempotencyKey,
            },
          },
        });
      if (existing) {
        if (
          existing.operationKind !==
            AFFILIATE_AGENT_TERMINAL_EFFECT_OPERATION ||
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
            replayed: existing.status === "PENDING",
            terminalIdempotencyKey: existingState.terminalIdempotencyKey,
            terminalRequestHash: existingState.terminalRequestHash,
          };
        }
        throw gatewayError(
          "PARTIAL_COMMAND_UNRESOLVED",
          "The reviewer terminal effect requires reconciliation.",
          false,
          existing.id,
        );
      }
      await assertNoPendingClaimEffects(transaction, authorized.claim.id);
      const now = dependencies.clock.now();
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
        replayed: false,
        terminalIdempotencyKey,
        terminalRequestHash,
      };
    },
    {
      code: "INTERNAL_ERROR",
      safeMessage: "The reviewer terminal effect could not be reserved.",
    },
  );

const finalizeReviewerTerminalEffect = async (
  dependencies: AffiliateAgentGatewayDependencies,
  reservation: ReviewerTerminalEffectReservation,
  result: AffiliateAgentReviewerTerminalResult,
  requestHash: string,
  safeOutput: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>> => {
  const state: ReviewerTerminalEffectReceiptState = {
    kind: "SUCCEEDED",
    result,
    resultHash: hashAffiliateAgentValue(result),
    safeOutput,
    terminalIdempotencyKey: reservation.terminalIdempotencyKey,
    terminalRequestHash: reservation.terminalRequestHash,
  };
  const responseHash = hashAffiliateAgentValue(state);
  const completedAt = dependencies.clock.now();
  return runSerializableEffectTransaction(
    dependencies,
    async (transaction) => {
      const current =
        await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
          where: { id: reservation.receipt.id },
        });
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
      if (current.status === "SUCCEEDED") {
        const completed = parseReviewerTerminalEffectState(
          current.responseJson,
          current.id,
        );
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
      const [claim, job] = await Promise.all([
        transaction.affiliateAgentGatewayClaims.findUnique({
          where: { id: current.claimId },
        }),
        transaction.affiliateAgentGatewayJobs.findUnique({
          where: { id: current.jobId },
        }),
      ]);
      const finalizationNow = dependencies.clock.now();
      if (
        !claim ||
        claim.status !== "ACTIVE" ||
        claim.claimGeneration !== current.claimGeneration ||
        (claim.leaseExpiresAt <= finalizationNow &&
          current.startedAt >= claim.leaseExpiresAt) ||
        (claim.hardDeadlineAt < finalizationNow &&
          current.startedAt >= claim.hardDeadlineAt) ||
        !job ||
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
      const jobUpdated = await transaction.affiliateAgentGatewayJobs.updateMany(
        {
          where: {
            id: job.id,
            status: "CLAIMED",
            activeClaimId: claim.id,
            claimGeneration: claim.claimGeneration,
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
    },
    {
      code: "PARTIAL_COMMAND_UNRESOLVED",
      safeMessage: "The reviewer terminal effect could not be finalized.",
      receiptId: reservation.receipt.id,
    },
  );
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
      state.resultHash !== hashAffiliateAgentValue(result)
    ) {
      throw gatewayError(
        "IDEMPOTENCY_KEY_REUSED",
        "The reviewer terminal effect result does not match its receipt.",
      );
    }
    return reservation.receipt.id;
  }
  let recovered: Readonly<Record<string, unknown>> | null = null;
  try {
    const effectInput = {
      receiptId: reservation.receipt.id,
      claim: authorized.envelope,
      result,
    };
    if (reservation.replayed) {
      recovered = await runReviewerTerminalEffect(
        adapter,
        effectInput,
        "RECOVER",
      );
    } else {
      try {
        recovered = await runReviewerTerminalEffect(
          adapter,
          effectInput,
          "EXECUTE",
        );
      } catch {
        recovered = await runReviewerTerminalEffect(
          adapter,
          effectInput,
          "RECOVER",
        );
      }
    }
  } catch {
    recovered = null;
  }
  if (recovered === null) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The reviewer terminal effect requires reconciliation.",
      false,
      reservation.receipt.id,
    );
  }
  let safeOutput: Readonly<Record<string, unknown>>;
  try {
    safeOutput = parseBoundedSafeOutput(recovered, reservation.receipt.id);
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
  );
  return reservation.receipt.id;
};
const completeRecoveredReviewerTerminalResult = async (
  dependencies: AffiliateAgentGatewayDependencies,
  effectReceipt: AffiliateAgentGatewayOperationReceipts,
  result: AffiliateAgentReviewerTerminalResult,
): Promise<AffiliateAgentTerminalAcceptedResult> =>
  runSerializableEffectTransaction(
    dependencies,
    async (transaction) => {
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
        throw gatewayError(
          "PARTIAL_COMMAND_UNRESOLVED",
          "The recovered reviewer result claim does not exist.",
          false,
          effectReceipt.id,
        );
      }
      if (
        currentEffect.status !== "SUCCEEDED" ||
        currentEffect.commandName !== AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND ||
        currentEffect.claimId !== claim.id ||
        currentEffect.jobId !== job.id ||
        currentEffect.claimGeneration !== claim.claimGeneration ||
        currentEffect.requestHash !== effectReceipt.requestHash ||
        currentEffect.requestHash !==
          reviewerTerminalEffectRequestHash(claim, result)
      ) {
        throw gatewayError(
          "PARTIAL_COMMAND_UNRESOLVED",
          "The recovered reviewer effect is not durably completed.",
          false,
          effectReceipt.id,
        );
      }
      const completedEffectState = parseReviewerTerminalEffectState(
        currentEffect.responseJson,
        currentEffect.id,
      );
      if (
        completedEffectState.kind !== "SUCCEEDED" ||
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
      if (
        claim.status === "COMPLETED" &&
        job.status === "COMPLETED" &&
        claim.terminalReceiptId !== null
      ) {
        const terminalReceipt =
          await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
            where: { id: claim.terminalReceiptId },
          });
        if (
          !terminalReceipt ||
          terminalReceipt.idempotencyKey !==
            completedEffectState.terminalIdempotencyKey ||
          terminalReceipt.requestHash !==
            completedEffectState.terminalRequestHash
        ) {
          throw gatewayError(
            "PARTIAL_COMMAND_UNRESOLVED",
            "The recovered reviewer terminal receipt is missing or changed.",
            false,
            effectReceipt.id,
          );
        }
        return replayTerminalResult(terminalReceipt.responseJson);
      }
      if (
        claim.status !== "ACTIVE" ||
        claim.tokenInvalidatedAt !== null ||
        job.status !== "CLAIMED" ||
        job.activeClaimId !== claim.id ||
        job.claimGeneration !== claim.claimGeneration
      ) {
        throw gatewayError(
          "PARTIAL_COMMAND_UNRESOLVED",
          "The recovered reviewer result claim requires reconciliation.",
          false,
          effectReceipt.id,
        );
      }
      const envelope = affiliateAgentClaimEnvelopeSchema.safeParse(
        claim.claimEnvelopeJson,
      );
      if (
        !envelope.success ||
        envelope.data.claimId !== claim.id ||
        envelope.data.jobId !== job.id ||
        envelope.data.claimGeneration !== claim.claimGeneration ||
        envelope.data.role !== "SUPPLY_REVIEWER" ||
        claim.claimEnvelopeHash !== hashAffiliateAgentValue(envelope.data)
      ) {
        throw gatewayError(
          "PARTIAL_COMMAND_UNRESOLVED",
          "The recovered reviewer claim envelope is invalid.",
          false,
          effectReceipt.id,
        );
      }
      const now = dependencies.clock.now();
      if (
        (claim.hardDeadlineAt < now &&
          effectReceipt.startedAt >= claim.hardDeadlineAt) ||
        (claim.leaseExpiresAt <= now &&
          effectReceipt.startedAt >= claim.leaseExpiresAt)
      ) {
        throw gatewayError(
          "PARTIAL_COMMAND_UNRESOLVED",
          "The recovered reviewer result missed its claim deadline.",
          false,
          effectReceipt.id,
        );
      }
      await assertClaimEvidenceRefs(
        transaction,
        claim.id,
        result.evidenceRefs,
        "EVIDENCE_REFERENCE_NOT_PERMITTED",
        "The recovered reviewer result references evidence outside the claim manifest.",
      );
      const resultHash = hashAffiliateAgentValue(result);
      const requestHash = completedEffectState.terminalRequestHash;
      const idempotencyKey = completedEffectState.terminalIdempotencyKey;
      const existing =
        await transaction.affiliateAgentGatewayOperationReceipts.findUnique({
          where: {
            claimId_idempotencyKey: {
              claimId: claim.id,
              idempotencyKey,
            },
          },
        });
      if (existing) {
        if (
          existing.status === "SUCCEEDED" &&
          existing.requestHash === requestHash
        ) {
          return replayTerminalResult(existing.responseJson);
        }
        throw gatewayError(
          "PARTIAL_COMMAND_UNRESOLVED",
          "The recovered reviewer terminal result receipt changed.",
          false,
          existing.id,
        );
      }
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
      const jobCompleted =
        await transaction.affiliateAgentGatewayJobs.updateMany({
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
    },
    {
      code: "PARTIAL_COMMAND_UNRESOLVED",
      safeMessage:
        "The recovered reviewer terminal result could not be completed.",
      receiptId: effectReceipt.id,
    },
  );

const performTerminalResult = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>,
): Promise<AffiliateAgentSubmitResultOutcome> => {
  assertIdentifier(input.idempotencyKey, "Operation idempotency key");
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
    if (
      existing.operationKind !== input.kind ||
      existing.requestHash !== requestHash
    ) {
      throw gatewayError(
        "IDEMPOTENCY_KEY_REUSED",
        "The operation idempotency key was used for different input.",
      );
    }
    const replayed = replaySubmitResult(existing.responseJson);
    const replayAuthorizationOptions =
      replayed.kind === "TERMINAL_ACCEPTED" ||
      replayed.kind === "INVOCATION_FAILED"
        ? { terminalReplayReceiptId: existing.id }
        : undefined;
    await authorizeClaimOperation(
      dependencies,
      input.authorization,
      dependencies.clock.now(),
      dependencies.prisma,
      replayAuthorizationOptions,
    );
    return replayed;
  }
  const parsedResultBeforeTransaction =
    affiliateAgentTerminalResultEnvelopeSchema.safeParse(input.result);
  let postEffectCompletionReceiptId: string | undefined;
  if (
    parsedResultBeforeTransaction.success &&
    parsedResultBeforeTransaction.data.role === "SUPPLY_REVIEWER"
  ) {
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
    if (effectReceipt?.status === "SUCCEEDED") {
      postEffectCompletionReceiptId = effectReceipt.id;
    }
  } else if (
    parsedResultBeforeTransaction.success &&
    parsedResultBeforeTransaction.data.role === "HUMAN_DIRECTED_EXECUTOR" &&
    parsedResultBeforeTransaction.data.disposition ===
      "LIFECYCLE_COMMAND_EXECUTED"
  ) {
    postEffectCompletionReceiptId =
      parsedResultBeforeTransaction.data.payload.receiptId;
  }
  if (postEffectCompletionReceiptId !== undefined) {
    const claimTiming =
      await dependencies.prisma.affiliateAgentGatewayClaims.findUnique({
        where: { id: input.authorization.claimId },
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
      postEffectCompletionReceiptId = undefined;
    }
  }
  let reviewerTerminalEffectReceiptId: string | undefined;
  const authorizationOptions =
    postEffectCompletionReceiptId === undefined
      ? undefined
      : { postEffectCompletionReceiptId };
  const preAuthorized = await authorizeClaimOperation(
    dependencies,
    input.authorization,
    dependencies.clock.now(),
    dependencies.prisma,
    authorizationOptions,
  );
  const pendingEffects = await reconcilePendingEffectsForClaim(
    dependencies,
    preAuthorized.claim.id,
  );
  if (pendingEffects.admissionHalted || pendingEffects.unresolved > 0) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "A claim effect is still being reconciled.",
      true,
    );
  }
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
  if (recoveredTerminalReceipt?.status === "SUCCEEDED") {
    if (
      recoveredTerminalReceipt.operationKind !== input.kind ||
      recoveredTerminalReceipt.requestHash !== requestHash
    ) {
      throw gatewayError(
        "IDEMPOTENCY_KEY_REUSED",
        "The operation idempotency key was used for different input.",
      );
    }
    const replayed = replaySubmitResult(recoveredTerminalReceipt.responseJson);
    const replayAuthorizationOptions =
      replayed.kind === "TERMINAL_ACCEPTED" ||
      replayed.kind === "INVOCATION_FAILED"
        ? { terminalReplayReceiptId: recoveredTerminalReceipt.id }
        : undefined;
    await authorizeClaimOperation(
      dependencies,
      input.authorization,
      dependencies.clock.now(),
      dependencies.prisma,
      replayAuthorizationOptions,
    );
    return replayed;
  }
  const authorizedForTerminal = await authorizeClaimOperation(
    dependencies,
    input.authorization,
    dependencies.clock.now(),
    dependencies.prisma,
    authorizationOptions,
  );
  if (
    !existing &&
    parsedResultBeforeTransaction.success &&
    parsedResultBeforeTransaction.data.role === "SUPPLY_REVIEWER"
  ) {
    validateTerminalResultScope(
      authorizedForTerminal,
      parsedResultBeforeTransaction.data,
    );
    reviewerTerminalEffectReceiptId = await ensureReviewerTerminalEffect(
      dependencies,
      input.authorization,
      authorizedForTerminal,
      parsedResultBeforeTransaction.data,
      input.idempotencyKey,
      requestHash,
      postEffectCompletionReceiptId,
    );
  }

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
          if (existing?.status === "SUCCEEDED") {
            if (
              existing.operationKind !== input.kind ||
              existing.requestHash !== requestHash
            ) {
              throw gatewayError(
                "IDEMPOTENCY_KEY_REUSED",
                "The operation idempotency key was used for different input.",
              );
            }
            const replayed = replaySubmitResult(existing.responseJson);
            const replayAuthorizationOptions =
              replayed.kind === "TERMINAL_ACCEPTED" ||
              replayed.kind === "INVOCATION_FAILED"
                ? { terminalReplayReceiptId: existing.id }
                : undefined;
            await authorizeClaimOperation(
              dependencies,
              input.authorization,
              dependencies.clock.now(),
              transaction,
              replayAuthorizationOptions,
            );
            return replayed;
          }
          const now = dependencies.clock.now();
          const authorized = await authorizeClaimOperation(
            dependencies,
            input.authorization,
            now,
            transaction,
            reviewerTerminalEffectReceiptId !== undefined
              ? {
                  postEffectCompletionReceiptId:
                    reviewerTerminalEffectReceiptId,
                }
              : postEffectCompletionReceiptId === undefined
                ? undefined
                : { postEffectCompletionReceiptId },
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
          if (parsedResult.data.role === "SUPPLY_REVIEWER") {
            const effectRequestHash = reviewerTerminalEffectRequestHash(
              authorized.claim,
              parsedResult.data,
            );
            const effectReceipt =
              await transaction.affiliateAgentGatewayOperationReceipts.findUnique(
                {
                  where: {
                    claimId_idempotencyKey: {
                      claimId: authorized.claim.id,
                      idempotencyKey: reviewerTerminalEffectIdempotencyKey(),
                    },
                  },
                },
              );
            const effectState = effectReceipt
              ? parseReviewerTerminalEffectState(
                  effectReceipt.responseJson,
                  effectReceipt.id,
                )
              : null;
            if (
              !effectReceipt ||
              effectReceipt.id !== reviewerTerminalEffectReceiptId ||
              effectReceipt.status !== "SUCCEEDED" ||
              effectReceipt.requestHash !== effectRequestHash ||
              effectReceipt.startedAt >= authorized.claim.leaseExpiresAt ||
              effectReceipt.startedAt >= authorized.claim.hardDeadlineAt ||
              effectState?.kind !== "SUCCEEDED" ||
              effectState.resultHash !==
                hashAffiliateAgentValue(parsedResult.data)
            ) {
              throw gatewayError(
                "PARTIAL_COMMAND_UNRESOLVED",
                "The reviewer terminal effect is not durably completed.",
                false,
                effectReceipt?.id,
              );
            }
          }
          if (
            parsedResult.data.role === "MAPPING_PRODUCER" &&
            (parsedResult.data.disposition === "PACKAGE_COMMITTED" ||
              parsedResult.data.disposition === "BOUNDED_REPAIR_SUBMITTED")
          ) {
            if (
              parsedResult.data.disposition === "BOUNDED_REPAIR_SUBMITTED" &&
              authorized.envelope.role === "MAPPING_PRODUCER" &&
              parsedResult.data.payload.repairPass !==
                authorized.envelope.subject.pass
            ) {
              throw gatewayError(
                "TERMINAL_DISPOSITION_NOT_PERMITTED",
                "The repair pass does not match the Mapping Producer claim.",
              );
            }
            const commitReceipt =
              await transaction.affiliateAgentGatewayOperationReceipts.findUnique(
                {
                  where: {
                    id: parsedResult.data.payload.commitReceiptId,
                  },
                },
              );
            let commitResult: AffiliateAgentCommandResult | null = null;
            if (commitReceipt !== null && commitReceipt.responseJson !== null) {
              try {
                commitResult = replayCommand(commitReceipt.responseJson);
              } catch {
                commitResult = null;
              }
            }
            if (
              commitReceipt?.claimId !== authorized.claim.id ||
              commitReceipt?.jobId !== authorized.job.id ||
              commitReceipt?.claimGeneration !==
                authorized.claim.claimGeneration ||
              commitReceipt?.operationKind !== "EXECUTE_COMMAND" ||
              commitReceipt?.status !== "SUCCEEDED" ||
              commitReceipt?.commandName !== "COMMIT_DECLARATIVE_PACKAGE" ||
              commitResult?.receiptId !== commitReceipt?.id ||
              commitResult?.commandType !== "COMMIT_DECLARATIVE_PACKAGE" ||
              commitResult?.safeOutput?.packageHash !==
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
            let lifecycleCommandResult: AffiliateAgentCommandResult | null =
              null;
            if (lifecycleReceipt) {
              try {
                lifecycleCommandResult = replayCommand(
                  lifecycleReceipt.responseJson,
                );
              } catch {
                lifecycleCommandResult = null;
              }
            }
            const nextLifecycleGeneration =
              typeof lifecycleCommandResult?.safeOutput?.lifecycleGeneration ===
                "number" &&
              Number.isInteger(
                lifecycleCommandResult.safeOutput.lifecycleGeneration,
              )
                ? lifecycleCommandResult.safeOutput.lifecycleGeneration
                : null;
            if (
              parsedResult.data.payload.caseId !== subject.caseId ||
              parsedResult.data.payload.lifecycleCommandRef !==
                subject.lifecycleCommandRef ||
              lifecycleReceipt?.claimId !== authorized.claim.id ||
              lifecycleReceipt.status !== "SUCCEEDED" ||
              lifecycleReceipt.commandName !==
                "EXECUTE_RECORDED_LIFECYCLE_COMMAND" ||
              lifecycleCommandResult?.receiptId !== lifecycleReceipt.id ||
              lifecycleCommandResult.commandType !==
                "EXECUTE_RECORDED_LIFECYCLE_COMMAND" ||
              authorized.claim.lifecycleGeneration === null ||
              nextLifecycleGeneration !==
                authorized.claim.lifecycleGeneration + 1
            ) {
              throw gatewayError(
                "TERMINAL_DISPOSITION_NOT_PERMITTED",
                "The human-directed result does not match the recorded lifecycle command.",
              );
            }
          }

          await assertClaimEvidenceRefs(
            transaction,
            authorized.claim.id,
            parsedResult.data.evidenceRefs,
            "EVIDENCE_REFERENCE_NOT_PERMITTED",
            "The terminal result references evidence outside the claim manifest.",
          );

          await assertNoPendingClaimEffects(transaction, authorized.claim.id);
          const completionNow = dependencies.clock.now();
          const allowPostEffectCompletion =
            postEffectCompletionReceiptId !== undefined ||
            reviewerTerminalEffectReceiptId !== undefined;
          if (
            !allowPostEffectCompletion &&
            authorized.claim.hardDeadlineAt < completionNow
          ) {
            throw gatewayError(
              "HARD_DEADLINE_EXCEEDED",
              "The claim hard deadline passed before terminal completion.",
            );
          }
          if (
            !allowPostEffectCompletion &&
            authorized.claim.leaseExpiresAt <= completionNow
          ) {
            throw gatewayError(
              "LEASE_EXPIRED",
              "The claim lease expired before terminal completion.",
            );
          }
          const receiptId = dependencies.identifiers.create("receipt");
          const resultHash = hashAffiliateAgentValue(parsedResult.data);
          const terminalResult: AffiliateAgentTerminalAcceptedResult = {
            kind: "TERMINAL_ACCEPTED",
            receiptId,
            resultHash,
            disposition: parsedResult.data.disposition,
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
      if (
        error instanceof AffiliateAgentGatewayError &&
        error.code === "PARTIAL_COMMAND_UNRESOLVED" &&
        error.safeMessage === INVOCATION_FAILURE_PENDING_EFFECT_MESSAGE &&
        error.receiptId !== undefined
      ) {
        const pendingEffects = await reconcilePendingEffectsForClaim(
          dependencies,
          input.authorization.claimId,
        );
        if (pendingEffects.examined > 0 && pendingEffects.unresolved === 0)
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

const finalizeRecoveredExternalReceipt = async (
  dependencies: AffiliateAgentGatewayDependencies,
  receipt: AffiliateAgentGatewayOperationReceipts,
  recovered: Readonly<Record<string, unknown>>,
): Promise<"COMPLETED" | "IMPOSSIBLE" | "UNCHANGED"> => {
  if (
    receipt.commandName !== "CAPTURE_CLAIM_URL" &&
    receipt.commandName !== "RUN_DISCOVERY_QUERY"
  ) {
    return "IMPOSSIBLE";
  }
  const commandType = receipt.commandName;
  let capture: RecoveredExternalOutput;
  try {
    capture = parseRecoveredExternalOutput(recovered);
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
            currentReceipt.commandName !== commandType ||
            currentReceipt.requestHash !== receipt.requestHash ||
            currentReceipt.externalOperationKey !== receipt.externalOperationKey
          ) {
            return "IMPOSSIBLE";
          }
          const reservedEvent =
            await transaction.affiliateAgentGatewayEvents.findFirst({
              where: {
                receiptId: currentReceipt.id,
                eventType: "EXTERNAL_COMMAND_RESERVED",
              },
            });
          if (!reservedEvent || typeof reservedEvent.inputHash !== "string") {
            return "IMPOSSIBLE";
          }
          const [claim, job] = await Promise.all([
            transaction.affiliateAgentGatewayClaims.findUnique({
              where: { id: currentReceipt.claimId },
            }),
            transaction.affiliateAgentGatewayJobs.findUnique({
              where: { id: currentReceipt.jobId },
            }),
          ]);
          const finalizationNow = dependencies.clock.now();
          if (
            !claim ||
            !job ||
            claim.jobId !== currentReceipt.jobId ||
            claim.claimGeneration !== currentReceipt.claimGeneration ||
            claim.status !== "ACTIVE" ||
            (claim.leaseExpiresAt <= finalizationNow &&
              currentReceipt.startedAt >= claim.leaseExpiresAt) ||
            (claim.hardDeadlineAt < finalizationNow &&
              currentReceipt.startedAt >= claim.hardDeadlineAt) ||
            job.status !== "CLAIMED" ||
            job.activeClaimId !== currentReceipt.claimId ||
            job.claimGeneration !== currentReceipt.claimGeneration
          ) {
            return "IMPOSSIBLE";
          }
          await ensureExternalArtifact(transaction, {
            claimId: currentReceipt.claimId,
            claimGeneration: currentReceipt.claimGeneration,
            evidenceKind:
              commandType === "RUN_DISCOVERY_QUERY"
                ? "PROVIDER_RESULT"
                : "CAPTURED_PAGE",
            output: capture,
            rowId: artifactRowId,
            receiptId: currentReceipt.id,
          });
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
                  completedAt: completedAt,
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
              inputHash: reservedEvent.inputHash,
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
  recoveredSafeOutput: Readonly<Record<string, unknown>>,
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
  const safeOutput = parseBoundedSafeOutput(recoveredSafeOutput, receipt.id);
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
  if (safeOutput.lifecycleGeneration !== claim.lifecycleGeneration + 1) {
    throw gatewayError(
      "LIFECYCLE_TRANSITION_CONFLICT",
      "The recovered lifecycle command did not return the next lifecycle generation.",
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
      const [currentClaim, currentJob] = await Promise.all([
        transaction.affiliateAgentGatewayClaims.findUnique({
          where: { id: claim.id },
        }),
        transaction.affiliateAgentGatewayJobs.findUnique({
          where: { id: job.id },
        }),
      ]);
      const finalizationNow = dependencies.clock.now();
      if (
        !currentClaim ||
        currentClaim.status !== "ACTIVE" ||
        currentClaim.jobId !== job.id ||
        currentClaim.claimGeneration !== claim.claimGeneration ||
        currentClaim.lifecycleGeneration !== claim.lifecycleGeneration ||
        (currentClaim.leaseExpiresAt <= finalizationNow &&
          current.startedAt >= currentClaim.leaseExpiresAt) ||
        (currentClaim.hardDeadlineAt < finalizationNow &&
          current.startedAt >= currentClaim.hardDeadlineAt) ||
        !currentJob ||
        currentJob.status !== "CLAIMED" ||
        currentJob.activeClaimId !== currentClaim.id ||
        currentJob.claimGeneration !== currentClaim.claimGeneration
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
            completedAt: completedAt,
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
      const reservedEvent =
        await transaction.affiliateAgentGatewayEvents.findFirst({
          where: {
            receiptId: receipt.id,
            eventType: "LIFECYCLE_COMMAND_RESERVED",
          },
        });
      const reservedPayload = reservedEvent?.payload;
      const lifecycleCommandRef =
        reservedPayload !== null &&
        typeof reservedPayload === "object" &&
        !Array.isArray(reservedPayload) &&
        typeof reservedPayload.lifecycleCommandRef === "string"
          ? reservedPayload.lifecycleCommandRef
          : null;
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
            ...(lifecycleCommandRef === null ? {} : { lifecycleCommandRef }),
          }),
          retentionClass: "INDEFINITE",
        },
      });
      return "COMPLETED" as const;
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
    admissionHalted: boolean;
  }>
> => {
  const reviewerTerminalEffectReceiptIds =
    await findActiveReviewerTerminalEffectReceiptIds(
      dependencies.prisma,
      limit,
      claimId,
    );
  const receipts =
    await dependencies.prisma.affiliateAgentGatewayOperationReceipts.findMany({
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
  let unresolved = 0;
  let admissionHalted = false;
  let recoveredCount = 0;
  let completed = 0;
  for (const receipt of receipts) {
    const reconciliationNow = dependencies.clock.now();
    if (receipt.operationKind === "READ_ARTIFACT") {
      if (
        !includeNotDue &&
        receipt.reconcileAfter !== null &&
        receipt.reconcileAfter > reconciliationNow
      ) {
        unresolved += 1;
        continue;
      }
      await failStaleArtifactReceipt(
        dependencies,
        receipt.id,
        dependencies.clock.now(),
      );
      continue;
    }
    let recovered: Readonly<Record<string, unknown>> | null = null;
    let reviewerTerminalEffectResult: AffiliateAgentReviewerTerminalResult | null =
      null;
    let reviewerTerminalEffectReservation: ReviewerTerminalEffectReservation | null =
      null;
    let impossible = false;
    if (
      receipt.commandName === "CAPTURE_CLAIM_URL" ||
      receipt.commandName === "RUN_DISCOVERY_QUERY"
    ) {
      const adapter =
        receipt.commandName === "RUN_DISCOVERY_QUERY"
          ? dependencies.commands.external.RUN_DISCOVERY_QUERY
          : dependencies.commands.external.CAPTURE_CLAIM_URL;
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
    } else if (
      receipt.commandName === AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND
    ) {
      const adapter = dependencies.terminalEffects;
      const [claim, job] = await Promise.all([
        dependencies.prisma.affiliateAgentGatewayClaims.findUnique({
          where: { id: receipt.claimId },
        }),
        dependencies.prisma.affiliateAgentGatewayJobs.findUnique({
          where: { id: receipt.jobId },
        }),
      ]);
      const envelope = claim
        ? affiliateAgentClaimEnvelopeSchema.safeParse(claim.claimEnvelopeJson)
        : null;
      let effectState: ReviewerTerminalEffectReceiptState | null = null;
      if (claim && envelope?.success) {
        try {
          effectState = parseReviewerTerminalEffectState(
            receipt.responseJson,
            receipt.id,
          );
        } catch {
          effectState = null;
        }
      }
      const pendingEffectState =
        effectState?.kind === "PENDING" ? effectState : null;
      const completedEffectState =
        effectState?.kind === "SUCCEEDED" ? effectState : null;
      const reviewerResult =
        pendingEffectState?.result ?? completedEffectState?.result ?? null;
      const terminalIdentity = completedEffectState ?? pendingEffectState;
      const exactIdentity =
        claim !== null &&
        job !== null &&
        envelope?.success === true &&
        claim.status === "ACTIVE" &&
        job.status === "CLAIMED" &&
        job.activeClaimId === claim.id &&
        job.claimGeneration === claim.claimGeneration &&
        claim.jobId === job.id &&
        receipt.jobId === job.id &&
        receipt.claimId === claim.id &&
        receipt.claimGeneration === claim.claimGeneration &&
        claim.claimEnvelopeHash === hashAffiliateAgentValue(envelope.data) &&
        envelope.data.jobId === job.id &&
        envelope.data.claimId === claim.id &&
        envelope.data.claimGeneration === claim.claimGeneration &&
        envelope.data.role === claim.role &&
        envelope.data.workerId === claim.workerId &&
        envelope.data.invocationId === claim.invocationId &&
        envelope.data.workspaceId === claim.workspaceId &&
        reviewerResult !== null &&
        reviewerResult.role === "SUPPLY_REVIEWER" &&
        ((receipt.status === "PENDING" && pendingEffectState !== null) ||
          (receipt.status === "SUCCEEDED" && completedEffectState !== null)) &&
        receipt.idempotencyKey === reviewerTerminalEffectIdempotencyKey() &&
        receipt.requestHash ===
          reviewerTerminalEffectRequestHash(claim, reviewerResult);
      const resultTargetsEnvelope =
        exactIdentity &&
        envelope?.success === true &&
        reviewerResult !== null &&
        reviewerResult.evidenceRefs.every((evidenceRef) =>
          envelope.data.evidenceManifest.entries.some(
            (entry) => entry.evidenceRef === evidenceRef,
          ),
        ) &&
        (reviewerResult.disposition === "APPROVED" ||
        reviewerResult.disposition === "ACTIVATED" ||
        reviewerResult.disposition === "PRODUCER_REPAIR_REQUIRED"
          ? "committedPackageHash" in envelope.data.subject &&
            reviewerResult.payload.committedPackageHash ===
              envelope.data.subject.committedPackageHash
          : reviewerResult.disposition === "REGRESSION_ASSESSED" ||
              reviewerResult.disposition === "SOURCE_EXCLUSION_ASSESSED"
            ? "supplySourceId" in envelope.data.subject &&
              reviewerResult.payload.supplySourceId ===
                envelope.data.subject.supplySourceId
            : reviewerResult.disposition === "EXACT_TARGET_REJECTED"
              ? "targetId" in envelope.data.subject &&
                "targetType" in envelope.data.subject &&
                reviewerResult.payload.targetId ===
                  envelope.data.subject.targetId &&
                reviewerResult.payload.targetType ===
                  envelope.data.subject.targetType
              : true);
      if (
        !resultTargetsEnvelope ||
        reviewerResult === null ||
        (pendingEffectState !== null && !adapter) ||
        (pendingEffectState === null && completedEffectState === null)
      ) {
        impossible = true;
      } else {
        reviewerTerminalEffectResult = reviewerResult;
        reviewerTerminalEffectReservation = {
          receipt,
          replayed: true,
          terminalIdempotencyKey: terminalIdentity!.terminalIdempotencyKey,
          terminalRequestHash: terminalIdentity!.terminalRequestHash,
        };
        if (completedEffectState !== null) {
          recovered = completedEffectState.safeOutput;
        } else if (pendingEffectState !== null && adapter) {
          try {
            recovered = await runReviewerTerminalEffect(
              adapter,
              {
                receiptId: receipt.id,
                claim: envelope.data,
                result: reviewerResult,
              },
              "RECOVER",
            );
          } catch {
            recovered = null;
          }
        } else {
          impossible = true;
        }
      }
    } else {
      impossible = true;
    }
    if (impossible) {
      const marked = await markReceiptReconciliationRequired(
        dependencies,
        receipt,
        dependencies.clock.now(),
        true,
      );
      if (marked !== "UNCHANGED") unresolved += 1;
      admissionHalted ||= marked !== "UNCHANGED";
      continue;
    }
    if (recovered === null) {
      if (
        includeNotDue &&
        receipt.reconcileAfter !== null &&
        receipt.reconcileAfter > reconciliationNow
      ) {
        unresolved += 1;
        continue;
      }
      const marked = await markReceiptReconciliationRequired(
        dependencies,
        receipt,
        dependencies.clock.now(),
        false,
      );
      if (marked !== "UNCHANGED") unresolved += 1;
      admissionHalted ||= marked !== "UNCHANGED";
      continue;
    }
    recoveredCount += 1;
    try {
      const finalized =
        receipt.commandName === "CAPTURE_CLAIM_URL" ||
        receipt.commandName === "RUN_DISCOVERY_QUERY"
          ? await finalizeRecoveredExternalReceipt(
              dependencies,
              receipt,
              recovered,
            )
          : receipt.commandName === AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND &&
              reviewerTerminalEffectResult !== null &&
              reviewerTerminalEffectReservation !== null
            ? (await finalizeReviewerTerminalEffect(
                dependencies,
                reviewerTerminalEffectReservation,
                reviewerTerminalEffectResult,
                receipt.requestHash,
                parseBoundedSafeOutput(recovered, receipt.id),
              ),
              await completeRecoveredReviewerTerminalResult(
                dependencies,
                receipt,
                reviewerTerminalEffectResult,
              ),
              "COMPLETED" as const)
            : await finalizeRecoveredLifecycleReceipt(
                dependencies,
                receipt,
                recovered,
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
      dependencies.clock.now(),
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
          const pendingEffect =
            await transaction.affiliateAgentGatewayOperationReceipts.findFirst({
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
                        commandName: AFFILIATE_AGENT_TERMINAL_EFFECT_COMMAND,
                      },
                    ],
                  },
                ],
              },
            });
          if (pendingEffect) return "UNCHANGED" as const;
          const succeededLifecycleEffect =
            await transaction.affiliateAgentGatewayOperationReceipts.findFirst({
              where: {
                claimId: claim.id,
                jobId: claim.jobId,
                claimGeneration: claim.claimGeneration,
                status: "SUCCEEDED",
                operationKind: "EXECUTE_COMMAND",
                commandName: "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
              },
              select: { id: true },
            });
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
          const invocationFailureCount = job.invocationFailureCount + 1;
          const delay = affiliateAgentRetryDelaySeconds(
            invocationFailureCount as 1 | 2 | 3,
          );
          const pipelineBlocked = delay === null;
          const nextAttemptAt = pipelineBlocked
            ? null
            : addSeconds(failureRecordedAt, delay!);
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
                lastInvocationFailedAt: failureRecordedAt,
                pipelineBlockedAt: pipelineBlocked ? failureRecordedAt : null,
                nextAttemptAt,
                finishedAt: pipelineBlocked ? failureRecordedAt : null,
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
                endedAt: failureRecordedAt,
                tokenInvalidatedAt: failureRecordedAt,
                safeFailureCode: "TIMEOUT",
                safeFailureSummary:
                  "The invocation lease or hard deadline expired.",
                diagnosticRetainUntil: addSeconds(
                  failureRecordedAt,
                  14 * 24 * 60 * 60,
                ),
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
        dependencies.clock.now(),
      );
    }
  }
  return { examined: claims.length, expired, admissionHalted };
};

const trustedFailureSummary = (
  code: AffiliateAgentInvocationReconciliationRequest["failureCode"],
): string => {
  switch (code) {
    case "MALFORMED_OUTPUT":
      return "The invocation output was malformed.";
    case "STALE_GENERATION":
      return "The invocation claim generation became stale.";
    case "PROCESS_CRASH":
      return "The invocation process ended before completion.";
    case "TIMEOUT":
      return "The invocation exceeded its hard deadline.";
    case "TERMINAL_SUBMISSION_FAILURE":
      return "The terminal result could not be confirmed.";
  }
};

const authoritativeInvocationState = (
  claim: AffiliateAgentGatewayClaims,
  job: AffiliateAgentGatewayJobs,
): AffiliateAgentInvocationReconciliationResult | null => {
  const exactTerminalState =
    job.activeClaimId === null &&
    job.claimGeneration === claim.claimGeneration &&
    job.id === claim.jobId;
  if (
    exactTerminalState &&
    claim.status === "COMPLETED" &&
    job.status === "COMPLETED"
  ) {
    return { kind: "TERMINAL_ACCEPTED" };
  }
  if (
    !exactTerminalState ||
    (claim.status !== "FAILED" && claim.status !== "EXPIRED") ||
    (job.status !== "RETRY_WAIT" && job.status !== "PIPELINE_BLOCKED") ||
    job.invocationFailureCount < 1 ||
    job.invocationFailureCount > 3 ||
    ![
      "MALFORMED_OUTPUT",
      "STALE_GENERATION",
      "PROCESS_CRASH",
      "TIMEOUT",
      "TERMINAL_SUBMISSION_FAILURE",
      "SCHEMA_CORRECTIONS_EXHAUSTED",
    ].includes(claim.safeFailureCode ?? "")
  ) {
    return null;
  }
  return {
    kind: "INVOCATION_FAILED",
    failureCode: claim.safeFailureCode as AffiliateAgentInvocationFailureCode,
    invocationFailureCount: job.invocationFailureCount as 1 | 2 | 3,
    nextAttemptAt: job.nextAttemptAt?.toISOString() ?? null,
    pipelineBlocked: job.status === "PIPELINE_BLOCKED",
  };
};

const reconcileExactInvocation = async (
  dependencies: AffiliateAgentGatewayDependencies,
  input: AffiliateAgentInvocationReconciliationRequest,
): Promise<AffiliateAgentInvocationReconciliationResult> => {
  const requestedClaim =
    await dependencies.prisma.affiliateAgentGatewayClaims.findUnique({
      where: { id: input.claim.claimId },
    });
  if (
    !requestedClaim ||
    requestedClaim.jobId !== input.claim.jobId ||
    requestedClaim.claimGeneration !== input.claim.claimGeneration ||
    requestedClaim.claimEnvelopeHash !== input.claim.claimEnvelopeHash
  ) {
    throw gatewayError(
      "CLAIM_NOT_FOUND",
      "The exact invocation claim does not match.",
    );
  }
  const requestHash = hashAffiliateAgentValue(input);
  const idempotencyKey = `supervisor-reconcile:${input.claim.claimId}`;
  const pendingEffects = await reconcilePendingExternalReceipts(
    dependencies,
    dependencies.clock.now(),
    undefined,
    input.claim.claimId,
    true,
  );
  if (pendingEffects.unresolved > 0) {
    throw gatewayError(
      "PARTIAL_COMMAND_UNRESOLVED",
      "The invocation has an unresolved external effect.",
    );
  }

  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await dependencies.prisma.$transaction(
        async (transaction) => {
          const claim =
            await transaction.affiliateAgentGatewayClaims.findUnique({
              where: { id: input.claim.claimId },
            });
          if (
            !claim ||
            claim.jobId !== input.claim.jobId ||
            claim.claimGeneration !== input.claim.claimGeneration ||
            claim.claimEnvelopeHash !== input.claim.claimEnvelopeHash
          ) {
            throw gatewayError(
              "CLAIM_NOT_FOUND",
              "The exact invocation claim does not match.",
            );
          }
          const job = await transaction.affiliateAgentGatewayJobs.findUnique({
            where: { id: input.claim.jobId },
          });
          if (!job) {
            throw gatewayError(
              "CLAIM_NOT_FOUND",
              "The exact invocation job does not exist.",
            );
          }
          const authoritative = authoritativeInvocationState(claim, job);
          if (authoritative !== null) return authoritative;
          if (
            claim.status !== "ACTIVE" ||
            claim.tokenInvalidatedAt !== null ||
            job.status !== "CLAIMED" ||
            job.activeClaimId !== claim.id ||
            job.claimGeneration !== claim.claimGeneration
          ) {
            throw gatewayError(
              "CLAIM_NOT_ACTIVE",
              "The exact invocation claim is not reconcilable.",
            );
          }
          const recorded = await recordInvocationFailure({
            dependencies,
            transaction,
            authorized: { claim, job },
            idempotencyKey,
            operationKind: "RECORD_FAILURE",
            requestHash,
            failureCode: input.failureCode,
            failedAt: dependencies.clock.now(),
            safeSummary: trustedFailureSummary(input.failureCode),
            evidenceRefs: [],
          });
          return {
            kind: recorded.kind,
            failureCode: recorded.failureCode,
            invocationFailureCount: recorded.invocationFailureCount,
            nextAttemptAt: recorded.nextAttemptAt,
            pipelineBlocked: recorded.pipelineBlocked,
          };
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
      if (
        error instanceof AffiliateAgentGatewayError &&
        error.code === "PARTIAL_COMMAND_UNRESOLVED" &&
        error.safeMessage === INVOCATION_FAILURE_PENDING_EFFECT_MESSAGE &&
        error.receiptId !== undefined
      ) {
        const pendingEffects = await reconcilePendingEffectsForClaim(
          dependencies,
          input.claim.claimId,
          true,
        );
        if (pendingEffects.examined > 0 && pendingEffects.unresolved === 0)
          continue;
      }
      if (error instanceof AffiliateAgentGatewayError) throw error;
      throw gatewayError(
        "INTERNAL_ERROR",
        "The exact invocation could not be reconciled.",
        retryableConflict,
      );
    }
  }
  throw gatewayError(
    "INTERNAL_ERROR",
    "The exact invocation could not be reconciled.",
    true,
  );
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
): AffiliateAgentGateway & AffiliateAgentInvocationReconciler {
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
        return await claimAffiliateAgentJob(
          dependencies,
          input,
          bundle,
          roleContract,
          requestHash,
        );
      } catch (error) {
        if (error instanceof AffiliateAgentGatewayError) throw error;
        throw gatewayError(
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
        return (await performTerminalResult(
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
    async reconcileInvocation(
      input: AffiliateAgentInvocationReconciliationRequest,
    ): Promise<AffiliateAgentInvocationReconciliationResult> {
      return reconcileExactInvocation(dependencies, input);
    },
  };
}
