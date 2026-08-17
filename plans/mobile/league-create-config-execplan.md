# Add League Configuration Support To Compose Event Creation

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` will be kept up to date as work proceeds.

This document follows `PLANS.md` from the repository root and will be maintained in accordance with those requirements.

## Purpose / Big Picture

After this change, the Kotlin Multiplatform event creation flow will expose the same league-focused setup rules as the web event form: league-only configuration fields appear when `eventType` is `LEAGUE`, team and division settings are enforced for leagues/tournaments, and event date behavior follows type-specific rules. A host using the mobile app should be able to configure league structure (games per opponent, set or match duration, playoff toggles, and playoff bracket settings) directly during creation instead of only seeing tournament fields.

## Progress

- [x] (2026-02-12 05:44Z) Audited the web source of truth (`EventForm.tsx`, `LeagueFields.tsx`, `LeagueScoringConfigPanel.tsx`, `TournamentFields.tsx`) and identified the gating/selection rules to mirror.
- [x] (2026-02-12 05:44Z) Audited current Kotlin create flow (`CreateEventScreen.kt`, `EventDetails.kt`, `DefaultCreateEventComponent.kt`) and confirmed league config UI is missing.
- [x] (2026-02-12 21:40Z) Added shared create-time config datatypes and conversion helpers for league/tournament settings in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/`.
- [x] (2026-02-12 21:42Z) Added Compose league configuration component in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/`.
- [x] (2026-02-12 21:48Z) Wired league/tournament display and validation rules in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`.
- [x] (2026-02-12 21:51Z) Extracted create-event selection rules into a reusable function and added unit tests in `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/`.
- [x] (2026-02-12 22:18Z) Ran focused validation commands and captured evidence (common metadata compile succeeded; Android unit-test task blocked by local Android SDK build-tools corruption).

## Surprises & Discoveries

- Observation: `CreateEventScreen` already had partial parity updates (event type enforcement for rental and team/single-division normalization), but league-specific editor components were still missing.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventScreen.kt` includes selection rule wrappers, while `EventDetails.kt` contains only tournament-specific detail editors.
- Observation: Web sends `leagueScoringConfig` object in form payload, but backend upsert uses `leagueScoringConfigId` and ignores nested config body fields.
  Evidence: `src/server/repositories/events.ts` `upsertEventFromPayload` maps `leagueScoringConfigId` but does not consume nested `leagueScoringConfig`.
- Observation: Android unit-test verification cannot run in this environment because local SDK build-tools `35.0.0` is corrupted (`aapt` missing).
  Evidence: `:composeApp:compileDebugUnitTestKotlinAndroid` and `:composeApp:testDebugUnitTest` fail with “Installed Build Tools revision 35.0.0 is corrupted.”
- Observation: Metadata compile on mounted workspace cache intermittently hit Gradle file-lock I/O errors; running with `GRADLE_USER_HOME` under `/tmp` completed successfully.
  Evidence: Initial `:composeApp:compileCommonMainKotlinMetadata` failed with `java.io.IOException: Input/output error`; rerun with `GRADLE_USER_HOME=/tmp/gradle-user-home-2` succeeded.

## Decision Log

- Decision: Scope implementation to reliable parity that is persistable by the current mobile API contract: league event structure fields and component visibility rules.
  Rationale: Mobile repository/API layer already persists league structure fields on `Event` (`gamesPerOpponent`, `usesSets`, `pointsToVictory`, playoffs, etc.), while scoring config object creation has no exposed write route in current API.
  Date/Author: 2026-02-12 / Codex

## Outcomes & Retrospective

Implemented league-configuration parity for create/edit behavior and selection rules:

- Added shared config models and mapping helpers (`LeagueConfig`, `TournamentConfig`, `Event.toLeagueConfig()`, `Event.withLeagueConfig(...)`, `Event.toTournamentConfig()`, `Event.withTournamentConfig(...)`).
- Added `LeagueConfigurationFields` Compose editor with conditional league controls (set-based scoring controls, playoff controls, and team-referee toggle).
- Updated `EventDetails` to:
  - render league-specific fields in edit mode,
  - show league-specific details in view mode,
  - enforce league/tournament selection rules for team/single-division and date handling,
  - apply league/tournament validation gates to submit readiness.
- Extracted reusable create selection normalization to `applyCreateSelectionRules(...)` and applied it in `CreateEventScreen`.
- Added `CreateEventSelectionRulesTest` with league, tournament, event, and rental flow coverage.

Validation outcomes:

- `JAVA_HOME=/tmp/jdk17 ... GRADLE_USER_HOME=/tmp/gradle-user-home-2 ./gradlew :composeApp:compileCommonMainKotlinMetadata --no-daemon` -> **SUCCESS**.
- `... ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.eventCreate.CreateEventSelectionRulesTest"` -> **FAILED** due local SDK build-tools corruption (`build-tools/35.0.0/aapt` missing), not Kotlin compile errors in changed files.

## Context and Orientation

The create flow enters through `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventScreen.kt` and renders `EventDetails` for the editable event form. The event model already contains league and tournament fields in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`, but the editable UI in `EventDetails.kt` currently only renders detailed tournament controls.

The web source of truth is `~/Projects/MVP/mvp-site/src/app/events/[id]/schedule/components/EventForm.tsx` plus `LeagueFields.tsx` and `TournamentFields.tsx`. Those files define the desired show/hide and selection behavior for event-type-specific form sections.

## Plan of Work

Add two configuration datatypes in shared code so event detail composables can express league/tournament settings in a typed way without manually threading dozens of flat event fields. Then build a new league configuration composable that renders the fields and behavior from the web form. Integrate it into `EventDetails` so it appears only when `eventType == LEAGUE`, and enforce type-based visibility for team/single-division toggles and end-date input.

Extract create-type normalization into a pure helper that can be unit tested. The helper will enforce rental `EVENT` type lock, enforce team/single-division for leagues and tournaments, and keep non-`EVENT` end date aligned with start date.

## Concrete Steps

From repository root (`/home/camka/Projects/MVP/mvp-app`):

1. Implement shared config datatypes and conversion helpers.
2. Implement league configuration composable(s).
3. Wire `EventDetails.kt` to render and validate league configuration and type-based rules.
4. Extract and reuse create selection rules in `CreateEventScreen.kt`.
5. Add/execute focused unit tests and a compile check.

Expected verification commands:

    ./gradlew :composeApp:commonTest --tests "com.razumly.mvp.eventCreate.*"
    ./gradlew :composeApp:compileKotlinMetadata

## Validation and Acceptance

Acceptance is reached when:

1. In create mode, selecting `LEAGUE` reveals league-specific configuration controls and hides the editable end-date field.
2. Selecting `EVENT` restores editable team/single-division toggles and end-date editing.
3. For league/tournament types, team and single-division settings remain enforced on.
4. New unit tests for the selection rules pass.
5. Compile succeeds for common metadata.

## Idempotence and Recovery

All edits are additive and can be reapplied safely. If a specific composable integration fails, revert that file only and retain datatype/helper changes. No migrations or destructive operations are required.

## Artifacts and Notes

Implementation artifacts will be appended after code edits and test runs complete.

## Interfaces and Dependencies

The end state should expose:

- Shared data types under `com.razumly.mvp.core.data.dataTypes` for league and tournament configuration mapping to `Event`.
- League create UI under `com.razumly.mvp.eventDetail.composables`.
- Pure selection rule helper under `com.razumly.mvp.eventCreate` used by `CreateEventScreen`.

Update note: Created this ExecPlan to satisfy the repository requirement for complex feature work and to guide league-create parity implementation with verifiable milestones.
