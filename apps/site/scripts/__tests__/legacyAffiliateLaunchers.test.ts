/** @jest-environment node */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { assertAffiliateLegacyLocalDatabase } from '../../src/server/affiliateImports/agentRepository';

const tsxPath = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const launcherPaths = [
  'process-affiliate-source-intakes.ts',
  'claim-affiliate-source-mapping.ts',
  'claim-affiliate-approval.ts',
  'claim-affiliate-coverage-agent-job.ts',
  'complete-affiliate-approval.ts',
  'complete-affiliate-coverage-agent-job.ts',
] as const;

const runLauncher = (launcherPath: string, env: NodeJS.ProcessEnv) => spawnSync(
  process.execPath,
  [tsxPath, join(process.cwd(), 'scripts', launcherPath)],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  },
);

describe('retained legacy affiliate launchers', () => {
  it('requires an explicit verified-local database marker', () => {
    expect(() => assertAffiliateLegacyLocalDatabase({
      DATABASE_URL: 'postgresql://localhost:5432/bracketiq_local',
    })).toThrow('AFFILIATE_LEGACY_LOCAL_ONLY=1');
  });

  it.each(launcherPaths)('rejects the operator database URL for %s', (launcherPath) => {
    const environment = {
      ...process.env,
      AFFILIATE_LEGACY_LOCAL_ONLY: '1',
      DATABASE_URL: 'postgresql://operator:secret@operator-db.example:5432/bracketiq',
    };
    delete environment.NODE_ENV;

    const result = runLauncher(launcherPath, environment);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('operator or production DATABASE_URL is rejected');
  });
});
