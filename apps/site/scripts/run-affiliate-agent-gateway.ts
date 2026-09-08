import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  previewAffiliateLegacyRepairAdmission,
  applyAffiliateLegacyRepairAdmission,
  AffiliateLegacyRepairAdmissionError,
} from '../src/server/affiliateImports/affiliateLegacyRepairAdmission';

import {
  affiliateAgentContractBundleSchema,
  affiliateAgentDeploymentContractSchema,
  AFFILIATE_AGENT_PROMPT_TEMPLATES,
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  AFFILIATE_AGENT_ROLES,
  type AffiliateAgentRole,
  canonicalizeAffiliateAgentValue,
} from '../src/server/affiliateImports/agentGatewayContracts';
import {
  AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
  AFFILIATE_AGENT_LEASE_SECONDS,
  AFFILIATE_AGENT_WORKSPACE_ATTESTATION_ADMISSION_MARGIN_SECONDS,
  AFFILIATE_AGENT_WORKSPACE_ATTESTATION_LIFETIME_SECONDS,
  AffiliateAgentGatewayError,
} from '../src/server/affiliateImports/agentGateway';
import type {
  AffiliateAgentClaimOperation,
  AffiliateAgentClaimRequest,
  AffiliateAgentGateway,
  AffiliateAgentReconcileReport,
  AffiliateAgentReconcileRequest,
  AffiliateAgentWorkspaceAttestation,
} from '../src/server/affiliateImports/agentGateway';
import {
  createProductionAffiliateAgentGatewayAdapters,
  createProductionAffiliateAgentGatewayDependencies,
  type AffiliateAgentBoundedAdmissionLease,
  type AffiliateAgentBoundedAdmissionLeaseRequest,
  type AffiliateAgentBoundedAdmissionRole,
  type AffiliateAgentInvocationReconciler,
  type AffiliateAgentWorkerHealthWriter,
} from '../src/server/affiliateImports/agentGatewayAdapters';
import {
  createAffiliateAgentClaimAdmission,
  createPrismaAffiliateAgentGateway,
  createPrismaAffiliateAgentInvocationReconciler,
  validateAffiliateAgentClaimForAdmission,
} from '../src/server/affiliateImports/prismaAgentGateway';
import {
  affiliateSupplyDatabase,
  loadActiveAffiliateSupplyContract,
} from '../src/server/affiliateImports/affiliateSupplyPersistence';
import {
  createAffiliateSupplyActivationTargetWriter,
} from '../src/server/affiliateImports/service';
import {
  isAffiliateCutoverPreflightApplySafe,
  isAffiliateCutoverPreflightReportIntact,
  isAffiliateCutoverPreflightFresh,
  type AffiliateCutoverPreflightReport,
} from '../src/server/affiliateImports/affiliateFleetCutover';
import {
  AFFILIATE_DOWNSTREAM_WORKERS,
  isAffiliateDownstreamFleetReady,
} from '../src/server/affiliateImports/affiliateFleetReadiness';
import { createAffiliateGatewayHealthChecks } from '../src/server/affiliateImports/affiliateGatewayHealth';
import {
  runAffiliateGovernedReplenishment,
  type AffiliateGovernedReplenishmentControllerResult,
} from '../src/server/affiliateImports/affiliateReplenishmentController';
import { prisma } from '../src/lib/prisma';
import { getStorageProvider } from '../src/lib/storageProvider';
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;
const ATTESTATION_CLOCK_SKEW_MS =
  AFFILIATE_AGENT_WORKSPACE_ATTESTATION_ADMISSION_MARGIN_SECONDS * 1_000;
export const AFFILIATE_AGENT_GATEWAY_RECONCILE_INTERVAL_MS = Math.max(
  1_000,
  Math.min(
    AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
    AFFILIATE_AGENT_LEASE_SECONDS,
  ) * 1_000,
);
const MAX_ATTESTATION_LIFETIME_MS =
  AFFILIATE_AGENT_WORKSPACE_ATTESTATION_LIFETIME_SECONDS * 1_000;
const DEFAULT_PORT = 8080;
const DEFAULT_GATEWAY_PATH_PREFIX = '/v1/affiliate-agent';
const readBoundedArtifactStream = async (
  stream: AsyncIterable<Buffer | string | Uint8Array>,
  maximumBytes: number,
): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > Math.min(maximumBytes, MAX_ARTIFACT_BYTES)) {
      throw new Error('Artifact exceeds the gateway read limit.');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};
type AffiliateAgentGatewayPrisma = typeof prisma;
type AffiliateAgentGatewayStorage = ReturnType<typeof getStorageProvider>;

const sourceArtifactFor = async (
  database: AffiliateAgentGatewayPrisma,
  fileId: string,
) => {
  const rows = await database.affiliateSourceIntakeArtifacts.findMany({
    where: { fileId },
    select: { sourceUrl: true, finalUrl: true },
    take: 2,
  });
  if (rows.length > 1) throw new Error('Use an exact intake artifact handle for shared evidence files.');
  return rows[0] ?? null;
};

const persistedGatewayArtifactMimeTypeFor = async (
  database: AffiliateAgentGatewayPrisma,
  fileId: string,
  contentType: string | undefined,
): Promise<string | null> => {
  if (contentType !== undefined) return null;
  const artifact = await database.affiliateAgentGatewayArtifacts.findFirst({
    where: { fileId },
    select: { mimeType: true },
  });
  return artifact?.mimeType ?? null;
};

const defaultGatewayArtifactMimeTypeFor = (fileId: string): string => (
  fileId.endsWith(":gateway-deterministic-validation")
  || fileId.endsWith(":gateway-committed-package")
    ? "application/json"
    : "application/octet-stream"
);

const artifactMimeTypeFor = async (
  database: AffiliateAgentGatewayPrisma,
  fileId: string,
  contentType: string | undefined,
): Promise<string> => (
  contentType
  ?? await persistedGatewayArtifactMimeTypeFor(database, fileId, contentType)
  ?? defaultGatewayArtifactMimeTypeFor(fileId)
);

export const createAffiliateAgentGatewayArtifactStore = (
  database: AffiliateAgentGatewayPrisma,
  storage: AffiliateAgentGatewayStorage,
) => ({
  readImmutable: async ({
    fileId,
    maximumBytes,
  }: {
    fileId: string;
    maximumBytes: number;
  }) => {
    if (fileId.startsWith('intake-artifact:')) {
      const artifact = await database.affiliateSourceIntakeArtifacts.findUnique({
        where: { id: fileId.slice('intake-artifact:'.length) },
        select: { id: true, fileId: true, intakeId: true, runId: true, sourceUrl: true, finalUrl: true, mimeType: true },
      });
      if (!artifact) throw new Error('The admitted intake artifact was not found.');
      const file = await database.file.findUnique({
        where: { id: artifact.fileId },
        select: { path: true, bucket: true, mimeType: true },
      });
      if (!file) throw new Error('The admitted intake artifact file was not found.');
      const object = await storage.getObjectStream({ key: file.path, bucket: file.bucket });
      const bytes = await readBoundedArtifactStream(object.stream, maximumBytes);
      return {
        bytes,
        byteSize: bytes.length,
        mimeType: object.contentType ?? artifact.mimeType ?? file.mimeType ?? 'application/octet-stream',
        sourceUrl: artifact.sourceUrl,
        finalUrl: artifact.finalUrl,
        intakeId: artifact.intakeId,
        runId: artifact.runId,
      };
    }
    const files = await database.file.findMany({
      where: { path: fileId },
      select: { id: true, bucket: true, mimeType: true },
      take: 2,
    });
    if (files.length > 1) throw new Error('The evidence storage key has ambiguous file ownership.');
    const file = files[0];
    const object = await storage.getObjectStream({ key: fileId, ...(file ? { bucket: file.bucket } : {}) });
    const bytes = await readBoundedArtifactStream(object.stream, maximumBytes);
    const [sourceArtifact, mimeType] = await Promise.all([
      sourceArtifactFor(database, file?.id ?? fileId),
      artifactMimeTypeFor(database, fileId, object.contentType ?? file?.mimeType ?? undefined),
    ]);
    return {
      bytes,
      mimeType,
      byteSize: bytes.length,
      sourceUrl: sourceArtifact?.sourceUrl ?? null,
      finalUrl: sourceArtifact?.finalUrl ?? null,
    };
  },
});

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

export const AFFILIATE_GATEWAY_OPERATOR_TOKEN_SENTINEL =
  '__REPLACE_WITH_PRIVATE_REVIEWED_GATEWAY_OPERATOR_TOKEN__';

export const AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN_SENTINEL =
  '__REPLACE_WITH_PRIVATE_REVIEWED_GATEWAY_REPLENISHMENT_TOKEN__';

const isObviousOperatorTokenValue = (value: string): boolean => {
  const normalized = value.trim().toUpperCase();
  return normalized === AFFILIATE_GATEWAY_OPERATOR_TOKEN_SENTINEL
    || normalized === AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN_SENTINEL
    || /^(?:__.+__|<.+>|\$\{.+\})$/.test(normalized)
    || /^(?:CHANGE|CHANGEME|DUMMY|EXAMPLE|PLACEHOLDER|REPLACE|SECRET|TEST|TOKEN|YOUR|DEFAULT|FALSE|NIL|NONE|NULL|UNDEFINED|NA)(?:[-_ ]|$)/.test(normalized)
    || /^(?:PRIVATE[-_])?(?:REVIEWED[-_])?(?:GATEWAY[-_])?(?:(?:OPERATOR|REPLENISHMENT)[-_])?TOKEN$/.test(normalized)
    || /^N\/A$/.test(normalized);
};

export const validateAffiliateGatewayOperatorToken = (value: string | undefined): string => {
  const token = value?.trim();
  if (!token) throw new Error('AFFILIATE_GATEWAY_OPERATOR_TOKEN is required.');
  if (isObviousOperatorTokenValue(token)) {
    throw new Error('AFFILIATE_GATEWAY_OPERATOR_TOKEN must be a reviewed non-placeholder value.');
  }
  return token;
};

export const validateAffiliateGatewayReplenishmentToken = (
  value: string | undefined,
): string => {
  const token = value?.trim();
  if (!token) throw new Error('AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN is required.');
  if (isObviousOperatorTokenValue(token)) {
    throw new Error(
      'AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN must be a reviewed non-placeholder value.',
    );
  }
  return token;
};

const requiredAffiliateGatewayOperatorToken = (): string => (
  validateAffiliateGatewayOperatorToken(requiredEnvironment('AFFILIATE_GATEWAY_OPERATOR_TOKEN'))
);

const requiredAffiliateGatewayReplenishmentToken = (): string => (
  validateAffiliateGatewayReplenishmentToken(
    requiredEnvironment('AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN'),
  )
);


export const validateAffiliateAgentSupervisorHaltCredential = (
  value: string | undefined,
): string => {
  const credential = value?.trim();
  if (!credential) throw new Error('AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL is required.');
  if (Buffer.byteLength(credential, 'utf8') < 32) {
    throw new Error('AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL must be at least 32 bytes.');
  }
  if (isObviousOperatorTokenValue(credential)) {
    throw new Error(
      'AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL must be a reviewed non-placeholder value.',
    );
  }
  return credential;
};

const requiredAffiliateAgentSupervisorHaltCredential = (): string => (
  validateAffiliateAgentSupervisorHaltCredential(
    requiredEnvironment('AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL'),
  )
);

const WORKER_CREDENTIAL_ENV: Readonly<Record<string, Readonly<{ role: AffiliateAgentRole; environment: string }>>> = {
  'mapping-producer-1': { role: 'MAPPING_PRODUCER', environment: 'AFFILIATE_MAPPING_PRODUCER_1_CREDENTIAL' },
  'mapping-producer-2': { role: 'MAPPING_PRODUCER', environment: 'AFFILIATE_MAPPING_PRODUCER_2_CREDENTIAL' },
  'supply-reviewer-1': { role: 'SUPPLY_REVIEWER', environment: 'AFFILIATE_SUPPLY_REVIEWER_1_CREDENTIAL' },
  'supply-reviewer-2': { role: 'SUPPLY_REVIEWER', environment: 'AFFILIATE_SUPPLY_REVIEWER_2_CREDENTIAL' },
  'coverage-planner': { role: 'COVERAGE_PLANNER', environment: 'AFFILIATE_COVERAGE_PLANNER_CREDENTIAL' },
  'human-directed-executor': {
    role: 'HUMAN_DIRECTED_EXECUTOR',
    environment: 'AFFILIATE_HUMAN_DIRECTED_EXECUTOR_CREDENTIAL',
  },
};
const parsePort = (): number => {
  const value = Number(process.env.AFFILIATE_GATEWAY_PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('AFFILIATE_GATEWAY_PORT must be a valid TCP port.');
  }
  return value;
};


const hasEqualBytes = (left: Uint8Array, right: Uint8Array): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const signingKey = (name: string): Uint8Array => {
  const value = requiredEnvironment(name);
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length < 32) throw new Error(`${name} must decode to at least 32 bytes.`);
  return decoded;
};

const verifyWorkspaceAttestation = async (
  attestation: AffiliateAgentWorkspaceAttestation,
  workspaceSigningKey: Uint8Array,
): Promise<boolean> => {
  const now = Date.now();
  const issuedAt = Date.parse(attestation.issuedAt);
  const expiresAt = Date.parse(attestation.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return false;
  if (issuedAt > now + ATTESTATION_CLOCK_SKEW_MS || expiresAt <= now) return false;
  if (expiresAt - issuedAt > MAX_ATTESTATION_LIFETIME_MS) return false;
  if (attestation.executionClass !== 'PRODUCTION_OMP') return false;
  if (attestation.mode !== 'READ_ONLY' && attestation.mode !== 'READ_WRITE') return false;
  const { signature, ...preimage } = attestation;
  const expected = createHmac('sha256', workspaceSigningKey)
    .update(canonicalizeAffiliateAgentValue(preimage))
    .digest();
  return hasEqualBytes(Buffer.from(signature, 'base64url'), expected);
};

const verifyRoleCredential = async (input: Readonly<{
  role: AffiliateAgentRole;
  workerId: string;
  roleCredential: string;
}>): Promise<boolean> => {
  const worker = WORKER_CREDENTIAL_ENV[input.workerId];
  if (!worker || worker.role !== input.role) return false;
  const expected = Buffer.from(requiredEnvironment(worker.environment));
  return hasEqualBytes(Buffer.from(input.roleCredential), expected);
};
const configuredAffiliateAgentWorkerCredentials = (): readonly string[] => (
  Object.values(WORKER_CREDENTIAL_ENV).map(({ environment }) => requiredEnvironment(environment))
);
const validateConfiguredWorkerCredentials = (): readonly string[] => {
  const values = configuredAffiliateAgentWorkerCredentials();
  if (values.some((value) => Buffer.byteLength(value, 'utf8') < 32)) {
    throw new Error('Every configured Affiliate Agent worker credential must be at least 32 bytes.');
  }
  if (new Set(values).size !== values.length) {
    throw new Error('Affiliate Agent worker credentials must be pairwise distinct.');
  }
  return values;
};
export const validateAffiliateGatewayCredentialCollisions = (
  operatorToken: string,
  replenishmentToken: string,
  supervisorHaltCredential: string,
  workerCredentials: readonly string[],
): void => {
  if (operatorToken === replenishmentToken) {
    throw new Error('AFFILIATE_GATEWAY_OPERATOR_TOKEN and AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN must be distinct.');
  }
  if (workerCredentials.some((credential) => credential === operatorToken)) {
    throw new Error('AFFILIATE_GATEWAY_OPERATOR_TOKEN must be distinct from every worker credential.');
  }
  if (operatorToken === supervisorHaltCredential) {
    throw new Error('AFFILIATE_GATEWAY_OPERATOR_TOKEN must be distinct from AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL.');
  }
  if (workerCredentials.some((credential) => credential === replenishmentToken)) {
    throw new Error('AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN must be distinct from every worker credential.');
  }
  if (replenishmentToken === supervisorHaltCredential) {
    throw new Error('AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN must be distinct from AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL.');
  }
};

const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const contentLength = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new Error('Request body is too large.');
  }
  const chunks: Buffer[] = [];
  let byteSize = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteSize += buffer.length;
    if (byteSize > MAX_REQUEST_BYTES) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }
  if (byteSize === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new Error('Request body is not valid JSON.');
  }
};

const sendJson = (
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void => {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
};

const sendEmpty = (response: ServerResponse, statusCode: number): void => {
  response.writeHead(statusCode, { 'cache-control': 'no-store' });
  response.end();
};

const httpStatusForError = (error: AffiliateAgentGatewayError): number => {
  if (error.code === 'ROLE_CREDENTIAL_INVALID' || error.code === 'TOKEN_INVALID') return 401;
  if (
    error.code === 'ROLE_NOT_ALLOWED' ||
    error.code === 'COMMAND_NOT_PERMITTED' ||
    error.code === 'REVIEW_WORKSPACE_INVALID'
  ) return 403;
  if (error.code === 'INTERNAL_ERROR') return 500;
  return 409;
};

const toHttpResult = (result: unknown): unknown => {
  if (
    result &&
    typeof result === 'object' &&
    'kind' in result &&
    result.kind === 'ARTIFACT_READ' &&
    'bytes' in result &&
    result.bytes instanceof Uint8Array
  ) {
    return {
      ...result,
      bytes: Buffer.from(result.bytes).toString('base64'),
      encoding: 'base64',
    };
  }
  return result;
};
export type AffiliateAgentGatewayAdmission = Readonly<{
  isOpen(): boolean;
  open(): Promise<void>;
  openBoundedLease(
    request: AffiliateAgentBoundedAdmissionLeaseRequest,
  ): Promise<AffiliateAgentBoundedAdmissionLease>;
  close(): Promise<void>;
  withClaim<T>(
    operation: () => Promise<T>,
    context?: Readonly<{ role: AffiliateAgentRole; workerId: string }>,
  ): Promise<T>;
}>;
export type AffiliateAgentClaimAdmissionDecision =
  | "READY"
  | "NOT_READY"
  | "REPLAY";

export const createAffiliateAgentGatewayAdmission = (): AffiliateAgentGatewayAdmission =>
  createAffiliateAgentClaimAdmission();

export type AffiliateAgentGatewayRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

type AffiliateAgentWorkerHeartbeatRequest = Readonly<{
  workerId: string;
  role: AffiliateAgentRole;
  roleCredential: string;
}>;

const workerHeartbeatRequestFrom = (
  body: unknown,
): AffiliateAgentWorkerHeartbeatRequest | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const workerId = typeof record.workerId === "string"
    ? record.workerId.trim()
    : "";
  const role = record.role;
  const roleCredential = typeof record.roleCredential === "string"
    ? record.roleCredential
    : "";
  if (
    !workerId
    || typeof role !== "string"
    || !(AFFILIATE_AGENT_ROLES as readonly string[]).includes(role)
    || !roleCredential.trim()
  ) {
    return null;
  }
  return {
    workerId,
    role: role as AffiliateAgentRole,
    roleCredential,
  };
};
type BoundedAdmissionRequest = Readonly<{
  role: AffiliateAgentBoundedAdmissionRole;
  workerId: string;
  roleCredential: string;
  leaseSeconds: number;
}>;

const BOUNDED_ADMISSION_ROLES: readonly AffiliateAgentBoundedAdmissionRole[] = [
  "COVERAGE_PLANNER",
  "MAPPING_PRODUCER",
  "SUPPLY_REVIEWER",
  "HUMAN_DIRECTED_EXECUTOR",
];

const boundedAdmissionRoleFrom = (
  value: unknown,
): AffiliateAgentBoundedAdmissionRole | null => (
  typeof value === "string"
  && (BOUNDED_ADMISSION_ROLES as readonly string[]).includes(value)
    ? value as AffiliateAgentBoundedAdmissionRole
    : null
);

const objectRecordFrom = (body: unknown): Record<string, unknown> | null => (
  typeof body === 'object' && body !== null && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null
);

const trimmedStringFrom = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const validBoundedLeaseSeconds = (value: unknown): value is number => (
  typeof value === 'number'
  && Number.isSafeInteger(value)
  && value >= 1
  && value <= 1_200
);

const boundedAdmissionRequestFrom = (
  body: unknown,
): BoundedAdmissionRequest | null => {
  const record = objectRecordFrom(body);
  if (record === null) return null;
  const role = boundedAdmissionRoleFrom(record.role);
  const workerId = trimmedStringFrom(record.workerId);
  const roleCredential = trimmedStringFrom(record.roleCredential);
  if (
    role === null
    || !workerId
    || !roleCredential
    || !validBoundedLeaseSeconds(record.leaseSeconds)
  ) {
    return null;
  }
  return { role, workerId, roleCredential, leaseSeconds: record.leaseSeconds };
};


type WorkerGatewayRequest = Readonly<{
  role: AffiliateAgentBoundedAdmissionRole;
  workerId: string;
  roleCredential: string;
}>;

const workerGatewayRequestFrom = (body: unknown): WorkerGatewayRequest | null => {
  const record = objectRecordFrom(body);
  if (record === null) return null;
  const role = boundedAdmissionRoleFrom(record.role);
  const workerId = trimmedStringFrom(record.workerId);
  const roleCredential = trimmedStringFrom(record.roleCredential);
  if (role === null || !workerId || !roleCredential) return null;
  return { role, workerId, roleCredential };
};

const isReconcileReport = (
  value: unknown,
): value is AffiliateAgentReconcileReport => {
  const record = objectRecordFrom(value);
  if (record === null) return false;
  const integerFields = [
    "examinedClaims",
    "expiredClaims",
    "examinedReceipts",
    "recoveredReceipts",
    "completedReceipts",
    "unresolvedReceipts",
  ];
  return integerFields.every((field) => (
    typeof record[field] === "number"
    && Number.isSafeInteger(record[field])
    && record[field] >= 0
  )) && typeof record.isAdmissionHalted === "boolean";
};

const isWorkerReconcileResult = (
  value: unknown,
): value is Readonly<{
  report: AffiliateAgentReconcileReport;
  admissionOpen: boolean;
}> => {
  const record = objectRecordFrom(value);
  return record !== null
    && "report" in record
    && isReconcileReport(record.report)
    && typeof record.admissionOpen === "boolean";
};

const workerRequestAuthorized = async (
  input: AffiliateAgentGatewayHttpDependencies,
  body: unknown,
): Promise<WorkerGatewayRequest | null> => {
  const worker = workerGatewayRequestFrom(body);
  if (worker === null || !(await input.verifyWorkerCredential(worker))) return null;
  return worker;
};

export type AffiliateAgentGatewayHttpDependencies = Readonly<{
  legacyRepairAdmission?: (request: LegacyRepairAdmissionRequest) => Promise<unknown>;
  gateway: AffiliateAgentGateway;
  replenishment: () => Promise<AffiliateGovernedReplenishmentControllerResult>;
  invocationReconciler: AffiliateAgentInvocationReconciler;
  health: () => Promise<void>;
  readiness: (
    role?: AffiliateAgentBoundedAdmissionRole,
    workerId?: string,
  ) => Promise<boolean>;
  claimAdmissionReadiness: (
    input: unknown,
  ) => Promise<AffiliateAgentClaimAdmissionDecision>;
  workerHealth: AffiliateAgentWorkerHealthWriter;
  verifyWorkerCredential: (
    input: Readonly<{
      role: AffiliateAgentRole;
      workerId: string;
      roleCredential: string;
    }>,
  ) => Promise<boolean>;
  admission: AffiliateAgentGatewayAdmission;
  operatorToken: string;
  replenishmentToken: string;
  supervisorHaltCredential: string;
  pathPrefix: string;
}>;
const reconcileGatewayWithAdmission = async (
  gateway: AffiliateAgentGateway,
  admission: AffiliateAgentGatewayAdmission,
  input?: AffiliateAgentReconcileRequest,
): Promise<AffiliateAgentReconcileReport> => {
  try {
    const report = await gateway.reconcile(input);
    if (report.isAdmissionHalted) await admission.close();
    return report;
  } catch (error) {
    await admission.close();
    throw error;
  }
};


const operatorTokenMatches = (
  request: IncomingMessage,
  operatorToken: string,
): boolean => request.headers['x-affiliate-gateway-operator-token'] === operatorToken;

const replenishmentTokenMatches = (
  request: IncomingMessage,
  replenishmentToken: string,
): boolean => request.headers['x-affiliate-gateway-replenishment-token'] === replenishmentToken;

const supervisorHaltCredentialMatches = (
  request: IncomingMessage,
  credential: string,
): boolean => request.headers['x-affiliate-gateway-supervisor-halt-credential'] === credential;


type AffiliateAgentGatewayHttpRequest = Readonly<{
  method: string;
  route: string | null;
  url: string;
}>;

const normalizeGatewayPathPrefix = (pathPrefix: string | undefined): string => {
  const normalized = (pathPrefix?.trim() || DEFAULT_GATEWAY_PATH_PREFIX).replace(/\/+$/, '');
  return normalized || '/';
};

const parseGatewayHttpRequest = (
  request: IncomingMessage,
  pathPrefix: string,
): AffiliateAgentGatewayHttpRequest => {
  const rawRoute = request.url?.split('?')[0] ?? '/';
  const route = pathPrefix === '/'
    ? rawRoute
    : rawRoute === pathPrefix
      ? '/'
      : rawRoute.startsWith(`${pathPrefix}/`)
        ? rawRoute.slice(pathPrefix.length)
        : null;
  return {
    method: request.method ?? 'GET',
    route,
    url: request.url ?? '/',
  };
};

const matchesGatewayRequest = (
  request: AffiliateAgentGatewayHttpRequest,
  method: string,
  route: string,
): boolean => request.method === method && request.route === route;

const sendUnauthorized = (response: ServerResponse): void => {
  sendJson(response, 401, { error: 'Unauthorized.' });
};

const authorizeOperatorRequest = (
  request: IncomingMessage,
  response: ServerResponse,
  operatorToken: string,
): boolean => {
  if (operatorTokenMatches(request, operatorToken)) return true;
  sendUnauthorized(response);
  return false;
};

const handleHealthRequest = async (
  request: AffiliateAgentGatewayHttpRequest,
  response: ServerResponse,
  input: AffiliateAgentGatewayHttpDependencies,
): Promise<boolean> => {
  if (!matchesGatewayRequest(request, 'GET', '/healthz')) return false;
  try {
    await input.health();
  } catch (error) {
    if (isAuthorityHealthFailure(error)) await input.admission.close();
    throw error;
  }
  sendJson(response, 200, { status: 'ok' });
  return true;
};

const readinessScopeFromUrl = (
  rawUrl: string,
): Readonly<{
  role?: AffiliateAgentBoundedAdmissionRole;
  workerId?: string;
  isInvalid: boolean;
}> => {
  const url = new URL(rawUrl, "http://affiliate-agent-gateway");
  const roleParameter = url.searchParams.get("role");
  const workerParameter = url.searchParams.get("workerId");
  if (roleParameter === null && workerParameter === null) {
    return { isInvalid: false };
  }
  const role = roleParameter === null
    ? undefined
    : boundedAdmissionRoleFrom(roleParameter);
  const workerId = workerParameter?.trim() || undefined;
  return {
    role: role === null ? undefined : role,
    workerId,
    isInvalid: role === null
      || workerId === undefined
      || roleParameter === null,
  };
};

const handleReadinessRequest = async (
  request: AffiliateAgentGatewayHttpRequest,
  response: ServerResponse,
  input: AffiliateAgentGatewayHttpDependencies,
): Promise<boolean> => {
  if (!matchesGatewayRequest(request, 'GET', '/readiness')) return false;
  const scope = readinessScopeFromUrl(request.url);
  const isReady = scope.isInvalid
    ? false
    : await input.readiness(scope.role, scope.workerId);
  sendJson(response, isReady ? 200 : 503, {
    status: isReady ? 'ready' : 'waiting',
    ready: isReady,
  });
  return true;
};

const handleAdmissionStatusRequest = (
  request: IncomingMessage,
  httpRequest: AffiliateAgentGatewayHttpRequest,
  response: ServerResponse,
  input: AffiliateAgentGatewayHttpDependencies,
): boolean => {
  if (!matchesGatewayRequest(httpRequest, 'GET', '/admission')) return false;
  if (!authorizeOperatorRequest(request, response, input.operatorToken)) return true;
  const isOpen = input.admission.isOpen();
  sendJson(response, 200, {
    status: isOpen ? 'open' : 'closed',
    open: isOpen,
  });
  return true;
};

type AffiliateAgentGatewayWorkerHealth = Readonly<{
  workerId: string;
  role: string;
  status: string;
  heartbeatAt: Date | null;
  leaseExpiresAt: Date | null;
}>;

const isHealthyGatewayWorker = (
  worker: AffiliateAgentGatewayWorkerHealth,
  now: Date,
): boolean => (
  worker.status === "HEALTHY"
  && worker.heartbeatAt !== null
  && worker.heartbeatAt <= now
  && worker.leaseExpiresAt !== null
  && worker.leaseExpiresAt > now
);

const downstreamHealthyWorkersFor = (
  workers: readonly AffiliateAgentGatewayWorkerHealth[],
  now: Date,
): AffiliateAgentGatewayWorkerHealth[] => workers.filter((worker) => (
  (worker.role === "MAPPING_PRODUCER" || worker.role === "SUPPLY_REVIEWER")
  && isHealthyGatewayWorker(worker, now)
));

const exactWorkerIsHealthy = (
  workers: readonly AffiliateAgentGatewayWorkerHealth[],
  now: Date,
  role: AffiliateAgentBoundedAdmissionRole,
  workerId: string,
): boolean => workers.some((worker) => (
  worker.role === role
  && worker.workerId === workerId
  && isHealthyGatewayWorker(worker, now)
));

const hasHealthyExpectedReviewer = (
  workers: readonly AffiliateAgentGatewayWorkerHealth[],
): boolean => workers.some((worker) => (
  worker.role === "SUPPLY_REVIEWER"
  && AFFILIATE_DOWNSTREAM_WORKERS.some((expectedWorker) => (
    expectedWorker.role === worker.role && expectedWorker.workerId === worker.workerId
  ))
));

const roleAdmissionIsReady = (
  role: AffiliateAgentBoundedAdmissionRole,
  exactWorkerHealthy: boolean,
  healthyExpectedReviewer: boolean,
  downstreamReady: boolean,
): boolean => {
  switch (role) {
    case "MAPPING_PRODUCER":
      return exactWorkerHealthy && healthyExpectedReviewer;
    case "SUPPLY_REVIEWER":
    case "HUMAN_DIRECTED_EXECUTOR":
      return exactWorkerHealthy;
    case "COVERAGE_PLANNER":
      return exactWorkerHealthy && downstreamReady;
  }
};

export const isAdmissionRoleReady = (
  workers: readonly AffiliateAgentGatewayWorkerHealth[],
  now: Date,
  role?: AffiliateAgentBoundedAdmissionRole,
  workerId?: string,
): boolean => {
  const downstreamWorkers = downstreamHealthyWorkersFor(workers, now);
  const downstreamReady = isAffiliateDownstreamFleetReady(downstreamWorkers, now);
  if (role === undefined && workerId === undefined) return downstreamReady;
  if (role === undefined || workerId === undefined) return false;
  return roleAdmissionIsReady(
    role,
    exactWorkerIsHealthy(workers, now, role, workerId),
    hasHealthyExpectedReviewer(downstreamWorkers),
    downstreamReady,
  );
};

const openAdmissionWhenReady = async (
  input: AffiliateAgentGatewayHttpDependencies,
  request: BoundedAdmissionRequest,
): Promise<AffiliateAgentBoundedAdmissionLease | null> => {
  if (!(await input.readiness(request.role, request.workerId))) return null;
  return input.admission.openBoundedLease(request);
};

const handleAdmissionOpenRequest = async (
  request: IncomingMessage,
  httpRequest: AffiliateAgentGatewayHttpRequest,
  response: ServerResponse,
  input: AffiliateAgentGatewayHttpDependencies,
): Promise<boolean> => {
  if (!matchesGatewayRequest(httpRequest, 'POST', '/admission/open')) return false;
  if (!authorizeOperatorRequest(request, response, input.operatorToken)) return true;
  const admissionRequest = boundedAdmissionRequestFrom(await readJson(request));
  if (!admissionRequest) {
    sendJson(response, 400, {
      error: {
        code: 'INVALID_REQUEST',
        safeMessage: 'Bounded admission lease fields are invalid.',
        isRetryable: false,
      },
    });
    return true;
  }
  if (!(await input.verifyWorkerCredential(admissionRequest))) {
    sendUnauthorized(response);
    return true;
  }
  const lease = await openAdmissionWhenReady(input, admissionRequest);
  if (!lease) {
    sendJson(response, 503, {
      status: 'waiting',
      open: false,
      ready: false,
    });
    return true;
  }
  sendJson(response, 200, { status: 'open', open: true, lease });
  return true;
};

const handleAdmissionCloseRequest = async (
  request: IncomingMessage,
  httpRequest: AffiliateAgentGatewayHttpRequest,
  response: ServerResponse,
  input: AffiliateAgentGatewayHttpDependencies,
): Promise<boolean> => {
  if (!matchesGatewayRequest(httpRequest, 'POST', '/admission/close')) return false;
  if (!authorizeOperatorRequest(request, response, input.operatorToken)) return true;
  await input.admission.close();
  sendJson(response, 200, { status: 'closed', open: false });
  return true;
};

const handleSupervisorAdmissionCloseRequest = async (
  request: IncomingMessage,
  httpRequest: AffiliateAgentGatewayHttpRequest,
  response: ServerResponse,
  input: AffiliateAgentGatewayHttpDependencies,
): Promise<boolean> => {
  if (!matchesGatewayRequest(httpRequest, 'POST', '/admission/supervisor/close')) return false;
  const admissionRequest = workerGatewayRequestFrom(await readJson(request));
  if (!admissionRequest) {
    sendJson(response, 400, {
      error: {
        code: 'INVALID_REQUEST',
        safeMessage: 'Worker admission fields are invalid.',
        isRetryable: false,
      },
    });
    return true;
  }
  if (!(await input.verifyWorkerCredential(admissionRequest))) {
    sendUnauthorized(response);
    return true;
  }
  await input.admission.close();
  sendJson(response, 200, { result: { status: 'closed', open: false } });
  return true;
};

const handleWorkerAdmissionCloseRequest = (
  httpRequest: AffiliateAgentGatewayHttpRequest,
  response: ServerResponse,
): boolean => {
  if (!matchesGatewayRequest(httpRequest, 'POST', '/admission/worker/close')) return false;
  sendUnauthorized(response);
  return true;
};

const handleAdmissionRequest = async (
  request: IncomingMessage,
  httpRequest: AffiliateAgentGatewayHttpRequest,
  response: ServerResponse,
  input: AffiliateAgentGatewayHttpDependencies,
): Promise<boolean> => {
  if (handleAdmissionStatusRequest(request, httpRequest, response, input)) return true;
  if (await handleAdmissionOpenRequest(request, httpRequest, response, input)) return true;
  if (handleWorkerAdmissionCloseRequest(httpRequest, response)) return true;
  if (await handleSupervisorAdmissionCloseRequest(request, httpRequest, response, input)) return true;
  if (await handleAdmissionCloseRequest(request, httpRequest, response, input)) return true;
  return false;
};

const handleWorkerHeartbeatRequest = async (
  request: IncomingMessage,
  httpRequest: AffiliateAgentGatewayHttpRequest,
  response: ServerResponse,
  input: AffiliateAgentGatewayHttpDependencies,
): Promise<boolean> => {
  if (!matchesGatewayRequest(httpRequest, 'POST', '/worker/heartbeat')) return false;
  const heartbeat = workerHeartbeatRequestFrom(await readJson(request));
  if (
    heartbeat === null
    || !(await input.verifyWorkerCredential(heartbeat))


  ) {
    sendUnauthorized(response);
    return true;
  }
  await input.workerHealth.heartbeat({
    workerId: heartbeat.workerId,
    role: heartbeat.role,
    now: new Date(),
  });
  sendJson(response, 200, { result: { accepted: true } });
  return true;
};
const handleWorkerReconcileRequest = async (
  httpRequest: AffiliateAgentGatewayHttpRequest,
  response: ServerResponse,
  input: AffiliateAgentGatewayHttpDependencies,
  body: unknown,
): Promise<boolean> => {
  if (!matchesGatewayRequest(httpRequest, 'POST', '/reconcile/worker')) return false;
  const worker = await workerRequestAuthorized(input, body);
  if (worker === null) {
    sendUnauthorized(response);
    return true;
  }
  const report = await reconcileGatewayWithAdmission(
    input.gateway,
    input.admission,
    { limit: 1 },
  );
  const admissionOpen = input.admission.isOpen();
  sendJson(response, 200, {
    result: { report, admissionOpen },
  });
  return true;
};


const handleWorkerAdmissionStatusRequest = async (
  httpRequest: AffiliateAgentGatewayHttpRequest,
  response: ServerResponse,
  input: AffiliateAgentGatewayHttpDependencies,
  body: unknown,
): Promise<boolean> => {
  if (!matchesGatewayRequest(httpRequest, 'POST', '/admission/worker/status')) return false;
  const worker = await workerRequestAuthorized(input, body);
  if (worker === null) {
    sendUnauthorized(response);
    return true;
  }
  const open = input.admission.isOpen();
  sendJson(response, 200, { result: { status: open ? 'open' : 'closed', open } });
  return true;
};

const sendGatewayResult = (response: ServerResponse, result: unknown): void => {
  sendJson(response, 200, { result: toHttpResult(result) });
};

const claimAdmissionIsBlocked = async (
  input: AffiliateAgentGatewayHttpDependencies,
  body: unknown,
): Promise<boolean> => (
  await input.claimAdmissionReadiness(body) === "NOT_READY"
);

const handleReplenishmentRequest = async (
  request: IncomingMessage,
  httpRequest: AffiliateAgentGatewayHttpRequest,
  response: ServerResponse,
  input: AffiliateAgentGatewayHttpDependencies,
): Promise<boolean> => {
  if (!matchesGatewayRequest(httpRequest, 'POST', '/replenishment')) return false;
  if (!replenishmentTokenMatches(request, input.replenishmentToken)) {
    sendUnauthorized(response);
    return true;
  }
  const result = await input.replenishment();
  sendJson(response, 200, { result });
  return true;
};

const legacyRepairAdmissionRequestSchema = z.object({
  mode: z.enum(['PREVIEW', 'APPLY']),
  limit: z.number().int().min(1).max(20).default(1),
  jobIds: z.array(z.string().trim().min(1).max(200)).min(1).max(20).optional(),
  expectedReportHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict().superRefine((value, context) => {
  if (value.mode === 'APPLY' && !value.expectedReportHash) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Apply requires a reviewed report hash.',
    });
  }
});
type LegacyRepairAdmissionRequest = z.infer<typeof legacyRepairAdmissionRequestSchema>;

const handleLegacyRepairAdmissionRequest = async (
  request: IncomingMessage,
  httpRequest: AffiliateAgentGatewayHttpRequest,
  response: ServerResponse,
  input: AffiliateAgentGatewayHttpDependencies,
  body: unknown,
): Promise<boolean> => {
  if (httpRequest.route !== '/legacy-repair/admission') return false;
  if (!authorizeOperatorRequest(request, response, input.operatorToken)) return true;
  const parsed = legacyRepairAdmissionRequestSchema.safeParse(body);
  if (!parsed.success) {
    sendJson(response, 400, { error: 'Invalid legacy repair admission request.' });
    return true;
  }
  if (!input.legacyRepairAdmission) {
    sendJson(response, 503, { error: 'Legacy repair admission is unavailable.' });
    return true;
  }
  try {
    sendGatewayResult(response, await input.legacyRepairAdmission(parsed.data));
  } catch (error) {
    if (!(error instanceof AffiliateLegacyRepairAdmissionError)) throw error;
    sendJson(response, 409, {
      error: { code: error.code, safeMessage: error.message, isRetryable: false, details: error.details },
    });
  }
  return true;
};

const handlePostRoute = async (
  request: IncomingMessage,
  httpRequest: AffiliateAgentGatewayHttpRequest,
  response: ServerResponse,
  input: AffiliateAgentGatewayHttpDependencies,
  body: unknown,
): Promise<void> => {
  if (httpRequest.route === '/claim') {
    if (await claimAdmissionIsBlocked(input, body)) {
      sendGatewayResult(response, null);
      return;
    }
    const result = await input.gateway.claim(body as AffiliateAgentClaimRequest);
    sendGatewayResult(response, result);
    return;
  }
  if (httpRequest.route === '/perform') {
    const result = await input.gateway.perform(body as AffiliateAgentClaimOperation);
    sendGatewayResult(response, result);
    return;
  }
  if (httpRequest.route === '/reconcile/invocation') {
    const result = await input.invocationReconciler.reconcileInvocation(
      body as Parameters<typeof input.invocationReconciler.reconcileInvocation>[0],
    );
    sendGatewayResult(response, result);
    return;
  }
  if (httpRequest.route === '/reconcile') {
    if (!authorizeOperatorRequest(request, response, input.operatorToken)) return;
    const result = await reconcileGatewayWithAdmission(
      input.gateway,
      input.admission,
      body as Parameters<typeof input.gateway.reconcile>[0],
    );
    sendJson(response, 200, { result });
    return;
  }
  sendEmpty(response, 404);
};

const handlePostRequest = async (
  request: IncomingMessage,
  httpRequest: AffiliateAgentGatewayHttpRequest,
  response: ServerResponse,
  input: AffiliateAgentGatewayHttpDependencies,
): Promise<void> => {
  if (httpRequest.method !== 'POST') {
    sendEmpty(response, 405);
    return;
  }
  const body = await readJson(request);
  if (await handleWorkerReconcileRequest(httpRequest, response, input, body)) return;
  if (await handleWorkerAdmissionStatusRequest(httpRequest, response, input, body)) return;
  if (await handleReplenishmentRequest(request, httpRequest, response, input)) return;
  if (await handleLegacyRepairAdmissionRequest(request, httpRequest, response, input, body)) return;
  await handlePostRoute(request, httpRequest, response, input, body);
};

const databaseAuthorizationCodes = new Set([
  'P1000',
  'P1010',
  '28P01',
  '28000',
  '42501',
]);

const prismaErrorCodesFrom = (
  value: unknown,
  depth = 0,
): readonly string[] => {
  const record = objectRecordFrom(value);
  if (record === null || depth > 2) return [];
  const codes: string[] = [];
  for (const key of ["code", "originalCode", "sqlState", "sqlstate"]) {
    const code = record[key];
    if (typeof code === "string") codes.push(code.toUpperCase());
  }
  for (const nested of [record.driverAdapterError, record.cause, record.meta]) {
    codes.push(...prismaErrorCodesFrom(nested, depth + 1));
  }
  return codes;
};

const isDatabaseAuthorizationFailure = (error: unknown): boolean => (
  prismaErrorCodesFrom(error).some((code) => databaseAuthorizationCodes.has(code))
);

const isAuthorityHealthFailure = (error: unknown): boolean => {
  if (isDatabaseAuthorizationFailure(error)) return true;
  if (
    error instanceof AffiliateAgentGatewayError
    && (error.code === 'SUPPLY_CONTRACT_STALE'
      || error.code === 'DEPLOYMENT_CONTRACT_STALE')
  ) {
    return true;
  }
  if (!(error instanceof Error)) return false;
  return error.message === 'No active Affiliate Supply Contract is published for this rollout cohort.'
    || error.name === 'ZodError'
    || /\b(?:contract|bundle)\b.*\b(?:mismatch|stale|invalid|failed)\b/i.test(error.message)
    || /\b(?:mismatch|stale|invalid|failed)\b.*\b(?:contract|bundle)\b/i.test(error.message)
    || /\b(?:database\s+)?authorization\b.*\b(?:failed|denied|invalid|lost)\b/i.test(
      error.message,
    );
};

const handleGatewayRequestError = async (
  response: ServerResponse,
  error: unknown,
  input: AffiliateAgentGatewayHttpDependencies,
): Promise<void> => {
  if (isDatabaseAuthorizationFailure(error)) {
    await input.admission.close();
    sendJson(response, 409, {
      error: {
        code: 'GATEWAY_ADMISSION_HALTED',
        safeMessage: 'Gateway admission is halted because gateway database authorization failed.',
        isRetryable: false,
      },
    });
    return;
  }
  if (error instanceof AffiliateAgentGatewayError) {
    if (error.code === 'GATEWAY_ADMISSION_HALTED') {
      await input.admission.close();
    }
    sendJson(response, httpStatusForError(error), {
      error: {
        code: error.code,
        safeMessage: error.safeMessage,
        isRetryable: error.isRetryable,
        ...(error.receiptId ? { receiptId: error.receiptId } : {}),
      },
    });
    return;
  }
  const message = error instanceof Error ? error.message : 'Gateway request failed.';
  const isBadRequest = message === 'Request body is too large.'
    || message === 'Request body is not valid JSON.';
  if (!isBadRequest) {
    console.error('[affiliate:gateway] request failed', error);
  }
  const statusCode = isBadRequest ? 400 : 503;
  sendJson(response, statusCode, {
    error: {
      code: 'INTERNAL_ERROR',
      safeMessage: isBadRequest ? message : 'Gateway request failed.',
      isRetryable: statusCode >= 500,
    },
  });
};

const handleAffiliateAgentGatewayRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  input: AffiliateAgentGatewayHttpDependencies,
  pathPrefix: string,
): Promise<void> => {
  try {
    const httpRequest = parseGatewayHttpRequest(request, pathPrefix);
    if (httpRequest.route === null) {
      sendEmpty(response, 404);
      return;
    }
    if (await handleHealthRequest(httpRequest, response, input)) return;
    if (await handleReadinessRequest(httpRequest, response, input)) return;
    if (await handleWorkerHeartbeatRequest(request, httpRequest, response, input)) return;
    if (await handleAdmissionRequest(request, httpRequest, response, input)) return;
    await handlePostRequest(request, httpRequest, response, input);
  } catch (error) {
    await handleGatewayRequestError(response, error, input);
  }
};

export const createAffiliateAgentGatewayRequestHandler = (
  input: AffiliateAgentGatewayHttpDependencies,
): AffiliateAgentGatewayRequestHandler => {
  if (input.operatorToken === input.replenishmentToken) {
    throw new Error('Gateway operator and replenishment credentials must be distinct.');
  }
  const pathPrefix = normalizeGatewayPathPrefix(input.pathPrefix);
  return (request, response) => handleAffiliateAgentGatewayRequest(
    request,
    response,
    input,
    pathPrefix,
  );
};

type AffiliateAgentGatewayRuntime = Readonly<{
  legacyRepairAdmission: (request: LegacyRepairAdmissionRequest) => Promise<unknown>;
  gateway: AffiliateAgentGateway;
  replenishment: () => Promise<AffiliateGovernedReplenishmentControllerResult>;
  invocationReconciler: AffiliateAgentInvocationReconciler;
  health: () => Promise<void>;
  reconcile: () => Promise<AffiliateAgentReconcileReport>;
  readiness: (
    role?: AffiliateAgentBoundedAdmissionRole,
    workerId?: string,
  ) => Promise<boolean>;
  claimAdmissionReadiness: (
    input: unknown,
  ) => Promise<AffiliateAgentClaimAdmissionDecision>;
  workerHealth: AffiliateAgentWorkerHealthWriter;
  verifyWorkerCredential: typeof verifyRoleCredential;
  admission: AffiliateAgentGatewayAdmission;
  supervisorHaltCredential: string;
}>;

const createGateway = async (): Promise<AffiliateAgentGatewayRuntime> => {
  validateConfiguredWorkerCredentials();
  const supervisorHaltCredential = requiredAffiliateAgentSupervisorHaltCredential();
  const admission = createAffiliateAgentGatewayAdmission();
  process.env.DATABASE_URL = requiredEnvironment('AFFILIATE_GATEWAY_DATABASE_URL');
  const database = affiliateSupplyDatabase(prisma);
  const rolloutCohort = requiredEnvironment('AFFILIATE_SUPPLY_ROLLOUT_COHORT');
  const deploymentContract = affiliateAgentDeploymentContractSchema.parse(
    JSON.parse(requiredEnvironment('AFFILIATE_AGENT_DEPLOYMENT_CONTRACT_JSON')),
  );
  const preflightReport = JSON.parse(
    requiredEnvironment('AFFILIATE_AGENT_PREFLIGHT_REPORT_JSON'),
  ) as AffiliateCutoverPreflightReport;
  const assertStartupPreflight = (active: Awaited<ReturnType<typeof loadActiveAffiliateSupplyContract>>): void => {
    const now = new Date();
    if (
      !isAffiliateCutoverPreflightReportIntact(preflightReport)
      || !isAffiliateCutoverPreflightApplySafe(preflightReport)
      || preflightReport.isReady !== true
      || !isAffiliateCutoverPreflightFresh(preflightReport, now)
      || preflightReport.supplyContractVersion !== active.manifest.version
      || preflightReport.supplyContractHash !== active.manifest.supplyContract.hash
      || preflightReport.deploymentContractVersion !== deploymentContract.version
      || preflightReport.deploymentContractHash !== deploymentContract.hash
      || preflightReport.gatewayVersion !== deploymentContract.gatewayVersion
    ) {
      throw new Error('Affiliate gateway startup preflight is missing, invalid, mismatched, or stale.');
    }
  };
  const workspaceSigningKey = signingKey('AFFILIATE_AGENT_WORKSPACE_SIGNING_KEY');
  const storage = getStorageProvider();

  const contracts = {
    loadActiveBundle: async () => {
      const active = await loadActiveAffiliateSupplyContract({
        db: database,
        rolloutCohort,
      });
      return affiliateAgentContractBundleSchema.parse({
        schemaVersion: 1,
        supplyContract: active.manifest.supplyContract,
        roleContracts: AFFILIATE_AGENT_ROLES.map((role) => AFFILIATE_AGENT_ROLE_CONTRACTS[role]),
        promptTemplates: AFFILIATE_AGENT_ROLES.map((role) => AFFILIATE_AGENT_PROMPT_TEMPLATES[role]),
        deploymentContract,
      });
    },
  };
  const artifactStore = createAffiliateAgentGatewayArtifactStore(prisma, storage);

  const productionAdapters = createProductionAffiliateAgentGatewayAdapters({
    prisma,
    artifacts: artifactStore,
    storage,
    activationTargetWriter: ({ claim, result }) => {
      if (
        claim.role !== 'SUPPLY_REVIEWER'
        || claim.supplySourceId === null
        || result.claimId !== claim.claimId
        || result.claimGeneration !== claim.claimGeneration
        || result.invocationId !== claim.invocationId
        || result.workerId !== claim.workerId
      ) {
        throw new Error('Affiliate gateway activation writer requires admitted reviewer identity.');
      }
      return createAffiliateSupplyActivationTargetWriter({
        actorId: claim.workerId,
        claimId: claim.claimId,
        claimGeneration: claim.claimGeneration,
        invocationId: claim.invocationId,
        supplySourceId: claim.supplySourceId,
      });
    },
  });
  const workerReadiness = async (
    role?: AffiliateAgentBoundedAdmissionRole,
    workerId?: string,
  ): Promise<boolean> => {
    const now = new Date();
    const rows = await database.workerHealth.findMany({
      where: {
        role: {
          in: [
            'COVERAGE_PLANNER',
            'MAPPING_PRODUCER',
            'SUPPLY_REVIEWER',
            'HUMAN_DIRECTED_EXECUTOR',
          ],
        },
      },
      select: {
        workerId: true,
        role: true,
        status: true,
        heartbeatAt: true,
        leaseExpiresAt: true,
      },
    });
    return isAdmissionRoleReady(rows, now, role, workerId);
  };

  const dependencies = createProductionAffiliateAgentGatewayDependencies({
    prisma,
    tokenSigningKey: signingKey('AFFILIATE_AGENT_TOKEN_SIGNING_KEY'),
    tokenKeyVersion: requiredEnvironment('AFFILIATE_AGENT_TOKEN_KEY_VERSION'),
    credentials: { verify: verifyRoleCredential },
    workspaces: {
      verify: (attestation) => verifyWorkspaceAttestation(attestation, workspaceSigningKey),
    },
    contracts,
    artifacts: artifactStore,
    commands: productionAdapters.commands,
    terminalEffects: productionAdapters.terminalEffects,
    claimAdmission: admission,
  });
  const workerHealth = dependencies.workerHealth;
  if (workerHealth === undefined) {
    throw new Error('Affiliate gateway worker health wiring is incomplete.');
  }
  const gateway = createPrismaAffiliateAgentGateway(dependencies);
  const claimAdmissionReadiness = async (
    value: unknown,
  ): Promise<AffiliateAgentClaimAdmissionDecision> => {
    const input = await validateAffiliateAgentClaimForAdmission(dependencies, value);
    const replay = await database.gatewayClaims.findUnique({
      where: { claimRequestId: input.idempotencyKey },
      select: { id: true },
    });
    if (replay !== null) return "REPLAY";
    return await workerReadiness(input.role, input.workerId)
      ? "READY"
      : "NOT_READY";
  };
  const invocationReconciler = createPrismaAffiliateAgentInvocationReconciler(dependencies);
  const healthChecks = createAffiliateGatewayHealthChecks({
    assertStartup: async () => {
      const active = await loadActiveAffiliateSupplyContract({
        db: database,
        rolloutCohort,
      });
      assertStartupPreflight(active);
    },
    checkLive: async () => {
      await contracts.loadActiveBundle();
    },
  });
  await healthChecks.startup();
  return {
    gateway,
    legacyRepairAdmission: (request) => admission.withClaim(async () => {
      if (admission.isOpen()) {
        throw new Error('Close claim admission before legacy repair admission.');
      }
      const bundle = await contracts.loadActiveBundle();
      const options = {
        prisma,
        bundle,
        limit: request.limit,
        jobIds: request.jobIds,
      };
      if (request.mode === 'PREVIEW') {
        return previewAffiliateLegacyRepairAdmission(options);
      }
      if (!request.expectedReportHash) {
        throw new Error('Legacy repair apply requires a reviewed hash.');
      }
      const active = await loadActiveAffiliateSupplyContract({ db: database, rolloutCohort });
      assertStartupPreflight(active);
      return applyAffiliateLegacyRepairAdmission({
        ...options,
        expectedReportHash: request.expectedReportHash,
        operatorId: 'affiliate-gateway-operator',
      });
    }),
    replenishment: () => runAffiliateGovernedReplenishment({
      db: database,
      rolloutCohort,
      enabled: true,
      isContractSafe: true,
    }),
    invocationReconciler,
    health: healthChecks.check,
    reconcile: () => reconcileGatewayWithAdmission(gateway, admission),
    readiness: workerReadiness,
    claimAdmissionReadiness,
    workerHealth,
    verifyWorkerCredential: verifyRoleCredential,
    admission,
    supervisorHaltCredential,
  };
};

const createAffiliateAgentGatewayServer = (
  runtime: AffiliateAgentGatewayRuntime,
  operatorToken: string,
  replenishmentToken: string,
): Server => {
  const pathPrefix = normalizeGatewayPathPrefix(process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX);
  const handler = createAffiliateAgentGatewayRequestHandler({
    ...runtime,
    operatorToken,
    replenishmentToken,
    pathPrefix,
  });
  return createServer(handler);
};

const listenAffiliateAgentGatewayServer = (server: Server, port: number): void => {
  server.listen(port, '0.0.0.0', () => {
    process.stdout.write(`affiliate-agent-gateway listening on ${port}\n`);
  });
};

const registerAffiliateAgentGatewayShutdown = (
  server: Server,
  reconcileTimer: NodeJS.Timeout,
  waitForReconcile: () => Promise<void>,
): void => {
  let isClosing = false;
  const close = () => {
    if (isClosing) return;
    isClosing = true;
    clearInterval(reconcileTimer);
    void waitForReconcile()
      .catch((error) => {
        console.error('[affiliate:gateway] reconcile did not finish during shutdown', error);
      })
      .finally(() => server.close(() => process.exit(0)));
  };
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
};

const run = async (): Promise<void> => {
  const operatorToken = requiredAffiliateGatewayOperatorToken();
  const replenishmentToken = requiredAffiliateGatewayReplenishmentToken();
  const supervisorHaltCredential = requiredAffiliateAgentSupervisorHaltCredential();
  const workerCredentials = validateConfiguredWorkerCredentials();
  validateAffiliateGatewayCredentialCollisions(
    operatorToken,
    replenishmentToken,
    supervisorHaltCredential,
    workerCredentials,
  );
  const runtime = await createGateway();
  let reconciliationInFlight: Promise<void> | null = null;
  const reconcile = (): Promise<void> => {
    if (reconciliationInFlight !== null) return reconciliationInFlight;
    const current = runtime.reconcile()
      .then((report) => {
        if (report.isAdmissionHalted) {
          console.error('[affiliate:gateway] admission remains halted after reconciliation');
        }
      })
      .finally(() => {
        if (reconciliationInFlight === current) reconciliationInFlight = null;
      });
    reconciliationInFlight = current;
    return current;
  };
  await runtime.health();
  const server = createAffiliateAgentGatewayServer(runtime, operatorToken, replenishmentToken);
  listenAffiliateAgentGatewayServer(server, parsePort());
  const reconcileTimer = setInterval(() => {
    void reconcile().catch((error) => {
      console.error('[affiliate:gateway] scheduled reconcile failed', error);
    });
  }, AFFILIATE_AGENT_GATEWAY_RECONCILE_INTERVAL_MS);
  reconcileTimer.unref?.();
  registerAffiliateAgentGatewayShutdown(
    server,
    reconcileTimer,
    () => reconciliationInFlight ?? Promise.resolve(),
  );
};

if (require.main === module) {
  run().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Gateway startup failed.'}\n`);
    process.exitCode = 1;
  });
}
