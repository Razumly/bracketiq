# Fix multi-division playoff counts and preserve create form state

This ExecPlan is a living document. It follows `/Users/elesesy/StudioProjects/mvp-app/PLANS.md`. Keep the `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` sections current after each milestone.

## Purpose / Big Picture

A league can contain more than one regular division. Each division can use a different number of playoff teams. After this change, creating or editing such a league will send each division's playoff count in `draft.competition.divisionDetails[].playoffTeamCount`; the top-level `draft.competition.playoffTeamCount` will be `null` for multi-division leagues. The server will validate the per-division values and will not copy one division's count to the event record.

A failed create request must also leave the event form usable. The configured time slots, including their dates, times, day selections, and fields, must remain in the form after the failure. A later retry must use the current form state rather than a stale or empty schedule.

The behavior is visible in the Android event-create form. It is proven by the mobile and backend targeted tests described below. The Android emulator error that motivated this work is a server validation error for a missing or invalid playoff count; the fix must prevent that invalid multi-division payload and surface a precise validation error when a count is actually missing.

## Progress

- [x] (2026-08-11) Read the repository rules and `PLANS.md`.
- [x] (2026-08-11) Trace the mobile editor command mapper and the backend editor contract.
- [x] (2026-08-11) Identify that the current mobile mapper falls back to the first regular division's playoff count for the event-level field.
- [x] (2026-08-11) Add required playoff-count inputs to the advanced and simple mobile division forms.
- [x] (2026-08-11) Add an initial mobile mapper regression for single-division playoff count recovery and related editor state behavior.
- [x] (2026-08-11) Add an initial backend multi-division playoff-count validation regression and pass the targeted backend suite.
- [x] (2026-08-11) Remove the event-level playoff-count fallback for multi-division mobile payloads.
- [x] (2026-08-11) Define and implement the backend create/save mapping so multi-division events do not persist an event-level playoff count.
- [x] (2026-08-11) Preserve all configured time-slot fields after a failed create and make retry payloads reflect current form state.
- [x] (2026-08-11) Add mobile regressions for multi-division payload shape and failed-create time-slot preservation.
- [x] (2026-08-11) Add or complete backend regressions for multi-division persistence and invalid count rejection.
- [x] (2026-08-11) Run the final backend, mobile, and focused smoke verification.
- [x] (2026-08-11) Record final outcomes and remaining risk in this plan.
- [x] (2026-08-11) Remove duplicate split-division playoff-count rendering and add a regression covering both mobile form variants.

## Surprises & Discoveries

- Observation: The backend editor contract accepts `competition.playoffTeamCount` as nullable and accepts `playoffTeamCount` on every division detail.
  Evidence: `mvp-site/src/contracts/eventEditor.ts` defines `editorCompetitionSchema.playoffTeamCount` as `z.number().int().positive().nullable()` and `divisionDetailSchema.playoffTeamCount` as an optional numeric field.

- Observation: The mobile mapper currently derives `Event.playoffTeamCount` from `competition.playoffTeamCount ?: regularDetails.firstOrNull()?.playoffTeamCount`.
  Evidence: `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventEditorSessionMapper.kt`, `EventEditorDraftDto.toEvent`.

- Observation: The backend save adapter deletes `eventPayload.divisionDetails` before calling `upsertEventFromPayload`, then passes the editor's regular and playoff details explicitly.
  Evidence: `mvp-site/src/server/events/eventEditorSave.ts`, `saveWithinTransaction`.

- Observation: The mobile create component keeps a `pendingCreateCommand` after the first failed request. This is useful for idempotency, but it can make a retry ignore edits made after the failure.
  Evidence: `DefaultCreateEventComponent.createEventAfterPayment` stores the command before the request and clears it only in the success callback.

- Observation: `applyEditorSession` replaces `_leagueSlots` with the canonical session slots. No failure branch should call it. Any test must check both the component slot flow and the retry command.
- Observation: The split-division editor had the same per-division playoff count in the division form and in the save-action row. The event-level count was already scoped to single-division mode; the duplicate field made the scope look incorrect.
  Evidence: `DefaultCreateEventComponent.applyEditorSession` and `createEventAfterPayment`.

## Decision Log

- Decision: Treat the division detail as the source of truth for playoff counts when an event has multiple regular divisions.
  Rationale: Different divisions can use different counts. Copying the first division's value into the event-level field creates an incorrect value and can fail server validation or silently change data.
  Date/Author: 2026-08-11 / Codex.

- Decision: Keep the event-level playoff count only for the single-division case. Set it to `null` for multi-division leagues, while retaining each regular division's count.
  Rationale: This matches the existing backend contract and avoids inventing a new wire field or changing tournament behavior that already uses the event-level field.
  Date/Author: 2026-08-11 / Codex.

- Decision: Do not solve the failed-create schedule problem by reloading the bootstrap snapshot or by replacing missing slot values with null/default records.
  Rationale: Reloading can discard valid user edits. The form must retain its own canonical state, and retry must serialize that state.
  Date/Author: 2026-08-11 / Codex.

- Decision: Preserve unrelated working-tree changes. The checkout contains earlier manual-payment, organization, and field-assignment changes. Do not revert or reformat them while implementing this plan.
  Rationale: They are user work and are outside this request.
  Date/Author: 2026-08-11 / Codex.

## Outcomes & Retrospective

- Mobile mapper verification passed: `EventEditorSessionMapperTest` passed in `:core:repository-impl:testDebugUnitTest`.
- Mobile create verification passed: `DefaultCreateEventComponentTest` and `EventDetailsValidationTest` passed in `:composeApp:testDebugUnitTest`.
- The failed-create regression passed. It proved that slot values remain unchanged, the loading state closes, the error remains visible, and the retry command keeps the edited slot fields.
- Backend verification passed: four focused Jest suites passed with 85 tests.
- The broader repository implementation suite passed with `BUILD SUCCESSFUL`.
- The broader Compose unit suite ran 1,411 tests but had two failures in live backend integration tests. The observed first response rejected the integration fixture's `draft.competition.loserSetCount` value of `0`; this is outside the changed mapper and create-retry unit paths. [INFERENCE] The failures are fixture or local backend environment issues, not evidence against the targeted behavior.
- No new runtime dependency or API compatibility alias was added.
- Mobile UI verification passed: `EventCreateValidationVisibilityUiTest` passed all 4 tests, including advanced and simple split-division rendering; Android debug unit-test compilation and iOS simulator source compilation passed.

## Context and Orientation

The mobile app is a Kotlin Multiplatform project. Shared mobile code is under `composeApp/src/commonMain` and repository/editor mapping is under `core/repository-impl/src/commonMain`. The backend is the separate Next.js project at `/Users/elesesy/StudioProjects/mvp-site`; its event editor contract and save adapter are the source of truth for request and response fields.

The event editor uses a snapshot and a draft. A snapshot is the server-provided editable state. A draft is the state sent back for create or save. `draft.competition.divisionDetails` contains regular division records. `draft.competition.playoffDivisionDetails` contains generated playoff records. `draft.competition.playoffTeamCount` is the event-level field. A `TimeSlot` is the mobile schedule record with date, time, repeat-day, end-date, division, and scheduled-field values. `DefaultCreateEventComponent` owns the create form state and builds the editor command.

The key mobile files are:

* `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt` owns create state, command construction, and retry behavior.
* `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailsDivisionEditorForm.kt` and `simple/SimpleEventDetailsDivisionEditorForm.kt` render division playoff-count inputs.
* `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventEditorSessionMapper.kt` maps editor DTOs to the mobile `Event` model and maps mutations back to editor DTOs.
* `core/repository-impl/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/EventEditorSessionMapperTest.kt` covers mapper wire behavior.
* `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/CreateEventTestFixtures.kt` provides the fake editor repository and component harness.
* `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponentTest.kt` covers create validation, command construction, and retries.

The key backend files are:

* `mvp-site/src/contracts/eventEditor.ts` defines the editor draft schema.
* `mvp-site/src/app/events/[id]/schedule/components/eventForm/editorContractAdapters.ts` maps between legacy event records and editor drafts.
* `mvp-site/src/server/events/eventEditorSave.ts` converts a draft to the legacy event payload and calls `upsertEventFromPayload` in a transaction.
* `mvp-site/src/server/events/eventEditorSnapshot.ts` builds the editor snapshot and projects event resources.
* `mvp-site/src/server/repositories/events.ts` normalizes division details and enforces event persistence rules.
* `mvp-site/src/contracts/__tests__/eventEditor.test.ts`, `mvp-site/src/server/repositories/__tests__/events.upsert.test.ts`, and `mvp-site/src/server/events/__tests__/eventEditorSave.test.ts` are the focused backend tests.

## Plan of Work

First, finish the cross-stack contract decision. For a league with one regular division, keep the existing event-level count behavior for compatibility, but make sure the division detail also carries the count when it is available. For a league with more than one regular division, send `competition.playoffTeamCount: null` and send an explicit positive `playoffTeamCount` on every regular division detail. Do not derive one count from the first division. If a required multi-division count is missing, the mobile form must block submission with a clear error, and the backend must reject the payload with its existing validation error.

Next, update the mobile mapper. The DTO-to-domain mapping must set `Event.playoffTeamCount` from the event-level field only for a single regular division or for event types that use the event-level setting. The mutation-to-DTO mapping must preserve regular division detail counts and set the top-level count to `null` when there is more than one regular division. Use normalized, nonblank division identifiers when deciding the count scope. Add tests that decode the generated command and assert the exact top-level and per-division values.

Then, update the backend adapter and repository persistence path. `editorDraftToLegacyEvent` must not put a first division's count into the top-level event record for a multi-division league. `saveWithinTransaction` must continue passing regular division details to `upsertEventFromPayload`, and `upsertEventFromPayload` must validate each required regular division count independently. It must not require or manufacture an event-level count for a multi-division league. Add a backend test with two divisions and different counts, then assert the event payload has no event-level count and the division payload preserves both counts. Add a rejection test for a missing or non-positive per-division count.

Finally, fix the create retry state. Keep the user-owned `_leagueSlots` values as the source for every command build. If retrying after an API failure, either rebuild the pending command from the current canonical form state while retaining the same `createOperationId`, or prove that the pending command is intentionally immutable and ensure the UI cannot mutate the schedule after failure. The required behavior is that a user can correct a failed create and retry without losing slot dates, times, days, divisions, or fields. Do not call `applyEditorSession` or `loadEditorBootstrap` in a failure path. Add a regression that seeds a non-null slot, forces the first create to fail, changes a form value or retries, and asserts the slot in the retry command still has the original values.

Update only the necessary tests and source files. Preserve the existing atomic create and idempotency behavior. Run formatting only if the project formatter is already part of the normal verification command; do not run broad formatters during implementation.

## Concrete Steps

Run all commands from the stated working directory. Use JDK 17 for Gradle commands on macOS.

1. From `/Users/elesesy/StudioProjects/mvp-app`, inspect the current diffs and read the exact mapper, create component, and test sections before editing. Keep existing unrelated changes intact.

2. From `/Users/elesesy/StudioProjects/mvp-site`, run the focused backend tests while investigating:

    `npm test -- --runInBand src/contracts/__tests__/eventEditor.test.ts src/server/repositories/__tests__/events.upsert.test.ts src/server/events/__tests__/eventEditorSave.test.ts`

   The expected result is a passing Jest run. If the repository's package script does not accept this combined form, run each named test file with the same `--runInBand` option.

3. From `/Users/elesesy/StudioProjects/mvp-app`, run the focused mobile tests after the mapper and create retry changes:

    `./gradlew :core:repository-impl:testDebugUnitTest --tests 'com.razumly.mvp.core.data.repositories.EventEditorSessionMapperTest'`

    `./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.DefaultCreateEventComponentTest' --tests 'com.razumly.mvp.eventDetail.EventDetailsValidationTest'`

   The expected result is `BUILD SUCCESSFUL` and all selected tests pass.

4. Exercise the retry behavior in the mobile harness. The first fake create call must fail. The test must observe that `component.leagueSlots.value` is unchanged and that the second command contains the same non-null slot values. The test must also prove that the loading operation closes and the error remains visible after the first failure.

5. If the targeted tests pass, run the broader affected suites once, not concurrently:

    `./gradlew :core:repository-impl:testDebugUnitTest`

    `./gradlew :composeApp:testDebugUnitTest`

   From `/Users/elesesy/StudioProjects/mvp-site`, run the backend event editor and event repository suites that cover the changed functions. Record exact pass counts in this plan.

## Validation and Acceptance

The change is accepted only when all of these observable conditions hold:

* A two-division league with counts 8 and 4 produces a create command whose regular division details contain 8 and 4, and whose top-level competition count is `null`.
* A single-division league continues to produce the supported event-level count and does not lose the division detail count.
* A multi-division league with a missing count cannot be submitted on mobile and is rejected by the backend if sent directly.
* A failed create leaves the component's time-slot list equal in all user-editable schedule fields to the list before the request. A retry command contains those values and does not contain an empty or null replacement slot.
* The failed request leaves the loading overlay closed and the error message available for the user.
* Backend focused tests pass, including the editor contract, editor save, and event upsert tests.
* Mobile focused tests pass, including the mapper and create component tests.

## Idempotence and Recovery

All edits are safe to repeat. Tests use in-memory fake repositories or mocked Prisma clients and do not alter production data. If a test fails after a partial edit, re-read the changed file and apply a narrow correction. Do not reset the working tree because it contains unrelated user changes. If Gradle cache or native tooling fails, report that exact environment error separately from code failures and rerun the affected command after correcting the environment.

The create operation ID must remain stable across retries so the backend can recognize an idempotent retry. A retry must not generate a new operation ID or a new schedule from an empty state. A successful response may replace local state with the server snapshot; a failed response must not.

## Artifacts and Notes

The primary artifacts are the mobile mapper and create component changes, the backend editor adapter and repository changes, and their focused regression tests. Keep test evidence concise. The final plan should contain entries similar to:

    Mobile mapper tests: BUILD SUCCESSFUL; EventEditorSessionMapperTest passed.
    Mobile create tests: BUILD SUCCESSFUL; DefaultCreateEventComponentTest passed.
    Backend tests: Jest passed; event editor and upsert suites passed.

Do not add a second API contract or a compatibility alias. The existing editor contract remains the source of truth.

## Interfaces and Dependencies

At completion, these existing interfaces remain the integration points:

* `EventEditorSessionMapper.toCreateCommand(session: EventEditorSession, mutation: EventEditorMutation): PendingEventCreate` returns a command with the contract version and stable create operation ID.
* `DefaultCreateEventComponent.createEventAfterPayment(eventDraft: Event)` builds or reuses the command, invokes `IEventRepository.createEventEditor`, and only applies a server session on success.
* `editorDraftToLegacyEvent(draft: EventEditorDraft, eventId?: string | null)` maps the editor draft to a legacy event record without manufacturing a multi-division event-level playoff count.
* `saveEventEditor` and its create path call `upsertEventFromPayload` in one transaction, passing `divisionDetails` and `playoffDivisionDetails` explicitly.
* `upsertEventFromPayload` remains responsible for normalizing and validating division records. Its multi-division behavior must preserve each regular division's playoff count and leave the event-level count unset.

The implementation uses only existing Kotlin serialization, Kotlin coroutines, Compose state flows, Zod, Prisma transaction handling, and the repository's current test frameworks. No new runtime dependency is needed.

Plan revision note (2026-08-11): Created this living plan after tracing the existing mapper, backend contract, save adapter, and create retry lifecycle. The plan explicitly corrects the earlier first-division fallback and adds the failed-create time-slot preservation requirement.
