# Mobile Management Payment QR Checkout

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. It touches two sibling repositories: `/Users/elesesy/StudioProjects/mvp-app` for the Kotlin Multiplatform mobile UI and `/Users/elesesy/StudioProjects/mvp-site` for the Next.js API contract that is the source of truth for backend routes and data shapes.

## Purpose / Big Picture

Event managers using the mobile app need a way to collect payment in person from the participant management dialog. After this change, the old `Send Bill` management button becomes `Payments`. The `Payments` menu offers `Receive payment now` and `Send bill`. `Send bill` keeps the existing bill creation behavior. `Receive payment now` creates a Stripe-hosted Checkout URL, shows it as a QR code in the mobile app, and lets the payer scan the code and complete payment. When Stripe calls back, the existing billing webhook creates a paid bill and bill payment for the event participant instead of creating a new event registration.

For team events, the payment, refund, and remove controls only appear on team rows. User rows inside a team event remain informational because payment and removal happen at the team level. For non-team events, user rows keep refund, payments, and remove controls.

## Progress

- [x] (2026-05-05 02:25Z) Read `PLANS.md`, Stripe payment guidance, current mobile billing repository/component/UI code, and current site billing, bill, QR, and webhook routes.
- [x] (2026-05-05 02:25Z) Chose Stripe Checkout Sessions for the QR URL because a raw PaymentIntent does not provide a hosted payment URL.
- [x] (2026-05-05 02:37Z) Added the site API endpoint that creates a hosted Checkout Session for an event participant payment and returns a checkout URL plus QR image URL.
- [x] (2026-05-05 02:37Z) Added a generic QR image endpoint for hosted checkout URLs.
- [x] (2026-05-05 02:37Z) Updated the site billing webhook so the new event payment purchase type creates a bill and bill payment without creating an event registration.
- [x] (2026-05-05 02:37Z) Added mobile repository and component methods for the new Checkout Session endpoint.
- [x] (2026-05-05 02:37Z) Replaced the mobile management dialog `Send Bill` button with a `Payments` dropdown and added the QR dialog.
- [x] (2026-05-05 02:37Z) Hid mobile management actions for user rows in team events.
- [x] (2026-05-05 02:37Z) Added focused tests in both repositories.
- [x] (2026-05-05 02:37Z) Ran targeted validation commands and recorded the evidence here.

## Surprises & Discoveries

- Observation: The existing `/api/billing/create_billing_intent` route returns a PaymentIntent client secret for the embedded/native payment UI, not a hosted URL that can be encoded in a QR code.
  Evidence: `src/app/api/billing/create_billing_intent/route.ts` calls `stripe.paymentIntents.create` and returns `paymentIntent: intent.client_secret ?? intent.id`.
- Observation: The billing webhook already has an instant-bill path when a successful PaymentIntent has no `bill_id` and no `bill_payment_id` metadata.
  Evidence: `src/app/api/billing/webhook/route.ts` calls `createInstantBillAndPayment` when bill metadata is absent, and only creates event registrations when `purchase_type` is exactly `event`.
- Observation: Mobile participant billing already routes both team-event teams and non-team users through `/api/events/{eventId}/teams/{teamId}/billing`, where `teamId` is the participant team id for team events and the participant user id for non-team events.
  Evidence: `BillingRepository.createEventTeamBill` posts to `api/events/$eventId/teams/$teamId/billing/bills`, and the site route handles `event.teamSignup === false` by treating `teamId` as a user participant id.
- Observation: Jest treats square brackets in dynamic route paths as a pattern unless `--runTestsByPath` is used.
  Evidence: The first combined site test command ran `webhookRoute.test.ts` only; rerunning the new checkout route test with `--runTestsByPath` executed all three route tests.

## Decision Log

- Decision: Use Stripe Checkout Sessions for `Receive payment now`, not the existing mobile PaymentIntent dialog.
  Rationale: The user needs a URL to encode in a QR code. Checkout Sessions provide a Stripe-hosted `url`; PaymentIntents do not.
  Date/Author: 2026-05-05 / Codex
- Decision: Use a new metadata purchase type named `event_payment` for the hosted QR flow.
  Rationale: The webhook should create a paid bill and bill payment, but it must not create a registration. The existing webhook creates registrations only when `purchase_type` is exactly `event`, so `event_payment` can reuse the instant bill path while avoiding registration side effects.
  Date/Author: 2026-05-05 / Codex
- Decision: For team-event `Receive payment now`, the bill owner is the team and the payer metadata is the team manager when available, falling back to captain, head coach, or the manager initiating the request.
  Rationale: The user asked for the payment intent to be created for the manager while the completed callback should create the bill and payment for the team.
  Date/Author: 2026-05-05 / Codex

## Outcomes & Retrospective

Implemented the mobile management payment QR flow end to end. The mobile app now has a typed repository/component method for `/api/events/{eventId}/teams/{teamId}/billing/checkout`, the management dialog shows `Payments` with `Receive payment now` and `Send bill`, and `Receive payment now` shows a QR code backed by a Stripe Checkout URL. The site creates the Checkout Session with `event_payment` metadata, serves a QR image for the hosted URL, and the webhook treats `event_payment` as bill-only payment so it creates a paid bill and bill payment without activating or creating registrations. Team-event user rows now show only the informational management dialog and a close action.

The implementation intentionally leaves the existing `Send bill`, refund, and native bill payment intent paths unchanged. The QR checkout flow is asynchronous: the QR dialog displays the payment URL immediately, and the bill appears after Stripe sends `payment_intent.succeeded`.

## Context and Orientation

The mobile app repository is `/Users/elesesy/StudioProjects/mvp-app`. The relevant mobile file for the requested UI is `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/ParticipantsVeiw.kt`. This file renders participant and team lists, opens the management dialog, creates bills, and refunds payments. `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` is the screen component interface and implementation that bridges the UI to repositories. `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt` owns the HTTP calls and serializable DTOs for billing routes.

The site repository is `/Users/elesesy/StudioProjects/mvp-site`. It is the backend source of truth for API paths and payloads. Existing bill creation is in `src/app/api/events/[eventId]/teams/[teamId]/billing/bills/route.ts`. Existing billing snapshot and refund behavior are in sibling routes under `src/app/api/events/[eventId]/teams/[teamId]/billing/`. Existing native bill payment intent behavior is in `src/app/api/billing/create_billing_intent/route.ts`. Existing webhook behavior is in `src/app/api/billing/webhook/route.ts`. Existing QR generation for event links is in `src/app/api/events/[eventId]/qr/route.ts`.

In this plan, a Checkout Session means a Stripe server-side object created with `stripe.checkout.sessions.create`. It returns a hosted `url` where the payer can complete payment in a browser. A webhook is an HTTP request from Stripe to the app after payment events; this project already handles `payment_intent.succeeded` to reconcile bills and registrations.

## Plan of Work

First, add a site route under `src/app/api/events/[eventId]/teams/[teamId]/billing/checkout/route.ts`. It must require a manager session, verify the manager can manage the event, verify that the path participant is a team in a team event or a user in a non-team event, calculate the final amount from the submitted event amount using existing `calculateMvpAndStripeFees`, create a Stripe Checkout Session in `mode: 'payment'`, and return the Checkout URL and a QR image URL. The metadata on `payment_intent_data` must include `purchase_type: event_payment`, `event_id`, either `team_id` or `user_id`, `amount_cents`, fee metadata, `total_charge_cents`, event name, organization id when present, and payer user id. For team events, payer user id should resolve from the team manager first.

Second, add a QR image route under `src/app/api/billing/checkout-qr/route.ts`. It should accept a `url` query parameter, validate that it points either to Stripe Checkout or to the same site origin for local mock mode, render a PNG QR code using the QR library already installed in the site repo, and return `image/png`.

Third, update `src/app/api/billing/webhook/route.ts` so `event_payment` line items are classified as event line items and labeled like event registration purchases, while leaving `ensureEventRegistrationFromPurchase` unchanged so no registration is created for this new purchase type.

Fourth, update `BillingRepository.kt` with a new request/response type and an interface method for the checkout route. Update `EventDetailComponent.kt` with a matching suspend method that refreshes participant compliance after a successful checkout creation request only if needed after the payment completes; since payment completion is asynchronous, the QR dialog can simply show the QR and the existing screen refresh behavior can pick up paid bills later.

Fifth, update `ParticipantsVeiw.kt`. Add a `Payments` dropdown in the management dialog with `Receive payment now` and `Send bill`. `Send bill` opens the existing modal. `Receive payment now` computes the event or selected division price, calls the new component method, and displays an AlertDialog containing the QR image and hosted URL action. For team events, pass `showManagementActions = false` when the target is a user row so refund, payments, and remove are absent.

Finally, add focused tests. Site tests should assert the new checkout route validates participants, creates a Checkout Session with `event_payment` metadata, and returns the QR route. Webhook tests should assert `event_payment` creates a bill but does not create a registration. Mobile repository tests should assert the new endpoint path and payload. If feasible without heavy UI harness changes, add a focused Compose or function-level test for the hidden team-event user actions; otherwise validate via compile and manual code inspection.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site` for site changes and `/Users/elesesy/StudioProjects/mvp-app` for mobile changes.

Run targeted file searches before editing:

    cd /Users/elesesy/StudioProjects/mvp-site
    rg -n "create_billing_intent|billing/bills|payment_intent.succeeded|qr-code-styling" src

    cd /Users/elesesy/StudioProjects/mvp-app
    rg -n "createParticipantBill|ParticipantManagementDialog|createBillingIntent|EventTeamBillCreateRequest" composeApp/src/commonMain composeApp/src/commonTest

After implementation, run targeted tests:

    cd /Users/elesesy/StudioProjects/mvp-site
    npm test -- --runInBand src/app/api/events/[eventId]/teams/[teamId]/billing/checkout/__tests__/route.test.ts src/app/api/billing/__tests__/webhookRoute.test.ts

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :composeApp:testDebugUnitTest --tests com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest

If these targeted commands fail because the local environment lacks a required service or generated client state, record the exact failure and run the narrowest available compile or test alternative.

## Validation and Acceptance

Acceptance for the site API is a passing route test showing that a manager can POST to `/api/events/event_1/teams/team_1/billing/checkout` and receive a payload with `checkoutUrl`, `qrCodeUrl`, `amountCents`, and fee metadata. The mocked Stripe call must receive `payment_intent_data.metadata.purchase_type` equal to `event_payment`, and it must include `team_id` for team events or `user_id` for non-team events.

Acceptance for the webhook is a passing test showing that a `payment_intent.succeeded` event with `purchase_type: event_payment` creates a paid bill and bill payment and does not create an event registration.

Acceptance for the mobile app is a passing repository HTTP test showing that the app posts to the new backend route with the event amount, division id, and label. Manual UI acceptance is that the participant management dialog shows `Payments` instead of `Send Bill`, the menu opens with `Receive payment now` and `Send bill`, scanning or opening the QR leads to the Stripe Checkout URL, and team-event user rows do not show refund, payments, or remove controls.

## Idempotence and Recovery

The new checkout route is additive and does not change the existing `Send bill` route. If Stripe Checkout Session creation fails, the route should return an error and should not create a bill ahead of payment completion. Re-running tests is safe. If a partial mobile UI edit fails to compile, revert only the files changed for this plan, not unrelated user edits.

## Artifacts and Notes

Initial evidence from repository inspection:

    /api/billing/create_billing_intent returns PaymentIntent client secrets, not hosted URLs.
    /api/billing/webhook creates instant bills when successful payment metadata has no bill_id and no bill_payment_id.
    ParticipantsVeiw.kt currently passes onSendBill into ParticipantManagementDialog and renders a "Send Bill" OutlinedButton.

Validation evidence:

    cd /Users/elesesy/StudioProjects/mvp-site
    npm test -- --runInBand --runTestsByPath src/app/api/events/[eventId]/teams/[teamId]/billing/checkout/__tests__/route.test.ts
    PASS src/app/api/events/[eventId]/teams/[teamId]/billing/checkout/__tests__/route.test.ts
    Tests: 3 passed, 3 total

    cd /Users/elesesy/StudioProjects/mvp-site
    npm test -- --runInBand --runTestsByPath src/app/api/billing/__tests__/checkoutQrRoute.test.ts
    PASS src/app/api/billing/__tests__/checkoutQrRoute.test.ts
    Tests: 2 passed, 2 total

    cd /Users/elesesy/StudioProjects/mvp-site
    npm test -- --runInBand src/app/api/billing/__tests__/webhookRoute.test.ts
    PASS src/app/api/billing/__tests__/webhookRoute.test.ts
    Tests: 10 passed, 10 total

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :composeApp:testDebugUnitTest --tests com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest
    BUILD SUCCESSFUL in 1m 17s

## Interfaces and Dependencies

In `mvp-site`, define:

    POST /api/events/[eventId]/teams/[teamId]/billing/checkout

The request body must accept:

    ownerType: "TEAM" | "USER"
    ownerId?: string
    eventAmountCents: number
    taxAmountCents?: number
    divisionId?: string
    label?: string

The response body must include:

    checkoutUrl: string
    qrCodeUrl: string
    amountCents: number
    eventAmountCents: number
    billOwnerType: "TEAM" | "USER"
    billOwnerId: string
    payerUserId?: string | null
    feeBreakdown: object
    error?: string

In `mvp-app`, add:

    data class EventTeamPaymentCheckoutRequest(...)
    data class EventTeamPaymentCheckout(...)
    suspend fun IBillingRepository.createEventTeamPaymentCheckout(eventId: String, teamId: String, request: EventTeamPaymentCheckoutRequest): Result<EventTeamPaymentCheckout>
    suspend fun EventDetailComponent.createParticipantPaymentCheckout(teamId: String, request: EventTeamPaymentCheckoutRequest): Result<EventTeamPaymentCheckout>

Use the existing `coil3.compose.AsyncImage` dependency to display the returned QR image URL.

Revision note 2026-05-05: Created this plan after reading the existing billing and webhook paths so the implementation can proceed from a self-contained contract.
