# Clean division and tournament pool labels

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. The work also touches the backend source-of-truth repository at `C:\Users\samue\Documents\Code\mvp-site`, whose own `PLANS.md` uses the same requirements.

## Purpose / Big Picture

Users should see readable division and pool names everywhere instead of generated metadata strings such as `CoEd Skill BB AGE 18plus`. A league division label should be the division's display name, with generated skill-and-age labels rendered as `Open 18+` rather than `Skill Open AGE 18plus`. A tournament pool division should be named and displayed as `Pool A`, `Pool B`, and so on, without the bracket division prepended.

The observable result is that generated tournament pools created by `mvp-site` are stored with names like `Pool A`, old pool data such as `Open Pool A` is displayed as `Pool A` in pool-label contexts, and both the web and mobile formatting utilities derive clean composite skill/age labels from division parameters.

## Progress

- [x] (2026-05-06 16:07-07:00) Read the app and site repository guidelines, `PLANS.md`, and relevant division/pool formatting files.
- [x] (2026-05-06 16:07-07:00) Identified key backend files: `src/lib/divisionTypes.ts`, `src/lib/divisionDisplay.ts`, `src/lib/eventDivisionDisplay.ts`, and `src/server/events/tournamentPools.ts`.
- [x] (2026-05-06 16:07-07:00) Identified key mobile files: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/util/DivisionFormatter.kt`, `EventDivisionDisplay.kt`, `eventDetail/TournamentPoolPlay.kt`, and `EventDetailDivisionOptions.kt`.
- [x] (2026-05-06 17:19-07:00) Patched `mvp-site` to derive composite division labels, normalize legacy separators, and generate pool names as `Pool A/B/C`.
- [x] (2026-05-06 17:19-07:00) Patched `mvp-app` to derive matching composite labels and treat generated tournament pool rows as simple pool labels.
- [x] (2026-05-06 17:19-07:00) Updated focused tests in both repositories.
- [x] (2026-05-06 17:19-07:00) Ran targeted Jest validation; Gradle validation was attempted but blocked by the local Gradle test task hanging/timing out.
- [x] (2026-05-06 20:42-07:00) Removed stored `divisionTypeName` columns from `mvp-site` Prisma models for `Divisions`, `EventTeams`, and canonical `Teams`, and added a migration to drop those columns.
- [x] (2026-05-06 20:42-07:00) Removed team-level `divisionTypeName` from `mvp-site` Team contracts, team serializers/mappers, API fixtures, and event-service team mapping.
- [x] (2026-05-06 20:42-07:00) Removed team-level `divisionTypeName` from `mvp-app` Team entity/DTO/update payloads, bumped the Room database version to 17, and updated Android/iOS migrations to rebuild Team without that column.
- [x] (2026-05-06 20:42-07:00) Changed team create/edit label generation to derive the label from gender plus skill/age type ids instead of passing a prebuilt `divisionTypeName` parameter.
- [x] (2026-05-06 20:42-07:00) Re-ran focused Jest, full `mvp-site` build, and focused Gradle validation successfully.

## Surprises & Discoveries

- Observation: PowerShell could not execute `rg.exe` in this session because access was denied, so recursive searches used `Get-ChildItem` plus `Select-String`.
  Evidence: `Program 'rg.exe' failed to run: Access is denied`.
- Observation: Both repos already contain local changes in schedule and team membership files. This plan must work around those changes without resetting or reverting them.
  Evidence: `git status --short` showed modified `EventDetailScreen.kt`, `MatchCard.kt`, `tournamentPools.ts`, `EventForm.tsx`, schedule views, team routes, and related tests before this work began.
- Observation: `mvp-site` only parses single dimension tokens like `c_skill_open`; a composite token like `c_skill_open_age_18plus` falls through to a metadata-like label.
  Evidence: `src/lib/divisionTypes.ts` uses `parseDivisionToken` with `^(m|f|c)_(age|skill)_([a-z0-9_]+)$`, so the type id becomes `open_age_18plus`.
- Observation: Some existing fixtures and persisted paths use legacy separators such as `Open / 18+` or `Open • 18+`.
  Evidence: `src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx` used `Open / 18+`, and `src/server/repositories/__tests__/events.upsert.test.ts` expected `Open • 18+`.
- Observation: The Windows Gradle `:composeApp:testDebugUnitTest` command did not complete reliably in this checkout during validation.
  Evidence: one invocation timed out after 3 minutes with no fresh XML, one failed before tests with `Gradle build daemon has been stopped: stop command received`, and a final invocation timed out after 10 minutes with no fresh XML for the selected tests.

## Decision Log

- Decision: Remove stored `divisionTypeName` fields instead of keeping nullable compatibility columns, and derive division labels from division parameters when a response or UI needs the value.
  Rationale: The user explicitly clarified that the parameter should not be stored in the database and that teams must not carry `divisionTypeName`. Keeping the column would preserve the old contract and let stale labels leak back into API responses.
  Date/Author: 2026-05-06 / Codex
- Decision: Generated tournament pool division `name` should be exactly `Pool A`, `Pool B`, etc.; generated `key` and `id` may still include the bracket token so backend routing can associate pools with bracket divisions.
  Rationale: Keys and ids are stable identifiers used for placement mapping, while `name` is user-facing. The user explicitly asked that pool division names not include the bracket division.
  Date/Author: 2026-05-06 / Codex
- Decision: Legacy pool labels ending in `Pool X` should display as `Pool X` in pool-label contexts, while bracket-label synthesis should ignore a simple `Pool X` name and fall back to the bracket division id or explicit playoff division row.
  Rationale: Existing databases may already contain names like `Open Pool A`, and tournament registration still needs bracket choices, not pool names.
  Date/Author: 2026-05-06 / Codex

## Outcomes & Retrospective

Implemented the shared label rule in both repositories. `mvp-site` now derives composite division type labels as `Open 18+`, cleans old `Open / 18+` and `Open • 18+` separators, returns clean API labels, and stores generated tournament pools as `Pool A`, `Pool B`, etc. `mvp-app` now mirrors the composite label format, normalizes old slash/bullet separators, returns `Pool A/B/C` for generated pool rows, and avoids synthesizing tournament bracket labels from simple pool names.

Revision update after the storage contract cleanup: `mvp-site` now derives full division labels as `CoEd Open 18+` when a gendered division label is needed. Stored `divisionTypeName` has been removed from Prisma `Divisions`, `EventTeams`, and canonical `Teams`, and team response/payload mapping no longer exposes it. `mvp-app` removes team-level `divisionTypeName` from Room, DTOs, and update payloads.

Targeted Jest validation passed:

    npm test -- --runTestsByPath src/lib/__tests__/divisionTypes.test.ts src/lib/__tests__/divisionDisplay.test.ts src/lib/__tests__/eventDivisionDisplay.test.ts src/server/events/__tests__/tournamentPools.test.ts
    Result: 4 suites passed, 20 tests passed.

    npm test -- --runTestsByPath src/server/repositories/__tests__/events.upsert.test.ts src/lib/__tests__/teamService.test.ts
    Result: 2 suites passed, 53 tests passed.

Targeted Gradle validation was attempted but did not produce a usable result in this Windows checkout. No Kotlin assertion failure was observed; the Gradle task timed out or stopped during build setup before producing fresh result XML.

Follow-up validation after DB and team contract removal passed:

    npm test -- --runTestsByPath src/lib/__tests__/divisionTypes.test.ts src/lib/__tests__/divisionDisplay.test.ts src/lib/__tests__/eventDivisionDisplay.test.ts src/server/events/__tests__/tournamentPools.test.ts src/server/repositories/__tests__/events.upsert.test.ts src/lib/__tests__/teamService.test.ts src/components/ui/__tests__/TeamCard.test.tsx src/server/teams/__tests__/teamMembership.test.ts src/app/api/teams/[id]/__tests__/teamByIdRoute.test.ts src/app/api/teams/[id]/__tests__/teamByIdCanonicalRoute.test.ts src/app/api/teams/[id]/invite-free-agents/__tests__/route.test.ts src/app/api/teams/[id]/member-invites/__tests__/route.test.ts
    Result: 12 suites passed, 100 tests passed.

    npm run build
    Result: passed. Turbopack reported the existing NFT tracing warning for `next.config.mjs` through `src/lib/storage.ts`.

    .\gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.util.DivisionFormatterDisplayLabelTest" --tests "com.razumly.mvp.core.data.util.EventDivisionDisplayTest" --tests "com.razumly.mvp.eventDetail.EventDetailDivisionOptionsTest" --tests "com.razumly.mvp.core.network.dto.TeamDtosTest"
    Result: BUILD SUCCESSFUL. iOS native targets were skipped on Windows, as expected for this checkout.

## Context and Orientation

`mvp-site` is the backend and web source of truth. `src/lib/divisionTypes.ts` derives division metadata from ids and tokens. `src/server/events/tournamentPools.ts` creates generated pool divisions for tournament pool play. `src/lib/divisionDisplay.ts` and `src/lib/eventDivisionDisplay.ts` turn stored event division data into labels for components and public pages.

`mvp-app` is the Kotlin Multiplatform mobile app. `DivisionFormatter.kt` mirrors the web's division id normalization and display derivation. `EventDivisionDisplay.kt`, `TournamentPoolPlay.kt`, and `EventDetailDivisionOptions.kt` decide whether tournament pool play should show bracket divisions or pool divisions in mobile contexts.

A "division" is a persisted grouping of teams or registrants. A "bracket division" is the tournament playoff grouping. A "pool division" is a generated league-style division used for tournament pool-play matches before teams advance into the bracket.

## Plan of Work

First, update `mvp-site/src/lib/divisionTypes.ts` so composite division type ids and tokens derive a clean type name such as `Open 18+`. Add tests that prove `c_skill_open_age_18plus` and `skill_open_age_18plus` no longer produce metadata wording.

Second, update `mvp-site/src/server/events/tournamentPools.ts` so generated pool rows use `Pool A/B/C` for `name`, while retaining bracket-aware keys and placement ids. Update tests in `src/server/events/__tests__/tournamentPools.test.ts`.

Third, adjust web display fallbacks in `src/lib/divisionDisplay.ts` and `src/lib/eventDivisionDisplay.ts` so old persisted names like `Open Pool A` can be shown as `Pool A` where a pool label is requested, and simple `Pool A` values are not mistaken for bracket names.

Fourth, mirror the label derivation in `mvp-app` by changing `buildCombinedDivisionTypeName` and pool suffix helpers. Update mobile tests covering `toDivisionDisplayLabel`, `divisionDisplayLabels`, and registration division options.

## Concrete Steps

Run these commands from `C:\Users\samue\Documents\Code\mvp-site` for web/backend validation:

    npm test -- --runTestsByPath src/lib/__tests__/divisionTypes.test.ts src/lib/__tests__/divisionDisplay.test.ts src/lib/__tests__/eventDivisionDisplay.test.ts src/server/events/__tests__/tournamentPools.test.ts

Run these commands from `C:\Users\samue\StudioProjects\mvp-app` for mobile validation:

    .\gradlew :composeApp:testDebugUnitTest --tests com.razumly.mvp.core.data.util.DivisionFormatterDisplayLabelTest --tests com.razumly.mvp.core.data.util.EventDivisionDisplayTest --tests com.razumly.mvp.eventDetail.EventDetailDivisionOptionsTest --tests com.razumly.mvp.eventDetail.TournamentPoolPlayTest

## Validation and Acceptance

Acceptance is met when tests prove these behaviors:

For generated web division metadata, `inferDivisionDetails({ identifier: 'event_1__division__c_skill_open_age_18plus' })` returns `divisionTypeName` as `CoEd Open 18+` and the fallback display name no longer includes `Skill` or `AGE`.

For generated tournament pools, `buildGeneratedTournamentPools` returns pool names `Pool A`, `Pool B`, and `Pool C`.

For legacy pool details, a pool id or row named `Open Pool A` can display as `Pool A` in pool-label contexts without breaking bracket registration labels.

For mobile, `c_skill_open_age_18plus` resolves to `Open 18+` where the type/display fallback is used, and tournament pool helpers do not synthesize bracket labels from simple `Pool A` names.

## Idempotence and Recovery

The code changes are additive and deterministic. Running the tests repeatedly should not mutate data. Existing local user edits must not be reverted. If a test fails due to pre-existing local changes in files touched before this task, inspect the failing diff and adapt to the local state rather than resetting.

## Artifacts and Notes

Initial search evidence:

    rg.exe failed with Access is denied, so PowerShell recursive search was used.
    mvp-site/src/server/events/tournamentPools.ts currently names pools as `${bracket.name} Pool ${letter}`.
    mvp-app DivisionFormatter.kt already parses `c_skill_open_age_18plus`, but renders the composite type as `Open / 18+`.

## Interfaces and Dependencies

`mvp-site/src/lib/divisionTypes.ts` should export the same public API after the change: `inferDivisionDetails`, `buildDivisionName`, `buildDivisionToken`, and related helpers remain available. The return shape of `inferDivisionDetails` remains unchanged.

`mvp-site/src/server/events/tournamentPools.ts` should keep `GeneratedTournamentPool` unchanged except for the value of `name`.

`mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/util/DivisionFormatter.kt` should keep the same public functions. `buildCombinedDivisionTypeName(skillDivisionTypeName, ageDivisionTypeName)` should return a space-separated label like `Open 18+`.

Revision note: Created this plan after locating the backend and mobile formatting paths. Updated after the user clarified that `divisionTypeName` must be removed from storage and from teams entirely.
