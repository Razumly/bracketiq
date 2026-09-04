import { readFile, realpath, stat } from 'node:fs/promises';
import dotenv from 'dotenv';
import { z } from 'zod';

import {
  affiliateSupplyDatabase,
  persistAffiliateCutoverSession,
} from '../src/server/affiliateImports/affiliateSupplyPersistence';
import type {
  AffiliateCutoverPreflightInput,
  AffiliateCutoverPreflightReport,
  AffiliateLegacyProcessManifest,
} from '../src/server/affiliateImports/affiliateFleetCutover';
import {
  isAffiliateCutoverPreflightFresh,
  isAffiliateCutoverPreflightReportIntact,
} from '../src/server/affiliateImports/affiliateFleetCutover';
import { prisma } from '../src/lib/prisma';
import { parseAffiliateCutoverInventory } from './preflight-affiliate-cutover';
import { readAffiliateCutoverOption } from './affiliate-cutover-cli';


const nonEmptyStringSchema = z.string().refine(
  (value) => value.trim().length > 0,
  'Expected a non-empty string.',
);
const isoTimestampSchema = z.string().refine(
  (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value)),
  'Expected an ISO-8601 timestamp.',
);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 hash.');
const reviewedSystemdUnitSchema = z.object({
  processId: nonEmptyStringSchema,
  unitId: nonEmptyStringSchema,
}).strict();
const legacyServiceUnitSchema = z.object({
  id: nonEmptyStringSchema,
  isEnabled: nonEmptyStringSchema,
  isActive: nonEmptyStringSchema,
}).strict();
const findingSchema = z.object({
  code: nonEmptyStringSchema,
  severity: z.enum(['BLOCKING', 'WARNING']),
  detail: nonEmptyStringSchema,
  recordIds: z.array(nonEmptyStringSchema),
  resolution: nonEmptyStringSchema,
}).strict();
const preflightCountsSchema = z.object({
  mappingProducers: z.number().int().nonnegative(),
  supplyReviewers: z.number().int().nonnegative(),
  coveragePlanners: z.number().int().nonnegative(),
  stoppedLegacyProcesses: z.number().int().nonnegative(),
  runningLegacyProcesses: z.number().int().nonnegative(),
  liveLegacyClaims: z.number().int().nonnegative(),
  unsafeContainers: z.number().int().nonnegative(),
}).strict();
const preflightReportSchema = z.object({
  schemaVersion: z.literal(1),
  evaluatedAt: isoTimestampSchema,
  isReady: z.boolean(),
  inputHash: hashSchema,
  reportHash: hashSchema,
  supplyContractVersion: z.number().int().nonnegative(),
  supplyContractHash: hashSchema,
  deploymentContractVersion: z.number().int().nonnegative(),
  deploymentContractHash: hashSchema,
  gatewayVersion: z.number().int().nonnegative(),
  reviewedLegacyProcessManifestHash: hashSchema,
  reviewedLegacyProcessManifestCount: z.number().int().nonnegative(),
  reviewedLegacyProcessManifestArtifactId: nonEmptyStringSchema,
  processInventoryArtifactId: nonEmptyStringSchema,
  processInventoryHash: hashSchema,
  processInventoryCount: z.number().int().nonnegative(),
  reviewedSystemdUnits: z.array(reviewedSystemdUnitSchema),
  legacyServiceUnits: z.array(legacyServiceUnitSchema),
  reviewedAgentNetwork: nonEmptyStringSchema,
  blockingFindings: z.array(findingSchema),
  warnings: z.array(findingSchema),
  resolutions: z.array(findingSchema),
  counts: preflightCountsSchema,
}).strict();
dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);
type ReviewedSystemdUnit = Readonly<{
  processId: string;
  unitId: string;
}>;

type LegacyServiceUnitEvidence = Readonly<{
  id: string;
  isEnabled: string;
  isActive: string;
}>;

const readReviewedSystemdUnits = (value: unknown): ReviewedSystemdUnit[] => {
  if (!Array.isArray(value)) {
    throw new Error('The reviewed manifest systemdUnits field must be an array.');
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`The reviewed manifest systemdUnits entry ${index + 1} must be an object.`);
    }
    const processId = typeof entry.processId === 'string' ? entry.processId.trim() : '';
    const unitId = typeof entry.unitId === 'string' ? entry.unitId.trim() : '';
    if (!processId || !unitId) {
      throw new Error(`The reviewed manifest systemdUnits entry ${index + 1} needs processId and unitId.`);
    }
    return { processId, unitId };
  });
};

const readLegacyServiceUnitEvidence = (value: unknown): LegacyServiceUnitEvidence[] => {
  if (!Array.isArray(value)) {
    throw new Error('The cutover inventory legacyServiceUnits field must be an array.');
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`The cutover inventory legacyServiceUnits entry ${index + 1} must be an object.`);
    }
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const isEnabled = typeof entry.isEnabled === 'string' ? entry.isEnabled.trim() : '';
    const isActive = typeof entry.isActive === 'string' ? entry.isActive.trim() : '';
    if (!id || !isEnabled || !isActive) {
      throw new Error(`The cutover inventory legacyServiceUnits entry ${index + 1} needs id, isEnabled, and isActive.`);
    }
    return { id, isEnabled, isActive };
  });
};

const canonicalUnitEvidence = (
  units: readonly LegacyServiceUnitEvidence[],
): string => JSON.stringify([...units].sort((left, right) => (
  left.id < right.id ? -1 : left.id > right.id ? 1 : 0
)));
const assertLegacyServiceUnitEvidence = (
  reviewedSystemdUnits: readonly ReviewedSystemdUnit[],
  evidence: readonly LegacyServiceUnitEvidence[],
): void => {
  const expectedIds = reviewedSystemdUnits.map((unit) => unit.unitId);
  const expectedSet = new Set(expectedIds);
  const observedIds = evidence.map((unit) => unit.id);
  const missing = expectedIds.filter((id) => !observedIds.includes(id));
  const unexpected = observedIds.filter((id) => !expectedSet.has(id));
  const invalid = evidence.filter((unit) => (
    !['DISABLED', 'MASKED'].includes(unit.isEnabled.toUpperCase())
    || unit.isActive.toUpperCase() !== 'INACTIVE'
  ));
  if (
    new Set(expectedIds).size !== expectedIds.length
    || new Set(observedIds).size !== observedIds.length
    || missing.length > 0
    || unexpected.length > 0
    || invalid.length > 0
  ) {
    throw new Error(
      `The cutover inventory must contain one disabled or masked and inactive legacyServiceUnits row per reviewed systemd unit (missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}; invalid: ${invalid.map((unit) => unit.id).join(', ') || 'none'}).`,
    );
  }
};

const requiredOption = (name: string): string => {
  const value = readAffiliateCutoverOption(name);
  if (!value) throw new Error(`Provide --${name}=...`);
  return value;
};

const readJsonObject = async (
  path: string,
  label: string,
): Promise<Record<string, unknown>> => {
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isRecord(parsed)) throw new Error(`The ${label} file must contain a JSON object.`);
  return parsed;
};

const assertIndependentArtifacts = async (paths: readonly string[]): Promise<void> => {
  const artifacts = await Promise.all(paths.map(async (path) => {
    const resolvedPath = await realpath(path);
    return { resolvedPath, file: await stat(resolvedPath) };
  }));
  for (let leftIndex = 0; leftIndex < artifacts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < artifacts.length; rightIndex += 1) {
      const left = artifacts[leftIndex];
      const right = artifacts[rightIndex];
      if (
        left.resolvedPath === right.resolvedPath
        || (left.file.dev === right.file.dev && left.file.ino === right.file.ino)
      ) {
        throw new Error('Manifest, inventory, and preflight must be independent artifacts.');
      }
    }
  }
};

const readManifest = async (
  path: string,
): Promise<AffiliateLegacyProcessManifest> => {
  const manifest = await readJsonObject(path, 'reviewed legacy process manifest');
  const systemdUnits = readReviewedSystemdUnits(manifest.systemdUnits);
  const processIds = new Set(
    Array.isArray(manifest.processes)
      ? manifest.processes
        .filter(isRecord)
        .map((process) => typeof process.id === 'string' ? process.id.trim() : '')
      : [],
  );
  const unknownProcesses = systemdUnits.filter((unit) => !processIds.has(unit.processId));
  if (unknownProcesses.length) {
    throw new Error(`The reviewed manifest systemdUnits reference unknown process IDs: ${unknownProcesses.map((unit) => unit.processId).join(', ')}.`);
  }
  return {
    ...manifest,
    systemdUnits,
  } as unknown as AffiliateLegacyProcessManifest;
};

const readPreflightInput = async (
  path: string,
  reviewedLegacyProcessManifest: AffiliateLegacyProcessManifest,
  executionNow: Date,
): Promise<AffiliateCutoverPreflightInput> => {
  const inventory = await readJsonObject(path, 'cutover inventory');
  const preflightInput = parseAffiliateCutoverInventory(
    inventory,
    reviewedLegacyProcessManifest,
    executionNow,
  );
  assertLegacyServiceUnitEvidence(
    readReviewedSystemdUnits(reviewedLegacyProcessManifest.systemdUnits),
    preflightInput.legacyServiceUnits,
  );
  return preflightInput;
};

const readPreflight = async (
  path: string,
  executionNow: Date,
): Promise<AffiliateCutoverPreflightReport> => {
  const parsed = await readJsonObject(path, 'preflight report');
  const reportValue = isRecord(parsed.report) ? parsed.report : parsed;
  const result = preflightReportSchema.safeParse(reportValue);
  if (!result.success) {
    const issue = result.error.issues[0];
    const location = issue?.path.length ? issue.path.join('.') : '<root>';
    throw new Error(
      `The preflight report schema is invalid at ${location}: ${issue?.message ?? 'invalid value'}.`,
    );
  }
  const report: AffiliateCutoverPreflightReport = result.data;
  if (!isAffiliateCutoverPreflightReportIntact(report)) {
    throw new Error('The preflight report is not an intact, hash-validated report.');
  }
  if (!isAffiliateCutoverPreflightFresh(report, executionNow)) {
    throw new Error('The preflight report is stale or has a future evaluatedAt timestamp.');
  }
  return report;
};

export const bindAffiliateCutoverPreflightInputToReport = (
  input: AffiliateCutoverPreflightInput,
  report: Pick<AffiliateCutoverPreflightReport, 'evaluatedAt'>,
): AffiliateCutoverPreflightInput => {
  const evaluatedAt = isoTimestampSchema.safeParse(report.evaluatedAt);
  if (!evaluatedAt.success) {
    throw new Error('The preflight report evaluatedAt must be a valid ISO-8601 timestamp.');
  }
  return {
    ...input,
    now: new Date(report.evaluatedAt),
  };
};

let shouldDisconnectPrisma = false;

const main = async (): Promise<void> => {
  if (readAffiliateCutoverOption('recorded-start-at')) {
    throw new Error('Do not provide --recorded-start-at; the session records its trusted start time.');
  }
  const manifestPath = requiredOption('manifest');
  const inventoryPath = requiredOption('inventory');
  const preflightPath = requiredOption('preflight');
  await assertIndependentArtifacts([manifestPath, inventoryPath, preflightPath]);

  const rolloutCohort = requiredOption('rollout-cohort');
  const reviewedLegacyProcessManifest = await readManifest(manifestPath);
  const sessionExecutionNow = new Date();
  const preflightReport = await readPreflight(preflightPath, sessionExecutionNow);
  const preflightReportExecutionAt = new Date(preflightReport.evaluatedAt);
  const capturedPreflightInput = await readPreflightInput(
    inventoryPath,
    reviewedLegacyProcessManifest,
    preflightReportExecutionAt,
  );
  const preflightInput = bindAffiliateCutoverPreflightInputToReport(
    capturedPreflightInput,
    preflightReport,
  );
  const inventoryUnits = preflightInput.legacyServiceUnits;
  const reportUnits = preflightReport.legacyServiceUnits;
  if (canonicalUnitEvidence(inventoryUnits) !== canonicalUnitEvidence(reportUnits)) {
    throw new Error('The preflight report legacyServiceUnits evidence does not match the cutover inventory.');
  }
  shouldDisconnectPrisma = true;
  const result = await persistAffiliateCutoverSession({
    database: affiliateSupplyDatabase(prisma),
    sessionId: readAffiliateCutoverOption('session-id'),
    rolloutCohort,
    reviewedLegacyProcessManifest,
    preflightInput,
    preflightReport,
  });

  console.log(JSON.stringify({
    schemaVersion: 1,
    mode: 'CUTOVER_SESSION',
    sessionId: result.sessionId,
    sessionHash: result.sessionHash,
    rolloutCohort,
    recordedStartAt: result.recordedStartAt,
  }, null, 2));
};

if (process.argv[1]?.includes('record-affiliate-cutover-session.ts')) {
  main()
    .catch((error) => {
      console.error('[affiliate:cutover:session] failed', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (shouldDisconnectPrisma) await prisma.$disconnect();
    });
}
