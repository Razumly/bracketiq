# Add page-based Simple Setup to mobile event creation

This ExecPlan is a living document maintained according to `PLANS.md` in the repository root. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must stay current while implementation proceeds.

## Purpose / Big Picture

Mobile event creation has one established Advanced editor whose section content already owns the supported event contract. Simple Setup now presents independent Simple section composables one page at a time, in Advanced order. Each Simple file begins as a close copy of its Advanced counterpart, but the two modes no longer share top-level section UI. They continue to share the event draft, mutation boundaries, validation, persistence, and Preview step so mode switching cannot lose data or create two product contracts.

The next simplification adds a first-page Options step. Organizers choose one of four event types from compact square buttons, then use categorized parent checkboxes to decide which dependent controls appear later. Team registration controls team-size and team-operation fields; division mode controls shared versus per-division inputs; competition choices control playoff, pool, and loser-bracket inputs; schedule choices control the end-date field; and paid registration controls price, payment-method, refund, and payment-plan controls. Advanced Setup retains its inline controls.

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
- [x] (2026-07-15) Split every Simple page into a dedicated Simple source file initialized from the corresponding Advanced section while preserving shared typed state, actions, validation, and persistence.
- [x] (2026-07-15) Added the first-page Options step with four compact square event-type buttons and categorized parent checkboxes.
- [x] (2026-07-15) Centralized parent/child option normalization and removed the moved controlling checkboxes from later Simple pages while retaining them in Advanced.
- [x] (2026-07-15) Hid team-size and price inputs when their parent options are off, and made validation ignore individual-event team size while requiring positive prices for paid Simple events.
- [x] (2026-07-15) Added regression tests for option dependencies, page routing, payload normalization, and paid/team validation.
- [x] (2026-07-15) Compiled, installed, and verified the independent Simple flow and the preserved Advanced flow in the Android emulator.
- [x] (2026-07-15) Made image selection a Basic Information navigation requirement and added semantic inline errors plus required markers for every conditional required/ranged field in the shared create contract.
- [x] (2026-07-15) Added regression coverage for image, age-range, payment-link, official-position, and page-gate validation and reran the focused Android JVM suite.
- [x] (2026-07-15) Matched the tag search control to the adjacent sport field, accepted provider usernames for Cash App/Venmo/PayPal while retaining HTTPS-only link providers, and stabilized bracket cards and pills under enlarged Android font/display settings.
- [x] (2026-07-15) Pinned provider-specific username prefixes in both payment editors: Cash App always presents `$` and Venmo always presents `@`, while saved values still normalize to backend HTTPS URLs.

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

- Observation: Team size is currently validated and rendered even when `teamSignup` is false.
  Evidence: `EventDetailsRegistrationSection` always renders `Team Size Limit`, and `computeEventValidationResult` currently evaluates `teamSizeLimit >= 1` without checking `teamSignup`.

- Observation: The controlling checkboxes are spread across Basic Information, Event Details, Staff, Divisions, and tournament configuration, so moving only their visuals would leave duplicate mutation paths.
  Evidence: no-fixed-end-date, team registration, playoff/pool play, manual payments, refunds, division mode, team officiating, roster editing, and double elimination each currently own both their checkbox and dependent content in separate components.

- Observation: Sharing the Advanced top-level section composables made the Simple layout inseparable from future Advanced UI changes.
  Evidence: the latest product direction explicitly requires separate Simple files that begin as close copies, with only state, actions, validation, and persistence shared across modes.

- Observation: A separate local paid-registration intent is required while creating a free event because the persisted event model represents free versus paid only through zero or positive prices.
  Evidence: the Options checkbox can be enabled before a price is entered, so Simple validation now uses the explicit intent while persistence continues to use the established price fields.

- Observation: The independent Simple copies can preserve Advanced behavior without calling Advanced section composables.
  Evidence: `eventDetail/simple` contains separate hero, basic information, registration, match-rules, staff, division, league-scoring, and schedule functions; Android compilation and emulator mode switching both pass.

- Observation: Image readiness and image presence were represented by separate state but only readiness participated in the aggregate validity result.
  Evidence: a blank `imageId` produced a validation message while `isValid` could remain true whenever dominant-color loading had completed.

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

- Decision (superseded 2026-07-15): Add Options as the first Simple page while keeping every later page backed by the shared Advanced components.
  Rationale: Parent choices need one predictable home, but the shared top-level UI would prevent the two modes from evolving independently.
  Date/Author: 2026-07-15 / Codex

- Decision: Give every Simple page its own section composable file, initialized as a close copy of the corresponding Advanced section.
  Rationale: Simple and Advanced need independent presentation surfaces. Sharing typed section state, action models, normalization rules, validation, and persistence retains behavioral parity without coupling their UI implementations.
  Date/Author: 2026-07-15 / Codex

- Decision: Treat unchecked parent options as normalized state, not merely hidden state.
  Rationale: A free event must not retain paid division prices, manual-payment links, automatic-refund settings, or payment plans; an individual event must not retain team-only roster and officiating settings. Clearing incompatible children prevents invisible values from reaching the create payload.
  Date/Author: 2026-07-15 / Codex

- Decision: Use full-row labeled checkboxes inside category cards and compact two-by-two square event-type buttons.
  Rationale: This keeps touch targets at least 48 dp, makes disabled dependencies explicit, and uses progressive disclosure without returning to the oversized full-height format cards.
  Date/Author: 2026-07-15 / Codex

- Decision: Show required markers at rest, reveal red field-level errors after Continue or publish is attempted, and gate Basic Information on the uploaded image id rather than a transient picker selection.
  Rationale: Organizers can see requirements before submitting, errors stay adjacent to the responsible control, and navigation cannot race ahead of a failed or unfinished image upload.
  Date/Author: 2026-07-15 / Codex

- Decision: Keep the dense bracket visualization at fixed dp geometry and compensate only its card/pill typography for Android font scaling.
  Rationale: The bracket must preserve connector alignment and the compact match-card proportions shown in the product reference. Full match details remain available from each card, while other app typography continues to honor accessibility scaling normally.
  Date/Author: 2026-07-15 / Codex

## Outcomes & Retrospective

Simple Setup now has an independent presentation surface. Every page dispatches to a Simple-specific section function stored under `eventDetail/simple`; those files began as close copies of the corresponding Advanced implementations but can now be simplified without changing Advanced. The two modes still share the `Event` draft, typed section state and actions, normalization functions, validation, persistence, and Preview step, so the UI is separate without creating a second backend contract.

Options is the first Simple page. Its four event types use a compact two-by-two square grid, and its categorized checkboxes own the parent choices that determine later content. Turning off team registration removes team-size and team-operation state. Turning off paid registration clears prices, manual-payment details, refunds, and installments. Manual payments disable online refunds and payment plans. Division, playoff/pool, and loser-bracket choices normalize their hidden children instead of leaving stale payload values. Advanced Setup retains the original inline controls.

Android production compilation, focused JVM tests, installation, and emulator QA pass. The emulator confirmed Options as step 1, persisted an individual-event choice into later pages, showed no team-size or moved parent controls on Simple Event Details, switched to the original Advanced setup without a crash, and recorded no fatal Android runtime exception during the exercised flow.

Required inputs now use explicit `*` labels and field-level error styling. Basic Information cannot advance without a successfully uploaded image, and aggregate publish validation now checks image presence and readiness together. Conditional ranges and inputs—including dates, team size, ages, registration/refund cutoffs, manual payment URLs, division identity/capacity/price, match structure, official positions, league scoring, resources, and timeslots—surface their own actionable messages instead of relying only on the final error summary.

The Basic Information tag search now uses the same 56 dp control height as the sport picker with a smaller body-sized placeholder. Manual payment validation follows the existing persistence normalizer: Cash App, Venmo, and PayPal accept provider usernames that are converted into secure provider URLs before save, while Stripe, Zelle, and custom providers remain HTTPS-link inputs. Cash App and Venmo inputs pin their expected `$` and `@` prefixes and translate existing stored provider URLs back into readable usernames when editing. Bracket date/official pills are fixed at 40 dp with one-line text, and match-card typography compensates for Android font scale so card proportions and connector alignment remain stable when font and display size are increased.

## Context and Orientation

`composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventScreen.kt` renders the creation screen and owns transient UI state. `DefaultCreateEventComponent.kt` owns the mutable event draft and persistence. `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt` renders the existing advanced form by composing modular section functions. The new resolver and Simple Setup UI belong under the `eventCreate` package. No database or API changes are needed.

The current pages begin with Options, then mirror Advanced order: Basic Information, Event Details, Match Rules, Staff, Divisions, League Scoring Config, and Schedule. Match Rules is skipped for event types where Advanced hides it. League Scoring Config is used only for leagues. Review is the existing `Preview` child, not another Simple page.

## Plan of Work

Keep the compact Simple/Advanced header and fixed Back/Continue bar. Create a Simple-specific file for Options, hero/basic information, registration, match rules, staff, divisions, league scoring, and schedule content. Initialize each from the corresponding Advanced implementation, but dispatch to it through the same typed state and action models so domain behavior remains shared. Remove the controlling checkboxes only from their Simple copies; Advanced continues to show its inline controls. Refactor complex division-mode, playoff/pool, and payment transitions into shared mutation boundaries before wiring Options to them. Pass the paid-registration intent into validation because the persisted event contract represents free registration as zero price and otherwise has no separate paid boolean. Verify pure dependency rules, section routing, and Simple-versus-Advanced dispatch in unit tests, compile Android, then exercise both Event and Tournament paths in the emulator before committing.

## Concrete Steps

Run from `/Users/elesesy/StudioProjects/mvp-app`:

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:compileDebugKotlinAndroid
    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:assembleDebug
    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.EventCreateSimpleSetupTest'

If the full multiplatform test task is blocked by an unrelated native environment issue, run focused common tests and record the exact failure in this plan.

## Validation and Acceptance

Creating a new event must open Simple Setup on Options. Event type appears as four centered square choices. Checkbox groups must visually distinguish disabled dependencies, and tapping the full enabled row must toggle it. Turning Team Event off must remove Team Size Limit and all team-only child controls. Turning Paid Registration off must remove price fields and disable plus clear manual payments, automatic refunds, and payment plans. Manual payments must disable and clear automatic refunds and payment plans. Multiple Divisions, no-fixed-end scheduling, playoffs or pool play, double elimination, team officiating, and roster-edit choices must reveal only their compatible downstream controls. Each later Simple page must render from a dedicated Simple section file, without moved parent controls or an outer collapsible card. Existing Advanced event create/edit/detail screens must retain their original section files, all-section collapsible layout, and inline controlling checkboxes.

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

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventDetail.EventDetailsValidationTest' --tests 'com.razumly.mvp.eventDetail.composables.MatchCardTypographyTest' :composeApp:compileDebugKotlinAndroid --console=plain
    BUILD SUCCESSFUL; provider-specific payment validation and bracket font-scale regressions passed.

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:assembleDebug --console=plain
    BUILD SUCCESSFUL.

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :core:model:testDebugUnitTest --tests 'com.razumly.mvp.core.data.dataTypes.ManualRegistrationPaymentTest' :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventDetail.EventDetailsValidationTest' --tests 'com.razumly.mvp.eventDetail.composables.MatchCardTypographyTest' :composeApp:compileDebugKotlinAndroid --console=plain
    BUILD SUCCESSFUL; provider-prefix formatting, URL normalization, validation, and bracket typography regressions passed.

Additional emulator screenshots:

    artifacts/event-form-bracket-qa/tag-field.png
    artifacts/event-form-bracket-qa/bracket-normal.png
    artifacts/event-form-bracket-qa/bracket-large.png

## Interfaces and Dependencies

`EventCreateSetupMode`, `EventCreateSetupPageId`, `EventCreateSetupPage`, resolver functions, and section-visibility mapping live in the `eventCreate` package. Simple section composables live in a dedicated `eventCreate/simple` package and receive the same typed state/action models as the Advanced section composables. `EventDetails.showSectionContainers` and `animatedCardSection.showContainer` remain backward-compatible presentation seams; domain state, mutations, validation, persistence, and Preview remain shared. No API or persistence model is added.

Revision note (2026-07-15): extended the parity-first plan with the Options-page simplification, explicit checkbox dependency normalization, paid-price validation, and emulator acceptance requested after the shared Advanced-section reset.

Revision note (2026-07-15): corrected the UI ownership boundary so every Simple section lives in a separate file copied from, but no longer rendered by, the Advanced section implementation. Shared state and domain behavior remain the parity boundary.
