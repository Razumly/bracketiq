/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('TEAM invite role migration', () => {
  it('ships the nullable-add, backfill, and NOT NULL sequence without dropping eventId', () => {
    const migrationPath = path.join(
      __dirname,
      '../../../prisma/migrations/20260820100000_add_team_invite_role/migration.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    const nullableAddIndex = sql.indexOf('ADD COLUMN IF NOT EXISTS "staffTypes" TEXT[]');
    const staffTypesBackfillIndex = sql.indexOf('SET "staffTypes" = ARRAY[]::TEXT[]');
    const roleBackfillIndex = sql.indexOf('UPDATE "Invites"\nSET\n  "role"');
    const notNullIndex = sql.indexOf('ALTER COLUMN "staffTypes" SET NOT NULL');
    const roleDefaultIndex = sql.indexOf('ALTER COLUMN "role" SET DEFAULT');

    expect(nullableAddIndex).toBeGreaterThanOrEqual(0);
    expect(staffTypesBackfillIndex).toBeGreaterThan(nullableAddIndex);
    expect(roleBackfillIndex).toBeGreaterThan(staffTypesBackfillIndex);
    expect(notNullIndex).toBeGreaterThan(roleBackfillIndex);
    expect(roleDefaultIndex).toBeGreaterThan(roleBackfillIndex);
    expect(sql).toContain(
      "WHEN \"type\" = 'TEAM' AND 'MANAGER' = ANY(COALESCE(\"staffTypes\", ARRAY[]::TEXT[])) THEN 'team_manager'",
    );
    expect(sql).toContain(
      "WHEN \"type\" = 'TEAM' AND 'HEAD_COACH' = ANY(COALESCE(\"staffTypes\", ARRAY[]::TEXT[])) THEN 'team_head_coach'",
    );
    expect(sql).toContain(
      "WHEN \"type\" = 'TEAM' AND 'ASSISTANT_COACH' = ANY(COALESCE(\"staffTypes\", ARRAY[]::TEXT[])) THEN 'team_assistant_coach'",
    );
    expect(sql).toContain("ELSE 'player'");
    expect(sql).not.toContain('DROP COLUMN "eventId"');
  });
});
