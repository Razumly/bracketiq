# Align Web EventForm and Mobile CreateEventScreen Card Parity

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be updated as work proceeds.

`PLANS.md` at the repository root is the governing standard for this document, and this plan must be maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this work, the web EventForm and the mobile create-event flow will expose the same card structure and the same event-configuration capabilities, so hosts can configure events consistently on either platform. The specific user-visible gain is that mobile create now supports payment plan configuration (installment count, due dates, and amounts) and the missing organizer controls (assistant hosts and referee assignment/invites), while preserving the web form as the source-of-truth for behavior and payload shape.

Success is visible by opening event create/schedule forms on both platforms and seeing the same six cards, in the same order, with equivalent validation outcomes and saved payload fields.

## Progress

- [x] (2026-02-22 02:46Z) Audited current web and mobile forms and mapped existing section boundaries, validation behavior, and payload wiring.
- [x] (2026-02-22 02:46Z) Confirmed backend contract support for `assistantHostIds`, `refereeIds`, `doTeamsRef`, `allowPaymentPlans`, `installmentCount`, `installmentDueDates`, and `installmentAmounts` in create/update flows.
- [x] (2026-02-22 02:46Z) Identified reusable mobile primitives for user search/invite (`SearchPlayerDialog`) and email bootstrap (`ensureUserByEmail`) to avoid custom one-off implementations.
- [x] (2026-02-22 03:51Z) Implemented web card split adjustments in `mvp-site` so card headers/ownership match the six target sections.
- [x] (2026-02-22 03:51Z) Implemented mobile data-model parity for `assistantHostIds` and create-state mutation APIs for hosts, referees, and payment-plan installments.
- [x] (2026-02-22 03:51Z) Implemented mobile UI section split and missing controls: Event Details, Referees, League Scoring Config, Schedule Config.
- [x] (2026-02-22 03:51Z) Implemented payment-plan validation parity checks (count/rows/date format/date ordering/sum equals price).
- [x] (2026-02-22 07:56Z) Validation run completed in this workspace: `:composeApp:compileCommonMainKotlinMetadata` and focused `:composeApp:testDebugUnitTest` suites for DTO/create parity both pass.

## Surprises & Discoveries

- Observation: Mobile already persists payment plan fields through DTO/repository layers, but create UI does not expose controls to set them.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt` includes `allowPaymentPlans` and installment fields in both API and update DTO mappings.

- Observation: Mobile create currently has no assistant host model path.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt` includes `hostId` but no `assistantHostIds`, and no compose references to assistant-host identifiers exist.

- Observation: Mobile referee handling is display-only in create flow today.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt` shows `doTeamsRef` in summary but has no edit controls for `refereeIds` or invite entry.

- Observation: Existing reusable cross-screen user search/invite UI can be leveraged directly.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/SearchPlayerDialog.kt` and `IUserRepository.ensureUserByEmail` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt`.

- Observation: `:composeApp:testDebugUnitTest` can fail in this environment before tests run due build directory cleanup/file-locking.
  Evidence: `Execution failed for task ':composeApp:compileDebugKotlinAndroid'. > java.io.IOException: Could not delete .../composeApp/build/tmp/kotlin-classes/debug/com`.

## Decision Log

- Decision: Create a new ExecPlan instead of revising `plans/eventform-create-parity-execplan.md`.
  Rationale: The new request expands scope to explicit six-card parity and adds mobile payment/referee/assistant-host requirements that should be tracked independently from the earlier parity effort.
  Date/Author: 2026-02-22 / Codex

- Decision: Treat web behavior and backend repository parsing as the canonical contract, and bring mobile into parity with that contract.
  Rationale: Repository guidance defines `mvp-site` as source-of-truth for endpoint usage and request/response shape.
  Date/Author: 2026-02-22 / Codex

- Decision: Execute implementation in parallel workstreams (web and mobile) with a merge gate on shared acceptance criteria.
  Rationale: User requested separate sub-agent work; most web refinements are UI-card boundaries while most risk sits in mobile data/state/validation.
  Date/Author: 2026-02-22 / Codex

- Decision: Use `SearchPlayerDialog` + `IUserRepository.ensureUserByEmail` for host/referee selection and invite-by-email in create flow instead of introducing new selector components.
  Rationale: Existing UX/component behavior already supports name search and email invite and minimizes regression risk.
  Date/Author: 2026-02-22 / Codex

## Outcomes & Retrospective

Implementation is complete for the requested parity scope. Web and mobile now use the target card taxonomy, mobile now exposes payment-plan setup plus host/referee assignment paths, and create validation now blocks invalid payment-plan configurations. Focused Kotlin/JVM tests and targeted web tests pass for the updated flows.

## Context and Orientation

The web source-of-truth form is `src/app/events/[id]/schedule/components/EventForm.tsx` in `/home/camka/Projects/MVP/mvp-site`. It already contains almost all required controls, including host/assistant host selection, referees, payment plans, division logic, and league/tournament schedule configuration, plus Zod validation and payload builders.

Mobile create uses `CreateEventScreen` as the screen wrapper and reuses the shared `EventDetails` composable in edit mode:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventScreen.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt`

Mobile already supports core league schedule and scoring editing, but the section grouping is not aligned with web and key event-management controls are missing or incomplete (assistant hosts, referee assignment/invite, payment plan editor).

In this plan, "card parity" means both platforms present these cards in the same order with equivalent field-level behavior:

1. Basic Information
2. Event Details
3. Referees
4. Division Settings
5. League Scoring Config
6. Schedule Config

## Plan of Work

### Milestone 1: Lock Canonical Card Contract and Web Card Boundaries

Start from web because it is closest to target. Update only what is needed so web visibly matches the six-card contract and continues to submit the same payload as before.

In `/home/camka/Projects/MVP/mvp-site/src/app/events/[id]/schedule/components/EventForm.tsx`, keep existing field semantics but enforce card ownership as follows:

- `Basic Information`: event name, sport, description, location, start/end.
- `Event Details`: event type, host, assistant host, price, participants, team size limit, required docs, playoffs toggle, playoff team count messaging, age/rating filters, payment plans, refund and registration cutoff.
- `Referees`: teams-provide-referees toggle and referee selection/invite controls.
- `Division Settings`: division creation/editing, single-division toggle, team-event toggle, registration-by-division-type controls.
- `League Scoring Config`: only league scoring fields/panel.
- `Schedule Config`: league/tournament/playoff scheduling config and weekly timeslots.

If current markup nests scoring/schedule fields under other cards, split them into distinct cards without changing saved payload structure (`buildDraftEvent`) or schema rules (`eventFormSchema`).

### Milestone 2: Mobile Data Contract and State Parity

Bring mobile models into parity before UI changes.

Update event data types and transport mappings:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/EventDTO.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`

Add `assistantHostIds: List<String>` to mobile event models and map it through API DTO conversion, alongside existing payment/referee fields. Keep defaults non-breaking (`emptyList()`), and keep backwards compatibility when server responses omit the field.

Extend create component state/actions in:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventScreen.kt`

Required state operations:

- Set/replace host ID and assistant host IDs.
- Toggle `doTeamsRef`; add/remove referee IDs.
- Toggle payment plans; set installment count; edit installment amount and due date rows; add/remove installment rows.

Prefer focused methods on `CreateEventComponent` rather than exposing ad-hoc list mutations from UI code.

### Milestone 3: Mobile Card Split and Missing Form Controls

Refactor `EventDetails` edit-mode cards so mobile card order and titles match Milestone 1 exactly:

- Basic Information
- Event Details
- Referees
- Division Settings
- League Scoring Config
- Schedule Config

Perform minimal logic movement and primarily relocate existing controls into their new card homes to reduce regression risk. Add missing controls:

- Host + assistant host selectors in Event Details.
- Payment plans editor in Event Details (toggle + installments).
- Referee editor in Referees card (teams-provide toggle, search/add/remove, invite-by-email).

Reuse existing primitives instead of new custom flows:

- `SearchPlayerDialog` for search/invite UX.
- `IUserRepository.searchPlayers` and `IUserRepository.ensureUserByEmail` for lookup and email bootstrap.

Keep create flow behavior for rental events intact (existing locks and constraints remain unchanged).

### Milestone 4: Validation and Serialization Parity

Align mobile validation behavior with web contract expectations.

In `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`, add payment-plan validation rules equivalent to web:

- When payment plans are enabled, installment count matches row count.
- Every installment has non-negative amount and due date.
- Sum of installment amounts equals event price.
- Due dates are parseable and ordered.

Extend referee/host validation only where required for parity and backend acceptance (do not introduce stricter rules than web without explicit requirement).

Ensure created payloads include all parity fields via existing `createEvent` path:

- `assistantHostIds`
- `doTeamsRef`
- `refereeIds`
- `allowPaymentPlans`
- `installmentCount`
- `installmentDueDates`
- `installmentAmounts`

### Milestone 5: Tests and Cross-Repo Verification

Add and update tests where behavior lives.

Web tests (mvp-site):

- Add or adjust tests near form/schema/payload behavior so card split changes do not regress validation or serialization.
- Keep API contract assertions in event repository/route tests for assistant-host, referee, and payment-plan fields.

Mobile tests (mvp-app):

- Extend create-flow unit tests under `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/` for:
  - Payment plan state updates and validation outcomes.
  - Assistant-host/referee state mutation and payload pass-through.
  - Card-gating and event-type rules for league/tournament schedule/scoring visibility.

Finish with manual cross-platform smoke checks confirming the same six cards and equivalent save behavior.

### Parallel Execution Plan (Sub-Agents)

Run parallel implementation tracks after Milestone 1 contract lock:

- Track A (web): card split and any web test updates in `mvp-site`.
- Track B (mobile core): model/DTO/component state changes in `mvp-app`.
- Track C (mobile UI): `EventDetails` card reorganization and controls, starting after Track B APIs exist.

Merge gate: all acceptance criteria in `Validation and Acceptance` must pass together before completion.

## Concrete Steps

Use these concrete commands while implementing.

From `/home/camka/Projects/MVP/mvp-site`:

    npm run lint -- src/app/events/[id]/schedule/components/EventForm.tsx src/app/discover/components/LeagueFields.tsx src/app/discover/components/LeagueScoringConfigPanel.tsx
    npm test -- src/server/repositories/__tests__/events.upsert.test.ts src/app/discover/components/__tests__/LeagueFields.test.tsx

From `/mnt/c/Users/samue/StudioProjects/mvp-app`:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.eventCreate.*"

If local Android SDK issues block `testDebugUnitTest`, run:

    ./gradlew :composeApp:testReleaseUnitTest --tests "com.razumly.mvp.eventCreate.*"

and record the failure reason plus what still passed.

## Validation and Acceptance

Acceptance is complete when all items below are true.

- Web and mobile both render exactly these edit cards in this order: Basic Information, Event Details, Referees, Division Settings, League Scoring Config, Schedule Config.
- Mobile Event Details includes payment-plan controls and saves enabled payment plans with installment data.
- Mobile Event Details includes host + assistant host controls; assistant hosts cannot duplicate primary host.
- Mobile Referees card supports teams-provide-referees toggle, add/remove referees by search, and invite-by-email path.
- League Scoring Config card only contains scoring configuration controls; Schedule Config card owns league/tournament/playoff schedule controls and weekly timeslots.
- Saving from mobile produces payload fields accepted by backend with no dropped parity fields, verified by tests and manual API inspection.
- Existing rental flow constraints and current create flow success path remain working.

Manual proof scenario:

1. Create a league event in web and mobile with the same configuration, including payment plan installments and referees.
2. Save both.
3. Fetch both events and compare key fields (`assistantHostIds`, `doTeamsRef`, `refereeIds`, `allowPaymentPlans`, installment arrays, league scoring config, schedule fields). Values should match intent and pass backend normalization.

## Idempotence and Recovery

All edits are additive/refactoring and can be safely re-run. Re-running tests and manual scenarios is safe and expected.

If regressions appear, rollback in this order to isolate scope quickly:

1. Revert mobile UI card movement while keeping model changes.
2. Revert payment-plan editor wiring only, leaving other card parity changes.
3. Revert assistant-host additions only if backend/client mismatch is discovered.

Keep commits scoped by milestone so selective rollback remains clean.

## Artifacts and Notes

Canonical card-to-field mapping for this effort:

- Basic Information: event name, sport, description, location, start/end.
- Event Details: event type, host, assistant host, price, participants, team size limit, required docs, playoffs toggle, playoff count, min/max age and rating filters, payment plans, refund/registration cutoff.
- Referees: teams provide toggle, invite by name/email, selected referee list.
- Division Settings: division creation/editing, single division toggle, team event toggle, registration mode controls.
- League Scoring Config: scoring-only fields.
- Schedule Config: league/tournament/playoff configuration and weekly timeslots.

Primary files expected to change in `mvp-app`:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventScreen.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/EventDTO.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`
- `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponentTest.kt` and related event-create tests

Primary files expected to change in `mvp-site`:

- `src/app/events/[id]/schedule/components/EventForm.tsx`
- `src/app/discover/components/LeagueFields.tsx`
- `src/app/discover/components/LeagueScoringConfigPanel.tsx`
- Relevant tests under `src/server/repositories/__tests__/` and `src/app/discover/components/__tests__/`

## Interfaces and Dependencies

The following interfaces and payload fields must exist at completion:

- Mobile event model and API DTOs include `assistantHostIds: List<String>` and preserve existing payment/referee fields.
- `CreateEventComponent` exposes explicit mutation methods for assistant hosts, referees, and payment plan installments (toggle, count, row update, row remove).
- `EventDetails` receives callbacks for those mutations and emits validation status through existing `onValidationChange`.
- Backend contract remains the same as current `mvp-site` repository/route handling, including normalization of installment dates/amounts and string-array fields.

Dependencies to use:

- Web form validation/payload logic in `EventForm.tsx` as behavior reference.
- Mobile reusable search/invite UI in `SearchPlayerDialog`.
- Mobile lookup/invite services in `IUserRepository.searchPlayers` and `IUserRepository.ensureUserByEmail`.

Revision note: 2026-02-22 (Codex) created this plan to satisfy explicit request for web/mobile EventForm alignment with a required mobile payment-plan implementation path.
Revision note: 2026-02-22 (Codex) updated Progress/Decision Log/Outcomes after implementation to capture completed web+mobile parity work and the remaining local-test environment blockers.
