# Resolve repeating time slots across local dates and time zones

This ExecPlan is a living document. Maintain it with the requirements in `PLANS.md`.

## Purpose / Big Picture

Event organizers can configure a repeating time slot with a named time zone, selected weekdays, local start and end times, and date bounds. After this change, an overnight slot such as Monday 22:00–02:00 resolves to an interval that ends on Tuesday. The site and mobile app show the next-weekday warning before save. The scheduler, diagnostics, registration session list, and mobile Room data use the same resolved instants. A local time in a daylight-saving gap or fold is rejected with the affected date instead of being shifted or duplicated.

A human can verify the result by running the focused site and mobile tests. The tests cover an overnight interval, a daylight-saving gap, a daylight-saving fold, date-bound filtering, and mixed repeating and one-time resource/division overlap behavior.

## Progress

- [x] (2026-08-18 00:00Z) Read issue #27, repository rules, and the existing site and mobile time-slot paths.
- [x] (2026-08-18 00:00Z) Create the isolated `issue/27-repeating-time-slots` worktree and claim issue #27.
- [x] (2026-08-18 00:00Z) Define one strict local-date occurrence resolver for site scheduling and presentation.
- [x] (2026-08-18 00:00Z) Allow overnight repeating intervals and report their next local weekday.
- [x] (2026-08-18 00:00Z) Reject daylight-saving gaps and folds with a date-specific error.
- [x] (2026-08-18 00:00Z) Route scheduler and diagnostics through the canonical resolved occurrence data.
- [x] (2026-08-18 00:00Z) Update mobile editing, validation, Room mapping, and presentation for the same contract.
- [x] (2026-08-18 00:00Z) Add focused site and mobile regression tests.
- [x] (2026-08-18 00:00Z) Run focused checks, smoke scenarios, and issue completion gates.
- [x] (2026-08-18 00:00Z) Reopen review defects and add regressions for canonical persistence, external conflict gating, mobile bounds, and rental modal submission.
- [x] (2026-08-18 00:00Z) Preserve overnight repeating slots in canonical persistence and external conflict checks.
- [x] (2026-08-18 00:00Z) Preserve configured local date bounds in mobile conflict windows and weekly projections.
- [x] (2026-08-18 00:00Z) Preserve an open-ended repeating rental end date during modal submission.
- [x] (2026-08-19 20:06Z) Remove unused overlap-only APIs and add mobile daylight-saving regressions.
- [x] (2026-08-18 00:00Z) Run the final focused checks and record the issue evidence.
- [x] (2026-08-19 21:11Z) Add regressions for mobile repeating date bounds and one-time field-calendar occupancy.
- [x] (2026-08-18 00:00Z) Reopen issue #27 after the post-closure rental-editor review.
- [x] (2026-08-18 00:00Z) Add and pass the site rental-editor regressions for overnight warnings and dated validation errors.
- [x] (2026-08-18 00:00Z) Run the follow-up focused site tests and TypeScript check.
- [ ] Synchronize this branch with clean current `main` and rerun the complete site suite.
- [x] (2026-08-18 00:00Z) Run the complete mobile suite with the available Android SDK.
- [x] (2026-08-18 00:00Z) Record the existing-branch integration sequence and conflict strategy.
- [x] (2026-08-18 00:00Z) Address review findings by converting the warning test to interaction coverage and centralizing site warning and local-time adapters.
- [x] (2026-08-18 00:00Z) Rerun the focused site suite and TypeScript validation after the review refactor.
- [x] (2026-08-20 00:00Z) Reproduce the post-review defects for far-future open-ended slots, external conflict windows, named-zone labels, and mobile conflict bounds.
- [x] (2026-08-20 00:00Z) Use event and configured local bounds for repeating validation and conflict enumeration.
- [x] (2026-08-20 00:00Z) Render weekly occurrence labels in each slot's named time zone and add site and mobile regressions.

- [x] (2026-08-20 00:00Z) Extend the open-ended validation horizon from the unpadded configured start.
- [x] (2026-08-20 00:00Z) Preserve no-fixed-end event bounds during external slot conflict checks.
- [x] (2026-08-20 00:00Z) Verify that mobile DST-gap submission performs no event-editor write.

- [x] (2026-08-21 03:02Z) Persist fetched event Time Slots through the Room event relation, return Room-backed data after refreshes, and share the v100-to-v101 migration SQL across Android and iOS.
- [x] (2026-08-21 03:02Z) Rename the iOS migration regression with the repository's `given_when_then` test convention.
- [x] (2026-08-20 00:00Z) Use each existing slot or facility named time zone in the rental editor and preserve the slot zone on edit.
- [x] (2026-08-20 00:00Z) Rerun the focused site and mobile checks after the rental editor change.
- [x] (2026-08-21 17:06Z) Review the Event Editor conflict request, the shared Field blocker loader, and the authoritative Schedule mutation.
- [x] (2026-08-21 17:23Z) Clarify that Set End from Schedule must load stored blockers by lower bound and evaluate recurring rules without a guessed upper bound.
- [x] (2026-08-21 17:30Z) Clarify that `generatedScheduleEnd` is mutated only on the target League or Tournament Event.
- [x] (2026-08-21 17:33Z) Separate the client-triggered Time Slot warning check from authoritative Schedule placement.
- [ ] Replace the Event Editor's per-Field 1970-to-2100 requests with one lower-bound batch conflict check that loads stored intervals and recurrence definitions.
- [ ] Return typed Match, One-Time Event, Event Time Slot, and rental-booking conflicts without returning complete source records to the browser.
- [ ] Make Build Schedule, Rebuild Schedule, and lock-preserving rescheduling evaluate each finite Match candidate against the complete lower-bound blocker catalog.
- [ ] Serialize concurrent occupancy writes for the selected Fields and add lower-bound catalog, unbounded Weekly Event, and concurrency regressions.

## Surprises & Discoveries

- Observation: Existing repeating validation rejects every `endTimeMinutes <= startTimeMinutes`, so it cannot represent an overnight interval.
  Evidence: `apps/site/src/app/events/[id]/schedule/components/eventForm/slotValidation.ts` and `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventScheduleRules.kt` both use this condition.
- Observation: Existing site and server weekly presentation code constructs dates in the host JavaScript time zone and calls `Date#setHours`.
  Evidence: `apps/site/src/app/discover/components/eventDetail/weeklySessions.ts` and `apps/site/src/server/events/weeklyOccurrences.ts` do not resolve local wall-clock values through the slot time zone.
- Observation: `kotlinx-datetime` provides `LocalDateTime.toInstant(timeZone)` but its default behavior does not prove a strict gap/fold policy.
  Evidence: the installed 0.8.0 source was inspected before implementation; the implementation must compare round-tripped local components and inspect offsets before accepting a value.
- Observation: `CreateRentalSlotModal` filled a missing repeating end date while slot props changed because the default non-repeating effect ran before the repeating state update.
  Evidence: the new modal regression observed a synthetic same-day `endDate` in the update payload for an overnight slot with no configured end date.
- Observation: The Event Editor makes one request for each selected Field with fixed bounds from 1970 through 2100. The Field route expands each repeating Time Slot into an occurrence array before the editor compares the returned Events with its draft Time Slots.
  Evidence: `CONFLICT_LOOKUP_START` and `CONFLICT_LOOKUP_END` in `apps/site/src/app/events/[id]/schedule/components/eventForm/slotConflictHelpers.ts` hold those bounds. `useEventSlotController.ts` calls `eventService.getBlockingForFieldInRange` once for each Field.
- Observation: The backend already has one batch blocker loader for Matches, One-Time Events, Event Time Slots, and active rental bookings. The scheduler and public rental availability use this loader, but the Event Editor uses the older Field route.
  Evidence: `listFieldSchedulingConflictDetails`, `listFieldSchedulingConflicts`, and `attachFieldSchedulingConflicts` are in `apps/site/src/server/repositories/events.ts`.
- Observation: The scheduler can use a wider window than the blocker window that was loaded with the Event. Open-ended scheduling first adds 52 weeks, can increase the window from demand, and can add up to three retry extensions. The blocker loader adds only 52 weeks to the stored Event end before these changes occur.
  Evidence: `resolveFieldConflictWindowEnd` in `apps/site/src/server/repositories/events.ts` uses `FIELD_CONFLICT_LOOKAHEAD_WEEKS`. `prepareScheduleWindow` and the retry loop in `apps/site/src/server/scheduler/scheduleEvent.ts` can move `event.end` later.
- Observation: The Schedule transaction locks only the current Event. It does not serialize two Events that try to occupy the same Field. The shared blocker loader also filters Event and Match blockers by organization when an organization ID is present.
  Evidence: `apps/site/src/app/api/events/[eventId]/schedule/route.ts` calls `acquireEventLock` before `reconcileEventSchedule`. `listFieldSchedulingConflictDetails` applies `scopedOrganizationId` to Event and Match queries.
- Observation: Every stored Match, One-Time Event, One-Time Time Slot, and rental booking is finite. A Weekly Event with No Planned End is the only true infinite Event. Loading its repeating Time Slot definition avoids creating an infinite or arbitrary-horizon occurrence array.
  Evidence: `apps/site/src/lib/repeatingTimeSlotAvailability.ts` represents recurrence as weekday, local-time, named-time-zone, and optional date-bound input. The current 370-day and 52-week constants are enumeration guards, not Event end values.

## Decision Log

- Decision: Keep one-time slots same-day and change only repeating slots to allow an end time on the next local date.
  Rationale: One-time slots already carry exact start and end instants. The issue asks for repeating availability semantics, and changing one-time input would alter an established contract.
  Date/Author: 2026-08-18 / Codex.
- Decision: Treat a local wall-clock fold as invalid instead of selecting an earlier or later offset.
  Rationale: The issue requires ambiguous times to be rejected and forbids silent duplicate or omission behavior. The UI cannot express an offset choice, so rejection is the only deterministic input rule.
  Date/Author: 2026-08-18 / Codex.
- Decision: Use a canonical occurrence shape containing local date, local start and end components, resolved start and end instants, time-zone name, and duration.
  Rationale: Scheduler, diagnostics, UI presentation, and mobile acceptance need the same interval boundaries. Recomputing each path caused the current drift.
  Date/Author: 2026-08-18 / Codex.
- Decision: Preserve a null repeating end date and compare only explicit repeating date bounds.
  Rationale: An overnight end clock uses the next local date for occurrence resolution. A synthetic same-day bound changes the availability contract.
  Date/Author: 2026-08-18 / Codex.
- Decision: Remove overlap-only helper APIs after moving conflict checks to resolved occurrence intervals.
  Rationale: No production caller used the helpers. Keeping them would preserve a second interval model that ignores named time zones and daylight-saving transitions.
  Date/Author: 2026-08-19 / Codex.
- Decision: Keep the follow-up on `issue/27-repeating-time-slots` and do not create an integration branch.
  Rationale: The root `main` worktree contains unrelated uncommitted work. The issue branch keeps the review changes isolated.
  Date/Author: 2026-08-18 / Codex.
- Decision: Centralize the overnight warning formatter and local slot date-time adapter in the canonical repeating-slot helper.
  Rationale: League and rental editors, weekly sessions, and schedule helpers must use one warning and local-time contract.
  Date/Author: 2026-08-18 / Codex.

- Decision: Treat the Room event relation as the mobile read path for event Time Slots after refresh.
  Rationale: Room is the mobile source of truth. The detail screen must observe persisted data instead of a separate bootstrap list.
  Date/Author: 2026-08-21 / Codex.
- Decision: Keep the current commit subject `Fix: Complete repeating time-slot review regressions`.
  Rationale: It follows the mobile commit format `<Type>: <Sentence case summary>`. Rewriting an existing commit would change history without a confirmed subject requirement.
  Date/Author: 2026-08-21 / Codex.
- Decision: Deepen `listFieldSchedulingConflictDetails` into the single Field conflict module and expose one batch route for Event Editor checks.
  Rationale: The existing module already loads every required blocker source. Reusing it removes the duplicate recurrence expansion and keeps editor diagnostics aligned with scheduling.
  Date/Author: 2026-08-21 / Codex.
- Decision: Treat `fieldId` as the occupancy scope after the server verifies that the caller can manage the selected Fields. Use organization membership for authorization and redaction, not to omit a blocker on an occupied Field.
  Rationale: A rental or another authorized cross-organization use can occupy the same physical Field. A conflict query must not hide that interval.
  Date/Author: 2026-08-21 / Codex.
- Decision: Keep `TimeSlots.endDate` as organizer input. Use an existing Event's `scheduleEndConstraint` or `generatedScheduleEnd` when it has one. Keep a No Planned End Weekly Event as an unbounded recurrence definition.
  Rationale: A generated Schedule end is Schedule output. Persisting it as a recurrence cutoff would change Event Configuration and would prevent a later Schedule extension.
  Date/Author: 2026-08-21 / Codex.
- Decision: Load every relevant stored blocker on the selected Fields that can overlap after the earliest draft or Schedule start. Do not require an upper query bound for Set End from Schedule.
  Rationale: Concrete rows are finite in the database. Unbounded Weekly Event Time Slots are finite recurrence definitions. The complete lower-bound blocker catalog therefore does not require generated occurrences through an invented end date.
  Date/Author: 2026-08-21 / Codex.
- Decision: After a Schedule mutation succeeds, set the target League or Tournament Event's `Events.generatedScheduleEnd` to the latest end among that Event's placed Matches in the accepted Schedule.
  Rationale: This value records Schedule output on the Event being built or rebuilt. It does not mutate a blocker Event, a Match, or `TimeSlots.endDate`. Unplaced Matches do not contribute to the value.
  Date/Author: 2026-08-21 / Codex.
- Decision: Compare an open-ended draft repeating Time Slot with another open-ended repeating Time Slot as recurrence rules, not as occurrences materialized through an arbitrary date.
  Rationale: Fetching all Weekly Event definitions removes the data horizon, but it does not by itself prove whether two infinite rules intersect. The conflict module must own that rule-level comparison.
  Date/Author: 2026-08-21 / Codex.
- Decision: Treat Time Slot conflict warnings and Schedule placement checks as two distinct operations that share one Field blocker module.
  Rationale: The Event Editor starts a read-only warning check while a user creates or edits a Time Slot. It can still save while the check runs, and it never mutates `generatedScheduleEnd`. Build Schedule and Rebuild Schedule later use the same blocker semantics to prevent actual Match overlap and mutate Schedule output.
  Date/Author: 2026-08-21 / Codex.



## Outcomes & Retrospective

- The site resolver now returns strict local-date occurrences. It rejects daylight-saving gaps and folds.
- Overnight slots end on the next local date. Site and mobile forms show the next-weekday warning.
- Follow-up verification on 2026-08-18: four focused site suites and 46 tests passed. Site TypeScript validation passed. The overnight warning interaction test now changes the weekday and both time controls. The rental modal test preserves the dated API validation message.
- Follow-up verification on 2026-08-18: the schedule helper regression suite passed 4 tests. The complete focused set therefore covered five suites and 50 tests.
- Site scheduler, diagnostics, weekly sessions, field calendars, and API validation use the resolver.
- Mobile validation, editor payloads, Room mapping, and weekly presentation use the same local-time contract.
- Site verification passed: 10 Jest suites and 117 tests passed. Site TypeScript validation passed. Changed-site ESLint completed with 0 errors and 7 exhaustive-deps warnings in the existing schedule page.
- Mobile verification passed: the canonical model test, five targeted Compose classes, and the complete `:composeApp:testDebugUnitTest` task completed with `BUILD SUCCESSFUL`.
- Defect remediation verification passed: canonical persistence, external conflict gating, mobile final-date overlap, named-zone weekly projections, and open-ended rental submission have regression coverage.
- Latest focused verification passed: 10 site Jest suites and 121 tests passed, site TypeScript validation passed, and the five targeted mobile classes plus the canonical model suite completed with `BUILD SUCCESSFUL`.
- Defect remediation verification on 2026-08-18: the field availability API now returns a structured 400 response for invalid repeating time zones instead of omitting availability. The public rental selection path preserves resolver messages for invalid slots. The site focused suite passed 10 suites and 124 tests. Site TypeScript validation passed. Mobile model and Compose checks passed with `BUILD SUCCESSFUL`.
- Final acceptance verification on 2026-08-18: 13 site Jest suites and 138 tests passed. Site TypeScript and changed-file ESLint checks passed. The core model check, targeted Compose classes, and complete `:composeApp:testDebugUnitTest` task passed with `BUILD SUCCESSFUL`.
- Complete site verification remains blocked by the unsynchronized branch suite: 8 failed suites, 19 failed tests, 841 passed tests, and 2 skipped tests.
- Verification on 2026-08-21: 11 focused site Jest suites and 131 tests passed. Site TypeScript and changed-file ESLint checks passed. The complete Android Compose unit suite and the iOS Room migration test passed with `BUILD SUCCESSFUL`.


- Post-review verification on 2026-08-20: the complete focused site suite passed 10 Jest suites and 129 tests. Site TypeScript and formatting checks passed. The mobile create component suite passed 65 tests, including the DST-gap no-write regression.

- Mobile persistence follow-up on 2026-08-21: event Time Slots now use the Room event relation during detail refreshes. The v100-to-v101 cache migration uses one shared SQL definition on Android and iOS. The iOS migration regression uses the repository naming convention.
- Rental editor verification on 2026-08-20: persisted Asia/Tokyo calendar dates round-trip as local calendar values, and the focused modal suite passed.
- Latest follow-up verification: 7 focused site suites and 53 tests passed. Site TypeScript and targeted ESLint checks passed. Focused Android and iOS Gradle tests passed with `BUILD SUCCESSFUL`.
- Full site suite on 2026-08-20: `npm run test:ci` ran all test suites and reported 9 failed suites, 1 skipped suite, and 841 passed suites. It reported 21 failed tests and 2 skipped tests. Jest exited before `coverage:check-routes`.
- Field-conflict review on 2026-08-21 found an unbounded Event Editor request and an incomplete Schedule blocker horizon. The corrected design loads a complete lower-bound blocker catalog, evaluates recurring rules on demand, keeps Field-scoped serialization, and derives the generated Schedule end from accepted Matches. No implementation change was made during this review.

## Context and Orientation

The site is under `apps/site`. `apps/site/src/lib/timeSlotAvailability.ts` resolves one-time slot instants and reports validation errors. `apps/site/src/app/events/[id]/schedule/components/eventForm/slotValidation.ts` and `schema.ts` produce form errors. `apps/site/src/app/discover/components/eventDetail/weeklySessions.ts` builds public weekly registration sessions. `apps/site/src/server/events/weeklyOccurrences.ts` validates selected weekly occurrence dates for API actions. The server scheduler is under `apps/site/src/server/scheduler` and currently expands recurring slots with `Date` arithmetic.

The mobile app is under `apps/mobile`. `EventScheduleRules.kt` validates editable slots. `LeagueScheduleFields.kt` renders the shared Compose slot editor. `EventDetailWeeklySchedulePresentation.kt` renders weekly sessions. `TimeSlot.kt` and the event editor DTO and repository mappers carry slot input and persisted results. Room is the mobile source of truth after a fetch; remote results must be written before UI observation.

A local wall-clock value is a calendar date and clock time in a named IANA time zone, such as `2026-03-08 02:30 America/New_York`. A daylight-saving gap is a local time that does not exist because clocks move forward. A fold is a local time that occurs twice because clocks move backward. The resolver must reject both. An overnight interval has an end clock value less than or equal to its start clock value and therefore uses the following local calendar date for its end.

A Field blocker is an occupied interval or a stored recurrence definition on one persisted Field. The sources are placed Matches, One-Time Events, repeating or One-Time Event Time Slots, and active rental booking items in `PENDING_PAYMENT` or `CONFIRMED` state. `apps/site/src/server/repositories/events.ts` currently materializes these sources into intervals in `listFieldSchedulingConflictDetails`.

The Event Editor does not use that shared loader. `useEventSlotController.ts` calls `eventService.getBlockingForFieldInRange` for each selected Field. That method calls `GET /api/events/field/[fieldId]`. The editor sends 1970 and 2100 as fixed bounds, receives complete Event and Time Slot records, and performs the overlap comparison in the browser. An open-ended Weekly Event can therefore create thousands of server occurrence objects even though one stored recurrence definition contains the required rule.

The canonical Event end terms are Planned End, Set End from Schedule, and No Planned End. A Time Slot end date is organizer input. `scheduleEndConstraint` is the fixed Planned End value. `generatedScheduleEnd` belongs to the target League or Tournament Event row and records output from its current built Schedule. A new Set End from Schedule operation has no generated end until the scheduler places all finite Match demand. Build Schedule or Rebuild Schedule replaces the target Event's value with the latest end among its placed Matches. Delete Schedule clears it. The current persistence path also mirrors the value into `Events.end` as a compatibility projection. It does not write the value to a blocker Event or to `TimeSlots.endDate`. A Weekly Event with No Planned End is an unbounded blocker rule.

The Schedule route runs in one Prisma transaction and takes an advisory lock for the current Event. `loadEventWithRelations` currently attaches only blocker occurrences inside a preselected window. The corrected module instead loads every relevant concrete row and recurring rule on the selected Fields that can overlap after the Schedule start. The current Event lock does not serialize another Event that uses the same Field. The authoritative check must therefore use Field-scoped serialization that every occupancy writer shares, or an equivalent database constraint.

The first operation is the Event Editor warning check. A client Time Slot add or edit starts the check after the draft has a Field and a valid date-time shape. The proposed batch route loads and compares blockers on the server, then returns warning data to the client. The operation is read only. Current product behavior permits save while this warning check is pending and treats reported Field conflicts as warnings.

The second operation is authoritative Schedule placement. It runs only when Build Schedule, Rebuild Schedule, or lock-preserving rescheduling runs on the server. It checks each proposed Match before placement. Only a successful Schedule mutation writes the target Event's `generatedScheduleEnd`. Time Slot creation and its warning check never write this field.

## Plan of Work

First, add a site resolver that accepts a repeating slot and an occurrence local date. It will validate the local date, weekday, date bounds, minute range, and time-zone name. It will resolve both local endpoints with a strict round-trip and offset check. It will add one local day to the end date for an overnight interval. It will return the exact `Date` values plus local components and duration. The error type will include the affected date and a stable code.

Next, replace same-day arithmetic in the site weekly session list, selected-session validation, server weekly occurrence start calculation, scheduler expansion, and diagnostics helpers with this resolver. Keep resource and division overlap checks on resolved instants. Mixed repeating and one-time checks will compare the same `Date` interval values.

Then, update the site form schema and conflict helper. The form will allow an overnight repeating end time, show an inline next-weekday warning, and reject a gap or fold on the affected date. The payload mapper will preserve local components and the named time zone. The API validation path will use the same resolver before persistence or scheduling.

Finally, update mobile slot validation and Compose UI. Mobile will allow overnight end times, show the warning, keep the named time zone and local fields, and display the server error without writing invalid data to Room. Mobile weekly presentation and scheduling fixtures will decode and display the same resolved instants. Add tests for both platforms and run focused type, unit, and smoke checks.

For the post-review conflict work, replace `listFieldSchedulingConflictDetails` with one source-aware Field blocker catalog instead of adding another recurrence implementation. Verify management access for every requested Field before loading detail. Query occupancy by Field ID after this authorization step. Do not use organization ID to exclude a real blocker.

Use the earliest draft Time Slot start or the Event start as the lower bound. Load placed Matches whose end is later than that bound. Load One-Time Events, One-Time Time Slots, and active rental booking items whose end is later than that bound. Load repeating Time Slot definitions whose configured or parent Event end is absent or not before the bound. Exclude the Event being edited or scheduled. Include only active, non-template, non-archived sources. A row that starts before the lower bound but ends after it must remain in the catalog.

Weekly Events with No Planned End remain recurrence definitions in the catalog. Existing Planned End Events use `scheduleEndConstraint`. Existing Set End from Schedule Events use `generatedScheduleEnd` when it exists. Do not generate every weekly occurrence during the load. Store concrete intervals in start order per Field and store recurring rules separately.

Add one lower-bound batch route at `apps/site/src/app/api/events/field-conflicts/route.ts`. It accepts the Event identity when one exists, the organization context for authorization, and the complete canonical draft Time Slots. The server derives unique Field IDs, loads the blocker catalog once, compares the draft input on the server, and returns typed conflicts keyed by draft slot. Replace the per-Field calls in `useEventSlotController.ts` and remove the 1970 and 2100 constants after all callers use the batch route. Do not return complete Event, Time Slot, or Match records to the browser.

This batch route is called while the user creates or edits a Time Slot. It is a client-triggered, server-evaluated warning check. It does not build Matches, save the Time Slot, or mutate any Event end field. Keep the existing non-blocking warning behavior unless a separate product decision changes it.

For a finite draft interval or proposed Match, check the sorted concrete intervals and resolve only the recurring occurrences that can touch that candidate. For an open-ended draft repeating Time Slot, compare it with stored repeating Time Slots as recurrence rules and return the first concrete overlap when one exists. This rule-level operation must use the canonical named-time-zone and daylight-saving resolver. It must not report no conflict only because an arbitrary calendar horizon ended.

Make the Schedule check authoritative inside the existing Schedule transaction. Acquire the current Event lock and stable, ordered locks for every selected Field before loading blockers. Load one complete lower-bound blocker catalog. Run Build Schedule, Rebuild Schedule, or lock-preserving rescheduling from a clean target Event snapshot. Every proposed Match is a finite interval, so check that candidate directly against the catalog before placement. After the Schedule mutation succeeds, calculate the latest end among placed Matches that belong to the target Event. Assign that instant to the target Event's `generatedScheduleEnd`. Run a final overlap assertion and persist the target Event mutation and its Matches in the same transaction. Any conflict or write failure rolls back both.

The scheduler still needs a termination guard for invalid or fully blocked recurrence input. This guard returns a typed scheduling failure. It never accepts an unchecked candidate and does not act as an Event end. Make Event creation, Event Time Slot changes, rental confirmation, and other Field occupancy writers use the same ordered Field locks. This closes the race between two different Events on one Field.

## Concrete Steps

Run site commands from `/Users/elesesy/StudioProjects/bracketiq-issue-27/apps/site`.

Run the focused site tests.

    npx jest --runInBand --runTestsByPath src/lib/__tests__/repeatingTimeSlotAvailability.test.ts src/app/discover/components/eventDetail/__tests__/weeklySessions.test.ts src/app/api/time-slots/__tests__/route.test.ts 'src/app/organizations/[id]/__tests__/page.test.tsx' src/server/__tests__/publicOrganizationCatalog.test.ts 'src/app/events/[id]/schedule/components/eventForm/__tests__/slotValidation.test.ts' 'src/app/events/[id]/schedule/components/eventForm/__tests__/slotConflictHelpers.test.ts' 'src/app/events/[id]/schedule/schedulePage/__tests__/helpers.weeklyOccurrences.test.ts' 'src/app/api/time-slots/[id]/__tests__/route.test.ts' src/server/scheduler/__tests__/leagueTimeSlots.test.ts

Observe a Jest summary with every selected suite passing.

Run site type checking.

    npx tsc --noEmit

Observe no TypeScript diagnostics.

Run the core mobile model check from `/Users/elesesy/StudioProjects/bracketiq-issue-27/apps/mobile`.

    ./gradlew :core:model:testDebugUnitTest --tests 'com.razumly.mvp.core.data.dataTypes.TimeSlotCanonicalAvailabilityTest'

Observe `BUILD SUCCESSFUL`.

Run the Compose mobile checks.

    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventDetail.LeagueSlotValidationTest' --tests 'com.razumly.mvp.eventDetail.EventEditPayloadBuilderTest' --tests 'com.razumly.mvp.eventCreate.DefaultCreateEventComponentTest' --tests 'com.razumly.mvp.eventDetail.EventDetailWeeklyBehaviorTest' --tests 'com.razumly.mvp.eventDetail.EventDetailsValidationTest'

Observe `BUILD SUCCESSFUL` and passing reports for every selected class.

Do not start a runtime unless the current request authorizes that state change.

Update this plan after each implementation milestone.

Record focused test results and the acceptance outcome in `Outcomes & Retrospective`.

After the Field conflict implementation, run these focused site tests from `/Users/elesesy/StudioProjects/bracketiq-issue-27/apps/site`.

    npx jest --runInBand --runTestsByPath src/server/repositories/__tests__/events.fieldSchedulingConflicts.test.ts src/server/scheduler/__tests__/eventScheduleMutation.test.ts src/app/api/events/field-conflicts/__tests__/route.test.ts 'src/app/events/[id]/schedule/components/eventForm/__tests__/slotConflictHelpers.test.ts'

Observe passing regressions for the lower-bound batch request, typed Match blockers, lazy unbounded Weekly Event checks, Field-scoped serialization, and a null repeating Time Slot end after scheduling.

## Validation and Acceptance

The resolver test must show that a Monday 22:00–02:00 slot returns a Tuesday end instant and a next-weekday warning. A New York spring-forward local time such as 02:30 on the transition date must return a dated gap error. A New York fall-back local time such as 01:30 on the transition date must return a dated ambiguous-time error. A slot outside its start or end date bounds must not produce an occurrence. The scheduler and diagnostics tests must observe the same start, end, and duration values. A repeating overnight slot and a one-time slot with shared resources and divisions must produce the same overlap result on the site and mobile paths.

The form tests must show the inline warning before submit and block invalid daylight-saving input. Mobile tests must show the same warning and must not persist a rejected slot. Focused tests and type checks must pass. The final issue comment must record the verified behavior, and the issue must close only after all dependency and project fields are updated according to `docs/agents/issue-tracker.md`.

The post-review conflict acceptance adds six observable cases. The Event Editor sends one batch request for all selected Fields and sends no 1970, 2100, or guessed Schedule end. A placed Match appears as a typed Match conflict when the caller can view it and as an opaque occupied interval otherwise. A concrete blocker that starts before the lower bound but ends after it remains a conflict. A No Planned End Weekly Event remains one recurrence definition and blocks a proposed Match at a far-future occurrence without pre-expanding earlier occurrences. Two concurrent Schedule mutations for different Events on the same Field cannot both commit overlapping Matches. Build Schedule and Rebuild Schedule leave a null repeating `TimeSlots.endDate` unchanged.

Add a Schedule regression with no generated end at input. Put an unbounded Weekly Event rule on the selected Field and place one proposed Match on a far-future occurrence of that rule. The candidate-level check must reject that placement without loading all intervening occurrences. The scheduler must place around the blocker, leave the Match unscheduled with the approved restricting factor, or fail and roll back. Add another regression that starts two transactions for different Events on one Field and proves that the second transaction observes the first committed occupancy after it acquires the shared Field lock.

Add an Event Editor regression for two active unbounded repeating Time Slots. The rule-level comparator must return their first actual named-time-zone overlap or prove that their weekday and local-time rules do not intersect. Changing a numeric horizon must not change that result.

Add a flow-separation regression. Creating or editing a Time Slot must call the batch warning route and render its typed conflicts without changing `generatedScheduleEnd`. A separate Build Schedule action must invoke candidate-level Match checks and update `generatedScheduleEnd` only after the Schedule transaction succeeds.

## Idempotence and Recovery

The edits are source-only and can be repeated. Do not run migrations unless a schema change becomes necessary. If a focused test reveals a legacy slot with an invalid time-zone value, preserve the stored value for read-only display but return a dated validation error for new or edited input. If a mobile test database is required, read `docs/agents/workstream-database-isolation.md` before creating it and use a workstream-specific database.

## Artifacts and Notes

The main artifacts are the strict occurrence resolver, its focused tests, the site and mobile callers, and this living plan. Keep evidence concise in the final issue comment and completion response.

## Interfaces and Dependencies

The site resolver is in `apps/site/src/lib/repeatingTimeSlotAvailability.ts`. It exposes:

    resolveRepeatingTimeSlotOccurrence(slot: RepeatingTimeSlotIntervalInput, occurrenceDate: string): ResolvedRepeatingTimeSlot

The input contains the repeating slot fields, including `daysOfWeek`, `startDate`, `endDate`, `startTimeMinutes`, `endTimeMinutes`, and `timeZone`. The output contains `occurrenceDate`, `endDate`, `start`, `end`, `durationMinutes`, `isOvernight`, `nextWeekday`, resource IDs, and division IDs. The resolver throws `RepeatingTimeSlotValidationError` with a stable code for invalid local times.

The mobile resolver is `TimeSlot.resolveRepeatingOccurrence(occurrenceDate: LocalDate)` in `apps/mobile/core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/TimeSlot.kt`. It returns `ResolvedRepeatingTimeSlotInterval` with the same local dates, resolved instants, duration, time-zone name, resources, and divisions.

Mobile input keeps `TimeSlot.startTimeMinutes`, `TimeSlot.endTimeMinutes`, `TimeSlot.startDate`, `TimeSlot.endDate`, `TimeSlot.daysOfWeek`, and `TimeSlot.timeZone`. Mobile does not import site TypeScript or Prisma types. The server remains the authority for accepted daylight-saving resolution. Mobile validation rejects invalid input before persistence and displays the server's dated error.

The Field conflict module exposes a `FieldBlockerCatalog`. It stores sorted concrete intervals by `fieldId` and stores recurring blocker definitions separately. Each source uses a `MATCH`, `ONE_TIME_EVENT`, `EVENT_TIME_SLOT`, or `RENTAL_BOOKING` variant. The internal variant retains only the identifiers required for an authorized label or scheduler block. The public-safe result can omit all source identifiers.

The catalog loader accepts `client`, selected `fieldIds`, `excludeEventId`, and one `lowerBound`. It has no upper-bound parameter. Concrete queries use an overlap predicate based on `end > lowerBound`; they do not use `start > lowerBound`. Repeating queries retain a definition when its effective end is absent or is not before the lower bound.

The batch route is `POST /api/events/field-conflicts`. Its request carries one Event context and canonical draft Time Slots. The server derives Field IDs instead of trusting a separate caller-provided list. Its response contains a typed conflict list keyed by the stable draft slot key. The editor service exposes one batch method. No component calls `GET /api/events/field/[fieldId]` for Event Editor conflict checks after the cutover.

The Event Editor calls the batch route after a draft Time Slot's Field or temporal rule changes. The response updates transient `checking` and `conflicts` form metadata. This metadata does not make the form dirty. The request is read only and does not persist the draft.

The scheduler uses `findFieldConflictsForInterval(catalog, fieldIds, start, end)` for each proposed Match. This function searches concrete intervals and resolves only recurring occurrences that can overlap the finite candidate. The Event Editor also uses `findFirstRepeatingFieldConflict(catalog, draftSlot)` for an open-ended repeating draft. That function compares recurrence rules and returns a concrete resolved overlap instead of enumerating through a fixed year.

The authoritative Schedule mutation owns the target Event snapshot, the ordered Field locks, the lower-bound catalog, and the final overlap assertion. The pure scheduler remains deterministic for one catalog. It returns a Schedule only after every proposed placement passes the candidate-level conflict check. The mutation then persists `generatedScheduleEnd` on that target Event as the maximum end of its placed Matches. Unplaced Matches do not contribute.

### Revision note

Created on 2026-08-18 after repository and dependency inspection. This plan records the issue #27 scope and the strict rejection policy for daylight-saving gaps and folds before implementation.

Updated on 2026-08-18 after implementation review. Replaced placeholder validation commands with concrete site and mobile commands, aligned the interface section with the resolver output, and recorded the completed verification scope. This change makes the living plan self-contained and accurate after implementation.

Updated on 2026-08-19 after the standards review. Added timestamps, corrected the resolver signatures, documented expected command output, and recorded the removal of unused overlap-only APIs.

Updated on 2026-08-18 after final verification. Recorded the passing site and mobile commands and the remaining lint warnings.

Updated on 2026-08-19 after the final bounds and field-calendar regressions. Recorded the latest focused site and mobile verification.

Updated on 2026-08-18 after defect remediation. Recorded strict resolver error propagation, slot-identified API diagnostics, the mobile warning fixture, and the latest site and mobile verification counts.

Updated on 2026-08-18 after final acceptance verification. Added repository and field API resolver-error regressions and recorded the complete mobile Compose suite.


Updated on 2026-08-20 after the post-review regressions. Recorded the configured-start horizon fix, no-fixed-end external conflict handling, mobile no-write coverage, and focused verification.

Updated on 2026-08-21 after the Room persistence follow-up. Recorded the event relation read path, shared migration SQL, and migration test naming.

Updated on 2026-08-21 after the commit-history review. Confirmed the latest subject follows the repository format and recorded that no history rewrite is needed.

Updated on 2026-08-21 after final verification. Recorded 11 passing site suites, TypeScript and ESLint checks, the complete Android unit suite, and the iOS migration test.

Updated on 2026-08-20 after the rental editor named-zone fix. Recorded the local calendar projection, payload preservation, and focused site and mobile verification.

Updated on 2026-08-21 after the Field conflict and Schedule-bound review. Recorded the existing shared blocker loader, the unbounded per-Field editor request, the organization-scope and concurrency risks, effective recurrence bounds, the bounded batch interface, and the required authoritative Schedule rerun before atomic persistence.

Updated on 2026-08-21 after the generated-end clarification. Replaced the guessed upper-bound and rerun design with a complete lower-bound blocker catalog. Weekly Events with No Planned End remain recurrence definitions. Finite Match candidates are checked lazily, and the latest placed Match in the target Event's accepted Schedule sets `generatedScheduleEnd`.

Updated on 2026-08-21 after the generated-end ownership clarification. Specified that a successful Schedule mutation writes `Events.generatedScheduleEnd` only on the target League or Tournament Event. The value is the maximum end of that Event's placed Matches in the accepted Schedule. It never mutates blocker Events or Time Slot recurrence bounds.

Updated on 2026-08-21 after the conflict-flow clarification. Separated the client-triggered, server-evaluated Time Slot warning from authoritative Schedule placement. Only the latter mutates `generatedScheduleEnd`.