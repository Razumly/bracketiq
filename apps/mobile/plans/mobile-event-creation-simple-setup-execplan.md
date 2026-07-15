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
- [ ] Run the focused tests after the branch's existing common-test fixture compilation errors are repaired.

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

## Decision Log

- Decision: Keep one `Event` draft for Simple and Advanced modes.
  Rationale: Mode switching must preserve values and must continue using the established create payload and scheduler logic.
  Date/Author: 2026-07-13 / Codex

- Decision: Use the same fourteen page names and order as web Simple Setup.
  Rationale: Organizers should learn one creation sequence across web and mobile even though mobile intentionally excludes organization-only Tryout creation.
  Date/Author: 2026-07-13 / Codex

- Decision: Add section visibility as an optional EventDetails input with an all-visible default.
  Rationale: Existing event edit and detail callers must retain their current layout without modification.
  Date/Author: 2026-07-13 / Codex

- Decision: Keep Tryout out of the mobile creation type set and resolver.
  Rationale: The product decision is that only organizations create Tryouts through the web organization flow.
  Date/Author: 2026-07-13 / Codex

## Outcomes & Retrospective

The mobile create screen now starts in Simple Setup, exposes the current complete form through Advanced, preserves one `Event` draft across both layouts, and continues to submit through `DefaultCreateEventComponent`. The fourteen-page resolver and rail match the web page order, dependent pages are skipped or explained based on earlier choices, and existing EventDetails editors are reused through an optional section-visibility contract. Mobile creation offers Event, Weekly Event, League, and Tournament only; Tryout remains web-only for organizations.

Production compilation passes for common metadata, Android debug Kotlin, and iOS simulator Kotlin. Focused resolver tests are present, but the repository currently cannot compile the complete common test source set because unrelated repository fakes and payment-flow tests no longer match their production interfaces. The Android JVM test path is additionally blocked in this isolated worktree by the missing Maps manifest placeholder.

## Context and Orientation

`composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventScreen.kt` renders the creation screen and owns transient UI state. `DefaultCreateEventComponent.kt` owns the mutable event draft and persistence. `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt` renders the existing advanced form by composing modular section functions. The new resolver and Simple Setup UI belong under the `eventCreate` package. No database or API changes are needed.

The fourteen pages are Format, Basics, Participation Plan, Divisions, Schedule Plan, Schedule & Location, Competition Plan, Competition Rules, Registration Plan, Pricing & Registration, Documents & Questions, Operations Plan, Staff & Operations, and Review & Publish. A planning page collects choices that determine whether later detail pages are used. A detail page reuses the existing EventDetails section. A page can be current, complete, available, locked, or not used.

## Plan of Work

First add pure setup types and resolver functions. They must exclude Tryout, mark competition pages unused for Event and Weekly Event, mark documents/questions unused until enabled, and mark staff/operations unused until enabled or team operations apply. Add tests before wiring UI.

Next add a stable Simple/Advanced segmented control and horizontally scrolling labeled progress rail. Clicking a complete or available page navigates directly. Clicking a locked page goes to its earliest incomplete prerequisite. Clicking a not-used page opens a short explanation and identifies the planning page that enables it.

Then add planning-page controls for participation, schedule, competition, registration, and operations. These controls update the existing event draft where a persisted field already exists and keep transient choices only for layout decisions that are not event fields.

Finally add optional section visibility to EventDetails. Advanced passes the default all-visible configuration. Simple passes page-specific visibility, preserving existing field editors and callbacks. Review renders the existing event-card preview and publishes through the same component validation and create method.

## Concrete Steps

Run from `/Users/elesesy/StudioProjects/mvp-app-club-tryouts`:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    ./gradlew :composeApp:allTests

If the full multiplatform test task is blocked by an unrelated native environment issue, run focused common tests and record the exact failure in this plan.

## Validation and Acceptance

Creating a new event must open Simple Setup on Format. Event, Weekly Event, League, and Tournament must be selectable; Tryout must not appear. The progress rail must retain full labels, show unavailable pages in a muted style, and permit direct navigation according to page status. Switching to Advanced and back must preserve name, sport, event type, division, schedule, pricing, and staffing values. Review must use the existing preview and create action. Existing event detail and edit screens must render all sections unchanged.

## Idempotence and Recovery

The change is additive. The section-visibility default preserves all existing callers. If Simple Setup must be disabled temporarily, initialize create mode to Advanced while leaving the resolver and tests in place; no stored data requires migration or repair.

## Artifacts and Notes

Validation transcripts:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    BUILD SUCCESSFUL

    ./gradlew :composeApp:compileDebugKotlinAndroid
    BUILD SUCCESSFUL

    ./gradlew :composeApp:iosSimulatorArm64Test --tests 'com.razumly.mvp.eventCreate.EventCreateSimpleSetupTest' --tests 'com.razumly.mvp.eventCreate.CreateEventSelectionRulesTest'
    Production iOS compilation succeeded; test compilation stopped on unrelated stale common-test fixtures.

    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.EventCreateSimpleSetupTest'
    Stopped before test compilation because the isolated worktree has no MAPS_API_KEY manifest placeholder.

## Interfaces and Dependencies

Define `EventCreateSetupMode`, `EventCreateSetupPageId`, `EventCreateSetupChoices`, `EventCreateSetupPage`, and resolver functions in the `eventCreate` package. Define `EventDetailsSectionVisibility` in the `eventDetail` package with an `All` default. Do not add a new persistence model or endpoint.
