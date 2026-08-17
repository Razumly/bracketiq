# Mobile manual registration payments

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. It covers the Kotlin Multiplatform app in this repository and depends on the matching backend/site manual registration payment work in `/Users/elesesy/StudioProjects/mvp-site`.

## Purpose / Big Picture

Mobile users should be able to register for paid events and team-based registrations when the host has chosen manual/self-managed payments instead of Stripe processing. The app should still preserve the normal bill and payment-plan model, but paid manual registrations must not open Stripe PaymentSheet. Instead, users see the host's payment links and instructions, upload an image as proof of payment, and wait for the host to review the proof. Hosts can inspect submitted proof images from participant management, accept or reject them, and enter the amount accepted. Accepted amounts greater than zero make the installment partially paid, and accepted amounts equal to the installment amount make it fully paid.

For a visible end-to-end check, create or edit an event with manual registration payments, register a user or team from mobile, confirm that a bill is created without Stripe checkout, upload proof from Profile bills, then review the proof from event participant management and see the bill status update.

## Progress

- [x] (2026-06-27 05:50Z) Created this ExecPlan from the current mobile code and the committed web backend contract.
- [x] (2026-06-27) Extended mobile event, billing, proof, and payment-link data contracts.
- [x] (2026-06-27) Added manual payment controls to mobile event create/edit and event-detail edit flows.
- [x] (2026-06-27) Updated event registration and team registration flows to bypass Stripe when manual payments are selected.
- [x] (2026-06-27) Added profile bill proof upload UX and repository calls.
- [x] (2026-06-27) Added host proof review UX in participant management.
- [x] (2026-06-27) Suppressed refund request and auto-refund actions for manual-payment registrations.
- [x] (2026-06-27) Added provider image resources and rendered them in manual-payment link rows.
- [x] (2026-06-27) Added focused tests and ran Android compile/test validation.
- [x] (2026-06-27) Added provider username input support and validated manual-payment setup on an Android emulator.

## Surprises & Discoveries

- Observation: The `mvp-app` checkout is already dirty and far ahead of origin.
  Evidence: `git status --short --branch` showed `master...origin/master [ahead 120]` with many modified app files and untracked team-search/icon/script files before this plan was written.

- Observation: Mobile already has in-progress or local work for open team registration and paid team registration.
  Evidence: `Team.kt`, `TeamDtos.kt`, `TeamRepository.kt`, `CreateOrEditTeamScreen.kt`, `TeamDetailsDialog.kt`, `OrganizationDetailComponent.kt`, and `EventRegistrationActionHandler.kt` already reference `openRegistration`, `registrationPriceCents`, `requestTeamRegistration`, and `createTeamRegistrationPurchaseIntent`.

- Observation: Web manual registration payments use stable enum/string values that mobile should mirror exactly.
  Evidence: `/Users/elesesy/StudioProjects/mvp-site/src/lib/manualRegistrationPayments.ts` defines `registrationPaymentMode` values `ONLINE` and `MANUAL`, payment providers `CASH_APP`, `VENMO`, `PAYPAL`, `STRIPE`, `ZELLE`, and `OTHER`, and proof statuses are `SUBMITTED`, `ACCEPTED`, and `REJECTED`.

- Observation: Mobile already has a reusable image upload path that returns the backend file id needed by the proof API.
  Evidence: `ImagesRepository.uploadImage` posts multipart data to `api/files/upload` and returns `response.file.id`.

- Observation: Android Kotlin compilation passed after the contract/API/UI implementation, and the focused DTO/registration tests pass after rebuilding generated outputs.
  Evidence: `./gradlew :composeApp:compileDebugKotlinAndroid` passed. After clearing generated build output to recover from Kotlin daemon/KSP cache failures, `./gradlew --no-daemon :composeApp:compileDebugKotlinAndroid` passed and `./gradlew --no-daemon :composeApp:testDebugUnitTest --tests com.razumly.mvp.eventDetail.EventRegistrationFlowCoordinatorTest --tests com.razumly.mvp.core.network.dto.EventDtosTest` passed.

- Observation: Expanding `IBillingRepository` required updating shared test fakes outside the focused manual-payment tests.
  Evidence: `CreateEvent_FakeBillingRepository` needed `submitManualPaymentProof` and `reviewManualPaymentProof` implementations before `compileDebugUnitTestKotlinAndroid` could compile the test source set.

- Observation: The first emulator save failure was not an Android crash. It was a stale local web backend rejecting new manual-payment fields.
  Evidence: With the old `node server.mjs` process on port 3000, logcat showed `PATCH http://10.0.2.2:3000/api/events/... -> HTTP 400` with `unknownKeys:["registrationPaymentMode","manualPaymentLinks"]`. Restarting with direct `npx next dev -H 0.0.0.0 -p 3000` served current source and the same emulator save produced backend `PATCH /api/events/... 200`.

- Observation: The custom `npm run dev:plain` server path currently fails API routes in this checkout because `.next/dev/required-server-files.json` is missing.
  Evidence: `node server.mjs --dev` returned 500 for `/api/events/...` and `/api/chat/groups` with `ENOENT: no such file or directory, open '.next/dev/required-server-files.json'`.

## Decision Log

- Decision: Mirror the web contract as strings in the first pass rather than inventing mobile-only enum wire values.
  Rationale: Existing DTOs already tolerate optional string fields from the backend, and exact values avoid API translation bugs across `ONLINE`, `MANUAL`, provider names, and proof statuses.
  Date/Author: 2026-06-27 / Codex

- Decision: Treat manual payments as a billing state, not a separate registration type.
  Rationale: The backend still creates normal bills and bill payments; mobile should reuse payment-plan UI, bill refresh, and participant billing snapshots, replacing only the Stripe checkout action with proof upload/review.
  Date/Author: 2026-06-27 / Codex

- Decision: Reuse `ImagesRepository.uploadImage` for proof files.
  Rationale: The proof endpoint accepts a `fileId`, and the existing upload path already handles authenticated image upload to the same backend file service.
  Date/Author: 2026-06-27 / Codex

## Outcomes & Retrospective

Implementation is complete for the mobile event-registration scope in this plan. Mobile now carries manual registration payment fields through event DTOs and Room, can submit and review manual proof images through billing endpoints, switches paid manual registrations away from Stripe checkout, shows manual-payment controls in event edit, lets users upload proof from Profile bills, lets hosts review submitted proof from participant billing, suppresses platform refund actions for manual-payment events, and includes branded Cash App, Venmo, PayPal, and Stripe resources.

Validation so far:

- `./gradlew :composeApp:compileDebugKotlinAndroid` passed after the contract/API changes.
- `./gradlew :composeApp:compileDebugKotlinAndroid` passed after the UI/resource/registration/profile/host-review changes.
- `./gradlew --no-daemon :composeApp:compileDebugKotlinAndroid` passed after clearing `composeApp/build`.
- `./gradlew --no-daemon :composeApp:testDebugUnitTest --tests com.razumly.mvp.eventDetail.EventRegistrationFlowCoordinatorTest --tests com.razumly.mvp.core.network.dto.EventDtosTest` passed after updating the shared billing fake.
- `./gradlew --no-daemon :composeApp:testDebugUnitTest --tests com.razumly.mvp.core.network.dto.EventDtosTest --tests com.razumly.mvp.eventDetail.EventRegistrationFlowCoordinatorTest` passed after adding provider username URL coverage.
- `./gradlew :composeApp:installDebug --console=plain` installed successfully on `emulator-5554`.
- Android emulator QA on `emulator-5554` verified opening event edit, expanding Event Details, toggling manual payments on, adding a Venmo link, rendering the Venmo provider image, typing username `bracketiq`, and saving successfully against current `mvp-site` source. Crash log stayed empty.
- `git diff --check` and `git diff --cached --check` passed.

## Context and Orientation

The backend/site implementation is already committed in `/Users/elesesy/StudioProjects/mvp-site`. Its key mobile-facing contract is:

- Event fields: `registrationPaymentMode`, `manualPaymentLinks`, and `manualPaymentInstructions`.
- Payment mode values: `ONLINE` and `MANUAL`.
- Manual payment link shape: `{ id, provider, label, url }`, with HTTPS URLs only.
- Provider values: `CASH_APP`, `VENMO`, `PAYPAL`, `STRIPE`, `ZELLE`, `OTHER`.
- Proof upload: `POST /api/billing/bills/{billId}/payments/{paymentId}/proof` with body `{ "fileId": "..." }`, returning `{ proof }`.
- Proof review: `POST /api/billing/bills/{billId}/payments/{paymentId}/proofs/{proofId}/review` with body `{ "decision": "ACCEPT" | "REJECT", "amountAcceptedCents"?: number, "reviewNote"?: string | null }`, returning `{ bill }`.
- Event team billing snapshot: `GET /api/events/{eventId}/teams/{teamId}/billing` now includes `manualPaymentProofs` on each payment, with `id`, `status`, `fileId`, `fileUrl`, and `amountAcceptedCents`.
- Event compliance summaries include `manualPaymentProofStatus` and `manualPaymentProofCount`.
- Stripe checkout and refund endpoints reject manual-payment event bills.

The mobile event model starts in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`. Event backend DTOs live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`, while local DTO mapping lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/EventDTO.kt`. Because `Event` is a Room entity, adding persisted fields requires a `MVP_DATABASE_VERSION` bump in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/db/MVPDatabaseService.kt` and schema regeneration.

Billing contracts are concentrated in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Bill.kt`, and `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/BillingDtos.kt`. Profile bill UX is in `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileComponent.kt` and `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileFeatureScreens.kt`.

Event registration control flow is in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationActionHandler.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt`, and `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventJoinExecutionCoordinator.kt`. Host participant billing/refund UI is in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/ParticipantsVeiw.kt` and `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventParticipantManagementCoordinator.kt`.

Mobile event create/edit pricing controls currently live across `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailsRegistrationSection.kt`, division editor files, and validation helpers. Refund controls are in `RefundPolicy.kt`, `EventDetailScreen.kt`, `EventWithdrawalActionCoordinator.kt`, and `CancellationRefundOptions.kt`.

Provider assets should come from the web app's checked-in assets when possible:

- `/Users/elesesy/StudioProjects/mvp-site/public/payment-providers/cash-app-pay.svg`
- `/Users/elesesy/StudioProjects/mvp-site/public/payment-providers/stripe.svg`
- `/Users/elesesy/StudioProjects/mvp-site/public/payment-providers/paypal.png`
- `/Users/elesesy/StudioProjects/mvp-site/public/payment-providers/venmo.png`

Place mobile-compatible copies under `composeApp/src/commonMain/composeResources/drawable/` with stable names such as `payment_provider_cash_app`, `payment_provider_stripe`, `payment_provider_paypal`, and `payment_provider_venmo`.

## Plan of Work

First, extend the shared data contract. Add `registrationPaymentMode`, `manualPaymentLinks`, and `manualPaymentInstructions` to `Event`, event DTOs, API DTOs, create/update payloads, copy helpers, cache mapping, and any event draft state. Add a serializable `ManualPaymentLink` model and a normalization helper that defaults invalid or missing payment mode to `ONLINE`, filters blank/non-HTTPS URLs, and trims labels. Persist the link list either through an existing Room converter pattern or a new converter. Bump `MVP_DATABASE_VERSION` from its current value and regenerate Room schemas.

Second, extend billing models and repository calls. Add `paidAmountCents` to `BillPayment` and bill payment API mapping because manual acceptance can be partial. Add `ManualPaymentProof` DTO/domain models and include proof lists on `EventTeamBillingPaymentSnapshot`; if the generic bill-payment list endpoint does not return proof data to mobile, extend mobile parsing to accept proof fields when present and add a backend follow-up only if the current web API lacks that response. Add `submitManualPaymentProof` and `reviewManualPaymentProof` to `IBillingRepository` and `BillingRepository`.

Third, update event create/edit. Add a payment-processing choice near price/payment-plan settings: BracketIQ/Stripe processing versus manual payment. When manual is selected, show provider link inputs and instructions, keep event price and payment-plan controls available, and show copy that the host is responsible for collecting payments and handling refunds directly. Disable or clear auto-refund controls when manual mode is selected. Do not add platform/Stripe fees to manual prices or preview totals.

Fourth, update registration flow. For paid manual event registration and paid manual team event registration, still call the normal participant registration flow so the backend creates the bill and payment schedule. After the join succeeds, skip `createPurchaseIntent`, `createEventTeamPaymentCheckout`, and PaymentSheet. Show manual payment links and route the user toward Profile bills to upload proof. Existing payment-plan messages should say "Upload proof from Profile" instead of "Pay installments from Profile" when the event uses manual payments.

Fifth, update open team registration payments. The app already has paid team registration support via `createTeamRegistrationPurchaseIntent` and `purchaseType = "team_registration"`. Before implementation, verify whether the backend has a manual-payment contract for standalone team registration fees, not just event registration bills. If the backend supports manual team registration bills, implement the same proof-upload path for those team bills. If it does not, do not invent a mobile-only endpoint; record the backend gap in this plan and keep this implementation scoped to manual event registrations and event team registrations.

Sixth, update Profile bills. In `ProfileComponent.refreshPaymentPlans`, load enough event context for bills with `eventId` to know whether the related event is manual. Add manual-payment metadata to `ProfilePaymentPlan`, including next payable manual payment, latest proof status, and links/instructions. In `PaymentPlanCard`, replace the Pay button with "Upload payment proof" for manual event bills, use the existing image picker/upload flow to get a `fileId`, call `submitManualPaymentProof`, and show submitted, accepted, rejected, partial, and fully paid states. Disable Stripe cancel/payment actions for manual payments.

Seventh, update host participant management. Extend `EventCompliancePaymentSummary`, compliance DTO parsing, cache entries, and cards so hosts see proof submitted, proof accepted, proof rejected, proof count, and accepted amount where available. In the existing participant billing/refund modal, render proof thumbnails or links from `fileUrl`, show the current proof status, provide accept/reject actions, and require an accepted amount for approval. An accepted amount of `0` should not be sent as an approval; users should reject or enter a positive amount. After review, refresh the billing snapshot and compliance summaries.

Eighth, suppress refunds for manual payments. `getRefundPolicy`, withdrawal decisions, event detail button labels, participant refund actions, and team registration refund actions should not show auto-refund or refund-request actions for manual-payment registrations. Leaving/withdrawing copy should say refunds are handled directly by the host. Keep Stripe refund behavior unchanged for `ONLINE` events.

Ninth, add provider images and UI polish. Copy the Cash App, Stripe, PayPal, and Venmo assets into Compose resources and render them in manual payment link rows/buttons. Use branded images only as provider indicators; keep the URL/link label text visible for accessibility and fallback. Add a generic fallback icon/text treatment for `ZELLE` and `OTHER`.

Tenth, add tests. Cover DTO parsing, Room schema update, registration coordinator branching, refund suppression, profile proof upload state, and host proof review mapping. Keep tests focused around the business logic rather than broad screenshot automation until the flow is stable.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-app` unless otherwise noted.

1. Record the current dirty status before editing and avoid unrelated files unless the feature requires them.
2. Add manual payment models and normalization helpers, then wire event fields through `Event`, `EventDTO`, `EventApiDto`, create/update DTOs, repository mapping, and event form state.
3. Bump `MVP_DATABASE_VERSION`, run the Room schema generation task documented for this repo, and review schema output under `composeApp/schemas`.
4. Extend `BillPayment`, billing DTOs, event-team billing snapshot DTOs, proof DTOs, and `BillingRepository` methods for proof submit/review.
5. Add provider resources under `composeApp/src/commonMain/composeResources/drawable/`.
6. Update event create/edit UI for processing mode, manual links, instructions, refund suppression, and validation.
7. Update event and team registration action handlers so manual paid registrations create bills but do not start Stripe checkout.
8. Update Profile bills with proof upload and manual status display.
9. Update participant compliance and billing modal proof review.
10. Update refund/withdrawal copy and action availability.
11. Add focused unit tests for mapping and flow decisions.
12. Run validation commands and update this plan with results.

## Validation and Acceptance

Validation should include, at minimum:

- `./gradlew :composeApp:testDebugUnitTest`
- `./gradlew :composeApp:assembleDebug`
- The repo-appropriate Room schema generation command after the `Event` entity changes.

Add focused tests for:

- Event DTO parsing defaults missing `registrationPaymentMode` to `ONLINE`.
- Manual payment links parse only valid HTTPS links and preserve provider, label, and id.
- Create/update event payloads include manual payment fields and clear links/instructions when mode returns to `ONLINE`.
- Registration flow for a paid manual individual event registration creates or keeps the bill path and does not call purchase-intent creation.
- Registration flow for paid manual team event registration does not call Stripe checkout.
- Refund policy/actions do not expose auto-refund or refund request for manual-payment events.
- Profile bill actions show proof upload instead of Pay for manual event bills.
- Billing proof submit/review DTOs map proof status, file URL, and accepted amount.
- Participant compliance renders submitted/accepted/rejected proof status from API summaries.

Manual QA should use a local web backend with the web feature available:

1. Create an event with a positive price, `registrationPaymentMode = MANUAL`, payment links, instructions, and payment plans enabled.
2. Register an individual user from mobile and confirm no PaymentSheet opens.
3. Confirm a bill appears in Profile bills with "Upload payment proof".
4. Upload an image proof and confirm the status becomes submitted.
5. Open host participant management, confirm the participant shows proof submitted, open the proof, accept a partial amount, and verify the bill shows partial paid.
6. Accept enough proof for the payment amount and verify fully paid status.
7. Repeat the registration and proof flow for team event registration.
8. Check leaving/withdrawing copy and confirm refund actions are not offered for manual-payment registrations.
9. Check an `ONLINE` event still uses the existing Stripe PaymentSheet and refund behavior.

## Idempotence and Recovery

The work is mostly additive. DTO parsing must keep old API responses valid by defaulting missing manual fields to `ONLINE`, empty links, and null instructions. Room migration is additive; schema generation can be rerun after the version bump. If the backend does not yet support standalone team registration manual payments, stop that slice at a documented backend contract gap and keep the event/team-event manual payment implementation shippable.

If image asset formats do not render in Compose resources on all targets, convert only the affected assets to a supported format while keeping the original branded shape and colors. If tests fail because of unrelated dirty checkout changes, capture the failure in `Surprises & Discoveries` and isolate feature tests with explicit `--tests` filters before running the full suite again.

## Interfaces and Dependencies

New or extended mobile models:

- `RegistrationPaymentMode` string constants: `ONLINE`, `MANUAL`.
- `ManualPaymentProvider` string constants: `CASH_APP`, `VENMO`, `PAYPAL`, `STRIPE`, `ZELLE`, `OTHER`.
- `ManualPaymentLink(id: String, provider: String, label: String, url: String)`.
- `ManualPaymentProof(id: String, status: String?, fileId: String, fileUrl: String?, amountAcceptedCents: Int?)`.
- `BillPayment.paidAmountCents: Int?`.
- `Event.registrationPaymentMode: String`, `Event.manualPaymentLinks: List<ManualPaymentLink>`, `Event.manualPaymentInstructions: String?`.

New `IBillingRepository` methods:

- `submitManualPaymentProof(billId: String, billPaymentId: String, fileId: String): Result<ManualPaymentProof>`.
- `reviewManualPaymentProof(billId: String, billPaymentId: String, proofId: String, decision: String, amountAcceptedCents: Int?, reviewNote: String?): Result<Bill>`.

Expected proof status behavior:

- `SUBMITTED`: user has uploaded proof and host has not reviewed it.
- `ACCEPTED`: host accepted proof and entered an accepted amount; bill payment status becomes `PARTIAL` or `PAID` based on the amount.
- `REJECTED`: host rejected proof; user can upload new proof if the payment remains unpaid.

Revision note: This plan was written after inspecting the current mobile checkout and the committed web backend contract. Update `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` as implementation proceeds.
