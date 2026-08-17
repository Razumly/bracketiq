# Standardize Event Creation Inputs, Division-to-Field Mapping, and Weekly Multi-Day Slots Across Mobile, Web, and Backend

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, event creation and profile/signup inputs behave consistently across clients and backend: birthdays always use date-only pickers, time pickers always show AM/PM, league/tournament fields are always mapped to allowed divisions, playoff team count has explicit required validation (no hidden defaults), and league timeslots support selecting multiple weekdays in one row. The direct user-visible result is fewer scheduling failures (especially "no fields available for division ..."), clearer form behavior, and parity between mobile and web.

The behavior is verified by creating/editing league and tournament events in both apps, confirming field/division assignment in payloads, and successfully generating schedules with no field/division mismatch errors.

## Progress

- [x] (2026-02-14 17:55Z) Audited current KMP/mobile form code, web `EventForm`/`LeagueFields`, and backend scheduler/repository/API paths.
- [x] (2026-02-14 17:55Z) Identified concrete root causes for each reported issue and produced cross-repo file-level implementation plan.
- [x] (2026-02-14 19:20Z) Implemented Milestone 1 compatibility contract across KMP and web/backend (`dayOfWeek` + `daysOfWeek`, DOB/date-only, AM/PM UI semantics).
- [x] (2026-02-14 19:20Z) Implemented Milestone 2 KMP/mobile form and create-flow fixes (DOB pickers, AM/PM Android time picker, field/division mapping, multi-day slot fan-out, playoff validation behavior).
- [x] (2026-02-14 19:20Z) Implemented Milestone 3 web form changes (`EventForm` + `LeagueFields`) including multi-day day selector, local field division selector, playoff required validation, and AM/PM time select controls.
- [x] (2026-02-14 19:20Z) Implemented Milestone 4 backend compatibility and safeguards (`events` repository division fallback + slot expansion, scheduler multi-day handling, API mapping normalization, time-slot API compatibility).
- [ ] Milestone 5 complete: end-to-end validation across both repos, regression checks, and rollout notes (tests were updated but full test execution was deferred to avoid concurrent test interference with another running agent).

## Surprises & Discoveries

- Observation: Android `PlatformTextField` uses a special read-only `onTap` branch that renders a custom box without the same label/layout behavior as standard outlined fields.
  Evidence: `composeApp/src/androidMain/kotlin/com/razumly/mvp/core/presentation/composables/PlatformTextField.android.kt`.
- Observation: League scoring mode in KMP is controlled by both a checkbox and a dropdown, creating duplicate control paths.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/LeagueConfigurationFields.kt`.
- Observation: KMP playoffs toggle currently assigns a default `playoffTeamCount` of `4` when enabled.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/LeagueConfigurationFields.kt`.
- Observation: Scheduler throws a "no fields are available ... for divisions ..." error when resources for the active division are empty.
  Evidence: `~/Projects/MVP/mvp-site/src/server/scheduler/Schedule.ts`.
- Observation: Existing backend/storage contract for time slots is single-day (`dayOfWeek`), while requested UX is multi-select weekdays.
  Evidence: `~/Projects/MVP/mvp-site/prisma/schema.prisma`, `~/Projects/MVP/mvp-site/src/types/index.ts`.
- Observation: Prisma `TimeSlots` model currently does not include a `daysOfWeek` column, so compatibility must persist per-day rows and avoid direct Prisma writes to `daysOfWeek` until a schema migration is introduced.
  Evidence: `~/Projects/MVP/mvp-site/prisma/schema.prisma`, `~/Projects/MVP/mvp-site/src/app/api/time-slots/route.ts`.

## Decision Log

- Decision: Use a compatibility-first migration for multi-day weekly slots by introducing a `daysOfWeek` list while preserving support for legacy `dayOfWeek` during rollout.
  Rationale: Enables multi-select UX without breaking existing rows, existing scheduler behavior, or legacy API callers.
  Date/Author: 2026-02-14 / Codex.
- Decision: Keep one scoring-format control in KMP (checkbox path) and remove duplicate dropdown behavior.
  Rationale: Eliminates conflicting state updates and addresses reported click/interaction confusion.
  Date/Author: 2026-02-14 / Codex.
- Decision: Enforce explicit field-to-division mapping at create/edit time and add backend fallback (`event.divisions`, then `OPEN`).
  Rationale: Prevents scheduler resource-group emptiness when new fields are created without division assignments.
  Date/Author: 2026-02-14 / Codex.
- Decision: Keep Prisma storage backward-compatible by expanding multi-day rows into one persisted timeslot per day and returning normalized `daysOfWeek` in API responses; defer schema migration for a native `daysOfWeek` column.
  Rationale: Supports immediate multi-select UX without blocking on database migration and avoids runtime Prisma unknown-field errors.
  Date/Author: 2026-02-14 / Codex.
- Decision: Treat `playoffTeamCount` as required only when playoffs are enabled, with no default assignment.
  Rationale: Meets UX requirement and prevents silent configuration drift.
  Date/Author: 2026-02-14 / Codex.

## Outcomes & Retrospective

Implementation outcome: KMP/mobile, web form, and backend scheduling/contract changes are now in place for the reported issues (DOB pickers, AM/PM time, field/division mapping, single scoring control path, playoff required validation, and multi-day slot compatibility).

Regression outcome: targeted tests were added/updated in both repositories for create-flow mapping, payload normalization, scheduler multi-day behavior, and division fallback logic. Full suite execution is pending to avoid interfering with another agent already running tests.

## Context and Orientation

Two repositories are involved.

The KMP mobile app lives in this repository (`/home/camka/Projects/MVP/mvp-app`). Relevant files include:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/LeagueConfigurationFields.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/LeagueScheduleFields.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileFeatureScreens.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/userAuth/AuthScreen.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/userAuth/AuthComponent.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt`
- `composeApp/src/androidMain/kotlin/com/razumly/mvp/core/presentation/composables/PlatformDatePicker.android.kt`
- `composeApp/src/androidMain/kotlin/com/razumly/mvp/core/presentation/composables/PlatformTextField.android.kt`

The web app and backend live in `~/Projects/MVP/mvp-site` (`/home/camka/Projects/MVP/mvp-site`). Relevant files include:

- `src/app/login/page.tsx`
- `src/app/profile/page.tsx`
- `src/app/events/[id]/schedule/components/EventForm.tsx`
- `src/app/discover/components/LeagueFields.tsx`
- `src/lib/eventService.ts`
- `src/lib/fieldService.ts`
- `src/lib/leagueService.ts`
- `src/types/index.ts`
- `src/app/api/time-slots/route.ts`
- `src/app/api/time-slots/[id]/route.ts`
- `src/server/repositories/events.ts`
- `src/server/scheduler/Schedule.ts`
- `src/server/scheduler/types.ts`
- `prisma/schema.prisma`

Definitions used in this plan:

- Date-only picker means user selects a calendar date without hour/minute.
- AM/PM time means 12-hour display with meridiem indicator.
- Field/division mapping means each field records which divisions are allowed on that field.
- Multi-day slot means one weekly slot row can represent multiple weekdays.

## Plan of Work

### Milestone 1: Contract and Compatibility Baseline

Define shared input and scheduling contracts before UI edits. In `mvp-site/src/types/index.ts`, add `daysOfWeek?: number[]` to `TimeSlot` while keeping `dayOfWeek` during transition. In KMP `TimeSlot` model (`composeApp/.../TimeSlot.kt`), add parallel optional list support (`daysOfWeek: List<Int>?`) and keep existing `dayOfWeek` read/write compatibility.

In backend APIs (`src/app/api/time-slots/route.ts`, `src/app/api/time-slots/[id]/route.ts`) and mapping layers (`src/lib/eventService.ts`, `src/lib/fieldService.ts`, `src/lib/leagueService.ts`), normalize incoming/outgoing slot data so legacy single-day values still work and new multi-day values are preserved.

Acceptance for this milestone is that both old payloads (only `dayOfWeek`) and new payloads (`daysOfWeek`) parse and round-trip without runtime errors.

### Milestone 2: KMP Mobile Form and Create-Flow Fixes

Update birthday/date input behavior:

- In `AuthScreen.kt` + `AuthComponent.kt` + `UserRepository.kt`, add signup DOB input and wire `dateOfBirth` through `RegisterRequestDto`.
- In `ProfileFeatureScreens.kt`, replace child DOB free-text entry with a date-only picker using `PlatformDateTimePicker(getTime = false)`.

Update time picker behavior and field alignment:

- In `PlatformDatePicker.android.kt`, switch `rememberTimePickerState(..., is24Hour = false)` for AM/PM.
- In `PlatformTextField.android.kt`, remove read-only tap-layout mismatch by rendering a consistent labeled field container in tap mode so Date/DateTime rows align with dropdown rows.

Update competition settings and playoffs:

- In `LeagueConfigurationFields.kt`, keep checkbox as scoring source-of-truth and remove dropdown path.
- Make labeled checkbox rows toggleable across full row hit area.
- Remove implicit playoff team default assignment and require explicit value when playoffs enabled.

Update division mapping and multi-day slots in create flow:

- In `LeagueScheduleFields.kt`, add per-field division selector adjacent to field name and convert slot day selector to multi-select weekdays.
- In `DefaultCreateEventComponent.kt`, carry field divisions into created fields and fan-out multi-day slots into concrete time slot records for creation.
- Ensure fallback for empty divisions is deterministic (`event.divisions` then `OPEN`).

Acceptance for this milestone is that creating a new league with local fields, explicit field divisions, and multi-day slots produces valid event payloads with no empty-field-division scheduling failures.

### Milestone 3: Web Form Fixes (Signup/Profile/EventForm)

Update DOB date inputs:

- In `src/app/login/page.tsx`, enforce date-only calendar UX and normalize date string handling (no time component).
- In `src/app/profile/page.tsx`, keep child DOB as date-only picker and ensure submitted value normalization is date-only.

Update event form behavior:

- In `EventForm.tsx`, standardize DateTimePicker visual alignment with other form controls in the basics/location sections.
- In `LeagueFields.tsx` and related state in `EventForm.tsx`, add division multi-select next to each field name row.
- Convert weekly slot day control from single `dayOfWeek` select to multi-day selection.
- Ensure playoff team count is empty by default and validated as required when playoffs are enabled.
- Ensure only one scoring-format control path is shown for the user-facing league settings context.

Update time picker AM/PM presentation:

- Replace or wrap time-only controls (`TimeInput`) where necessary to provide 12-hour AM/PM selection and labels.

Acceptance for this milestone is that web create/edit flows match the requested interaction model and emit normalized payloads compatible with backend compatibility layer.

### Milestone 4: Backend Repository and Scheduler Robustness

Implement backend protections and compatibility:

- In `src/server/repositories/events.ts`, when upserting fields, prefer explicit field divisions from payload; if absent, fallback to event divisions; if still absent, use `OPEN`.
- In `loadEventWithRelations` field builder, prevent empty scheduler groups by applying same fallback to loaded field divisions.
- In scheduler slot processing (`Schedule.ts`, `types.ts`), support multi-day slot semantics by iterating all selected weekdays while remaining backward compatible with single-day records.
- In API layers and service mappers, normalize `daysOfWeek` and `dayOfWeek` in both directions.

If Prisma schema changes are needed, add an additive migration in `prisma/schema.prisma` and keep legacy read fallback during rollout.

Acceptance for this milestone is that scheduling a league with newly created local fields and multi-day slots works without "no fields available for divisions" failures and without breaking legacy events.

### Milestone 5: Test Coverage and Regression Gates

Add tests to prevent recurrence of all reported issues.

KMP tests in this repo:

- Extend `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponentTest.kt` for:
  - field division propagation when creating local fields,
  - multi-day slot fan-out to created time slots,
  - playoff count required behavior when playoffs enabled.
- Extend `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/UserRepositoryAuthTest.kt` for signup register payload including DOB.
- Add focused tests for checkbox single-source scoring behavior if logic is extracted.

Web/backend tests in `mvp-site`:

- Extend `src/app/discover/components/__tests__/LeagueFields.test.tsx` for field-division selector and multi-day slot selection behavior.
- Add/extend schedule form tests under `src/app/events/[id]/schedule/__tests__/` to verify playoff required validation, payload slot normalization, and field/division mapping.
- Extend scheduler tests in `src/server/scheduler/__tests__/leagueTimeSlots.test.ts` and `finalizeMatch.league.test.ts` for multi-day slots and field-division fallback.
- Add repository-level tests for `upsertEventFromPayload` division fallback logic.

Acceptance for this milestone is red/green proof that each bug report has a regression test failing before and passing after changes.

## Concrete Steps

Run these in order while implementing.

In `mvp-app` (`/home/camka/Projects/MVP/mvp-app`):

    ./gradlew :composeApp:commonTest --tests "*DefaultCreateEventComponentTest*"
    ./gradlew :composeApp:commonTest --tests "*UserRepositoryAuthTest*"
    ./gradlew :composeApp:commonTest

In `mvp-site` (`/home/camka/Projects/MVP/mvp-site`):

    npm test -- src/app/discover/components/__tests__/LeagueFields.test.tsx
    npm test -- src/app/events/[id]/schedule/__tests__
    npm test -- src/server/scheduler/__tests__/leagueTimeSlots.test.ts
    npm test -- src/server/scheduler/__tests__/finalizeMatch.league.test.ts
    npm test

Manual validation scenarios:

1. Signup with DOB selects date from calendar only.
2. Child profile DOB uses date-only picker.
3. Time selectors show AM/PM across edited surfaces.
4. New league event with newly named fields and assigned divisions schedules successfully.
5. Multi-day weekly slot creates matches on selected weekdays.
6. Enabling playoffs without team count shows explicit validation error.

## Validation and Acceptance

Acceptance is behavior-based:

- DOB fields never request or persist time components.
- Time picker UI shows AM/PM and persisted values remain correct.
- Competition settings expose one scoring-format control path and checkbox interaction is reliable.
- Playoff team count has no prefilled default and blocks submission when required but empty.
- Event creation with newly provisioned fields no longer fails with division/field availability errors.
- Multi-day slot selection is respected in generated schedules.

All new/updated tests listed above must pass in their respective repositories.

## Idempotence and Recovery

All changes are additive and can be applied incrementally. Keep compatibility code for legacy `dayOfWeek` until all clients use `daysOfWeek`. If scheduler regressions occur, temporarily gate multi-day processing behind a feature flag and continue accepting legacy single-day records.

For backend schema changes, perform additive migration first, backfill data, then rollout readers before writers. Avoid removing legacy fields in the same release.

## Artifacts and Notes

Implementation PR(s) should include:

- Example request/response payloads showing both legacy and multi-day slot formats.
- Before/after screenshots for date, time, scoring, playoff, and field/division controls.
- Scheduler error log excerpt proving removal of "no fields available ... for divisions ..." failure for the repro scenario.

## Interfaces and Dependencies

Required interface outcomes after implementation:

- KMP `IUserRepository.createNewUser(...)` includes DOB argument and sends `RegisterRequestDto.dateOfBirth`.
- KMP and web slot models support multi-day UI selection while preserving legacy single-day compatibility.
- Backend time slot APIs and mappers accept and emit multi-day semantics (`daysOfWeek`) with fallback to `dayOfWeek`.
- Field payload handling preserves explicit per-field `divisions` and applies safe fallback if omitted.

Cross-repository dependency note: `mvp-app` API DTO assumptions must be kept aligned with `mvp-site` contract changes in the same release window.

Revision note (2026-02-14): Initial plan authored to address reported signup/profile DOB, AM/PM picker, event form alignment, scoring/playoff, field/division scheduling, and multi-day timeslot issues across KMP mobile, web frontend, and backend.
