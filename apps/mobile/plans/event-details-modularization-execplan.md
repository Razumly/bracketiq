# EventDetails Read/Edit Modularization

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. It is self-contained for a contributor who has only the current working tree and this plan.

## Purpose / Big Picture

The event details screen is currently implemented mostly inside `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`, which is more than seven thousand lines long. The screen contains two different user experiences: a read-only event detail view and an edit/create event form. Those modes currently share one large composable and many branches controlled by `editView`, making future work risky.

After this refactor, the app should behave the same, but the code will be organized so read-only UI, edit UI, shared UI, and pure validation/formatting logic are separate. This prepares a later change where read-only and edit mode can each be backed by its own view model without rewriting the UI again. The observable outcome is that existing event details and event creation screens compile, tests pass, the Android debug build installs, and emulator QA can log in and open event details without crashes.

## Progress

- [x] (2026-04-18) Created this ExecPlan before implementation.
- [x] (2026-04-18) Run focused baseline tests for match rules, schedule locking, league slot validation, and division editor helpers.
- [x] (2026-04-18) Extract pure logic into separate root-package files while preserving tested package-level signatures.
- [x] (2026-04-18) Extract shared UI primitives and section chrome.
- [x] (2026-04-18) Add read-only/edit UI model and action container contracts.
- [x] (2026-04-18) Extract read-only sections so they do not receive edit mutation callbacks.
- [x] (2026-04-18) Extract edit/domain helpers for required documents, editable division cards, and staff cards so they do not contain read-only fallback branches controlled by `editView`.
- [ ] Thin `EventDetails.kt` further toward orchestration only.
- [x] (2026-04-18) Run focused regression tests after extraction.
- [ ] Run the full requested Gradle test suite. Android debug/release unit tests and Android JVM aggregation passed; `allTests` is blocked locally by missing macOS `xcrun`.
- [x] (2026-04-18) Run Android debug build/install and emulator QA using the `test-android-apps` workflow.

## Surprises & Discoveries

- `.\gradlew :composeApp:allTests` invokes `:composeApp:bootIOSSimulator` and fails on this Windows host because `xcrun` is unavailable. This must be rerun on macOS or CI with iOS simulator tooling.
- Android QA hit a transient emulator/System UI ANR after an emulator restart. The app process stayed alive, crash logcat was empty, and relaunching the activity resumed normal UI rendering.
- The searched `test` event detail screens opened and rendered read-only content, but their options menus did not expose `Edit`; each visible result tested showed organization/admin actions such as `Create Template`, `Notify Players`, and `Delete`. The create-event tab did render the edit/create `EventDetails(...)` surface without crashing.

## Decision Log

- Decision: Introduce internal read-only and edit UI model/action contracts now, but do not implement real view-model classes in this refactor.
  Rationale: The user wants the eventual shape to support two view models later while keeping this task behavior-preserving and bounded.
  Date/Author: 2026-04-18 / Codex

- Decision: Keep the public `EventDetails(...)` signature stable.
  Rationale: Existing call sites in event creation and event detail screens should compile without a public API migration.
  Date/Author: 2026-04-18 / Codex

- Decision: Preserve root package helper signatures used by other code and tests, including `resolveEventMatchRules`, `computeLeagueSlotErrors`, `isScheduleEditingLocked`, `DivisionEditorState`, and `defaultDivisionEditorState`.
  Rationale: `matchDetail` and existing common tests import these symbols directly.
  Date/Author: 2026-04-18 / Codex

## Outcomes & Retrospective

The refactor now separates pure rules/validation, shared UI primitives, read-only helpers, edit helpers, division list UI, required documents UI, and staff card UI from the original event-details file while keeping the public `EventDetails(...)` entrypoint stable. Internal read-only/edit UI model and action contracts exist for a later real view-model split.

`EventDetails.kt` is much smaller than the original file, but it is not yet purely orchestration-only. More section extraction remains worthwhile before treating this area as fully modularized.

Focused regression tests, debug unit tests, release unit tests, Android JVM aggregate tests, debug assembly, debug install, login QA, read-only event detail QA, and create/edit form smoke QA were completed. The only requested verification not completed locally is `:composeApp:allTests`, blocked by missing macOS/iOS simulator tooling on Windows.

## Context and Orientation

This Kotlin Multiplatform app lives under `composeApp/`. Shared Compose UI is under `composeApp/src/commonMain/kotlin/com/razumly/mvp/`. The event details feature lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/`.

`EventDetails.kt` currently contains the public `EventDetails(...)` composable, local edit state, validation state, derived display values, section rendering, dialogs, image picker integration, staff UI helpers, division editor helpers, schedule validation helpers, and match-rule resolution helpers.

The approved target package shape under `com.razumly.mvp.eventDetail` is:

- `readonly`: read-only sections and read-only content only.
- `edit`: edit sections and edit content only.
- `shared`: shared section chrome, detail rows, background image, required documents, and simple shared controls.
- `division`: division editor state, division editor form/list rendering, and division normalization helpers.
- `staff`: staff editor, invite UI, staff cards, and staff display model builders.

The existing `composables` package remains for reusable low-level widgets such as league schedule fields, inputs, match cards, and image selection. Do not move those unless a compile dependency requires a narrow adjustment.

A "UI model" in this plan means an immutable Kotlin data class that contains the values a composable needs to draw. An "action container" means a data class containing callbacks such as `onEditEvent` or `onMessageUser`. These are not Decompose components, repositories, or lifecycle view models.

## Plan of Work

First, run the existing focused tests to record whether the current checkout is green. Then extract pure logic from `EventDetails.kt` into new root-package files so existing imports keep working. Move match-rule resolution into `EventMatchRules.kt`, schedule locking and slot validation into `EventScheduleRules.kt`, and event/payment-plan validation into `EventDetailsValidation.kt`.

Next, extract shared UI primitives into `shared` files. The shared section builder should accept a single content slot. Read-only and edit sections will call it independently rather than using one dual-slot `animatedCardSection(viewContent, editContent)` function.

Then add internal UI model/action contracts. Build these models inside `EventDetails(...)` from existing remembered state and derived values. At this stage no real view-model class should be introduced.

After the contracts exist, extract read-only sections into `readonly` files. Read-only components may receive read-only actions for host/social navigation, but must not receive edit mutation callbacks or mutable edit state.

Finally, extract edit sections into `edit`, with division-heavy code in `division` and staff-heavy code in `staff`. Edit components should receive edit models/actions and should not contain read-only fallback rendering branches controlled by `editView`.

Keep changes behavior-preserving. If a behavior bug is discovered but does not block compilation, tests, or emulator launch, document it here and leave it for a separate change.

## Concrete Steps

Run commands from `C:\Users\samue\StudioProjects\mvp-app` in PowerShell.

Baseline focused tests:

    .\gradlew :composeApp:testDebugUnitTest --tests "*EventDetailsMatchRulesTest*"
    .\gradlew :composeApp:testDebugUnitTest --tests "*EventDetailsScheduleLockingTest*"
    .\gradlew :composeApp:testDebugUnitTest --tests "*LeagueSlotValidationTest*"
    .\gradlew :composeApp:testDebugUnitTest --tests "*EventDetailsDivisionEditorHelpersTest*"

Final Gradle verification:

    .\gradlew :composeApp:testDebugUnitTest
    .\gradlew :composeApp:testReleaseUnitTest
    .\gradlew :composeApp:test
    .\gradlew :composeApp:allTests
    .\gradlew :composeApp:assembleDebug
    .\gradlew :composeApp:installDebug

Android emulator QA uses the `test-android-apps` skill. Select a connected emulator with `adb devices`, install the debug build, launch package `com.razumly.mvp` and activity `com.razumly.mvp.MainActivity`, drive login through UI-tree-derived coordinates, and use the provided test account only for QA. Capture a screenshot and logcat path as evidence.

## Validation and Acceptance

Acceptance requires:

- Existing event creation and event detail call sites compile without changing the public `EventDetails(...)` signature.
- Read-only components are structurally isolated from edit mutation callbacks.
- Edit components are structurally isolated from read-only rendering branches controlled by `editView`.
- Existing match rules, schedule locking, league slot validation, and division editor helper tests pass.
- The full requested Gradle test commands pass, including `:composeApp:allTests` in an environment capable of all KMP targets.
- Android debug build installs and launches in an emulator.
- Emulator QA confirms login succeeds and event details do not crash in read-only or edit mode.
- No backend endpoint, payload, Room schema, or `mvp-site` contract changes are made.

## Idempotence and Recovery

This refactor should be additive-first. If extraction causes compile errors, keep the moved symbols in the same package and adjust imports rather than changing behavior. If a generated build artifact is created by tests or Android builds, it can be ignored. Do not use destructive git commands; if a file move goes wrong, inspect `git diff` and repair with focused edits.

If `:composeApp:allTests` fails only because iOS simulator tooling is unavailable on Windows, record the exact failure in this plan and rerun on macOS or CI before accepting completion.

## Artifacts and Notes

Important command outputs and emulator QA evidence will be recorded here as work proceeds.

Baseline focused tests passed:

    .\gradlew :composeApp:testDebugUnitTest --tests "*EventDetailsMatchRulesTest*" --tests "*EventDetailsScheduleLockingTest*" --tests "*LeagueSlotValidationTest*" --tests "*EventDetailsDivisionEditorHelpersTest*"
    Exit code: 0

Focused tests after pure logic extraction passed:

    .\gradlew :composeApp:testDebugUnitTest --tests "*EventDetailsMatchRulesTest*" --tests "*EventDetailsScheduleLockingTest*" --tests "*LeagueSlotValidationTest*" --tests "*EventDetailsDivisionEditorHelpersTest*"
    Exit code: 0

Focused tests after shared UI primitive extraction passed:

    .\gradlew :composeApp:testDebugUnitTest --tests "*EventDetailsMatchRulesTest*" --tests "*EventDetailsScheduleLockingTest*" --tests "*LeagueSlotValidationTest*" --tests "*EventDetailsDivisionEditorHelpersTest*"
    Exit code: 0

Focused tests after adding read-only/edit UI model contracts passed:

    .\gradlew :composeApp:testDebugUnitTest --tests "*EventDetailsMatchRulesTest*" --tests "*EventDetailsScheduleLockingTest*" --tests "*LeagueSlotValidationTest*" --tests "*EventDetailsDivisionEditorHelpersTest*"
    Exit code: 0

Focused tests after read-only helper extraction passed:

    .\gradlew :composeApp:testDebugUnitTest --tests "*EventDetailsMatchRulesTest*" --tests "*EventDetailsScheduleLockingTest*" --tests "*LeagueSlotValidationTest*" --tests "*EventDetailsDivisionEditorHelpersTest*"
    Exit code: 0

Focused tests after staff, required-documents, division-list, and read-only file-split extraction passed:

    .\gradlew :composeApp:testDebugUnitTest --tests "*EventDetailsMatchRulesTest*" --tests "*EventDetailsScheduleLockingTest*" --tests "*LeagueSlotValidationTest*" --tests "*EventDetailsDivisionEditorHelpersTest*"
    Exit code: 0

Full debug unit suite passed:

    .\gradlew :composeApp:testDebugUnitTest
    Exit code: 0
    Notes: Windows host disabled iOS Kotlin/Native targets that require GoogleSignIn cinterop; Gradle also reported adb reverse could not be configured because no device/emulator was connected at test time. These warnings did not fail the Android debug unit suite.

Full release unit suite passed:

    .\gradlew :composeApp:testReleaseUnitTest
    Exit code: 0
    Notes: Windows host disabled iOS Kotlin/Native targets that require GoogleSignIn cinterop. Kotlin compile produced pre-existing warning categories such as deprecated APIs and unnecessary safe calls/non-null assertions; no warnings failed the build.

Aggregated Android JVM test task passed:

    .\gradlew :composeApp:test
    Exit code: 0
    Notes: Windows host disabled iOS Kotlin/Native targets that require GoogleSignIn cinterop; Gradle also reported adb reverse could not be configured because no device/emulator was connected at test time. These warnings did not fail the Android JVM test aggregation.

Multiplatform all-tests task did not complete on this Windows host:

    .\gradlew :composeApp:allTests
    Exit code: 1
    Failure: task `:composeApp:bootIOSSimulator` failed with `A problem occurred starting process 'command 'xcrun''`.
    Required follow-up: rerun `.\gradlew :composeApp:allTests` on macOS or CI with iOS simulator tooling before marking this acceptance item complete.

Android debug build passed:

    .\gradlew :composeApp:assembleDebug
    Exit code: 0
    Notes: Windows host disabled iOS Kotlin/Native targets that require GoogleSignIn cinterop; Gradle also reported adb reverse could not be configured because no device/emulator was connected at build time. These warnings did not fail the Android debug build.

Android debug install passed:

    .\gradlew :composeApp:installDebug
    Exit code: 0
    Device: `emulator-5554`, AVD `Pixel_9_Pro_XL_API_35`
    Notes: Gradle configured adb reverse for `tcp:3000` and `tcp:3010`, then installed `composeApp-debug.apk`.

Android emulator QA evidence:

    Device: `emulator-5554`, AVD `Pixel_9_Pro_XL_API_35`
    Package/activity launched: `com.razumly.mvp/.MainActivity`
    Login result: authenticated Discover screen reached.
    Read-only event detail result: opened `Weekly  event test` and `Summit Indoor Volleyball Facility Rental Event test2`; both rendered event details and action menus without app crash.
    Edit-mode reachability: searched for `test` and checked visible results; no tested event options menu exposed `Edit`. Opened the Create tab as an edit/create `EventDetails(...)` smoke test; it rendered without crash.
    Screenshots/UI dumps/logcat: `build/qa/event-details-modularization/`
    Key evidence files: `15-authenticated-events.png`, `16-event-detail.png`, `20-create-tab.png`, `21-search-test-results.png`, `22-first-test-event-detail.png`, `23-first-test-options.png`, `logcat-redacted.txt`

## Interfaces and Dependencies

At the end of this refactor, these internal contracts should exist under `com.razumly.mvp.eventDetail`:

    internal enum class EventDetailsMode { READ_ONLY, EDIT }

    internal data class EventDetailsReadOnlyUiModel(...)
    internal data class EventDetailsEditUiModel(...)
    internal data class EventDetailsReadOnlyActions(...)
    internal data class EventDetailsEditActions(...)

The exact fields should mirror the extracted section needs and should not introduce new backend or persistence dependencies. Keep callback behavior routed through the existing `EventDetails(...)` parameters.
