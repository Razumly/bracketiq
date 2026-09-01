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
    const assignmentBackfillIndex = sql.indexOf(
      'UPDATE "Invites"\nSET "isAssigned" = CASE',
    );
    const notNullIndex = sql.indexOf('ALTER COLUMN "staffTypes" SET NOT NULL');
    const roleDefaultIndex = sql.indexOf('ALTER COLUMN "role" SET DEFAULT');
    const roleBackfill = sql.slice(roleBackfillIndex, assignmentBackfillIndex);
    const assignmentBackfill = sql.slice(assignmentBackfillIndex);

    expect(nullableAddIndex).toBeGreaterThanOrEqual(0);
    expect(staffTypesBackfillIndex).toBeGreaterThan(nullableAddIndex);
    expect(roleBackfillIndex).toBeGreaterThan(staffTypesBackfillIndex);
    expect(assignmentBackfillIndex).toBeGreaterThan(roleBackfillIndex);
    expect(notNullIndex).toBeGreaterThan(assignmentBackfillIndex);
    expect(roleDefaultIndex).toBeGreaterThan(roleBackfillIndex);
    expect(roleBackfill).toContain('WHERE "role" IS NULL;');
    expect(roleBackfill).not.toContain('"isAssigned"');
    expect(assignmentBackfill).toMatch(
      /SET "isAssigned" = CASE\s+WHEN UPPER\("type"\) = 'TEAM' AND "userId" IS NULL THEN true\s+ELSE false\s+END\s+WHERE "isAssigned" IS NULL;/,
    );
    expect(assignmentBackfill).not.toContain('"status"');
    expect(assignmentBackfill).not.toContain('"email"');
    expect(assignmentBackfill).not.toContain('"phone"');

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
