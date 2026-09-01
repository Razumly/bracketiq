import { basename, dirname, resolve } from 'node:path';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import {
  hashAffiliateCutoverProcessInventory,
  hashAffiliateLegacyProcessManifest,
  type AffiliateCutoverProcessRecord,
  type AffiliateLegacyProcessExpectation,
  type AffiliateLegacyProcessManifest,
} from '../src/server/affiliateImports/affiliateFleetCutover';
import { readAffiliateCutoverOption } from './affiliate-cutover-cli';

type ArtifactPath = Readonly<{
  requestedPath: string;
  resolvedPath: string;
  device: number | null;
  inode: number | null;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isMissingPathError = (error: unknown): boolean => (
  isRecord(error) && error.code === 'ENOENT'
);

const resolveRealArtifactPath = async (absolutePath: string): Promise<string> => {
  try {
    return await realpath(absolutePath);
  } catch (error) {
    if (!isMissingPathError(error)) throw error;
    return `${await realpath(dirname(absolutePath))}/${basename(absolutePath)}`;
  }
};

type ArtifactIdentity = Readonly<{
  device: number;
  inode: number;
}>;

const readArtifactIdentity = async (
  resolvedPath: string,
): Promise<ArtifactIdentity | null> => {
  try {
    const file = await stat(resolvedPath);
    return { device: file.dev, inode: file.ino };
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw error;
  }
};

const resolveArtifactPath = async (requestedPath: string): Promise<ArtifactPath> => {
  const absolutePath = resolve(requestedPath);
  const resolvedPath = await resolveRealArtifactPath(absolutePath);
  const identity = await readArtifactIdentity(resolvedPath);
  return {
    requestedPath,
    resolvedPath,
    device: identity?.device ?? null,
    inode: identity?.inode ?? null,
  };
};

const assertDistinctArtifacts = (artifacts: readonly ArtifactPath[]): void => {
  for (let leftIndex = 0; leftIndex < artifacts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < artifacts.length; rightIndex += 1) {
      const left = artifacts[leftIndex];
      const right = artifacts[rightIndex];
      if (
        left.resolvedPath === right.resolvedPath
        || (
          left.device !== null
          && right.device !== null
          && left.device === right.device
          && left.inode === right.inode
        )
      ) {
        throw new Error('Manifest, inventory, and output must be independent artifacts.');
      }
    }
  }
};


type ProcessInventory = Readonly<{
  artifactId: string;
  processes: readonly AffiliateCutoverProcessRecord[];
}>;
type ReviewedSystemdUnit = Readonly<{
  processId: string;
  unitId: string;
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

const isNonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const manifestOnlyKeys = [
  'artifactId',
  'processes',
  'manifestHash',
  'processCount',
  'reviewedAt',
  'reviewedBy',
  'systemdUnits',
];

type ProcessInventoryDocument = Record<string, unknown> & {
  processInventoryArtifactId: string;
  processInventory: unknown[];
};

function assertProcessInventoryShape(
  value: unknown,
): asserts value is ProcessInventoryDocument {
  if (!isRecord(value)) {
    throw new Error('The process inventory must contain processInventoryArtifactId and processInventory.');
  }
  if (!Array.isArray(value.processInventory) || !isNonEmptyString(value.processInventoryArtifactId)) {
    throw new Error('The process inventory must contain processInventoryArtifactId and processInventory.');
  }
}

const isValidProcessInventoryEntry = (process: unknown): boolean => {
  if (!isRecord(process)) return false;
  return [
    isNonEmptyString(process.id),
    ['LEGACY', 'GOVERNED'].includes(process.kind as string),
    typeof process.command === 'string',
    typeof process.status === 'string',
  ].every(Boolean);
};

const assertProcessInventoryEntries = (processes: readonly unknown[]): void => {
  if (processes.some((process) => !isValidProcessInventoryEntry(process))) {
    throw new Error('Every process inventory entry needs an id, LEGACY or GOVERNED kind, command, and status.');
  }
};

const parseProcessInventory = (parsed: unknown): ProcessInventory => {
  assertProcessInventoryShape(parsed);
  if (manifestOnlyKeys.some((key) => key in parsed)) {
    throw new Error('The process inventory artifact must not contain reviewed manifest fields.');
  }
  assertProcessInventoryEntries(parsed.processInventory);
  return {
    artifactId: parsed.processInventoryArtifactId.trim(),
    processes: parsed.processInventory as AffiliateCutoverProcessRecord[],
  };
};

const readProcessInventory = async (): Promise<ProcessInventory> => {
  const inventoryPath = readAffiliateCutoverOption('inventory');
  if (!inventoryPath) throw new Error('Provide --inventory=/path/to/process-inventory.json.');
  const parsed: unknown = JSON.parse(await readFile(inventoryPath, 'utf8'));
  return parseProcessInventory(parsed);
};

const inventoryOnlyKeys = [
  'processInventoryArtifactId',
  'processInventoryHash',
  'processInventoryCount',
  'processInventory',
];

type ReviewedManifestDocument = Record<string, unknown> & {
  schemaVersion?: unknown;
  artifactId: string;
  processes: unknown[];
  processCount?: unknown;
  manifestHash?: unknown;
  inventoryArtifactId?: unknown;
  inventoryHash?: unknown;
  inventoryCount?: unknown;
  reviewedAt: string;
  reviewedBy: string;
  systemdUnits: unknown[];
};

function assertReviewedManifestCollections(
  value: unknown,
): asserts value is ReviewedManifestDocument {
  if (!isRecord(value) || !Array.isArray(value.processes) || !Array.isArray(value.systemdUnits)) {
    throw new Error('The reviewed manifest must contain processes and systemdUnits arrays.');
  }
}

const assertReviewedManifestExcludesInventory = (
  parsed: ReviewedManifestDocument,
): void => {
  if (inventoryOnlyKeys.some((key) => key in parsed)) {
    throw new Error('The reviewed manifest artifact must not contain process inventory fields.');
  }
};

const isValidDateString = (value: unknown): value is string => (
  typeof value === 'string' && !Number.isNaN(new Date(value).getTime())
);

const assertReviewedManifestHeader = (parsed: ReviewedManifestDocument): void => {
  if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== 1) {
    throw new Error('The reviewed manifest schemaVersion must be 1.');
  }
  if (!isNonEmptyString(parsed.artifactId)) {
    throw new Error('The reviewed manifest must contain a non-empty artifactId value.');
  }
  if (!isValidDateString(parsed.reviewedAt)) {
    throw new Error('The reviewed manifest must contain a valid reviewedAt ISO date.');
  }
  if (!isNonEmptyString(parsed.reviewedBy)) {
    throw new Error('The reviewed manifest must contain a non-empty reviewedBy value.');
  }
};

const isValidReviewedManifestProcess = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && typeof value.processClass === 'string';
};

const assertReviewedManifestProcessEntries = (processes: readonly unknown[]): void => {
  if (processes.some((process) => !isValidReviewedManifestProcess(process))) {
    throw new Error('Every reviewed manifest entry needs a string id and processClass.');
  }
};

const normalizeReviewedManifestProcesses = (
  processes: readonly unknown[],
): AffiliateLegacyProcessExpectation[] => {
  assertReviewedManifestProcessEntries(processes);
  return processes
    .map((process) => {
      const entry = process as { id: string; processClass: string };
      return {
        id: entry.id.trim(),
        processClass: entry.processClass.trim().toUpperCase(),
      };
    })
    .sort((left, right) => `${left.id}:${left.processClass}`.localeCompare(`${right.id}:${right.processClass}`));
};

const compareReviewedSystemdUnits = (
  left: ReviewedSystemdUnit,
  right: ReviewedSystemdUnit,
): number => {
  if (left.processId !== right.processId) return left.processId < right.processId ? -1 : 1;
  if (left.unitId === right.unitId) return 0;
  return left.unitId < right.unitId ? -1 : 1;
};

const assertReviewedManifestReferences = (
  systemdUnits: readonly ReviewedSystemdUnit[],
  processes: readonly AffiliateLegacyProcessExpectation[],
): void => {
  const processIds = new Set(processes.map((process) => process.id));
  const unknownProcesses = systemdUnits.filter((unit) => !processIds.has(unit.processId));
  if (unknownProcesses.length) {
    throw new Error(`The reviewed manifest systemdUnits reference unknown process IDs: ${unknownProcesses.map((unit) => unit.processId).join(', ')}.`);
  }
};

const assertUniqueReviewedSystemdUnits = (
  systemdUnits: readonly ReviewedSystemdUnit[],
): void => {
  if (
    new Set(systemdUnits.map((unit) => unit.processId)).size !== systemdUnits.length
    || new Set(systemdUnits.map((unit) => unit.unitId)).size !== systemdUnits.length
  ) {
    throw new Error('The reviewed manifest systemdUnits must contain unique processId and unitId values.');
  }
};

type ManifestHashes = Readonly<{
  manifestHash: string;
  inventoryHash: string;
}>;

const calculateManifestHashes = (
  processes: readonly AffiliateLegacyProcessExpectation[],
  systemdUnits: readonly ReviewedSystemdUnit[],
  inventory: ProcessInventory,
): ManifestHashes => ({
  manifestHash: hashAffiliateLegacyProcessManifest(processes, systemdUnits),
  inventoryHash: hashAffiliateCutoverProcessInventory(inventory.processes),
});

const assertOptionalManifestValue = (
  actual: unknown,
  expected: unknown,
  message: string,
): void => {
  if (actual !== undefined && actual !== expected) {
    throw new Error(message);
  }
};

const assertManifestIdentityMatches = (
  parsed: ReviewedManifestDocument,
  inventory: ProcessInventory,
  normalizedProcesses: readonly AffiliateLegacyProcessExpectation[],
  hashes: ManifestHashes,
): void => {
  assertOptionalManifestValue(
    parsed.manifestHash,
    hashes.manifestHash,
    'The reviewed manifest manifestHash does not match its process list.',
  );
  assertOptionalManifestValue(
    parsed.processCount,
    normalizedProcesses.length,
    'The reviewed manifest processCount does not match its process list.',
  );
  assertOptionalManifestValue(
    parsed.inventoryArtifactId,
    inventory.artifactId,
    'The reviewed manifest inventoryArtifactId does not match the process inventory.',
  );
  assertOptionalManifestValue(
    parsed.inventoryHash,
    hashes.inventoryHash,
    'The reviewed manifest inventoryHash does not match the process inventory.',
  );
  assertOptionalManifestValue(
    parsed.inventoryCount,
    inventory.processes.length,
    'The reviewed manifest inventoryCount does not match the process inventory.',
  );
};

const readManifest = async (
  inventory: ProcessInventory,
): Promise<AffiliateLegacyProcessManifest> => {
  const manifestPath = readAffiliateCutoverOption('manifest');
  if (!manifestPath) throw new Error('Provide --manifest=/path/to/reviewed-legacy-process-manifest.json.');
  const parsed: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  assertReviewedManifestCollections(parsed);
  assertReviewedManifestExcludesInventory(parsed);
  assertReviewedManifestHeader(parsed);
  const normalizedProcesses = normalizeReviewedManifestProcesses(parsed.processes);
  const systemdUnits = readReviewedSystemdUnits(parsed.systemdUnits).sort(compareReviewedSystemdUnits);
  assertReviewedManifestReferences(systemdUnits, normalizedProcesses);
  assertUniqueReviewedSystemdUnits(systemdUnits);
  const hashes = calculateManifestHashes(normalizedProcesses, systemdUnits, inventory);
  assertManifestIdentityMatches(parsed, inventory, normalizedProcesses, hashes);
  return {
    schemaVersion: 1,
    artifactId: parsed.artifactId.trim(),
    processes: normalizedProcesses,
    processCount: normalizedProcesses.length,
    manifestHash: hashes.manifestHash,
    inventoryArtifactId: inventory.artifactId,
    inventoryHash: hashes.inventoryHash,
    inventoryCount: inventory.processes.length,
    reviewedAt: parsed.reviewedAt,
    reviewedBy: parsed.reviewedBy.trim(),
    systemdUnits,
  };
};

const writeManifestOutput = async (
  outputPath: string | undefined,
  manifest: AffiliateLegacyProcessManifest,
): Promise<void> => {
  const output = JSON.stringify(manifest, null, 2);
  if (outputPath) {
    await writeFile(outputPath, `${output}\n`, { encoding: 'utf8', flag: 'wx' });
    return;
  }
  console.log(output);
};
const main = async (): Promise<void> => {
  const manifestPath = readAffiliateCutoverOption('manifest');
  const inventoryPath = readAffiliateCutoverOption('inventory');
  if (!manifestPath || !inventoryPath) {
    throw new Error('Provide both --manifest=/path/to/manifest.json and --inventory=/path/to/inventory.json.');
  }
  const outputPath = readAffiliateCutoverOption('output');
  const artifactPaths = await Promise.all([
    resolveArtifactPath(manifestPath),
    resolveArtifactPath(inventoryPath),
    ...(outputPath ? [resolveArtifactPath(outputPath)] : []),
  ]);
  assertDistinctArtifacts(artifactPaths);
  const inventory = await readProcessInventory();
  const manifest = await readManifest(inventory);
  await writeManifestOutput(outputPath, manifest);
};

main().catch((error) => {
  console.error('[affiliate:cutover:manifest-hash] failed', error);
  process.exitCode = 1;
});
