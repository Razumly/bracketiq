/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const repositoryRoot = process.cwd();
const read = (relativePath: string) => fs.readFileSync(
  path.join(repositoryRoot, relativePath),
  'utf8',
);
const runnerSeccompProfileJson = read('deploy/affiliate-governed/runner-seccomp.json');
const runnerAppArmorProfileSha256 = createHash('sha256')
  .update(read('deploy/affiliate-governed/runner.apparmor'))
  .digest('hex');
const controllerLauncher = path.join(
  repositoryRoot,
  'deploy/ai/bin/run-controller-once.sh',
);
const runController = (
  mode: string,
  env: Record<string, string> = {},
  cwd = repositoryRoot,
) => spawnSync('bash', [controllerLauncher], {
  cwd,
  env: { ...process.env, ...env, AFFILIATE_MAPPING_MODE: mode },
  encoding: 'utf8',
});
type RenderedCompose = {
  networks: Record<string, { internal?: boolean }>;
  services: Record<string, {
    networks?: Record<string, null>;
  }>;
};
const renderAiCompose = (): RenderedCompose => {
  const result = spawnSync('docker', [
    'compose',
    '--env-file',
    path.join(repositoryRoot, 'deploy/ai/deployment.env.example'),
    '-f',
    path.join(repositoryRoot, 'deploy/ai/compose.yml'),
    '--profile',
    'evaluator',
    'config',
    '--format',
    'json',
  ], {
    cwd: repositoryRoot,
    env: process.env,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`docker compose config failed: ${result.stderr}`);
  }

  return JSON.parse(result.stdout) as RenderedCompose;
};


import {
  AFFILIATE_RUNNER_APPARMOR_PROFILE,
  buildAffiliateCutoverPreflightReport,
  hashAffiliateCutoverProcessInventory,
  hashAffiliateLegacyProcessManifest,
  isAffiliateCutoverPreflightReportIntact,
} from '../affiliateFleetCutover';
import {
  assertLegacyDueScrapeExecutionAllowed,
} from '../../../../scripts/run-due-affiliate-scrapes';
import {
  parseAffiliateCutoverInventory,
  validateAffiliateLegacyServiceUnitEvidence,
} from '../../../../scripts/preflight-affiliate-cutover';

const strictInventoryFixture = () => {
  const processInventory = [
    {
      id: 'legacy-intake',
      kind: 'LEGACY',
      processClass: 'INTAKE',
      command: 'affiliate:intake:legacy',
      status: 'STOPPED',
    },
    {
      id: 'mapping-producer-1',
      kind: 'GOVERNED',
      role: 'MAPPING_PRODUCER',
      workerId: 'mapping-producer-1',
      command: 'affiliate:agent:supervisor',
      status: 'STOPPED',
    },
    {
      id: 'mapping-producer-2',
      kind: 'GOVERNED',
      role: 'MAPPING_PRODUCER',
      workerId: 'mapping-producer-2',
      command: 'affiliate:agent:supervisor',
      status: 'STOPPED',
    },
    {
      id: 'supply-reviewer-1',
      kind: 'GOVERNED',
      role: 'SUPPLY_REVIEWER',
      workerId: 'supply-reviewer-1',
      command: 'affiliate:agent:supervisor',
      status: 'STOPPED',
    },
    {
      id: 'supply-reviewer-2',
      kind: 'GOVERNED',
      role: 'SUPPLY_REVIEWER',
      workerId: 'supply-reviewer-2',
      command: 'affiliate:agent:supervisor',
      status: 'STOPPED',
    },
    {
      id: 'coverage-planner',
      kind: 'GOVERNED',
      role: 'COVERAGE_PLANNER',
      workerId: 'coverage-planner',
      command: 'affiliate:agent:supervisor',
      status: 'STOPPED',
    },
  ] as const;
  const systemdUnits = [
    {
      processId: 'legacy-intake',
      unitId: 'bracketiq-affiliate-intake-automation.timer',
    },
  ] as const;
  const legacyServiceUnits = [
    {
      id: 'bracketiq-affiliate-intake-automation.timer',
      isEnabled: 'DISABLED',
      isActive: 'INACTIVE',
    },
  ] as const;
  const processInventoryHash = hashAffiliateCutoverProcessInventory(processInventory);
  const reviewedProcesses = [{ id: 'legacy-intake', processClass: 'INTAKE' }] as const;
  const reviewedLegacyProcessManifest = {
    schemaVersion: 1 as const,
    artifactId: 'reviewed-process-manifest',
    processes: reviewedProcesses,
    systemdUnits,
    processCount: reviewedProcesses.length,
    manifestHash: hashAffiliateLegacyProcessManifest(reviewedProcesses, systemdUnits),
    inventoryArtifactId: 'process-inventory',
    inventoryHash: processInventoryHash,
    inventoryCount: processInventory.length,
    reviewedAt: '2026-08-25T11:00:00.000Z',
    reviewedBy: 'cutover-reviewer',
  };
  const contractSnapshot = {
    supplyContractVersion: 1,
    supplyContractHash: 'a'.repeat(64),
    deploymentContractVersion: 1,
    deploymentContractHash: 'b'.repeat(64),
    gatewayVersion: 1,
    roleContractHashes: {
      COVERAGE_PLANNER: 'c'.repeat(64),
      MAPPING_PRODUCER: 'd'.repeat(64),
      SUPPLY_REVIEWER: 'e'.repeat(64),
      HUMAN_DIRECTED_EXECUTOR: 'f'.repeat(64),
    },
    promptTemplateHashes: {
      COVERAGE_PLANNER: '1'.repeat(64),
      MAPPING_PRODUCER: '2'.repeat(64),
      SUPPLY_REVIEWER: '3'.repeat(64),
      HUMAN_DIRECTED_EXECUTOR: '4'.repeat(64),
    },
  };
  const governedContainer = (
    id: string,
    environment = [
      'AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080',
      'AFFILIATE_AGENT_RUNNER_SOCKET=/workspaces/.runner.sock',
      'AFFILIATE_AGENT_WORKSPACE_SIGNING_KEY=redacted',
    ],
  ) => ({
    id,
    name: id,
    user: '1001:1001',
    hasReadonlyRootFilesystem: true,
    privileged: false,
    tmpfs: {
      '/tmp': 'rw,noexec,nosuid,size=256m',
    },
    environment,
    networks: ['affiliate_gateway_internal'],
    isNetworkInternal: true,
    capDrop: ['ALL'],
    capAdd: [],
    groupAdd: [],
    cgroupNamespace: 'default',
    ipcMode: 'private',
    securityOptions: ['no-new-privileges:true'],
  });
  const inventory = {
    now: '2026-08-25T12:00:00.000Z',
    expected: contractSnapshot,
    observed: contractSnapshot,
    processInventoryArtifactId: 'process-inventory',
    processInventoryHash,
    processInventoryCount: processInventory.length,
    processInventory,
    controlPlaneProcesses: [
      { id: 'affiliate-gateway', status: 'RUNNING' },
      { id: 'affiliate-agent-runner', status: 'RUNNING' },
      { id: 'affiliate-agent-downstream-ready', status: 'COMPLETED' },
      { id: 'affiliate-replenishment-controller', status: 'RUNNING' },
    ],
    legacyServiceUnits,
    legacyClaims: [],
    databasePermissions: {
      isAgentAllowedToConnectProductionDatabase: false,
      isAgentAllowedToWriteProductionDatabase: false,
      isAgentAllowedToReadObjectStorage: false,
      isAgentAllowedToWriteObjectStorage: false,
      isAgentAllowedToCallProviders: false,
      isGatewayAllowedToWriteProductionDatabase: true,
    },
    reviewedAgentNetwork: 'affiliate_gateway_internal',
    runnerContainer: {
      id: 'agent-runner',
      name: 'affiliate-agent-runner',
      user: '0:0',
      hasReadonlyRootFilesystem: true,
      privileged: false,
      tmpfs: {
        '/tmp': 'rw,noexec,nosuid,nodev,size=256m,uid=0,gid=0,mode=0755',
        '/dev/shm': 'rw,noexec,nosuid,nodev,size=64m,uid=0,gid=0,mode=0755',
      },
      environment: [
        'AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080',
        'AFFILIATE_AGENT_CODEX_AUTH_SEED=/run/secrets/codex-auth.json',
        'AFFILIATE_AGENT_CODEX_MODEL=gpt-5.6-luna',
      ],
      volumes: ['/reviewed/auth.json:/run/secrets/codex-auth.json:ro'],
      networks: ['affiliate_gateway_internal', 'affiliate_gateway_egress'],
      isNetworkInternal: true,
      capDrop: ['ALL'],
      capAdd: ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'KILL', 'SETGID', 'SETUID'],
      groupAdd: ['1001'],
      cgroupNamespace: 'private',
      cgroupRelativePath: 'affiliate-agent-runner',
      childUid: 1002,
      childGid: 1001,
      supervisorUid: 1001,
      securityOptions: [
        'no-new-privileges:true',
        'writable-cgroups=true',
        `apparmor=${AFFILIATE_RUNNER_APPARMOR_PROFILE}`,
        `seccomp=${runnerSeccompProfileJson}`,
      ],
      apparmorProfileSha256: runnerAppArmorProfileSha256,
      ipcMode: 'none',
    },
    containers: [
      'mapping-producer-1',
      'mapping-producer-2',
      'supply-reviewer-1',
      'supply-reviewer-2',
      'coverage-planner',
    ].map((id) => governedContainer(id)),
    auxiliaryContainers: [
      governedContainer('affiliate-agent-downstream-ready'),
      governedContainer('affiliate-replenishment-controller', [
        'AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080',
        'AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN=redacted',
      ]),
    ],
  };
  return { inventory, reviewedLegacyProcessManifest };
};



describe('affiliate mapping VM deployment boundary', () => {
  it('keeps operational credentials out of the offline model service', () => {
    const compose = read('deploy/ai/compose.yml');
    const modelService = compose.split('\n  controller:\n')[0];

    expect(modelService).toContain('- model_private');
    expect(compose).toContain('model_private:\n    internal: true');
    expect(modelService).toContain('--offline');
    expect(modelService).toContain('--api-key-file');
    expect(modelService).toContain('127.0.0.1:${MODEL_HOST_PORT:-8080}:8080');
    expect(modelService).not.toContain('env_file:');
    expect(modelService).not.toMatch(
      /DATABASE_URL|DO_SPACES|GITHUB|CODEX|SMTP|SCRAPINGDOG|FIRECRAWL/,
    );
  });

  it('renders only an internal model network for model and evaluator services', () => {
    const rendered = renderAiCompose();

    expect(rendered.networks).toEqual({
      model_private: expect.objectContaining({ internal: true }),
    });
    expect(rendered.services.model.networks).toEqual({ model_private: null });
    expect(rendered.services.evaluator.networks).toEqual({ model_private: null });
  });

  it('keeps the retained controller paused and out of governed production Compose', () => {
    const compose = read('deploy/ai/compose.yml');
    const runner = read('deploy/ai/bin/run-controller-once.sh');

    expect(compose).not.toContain('run-controller-once.sh');
    expect(compose).not.toContain('run-affiliate-mapping-agent.ts');
    expect(runner).not.toContain('run-affiliate-mapping-agent.ts');
    expect(runner).toContain('Legacy queue controller is paused');
    expect(runner).toContain('use governed gateway admission');
    expect(runner).not.toContain('arguments+=("--live")');
  });

  it('fails closed in disabled and queue modes before invoking the direct writer', () => {
    const disabled = runController('disabled');
    expect(disabled.status).toBe(64);
    expect(disabled.stderr).toContain('Controller mode is disabled');

    const queue = runController('queue');
    expect(queue.status).toBe(78);
    expect(queue.stderr).toContain('cannot write production directly');
    expect(queue.stderr).toContain('governed gateway admission');
    expect(queue.stderr).not.toContain('run-affiliate-mapping-agent.ts');
  });

  it('executes the dry-run validation branch without starting the direct writer', () => {
    const dryRun = runController('dry-run', {
      AFFILIATE_MAPPING_BASE_COMMIT: 'a'.repeat(40),
      AFFILIATE_MAPPING_MODEL_ID: 'test-model',
      AFFILIATE_MAPPING_MODEL_MANIFEST: path.join(repositoryRoot, 'package.json'),
      AFFILIATE_MAPPING_MODEL_API_KEY_FILE: path.join(repositoryRoot, 'package.json'),
      AFFILIATE_MAPPING_DRY_RUN_SOURCE_KEY: '',
    });
    expect(dryRun.status).toBe(64);
    expect(dryRun.stderr).toContain('AFFILIATE_MAPPING_DRY_RUN_SOURCE_KEY');
    expect(dryRun.stderr).not.toContain('run-affiliate-mapping-agent.ts');
  });
  it('fails closed for a fully configured dry-run without starting a child process', () => {
    const dryRun = runController('dry-run', {
      AFFILIATE_MAPPING_BASE_COMMIT: 'a'.repeat(40),
      AFFILIATE_MAPPING_MODEL_ID: 'test-model',
      AFFILIATE_MAPPING_MODEL_MANIFEST: path.join(repositoryRoot, 'package.json'),
      AFFILIATE_MAPPING_MODEL_API_KEY_FILE: path.join(repositoryRoot, 'package.json'),
      AFFILIATE_MAPPING_DRY_RUN_SOURCE_KEY: 'evaluation-source',
    });

    expect(dryRun.status).toBe(78);
    expect(dryRun.stderr).toContain('executable is retired');
    expect(dryRun.stderr).not.toContain('run-affiliate-mapping-agent.ts');
  });

  it('records missing cohort proof and paused rollback references', () => {
    const manifest = JSON.parse(read('deploy/affiliate-governed/legacy-retirement-manifest.json')) as {
      retirementStatus: string;
      cohortProof: { status: string; requiredBeforeRemoval: boolean };
      retainedPausedReferences: Array<{ path: string; state: string }>;
    };
    expect(manifest.retirementStatus).toBe('BLOCKED_PENDING_GOVERNED_COHORT_PROOF');
    expect(manifest.cohortProof).toEqual({
      status: 'MISSING',
      requiredBeforeRemoval: true,
      evidencePath: null,
      message: expect.any(String),
    });
    expect(manifest.retainedPausedReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'apps/site/deploy/ai/bin/run-controller-once.sh',
        state: 'PAUSED_FAIL_CLOSED',
      }),
      expect.objectContaining({
        path: 'apps/site/scripts/run-affiliate-intake-codex-goal.ts',
        state: 'PAUSED_FAIL_CLOSED',
      }),
    ]));
  });
  it('keeps legacy builders, loops, tests, and command registrations discoverable while proof is missing', () => {
    const manifest = JSON.parse(read('deploy/affiliate-governed/legacy-retirement-manifest.json')) as {
      paths: string[];
      retainedPausedReferences: Array<{ path: string; command?: string; state: string }>;
    };
    const expectedLegacyFiles = [
      'apps/site/src/server/affiliateImports/affiliateIntakeCodexLoop.ts',
      'apps/site/src/server/affiliateImports/approvalLoop.ts',
      'apps/site/src/server/affiliateImports/codexApprovalGoal.ts',
      'apps/site/src/server/affiliateImports/codexCliGoal.ts',
      'apps/site/src/server/affiliateImports/codexCoverageGoal.ts',
      'apps/site/src/server/affiliateImports/codexIngestionApproval.ts',
      'apps/site/src/server/affiliateImports/codexIngestionResult.ts',
      'apps/site/src/server/affiliateImports/coverageAgentLoop.ts',
      'apps/site/src/server/affiliateImports/__tests__/affiliateIntakeCodexLoop.test.ts',
      'apps/site/src/server/affiliateImports/__tests__/approvalLoop.test.ts',
      'apps/site/src/server/affiliateImports/__tests__/codexApprovalGoal.test.ts',
      'apps/site/src/server/affiliateImports/__tests__/codexCliGoal.test.ts',
      'apps/site/src/server/affiliateImports/__tests__/codexCoverageGoal.test.ts',
      'apps/site/src/server/affiliateImports/__tests__/codexIngestionApproval.test.ts',
      'apps/site/src/server/affiliateImports/__tests__/codexIngestionResult.test.ts',
      'apps/site/src/server/affiliateImports/__tests__/coverageAgentLoop.test.ts',
    ];
    expect(manifest.paths).toEqual(expect.arrayContaining(expectedLegacyFiles));
    for (const file of expectedLegacyFiles) {
      expect(fs.existsSync(path.join(repositoryRoot, file.replace(/^apps\/site\//, '')))).toBe(true);
      expect(manifest.retainedPausedReferences).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: file, state: 'PAUSED_FAIL_CLOSED' }),
      ]));
    }

    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
    };
    const expectedCommands = [
      'affiliate:scrape:due',
      'affiliate:scrape:due:dry-run',
      'affiliate:intakes:process',
      'affiliate:discovery:run',
      'affiliate:intake:automation',
      'affiliate:mapping:claim',
      'affiliate:mapping:complete',
      'affiliate:mapping:baseline',
      'affiliate:mapping:gold-capture',
      'affiliate:mapping:gold-capture-cohort',
      'affiliate:mapping:evaluate',
      'affiliate:mapping:agent',
      'affiliate:intakes:codex-goal',
      'affiliate:intakes:codex-goal:dry-run',
      'affiliate:intakes:codex-loop',
      'affiliate:intakes:codex-pool',
      'affiliate:approvals:claim',
      'affiliate:approvals:complete',
      'affiliate:approvals:codex-goal',
      'affiliate:approvals:codex-goal:dry-run',
      'affiliate:approvals:loop',
      'affiliate:coverage:claim',
      'affiliate:coverage:complete',
      'affiliate:coverage:codex-goal',
      'affiliate:coverage:codex-goal:dry-run',
      'affiliate:coverage:loop',
    ];
    for (const command of expectedCommands) {
      expect(packageJson.scripts[command]).toBeDefined();
      expect(manifest.retainedPausedReferences).toEqual(expect.arrayContaining([
        expect.objectContaining({
          path: 'apps/site/package.json',
          command,
          state: 'PAUSED_FAIL_CLOSED',
        }),
      ]));
    }
    for (const launcher of [
      'scripts/run-affiliate-intake-codex-goal.ts',
      'scripts/run-affiliate-intake-codex-loop.ts',
      'scripts/run-affiliate-approval-codex-goal.ts',
      'scripts/run-affiliate-approval-loop.ts',
      'scripts/run-affiliate-coverage-codex-goal.ts',
      'scripts/run-affiliate-coverage-loop.ts',
    ]) {
      expect(read(launcher)).toContain('process.exit(78)');
      expect(read(launcher)).toContain('governed cohort proof');
    }
    const launch = spawnSync(
      path.join(repositoryRoot, 'node_modules/.bin/tsx'),
      ['scripts/run-affiliate-intake-codex-goal.ts', '--dry-run'],
      { cwd: repositoryRoot, env: process.env, encoding: 'utf8' },
    );
    expect(launch.status).toBe(78);
    expect(launch.stderr).toContain('Legacy affiliate launcher is paused');
    expect(launch.stderr).toContain('governed cohort proof');
  });

  it('runs the held-out evaluator without the trusted controller environment', () => {
    const compose = read('deploy/ai/compose.yml');
    const evaluator = compose
      .split('\n  evaluator:\n')[1]
      .split('\nnetworks:\n')[0];

    expect(evaluator).not.toContain('env_file:');
    expect(evaluator).not.toMatch(/DATABASE_URL|DO_SPACES|SCRAPINGDOG|FIRECRAWL/);
    expect(evaluator).toContain('- model_private');
    expect(evaluator).not.toContain('- controller_egress');
  });

  it('requires digest-pinned runtime images during host verification', () => {
    const verification = read('deploy/ai/bin/verify-host.sh');

    expect(verification).toContain('@sha256:[a-f0-9]{64}$');
    expect(verification).toContain('LLAMA_CPP_IMAGE');
    expect(verification).toContain('EVALUATOR_IMAGE');
    expect(verification).toContain('commercialUseApproved');
    expect(verification).toContain('offlineColdStartVerifiedAt');
    expect(verification).toContain('quantization hash does not match');
  });
  it('assigns each governed supervisor its own runner signing key', () => {
    const compose = read('deploy/affiliate-governed/compose.yml');
    expect(compose).not.toContain('${AFFILIATE_AGENT_RUNNER_PROTOCOL_PRIVATE_KEY');
    for (const variable of [
      'AFFILIATE_MAPPING_PRODUCER_1_RUNNER_PROTOCOL_PRIVATE_KEY',
      'AFFILIATE_MAPPING_PRODUCER_2_RUNNER_PROTOCOL_PRIVATE_KEY',
      'AFFILIATE_SUPPLY_REVIEWER_1_RUNNER_PROTOCOL_PRIVATE_KEY',
      'AFFILIATE_SUPPLY_REVIEWER_2_RUNNER_PROTOCOL_PRIVATE_KEY',
      'AFFILIATE_COVERAGE_PLANNER_RUNNER_PROTOCOL_PRIVATE_KEY',
    ]) {
      expect(compose).toContain(`\${${variable}:?`);
    }
    expect(compose).toContain(
      'AFFILIATE_AGENT_RUNNER_PROTOCOL_PUBLIC_KEYS: ${AFFILIATE_AGENT_RUNNER_PROTOCOL_PUBLIC_KEYS:?',
    );
  });

  it('keeps Codex auth and egress access on the runner only', () => {
    const compose = read('deploy/affiliate-governed/compose.yml');
    const runner = compose
      .split('\n  affiliate-agent-runner:\n')[1]
      .split('\n  mapping-producer-1:\n')[0];
    const supervisor = compose
      .split('\n  mapping-producer-1:\n')[1]
      .split('\n  mapping-producer-2:\n')[0];

    expect(runner).toContain('- gateway_internal');
    expect(runner).toContain('- gateway_egress');
    expect(runner).toContain('AFFILIATE_AGENT_CODEX_AUTH_SEED');
    expect(runner).toContain('AFFILIATE_AGENT_CODEX_MODEL');
    expect(runner).toContain('${AFFILIATE_AGENT_CODEX_AUTH_FILE:?');
    expect(supervisor).not.toContain('AFFILIATE_AGENT_CODEX');
    expect(supervisor).not.toContain('codex-auth.json');
    expect((compose.match(/AFFILIATE_AGENT_CODEX_AUTH_FILE/g) ?? []).length).toBe(1);
  });
  it('gives the cadence controller only the replenishment credential', () => {
    const compose = read('deploy/affiliate-governed/compose.yml');
    const controller = compose
      .split('\n  affiliate-replenishment-controller:\n')[1]
      .split('\n  affiliate-agent-runner:\n')[0];

    expect(controller).toContain(
      'AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN: ${AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN:?',
    );
    expect(controller).not.toContain('AFFILIATE_GATEWAY_OPERATOR_TOKEN');

    const gateway = compose
      .split('\n  affiliate-gateway:\n')[1]
      .split('\n  affiliate-replenishment-controller:\n')[0];
    expect(gateway).toContain('AFFILIATE_GATEWAY_OPERATOR_TOKEN');
    expect(gateway).toContain('AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN');
    const controllerScript = read('scripts/run-affiliate-replenishment-controller.ts');
    expect(controllerScript).toContain('x-affiliate-gateway-replenishment-token');
    expect(controllerScript).toContain('AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN');
    expect(controllerScript).not.toContain('x-affiliate-gateway-operator-token');
    expect(controllerScript).not.toContain('AFFILIATE_GATEWAY_OPERATOR_TOKEN');
  });
});

describe('legacy due-scrape writer boundary', () => {
  it('blocks production writes while retaining the production dry-run path', () => {
    expect(() => assertLegacyDueScrapeExecutionAllowed({
      nodeEnv: 'production',
      argv: ['node', 'run-due-affiliate-scrapes.ts'],
    })).toThrow('disabled for production');

    expect(() => assertLegacyDueScrapeExecutionAllowed({
      nodeEnv: 'production',
      argv: ['node', 'run-due-affiliate-scrapes.ts', '--dry-run'],
    })).not.toThrow();
  });

  it('rejects the live selector instead of allowing a legacy writer to bypass admission', () => {
    expect(() => assertLegacyDueScrapeExecutionAllowed({
      nodeEnv: 'development',
      argv: ['node', 'run-due-affiliate-scrapes.ts', '--live'],
    })).toThrow('does not accept --live');
  });

  it('requires exact disabled or masked and inactive systemd evidence', () => {
    const reviewed = [
      { processId: 'legacy-intake', unitId: 'bracketiq-affiliate-intake-automation.timer' },
      { processId: 'legacy-scrape', unitId: 'bracketiq-affiliate-scrape-daily.timer' },
    ];
    const valid = [
      { id: 'bracketiq-affiliate-intake-automation.timer', isEnabled: 'disabled', isActive: 'inactive' },
      { id: 'bracketiq-affiliate-scrape-daily.timer', isEnabled: 'masked', isActive: 'INACTIVE' },
    ];
    expect(validateAffiliateLegacyServiceUnitEvidence(reviewed, valid)).toEqual([]);
    expect(validateAffiliateLegacyServiceUnitEvidence(
      reviewed,
      valid.slice(0, 1),
    )).toEqual(expect.arrayContaining([
      expect.stringContaining('missing legacyServiceUnits evidence'),
    ]));
    expect(validateAffiliateLegacyServiceUnitEvidence(
      reviewed,
      valid.map((unit) => unit.id.endsWith('.timer')
        ? { ...unit, isEnabled: 'enabled' }
        : unit),
    )).toEqual(expect.arrayContaining([
      expect.stringContaining('must be DISABLED or MASKED and INACTIVE'),
    ]));
    expect(validateAffiliateLegacyServiceUnitEvidence(
      reviewed,
      valid.map((unit) => unit.id.endsWith('.timer')
        ? { ...unit, isActive: 'active' }
        : unit),
    )).toEqual(expect.arrayContaining([
      expect.stringContaining('must be DISABLED or MASKED and INACTIVE'),
    ]));
  });

});

describe('cutover inventory schema boundary', () => {
  it('parses a valid inventory before building an intact report', () => {
    const { inventory, reviewedLegacyProcessManifest } = strictInventoryFixture();
    const parsed = parseAffiliateCutoverInventory(
      inventory,
      reviewedLegacyProcessManifest,
      new Date('2026-08-25T12:01:00.000Z'),
    );
    const report = buildAffiliateCutoverPreflightReport(parsed);

    expect(parsed.now).toEqual(new Date('2026-08-25T12:01:00.000Z'));
    expect(report.legacyServiceUnits).toEqual(inventory.legacyServiceUnits);
    expect(isAffiliateCutoverPreflightReportIntact(report)).toBe(true);
  });

  it('rejects unknown top-level inventory keys before report construction', () => {
    const { inventory, reviewedLegacyProcessManifest } = strictInventoryFixture();

    expect(() => parseAffiliateCutoverInventory({
      ...inventory,
      unexpectedTopLevelKey: true,
    }, reviewedLegacyProcessManifest, new Date('2026-08-25T12:01:00.000Z'))).toThrow(/<root>.*Unrecognized key/);
  });

  it('rejects unknown process inventory keys before report construction', () => {
    const { inventory, reviewedLegacyProcessManifest } = strictInventoryFixture();

    expect(() => parseAffiliateCutoverInventory({
      ...inventory,
      processInventory: [{
        ...inventory.processInventory[0],
        unexpectedProcessKey: true,
      }],
    }, reviewedLegacyProcessManifest, new Date('2026-08-25T12:01:00.000Z'))).toThrow(/processInventory\.0.*Unrecognized key/);
  });

  it('rejects unknown container inventory keys before report construction', () => {
    const { inventory, reviewedLegacyProcessManifest } = strictInventoryFixture();

    expect(() => parseAffiliateCutoverInventory({
      ...inventory,
      runnerContainer: {
        ...inventory.runnerContainer,
        unexpectedContainerKey: true,
      },
    }, reviewedLegacyProcessManifest, new Date('2026-08-25T12:01:00.000Z'))).toThrow(/runnerContainer.*Unrecognized key/);
  });

  it('refreshes evaluatedAt from trusted execution time and rejects stale or future capture time', () => {
    const { inventory, reviewedLegacyProcessManifest } = strictInventoryFixture();
    const first = buildAffiliateCutoverPreflightReport(parseAffiliateCutoverInventory(
      inventory,
      reviewedLegacyProcessManifest,
      new Date('2026-08-25T12:01:00.000Z'),
    ));
    const second = buildAffiliateCutoverPreflightReport(parseAffiliateCutoverInventory(
      inventory,
      reviewedLegacyProcessManifest,
      new Date('2026-08-25T12:02:00.000Z'),
    ));

    expect(first.evaluatedAt).toBe('2026-08-25T12:01:00.000Z');
    expect(second.evaluatedAt).toBe('2026-08-25T12:02:00.000Z');
    expect(second.inputHash).toBe(first.inputHash);
    expect(second.reportHash).not.toBe(first.reportHash);
    expect(() => parseAffiliateCutoverInventory(
      inventory,
      reviewedLegacyProcessManifest,
      new Date('2026-08-25T11:59:00.000Z'),
    )).toThrow('in the future');
    expect(() => parseAffiliateCutoverInventory(
      inventory,
      reviewedLegacyProcessManifest,
      new Date('2026-08-25T12:16:00.001Z'),
    )).toThrow('older than the allowed');
  });
});
