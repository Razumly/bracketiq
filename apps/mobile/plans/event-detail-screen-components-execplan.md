# Modularize Event Detail Screen Sections and Section Components

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. It is self-contained for a contributor who has only the current working tree and this plan. Related ongoing plans are `plans/event-detail-component-decomposition-execplan.md`, which tracks the non-UI decomposition of `EventDetailComponent.kt`, and `plans/event-details-modularization-execplan.md`, which tracks the read/edit form in `EventDetails.kt`. This plan focuses on `EventDetailScreen.kt` and the section-level UI boundaries around it.

## Purpose / Big Picture

The event detail screen currently mixes several whole screen regions in one large file, `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`. This file owns tab navigation, division selectors, the overview/roster section, floating action docks, join and invite sheets, modal dialogs, standings, and the top-level route that collects state from `EventDetailComponent`. The user-visible behavior is already correct; the problem is that changing one region requires reading unrelated regions.

After this refactor, the app should behave the same, but a developer should be able to work on a large UI region in its own file. Passive UI regions should be implemented as presentational composables that receive explicit state and callbacks. Workflow-heavy regions should receive narrow state/action containers built from `EventDetailComponent`, and only later become true Decompose child components if they need their own lifecycle. The observable outcome is that event details, schedule, participants, standings, join/payment dialogs, and floating actions render as before, while `EventDetailScreen.kt` becomes a route/orchestration file rather than a warehouse of every component.

## Progress

- [x] (2026-06-23 23:35Z) Reviewed `PLANS.md`, current event detail file sizes, and the related existing ExecPlans before writing this plan.
- [x] (2026-06-23 23:35Z) Confirmed existing unfinished plan items: `event-detail-component-decomposition-execplan.md` still needs final component thinning validation, and `event-details-modularization-execplan.md` still needs further `EventDetails.kt` thinning plus full all-target validation where available.
- [x] (2026-06-23 23:35Z) Ran the baseline focused event-detail tests and common metadata compilation; both passed.
- [x] (2026-06-23 23:49Z) Extracted `EventDetailFloatingActions.kt` as one complete component family and validated it.
- [x] (2026-06-23 23:56Z) Extracted `EventDetailOverviewSections.kt` as one complete overview/roster component family and validated it.
- [x] (2026-06-24 00:02Z) Extracted `EventDetailTabNavigation.kt` as one complete navigation/division-selector component family.
- [x] (2026-06-24 00:02Z) Extracted `EventDetailSelectionModels.kt` for the shared tab/division option state and resolver helpers that were coupled to the selector.
- [x] (2026-06-24 00:10Z) Extracted `EventDetailJoinAndInviteSheets.kt` as one complete registration, join, invite, and registration-question UI family.
- [x] (2026-06-24 00:27Z) Extracted `EventDetailStandingsTab.kt` as one complete standings component family and validated it.
- [ ] Extract `EventDetailDialogs.kt` or `EventDetailDialogHost.kt` for remaining route-level modal rendering that is not naturally owned by another component family.
- [ ] Introduce section-level immutable state and action containers for the largest extracted regions, then update extracted composables to receive those containers instead of long raw parameter lists.
- [ ] Evaluate which section containers should become true child components and record the decision in this plan before creating any Decompose child component.
- [ ] Run focused event-detail regression tests, common metadata compilation, Android debug build/install, and emulator QA after the component extraction milestones.
- [ ] Update the related plans if this work closes or changes any of their remaining unchecked items.

## Surprises & Discoveries

- Observation: `EventDetailScreen.kt` is currently 7,135 lines, while `EventDetails.kt` is 5,481 lines and `EventDetailComponent.kt` is 4,337 lines in this checkout.
  Evidence: `wc -l composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`.

- Observation: There are two related unfinished ExecPlans that must not be forgotten while this plan runs.
  Evidence: `rg -n "\[ \]" plans/event-detail-component-decomposition-execplan.md plans/event-details-modularization-execplan.md` shows unchecked items for final `DefaultEventDetailComponent` thinning/validation and further `EventDetails.kt` thinning/all-target validation.

- Observation: Moving the floating action dock as a whole exposed one implicit icon dependency that had previously been satisfied by the large screen file import set.
  Evidence: `compileCommonMainKotlinMetadata` initially reported unresolved `Groups` in `EventDetailFloatingActions.kt`; adding the explicit `com.razumly.mvp.icons.Groups` import fixed the moved file without behavior changes.

- Observation: The weekly occurrence fullness helpers moved with the overview section but still need package visibility because the join sheet displays the same fullness labels.
  Evidence: `EventDetailScreen.kt` still calls `formatWeeklyOccurrenceFullness(...)` and `WeeklyOccurrenceSummary.isFull()` from the join options UI after `EventDetailOverviewSections.kt` owns their implementation.

- Observation: The tab selector extraction exposed a real mixed boundary: the route needs division resolver helpers in addition to visible tab composables.
  Evidence: `EventDetailScreen.kt` still builds bracket, schedule, standings, and participant division selections, so `EventDetailSelectionModels.kt` now owns `BracketDivisionOption`, `SelectedDivisionSelectorState`, resolver extensions, and the all-pools sentinel while `EventDetailTabNavigation.kt` owns the visible controls.

- Observation: The join and invite extraction spans multiple route areas but is still one cohesive UI family.
  Evidence: `EventDetailJoinAndInviteSheets.kt` now owns `JoinOptionsSheet`, invite dialogs, child selection, registration hold timer rendering, and registration question dialogs, while `EventDetailScreen.kt` still owns when those surfaces are shown and which component actions they invoke.

- Observation: The standings extraction was a clean presentational boundary around the existing standings presentation models.
  Evidence: `EventDetailStandingsTab.kt` owns the tab, row animation state, confirmation message, row/cell rendering, and timestamp formatting while `LeagueStandingsPresentation.kt` remains the source for `TeamStanding`, columns, and standings calculations.

## Decision Log

- Decision: Extract whole screen regions first, not individual helper functions.
  Rationale: The user explicitly wants large component chunks moved into files. Moving entire component families keeps ownership clear and avoids creating a pile of tiny helper files that still require reading the original screen.
  Date/Author: 2026-06-23 / Codex

- Decision: Keep passive UI regions as presentational composables that receive state and callbacks, not Decompose child components.
  Rationale: Floating action bars, tab navigation, overview display, and simple dialogs do not need lifecycle, repositories, or coroutine ownership. Creating child components for these would make the code look modular while coupling simple UI to the application architecture.
  Date/Author: 2026-06-23 / Codex

- Decision: Use section state/action containers before creating child components.
  Rationale: Immutable UI state data classes and callback containers preserve MVVM-style flow: the parent component owns state and behavior, while composables draw and emit events. If a section later needs independent lifecycle, the same state/action boundary can be promoted to a child component.
  Date/Author: 2026-06-23 / Codex

- Decision: Preserve the public `EventDetailComponent` interface and `DefaultEventDetailComponent` constructor during this plan.
  Rationale: The related component-decomposition plan already tracks component internals. This screen plan should not introduce a broad public component migration unless a later revision explains why it is necessary.
  Date/Author: 2026-06-23 / Codex

- Decision: Test after every code update and require passing relevant tests before marking progress complete.
  Rationale: Event detail covers event viewing, registration, payments, schedule, participants, standings, and match management. Component extraction can compile while changing parameter wiring or visibility behavior, so each milestone needs focused validation before the next extraction.
  Date/Author: 2026-06-23 / Codex

## Outcomes & Retrospective

No implementation has started under this plan. The desired end state is a smaller `EventDetailScreen.kt` that routes state and callbacks into extracted section components, plus a documented decision about which sections deserve true child components later. The related existing ExecPlans remain active until their unchecked items are completed or explicitly revised.

## Related Plan Tracking

`plans/event-detail-component-decomposition-execplan.md` is still active. Its remaining unchecked items are:

- Thin `DefaultEventDetailComponent` so it owns Decompose lifecycle, public state exposure, and delegation, while helpers own domain-specific transformations.
- Run focused event-detail regression tests and final compile/build validation.

This plan must not duplicate that internal component-thinning work. If section state/action containers reveal that a workflow-heavy section should become a true child component, update `plans/event-detail-component-decomposition-execplan.md` or add a follow-up item there before editing `DefaultEventDetailComponent`.

`plans/event-details-modularization-execplan.md` is still active. Its remaining unchecked items are:

- Thin `EventDetails.kt` further toward orchestration only.
- Run the full requested Gradle test suite; the old note says Android debug/release unit tests and Android JVM aggregation passed, while `allTests` was blocked locally by missing macOS `xcrun` on that earlier host.

This plan may create patterns that help `EventDetails.kt`, such as section state/action containers, but it must not silently claim completion of the EventDetails plan unless it actually changes and validates `EventDetails.kt`.

## Context and Orientation

This Kotlin Multiplatform app lives under `composeApp/`. Shared Compose UI is under `composeApp/src/commonMain/kotlin/com/razumly/mvp/`. The event detail feature lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/`.

`EventDetailComponent` is the parent Decompose component for the event detail route. A Decompose component is an object that owns lifecycle-aware state, actions, and dependencies for a screen or workflow. In this repository, `DefaultEventDetailComponent` is the concrete implementation in `EventDetailComponent.kt`.

`EventDetailScreen.kt` is a Compose route file. A route composable collects `StateFlow` values from the component, remembers local UI-only state such as which tab is selected, and renders composables. This plan keeps `EventDetailScreen(...)` as the route entrypoint but moves large UI regions into separate files.

A presentational composable is a function that draws UI from input values and calls callbacks when the user acts. It should not collect flows, talk to repositories, or own long-lived coroutine jobs. A state container in this plan is an immutable data class such as `EventDetailFloatingActionsState`. An action container is a data class of callbacks such as `EventDetailFloatingActionsActions`. These containers are not Decompose components; they are MVVM-friendly boundaries between parent state and child UI.

The important current source files are:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`: current 7,135-line route and many private UI components.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`: current 4,337-line parent component and public state/action interface.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`: current 5,481-line event read/edit form governed by a separate plan.

## Plan of Work

Begin with baseline validation. Run focused tests that cover event detail role visibility, weekly behavior, division options, overview capacity, standings presentation, invite dialogs, and the existing component coordinator suite likely to catch route wiring mistakes. Also run common metadata compilation. Record the result in `Artifacts and Notes`, including any known unrelated failures.

First extract the floating action family. Create `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailFloatingActions.kt`. Move `StickyActionBar`, `BracketFloatingBar`, `ParticipantsFloatingBar`, `ExpandableFloatingDock`, `FloatingDockMenuFab`, `FloatingDockActionsLayout`, `FloatingDockColumn`, `FloatingDockVerticalActions`, `FloatingDockCloseButton`, `ScrollableFloatingDockRow`, `DockEdgeFade`, `DockScrollIndicator`, `Modifier.floatingDockActionWidth`, and the floating dock constants. Make functions `internal` only where `EventDetailScreen.kt` calls them; keep subcomponents private. Do not alter labels, button ordering, animation timing, or visibility behavior. After moving, run `git diff --check`, the focused compile command, and a focused test command. Commit this as one extraction.

Next extract the overview and roster family. Create `EventDetailOverviewSections.kt`. Move `EventOverviewSections`, `CapacityStat`, `DivisionCapacityRow`, `SectionHeader`, `DetailTabLoadingState`, `TeamPreviewChip`, `FreeAgentPreview`, and directly coupled formatting helpers such as `overviewLoadingMessage`, `WeeklyOccurrenceSummary.isFull`, `formatWeeklyOccurrenceFullness`, `formatTeamsNeedingPlayersSummary`, and `formatMinutesTo12Hour` if they are not used elsewhere. Keep this as a complete section family. Validate with `EventOverviewCapacityTest`, route compile, and metadata compile.

Next extract tab navigation and division selection. Create `EventDetailTabNavigation.kt`. Move `DetailTab`, `EventDetailTabVisuals`, `EventDetailTabIconStyle`, `eventDetailTabVisuals`, `eventDetailTabIconStyle`, `EventDetailTabIcon`, `EventDetailTabButton`, `EventDetailTabStrip`, `EventDetailSelectedDivisionPill`, `EventDetailDivisionSelectorBar`, `SelectedDivisionPillState`, and `SelectedDivisionSelectorState`. Include only the selector UI and immediate selector state builders in this file. Keep pure division-option construction helpers in place until the next step unless compile imports make a single grouped move safer. Validate with `EventDetailDivisionOptionsTest`, `TournamentPoolPlayTest`, and compile.

Then extract the remaining pure division and weekly-session selection model if it still clutters `EventDetailScreen.kt`. Create `EventDetailSelectionModels.kt` only if the navigation extraction leaves a large non-visual helper block behind. Move `BracketDivisionOption`, `WeeklySessionOption`, playoff/pool division mapping helpers, weekly session option builders, and selected-division resolution helpers together. This is not passive UI, but it is route-level selection logic and should be tested by existing division and weekly behavior tests.

Next extract registration, join, and invite UI. Create `EventDetailJoinAndInviteSheets.kt`. Move `JoinOption`, `JoinOptionsSheet`, `EventTeamInviteDialog`, `EventPlayerInviteDialog`, `EventPlayerInviteMode`, `Team.inviteSubtitle`, `String.isValidInviteEmail`, `ChildJoinSelectionDialog`, `RegistrationHoldDialogTimer`, `EventRegistrationQuestionsDialog`, and `TeamJoinQuestionsDialog`. Keep these as UI-level sheets and dialogs that receive explicit state and callbacks. Do not move join execution logic; it belongs to `EventDetailComponent` and existing coordinators. Validate with `EventDetailInviteDialogUiTest`, `EventDetailMobileJoinFlowTest`, and compile.

Next extract standings. Create `EventDetailStandingsTab.kt`. Move `LeagueStandingsTab`, `LeagueStandingsHeader`, `LeagueStandingRow`, `StandingsValueCell`, `StandingsConfirmedMessage`, `LeagueStandingsRowAnimationState`, `standingsWaveDelay`, and `formatStandingsConfirmedAt`. This is a complete tab surface. Validate with `LeagueStandingsPresentationTest`, event detail role visibility tests, and compile.

Next extract modal dialog hosting. Create `EventDetailDialogs.kt` or `EventDetailDialogHost.kt`. Move `EventQrCodeDialog`, `TeamSelectionDialog` if it is not better left in the existing composables package, `WithdrawTargetDialog`, `WithdrawTargetMembership.displayName`, `TextSignatureDialog`, `RefundReasonDialog`, `FeeBreakdownDialog`, `PaymentPlanPreviewDialog`, `PaymentPlanInstallmentRow`, `FeeRow`, and payment-plan formatting helpers. If a future pass can create one `EventDetailDialogHost` composable that renders all route-level modals from a state container, do that only after the individual dialog functions are moved and tests pass.

After the UI regions are in files, introduce state/action containers for the largest extracted regions. Create `EventDetailScreenModels.kt`. Start with simple containers that mirror current values, for example `EventDetailFloatingActionsState`, `EventDetailFloatingActionsActions`, `EventDetailOverviewState`, `EventDetailOverviewActions`, `EventDetailJoinSheetsState`, `EventDetailJoinSheetsActions`, `EventDetailStandingsState`, and `EventDetailStandingsActions`. Build these inside `EventDetailScreen(...)` from existing collected state and local remembered state. This should reduce long parameter lists and make each UI file testable without passing the full `EventDetailComponent`.

Only after those containers are stable, evaluate true child components. Do not create child components for floating actions, tab navigation, or passive overview rendering. Consider child components only for workflow-heavy sections: registration/join/payment/signature, participants management, schedule/match editing, and standings confirmation. A child component should own state flows or lifecycle-aware jobs and should expose a narrow interface. If the decision is to create one, revise this plan and the component decomposition plan before implementation.

At every stopping point, update `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Artifacts and Notes`. Commit each complete extraction with focused tests passing.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-app`.

Before the first extraction, record current status and baseline:

    git status --short
    wc -l composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailScreenRoleVisibilityTest*" --tests "*EventDetailWeeklyBehaviorTest*" --tests "*EventDetailDivisionOptionsTest*" --tests "*EventOverviewCapacityTest*" --tests "*LeagueStandingsPresentationTest*" --tests "*EventDetailInviteDialogUiTest*" --console=plain
    ./gradlew :composeApp:compileCommonMainKotlinMetadata --console=plain

After each extraction, run:

    git diff --check
    ./gradlew :composeApp:compileCommonMainKotlinMetadata --console=plain

Also run focused tests for the touched area:

For floating actions:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailScreenRoleVisibilityTest*" --tests "*EventDetailWeeklyBehaviorTest*" --console=plain

For overview:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventOverviewCapacityTest*" --tests "*EventDetailWeeklyBehaviorTest*" --console=plain

For tab navigation and division selection:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailDivisionOptionsTest*" --tests "*TournamentPoolPlayTest*" --tests "*EventDetailWeeklyBehaviorTest*" --console=plain

For join and invite sheets:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailInviteDialogUiTest*" --tests "*EventDetailMobileJoinFlowTest*" --tests "*EventRegistrationFlowCoordinatorTest*" --console=plain

For standings:

    ./gradlew :composeApp:testDebugUnitTest --tests "*LeagueStandingsPresentationTest*" --tests "*EventLeagueStandingsCoordinatorTest*" --console=plain

For dialog hosting:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailMobileJoinFlowTest*" --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventPaymentPlanHelpersTest*" --tests "*EventPurchaseIntentCoordinatorTest*" --console=plain

At milestone boundaries, run broader validation:

    ./gradlew :composeApp:compileDebugKotlinAndroid --console=plain
    ./gradlew :composeApp:assembleDebug --console=plain

At the final milestone, install and smoke-test with an Android emulator using the `test-android-apps` workflow. Deep-link or navigate to an event detail screen, verify overview, participants, schedule, standings, floating actions, join/invite dialogs, and payment/fee dialogs still render. Capture screenshots and crash log output.

## Validation and Acceptance

Acceptance requires that the public behavior of event detail does not change. A user should still be able to open an event, view overview details, switch between participants, schedule, bracket, and standings where applicable, use the floating action dock, open join options, open invite dialogs, view QR/share options, and see payment/refund/signature dialogs exactly as before.

Code acceptance requires:

- `EventDetailScreen.kt` no longer contains the implementation bodies for the extracted component families.
- Extracted files own complete UI regions, not scattered tiny helper functions.
- Extracted composables do not collect `StateFlow` directly and do not receive the full `EventDetailComponent` unless explicitly justified in the `Decision Log`.
- Section state/action containers are introduced before any true child component extraction.
- The public `EventDetailComponent` interface remains source-compatible unless this plan is revised.
- `plans/event-detail-component-decomposition-execplan.md` and `plans/event-details-modularization-execplan.md` remain tracked; if this work completes one of their unchecked items, update that plan as part of the same milestone.
- Focused tests and compile commands listed in `Concrete Steps` pass after each update, or any blocker is documented with the exact command and failure.

The broader `:composeApp:testDebugUnitTest` suite should be run at the final milestone. If it still fails for pre-existing unrelated integration or UI-test reasons, record the failing tests here and make sure the focused event-detail tests and compile/build validations pass before committing the screen extraction work.

## Idempotence and Recovery

All extractions should be additive-first. Create the new file, move a whole component family, update visibility from `private` to `internal` only for functions called by `EventDetailScreen.kt`, then run compile. If imports fail, adjust imports rather than changing behavior. If a moved helper is also used by another file, leave it in the original file until it can be moved with its whole ownership group.

Do not use destructive git commands. The working tree may contain unrelated iOS lock/log changes; preserve them and stage only files touched by this plan. Commit each extraction as a scoped commit. If a milestone fails after multiple attempts, restore behavior by moving the component family back through normal edits, document the blocker in `Surprises & Discoveries`, and stop before continuing to the next extraction.

## Artifacts and Notes

Current file-size evidence before implementation:

    7135 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt
    5481 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt
    4337 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt

Current related-plan unchecked items:

    plans/event-details-modularization-execplan.md:22:- [ ] Thin `EventDetails.kt` further toward orchestration only.
    plans/event-details-modularization-execplan.md:24:- [ ] Run the full requested Gradle test suite. Android debug/release unit tests and Android JVM aggregation passed; `allTests` is blocked locally by missing macOS `xcrun`.
    plans/event-detail-component-decomposition-execplan.md:58:- [ ] Thin `DefaultEventDetailComponent` so it owns Decompose lifecycle, public state exposure, and delegation, while helpers own domain-specific transformations.
    plans/event-detail-component-decomposition-execplan.md:93:- [ ] Run focused event-detail regression tests and final compile/build validation.

Implementation evidence will be appended here after each milestone.

Baseline focused event-detail tests passed:

    PATH=/Users/elesesy/Library/Android/sdk/platform-tools:$PATH ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailScreenRoleVisibilityTest*" --tests "*EventDetailWeeklyBehaviorTest*" --tests "*EventDetailDivisionOptionsTest*" --tests "*EventOverviewCapacityTest*" --tests "*LeagueStandingsPresentationTest*" --tests "*EventDetailInviteDialogUiTest*" --console=plain
    Result: BUILD SUCCESSFUL in 23s
    Notes: `startLocalBackend` reported adb reverse could not be configured because no device/emulator was attached; the backend was already running and the tests passed.

Baseline common metadata compilation passed:

    PATH=/Users/elesesy/Library/Android/sdk/platform-tools:$PATH ./gradlew :composeApp:compileCommonMainKotlinMetadata --console=plain
    Result: BUILD SUCCESSFUL in 26s
    Notes: Existing warnings were reported in EventRepository, EventDetails, LeagueScheduleFields, ParticipantsVeiw, RentalSchedulingUtils, Profile screens, and RefundManagerScreen. These warnings did not fail the build.

Floating action extraction file-size evidence:

    6332 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt
     862 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailFloatingActions.kt
    7194 total

Floating action extraction validation passed:

    git diff --check -- composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailFloatingActions.kt plans/event-detail-screen-components-execplan.md
    Result: no whitespace errors

    PATH=/Users/elesesy/Library/Android/sdk/platform-tools:$PATH ./gradlew :composeApp:compileCommonMainKotlinMetadata --console=plain
    Result: BUILD SUCCESSFUL in 3s

    PATH=/Users/elesesy/Library/Android/sdk/platform-tools:$PATH ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailScreenRoleVisibilityTest*" --tests "*EventDetailWeeklyBehaviorTest*" --console=plain
    Result: BUILD SUCCESSFUL in 1m 28s
    Notes: Existing warnings were reported during Kotlin compilation. `startLocalBackend` again reported adb reverse could not be configured because no device/emulator was attached; the JVM tests passed.

Overview extraction file-size evidence:

    5738 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt
     644 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailOverviewSections.kt
    6382 total

Overview extraction validation passed:

    git diff --check -- composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailOverviewSections.kt plans/event-detail-screen-components-execplan.md
    Result: no whitespace errors

    PATH=/Users/elesesy/Library/Android/sdk/platform-tools:$PATH ./gradlew :composeApp:compileCommonMainKotlinMetadata --console=plain
    Result: BUILD SUCCESSFUL in 15s before import cleanup, then BUILD SUCCESSFUL in 16s after removing overview-only imports from `EventDetailScreen.kt`

    PATH=/Users/elesesy/Library/Android/sdk/platform-tools:$PATH ./gradlew :composeApp:testDebugUnitTest --tests "*EventOverviewCapacityTest*" --tests "*EventDetailWeeklyBehaviorTest*" --console=plain
    Result: BUILD SUCCESSFUL in 1m 35s
    Notes: Existing warnings were reported during Kotlin compilation. `startLocalBackend` again reported adb reverse could not be configured because no device/emulator was attached; the JVM tests passed.

Tab navigation and selection-model extraction file-size evidence:

    5318 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt
     354 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailTabNavigation.kt
     116 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailSelectionModels.kt
    5788 total

Tab navigation and selection-model extraction validation passed:

    git diff --check -- composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailTabNavigation.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailSelectionModels.kt plans/event-detail-screen-components-execplan.md
    Result: no whitespace errors

    PATH=/Users/elesesy/Library/Android/sdk/platform-tools:$PATH ./gradlew :composeApp:compileCommonMainKotlinMetadata --console=plain
    Result: BUILD SUCCESSFUL in 19s

    PATH=/Users/elesesy/Library/Android/sdk/platform-tools:$PATH ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailDivisionOptionsTest*" --tests "*TournamentPoolPlayTest*" --tests "*EventDetailWeeklyBehaviorTest*" --console=plain
    Result: BUILD SUCCESSFUL in 1m 38s
    Notes: Existing warnings were reported during Kotlin compilation. `startLocalBackend` again reported adb reverse could not be configured because no device/emulator was attached; the JVM tests passed.

Join and invite extraction file-size evidence:

    4470 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt
     895 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailJoinAndInviteSheets.kt
    5365 total

Join and invite extraction validation passed:

    git diff --check -- composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailJoinAndInviteSheets.kt plans/event-detail-screen-components-execplan.md
    Result: no whitespace errors

    PATH=/Users/elesesy/Library/Android/sdk/platform-tools:$PATH ./gradlew :composeApp:compileCommonMainKotlinMetadata --console=plain
    Result: BUILD SUCCESSFUL in 18s before import cleanup, then BUILD SUCCESSFUL in 16s after removing join/invite-only imports from `EventDetailScreen.kt`

    PATH=/Users/elesesy/Library/Android/sdk/platform-tools:$PATH ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailInviteDialogUiTest*" --tests "*EventDetailMobileJoinFlowTest*" --tests "*EventRegistrationFlowCoordinatorTest*" --console=plain
    Result: BUILD SUCCESSFUL in 1m 46s
    Notes: Existing warnings were reported during Kotlin compilation. `startLocalBackend` again reported adb reverse could not be configured because no device/emulator was attached; the JVM tests passed.

Standings extraction file-size evidence:

    4176 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt
     343 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailStandingsTab.kt
    4519 total

Standings extraction validation passed:

    git diff --check -- composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailStandingsTab.kt plans/event-detail-screen-components-execplan.md
    Result: no whitespace errors

    PATH=/Users/elesesy/Library/Android/sdk/platform-tools:$PATH ./gradlew :composeApp:compileCommonMainKotlinMetadata --console=plain
    Result: BUILD SUCCESSFUL in 28s before import cleanup, then BUILD SUCCESSFUL in 14s after removing standings-only imports from `EventDetailScreen.kt`

    PATH=/Users/elesesy/Library/Android/sdk/platform-tools:$PATH ./gradlew :composeApp:testDebugUnitTest --tests "*LeagueStandingsPresentationTest*" --tests "*EventLeagueStandingsCoordinatorTest*" --console=plain
    Result: BUILD SUCCESSFUL in 1m 29s
    Notes: Existing warnings were reported during Kotlin compilation. `startLocalBackend` again reported adb reverse could not be configured because no device/emulator was attached; the JVM tests passed.

## Interfaces and Dependencies

The extracted UI files should remain in package `com.razumly.mvp.eventDetail`. This avoids broad public API churn and lets internal models be shared across files in the same feature package.

The expected presentational boundaries are:

    internal data class EventDetailFloatingActionsState(...)
    internal data class EventDetailFloatingActionsActions(...)
    internal data class EventDetailOverviewState(...)
    internal data class EventDetailOverviewActions(...)
    internal data class EventDetailJoinSheetsState(...)
    internal data class EventDetailJoinSheetsActions(...)
    internal data class EventDetailStandingsState(...)
    internal data class EventDetailStandingsActions(...)

The exact fields should be introduced only when the corresponding UI region has already been moved and the repeated parameter groups are visible. Do not add containers that merely mirror every `EventDetailComponent` property. A good container is narrow enough that a future unit or Compose UI test can construct it without a real component.

If a child component is later justified, it should look like a narrow workflow interface rather than a wrapper around the full parent component. For example:

    internal interface EventStandingsSectionComponent {
        val state: StateFlow<EventStandingsState>
        fun confirmResults(applyReassignment: Boolean)
        fun refresh()
    }

Do not introduce that interface during the first UI extraction milestones. First prove the state/action container boundary.

Revision Note (2026-06-23): Initial plan created to track whole-component extraction from `EventDetailScreen.kt`, while explicitly preserving and tracking the two existing event detail ExecPlans.
