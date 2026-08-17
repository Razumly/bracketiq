# Occurrence-relative payment plans for weekly events

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in this repository. The implementation spans two repositories: this mobile/shared Kotlin Multiplatform repository at `C:\Users\samue\StudioProjects\mvp-app`, and the backend/web repository at `C:\Users\samue\Documents\Code\mvp-site-weekly-payment-plans`, which is a clean worktree created from `mvp-site` `dev` for this task. The existing `C:\Users\samue\Documents\Code\mvp-site` checkout was left untouched because it had uncommitted work on another branch.

## Purpose / Big Picture

Weekly events let a participant choose a specific occurrence, such as Tuesday May 12 or Tuesday May 19, under one recurring parent event. Today payment plans are configured with fixed calendar due dates and bills are unique only by owner and parent event. That means a person joining a later occurrence sees the same due dates as earlier joiners, and the same owner cannot create a second payment-plan bill for a different weekly occurrence. After this change, weekly event payment plans can be configured with due offsets measured in days from the selected occurrence start date, and payment-plan bills for weekly events are unique per owner plus selected occurrence.

For example, if a weekly clinic has installments of `$10` and `$20` with relative due offsets `-1` and `0`, a user joining the May 12 occurrence gets bill payments due May 11 and May 12, while a user joining the May 19 occurrence gets bill payments due May 18 and May 19. Non-weekly events continue to use existing absolute `installmentDueDates`.

## Progress

- [x] (2026-05-04 16:10Z) Created `mvp-app` branch `codex/weekly-occurrence-payment-plans` from `dev`.
- [x] (2026-05-04 16:10Z) Created clean `mvp-site` worktree `C:\Users\samue\Documents\Code\mvp-site-weekly-payment-plans` on branch `codex/weekly-occurrence-payment-plans` from `dev`.
- [x] (2026-05-04 16:10Z) Confirmed current behavior: weekly registration is occurrence-aware, but payment-plan bills are created with only parent `eventId` and static `installmentDueDates`.
- [x] (2026-05-04 16:44Z) Updated `mvp-site` schema, migration, generated Prisma client, API routes, event repository serialization, scheduler serialization, web form, discovery join flow, bill service, and focused Jest tests for relative installment due offsets and bill occurrence fields.
- [x] (2026-05-04 16:55Z) Updated `mvp-app` event/division models, network DTOs, billing request DTOs, create/edit payment-plan state, weekly join billing flow, payment-plan preview, validation, and focused Kotlin tests for the new contract.
- [x] (2026-05-04 17:22Z) Ran focused backend and app tests and recorded evidence here.

## Surprises & Discoveries

- Observation: The `mvp-site` Prisma `EventRegistrations` model already has `slotId` and `occurrenceDate`, plus an index on `[eventId, slotId, occurrenceDate]`; `Bills` does not yet have those fields.
  Evidence: In `prisma/schema.prisma`, `EventRegistrations` contains `slotId String?` and `occurrenceDate String?`, while `Bills` currently contains `eventId String?` and `paymentPlanEnabled Boolean?` but no occurrence fields.

- Observation: Both clients already pass `slotId` and `occurrenceDate` to participant registration for weekly events, but they do not pass those values when creating the payment-plan bill.
  Evidence: `src/app/discover/components/EventDetailSheet.tsx` calls `billService.createBill` with `eventId` but no occurrence fields; `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` creates `CreateBillRequest` with `eventId` but no occurrence fields.

- Observation: The clean `mvp-site` worktree did not have its own `node_modules`, while the original checkout did.
  Evidence: `npm test -- src/app/api/billing/__tests__/billsRoute.test.ts --runInBand` initially failed with `jest is not recognized`; a local ignored junction from the worktree `node_modules` to the original checkout `node_modules` allowed the worktree tests to run against the feature files.

- Observation: A full `tsc --noEmit` in `mvp-site` still fails on unrelated agent/OpenAI typing/module issues after Prisma generation, but the feature-related TypeScript errors were resolved.
  Evidence: Before `npx prisma generate`, TypeScript reported missing `installmentDueRelativeDays` on generated Prisma `DivisionsSelect` plus one `EventForm.tsx` payload error. After generation and the payload fix, only `src/app/api/agent/chat/confirm/route.ts`, `src/server/agent/conversations.ts`, `src/server/agent/openai.ts`, and `src/server/agent/tools.ts` errors remained.

## Decision Log

- Decision: Add `installmentDueRelativeDays: Int[]` / `number[]` to event and division payment-plan configuration instead of replacing `installmentDueDates`.
  Rationale: Existing non-weekly events and stored data use absolute dates. A separate field preserves backward compatibility and makes the unit explicit; a value of `0` means occurrence start date, `-1` means one day before, and `1` means one day after.
  Date/Author: 2026-05-04 / Codex.

- Decision: Restrict relative due offsets to `WEEKLY_EVENT` payment plans and keep absolute `installmentDueDates` for non-weekly events.
  Rationale: The relative offset only has a clear anchor when the participant selects a weekly occurrence. For normal events, leagues, and tournaments, the current absolute due-date behavior remains more explicit and avoids contract churn.
  Date/Author: 2026-05-04 / Codex.

- Decision: Add `slotId` and `occurrenceDate` to payment-plan bill creation and persisted `Bills` rows.
  Rationale: Relative due dates fix the installment schedule, but without occurrence-aware bill identity, duplicate detection still blocks the same owner from joining a later occurrence of the same weekly parent event.
  Date/Author: 2026-05-04 / Codex.

- Decision: Resolve relative due offsets to concrete `BillPayments.dueDate` values on the backend.
  Rationale: Bills are persisted obligations with absolute due dates. Computing those dates in `mvp-site` keeps web and mobile consistent and prevents client-side date arithmetic drift.
  Date/Author: 2026-05-04 / Codex.

- Decision: Reject weekly payment-plan bill creation when `installmentDueRelativeDays` is missing.
  Rationale: Falling back to absolute dates or the current date for weekly occurrences would reproduce the original defect. Weekly plans need a selected occurrence plus one relative offset per installment.
  Date/Author: 2026-05-04 / Codex.

## Outcomes & Retrospective

Weekly event payment plans now store relative due offsets on event and division configuration, and weekly bill creation requires and resolves those offsets against the selected occurrence before persisting concrete `BillPayments.dueDate` values. Payment-plan duplicate detection for weekly parent events now includes `slotId` and `occurrenceDate`, so the same owner can join different occurrences while still being blocked from duplicate bills for the same occurrence.

Validation evidence:

    npm test -- src/app/api/billing/__tests__/billsRoute.test.ts --runInBand
    npm test -- src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts --runInBand
    npm test -- src/app/api/events/__tests__/eventSaveRoute.test.ts --runInBand
    .\gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest" --console=plain --no-daemon
    .\gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.network.dto.EventDtosTest" --console=plain --no-daemon
    .\gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.eventDetail.EventDetailMobileJoinFlowTest" --console=plain --no-daemon
    .\gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.eventDetail.EventDetailWeeklyBehaviorTest" --console=plain --no-daemon
    .\gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.eventDetail.EventDetailsDivisionEditorHelpersTest" --console=plain --no-daemon

All focused tests above passed. A full `tsc --noEmit` in `mvp-site` was attempted and still fails on unrelated pre-existing agent/OpenAI issues after the feature-related errors were resolved.

## Context and Orientation

`mvp-site` is the source of truth for API paths, request and response shapes, Prisma schema, and payment behavior. Event payment-plan configuration is stored on the `Events` and `Divisions` Prisma models in `prisma/schema.prisma` with `allowPaymentPlans`, `installmentCount`, `installmentDueDates`, and `installmentAmounts`. The backend event repository in `src/server/repositories/events.ts` normalizes those fields on create/update and maps Prisma rows to API event objects. The web event form in `src/app/events/[id]/schedule/components/EventForm.tsx` lets hosts configure payment plans. The discovery event detail sheet in `src/app/discover/components/EventDetailSheet.tsx` lets participants join events and creates bills for payment plans.

`mvp-app` consumes the same event contract through Kotlin data classes in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`, `DivisionDetail.kt`, and network DTO mapping in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`. The app creates payment-plan bills in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` through `CreateBillRequest` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`.

The term "weekly parent event" means one persisted `Events` row with `eventType` of `WEEKLY_EVENT`. The term "occurrence" means one selectable date/session under that parent, identified by the selected `slotId` and `occurrenceDate`. `occurrenceDate` is stored as a `YYYY-MM-DD` string in weekly registration paths. The term "relative due offset" means an integer number of days added to the selected occurrence start date to produce a concrete payment due date.

## Plan of Work

First, update `mvp-site` schema and contract. Add `installmentDueRelativeDays Int[] @default([])` to both `Events` and `Divisions`, and add `slotId String?` plus `occurrenceDate String?` to `Bills` with an index on `[eventId, slotId, occurrenceDate]`. Create a Prisma migration under `prisma/migrations/` that adds those columns with safe defaults. Extend TypeScript event and division types to include `installmentDueRelativeDays`.

Next, update backend normalization and serialization. In `src/server/repositories/events.ts`, parse relative due offsets as finite integers, preserve them only for weekly events, and clear them for other event types. Keep absolute `installmentDueDates` for non-weekly events. For weekly events, the event and division payload should expose `installmentDueRelativeDays` so clients can show and send it. Update the API routes in `src/app/api/events/route.ts` and `src/app/api/events/[eventId]/route.ts` to select, serialize, patch, and sanitize the new field.

Then, update bill creation. In `src/app/api/billing/bills/route.ts`, extend the request schema with optional `slotId`, `occurrenceDate`, and `installmentDueRelativeDays`. When `paymentPlanEnabled` and `eventId` refer to a weekly parent event, require both occurrence fields, resolve the weekly occurrence through `resolveWeeklyOccurrence`, and compute bill payment due dates by adding each relative day offset to the resolved occurrence start date. For normal events, preserve the current absolute `installmentDueDates` behavior. Change duplicate detection so normal events remain unique by owner and event, while weekly event bills are unique by owner, event, slot, and occurrence date.

Then, update web behavior. In `src/app/events/[id]/schedule/components/EventForm.tsx`, show relative due offset inputs for `WEEKLY_EVENT` payment-plan rows and continue showing date/time due pickers for other event types. Preserve existing amount validation, but validate relative offset count for weekly events instead of absolute due-date count. In `src/app/discover/components/EventDetailSheet.tsx`, include the selected weekly occurrence and relative offsets when creating a payment-plan bill.

Finally, update `mvp-app`. Add `installmentDueRelativeDays` to `Event`, `DivisionDetail`, event DTOs, and mapping. Add `slotId`, `occurrenceDate`, and `installmentDueRelativeDays` to `CreateBillRequest` and the serialized bill request DTO. In `EventDetailComponent`, include the selected weekly occurrence when creating a payment-plan bill and send relative due offsets for weekly events. Continue displaying the preview using the configured relative offsets when absolute due dates are not available, and make the backend responsible for final concrete bill due dates.

## Concrete Steps

Work in `C:\Users\samue\Documents\Code\mvp-site-weekly-payment-plans` for backend/web edits and `C:\Users\samue\StudioProjects\mvp-app` for app edits. Use `git status --short --branch` in both repositories before and after each milestone.

Run focused backend tests from the site worktree:

    npm test -- src/app/api/billing/__tests__/billsRoute.test.ts
    npm test -- src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts

Run focused app tests from the app repository:

    .\gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest"
    .\gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.eventDetail.EventDetailMobileJoinFlowTest"

If a command name differs in this workspace, inspect `package.json` or Gradle task output and update this plan with the actual command used.

## Validation and Acceptance

Backend acceptance: a weekly payment-plan bill request with `eventId`, `slotId`, `occurrenceDate` of `2026-05-12`, `installmentAmounts` of `[1000, 2000]`, and `installmentDueRelativeDays` of `[-1, 0]` creates two `BillPayments` rows due on `2026-05-11` and `2026-05-12`. A second bill for the same owner, event, slot, and occurrence is rejected as duplicate. A bill for the same owner and event but `occurrenceDate` of `2026-05-19` is allowed and has due dates `2026-05-18` and `2026-05-19`.

Web acceptance: editing a weekly event payment plan shows relative day offsets instead of absolute due-date pickers, and saving the event payload includes `installmentDueRelativeDays` while leaving `installmentDueDates` empty for weekly plans. Editing a non-weekly event still uses absolute due dates.

App acceptance: when joining a weekly event with a payment plan, the app bill request includes the selected `slotId`, selected `occurrenceDate`, and the event or division `installmentDueRelativeDays`. Non-weekly payment-plan bill requests do not include occurrence fields.

## Idempotence and Recovery

The schema changes are additive. If migration generation is unavailable, the migration can be written manually with `ALTER TABLE` statements that add nullable/defaulted columns. Re-running tests is safe. The separate site worktree protects the user’s dirty `mvp-site` checkout; if the worktree becomes unusable, remove only `C:\Users\samue\Documents\Code\mvp-site-weekly-payment-plans` after confirming it has no uncommitted needed work, then recreate it from `dev`.

Do not run Gradle tests concurrently in the same `mvp-app` checkout. Do not switch or reset the original `C:\Users\samue\Documents\Code\mvp-site` checkout because it contains user work.

## Artifacts and Notes

Initial branch state:

    mvp-app: ## codex/weekly-occurrence-payment-plans
    mvp-site worktree: ## codex/weekly-occurrence-payment-plans

Existing current bug evidence:

    src/app/api/billing/bills/route.ts duplicate lookup uses ownerType, ownerId, eventId, parentBillId null, and paymentPlanEnabled true.
    composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt CreateBillRequest does not include slotId or occurrenceDate.

## Interfaces and Dependencies

At completion, `mvp-site` event and division API objects include:

    installmentDueRelativeDays?: number[]

At completion, `mvp-site` bill creation accepts:

    slotId?: string | null
    occurrenceDate?: string | null
    installmentDueRelativeDays?: number[]

At completion, `mvp-app` `CreateBillRequest` includes:

    val slotId: String? = null
    val occurrenceDate: String? = null
    val installmentDueRelativeDays: List<Int> = emptyList()

Relative offsets are measured in calendar days from the selected weekly occurrence start date. The backend resolves them to concrete `BillPayments.dueDate` values before persisting the bill.

Revision note, 2026-05-04 16:10Z: Created the initial plan after branch creation and source inspection so implementation can proceed from a self-contained design.
