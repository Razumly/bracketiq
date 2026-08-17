# Remove Extended LeagueScoringConfig Fields Across Mobile + Backend + Prisma

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows the repository standard in `PLANS.md` at the repository root and must be maintained accordingly.

## Purpose / Big Picture

After this change, both stacks (`mvp-app` and `mvp-site`) will treat `LeagueScoringConfig` as a reduced schema that no longer includes the extended scoring/tiebreaker parameters listed in the request. The result should be that no API payload, type, UI form, mapper, test fixture, or Prisma schema still references those removed fields. We will verify this by running targeted searches and tests in both repositories.

## Progress

- [x] (2026-04-02 22:20Z) Loaded `PLANS.md`, created this ExecPlan, and started impact inventory.
- [x] (2026-04-02 22:24Z) Collected impacted files in `mvp-app` source.
- [x] (2026-04-02 22:31Z) Collected impacted files in `mvp-site` + `prisma`.
- [x] (2026-04-02 23:58Z) Removed requested fields from `mvp-app` LeagueScoringConfig models/mappers/UI references and updated affected tests.
- [x] (2026-04-03 00:18Z) Removed requested fields from `mvp-site` types/defaults/admin references.
- [x] (2026-04-03 00:25Z) Updated `mvp-site` Prisma schema + migration for column removals and regenerated Prisma client artifacts.
- [x] (2026-04-03 00:33Z) Ran verification (search + build checks) and confirmed clean references outside the new drop-column migration.

## Surprises & Discoveries

- Observation: Sandbox permissions now require escalation to read/write `mvp-site` at `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site`.
  Evidence: Non-escalated `Get-ChildItem` returned access denied; escalated command succeeded.

## Decision Log

- Decision: Use one coordinated cross-stack refactor instead of incremental partial removals.
  Rationale: The request explicitly requires removing all references in `mvp-app`, `mvp-site`, and Prisma, and partial work would leave the contract broken.
  Date/Author: 2026-04-02 / Codex

## Outcomes & Retrospective

Implemented end-to-end removal of the requested extended `LeagueScoringConfigs` fields across `mvp-app`, `mvp-site`, and Prisma.

Validation results:

- `mvp-app`: `./gradlew :composeApp:compileKotlinMetadata` passed.
- `mvp-site`: `npx prisma generate --schema prisma/schema.prisma` passed.
- `mvp-site`: `npm run -s build` passed.
- Reference scan now finds removed field names only in the new explicit drop-column migration file.

## Context and Orientation

The shared mobile app (`mvp-app`) defines league scoring data classes in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/LeagueScoringConfig.kt`, uses them in event detail save flows/UI, and has tests touching these values. The backend (`mvp-site`) defines API types in `src/types/index.ts`, default values in `src/types/defaults.ts`, sports config plumbing in service/admin/discover pages, and persists the scoring config in Prisma via `prisma/schema.prisma` and migrations. We must remove the requested fields consistently across all these layers so serialization, storage, and UI remain aligned.

## Plan of Work

First, edit `mvp-app` to shrink `LeagueScoringConfig` and `LeagueScoringConfigDTO` to the kept fields only, then remove copy/mapping assignments and UI/test references to removed fields. Second, edit `mvp-site` type definitions, defaults, and any feature code that reads/writes those fields (schedule page payload handling, sports service/admin constants/discover panel tests). Third, update Prisma schema and add a migration that drops the removed columns from `LeagueScoringConfigs` (and any now-obsolete sport-flag columns if still present and tied only to removed fields). Finally, run targeted validation and remove any residual references reported by search.

## Concrete Steps

From `C:\Users\samue\StudioProjects\mvp-app`:

    1) Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/LeagueScoringConfig.kt` and dependent call sites.
    2) Edit affected mobile UI/mapping/tests in `composeApp/src/commonMain/...` and `composeApp/src/commonTest/...`.
    3) Edit backend files under `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site\src` and Prisma files under `...\prisma`.
    4) Run focused searches in both repos to confirm zero references to removed field names.
    5) Run selected tests/build checks in both repos.

## Validation and Acceptance

Acceptance criteria:

- Source search returns zero references for each removed field name across:
  - `mvp-app/composeApp/src` and related tests.
  - `mvp-site/src`, `mvp-site/prisma`, and relevant tests.
- Mobile code compiles/tests pass for touched areas.
- Backend type checks/tests pass for touched areas.
- Prisma schema and migration are coherent (no removed columns still referenced by generated/runtime code).

## Idempotence and Recovery

Edits are text-based and idempotent when re-applied carefully. If a migration step is incorrect, restore only the affected migration file and regenerate. If tests fail after field removals, fix call sites rather than reintroducing removed fields.

## Artifacts and Notes

Initial impacted file inventory:

- `mvp-app`:
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/LeagueScoringConfig.kt`
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Sport.kt`
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/SportDtos.kt`
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/LeagueScoringConfigFields.kt`
  - `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponentTest.kt`
- `mvp-site` / Prisma:
  - `src/types/index.ts`, `src/types/defaults.ts`, `src/lib/sportsService.ts`, `src/server/adminConstants.ts`, `src/app/events/[id]/schedule/page.tsx`, `src/app/admin/AdminConstantsClient.tsx`, `src/app/discover/components/*`
  - `prisma/schema.prisma`, `prisma/schema.generated.prisma`, and migrations containing legacy scoring columns.

## Interfaces and Dependencies

The kept `LeagueScoringConfigs` surface after this change should retain only:

- `id`
- `pointsForWin`
- `pointsForDraw`
- `pointsForLoss`
- `pointsPerSetWin`
- `pointsPerSetLoss`
- `pointsPerGameWin`
- `pointsPerGameLoss`
- `pointsPerGoalScored`
- `pointsPerGoalConceded`
- `createdAt`
- `updatedAt`

All removed fields listed in the user request must no longer appear in mobile/backend API models, DTOs, UI forms, defaults, Prisma schema, migrations, or tests.

---
Plan revision note (2026-04-02): Created initial living ExecPlan and recorded inventory/constraints before implementation.
