# Complete the mobile One-Time Event create command

This ExecPlan is a living document. Maintain it under the rules in `PLANS.md`.
`PLANS.md` is at the repository root. It defines the required plan format and
the evidence that each milestone must record.

## Purpose / Big Picture

After this change, a mobile organizer can create a One-Time Event with the
same visible labels and request data on Android and iOS. The editor uses the
values visible at submit time. A failed request keeps those values visible and
reuses the same operation ID when the organizer retries without changes. An
operation ID is the stable identifier sent with one create attempt.

The accepted event is written to Room before the success callback runs. Room is
the mobile local database layer. The repository test proves that the event,
event relations, fields, and schedule matches exist before success returns.

The main proof is the Android and iOS test suites. Both suites must report
`BUILD SUCCESSFUL`.

## Progress

- [x] (2026-08-18) Read issue #25, prerequisite #24, repository rules, and the mobile editor flow.
- [x] (2026-08-18) Isolated the work in `/Users/elesesy/StudioProjects/bracketiq-issue-25` on branch `issue/25-mobile-one-time-event`.
- [x] (2026-08-18) Added the shared `One-Time Event` label and the `Create` action label.
- [x] (2026-08-18) Persisted accepted editor results to Room before the success callback.
- [x] (2026-08-18) Added command, failure, retry, label, mapper, and Room persistence regressions.
- [x] (2026-08-18) Added one Room transaction around the accepted event projection writes.
- [x] (2026-08-18) Reused the canonical match DTO conversion for editor schedule projections.
- [x] (2026-08-18) Ran focused iOS tests. The task reported `BUILD SUCCESSFUL`.
- [x] (2026-08-18) Ran focused Android tests with the local Android SDK. The task reported `BUILD SUCCESSFUL`.
- [x] (2026-08-18) Ran the full Android and iOS mobile test suites. Both tasks reported `BUILD SUCCESSFUL`.
- [x] (2026-08-18) Ran the two-axis code review and addressed its transaction, fixture, naming, plan, and mapping findings.
- [x] (2026-08-18) Recorded the final outcomes and verification evidence in this plan.

## Surprises & Discoveries

- Observation: Room 2.8.4 exposes the needed transaction boundary through
  `useWriterConnection` and `immediateTransaction`.
  Evidence: `apps/mobile/core/database/src/commonMain/kotlin/com/razumly/mvp/core/db/MVPDatabaseService.kt`
  implements `DatabaseService.withTransaction` with those APIs.

- Observation: The editor schedule response stores match rules, segments,
  incidents, and official assignments as JSON objects.
  Evidence: `EventEditorMatchProjectionDto` in
  `apps/mobile/core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventEditorDtos.kt`.
  The repository now decodes those fields into `MatchApiDto` and uses its
  canonical `toMatchOrNull` conversion.

- Observation: The Android test task did not find the SDK until the shell
  received the local SDK path.
  Evidence: The first task stopped with `SDK location not found`. The retry
  with `ANDROID_HOME=/Users/elesesy/Library/Android/sdk` passed.

- Observation: No Room entity changed.
  Evidence: The change adds a transaction API only. The database version and
  generated schema do not require an update.

## Decision Log

- Decision: Use `EventType.displayLabel()` as the shared user-facing label
  helper.
  Rationale: The simple creation grid and event detail surfaces already use
  the event type enum. One helper prevents a second label vocabulary.
  Date/Author: 2026-08-18 / Codex.

- Decision: Use `IEventRepository.createEventEditor` as the Room boundary and
  `DefaultCreateEventComponent.createEvent` as the command and failure
  boundary.
  Rationale: These are the public seams used by the screen. They test the
  behavior without testing private helpers.
  Date/Author: 2026-08-18 / Codex.

- Decision: Persist the accepted event projection in one transaction.
  Rationale: A transaction commits the event, relations, fields, and matches
  together. A later write failure cannot leave a partial accepted projection.
  Date/Author: 2026-08-18 / Codex.

- Decision: Keep the default `DatabaseService.withTransaction` implementation
  for non-Room test adapters, and override it in `MVPDatabaseService`.
  Rationale: Existing in-memory adapters do not own a database connection.
  Production Room code uses a real immediate transaction.
  Date/Author: 2026-08-18 / Codex.

- Decision: Compare complete serialized commands from equivalent Android and
  iOS fixture paths in common tests.
  Rationale: The editor and mapper are shared Kotlin code. The test must prove
  that both platform fixture paths produce the same wire request.
  Date/Author: 2026-08-18 / Codex.

## Outcomes & Retrospective

The mobile create flow now exposes `One-Time Event` and `Create` for the
one-time path. It maps the current editor state without adding league or
playoff defaults. It preserves visible state after a typed request failure.
An unchanged retry keeps the same command and operation ID. An edited retry
gets a new operation ID.

`EventRepository.createEventEditor` now writes the accepted canonical event,
relations, fields, and schedule matches inside one Room transaction. The
success outcome returns only after those writes complete.

The mapper regression compares complete serialized commands for equivalent
Android and iOS One-Time Event fixtures. The focused and full Android and iOS
test tasks passed on 2026-08-18. No known acceptance gap remains.

## Context and Orientation

The mobile app is a Kotlin Multiplatform Compose client under
`apps/mobile`. Shared editor code is under
`apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate`.
Android and iOS use this shared path.

`EventType.EVENT` is the domain value for a One-Time Event. The old enum title
was `Event`. `apps/mobile/core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/enums/EventType.kt`
now returns `One-Time Event` for that value.

`DefaultCreateEventComponent` owns editor state, validation, loading state,
command identity, and retry behavior. A typed failure is a failed `Result`
from the remote request. The component keeps its visible state and clears
loading before it shows that failure.

`EventEditorSessionMapper` converts the bootstrap response and current
mutation into `EventEditorCreateCommandDto`. A command is the complete request
sent to the backend. `EventEditorSessionMapperTest` checks the complete
serialized request.

`EventRepository` owns the HTTP call and Room cache boundary.
`EventRoomStore` writes and reads events. `EventParticipantSyncCoordinator`
writes event user and team relations. The event, relation, field, and match
writes now run inside `DatabaseService.withTransaction`.

`DatabaseService` is the common database interface. `MVPDatabaseService` is
the production Room implementation. A data-access object (DAO) is the Room
interface for one stored data type.

The changed tests are:

`apps/mobile/composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/CreateEventSelectionRulesTest.kt`
checks labels.

`apps/mobile/composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponentTest.kt`
checks failed state and unchanged retry identity.

`apps/mobile/composeApp/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/EventRepositoryHttpTest.kt`
checks accepted Room writes and no writes after a remote failure.

`apps/mobile/core/repository-impl/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/EventEditorSessionMapperTest.kt`
checks complete command mapping and equivalent Android and iOS fixture output.

## Plan of Work

First, keep one label vocabulary. Update
`apps/mobile/core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/enums/EventType.kt`
and use the helper in
`apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventScreen.kt`.
Use `Create` only for the One-Time Event final action. Keep schedule-building
labels for League and Tournament.

Next, make accepted creation persistence atomic. Add
`DatabaseService.withTransaction` in
`apps/mobile/core/database/src/commonMain/kotlin/com/razumly/mvp/core/data/DatabaseService.kt`.
Implement it with Room's writer connection and immediate transaction in
`apps/mobile/core/database/src/commonMain/kotlin/com/razumly/mvp/core/db/MVPDatabaseService.kt`.
Wrap the event, relation, field, and match writes in
`EventRepository.createEventEditor` in
`apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`.
Return the success outcome from inside the transaction block.

Then, keep schedule projection conversion canonical. Decode an
`EventEditorMatchProjectionDto` into `MatchApiDto` and call
`MatchApiDto.toMatchOrNull`. Do not maintain a second full `MatchMVP`
constructor mapping.

Finally, add public-seam regressions. Build a non-default One-Time Event
fixture. Assert the serialized command keeps basics, participation,
registration, resources, staff, tags, images, questions, and documents.
Assert a failed request keeps visible state and the exact command for an
unchanged retry. Assert accepted Room records exist before repository success.
Compare complete serialized commands from equivalent Android and iOS fixture
paths.

## Milestones

### Milestone 1: One-Time Event labels and command identity

At the end of this milestone, the creation grid shows `One-Time Event` and the
one-time final action shows `Create`. The mapper and component tests show that
the current state becomes one complete command and that an unchanged retry
keeps its operation ID. Verify with the focused event creation and mapper
tests. Each task must report `BUILD SUCCESSFUL`.

### Milestone 2: Atomic accepted-result persistence

At the end of this milestone, the repository writes the accepted event,
relations, fields, and matches before returning success. Room runs all writes
inside one immediate transaction. Verify with the accepted editor-create
repository test and the repository implementation compile task.

### Milestone 3: Cross-platform proof and full verification

At the end of this milestone, equivalent Android and iOS fixture paths produce
the same complete serialized command. Run the focused tests first. Then run
the full Android and iOS mobile test suites. A passing task reports
`BUILD SUCCESSFUL` and no test failure.

## Concrete Steps

Run all commands from `/Users/elesesy/StudioProjects/bracketiq-issue-25/apps/mobile`.

1. Compile the changed shared source:

       ./gradlew :core:repository-impl:compileKotlinIosSimulatorArm64 :composeApp:compileKotlinIosSimulatorArm64 --console=plain

   Expected result: `BUILD SUCCESSFUL`.

2. Compile common test sources:

       ./gradlew :composeApp:compileTestKotlinIosSimulatorArm64 --console=plain

   Expected result: `BUILD SUCCESSFUL`.

3. Run focused iOS tests:

       ./gradlew :composeApp:iosSimulatorArm64Test --tests 'com.razumly.mvp.eventCreate.CreateEventSelectionRulesTest' --tests 'com.razumly.mvp.eventCreate.DefaultCreateEventComponentTest.given_failed_one_time_event_when_retry_is_unchanged_then_visible_state_and_command_are_preserved' --tests 'com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest.given_accepted_editor_create_when_repository_returns_then_event_relations_fields_and_matches_are_cached_before_result' --tests 'com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest.given_remote_editor_create_failure_when_repository_submits_then_no_rows_are_cached' --console=plain

   Expected result: `BUILD SUCCESSFUL`.

4. Run the cross-platform mapper test:

       ./gradlew :composeApp:iosSimulatorArm64Test --tests 'com.razumly.mvp.core.data.repositories.EventEditorSessionMapperTest' --console=plain

   Expected result: `BUILD SUCCESSFUL`. The test
   `given_equivalent_android_and_ios_one_time_edits_when_commands_are_built_then_serialized_commands_match`
   must pass.

5. Run focused Android tests. Set the SDK variables when the shell does not
   already define them:

       ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.CreateEventSelectionRulesTest' --tests 'com.razumly.mvp.eventCreate.DefaultCreateEventComponentTest.given_failed_one_time_event_when_retry_is_unchanged_then_visible_state_and_command_are_preserved' --tests 'com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest.given_accepted_editor_create_when_repository_returns_then_event_relations_fields_and_matches_are_cached_before_result' --tests 'com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest.given_remote_editor_create_failure_when_repository_submits_then_no_rows_are_cached' --console=plain

   Expected result: `BUILD SUCCESSFUL`.

6. Run the complete Android unit test task:

       ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:test --console=plain

   Expected result: `BUILD SUCCESSFUL`.

7. Run the complete iOS simulator test task:

       ./gradlew :composeApp:iosSimulatorArm64Test --console=plain

   Expected result: `BUILD SUCCESSFUL`.

8. Review the changed files with the repository code-review workflow. Resolve
   every finding. Update this plan with the result before committing the
   branch.

## Validation and Acceptance

The label test must return `One-Time Event` for `EventType.EVENT` and `Create`
for the One-Time Event final action. The League and Tournament paths must keep
their schedule-building labels.

The mapper test must serialize the full command. The command must preserve
the current basics, participation, registration, resource, staff, tag, image,
question, document, and schedule values. A One-Time Event command must not gain
league or playoff defaults.

The component failure test must show that a failed remote request clears
loading, preserves every visible value, writes no accepted event, and reuses
the exact command and operation ID for an unchanged retry. A changed command
must receive a new operation ID.

The repository success test must observe the accepted event, user and team
relations, fields, and schedule matches before `createEventEditor` returns.
The repository must invoke one transaction for that projection. The remote
failure test must observe no accepted Room rows.

The cross-platform mapper test must compare the complete serialized Android
and iOS fixture commands. It must pass on the common test target used by both
platforms.

The focused Android and iOS tasks and the full Android and iOS tasks must all
report `BUILD SUCCESSFUL`.

## Idempotence and Recovery

The edits are safe to rerun. Test commands only rebuild outputs and replace
test reports. They do not change production data.

If the Android task reports `SDK location not found`, set
`ANDROID_HOME` and `ANDROID_SDK_ROOT` to the installed SDK directory and rerun
the same command. If a focused test fails, fix the public seam and rerun that
focused test before the full suite.

Do not reset or delete unrelated worktree changes. Do not change the backend
contract for this mobile-only work.

## Artifacts and Notes

The shared label helper is in
`apps/mobile/core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/enums/EventType.kt`.
The creation labels are in
`apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventScreen.kt`.

The accepted-result Room boundary is in
`apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`.
The transaction seam is in
`apps/mobile/core/database/src/commonMain/kotlin/com/razumly/mvp/core/data/DatabaseService.kt`
and
`apps/mobile/core/database/src/commonMain/kotlin/com/razumly/mvp/core/db/MVPDatabaseService.kt`.

Verification evidence from 2026-08-18:

    ./gradlew :composeApp:testDebugUnitTest ...  -> BUILD SUCCESSFUL
    ./gradlew :composeApp:test ...                -> BUILD SUCCESSFUL
    ./gradlew :composeApp:iosSimulatorArm64Test ... -> BUILD SUCCESSFUL

The Android commands used the local SDK variables documented in
`Concrete Steps`.

## Interfaces and Dependencies

Keep `CreateEventComponent.createEvent()` as the entry point for validation
and submission.

Keep `IEventRepository.createEventEditor(command: EventEditorCreateCommandDto): Result<EventEditorSaveOutcome>`
as the repository contract. It returns only after accepted data is cached.

Keep `EventEditorSessionMapper.toCreateCommand(session, mutation)` as the
canonical command mapper.

Add this common database seam:

    suspend fun <R> withTransaction(block: suspend () -> R): R

The production implementation must use the Room writer connection and an
immediate transaction. Test adapters may execute the block directly because
they do not own a Room connection.

Use the existing Kotlin serialization, Room 2.8.4, Kotlin Coroutines, and
Gradle targets. Do not add a new library or change the backend HTTP contract.

Revision note: updated on 2026-08-18 after implementation and two-axis review.
The revision records the transaction boundary, shared match conversion,
cross-platform fixture proof, exact commands, SDK recovery, and passing test
evidence.
