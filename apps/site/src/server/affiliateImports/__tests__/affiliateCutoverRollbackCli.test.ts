/** @jest-environment node */

import {
  parseAffiliateDockerProcessTable,
  parseAffiliatePsProcessTable,
  resolveAffiliateControlPlaneProcessStatus,
  resolveAffiliateRuntimeProcessStatus,
} from '../../../../scripts/decide-affiliate-cutover-rollback';

const dockerContainerId = (prefix: string): string => prefix.repeat(64);
const composeContainerName = (service: string, suffix = '1'): string => (
  `bracketiq-affiliate-governed-${service}-${suffix}`
);
const psRow = (pid: number, executable: string): string => (
  `${pid} 1 operator S ${executable}`
);

const reviewedProcess = {
  id: 'legacy-mapping-1',
  command: 'affiliate:legacy:mapping',
} as const;

const reviewedSupervisor = {
  id: dockerContainerId('a'),
  kind: 'GOVERNED' as const,
  workerId: 'mapping-producer-1',
  command: 'affiliate:agent:supervisor',
} as const;

describe('affiliate rollback runtime identity parsing', () => {
  it('does not treat a comm-name suffix as an exact process match', () => {
    const observations = parseAffiliatePsProcessTable(
      psRow(401, 'affiliate:legacy:mapping-helper'),
    );

    expect(observations).not.toBeNull();
    expect(resolveAffiliateRuntimeProcessStatus(
      reviewedProcess,
      [reviewedProcess],
      observations ?? [],
    )).toBe('STOPPED');
  });

  it('returns UNKNOWN when exact ps comm evidence is ambiguous', () => {
    const observations = parseAffiliatePsProcessTable([
      psRow(401, 'affiliate:legacy:mapping'),
      psRow(402, 'affiliate:legacy:mapping'),
    ].join('\n'));

    expect(resolveAffiliateRuntimeProcessStatus(
      reviewedProcess,
      [reviewedProcess],
      observations ?? [],
    )).toBe('UNKNOWN');
  });

  it('requires an exact Docker process name rather than a name prefix', () => {
    const observations = parseAffiliateDockerProcessTable(
      `${dockerContainerId('b')}\t${composeContainerName('legacy-mapping', '10')}\tlegacy-mapping\n`,
    );

    expect(resolveAffiliateRuntimeProcessStatus(
      reviewedProcess,
      [reviewedProcess],
      observations ?? [],
    )).toBe('STOPPED');
  });

  it('accepts one exact Docker container identity with its reviewed service', () => {
    const observations = parseAffiliateDockerProcessTable(
      `${reviewedSupervisor.id}\t${composeContainerName('mapping-producer-1')}\tmapping-producer-1\n`,
    );

    expect(resolveAffiliateRuntimeProcessStatus(
      reviewedSupervisor,
      [reviewedSupervisor],
      observations ?? [],
    )).toBe('RUNNING');
  });

  it('returns UNKNOWN when the exact Docker container lacks its reviewed service identity', () => {
    const observations = parseAffiliateDockerProcessTable(
      `${reviewedSupervisor.id}\t${composeContainerName('mapping-producer-1', 'unbound')}\t\n`,
    );

    expect(resolveAffiliateRuntimeProcessStatus(
      reviewedSupervisor,
      [reviewedSupervisor],
      observations ?? [],
    )).toBe('UNKNOWN');
  });

  it('returns UNKNOWN when a reviewed Docker service identity is duplicated', () => {
    const observations = parseAffiliateDockerProcessTable([
      `${dockerContainerId('b')}\t${composeContainerName('mapping-producer-1')}\tmapping-producer-1`,
      `${dockerContainerId('c')}\t${composeContainerName('mapping-producer-1', '2')}\tmapping-producer-1`,
    ].join('\n'));

    expect(resolveAffiliateRuntimeProcessStatus(
      reviewedSupervisor,
      [reviewedSupervisor],
      observations ?? [],
    )).toBe('UNKNOWN');
  });

  it('uses exact control-plane Docker service identities', () => {
    const observations = parseAffiliateDockerProcessTable([
      `${dockerContainerId('d')}\t${composeContainerName('affiliate-gateway')}\taffiliate-gateway-helper`,
      `${dockerContainerId('e')}\t${composeContainerName('affiliate-agent-runner')}\taffiliate-agent-runner`,
      `${dockerContainerId('f')}\t${composeContainerName('affiliate-replenishment-controller')}\taffiliate-replenishment-controller`,
    ].join('\n'));

    expect(resolveAffiliateControlPlaneProcessStatus('affiliate-gateway', observations ?? []))
      .toBe('STOPPED');
    expect(resolveAffiliateControlPlaneProcessStatus('affiliate-agent-runner', observations ?? []))
      .toBe('RUNNING');
    expect(resolveAffiliateControlPlaneProcessStatus(
      'affiliate-replenishment-controller',
      observations ?? [],
    )).toBe('RUNNING');
  });

  it('uses the exact ps comm executable for a control-plane process', () => {
    const observations = parseAffiliatePsProcessTable(
      psRow(501, 'affiliate-gateway'),
    );

    expect(resolveAffiliateControlPlaneProcessStatus('affiliate-gateway', observations ?? []))
      .toBe('RUNNING');
  });

  it('rejects malformed or argument-bearing rows so capture can remain UNKNOWN', () => {
    expect(parseAffiliatePsProcessTable('not-a-pid 1 operator S affiliate-gateway'))
      .toBeNull();
    expect(parseAffiliatePsProcessTable(`${psRow(501, 'affiliate-gateway')} unexpected`))
      .toBeNull();
    expect(parseAffiliateDockerProcessTable(
      `${dockerContainerId('f')}\t${composeContainerName('affiliate-gateway')}\taffiliate-gateway\t--unsafe-arg`,
    )).toBeNull();
    expect(parseAffiliateDockerProcessTable(
      `${dockerContainerId('f')}\t${composeContainerName('affiliate-gateway')}`,
    )).toBeNull();
  });
});
