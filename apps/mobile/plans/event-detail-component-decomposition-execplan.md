# Decompose EventDetailComponent Responsibilities

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. It is self-contained for a contributor who has only the current working tree and this plan. The related but separate UI-oriented plan is `plans/event-details-modularization-execplan.md`; that plan focuses on `EventDetails.kt`, while this plan focuses on `EventDetailComponent.kt` and its state/workflow responsibilities.

## Purpose / Big Picture

The mobile event detail feature currently works through one very large component implementation, `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`. The public `EventDetailComponent` interface exposes event state and actions to the screen, while the concrete `DefaultEventDetailComponent` coordinates event loading, edit payload preparation, registration, payments, signatures, participants, invitations, league standings, match editing, bracket editing, images, sharing, and notifications.

After this refactor, the app should behave the same for users, but the code will be easier to change safely. A developer should be able to adjust event edit payload preparation, match editing, or registration/payment flow without reading the whole component. The observable outcome is that existing event detail and event creation flows compile and pass their focused regression tests, while `EventDetailComponent.kt` becomes an orchestration layer that delegates cohesive work to smaller helpers with direct tests.

## Progress

- [x] (2026-06-22) Audited current event-detail file sizes and confirmed `EventDetailComponent.kt` is the largest file in the Kotlin shared app at 7,904 lines.
- [x] (2026-06-22) Checked the existing `plans/event-details-modularization-execplan.md` and confirmed it covers UI extraction from `EventDetails.kt`, not decomposition of `DefaultEventDetailComponent`.
- [x] (2026-06-22) Created this ExecPlan before implementation.
- [x] (2026-06-22) Added the implementation rule that every code update must be followed by relevant tests, and progress is not accepted unless those tests pass or a blocker is documented.
- [x] (2026-06-22) Recorded a clean baseline with focused event-detail tests and common metadata compilation before moving component logic.
- [x] (2026-06-22) Extracted event edit payload, field draft, and timeslot draft preparation into `EventEditPayloadBuilder.kt` with direct focused tests.
- [ ] Extract match and bracket editing helpers that are pure or nearly pure.
- [ ] Extract registration, join, withdraw, refund, payment preview, and signature flow state into a cohesive coordinator without changing public behavior.
- [ ] Extract participant management and invite/search coordination where it can be tested independently.
- [ ] Thin `DefaultEventDetailComponent` so it owns Decompose lifecycle, public state exposure, and delegation, while helpers own domain-specific transformations.
- [ ] Run focused event-detail regression tests and final compile/build validation.

## Surprises & Discoveries

- Observation: `EventDetailComponent.kt` already has some extracted collaborators, so the refactor should continue the existing pattern instead of creating a new architecture.
  Evidence: Existing nearby helper files include `EventScheduleRules.kt`, `EventMatchRules.kt`, `EventDetailsValidation.kt`, `EventStaffPersistence.kt`, `EventDetailDivisionOptions.kt`, `EventOverviewCapacity.kt`, `data/MatchOperationLocalApplier.kt`, and `data/BracketGraphValidator.kt`.

- Observation: `EventDetails.kt` is already covered by a separate plan and has been partially split.
  Evidence: `plans/event-details-modularization-execplan.md` records completed extraction of pure rules, shared UI primitives, read-only helpers, required documents, division list UI, and staff card UI, while leaving `EventDetails.kt` not yet orchestration-only.

- Observation: `EventDetailComponent.kt` has direct test coverage through component construction, especially for mobile join flow behavior.
  Evidence: `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventDetailMobileJoinFlowTest.kt` constructs `DefaultEventDetailComponent` in many scenarios.

- Observation: Moving helper functions out of `EventDetailComponent.kt` can expose imports that still belong to the component.
  Evidence: The first post-extraction `./gradlew :composeApp:compileCommonMainKotlinMetadata` failed because `EventDetailComponent.kt` still used `toTimeZoneOrUtc` in rental slot conversion after its import was removed. Restoring the import made the same compile command pass.

- Observation: Event division defaults are normalized before being assigned to field drafts.
  Evidence: `EventEditPayloadBuilderTest.buildEditableFieldDrafts_defaults_empty_field_divisions_to_event_divisions` initially expected `division-a`; the code correctly returned the existing normalized identifier `division_a`, so the test was corrected and passed.

## Decision Log

- Decision: Keep the public `EventDetailComponent` interface and `DefaultEventDetailComponent` constructor stable during the first extraction milestones.
  Rationale: The screen and tests already depend on these entry points. The first goal is to reduce internal responsibility without creating a call-site migration.
  Date/Author: 2026-06-22 / Codex

- Decision: Start with event edit payload preparation before side-effectful registration or payment flows.
  Rationale: The edit payload code is cohesive, mostly deterministic, high-risk for scheduling regressions, and easier to cover with direct unit tests than flows that call repositories and payment processors.
  Date/Author: 2026-06-22 / Codex

- Decision: Use small internal helpers in the existing `com.razumly.mvp.eventDetail` package before introducing new Gradle modules or public APIs.
  Rationale: The broader Gradle modularization plan exists separately in `plans/kmp-feature-modularization-execplan.md`. This plan is a safer package-level decomposition that can happen first and will make later module extraction easier.
  Date/Author: 2026-06-22 / Codex

- Decision: Test after every implementation update and require passing tests before accepting progress.
  Rationale: This component sits on event creation, scheduling, registration, payments, and match editing paths. Small extractions can compile while subtly changing behavior, so each update must be paired with focused tests for the touched area and no milestone can be marked complete while its relevant tests are failing.
  Date/Author: 2026-06-22 / Codex

- Decision: Keep `DefaultEventDetailComponent` responsible for assigning `_editableFields`, `_fieldCount`, and `_editedEvent` after payload preparation, while moving the deterministic draft calculation into `EventEditPayloadBuilder`.
  Rationale: This preserves existing component state semantics and avoids moving mutable `StateFlow` ownership into the helper. The helper now returns both the prepared payload and the normalized editable field list for the component to apply.
  Date/Author: 2026-06-22 / Codex

## Outcomes & Retrospective

The first implementation milestone is complete. `EventEditPayloadBuilder.kt` now owns event update payload preparation, editable field draft normalization, league slot draft normalization, default field helpers, default league slot creation, league scoring DTO conversion, and recurring slot date-boundary helpers. `DefaultEventDetailComponent` still owns public state, lifecycle, repository calls, and state assignment after helper output. `EventDetailComponent.kt` dropped from 7,904 lines to 7,492 lines after this milestone.

Focused helper tests and related schedule/weekly regression tests pass. The remaining plan work is to extract match/bracket editing helpers, then registration/payment/signature workflow state, then participant/invite coordination.

## Context and Orientation

This repository is a Kotlin Multiplatform app. Shared app code lives under `composeApp/src/commonMain/kotlin/com/razumly/mvp/`. The event detail feature lives under `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/`.

`EventDetailComponent.kt` contains two key types. `EventDetailComponent` is the public interface used by the screen. It exposes `StateFlow` values such as `selectedEvent`, `divisionMatches`, `eventFields`, `participantManagementSnapshot`, `editableMatches`, `editableLeagueTimeSlots`, and dialog states. It also exposes actions such as `joinEvent`, `updateEvent`, `rescheduleEvent`, `commitMatchChanges`, `startManagingParticipants`, `invitePlayerToEvent`, `confirmTextSignature`, and `sendNotification`. `DefaultEventDetailComponent` is the concrete implementation. It starts around line 712 in the current file and mixes lifecycle handling, repository calls, state mutation, pure data preparation, and UI-facing workflow decisions.

The current largest shared Kotlin files in this area are:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`, 7,904 lines.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`, 7,135 lines.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`, 5,481 lines.

This plan targets `EventDetailComponent.kt` first. `EventDetailScreen.kt` and `EventDetails.kt` can be split later, but they should not block making the component safer. A helper in this plan means an `internal` Kotlin class or function in the same package that can be tested directly from `commonTest`. A coordinator means a small class that owns one workflow's state transitions and delegates side effects through injected functions or repositories; it should not know about Compose UI.

Backend endpoint paths and request/response contracts come from the sibling `mvp-site` repository. Do not invent or change backend payloads during this refactor. If an endpoint or payload shape must be checked, use `/Users/elesesy/StudioProjects/mvp-site/` as the source of truth.

## Plan of Work

First, record the baseline. Run focused event-detail tests that cover schedule rules, weekly behavior, join flow, division options, staff persistence, and match/bracket helpers. Also run a shared Kotlin compile task. If any test fails before changes, record the failure in `Surprises & Discoveries` and avoid mixing a pre-existing failure with the refactor.

During implementation, test after every code update before proceeding to the next update. A code update means any extraction, helper introduction, call-path reroute, test addition, or removal of old private functions. Run the smallest focused tests that cover the changed behavior immediately, then run the broader validation suite at milestone boundaries. Do not mark a `Progress` item complete unless the relevant tests passed. If a test cannot be run or fails for an environment reason, record the command, failure, and required follow-up in `Surprises & Discoveries` and `Artifacts and Notes`.

Second, extract the event edit payload preparation block. In the current file, this starts around the private `PreparedEventForUpdate` data class near line 5915 and includes `prepareEventForUpdate`, `buildFieldDrafts`, `buildLeagueSlotDrafts`, `editableLeagueTimeSlotsForEvent`, `syncEditableLeagueSlotBoundaries`, `buildEditableFieldDrafts`, `syncEditableFieldsForEvent`, default field helpers, league scoring conversion, default slot creation, and date/minute/day conversion helpers. Create a new file such as `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventEditPayloadBuilder.kt`. The helper should receive explicit input values and return prepared values. It should not read or mutate `MutableStateFlow` directly. `DefaultEventDetailComponent` can remain responsible for assigning returned values back into `_editableFields`, `_fieldCount`, `_editedEvent`, or `_editableLeagueTimeSlots`.

The first extraction should introduce direct tests in `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventEditPayloadBuilderTest.kt`. Cover at least these cases: field drafts preserve selected rental-backed field IDs, empty field divisions become event divisions and then `OPEN`, non-repeating slot times derive `dayOfWeek`, `daysOfWeek`, and start/end minutes, repeating weekly slots preserve multiple weekdays, and invalid slots with no valid fields or invalid time bounds are dropped. These cases map to repository guidelines about explicit field division assignment and multi-weekday weekly timeslots.

Third, extract match and bracket editing helpers. The current component has local logic for refreshing editable rounds, building bracket nodes, normalizing editable bracket graphs, finding the next editable match number, creating staged matches, validating match changes, checking overlaps, resetting bracket matches, and checking bracket membership. Some infrastructure already exists in `data/MatchOperationLocalApplier.kt` and `data/BracketGraphValidator.kt`; prefer extending those existing helpers or adding `EventMatchEditStateBuilder.kt` rather than creating parallel concepts. Keep `DefaultEventDetailComponent` in charge of repository calls such as commit operations, but move deterministic match transformations and validation into testable functions.

Fourth, isolate registration and payment flow state. This area includes event registration questions, weekly occurrence selection, join choice dialogs, child join selection, registration holds, payment plan preview, billing address prompts, text/web signature prompts, withdraw targets, paid refund checks, and purchase intent processing. Create a coordinator only after the pure helper extractions have passed. The coordinator should own state transition functions and receive side-effect callbacks for repository calls, purchase launch, and navigation. Preserve `EventDetailComponent` public actions such as `joinEvent`, `joinEventAsTeam`, `confirmJoinAsSelf`, `leaveEvent`, `withdrawAndRefund`, `requestRefund`, `confirmTextSignature`, and `submitBillingAddress`.

Fifth, isolate participant management and invitations. Participant management includes bootstrapping managed participant data, moving participant divisions, removing users or teams, billing snapshots, team compliance summaries, and participant warnings. Invitations include user search, team search, pending staff invites, inviting teams, inviting players, inviting by email, and free-agent team invitations. Extract this only where tests can prove the state and request mapping, and do not change endpoint usage without checking `mvp-site`.

Finally, thin `DefaultEventDetailComponent`. The component should still expose the same public state and actions, own the Decompose lifecycle, own coroutine scope and cancellation, and wire repositories. It should delegate cohesive transformations and workflow decisions to helpers. Stop after each milestone to update `Progress`, `Surprises & Discoveries`, and `Outcomes & Retrospective`.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-app` on macOS.

Record baseline file size and focused test behavior:

    rg --files composeApp/src/commonMain/kotlin composeApp/src/androidMain/kotlin composeApp/src/iosMain/kotlin | rg '\.kt$' | xargs wc -l | sort -nr | head -20
    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailMobileJoinFlowTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailWeeklyBehaviorTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*LeagueSlotValidationTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailsScheduleLockingTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailDivisionOptionsTest*"
    ./gradlew :composeApp:compileCommonMainKotlinMetadata

After extracting event edit payload preparation, run:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventEditPayloadBuilderTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*LeagueSlotValidationTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailWeeklyBehaviorTest*"
    ./gradlew :composeApp:compileCommonMainKotlinMetadata

After extracting match and bracket helpers, run:

    ./gradlew :composeApp:testDebugUnitTest --tests "*BracketGraphValidatorTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*MatchRepositoryHttpTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailsMatchRulesTest*"
    ./gradlew :composeApp:compileCommonMainKotlinMetadata

After registration, payment, participant, or invitation coordinator changes, run the relevant focused tests plus the broader debug suite:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailMobileJoinFlowTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*EventStaffPersistenceTest*"
    ./gradlew :composeApp:testDebugUnitTest

Before completion, run:

    ./gradlew :composeApp:testDebugUnitTest
    ./gradlew :composeApp:testReleaseUnitTest
    ./gradlew :composeApp:assembleDebug

If iOS simulator validation is needed and Xcode tooling is available, also run:

    ./gradlew :composeApp:allTests

## Validation and Acceptance

Acceptance requires behavior preservation and better separability.

Every implementation update must leave the relevant focused tests passing before work continues. Every milestone must leave the milestone-specific tests and compile command passing. Final acceptance requires the full requested debug and release test commands to pass, plus Android debug assembly, unless a platform/environment blocker is documented with the exact failing command and follow-up.

The public `EventDetailComponent` interface and `DefaultEventDetailComponent` constructor should remain source-compatible unless this plan is explicitly revised with a decision explaining why a public migration is necessary. Existing event detail and event creation call sites should compile without changing their behavior.

The first milestone is accepted when event edit payload preparation can be tested without constructing `DefaultEventDetailComponent`, and when the new helper tests prove field division defaults, rental-backed fields, non-repeating slots, repeating multi-weekday slots, and invalid slot filtering.

The match/bracket milestone is accepted when deterministic match transformations and validation can be tested outside the component, and existing bracket graph or match rule tests still pass.

The registration/payment milestone is accepted when existing mobile join flow tests still pass, public actions still behave through the component, and the extracted coordinator has focused tests for state transitions that do not require real network or payment services.

The overall plan is accepted when `EventDetailComponent.kt` is materially smaller, `DefaultEventDetailComponent` is mostly lifecycle/delegation/repository orchestration, the focused tests listed above pass, and Android debug assembly succeeds. The target is not an arbitrary line-count number, but a practical checkpoint is to remove at least the edit payload and match/bracket transformation clusters from the file before claiming meaningful progress.

## Idempotence and Recovery

Make this refactor additive-first. Add helpers and tests, route one call path through them, then remove duplicated private functions after tests pass. Keep helpers `internal` and in the same package unless there is a proven need for public API. Avoid file moves that combine unrelated behavior changes with extraction.

If a test fails after an extraction, first confirm whether the failure reproduces on the previous commit or before the extraction. If the failure is caused by the extraction, prefer restoring the old behavior through tests and small adapters instead of changing product semantics. Do not use destructive git commands. Inspect `git diff` and repair the smallest relevant files.

Generated Gradle files under `build/` are ephemeral. Do not commit them. If Room entities are modified, stop and revise this plan before proceeding because this refactor is not intended to change Room schema.

## Artifacts and Notes

Record key command outputs here as work proceeds. Keep snippets concise and focused on proof of success or failure.

Initial audit evidence:

    7904 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
    7135 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt
    5481 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt

Existing direct component test evidence:

    composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventDetailMobileJoinFlowTest.kt constructs DefaultEventDetailComponent in multiple scenarios.

Baseline focused tests passed before source extraction:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailMobileJoinFlowTest*" --tests "*EventDetailWeeklyBehaviorTest*" --tests "*LeagueSlotValidationTest*" --tests "*EventDetailsScheduleLockingTest*" --tests "*EventDetailDivisionOptionsTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 49s; 43 actionable tasks: 5 executed, 38 up-to-date.
    Notes: Gradle started the local backend from `/Users/elesesy/StudioProjects/mvp-site`; `adb` was not found, so emulator port reverse was skipped.

Baseline common metadata compilation passed before source extraction:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 40s; 11 actionable tasks: 4 executed, 7 up-to-date.
    Notes: Compilation reported existing warnings in `EventRepository.kt`, `EventDetailComponent.kt`, `EventDetails.kt`, `LeagueScheduleFields.kt`, `ParticipantsVeiw.kt`, `SetCountDropdown.kt`, `TeamSizeLimitDropdown.kt`, `RentalSchedulingUtils.kt`, `RentalBuilderContent.kt`, `ProfileMyScheduleScreen.kt`, `ProfileDetailsScreen.kt`, and `RefundManagerScreen.kt`. These warnings did not fail the build.

First post-extraction compile caught and verified a wiring fix:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    First run exit code: 1
    Failure: `EventDetailComponent.kt` still used `toTimeZoneOrUtc` after the import was removed.
    Fix: restored `import com.razumly.mvp.core.util.toTimeZoneOrUtc`.

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Second run exit code: 0
    Result: BUILD SUCCESSFUL in 19s; 11 actionable tasks: 3 executed, 8 up-to-date.

First helper test run exposed a test expectation issue, then passed after correction:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventEditPayloadBuilderTest*"
    First run exit code: 1
    Failure: expected raw `division-a`, but the existing division normalization contract returns `division_a`.

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventEditPayloadBuilderTest*"
    Second run exit code: 0
    Result: BUILD SUCCESSFUL in 36s; 43 actionable tasks: 6 executed, 37 up-to-date.

Related schedule and weekly regression tests passed after extraction:

    ./gradlew :composeApp:testDebugUnitTest --tests "*LeagueSlotValidationTest*" --tests "*EventDetailWeeklyBehaviorTest*" --tests "*EventDetailsScheduleLockingTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 16s; 43 actionable tasks: 5 executed, 38 up-to-date.

Milestone common metadata compilation passed after tests:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 2s; 11 actionable tasks: 2 executed, 9 up-to-date.

Post-milestone line-count evidence:

    7492 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     509 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventEditPayloadBuilder.kt
     239 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventEditPayloadBuilderTest.kt

Whitespace audit passed:

    git diff --check
    Exit code: 0

## Interfaces and Dependencies

Expected internal interfaces and helpers may include these names, but exact names can change if implementation reveals a better local fit:

    internal data class PreparedEventForUpdate(
        val event: Event,
        val fields: List<Field>?,
        val timeSlots: List<TimeSlot>?,
        val leagueScoringConfig: LeagueScoringConfigDTO?,
    )

    internal class EventEditPayloadBuilder {
        fun prepareForUpdate(input: EventEditPayloadInput): EventEditPayloadResult
        fun buildEditableFields(input: EditableFieldInput): List<Field>
        fun buildEditableLeagueTimeSlots(input: EditableLeagueSlotInput): List<TimeSlot>
    }

    internal data class EventEditPayloadInput(...)
    internal data class EventEditPayloadResult(...)

    internal object EventMatchEditStateBuilder {
        fun buildBracketNodes(matches: List<MatchWithRelations>): List<BracketNode>
        fun normalizeEditableBracketGraph(matches: List<MatchWithRelations>): List<MatchWithRelations>
        fun validateEditableMatches(matches: List<MatchWithRelations>): ValidationResult
    }

These helpers should depend on existing domain models from `core/data/dataTypes`, `core/network/dto`, and nearby event-detail helper functions. They should not depend on Compose UI, Decompose `ComponentContext`, navigation handlers, or payment UI. Side-effectful coordinators may depend on repository interfaces only where direct tests can provide fakes.

Revision Note (2026-06-22): Initial plan created to track decomposition of `DefaultEventDetailComponent` separately from the existing `EventDetails.kt` UI modularization plan.
Revision Note (2026-06-22): Added explicit test-after-every-update discipline and acceptance language requiring relevant tests to pass before progress is marked complete.
Revision Note (2026-06-22): Recorded passing baseline focused event-detail tests and common metadata compilation before source extraction.
Revision Note (2026-06-22): Recorded completion of the event edit payload helper extraction, direct tests, regression tests, compile checks, and line-count impact.
