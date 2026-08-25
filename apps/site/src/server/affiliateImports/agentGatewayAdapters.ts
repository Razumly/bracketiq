import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AffiliateAgentDeclarativePackageCommitOutput,
  AffiliateAgentDeclarativePackageValidationOutput,
  AffiliateAgentClaimEnvelope,
  AffiliateAgentCommand,
  AffiliateAgentExecutionClass,
  AffiliateAgentRole,
  AffiliateAgentTerminalResultEnvelope,
} from "./agentGatewayContracts";
import { canonicalizeAffiliateAgentValue } from "./agentGatewayContracts";
import {
  affiliateSupplyDatabase,
  createAffiliateSupplyLifecycleAuthority,
  recordAffiliateAgentWorkerHeartbeat,
} from './affiliateSupplyPersistence';
import type { AffiliateSupplyDatabase } from './affiliateSupplyPersistence';
import {
  emitAffiliateOperationalAlert,
  type AffiliateOperationalAlertWriter,
} from './affiliateOperationalAlerts';
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
  | Readonly<{ kind: "RESULT"; value: unknown }>
  | Readonly<{ kind: "EXIT"; exitCode: number }>;

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
}

export interface AffiliateAgentProcessLauncher {
  launch(
    input: Readonly<{
      command: readonly ["codex", "exec", "--ephemeral"];
      prompt: string;
      environment: Readonly<Record<string, string>>;
      workspacePath: string;
    }>,
  ): AffiliateAgentProcessSession;
}

export interface AffiliateAgentWorkspaceManager {
  create(
    input: Readonly<{
      workerId: string;
      invocationId: string;
      mode: "READ_ONLY" | "READ_WRITE";
    }>,
  ): Promise<
    Readonly<{
      path: string;
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
    commands: input.commands ?? { transactional: {}, external: {} },
    terminalEffects: input.terminalEffects,
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
    operationalAlert: input.operationalAlert ?? defaultOperationalAlert,
  };
};
