# Discover Screen Refactor with Floating Search

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, the current Search tab behaves as a Discover screen. Search moves to a floating control that appears when the user scrolls up and hides when scrolling down, while keeping search suggestions visually attached to the search bar itself. The Events tab preserves existing map/list behavior. The Rentals tab becomes the active non-event discovery surface (Organizations hidden for now), and tapping a rental opens a rental details flow where users choose rental blocks on a week-based, 30-minute timeline grid, confirm those selections, continue into Create Event with rental defaults prefilled, and complete payment before the event is created.

## Progress

- [x] (2026-02-11 21:23Z) Located existing Search screen implementation and map floating button behavior in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt` and related composables.
- [x] (2026-02-11 21:23Z) Located Discover tab reference in `~/Projects/MVP/mvp-site/src/app/discover/page.tsx` (`events`, `organizations`, `rentals`).
- [x] (2026-02-11 21:35Z) Implemented Discover tab UI in `EventSearchScreen` with top `PrimaryTabRow` containing `Events`, `Organizations`, and `Rentals`.
- [x] (2026-02-11 21:35Z) Moved search input to a floating, scroll-aware overlay and kept `SearchOverlay` position anchored to measured search-box coordinates.
- [x] (2026-02-11 21:31Z) Extended `EventSearchComponent` to expose organization/rental flows and wired `IBillingRepository` to fetch organizations by IDs in the active event feed.
- [x] (2026-02-11 21:35Z) Updated bottom-nav label from `Search` to `Discover`.
- [x] (2026-02-11 22:10Z) Ran build validation attempts and captured environment blockers plus compile status.
- [x] (2026-02-11 22:11Z) Updated this plan with implementation outcomes and final decision notes.
- [x] (2026-02-11 22:20Z) Applied post-implementation UX fixes: stabilized infinite-load trigger, added opaque floating-search container, and increased first-item top padding to clear the floating search bar.
- [x] (2026-02-11 23:37Z) Hid the `Organizations` discover tab and retained only `Events` and `Rentals` in discover navigation/suggestions.
- [x] (2026-02-11 23:37Z) Added rental-card icon treatment and rental details screen with start/end date-time selection.
- [x] (2026-02-11 23:37Z) Introduced navigation context from Discover rentals into Create flow so rental defaults prefill `Create Event`.
- [x] (2026-02-11 23:37Z) Added rental flow payment gate so payment must complete before creating the event.
- [x] (2026-02-11 23:37Z) Re-ran metadata validation commands and captured environment/build-system blockers preventing clean compile confirmation in this shell setup.
- [x] (2026-02-12 00:08Z) Added payment-result reset handling across common/Android/iOS payment processors and rental create flow to prevent stale payment outcomes.
- [x] (2026-02-12 02:12Z) Replaced rental date/time picker UX with week calendar + per-field vertical timeline grid using 30-minute increments and draggable top/bottom handles.
- [x] (2026-02-12 02:12Z) Added multi-selection rental confirmation step that lists chosen field/time blocks and carries resolved field/time-slot IDs into create-event context.
- [x] (2026-02-12 02:12Z) Removed duplicated trailing helper blocks in `EventSearchScreen.kt` caused by an interrupted patch and re-validated compile up to known baseline repository failures.
- [x] (2026-02-12 04:20Z) Fixed unresolved rental timeline helpers and completed multi-slot pricing resolution so confirmation/create payloads use resolved slot IDs and aggregate rental totals.
- [x] (2026-02-12 04:20Z) Fixed drag-resize behavior to support continuous expansion/contraction across all available 30-minute rows (not single-step), with overlap and availability enforcement.
- [x] (2026-02-12 04:20Z) Added busy-event overlays (existing field reservations) in rental timeline columns and blocked cell selection when intervals overlap existing events.
- [x] (2026-02-12 04:20Z) Added create-flow rental conflict checks plus a 10-second in-app checkout lock, and re-check before final event create to prevent stale/overlapping bookings.
- [x] (2026-02-12 04:20Z) Re-ran `:composeApp:compileCommonMainKotlinMetadata` successfully under local JDK 17 in this shell.
- [x] (2026-02-12 04:58Z) Added explicit discover event-type filter support for `LEAGUE` in SearchBox filter chips.
- [x] (2026-02-12 04:58Z) Updated rental busy-block and create-flow overlap checks to differentiate `EVENT` (event start/end window) vs `LEAGUE`/`TOURNAMENT` (match windows by field).
- [x] (2026-02-12 04:58Z) Injected `IMatchRepository` into discover/create components and verified metadata compile success after integration.

## Surprises & Discoveries

- Observation: The `mvp-site` reference path in this environment is available at `~/Projects/MVP/mvp-site` (not `/mnt/c/Users/samue/Projects/MVP/mvp-site`).
  Evidence: `ls -la ~/Projects/MVP/mvp-site` succeeded; listing `/mnt/c/Users/samue/Projects/MVP/mvp-site` failed.

- Observation: Existing suggestion anchoring already depends on measured `SearchBox` position and size, so we can preserve it when moving the search bar out of `Scaffold.topBar`.
  Evidence: `EventSearchScreen.kt` computes `overlayTopOffset`, `overlayStartOffset`, and `overlayWidth` from `onPositionChange`.

- Observation: Full Android assemble is not runnable from this Linux shell against the mounted Windows SDK because Build Tools are Windows binaries (`aapt.exe`) while Gradle expects Linux tool names (`aapt`).
  Evidence: `:composeApp:assembleDebug` fails with `Installed Build Tools revision 35.0.0 is corrupted` and missing `/build-tools/35.0.0/aapt`.

- Observation: Project currently has pre-existing shared-metadata compile failures unrelated to this task (Room/KSP generated ctor mismatch and unresolved `IO` in repositories).
  Evidence: `:composeApp:compileCommonMainKotlinMetadata` fails in `MVPDatabaseCtor.kt`, `MVPDatabseCtor.kt`, `EventRepository.kt`, `TeamRepository.kt`, `UserRepository.kt`, and `MatchRepository.kt` before/after UI changes.

- Observation: Additional validation runs can fail early in this environment with filesystem-level `Input/output error` before Kotlin task execution.
  Evidence: Gradle startup fails while creating `FileHasher` service with `java.io.IOException: Input/output error`.

- Observation: Running Gradle from this Linux shell uses Java 8 by default, which is incompatible with the Android Gradle Plugin version in this repository.
  Evidence: `./gradlew --no-daemon :composeApp:compileCommonMainKotlinMetadata` fails with `Dependency requires at least JVM runtime version 11`.

- Observation: Running the Windows wrapper (`gradlew.bat`) from WSL bypasses Java 8 but still fails with unrelated repository/environment baseline failures (`KSP` classloading and generated compose resource accessor resolution errors).
  Evidence: `gradlew.bat --no-daemon :composeApp:compileCommonMainKotlinMetadata` and the `-x kspCommonMainKotlinMetadata` variant both fail before a clean compile pass.

- Observation: There is no dedicated backend API in the current mobile codebase for distributed field-lock reservations during checkout.
  Evidence: repository/API search for lock/hold/reservation endpoints only found billing intent and event listing/create endpoints.

- Observation: Event-type filter chips in Search UI previously exposed only `All`, `Tournaments`, and `Events`, while `EventType` includes `LEAGUE`.
  Evidence: `SearchBox.kt` `EventTypeFilterSection` omitted a `LEAGUE` chip.

## Decision Log

- Decision: Keep route/config names (`AppConfig.Search`) intact and only change user-facing label to `Discover`.
  Rationale: This avoids broad navigation refactors while still delivering requested UX changes.
  Date/Author: 2026-02-11 / Codex

- Decision: Derive Organizations/Rentals tab content from organization IDs present in current event data and fetch details using `IBillingRepository#getOrganizationsByIds`.
  Rationale: This introduces meaningful Discover content without introducing new backend endpoints in this task.
  Date/Author: 2026-02-11 / Codex

- Decision: Keep organizations/rentals suggestions and lists read-only in this scope (no tap navigation side effects yet).
  Rationale: Existing app navigation has event-specific routes but no dedicated organization/rental detail route in this change set.
  Date/Author: 2026-02-11 / Codex

- Decision: Replace per-item `LaunchedEffect(Unit)` load-more trigger with list-state-driven gating keyed by `events.size + lastEventId`.
  Rationale: Prevents repeated load requests at small list sizes, eliminating spinner flicker while still allowing subsequent pagination when list content actually advances.
  Date/Author: 2026-02-11 / Codex

- Decision: Use a serialized `RentalCreateContext` passed through `AppConfig.Create` rather than keeping rental selection in transient in-memory state.
  Rationale: This keeps navigation explicit and resilient for back-stack recreation, while minimizing coupling between Discover and Create implementations.
  Date/Author: 2026-02-11 / Codex

- Decision: Keep rental details as an in-screen full-page step inside Discover instead of introducing a brand new top-level navigation route.
  Rationale: This delivers the requested “rental details screen” interaction with lower navigation churn while still handing off a serialized context to Create.
  Date/Author: 2026-02-11 / Codex

- Decision: Clear prior payment result state before starting a new rental payment attempt.
  Rationale: Prevents stale `PaymentResult` values from being re-consumed and incorrectly advancing or failing later create attempts.
  Date/Author: 2026-02-12 / Codex

- Decision: Model rental selection as arbitrary per-field draft blocks (`RentalSelectionDraft`) on a fixed 30-minute timeline and resolve each block against backend-provided `TimeSlot` availability before confirmation.
  Rationale: This supports multiple fields/courts and multiple independent blocks while ensuring only valid backend slots are carried into event creation.
  Date/Author: 2026-02-12 / Codex

- Decision: Implement a client-side 10-second rental checkout lock keyed by organization+field+time and combine it with server overlap checks before payment intent creation and again before final event create.
  Rationale: This delivers immediate contention protection and overlap cancel behavior without a dedicated server-side lock endpoint currently available in the app repository.
  Date/Author: 2026-02-12 / Codex

- Decision: For rental conflict checks, treat `EVENT` as a single blocked interval (`event.start`..`event.end`) and treat `LEAGUE`/`TOURNAMENT` as blocked only where scheduled matches overlap selected field/time windows.
  Rationale: Leagues/tournaments schedule play through matches, so field occupancy should be derived from match windows rather than the parent event envelope.
  Date/Author: 2026-02-12 / Codex

## Outcomes & Retrospective

Implemented the Discover UX requested on top of the existing Search route without changing route identities. The old top search bar is replaced by tabs (`Events`, `Rentals`) with organizations hidden for now, and search is now a floating control that stays anchored to suggestion dropdown positioning and reacts to scroll direction (shows on upward scroll, hides on downward scroll unless actively focused/querying/filtering).

The `Events` tab keeps existing behavior (event suggestions, map/list FAB, map overlay, filters). The `Rentals` tab uses data derived from organizations associated with visible events, filtered by `fieldIds`.

Validation was partially blocked by environment/project baseline issues: Android assemble cannot complete from this shell due Windows SDK tool layout, and shared metadata compile currently fails due pre-existing repository issues unrelated to this feature. The feature-specific compile regression introduced during implementation (`Alignment` import) was identified and fixed.

Follow-on milestone outcome: Organizations are now hidden from Discover UI, rentals now show organization iconography, rentals open a details screen with week navigation and per-field vertical timeline columns, and users can add any number of 30-minute rental blocks, resize each block via drag handles, and proceed to a confirmation step before create handoff. Continuing routes to Create with serialized rental defaults (resolved field IDs, timeslot IDs, aggregate start/end, and rental price). The Create flow now gates rental-origin creation behind payment completion before event persistence. Payment-result state is reset before each attempt to avoid stale outcome reuse. Compile verification remains blocked by existing environment/build failures unrelated to these specific edits.

Current milestone outcome: rental timeline helper regressions are resolved; compile is now successful for `:composeApp:compileCommonMainKotlinMetadata` under local JDK 17 in this environment. Rental selections now support continuous drag resizing, enforce no-overlap constraints, compute selection totals from resolved 30-minute slot coverage, and render existing busy event blocks directly on timeline columns to prevent selection conflicts. Create flow now performs overlap checks and applies a 10-second in-app lock before starting payment, then rechecks overlaps before final event creation, canceling the purchase flow with a conflict message when overlaps are detected.

Latest milestone outcome: discover event search now includes explicit league filtering in event-type chips, and rental occupancy/conflict logic now differentiates event families: standard events occupy by event start/end, while leagues/tournaments occupy only by scheduled matches on relevant fields. Both discover busy overlays and pre-create overlap checks now use this model, with compile validation passing after `IMatchRepository` integration.

## Context and Orientation

The current screen entry point is `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt`. It renders a `SearchBox` inside `Scaffold.topBar`, an event list/map body, and a map/list FAB in `Scaffold.floatingActionButton`. Search suggestions are rendered by `SearchOverlay` (`composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/SearchOverlay.kt`) and positioned by measured search-box coordinates.

`EventSearchComponent` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchComponent.kt` currently exposes event-centric state (events, filters, suggestions, map state) but no organization/rental state. Dependency wiring for this component lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/di/ComponentModule.kt`.

Bottom navigation labels are hardcoded in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/MVPBottomNavBar.kt`.

## Plan of Work

Refactor `EventSearchScreen` to keep an internal tab model but hide `Organizations` for now, leaving `Events` and `Rentals` active. Maintain the floating `SearchBox` and scroll-aware visibility behavior already implemented.

Keep `SearchOverlay` anchored by continuing to feed it measured position/size from `SearchBox.onPositionChange`. Ensure suggestion content remains tab-aware (event suggestions for Events and rental suggestions for Rentals).

Implement a rental-details screen from the Rentals tab card click path and collect rental blocks through a week selector plus 30-minute vertical field timeline with draggable handles. Then navigate into Create using serialized rental context.

Extend navigation/config and create component wiring to accept optional rental context, prefill create fields, and require payment completion before calling `eventRepository.createEvent` for rental-origin create flows. Finally run module validation and update this ExecPlan completion sections.

## Concrete Steps

From repository root `/home/camka/Projects/MVP/mvp-app`:

1. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchComponent.kt`:
   - Add `organizations` and `rentals` state to the interface and implementation.
   - Inject `IBillingRepository`.
   - Fetch organizations by IDs extracted from the event stream and derive rentals.

2. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/di/ComponentModule.kt`:
   - Pass `billingRepository = get()` to `DefaultEventSearchComponent`.

3. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt`:
   - Add Discover tabs in top bar.
   - Move `SearchBox` to floating overlay with scroll-aware show/hide behavior.
   - Keep search suggestions attached to floating search bar.
   - Render events, organizations, rentals tab bodies.
   - Restrict map FAB visibility to events tab.

4. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/MVPBottomNavBar.kt`:
   - Change first nav item label from `Search` to `Discover`.

5. Validate:
   - Run `./gradlew :composeApp:assembleDebug`.
   - Capture whether build succeeds or any compilation errors.

6. New milestone validation:
   - Run `./gradlew --no-daemon :composeApp:compileCommonMainKotlinMetadata`.
   - Confirm no new compile failures were introduced by this rental flow milestone.

## Validation and Acceptance

Acceptance is met when all of the following are true:

- Search tab visually presents as Discover with tabs labeled `Events`, `Rentals` (`Organizations` hidden).
- Floating search bar is no longer in `topBar`, appears when user scrolls up, and hides when user scrolls down.
- Search suggestion dropdown remains anchored to the floating search bar.
- Events tab still supports existing map/list toggle and event navigation.
- Rentals tab renders tab-specific content and respects current search text.
- Bottom nav label reads `Discover`.
- `./gradlew :composeApp:assembleDebug` completes successfully.

Validation performed in this environment:

- `./gradlew :composeApp:assembleDebug` with JDK 17 fails due SDK/tooling environment mismatch (`aapt` missing under Windows SDK path from Linux shell).
- `./gradlew --no-daemon :composeApp:compileCommonMainKotlinMetadata` reaches compilation and reports only pre-existing project errors unrelated to this change after fixing `EventSearchScreen` import issues.

## Idempotence and Recovery

All changes are source-only and safe to re-apply. If any step fails, re-run after fixing compile errors. No schema, migration, or destructive operation is included.

## Artifacts and Notes

Reference snippet from `~/Projects/MVP/mvp-site/src/app/discover/page.tsx` confirming tab labels:

    <Tabs.Tab value="events">Events</Tabs.Tab>
    <Tabs.Tab value="organizations">Organizations</Tabs.Tab>
    <Tabs.Tab value="rentals">Rentals</Tabs.Tab>

## Interfaces and Dependencies

At completion:

- `EventSearchComponent` must expose:
  - `val organizations: StateFlow<List<Organization>>`
  - `val rentals: StateFlow<List<Organization>>`

- `DefaultEventSearchComponent` constructor must accept:
  - `private val billingRepository: IBillingRepository`

- `ComponentModule` factory for `EventSearchComponent` must provide `billingRepository`.

Update note (2026-02-11 / Codex): Initial ExecPlan drafted after repository and reference implementation discovery; pending implementation steps.
Update note (2026-02-11 / Codex): Completed implementation and validation attempts; documented environment constraints and pre-existing compile blockers.
Update note (2026-02-11 / Codex): Re-opened plan for follow-on rental flow milestone (hide organizations, add rental details, create-context handoff, and payment-before-create gating).
Update note (2026-02-11 / Codex): Completed rental follow-on milestone implementation and captured additional validation blockers encountered while running Gradle from this mixed WSL/Windows setup.
Update note (2026-02-12 / Codex): Added rental overlap hardening milestone (busy-block overlays, robust drag/selection constraints, and create-flow lock/conflict checks) and recorded successful metadata compile verification under a local JDK 17 override.
Update note (2026-02-12 / Codex): Added event-family-aware occupancy logic (`EVENT` vs `LEAGUE`/`TOURNAMENT`) backed by match lookups and exposed `LEAGUE` in discover event-type filtering.
Update note (2026-02-12 / Codex): Implemented rental selection drag UX with non-mutating ghost preview cards, commit-on-release resizing, top/bottom edge handle positioning, and quarter-screen edge-triggered vertical auto-scroll while dragging.
Update note (2026-02-12 / Codex): Refined drag-follow behavior so auto-scroll consumed pixels are applied through the same handle-delta quantization path, keeping the ghost slot aligned with the finger during edge-triggered scrolling.
