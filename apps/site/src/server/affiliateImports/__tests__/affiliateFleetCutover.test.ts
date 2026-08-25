/** @jest-environment node */

import {
  buildAffiliateCutoverPreflightReport,
  buildAffiliateLegacyReconciliationReport,
  decideAffiliateCutoverRollback,
  inspectAffiliateAgentContainer,
  type AffiliateCutoverPreflightInput,
  type AffiliateLegacyReconciliationInput,
} from '../affiliateFleetCutover';

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

const preflightInput = (
  overrides: Partial<AffiliateCutoverPreflightInput> = {},
): AffiliateCutoverPreflightInput => ({
  expected: contractSnapshot,
  now: new Date('2026-08-25T12:00:00.000Z'),
  processInventory: [
    { id: 'legacy-goal', kind: 'LEGACY', command: 'affiliate:intakes:codex-goal', status: 'STOPPED' },
    { id: 'legacy-loop', kind: 'LEGACY', command: 'affiliate:intakes:codex-loop', status: 'STOPPED' },
    { id: 'mapper-1', kind: 'GOVERNED', role: 'MAPPING_PRODUCER', workerId: 'mapping-1', command: 'affiliate:agent:supervisor', status: 'PROVISIONED' },
    { id: 'mapper-2', kind: 'GOVERNED', role: 'MAPPING_PRODUCER', workerId: 'mapping-2', command: 'affiliate:agent:supervisor', status: 'PROVISIONED' },
    { id: 'reviewer-1', kind: 'GOVERNED', role: 'SUPPLY_REVIEWER', workerId: 'reviewer-1', command: 'affiliate:agent:supervisor', status: 'PROVISIONED' },
    { id: 'reviewer-2', kind: 'GOVERNED', role: 'SUPPLY_REVIEWER', workerId: 'reviewer-2', command: 'affiliate:agent:supervisor', status: 'PROVISIONED' },
    { id: 'coverage-1', kind: 'GOVERNED', role: 'COVERAGE_PLANNER', workerId: 'coverage-1', command: 'affiliate:agent:supervisor', status: 'PROVISIONED' },
  ],
  legacyClaims: [],
  databasePermissions: {
    agentCanConnectProductionDatabase: false,
    agentCanWriteProductionDatabase: false,
    agentCanReadObjectStorage: false,
    agentCanWriteObjectStorage: false,
    agentCanCallProviders: false,
    gatewayCanWriteProductionDatabase: true,
  },
  containers: [],
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

  it('rejects agent container credentials and production network access', () => {
    const inspection = inspectAffiliateAgentContainer({
      id: 'agent-1',
      name: 'mapping-1',
      user: '0:0',
      readonlyRootFilesystem: false,
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

  it('permits binary rollback before governed writes and forces forward-only recovery after one receipt', () => {
    expect(decideAffiliateCutoverRollback({
      legacyFleetStopped: true,
      governedFleetStarted: false,
      hasGovernedReceipt: false,
      hasGovernedLifecycleTransition: false,
    })).toEqual(expect.objectContaining({ mode: 'BINARY_ROLLBACK_ALLOWED' }));

    expect(decideAffiliateCutoverRollback({
      legacyFleetStopped: true,
      governedFleetStarted: true,
      hasGovernedReceipt: true,
      hasGovernedLifecycleTransition: false,
    })).toEqual(expect.objectContaining({ mode: 'FORWARD_ONLY' }));
  });
});
