import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AffiliateAgentDeclarativePackageCommitOutput,
  AffiliateAgentDeclarativePackageValidationOutput,
  AffiliateAgentClaimEnvelope,
  AffiliateAgentCommand,
  AffiliateAgentEvidenceManifest,
  AffiliateAgentExecutionClass,
  AffiliateAgentLegacySportRepairContext,
  AffiliateAgentProducerClaimEnvelopeForHistoricalRead,
  AffiliateAgentRole,
  AffiliateAgentSchemaIssue,
  AffiliateAgentSportEvidence,
  AffiliateAgentTerminalResultEnvelope,
} from "./agentGatewayContracts";
import {
  parseAffiliateAgentProducerClaimEnvelopeForHistoricalRead,
  affiliateAgentDeclarativePackageSchema,
  affiliateAgentEvidenceManifestSchema,
  affiliateAgentSportEvidenceSchema,
  canonicalizeAffiliateAgentValue,
  hashAffiliateAgentValue,
  parseAffiliateAgentCaptureMetadata,
  type AffiliateAgentCaptureMetadata,
  type AffiliateAgentCaptureRecordSummary,
  type AffiliateAgentCaptureScreenshotEvidence,
  type AffiliateAgentCaptureSetSummary,
  type AffiliateAgentCaptureTextSummary,
} from "./agentGatewayContracts";
import {
  affiliateSupplyContractManifestSchema,
  type AffiliateSupplyLifecycleCommand,
} from "./affiliateSupplyLifecycle";
import {
  affiliateSupplyDatabase,
  createAffiliateSupplyLifecycleAuthority,
  executeAffiliateSupplyLifecycleCommand,
  recordAffiliateAgentWorkerHeartbeat,
} from './affiliateSupplyPersistence';
import type {
  AffiliateSupplyDatabase,
  ExecuteAffiliateSupplyLifecycleCommandInput,
} from "./affiliateSupplyPersistence";
import {
  emitAffiliateOperationalAlert,
  type AffiliateOperationalAlertWriter,
} from "./affiliateOperationalAlerts";
import { buildAffiliateAutomationBaseline } from './automationBaseline';
import {
  createAffiliateSourceCaptureClient,
  createAffiliateSourceSearchClient,
} from "./affiliateProviderFactory";
import { extractAffiliateCandidatesFromPage } from "./mappingExtractor";
import { analyzeAffiliateDescriptionQuality } from "./descriptionQuality";
import {
  affiliateScrapeMappingSchema,
  type AffiliateCandidateInput,
  type AffiliateListingKind,
  type AffiliateScrapeMapping,
  type ScrapedPage,
} from "./types";
import { isAffiliateSportBlacklisted } from "./affiliateSportMapping";
import { loadAffiliateSportsCatalogSnapshot } from "./affiliateSportsCatalog";
import {
  AffiliateSportVerificationError,
  sortUniqueAffiliateSportNames,
  verifyAffiliateSportCompletion,
  type AffiliateSportCitation,
  type AffiliateSportCompletionStoredArtifact,
  type AffiliateSportCompletionVerificationInput,
  type VerifiedAffiliateSportCompletion,
} from "./affiliateSportDetermination";
import { assertSafePublicUrl, type PublicUrlResolver } from "./sourceIntakeUrlSafety";
import {
  affiliateSourceCaptureDeadlineAt,
  affiliateSourceCaptureTimeoutMs,
  withAffiliateSourceCaptureDeadline,
  type AffiliateSourceCaptureClient,
  type AffiliateSourceCaptureProfile,
  type AffiliateSourcePageCapture,
  type AffiliateSourceSearchClient,
  type AffiliateSourceSearchOptions,
} from "./affiliateProviderContracts";
import type { StorageGetResult, StorageProvider } from '@/lib/storageProvider';
import { AffiliateAgentGatewayError } from "./agentGateway";
import type {
  AffiliateAgentClaimOperation,
  AffiliateAgentGateway,
  AffiliateAgentInvocationFailureCode,
  AffiliateAgentWorkspaceAttestation,
} from "./agentGateway";

type AffiliateAgentNonTerminalCommand = Exclude<
  AffiliateAgentCommand,
  Readonly<{ type: "SUBMIT_TERMINAL_RESULT" }>
>;

export interface AffiliateAgentGatewayClock {
  now(): Date;
}

export type AffiliateAgentGatewayIdentifierKind =
  | "artifact"
  | "claim"
  | "event"
  | "external-operation"
  | "receipt";

export interface AffiliateAgentGatewayIdentifiers {
  create(kind: AffiliateAgentGatewayIdentifierKind): string;
}

export interface AffiliateAgentRoleCredentialVerifier {
  verify(
    input: Readonly<{
      roleCredential: string;
      role: AffiliateAgentRole;
      executionClass: AffiliateAgentExecutionClass;
      workerId: string;
      invocationId: string;
    }>,
  ): Promise<boolean>;
}

export interface AffiliateAgentWorkspaceAttestationVerifier {
  verify(attestation: AffiliateAgentWorkspaceAttestation): Promise<boolean>;
}

export type AffiliateAgentClaimTokenScope = Readonly<{
  claimId: string;
  jobId: string;
  claimGeneration: number;
  lifecycleGeneration: number | null;
  role: AffiliateAgentRole;
  workerId: string;
  invocationId: string;
  tokenExpiresAt: string;
  evidenceManifestHash: string;
  permittedCommandHash: string;
  supplyContractHash: string;
}>;

export interface AffiliateAgentClaimTokenCodec {
  readonly keyVersion: string;
  createNonce(): string;
  hashFor(scope: AffiliateAgentClaimTokenScope, nonce: string): string;
  issue(scope: AffiliateAgentClaimTokenScope, nonce: string): string;
  matches(token: string, expectedHash: string): boolean;
}

export interface AffiliateAgentActiveContractRegistry {
  loadActiveBundle(): Promise<unknown>;
}

export type AffiliateAgentArtifactRead = Readonly<{
  bytes: Uint8Array;
  mimeType: string;
  byteSize: number;
  sourceUrl: string | null;
  finalUrl: string | null;
  runId?: string | null;
  intakeId?: string | null;
}>;

export interface AffiliateAgentArtifactStore {
  readImmutable(
    input: Readonly<{
      fileId: string;
      maximumBytes: number;
    }>,
  ): Promise<AffiliateAgentArtifactRead>;
}

export type AffiliateAgentTransactionalCommandInput<
  TCommand extends
    AffiliateAgentNonTerminalCommand = AffiliateAgentNonTerminalCommand,
> = Readonly<{
  transaction: Prisma.TransactionClient;
  claim: AffiliateAgentClaimEnvelope;
  command: TCommand;
  receiptId: string;
}>;

export type AffiliateAgentTransactionalCommandOutput<
  TCommand extends
    AffiliateAgentNonTerminalCommand = AffiliateAgentNonTerminalCommand,
> = TCommand extends {
  type: "VALIDATE_DECLARATIVE_PACKAGE";
}
  ? AffiliateAgentDeclarativePackageValidationOutput
  : TCommand extends { type: "COMMIT_DECLARATIVE_PACKAGE" }
    ? AffiliateAgentDeclarativePackageCommitOutput
    : Readonly<Record<string, unknown>> | null;

export interface AffiliateAgentTransactionalCommandAdapter<
  TCommand extends
    AffiliateAgentNonTerminalCommand = AffiliateAgentNonTerminalCommand,
> {
  execute(
    input: AffiliateAgentTransactionalCommandInput<TCommand>,
  ): Promise<AffiliateAgentTransactionalCommandOutput<TCommand>>;
}

export interface AffiliateAgentExternalCommandAdapter<
  TCommand extends
    AffiliateAgentNonTerminalCommand = AffiliateAgentNonTerminalCommand,
> {
  start(
    externalOperationKey: string,
    input: Readonly<{
      claim: AffiliateAgentClaimEnvelope;
      command: TCommand;
    }>,
  ): Promise<Readonly<Record<string, unknown>>>;
  recover(
    externalOperationKey: string,
  ): Promise<Readonly<Record<string, unknown>> | null>;
}

export type AffiliateAgentCommandAdapters = Readonly<{
  transactional: Readonly<{
    VALIDATE_DECLARATIVE_PACKAGE?: AffiliateAgentTransactionalCommandAdapter<
      Extract<AffiliateAgentCommand, { type: "VALIDATE_DECLARATIVE_PACKAGE" }>
    >;
    COMMIT_DECLARATIVE_PACKAGE?: AffiliateAgentTransactionalCommandAdapter<
      Extract<AffiliateAgentCommand, { type: "COMMIT_DECLARATIVE_PACKAGE" }>
    >;
  }>;
  external: Readonly<{
    RUN_DISCOVERY_QUERY?: AffiliateAgentExternalCommandAdapter<
      Extract<AffiliateAgentCommand, { type: "RUN_DISCOVERY_QUERY" }>
    >;
    CAPTURE_CLAIM_URL?: AffiliateAgentExternalCommandAdapter<
      Extract<AffiliateAgentCommand, { type: "CAPTURE_CLAIM_URL" }>
    >;
  }>;
}>;

export type AffiliateAgentReviewerTerminalResult = Extract<
  AffiliateAgentTerminalResultEnvelope,
  Readonly<{ role: "SUPPLY_REVIEWER" }>
>;

export type AffiliateAgentReviewerTerminalDisposition =
  AffiliateAgentReviewerTerminalResult["disposition"];

export type AffiliateAgentReviewerTerminalResultFor<
  D extends AffiliateAgentReviewerTerminalDisposition,
> = Extract<AffiliateAgentReviewerTerminalResult, Readonly<{ disposition: D }>>;

export type AffiliateAgentTerminalEffectAdapterInput<
  D extends
    AffiliateAgentReviewerTerminalDisposition = AffiliateAgentReviewerTerminalDisposition,
> = Readonly<{
  receiptId: string;
  claim: AffiliateAgentClaimEnvelope;
  result: AffiliateAgentReviewerTerminalResultFor<D>;
}>;

export type AffiliateAgentTerminalEffectHandler<
  D extends AffiliateAgentReviewerTerminalDisposition,
> = Readonly<{
  execute(
    input: AffiliateAgentTerminalEffectAdapterInput<D>,
  ): Promise<Readonly<Record<string, unknown>>>;
  recover(
    input: AffiliateAgentTerminalEffectAdapterInput<D>,
  ): Promise<Readonly<Record<string, unknown>> | null>;
}>;

export type AffiliateAgentTerminalEffectAdapter = Readonly<{
  [D in AffiliateAgentReviewerTerminalDisposition]: AffiliateAgentTerminalEffectHandler<D>;
}>;

export type AffiliateAgentLifecycleCommandIdentity = Readonly<{
  caseId: string;
  decisionHash: string;
  recordedHumanActorId: string;
  commandRef: string;
}>;

export type AffiliateAgentLifecycleAuthority =
  | Readonly<{ kind: "UNAVAILABLE" }>
  | Readonly<{
      kind: "AVAILABLE";
      currentGeneration(supplySourceId: string): Promise<number>;
      resolveRecordedCommand(
        identity: AffiliateAgentLifecycleCommandIdentity,
      ): Promise<AffiliateAgentLifecycleCommandIdentity | null>;
      execute(
        input: Readonly<{
          receiptId: string;
          expectedGeneration: number;
          inputHash: string;
          identity: AffiliateAgentLifecycleCommandIdentity;
          invocationId: string;
          supplyContractVersion?: number;
          supplyContractHash?: string;
        }>,
      ): Promise<Readonly<Record<string, unknown>>>;
      recover(
        receiptId: string,
      ): Promise<Readonly<Record<string, unknown>> | null>;
    }>;
export type AffiliateAgentInvocationReconciliationRequest = Extract<
  AffiliateAgentClaimOperation,
  { kind: "RECORD_FAILURE" }
>;

export type AffiliateAgentInvocationReconciliationResult =
  | Readonly<{ kind: "TERMINAL_ACCEPTED" }>
  | Readonly<{
      kind: "INVOCATION_FAILED";
      failureCode: AffiliateAgentInvocationFailureCode;
      invocationFailureCount: 1 | 2 | 3;
      nextAttemptAt: string | null;
      isPipelineBlocked: boolean;
    }>;

export interface AffiliateAgentInvocationReconciler {
  reconcileInvocation(
    input: AffiliateAgentInvocationReconciliationRequest,
  ): Promise<AffiliateAgentInvocationReconciliationResult>;
}

export type AffiliateAgentProcessEvent =
  | Readonly<{
      kind: "TERMINAL_SUBMISSION";
      idempotencyKey: string;
      result: unknown;
    }>
  | Readonly<{ kind: "EXIT"; exitCode: number; reason?: "TIMEOUT" }>;
export type AffiliateAgentProcessInput = Readonly<{
  kind: "SCHEMA_CORRECTION";
  correctionPrompt: string;
}>;


export interface AffiliateAgentProcessSession {
  readonly started: Promise<void>;
  nextEvent(): Promise<AffiliateAgentProcessEvent>;
  send(input: AffiliateAgentProcessInput): Promise<void>;
  terminate(): Promise<void>;
  forceTerminate(): Promise<void>;
  disconnect(): void;
}

export type AffiliateAgentProcessLaunchInput = Readonly<{
  command: readonly ["affiliate-omp-agent"];
  prompt: string;
  environment: Readonly<Record<string, string>>;
  workspacePath: string;
  workerId: string;
  invocationId: string;
  workspaceId: string;
  workspaceMode: "READ_ONLY" | "READ_WRITE";
}>;

export class AffiliateAgentProcessCapacityError extends Error {
  readonly code = "CAPACITY" as const;

  constructor() {
    super("The affiliate agent runner is busy.");
    this.name = "AffiliateAgentProcessCapacityError";
  }
}

export interface AffiliateAgentProcessReservation {
  readonly reservationId: string;
  launch(input: AffiliateAgentProcessLaunchInput): AffiliateAgentProcessSession;
  release(): Promise<void>;
  disconnect?(): void;
}

export interface AffiliateAgentProcessLauncher {
  reserve(
    input: Readonly<{
      workerId: string;
      invocationId: string;
    }>,
  ): Promise<AffiliateAgentProcessReservation>;
}

export interface AffiliateAgentWorkspaceManager {
  recoverStale(reservation: AffiliateAgentProcessReservation): Promise<void>;
  create(
    input: Readonly<{
      workerId: string;
      invocationId: string;
      mode: "READ_ONLY" | "READ_WRITE";
    }>,
  ): Promise<
    Readonly<{
      path: string;
      ompConfigRoot?: string;
      attestation: AffiliateAgentWorkspaceAttestation;
    }>
  >;
  destroy(path: string): Promise<void>;
}

export type AffiliateAgentGatewayDependencies = Readonly<{
  prisma: PrismaClient;
  clock: AffiliateAgentGatewayClock;
  identifiers: AffiliateAgentGatewayIdentifiers;
  credentials: AffiliateAgentRoleCredentialVerifier;
  workspaces: AffiliateAgentWorkspaceAttestationVerifier;
  tokens: AffiliateAgentClaimTokenCodec;
  contracts: AffiliateAgentActiveContractRegistry;
  artifacts: AffiliateAgentArtifactStore;
  commands: AffiliateAgentCommandAdapters;
  terminalEffects?: AffiliateAgentTerminalEffectAdapter;
  lifecycle: AffiliateAgentLifecycleAuthority;
  workerHealth?: AffiliateAgentWorkerHealthWriter;
  claimAdmission?: AffiliateAgentClaimAdmission;
  operationalAlert?: AffiliateOperationalAlertWriter;
}>;

export interface AffiliateAgentWorkerHealthWriter {
  heartbeat(input: Readonly<{
    workerId: string;
    role: AffiliateAgentRole;
    now: Date;
    leaseExpiresAt?: Date;
    database?: AffiliateSupplyDatabase;
  }>): Promise<void>;
}
export type AffiliateAgentClaimAdmissionContext = Readonly<{
  role: AffiliateAgentRole;
  workerId: string;
  jobId?: string;
}>;

export type AffiliateAgentBoundedAdmissionRole =
  | "COVERAGE_PLANNER"
  | "MAPPING_PRODUCER"
  | "SUPPLY_REVIEWER"
  | "HUMAN_DIRECTED_EXECUTOR";
export type AffiliateAgentBoundedAdmissionLeaseRequest = Readonly<{
  role: AffiliateAgentBoundedAdmissionRole;
  workerId: string;
  leaseSeconds: number;
  roleCredential?: string;
  jobId?: string;
}>;

export type AffiliateAgentBoundedAdmissionLease = Readonly<{
  role: AffiliateAgentBoundedAdmissionRole;
  workerId: string;
  expiresAt: string;
  remainingClaims: number;
  jobId?: string;
}>;


export interface AffiliateAgentClaimAdmission {
  isOpen(): boolean;
  isOpenFor?(context: AffiliateAgentClaimAdmissionContext): boolean;
  openBoundedLease?(
    request: AffiliateAgentBoundedAdmissionLeaseRequest,
  ): Promise<AffiliateAgentBoundedAdmissionLease>;
  withClaim<T>(
    operation: (jobId?: string) => Promise<T>,
    context?: AffiliateAgentClaimAdmissionContext,
  ): Promise<T>;
}

export const createAffiliateAgentWorkerHealthWriter = (
  input: Readonly<{ db?: AffiliateSupplyDatabase }> = {},
): AffiliateAgentWorkerHealthWriter => {
  const database = input.db ?? affiliateSupplyDatabase();
  return {
    async heartbeat({ workerId, role, now, leaseExpiresAt, database: transactionDatabase }) {
      await recordAffiliateAgentWorkerHeartbeat(
        { workerId, role, now, leaseExpiresAt },
        transactionDatabase ?? database,
      );
    },
  };
};

export type AffiliateAgentSupervisorDependencies = Readonly<{
  gateway: AffiliateAgentGateway;
  invocationReconciler: AffiliateAgentInvocationReconciler;
  clock: AffiliateAgentGatewayClock;
  identifiers: AffiliateAgentGatewayIdentifiers;
  processLauncher: AffiliateAgentProcessLauncher;
  workspaces: AffiliateAgentWorkspaceManager;
  workerHealth?: AffiliateAgentWorkerHealthWriter;
}>;

const createClaimTokenCodec = (
  input: Readonly<{
    signingKey: Uint8Array;
    keyVersion: string;
  }>,
): AffiliateAgentClaimTokenCodec => {
  if (input.signingKey.byteLength < 32) {
    throw new Error("Affiliate Agent Gateway token signing key is too short.");
  }
  const signingKey = Buffer.from(input.signingKey);
  const keyVersion = input.keyVersion.trim();
  if (!keyVersion) {
    throw new Error("Affiliate Agent Gateway token key version is required.");
  }

  const capabilityFor = (
    scope: AffiliateAgentClaimTokenScope,
    nonce: string,
  ): string =>
    createHmac("sha256", signingKey)
      .update(
        canonicalizeAffiliateAgentValue({
          ...scope,
          nonce,
        }),
      )
      .digest("base64url");

  const issue = (scope: AffiliateAgentClaimTokenScope, nonce: string): string =>
    [
      "agw1",
      Buffer.from(scope.claimId, "utf8").toString("base64url"),
      capabilityFor(scope, nonce),
    ].join(".");

  return {
    keyVersion,
    createNonce: () => randomBytes(32).toString("base64url"),
    hashFor: (scope, nonce) =>
      createHash("sha256").update(issue(scope, nonce)).digest("hex"),
    issue,
    matches: (token, expectedHash) => {
      const actual = Buffer.from(
        createHash("sha256").update(token).digest("hex"),
        "hex",
      );
      const expected = Buffer.from(expectedHash, "hex");
      return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
      );
    },
  };
};
type ProductionActivationTargetWriter = NonNullable<
  ExecuteAffiliateSupplyLifecycleCommandInput["activationTargetWriter"]
>;
type ProductionActivationTargetWriterFactory = (input: Readonly<{
  claim: AffiliateAgentClaimEnvelope;
  result: AffiliateAgentReviewerTerminalResult;
}>) => ProductionActivationTargetWriter;

type ProductionAdapterInput = Readonly<{
  prisma: PrismaClient;
  artifacts: AffiliateAgentArtifactStore;
  storage: StorageProvider;
  searchClient?: AffiliateSourceSearchClient;
  captureClient?: AffiliateSourceCaptureClient;
  identifiers?: AffiliateAgentGatewayIdentifiers;
  clock?: AffiliateAgentGatewayClock;
  publicUrlResolver?: PublicUrlResolver;
  activationTargetWriter?: ProductionActivationTargetWriterFactory;
}>;
type ProducerClaimEnvelopeForRead =
  AffiliateAgentProducerClaimEnvelopeForHistoricalRead;
const PRODUCTION_ADAPTER_MAX_SAFE_OUTPUT_BYTES = 16_384;

const PRODUCTION_ADAPTER_MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
const PRODUCTION_ADAPTER_MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;

const productionHash = (value: unknown): string =>
  createHash("sha256")
    .update(canonicalizeAffiliateAgentValue(value))
    .digest("hex");

const productionRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);
type ProductionStagedObject = Readonly<{
  key: string;
  mimeType: string;
  bytes: Buffer;
}>;

type ProductionExternalStagingInput = Readonly<{
  commandType: "CAPTURE_CLAIM_URL" | "RUN_DISCOVERY_QUERY";
  lineage: Readonly<Record<string, unknown>>;
  sidecars?: readonly ProductionStagedObject[];
}>;

type ProductionExternalStagingRecord = Readonly<{
  schemaVersion: 1;
  commandType: ProductionExternalStagingInput["commandType"];
  output: Readonly<Record<string, unknown>>;
  lineage: Readonly<Record<string, unknown>>;
  objects: readonly Readonly<{
    key: string;
    mimeType: string;
    byteSize: number;
    sha256: string;
    dataBase64: string;
  }>[];
}>;

const PRODUCTION_ADAPTER_MAX_STAGING_BYTES = 20 * 1024 * 1024;

const productionJsonBuffer = (
  value: unknown,
  label: string,
  maximumBytes = PRODUCTION_ADAPTER_MAX_ARTIFACT_BYTES,
): Buffer => {
  let serialized: string;
  try {
    serialized = canonicalizeAffiliateAgentValue(value);
  } catch {
    throw new Error(`${label} contains invalid metadata.`);
  }
  const bytes = Buffer.from(serialized, "utf8");
  if (bytes.byteLength > maximumBytes) {
    throw new Error(`${label} exceeds the ${maximumBytes} byte limit.`);
  }
  return bytes;
};

const productionStagedObjectFor = (
  key: string,
  bytes: Uint8Array,
  mimeType: string,
  maximumBytes?: number,
): ProductionStagedObject => {
  const normalizedKey = key.trim();
  const normalizedMimeType = mimeType.trim();
  const data = Buffer.from(bytes);
  const defaultMaximumBytes = normalizedMimeType.startsWith("image/")
    ? PRODUCTION_ADAPTER_MAX_SCREENSHOT_BYTES
    : PRODUCTION_ADAPTER_MAX_ARTIFACT_BYTES;
  const allowedBytes = maximumBytes ?? defaultMaximumBytes;
  if (!normalizedKey || !normalizedMimeType || data.byteLength > allowedBytes) {
    throw new Error("The staged external provider output failed its size or MIME check.");
  }
  return { key: normalizedKey, mimeType: normalizedMimeType, bytes: data };
};

const productionStagingRecordFor = (
  input: ProductionExternalStagingInput,
  output: Readonly<Record<string, unknown>>,
  objects: readonly ProductionStagedObject[],
): { record: ProductionExternalStagingRecord; bytes: Buffer } => {
  const record = {
    schemaVersion: 1 as const,
    commandType: input.commandType,
    output,
    lineage: input.lineage,
    objects: objects.map((object) => ({
      key: object.key,
      mimeType: object.mimeType,
      byteSize: object.bytes.byteLength,
      sha256: createHash("sha256").update(object.bytes).digest("hex"),
      dataBase64: object.bytes.toString("base64"),
    })),
  } satisfies ProductionExternalStagingRecord;
  const bytes = productionJsonBuffer(
    record,
    "The external provider staging record",
    PRODUCTION_ADAPTER_MAX_STAGING_BYTES,
  );
  return { record, bytes };
};
const productionJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(canonicalizeAffiliateAgentValue(value)) as Prisma.InputJsonValue;

const productionString = (value: unknown): string | null => (
  typeof value === "string" && value.trim() ? value.trim() : null
);
const productionStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
    )
    : []
);
const verifyProductionArtifact = (
  expected: Readonly<{
    sha256: string;
    mimeType: string;
    byteSize: number;
  }>,
  artifact: AffiliateAgentArtifactRead,
): void => {
  if (
    artifact.byteSize !== expected.byteSize
    || artifact.bytes.byteLength !== expected.byteSize
    || artifact.mimeType !== expected.mimeType
    || createHash("sha256").update(artifact.bytes).digest("hex") !== expected.sha256
  ) {
    throw new Error("The command evidence failed its immutable byte, hash, size, or MIME check.");
  }
};
export type AffiliateAgentActiveSupplyContractArtifactEntry = Readonly<{
  kind: string;
  artifactId: string;
  sha256?: string;
  mimeType?: string;
  byteSize?: number;
}>;

export const AFFILIATE_AGENT_ACTIVE_SUPPLY_CONTRACT_ARTIFACT_PREFIX =
  "supply-contract:";

const ACTIVE_SUPPLY_CONTRACT_ARTIFACT_ERROR =
  "The active Supply Contract artifact is not valid.";
type ParsedAffiliateAgentActiveSupplyContractManifest = z.infer<
  typeof affiliateSupplyContractManifestSchema
>;

export const resolveAffiliateAgentActiveSupplyContractArtifact = async (
  input: Readonly<{
    prisma: PrismaClient;
    entry: AffiliateAgentActiveSupplyContractArtifactEntry;
    maximumBytes?: number;
  }>,
): Promise<AffiliateAgentArtifactRead | null> => {
  const { entry } = input;
  const isSyntheticHandle = typeof entry.artifactId === "string"
    && entry.artifactId.startsWith(
      AFFILIATE_AGENT_ACTIVE_SUPPLY_CONTRACT_ARTIFACT_PREFIX,
    );
  if (entry.kind !== "ACTIVE_SUPPLY_CONTRACT") {
    if (isSyntheticHandle) {
      throw new Error(ACTIVE_SUPPLY_CONTRACT_ARTIFACT_ERROR);
    }
    return null;
  }

  const policyHash = entry.artifactId.startsWith(
    AFFILIATE_AGENT_ACTIVE_SUPPLY_CONTRACT_ARTIFACT_PREFIX,
  )
    ? entry.artifactId.slice(
      AFFILIATE_AGENT_ACTIVE_SUPPLY_CONTRACT_ARTIFACT_PREFIX.length,
    )
    : "";
  if (
    !/^[a-f0-9]{64}$/.test(policyHash)
    || entry.artifactId
      !== `${AFFILIATE_AGENT_ACTIVE_SUPPLY_CONTRACT_ARTIFACT_PREFIX}${policyHash}`
    || (entry.sha256 !== undefined && entry.sha256 !== policyHash)
    || (entry.mimeType !== undefined && entry.mimeType !== "application/json")
    || (entry.byteSize !== undefined
      && (!Number.isSafeInteger(entry.byteSize) || entry.byteSize < 0))
    || (input.maximumBytes !== undefined
      && (!Number.isSafeInteger(input.maximumBytes) || input.maximumBytes < 0))
  ) {
    throw new Error(ACTIVE_SUPPLY_CONTRACT_ARTIFACT_ERROR);
  }

  const prismaWithContractManifests = input.prisma as unknown as {
    affiliateSupplyContractManifests?: {
      findMany?: (args: unknown) => Promise<unknown>;
    };
  };
  const contractManifests = prismaWithContractManifests.affiliateSupplyContractManifests;
  if (!contractManifests || typeof contractManifests.findMany !== "function") {
    throw new Error(ACTIVE_SUPPLY_CONTRACT_ARTIFACT_ERROR);
  }

  let rows: unknown;
  try {
    rows = await contractManifests.findMany({
      where: { status: "ACTIVE" },
      select: {
        version: true,
        rolloutCohort: true,
        status: true,
        contractHash: true,
        contractJson: true,
      },
    });
  } catch {
    throw new Error(ACTIVE_SUPPLY_CONTRACT_ARTIFACT_ERROR);
  }
  if (!Array.isArray(rows)) {
    throw new Error(ACTIVE_SUPPLY_CONTRACT_ARTIFACT_ERROR);
  }

  const matches: ParsedAffiliateAgentActiveSupplyContractManifest[] = [];
  try {
    for (const row of rows) {
      if (row === null || typeof row !== "object" || Array.isArray(row)) {
        throw new Error(ACTIVE_SUPPLY_CONTRACT_ARTIFACT_ERROR);
      }
      const record = productionRecord(row);
      const manifest = affiliateSupplyContractManifestSchema.parse({
        schemaVersion: 1,
        version: record.version,
        rolloutCohort: record.rolloutCohort,
        status: record.status,
        supplyContract: record.contractJson,
        hash: record.contractHash,
      });
      if (manifest.status !== "ACTIVE") continue;
      if (
        manifest.supplyContract.version !== manifest.version
        || ("rolloutCohort" in manifest.supplyContract
          && manifest.supplyContract.rolloutCohort !== manifest.rolloutCohort)
      ) {
        throw new Error(ACTIVE_SUPPLY_CONTRACT_ARTIFACT_ERROR);
      }
      if (manifest.supplyContract.hash === policyHash) {
        matches.push(manifest);
      }
    }
  } catch {
    throw new Error(ACTIVE_SUPPLY_CONTRACT_ARTIFACT_ERROR);
  }
  if (matches.length !== 1) {
    throw new Error(ACTIVE_SUPPLY_CONTRACT_ARTIFACT_ERROR);
  }

  const { hash: _policyHash, ...contractPreimage } =
    matches[0]!.supplyContract;
  const bytes = Buffer.from(
    canonicalizeAffiliateAgentValue(contractPreimage),
    "utf8",
  );
  if (
    productionHash(contractPreimage) !== policyHash
    || (entry.byteSize !== undefined && entry.byteSize !== bytes.byteLength)
    || (input.maximumBytes !== undefined && bytes.byteLength > input.maximumBytes)
  ) {
    throw new Error(ACTIVE_SUPPLY_CONTRACT_ARTIFACT_ERROR);
  }
  return {
    bytes,
    mimeType: "application/json",
    byteSize: bytes.byteLength,
    sourceUrl: null,
    finalUrl: null,
  };
};

type ProductionGatewayCommandContext = Readonly<{
  demand: Readonly<{
    id: string;
    targetKey: string;
    marketKey: string | null;
    sourceProfile: string | null;
  }>;
  wave: Readonly<{
    demandGeneration: unknown;
    campaignId: string | null;
  }>;
  campaignMetadata: Record<string, unknown>;
}>;

const productionGatewayCommandSubjectMatches = (
  job: Readonly<{
    role: string;
    subjectType: string;
    subjectJson: unknown;
  }> | null,
  demand: ProductionGatewayCommandContext["demand"],
  wave: ProductionGatewayCommandContext["wave"],
): boolean => {
  if (!job) return false;
  const subject = productionRecord(job.subjectJson);
  const subjectKeys = Object.keys(subject).sort();
  return (
    job.role === "COVERAGE_PLANNER"
    && job.subjectType === "COVERAGE_PLANNER"
    && canonicalizeAffiliateAgentValue(subjectKeys)
      === canonicalizeAffiliateAgentValue([
        "assessmentCycleId",
        "coverageCellId",
        "type",
      ])
    && subject.type === "COVERAGE_PLANNER"
    && subject.coverageCellId === demand.targetKey
    && subject.assessmentCycleId
      === `${demand.id}:generation:${String(wave.demandGeneration)}`
  );
};

const productionGatewayCommandCampaignMetadata = async (
  input: ProductionAdapterInput,
  campaignId: string | null,
): Promise<Record<string, unknown> | null> => {
  if (!campaignId) return {};
  const campaigns = input.prisma.affiliateSourceDiscoveryCampaigns;
  if (!campaigns?.findUnique) return null;
  const campaign = await campaigns.findUnique({
    where: { id: campaignId },
    select: { metadata: true },
  });
  return campaign ? productionRecord(campaign.metadata) : null;
};

type ProductionGatewayCommandRecords = Readonly<{
  demand: ProductionGatewayCommandContext["demand"] | null;
  wave: Readonly<{
    demandGeneration: unknown;
    campaignId: string | null;
    coveragePlanningJobId: string;
  }> | null;
  job: Readonly<{
    role: string;
    subjectType: string;
    subjectJson: unknown;
  }> | null;
}>;

const productionGatewayCommandRecords = async (
  input: ProductionAdapterInput,
  demandId: string,
): Promise<ProductionGatewayCommandRecords | null> => {
  const waves = input.prisma.affiliateReplenishmentWaves;
  const demands = input.prisma.affiliateReplenishmentDemands;
  const jobs = input.prisma.affiliateAgentGatewayJobs;
  if (!waves?.findFirst || !demands?.findUnique || !jobs?.findUnique) return null;
  const [demand, wave] = await Promise.all([
    demands.findUnique({
      where: { id: demandId },
      select: {
        id: true,
        targetKey: true,
        marketKey: true,
        sourceProfile: true,
      },
    }),
    waves.findFirst({
      where: { demandId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        coveragePlanningJobId: true,
        campaignId: true,
        demandGeneration: true,
      },
    }),
  ]);
  if (!demand || !wave?.coveragePlanningJobId) return null;
  const job = await jobs.findUnique({
    where: { id: wave.coveragePlanningJobId },
    select: { role: true, subjectType: true, subjectJson: true },
  });
  return {
    demand,
    wave: {
      demandGeneration: wave.demandGeneration,
      campaignId: wave.campaignId,
      coveragePlanningJobId: wave.coveragePlanningJobId,
    },
    job,
  };
};

const productionGatewayCommandContext = async (
  input: ProductionAdapterInput,
  demandId: string,
): Promise<ProductionGatewayCommandContext | null> => {
  const records = await productionGatewayCommandRecords(input, demandId);
  if (!records || !records.demand || !records.wave) return null;
  if (!productionGatewayCommandSubjectMatches(records.job, records.demand, records.wave)) {
    return null;
  }
  const campaignMetadata = await productionGatewayCommandCampaignMetadata(
    input,
    records.wave.campaignId,
  );
  return campaignMetadata === null
    ? null
    : {
      demand: records.demand,
      wave: records.wave,
      campaignMetadata,
    };
};

const productionGatewayCommandQuery = (
  context: ProductionGatewayCommandContext,
): Readonly<{ strategyKey: string; query: string }> => {
  const { demand, campaignMetadata } = context;
  const strategyKeys = productionStringArray(
    campaignMetadata.coverageStrategyKeys ?? campaignMetadata.strategyKeys,
  );
  return {
    strategyKey: strategyKeys[0]
      ?? `coverage-${String(demand.sourceProfile ?? "EVENT").toLowerCase()}`,
    query: productionString(campaignMetadata.query)
      ?? productionString(campaignMetadata.queryTerms)
      ?? `${String(demand.marketKey ?? "")} ${String(demand.sourceProfile ?? "")}`.trim(),
  };
};

const productionGatewayCommandValue = (
  entry: Readonly<{ evidenceRef: string }>,
  context: ProductionGatewayCommandContext,
): Record<string, unknown> | null => {
  const { demand } = context;
  const { strategyKey, query } = productionGatewayCommandQuery(context);
  switch (entry.evidenceRef) {
    case "coverage-strategy":
      return {
        schemaVersion: 1,
        strategyKey,
        profileKey: demand.sourceProfile,
        queryTerms: query,
      };
    case "coverage-query":
      return { schemaVersion: 1, query };
    case "coverage-capture-profile":
      return {
        schemaVersion: 1,
        profileKey: demand.sourceProfile,
        renderMode: "AUTO",
        waitMs: 0,
      };
    default:
      return null;
  }
};

const productionGatewayCommandArtifact = async (
  input: ProductionAdapterInput,
  entry: Readonly<{
    evidenceRef: string;
    artifactId: string;
  }>,
): Promise<AffiliateAgentArtifactRead | null> => {
  const prefix = "gateway-command:coverage-planning:";
  if (!entry.artifactId.startsWith(prefix)) return null;
  const suffix = entry.artifactId.slice(prefix.length);
  const separator = suffix.lastIndexOf(":");
  if (separator <= 0) return null;
  const context = await productionGatewayCommandContext(
    input,
    suffix.slice(0, separator),
  );
  if (!context) return null;
  const value = productionGatewayCommandValue(entry, context);
  if (value === null) return null;
  const bytes = Buffer.from(canonicalizeAffiliateAgentValue(value), "utf8");
  return {
    bytes,
    mimeType: "application/json",
    byteSize: bytes.byteLength,
    sourceUrl: null,
    finalUrl: null,
  };
};

const productionEvidenceArtifact = async (
  input: ProductionAdapterInput,
  claim: ProducerClaimEnvelopeForRead,
  evidenceRef: string,
): Promise<AffiliateAgentArtifactRead> => {
  const entry = claim.evidenceManifest.entries.find(
    (candidate) => candidate.evidenceRef === evidenceRef,
  );
  if (!entry) {
    throw new Error(`The command evidence reference ${evidenceRef} is not in the claim manifest.`);
  }
  const artifact = await resolveAffiliateAgentActiveSupplyContractArtifact({
    prisma: input.prisma,
    entry,
    maximumBytes: PRODUCTION_ADAPTER_MAX_ARTIFACT_BYTES,
  })
    ?? await productionGatewayCommandArtifact(input, entry)
    ?? await input.artifacts.readImmutable({
      fileId: entry.artifactId,
      maximumBytes: PRODUCTION_ADAPTER_MAX_ARTIFACT_BYTES,
    });
  verifyProductionArtifact(entry, artifact);
  return artifact;
};

export type AffiliateAgentLegacySportRepairVerificationInput = Readonly<{
  prisma: Pick<PrismaClient, "sports">;
  artifacts: AffiliateAgentArtifactStore;
  claim: ProducerClaimEnvelopeForRead,
  sportEvidence: AffiliateAgentSportEvidence;
  resultKind: "REVIEW_REQUIRED" | "HUMAN_REVIEW_REQUIRED";
  reasonCodes?: readonly string[];
  observedSportNames?: readonly string[];
}>;

const LEGACY_SPORT_EVIDENCE_FAILURE_MESSAGE = "Legacy sport repair sport evidence could not be verified.";

export class AffiliateAgentSportEvidenceError extends AffiliateAgentGatewayError {
  constructor(
    readonly issues: readonly AffiliateAgentSchemaIssue[],
    safeMessage = LEGACY_SPORT_EVIDENCE_FAILURE_MESSAGE,
  ) {
    super({
      code: "EVIDENCE_REFERENCE_NOT_PERMITTED",
      isRetryable: false,
      safeMessage,
    });
  }
}

const legacySportRepairEvidenceError = (
  message = LEGACY_SPORT_EVIDENCE_FAILURE_MESSAGE,
): AffiliateAgentGatewayError => new AffiliateAgentGatewayError({
  code: "EVIDENCE_REFERENCE_NOT_PERMITTED",
  isRetryable: false,
  safeMessage: message,
});

const packageValidationError = (safeMessage: string): AffiliateAgentGatewayError =>
  new AffiliateAgentGatewayError({
    code: "COMMAND_SCHEMA_INVALID",
    isRetryable: false,
    safeMessage,
  });
const legacySportRepairContextFor = (
  claim: ProducerClaimEnvelopeForRead,
): AffiliateAgentLegacySportRepairContext => {
  if (claim.role === "MAPPING_PRODUCER") {
    if (claim.subject.repairContext?.kind === "LEGACY_SPORT_REPAIR") {
      return claim.subject.repairContext;
    }
  } else if (
    claim.role === "SUPPLY_REVIEWER"
    && claim.subject.repairContext?.kind === "LEGACY_SPORT_REPAIR"
  ) {
    return claim.subject.repairContext;
  }
  throw new Error("Legacy sport evidence requires a legacy sport repair claim.");
};

const legacySportRepairArtifactFor = async (
  input: AffiliateAgentLegacySportRepairVerificationInput,
  citation: AffiliateSportCitation,
  determinationIndex: number,
  citationIndex: number,
): Promise<AffiliateSportCompletionStoredArtifact> => {
  const context = legacySportRepairContextFor(input.claim);
  const entry = input.claim.evidenceManifest.entries.find(
    (candidate) => candidate.artifactId === citation.artifactId,
  );
  if (!entry) {
    throw new AffiliateAgentSportEvidenceError([
      {
        path: [
          "sportEvidence",
          "sportDeterminations",
          determinationIndex,
          "evidence",
          citationIndex,
          "artifactId",
        ],
        code: "INVALID_VALUE",
        message: "Use an artifact owned by the claim manifest.",
      },
    ]);
  }
  if (entry.kind !== citation.artifactKind) {
    throw new AffiliateAgentSportEvidenceError([
      {
        path: [
          "sportEvidence",
          "sportDeterminations",
          determinationIndex,
          "evidence",
          citationIndex,
          "artifactKind",
        ],
        code: "INVALID_VALUE",
        message: "Use the artifact kind recorded in the claim manifest.",
      },
    ]);
  }
  const artifact = await input.artifacts.readImmutable({
    fileId: entry.artifactId,
    maximumBytes: PRODUCTION_ADAPTER_MAX_ARTIFACT_BYTES,
  });
  try {
    verifyProductionArtifact(entry, artifact);
  } catch {
    throw new AffiliateAgentSportEvidenceError([
      {
        path: [
          "sportEvidence",
          "sportDeterminations",
          determinationIndex,
          "evidence",
          citationIndex,
          "artifactId",
        ],
        code: "INVALID_VALUE",
        message: "The stored artifact no longer matches the claim manifest.",
      },
    ]);
  }
  const artifactRunId = artifact.runId;
  const artifactIntakeId = artifact.intakeId;
  if (
    typeof artifactRunId !== "string" ||
    artifactRunId !== context.evidenceRunId ||
    typeof artifactIntakeId !== "string" ||
    artifactIntakeId !== context.intakeId
  ) {
    throw new AffiliateAgentSportEvidenceError([
      {
        path: [
          "sportEvidence",
          "sportDeterminations",
          determinationIndex,
          "evidence",
          citationIndex,
          "artifactId",
        ],
        code: "INVALID_VALUE",
        message:
          "The stored artifact does not belong to the claim intake and evidence run.",
      },
    ]);
  }
  return {
    artifactId: entry.artifactId,
    runId: artifactRunId,
    intakeId: artifactIntakeId,
    kind: citation.artifactKind,
    sourceUrl: artifact.sourceUrl,
    finalUrl: artifact.finalUrl,
    mimeType: artifact.mimeType,
    artifactSha256: entry.sha256,
    bytes: artifact.bytes,
  };
};

export const verifyAffiliateAgentLegacySportRepair = async (
  input: AffiliateAgentLegacySportRepairVerificationInput,
): Promise<VerifiedAffiliateSportCompletion> => {
  let context: AffiliateAgentLegacySportRepairContext;
  try {
    context = legacySportRepairContextFor(input.claim);
  } catch {
    throw legacySportRepairEvidenceError();
  }
  let sportEvidence: AffiliateAgentSportEvidence;
  try {
    sportEvidence = affiliateAgentSportEvidenceSchema.parse(
      input.sportEvidence,
    );
  } catch {
    throw legacySportRepairEvidenceError();
  }
  if (sportEvidence.evidenceRunId !== context.evidenceRunId) {
    throw new AffiliateAgentSportEvidenceError([
      {
        path: ["sportEvidence", "evidenceRunId"],
        code: "INVALID_VALUE",
        message: "Use the evidence run from the claim repair context.",
      },
    ]);
  }
  if (
    sportEvidence.sportsCatalogSha256.toLowerCase() !==
    context.sportsCatalog.sha256.toLowerCase()
  ) {
    throw new AffiliateAgentSportEvidenceError([
      {
        path: ["sportEvidence", "sportsCatalogSha256"],
        code: "INVALID_VALUE",
        message: "Use the sports catalog hash from the claim repair context.",
      },
    ]);
  }
  const artifacts = new Map<string, AffiliateSportCompletionStoredArtifact>();
  for (
    let determinationIndex = 0;
    determinationIndex < sportEvidence.sportDeterminations.length;
    determinationIndex += 1
  ) {
    const citations =
      sportEvidence.sportDeterminations[determinationIndex].evidence;
    for (
      let citationIndex = 0;
      citationIndex < citations.length;
      citationIndex += 1
    ) {
      const citation = citations[citationIndex];
      const key = `${citation.artifactId}:${citation.artifactKind}`;
      if (!artifacts.has(key)) {
        artifacts.set(
          key,
          await legacySportRepairArtifactFor(
            input,
            citation,
            determinationIndex,
            citationIndex,
          ),
        );
      }
    }
  }
  if (
    input.resultKind === "REVIEW_REQUIRED" &&
    input.observedSportNames === undefined
  ) {
    throw legacySportRepairEvidenceError();
  }
  const currentCatalog = await loadAffiliateSportsCatalogSnapshot(input.prisma);
  let observedSportNames: readonly string[] | undefined;
  if (input.observedSportNames !== undefined) {
    try {
      observedSportNames = sortUniqueAffiliateSportNames(
        input.observedSportNames,
      );
    } catch {
      throw legacySportRepairEvidenceError();
    }
  }
  const verificationInput: AffiliateSportCompletionVerificationInput = {
    result: {
      status: input.resultKind,
      evidenceRunId: sportEvidence.evidenceRunId,
      sportsCatalogSha256: sportEvidence.sportsCatalogSha256,
      sportDeterminations: sportEvidence.sportDeterminations,
      humanReviewRequired:
        input.resultKind === "HUMAN_REVIEW_REQUIRED"
          ? {
              reasonCodes: [...(input.reasonCodes ?? [])],
              sourceSportLabels: sportEvidence.sportDeterminations.flatMap(
                (determination) => determination.sourceLabels,
              ),
            }
          : null,
    },
    resultKind: input.resultKind,
    reasonCodes: input.reasonCodes,
    determinations: sportEvidence.sportDeterminations,
    claimEvidenceContext: {
      intakeId: context.intakeId,
      evidenceRunId: context.evidenceRunId,
      sportsCatalog: context.sportsCatalog,
    },
    freshCatalog: currentCatalog,
    expectedIntakeId: context.intakeId,
    artifacts: [...artifacts.values()],
    observedSportNames,
  };
  try {
    return await verifyAffiliateSportCompletion(verificationInput);
  } catch (error) {
    if (error instanceof AffiliateSportVerificationError) {
      throw new AffiliateAgentSportEvidenceError([
        {
          path:
            error.path[0] === "reasonCodes"
              ? [...error.path]
              : ["sportEvidence", ...error.path],
          code: "INVALID_VALUE",
          message: error.message,
        },
      ]);
    }
    if (error instanceof Error && error.name === "SPORT_CATALOG_MISMATCH") {
      const message =
        "The current sports catalog differs from the claim catalog.";
      throw new AffiliateAgentSportEvidenceError(
        [
          {
            path: ["sportEvidence", "sportsCatalogSha256"],
            code: "INVALID_VALUE",
            message: message,
          },
        ],
        message,
      );
    }
    if (
      error instanceof Error &&
      error.message ===
        "Disposable sport quality did not prove the exact determination sport union."
    ) {
      const message =
        "Extracted sports do not match the resolved sport evidence.";
      throw new AffiliateAgentSportEvidenceError(
        [
          {
            path: ["sportEvidence", "sportDeterminations"],
            code: "INVALID_VALUE",
            message: message,
          },
        ],
        message,
      );
    }
    throw legacySportRepairEvidenceError();
  }
};

const productionEvidence = async (
  input: ProductionAdapterInput,
  claim: ProducerClaimEnvelopeForRead,
  evidenceRef: string,
): Promise<Readonly<{
  sourceUrl: string | null;
  finalUrl: string | null;
  text: string;
}>> => {
  const artifact = await productionEvidenceArtifact(input, claim, evidenceRef);
  return {
    sourceUrl: artifact.sourceUrl,
    finalUrl: artifact.finalUrl ?? null,
    text: Buffer.from(artifact.bytes).toString("utf8"),
  };
};

const productionListingEvidence = async (
  input: ProductionAdapterInput,
  claim: ProducerClaimEnvelopeForRead,
  evidenceRef: string,
) => {
  const entry = claim.evidenceManifest.entries.find((candidate) => candidate.evidenceRef === evidenceRef);
  if (!entry) {
    throw packageValidationError("The package references evidence outside the claim manifest.");
  }
  if (entry.kind !== "PAGE_HTML") {
    throw packageValidationError("Declarative CSS extraction requires PAGE_HTML listing evidence.");
  }
  return productionEvidence(input, claim, evidenceRef);
};

const productionExternalJson = (text: string, label: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} evidence must contain valid JSON.`);
  }
};

const productionExternalIdentifierSchema = z.string().trim().min(1).max(200);

const productionSearchOptionsSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  location: z.string().trim().max(200).optional(),
  includeDomains: z.array(productionExternalIdentifierSchema).max(100).optional(),
  excludeDomains: z.array(productionExternalIdentifierSchema).max(100).optional(),
}).strict();

const productionStrategyEvidenceSchema = z.object({
  schemaVersion: z.literal(1).optional(),
  strategyKey: productionExternalIdentifierSchema,
  strategyFamilyKey: productionExternalIdentifierSchema.optional(),
  profileKey: productionExternalIdentifierSchema.optional(),
  queryTerms: z.string().trim().min(1).max(2_000).optional(),
}).strict();

const productionQueryEvidenceSchema = z.object({
  schemaVersion: z.literal(1).optional(),
  query: z.string().trim().min(1).max(2_000).optional(),
  searchQuery: z.string().trim().min(1).max(2_000).optional(),
  ...productionSearchOptionsSchema.shape,
  options: productionSearchOptionsSchema.optional(),
  request: z.object({
    query: z.string().trim().min(1).max(2_000).optional(),
    searchQuery: z.string().trim().min(1).max(2_000).optional(),
    ...productionSearchOptionsSchema.shape,
    options: productionSearchOptionsSchema.optional(),
  }).strict().optional(),
}).strict().superRefine((value, context) => {
  const query = value.query
    ?? value.searchQuery
    ?? value.request?.query
    ?? value.request?.searchQuery;
  if (!query) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A discovery query is required.",
      path: ["query"],
    });
  }
});

const productionCaptureProfileEvidenceSchema = z.object({
  schemaVersion: z.literal(1).optional(),
  profileKey: productionExternalIdentifierSchema.optional(),
  renderMode: z.enum(["AUTO", "STATIC", "JAVASCRIPT"]).optional(),
  waitMs: z.number().int().min(0).max(35_000).optional(),
  timeoutMs: z.number().int().min(30_000).max(180_000).optional(),
}).strict();

type ProductionQuerySettings = Readonly<{
  query: string;
  options: AffiliateSourceSearchOptions;
}>;

const productionSearchOptionsFrom = (
  value: z.infer<typeof productionSearchOptionsSchema> | undefined,
): AffiliateSourceSearchOptions => value
  ? {
    ...(value.limit === undefined ? {} : { limit: value.limit }),
    ...(value.location === undefined ? {} : { location: value.location }),
    ...(value.includeDomains === undefined ? {} : { includeDomains: value.includeDomains }),
    ...(value.excludeDomains === undefined ? {} : { excludeDomains: value.excludeDomains }),
  }
  : {};

const parseProductionStrategyEvidence = (
  text: string,
): AffiliateSourceSearchOptions["strategy"] => {
  const parsed = productionStrategyEvidenceSchema.safeParse(
    productionExternalJson(text, "The discovery strategy"),
  );
  if (!parsed.success) {
    throw new Error("The discovery strategy evidence has invalid settings.");
  }
  return {
    strategyKey: parsed.data.strategyKey,
    ...(parsed.data.strategyFamilyKey
      ? { strategyFamilyKey: parsed.data.strategyFamilyKey }
      : {}),
    ...(parsed.data.profileKey ? { profileKey: parsed.data.profileKey } : {}),
    ...(parsed.data.queryTerms ? { queryTerms: parsed.data.queryTerms } : {}),
  };
};

type ProductionQueryEvidence = z.infer<typeof productionQueryEvidenceSchema>;

const productionQuerySettingsFromEvidence = (
  data: ProductionQueryEvidence,
): ProductionQuerySettings => {
  const query = [
    data.query,
    data.searchQuery,
    data.request?.query,
    data.request?.searchQuery,
  ].find((candidate): candidate is string => candidate !== undefined);
  if (!query) throw new Error("The discovery query evidence is empty.");
  const options = [
    data.options,
    data.request?.options,
    data.request,
    data,
  ].find((candidate) => candidate !== undefined);
  return {
    query,
    options: productionSearchOptionsFrom(options),
  };
};

const parseProductionQueryEvidence = (text: string): ProductionQuerySettings => {
  const parsed = productionQueryEvidenceSchema.safeParse(
    productionExternalJson(text, "The discovery query"),
  );
  if (!parsed.success) {
    throw new Error("The discovery query evidence has invalid settings.");
  }
  return productionQuerySettingsFromEvidence(parsed.data);
};

const parseProductionCaptureProfileEvidence = (
  text: string,
): AffiliateSourceCaptureProfile => {
  const parsed = productionCaptureProfileEvidenceSchema.safeParse(
    productionExternalJson(text, "The capture profile"),
  );
  if (!parsed.success) {
    throw new Error("The capture profile evidence has invalid settings.");
  }
  return {
    ...(parsed.data.profileKey ? { profileKey: parsed.data.profileKey } : {}),
    ...(parsed.data.renderMode ? { renderMode: parsed.data.renderMode } : {}),
    ...(parsed.data.waitMs === undefined ? {} : { waitMs: parsed.data.waitMs }),
    ...(parsed.data.timeoutMs === undefined ? {} : { timeoutMs: parsed.data.timeoutMs }),
  };
};

const PRODUCTION_CAPTURE_METADATA_MAX_RECORD_KEYS = 32;
const PRODUCTION_CAPTURE_METADATA_MAX_REF_ITEMS = 8;
const PRODUCTION_CAPTURE_METADATA_MAX_REF_BYTES = 512;
const PRODUCTION_CAPTURE_METADATA_MAX_SET_ITEMS = 10_000;

const productionCaptureRecordSummary = (
  value: Record<string, unknown>,
): AffiliateAgentCaptureRecordSummary => {
  const canonical = canonicalizeAffiliateAgentValue(value);
  const keys = Object.keys(value)
    .sort()
    .filter((key) => key.trim())
    .slice(0, PRODUCTION_CAPTURE_METADATA_MAX_RECORD_KEYS);
  return {
    keys,
    sha256: createHash("sha256").update(canonical).digest("hex"),
    byteSize: Buffer.byteLength(canonical, "utf8"),
  };
};

const productionCaptureTextSummary = (
  value: string | null,
): AffiliateAgentCaptureTextSummary | null => value === null
  ? null
  : {
    sha256: createHash("sha256").update(value, "utf8").digest("hex"),
    byteSize: Buffer.byteLength(value, "utf8"),
  };

const productionCaptureSetSummary = (
  values: readonly string[],
): AffiliateAgentCaptureSetSummary => {
  if (
    !Array.isArray(values)
    || values.length > PRODUCTION_CAPTURE_METADATA_MAX_SET_ITEMS
    || values.some((value) => typeof value !== "string" || !value.trim())
  ) {
    throw new Error("The capture provider returned invalid artifact references.");
  }
  return {
    count: values.length,
    sha256: productionHash(values),
    refs: values
      .slice(0, PRODUCTION_CAPTURE_METADATA_MAX_REF_ITEMS)
      .map((value) => value.trim().slice(0, PRODUCTION_CAPTURE_METADATA_MAX_REF_BYTES)),
  };
};
type ProductionSourceScreenshotEvidence = NonNullable<
  NonNullable<AffiliateSourcePageCapture["providerArtifacts"]>["screenshotEvidence"]
>;

const productionCaptureScreenshotEvidenceSummary = (
  evidence: ProductionSourceScreenshotEvidence | null | undefined,
): AffiliateAgentCaptureScreenshotEvidence | null => {
  if (!evidence) return null;
  const sourceUrl = evidence.sourceUrl.trim();
  const finalUrl = evidence.finalUrl.trim();
  const mimeType = evidence.mimeType.trim().toLowerCase();
  if (
    !sourceUrl
    || !finalUrl
    || !mimeType.startsWith("image/")
    || !Number.isInteger(evidence.statusCode)
    || evidence.statusCode < 200
    || evidence.statusCode >= 300
    || evidence.data.byteLength > PRODUCTION_ADAPTER_MAX_SCREENSHOT_BYTES
  ) {
    throw new Error("The screenshot evidence failed its provenance or size check.");
  }
  return {
    sourceUrl,
    finalUrl,
    statusCode: evidence.statusCode,
    mimeType,
    byteSize: evidence.data.byteLength,
    sha256: createHash("sha256").update(evidence.data).digest("hex"),
  };
};

const productionCaptureProviderArtifactsFrom = (
  artifacts: NonNullable<AffiliateSourcePageCapture["providerArtifacts"]>,
): Readonly<{
  markdown: AffiliateAgentCaptureTextSummary | null;
  links: AffiliateAgentCaptureSetSummary;
  images: AffiliateAgentCaptureSetSummary;
  branding: Readonly<Record<string, unknown>> | null;
  screenshotUrl: string | null;
  screenshotEvidence: AffiliateAgentCaptureScreenshotEvidence | null;
  metadata: Readonly<Record<string, unknown>>;
}> => ({
  markdown: productionCaptureTextSummary(artifacts.markdown),
  links: productionCaptureSetSummary(artifacts.links),
  images: productionCaptureSetSummary(artifacts.images),
  branding: artifacts.branding,
  screenshotUrl: artifacts.screenshotUrl,
  screenshotEvidence: productionCaptureScreenshotEvidenceSummary(artifacts.screenshotEvidence),
  metadata: artifacts.metadata,
});

const productionCaptureStagingInputFor = (
  operationKey: string,
  result: AffiliateSourcePageCapture,
  output: Readonly<Record<string, unknown>>,
): ProductionExternalStagingInput => {
  const providerArtifacts = result.providerArtifacts;
  const sidecars: ProductionStagedObject[] = [
    productionStagedObjectFor(
      `${operationKey}:request`,
      productionJsonBuffer(result.request, "The capture request"),
      "application/json",
    ),
    productionStagedObjectFor(
      `${operationKey}:response`,
      productionJsonBuffer(result.response, "The capture response"),
      "application/json",
    ),
  ];
  if (providerArtifacts) {
    if (providerArtifacts.markdown !== null) {
      sidecars.push(
        productionStagedObjectFor(
          `${operationKey}:markdown`,
          Buffer.from(providerArtifacts.markdown, "utf8"),
          "text/markdown; charset=utf-8",
        ),
      );
    }
    sidecars.push(
      productionStagedObjectFor(
        `${operationKey}:links`,
        productionJsonBuffer(providerArtifacts.links, "The capture links"),
        "application/json",
      ),
      productionStagedObjectFor(
        `${operationKey}:images`,
        productionJsonBuffer(providerArtifacts.images, "The capture images"),
        "application/json",
      ),
      productionStagedObjectFor(
        `${operationKey}:branding`,
        productionJsonBuffer(providerArtifacts.branding, "The capture branding"),
        "application/json",
      ),
      productionStagedObjectFor(
        `${operationKey}:metadata`,
        productionJsonBuffer(providerArtifacts.metadata, "The capture metadata"),
        "application/json",
      ),
    );
    const screenshotEvidence = providerArtifacts.screenshotEvidence;
    if (screenshotEvidence) {
      const screenshotSummary = productionCaptureScreenshotEvidenceSummary(screenshotEvidence);
      if (!screenshotSummary) {
        throw new Error("The screenshot evidence summary could not be created.");
      }
      sidecars.push(
        productionStagedObjectFor(
          `${operationKey}:screenshot`,
          screenshotEvidence.data,
          screenshotSummary.mimeType,
        ),
      );
    }
  }
  return {
    commandType: "CAPTURE_CLAIM_URL",
    lineage: {
      operationKey,
      provider: result.provider,
      requestedUrl: result.requestedUrl,
      finalUrl: result.finalUrl,
      providerJobId: result.providerJobId ?? null,
      evidenceRef: output.evidenceRef,
      artifactId: output.artifactId,
      sha256: output.sha256,
    },
    sidecars,
  };
};
const productionCaptureMetadataFrom = (
  result: AffiliateSourcePageCapture,
  requestedUrl: string,
  expectedProvider: AffiliateSourceCaptureClient["provider"],
): AffiliateAgentCaptureMetadata => {
  const metadata = parseAffiliateAgentCaptureMetadata({
    provider: result.provider,
    request: productionCaptureRecordSummary(result.request),
    response: productionCaptureRecordSummary(result.response),
    requestedUrl: result.requestedUrl,
    finalUrl: result.finalUrl,
    isRedirectVerified: result.isRedirectVerified === true,
    inferredCanonicalUrl: result.inferredCanonicalUrl ?? null,
    providerStatusCode: result.providerStatusCode,
    targetStatusCode: result.targetStatusCode,
    renderMode: result.renderMode,
    elapsedMs: result.elapsedMs,
    estimatedCredits: result.estimatedCredits,
    warnings: result.warnings,
    ...(result.providerJobId === undefined
      ? {}
      : { providerJobId: result.providerJobId }),
    ...(result.attempts === undefined ? {} : { attempts: result.attempts }),
    ...(result.providerArtifacts === undefined
      ? {}
      : { providerArtifacts: productionCaptureProviderArtifactsFrom(result.providerArtifacts) }),
  });
  if (metadata.provider !== expectedProvider) {
    throw new Error("The capture provider returned mismatched provider metadata.");
  }
  if (metadata.requestedUrl !== new URL(requestedUrl).toString()) {
    throw new Error("The capture provider returned mismatched requested URL metadata.");
  }
  return metadata;
};

const productionUrlFromEvidence = (
  evidence: Readonly<{ sourceUrl: string | null; finalUrl: string | null }>,
): string => {
  const finalUrl = productionString(evidence.finalUrl);
  const sourceUrl = productionString(evidence.sourceUrl);
  const candidate = finalUrl ?? sourceUrl;
  if (!candidate) {
    throw new Error(
      "The package listing evidence must include stored source or final URL metadata.",
    );
  }
  try {
    return new URL(candidate).toString();
  } catch {
    throw new Error(
      "The package listing evidence must include a valid stored source or final URL.",
    );
  }
};

const productionUrlFromExternalEvidence = (
  evidence: Readonly<{
    sourceUrl: string | null;
    finalUrl: string | null;
    text: string;
  }>,
): string => {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(evidence.text);
  } catch {
    // Existing source-intake URL artifacts may contain the URL as plain text.
  }
  const parsedUrl = z.object({ url: z.string().trim().url() }).strict().safeParse(parsed);
  const candidate = typeof parsed === "string"
    ? parsed.trim()
    : parsedUrl.success
      ? parsedUrl.data.url
      : productionString(evidence.finalUrl)
        ?? productionString(evidence.sourceUrl)
        ?? evidence.text.trim();
  if (!candidate) {
    throw new Error("The claim URL evidence has invalid settings.");
  }
  try {
    return new URL(candidate).toString();
  } catch {
    throw new Error("The claim URL evidence does not contain a valid source URL.");
  }
};

const allocateProductionOutputEvidenceRef = (
  input: ProductionAdapterInput,
  operationKey: string,
  inputEvidenceRefs: readonly string[],
): string => {
  const used = new Set(inputEvidenceRefs);
  const generated = input.identifiers?.create("artifact")
    ?? `agw-artifact-${randomUUID()}`;
  if (!used.has(generated)) return generated;
  const fallback = `${operationKey}:output`;
  if (!used.has(fallback)) return fallback;
  throw new Error("The external provider output could not receive a distinct evidence reference.");
};

const putProductionStagedObject = async (
  input: ProductionAdapterInput,
  object: ProductionStagedObject,
  originalName: string,
): Promise<void> => {
  const stored = await input.storage.putObject({
    data: object.bytes,
    originalName,
    contentType: object.mimeType,
    key: object.key,
  });
  if (
    stored.key !== object.key
    || stored.sizeBytes !== object.bytes.byteLength
    || (stored.contentType && stored.contentType !== object.mimeType)
  ) {
    throw new Error("The stored external provider output failed its size or MIME check.");
  }
};

type ProductionClaimArtifactKind =
  | "DETERMINISTIC_VALIDATION"
  | "COMMITTED_PACKAGE"
  | "DURABLE_EVIDENCE";

type ProductionClaimArtifact = Readonly<{
  evidenceRef: string;
  evidenceKind: ProductionClaimArtifactKind;
  sourceArtifactId: string;
  fileId: string;
  sha256: string;
  contentHash: string;
  mimeType: "application/json";
  byteSize: number;
  creatingClaimId?: string | null;
}>;

const productionClaimArtifactFor = (
  claim: AffiliateAgentClaimEnvelope,
  evidenceKind: ProductionClaimArtifactKind,
  bytes: Buffer,
): ProductionClaimArtifact => {
  const suffix = evidenceKind === "DETERMINISTIC_VALIDATION"
    ? "deterministic-validation"
    : evidenceKind === "COMMITTED_PACKAGE"
      ? "committed-package"
      : "durable-evidence";
  const artifactId = `${claim.claimId}:gateway-${suffix}`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    evidenceRef: `gateway-${suffix}`,
    evidenceKind,
    sourceArtifactId: artifactId,
    fileId: artifactId,
    sha256,
    contentHash: sha256,
    mimeType: "application/json",
    byteSize: bytes.byteLength,
  };
};
const productionApprovalArtifactFor = (
  claim: AffiliateAgentClaimEnvelope,
  bytes: Buffer,
  creatingClaimId: string,
): ProductionClaimArtifact => {
  const artifactId = `${claim.claimId}:gateway-approval-evidence`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    evidenceRef: "gateway-approval-evidence",
    evidenceKind: "DURABLE_EVIDENCE",
    sourceArtifactId: artifactId,
    fileId: artifactId,
    sha256,
    contentHash: sha256,
    mimeType: "application/json",
    byteSize: bytes.byteLength,
    creatingClaimId,
  };
};
const persistProductionDurableEvidence = async (
  input: ProductionAdapterInput,
  transaction: Prisma.TransactionClient,
  claim: AffiliateAgentClaimEnvelope,
  evidenceRefs: readonly string[],
): Promise<ProductionClaimArtifact> => {
  const entries = await Promise.all(evidenceRefs.map(async (evidenceRef) => {
    const artifact = await productionEvidenceArtifact(input, claim, evidenceRef);
    const bytes = Buffer.from(artifact.bytes);
    return {
      evidenceRef,
      sourceUrl: artifact.sourceUrl,
      mimeType: artifact.mimeType,
      byteSize: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      dataBase64: bytes.toString("base64"),
    };
  }));
  const durableBytes = productionJsonBuffer(
    {
      schemaVersion: 1,
      evidence: entries,
      claimId: claim.claimId,
      claimGeneration: claim.claimGeneration,
      invocationId: claim.invocationId,
    },
    "The durable mapping evidence",
  );
  const durableArtifact = productionClaimArtifactFor(
    claim,
    "DURABLE_EVIDENCE",
    durableBytes,
  );
  await persistProductionClaimArtifact(
    input,
    transaction,
    claim,
    durableArtifact,
    durableBytes,
  );
  return durableArtifact;
};


type ProductionClaimArtifactRow = Readonly<{
  claimGeneration: number;
  evidenceKind: string;
  sourceArtifactId: string;
  fileId: string;
  contentHash: string;
  mimeType: string;
  byteSize: number;
  creatingClaimId: string | null;
}>;

const productionClaimArtifactRowMatches = (
  row: ProductionClaimArtifactRow,
  claim: AffiliateAgentClaimEnvelope,
  artifact: ProductionClaimArtifact,
): boolean => [
  row.claimGeneration === claim.claimGeneration,
  row.evidenceKind === artifact.evidenceKind,
  row.sourceArtifactId === artifact.sourceArtifactId,
  row.fileId === artifact.fileId,
  row.contentHash === artifact.contentHash,
  row.mimeType === artifact.mimeType,
  row.byteSize === artifact.byteSize,
  row.creatingClaimId === (artifact.creatingClaimId ?? claim.claimId),
].every(Boolean);

const persistProductionClaimArtifactStorage = async (
  input: ProductionAdapterInput,
  claim: AffiliateAgentClaimEnvelope,
  artifact: ProductionClaimArtifact,
  bytes: Buffer,
): Promise<void> => {
  const staged = productionStagedObjectFor(
    artifact.fileId,
    bytes,
    artifact.mimeType,
  );
  const existingBytes = await readProductionObjectBytes(
    input,
    staged.key,
    PRODUCTION_ADAPTER_MAX_ARTIFACT_BYTES,
    artifact.mimeType,
  );
  if (existingBytes !== null) {
    if (!existingBytes.equals(bytes)) {
      throw new Error("The producer artifact storage key contains different immutable bytes.");
    }
  } else {
    await putProductionStagedObject(
      input,
      staged,
      `affiliate-agent-${claim.claimId}-${artifact.evidenceKind.toLowerCase()}.json`,
    );
  }
  const immutable = await input.artifacts.readImmutable({
    fileId: artifact.fileId,
    maximumBytes: PRODUCTION_ADAPTER_MAX_ARTIFACT_BYTES,
  });
  verifyProductionArtifact(artifact, immutable);
};

const createProductionClaimArtifactRecord = (
  input: ProductionAdapterInput,
  transaction: Prisma.TransactionClient,
  claim: AffiliateAgentClaimEnvelope,
  artifact: ProductionClaimArtifact,
) => transaction.affiliateAgentGatewayArtifacts.createMany({
  data: [{
    id: input.identifiers?.create("artifact") ?? `agw-artifact-${randomUUID()}`,
    claimId: claim.claimId,
    claimGeneration: claim.claimGeneration,
    evidenceRef: artifact.evidenceRef,
    evidenceKind: artifact.evidenceKind,
    sourceArtifactId: artifact.sourceArtifactId,
    fileId: artifact.fileId,
    contentHash: artifact.contentHash,
    mimeType: artifact.mimeType,
    byteSize: artifact.byteSize,
    creatingClaimId: artifact.creatingClaimId ?? claim.claimId,
    retentionClass: "INDEFINITE",
    isPinned: true,
  }],
  skipDuplicates: true,
});

const persistProductionClaimArtifact = async (
  input: ProductionAdapterInput,
  transaction: Prisma.TransactionClient,
  claim: AffiliateAgentClaimEnvelope,
  artifact: ProductionClaimArtifact,
  bytes: Buffer,
): Promise<void> => {
  const where = {
    claimId_evidenceRef: {
      claimId: claim.claimId,
      evidenceRef: artifact.evidenceRef,
    },
  };
  const existing = await transaction.affiliateAgentGatewayArtifacts.findUnique({ where });
  if (existing && !productionClaimArtifactRowMatches(existing, claim, artifact)) {
    throw new Error("The producer artifact conflicts with an existing immutable record.");
  }
  if (!existing) {
    const inserted = await createProductionClaimArtifactRecord(
      input,
      transaction,
      claim,
      artifact,
    );
    if (inserted.count === 0) {
      const concurrent = await transaction.affiliateAgentGatewayArtifacts.findUnique({ where });
      if (!concurrent || !productionClaimArtifactRowMatches(concurrent, claim, artifact)) {
        throw new Error("The producer artifact conflicts with a concurrent immutable record.");
      }
    }
  }
  await persistProductionClaimArtifactStorage(input, claim, artifact, bytes);
};

const productionOutputFor = (
  operationKey: string,
  evidenceRef: string,
  bytes: Buffer,
  mimeType: string,
  captureMetadata?: AffiliateAgentCaptureMetadata,
): {
  output: Readonly<Record<string, unknown>>;
  serializedOutput: string;
} => {
  const normalizedMimeType = mimeType.trim();
  if (
    !normalizedMimeType
    || bytes.byteLength > PRODUCTION_ADAPTER_MAX_ARTIFACT_BYTES
  ) {
    throw new Error("The external provider output failed its size or MIME check.");
  }
  const output = {
    artifactId: `${operationKey}:artifact`,
    byteSize: bytes.byteLength,
    evidenceRef,
    mimeType: normalizedMimeType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...(captureMetadata === undefined
      ? {}
      : { captureMetadata: parseAffiliateAgentCaptureMetadata(captureMetadata) }),
  };
  let serializedOutput: string;
  try {
    serializedOutput = canonicalizeAffiliateAgentValue(output);
  } catch {
    throw new Error("The external provider output contains invalid metadata.");
  }
  if (
    Buffer.byteLength(serializedOutput, "utf8")
    > PRODUCTION_ADAPTER_MAX_SAFE_OUTPUT_BYTES
  ) {
    throw new Error("The external provider output exceeds the safe output limit.");
  }
  return {
    output,
    serializedOutput,
  };
};

const persistProductionExternalOutput = async (
  input: ProductionAdapterInput,
  operationKey: string,
  evidenceRef: string,
  bytes: Buffer,
  mimeType: string,
  captureMetadata?: AffiliateAgentCaptureMetadata,
  stagingInput?: ProductionExternalStagingInput
    | ((output: Readonly<Record<string, unknown>>) => ProductionExternalStagingInput),
): Promise<Readonly<Record<string, unknown>>> => {
  const { output, serializedOutput } = productionOutputFor(
    operationKey,
    evidenceRef,
    bytes,
    mimeType,
    captureMetadata,
  );
  const primaryObject = productionStagedObjectFor(
    `${operationKey}:artifact`,
    bytes,
    mimeType,
  );
  const effectiveStagingInput = (
    typeof stagingInput === "function"
      ? stagingInput(output)
      : stagingInput
  ) ?? {
    commandType: "RUN_DISCOVERY_QUERY" as const,
    lineage: {
      operationKey,
      evidenceRef,
      artifactId: output.artifactId,
      sha256: output.sha256,
    },
  };
  const objects = [
    primaryObject,
    ...(effectiveStagingInput.sidecars ?? []),
  ];
  const keys = new Set<string>();
  if (objects.some((object) => keys.has(object.key) || !keys.add(object.key))) {
    throw new Error("The external provider staging record contains duplicate object keys.");
  }
  const staging = productionStagingRecordFor(
    effectiveStagingInput,
    output,
    objects,
  );
  await putProductionStagedObject(
    input,
    productionStagedObjectFor(
      `${operationKey}:staging`,
      staging.bytes,
      "application/json",
      PRODUCTION_ADAPTER_MAX_STAGING_BYTES,
    ),
    `affiliate-agent-${operationKey}-staging.json`,
  );
  for (const object of objects) {
    await putProductionStagedObject(
      input,
      object,
      `affiliate-agent-${operationKey}-${object.key.split(":").pop() ?? "artifact"}`,
    );
  }
  await putProductionStagedObject(
    input,
    productionStagedObjectFor(
      operationKey,
      Buffer.from(serializedOutput, "utf8"),
      "application/json",
    ),
    `affiliate-agent-${operationKey}-receipt.json`,
  );
  return JSON.parse(serializedOutput) as Readonly<Record<string, unknown>>;
};

const RECOVERED_OUTPUT_STRING_FIELDS = ["artifactId", "evidenceRef", "mimeType"] as const;
const RECOVERED_OUTPUT_ALLOWED_KEYS: Readonly<Record<string, true>> = {
  artifactId: true,
  byteSize: true,
  captureMetadata: true,
  evidenceRef: true,
  mimeType: true,
  sha256: true,
};

const recoveredOutputHasAllowedKeys = (
  output: Record<string, unknown>,
): boolean => Object.keys(output).every(
  (key) => RECOVERED_OUTPUT_ALLOWED_KEYS[key] === true,
);

const recoveredOutputHasRequiredStrings = (
  output: Record<string, unknown>,
): boolean => RECOVERED_OUTPUT_STRING_FIELDS.every(
  (field) => productionString(output[field]),
);

const recoveredOutputHasValidDigest = (
  output: Record<string, unknown>,
): boolean => {
  const sha256 = productionString(output.sha256);
  return sha256 !== null && /^[a-f0-9]{64}$/.test(sha256);
};

const recoveredOutputHasValidSize = (
  output: Record<string, unknown>,
): boolean => {
  const byteSize = output.byteSize;
  return typeof byteSize === "number"
    && Number.isSafeInteger(byteSize)
    && byteSize >= 0
    && byteSize <= PRODUCTION_ADAPTER_MAX_ARTIFACT_BYTES;
};

const recoveredOutputIsCanonical = (
  output: Record<string, unknown>,
): boolean => {
  try {
    const captureMetadata = output.captureMetadata === undefined
      ? undefined
      : parseAffiliateAgentCaptureMetadata(output.captureMetadata);
    const canonical = canonicalizeAffiliateAgentValue({
      ...output,
      ...(captureMetadata === undefined ? {} : { captureMetadata }),
    });
    return Buffer.byteLength(canonical, "utf8") <= PRODUCTION_ADAPTER_MAX_SAFE_OUTPUT_BYTES;
  } catch {
    return false;
  }
};

const isRecoveredProductionOutput = (
  output: Record<string, unknown>,
): boolean => [
  recoveredOutputHasAllowedKeys(output),
  recoveredOutputHasRequiredStrings(output),
  recoveredOutputHasValidDigest(output),
  recoveredOutputHasValidSize(output),
  recoveredOutputIsCanonical(output),
].every(Boolean);
const STORAGE_NOT_FOUND_ERROR_NAMES: Readonly<Record<string, true>> = {
  ENOENT: true,
  FILE_MISSING: true,
  NoSuchKey: true,
  NoSuchObject: true,
  NotFound: true,
};

type StorageErrorDetails = Readonly<{
  code?: unknown;
  name?: unknown;
  statusCode?: unknown;
  $metadata?: { httpStatusCode?: unknown };
}>;

const storageErrorDetails = (error: unknown): StorageErrorDetails | null => (
  error !== null && typeof error === "object"
    ? error as StorageErrorDetails
    : null
);

const storageErrorHasNotFoundIdentity = (
  details: StorageErrorDetails,
): boolean => (
  (typeof details.code === "string"
    && STORAGE_NOT_FOUND_ERROR_NAMES[details.code] === true)
  || (typeof details.name === "string"
    && STORAGE_NOT_FOUND_ERROR_NAMES[details.name] === true)
);

const storageErrorHasNotFoundStatus = (
  details: StorageErrorDetails,
): boolean => (
  details.statusCode === 404
  || details.$metadata?.httpStatusCode === 404
);

const isDefinitiveStorageNotFound = (error: unknown): boolean => {
  if (error instanceof Error && error.message === "FILE_MISSING") return true;
  const details = storageErrorDetails(error);
  return details !== null
    && (storageErrorHasNotFoundIdentity(details) || storageErrorHasNotFoundStatus(details));
};

const readProductionObjectBytes = async (
  input: ProductionAdapterInput,
  key: string,
  maximumBytes: number,
  expectedMimeType: string,
): Promise<Buffer | null> => {
  const normalizedExpectedMimeType = expectedMimeType.trim().toLowerCase();
  if (!normalizedExpectedMimeType) {
    throw new Error("The expected external provider MIME type is invalid.");
  }
  let stored: StorageGetResult;
  try {
    stored = await input.storage.getObjectStream({ key });
  } catch (error) {
    if (isDefinitiveStorageNotFound(error)) return null;
    throw error;
  }
  const storedMimeType = stored.contentType?.trim().toLowerCase();
  if (storedMimeType && storedMimeType !== normalizedExpectedMimeType) {
    throw new Error("The stored external provider output failed its size or MIME check.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stored.stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBytes) {
      throw new Error("The external provider output exceeds the storage read limit.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

const parseProductionStagingJson = (bytes: Buffer): Record<string, unknown> | null => {
  if (bytes.byteLength > PRODUCTION_ADAPTER_MAX_STAGING_BYTES) return null;
  const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
};

type ProductionStagingCommandType = ProductionExternalStagingInput["commandType"];

const productionStagingCommandType = (
  value: unknown,
): ProductionStagingCommandType | null => {
  if (value === "CAPTURE_CLAIM_URL") return value;
  if (value === "RUN_DISCOVERY_QUERY") return value;
  return null;
};

type ProductionStagedObjectMetadata = Readonly<{
  key: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  dataBase64: string;
}>;

const parseProductionStagedObjectByteSize = (value: unknown): number | null => {
  if (typeof value !== "number") return null;
  if (!Number.isSafeInteger(value)) return null;
  if (value < 0) return null;
  return value;
};

const parseProductionStagedObjectSha256 = (value: unknown): string | null => {
  const sha256 = productionString(value);
  if (!sha256 || !/^[a-f0-9]{64}$/.test(sha256)) return null;
  return sha256;
};

const parseProductionStagedObjectMetadata = (
  value: unknown,
): ProductionStagedObjectMetadata | null => {
  const object = productionRecord(value);
  const key = productionString(object.key);
  const mimeType = productionString(object.mimeType);
  const byteSize = parseProductionStagedObjectByteSize(object.byteSize);
  const sha256 = parseProductionStagedObjectSha256(object.sha256);
  const dataBase64 = typeof object.dataBase64 === "string"
    ? object.dataBase64
    : null;
  if (
    !key
    || !mimeType
    || byteSize === null
    || !sha256
    || dataBase64 === null
    || (dataBase64 === "" && byteSize !== 0)
  ) return null;
  return { key, mimeType, byteSize, sha256, dataBase64 };
};

const isProductionStagedObjectDataValid = (
  metadata: ProductionStagedObjectMetadata,
  data: Buffer,
): boolean => (
  data.toString("base64") === metadata.dataBase64
  && data.byteLength === metadata.byteSize
  && createHash("sha256").update(data).digest("hex") === metadata.sha256
);

const parseProductionStagedObjectData = (
  metadata: ProductionStagedObjectMetadata,
): Buffer | null => {
  const data = Buffer.from(metadata.dataBase64, "base64");
  return isProductionStagedObjectDataValid(metadata, data) ? data : null;
};

const maximumBytesForProductionStagedObject = (mimeType: string): number => (
  mimeType.trim().toLowerCase().startsWith("image/")
    ? PRODUCTION_ADAPTER_MAX_SCREENSHOT_BYTES
    : PRODUCTION_ADAPTER_MAX_ARTIFACT_BYTES
);

const parseProductionStagedObject = (
  value: unknown,
  objectKeys: Set<string>,
): ProductionStagedObject | null => {
  const metadata = parseProductionStagedObjectMetadata(value);
  if (!metadata || objectKeys.has(metadata.key)) return null;
  const data = parseProductionStagedObjectData(metadata);
  if (!data || data.byteLength > maximumBytesForProductionStagedObject(metadata.mimeType)) {
    return null;
  }
  objectKeys.add(metadata.key);
  return { key: metadata.key, mimeType: metadata.mimeType, bytes: data };
};

const parseProductionStagedObjects = (
  value: unknown,
): ProductionStagedObject[] | null => {
  if (!Array.isArray(value)) return null;
  const objects: ProductionStagedObject[] = [];
  const objectKeys = new Set<string>();
  for (const objectValue of value) {
    const object = parseProductionStagedObject(objectValue, objectKeys);
    if (!object) return null;
    objects.push(object);
  }
  return objects;
};
const screenshotSummaryMatchesSidecar = (
  summaryValue: unknown,
  sidecar: ProductionStagedObject,
): boolean => {
  const summary = productionRecord(summaryValue);
  const sourceUrl = productionString(summary.sourceUrl);
  const mimeType = productionString(summary.mimeType);
  const statusCode = summary.statusCode;
  if (!sourceUrl || !mimeType) return false;
  if (
    typeof statusCode !== "number"
    || !Number.isInteger(statusCode)
    || statusCode < 200
    || statusCode >= 300
  ) {
    return false;
  }
  if (summary.byteSize !== sidecar.bytes.byteLength) return false;
  if (summary.sha256 !== createHash("sha256").update(sidecar.bytes).digest("hex")) {
    return false;
  }
  return mimeType === sidecar.mimeType;
};

const productionCaptureScreenshotEvidenceMatchesSidecar = (
  operationKey: string,
  output: Readonly<Record<string, unknown>>,
  objects: readonly ProductionStagedObject[],
): boolean => {
  const captureMetadata = productionRecord(output.captureMetadata);
  const providerArtifacts = productionRecord(captureMetadata.providerArtifacts);
  const screenshotSummary = providerArtifacts.screenshotEvidence;
  const screenshotSidecar = objects.find((object) => object.key === `${operationKey}:screenshot`);
  if (screenshotSummary === undefined || screenshotSummary === null) {
    return screenshotSidecar === undefined;
  }
  return screenshotSidecar !== undefined
    && screenshotSummaryMatchesSidecar(screenshotSummary, screenshotSidecar);
};
const productionStagingLineageMatchesOutput = (
  lineage: Readonly<Record<string, unknown>>,
  expectedOperationKey: string,
  output: Readonly<Record<string, unknown>>,
): boolean => [
  productionString(lineage.operationKey) === expectedOperationKey,
  productionString(lineage.evidenceRef) === productionString(output.evidenceRef),
  productionString(lineage.artifactId) === productionString(output.artifactId),
  productionString(lineage.sha256) === productionString(output.sha256),
].every(Boolean);

const productionStagingPrimaryObjectMatchesOutput = (
  operationKey: string,
  output: Readonly<Record<string, unknown>>,
  objects: readonly ProductionStagedObject[],
): boolean => {
  const primary = objects.find((object) => object.key === `${operationKey}:artifact`);
  const artifactId = productionString(output.artifactId);
  const mimeType = productionString(output.mimeType);
  const sha256 = productionString(output.sha256);
  return primary !== undefined
    && artifactId === primary.key
    && mimeType === primary.mimeType
    && output.byteSize === primary.bytes.byteLength
    && sha256 === createHash("sha256").update(primary.bytes).digest("hex");
};

const productionStagingBindingMatchesRequest = (
  record: Readonly<Record<string, unknown>>,
  expectedOperationKey: string,
  expectedCommandType: ProductionExternalStagingInput["commandType"],
  output: Readonly<Record<string, unknown>>,
  objects: readonly ProductionStagedObject[],
): boolean => record.commandType === expectedCommandType
  && productionStagingLineageMatchesOutput(
    productionRecord(record.lineage),
    expectedOperationKey,
    output,
  )
  && productionStagingPrimaryObjectMatchesOutput(expectedOperationKey, output, objects);

type NormalizedProductionStagingRecord = Readonly<{
  record: ProductionExternalStagingRecord;
  operationKey: string;
  output: Readonly<Record<string, unknown>>;
  objects: ProductionStagedObject[];
}>;

type ProductionStagingRecordParts = Readonly<{
  commandType: ProductionStagingCommandType;
  output: Readonly<Record<string, unknown>>;
  lineage: Readonly<Record<string, unknown>>;
  operationKey: string;
  objects: ProductionStagedObject[];
}>;

const productionStagingRecordParts = (
  record: Record<string, unknown>,
): ProductionStagingRecordParts | null => {
  const commandType = productionStagingCommandType(record.commandType);
  if (!commandType) return null;
  const output = productionRecord(record.output);
  if (!isRecoveredProductionOutput(output)) return null;
  if (!record.lineage || typeof record.lineage !== "object" || Array.isArray(record.lineage)) {
    return null;
  }
  const lineage = productionRecord(record.lineage);
  const operationKey = productionString(lineage.operationKey);
  if (!operationKey) return null;
  const objects = parseProductionStagedObjects(record.objects);
  if (!objects) return null;
  return { commandType, output, lineage, operationKey, objects };
};

const normalizeProductionStagingRecord = (
  record: Record<string, unknown>,
  expectedOperationKey: string,
  expectedCommandType: ProductionExternalStagingInput["commandType"],
): NormalizedProductionStagingRecord | null => {
  const parts = productionStagingRecordParts(record);
  if (!parts) return null;
  if (
    !productionStagingBindingMatchesRequest(
      { ...record, commandType: parts.commandType, lineage: parts.lineage },
      expectedOperationKey,
      expectedCommandType,
      parts.output,
      parts.objects,
    )
  ) {
    return null;
  }
  const normalizedRecord = {
    schemaVersion: 1 as const,
    commandType: parts.commandType,
    output: parts.output,
    lineage: parts.lineage,
    objects: record.objects as ProductionExternalStagingRecord["objects"],
  };
  if (
    canonicalizeAffiliateAgentValue(normalizedRecord)
    !== canonicalizeAffiliateAgentValue(record)
  ) {
    return null;
  }
  if (!productionCaptureScreenshotEvidenceMatchesSidecar(
    parts.operationKey,
    parts.output,
    parts.objects,
  )) {
    return null;
  }
  return {
    record: normalizedRecord,
    operationKey: parts.operationKey,
    output: parts.output,
    objects: parts.objects,
  };
};


const parseProductionStagingRecord = (
  bytes: Buffer,
  expectedOperationKey: string,
  expectedCommandType: ProductionExternalStagingInput["commandType"],
): {
  record: ProductionExternalStagingRecord;
  objects: ProductionStagedObject[];
} | null => {
  try {
    const record = parseProductionStagingJson(bytes);
    if (!record) return null;
    const normalized = normalizeProductionStagingRecord(
      record,
      expectedOperationKey,
      expectedCommandType,
    );
    if (!normalized) return null;
    return {
      record: normalized.record,
      objects: normalized.objects,
    };
  } catch {
    return null;
  }
};

const recoverProductionStagingRecord = async (
  input: ProductionAdapterInput,
  operationKey: string,
  parsed: {
    record: ProductionExternalStagingRecord;
    objects: ProductionStagedObject[];
  },
): Promise<Readonly<Record<string, unknown>>> => {
  for (const object of parsed.objects) {
    const existing = await readProductionObjectBytes(
      input,
      object.key,
      object.bytes.byteLength,
      object.mimeType,
    );
    if (existing !== null) {
      if (
        existing.byteLength !== object.bytes.byteLength
        || createHash("sha256").update(existing).digest("hex")
          !== createHash("sha256").update(object.bytes).digest("hex")
      ) {
        throw new Error("The staged external provider output changed during recovery.");
      }
      continue;
    }
    await putProductionStagedObject(input, object, `affiliate-agent-${operationKey}-recovery`);
  }
  const serializedOutput = canonicalizeAffiliateAgentValue(parsed.record.output);
  await putProductionStagedObject(
    input,
    productionStagedObjectFor(
      operationKey,
      Buffer.from(serializedOutput, "utf8"),
      "application/json",
    ),
    `affiliate-agent-${operationKey}-receipt.json`,
  );
  return JSON.parse(serializedOutput) as Readonly<Record<string, unknown>>;
};

const recoverProductionExternalOutput = async (
  input: ProductionAdapterInput,
  operationKey: string,
  expectedCommandType: ProductionExternalStagingInput["commandType"],
): Promise<Readonly<Record<string, unknown>> | null> => {
  const stagingBytes = await readProductionObjectBytes(
    input,
    `${operationKey}:staging`,
    PRODUCTION_ADAPTER_MAX_STAGING_BYTES,
    "application/json",
  );
  if (stagingBytes !== null) {
    const parsedStaging = parseProductionStagingRecord(
      stagingBytes,
      operationKey,
      expectedCommandType,
    );
    if (!parsedStaging) {
      throw new Error("The staged external provider output is invalid.");
    }
    return recoverProductionStagingRecord(input, operationKey, parsedStaging);
  }
  const receiptBytes = await readProductionObjectBytes(
    input,
    operationKey,
    PRODUCTION_ADAPTER_MAX_ARTIFACT_BYTES,
    "application/json",
  );
  if (receiptBytes === null) return null;
  try {
    const output = productionRecord(JSON.parse(receiptBytes.toString("utf8")));
    if (!isRecoveredProductionOutput(output)) {
      throw new Error("The recovered external output is invalid.");
    }
    const captureMetadata = output.captureMetadata === undefined
      ? undefined
      : parseAffiliateAgentCaptureMetadata(output.captureMetadata);
    const canonical = canonicalizeAffiliateAgentValue({
      ...output,
      ...(captureMetadata === undefined ? {} : { captureMetadata }),
    });
    return JSON.parse(canonical) as Readonly<Record<string, unknown>>;
  } catch {
    return null;
  }
};


const productionIsoTimestamp = (value: unknown): string | null => (
  value instanceof Date ? value.toISOString() : productionString(value)
);

const productionListingKindFor = (value: unknown): AffiliateListingKind => {
  const kind = productionString(value)?.toUpperCase();
  if (kind === "EVENT" || kind === "RENTAL" || kind === "TEAM" || kind === "CLUB") {
    return kind;
  }
  throw new Error("The approved mapping contains an unsupported candidate kind.");
};

const productionApprovalCandidateFor = (
  value: unknown,
): Readonly<Record<string, unknown>> => {
  const row = productionRecord(value);
  return {
    id: productionString(row.id),
    status: productionString(row.status),
    listingKind: productionListingKindFor(row.listingKind),
    title: productionString(row.title),
    officialActionUrl: productionString(row.officialActionUrl),
    sourceUrl: productionString(row.sourceUrl),
    startsAt: productionIsoTimestamp(row.startsAt),
    endsAt: productionIsoTimestamp(row.endsAt),
    dateDisplayMode: productionString(row.dateDisplayMode),
    city: productionString(row.city),
    venueName: productionString(row.venueName),
    address: productionString(row.address),
    priceText: productionString(row.priceText),
  };
};

const productionApprovalTargetFor = (
  value: unknown,
): Readonly<Record<string, unknown>> => {
  const row = productionRecord(value);
  return {
    id: productionString(row.id),
    candidateId: productionString(row.candidateId),
    targetType: productionString(row.targetType),
    targetId: productionString(row.targetId),
    sourceProfile: productionString(row.sourceProfile),
    marketKey: productionString(row.marketKey),
    status: productionString(row.status),
    evidenceRefs: Array.isArray(row.evidenceRefs)
      ? row.evidenceRefs.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
};

const enqueueProductionApprovalActivation = async (
  input: ProductionAdapterInput,
  effectInput: AffiliateAgentTerminalEffectAdapterInput,
  result: AffiliateAgentReviewerTerminalResult,
  sourceId: string,
  lifecycleGeneration: number,
): Promise<Readonly<{
  activationJobId: string;
  baselineHash: string;
  candidateCount: number;
  evidenceRef: string;
}>> => {
  if (effectInput.claim.subject.type !== "SUPPLY_REVIEWER") {
    throw new Error("Approved lifecycle follow-up requires Supply Reviewer lineage.");
  }
  const producerClaimId = effectInput.claim.subject.producerClaimId;
  const packageHash = productionString(productionRecord(result.payload).committedPackageHash);
  if (!packageHash) {
    throw new Error("Approved lifecycle follow-up requires a committed package hash.");
  }
  if (typeof input.prisma.$transaction !== "function") {
    throw new Error("Approved lifecycle follow-up requires a database transaction.");
  }
  const now = input.clock?.now() ?? new Date();
  const claimedAt = new Date(effectInput.claim.claimedAt);
  const approvedAt = Number.isNaN(claimedAt.getTime()) ? now : claimedAt;
  return input.prisma.$transaction(async (transaction) => {
    const root = await transaction.affiliateSupplySources.findUnique({
      where: { id: sourceId },
    });
    if (!root) throw new Error("Approved lifecycle follow-up Supply Source root was not found.");
    const source = root.liveSourceId
      ? await transaction.affiliateScrapeSources.findUnique({
        where: { id: root.liveSourceId },
      })
      : await transaction.affiliateScrapeSources.findFirst({
        where: { supplySourceId: sourceId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
    if (!source) throw new Error("Approved lifecycle follow-up source was not found.");
    const mappingId = productionString(source.activeMappingId);
    if (!mappingId) {
      throw new Error("Approved lifecycle follow-up requires the active mapping package.");
    }
    const mapping = await transaction.affiliateScrapeMappings.findUnique({
      where: { id: mappingId },
    });
    if (!mapping) {
      throw new Error("Approved lifecycle follow-up requires the exact mapping package.");
    }
    const candidateRows = await transaction.affiliateImportCandidates.findMany({
      where: {
        mappingId,
        OR: [{ supplySourceId: sourceId }, { sourceId: source.id }],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const targetRows = await transaction.affiliateSupplyTargets.findMany({
      where: { supplySourceId: sourceId },
      orderBy: [{ targetType: "asc" }, { targetId: "asc" }, { id: "asc" }],
    });
    const baselineCandidates = candidateRows.map((row) => ({
      listingKind: productionListingKindFor(row.listingKind),
      title: row.title,
      officialActionUrl: row.officialActionUrl,
      sourceUrl: row.sourceUrl,
      startsAt: productionIsoTimestamp(row.startsAt),
      dateDisplayMode: productionString(row.dateDisplayMode),
      city: productionString(row.city),
      venueName: productionString(row.venueName),
      address: productionString(row.address),
      priceText: productionString(row.priceText),
    }));
    const baseline = buildAffiliateAutomationBaseline({
      mappingId: mapping.id,
      mappingVersion: mapping.version,
      approvedAt,
      candidates: baselineCandidates,
      rejectedCount: candidateRows.filter(
        (row) => String(row.status).toUpperCase() === "REJECTED",
      ).length,
    });
    const candidateEvidence = candidateRows.map((row) =>
      productionApprovalCandidateFor(row));
    const targetEvidence = targetRows.map((row) =>
      productionApprovalTargetFor(row));
    const reviewEvidenceRefs = Array.from(new Set([
      ...result.evidenceRefs,
      "gateway-approval-evidence",
    ]));
    const approvalEvidence = {
      schemaVersion: 1,
      packageHash,
      approvedAt: approvedAt.toISOString(),
      mapping: { id: mapping.id, version: mapping.version },
      candidateEvidence: {
        candidateCount: candidateEvidence.length,
        candidates: candidateEvidence,
      },
      baselineEvidence: baseline,
      reviewEvidence: {
        claimId: result.claimId,
        claimGeneration: result.claimGeneration,
        reviewerWorkerId: effectInput.claim.workerId,
        evidenceRefs: reviewEvidenceRefs,
        targets: targetEvidence,
      },
    };
    const approvalBytes = productionJsonBuffer(
      approvalEvidence,
      "The approved mapping candidate and baseline evidence",
    );
    const approvalArtifact = productionApprovalArtifactFor(
      effectInput.claim,
      approvalBytes,
      producerClaimId,
    );
    await persistProductionClaimArtifact(
      input,
      transaction,
      effectInput.claim,
      approvalArtifact,
      approvalBytes,
    );
    await transaction.affiliateScrapeSources.update({
      where: { id: source.id },
      data: {
        metadata: productionJson({
          ...productionRecord(source.metadata),
          automationBaseline: baseline,
        }),
      },
    });
    const activationEntries = [
      ...effectInput.claim.evidenceManifest.entries.filter(
        (entry) => entry.kind !== "DURABLE_EVIDENCE",
      ),
      {
        evidenceRef: approvalArtifact.evidenceRef,
        kind: "DURABLE_EVIDENCE" as const,
        artifactId: approvalArtifact.sourceArtifactId,
        sha256: approvalArtifact.sha256,
        mimeType: approvalArtifact.mimeType,
        byteSize: approvalArtifact.byteSize,
        retention: "INDEFINITE" as const,
      },
    ].sort((left, right) => left.evidenceRef.localeCompare(right.evidenceRef));
    const activationManifestPreimage = {
      schemaVersion: 1 as const,
      entries: activationEntries,
    };
    const activationManifest: AffiliateAgentEvidenceManifest =
      affiliateAgentEvidenceManifestSchema.parse({
        ...activationManifestPreimage,
        hash: hashAffiliateAgentValue(activationManifestPreimage),
      });
    const activationDedupeKey = [
      "mapping-activation",
      producerClaimId,
      packageHash,
    ].join(":");
    const activationJob = await transaction.affiliateAgentGatewayJobs.upsert({
      where: { dedupeKey: activationDedupeKey },
      create: {
        id: `agw-job-${randomUUID()}`,
        dedupeKey: activationDedupeKey,
        queue: "AFFILIATE_REVIEW",
        lane: "SUPPLY_REVIEW",
        role: "SUPPLY_REVIEWER",
        subjectType: "SUPPLY_REVIEWER",
        subjectId: sourceId,
        parentClaimId: producerClaimId,
        subjectJson: productionJson(effectInput.claim.subject),
        evidenceManifestJson: productionJson(activationManifest),
        supplySourceId: sourceId,
        expectedLifecycleGeneration: lifecycleGeneration,
        status: "QUEUED",
        priority: 0,
        nextAttemptAt: now,
        claimGeneration: 0,
      },
      update: {},
    });
    return {
      activationJobId: activationJob.id,
      baselineHash: baseline.normalizedFieldsHash,
      candidateCount: candidateEvidence.length,
      evidenceRef: approvalArtifact.evidenceRef,
    };
  });
};

const productionLifecycleActivationTargetWriter = (
  input: ProductionAdapterInput,
  command: AffiliateSupplyLifecycleCommand,
  effectInput: AffiliateAgentTerminalEffectAdapterInput,
  result: AffiliateAgentReviewerTerminalResult,
) => command === "ACTIVATE"
  ? input.activationTargetWriter?.({
    claim: effectInput.claim,
    result,
  })
  : undefined;

const productionLifecycleRequest = (
  payload: Record<string, unknown>,
  effectInput: AffiliateAgentTerminalEffectAdapterInput,
  result: AffiliateAgentReviewerTerminalResult,
  sourceId: string,
  requestFor: (
    value: Record<string, unknown>,
    effectInput: AffiliateAgentTerminalEffectAdapterInput,
  ) => Record<string, unknown>,
): Record<string, unknown> => ({
  ...requestFor(payload, effectInput),
  commandRef: effectInput.receiptId,
  sourceId,
  evidenceRefs: result.evidenceRefs,
  reviewerClaimId: result.claimId,
  reviewerClaimGeneration: result.claimGeneration,
  reviewerInvocationId: result.invocationId,
  reviewerSupplySourceId: sourceId,
  reviewerWorkerId: effectInput.claim.workerId,
});
const assertLegacySportRepairApprovalFresh = async (
  input: ProductionAdapterInput,
  effectInput: AffiliateAgentTerminalEffectAdapterInput,
  result: AffiliateAgentReviewerTerminalResult,
  transaction: Prisma.TransactionClient,
): Promise<void> => {
  const reviewerSubject = effectInput.claim.subject;
  if (
    reviewerSubject.type !== "SUPPLY_REVIEWER"
    || reviewerSubject.repairContext?.kind !== "LEGACY_SPORT_REPAIR"
  ) return;
  const producerClaimRow = await transaction.affiliateAgentGatewayClaims.findUnique({
    where: { id: reviewerSubject.producerClaimId },
  });
  if (!producerClaimRow) {
    throw legacySportRepairEvidenceError("The producer claim for this legacy sport repair was not found.");
  }
  if (
    hashAffiliateAgentValue(producerClaimRow.claimEnvelopeJson) !== producerClaimRow.claimEnvelopeHash
    || producerClaimRow.id !== reviewerSubject.producerClaimId
  ) {
    throw legacySportRepairEvidenceError("The producer claim envelope is not bound to its persisted hash.");
  }
  const producerEnvelope = parseAffiliateAgentProducerClaimEnvelopeForHistoricalRead(
    producerClaimRow.claimEnvelopeJson,
  );
  if (!producerEnvelope || producerEnvelope.role !== "MAPPING_PRODUCER") {
    throw legacySportRepairEvidenceError("The producer claim envelope is invalid.");
  }
  if (
    producerClaimRow.role !== producerEnvelope.role
    || producerClaimRow.claimGeneration !== producerEnvelope.claimGeneration
    || producerClaimRow.workerId !== producerEnvelope.workerId
    || producerClaimRow.invocationId !== producerEnvelope.invocationId
  ) {
    throw legacySportRepairEvidenceError("The producer claim row is not bound to its claim envelope.");
  }
  assertProductionProducerRepairEnvelope(producerEnvelope, reviewerSubject);
  const committedPackageEntry = effectInput.claim.evidenceManifest.entries.find(
    (entry) => entry.kind === "COMMITTED_PACKAGE",
  );
  if (!committedPackageEntry) {
    throw legacySportRepairEvidenceError("The reviewer claim has no committed package artifact.");
  }
  const committedPackageArtifact = await productionEvidenceArtifact(input, effectInput.claim, committedPackageEntry.evidenceRef);
  const committedPackage = affiliateAgentDeclarativePackageSchema.parse(
    productionExternalJson(Buffer.from(committedPackageArtifact.bytes).toString("utf8"), "The committed mapping package"),
  );
  const committedPackageHash = productionString(productionRecord(result.payload).committedPackageHash)
    ?? reviewerSubject.committedPackageHash;
  if (productionHash(committedPackage) !== committedPackageHash) {
    throw legacySportRepairEvidenceError("The committed mapping package changed after producer commit.");
  }
  const listEvidence = await productionListingEvidence(input, producerEnvelope, committedPackage.listUrlRef);
  const extraction = extractProductionValidationCandidates(committedPackage, producerEnvelope, listEvidence);
  if (!committedPackage.sportEvidence) {
    throw legacySportRepairEvidenceError("Legacy sport repair packages require sportEvidence.");
  }
  await verifyAffiliateAgentLegacySportRepair({
    prisma: transaction,
    artifacts: input.artifacts,
    claim: producerEnvelope,
    sportEvidence: committedPackage.sportEvidence,
    resultKind: "REVIEW_REQUIRED",
    observedSportNames: extraction.observedSportNames,
  });
};


const productionLifecycleApprovalFollowUp = async (
  input: ProductionAdapterInput,
  command: AffiliateSupplyLifecycleCommand,
  effectInput: AffiliateAgentTerminalEffectAdapterInput,
  result: AffiliateAgentReviewerTerminalResult,
  sourceId: string,
  lifecycleGeneration: number,
): Promise<Readonly<Record<string, unknown>> | null> => {
  if (command !== "APPROVE") return null;
  if (
    effectInput.claim.subject.type === "SUPPLY_REVIEWER"
    && effectInput.claim.subject.repairContext?.kind === "LEGACY_SPORT_REPAIR"
  ) {
    return {
      activationHeld: true,
      holdReason: "LEGACY_SPORT_REPAIR",
    };
  }
  return enqueueProductionApprovalActivation(
    input,
    effectInput,
    result,
    sourceId,
    lifecycleGeneration,
  );
};

const productionLifecycleEffect = (
  input: ProductionAdapterInput,
  command: AffiliateSupplyLifecycleCommand,
  requestFor: (
    value: Record<string, unknown>,
    effectInput: AffiliateAgentTerminalEffectAdapterInput,
  ) => Record<string, unknown>,
) => async (effectInput: AffiliateAgentTerminalEffectAdapterInput) => {
  const result = effectInput.result as AffiliateAgentReviewerTerminalResult;
  const payload = productionRecord(result.payload);
  const isLegacyRepair = effectInput.claim.subject.type === "SUPPLY_REVIEWER"
    && effectInput.claim.subject.repairContext?.kind === "LEGACY_SPORT_REPAIR";
  if (command === "ACTIVATE" && isLegacyRepair) {
    throw legacySportRepairEvidenceError("Legacy sport repair cannot activate or publish.");
  }
  const sourceId = productionString(effectInput.claim.supplySourceId)
    ?? productionString(payload.supplySourceId);
  if (!sourceId) throw new Error("Supply Reviewer terminal effect has no Supply Source.");
  const execute = async (database: PrismaClient | Prisma.TransactionClient) => {
    const source = await database.affiliateSupplySources.findUnique({ where: { id: sourceId } });
    if (!source) throw new Error(`Affiliate Supply Source ${sourceId} was not found.`);
    const activationTargetWriter = productionLifecycleActivationTargetWriter(input, command, effectInput, result);
    const lifecycleResult = await executeAffiliateSupplyLifecycleCommand({
      supplySourceId: sourceId,
      command,
      authority: "SUPPLY_REVIEWER",
      expectedLifecycleGeneration: effectInput.claim.lifecycleGeneration ?? source.lifecycleGeneration,
      idempotencyKey: effectInput.receiptId,
      request: productionLifecycleRequest(payload, effectInput, result, sourceId, requestFor),
      actorKind: "SUPPLY_REVIEWER",
      actorId: effectInput.claim.workerId,
      executingAgentId: result.invocationId,
      supplyContractVersion: result.supplyContractVersion,
      supplyContractHash: result.supplyContractHash,
      db: affiliateSupplyDatabase(database),
      activationTargetWriter,
      now: input.clock?.now() ?? new Date(),
    });
    const approvalFollowUp = await productionLifecycleApprovalFollowUp(
      input, command, effectInput, result, sourceId, lifecycleResult.transition.generation,
    );
    return {
      command,
      lifecycleGeneration: lifecycleResult.transition.generation,
      receiptId: effectInput.receiptId,
      ...(approvalFollowUp ?? {}),
    };
  };
  if (command === "APPROVE" && isLegacyRepair) {
    return input.prisma.$transaction(async (transaction) => {
      await assertLegacySportRepairApprovalFresh(input, effectInput, result, transaction);
      return execute(transaction);
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 120_000 });
  }
  return execute(input.prisma);
};

const productionRepairEvidenceManifestFor = (
  producerEnvelope: ProducerClaimEnvelopeForRead,
  reviewerEnvelope: AffiliateAgentClaimEnvelope,
): AffiliateAgentEvidenceManifest => {
  const entriesByRef = new Map<string, AffiliateAgentEvidenceManifest["entries"][number]>();
  for (const entry of [
    ...producerEnvelope.evidenceManifest.entries,
    ...reviewerEnvelope.evidenceManifest.entries,
  ]) {
    const existing = entriesByRef.get(entry.evidenceRef);
    if (existing && canonicalizeAffiliateAgentValue(existing) !== canonicalizeAffiliateAgentValue(entry)) {
      throw new Error("Producer repair evidence contains conflicting references.");
    }
    entriesByRef.set(entry.evidenceRef, entry);
  }
  const preimage = {
    schemaVersion: 1 as const,
    entries: [...entriesByRef.values()].sort(
      (left, right) => left.evidenceRef.localeCompare(right.evidenceRef),
    ),
  };
  return affiliateAgentEvidenceManifestSchema.parse({
    ...preimage,
    hash: hashAffiliateAgentValue(preimage),
  });
};

type ProductionProducerRepairContext = Readonly<{
  reviewerSubject: Extract<
    AffiliateAgentClaimEnvelope["subject"],
    { type: "SUPPLY_REVIEWER" }
  >;
  producerEnvelope: ProducerClaimEnvelopeForRead,
  mappingJobId: string;
}>;

const assertProductionProducerRepairEnvelope = (
  producerEnvelope: ProducerClaimEnvelopeForRead,
  reviewerSubject: Extract<
    AffiliateAgentClaimEnvelope["subject"],
    { type: "SUPPLY_REVIEWER" }
  >,
): void => {
  if (producerEnvelope.role !== "MAPPING_PRODUCER") {
    throw new Error("The producer repair lineage is not bound to the reviewer claim.");
  }
  if (
    producerEnvelope.subject.type !== "MAPPING_PRODUCER"
    || producerEnvelope.subject.supplySourceId !== reviewerSubject.supplySourceId
    || producerEnvelope.claimId !== reviewerSubject.producerClaimId
    || producerEnvelope.workerId !== reviewerSubject.producerWorkerId
    || producerEnvelope.invocationId !== reviewerSubject.producerInvocationId
    || producerEnvelope.workspaceId !== reviewerSubject.producerWorkspaceId
  ) {
    throw new Error("The producer repair lineage is not bound to the reviewer claim.");
  }
  const producerContext = producerEnvelope.subject.repairContext;
  const reviewerContext = reviewerSubject.repairContext;
  if (
    (producerContext === undefined) !== (reviewerContext === undefined)
    || producerContext !== undefined
      && reviewerContext !== undefined
      && canonicalizeAffiliateAgentValue(producerContext)
        !== canonicalizeAffiliateAgentValue(reviewerContext)
  ) {
    throw new Error("The producer repair context is not bound to the reviewer claim.");
  }
};

const productionProducerRepairMappingIsValid = (
  mappingJob: { supplySourceId: string | null; sourceId: string | null } | null,
  supplySourceId: string,
  sourceId: string | null,
): sourceId is string => Boolean(
  mappingJob
  && mappingJob.supplySourceId === supplySourceId
  && sourceId,
);

const productionProducerRepairContext = async (
  input: ProductionAdapterInput,
  effectInput: AffiliateAgentTerminalEffectAdapterInput<"PRODUCER_REPAIR_REQUIRED">,
): Promise<ProductionProducerRepairContext> => {
  if (effectInput.claim.subject.type !== "SUPPLY_REVIEWER") {
    throw new Error("Producer repair effect requires Supply Reviewer lineage.");
  }
  const reviewerSubject = effectInput.claim.subject;
  const repairPass = reviewerSubject.reviewPass + 1;
  if (repairPass > 3) {
    throw new Error("The bounded producer repair budget is exhausted.");
  }
  const producerClaim = await input.prisma.affiliateAgentGatewayClaims.findUnique({
    where: { id: reviewerSubject.producerClaimId },
  });
  if (!producerClaim) {
    throw new Error("The producer claim for this repair was not found.");
  }
  if (
    hashAffiliateAgentValue(producerClaim.claimEnvelopeJson) !== producerClaim.claimEnvelopeHash
    || producerClaim.id !== reviewerSubject.producerClaimId
  ) {
    throw new Error("The producer claim envelope is not bound to its persisted hash.");
  }
  const producerEnvelope = parseAffiliateAgentProducerClaimEnvelopeForHistoricalRead(
    producerClaim.claimEnvelopeJson,
  );
  if (!producerEnvelope || producerEnvelope.role !== "MAPPING_PRODUCER") {
    throw new Error("The producer claim envelope is invalid.");
  }
  if (
    producerClaim.role !== producerEnvelope.role
    || producerClaim.claimGeneration !== producerEnvelope.claimGeneration
    || producerClaim.workerId !== producerEnvelope.workerId
    || producerClaim.invocationId !== producerEnvelope.invocationId
  ) {
    throw new Error("The producer claim row is not bound to its claim envelope.");
  }
  assertProductionProducerRepairEnvelope(producerEnvelope, reviewerSubject);
  const producerSubject = producerEnvelope.subject;
  const mappingJob = await input.prisma.affiliateSourceMappingJobs.findUnique({
    where: { id: producerSubject.mappingJobId },
  });
  const sourceId = productionString(mappingJob?.sourceId);
  if (!productionProducerRepairMappingIsValid(
    mappingJob,
    reviewerSubject.supplySourceId,
    sourceId,
  )) {
    throw new Error("The producer repair mapping lineage is incomplete.");
  }
  const source = await input.prisma.affiliateScrapeSources.findUnique({
    where: { id: sourceId },
  });
  if (!source || source.supplySourceId !== reviewerSubject.supplySourceId) {
    throw new Error("The producer repair source lineage is invalid.");
  }
  return {
    reviewerSubject: { ...reviewerSubject, reviewPass: repairPass },
    producerEnvelope,
    mappingJobId: producerSubject.mappingJobId,
  };
};
const enqueueProducerRepairJob = async (
  input: ProductionAdapterInput,
  effectInput: AffiliateAgentTerminalEffectAdapterInput<"PRODUCER_REPAIR_REQUIRED">,
  repairIssues: readonly string[],
  lifecycleGeneration: number,
): Promise<Readonly<{
  repairJobId: string;
  repairPass: number;
  lifecycleGeneration: number;
}> > => {
  const context = await productionProducerRepairContext(input, effectInput);
  const { reviewerSubject, producerEnvelope, mappingJobId } = context;
  const packageHash = productionString(
    productionRecord(effectInput.result.payload).committedPackageHash,
  ) ?? reviewerSubject.committedPackageHash;
  if (packageHash !== reviewerSubject.committedPackageHash) {
    throw new Error("The producer repair package hash is not bound to the reviewer claim.");
  }
  const repairEvidenceManifest = productionRepairEvidenceManifestFor(
    producerEnvelope,
    effectInput.claim,
  );
  const dedupeKey = [
    "mapping-repair",
    reviewerSubject.producerClaimId,
    packageHash,
    reviewerSubject.reviewPass,
  ].join(":");
  const repairSubject = {
    type: "MAPPING_PRODUCER" as const,
    supplySourceId: reviewerSubject.supplySourceId,
    mappingJobId,
    pass: reviewerSubject.reviewPass,
    ...(reviewerSubject.repairContext
      ? { repairContext: reviewerSubject.repairContext }
      : {}),
  };
  const repairJob = await input.prisma.affiliateAgentGatewayJobs.upsert({
    where: { dedupeKey },
    create: {
      id: `agw-job-${randomUUID()}`,
      dedupeKey,
      queue: "AFFILIATE_MAPPING",
      lane: "MAPPING_PRODUCTION",
      role: "MAPPING_PRODUCER",
      subjectType: "MAPPING_PRODUCER",
      subjectId: mappingJobId,
      subjectJson: repairSubject as unknown as Prisma.InputJsonValue,
      evidenceManifestJson: productionJson(repairEvidenceManifest),
      supplySourceId: reviewerSubject.supplySourceId,
      expectedLifecycleGeneration: lifecycleGeneration,
      status: "QUEUED",
      priority: 0,
      nextAttemptAt: input.clock?.now() ?? new Date(),
      claimGeneration: 0,
      parentClaimId: effectInput.claim.claimId,
    },
    update: {},
  });
  return {
    repairJobId: repairJob.id,
    repairPass: reviewerSubject.reviewPass,
    lifecycleGeneration,
  };
};


const productionProducerRepairEffect = (
  input: ProductionAdapterInput,
) => async (
  effectInput: AffiliateAgentTerminalEffectAdapterInput<"PRODUCER_REPAIR_REQUIRED">,
): Promise<Readonly<Record<string, unknown>>> => {
  const payload = productionRecord(effectInput.result.payload);
  const repairIssues = Array.isArray(payload.repairIssues)
    ? payload.repairIssues.filter((value): value is string => typeof value === "string")
    : [];
  if (effectInput.claim.subject.type !== "SUPPLY_REVIEWER" || repairIssues.length === 0) {
    throw new Error("Producer repair effect requires a producer claim and repair issues.");
  }
  const lifecycleResult = await productionLifecycleEffect(
    input,
    "RECONCILE",
    (requestPayload, effect) => ({
      reviewerOutcome: "PRODUCER_REPAIR_REQUIRED",
      producerClaimId: effect.claim.subject.type === "SUPPLY_REVIEWER"
        ? effect.claim.subject.producerClaimId
        : undefined,
      repairIssues: Array.isArray(requestPayload.repairIssues)
        ? requestPayload.repairIssues.filter((value): value is string => typeof value === "string")
        : [],
    }),
  )(effectInput);
  if (effectInput.claim.executionBudget === "SINGLE_CLAIM") {
    return { ...lifecycleResult, repairIssues, repairBudgetExhausted: true };
  }
  const repair = await enqueueProducerRepairJob(
    input,
    effectInput,
    repairIssues,
    lifecycleResult.lifecycleGeneration,
  );
  return {
    ...lifecycleResult,
    ...repair,
    repairIssues,
  };
};

const productionTerminalEffects = (
  input: ProductionAdapterInput,
): AffiliateAgentTerminalEffectAdapter => {
  const handler = <D extends AffiliateAgentReviewerTerminalDisposition>(
    execute: (effectInput: AffiliateAgentTerminalEffectAdapterInput<D>) => Promise<Readonly<Record<string, unknown>>>,
  ): AffiliateAgentTerminalEffectHandler<D> => ({ execute, recover: execute });
  return {
    APPROVED: handler(productionLifecycleEffect(input, "APPROVE", (payload) => ({
      mappingId: productionString(payload.mappingId) ?? undefined,
      packageHash: productionString(payload.committedPackageHash),
      lifecycleEvidenceKinds: ["REVIEWER_EVIDENCE"],
    }))),
    ACTIVATED: handler(productionLifecycleEffect(input, "ACTIVATE", (payload) => ({
      packageHash: productionString(payload.committedPackageHash),
      baselineHash: productionString(payload.baselineHash),
      candidateReviewId: productionString(payload.candidateReviewId),
    }))),
    PRODUCER_REPAIR_REQUIRED: handler(productionProducerRepairEffect(input)),
    REGRESSION_ASSESSED: handler(productionLifecycleEffect(
      input,
      "RECONCILE",
      (payload) => {
        const assessment = productionString(payload.assessment)?.toUpperCase();
        if (assessment !== "PASS" && assessment !== "FAIL") {
          throw new Error("Regression effect requires PASS or FAIL.");
        }
        return {
          reviewerOutcome: "REGRESSION_ASSESSED",
          supplySourceId: productionString(payload.supplySourceId),
          assessment,
          runId: productionString(payload.runId),
        };
      },
    )),
    SOURCE_EXCLUSION_ASSESSED: handler(productionLifecycleEffect(
      input,
      "RECONCILE",
      (payload) => {
        const recommendation = productionString(payload.recommendation)?.toUpperCase();
        if (!["EXCLUDE", "KEEP", "HUMAN_REVIEW"].includes(recommendation ?? "")) {
          throw new Error("Source exclusion effect requires EXCLUDE, KEEP, or HUMAN_REVIEW.");
        }
        return {
          reviewerOutcome: recommendation === "EXCLUDE"
            ? "SOURCE_EXCLUSION_EXCLUDE"
            : recommendation === "KEEP"
              ? "SOURCE_EXCLUSION_KEEP"
              : "SOURCE_EXCLUSION_HUMAN_REVIEW",
          supplySourceId: productionString(payload.supplySourceId),
          recommendation,
          caseReason: productionString(payload.caseReason),
        };
      },
    )),
    EXACT_TARGET_REJECTED: handler(productionLifecycleEffect(input, "REJECT_TARGET", (payload) => ({
      targetId: productionString(payload.targetId),
      targetType: productionString(payload.targetType),
    }))),
    HUMAN_REVIEW_REQUIRED: handler(productionLifecycleEffect(input, "RECONCILE", (payload) => ({
      reviewerOutcome: "HUMAN_REVIEW_REQUIRED",
      caseReason: productionString(payload.caseReason),
    }))),
  } as AffiliateAgentTerminalEffectAdapter;
};

type ProductionValidationCommand = Extract<
  AffiliateAgentCommand,
  Readonly<{ type: "VALIDATE_DECLARATIVE_PACKAGE" }>
>;

type ProductionCommitCommand = Extract<
  AffiliateAgentCommand,
  Readonly<{ type: "COMMIT_DECLARATIVE_PACKAGE" }>
>;
type ProductionMappingProducerClaim = Extract<
  AffiliateAgentClaimEnvelope,
  Readonly<{ role: "MAPPING_PRODUCER" }>
>;

const assertMappingProducerClaim: (
  claim: AffiliateAgentClaimEnvelope,
  message: string,
) => asserts claim is ProductionMappingProducerClaim = (claim, message) => {
  if (claim.role !== "MAPPING_PRODUCER") throw new Error(message);
};


type ProductionValidationExtraction = Readonly<{
  listUrl: string;
  candidates: readonly AffiliateCandidateInput[];
  candidateHash: string;
  observedSportNames: readonly string[];
}>;

type ProductionValidationEvidence = Readonly<{
  listEvidence: Readonly<{
    sourceUrl: string | null;
    finalUrl: string | null;
    text: string;
  }>;
  validatedPackageHash: string;
  evidenceRefs: readonly string[];
  evidenceKinds: readonly string[];
  validationOutput: Readonly<Record<string, unknown>>;
  validationMetadata: Readonly<Record<string, unknown>>;
}>;
const assertProductionMappingPackage: (
  claim: AffiliateAgentClaimEnvelope,
  candidatePackage: ProductionValidationCommand["data"]["candidatePackage"],
) => asserts claim is ProductionMappingProducerClaim = (claim, candidatePackage) => {
  assertMappingProducerClaim(
    claim,
    "Only a Mapping Producer may validate a declarative package.",
  );
  if (candidatePackage.supplySourceId !== claim.subject.supplySourceId) {
    throw packageValidationError("The package Supply Source does not match the claim.");
  }
  const fields = new Set(candidatePackage.fields.map((field) => field.field));
  if (!fields.has("title") || !fields.has("officialActionUrl")) {
    throw packageValidationError("The declarative package must map title and official action URL.");
  }
  if ((candidatePackage.listingKind === "EVENT" || candidatePackage.listingKind === "CLUB")
    && !fields.has("description")) {
    throw packageValidationError("EVENT and CLUB packages must map a source description.");
  }
  const constantSportValues = candidatePackage.fields
    .filter((field) => field.mode === "CONSTANT")
    .map((field) => field.value);
  const repairContext = claim.subject.repairContext;
  if (!repairContext && candidatePackage.sportEvidence) {
    throw packageValidationError("sportEvidence is permitted only for legacy sport repairs.");
  }
  if (!repairContext && constantSportValues.length > 0) {
    throw packageValidationError("CONSTANT sportName fields are permitted only for legacy sport repairs.");
  }
  if (repairContext) {
    const sportEvidence = candidatePackage.sportEvidence;
    if (!sportEvidence) {
      throw packageValidationError("Legacy sport repair packages require sportEvidence.");
    }
    if (sportEvidence.evidenceRunId !== repairContext.evidenceRunId) {
      throw packageValidationError("The package sport evidence run does not match the repair context.");
    }
    if (sportEvidence.sportsCatalogSha256.toLowerCase() !== repairContext.sportsCatalog.sha256.toLowerCase()) {
      throw packageValidationError("The package sport evidence catalog does not match the repair context.");
    }
    const resolvedNames = new Set(
      sportEvidence.sportDeterminations.flatMap((determination) => (
        determination.status === "RESOLVED" ? determination.canonicalSportNames : []
      )),
    );
    if (constantSportValues.some((sportName) => !resolvedNames.has(sportName))) {
      throw packageValidationError("A CONSTANT sportName field is not supported by sportEvidence.");
    }
    const packageEvidenceRefs = new Set(candidatePackage.evidenceRefs);
    for (const citation of sportEvidence.sportDeterminations.flatMap(
      (determination) => determination.evidence,
    )) {
      const manifestEntry = claim.evidenceManifest.entries.find(
        (entry) => entry.artifactId === citation.artifactId,
      );
      if (!manifestEntry || !packageEvidenceRefs.has(manifestEntry.evidenceRef)) {
        throw packageValidationError("Legacy sport citations must be included in package evidenceRefs.");
      }
    }
  }
};

const extractProductionValidationCandidates = (
  candidatePackage: ProductionValidationCommand["data"]["candidatePackage"],
  claim: ProducerClaimEnvelopeForRead,
  listEvidence: Readonly<{
    sourceUrl: string | null;
    finalUrl: string | null;
    text: string;
  }>,
): ProductionValidationExtraction => {
  const listUrl = productionUrlFromEvidence(listEvidence);
  const mapping = affiliateScrapeMappingSchema.parse({
    kind: candidatePackage.listingKind,
    listUrl,
    itemSelector: candidatePackage.itemSelector,
    fields: productionMappingFields(candidatePackage),
  });
  const page: ScrapedPage = {
    url: listUrl,
    finalUrl: listUrl,
    statusCode: 200,
    body: listEvidence.text,
    fetchedAt: claim.claimedAt,
  };
  let candidates: AffiliateCandidateInput[];
  try {
    candidates = extractAffiliateCandidatesFromPage(page, mapping);
  } catch {
    throw packageValidationError("The declarative package selectors are invalid.");
  }
  if (candidates.length === 0) {
    throw packageValidationError("The declarative package selectors produced no candidates.");
  }
  if (candidates.some((candidate) => (
    !candidate.title.trim() || !candidate.officialActionUrl.trim()
  ))) {
    throw packageValidationError("The declarative package output must include title and official action URL.");
  }
  if (candidatePackage.listingKind === "EVENT" || candidatePackage.listingKind === "CLUB") {
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      const issue = analyzeAffiliateDescriptionQuality({ kind: candidatePackage.listingKind === "CLUB" ? "ORGANIZATION" : "EVENT", name: candidate.title, description: candidate.description })[0];
      if (issue) {
        throw packageValidationError(`Candidate ${index + 1}: ${issue.code}. ${issue.message}`);
      }
    }
  }
  const observedSportNames = sortUniqueAffiliateSportNames(
    candidates.flatMap((candidate) => [
      ...(candidate.sportName ? [candidate.sportName] : []),
      ...(candidate.sportNames ?? []),
    ]),
  );
  const blacklistedSportName = observedSportNames.find(isAffiliateSportBlacklisted);
  if (blacklistedSportName) {
    throw packageValidationError(`SPORT_BLACKLISTED: ${blacklistedSportName} cannot be an executable sport.`);
  }
  return {
    listUrl,
    candidates,
    candidateHash: productionHash(candidates),
    observedSportNames,
  };
};

const productionEvidenceRefsForPackage = (
  candidatePackage: Record<string, unknown>,
): readonly string[] => {
  const listUrlRef = productionString(candidatePackage.listUrlRef);
  if (!listUrlRef) {
    throw new Error("The declarative package has no list URL evidence reference.");
  }
  const packageEvidenceRefs = Array.isArray(candidatePackage.evidenceRefs)
    ? candidatePackage.evidenceRefs.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  return Array.from(new Set([listUrlRef, ...packageEvidenceRefs]));
};

const prepareProductionValidation = async (
  input: ProductionAdapterInput,
  transaction: Prisma.TransactionClient,
  claim: AffiliateAgentClaimEnvelope,
  command: ProductionValidationCommand,
  receiptId: string,
): Promise<ProductionValidationEvidence> => {
  assertProductionMappingPackage(claim, command.data.candidatePackage);
  if (command.data.evidenceManifestHash !== claim.evidenceManifest.hash) {
    throw new Error("The package validation evidence manifest is not the claimed manifest.");
  }
  const candidatePackage = command.data.candidatePackage;
  const evidenceRefs = productionEvidenceRefsForPackage(candidatePackage);
  const listUrlRef = productionString(candidatePackage.listUrlRef);
  if (!listUrlRef) {
    throw new Error("The declarative package has no list URL evidence reference.");
  }
  const listEvidence = await productionListingEvidence(input, claim, listUrlRef);
  const evidenceEntries = evidenceRefs.map((evidenceRef) =>
    claim.evidenceManifest.entries.find((entry) => entry.evidenceRef === evidenceRef));
  if (evidenceEntries.some((entry) => !entry)) {
    throw packageValidationError("The package references evidence outside the claim manifest.");
  }
  for (const evidenceRef of evidenceRefs) {
    await productionEvidence(input, claim, evidenceRef);
  }
  const evidenceKinds = Array.from(new Set(
    evidenceEntries.map((entry) => entry!.kind),
  ));
  const validatedPackageHash = productionHash(candidatePackage);
  const extraction = extractProductionValidationCandidates(
    candidatePackage,
    claim,
    listEvidence,
  );
  const sportVerification = claim.subject.repairContext
    ? await verifyAffiliateAgentLegacySportRepair({
      prisma: transaction,
      artifacts: input.artifacts,
      claim,
      sportEvidence: candidatePackage.sportEvidence!,
      resultKind: "REVIEW_REQUIRED",
      observedSportNames: extraction.observedSportNames,
    })
    : undefined;
  const sportVerificationOutput = sportVerification
    ? {
      evidenceRunId: sportVerification.evidenceRunId,
      sportsCatalogSha256: sportVerification.sportsCatalogSha256,
      expectedSportNames: sportVerification.expectedSportNames,
      observedSportNames: sportVerification.observedSportNames,
    }
    : undefined;
  const validationOutput = {
    schemaVersion: 1,
    isValid: true,
    validatedPackageHash,
    listUrl: extraction.listUrl,
    candidateCount: extraction.candidates.length,
    candidateHash: extraction.candidateHash,
    candidates: extraction.candidates,
    listEvidenceRef: candidatePackage.listUrlRef,
    evidenceManifestHash: command.data.evidenceManifestHash,
    evidenceRefs,
    evidenceKinds,
    validationReceiptId: receiptId,
    claimId: claim.claimId,
    claimGeneration: claim.claimGeneration,
    invocationId: claim.invocationId,
    supplyContractHash: claim.supplyContractHash,
    ...(candidatePackage.sportEvidence
      ? { sportEvidence: candidatePackage.sportEvidence }
      : {}),
    ...(sportVerificationOutput
      ? { sportVerification: sportVerificationOutput }
      : {}),
  };
  return {
    listEvidence,
    validatedPackageHash,
    evidenceRefs,
    evidenceKinds,
    validationOutput,
    validationMetadata: {
      validatedPackageHash,
      validationReceiptId: receiptId,
      evidenceManifestHash: command.data.evidenceManifestHash,
      evidenceRefs,
      evidenceKinds,
      claimId: claim.claimId,
      claimGeneration: claim.claimGeneration,
      invocationId: claim.invocationId,
      deploymentContractVersion: claim.deploymentContractVersion,
      deploymentContractHash: claim.deploymentContractHash,
      supplyContractVersion: claim.supplyContractVersion,
      supplyContractHash: claim.supplyContractHash,
      roleContractVersion: claim.roleContractVersion,
      roleContractHash: claim.roleContractHash,
      promptTemplateVersion: claim.promptTemplateVersion,
      promptTemplateHash: claim.promptTemplateHash,
      validationOutput,
    },
  };
};

const persistProductionValidation = async (
  input: ProductionAdapterInput,
  transaction: Prisma.TransactionClient,
  claim: AffiliateAgentClaimEnvelope,
  candidatePackage: ProductionValidationCommand["data"]["candidatePackage"],
  validation: ProductionValidationEvidence,
): Promise<void> => {
  assertMappingProducerClaim(
    claim,
    "Only a Mapping Producer claim may validate a declarative package.",
  );
  const validationBytes = productionJsonBuffer(
    validation.validationOutput,
    "The deterministic validation output",
  );
  const validationArtifact = productionClaimArtifactFor(
    claim,
    "DETERMINISTIC_VALIDATION",
    validationBytes,
  );
  await persistProductionClaimArtifact(
    input,
    transaction,
    claim,
    validationArtifact,
    validationBytes,
  );
  const durableEvidenceArtifact = await persistProductionDurableEvidence(
    input,
    transaction,
    claim,
    validation.evidenceRefs,
  );
  const mappingJobId = claim.subject.mappingJobId;
  if (!mappingJobId) return;
  const mappingJob = await transaction.affiliateSourceMappingJobs.findUnique({
    where: { id: mappingJobId },
  });
  if (!mappingJob || mappingJob.supplySourceId !== claim.subject.supplySourceId) {
    throw new Error("The package mapping job does not belong to the claim.");
  }
  await transaction.affiliateSourceMappingJobs.update({
    where: { id: mappingJob.id },
    data: {
      resultSummary: productionJson({
        ...productionRecord(mappingJob.resultSummary),
        gatewayCandidatePackage: {
          candidatePackage,
          validatedPackageHash: validation.validatedPackageHash,
          validationReceiptId: validation.validationMetadata.validationReceiptId,
          validationMetadata: {
            ...validation.validationMetadata,
            deterministicValidationArtifact: validationArtifact,
            durableEvidenceArtifact,
          },
          validationOutput: validation.validationOutput,
          deterministicValidationArtifact: validationArtifact,
          durableEvidenceArtifact,
          claimId: claim.claimId,
          claimGeneration: claim.claimGeneration,
          invocationId: claim.invocationId,
          deploymentContractVersion: claim.deploymentContractVersion,
          deploymentContractHash: claim.deploymentContractHash,
          supplyContractVersion: claim.supplyContractVersion,
          supplyContractHash: claim.supplyContractHash,
          roleContractVersion: claim.roleContractVersion,
          roleContractHash: claim.roleContractHash,
          promptTemplateVersion: claim.promptTemplateVersion,
          promptTemplateHash: claim.promptTemplateHash,
        },
      }),
    },
  });
};

type ProductionCommitState = Readonly<{
  mappingJob: Record<string, unknown>;
  candidatePackage: Record<string, unknown>;
  validationMetadata: Record<string, unknown>;
}>;
const isDeterministicValidationBound = (
  candidatePackage: Record<string, unknown>,
  validationMetadata: Record<string, unknown>,
  claim: AffiliateAgentClaimEnvelope,
  command: ProductionCommitCommand,
  savedEvidenceRefs: readonly string[],
): boolean => {
  const output = productionRecord(validationMetadata.validationOutput);
  const candidates = Array.isArray(output.candidates) ? output.candidates : null;
  const outputEvidenceRefs = Array.isArray(output.evidenceRefs)
    ? output.evidenceRefs.filter((value): value is string => typeof value === "string")
    : [];
  const outputEvidenceKinds = Array.isArray(output.evidenceKinds)
    ? output.evidenceKinds.filter((value): value is string => typeof value === "string")
    : [];
  try {
    return [
      output.isValid === true,
      productionString(output.validatedPackageHash) === command.data.validatedPackageHash,
      productionString(output.validationReceiptId) === command.data.validationReceiptId,
      productionString(output.listEvidenceRef) === productionString(candidatePackage.listUrlRef),
      Number.isSafeInteger(output.candidateCount)
        && Number(output.candidateCount) === candidates?.length,
      candidates !== null
        && productionString(output.candidateHash) === productionHash(candidates),
      productionString(output.evidenceManifestHash) === claim.evidenceManifest.hash,
      productionHash(outputEvidenceRefs) === productionHash(savedEvidenceRefs),
      productionHash(outputEvidenceKinds) === productionHash(validationMetadata.evidenceKinds),
      productionString(output.claimId) === claim.claimId,
      Number(output.claimGeneration) === claim.claimGeneration,
      productionString(output.invocationId) === claim.invocationId,
      productionString(output.supplyContractHash) === claim.supplyContractHash,
    ].every(Boolean);
  } catch {
    return false;
  }
};

const isProductionCommitBound = (
  saved: Record<string, unknown>,
  candidatePackage: Record<string, unknown>,
  validationMetadata: Record<string, unknown>,
  claim: AffiliateAgentClaimEnvelope,
  command: ProductionCommitCommand,
): boolean => {
  const savedEvidenceRefs = Array.isArray(validationMetadata.evidenceRefs)
    ? validationMetadata.evidenceRefs.filter((value): value is string => typeof value === "string")
    : [];
  return [
    productionString(saved.claimId) === claim.claimId,
    Number(saved.claimGeneration) === claim.claimGeneration,
    productionString(saved.invocationId) === claim.invocationId,
    productionString(saved.supplyContractHash) === claim.supplyContractHash,
    productionString(saved.validationReceiptId) === command.data.validationReceiptId,
    productionString(saved.validatedPackageHash) === command.data.validatedPackageHash,
    productionString(validationMetadata.validationReceiptId) === command.data.validationReceiptId,
    productionString(validationMetadata.validatedPackageHash) === command.data.validatedPackageHash,
    productionString(validationMetadata.evidenceManifestHash) === claim.evidenceManifest.hash,
    productionHash(savedEvidenceRefs) === productionHash(
      productionEvidenceRefsForPackage(candidatePackage),
    ),
    productionHash(candidatePackage) === command.data.validatedPackageHash,
    isDeterministicValidationBound(
      candidatePackage,
      validationMetadata,
      claim,
      command,
      savedEvidenceRefs,
    ),
  ].every(Boolean);
};

const readProductionCommitState = async (
  transaction: Prisma.TransactionClient,
  claim: AffiliateAgentClaimEnvelope,
  command: ProductionCommitCommand,
): Promise<ProductionCommitState> => {
  assertMappingProducerClaim(
    claim,
    "Only a Mapping Producer may commit a declarative package.",
  );
  const mappingJobResult = await transaction.affiliateSourceMappingJobs.findUnique({
    where: { id: claim.subject.mappingJobId },
  });
  if (!mappingJobResult) {
    throw new Error("The mapping job does not belong to the claimed Supply Source.");
  }
  const mappingJob = productionRecord(mappingJobResult);
  if (mappingJob.supplySourceId !== claim.subject.supplySourceId) {
    throw new Error("The mapping job does not belong to the claimed Supply Source.");
  }
  const saved = productionRecord(mappingJob.resultSummary);
  const gatewayCandidatePackage = productionRecord(saved.gatewayCandidatePackage);
  const candidatePackage = productionRecord(gatewayCandidatePackage.candidatePackage);
  const validationMetadata = productionRecord(gatewayCandidatePackage.validationMetadata);
  if (!isProductionCommitBound(gatewayCandidatePackage, candidatePackage, validationMetadata, claim, command)) {
    throw new Error("The committed package is not bound to the validation claim.");
  }
  return { mappingJob, candidatePackage, validationMetadata };
};

const findProductionCommitSource = async (
  transaction: Prisma.TransactionClient,
  mappingJob: Record<string, unknown>,
  supplySourceId: string,
): Promise<Record<string, unknown>> => {
  const sourceId = productionString(mappingJob.sourceId);
  if (!sourceId) {
    throw new Error("The mapping job has no exact scrape source identity.");
  }
  const source = await transaction.affiliateScrapeSources.findUnique({
    where: { id: sourceId },
  });
  const sourceRecord = productionRecord(source);
  if (!source) {
    throw new Error(`The mapping job scrape source ${sourceId} was not found.`);
  }
  if (sourceRecord.supplySourceId !== supplySourceId) {
    throw new Error("The mapping job scrape source does not match the claimed Supply Source.");
  }
  return sourceRecord;
};

const PRODUCTION_MAPPING_KINDS = ["EVENT", "RENTAL", "CLUB"] as const;
type ProductionMappingKind = (typeof PRODUCTION_MAPPING_KINDS)[number];
type ProductionCandidatePackageRecord = Readonly<{
  listingKind?: unknown;
  itemSelector?: unknown;
  fields?: unknown;
}>;

const productionMappingKindFrom = (
  value: unknown,
): ProductionMappingKind | null =>
  PRODUCTION_MAPPING_KINDS.find((kind) => kind === value) ?? null;

const productionSourceKindError = (): AffiliateAgentGatewayError => new AffiliateAgentGatewayError({
  code: "COMMAND_SCHEMA_INVALID",
  isRetryable: false,
  safeMessage: "The declarative package listing kind does not match the source target kind.",
});

const assertProductionSourceKind = (
  source: Record<string, unknown>,
  candidatePackage: ProductionCandidatePackageRecord,
  expectedListingKind?: unknown,
): ProductionMappingKind => {
  const sourceKind = productionMappingKindFrom(source.targetKind);
  const packageKind = productionMappingKindFrom(candidatePackage.listingKind);
  const expectedKind = expectedListingKind === undefined
    ? null
    : productionMappingKindFrom(expectedListingKind);
  if (
    sourceKind === null
    || packageKind === null
    || (
      expectedListingKind !== undefined
      && (expectedKind === null || expectedKind !== packageKind)
    )
    || sourceKind !== packageKind
  ) {
    throw productionSourceKindError();
  }
  return packageKind;
};

const productionMappingFor = (
  candidatePackage: ProductionCandidatePackageRecord,
  listUrl: string,
): AffiliateScrapeMapping =>
  affiliateScrapeMappingSchema.parse({
    kind: candidatePackage.listingKind,
    listUrl,
    itemSelector: candidatePackage.itemSelector,
    fields: productionMappingFields(candidatePackage),
  });

const findProductionValidationSource = async (
  transaction: Prisma.TransactionClient,
  claim: ProductionMappingProducerClaim,
): Promise<Record<string, unknown>> => {
  const mappingJobResult = await transaction.affiliateSourceMappingJobs.findUnique({
    where: { id: claim.subject.mappingJobId },
  });
  if (!mappingJobResult) {
    throw new Error("The mapping job does not belong to the claimed Supply Source.");
  }
  const mappingJob = productionRecord(mappingJobResult);
  if (mappingJob.supplySourceId !== claim.subject.supplySourceId) {
    throw new Error("The mapping job does not belong to the claimed Supply Source.");
  }
  return findProductionCommitSource(
    transaction,
    mappingJob,
    claim.subject.supplySourceId,
  );
};

const productionMappingFields = (
  candidatePackage: ProductionCandidatePackageRecord,
): Record<string, unknown> => Object.fromEntries(
  (Array.isArray(candidatePackage.fields) ? candidatePackage.fields : []).map((field) => {
    const value = productionRecord(field);
    const fieldName = value.field === "divisions"
      ? "divisionText"
      : value.field === "tags"
        ? "tagText"
        : String(value.field);
    if (value.mode === "CONSTANT") {
      return [
        fieldName,
        {
          selector: ":scope",
          mode: "literal",
          value: value.value,
        },
      ];
    }
    const transform = value.transform === "ABSOLUTE_URL"
      ? "absoluteUrl"
      : value.transform === "TRIM"
        ? "trim"
        : undefined;
    return [
      fieldName,
      {
        selector: value.selector,
        mode: value.mode === "ATTRIBUTE" ? "attribute" : "text",
        ...(value.attribute ? { attribute: value.attribute } : {}),
        ...(transform ? { transform } : {}),
      },
    ];
  }),
);

type ProductionCommitMapping = Readonly<{
  mapping: Prisma.InputJsonValue;
  evidenceRefs: readonly string[];
  evidenceKinds: readonly string[];
  validationOutput: Readonly<Record<string, unknown>>;
}>;

const buildProductionCommitMapping = async (
  input: ProductionAdapterInput,
  transaction: Prisma.TransactionClient,
  claim: AffiliateAgentClaimEnvelope,
  command: ProductionCommitCommand,
  candidatePackage: Record<string, unknown>,
  validationMetadata: Record<string, unknown>,
  source: Record<string, unknown>,
): Promise<ProductionCommitMapping> => {
  const parsedCandidatePackage = affiliateAgentDeclarativePackageSchema.parse(candidatePackage);
  assertProductionMappingPackage(claim, parsedCandidatePackage);
  const listUrlRef = productionString(parsedCandidatePackage.listUrlRef);
  if (!listUrlRef) throw new Error("The committed package has no list URL evidence reference.");
  const listEvidence = await productionListingEvidence(input, claim, listUrlRef);
  const listUrl = productionUrlFromEvidence(listEvidence);
  assertProductionSourceKind(
    source,
    parsedCandidatePackage,
    "listingKind" in claim.subject ? claim.subject.listingKind : undefined,
  );
  const mapping = productionMappingFor(parsedCandidatePackage, listUrl);
  const mappingFields = mapping.fields;
  if (!mappingFields.title || !mappingFields.officialActionUrl) {
    throw new Error("The committed package must map title and official action URL.");
  }
  const evidenceRefs = productionEvidenceRefsForPackage(parsedCandidatePackage);
  const evidenceEntries = evidenceRefs.map((evidenceRef) =>
    claim.evidenceManifest.entries.find((entry) => entry.evidenceRef === evidenceRef));
  if (evidenceEntries.some((entry) => !entry)) {
    throw new Error("The committed package references evidence outside the validation claim.");
  }
  const evidenceKinds = Array.from(new Set(evidenceEntries.map((entry) => entry!.kind)));
  const savedEvidenceKinds = Array.isArray(validationMetadata.evidenceKinds)
    ? validationMetadata.evidenceKinds.filter((value): value is string => typeof value === "string")
    : [];
  if (productionHash(savedEvidenceKinds) !== productionHash(evidenceKinds)) {
    throw new Error("The committed package evidence kinds are not bound to validation.");
  }
  let sportVerificationOutput: Readonly<Record<string, unknown>> | undefined;
  if (claim.subject.repairContext) {
    const extraction = extractProductionValidationCandidates(
      parsedCandidatePackage,
      claim,
      listEvidence,
    );
    const savedValidationOutput = productionRecord(validationMetadata.validationOutput);
    if (
      productionString(savedValidationOutput.candidateHash) !== extraction.candidateHash
    ) {
      throw new Error("The legacy sport repair evidence changed after validation.");
    }
    const sportVerification = await verifyAffiliateAgentLegacySportRepair({
      prisma: transaction,
      artifacts: input.artifacts,
      claim,
      sportEvidence: parsedCandidatePackage.sportEvidence!,
      resultKind: "REVIEW_REQUIRED",
      observedSportNames: extraction.observedSportNames,
    });
    sportVerificationOutput = {
      evidenceRunId: sportVerification.evidenceRunId,
      sportsCatalogSha256: sportVerification.sportsCatalogSha256,
      expectedSportNames: sportVerification.expectedSportNames,
      observedSportNames: sportVerification.observedSportNames,
    };
  }
  const validationOutput = {
    ...productionRecord(validationMetadata.validationOutput),
    isValid: true,
    validatedPackageHash: command.data.validatedPackageHash,
    validationReceiptId: command.data.validationReceiptId,
    evidenceManifestHash: claim.evidenceManifest.hash,
    evidenceRefs,
    evidenceKinds,
    claimId: claim.claimId,
    claimGeneration: claim.claimGeneration,
    invocationId: claim.invocationId,
    deploymentContractVersion: claim.deploymentContractVersion,
    deploymentContractHash: claim.deploymentContractHash,
    supplyContractVersion: claim.supplyContractVersion,
    supplyContractHash: claim.supplyContractHash,
    roleContractVersion: claim.roleContractVersion,
    roleContractHash: claim.roleContractHash,
    ...(sportVerificationOutput
      ? { sportVerification: sportVerificationOutput }
      : {}),
    promptTemplateVersion: claim.promptTemplateVersion,
    promptTemplateHash: claim.promptTemplateHash,
    validationMetadata,
  };
  return {
    mapping: productionJson({
      kind: mapping.kind,
      listUrl: mapping.listUrl,
      itemSelector: mapping.itemSelector,
      fields: mapping.fields,
      metadata: {
        packageHash: command.data.validatedPackageHash,
        evidenceRefs,
        evidenceKinds,
        validationOutput,
      },
    }),
    evidenceRefs,
    evidenceKinds,
    validationOutput,
  };
};

const persistProductionCommit = async (
  input: ProductionAdapterInput,
  transaction: Prisma.TransactionClient,
  claim: AffiliateAgentClaimEnvelope,
  command: ProductionCommitCommand,
  receiptId: string,
  source: Record<string, unknown>,
  candidatePackage: Record<string, unknown>,
  mapping: ProductionCommitMapping,
): Promise<AffiliateAgentDeclarativePackageCommitOutput> => {
  assertMappingProducerClaim(
    claim,
    "Only a Mapping Producer claim may commit a declarative package.",
  );
  const sourceId = productionString(source.id);
  const packageBytes = productionJsonBuffer(
    candidatePackage,
    "The committed package",
  );
  const packageArtifact = productionClaimArtifactFor(
    claim,
    "COMMITTED_PACKAGE",
    packageBytes,
  );
  await persistProductionClaimArtifact(
    input,
    transaction,
    claim,
    packageArtifact,
    packageBytes,
  );
  if (!sourceId) throw new Error("The claimed scrape source has no identifier.");
  const existing = await transaction.affiliateScrapeMappings.findFirst({
    where: { sourceId },
    orderBy: { version: "desc" },
  });
  const mappingId = input.identifiers?.create("artifact") ?? `agw-artifact-${randomUUID()}`;
  await transaction.affiliateScrapeMappings.create({
    data: {
      id: mappingId,
      sourceId,
      supplySourceId: claim.subject.supplySourceId,
      version: (existing?.version ?? 0) + 1,
      isActive: false,
      mapping: mapping.mapping,
      createdByUserId: null,
      notes: `Committed by ${claim.workerId} through the governed Affiliate Agent Gateway.`,
    },
  });
  await transaction.affiliateScrapeSources.update({
    where: { id: sourceId },
    data: { activeMappingId: mappingId, autoScrapeEnabled: false },
  });
  const lifecycleResult = await executeAffiliateSupplyLifecycleCommand({
    supplySourceId: claim.subject.supplySourceId,
    command: "RECORD_MAPPING",
    authority: "MAPPING_PRODUCER",
    expectedLifecycleGeneration: claim.lifecycleGeneration ?? Number(source.lifecycleGeneration),
    idempotencyKey: receiptId,
    request: {
      commandRef: receiptId,
      mappingId,
      mappingJobId: claim.subject.mappingJobId,
      packageHash: command.data.validatedPackageHash,
      evidenceRefs: mapping.evidenceRefs,
      evidenceKinds: mapping.evidenceKinds,
      validationOutput: mapping.validationOutput,
    },
    actorKind: "MAPPING_PRODUCER",
    actorId: claim.workerId,
    executingAgentId: claim.invocationId,
    supplyContractVersion: claim.supplyContractVersion,
    supplyContractHash: claim.supplyContractHash,
    db: affiliateSupplyDatabase(transaction),
    now: input.clock?.now() ?? new Date(),
  });
  if (!lifecycleResult.transition) {
    throw new Error("Recording the committed mapping did not produce a lifecycle transition.");
  }
  return { packageHash: command.data.validatedPackageHash };
};
export const createProductionAffiliateAgentGatewayAdapters = (
  input: ProductionAdapterInput,
): Readonly<{
  commands: AffiliateAgentCommandAdapters;
  terminalEffects: AffiliateAgentTerminalEffectAdapter;
}> => {
  const searchClient = input.searchClient ?? createAffiliateSourceSearchClient();
  const captureClient = input.captureClient ?? createAffiliateSourceCaptureClient();
  const identifiers = input.identifiers ?? {
    create: (kind: AffiliateAgentGatewayIdentifierKind) => `agw-${kind}-${randomUUID()}`,
  };
  const commands: AffiliateAgentCommandAdapters = {
    transactional: {
      VALIDATE_DECLARATIVE_PACKAGE: {
        execute: async ({ transaction, claim, command, receiptId }) => {
          assertMappingProducerClaim(
            claim,
            "Only a Mapping Producer may validate a declarative package.",
          );
          const candidatePackage = command.data.candidatePackage;
          const source = await transaction.affiliateSupplySources.findUnique({
            where: { id: candidatePackage.supplySourceId },
          });
          if (!source) throw new Error("The package Supply Source does not exist.");
          const scrapeSource = await findProductionValidationSource(transaction, claim);
          assertProductionSourceKind(
            scrapeSource,
            candidatePackage,
            "listingKind" in claim.subject ? claim.subject.listingKind : undefined,
          );
          const validation = await prepareProductionValidation(
            input,
            transaction,
            claim,
            command,
            receiptId,
          );
          await persistProductionValidation(
            input,
            transaction,
            claim,
            candidatePackage,
            validation,
          );
          return {
            isValid: true,
            validatedPackageHash: validation.validatedPackageHash,
          };
        },
      },
      COMMIT_DECLARATIVE_PACKAGE: {
        execute: async ({ transaction, claim, command, receiptId }) => {
          assertMappingProducerClaim(
            claim,
            "Only a Mapping Producer claim may commit a declarative package.",
          );
          const commitState = await readProductionCommitState(transaction, claim, command);
          const source = await findProductionCommitSource(
            transaction,
            commitState.mappingJob,
            claim.subject.supplySourceId,
          );
          const mapping = await buildProductionCommitMapping(
            input,
            transaction,
            claim,
            command,
            commitState.candidatePackage,
            commitState.validationMetadata,
            source,
          );
          return persistProductionCommit(
            input,
            transaction,
            claim,
            command,
            receiptId,
            source,
            commitState.candidatePackage,
            mapping,
          );
        },
      },
    },
    external: {
      RUN_DISCOVERY_QUERY: {
        start: async (operationKey, { claim, command }) => {
          const [strategyEvidence, queryEvidence] = await Promise.all([
            productionEvidence(input, claim, command.data.strategyRef),
            productionEvidence(input, claim, command.data.queryRef),
          ]);
          const strategy = parseProductionStrategyEvidence(strategyEvidence.text);
          const query = parseProductionQueryEvidence(queryEvidence.text);
          const result = await searchClient.searchSources(query.query, {
            ...query.options,
            strategy,
          });
          const outputEvidenceRef = allocateProductionOutputEvidenceRef(
            input,
            operationKey,
            [command.data.strategyRef, command.data.queryRef],
          );
          return persistProductionExternalOutput(
            input,
            operationKey,
            outputEvidenceRef,
            productionJsonBuffer(result, "The discovery provider output"),
            "application/json",
            undefined,
            (output) => ({
              commandType: "RUN_DISCOVERY_QUERY",
              lineage: {
                operationKey,
                provider: result.provider,
                providerJobId: result.providerJobId,
                evidenceRef: output.evidenceRef,
                artifactId: output.artifactId,
                sha256: output.sha256,
              },
              sidecars: [
                productionStagedObjectFor(
                  `${operationKey}:request`,
                  productionJsonBuffer(result.request, "The discovery request"),
                  "application/json",
                ),
                productionStagedObjectFor(
                  `${operationKey}:response`,
                  productionJsonBuffer(result.response, "The discovery response"),
                  "application/json",
                ),
              ],
            }),
          );
        },
        recover: (operationKey) => recoverProductionExternalOutput(
          input,
          operationKey,
          "RUN_DISCOVERY_QUERY",
        ),
      },
      CAPTURE_CLAIM_URL: {
        start: async (operationKey, { claim, command }) => {
          const [urlEvidence, profileEvidence] = await Promise.all([
            productionEvidence(input, claim, command.data.urlRef),
            productionEvidence(input, claim, command.data.captureProfileRef),
          ]);
          const profile = parseProductionCaptureProfileEvidence(profileEvidence.text);
          const captureOptions = {
            profile,
            captureScreenshot: true,
          } as const;
          const timeoutMs = affiliateSourceCaptureTimeoutMs(profile);
          const deadlineAt = affiliateSourceCaptureDeadlineAt(captureOptions);
          const safeUrl = await withAffiliateSourceCaptureDeadline(
            () => assertSafePublicUrl(
              productionUrlFromExternalEvidence(urlEvidence),
              input.publicUrlResolver,
            ),
            deadlineAt,
            timeoutMs,
          );
          const url = safeUrl.url.toString();
          const result = await withAffiliateSourceCaptureDeadline(
            () => captureClient.captureSourcePage(url, {
              ...captureOptions,
              deadlineAt,
            }),
            deadlineAt,
            timeoutMs,
          );
          const captureMetadata = productionCaptureMetadataFrom(
            result,
            url,
            captureClient.provider,
          );
          const outputEvidenceRef = allocateProductionOutputEvidenceRef(
            input,
            operationKey,
            [command.data.urlRef, command.data.captureProfileRef],
          );
          return persistProductionExternalOutput(
            input,
            operationKey,
            outputEvidenceRef,
            Buffer.from(result.rawHtml, "utf8"),
            "text/html",
            captureMetadata,
            (output) => productionCaptureStagingInputFor(operationKey, result, output),
          );
        },
        recover: (operationKey) => recoverProductionExternalOutput(
          input,
          operationKey,
          "CAPTURE_CLAIM_URL",
        ),
      },
    },
  };
  return {
    commands,
    terminalEffects: productionTerminalEffects(input),
  };
};


const requireProductionGatewayAdapters = <
  T extends Readonly<{
    commands?: AffiliateAgentCommandAdapters;
    terminalEffects?: AffiliateAgentTerminalEffectAdapter;
  }>,
>(
  input: T,
): Readonly<{
  commands: AffiliateAgentCommandAdapters;
  terminalEffects: AffiliateAgentTerminalEffectAdapter;
}> => {
  if (!input.commands) {
    throw new Error(
      "Affiliate Agent Gateway production wiring is incomplete: command adapters are required.",
    );
  }
  const requiredCommands = [
    input.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE,
    input.commands.transactional.COMMIT_DECLARATIVE_PACKAGE,
    input.commands.external.RUN_DISCOVERY_QUERY,
    input.commands.external.CAPTURE_CLAIM_URL,
  ];
  if (!requiredCommands.every(Boolean)) {
    throw new Error(
      "Affiliate Agent Gateway production wiring is incomplete: all command adapters are required.",
    );
  }
  if (!input.terminalEffects) {
    throw new Error(
      "Affiliate Agent Gateway production wiring is incomplete: Supply Reviewer terminal effects are required.",
    );
  }
  return { commands: input.commands, terminalEffects: input.terminalEffects };
};

export const createProductionAffiliateAgentGatewayDependencies = (
  input: Readonly<{
    prisma?: PrismaClient;
    tokenSigningKey: Uint8Array;
    tokenKeyVersion: string;
    clock?: AffiliateAgentGatewayClock;
    identifiers?: AffiliateAgentGatewayIdentifiers;
    credentials: AffiliateAgentRoleCredentialVerifier;
    workspaces: AffiliateAgentWorkspaceAttestationVerifier;
    contracts: AffiliateAgentActiveContractRegistry;
    artifacts: AffiliateAgentArtifactStore;
    commands?: AffiliateAgentCommandAdapters;
    terminalEffects?: AffiliateAgentTerminalEffectAdapter;
    lifecycle?: AffiliateAgentLifecycleAuthority;
    workerHealth?: AffiliateAgentWorkerHealthWriter;
    claimAdmission?: AffiliateAgentClaimAdmission;
    operationalAlert?: AffiliateOperationalAlertWriter;
  }>,
): AffiliateAgentGatewayDependencies => {
  const gatewayPrisma = input.prisma ?? prisma;
  const clock = input.clock ?? { now: () => new Date() };
  const hasOperationalAlertModels =
    "affiliateOperationalAlerts" in gatewayPrisma &&
    "affiliateOperationalAlertDeliveries" in gatewayPrisma;
  const defaultOperationalAlert: AffiliateOperationalAlertWriter | undefined =
    hasOperationalAlertModels
      ? async (alert, dependencies) =>
          emitAffiliateOperationalAlert(alert, {
            ...(dependencies ?? {}),
            db: dependencies?.db ?? gatewayPrisma,
          })
      : undefined;
  const adapters = requireProductionGatewayAdapters(input);
  return {
    prisma: gatewayPrisma,
    clock,
    identifiers:
      input.identifiers ??
      ({
        create: (kind) => `agw-${kind}-${randomUUID()}`,
      } satisfies AffiliateAgentGatewayIdentifiers),
    credentials: input.credentials,
    workspaces: input.workspaces,
    tokens: createClaimTokenCodec({
      signingKey: input.tokenSigningKey,
      keyVersion: input.tokenKeyVersion,
    }),
    contracts: input.contracts,
    artifacts: input.artifacts,
    commands: adapters.commands,
    terminalEffects: adapters.terminalEffects,
    lifecycle: input.lifecycle ?? createAffiliateSupplyLifecycleAuthority({
      db: affiliateSupplyDatabase(gatewayPrisma),
      clock: clock.now,
      contractRegistry: input.contracts,
    }),
    workerHealth:
      input.workerHealth ??
      createAffiliateAgentWorkerHealthWriter({
        db: affiliateSupplyDatabase(gatewayPrisma),
      }),
    claimAdmission: input.claimAdmission,
    operationalAlert: input.operationalAlert ?? defaultOperationalAlert,
  };
};
