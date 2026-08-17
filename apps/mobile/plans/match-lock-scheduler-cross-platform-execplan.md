# Match Locking and My-Matches Controls (Mobile)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root.

## Purpose / Big Picture

Mobile event schedule needs parity with web for match lock management and my-matches filtering. After this change, mobile users can toggle "Show only my matches" (including linked child participation), hosts can lock all visible matches from the schedule view, and hosts can set `locked` on a single match in the match edit dialog.

## Progress

- [x] (2026-02-21 00:00Z) Audited match DTO/model/repository update flow and schedule/edit UI usage.
- [x] (2026-02-21 07:00Z) Added `locked` to shared match models (`MatchMVP`, DTOs, API payload mapping, Room schema version/migration).
- [x] (2026-02-21 07:00Z) Added component state/callbacks for child-aware "my matches" filtering and lock-all action.
- [x] (2026-02-21 07:00Z) Updated `ScheduleView` UI to include show-only-my-matches and lock-all controls.
- [x] (2026-02-21 07:00Z) Added lock checkbox to `MatchEditDialog`.
- [x] (2026-02-21 07:00Z) Added/adjusted tests for DTO payload behavior and ran targeted debug unit test.

## Surprises & Discoveries

- Observation: Android Room uses explicit migrations (`80->81`, `81->82`, `82->83`), while iOS path uses destructive fallback.
  Evidence: `composeApp/src/androidMain/kotlin/com/razumly/mvp/core/data/RoomMigrations.android.kt` and `RoomDBModule.android.kt`.

## Decision Log

- Decision: bump Room version and add `83->84` migration for `MatchMVP.locked`.
  Rationale: keeps Android non-destructive migration path intact and avoids runtime schema mismatch.
  Date/Author: 2026-02-21 / Codex

## Outcomes & Retrospective

Implemented and validated.

- Mobile match entity/DTO/update payloads now carry `locked`, including bulk update payload entries.
- Room schema version incremented `83 -> 84` with additive migration `MIGRATION_83_84` (`MatchMVP.locked` default 0).
- Match edit dialog now lets hosts lock/unlock an individual match.
- Schedule controls (already wired in current branch) now function with tracked user IDs including linked children and provide lock-all for visible matches in edit mode.
- Validation passed:
  - `./gradlew :composeApp:compileDebugKotlinAndroid`
  - `./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.network.dto.MatchDtosTest"`

## Context and Orientation

Mobile match data flows through `MatchMVP` (`core/data/dataTypes/MatchMVP.kt`), network mapping (`core/network/dto/MatchDtos.kt`), repository transport (`eventDetail/data/MatchRepository.kt`), and event detail presentation (`eventDetail/EventDetailScreen.kt`, `eventDetail/composables/ScheduleView.kt`, `eventDetail/composables/MatchEditDialog.kt`). Event detail component logic in `eventDetail/EventDetailComponent.kt` already knows how to load linked children via `userRepository.listChildren()` for join/withdraw flows.

## Plan of Work

Introduce `locked` end-to-end in mobile model + payload mapping, then wire schedule-level controls for show-only-my-matches and lock-all. Reuse existing child-loading patterns in `EventDetailComponent` to build a set of child user IDs for filtering. Add per-match lock toggle in `MatchEditDialog`, keeping existing edit/save flow intact.

## Concrete Steps

From `/mnt/c/Users/samue/StudioProjects/mvp-app`:

1. Edit model/DTO/repository/component/screen files listed above.
2. Update Room schema version and migration list.
3. Run `./gradlew :composeApp:testDebugUnitTest` (or targeted tests if full suite is too heavy in WSL).

## Validation and Acceptance

Acceptance is met when:

- Mobile sends/receives `locked` in match update and bulk update payloads.
- Schedule screen exposes a show-only-my-matches filter and includes linked child match participation.
- Host in match edit mode can lock/unlock all visible schedule matches.
- Match edit dialog contains a lock checkbox that persists in editable state.
- Build/tests pass for changed modules.

## Idempotence and Recovery

Edits are additive. Re-running Gradle tasks is safe. If Room migration SQL fails, keep schema change and fix SQL in `RoomMigrations.android.kt`; do not downgrade version once committed.

## Artifacts and Notes

Will be filled with command outputs after implementation.

## Interfaces and Dependencies

Required shape changes:

- `MatchMVP.locked: Boolean = false`.
- `MatchApiDto`, `MatchUpdateDto`, and bulk DTOs include `locked`.
- `MatchRepository.updateMatch` and `updateMatchesBulk` must send `locked`.
- `EventDetailComponent` exposes child IDs and lock-all callbacks to schedule UI.

Revision note: Initial plan created to satisfy PLANS.md before implementing code.
