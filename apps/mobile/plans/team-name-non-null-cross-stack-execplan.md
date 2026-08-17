# Enforce Non-Nullable Team Names Across Web API, Database, and Mobile

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

PLANS.md is checked in at `PLANS.md` in this repository root and this document is maintained in accordance with it.

## Purpose / Big Picture

After this change, team names will be required everywhere that team data is created, stored, and consumed. Users will no longer see `null` team names on mobile, and APIs/database will reject or normalize invalid team names before persistence. Success is visible when API tests reject blank names, existing legacy null names are backfilled by migration, and mobile models compile with `name` as non-null.

## Progress

- [x] (2026-04-02 21:35Z) Audited current mobile and web contracts; confirmed `name` is nullable in API/storage and mobile DTO/model.
- [x] (2026-04-02 21:36Z) Created ExecPlan for this cross-stack migration.
- [x] (2026-04-02 21:43Z) Applied `mvp-site` Prisma schema + migration to enforce non-null `Teams.name` with legacy backfill.
- [x] (2026-04-02 21:45Z) Updated `mvp-site` team API validation and normalization to require non-empty names at create/update boundaries.
- [x] (2026-04-02 21:47Z) Added/updated `mvp-site` tests for blank-name rejection and non-null persistence.
- [x] (2026-04-02 21:53Z) Updated `mvp-app` Team/DTO/network contracts to non-null `name` and fixed nullable call sites/tests.
- [x] (2026-04-02 22:04Z) Ran targeted web + mobile tests and recorded evidence.

## Surprises & Discoveries

- Observation: Team create UI already requires team name, but backend route and Prisma schema still allow nullable names.
  Evidence: `src/app/api/teams/route.ts` uses `name: z.string().optional()` and Prisma `Teams.name` is `String?`.
- Observation: Running web tests from a UNC path on Windows fails to locate `jest`.
  Evidence: CMD reported `UNC paths are not supported`; rerunning via WSL path succeeded.

## Decision Log

- Decision: Enforce non-null both at schema level and API boundary instead of only changing mobile models.
  Rationale: Mobile-only tightening would break deserialization for legacy/null rows and keep invalid source data alive.
  Date/Author: 2026-04-02 / Codex

## Outcomes & Retrospective

Team names are now required end-to-end for team persistence and mobile consumption. Backend schema and API boundaries are strict, a migration backfills legacy null/blank names, and mobile team models are non-null with compile/test validation. Remaining gaps are only broader suite coverage outside targeted tests.

## Context and Orientation

This work spans two repositories: `mvp-site` (backend/API + Prisma schema source of truth) and `mvp-app` (KMP mobile client). Team records are created and updated through `mvp-site/src/app/api/teams/route.ts` and `mvp-site/src/app/api/teams/[id]/route.ts`, persisted via Prisma `mvp-site/prisma/schema.prisma`, then consumed on mobile via `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/TeamDtos.kt` and mapped into `Team`/`TeamDTO` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes`.

A "backfill migration" means a database migration that updates old rows to satisfy a new required constraint before enabling that constraint.

## Plan of Work

First, update Prisma `Teams.name` from nullable to required and add a SQL migration that replaces null/blank names with deterministic fallback names (`Team <id-prefix>`) so the NOT NULL constraint can be applied safely. Next, tighten API schemas in team create/patch routes so blank names are rejected and normalization always writes non-empty strings. Then update API tests to prove invalid payloads fail and valid payloads persist non-null names.

After backend contract is strict, update mobile Team network/data classes so `name` is `String` (non-null), adjust constructor defaults and any test/setup code that previously used `null`, and keep display-label fallback behavior for blank/legacy compatibility only where still relevant. Finally, run focused tests in both repos and capture outputs.

## Concrete Steps

From `mvp-site`:

    npm test -- --runInBand src/app/api/teams/__tests__/teamsRoute.test.ts src/app/api/teams/[id]/__tests__/teamByIdRoute.test.ts

From `mvp-app`:

    .\gradlew.bat :composeApp:compileKotlinMetadata
    .\gradlew.bat :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.presentation.util.TeamDisplayLabelTest"

## Validation and Acceptance

Acceptance criteria:

1. Team create route rejects missing/blank names with HTTP 400.
2. Team patch route rejects blank `team.name` updates with HTTP 400.
3. Prisma schema and migration enforce non-null `Teams.name` while preserving legacy rows via deterministic backfill.
4. Mobile compiles with `Team.name` non-null and no deserialization breakage.
5. Existing team display tests pass after updates.

## Idempotence and Recovery

Route and model edits are idempotent. Migration is one-way and should only be applied once per environment via Prisma migration tooling. If migration fails due to unexpected data shape, inspect and patch offending rows first, then rerun migration.

## Artifacts and Notes

Expected backfill SQL shape:

    UPDATE "VolleyBallTeams"
    SET "name" = CONCAT('Team ', SUBSTRING("id" FROM 1 FOR 8))
    WHERE "name" IS NULL OR BTRIM("name") = '';

    ALTER TABLE "VolleyBallTeams"
    ALTER COLUMN "name" SET NOT NULL;

## Interfaces and Dependencies

Required end state:

- `mvp-site/prisma/schema.prisma` `Teams.name` is `String` (non-null).
- `mvp-site/src/app/api/teams/route.ts` create schema requires non-empty `name`.
- `mvp-site/src/app/api/teams/[id]/route.ts` patch schema allows optional `name` but enforces non-empty when provided.
- `mvp-app` `Team.name`, `TeamDTO.name`, and `TeamApiDto.name` are `String` non-null.

Revision note (2026-04-02): Initial plan created to drive implementation of cross-stack non-null team-name enforcement.
Revision note (2026-04-02): Updated progress, discoveries, and outcomes after implementing schema/API/mobile contract changes and running validations.
