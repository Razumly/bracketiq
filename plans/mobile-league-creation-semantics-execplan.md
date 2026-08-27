# Complete Mobile League Creation Semantics

This ExecPlan is a living document. Maintain it under the rules in `PLANS.md`. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current.

## Purpose / Big Picture

A mobile organizer must be able to create a League on Android and iOS with the same meaning as the web editor. The organizer can choose automated scheduling, choose a fixed planned end or a generated end, enter league and division settings, and submit the values that are visible at the time of submission. A failed request must leave the form unchanged. An unchanged retry must reuse the same create identity.

The result is visible in the shared Compose Event Editor and in the mobile-to-site integration tests. A scheduled League sends `CREATE_AND_BUILD_SCHEDULE`; an unscheduled League sends `CREATE_ONLY` with a fixed planned end.

## Progress

- [x] (2026-08-26) Inspect Issue #32, its closed prerequisites, the mobile editor, and the existing contract tests.
- [x] (2026-08-26) Add the Advanced Setup Automated Scheduling control before League schedule fields.
- [x] (2026-08-26) Hide the generated-end policy control when League Automated Scheduling is off and clear that policy on toggle-off.
- [x] (2026-08-26) Add or correct all remaining scheduling-off state transitions.
- [x] (2026-08-26) Prove League values survive the mobile-to-site command round trip.
- [x] (2026-08-26) Prove current snapshot and unchanged retry identity behavior.
- [x] (2026-08-26) Run focused mobile tests and targeted Android/iOS compilation.
- [x] (2026-08-26) Run the full mobile suite. Android `:composeApp:testDebugUnitTest` and iOS `:composeApp:iosSimulatorArm64Test` both passed.
- [x] (2026-08-26) Fix the current-snapshot regression test to start from a scheduled League and prove a scheduled-to-unscheduled mutation selects `CREATE_ONLY` with a fixed end. Focused mapper test passed in `:core:repository-impl:testDebugUnitTest`.
- [ ] Complete the review, fix every finding, and record final status.

## Surprises & Discoveries

- The Simple Setup already exposed `Automated Scheduling` before the generated-end and playoff options in `SimpleEventDetailsOptionsSection.kt`.
- Advanced Setup did not expose that control. The shared schedule section is the correct advanced insertion point because `EventDetailsSimpleSectionDispatch.kt` routes Simple Setup to a separate renderer.
- The existing simple callback already clears `noFixedEndDateTime` when scheduling is disabled. The new advanced callback uses the same rule.
- The mobile Android unit test task completed successfully after the first control edit: `:composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.CreateEventSelectionRulesTest'`.

## Decision Log

- Decision: Keep the existing contract version and DTO shape.
  Rationale: Issue #31 established the Event Editor command seam, and the current mobile DTO already carries League scheduling, competition, resources, registration, and staffing fields.
  Date/Author: 2026-08-26 / Codex.

- Decision: Put the Advanced Setup scheduling toggle in `EventDetailsScheduleSections.kt` and keep the Simple Setup toggle in its existing options section.
  Rationale: The two modes use different section renderers. This preserves the existing Simple Setup order and makes the Advanced Setup control the first schedule control.
  Date/Author: 2026-08-26 / Codex.

- Decision: Disable generated-end selection when automated scheduling is off and preserve the fixed end value.
  Rationale: An unscheduled League needs a planned end. Only the schedule-construction policy is removed.
  Date/Author: 2026-08-26 / Codex.

The shared Compose editor now exposes the League Automated Scheduling control in Advanced Setup, keeps Simple Setup behavior, and removes generated-end state when scheduling is disabled. The mapper and create component retain the current-snapshot and retry contract. Focused Android tests, targeted Android/iOS compilation, the full Android unit suite, and the full iOS simulator suite pass. Review findings remain open until the final review and focused re-checks complete.

## Context and Orientation

The repository root contains the product context and this plan. `apps/mobile/composeApp` is the Kotlin Multiplatform application. Shared Compose UI and state live under `src/commonMain`; Android unit tests live under `src/commonTest`, and mobile-to-site tests live under `src/androidUnitTest`.

The mobile Event Editor stores the visible draft in `Event`. `DefaultCreateEventComponent` owns create state and submission. `EventDetails` renders the same editor for Simple and Advanced Setup. `EventEditorSessionMapper` converts the current editor snapshot into the canonical `EventEditorCreateCommandDto`. The DTOs in `apps/mobile/core/network` define the JSON accepted by the site API. Room persistence occurs after accepted create results through the repository.

`isAutomatedScheduling` selects whether the server builds matches during create. `noFixedEndDateTime` selects the generated end policy. A fixed planned end is required when automated scheduling is off. `CREATE_ONLY` creates the event without building a schedule. `CREATE_AND_BUILD_SCHEDULE` creates the event and builds the schedule atomically.

## Context Boundary

Start with Issue #32, this plan, the mobile-specific guidance, and the mobile Event Editor files and tests named below. Read the relevant `CONTEXT.md` entries for Event Configuration, Automated Scheduling, End Policy, League, Division, Resource, Time Slot, Registration, and Officiating Plan.

Read `apps/site/src/contracts/eventEditor.ts` and the exact web fixture only when the command shape or canonical output changes. Read a named ADR only when the implementation changes the invariant it governs.

Expand context only when one of these sources leaves a required contract unresolved. Parent Issue #14, closed Issues #25 and #31, unrelated site guidance, and historical plans are not part of the default context.

## Plan of Work

First, keep the scheduling controls aligned between Simple and Advanced Setup. The Simple renderer must show the toggle before generated-end and playoff choices. The Advanced renderer must show it before the League schedule fields. Toggling off must clear only schedule-construction state, including the generated-end policy, while retaining location, resources, registration, staffing, and competition values that remain meaningful.

Next, verify the state transition at the source. `EventDetails` callbacks and create selection normalization must produce a fixed-end draft when scheduling is off. Validation must require a valid planned end for an unscheduled League and must allow the generated-end policy only for an automated League. The completion mode must derive from the same current snapshot used for the command.

Then, verify the canonical command and retry identity. Build fixtures with League structure, division details, playoffs, timing, resources, time slots, registration, staffing, and both scheduling modes. Assert that the first request contains immediate edits. Assert that a failed request keeps the visible draft and writes no partial Room state. Assert that an unchanged retry uses the original create operation ID and that an applicable edit uses a new ID.

Finally, run the focused tests, the mobile typecheck and full test suites, and the repository review checks. Update this plan with evidence and record any remaining gap instead of masking it.

## Concrete Steps

Run mobile commands from `apps/mobile`.

    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.CreateEventSelectionRulesTest'

Run the focused League component and mapper tests after adding or changing them.

    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.DefaultCreateEventComponentTest'
    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ./gradlew :core:repository-impl:testDebugUnitTest --tests 'com.razumly.mvp.core.data.repositories.EventEditorSessionMapperTest'

Run the full mobile checks after focused tests pass.

    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:testDebugUnitTest
    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:iosSimulatorArm64Test

Expected results are `BUILD SUCCESSFUL` and no failed tests. A failed network request fixture must show the original state and an empty accepted Room result.

## Validation and Acceptance

A League with automated scheduling enabled must render the toggle in both modes, default it to enabled for a new League, and allow the generated-end policy. Its create command must use `CREATE_AND_BUILD_SCHEDULE` and preserve the competition, resource, registration, staffing, and timing fields.

A League with automated scheduling disabled must hide the generated-end control, retain the planned end, and create with `CREATE_ONLY`. The command must not use a generated end policy. Turning the toggle off must not erase location, resources, divisions, playoffs, registration, or staffing values.

An immediate edit before submission must appear in the first command. A failed create must close loading, preserve the visible state, and leave no accepted Room state. An unchanged retry must retain the create operation ID. A meaningful edit must produce a new operation ID. Android and iOS command fixtures must encode the same canonical JSON as the web fixture.

## Idempotence and Recovery

All edits are safe to repeat because they update existing Compose state and DTO mappings. Do not change the contract version unless the site contract changes. If a test fails because of a transient Kotlin or emulator process error, rerun the same focused command once and record the result. Do not delete Room data or alter production state.

## Artifacts and Notes

The first implementation slice changes `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailsScheduleSections.kt`, `EventDetails.kt`, and `EventDetailsBasicInfoSection.kt`. The focused Android test passed after these edits.

## Interfaces and Dependencies

The Advanced schedule action model in `EventDetailsScheduleSections.kt` includes:

    val onAutomatedSchedulingChange: (Boolean) -> Unit

The callback updates the current `Event` through `EventDetails` and sets `noFixedEndDateTime` to `false` when scheduling is disabled. The existing Simple Setup callback follows the same rule.

The canonical network seam remains `EventEditorCreateCommandDto` with `EventEditorCreateCompletionMode.CREATE_ONLY` and `CREATE_AND_BUILD_SCHEDULE`. `EventEditorSessionMapper` remains the single source for command identity and current snapshot projection. No server TypeScript, Prisma, or mobile Room entity import is permitted.

Plan update note (2026-08-26): Added the first implementation milestone after the user requested narrow, executable slices instead of broad repository reading. Recorded the existing Simple Setup behavior and the missing Advanced Setup control.

Plan update note (2026-08-26): The full mobile suite passed. Android `:composeApp:testDebugUnitTest` completed in 24 seconds, and iOS `:composeApp:iosSimulatorArm64Test` completed in 86 seconds.

Plan update note (2026-08-26): The scheduled-to-unscheduled mapper test now changes only the current canonical event from automated to fixed-end scheduling. The first attempted `:composeApp:testDebugUnitTest --tests ...EventEditorSessionMapperTest` command found no matching test because the mapper test belongs to `:core:repository-impl`; the module-specific command passed.

## Review

Review fixed point: the current `HEAD` with the Issue 32 working tree diff on 2026-08-26.

| Section | Changed paths | Standards | Spec | Finding IDs |
| --- | --- | --- | --- | --- |
| S01 | `eventCreate/CreateEventSelectionRules.kt`, `eventCreate/DefaultCreateEventComponent.kt`, and create tests | findings recorded | pending | S01-ST-001, S01-ST-002, S01-ST-003 |
| S02 | `eventDetail/EventDetails*.kt`, `eventDetail/EventScheduleRules.kt`, and simple setup files | findings recorded | pending | S02-ST-001, S02-ST-002 |
| S03 | `eventDetail/EventEditDraftCoordinator.kt` and its test | findings recorded | pending | S03-ST-001 |
| S04 | `core/repository-impl/.../EventEditorSessionMapperTest.kt` and `core/model/.../Event.kt` | verified | pending | — |

### Finding register

- `S01-ST-001` — Share the computed scheduling normalization across event-type branches. Priority P3. Status: open.
- `S01-ST-002` — Centralize hidden schedule-slot normalization for bootstrap and transition paths. Priority P3. Status: open.
- `S01-ST-003` — Use shared predicates for automated competition types and managed slots. Priority P3. Status: open.
- `S02-ST-001` — Share schedule-construction visibility wiring across Simple and Advanced Setup. Priority P3. Status: open.
- `S02-ST-002` — Add visual snapshot coverage for enabled, disabled, and locked schedule states. Priority P3. Status: open.
- `S03-SP-001` — Preserve `noFixedEndDateTime` when a locked automation toggle is rejected. Priority P2. Status: open.
- `S04-SP-001` — Round-trip the complete League draft through command serialization and decoding. Priority P1. Status: open.
- `S04-SP-002` — Compare one shared League fixture with web canonical output and Match Demand. Priority P1. Status: open.
- `S04-SP-003` — Derive completion mode from a current scheduled-to-unscheduled snapshot edit. Priority P1. Status: open.
- `S03-ST-001` — Centralize schedule-construction cleanup across create and edit flows. Priority P3. Status: open.