import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

import {
  affiliateSupplyDatabase,
  loadAffiliateCutoverRollbackSession,
  persistAffiliateCutoverRollbackDecision,
  type AffiliateCutoverRollbackSession,
  type AffiliateCutoverRuntimeProcessEvidence,
} from '../src/server/affiliateImports/affiliateSupplyPersistence';
import { AFFILIATE_GOVERNED_CONTROL_PLANE_IDS } from '../src/server/affiliateImports/affiliateFleetCutover';

import { hashAffiliateAgentValue } from '../src/server/affiliateImports/agentGatewayContracts';
import { prisma } from '../src/lib/prisma';
import { readAffiliateCutoverOption } from './affiliate-cutover-cli';

const execFileAsync = promisify(execFile);

type InspectionResult = Readonly<{
  available: boolean;
  output: string;
}>;
export type AffiliateRuntimeProcessObservation = Readonly<{
  source: 'ps' | 'docker';
  pid: number | null;
  ppid: number | null;
  user: string | null;
  state: string | null;
  containerId: string | null;
  name: string | null;
  service: string | null;
  executable: string | null;
}>;
export type AffiliateRuntimeProcessStatus = 'RUNNING' | 'STOPPED' | 'UNKNOWN';
export type AffiliateReviewedProcessIdentity = Readonly<{
  id: string;
  kind?: 'LEGACY' | 'GOVERNED';
  workerId?: string;
  command: string;
}>;
type ReviewedSystemdUnit = Readonly<{
  processId: string;
  unitId: string;
}>;

const readReviewedSystemdUnits = (
  session: AffiliateCutoverRollbackSession,
): readonly ReviewedSystemdUnit[] => {
  const value = (session.reviewedLegacyProcessManifest as unknown as {
    systemdUnits?: unknown;
  }).systemdUnits;
  if (!Array.isArray(value)) {
    throw new Error('The durable cutover session lacks reviewed systemd unit associations.');
  }
  const units = value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`The durable cutover session systemdUnits entry ${index + 1} is invalid.`);
    }
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.processId !== 'string'
      || !candidate.processId.trim()
      || typeof candidate.unitId !== 'string'
      || !candidate.unitId.trim()
    ) {
      throw new Error(`The durable cutover session systemdUnits entry ${index + 1} needs processId and unitId.`);
    }
    return {
      processId: candidate.processId.trim(),
      unitId: candidate.unitId.trim(),
    };
  });
  const processIds = units.map((unit) => unit.processId);
  const unitIds = units.map((unit) => unit.unitId);
  if (
    new Set(processIds).size !== processIds.length
    || new Set(unitIds).size !== unitIds.length
  ) {
    throw new Error('The durable cutover session systemdUnits associations must be unique.');
  }
  return units;
};
const nonEmptyOutputLines = (output: string): readonly string[] => output
  .split(/\r?\n/)
  .filter((line) => line.trim().length > 0);

const stripWrappingQuotes = (value: string): string => value
  .replace(/^['"]/, '')
  .replace(/['"]$/, '');

const commandTokens = (command: string): readonly string[] => command
  .trim()
  .split(/\s+/)
  .filter((token) => token.length > 0)
  .map(stripWrappingQuotes);

const executableName = (token: string): string => {
  const normalized = stripWrappingQuotes(token);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
};

const reviewedExecutable = (command: string): string => {
  const token = commandTokens(command)[0];
  return token ? executableName(token) : '';
};

const statusForMatchCount = (matchCount: number): AffiliateRuntimeProcessStatus => (
  matchCount === 0 ? 'STOPPED' : matchCount === 1 ? 'RUNNING' : 'UNKNOWN'
);

const isDockerContainerId = (value: string): boolean => /^[a-f0-9]{64}$/i.test(value);

export const parseAffiliatePsProcessTable = (
  output: string,
): readonly AffiliateRuntimeProcessObservation[] | null => {
  const observations: AffiliateRuntimeProcessObservation[] = [];
  for (const line of nonEmptyOutputLines(output)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 5) return null;
    const [pidValue, ppidValue, user, state, executable] = fields;
    const pid = Number(pidValue);
    const ppid = Number(ppidValue);
    if (
      !Number.isSafeInteger(pid)
      || pid < 1
      || !Number.isSafeInteger(ppid)
      || ppid < 0
      || !user
      || !state
      || !executable
    ) return null;
    observations.push({
      source: 'ps',
      pid,
      ppid,
      user,
      state,
      containerId: null,
      name: null,
      service: null,
      executable,
    });
  }
  return observations;
};

export const parseAffiliateDockerProcessTable = (
  output: string,
): readonly AffiliateRuntimeProcessObservation[] | null => {
  const observations: AffiliateRuntimeProcessObservation[] = [];
  for (const line of nonEmptyOutputLines(output)) {
    const fields = line.split('\t');
    if (fields.length !== 3) return null;
    const [containerId, name, service] = fields.map((field) => field.trim());
    if (
      !isDockerContainerId(containerId)
      || !name
    ) return null;
    observations.push({
      source: 'docker',
      pid: null,
      ppid: null,
      user: null,
      state: null,
      containerId,
      name,
      service: service || null,
      executable: null,
    });
  }
  return observations;
};


const serviceIdentityMatches = (
  observation: AffiliateRuntimeProcessObservation,
  expectedService: string,
): boolean => observation.service === expectedService || observation.name === expectedService;

const resolveGovernedProcessStatus = (
  process: AffiliateReviewedProcessIdentity,
  observations: readonly AffiliateRuntimeProcessObservation[],
): AffiliateRuntimeProcessStatus => {
  const identity = process.id.trim();
  const expectedService = process.workerId?.trim() ?? '';
  const dockerObservations = observations.filter((observation) => observation.source === 'docker');
  const containerMatches = dockerObservations.filter(
    (observation) => observation.containerId === identity,
  );
  if (containerMatches.length) {
    if (containerMatches.length !== 1 || !expectedService) return 'UNKNOWN';
    const [container] = containerMatches;
    return container.service === expectedService ? 'RUNNING' : 'UNKNOWN';
  }
  const serviceMatches = expectedService
    ? dockerObservations.filter((observation) => observation.service === expectedService)
    : [];
  return serviceMatches.length ? 'UNKNOWN' : 'STOPPED';
};

const resolveLegacyProcessStatus = (
  process: AffiliateReviewedProcessIdentity,
  reviewedProcesses: readonly AffiliateReviewedProcessIdentity[],
  observations: readonly AffiliateRuntimeProcessObservation[],
): AffiliateRuntimeProcessStatus => {
  const identity = process.id.trim();
  const dockerNameMatches = observations.filter((observation) => (
    observation.source === 'docker' && observation.name === identity
  ));
  if (dockerNameMatches.length) return statusForMatchCount(dockerNameMatches.length);
  const expectedExecutable = reviewedExecutable(process.command);
  const processMatches = observations.filter((observation) => (
    observation.source === 'ps'
    && executableName(observation.executable ?? '') === expectedExecutable
  ));
  if (!processMatches.length) return 'STOPPED';
  const identityMatches = processMatches.filter((observation) => (
    executableName(observation.executable ?? '') === identity
  ));
  if (identityMatches.length) return statusForMatchCount(identityMatches.length);
  const sameExecutableCount = reviewedProcesses.filter((reviewedProcess) => (
    reviewedExecutable(reviewedProcess.command) === expectedExecutable
  )).length;
  return sameExecutableCount === 1 ? statusForMatchCount(processMatches.length) : 'UNKNOWN';
};

export const resolveAffiliateRuntimeProcessStatus = (
  process: AffiliateReviewedProcessIdentity,
  reviewedProcesses: readonly AffiliateReviewedProcessIdentity[],
  observations: readonly AffiliateRuntimeProcessObservation[],
): AffiliateRuntimeProcessStatus => process.kind === 'GOVERNED'
  ? resolveGovernedProcessStatus(process, observations)
  : resolveLegacyProcessStatus(process, reviewedProcesses, observations);

export const resolveAffiliateControlPlaneProcessStatus = (
  identity: string,
  observations: readonly AffiliateRuntimeProcessObservation[],
): AffiliateRuntimeProcessStatus => {
  const normalizedIdentity = identity.trim();
  const dockerObservations = observations.filter((observation) => observation.source === 'docker');
  const dockerIdentityMatches = dockerObservations.filter((observation) => (
    observation.service === normalizedIdentity || observation.name === normalizedIdentity
  ));
  if (dockerIdentityMatches.length) return statusForMatchCount(dockerIdentityMatches.length);
  const executableMatches = observations.filter((observation) => (
    observation.source === 'ps'
    && executableName(observation.executable ?? '') === normalizedIdentity
  ));
  return statusForMatchCount(executableMatches.length);
};

const requiredOption = (name: string): string => {
  const value = readAffiliateCutoverOption(name);
  if (!value) throw new Error(`Provide --${name}=...`);
  return value;
};

const readBooleanOption = (name: string): boolean => {
  const prefix = `--${name}=`;
  const exact = `--${name}`;
  const supplied = process.argv
    .slice(2)
    .filter((argument) => argument === exact || argument.startsWith(prefix));
  if (supplied.length > 1) {
    throw new Error(`Rollback option ${exact} may be supplied only once.`);
  }
  const argument = supplied[0];
  if (!argument) return false;
  if (argument === exact) return true;
  const value = argument.slice(prefix.length);
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Rollback option ${exact} must be bare, =true, or =false.`);
};

const rejectUnknownRollbackOptions = (): void => {
  const allowed: Record<string, true> = {
    'session-id': true,
    'cutover-session-id': true,
    operator: true,
    'dry-run': true,
  };
  const seen = new Set<string>();
  for (const argument of process.argv.slice(2).filter((value) => value !== '--')) {
    if (!argument.startsWith('--')) {
      throw new Error(`Rollback does not accept positional argument ${argument}.`);
    }
    const equalsIndex = argument.indexOf('=');
    const name = argument.slice(2, equalsIndex < 0 ? undefined : equalsIndex);
    if (!allowed[name]) {
      throw new Error(`Unknown affiliate rollback option --${name}.`);
    }
    if (seen.has(name)) {
      throw new Error(`Rollback option --${name} may be supplied only once.`);
    }
    seen.add(name);
    if (name !== 'dry-run' && equalsIndex < 0) {
      throw new Error(`Rollback option --${name} requires a value.`);
    }
    if (name !== 'dry-run' && !argument.slice(equalsIndex + 1).trim()) {
      throw new Error(`Rollback option --${name} requires a non-empty value.`);
    }
  }
};


const rejectCallerSelectedEvidence = (): void => {
  const forbiddenOptions = ['since', 'manifest', 'evidence', 'rollout-cohort', 'runtime-inventory'];
  const supplied = process.argv
    .filter((argument) => forbiddenOptions.some((name) => argument.startsWith(`--${name}=`) || argument === `--${name}`));
  if (supplied.length) {
    throw new Error(
      `Rollback does not accept caller-selected ${supplied.join(', ')}; use the session and operator options only.`,
    );
  }
};
const readRollbackCliOptions = (): Readonly<{
  sessionId: string;
  operatorId: string;
  isDryRun: boolean;
}> => {
  rejectCallerSelectedEvidence();
  rejectUnknownRollbackOptions();
  return {
    sessionId: readSessionId(),
    operatorId: requiredOption('operator'),
    isDryRun: readBooleanOption('dry-run'),
  };
};


const readSessionId = (): string => {
  const sessionId = readAffiliateCutoverOption('session-id');
  const legacyAlias = readAffiliateCutoverOption('cutover-session-id');
  if (sessionId && legacyAlias && sessionId !== legacyAlias) {
    throw new Error('--session-id and --cutover-session-id must identify the same durable session.');
  }
  const selected = (sessionId ?? legacyAlias ?? '').trim();
  if (!selected) throw new Error('Provide --session-id=...');
  return selected;
};

const inspect = async (command: string, args: readonly string[]): Promise<InspectionResult> => {
  try {
    const result = await execFileAsync(command, [...args], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
    return { available: true, output: result.stdout };
  } catch (error) {
    return {
      available: false,
      output: error instanceof Error ? error.message : String(error),
    };
  }
};
const inspectSystemdUnitState = async (
  unitId: string,
  state: 'is-enabled' | 'is-active',
): Promise<string> => {
  try {
    const result = await execFileAsync('systemctl', [state, unitId], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024,
    });
    return result.stdout.trim().split('\n')[0]?.trim() || 'UNKNOWN';
  } catch (error) {
    const stdout = error && typeof error === 'object' && 'stdout' in error
      && typeof error.stdout === 'string'
      ? error.stdout.trim()
      : '';
    return stdout.split('\n')[0]?.trim() || 'UNKNOWN';
  }
};


const captureRuntimeProcessEvidence = async (
  session: AffiliateCutoverRollbackSession,
): Promise<AffiliateCutoverRuntimeProcessEvidence> => {
  const [processTable, containerTable] = await Promise.all([
    inspect('ps', ['-axo', 'pid=,ppid=,user=,state=,comm=']),
    inspect('docker', [
      'ps',
      '--no-trunc',
      '--format',
      '{{.ID}}\t{{.Names}}\t{{.Label "com.docker.compose.service"}}',
    ]),
  ]);
  const parsedProcessTable = processTable.available
    ? parseAffiliatePsProcessTable(processTable.output)
    : null;
  const parsedContainerTable = containerTable.available
    ? parseAffiliateDockerProcessTable(containerTable.output)
    : null;
  const observations = [
    ...(parsedProcessTable ?? []),
    ...(parsedContainerTable ?? []),
  ];
  const hasCompleteInspection = processTable.available
    && containerTable.available
    && parsedProcessTable !== null
    && parsedContainerTable !== null;
  const reviewedProcesses = session.processInventory.map((process) => ({
    id: process.id.trim(),
    kind: process.kind,
    workerId: process.workerId?.trim(),
    command: process.command.trim(),
  }));
  const processInventory = session.processInventory.map((process, index) => ({
    ...process,
    status: hasCompleteInspection
      ? resolveAffiliateRuntimeProcessStatus(
        reviewedProcesses[index],
        reviewedProcesses,
        observations,
      )
      : 'UNKNOWN',
  }));
  const reviewedSystemdUnits = readReviewedSystemdUnits(session);
  const legacyProcessIds = new Set(
    session.processInventory
      .filter((process) => process.kind === 'LEGACY')
      .map((process) => process.id.trim()),
  );
  const unknownProcesses = reviewedSystemdUnits.filter((unit) => !legacyProcessIds.has(unit.processId));
  if (unknownProcesses.length) {
    throw new Error(
      `The durable cutover session systemdUnits reference unknown legacy process IDs: ${unknownProcesses.map((unit) => unit.processId).join(', ')}.`,
    );
  }
  const legacyServiceUnits = await Promise.all(
    reviewedSystemdUnits.map(async (unit) => ({
      id: unit.unitId,
      isEnabled: await inspectSystemdUnitState(unit.unitId, 'is-enabled'),
      isActive: await inspectSystemdUnitState(unit.unitId, 'is-active'),
    })),
  );
  const controlPlaneProcesses = AFFILIATE_GOVERNED_CONTROL_PLANE_IDS.map((id) => ({
    id,
    status: hasCompleteInspection
      ? resolveAffiliateControlPlaneProcessStatus(id, observations)
      : 'UNKNOWN',
  }));
  const capturedAt = new Date().toISOString();
  return {
    artifactId: hashAffiliateAgentValue({
      kind: 'AFFILIATE_CUTOVER_RUNTIME_PROCESS_EVIDENCE',
      capturedAt,
      processTable,
      containerTable,
      processInventory,
      controlPlaneProcesses,
      legacyServiceUnits,
    }),
    capturedAt,
    processInventory,
    controlPlaneProcesses,
    legacyServiceUnits,
  };
};

const main = async (): Promise<void> => {
  const options = readRollbackCliOptions();
  const database = affiliateSupplyDatabase(prisma);
  const session = await loadAffiliateCutoverRollbackSession({
    database,
    sessionId: options.sessionId,
  });
  const runtimeProcessEvidence = await captureRuntimeProcessEvidence(session);
  const result = await persistAffiliateCutoverRollbackDecision({
    database,
    sessionId: options.sessionId,
    operatorId: options.operatorId,
    runtimeProcessEvidence,
    isDryRun: options.isDryRun,
  });
  console.log(JSON.stringify({
    sessionId: result.sessionId,
    rolloutCohort: result.rolloutCohort,
    recordedStartAt: result.recordedStartAt,
    input: result.input,
    evidence: result.evidence,
    decision: result.decision,
    record: result.record,
  }, null, 2));
  if (result.decision.mode === 'BLOCKED') process.exitCode = 2;
};

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('[affiliate:cutover:rollback] failed', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
