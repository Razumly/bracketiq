/** @jest-environment node */

import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(
  process.cwd(),
  "prisma/migrations/20260830150000_allow_affiliate_supply_reconciliation_post_apply_snapshot/migration.sql",
);

describe("affiliate reconciliation post-apply snapshot migration", () => {
  it("permits only the validated post-apply hash during dry-run promotion", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain("NOT (OLD.\"reportJson\" ? 'postApplyLegacySnapshotHash')");
    expect(migration).toContain("NEW.\"reportJson\" ? 'postApplyLegacySnapshotHash'");
    expect(migration).toContain(
      "NEW.\"reportJson\" - 'cutoverSessionId' - 'cutoverSessionHash'\n      - 'postApplyLegacySnapshotHash' = OLD.\"reportJson\"",
    );
    expect(migration).toContain(
      "NEW.\"reportJson\"->>'postApplyLegacySnapshotHash' ~* '^[0-9a-f]{64}$'",
    );
    expect(migration).toContain(
      "OR NEW.\"resolutionRefs\" IS DISTINCT FROM OLD.\"resolutionRefs\"",
    );
    expect(migration).toContain("OR NEW.\"inputHash\" IS DISTINCT FROM OLD.\"inputHash\"");
  });
});
