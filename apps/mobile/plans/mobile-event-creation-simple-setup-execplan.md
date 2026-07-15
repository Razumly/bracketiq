# Add page-based Simple Setup to mobile event creation

This ExecPlan is a living document maintained according to `PLANS.md` in the repository root. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must stay current while implementation proceeds.

## Purpose / Big Picture

Mobile event creation currently opens one long advanced event-details form. After this change, creation opens in a named, page-based Simple Setup flow that asks structural questions before showing dependent inputs. Users can switch to the existing Advanced form at any time without losing draft values. Mobile does not offer Tryout creation; Tryouts remain organization-only creation on the web, although the app can discover and display them.

## Progress

- [x] (2026-07-13) Audited `CreateEventScreen`, `DefaultCreateEventComponent`, and the modular EventDetails sections.
- [x] (2026-07-13) Added a pure resolver for page order, usage, status, navigation, validation, and section visibility.
- [x] (2026-07-13) Added the Simple/Advanced mode control, labeled progress rail, planning pages, and page navigation.
- [x] (2026-07-13) Filtered the existing EventDetails sections per Simple Setup page while retaining the complete Advanced layout.
- [x] (2026-07-13) Added focused resolver tests and compiled the common, Android, and iOS production targets.
- [x] (2026-07-15) Audited the shipped Simple Setup layout and confirmed that it embeds the scrolling, collapsible advanced editor beneath a second tall header and floating action buttons.
- [x] (2026-07-15) Rebuilt Simple Setup as compact page-specific content with no expandable sections and no vertical scrolling at a 360 x 800 dp stress viewport.
- [x] (2026-07-15) Replaced floating action buttons with a full-width bottom action bar that participates in `Scaffold` content padding and sits above the app navigation bar exactly once.
- [x] (2026-07-15) Added draft-mapping and validation regression tests, compiled and assembled Android, and verified all base and conditional pages on an Android emulator.
- [x] (2026-07-15) Ran the focused Android JVM test suite successfully; the current checkout supplies the required local manifest configuration.
- [x] (2026-07-15) Removed the Schedule Plan and Competition Plan pages, centered format-card content, and made configured division cards reopen their editor.
- [x] (2026-07-15) Replaced the manual-timeslot toggle with one automatic event-range slot plus compact custom-timeslot editing on Schedule & Location.
- [x] (2026-07-15) Replaced the generic timed/set selector with sport-structured duration, per-set score, playoff, and explained standings controls.
- [x] (2026-07-15) Verified division reopening, finite competition defaults, timeslot save/reopen, soccer durations, and volleyball set targets in the Android emulator; ran 27 focused regression tests and assembled the final debug APK.
- [x] (2026-07-15) Added compact 1/3/5 set-count customization that preserves regulation scores and keeps the deciding-set target last.

## Surprises & Discoveries

- Observation: The mobile create screen already uses the same `Event` draft and `EventDetails` section components for every event format.
  Evidence: `CreateEventScreen.kt` passes `newEventState` and all mutation callbacks into `EventDetails`, while `DefaultCreateEventComponent.kt` owns persistence and normalization.

- Observation: EventDetails already separates Basic Information, Event Details, Match Rules, Staff, Divisions, League Scoring, and Schedule into independent section functions.
  Evidence: `EventDetails.kt` calls one section function for each group inside its `LazyColumn`.

- Observation: Mobile registration-question authoring is not part of the current create contract.
  Evidence: create mode passes no question drafts or mutation callbacks to `EventDetails`; the existing question component renders questions supplied by event detail.

- Observation: The Android JVM test task requires a Maps manifest secret even for pure common tests in an isolated worktree.
  Evidence: `:composeApp:testDebugUnitTest` stops in `processDebugUnitTestManifest` because no `MAPS_API_KEY` placeholder is available; `:composeApp:compileDebugKotlinAndroid` succeeds independently.

- Observation: The branch's common test source set has unrelated compile failures that predate this wizard.
  Evidence: `:composeApp:compileTestKotlinIosSimulatorArm64` reports stale `MatchRepository` fakes and payment-flow test APIs outside `eventCreate`. The new test fixture's own `Event` coordinate construction was corrected to the current model contract.

- Observation: Section visibility did not make the advanced editor suitable for a page-sized mobile wizard.
  Evidence: `EventDetails.kt` still renders a `LazyColumn`, a hero as tall as 60 percent of the screen in edit mode, and collapsible section cards even when only one section is visible.

- Observation: The create screen reserves bottom-navigation space twice and ignores the nested `Scaffold` content padding.
  Evidence: `CreateEventScreen.kt` applies `LocalNavBarPadding` to the whole `Scaffold`, passes the same padding into `EventDetails`, and does not consume the `PaddingValues` supplied to the scaffold content lambda.

- Observation: Narrow-device screenshots exposed problems that were not obvious from source inspection alone.
  Evidence: At 360 x 800 dp, the old date format clipped, long page titles collided with the Advanced action, helper-card actions squeezed their copy, and two-column cutoff/staff dropdowns clipped their values.

- Observation: The final shared-UI change compiles on Android, while the iOS simulator target is currently blocked outside this change.
  Evidence: `:composeApp:compileKotlinIosSimulatorArm64` reaches `PaymentProcessor.ios.kt` and fails because the actual class does not implement the expected `emitPaymentResult`; none of the event-create files modify that contract.

- Observation: The Simple Setup timeslot switch represented a persistence choice, not a meaningful organizer decision, and its starter slot was an incomplete repeating slot.
  Evidence: `setUseManualTimeSlots` only selected automatic event-window persistence versus `_leagueSlots`, while `createDefaultLeagueSlot` left days, times, and resources empty.

- Observation: Simple Setup inferred set-based sports from `usePointsPerSetWin`, even though the authoritative structure is the sport match-rules scoring model.
  Evidence: Indoor Soccer resolved to `PERIODS`, but the old UI still rendered a generic Timed Match dropdown beside a disabled Target Score field and did not expose match duration.

- Observation: Appending the custom-timeslot editor below the base schedule controls still exceeded the standard viewport even after compacting its rows.
  Evidence: Emulator bounds placed Resources and Divisions near the bottom of the content area and pushed Save Timeslot below the fixed action bar.

- Observation: Result-points sports had enabled Win, Draw, and Loss inputs but no initial values.
  Evidence: Indoor Soccer rendered three empty standings fields until the sport transition supplied the conventional 3/1/0 defaults.

## Decision Log

- Decision: Keep one `Event` draft for Simple and Advanced modes.
  Rationale: Mode switching must preserve values and must continue using the established create payload and scheduler logic.
  Date/Author: 2026-07-13 / Codex

- Decision: Start from the web sequence, then keep only the twelve pages that represent organizer decisions on mobile.
  Rationale: Organizers should learn a consistent creation sequence across web and mobile, but automatic-versus-manual persistence and customize-default toggles are implementation choices rather than useful standalone steps.
  Date/Author: 2026-07-13 / Codex

- Decision: Add section visibility as an optional EventDetails input with an all-visible default.
  Rationale: Existing event edit and detail callers must retain their current layout without modification.
  Date/Author: 2026-07-13 / Codex

- Decision: Keep Tryout out of the mobile creation type set and resolver.
  Rationale: The product decision is that only organizations create Tryouts through the web organization flow.
  Date/Author: 2026-07-13 / Codex

- Decision: Stop reusing `EventDetails` inside Simple Setup; retain it unchanged for Advanced Setup.
  Rationale: A compact, non-collapsible, no-scroll wizard needs page-specific controls. The full editor's hero, expandable sections, and long lists cannot meet that layout contract without harming Advanced Setup.
  Date/Author: 2026-07-15 / Codex

- Decision: Replace the horizontal fourteen-card progress rail with a page title, step count, and linear progress indicator.
  Rationale: The rail consumes vertical space, introduces a second scrolling axis, and competes with the form. A compact progress summary preserves orientation without crowding the viewport.
  Date/Author: 2026-07-15 / Codex

- Decision: Use a nested scaffold bottom bar with rectangular Back and Continue/Create actions instead of floating buttons.
  Rationale: The bottom bar reserves its own content inset, offers larger labeled touch targets, and can be positioned above the app navigation bar without duplicate padding.
  Date/Author: 2026-07-15 / Codex

- Decision: Use compact, explicit field values instead of relying on empty dropdown selections.
  Rationale: Empty dropdown values render as ambiguous centered labels on Android. Compact date labels and an explicit `No cutoff` option remain readable on narrow screens and preserve the underlying nullable model.
  Date/Author: 2026-07-15 / Codex

- Decision: Keep one non-repeating event-range timeslot internally for leagues and tournaments and expose custom slot editing only after the organizer asks for it.
  Rationale: Every competition needs a schedulable resource window, but automatic versus manually configured persistence is an implementation detail. The event start and end remain authoritative until a custom slot is saved.
  Date/Author: 2026-07-15 / Codex

- Decision: Lock scoring structure to the selected sport and expose only values valid for that structure.
  Rationale: A soccer or basketball event should edit match length, a set sport should edit scores per set, and neither should offer a control that converts it into the other structure.
  Date/Author: 2026-07-15 / Codex

- Decision: Render Schedule & Location in either summary mode or in-place timeslot-edit mode instead of stacking both forms.
  Rationale: The editor remains on the requested page while its start/end, resources, divisions, and save actions all fit within one standard viewport.
  Date/Author: 2026-07-15 / Codex

- Decision: Offer set counts as explicit 1, 3, and 5 choices and resize the per-set score row immediately.
  Rationale: Set-based sports need an editable best-of structure, while restricting the choices to valid odd counts prevents tied matches and keeps the control compact enough for the fixed mobile viewport.
  Date/Author: 2026-07-15 / Codex

## Outcomes & Retrospective

The mobile create screen now starts in a purpose-built Simple Setup instead of embedding the advanced editor. Each used page presents only the controls needed for that decision, has no collapsible container or scrollable form, and writes into the same `Event` draft used by Advanced Setup and final creation. The compact title, step count, and progress indicator retain orientation while the inset-aware Back/Continue bar remains above the app navigation and system gesture area.

The complete base path and the tallest conditional paths were inspected on an Android emulator at 360 x 800 dp: manual scheduling, competition rules with all custom fields, paid pricing, documents/questions, staff plus officials, and review all fit without vertical scrolling. The screenshot pass directly led to compact date formatting, narrower header typography, full-width pricing cutoff fields, an explicit no-cutoff value, and non-squeezing helper-card actions. A follow-up pass removed two implementation-oriented planning pages, moved no-fixed-end and compact timeslot editing onto Schedule & Location, made division and timeslot summary cards editable, and made competition values follow the sport's resolved scoring model. Indoor Soccer now exposes two 50-minute duration fields and 3/1/0 result points; Indoor Volleyball exposes only 21/21/15 set targets plus the explicit playoff-team count.

Android debug Kotlin compilation and debug APK assembly pass. The final focused run passed 27 tests across `EventCreateSimpleSetupTest`, the two affected `DefaultCreateEventComponentTest` regressions, and `EventDetailsMatchRulesTest`. The iOS simulator compile is blocked by the unrelated existing `PaymentProcessor.ios.kt` expect/actual mismatch described above.

## Context and Orientation

`composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventScreen.kt` renders the creation screen and owns transient UI state. `DefaultCreateEventComponent.kt` owns the mutable event draft and persistence. `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt` renders the existing advanced form by composing modular section functions. The new resolver and Simple Setup UI belong under the `eventCreate` package. No database or API changes are needed.

The twelve pages are Format, Basics, Participation Plan, Divisions, Schedule & Location, Competition Rules, Registration Plan, Pricing & Registration, Documents & Questions, Operations Plan, Staff & Operations, and Review & Publish. Planning pages remain only where they gate a genuinely optional later page. A page can be current, complete, available, locked, or not used.

## Plan of Work

First add pure setup types and resolver functions. They must exclude Tryout, mark competition pages unused for Event and Weekly Event, mark documents/questions unused until enabled, and mark staff/operations unused until enabled or team operations apply. Add tests before wiring UI.

Next add a stable Simple/Advanced mode action and compact title, step count, and linear progress indicator. Back and Continue move through only the pages used by the current choices.

Then add planning-page controls for participation, schedule, competition, registration, and operations. These controls update the existing event draft where a persisted field already exists and keep transient choices only for layout decisions that are not event fields.

Finally build page-specific Simple Setup composables that update the established draft callbacks. Advanced continues to render the complete `EventDetails` editor unchanged. Review summarizes the draft and publishes through the same component validation and create method.

## Concrete Steps

Run from `/Users/elesesy/StudioProjects/mvp-app`:

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:compileDebugKotlinAndroid
    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:assembleDebug
    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.EventCreateSimpleSetupTest'

If the full multiplatform test task is blocked by an unrelated native environment issue, run focused common tests and record the exact failure in this plan.

## Validation and Acceptance

Creating a new event must open Simple Setup on Format. Event, Weekly Event, League, and Tournament must be selectable; Tryout must not appear. The title, step count, and linear indicator must reflect only used pages. Every Simple page must fit at 360 x 800 dp without a scroll container or collapsible section. Switching to Advanced and back must preserve name, sport, event type, division, schedule, pricing, and staffing values. Review must submit through the existing create action. Existing event detail and edit screens must render all sections unchanged.

## Idempotence and Recovery

The change is additive. The section-visibility default preserves all existing callers. If Simple Setup must be disabled temporarily, initialize create mode to Advanced while leaving the resolver and tests in place; no stored data requires migration or repair.

## Artifacts and Notes

Validation transcripts:

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:compileDebugKotlinAndroid
    BUILD SUCCESSFUL

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:assembleDebug
    BUILD SUCCESSFUL

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.EventCreateSimpleSetupTest'
    BUILD SUCCESSFUL; 9 focused tests passed.

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.EventCreateSimpleSetupTest' --tests 'com.razumly.mvp.eventCreate.DefaultCreateEventComponentTest.selecting_competition_types_uses_finite_end_by_default' --tests 'com.razumly.mvp.eventCreate.DefaultCreateEventComponentTest.selecting_result_points_sport_applies_conventional_standings_defaults' --tests 'com.razumly.mvp.eventDetail.EventDetailsMatchRulesTest' :composeApp:assembleDebug
    BUILD SUCCESSFUL; 27 focused tests passed and the debug APK assembled.

Emulator screenshots:

    artifacts/event-create-qa/01-format.png
    artifacts/event-create-qa/04-divisions-added.png
    artifacts/event-create-qa/07-timeslot-editor-compact.png
    artifacts/event-create-qa/08-timeslot-summary.png
    artifacts/event-create-qa/11-soccer-competition-final.png
    artifacts/event-create-qa/12-volleyball-competition.png

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:compileKotlinIosSimulatorArm64
    BLOCKED by pre-existing PaymentProcessor.ios.kt expect/actual mismatch for emitPaymentResult.

## Interfaces and Dependencies

`EventCreateSetupMode`, `EventCreateSetupPageId`, `EventCreateSetupChoices`, `EventCreateSetupPage`, resolver functions, page composables, and draft-mapping helpers live in the `eventCreate` package. Advanced Setup continues to use `EventDetails`. No persistence model or endpoint was added.
