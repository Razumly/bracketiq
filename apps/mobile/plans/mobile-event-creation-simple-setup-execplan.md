# Add page-based Simple Setup to mobile event creation

This ExecPlan is a living document maintained according to `PLANS.md` in the repository root. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must stay current while implementation proceeds.

## Purpose / Big Picture

Mobile event creation has one established Advanced editor whose section content already owns the supported event contract. Simple Setup now presents those same section contents one page at a time, in Advanced order, while omitting only the outer collapsible card and header. This reset establishes exact behavioral parity first; later simplification can happen section by section without maintaining a second form implementation. Users can switch modes without losing draft values, and both modes use the same validation and Preview step.

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
- [x] (2026-07-15) Reset Simple Setup to render the established Advanced `EventDetails` section content one page at a time and removed the duplicate page-specific form implementation.
- [x] (2026-07-15) Added a section-wrapper seam that omits the collapsible card and section header in Simple Setup while leaving Advanced Setup unchanged.
- [x] (2026-07-15) Replaced the separate Simple review/publish page with the established Advanced Preview step and reduced the visible Simple route to the Advanced section order.
- [x] (2026-07-15) Compiled Android production code and passed focused section-routing plus league sport-rule tests after removing obsolete Simple-only UI tests.
- [x] (2026-07-15) Verified Basic Information, Event Details, Staff, Divisions, and Schedule on the Android emulator; confirmed shared Advanced content, direct non-collapsible section bodies, page navigation, top-of-page reset, and the shared Review transition.

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

- Observation: The duplicate Simple implementation had grown to roughly 3,800 lines of UI, mapping helpers, and tests even though every supported control already exists in modular Advanced sections.
  Evidence: Replacing it with section routing and the shared wrapper seam removed the duplicate code while `:composeApp:compileDebugKotlinAndroid` continued to pass.

- Observation: The Advanced section bodies can be reused without their collapsible chrome at one shared boundary.
  Evidence: Every modular Advanced section calls `animatedCardSection`; its `showContainer` flag now renders the same edit-content lambda directly for Simple Setup.

- Observation: Switching from a scrolled Advanced editor back to Simple initially retained the Advanced list offset.
  Evidence: Emulator QA opened Simple midway through Basic Information after mode switching; keying `EventDetails` scroll reset to the setup mode and Simple page now restores the top of each page.

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

- Decision (superseded 2026-07-15): Stop reusing `EventDetails` inside Simple Setup; retain it unchanged for Advanced Setup.
  Rationale: A compact, non-collapsible, no-scroll wizard needs page-specific controls. The full editor's hero, expandable sections, and long lists cannot meet that layout contract without harming Advanced Setup.
  Date/Author: 2026-07-15 / Codex

- Decision: Reset Simple Setup to the exact Advanced section content, routed one section per page, and simplify only after parity is stable.
  Rationale: The bespoke forms diverged from established behavior and multiplied fixes. Reusing the actual Advanced content makes one implementation authoritative while `showContainer = false` satisfies the requirement that the whole section is not collapsible in Simple Setup.
  Date/Author: 2026-07-15 / Codex

- Decision: Use Basic Information (hero plus basic fields), Event Details, Match Rules, Staff, Divisions, League Scoring Config, and Schedule as the Simple page order, skipping only sections that Advanced itself does not render for the selected event type.
  Rationale: This is the existing Advanced composition order. Standard events skip Match Rules and non-leagues skip League Scoring Config; the final used page advances to the shared Preview screen.
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

Simple Setup is now a thin page router over the real Advanced editor. There is no duplicate set of event, tournament, registration, division, schedule, or staff controls. Each page receives one `EventDetailsSectionVisibility` slice; the Basic Information page also includes the established hero/name/location content. Section bodies remain scrollable exactly as they are in Advanced, but Simple omits the outer card title and collapse affordance because the page header already supplies that context.

Advanced Setup still renders all sections with the original collapsible cards because `showSectionContainers` defaults to true. Existing event detail/edit callers are unchanged. The last used Simple section now validates through `EventDetails` and opens the same Preview component used by Advanced rather than publishing through a second review path.

Android production compilation and installation pass. Focused Android JVM tests cover the Advanced-section page list, event-type conditional sections, navigation, visibility mapping, minimum page checks, default event-range slot behavior, and league set-count preservation. Emulator QA confirmed the five-page Event route from Basic Information through Schedule, the shared content without outer collapsible cards, scroll reset between pages and modes, and the final Review action. No crash was recorded during the flow.

## Context and Orientation

`composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventScreen.kt` renders the creation screen and owns transient UI state. `DefaultCreateEventComponent.kt` owns the mutable event draft and persistence. `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt` renders the existing advanced form by composing modular section functions. The new resolver and Simple Setup UI belong under the `eventCreate` package. No database or API changes are needed.

The current pages mirror Advanced order: Basic Information, Event Details, Match Rules, Staff, Divisions, League Scoring Config, and Schedule. Match Rules is skipped for event types where Advanced hides it. League Scoring Config is used only for leagues. Review is the existing `Preview` child, not another Simple page.

## Plan of Work

Keep the compact Simple/Advanced header and fixed Back/Continue bar. Route Simple pages using the Advanced section order and the same `EventDetails` call used by Advanced. Add one backward-compatible wrapper flag so Simple can render section bodies directly while every other caller retains the card and collapse behavior. Remove bespoke Simple forms, draft-mapping helpers, and tests that no longer represent runtime behavior. Verify section routing in unit tests, then compare Simple and Advanced on the emulator before committing.

## Concrete Steps

Run from `/Users/elesesy/StudioProjects/mvp-app`:

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:compileDebugKotlinAndroid
    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:assembleDebug
    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.EventCreateSimpleSetupTest'

If the full multiplatform test task is blocked by an unrelated native environment issue, run focused common tests and record the exact failure in this plan.

## Validation and Acceptance

Creating a new event must open Simple Setup on Basic Information. Each Simple page must show the same edit content as its matching Advanced section, without the outer section header, card, or collapse interaction. The page title, step count, and linear indicator must include only sections Advanced renders for that event type. Switching modes must preserve the shared draft. The final Simple page must open the existing Preview step. Existing Advanced event create/edit/detail screens must retain their all-section collapsible layout.

## Idempotence and Recovery

The `EventDetails` flags default to all sections and visible containers, preserving existing callers. Simple Setup can be disabled temporarily by initializing create mode to Advanced; no stored data, API, or database migration is involved.

## Artifacts and Notes

Validation transcripts:

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:compileDebugKotlinAndroid
    BUILD SUCCESSFUL

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:assembleDebug
    BUILD SUCCESSFUL

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.EventCreateSimpleSetupTest'
    BUILD SUCCESSFUL; 9 focused tests passed.

    ./gradlew :composeApp:compileDebugKotlinAndroid --console=plain
    BUILD SUCCESSFUL in 1m 1s.

    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.EventCreateSimpleSetupTest' --tests 'com.razumly.mvp.eventCreate.LeagueSportRulesTest' --console=plain
    BUILD SUCCESSFUL in 17s.

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

`EventCreateSetupMode`, `EventCreateSetupPageId`, `EventCreateSetupPage`, resolver functions, and section-visibility mapping live in the `eventCreate` package. `EventDetails.showSectionContainers` and `animatedCardSection.showContainer` are backward-compatible presentation seams; section state, mutations, validation, persistence, and Preview remain shared. No API or persistence model is added.
