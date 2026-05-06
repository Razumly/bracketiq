# Make Division Values Canonical for Registration, Pricing, and Payment Plans

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. The plan is self-contained so a future contributor can continue from only this file and the working tree.

## Purpose / Big Picture

Event organizers should be able to trust that the configured division is the source of truth for registration capacity, entry price, and payment plans. After this change, both single-division and multi-division events use division-level `maxParticipants`, `price`, and payment plan fields for runtime behavior. Event-level values still exist because older payloads and creation forms use them as defaults while building a draft event, but runtime code must not silently fall back to them when a division is missing required values. Missing or invalid division values should produce a visible error instead of changing behavior by using stale event-level data.

The organizer-facing forms in both the Kotlin app and the web app should make this source of truth visible. The default team count, default price, and default payment-plan controls should move out of the general event details area and into the top of the division section. Behavior remains the same: these controls define the defaults that new divisions receive, and each division can then carry its own explicit values.

The change can be observed by running focused app and backend tests that create single-division and multi-division events with incomplete division values. The expected behavior is that single-division DTOs preserve division values instead of mirroring event values, pricing helpers report missing division values as invalid, and backend capacity/payment helpers no longer replace missing division settings with event-level defaults.

## Progress

- [x] (2026-05-06) Read `PLANS.md` and created this ExecPlan.
- [x] (2026-05-06) Update shared Kotlin app models and DTO mapping so division detail values are canonical for both single-division and multi-division events. `Event.resolvedDivisionPriceCents()` now returns only explicit division prices, `Event.toUpdateDto()` preserves division fields by default, and creation explicitly opts into default application.
- [x] (2026-05-06) Move the Kotlin app default team count, price, and payment-plan controls to the top of the division section.
- [x] (2026-05-06) Move the `mvp-site` web EventForm default team count, price, and payment-plan controls to the top of the division section without overwriting existing local edits.
- [x] (2026-05-06) Update app detail, join, capacity, and read-only display paths to require selected division values and surface errors instead of falling back to event values.
- [x] (2026-05-06) Update `mvp-site` backend response hydration, participant capacity, and payment-plan helpers to stop using event defaults as runtime fallbacks.
- [x] (2026-05-06) Add focused regression tests in `mvp-app` and `mvp-site`.
- [x] (2026-05-06) Run targeted tests and record outcomes in this plan.

## Surprises & Discoveries

- Observation: The Windows shell could not execute `rg.exe` in this workspace.
  Evidence: `Program 'rg.exe' failed to run: Access is denied`; searches used `git grep` and PowerShell file reads instead.
- Observation: Both repositories have pre-existing local changes unrelated to this plan.
  Evidence: `mvp-app` has dirty files such as `composeApp/composeApp.podspec` and `StandardTextField.kt`; `mvp-site` has dirty files such as `src/app/events/[id]/schedule/components/EventForm.tsx` and billing route tests. This plan must avoid overwriting unrelated edits.
- Observation: The mobile app purchase-intent request did not send the selected division id.
  Evidence: `PurchaseIntentRequestDto` had no division fields, while the backend purchase-intent route already reads `divisionId`, `divisionTypeId`, and `divisionTypeKey`. The app request now includes `divisionId` so checkout reservations can validate the selected division.

## Decision Log

- Decision: Treat event-level `price`, `maxParticipants`, `allowPaymentPlans`, `installmentCount`, `installmentDueDates`, `installmentDueRelativeDays`, and `installmentAmounts` as draft/default fields only, not runtime fallbacks.
  Rationale: The requested behavior is to throw or surface an error when the selected division is invalid, because silent fallback to event-level values can charge or cap registrations incorrectly.
  Date/Author: 2026-05-06 / Codex
- Decision: Keep event-level fields in request/response types for backward compatibility and creation defaults, but make helpers use explicit division values where a division exists.
  Rationale: Removing event-level fields would be a wider schema and API migration. The safer behavior change is to stop reading them as fallbacks in registration, pricing, capacity, and payment-plan paths.
  Date/Author: 2026-05-06 / Codex
- Decision: Move default capacity, price, and payment-plan controls into the division section in both app UIs.
  Rationale: The user clarified that behavior should remain mostly the same, but the UI should teach the source-of-truth model by placing defaults next to division configuration instead of in general event details.
  Date/Author: 2026-05-06 / Codex
- Decision: Keep creation/default controls backed by existing event draft fields, but stop serializers and runtime helpers from reading those fields as missing-division fallbacks.
  Rationale: This preserves the current form behavior for seeding new divisions while satisfying the requirement that saved division records are canonical for checkout, capacity, and payment plans.
  Date/Author: 2026-05-06 / Codex

## Outcomes & Retrospective

Implemented and validated. The app now keeps division price/capacity canonical in DTOs, pricing helpers, capacity helpers, and checkout requests. The Compose and web forms now place default max teams/participants, default price, and default payment-plan controls at the top of their division sections. The backend event serializers, capacity helpers, and weekly payment-plan helper no longer hydrate missing division values from event defaults. Remaining broader risk is that older events with missing division data will now surface missing/invalid configuration instead of being silently repaired at runtime, which is the requested behavior.

## Context and Orientation

The shared Kotlin app lives under `composeApp/src/commonMain/kotlin/com/razumly/mvp`. `Event` is the Room and Kotlin data model in `core/data/dataTypes/Event.kt`. `DivisionDetail` is the per-division settings model in `core/data/dataTypes/DivisionDetail.kt`; its `price`, `maxParticipants`, `allowPaymentPlans`, and installment fields are the values this plan makes canonical. `EventDtos.kt` maps between backend JSON and Kotlin `Event` instances and currently mirrors event-level values into division details for single-division events.

The event detail join flow lives in `eventDetail/EventDetailComponent.kt`. It currently computes an `EffectivePaymentPlan` by reading the selected division first and then falling back to event-level payment settings. The same file computes `isEventFull` by using event-level `maxParticipants` for single-division events and division max with event fallback for split divisions. These are runtime paths and must require concrete division values.

The backend source of truth is the sibling `mvp-site` repository at `C:\Users\samue\Documents\Code\mvp-site`. Prisma model `Divisions` contains division-level `price`, `maxParticipants`, and payment-plan fields. Prisma model `Events` still contains event-level `price`, `maxParticipants`, and payment-plan fields. API files under `src/app/api/events` and server helpers under `src/server/events` currently hydrate division details with event defaults and compute participant capacity with event fallbacks. Those runtime fallbacks must be removed.

In this plan, "canonical" means "the value that runtime behavior actually trusts." If a selected division has `price = 2500` and the event has `price = 5000`, checkout should use 2500. If the selected division has no price, checkout should fail instead of using 5000. The same rule applies to capacity and payment-plan settings.

## Plan of Work

First update the Kotlin model helpers in `core/data/dataTypes/Event.kt`. Replace fallback helpers with explicit division resolution helpers that return a failure or `null` when a selected division lacks a required value. Keep display helpers able to show a missing state, but do not return the event-level value as if it were configured.

Next update `core/network/dto/EventDtos.kt`. `EventApiDto.toEventOrNull()` should normalize division details without copying event-level values into every division. `Event.toUpdateDto()` should preserve division-level values for single-division events as well as multi-division events. Event creation can explicitly opt into applying event-level draft defaults to missing division details, but update/runtime paths should not silently repair missing division data.

Then update the Kotlin app UI. In `eventDetail/EventDetails.kt`, move the default max participants, default price, and default payment-plan controls to the top of the division section. Remove the duplicate controls from the general event details/payment section so there is one obvious place to configure division defaults. The controls should still update the existing `Event` draft fields because those fields are the default source used when adding or seeding divisions.

Then update the web UI. In `mvp-site/src/app/events/[id]/schedule/components/EventForm.tsx`, move the same default max participants, default price, and default payment-plan controls to the top of the division section. This file is already dirty in the user worktree, so inspect the current local version before editing and preserve unrelated changes.

Then update app runtime paths. In `eventDetail/EventDetailComponent.kt`, `resolveEffectivePaymentPlan` should require a selected division when the event has divisions and should require division `price` and payment-plan fields. `checkEventIsFull` should use the selected division max for all events with a division; if it is missing or not positive, capacity should be treated as invalid/unavailable rather than falling back to event max. UI helpers in read-only division cards should display explicit missing values instead of event fallbacks.

Then update the backend. In `mvp-site/src/app/api/events/route.ts` and `mvp-site/src/app/api/events/[eventId]/route.ts`, `getDivisionDetailsForEvent` should return row division fields as stored and should not insert event defaults for missing division values. In `mvp-site/src/server/events/eventRegistrations.ts`, capacity calculation should use explicit division values for all events with divisions and return null when division capacity is missing. In weekly payment-plan billing and checkout reservation helpers, selected division price and payment-plan values should be required for paid division flows.

Finally add tests. In `mvp-app`, update existing `EventPricingTest` and `EventDtosTest` expectations so single-division events preserve division values and missing division values do not fall back. In `mvp-site`, update event price range and event route tests where they currently expect fallback, and add focused capacity/payment-plan tests if the existing helpers expose suitable seams.

## Concrete Steps

Work from `C:\Users\samue\StudioProjects\mvp-app` for the Kotlin app and from `C:\Users\samue\Documents\Code\mvp-site` for backend files. Use `git grep` instead of `rg` in this Windows environment because `rg.exe` is not executable here.

Targeted app validation commands:

    .\gradlew :composeApp:testDebugUnitTest --tests com.razumly.mvp.core.data.dataTypes.EventPricingTest --tests com.razumly.mvp.core.network.dto.EventDtosTest

Actual app validation run:

    .\gradlew :composeApp:compileDebugKotlinAndroid --console=plain --stacktrace
    BUILD SUCCESSFUL in 33s

    .\gradlew :composeApp:testDebugUnitTest --tests com.razumly.mvp.core.data.dataTypes.EventPricingTest --tests com.razumly.mvp.core.network.dto.EventDtosTest --tests com.razumly.mvp.core.data.util.EventCapacityTest --tests com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest --console=plain
    BUILD SUCCESSFUL in 1m 42s

Targeted backend validation commands from `C:\Users\samue\Documents\Code\mvp-site`:

    npm test -- eventPriceRange
    npm test -- eventPatchSanitizeRoutes

Actual backend/web validation run:

    npm test -- eventPriceRange eventCapacity divisionCapacity
    Test Suites: 3 passed, 3 total
    Tests: 14 passed, 14 total

    npm test -- EventForm
    Test Suites: 1 passed, 1 total
    Tests: 37 passed, 37 total

If exact test filters differ, run the nearest test file command used by the repository and record the actual command and output in this plan.

Update note, 2026-05-06 / Codex: recorded completed implementation and validation evidence so the plan can be resumed or audited from this file alone.

## Validation and Acceptance

The app acceptance criteria are:

For a single-division `Event` with `priceCents = 5000` but `divisionDetails.first().price = 6500`, pricing helpers and update DTOs preserve 6500 as the runtime division price. For a division whose `price` is missing, helpers do not report 5000 from the event as the configured division price. For a selected division whose `maxParticipants` is missing, capacity code does not use event `maxParticipants` as a replacement.

In the Compose create/edit event UI, the default max teams or max participants input, default price input, and default payment-plan controls appear at the top of the division section. They no longer appear in the general event details area. In the web EventForm, the same controls appear at the top of the division section and no longer appear in their old general location.

The backend acceptance criteria are:

API event responses include division details without overwriting missing division `price`, `maxParticipants`, or payment-plan fields with event-level defaults. Participant capacity for an event with divisions is calculated from explicit division max values. Payment-plan bill creation and checkout use division price and division installment settings, and fail or no-op when those division values are absent rather than reading event-level defaults.

## Idempotence and Recovery

All edits are source changes and focused tests. Commands can be rerun safely. If a test command fails because the local Gradle or Node environment is missing dependencies, record the failure and run narrower compilation or test commands if available. Do not reset or checkout files because both repositories have pre-existing local changes. If a touched file already contains unrelated user edits, preserve them and apply only minimal local patches.

## Artifacts and Notes

Initial search evidence:

    composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt defines resolvedDivisionPriceCents() as division price or event price.
    composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt mirrors event price/capacity into single-division details.
    C:\Users\samue\Documents\Code\mvp-site\src/server/events/eventRegistrations.ts computes capacity with event.maxParticipants fallback.

## Interfaces and Dependencies

The plan should leave these stable interfaces available:

In `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`, provide helpers for division pricing that make missing division values explicit. Callers that need a strict value should be able to get a `Result<Int>` or nullable value and handle the missing case.

In `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`, `EffectivePaymentPlan` should represent only valid division-derived payment settings. Missing division price or invalid plan settings should prevent checkout/payment-plan creation with a clear user message.

In `mvp-site/src/server/events/eventRegistrations.ts`, capacity helper behavior should be deterministic: explicit selected or event division capacities are used, missing capacities return null, and event-level `maxParticipants` is used only when an event has no divisions.

Revision note, 2026-05-06: Created the initial plan after the user requested division values become canonical for both single-division and multi-division events. The plan records current fallback behavior and the target no-fallback behavior.

Revision note, 2026-05-06: Updated the plan after the user clarified the UI shape. The default max team count, price, and payment-plan controls must move to the top of the division section in both `mvp-app` and `mvp-site` while keeping behavior otherwise consistent.
