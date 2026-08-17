# Officials Terminology Hard Cutover Across mvp-app and mvp-site

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` are kept up to date as implementation proceeds.

This document is maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, all event/match/organization staffing and scheduling paths use `official` terminology end-to-end. API payloads, database columns, scheduler internals, web UI, and KMP client models stop accepting or emitting legacy referee/ref names. Users will only see and interact with “Official(s)” and “Team officials” wording.

## Progress

- [x] (2026-03-22 00:00Z) Audited mvp-app and mvp-site for all referee/ref/team-ref usage and built full impact inventory.
- [x] (2026-03-22 00:05Z) Finalized hard-cut contract mapping (`referee*` -> `official*`, `doTeamsRef` -> `doTeamsOfficiate`, `REFEREE` -> `OFFICIAL`).
- [x] (2026-03-22 03:25Z) Applied backend contract cutover in mvp-site (schema, migrations, repositories, scheduler, API routes).
- [x] (2026-03-22 03:35Z) Applied web client cutover in mvp-site (types, services, schedule/org/profile UI, notifications audience keys).
- [x] (2026-03-22 03:50Z) Applied KMP cutover in mvp-app (models/DTOs/network/persistence/screens/staff role mapping).
- [x] (2026-03-22 04:00Z) Updated affected tests/fixtures across both repos to official terminology.
- [x] (2026-03-22 04:10Z) Ran grep gate and targeted validation suites for renamed backend paths.
- [ ] Run full mvp-app Gradle test suite in an environment where `:composeApp:kspDebugKotlinAndroid` can initialize AWT graphics classes.

## Surprises & Discoveries

- Observation: The backend still carries legacy compatibility aliases (notably `refCheckedIn` and legacy event field normalizers) that must be actively removed for strict cutover.
  Evidence: hits in `src/server/scheduler/serialize.ts` and `src/app/api/events/*/route.ts`.

- Observation: Organization and access control paths use `refIds` plus role tokens (`REFEREE`) outside event scheduling, so cutover must include org/user/profile APIs.
  Evidence: hits in `src/app/api/organizations/*`, `src/app/api/users/[id]/route.ts`, `src/lib/organizationService.ts`.

## Decision Log

- Decision: Execute a strict breaking rename with no request/response fallbacks.
  Rationale: Product requirement explicitly requests no legacy compatibility.
  Date/Author: 2026-03-22 / Codex

- Decision: Rename staff role token `REFEREE` to `OFFICIAL` globally.
  Rationale: Required for terminology consistency across API, persistence, invites, and UI.
  Date/Author: 2026-03-22 / Codex

- Decision: Keep historical plans/docs untouched, but fully update runtime code and tests.
  Rationale: Avoid rewriting historical artifacts while guaranteeing shipping behavior consistency.
  Date/Author: 2026-03-22 / Codex

## Outcomes & Retrospective

- Result: Runtime/test code across both repos no longer contains the legacy cutover tokens (`referee*`, `teamReferee*`, `doTeamsRef`, `teamRefsMaySwap`, `refIds`, `REFEREE`, `refCheckedIn`) in active source paths.
- Result: mvp-site targeted scheduler/api/org tests for the renamed contract pass after cutover.
- Constraint: mvp-app Gradle unit-test execution is blocked in this environment by `:composeApp:kspDebugKotlinAndroid` (`sun.awt.PlatformGraphicsInfo` initialization failure), so full mobile verification still requires a compatible local build host configuration.

## Context and Orientation

The implementation spans two repositories:

- `C:/Users/samue/StudioProjects/mvp-app` (Kotlin Multiplatform mobile client)
- `//wsl.localhost/Ubuntu/home/camka/Projects/MVP/mvp-site` (backend + web source of truth)

Event and match contracts are shared across these repos. Backend schema and API changes must land first, followed by web client and KMP client updates, then test updates and validation.

## Plan of Work

First, rename database and API contracts in `mvp-site` so only official terminology remains. This includes Prisma schema/migrations, repository builders, scheduler types/serialization/update functions, event/match/organization route schemas, and organization/profile/user role checks.

Second, update `mvp-site` web types/services/components to compile against the renamed contract only. This includes schedule pages/components, org roster UI, profile invites, and notification audiences.

Third, update `mvp-app` data models, DTOs, network DTOs, DB migration SQL, and all screens/components/staff mapping to official naming and copy.

Fourth, update tests in both repos and run required validation suites plus grep gate.

## Concrete Steps

From `C:/Users/samue/StudioProjects/mvp-app`:

1. Update mvp-site files under `//wsl.localhost/Ubuntu/home/camka/Projects/MVP/mvp-site`.
2. Update mvp-app files under `composeApp/src/...`.
3. Run mvp-site tests:
   - `npm run test`
   - `npm run test -- src/app/api/events/__tests__/scheduleRoutes.test.ts`
   - `npm run test -- src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts`
   - `npm run test -- src/server/scheduler/__tests__/tournamentReferees.test.ts`
   - `npm run test -- src/server/scheduler/__tests__/reschedulePreservingLocks.test.ts`
4. Run mvp-app tests:
   - `./gradlew :composeApp:testDebugUnitTest`
   - `./gradlew :composeApp:test`
5. Run grep gate in both repos for legacy tokens.

## Validation and Acceptance

Acceptance is reached when:

- Event/match/org APIs accept and emit only official field names.
- Scheduler serialization and updates use only official naming.
- Web and mobile UI display only Official terminology.
- Tests pass in both repos.
- Grep gate confirms no legacy runtime/test code tokens remain.

## Idempotence and Recovery

Renames are deterministic and safe to re-run. If partial failures occur, rerun replacement + focused tests. Database migration edits are additive via a dedicated rename migration to avoid destructive reset.

## Artifacts and Notes

Execution transcripts and final grep gate output will be added after implementation.

## Interfaces and Dependencies

Final required interface shape includes (examples):

- Event: `officialIds`, `officials`, `doTeamsOfficiate`, `teamOfficialsMaySwap`
- Match: `officialId`, `teamOfficialId`, `officialCheckedIn`, `official`, `teamOfficial`
- Organization: `officialIds`, `officials`
- Staff role: `OFFICIAL`

Update note: Initial execution plan authored to drive the complete cross-repo terminology cutover and strict legacy removal.
