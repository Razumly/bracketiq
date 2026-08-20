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

## Surprises & Discoveries

- Observation: Existing repeating validation rejects every `endTimeMinutes <= startTimeMinutes`, so it cannot represent an overnight interval.
  Evidence: `apps/site/src/app/events/[id]/schedule/components/eventForm/slotValidation.ts` and `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventScheduleRules.kt` both use this condition.
- Observation: Existing site and server weekly presentation code constructs dates in the host JavaScript time zone and calls `Date#setHours`.
  Evidence: `apps/site/src/app/discover/components/eventDetail/weeklySessions.ts` and `apps/site/src/server/events/weeklyOccurrences.ts` do not resolve local wall-clock values through the slot time zone.
- Observation: `kotlinx-datetime` provides `LocalDateTime.toInstant(timeZone)` but its default behavior does not prove a strict gap/fold policy.
  Evidence: the installed 0.8.0 source was inspected before implementation; the implementation must compare round-tripped local components and inspect offsets before accepting a value.
- Observation: `CreateRentalSlotModal` filled a missing repeating end date while slot props changed because the default non-repeating effect ran before the repeating state update.
  Evidence: the new modal regression observed a synthetic same-day `endDate` in the update payload for an overnight slot with no configured end date.

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

- Post-review verification on 2026-08-20: the complete focused site suite passed 10 Jest suites and 129 tests. Site TypeScript and formatting checks passed. The mobile create component suite passed 65 tests, including the DST-gap no-write regression.

## Context and Orientation

The site is under `apps/site`. `apps/site/src/lib/timeSlotAvailability.ts` resolves one-time slot instants and reports validation errors. `apps/site/src/app/events/[id]/schedule/components/eventForm/slotValidation.ts` and `schema.ts` produce form errors. `apps/site/src/app/discover/components/eventDetail/weeklySessions.ts` builds public weekly registration sessions. `apps/site/src/server/events/weeklyOccurrences.ts` validates selected weekly occurrence dates for API actions. The server scheduler is under `apps/site/src/server/scheduler` and currently expands recurring slots with `Date` arithmetic.

The mobile app is under `apps/mobile`. `EventScheduleRules.kt` validates editable slots. `LeagueScheduleFields.kt` renders the shared Compose slot editor. `EventDetailWeeklySchedulePresentation.kt` renders weekly sessions. `TimeSlot.kt` and the event editor DTO and repository mappers carry slot input and persisted results. Room is the mobile source of truth after a fetch; remote results must be written before UI observation.

A local wall-clock value is a calendar date and clock time in a named IANA time zone, such as `2026-03-08 02:30 America/New_York`. A daylight-saving gap is a local time that does not exist because clocks move forward. A fold is a local time that occurs twice because clocks move backward. The resolver must reject both. An overnight interval has an end clock value less than or equal to its start clock value and therefore uses the following local calendar date for its end.

## Plan of Work

First, add a site resolver that accepts a repeating slot and an occurrence local date. It will validate the local date, weekday, date bounds, minute range, and time-zone name. It will resolve both local endpoints with a strict round-trip and offset check. It will add one local day to the end date for an overnight interval. It will return the exact `Date` values plus local components and duration. The error type will include the affected date and a stable code.

Next, replace same-day arithmetic in the site weekly session list, selected-session validation, server weekly occurrence start calculation, scheduler expansion, and diagnostics helpers with this resolver. Keep resource and division overlap checks on resolved instants. Mixed repeating and one-time checks will compare the same `Date` interval values.

Then, update the site form schema and conflict helper. The form will allow an overnight repeating end time, show an inline next-weekday warning, and reject a gap or fold on the affected date. The payload mapper will preserve local components and the named time zone. The API validation path will use the same resolver before persistence or scheduling.

Finally, update mobile slot validation and Compose UI. Mobile will allow overnight end times, show the warning, keep the named time zone and local fields, and display the server error without writing invalid data to Room. Mobile weekly presentation and scheduling fixtures will decode and display the same resolved instants. Add tests for both platforms and run focused type, unit, and smoke checks.

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

## Validation and Acceptance

The resolver test must show that a Monday 22:00–02:00 slot returns a Tuesday end instant and a next-weekday warning. A New York spring-forward local time such as 02:30 on the transition date must return a dated gap error. A New York fall-back local time such as 01:30 on the transition date must return a dated ambiguous-time error. A slot outside its start or end date bounds must not produce an occurrence. The scheduler and diagnostics tests must observe the same start, end, and duration values. A repeating overnight slot and a one-time slot with shared resources and divisions must produce the same overlap result on the site and mobile paths.

The form tests must show the inline warning before submit and block invalid daylight-saving input. Mobile tests must show the same warning and must not persist a rejected slot. Focused tests and type checks must pass. The final issue comment must record the verified behavior, and the issue must close only after all dependency and project fields are updated according to `docs/agents/issue-tracker.md`.

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

### Revision note

Created on 2026-08-18 after repository and dependency inspection. This plan records the issue #27 scope and the strict rejection policy for daylight-saving gaps and folds before implementation.

Updated on 2026-08-18 after implementation review. Replaced placeholder validation commands with concrete site and mobile commands, aligned the interface section with the resolver output, and recorded the completed verification scope. This change makes the living plan self-contained and accurate after implementation.

Updated on 2026-08-19 after the standards review. Added timestamps, corrected the resolver signatures, documented expected command output, and recorded the removal of unused overlap-only APIs.

Updated on 2026-08-18 after final verification. Recorded the passing site and mobile commands and the remaining lint warnings.

Updated on 2026-08-19 after the final bounds and field-calendar regressions. Recorded the latest focused site and mobile verification.

Updated on 2026-08-18 after defect remediation. Recorded strict resolver error propagation, slot-identified API diagnostics, the mobile warning fixture, and the latest site and mobile verification counts.

Updated on 2026-08-18 after final acceptance verification. Added repository and field API resolver-error regressions and recorded the complete mobile Compose suite.


Updated on 2026-08-20 after the post-review regressions. Recorded the configured-start horizon fix, no-fixed-end external conflict handling, mobile no-write coverage, and focused verification.