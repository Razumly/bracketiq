# Resolve repeating time slots across local dates and time zones

This ExecPlan is a living document. Maintain it with the requirements in `PLANS.md`.

## Purpose / Big Picture

Event organizers can configure a repeating time slot with a named time zone, selected weekdays, local start and end times, and date bounds. After this change, an overnight slot such as Monday 22:00–02:00 resolves to an interval that ends on Tuesday. The site and mobile app show the next-weekday warning before save. The scheduler, diagnostics, registration session list, and mobile Room data use the same resolved instants. A local time in a daylight-saving gap or fold is rejected with the affected date instead of being shifted or duplicated.

A human can verify the result by running the focused site and mobile tests. The tests cover an overnight interval, a daylight-saving gap, a daylight-saving fold, date-bound filtering, and mixed repeating and one-time resource/division overlap behavior.

## Progress

- [x] (2026-08-18) Read issue #27, repository rules, and the existing site and mobile time-slot paths.
- [x] (2026-08-18) Create the isolated `issue/27-repeating-time-slots` worktree and claim issue #27.
- [x] (2026-08-18) Define one strict local-date occurrence resolver for site scheduling and presentation.
- [x] (2026-08-18) Allow overnight repeating intervals and report their next local weekday.
- [x] (2026-08-18) Reject daylight-saving gaps and folds with a date-specific error.
- [x] (2026-08-18) Route scheduler and diagnostics through the canonical resolved occurrence data.
- [x] (2026-08-18) Update mobile editing, validation, Room mapping, and presentation for the same contract.
- [x] (2026-08-18) Add focused site and mobile regression tests.
- [x] (2026-08-18) Run focused checks, smoke scenarios, and issue completion gates.

## Surprises & Discoveries

- Observation: Existing repeating validation rejects every `endTimeMinutes <= startTimeMinutes`, so it cannot represent an overnight interval.
  Evidence: `apps/site/src/app/events/[id]/schedule/components/eventForm/slotValidation.ts` and `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventScheduleRules.kt` both use this condition.
- Observation: Existing site and server weekly presentation code constructs dates in the host JavaScript time zone and calls `Date#setHours`.
  Evidence: `apps/site/src/app/discover/components/eventDetail/weeklySessions.ts` and `apps/site/src/server/events/weeklyOccurrences.ts` do not resolve local wall-clock values through the slot time zone.
- Observation: `kotlinx-datetime` provides `LocalDateTime.toInstant(timeZone)` but its default behavior does not prove a strict gap/fold policy.
  Evidence: the installed 0.8.0 source was inspected before implementation; the implementation must compare round-tripped local components and inspect offsets before accepting a value.

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

## Outcomes & Retrospective

- The site resolver now returns strict local-date occurrences. It rejects daylight-saving gaps and folds.
- Overnight slots end on the next local date. Site and mobile forms show the next-weekday warning.
- Site scheduler, diagnostics, weekly sessions, field calendars, and API validation use the resolver.
- Mobile validation, editor payloads, Room mapping, and weekly presentation use the same local-time contract.
- Site verification passed: 14 suites and 144 tests. Site TypeScript validation passed.
- Mobile verification passed: the complete `:composeApp:testDebugUnitTest` suite.
- No known acceptance gap remains.

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

Run site commands from `/Users/elesesy/StudioProjects/bracketiq-issue-27/apps/site`. Run mobile commands from `/Users/elesesy/StudioProjects/bracketiq-issue-27/apps/mobile`.

Use `npm test -- --runInBand <focused test paths>` for focused site tests and `npx tsc --noEmit` for site type checking. Use the repository Gradle tasks documented in `apps/mobile/AGENTS.md` for common tests. Do not start a runtime unless an explicit current request authorizes that state change.

After each implementation milestone, update this plan's `Progress`, `Surprises & Discoveries`, and `Decision Log` sections when the design changes. At completion, add the focused test results and the acceptance outcome to `Outcomes & Retrospective`.

## Validation and Acceptance

The resolver test must show that a Monday 22:00–02:00 slot returns a Tuesday end instant and a next-weekday warning. A New York spring-forward local time such as 02:30 on the transition date must return a dated gap error. A New York fall-back local time such as 01:30 on the transition date must return a dated ambiguous-time error. A slot outside its start or end date bounds must not produce an occurrence. The scheduler and diagnostics tests must observe the same start, end, and duration values. A repeating overnight slot and a one-time slot with shared resources and divisions must produce the same overlap result on the site and mobile paths.

The form tests must show the inline warning before submit and block invalid daylight-saving input. Mobile tests must show the same warning and must not persist a rejected slot. Focused tests and type checks must pass. The final issue comment must record the verified behavior, and the issue must close only after all dependency and project fields are updated according to `docs/agents/issue-tracker.md`.

## Idempotence and Recovery

The edits are source-only and can be repeated. Do not run migrations unless a schema change becomes necessary. If a focused test reveals a legacy slot with an invalid time-zone value, preserve the stored value for read-only display but return a dated validation error for new or edited input. If a mobile test database is required, read `docs/agents/workstream-database-isolation.md` before creating it and use a workstream-specific database.

## Artifacts and Notes

The main artifacts are the strict occurrence resolver, its focused tests, the site and mobile callers, and this living plan. Keep evidence concise in the final issue comment and completion response.

## Interfaces and Dependencies

The canonical site resolver should expose a typed function in a site scheduling utility with an input containing `localDate`, `startTimeMinutes`, `endTimeMinutes`, `timeZone`, and optional date-bound fields, and an output containing `localStart`, `localEnd`, `start`, `end`, `durationMinutes`, and `overnight`. It must throw the existing typed scheduling validation error family with a stable code for invalid local times.

The mobile layer must keep `TimeSlot.startTimeMinutes`, `TimeSlot.endTimeMinutes`, `TimeSlot.startDate`, `TimeSlot.endDate`, `TimeSlot.daysOfWeek`, and `TimeSlot.timeZone` as the input contract. It must not import site TypeScript or Prisma types. The server remains the authority for accepted daylight-saving resolution; mobile validation must use the same reject-before-write behavior and display the server's dated error when the server rejects the input.

### Revision note

Created on 2026-08-18 after repository and dependency inspection. This plan records the issue #27 scope and the strict rejection policy for daylight-saving gaps and folds before implementation.
