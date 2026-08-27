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
- [x] (2026-08-26) Resolve S01 standards findings. Shared scheduling normalization and atomic type-transition slot handling are present; the focused selection and Tryout transition tests pass. S01-ST-003 was rejected as not independently actionable.
- [x] (2026-08-26) Prove the scheduled-to-unscheduled current-value transition. The mapper test starts from automated scheduling, changes only the submitted snapshot, and asserts `CREATE_ONLY` with a fixed end.
- [x] (2026-08-27) Complete the standards and spec re-review. Fix the final fixture-ownership finding and re-run its focused checks.
- [x] (2026-08-27) Resolve the reopened S04-SP-002 parity finding. The shared non-default League draft now has a complete web command and Match Demand golden. Web and Android tests consume the same golden.
- [x] (2026-08-27) Run the final focused, full mobile, and full site verification checks.

- [x] (2026-08-26) Resolve the post-review phase-placeholder retry finding. Identical claims preserve the existing phase division and the focused membership suite asserts returned, stored, and registration identity.
- [x] (2026-08-26) Resolve the public-detail bootstrap finding. Non-manager detail decoding accepts the ownerless site projection, persists returned metadata to Room, and keeps managed decoding strict.
- [x] (2026-08-26) Complete the post-review standards and spec re-review. Mapper, fixture, server retry, and public-detail findings returned correct with no open findings.
- [x] (2026-08-26) Run the final focused, full mobile, and client-to-site checks. Android unit tests, iOS simulator tests, site tests, the membership suite, and the isolated mobile-to-site League integration passed.

## Surprises & Discoveries

- The Simple Setup already exposed `Automated Scheduling` before the generated-end and playoff options in `SimpleEventDetailsOptionsSection.kt`.
- Advanced Setup did not expose that control. The shared schedule section is the correct advanced insertion point because `EventDetailsSimpleSectionDispatch.kt` routes Simple Setup to a separate renderer.
- The existing simple callback already clears `noFixedEndDateTime` when scheduling is disabled. The new advanced callback uses the same rule.
- The mobile Android unit test task completed successfully after the first control edit: `:composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.CreateEventSelectionRulesTest'`.
- The public site event-detail projection omits `hostId` and `affiliateUrl` for non-manager callers. The mobile detail decoder must relax only the ownership check for `manage=false`; strict collection and managed paths must remain unchanged.

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

The shared Compose editor now exposes the League Automated Scheduling control in Advanced Setup, keeps Simple Setup behavior, and removes generated-end state when scheduling is disabled. The mapper and create component retain the current-snapshot and retry contract. Focused Android tests, targeted Android/iOS compilation, the full Android unit suite, the full iOS simulator suite, and the full site suite pass. Standards and spec review found no open findings.

- Decision: Store cross-application parity fixtures under `test-fixtures/event-editor`.
  Rationale: The site remains the web contract owner. Android tests consume the same neutral files without making the site test depend on an Android source set.
  Date/Author: 2026-08-27 / Codex.

- Decision: Bind public event ownership validation to the detail request mode.
  Rationale: A public detail event is valid without owner identity. Managed detail still needs owner identity. Passing `requireOwnerIdentity = manage` preserves this boundary without weakening shared event-field validation.
  Date/Author: 2026-08-26 / Codex.

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

Review fixed point: commit `57cfcbca245ef904f1639d79caf77369cfba4bac` with the Issue 32 working tree diff, reviewed on 2026-08-27.

Post-review fixed point: commit `4430921a7c4c61b2e4ed55264938825f30cfd6a9` with the Issue 32 correction diff, reviewed on 2026-08-26.


| Section | Changed paths | Standards | Spec | Finding IDs |
| --- | --- | --- | --- | --- |
| S01 | `eventCreate/CreateEventSelectionRules.kt`, `eventCreate/DefaultCreateEventComponent.kt`, and create tests | fixed; focused checks passed | verified; no open finding | S01-ST-001, S01-ST-002, S01-ST-003 |
| S02 | `eventDetail/EventDetails*.kt`, `eventDetail/EventScheduleRules.kt`, and simple setup files | fixed or rejected; focused checks passed | verified; no open finding | S02-ST-001, S02-ST-002 |
| S03 | `eventDetail/EventEditDraftCoordinator.kt` and its test | fixed; focused checks passed | fixed; focused check passed | S03-SP-001, S03-ST-001 |
| S04 | `core/repository-impl/.../EventEditorSessionMapperTest.kt`, `core/model/.../Event.kt`, and parity fixtures | fixed; focused checks passed | fixed; focused checks passed | S04-SP-001, S04-SP-002, S04-SP-003 |

### Finding register

- `S01-ST-001` — Share the computed scheduling normalization across event-type branches. Priority P3. Status: fixed; focused selection normalization test passed.
- `S01-ST-002` — Centralize hidden schedule-slot normalization for bootstrap and transition paths. Priority P3. Status: fixed; focused Tryout transition test passed.
- `S01-ST-003` — Use shared predicates for automated competition types and managed slots. Priority P3. Status: rejected; the review found no independent defect because the type sets govern distinct policies.
- `S02-ST-001` — Share schedule-construction visibility wiring across Simple and Advanced Setup. Priority P3. Status: fixed; final standards re-review passed.
- `S02-ST-002` — Add visual snapshot coverage for enabled, disabled, and locked schedule states. Priority P3. Status: rejected; interaction tests cover the bounded observable contract.
- `S03-SP-001` — Preserve `noFixedEndDateTime` when a locked automation toggle is rejected. Priority P2. Status: fixed; final spec re-review passed.
- `S04-SP-001` — Round-trip the complete League draft through the command wire shape. Priority P1. Status: fixed; final spec re-review passed.
- `S04-SP-002` — Compare the shared League command with the Match Demand oracle. Priority P1. Status: fixed; final spec re-review passed.
- `S04-SP-003` — Derive completion mode from a current scheduled-to-unscheduled snapshot edit. Priority P1. Status: fixed; final spec re-review passed.
- `S03-ST-001` — Centralize schedule-construction cleanup across create and edit flows. Priority P3. Status: fixed; final standards re-review passed.
- `Issue32-ST-001` — Keep the canonical parity fixture outside an Android-owned resource directory. Priority P2. Status: fixed; focused web and Android parity checks passed.
- `S04-ST-001` — Add a direct mapper assertion for the image projection. Priority P3. Status: fixed; focused mapper test passed.
- `S04-ST-002` — Use response-derived League divisions and retain participant detail coverage. Priority P2. Status: fixed; focused mobile-to-site integration passed.
- `S05-SP-001` — Preserve a phase placeholder division on an identical retry. Priority P1. Status: fixed; focused membership suite and final spec re-review passed.
- `S05-SP-002` — Decode ownerless public detail event metadata without weakening managed or collection validation. Priority P1. Status: fixed; focused repository test and final spec re-review passed.

Plan update note (2026-08-27): Recorded the completed S01 standards review. The working tree uses one computed automated-scheduling normalization and performs type-transition slot initialization inside the update coroutine after schedule cleanup. The focused tests passed.

Plan update note (2026-08-27): Reworked S04-SP-002 after re-review. The web parity test now parses a complete shared command golden, derives Match Demand from that canonical command, and compares the mobile mapper's serialized command with the same golden.

### Post-review re-review

The re-review found the mapper assertion, response-derived League division fixture, participant detail sync, phase retry preservation, and public detail decoder correct. The phase retry correction preserves the existing division in both the returned and stored event team. The public detail correction accepts the ownerless site projection only for `manage=false`. No findings remain open.

## Outcomes & Retrospective

The mobile League editor now matches the shared Event Editor contract for scheduling, end policy, competition, resources, registration, staffing, current-value submission, and retry identity. Automated scheduling defaults on for new League drafts. Disabling it retains meaningful event values and removes schedule-construction state.

The final parity fixture is neutral and consumed by the web and Android checks. The site test derives Match Demand from the canonical command. The Android test compares the complete serialized command with that same golden.

Focused checks passed:

- `:composeApp:testDebugUnitTest` selected League and editor regressions.
- `:core:repository-impl:testDebugUnitTest --tests ...EventEditorSessionMapperTest`
- `:core:repository-impl:testDebugUnitTest --tests ...EventEditorLeagueParityAndroidTest`
- `npm test -- --runInBand src/server/scheduler/__tests__/leagueEditorParity.test.ts`
- `npm test -- --runInBand src/server/teams/__tests__/teamMembership.test.ts` — 27 tests passed.
- `:composeApp:testDebugUnitTest --tests 'com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest.getEventDetailBootstrap_persists_detail_payload_and_management_cache'` — passed.

Full checks passed:

- `:composeApp:testDebugUnitTest`
- `:composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventDetail.LeaguePlayoffMobileApiIntegrationTest.league_playoff_mobile_api_flow_loads_staff_invites_periphery_join_and_schedule_data'` — passed against the isolated backend at `127.0.0.1:3010`.
- `:composeApp:iosSimulatorArm64Test`
- `npm test -- --runInBand` with 875 suites passed and 2 skipped.

The first mobile-to-site contract check against the existing backend on port 3000 failed with HTTP 400 `INVALID_EDITOR_COMMAND` because that backend rejected `hasScheduleProposalSupport`. The final selector against the compatible isolated backend on port 3010 passed. The Issue Tracker cross-application closure gate now has a passing client-to-site check.

Plan update note (2026-08-27): Final standards review fixed `Issue32-ST-001` by moving both parity fixtures to the neutral root fixture directory. The site and Android parity checks passed after the move.

Plan update note (2026-08-27): Final spec and standards re-reviews returned correct with no open findings. Full Android, iOS simulator, and site checks passed.

Plan update note (2026-08-26): The post-commit client-to-site check first failed against port 3000 because that backend rejected `hasScheduleProposalSupport`. The compatible isolated backend on port 3010 accepted the current mobile command after the retry and public-detail corrections.