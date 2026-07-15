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
- [x] (2026-07-15) Split schedule setup into event timing/location, resource labels, and a scrollable timeslot page.
- [x] (2026-07-15) Removed organization document templates from Simple Setup and added direct event registration-question authoring through the shared API.
- [x] (2026-07-15) Replaced the official scheduling dropdown with explained single-select priority cards.
- [x] (2026-07-15) Completed the tournament Simple Setup branches with explicit pool count, bracket-team advancement, derived pool summaries, and single/double-elimination selection.
- [x] (2026-07-15) Added tournament payload and validation regressions and compacted the complete pool-play rules page to fit a 360 x 800 dp viewport.
- [x] (2026-07-15) Split tournament scheduling rules into pool/regular matches and one bracket page with conditional loser-bracket controls.
- [x] (2026-07-15) Added editable pool set duration, bracket set/match duration, and independent winner/loser set counts and target scores.
- [x] (2026-07-15) Kept cleared schedule durations null, added inline required warnings, and prevented sport-default normalization from repopulating them.
- [x] (2026-07-15) Combined loser-bracket rules beneath winner-bracket rules on one compact tournament page.
- [x] (2026-07-15) Made registration-question wording registration-aware, exposed and enforced short/long response limits, and brought Simple Setup staff controls to Advanced Setup parity.

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

- Observation: Registration questions already have a shared web API, but mobile only implements the read path used during registration.
  Evidence: `mvp-site` saves question drafts after the event exists with `PUT /api/registration-questions`; `IEventRepository` currently exposes only `getRegistrationQuestions`.

- Observation: Official scheduling persists as one `OfficialSchedulingMode`, not a combinable set of priorities.
  Evidence: The shared event model stores exactly one of `STAFFING`, `TEAM_STAFFING`, `SCHEDULE`, or `OFF`.

- Observation: Tournament Simple Setup reused the league `includePlayoffs` switch but never exposed the pool count stored in `DivisionDetail`.
  Evidence: The original Competition Rules page rendered only a generic playoff-team count, while Advanced Setup and the create payload already supported pool count, pool team count, and per-division playoff configuration.

- Observation: Tournament capacity is entered after Competition Rules, and the draft may still contain the placeholder capacity of two teams at that point.
  Evidence: Emulator QA initially blocked a 2-pool, 4-team bracket with `Bracket teams cannot exceed maximum teams` before the organizer had reached Pricing & Registration.

- Observation: The scheduler has one duration per set for a set-based playoff config, then calculates each bracket match from its role-specific set count.
  Evidence: `EventBuilder.scheduleLeaguePlayoffBracket` multiplies `setDurationMinutes` by `winnerSetCount` or `loserSetCount`; its regression fixture schedules winner best-of-3 at 60 minutes and loser best-of-1 at 20 minutes when sets are 20 minutes.

- Observation: Pool and playoff match rules can persist separately on the same division.
  Evidence: regular `DivisionDetail` fields hold pool set count, targets, and duration, while `DivisionDetail.playoffConfig` holds the bracket duration and independent winner/loser rules used by the scheduler.

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

- Decision: Give timing/location, resources, and timeslots separate Simple Setup pages for leagues and tournaments.
  Rationale: Resource count and labels are one organizer decision, while a variable number of timeslots needs its own vertical scroll region. Event and Weekly Event continue to skip competition resources and timeslots.
  Date/Author: 2026-07-15 / Codex

- Decision: Describe an open event end as an end date that match generation will set.
  Rationale: “Ongoing” implied that the event never ends; the persisted flag actually allows the generated match schedule to establish the end.
  Date/Author: 2026-07-15 / Codex

- Decision: Keep organization document templates out of mobile creation and author event registration questions directly in the app.
  Rationale: Templates are organization-only configuration, while registration questions already have a shared event-scoped API and are a valid event input on either client.
  Date/Author: 2026-07-15 / Codex

- Decision: Render the four scheduling priorities as explained radio-style cards.
  Rationale: The persisted model allows one mode, so the cards improve comparison and clarity without implying that contradictory priorities can be selected together.
  Date/Author: 2026-07-15 / Codex

- Decision: Give tournaments two explicit Simple Setup paths: bracket-only, or pool play followed by a bracket.
  Rationale: Pool play needs pool count and bracket-team advancement, while both paths still need an explicit single- or double-elimination bracket format. Derived teams-per-pool and advancing-per-pool values make the configured structure understandable without adding another page.
  Date/Author: 2026-07-15 / Codex

- Decision: Defer capacity-dependent pool validation until Pricing & Registration and final publish.
  Rationale: Competition Rules precedes capacity entry. The page can validate pool and bracket divisibility immediately, then recompute and validate teams per pool once the organizer enters maximum teams.
  Date/Author: 2026-07-15 / Codex

- Decision: Put loser-bracket rules directly beneath winner-bracket rules on one tournament bracket page.
  Rationale: The bracket format, shared set duration, and role-specific best-of rules are one scheduling decision. The loser section appears only for set-based double elimination; timed double elimination uses the one bracket match duration supported by the established model.
  Date/Author: 2026-07-15 / Codex

- Decision: Treat sport defaults as initial values, not empty-input fallbacks.
  Rationale: Clearing a numeric duration is intentional editing state. The draft remains null, the field renders a required warning, and page validation blocks continuation until the organizer enters a replacement.
  Date/Author: 2026-07-15 / Codex

- Decision: Match the Simple Setup staff editor to the Advanced Setup staff workflow.
  Rationale: Team officiating, check-in, roster controls, scheduling mode, official positions, existing-user assignment, email-role invites, assigned staff, and official position eligibility all share the same event contract and should not diverge by setup mode.
  Date/Author: 2026-07-15 / Codex

## Outcomes & Retrospective

The mobile create screen now starts in a purpose-built Simple Setup instead of embedding the advanced editor. Each used page presents only the controls needed for that decision, has no collapsible container, and writes into the same `Event` draft used by Advanced Setup and final creation. Fixed-content pages fit the standard viewport; resource, timeslot, question, and staff collections use a single vertical scroll region while the inset-aware Back/Continue bar remains fixed above the app navigation and system gesture area.

The complete base path and the tallest conditional paths were inspected on an Android emulator at 360 x 800 dp. The latest pass verified separate Schedule & Location, Resources, and Timeslots pages; five saved timeslots scrolling beneath a fixed action bar; direct short/long and required/optional question authoring; and four explained scheduling-priority cards. The screenshot pass directly led to compact date formatting, narrower header typography, full-width pricing cutoff fields, an explicit no-cutoff value, plural-aware resource/division summaries, and non-squeezing helper-card actions. Competition values continue to follow the sport's resolved scoring model: Indoor Soccer exposes duration and conventional 3/1/0 result points, while Indoor Volleyball exposes per-set targets and an explicit 1/3/5 set count.

Tournament creation now distinguishes bracket-only competition from pool play that advances into a bracket. The pool path persists pool count, bracket teams, derived pool size, and bracket format through each division's established payload fields. The complete volleyball pool page, including single/double elimination, was verified at 360 x 800 dp without scrolling.

Scheduling inputs now follow the same separation. Competition Rules owns pool or league duration and scoring. Winner Bracket owns bracket format, minutes per set or timed match duration, winner set count, and winner targets, with the conditional loser-bracket set count and targets directly beneath it. Defaults seed the initial draft, but clearing a duration preserves null and shows a required warning instead of silently restoring the default.

Registration questions now explain whether the team or individual player answers them. Short answers are capped at 200 characters and long answers at 2,000, with the limit visible both while configuring and answering questions. The Simple Setup staff page now exposes the same operational controls as Advanced Setup, including team officiating and swaps, check-in and rosters, scheduling mode, official positions, existing-user assignment, email invites with roles, assigned staff removal, and official position eligibility.

Android debug Kotlin compilation and debug APK assembly pass. The earlier scoring/layout pass ran 27 focused tests; the latest scheduling/question pass ran 18 focused tests across `EventCreateSimpleSetupTest`, the post-create question persistence regression, and the registration-question HTTP contract. The iOS simulator compile remains blocked by the unrelated existing `PaymentProcessor.ios.kt` expect/actual mismatch described above.

The latest setup pass runs all 28 `EventCreateSimpleSetupTest` cases plus focused default-preservation and staff-action UI regressions with zero failures and assembles the debug APK. A broader `DefaultCreateEventComponentTest` run still has seven schedule-slot assertions failing outside the files changed for the tournament branch; those failures are recorded separately from this focused green result.

## Context and Orientation

`composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventScreen.kt` renders the creation screen and owns transient UI state. `DefaultCreateEventComponent.kt` owns the mutable event draft and persistence. `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt` renders the existing advanced form by composing modular section functions. The new resolver and Simple Setup UI belong under the `eventCreate` package. No database or API changes are needed.

The current pages are Format, Basics, Participation Plan, Divisions, Schedule & Location, Resources, Timeslots, Competition Rules, Registration Plan, Pricing & Registration, Registration Questions, Operations Plan, Staff & Operations, and Review & Publish. Resources and Timeslots are used only by leagues and tournaments. Registration Questions is controlled by Registration Plan. Planning pages remain only where they gate a genuinely optional later page. A page can be current, complete, available, locked, or not used.

## Plan of Work

First add pure setup types and resolver functions. They must exclude Tryout, mark competition pages unused for Event and Weekly Event, mark documents/questions unused until enabled, and mark staff/operations unused until enabled or team operations apply. Add tests before wiring UI.

Next add a stable Simple/Advanced mode action and compact title, step count, and linear progress indicator. Back and Continue move through only the pages used by the current choices.

Then add planning-page controls for participation, schedule, competition, registration, and operations. These controls update the existing event draft where a persisted field already exists and keep transient choices only for layout decisions that are not event fields.

Finally build page-specific Simple Setup composables that update the established draft callbacks. Schedule & Location owns only the mapped location and event timing. Resources owns count and editable labels. Timeslots owns the automatic-window summary plus a single vertically scrollable list/editor for custom slots. Registration Questions holds mobile drafts and saves them through the shared API immediately after event creation. Advanced continues to render the complete `EventDetails` editor unchanged. Review summarizes the draft and publishes through the same component validation and create method.

## Concrete Steps

Run from `/Users/elesesy/StudioProjects/mvp-app`:

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:compileDebugKotlinAndroid
    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:assembleDebug
    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.EventCreateSimpleSetupTest'

If the full multiplatform test task is blocked by an unrelated native environment issue, run focused common tests and record the exact failure in this plan.

## Validation and Acceptance

Creating a new event must open Simple Setup on Format. Event, Weekly Event, League, and Tournament must be selectable; Tryout must not appear. The title, step count, and linear indicator must reflect only used pages. Fixed-content pages must fit at 360 x 800 dp without collapsible sections. Variable resource, timeslot, and question collections may use one vertical scroll region per page and must keep the bottom action bar visible. Switching to Advanced and back must preserve name, sport, event type, division, schedule, pricing, questions, and staffing values. Review must submit through the existing create action and save question drafts after the event exists. Existing event detail and edit screens must render all sections unchanged.

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

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.EventCreateSimpleSetupTest' --tests 'com.razumly.mvp.eventCreate.DefaultCreateEventComponentTest.create_event_saves_mobile_registration_questions_after_the_event_exists' --tests 'com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest.saveRegistrationQuestions_uses_shared_event_scope_put_contract' :composeApp:assembleDebug
    BUILD SUCCESSFUL; 18 focused tests passed and the debug APK assembled.

Emulator screenshots:

    artifacts/event-create-qa/01-format.png
    artifacts/event-create-qa/04-divisions-added.png
    artifacts/event-create-qa/07-timeslot-editor-compact.png
    artifacts/event-create-qa/08-timeslot-summary.png
    artifacts/event-create-qa/11-soccer-competition-final.png
    artifacts/event-create-qa/12-volleyball-competition.png

    artifacts/event-create-qa-restructure/03-schedule-open-end.png
    artifacts/event-create-qa-restructure/05-resources-four.png
    artifacts/event-create-qa-restructure/10-timeslots-many-scrolled.png
    artifacts/event-create-qa-restructure/12-registration-question-added.png
    artifacts/event-create-qa-restructure/14-staff-top.png
    artifacts/event-create-qa-restructure/15-staff-scrolled.png

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:compileKotlinIosSimulatorArm64
    BLOCKED by pre-existing PaymentProcessor.ios.kt expect/actual mismatch for emitPaymentResult.

## Interfaces and Dependencies

`EventCreateSetupMode`, `EventCreateSetupPageId`, `EventCreateSetupChoices`, `EventCreateSetupPage`, resolver functions, page composables, and draft-mapping helpers live in the `eventCreate` package. `IEventRepository` exposes the existing registration-question PUT contract for create finalization; no persistence model or backend endpoint is added. Advanced Setup continues to use `EventDetails`.
