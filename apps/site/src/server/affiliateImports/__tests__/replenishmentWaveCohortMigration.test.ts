/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('replenishment wave cohort admission migration', () => {
  it('keeps the temporary loser table available through reconciliation and index creation', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'prisma/migrations/20260822150000_enforce_replenishment_wave_cohort_admission/migration.sql',
    );
    const migration = readFileSync(migrationPath, 'utf8');
    const transactionStart = migration.indexOf('BEGIN;');
    const stagingTable = migration.indexOf(
      'CREATE TEMP TABLE "_AffiliateReplenishmentWaveCohortLosers" ON COMMIT DROP',
    );
    const uniqueIndex = migration.indexOf(
      'CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateReplenishmentWaves_one_live_per_cohort"',
    );
    const transactionEnd = migration.lastIndexOf('COMMIT;');

    expect(transactionStart).toBeGreaterThanOrEqual(0);
    expect(transactionStart).toBeLessThan(stagingTable);
    expect(stagingTable).toBeLessThan(uniqueIndex);
    expect(uniqueIndex).toBeLessThan(transactionEnd);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
  });
});
