# Weekly Event Join Sessions In Mobile Event Detail

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` will be kept up to date as work proceeds.

`PLANS.md` at the repository root governs this document and this plan is maintained in accordance with it.

## Purpose / Big Picture

After this change, opening Join Options for a parent `WEEKLY_EVENT` in `mvp-app` will show a selectable list of upcoming sessions, matching `mvp-site` behavior. Selecting a session will create (or reuse) the weekly child event and transition the user into that child event so registration, payments, and required-document signatures continue through the existing join flow.

## Progress

- [x] (2026-03-18 23:55Z) Verified `mvp-site` source behavior (`EventDetailSheet.tsx`, `eventService.createWeeklySession`) and endpoint contract (`POST /api/events/{id}/weekly-sessions`).
- [x] (2026-03-18 23:58Z) Located `mvp-app` integration points (`EventDetailScreen`, `EventDetailComponent`, `IEventRepository`/`EventRepository`) and confirmed missing weekly-session API support.
- [x] (2026-03-19 00:18Z) Implemented `weekly-sessions` request/response usage in app data layer (`WeeklySessionCreateRequestDto`, repository method, cache persistence).
- [x] (2026-03-19 00:23Z) Implemented event-detail action to create/select weekly child session and navigate to child event.
- [x] (2026-03-19 00:31Z) Updated Join Options sheet UI for weekly parent events to render selectable session options built from timeslots.
- [x] (2026-03-19 00:34Z) Updated test fakes implementing `IEventRepository`.
- [x] (2026-03-19 00:44Z) Validation run: `:composeApp:testDebugUnitTest` failed on host-specific KSP/AWT initialization (`sun.awt.PlatformGraphicsInfo`), then `:composeApp:compileCommonMainKotlinMetadata` passed to verify Kotlin compile integrity for touched code.

## Surprises & Discoveries

- Observation: `mvp-app` currently has no `weekly-sessions` API call.
  Evidence: repository/source search showed no references to `weekly-sessions` or `createWeeklySession`.
- Observation: `Event` in `mvp-app` does not expose `parentEvent` at the model level.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt` has no parent field; detection must use available weekly-parent signals.
- Observation: Android unit test task currently fails in this Windows host with `:composeApp:kspDebugKotlinAndroid` due `Could not initialize class sun.awt.PlatformGraphicsInfo`.
  Evidence: `.\gradlew :composeApp:testDebugUnitTest` failed before tests executed, while `.\gradlew :composeApp:compileCommonMainKotlinMetadata` succeeded.

## Decision Log

- Decision: Detect weekly parent events in UI using `eventType == WEEKLY_EVENT` plus presence of parent timeslots (`timeSlotIds`/loaded `timeSlots`) instead of adding a new persisted `parentEvent` field.
  Rationale: This avoids schema and mapper churn for the immediate behavior, while still matching the backend contract where parent weekly events carry timeslots and children do not.
  Date/Author: 2026-03-18 / Codex
- Decision: After weekly child creation, navigate to the returned child event detail screen instead of mutating the existing component's bound event stream.
  Rationale: `DefaultEventDetailComponent` is initialized with a fixed source event id stream; navigation is the safest way to preserve existing payment/signature join behavior without broader component refactor.
  Date/Author: 2026-03-19 / Codex

## Outcomes & Retrospective

Implemented behavior now matches the intended weekly join flow: parent weekly events show session selection in Join Options, session selection calls backend weekly-session creation, and users are transitioned into the child event where normal registration/payment/doc signing flow is unchanged. Data-layer support and interface fakes were updated accordingly. Full Android unit test execution remains blocked in this host by an existing KSP/AWT environment issue; common Kotlin metadata compilation passed after changes.

## Context and Orientation

`mvp-app` event detail behavior is split across:
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt` for Join Options sheet rendering and action dispatch.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` for join orchestration, required-signature flow, and navigation.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt` for HTTP calls and local cache persistence.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt` for event-related network payloads.

In `mvp-site`, weekly join starts by selecting a session from parent timeslots, then calling `POST /api/events/{parentId}/weekly-sessions` with `sessionStart`, `sessionEnd`, and optional `slotId`. The returned child event is then used as the normal registration target.

## Plan of Work

Add a weekly-session create method to the event repository interface and implementation, including request DTO serialization and returned event caching. Then add a component action that invokes this method and navigates to the returned child event. In the join sheet UI, branch on weekly-parent events to render upcoming session options built from existing `TimeSlot` recurrence data (days-of-week plus start/end minutes constrained by start/end dates). Keep all existing non-weekly join options and logic untouched.

## Concrete Steps

From repository root `C:\Users\samue\StudioProjects\mvp-app`:

1. Edit DTOs and repository contracts:
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`
2. Edit event-detail logic/UI:
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`
3. Update test fakes implementing `IEventRepository`:
   - `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/BillingRepositoryHttpTest.kt`
   - `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/CreateEventTestFixtures.kt`
4. Run a targeted compile/test command and capture result.

## Validation and Acceptance

Acceptance criteria:
- Opening Join Options for a parent `WEEKLY_EVENT` shows a list of upcoming sessions derived from weekly timeslots.
- Selecting a session triggers weekly child creation and navigates to child event detail.
- On child event detail, existing join/payment/document flow is unchanged (same controls as normal event join).
- Non-weekly events still show existing Join Options controls.

Validation commands run:
- `.\gradlew :composeApp:testDebugUnitTest` (failed in host environment at `:composeApp:kspDebugKotlinAndroid` with `sun.awt.PlatformGraphicsInfo`).
- `.\gradlew :composeApp:compileCommonMainKotlinMetadata` (passed; confirms common Kotlin compile for touched files).

## Idempotence and Recovery

Edits are additive and can be rerun safely. If the validation task fails due unrelated pre-existing workspace changes, rerun after isolating only the touched files or run a narrower module task to confirm no compile regressions from this feature.

## Artifacts and Notes

Artifacts:
- Diff snippets for repository method and join sheet branch.
- Test command output status captured above.

## Interfaces and Dependencies

Required interface additions at completion:
- `IEventRepository.createWeeklySession(parentEventId: String, sessionStart: Instant, sessionEnd: Instant, slotId: String?): Result<Event>`
- `EventDetailComponent.selectWeeklySession(sessionStart: Instant, sessionEnd: Instant, slotId: String?)`

Required network payloads at completion:
- `WeeklySessionCreateRequestDto(sessionStart, sessionEnd, slotId?, divisionId?, divisionTypeId?, divisionTypeKey?)` in `EventDtos.kt`.

Revision note (2026-03-18): Initial ExecPlan authored before implementation to satisfy repository planning requirements for this feature.
Revision note (2026-03-19): Updated all living sections after implementation and validation; recorded the host-specific KSP test blocker and compile fallback evidence.
