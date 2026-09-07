import { readFile, realpath, stat } from 'node:fs/promises';
import { z } from 'zod';
import {
  AFFILIATE_CUTOVER_PREFLIGHT_MAX_AGE_MS,
  buildAffiliateCutoverPreflightReport,
  type AffiliateCutoverPreflightInput,
  type AffiliateCutoverPreflightReport,
  type AffiliateLegacyProcessManifest,
} from '../src/server/affiliateImports/affiliateFleetCutover';
import { readAffiliateCutoverOption } from './affiliate-cutover-cli';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const nonEmptyStringSchema = z.string().refine(
  (value) => value.trim().length > 0,
  'Expected a non-empty string.',
);
const nullableStringSchema = nonEmptyStringSchema.nullable().optional();
const isoTimestampSchema = z.string().refine(
  (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value)),
  'Expected an ISO-8601 timestamp.',
);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 hash.');
const stringRecordSchema = z.record(z.string(), z.string());
const contractSnapshotSchema = z.object({
  supplyContractVersion: z.number().int(),
  supplyContractHash: hashSchema,
  deploymentContractVersion: z.number().int(),
  deploymentContractHash: hashSchema,
  gatewayVersion: z.number().int(),
  roleContractHashes: stringRecordSchema,
  promptTemplateHashes: stringRecordSchema,
}).strict();
const processInventoryRecordSchema = z.object({
  id: nonEmptyStringSchema,
  kind: z.enum(['LEGACY', 'GOVERNED']),
  role: nonEmptyStringSchema.optional(),
  workerId: nonEmptyStringSchema.optional(),
  processClass: nonEmptyStringSchema.optional(),
  command: nonEmptyStringSchema,
  status: nonEmptyStringSchema,
}).strict();
const controlPlaneProcessSchema = z.object({
  id: nonEmptyStringSchema,
  status: nonEmptyStringSchema,
}).strict();

const legacyClaimKindSchema = z.enum([
  'INTAKE',
  'CAPTURE_PAGE',
  'CAPTURE_RUN',
  'CAPTURE_ARTIFACT',
  'DISCOVERY_RESULT',
  'SOURCE',
  'MAPPING',
  'SCRAPE_RUN',
  'MAPPING_JOB',
  'APPROVAL_JOB',
  'CANDIDATE',
  'PUBLIC_TARGET',
  'ORGANIZATION',
  'EVENT',
  'TEAM',
  'FACILITY',
  'GATEWAY_CLAIM',
  'DISCOVERY_RUN',
  'INTAKE_RUN',
  'COVERAGE_JOB',
]);
const legacyClaimSchema = z.object({
  kind: legacyClaimKindSchema,
  id: nonEmptyStringSchema,
  sourceId: nullableStringSchema,
  supplySourceId: nullableStringSchema,
  subjectId: nullableStringSchema,
  role: nullableStringSchema,
  workerId: nullableStringSchema,
  claimGeneration: z.number().int().nullable().optional(),
  status: nonEmptyStringSchema,
  leaseExpiresAt: z.string().nullable().optional(),
  tokenExpiresAt: z.string().nullable().optional(),
}).strict();
const legacyServiceUnitSchema = z.object({
  id: nonEmptyStringSchema,
  isEnabled: nonEmptyStringSchema,
  isActive: nonEmptyStringSchema,
}).strict();
const databasePermissionsSchema = z.object({
  isAgentAllowedToConnectProductionDatabase: z.boolean(),
  isAgentAllowedToWriteProductionDatabase: z.boolean(),
  isAgentAllowedToReadObjectStorage: z.boolean(),
  isAgentAllowedToWriteObjectStorage: z.boolean(),
  isAgentAllowedToCallProviders: z.boolean(),
  isGatewayAllowedToWriteProductionDatabase: z.boolean(),
}).strict();
const containerEnvironmentSchema = z.union([
  z.array(z.string()),
  z.record(z.string(), z.string()),
]);
const agentContainerSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema.optional(),
  user: nonEmptyStringSchema,
  hasReadonlyRootFilesystem: z.boolean(),
  privileged: z.boolean(),
  tmpfs: z.record(z.string(), z.string()),
  environment: containerEnvironmentSchema,
  volumes: z.array(nonEmptyStringSchema).optional(),
  networks: z.array(nonEmptyStringSchema),
  isNetworkInternal: z.boolean(),
  capDrop: z.array(nonEmptyStringSchema),
  capAdd: z.array(nonEmptyStringSchema),
  groupAdd: z.array(nonEmptyStringSchema),
  cgroupNamespace: nonEmptyStringSchema.nullable(),
  ipcMode: nonEmptyStringSchema.nullable(),
  cgroupRelativePath: nonEmptyStringSchema.optional(),
  childUid: z.number().int().positive().optional(),
  childGid: z.number().int().positive().optional(),
  supervisorUid: z.number().int().positive().optional(),
  securityOptions: z.array(nonEmptyStringSchema),
  apparmorProfileSha256: hashSchema.optional(),
}).strict();
const affiliateCutoverInventorySchema = z.object({
  now: isoTimestampSchema,
  expected: contractSnapshotSchema,
  observed: contractSnapshotSchema,
  processInventoryArtifactId: nonEmptyStringSchema,
  processInventoryHash: hashSchema,
  processInventoryCount: z.number().int().nonnegative(),
  processInventory: z.array(processInventoryRecordSchema),
  controlPlaneProcesses: z.array(controlPlaneProcessSchema),
  legacyServiceUnits: z.array(legacyServiceUnitSchema),
  legacyClaims: z.array(legacyClaimSchema),
  databasePermissions: databasePermissionsSchema,
  reviewedAgentNetwork: nonEmptyStringSchema,
  runnerContainer: agentContainerSchema,
  containers: z.array(agentContainerSchema),
  auxiliaryContainers: z.array(agentContainerSchema),
}).strict();

type ReviewedSystemdUnit = Readonly<{
  processId: string;
  unitId: string;
}>;

type LegacyServiceUnitEvidence = Readonly<{
  id: string;
  isEnabled: string;
  isActive: string;
}>;

const readReviewedSystemdUnits = (
  value: unknown,
): ReviewedSystemdUnit[] => {
  if (!Array.isArray(value)) {
    throw new Error('The reviewed manifest systemdUnits field must be an array.');
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`The reviewed manifest systemdUnits entry ${index + 1} must be an object.`);
    }
    assertExactKeys(entry, ['processId', 'unitId'], `The reviewed manifest systemdUnits entry ${index + 1}`);
    if (
      typeof entry.processId !== 'string'
      || !entry.processId.trim()
      || typeof entry.unitId !== 'string'
      || !entry.unitId.trim()
    ) {
      throw new Error(`The reviewed manifest systemdUnits entry ${index + 1} needs non-empty processId and unitId strings.`);
    }
    return {
      processId: entry.processId.trim(),
      unitId: entry.unitId.trim(),
    };
  });
};


export const validateAffiliateLegacyServiceUnitEvidence = (
  reviewedSystemdUnits: readonly ReviewedSystemdUnit[],
  evidence: readonly LegacyServiceUnitEvidence[],
): readonly string[] => {
  const expectedIds = reviewedSystemdUnits.map((unit) => unit.unitId);
  const expectedSet = new Set(expectedIds);
  const observedIds = evidence.map((unit) => unit.id);
  const findings: string[] = [];
  if (new Set(expectedIds).size !== expectedIds.length) {
    findings.push('reviewed manifest systemdUnits contains duplicate unitId values');
  }
  if (new Set(reviewedSystemdUnits.map((unit) => unit.processId)).size !== reviewedSystemdUnits.length) {
    findings.push('reviewed manifest systemdUnits contains duplicate processId values');
  }
  if (new Set(observedIds).size !== observedIds.length) {
    findings.push('cutover inventory legacyServiceUnits contains duplicate IDs');
  }
  const missing = expectedIds.filter((id) => !observedIds.includes(id));
  const unexpected = observedIds.filter((id) => !expectedSet.has(id));
  if (missing.length) findings.push(`missing legacyServiceUnits evidence: ${missing.join(', ')}`);
  if (unexpected.length) findings.push(`unexpected legacyServiceUnits evidence: ${unexpected.join(', ')}`);
  for (const unit of evidence) {
    const enabled = unit.isEnabled.trim().toUpperCase();
    const active = unit.isActive.trim().toUpperCase();
    if (!['DISABLED', 'MASKED'].includes(enabled) || active !== 'INACTIVE') {
      findings.push(`legacyServiceUnits ${unit.id} must be DISABLED or MASKED and INACTIVE`);
    }
  }
  return findings;
};

const assertExactKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
): void => {
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length) {
    throw new Error(`${label} contains unsupported fields: ${unexpected.join(', ')}.`);
  }
};
const isNonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const isNonNegativeInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isInteger(value) && value >= 0
);

const isSha256String = (value: unknown): value is string => (
  typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
);

const isValidDateString = (value: unknown): value is string => (
  typeof value === 'string' && !Number.isNaN(new Date(value).getTime())
);

const reviewedManifestKeys = [
  'schemaVersion',
  'artifactId',
  'processes',
  'processCount',
  'manifestHash',
  'inventoryArtifactId',
  'inventoryHash',
  'inventoryCount',
  'reviewedAt',
  'reviewedBy',
  'systemdUnits',
];

const assertReviewedManifestShape = (
  parsed: Record<string, unknown>,
): void => {
  const isValid = [
    parsed.schemaVersion === 1,
    isNonEmptyString(parsed.artifactId),
    Array.isArray(parsed.processes),
    typeof parsed.processCount === 'number',
    typeof parsed.manifestHash === 'string',
    typeof parsed.inventoryArtifactId === 'string',
    typeof parsed.inventoryHash === 'string',
    typeof parsed.inventoryCount === 'number',
    typeof parsed.reviewedAt === 'string',
    typeof parsed.reviewedBy === 'string',
    Array.isArray(parsed.systemdUnits),
  ].every(Boolean);
  if (!isValid) {
    throw new Error('The reviewed manifest must contain schemaVersion, artifactId, processes, processCount, manifestHash, inventoryArtifactId, inventoryHash, inventoryCount, reviewedAt, reviewedBy, and systemdUnits.');
  }
};

const assertReviewedManifestProcess = (process: unknown): void => {
  if (!isRecord(process)) {
    throw new Error('Every reviewed manifest entry must be an object.');
  }
  assertExactKeys(process, ['id', 'processClass'], 'A reviewed manifest entry');
  if (!isNonEmptyString(process.id) || !isNonEmptyString(process.processClass)) {
    throw new Error('Every reviewed manifest entry needs a non-empty string id and processClass.');
  }
};

const assertReviewedManifestProcesses = (processes: readonly unknown[]): void => {
  for (const process of processes) {
    assertReviewedManifestProcess(process);
  }
};

const assertReviewedManifestReferences = (
  reviewedSystemdUnits: readonly ReviewedSystemdUnit[],
  processes: readonly unknown[],
): void => {
  const processIds = new Set(
    processes
      .filter(isRecord)
      .map((process) => typeof process.id === 'string' ? process.id.trim() : ''),
  );
  const unlistedProcesses = reviewedSystemdUnits.filter((unit) => !processIds.has(unit.processId));
  if (unlistedProcesses.length) {
    throw new Error(`The reviewed manifest systemdUnits must reference reviewed process IDs: ${unlistedProcesses.map((unit) => unit.processId).join(', ')}.`);
  }
};

const assertReviewedManifestMetadata = (parsed: Record<string, unknown>): void => {
  const isValid = [
    isNonNegativeInteger(parsed.processCount),
    isNonNegativeInteger(parsed.inventoryCount),
    isNonEmptyString(parsed.inventoryArtifactId),
    isSha256String(parsed.inventoryHash),
    isNonEmptyString(parsed.reviewedBy),
    isValidDateString(parsed.reviewedAt),
  ].every(Boolean);
  if (!isValid) {
    throw new Error('The reviewed manifest counts, inventory identity, inventory hash, reviewedAt, and reviewedBy fields must be valid.');
  }
};

const readReviewedManifest = async (
  path: string,
): Promise<AffiliateLegacyProcessManifest> => {
  if (!path) throw new Error('Provide --manifest=/path/to/reviewed-legacy-process-manifest.json.');
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isRecord(parsed)) {
    throw new Error('The reviewed manifest must be a JSON object.');
  }
  assertExactKeys(parsed, reviewedManifestKeys, 'The reviewed manifest');
  assertReviewedManifestShape(parsed);
  const processes = parsed.processes;
  if (!Array.isArray(processes)) {
    throw new Error('The reviewed manifest processes field must be an array.');
  }
  const systemdUnits = readReviewedSystemdUnits(parsed.systemdUnits);
  assertReviewedManifestReferences(systemdUnits, processes);
  assertReviewedManifestProcesses(processes);
  assertReviewedManifestMetadata(parsed);
  return {
    ...parsed,
    systemdUnits,
  } as unknown as AffiliateLegacyProcessManifest;
};

const assertIndependentArtifacts = async (
  manifestPath: string,
  inventoryPath: string,
): Promise<void> => {
  const [manifestRealPath, inventoryRealPath] = await Promise.all([
    realpath(manifestPath),
    realpath(inventoryPath),
  ]);
  const [manifestStats, inventoryStats] = await Promise.all([
    stat(manifestRealPath),
    stat(inventoryRealPath),
  ]);
  if (
    manifestRealPath === inventoryRealPath
    || (
      manifestStats.dev === inventoryStats.dev
      && manifestStats.ino === inventoryStats.ino
    )
  ) {
    throw new Error('The reviewed manifest and cutover inventory must be independent artifacts.');
  }
};



type AffiliateCutoverInventoryJson = z.infer<typeof affiliateCutoverInventorySchema>;

const formatInventorySchemaError = (error: z.ZodError): Error => {
  const issue = error.issues[0];
  const location = issue?.path.length ? issue.path.join('.') : '<root>';
  return new Error(
    `The cutover inventory schema is invalid at ${location}: ${issue?.message ?? 'invalid value'}.`,
  );
};

const assertInventoryCaptureTime = (
  capturedAt: string,
  executionNow: Date,
): void => {
  const capturedAtMs = Date.parse(capturedAt);
  const executionNowMs = executionNow.getTime();
  if (!Number.isFinite(executionNowMs)) {
    throw new Error('The trusted preflight execution time is invalid.');
  }
  const ageMs = executionNowMs - capturedAtMs;
  if (ageMs < 0) {
    throw new Error('The cutover inventory now timestamp is in the future.');
  }
  if (ageMs > AFFILIATE_CUTOVER_PREFLIGHT_MAX_AGE_MS) {
    throw new Error('The cutover inventory now timestamp is older than the allowed preflight evidence age.');
  }
};

export const parseAffiliateCutoverInventory = (
  value: unknown,
  reviewedLegacyProcessManifest: AffiliateLegacyProcessManifest,
  executionNow: Date = new Date(),
): AffiliateCutoverPreflightInput => {
  const result = affiliateCutoverInventorySchema.safeParse(value);
  if (!result.success) throw formatInventorySchemaError(result.error);
  const inventory: AffiliateCutoverInventoryJson = result.data;
  assertInventoryCaptureTime(inventory.now, executionNow);
  return {
    ...inventory,
    now: new Date(executionNow.getTime()),
    legacyServiceUnits: inventory.legacyServiceUnits.map((unit) => ({
      id: unit.id.trim(),
      isEnabled: unit.isEnabled.trim(),
      isActive: unit.isActive.trim(),
    })),
    reviewedLegacyProcessManifest,
  };
};

const readInventory = async (
  path: string,
  reviewedLegacyProcessManifest: AffiliateLegacyProcessManifest,
  executionNow: Date,
): Promise<AffiliateCutoverPreflightInput> => {
  if (!path) throw new Error('Provide --inventory=/path/to/cutover-inventory.json.');
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  return parseAffiliateCutoverInventory(parsed, reviewedLegacyProcessManifest, executionNow);
};
type PreflightOptions = Readonly<{
  manifestPath: string;
  inventoryPath: string;
}>;

const readPreflightOptions = (): PreflightOptions => {
  const manifestPath = readAffiliateCutoverOption('manifest');
  if (!manifestPath) throw new Error('Provide --manifest=/path/to/reviewed-legacy-process-manifest.json.');
  const inventoryPath = readAffiliateCutoverOption('inventory') ?? readAffiliateCutoverOption('input');
  if (!inventoryPath) throw new Error('Provide --inventory=/path/to/cutover-inventory.json.');
  return { manifestPath, inventoryPath };
};

const buildPreflightReport = async (
  inventoryPath: string,
  reviewedLegacyProcessManifest: AffiliateLegacyProcessManifest,
  executionNow: Date,
): Promise<AffiliateCutoverPreflightReport> => buildAffiliateCutoverPreflightReport(
  await readInventory(inventoryPath, reviewedLegacyProcessManifest, executionNow),
);

const preflightCliPayload = (report: AffiliateCutoverPreflightReport) => ({
  ...report,
  processInventoryArtifactId: report.processInventoryArtifactId,
  processInventoryHash: report.processInventoryHash,
  processInventoryCount: report.processInventoryCount,
  failedInvariants: report.blockingFindings.map((finding) => finding.code),
  evaluatedAt: report.evaluatedAt,
  inputHash: report.inputHash,
  reportHash: report.reportHash,
  supplyContractVersion: report.supplyContractVersion,
  supplyContractHash: report.supplyContractHash,
  deploymentContractVersion: report.deploymentContractVersion,
  deploymentContractHash: report.deploymentContractHash,
  gatewayVersion: report.gatewayVersion,
  reviewedLegacyProcessManifestHash: report.reviewedLegacyProcessManifestHash,
  reviewedLegacyProcessManifestCount: report.reviewedLegacyProcessManifestCount,
  reviewedLegacyProcessManifestArtifactId: report.reviewedLegacyProcessManifestArtifactId,
  resolutions: report.resolutions,
  report,
});

const printPreflightReport = (report: AffiliateCutoverPreflightReport): void => {
  console.log(JSON.stringify(preflightCliPayload(report), null, 2));
};

const main = async (): Promise<void> => {
  const { manifestPath, inventoryPath } = readPreflightOptions();
  await assertIndependentArtifacts(manifestPath, inventoryPath);
  const reviewedLegacyProcessManifest = await readReviewedManifest(manifestPath);
  const executionNow = new Date();
  const report = await buildPreflightReport(
    inventoryPath,
    reviewedLegacyProcessManifest,
    executionNow,
  );
  printPreflightReport(report);
  if (!report.isReady) process.exitCode = 2;
};

if (process.argv[1]?.includes('preflight-affiliate-cutover.ts')) {
  main().catch((error) => {
    console.error('[affiliate:cutover:preflight] failed', error);
    process.exitCode = 1;
  });
}
