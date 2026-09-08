/** @jest-environment node */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { hashAffiliateAgentValue } from '../agentGatewayContracts';
import {
  AFFILIATE_RUNNER_APPARMOR_PROFILE,
  AFFILIATE_RUNNER_APPARMOR_SHA256,
  AFFILIATE_RUNNER_SECCOMP_SHA256,
  buildAffiliateCutoverPreflightReport,
  isAffiliateCutoverPreflightApplySafe,
  isAffiliateCutoverPreflightReportIntact,
  isAffiliateCutoverPreflightFresh,
  buildAffiliateLegacyReconciliationReport,
  buildAffiliateCutoverRollbackInput,
  decideAffiliateCutoverRollback,
  inspectAffiliateAgentContainer,
  inspectAffiliateAuxiliaryContainer,
  inspectAffiliateAgentRunnerContainer,
  hashAffiliateCutoverProcessInventory,
  hashAffiliateLegacyProcessManifest,
  type AffiliateCutoverPreflightInput,
  type AffiliateLegacyReconciliationInput,
} from '../affiliateFleetCutover';
import { normalizeAffiliateSupplyIdentity } from '../affiliateSupplyLifecycle';

const runnerProfileDirectory = path.resolve(process.cwd(), 'deploy/affiliate-governed');
const runnerSeccompProfileJson = readFileSync(
  path.join(runnerProfileDirectory, 'runner-seccomp.json'),
  'utf8',
);
const runnerAppArmorProfileSha256 = createHash('sha256')
  .update(readFileSync(path.join(runnerProfileDirectory, 'runner.apparmor')))
  .digest('hex');

const source = (overrides: Partial<AffiliateLegacyReconciliationInput['sources'][number]> = {}) => ({
  id: 'source-1',
  requestedUrl: 'https://example.test/events',
  resolvedCanonicalUrl: 'https://example.test/events',
  isRedirectVerified: true,
  targetKind: 'EVENT',
  ...overrides,
});

const baseReconciliationInput = (
  overrides: Partial<AffiliateLegacyReconciliationInput> = {},
): AffiliateLegacyReconciliationInput => ({
  now: new Date('2026-08-25T12:00:00.000Z'),
  sources: [source()],
  roots: [],
  records: [{ kind: 'SOURCE', id: 'source-1', sourceId: 'source-1', evidenceRefs: ['source:source-1'] }],
  targets: [{
    id: 'target-1',
    sourceId: 'source-1',
    candidateId: 'candidate-1',
    targetType: 'EVENT',
    targetId: 'event-1',
    status: 'DISCOVERED',
    evidenceRefs: ['candidate:candidate-1'],
  }],
  claims: [],
  ...overrides,
});

const contractSnapshot = {
  supplyContractVersion: 4,
  supplyContractHash: 'a'.repeat(64),
  deploymentContractVersion: 2,
  deploymentContractHash: 'b'.repeat(64),
  gatewayVersion: 9,
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

const networkAttachments = {
  gateway: [{ name: 'affiliate_gateway_internal', id: 'a'.repeat(64) }],
  modelAuth: [
    { name: 'affiliate_model_auth_internal', id: 'b'.repeat(64) },
    { name: 'affiliate_model_egress', id: 'c'.repeat(64) },
  ],
  modelClient: [
    { name: 'affiliate_model_auth_internal', id: 'b'.repeat(64) },
    { name: 'affiliate_model_client_internal', id: 'd'.repeat(64) },
    { name: 'affiliate_model_egress', id: 'c'.repeat(64) },
  ],
  runner: [
    { name: 'affiliate_gateway_internal', id: 'a'.repeat(64) },
    { name: 'affiliate_model_client_internal', id: 'd'.repeat(64) },
  ],
  production: [{
    name: 'bracketiq-production_backend',
    id: 'e'.repeat(64),
  }],
} as const;
const governedContainer = (id: string) => ({
  id,
  user: '1001:1001',
  hasReadonlyRootFilesystem: true,
  privileged: false,
  environment: [
    'AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080',
    'AFFILIATE_AGENT_RUNNER_SOCKET=/workspaces/.runner.sock',
    'AFFILIATE_AGENT_WORKSPACE_SIGNING_KEY=redacted',
  ],
  networks: ['affiliate_gateway_internal'],
  networkAttachments: networkAttachments.gateway,
  isNetworkInternal: true,
  capDrop: ['ALL'],
  capAdd: [],
  groupAdd: [],
  securityOptions: ['no-new-privileges:true'],
});
const runnerContainer = {
  ...governedContainer('agent-runner'),
  user: '0:0',
  privileged: false,
  tmpfs: {
    '/tmp': 'rw,noexec,nosuid,nodev,size=256m,uid=0,gid=0,mode=0755',
    '/dev/shm': 'rw,noexec,nosuid,nodev,size=64m,uid=0,gid=0,mode=0755',
  },
  environment: [
    'AFFILIATE_AGENT_UID=1001',
    'AFFILIATE_AGENT_RUNNER_CHILD_UID=1002',
    'AFFILIATE_AGENT_RUNNER_CHILD_GID=1001',
    'AFFILIATE_AGENT_RUNNER_CGROUP_RELATIVE_PATH=affiliate-agent-runner',
    'AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080',
    'AFFILIATE_AGENT_MODEL_GATEWAY_ADDRESS=http://affiliate-model-gateway:4000',
    'AFFILIATE_AGENT_MODEL_GATEWAY_TOKEN=<redacted>',
    'AFFILIATE_AGENT_OMP_MODEL=openai-codex/gpt-5.6-luna',
  ],
  mounts: [{
    source: 'affiliate-governed-workspaces',
    type: 'volume' as const,
    target: '/workspaces',
    readOnly: false,
  }],
  networks: ['affiliate_gateway_internal', 'affiliate_model_client_internal'],
  networkAttachments: networkAttachments.runner,
  ipcMode: 'none',
  capAdd: ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'KILL', 'SETGID', 'SETUID'],
  groupAdd: ['1001'],
  cgroupNamespace: 'private',
  cgroupMountWritable: true,
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
};
const processInventory = [
  { id: 'legacy-goal', kind: 'LEGACY', processClass: 'GOAL', command: 'affiliate:intakes:codex-goal', status: 'STOPPED' },
  { id: 'legacy-loop', kind: 'LEGACY', processClass: 'MAPPING', command: 'affiliate:intakes:codex-loop', status: 'STOPPED' },
  { id: 'mapper-1', kind: 'GOVERNED', role: 'MAPPING_PRODUCER', workerId: 'mapping-1', command: 'affiliate:agent:supervisor', status: 'STOPPED' },
  { id: 'mapper-2', kind: 'GOVERNED', role: 'MAPPING_PRODUCER', workerId: 'mapping-2', command: 'affiliate:agent:supervisor', status: 'STOPPED' },
  { id: 'reviewer-1', kind: 'GOVERNED', role: 'SUPPLY_REVIEWER', workerId: 'reviewer-1', command: 'affiliate:agent:supervisor', status: 'STOPPED' },
  { id: 'reviewer-2', kind: 'GOVERNED', role: 'SUPPLY_REVIEWER', workerId: 'reviewer-2', command: 'affiliate:agent:supervisor', status: 'STOPPED' },
  { id: 'coverage-1', kind: 'GOVERNED', role: 'COVERAGE_PLANNER', workerId: 'coverage-1', command: 'affiliate:agent:supervisor', status: 'STOPPED' },
] as const;
const controlPlaneProcesses = [
  { id: 'affiliate-gateway', status: 'STOPPED' },
  { id: 'affiliate-agent-runner', status: 'RUNNING' },
  { id: 'affiliate-agent-downstream-ready', status: 'COMPLETED' },
  { id: 'affiliate-replenishment-controller', status: 'STOPPED' },
] as const;
const auxiliaryContainers = [
  governedContainer('affiliate-agent-downstream-ready'),
  {
    ...governedContainer('affiliate-replenishment-controller'),
    environment: [
      ...governedContainer('affiliate-replenishment-controller').environment,
      'AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN=redacted',
    ],
  },
] as const;

const processInventoryArtifactId = 'observed-process-inventory-2026-08-25';
const processInventoryHash = hashAffiliateCutoverProcessInventory(processInventory);

const expectedLegacyProcesses = [
  { id: 'legacy-goal', processClass: 'GOAL' },
  { id: 'legacy-loop', processClass: 'MAPPING' },
];
const reviewedSystemdUnits = [
  { processId: 'legacy-goal', unitId: 'bracketiq-affiliate-intake-automation.timer' },
  { processId: 'legacy-loop', unitId: 'bracketiq-affiliate-scrape-daily.timer' },
] as const;
const legacyServiceUnits = [
  { id: 'bracketiq-affiliate-intake-automation.timer', isEnabled: 'DISABLED', isActive: 'INACTIVE' },
  { id: 'bracketiq-affiliate-scrape-daily.timer', isEnabled: 'MASKED', isActive: 'INACTIVE' },
] as const;
const reviewedLegacyProcessManifest = {
  schemaVersion: 1,
  artifactId: 'reviewed-process-manifest-2026-08-25',
  processes: expectedLegacyProcesses,
  systemdUnits: reviewedSystemdUnits,
  processCount: expectedLegacyProcesses.length,
  manifestHash: hashAffiliateLegacyProcessManifest(expectedLegacyProcesses, reviewedSystemdUnits),
  inventoryArtifactId: processInventoryArtifactId,
  inventoryHash: processInventoryHash,
  inventoryCount: processInventory.length,
  reviewedAt: '2026-08-25T11:30:00.000Z',
  reviewedBy: 'cutover-reviewer',
} as const;
const reviewedManifestFor = (
  processes: readonly { id: string; processClass: string }[],
) => ({
  schemaVersion: 1 as const,
  artifactId: 'reviewed-process-manifest-2026-08-25',
  processes,
  systemdUnits: reviewedSystemdUnits,
  processCount: processes.length,
  manifestHash: hashAffiliateLegacyProcessManifest(processes, reviewedSystemdUnits),
  inventoryArtifactId: processInventoryArtifactId,
  inventoryHash: processInventoryHash,
  inventoryCount: processInventory.length,
  reviewedAt: '2026-08-25T11:30:00.000Z',
  reviewedBy: 'cutover-reviewer',
});
const reviewedAgentImage = `ghcr.io/razumly/bracketiq-affiliate-governed@sha256:${'a'.repeat(64)}`;
const reviewedAgentImageId = `sha256:${'b'.repeat(64)}`;
const reviewedWorkspaceVolume = 'affiliate-governed-workspaces';
const reviewedBrokerStateVolume = 'affiliate-model-auth-broker-state';
const modelServiceBearerSources = {
  broker: {
    path: '/private/omp-auth-broker.token',
    isRegularFile: true,
    isSymlink: false,
    uid: 0,
    gid: 1003,
    mode: '0640',
    sizeBytes: 64,
    sha256: 'c'.repeat(64),
  },
  gateway: {
    path: '/private/omp-model-gateway.token',
    isRegularFile: true,
    isSymlink: false,
    uid: 0,
    gid: 1003,
    mode: '0640',
    sizeBytes: 64,
    sha256: 'd'.repeat(64),
  },
} as const;
const modelServiceContainer = (role: 'broker' | 'gateway') => {
  const isBroker = role === 'broker';
  const id = isBroker ? 'affiliate-model-auth-broker' : 'affiliate-model-gateway';
  const containerId = isBroker ? '1'.repeat(64) : '2'.repeat(64);
  const bearerSource = isBroker ? modelServiceBearerSources.broker : modelServiceBearerSources.gateway;
  return {
    id,
    containerId,
    image: reviewedAgentImage,
    imageId: reviewedAgentImageId,
    user: isBroker ? '1003:1003' : '1004:1004',
    hasReadonlyRootFilesystem: true,
    privileged: false,
    tmpfs: isBroker
      ? { '/tmp': 'rw,noexec,nosuid,nodev,size=256m' }
      : {
          '/tmp': 'rw,noexec,nosuid,nodev,size=256m',
          '/var/lib/omp': 'rw,noexec,nosuid,nodev,size=512m,uid=1004,gid=1004,mode=0700',
        },
    environment: isBroker
      ? [
          'HOME=/var/lib/omp',
          'NODE_ENV=production',
          'NODE_VERSION=22.0.0',
          'OMP_PROFILE=affiliate-model-auth-broker',
          'PATH=/workspace/apps/site/node_modules/.bin:/usr/local/bin:/usr/bin:/bin',
          'PI_CONFIG_DIR=.omp',
          'YARN_VERSION=1.22.22',
        ]
      : [
          'HOME=/var/lib/omp',
          'NODE_ENV=production',
          'NODE_VERSION=22.0.0',
          'OMP_PROFILE=affiliate-model-gateway',
          'PATH=/workspace/apps/site/node_modules/.bin:/usr/local/bin:/usr/bin:/bin',
          'PI_CONFIG_DIR=.omp',
          'YARN_VERSION=1.22.22',
          'OMP_AUTH_BROKER_URL=http://affiliate-model-auth-broker:8765',
        ],
    entrypoint: [
      '/usr/local/bin/prepare-omp-service',
      isBroker ? 'broker' : 'gateway',
    ],
    command: isBroker
      ? [
          '/workspace/apps/site/node_modules/.bin/omp',
          'auth-broker',
          'serve',
          '--bind=0.0.0.0:8765',
        ]
      : [
          '/workspace/apps/site/node_modules/.bin/omp',
          'auth-gateway',
          'serve',
          '--bind=0.0.0.0:4000',
        ],
    mounts: isBroker
      ? [
          { source: reviewedBrokerStateVolume, type: 'volume', target: '/var/lib/omp', readOnly: false },
          { source: bearerSource.path, type: 'bind', target: '/run/secrets/affiliate-model-auth-broker-token', readOnly: true },
        ]
      : [
          { source: modelServiceBearerSources.broker.path, type: 'bind', target: '/run/secrets/affiliate-model-auth-broker-token', readOnly: true },
          { source: bearerSource.path, type: 'bind', target: '/run/secrets/affiliate-model-gateway-token', readOnly: true },
        ],
    networks: isBroker
      ? ['affiliate_model_auth_internal', 'affiliate_model_egress']
      : [
          'affiliate_model_auth_internal',
          'affiliate_model_client_internal',
          'affiliate_model_egress',
        ],
    networkAttachments: isBroker ? networkAttachments.modelAuth : networkAttachments.modelClient,
    internalNetworks: isBroker
      ? ['affiliate_model_auth_internal']
      : ['affiliate_model_auth_internal', 'affiliate_model_client_internal'],
    exposedPorts: [isBroker ? '8765' : '4000'],
    publishedPorts: [],
    capDrop: ['ALL'],
    capAdd: [],
    groupAdd: isBroker ? [] : ['1003'],
    securityOptions: ['no-new-privileges:true'],
    status: 'created',
    healthStatus: 'none',
    restartPolicy: 'no',
    hasProductionBackendAccess: false,
  };
};
const preflightInput = (
  overrides: Partial<AffiliateCutoverPreflightInput> = {},
): AffiliateCutoverPreflightInput => ({
  expected: contractSnapshot,
  observed: contractSnapshot,
  now: new Date('2026-08-25T12:00:00.000Z'),
  reviewedLegacyProcessManifest,
  processInventoryArtifactId: processInventoryArtifactId,
  processInventoryHash,
  processInventoryCount: processInventory.length,
  legacyServiceUnits,
  reviewedAgentNetwork: 'affiliate_gateway_internal',
  reviewedProductionBackendNetwork: 'bracketiq-production_backend',
  reviewedProductionBackendNetworkId: networkAttachments.production[0].id,
  productionDatabaseNetworkEvidence: {
    containerId: 'f'.repeat(64),
    networks: networkAttachments.production,
  },
  reviewedAgentImage,
  reviewedAgentImageId,
  reviewedBrokerStateVolume,
  reviewedWorkspaceVolume,
  brokerStateVolumeAttachments: [{
    volumeName: reviewedBrokerStateVolume,
    containerId: '1'.repeat(64),
    serviceId: 'affiliate-model-auth-broker',
    target: '/var/lib/omp',
    readOnly: false,
  }],
  modelAuthBrokerBearerSource: modelServiceBearerSources.broker,
  modelGatewayBearerSource: modelServiceBearerSources.gateway,
  runnerModelGatewayBearerSha256: modelServiceBearerSources.gateway.sha256,
  reviewedModelServiceState: 'STOPPED',
  reviewedModelAuthNetwork: 'affiliate_model_auth_internal',
  reviewedModelClientNetwork: 'affiliate_model_client_internal',
  reviewedModelEgressNetwork: 'affiliate_model_egress',
  modelAuthBrokerContainer: modelServiceContainer('broker'),
  modelGatewayContainer: modelServiceContainer('gateway'),
  processInventory,
  controlPlaneProcesses,
  auxiliaryContainers,
  legacyClaims: [],
  databasePermissions: {
    isAgentAllowedToConnectProductionDatabase: false,
    isAgentAllowedToWriteProductionDatabase: false,
    isAgentAllowedToReadObjectStorage: false,
    isAgentAllowedToWriteObjectStorage: false,
    isAgentAllowedToCallProviders: false,
    isGatewayAllowedToWriteProductionDatabase: true,
  },
  runnerContainer,
  containers: ['mapper-1', 'mapper-2', 'reviewer-1', 'reviewer-2', 'coverage-1'].map(governedContainer),
  ...overrides,
});

describe('affiliate fleet cutover contracts', () => {
  it('produces stable hashes and preserves an unverifiable public target as Last-Known-Good', () => {
    const first = buildAffiliateLegacyReconciliationReport(baseReconciliationInput());
    const second = buildAffiliateLegacyReconciliationReport(baseReconciliationInput());

    expect(second.inputHash).toBe(first.inputHash);
    expect(second.outputHash).toBe(first.outputHash);
    expect(second.reportHash).toBe(first.reportHash);
    expect(first.counts).toEqual(expect.objectContaining({
      sources: 1,
      preservedPublicTargets: 1,
      lastKnownGoodTargets: 1,
    }));
    expect(first.roots[0].targetProjections).toEqual([
      expect.objectContaining({
        status: 'LAST_KNOWN_GOOD',
        action: 'MARK_LAST_KNOWN_GOOD',
      }),
    ]);
    expect(first.roots[0].targetProjections[0].evidenceRefs).toContain('candidate:candidate-1');
  });
  it('does not publish a PUBLISHED target without explicit verifiable evidence', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      targets: [{
        ...baseReconciliationInput().targets[0],
        status: 'PUBLISHED',
        isEvidenceVerifiable: false,
      }],
    }));

    expect(report.counts).toEqual(expect.objectContaining({
      preservedPublicTargets: 1,
      lastKnownGoodTargets: 1,
    }));
    expect(report.roots[0].targetProjections).toEqual([
      expect.objectContaining({
        status: 'LAST_KNOWN_GOOD',
        action: 'MARK_LAST_KNOWN_GOOD',
      }),
    ]);
    expect(report.roots.flatMap((root) => root.targetProjections.filter((target) => target.status === 'PUBLISHED'))).toHaveLength(0);
  });

  it('does not publish an OBSERVED target even when its evidence is verifiable', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      targets: [{
        ...baseReconciliationInput().targets[0],
        status: 'OBSERVED',
        isEvidenceVerifiable: true,
      }],
    }));

    expect(report.counts).toEqual(expect.objectContaining({
      preservedPublicTargets: 1,
      lastKnownGoodTargets: 1,
    }));
    expect(report.roots[0].targetProjections).toEqual([
      expect.objectContaining({
        status: 'LAST_KNOWN_GOOD',
        action: 'MARK_LAST_KNOWN_GOOD',
      }),
    ]);
    expect(report.roots.flatMap((root) => root.targetProjections.filter((target) => target.status === 'PUBLISHED'))).toHaveLength(0);
  });

  it('keeps an unverifiable duplicate target as Last-Known-Good regardless of input order', () => {
    const input = baseReconciliationInput({
      targets: [
        {
          ...baseReconciliationInput().targets[0],
          id: 'target-published',
          status: 'PUBLISHED',
          isEvidenceVerifiable: true,
        },
        {
          ...baseReconciliationInput().targets[0],
          id: 'target-lkg',
          status: 'LAST_KNOWN_GOOD',
          isEvidenceVerifiable: false,
        },
      ],
    });
    const first = buildAffiliateLegacyReconciliationReport(input);
    const second = buildAffiliateLegacyReconciliationReport({
      ...input,
      targets: [...input.targets].reverse(),
    });

    expect(first.inputHash).toBe(second.inputHash);
    expect(first.outputHash).toBe(second.outputHash);
    expect(first.reportHash).toBe(second.reportHash);
    expect(first.counts).toEqual(expect.objectContaining({
      preservedPublicTargets: 1,
      lastKnownGoodTargets: 1,
    }));
    expect(first.roots[0].targetProjections).toEqual([
      expect.objectContaining({
        status: 'LAST_KNOWN_GOOD',
        action: 'MARK_LAST_KNOWN_GOOD',
      }),
    ]);
    expect(first.roots.flatMap((root) => root.targetProjections.filter((target) => target.status === 'PUBLISHED'))).toHaveLength(0);
  });
  it('keeps reconciliation hashes stable when findings change order', () => {
    const findings = [
      {
        code: 'WARNING_B',
        severity: 'WARNING' as const,
        detail: 'Second warning.',
        recordIds: ['record-b'],
        resolution: 'Review the second warning.',
      },
      {
        code: 'BLOCKING_A',
        severity: 'BLOCKING' as const,
        detail: 'First blocking finding.',
        recordIds: ['record-a'],
        resolution: 'Resolve the first finding.',
      },
    ];
    const first = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      preflightFindings: findings,
    }));
    const second = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      preflightFindings: [...findings].reverse(),
    }));

    expect(second.inputHash).toBe(first.inputHash);
    expect(second.outputHash).toBe(first.outputHash);
    expect(second.reportHash).toBe(first.reportHash);
  });

  it('blocks unlinked query variants that share a root path', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      sources: [source({
        requestedUrl: 'https://example.test/events?a=2',
        resolvedCanonicalUrl: 'https://example.test/events?a=2',
        isRedirectVerified: false,
      })],
      roots: [{
        id: 'root-a',
        identityKey: 'identity-for-events-a1',
        canonicalUrl: 'https://example.test/events?a=1',
        origin: 'https://example.test',
        pathKey: 'https://example.test/events',
      }],
      targets: [],
    }));

    expect(report.isApplySafe).toBe(false);
    expect(report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CANONICAL_AMBIGUITY',
        recordIds: ['root-a', 'source-1'],
      }),
    ]));
    expect(report.roots).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'REVIEW_REQUIRED' }),
    ]));
  });

  it('blocks an explicit root whose identity key differs despite matching origin and path', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      sources: [source({
        existingSupplySourceId: 'root-legacy',
        isRedirectVerified: false,
      })],
      roots: [{
        id: 'root-legacy',
        identityKey: 'legacy-identity',
        canonicalUrl: 'https://example.test/events',
        origin: 'https://example.test',
        pathKey: 'https://example.test/events',
      }],
      targets: [],
    }));

    expect(report.isApplySafe).toBe(false);
    expect(report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CANONICAL_AMBIGUITY',
        recordIds: ['root-legacy', 'source-1'],
      }),
    ]));
    expect(report.roots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        existingRootId: 'root-legacy',
        action: 'REVIEW_REQUIRED',
      }),
    ]));
  });

  it('uses origin and path only when a legacy root identity key is absent', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      sources: [source({
        existingSupplySourceId: 'root-legacy',
        isRedirectVerified: false,
      })],
      roots: [{
        id: 'root-legacy',
        identityKey: '',
        canonicalUrl: 'https://example.test/events',
        origin: 'https://example.test',
        pathKey: 'https://example.test/events',
      }],
      targets: [],
    }));

    expect(report.isApplySafe).toBe(true);
    expect(report.blockingFindings).toHaveLength(0);
    expect(report.roots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        existingRootId: 'root-legacy',
        action: 'REUSE_ROOT',
      }),
    ]));
  });
  it('uses origin and path fallback for an unlinked root with no identity key', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      roots: [{
        id: 'root-legacy',
        identityKey: '',
        canonicalUrl: 'https://example.test/events',
        origin: 'https://example.test',
        pathKey: 'https://example.test/events',
      }],
      targets: [],
    }));

    expect(report.isApplySafe).toBe(true);
    expect(report.blockingFindings).toHaveLength(0);
    expect(report.roots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        existingRootId: 'root-legacy',
        action: 'REUSE_ROOT',
      }),
    ]));
  });


  it('blocks a target whose source and Supply Source links resolve to different roots', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      roots: [{
        id: 'root-a',
        identityKey: '',
        canonicalUrl: 'https://example.test/events',
        origin: 'https://example.test',
        pathKey: 'https://example.test/events',
      }, {
        id: 'root-b',
        identityKey: 'different-root',
        canonicalUrl: 'https://other.example/events',
        origin: 'https://other.example',
        pathKey: 'https://other.example/events',
      }],
      targets: [{
        id: 'target-conflict',
        sourceId: 'source-1',
        supplySourceId: 'root-b',
        targetType: 'EVENT',
        targetId: 'event-1',
        status: 'PUBLISHED',
        isEvidenceVerifiable: true,
      }],
    }));

    expect(report.isApplySafe).toBe(false);
    expect(report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'LINEAGE_ROOT_MISMATCH',
        recordIds: ['root-a', 'root-b', 'target-conflict'],
      }),
    ]));
    expect(report.roots.flatMap((root) => root.targetProjections)).toHaveLength(0);
  });

  it('blocks cross-origin explicit roots without predecessor evidence', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      sources: [source({ existingSupplySourceId: 'root-legacy' })],
      roots: [{
        id: 'root-legacy',
        identityKey: 'legacy-identity',
        canonicalUrl: 'https://legacy.example/events',
        origin: 'https://legacy.example',
        pathKey: 'https://legacy.example/events',
      }],
      targets: [],
    }));

    expect(report.isApplySafe).toBe(false);
    expect(report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CROSS_ORIGIN_SUPPLY_SOURCE_LINK',
        recordIds: ['root-legacy', 'source-1'],
      }),
    ]));
    expect(report.roots).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'REVIEW_REQUIRED' }),
    ]));
  });
  it('blocks a non-null record link to a missing Supply Source root', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      records: [{
        kind: 'EVENT',
        id: 'event-1',
        sourceId: 'source-1',
        supplySourceId: 'missing-root',
      }],
      targets: [],
    }));

    expect(report.isApplySafe).toBe(false);
    expect(report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'MISSING_LINEAGE',
        recordIds: ['event-1', 'missing-root'],
      }),
    ]));
  });

  it('blocks multiple legacy source rows with one exact identity', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      sources: [
        source({ id: 'source-a' }),
        source({ id: 'source-b' }),
      ],
      records: [
        { kind: 'SOURCE', id: 'source-a', sourceId: 'source-a' },
        { kind: 'SOURCE', id: 'source-b', sourceId: 'source-b' },
      ],
      targets: [],
    }));

    expect(report.isApplySafe).toBe(false);
    expect(report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'AMBIGUOUS_SOURCE_IDENTITY',
        recordIds: ['source-a', 'source-b'],
        resolution: expect.stringContaining('predecessor or successor'),
      }),
    ]));
  });

  it('blocks duplicate legacy source IDs with conflicting identity evidence', () => {
    const conflictingSources = [
      source({
        requestedUrl: 'https://example.test/events-a',
        resolvedCanonicalUrl: 'https://example.test/events-a',
      }),
      source({
        requestedUrl: 'https://example.test/events-b',
        resolvedCanonicalUrl: 'https://example.test/events-b',
      }),
    ];
    const input = baseReconciliationInput({
      sources: conflictingSources,
      targets: [],
    });
    const first = buildAffiliateLegacyReconciliationReport(input);
    const second = buildAffiliateLegacyReconciliationReport({
      ...input,
      sources: [...conflictingSources].reverse(),
    });
    const identityKeys = conflictingSources
      .map((item) => normalizeAffiliateSupplyIdentity({
        requestedUrl: item.requestedUrl,
        resolvedCanonicalUrl: item.resolvedCanonicalUrl,
        isRedirectVerified: item.isRedirectVerified,
        operatorDomain: item.operatorDomain,
      }).identityKey)
      .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);

    expect(first.isApplySafe).toBe(false);
    expect(first.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SOURCE_IDENTITY_CONFLICT',
        severity: 'BLOCKING',
        recordIds: ['source-1'],
        detail: expect.stringContaining(identityKeys.join(', ')),
      }),
    ]));
    expect(first.inputHash).toBe(second.inputHash);
    expect(first.outputHash).toBe(second.outputHash);
    expect(first.reportHash).toBe(second.reportHash);
  });

  it('collapses exact duplicate source evidence after identity comparison', () => {
    const duplicate = source();
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      sources: [duplicate, { ...duplicate }],
      targets: [],
    }));

    expect(report.blockingFindings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SOURCE_IDENTITY_CONFLICT' }),
    ]));
    expect(report.counts.sources).toBe(2);
    expect(report.roots).toHaveLength(1);
    expect(report.roots[0].sourceIds).toEqual(['source-1']);
  });
  it('keeps hashes stable when same-ID lineage associations are permuted', () => {
    const input = baseReconciliationInput({
      sources: [
        source({
          id: 'source-a',
          requestedUrl: 'https://example.test/a',
          resolvedCanonicalUrl: 'https://example.test/a',
        }),
        source({
          id: 'source-b',
          requestedUrl: 'https://example.test/b',
          resolvedCanonicalUrl: 'https://example.test/b',
        }),
      ],
      records: [
        { kind: 'EVENT', id: 'shared', sourceId: 'source-b', associationKey: 'b' },
        { kind: 'EVENT', id: 'shared', sourceId: 'source-a', associationKey: 'a' },
      ],
      targets: [],
    });
    const first = buildAffiliateLegacyReconciliationReport(input);
    const second = buildAffiliateLegacyReconciliationReport({
      ...input,
      records: [...input.records].reverse(),
    });

    expect(second.inputHash).toBe(first.inputHash);
    expect(second.outputHash).toBe(first.outputHash);
    expect(second.reportHash).toBe(first.reportHash);
  });
  it('accepts reciprocal predecessor and successor roots without orphan findings', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      sources: [source({
        existingSupplySourceId: 'root-current',
        predecessorSupplySourceId: 'root-legacy',
      })],
      roots: [
        {
          id: 'root-legacy',
          identityKey: 'legacy-identity',
          canonicalUrl: 'https://example.test/legacy-events',
          origin: 'https://example.test',
          pathKey: 'https://example.test/legacy-events',
          successorId: 'root-current',
        },
        {
          id: 'root-current',
          identityKey: 'current-identity',
          canonicalUrl: 'https://example.test/events',
          origin: 'https://example.test',
          pathKey: 'https://example.test/events',
          predecessorId: 'root-legacy',
        },
      ],
      targets: [],
    }));

    expect(report.blockingFindings.map((item) => item.code))
      .not.toContain('ORPHAN_SUPPLY_ROOT_LINEAGE');
    expect(report.roots).toEqual(expect.arrayContaining([
      expect.objectContaining({ existingRootId: 'root-current', predecessorId: 'root-legacy' }),
    ]));
  });

  it('blocks one association key that resolves records to multiple roots', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      sources: [
        source({
          id: 'source-a',
          requestedUrl: 'https://example.test/a',
          resolvedCanonicalUrl: 'https://example.test/a',
          existingSupplySourceId: 'root-a',
        }),
        source({
          id: 'source-b',
          requestedUrl: 'https://example.test/b',
          resolvedCanonicalUrl: 'https://example.test/b',
          existingSupplySourceId: 'root-b',
        }),
      ],
      roots: [
        {
          id: 'root-a',
          identityKey: 'identity-a',
          canonicalUrl: 'https://example.test/a',
          origin: 'https://example.test',
          pathKey: 'https://example.test/a',
        },
        {
          id: 'root-b',
          identityKey: 'identity-b',
          canonicalUrl: 'https://example.test/b',
          origin: 'https://example.test',
          pathKey: 'https://example.test/b',
        },
      ],
      records: [
        { kind: 'MAPPING_JOB', id: 'job-a', sourceId: 'source-a', associationKey: 'job-1' },
        { kind: 'MAPPING_JOB', id: 'job-b', sourceId: 'source-b', associationKey: 'job-1' },
      ],
      targets: [],
    }));

    expect(report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        recordIds: expect.arrayContaining(['job-1', 'root-a', 'root-b']),
      }),
    ]));
  });
  it('blocks active claims whose normalized authority variants collide', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      claims: [
        {
          kind: 'MAPPING_JOB',
          id: 'claim-a',
          sourceId: 'source-1',
          subjectId: 'mapping-job-1',
          role: 'mapping_producer',
          status: 'ACTIVE',
          leaseExpiresAt: '2026-08-25T13:00:00.000Z',
        },
        {
          kind: 'MAPPING_JOB',
          id: 'claim-b',
          sourceId: 'source-1',
          subjectId: ' MAPPING-JOB-1 ',
          role: ' MAPPING_PRODUCER ',
          status: 'active',
          leaseExpiresAt: '2026-08-25T13:00:00.000Z',
        },
      ],
    }));

    expect(report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'DUPLICATE_ACTIVE_CLAIMS',
        recordIds: expect.arrayContaining(['claim-a', 'claim-b']),
      }),
    ]));
  });

  it('blocks an unsupported public target status', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      targets: [{
        ...baseReconciliationInput().targets[0],
        status: 'NOT_A_TARGET_STATUS',
      }],
    }));

    expect(report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'PUBLIC_TARGET_STATUS_INVALID',
        recordIds: ['target-1'],
      }),
    ]));
  });


  it('blocks duplicate roots, missing lineage, and active legacy claims', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      roots: [
        {
          id: 'root-a',
          identityKey: 'same-root',
          canonicalUrl: 'https://example.test/events',
          origin: 'https://example.test',
          pathKey: 'https://example.test/events',
        },
        {
          id: 'root-b',
          identityKey: 'same-root',
          canonicalUrl: 'https://example.test/events',
          origin: 'https://example.test',
          pathKey: 'https://example.test/events',
        },
      ],
      records: [
        { kind: 'SOURCE', id: 'source-1', sourceId: 'source-1' },
        { kind: 'MAPPING_JOB', id: 'orphan-job', sourceId: 'missing-source' },
      ],
      claims: [{
        kind: 'MAPPING_JOB',
        id: 'claim-1',
        sourceId: 'source-1',
        status: 'CLAIMED',
        leaseExpiresAt: new Date('2026-08-25T13:00:00.000Z'),
      }],
    }));

    expect(report.isApplySafe).toBe(false);
    expect(report.blockingFindings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'DUPLICATE_SUPPLY_ROOT',
      'MISSING_LINEAGE',
      'ACTIVE_LEGACY_CLAIM',
    ]));
  });
  it('treats running queue work with a live lease as active authority', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      claims: [{
        kind: 'INTAKE_RUN',
        id: 'intake-run-1',
        sourceId: 'source-1',
        status: 'RUNNING',
        leaseExpiresAt: new Date('2026-08-25T13:00:00.000Z'),
      }],
    }));

    expect(report.isApplySafe).toBe(false);
    expect(report.counts.activeClaims).toBe(1);
    expect(report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ACTIVE_LEGACY_CLAIM' }),
    ]));
  });
  it.each(['MAPPING_JOB', 'GATEWAY_CLAIM'] as const)(
    'treats terminal %s claims without a live lease or token as no-op',
    (kind) => {
      const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
        claims: [{
          kind,
          id: `${kind.toLowerCase()}-terminal`,
          sourceId: 'source-1',
          status: 'COMPLETED',
          workerId: 'retained-worker',
          leaseExpiresAt: null,
          tokenExpiresAt: null,
        }],
      }));

      expect(report.claimActions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: `${kind.toLowerCase()}-terminal`,
          status: 'TERMINAL',
          action: 'NO_ACTION',
        }),
      ]));
      expect(report.blockingFindings).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'TERMINAL_CLAIM_WITH_LIVE_EVIDENCE' }),
      ]));
    },
  );
  it('treats an invalidated completed gateway claim with retained expiry as no-op', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      claims: [{
        kind: 'GATEWAY_CLAIM',
        id: 'gateway-completed-invalidated',
        sourceId: 'source-1',
        status: 'COMPLETED',
        workerId: 'retained-worker',
        leaseExpiresAt: '2026-08-25T13:00:00.000Z',
        tokenExpiresAt: '2026-08-25T13:00:00.000Z',
        endedAt: '2026-08-25T12:00:00.000Z',
        tokenInvalidatedAt: '2026-08-25T12:00:00.000Z',
      }],
    }));

    expect(report.claimActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'gateway-completed-invalidated',
        status: 'TERMINAL',
        action: 'NO_ACTION',
        evidenceRefs: expect.arrayContaining([
          'ended-at:2026-08-25T12:00:00.000Z',
          'token-invalidated:2026-08-25T12:00:00.000Z',
        ]),
      }),
    ]));
    expect(report.blockingFindings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TERMINAL_CLAIM_WITH_LIVE_EVIDENCE' }),
    ]));
  });
  it('marks an active claim expired when either lease or token expiry has elapsed', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      now: new Date('2026-08-25T12:00:00.000Z'),
      claims: [{
        kind: 'GATEWAY_CLAIM',
        id: 'gateway-lease-expired',
        sourceId: 'source-1',
        status: 'ACTIVE',
        workerId: 'worker-1',
        leaseExpiresAt: '2026-08-25T11:00:00.000Z',
        tokenExpiresAt: '2026-08-25T13:00:00.000Z',
      }],
    }));

    expect(report.claimActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'gateway-lease-expired',
        status: 'EXPIRED',
        action: 'REVOKE_EXPIRED',
      }),
    ]));
    expect(report.counts.activeClaims).toBe(0);
  });
  it('treats token expiry as revocable without flagging a future lease as live evidence', () => {
    const report = buildAffiliateLegacyReconciliationReport(baseReconciliationInput({
      now: new Date('2026-08-25T12:00:00.000Z'),
      claims: [{
        kind: 'GATEWAY_CLAIM',
        id: 'gateway-token-expired',
        sourceId: 'source-1',
        status: 'ACTIVE',
        workerId: 'worker-1',
        leaseExpiresAt: '2026-08-25T13:00:00.000Z',
        tokenExpiresAt: '2026-08-25T11:00:00.000Z',
      }],
    }));

    expect(report.claimActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'gateway-token-expired',
        status: 'EXPIRED',
        action: 'REVOKE_EXPIRED',
        evidenceRefs: expect.arrayContaining([
          'lease-expires:2026-08-25T13:00:00.000Z',
          'token-expires:2026-08-25T11:00:00.000Z',
        ]),
      }),
    ]));
    expect(report.blockingFindings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TERMINAL_CLAIM_WITH_LIVE_EVIDENCE' }),
    ]));
  });


  it('requires matching contracts, stopped legacy processes, and exact governed topology', () => {
    const report = buildAffiliateCutoverPreflightReport(preflightInput({
      observed: { ...contractSnapshot, deploymentContractHash: '9'.repeat(64) },
      processInventory: preflightInput().processInventory.filter((process) => process.id !== 'mapper-2'),
    }));

    expect(report.isReady).toBe(false);
    expect(report.blockingFindings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'DEPLOYMENT_CONTRACT_MISMATCH',
      'TOPOLOGY_MISMATCH',
    ]));
  });

  it('requires every reviewed legacy process to be present and stopped', () => {
    const withoutLegacy = buildAffiliateCutoverPreflightReport(preflightInput({
      processInventory: preflightInput().processInventory.filter((process) => process.kind !== 'LEGACY'),
    }));
    expect(withoutLegacy.blockingFindings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'LEGACY_PROCESS_MISSING',
      'LEGACY_PROCESS_INVENTORY_MISSING',
    ]));

    const notStopped = buildAffiliateCutoverPreflightReport(preflightInput({
      processInventory: preflightInput().processInventory.map((process) => (
        process.id === 'legacy-loop' ? { ...process, status: 'UNKNOWN' } : process
      )),
    }));
    expect(notStopped.blockingFindings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'LEGACY_PROCESS_STATE_UNVERIFIED',
    ]));
  });
  it('blocks every omitted auxiliary or control-plane identity', () => {
    const omitted = [
      ['gateway', 'affiliate-gateway'],
      ['runner', 'affiliate-agent-runner'],
      ['readiness', 'affiliate-agent-downstream-ready'],
      ['controller', 'affiliate-replenishment-controller'],
    ] as const;

    for (const [label, id] of omitted) {
      const report = buildAffiliateCutoverPreflightReport(preflightInput({
        controlPlaneProcesses: controlPlaneProcesses.filter((process) => process.id !== id),
        auxiliaryContainers: auxiliaryContainers.filter((container) => container.id !== id),
        ...(label === 'runner'
          ? { runnerContainer: undefined as unknown as typeof runnerContainer }
          : {}),
      }));

      expect(report.isReady).toBe(false);
      expect(report.blockingFindings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: label === 'runner'
            ? 'RUNNER_CONTAINER_ID_MISSING'
            : label === 'readiness' || label === 'controller'
              ? 'AUXILIARY_CONTAINER_INVENTORY_MISMATCH'
              : 'CONTROL_PLANE_INVENTORY_MISMATCH',
        }),
      ]));
    }
  });
  it('blocks control-plane rows without observed process status evidence', () => {
    const report = buildAffiliateCutoverPreflightReport(preflightInput({
      controlPlaneProcesses: controlPlaneProcesses.map((process) => (
        process.id === 'affiliate-gateway'
          ? { ...process, status: '' }
          : process
      )),
    }));

    expect(report.isReady).toBe(false);
    expect(report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONTROL_PLANE_EVIDENCE_MISSING',
        recordIds: ['affiliate-gateway'],
      }),
    ]));
  });
  it('blocks running control-plane writers', () => {
    const report = buildAffiliateCutoverPreflightReport(preflightInput({
      controlPlaneProcesses: controlPlaneProcesses.map((process) => (
        process.id === 'affiliate-gateway'
          || process.id === 'affiliate-replenishment-controller'
          ? { ...process, status: 'RUNNING' }
          : process
      )),
    }));

    expect(report.isReady).toBe(false);
    expect(report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONTROL_PLANE_WRITER_RUNNING',
        recordIds: ['affiliate-gateway', 'affiliate-replenishment-controller'],
      }),
    ]));
  });

  it('blocks unsafe database permissions', () => {
    const report = buildAffiliateCutoverPreflightReport(preflightInput({
      databasePermissions: {
        isAgentAllowedToConnectProductionDatabase: true,
        isAgentAllowedToWriteProductionDatabase: true,
        isAgentAllowedToReadObjectStorage: true,
        isAgentAllowedToWriteObjectStorage: true,
        isAgentAllowedToCallProviders: true,
        isGatewayAllowedToWriteProductionDatabase: false,
      },
    }));

    expect(report.isReady).toBe(false);
    expect(report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DATABASE_PERMISSION_BOUNDARY_FAILED' }),
    ]));
  });


  it('keeps governed writers stopped during reconciliation preflight', () => {
    const report = buildAffiliateCutoverPreflightReport(preflightInput({
      processInventory: preflightInput().processInventory.map((process) => (
        process.id === 'mapper-1' ? { ...process, status: 'RUNNING' } : process
      )),
    }));

    expect(report.isReady).toBe(false);
    expect(report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'GOVERNED_PROCESS_RUNNING', recordIds: ['mapper-1'] }),
    ]));
  });
  it('blocks active and enabled governed process states', () => {
    for (const status of ['ACTIVE', 'ENABLED', 'ONLINE', 'STARTED', 'UP']) {
      const report = buildAffiliateCutoverPreflightReport(preflightInput({
        processInventory: preflightInput().processInventory.map((process) => (
          process.id === 'mapper-1' ? { ...process, status } : process
        )),
      }));

      expect(report.isReady).toBe(false);
      expect(report.blockingFindings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'GOVERNED_PROCESS_RUNNING', recordIds: ['mapper-1'] }),
      ]));
    }
  });
  it('blocks unknown or missing governed process states', () => {
    for (const status of ['UNKNOWN', '']) {
      const report = buildAffiliateCutoverPreflightReport(preflightInput({
        processInventory: preflightInput().processInventory.map((process) => (
          process.id === 'mapper-1' ? { ...process, status } : process
        )),
      }));

      expect(report.isReady).toBe(false);
      expect(report.blockingFindings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'GOVERNED_PROCESS_STATE_UNVERIFIED',
          recordIds: ['mapper-1'],
        }),
      ]));
    }
  });


  it('requires one container identity per governed supervisor and normalized worker IDs', () => {
    const duplicateContainer = buildAffiliateCutoverPreflightReport(preflightInput({
      containers: [
        governedContainer('mapper-1'),
        governedContainer('mapper-2'),
        governedContainer('reviewer-1'),
        governedContainer('reviewer-2'),
        governedContainer('mapper-1'),
      ],
    }));
    expect(duplicateContainer.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CONTAINER_INVENTORY_MISMATCH' }),
    ]));

    const duplicateWorker = buildAffiliateCutoverPreflightReport(preflightInput({
      processInventory: preflightInput().processInventory.map((process) => (
        process.id === 'mapper-2' ? { ...process, workerId: ' mapping-1 ' } : process
      )),
    }));
    expect(duplicateWorker.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_WORKER_IDENTITY' }),
    ]));
  });
  it('rejects empty governed and container identities', () => {
    const report = buildAffiliateCutoverPreflightReport(preflightInput({
      processInventory: preflightInput().processInventory.map((process) => (
        process.id === 'mapper-1' ? { ...process, id: ' ', workerId: ' ' } : process
      )),
      containers: preflightInput().containers.map((container) => (
        container.id === 'mapper-1' ? { ...container, id: ' ' } : container
      )),
    }));

    expect(report.blockingFindings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'GOVERNED_PROCESS_ID_MISSING',
      'GOVERNED_WORKER_ID_MISSING',
      'CONTAINER_IDENTITY_MISSING',
    ]));
  });
  it('inspects the model runner as a separate internal container principal', () => {
    const report = buildAffiliateCutoverPreflightReport(preflightInput({
      runnerContainer: {
        ...runnerContainer,
        environment: [
          ...runnerContainer.environment,
          'AFFILIATE_AGENT_ROLE_CREDENTIAL=should-not-be-here',
          'AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL=should-not-be-here',
          'AFFILIATE_AGENT_RUNNER_PROTOCOL_PRIVATE_KEY=should-not-be-here',
        ],
      },
    }));

    expect(report.isReady).toBe(false);
    expect(report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'RUNNER_ROLE_AUTHORITY_EXPOSED',
        recordIds: expect.arrayContaining([
          'AFFILIATE_AGENT_ROLE_CREDENTIAL',
          'AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL',
          'AFFILIATE_AGENT_RUNNER_PROTOCOL_PRIVATE_KEY',
        ]),
      }),
    ]));
    expect(report.counts.unsafeContainers).toBe(1);
  });
  it('rejects model bearer handoff on supervisors and auxiliaries', () => {
    const supervisorReport = buildAffiliateCutoverPreflightReport(preflightInput({
      containers: preflightInput().containers.map((container) => (
        container.id === 'mapper-1'
          ? {
              ...container,
              environment: [
                ...container.environment,
                'AFFILIATE_AGENT_MODEL_GATEWAY_TOKEN=<redacted>',
              ],
            }
          : container
      )),
    }));
    const auxiliaryReport = buildAffiliateCutoverPreflightReport(preflightInput({
      auxiliaryContainers: preflightInput().auxiliaryContainers.map((container) => (
        container.id === 'affiliate-agent-downstream-ready'
          ? {
              ...container,
              environment: [
                ...container.environment,
                'AFFILIATE_AGENT_MODEL_AUTH_BROKER_TOKEN=<redacted>',
              ],
            }
          : container
      )),
    }));

    for (const report of [supervisorReport, auxiliaryReport]) {
      expect(report.blockingFindings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'FORBIDDEN_AGENT_CREDENTIAL',
          recordIds: expect.arrayContaining([
            expect.stringMatching(/^AFFILIATE_AGENT_MODEL_(?:GATEWAY|AUTH_BROKER)_TOKEN$/),
          ]),
        }),
      ]));
    }
  });
  it('uses the reviewed model-client network throughout production preflight', () => {
    const original = preflightInput();
    const modelClientNetwork = 'deployment_specific_model_client';
    const replaceNetwork = (network: string) => network === original.reviewedModelClientNetwork
      ? modelClientNetwork
      : network;
    const report = buildAffiliateCutoverPreflightReport(preflightInput({
      reviewedModelClientNetwork: modelClientNetwork,
      runnerContainer: {
        ...runnerContainer,
        networks: runnerContainer.networks.map(replaceNetwork),
        networkAttachments: runnerContainer.networkAttachments.map((network) => ({
          ...network,
          name: replaceNetwork(network.name),
        })),
      },
      modelGatewayContainer: {
        ...original.modelGatewayContainer,
        networks: original.modelGatewayContainer.networks.map(replaceNetwork),
        internalNetworks: original.modelGatewayContainer.internalNetworks.map(replaceNetwork),
        networkAttachments: original.modelGatewayContainer.networkAttachments.map((network) => ({
          ...network,
          name: replaceNetwork(network.name),
        })),
      },
    }));
    expect(report.isReady).toBe(true);
  });
  it('accepts the root runner only with its isolated child and private cgroup evidence', () => {
    const inspection = inspectAffiliateAgentRunnerContainer(runnerContainer, 'affiliate_gateway_internal', 'affiliate_model_client_internal');

    expect(inspection.isSafe).toBe(true);
    expect(inspection.findings).toEqual([]);
  });
  it('rejects a runner without exactly the reviewed workspace volume mount', () => {
    const inspection = inspectAffiliateAgentRunnerContainer({
      ...runnerContainer,
      mounts: [
        ...runnerContainer.mounts,
        { source: '/run/secrets/affiliate-model-gateway-token', type: 'bind', target: '/tmp/token', readOnly: true },
      ],
    }, 'affiliate_gateway_internal', 'affiliate_model_client_internal');

    expect(inspection.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'RUNNER_OMP_HANDOFF' }),
    ]));
  });
  it('rejects a runner without the reviewed OMP model-client network', () => {
    const inspection = inspectAffiliateAgentRunnerContainer({
      ...runnerContainer,
      networks: ['affiliate_gateway_internal'],
    }, 'affiliate_gateway_internal', 'affiliate_model_client_internal');

    expect(inspection.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PRODUCTION_NETWORK_ACCESS' }),
    ]));
  });
  it('rejects a runner without the reviewed OMP model handoff', () => {
    const inspection = inspectAffiliateAgentRunnerContainer({
      ...runnerContainer,
      environment: runnerContainer.environment.filter(
        (entry) => !entry.startsWith('AFFILIATE_AGENT_MODEL_GATEWAY_TOKEN='),
      ),
    }, 'affiliate_gateway_internal', 'affiliate_model_client_internal');

    expect(inspection.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'RUNNER_OMP_HANDOFF' }),
    ]));
  });
  it('rejects a runner when supervisor and child UIDs collapse', () => {
    const inspection = inspectAffiliateAgentRunnerContainer({
      ...runnerContainer,
      supervisorUid: runnerContainer.childUid,
    }, 'affiliate_gateway_internal', 'affiliate_model_client_internal');

    expect(inspection.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'RUNNER_CHILD_IDENTITY' }),
    ]));
  });
  it('rejects runner capability and cgroup boundary drift', () => {
    const capabilityDrift = inspectAffiliateAgentRunnerContainer({
      ...runnerContainer,
      capAdd: [...runnerContainer.capAdd, 'SYS_ADMIN'],
    }, 'affiliate_gateway_internal', 'affiliate_model_client_internal');
    expect(capabilityDrift.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'RUNNER_CAPABILITY_BOUNDARY' }),
    ]));

    const cgroupDrift = inspectAffiliateAgentRunnerContainer({
      ...runnerContainer,
      cgroupMountWritable: false,
    }, 'affiliate_gateway_internal', 'affiliate_model_client_internal');
    expect(cgroupDrift.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'RUNNER_FILESYSTEM_BOUNDARY' }),
    ]));
  });
  it('rejects runner temporary mounts that are writable or unbounded for the child', () => {
    const inspection = inspectAffiliateAgentRunnerContainer({
      ...runnerContainer,
      tmpfs: {
        ...runnerContainer.tmpfs,
        '/tmp': 'rw,noexec,nosuid,nodev,size=256m,uid=0,gid=0,mode=0777',
      },
    }, 'affiliate_gateway_internal', 'affiliate_model_client_internal');

    expect(inspection.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'RUNNER_TMPFS_BOUNDARY' }),
    ]));
  });
  it('binds runner policy evidence to the shipped profiles and rejects widened or renamed policies', () => {
    expect(hashAffiliateAgentValue(JSON.parse(runnerSeccompProfileJson))).toBe(AFFILIATE_RUNNER_SECCOMP_SHA256);
    expect(runnerAppArmorProfileSha256).toBe(AFFILIATE_RUNNER_APPARMOR_SHA256);

    const widenedSeccomp = inspectAffiliateAgentRunnerContainer({
      ...runnerContainer,
      securityOptions: runnerContainer.securityOptions.map((option) => (
        option.startsWith('seccomp=') ? 'seccomp={"defaultAction":"SCMP_ACT_ALLOW"}' : option
      )),
    }, 'affiliate_gateway_internal', 'affiliate_model_client_internal');
    expect(widenedSeccomp.isSafe).toBe(false);
    expect(widenedSeccomp.findings.map((finding) => finding.code)).toContain('RUNNER_SECCOMP_PROFILE');

    const wrongAppArmorName = inspectAffiliateAgentRunnerContainer({
      ...runnerContainer,
      securityOptions: runnerContainer.securityOptions.map((option) => (
        option.startsWith('apparmor=') ? 'apparmor=unconfined' : option
      )),
    }, 'affiliate_gateway_internal', 'affiliate_model_client_internal');
    expect(wrongAppArmorName.isSafe).toBe(false);
    expect(wrongAppArmorName.findings.map((finding) => finding.code)).toContain('RUNNER_APPARMOR_PROFILE');

    const wrongAppArmorHash = inspectAffiliateAgentRunnerContainer({
      ...runnerContainer,
      apparmorProfileSha256: '0'.repeat(64),
    }, 'affiliate_gateway_internal', 'affiliate_model_client_internal');
    expect(wrongAppArmorHash.isSafe).toBe(false);
    expect(wrongAppArmorHash.findings.map((finding) => finding.code)).toContain('RUNNER_APPARMOR_CONTENT');
    const missingAppArmorHash = inspectAffiliateAgentRunnerContainer({
      ...runnerContainer,
      apparmorProfileSha256: undefined,
    }, 'affiliate_gateway_internal', 'affiliate_model_client_internal');
    expect(missingAppArmorHash.isSafe).toBe(false);
    expect(missingAppArmorHash.findings.map((finding) => finding.code)).toContain('RUNNER_APPARMOR_CONTENT');
  });
  it('rejects production database network overlap with a model network identity', () => {
    const report = buildAffiliateCutoverPreflightReport(preflightInput({
      productionDatabaseNetworkEvidence: {
        containerId: 'f'.repeat(64),
        networks: [
          ...networkAttachments.production,
          networkAttachments.modelClient[1],
        ],
      },
    }));

    expect(report.isReady).toBe(false);
    expect(report.blockingFindings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'MODEL_SERVICE_PRODUCTION_NETWORK_INTERSECTION',
    ]));
  });
  it('blocks incomplete contract, stopped-fleet, worker, and container evidence', () => {
    const incompleteContract = {
      ...contractSnapshot,
      roleContractHashes: {},
      promptTemplateHashes: {},
    };
    const report = buildAffiliateCutoverPreflightReport(preflightInput({
      expected: incompleteContract,
      observed: incompleteContract,
      processInventory: preflightInput().processInventory.map((process) => (
        process.kind === 'GOVERNED' ? { ...process, workerId: '' } : process
      )),
      containers: [],
    }));

    expect(report.isReady).toBe(false);
    expect(report.blockingFindings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'ROLE_CONTRACT_HASH_MISSING',
      'PROMPT_TEMPLATE_HASH_MISSING',
      'GOVERNED_WORKER_ID_MISSING',
      'CONTAINER_INVENTORY_MISMATCH',
    ]));
  });


  it('binds preflight readiness to the reviewed contract snapshot', () => {
    const report = buildAffiliateCutoverPreflightReport(preflightInput({ observed: contractSnapshot }));

    expect(isAffiliateCutoverPreflightReportIntact(report)).toBe(true);
    expect(isAffiliateCutoverPreflightReportIntact({

      ...report,
      supplyContractHash: 'f'.repeat(64),
    })).toBe(false);
    expect(isAffiliateCutoverPreflightReportIntact({
      ...report,
      evaluatedAt: '2026-08-25T10:00:00.000Z',
    })).toBe(false);
  });
  it('requires the reviewed legacy manifest and safe apply counts', () => {
    const ready = buildAffiliateCutoverPreflightReport(preflightInput());
    expect(isAffiliateCutoverPreflightApplySafe(ready)).toBe(true);

    const missingArtifactIdentity = buildAffiliateCutoverPreflightReport(preflightInput({
      processInventoryArtifactId: '',
    }));
    expect(missingArtifactIdentity.blockingFindings.map((finding) => finding.code))
      .toContain('LEGACY_PROCESS_ARTIFACT_ID_MISSING');

    const sameArtifact = buildAffiliateCutoverPreflightReport(preflightInput({
      processInventoryArtifactId: reviewedLegacyProcessManifest.artifactId,
    }));
    expect(sameArtifact.blockingFindings.map((finding) => finding.code))
      .toContain('LEGACY_PROCESS_ARTIFACTS_NOT_INDEPENDENT');

    const duplicateManifest = [...expectedLegacyProcesses, {
      id: 'legacy-goal',
      processClass: 'GOAL',
    }];
    const duplicate = buildAffiliateCutoverPreflightReport(preflightInput({
      reviewedLegacyProcessManifest: reviewedManifestFor(duplicateManifest),
    }));
    expect(duplicate.blockingFindings.map((finding) => finding.code)).toContain('LEGACY_PROCESS_MANIFEST_INVALID');

    const wrongKindManifest = [{ id: 'mapper-1', processClass: 'MAPPING' }];
    const wrongKind = buildAffiliateCutoverPreflightReport(preflightInput({
      reviewedLegacyProcessManifest: reviewedManifestFor(wrongKindManifest),
    }));
    expect(wrongKind.blockingFindings.map((finding) => finding.code)).toContain('LEGACY_PROCESS_KIND_MISMATCH');

    const wrongClassManifest = [{ id: 'legacy-loop', processClass: 'GOAL' }];
    const wrongClass = buildAffiliateCutoverPreflightReport(preflightInput({
      reviewedLegacyProcessManifest: reviewedManifestFor(wrongClassManifest),
    }));
    expect(wrongClass.blockingFindings.map((finding) => finding.code)).toContain('LEGACY_PROCESS_CLASS_MISMATCH');

    const unexpected = buildAffiliateCutoverPreflightReport(preflightInput({
      processInventory: [
        ...preflightInput().processInventory,
        {
          id: 'legacy-unreviewed',
          kind: 'LEGACY',
          processClass: 'GOAL',
          command: 'affiliate:legacy:unreviewed',
          status: 'STOPPED',
        },
      ],
    }));
    expect(unexpected.blockingFindings.map((finding) => finding.code)).toContain('LEGACY_PROCESS_UNEXPECTED');
  });

  it('binds the reviewed manifest to the complete independent process inventory', () => {
    const wrongHash = buildAffiliateCutoverPreflightReport(preflightInput({
      processInventoryHash: '0'.repeat(64),
    }));
    expect(wrongHash.blockingFindings.map((finding) => finding.code))
      .toContain('LEGACY_PROCESS_INVENTORY_HASH_MISMATCH');

    const wrongCount = buildAffiliateCutoverPreflightReport(preflightInput({
      processInventoryCount: processInventory.length - 1,
    }));
    expect(wrongCount.blockingFindings.map((finding) => finding.code))
      .toContain('LEGACY_PROCESS_INVENTORY_COUNT_MISMATCH');

    const wrongManifest = buildAffiliateCutoverPreflightReport(preflightInput({
      reviewedLegacyProcessManifest: {
        ...reviewedLegacyProcessManifest,
        inventoryHash: '0'.repeat(64),
      },
    }));
    expect(wrongManifest.blockingFindings.map((finding) => finding.code))
      .toContain('LEGACY_PROCESS_MANIFEST_INVENTORY_MISMATCH');
    expect(hashAffiliateCutoverProcessInventory([...processInventory].reverse()))
      .toBe(processInventoryHash);
  });

  it('rejects apply counts when a legacy process is running or a container is unsafe', () => {
    const running = buildAffiliateCutoverPreflightReport(preflightInput({
      processInventory: preflightInput().processInventory.map((process) => (
        process.id === 'legacy-loop' ? { ...process, status: 'RUNNING' } : process
      )),
    }));
    expect(isAffiliateCutoverPreflightReportIntact(running)).toBe(true);
    expect(isAffiliateCutoverPreflightApplySafe(running)).toBe(false);

    const unsafeContainer = buildAffiliateCutoverPreflightReport(preflightInput({
      containers: preflightInput().containers.map((container) => (
        container.id === 'mapper-1' ? { ...container, hasReadonlyRootFilesystem: false } : container
      )),
    }));
    expect(isAffiliateCutoverPreflightReportIntact(unsafeContainer)).toBe(true);
    expect(isAffiliateCutoverPreflightApplySafe(unsafeContainer)).toBe(false);
  });
  it('keeps preflight hashes stable across inventory permutations', () => {
    const base = preflightInput({
      legacyClaims: [
        {
          kind: 'MAPPING_JOB',
          id: 'claim-a',
          sourceId: 'source-a',
          status: 'REVOKED',
          tokenExpiresAt: '2026-08-25T10:00:00.000Z',
        },
        {
          kind: 'DISCOVERY_RUN',
          id: 'claim-b',
          sourceId: 'source-b',
          status: 'EXPIRED',
          leaseExpiresAt: '2026-08-25T10:00:00.000Z',
        },
      ],
    });
    const reversedContainers = [...base.containers].reverse().map((container, index) => (
      index === 0 && Array.isArray(container.environment)
        ? { ...container, environment: [...container.environment].reverse() }
        : container
    ));
    const first = buildAffiliateCutoverPreflightReport(base);
    const second = buildAffiliateCutoverPreflightReport({
      ...base,
      legacyClaims: [...base.legacyClaims].reverse(),
      containers: reversedContainers,
    });

    expect(second.inputHash).toBe(first.inputHash);
    expect(second.reportHash).toBe(first.reportHash);
  });
  it('allows a stopped Compose-only legacy process without a systemd mapping', () => {
    const composeProcess = {
      id: 'legacy-compose',
      kind: 'LEGACY' as const,
      processClass: 'MAPPING',
      command: 'docker compose run --rm affiliate-mapper',
      status: 'STOPPED',
    };
    const mixedInventory = [...processInventory, composeProcess];
    const mixedInventoryHash = hashAffiliateCutoverProcessInventory(mixedInventory);
    const mixedProcesses = [...expectedLegacyProcesses, {
      id: composeProcess.id,
      processClass: composeProcess.processClass,
    }];
    const report = buildAffiliateCutoverPreflightReport(preflightInput({
      reviewedLegacyProcessManifest: {
        ...reviewedLegacyProcessManifest,
        processes: mixedProcesses,
        processCount: mixedProcesses.length,
        manifestHash: hashAffiliateLegacyProcessManifest(mixedProcesses, reviewedSystemdUnits),
        inventoryHash: mixedInventoryHash,
        inventoryCount: mixedInventory.length,
      },
      processInventory: mixedInventory,
      processInventoryHash: mixedInventoryHash,
      processInventoryCount: mixedInventory.length,
    }));

    expect(report.isReady).toBe(true);
    expect(report.blockingFindings.map((item) => item.code))
      .not.toContain('LEGACY_PROCESS_SYSTEMD_MAPPING_INVALID');
  });

  it('blocks a systemd mapping for a process absent from the reviewed manifest', () => {
    const systemdUnits = [
      ...reviewedSystemdUnits,
      { processId: 'legacy-unknown', unitId: 'legacy-unknown.service' },
    ];
    const report = buildAffiliateCutoverPreflightReport(preflightInput({
      reviewedLegacyProcessManifest: {
        ...reviewedLegacyProcessManifest,
        systemdUnits,
        manifestHash: hashAffiliateLegacyProcessManifest(expectedLegacyProcesses, systemdUnits),
      },
      legacyServiceUnits: [
        ...legacyServiceUnits,
        { id: 'legacy-unknown.service', isEnabled: 'DISABLED', isActive: 'INACTIVE' },
      ],
    }));

    expect(report.blockingFindings.map((item) => item.code))
      .toContain('LEGACY_PROCESS_SYSTEMD_MAPPING_INVALID');
  });

  it('rejects an expired ready preflight report', () => {
    const report = buildAffiliateCutoverPreflightReport(preflightInput({
      now: new Date('2026-08-25T12:00:00.000Z'),
    }));

    expect(isAffiliateCutoverPreflightFresh(
      report,
      new Date('2026-08-25T12:15:01.000Z'),
    )).toBe(false);
    expect(isAffiliateCutoverPreflightFresh(
      report,
      new Date('2026-08-25T12:15:00.000Z'),
    )).toBe(true);
  });
  it('blocks future and non-ISO reviewed manifest timestamps', () => {
    const future = buildAffiliateCutoverPreflightReport(preflightInput({
      reviewedLegacyProcessManifest: {
        ...reviewedLegacyProcessManifest,
        reviewedAt: '2026-08-25T12:00:00.001Z',
      },
    }));
    const nonIso = buildAffiliateCutoverPreflightReport(preflightInput({
      reviewedLegacyProcessManifest: {
        ...reviewedLegacyProcessManifest,
        reviewedAt: '2026-08-25 11:30:00Z',
      },
    }));

    expect(future.blockingFindings.map((item) => item.code))
      .toContain('LEGACY_PROCESS_MANIFEST_REVIEW_INVALID');
    expect(nonIso.blockingFindings.map((item) => item.code))
      .toContain('LEGACY_PROCESS_MANIFEST_REVIEW_INVALID');
  });

  it('compares reviewed network identities without case-folding', () => {
    const report = buildAffiliateCutoverPreflightReport(preflightInput({
      containers: preflightInput().containers.map((container, index) => (
        index === 0 ? { ...container, networks: ['AFFILIATE_GATEWAY_INTERNAL'] } : container
      )),
    }));

    expect(report.blockingFindings.map((item) => item.code))
      .toContain('PRODUCTION_NETWORK_ACCESS');
  });

  it('rejects tampered legacy service evidence in an otherwise valid report', () => {
    const report = buildAffiliateCutoverPreflightReport(preflightInput());
    expect(isAffiliateCutoverPreflightReportIntact({
      ...report,
      legacyServiceUnits: [
        ...report.legacyServiceUnits,
        { id: 'unexpected.timer', isEnabled: 'DISABLED', isActive: 'INACTIVE' },
      ],
    })).toBe(false);
  });


  it('rejects agent container credentials and production network access', () => {
    const inspection = inspectAffiliateAgentContainer({
      id: 'agent-1',
      name: 'mapping-1',
      user: '0:0',
      hasReadonlyRootFilesystem: false,
      privileged: false,
      environment: [
        'AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080',
        'DATABASE_URL=postgres://production',
        'DO_SPACES_SECRET=secret',
      ],
      networks: ['affiliate_gateway_internal', 'production_backend'],
      capDrop: [],
      securityOptions: [],
    });

    expect(inspection.isSafe).toBe(false);
    expect(inspection.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'FORBIDDEN_AGENT_CREDENTIAL',
      'PRODUCTION_NETWORK_ACCESS',
      'CONTAINER_PRIVILEGE',
    ]));
  });
  it('rejects gateway, replenishment, and other-role credentials from supervisor containers', () => {
    const supervisor = governedContainer('agent-authority');
    const inspection = inspectAffiliateAgentContainer({
      ...supervisor,
      environment: [
        ...supervisor.environment,
        'AFFILIATE_GATEWAY_OPERATOR_TOKEN=operator',
        'AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN=replenishment',
        'AFFILIATE_AGENT_TOKEN_SIGNING_KEY=signing',
        'AFFILIATE_MAPPING_PRODUCER_1_CREDENTIAL=other-role',
      ],
    });

    expect(inspection.isSafe).toBe(false);
    expect(inspection.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'FORBIDDEN_AGENT_CREDENTIAL',
        recordIds: expect.arrayContaining([
          'AFFILIATE_GATEWAY_OPERATOR_TOKEN',
          'AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN',
          'AFFILIATE_AGENT_TOKEN_SIGNING_KEY',
          'AFFILIATE_MAPPING_PRODUCER_1_CREDENTIAL',
        ]),
      }),
    ]));
  });

  it('rejects split database and cache credentials even with an otherwise safe container boundary', () => {
    const deniedNames = [
      'PGHOST',
      'PGUSER',
      'PGPASSWORD',
      'PGSSLMODE',
      'MYSQL_HOST',
      'MYSQL_PORT',
      'MYSQL_DATABASE',
      'MYSQL_USER',
      'MYSQL_PASSWORD',
      'MYSQL_ROOT_PASSWORD',
      'REDIS_URL',
    ];
    const inspection = inspectAffiliateAgentContainer({
      id: 'agent-split-database',
      user: '1001:1001',
      hasReadonlyRootFilesystem: true,
      privileged: false,
      environment: [
        'AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080',
        ...deniedNames.map((name) => `${name}=secret`),
      ],
      networks: ['affiliate_gateway_internal'],
      isNetworkInternal: true,
      capDrop: ['ALL'],
      capAdd: [],
      groupAdd: [],
      securityOptions: ['no-new-privileges:true'],
    });

    expect(inspection.isSafe).toBe(false);
    expect(inspection.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'FORBIDDEN_AGENT_CREDENTIAL',
        severity: 'BLOCKING',
        recordIds: [...deniedNames, 'agent-split-database'].sort(),
      }),
    ]));
  });
  it('rejects arbitrary environment names carrying production connection URLs without exposing the value', () => {
    const inspection = inspectAffiliateAgentContainer({
      ...governedContainer('agent-arbitrary-database'),
      environment: [
        ...governedContainer('agent-arbitrary-database').environment,
        'INTERNAL_BACKEND=postgresql://prod',
      ],
    });

    expect(inspection.isSafe).toBe(false);
    expect(inspection.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'FORBIDDEN_AGENT_CREDENTIAL',
        recordIds: expect.arrayContaining(['agent-arbitrary-database', 'INTERNAL_BACKEND']),
        detail: expect.not.stringContaining('postgresql://prod'),
      }),
    ]));
  });

  it('accepts reviewed redacted environment entries', () => {
    const inspection = inspectAffiliateAgentContainer({
      ...governedContainer('agent-reviewed-redacted-environment'),
      environment: [
        ...governedContainer('agent-reviewed-redacted-environment').environment,
        'AFFILIATE_AGENT_RUNNER_PROTOCOL_PRIVATE_KEY=redacted',
      ],
    });

    expect(inspection.isSafe).toBe(true);
    expect(inspection.findings).toEqual([]);
  });


  it('accepts the governed no-new-privileges security option', () => {
    const inspection = inspectAffiliateAgentContainer({
      id: 'agent-safe',
      name: 'mapping-1',
      user: '1001:1001',
      hasReadonlyRootFilesystem: true,
      privileged: false,
      environment: [
        'AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080',
        'AFFILIATE_AGENT_MODEL_ADDRESS=http://model:8080',
      ],
      networks: ['affiliate_gateway_internal'],
      capDrop: ['ALL'],
      capAdd: [],
      groupAdd: [],
      isNetworkInternal: true,
      securityOptions: ['no-new-privileges:true'],
    });

    expect(inspection.isSafe).toBe(true);
    expect(inspection.findings).toEqual([]);
  });
  it('rejects added supervisor capabilities, supplementary groups, and writable cgroup delegation', () => {
    const safeSupervisor = {
      id: 'agent-boundary-drift',
      user: '1001:1001',
      hasReadonlyRootFilesystem: true,
      privileged: false,
      environment: ['AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080'],
      networks: ['affiliate_gateway_internal'],
      isNetworkInternal: true,
      capDrop: ['ALL'],
      capAdd: [],
      groupAdd: [],
      securityOptions: ['no-new-privileges:true'],
    };

    for (const drift of [
      { capAdd: ['SYS_ADMIN'] },
      { groupAdd: ['1001'] },
      { securityOptions: ['no-new-privileges:true', 'writable-cgroups=true'] },
    ]) {
      const inspection = inspectAffiliateAgentContainer({
        ...safeSupervisor,
        ...drift,
      });
      expect(inspection.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'CONTAINER_PRIVILEGE' }),
      ]));
    }
  });
  it('rejects incomplete supervisor boundary evidence', () => {
    const incomplete = inspectAffiliateAgentContainer({
      id: 'agent-incomplete-boundary',
      user: '1001:1001',
      hasReadonlyRootFilesystem: true,
      environment: ['AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080'],
      networks: ['affiliate_gateway_internal'],
      isNetworkInternal: true,
      capDrop: ['ALL'],
      securityOptions: ['no-new-privileges:true'],
    });

    expect(incomplete.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CONTAINER_PRIVILEGE' }),
    ]));

    const missingPrivilegeEvidence = inspectAffiliateAgentContainer({
      id: 'agent-missing-privilege-evidence',
      user: '1001:1001',
      hasReadonlyRootFilesystem: true,
      environment: ['AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080'],
      networks: ['affiliate_gateway_internal'],
      isNetworkInternal: true,
      capDrop: ['ALL'],
      capAdd: [],
      groupAdd: [],
      securityOptions: ['no-new-privileges:true'],
    });

    expect(missingPrivilegeEvidence.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CONTAINER_PRIVILEGE' }),
    ]));
  });
  it('rejects an unreviewed default network even without a production name', () => {
    const inspection = inspectAffiliateAgentContainer({
      id: 'agent-default-network',
      user: '1001:1001',
      hasReadonlyRootFilesystem: true,
      privileged: false,
      environment: [
        'AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080',
        'AFFILIATE_AGENT_MODEL_ADDRESS=http://model:8080',
      ],
      networks: ['default'],
      capDrop: ['ALL'],
      capAdd: [],
      groupAdd: [],
      securityOptions: ['no-new-privileges:true'],
    });

    expect(inspection.isSafe).toBe(false);
    expect(inspection.findings.map((finding) => finding.code)).toContain('PRODUCTION_NETWORK_ACCESS');
  });

  it('permits binary rollback before governed writes and forces forward-only recovery after one receipt', () => {
    expect(decideAffiliateCutoverRollback({
      isLegacyFleetStopped: true,
      isGovernedFleetStarted: false,
      isGovernedFleetStopped: true,
      hasGovernedReceipt: false,
      hasGovernedLifecycleTransition: false,
      hasGovernedDemandOrWaveEvent: false,
      hasGovernedAuthoritativeWrite: false,
    })).toEqual(expect.objectContaining({ mode: 'BINARY_ROLLBACK_ALLOWED' }));

    expect(decideAffiliateCutoverRollback({
      isLegacyFleetStopped: true,
      isGovernedFleetStopped: true,
      isGovernedFleetStarted: true,
      hasGovernedReceipt: true,
      hasGovernedLifecycleTransition: false,
      hasGovernedDemandOrWaveEvent: false,
      hasGovernedAuthoritativeWrite: false,
    })).toEqual(expect.objectContaining({ mode: 'FORWARD_ONLY' }));
  });
  it('forces forward-only recovery after demand/wave or authoritative writes', () => {
    const base = {
      isLegacyFleetStopped: true,
      isGovernedFleetStarted: true,
      isGovernedFleetStopped: true,
      hasGovernedReceipt: false,
      hasGovernedLifecycleTransition: false,
      hasGovernedDemandOrWaveEvent: false,
      hasGovernedAuthoritativeWrite: false,
    };

    expect(decideAffiliateCutoverRollback({
      ...base,
      hasGovernedDemandOrWaveEvent: true,
    })).toEqual(expect.objectContaining({ mode: 'FORWARD_ONLY' }));
    expect(decideAffiliateCutoverRollback({
      ...base,
      hasGovernedAuthoritativeWrite: true,
    })).toEqual(expect.objectContaining({ mode: 'FORWARD_ONLY' }));
  });
  it('derives rollback evidence from complete and incomplete process inventories', () => {
    const incomplete = buildAffiliateCutoverRollbackInput({
      reviewedLegacyProcessManifest,
      processInventory: [
        { id: 'legacy-1', kind: 'LEGACY', processClass: 'MAPPING', command: 'legacy', status: 'STOPPED' },
        { id: 'governed-1', kind: 'GOVERNED', role: 'MAPPING_PRODUCER', workerId: 'mapping-producer-1', command: 'supervisor', status: 'RUNNING' },
      ],
      governedReceipts: [],
      governedLifecycleTransitions: [],
      governedDemandOrWaveEvents: [],
      governedAuthoritativeWrites: [],
    });

    expect(incomplete).toEqual({
      isLegacyFleetStopped: false,
      isGovernedFleetStarted: true,
      isGovernedFleetStopped: false,
      hasGovernedReceipt: false,
      hasGovernedLifecycleTransition: false,
      hasGovernedDemandOrWaveEvent: false,
      hasGovernedAuthoritativeWrite: false,
    });
    expect(decideAffiliateCutoverRollback(incomplete)).toEqual(expect.objectContaining({
      mode: 'BLOCKED',
      reasonCode: 'LEGACY_FLEET_NOT_STOPPED',
    }));

    const exact = buildAffiliateCutoverRollbackInput({
      reviewedLegacyProcessManifest,
      processInventory: preflightInput().processInventory,
      governedReceipts: [],
      governedLifecycleTransitions: [],
      governedDemandOrWaveEvents: [],
      governedAuthoritativeWrites: [],
      controlPlaneProcesses: [
        { id: 'affiliate-gateway', status: 'STOPPED' },
        { id: 'affiliate-agent-runner', status: 'STOPPED' },
        { id: 'affiliate-replenishment-controller', status: 'STOPPED' },
      ],
      legacyServiceUnits,
    });
    const malformed = buildAffiliateCutoverRollbackInput({
      reviewedLegacyProcessManifest,
      processInventory: preflightInput().processInventory,
      governedReceipts: [],
      governedLifecycleTransitions: [],
      governedDemandOrWaveEvents: [],
      governedAuthoritativeWrites: [],
      controlPlaneProcesses: [
        { id: 'affiliate-gateway', status: 'STOPPED' },
        { id: 'affiliate-agent-runner', status: 'STOPPED' },
      ],
      legacyServiceUnits: [
        { ...legacyServiceUnits[0], isActive: 'ACTIVE' },
        legacyServiceUnits[1],
      ],
    });
    expect(malformed.isLegacyFleetStopped).toBe(false);
    expect(malformed.isGovernedFleetStopped).toBe(false);
    expect(exact).toEqual(expect.objectContaining({
      isLegacyFleetStopped: true,
      isGovernedFleetStarted: false,
      isGovernedFleetStopped: true,
    }));
    expect(decideAffiliateCutoverRollback(exact)).toEqual(expect.objectContaining({
      mode: 'BINARY_ROLLBACK_ALLOWED',
    }));
  });
  it('rejects the replenishment token from the readiness helper', () => {
    const readiness = governedContainer('affiliate-agent-downstream-ready');
    const inspection = inspectAffiliateAuxiliaryContainer({
      ...readiness,
      environment: [
        ...readiness.environment,
        'AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN=replenishment',
      ],
    });

    expect(inspection.isSafe).toBe(false);
    expect(inspection.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'FORBIDDEN_AGENT_CREDENTIAL',
        recordIds: expect.arrayContaining([
          'AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN',
        ]),
      }),
    ]));
  });
  it('requires replenishment authentication for the controller and rejects operator credentials', () => {
    const dedicated = inspectAffiliateAuxiliaryContainer({
      ...governedContainer('affiliate-replenishment-controller'),
      environment: [
        'AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080',
        'AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN=reviewed-replenishment-token',
      ],
    });
    expect(dedicated.isSafe).toBe(true);

    const missingDedicatedToken = inspectAffiliateAuxiliaryContainer({
      ...governedContainer('affiliate-replenishment-controller'),
      environment: [
        'AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080',
      ],
    });
    expect(missingDedicatedToken.isSafe).toBe(false);
    expect(missingDedicatedToken.findings.map((finding) => finding.code)).toContain(
      'REPLENISHMENT_TOKEN_MISSING',
    );

    const operator = inspectAffiliateAuxiliaryContainer({
      ...governedContainer('affiliate-replenishment-controller'),
      environment: [
        'AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080',
        'AFFILIATE_GATEWAY_OPERATOR_TOKEN=reviewed-operator-token',
      ],
    });
    expect(operator.isSafe).toBe(false);
    expect(operator.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'FORBIDDEN_AGENT_CREDENTIAL',
        recordIds: expect.arrayContaining(['AFFILIATE_GATEWAY_OPERATOR_TOKEN']),
      }),
    ]));

    const report = buildAffiliateCutoverPreflightReport(preflightInput({
      auxiliaryContainers: auxiliaryContainers.map((container) => (
        container.id === 'affiliate-replenishment-controller'
          ? {
            ...container,
            environment: [
              'AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080',
              'AFFILIATE_GATEWAY_OPERATOR_TOKEN=reviewed-operator-token',
            ],
          }
          : container
      )),
    }));
    expect(report.isReady).toBe(false);
    expect(report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'FORBIDDEN_AGENT_CREDENTIAL',
        recordIds: expect.arrayContaining(['AFFILIATE_GATEWAY_OPERATOR_TOKEN']),
      }),
    ]));
  });
});
