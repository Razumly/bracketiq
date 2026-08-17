# Event registration questions and held-registration timer on mobile

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. It covers the Kotlin Multiplatform mobile client in `mvp-app`. The matching backend/web plan lives in `/Users/elesesy/StudioProjects/mvp-site/plans/event-registration-questions-and-hold-timer-execplan.md`; that plan owns the API contract because `mvp-site` is the source of truth for backend endpoints and data models.

## Purpose / Big Picture

Mobile users need the same event registration question and checkout-hold behavior as the web app. After this change, event registration questions appear at the bottom of Event Details as a collapsible list, team registration questions use the same collapsible behavior, answers are collected before payment starts, and a floating bottom-left timer says `Your registration is held for MM:SS` while a paid event or team registration slot is held. If a user closes the registration flow and returns before the hold expires, the app restores their local progress instead of making them start over.

## Progress

- [x] (2026-06-08T17:16:50Z) Researched current mobile event-detail, team-question, billing, and local storage paths.
- [x] (2026-06-08T17:16:50Z) Created this mobile ExecPlan and linked it to the backend/web ExecPlan.
- [x] (2026-06-08T18:25:00Z) Added mobile DTO/repository support for event registration questions and hold metadata.
- [x] (2026-06-08T18:25:00Z) Added local registration-progress persistence using existing DataStore infrastructure.
- [x] (2026-06-08T18:25:00Z) Updated Event Details and team-question UI to use collapsible question lists.
- [x] (2026-06-08T18:25:00Z) Added the floating held-registration timer and clear expired progress.
- [x] (2026-06-08T18:33:00Z) Updated focused mobile tests and ran validation.

## Surprises & Discoveries

- Observation: Mobile already has team registration questions, but they are presented in a non-collapsible `AlertDialog`.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt` renders `TeamJoinQuestionsDialog`, and `EventDetailComponent.kt` opens it after `teamRepository.getTeamJoinRequestContext(teamId)`.
- Observation: Mobile does not currently fetch event-scoped registration questions before event checkout.
  Evidence: `EventDetailComponent.executeJoinEvent` and `executeJoinEventAsTeam` go from required signing/billing-address checks directly to `billingRepository.createPurchaseIntent`.
- Observation: Mobile purchase-intent payloads do not include event-question answers yet.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/BillingDtos.kt` defines `PurchaseIntentRequestDto` without an `answers` field.
- Observation: Mobile purchase-intent parsing does not include registration hold metadata yet.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt` defines `PurchaseIntent` without `registrationId`, `registrationHoldExpiresAt`, or `registrationHoldTtlSeconds`.
- Observation: The app already has cross-platform local preference storage through `CurrentUserDataSource`.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/CurrentUserDataSource.kt` wraps DataStore `Preferences` and stores small user-scoped strings.
- Observation: The mobile worktree already has unrelated Gradle/iOS metadata changes.
  Evidence: `git status --short --branch` shows modified `composeApp/build.gradle.kts`, podspec, Podfile lock, Pods manifests, and iOS Info.plist. Implementation must not revert them.
- Observation: Existing event-detail test fakes used the older no-answer registration methods, while the new production path only needs answer-aware calls when answers exist.
  Evidence: `EventDetailComponent` now routes empty-answer event joins and purchase-intent calls through the original no-answer repository methods and uses answer-aware methods only when there are event question answers to submit.
- Observation: One mobile join-flow fixture had become past-dated on June 8, 2026, causing the existing registration-open guard to block the join.
  Evidence: `EventDetailMobileJoinFlowTest.league_mobile_flow_loads_playoffs_staff_invites_schedule_and_periphery_then_keeps_them_after_join` was moved from 2026 dates to 2030 dates.

## Decision Log

- Decision: Treat the `mvp-site` plan as the API source of truth and implement mobile parsing as nullable/backwards-compatible.
  Rationale: The app repository instructions require backend/data contract changes to be aligned with `mvp-site`, and nullable fields let mobile compile before the backend is fully deployed.
  Date/Author: 2026-06-08 / Codex
- Decision: Use existing DataStore-backed `CurrentUserDataSource` for mobile registration progress instead of adding Room tables or a new storage dependency.
  Rationale: The progress payload is small, user-scoped, and temporary. Room schema changes would add migration work without improving the 10-minute resume behavior.
  Date/Author: 2026-06-08 / Codex
- Decision: Use one shared registration-question UI for event and team registration.
  Rationale: The user asked event and team questions to behave the same. A shared composable prevents the team dialog and event details section from diverging again.
  Date/Author: 2026-06-08 / Codex
- Decision: Do not persist Stripe client secrets as the primary resume mechanism.
  Rationale: The backend can reuse a still-held `STARTED` registration and reusable PaymentIntent from the same answers/selection. The app should persist draft context and let the server return current checkout data again.
  Date/Author: 2026-06-08 / Codex

## Outcomes & Retrospective

Implemented the mobile portion. The app now parses and submits event registration answers, parses nullable hold metadata from purchase-intent responses, persists local registration progress in `CurrentUserDataSource`, restores unexpired event answers/selection, blocks join/payment when required event questions are unanswered, and clears progress on completion or expiration.

Event Details now renders event registration questions at the bottom as a collapsible section. The existing team registration question dialog now uses collapsible question content, and the screen renders a floating bottom-left `Your registration is held for MM:SS` timer outside dialogs while a paid registration is held.

Focused validation passed:

    ./gradlew :composeApp:compileDebugKotlinAndroid --console=plain --no-daemon
    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest" --tests "com.razumly.mvp.eventDetail.EventDetailMobileJoinFlowTest" --console=plain --no-daemon

## Context and Orientation

The event detail feature lives under `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/`. `EventDetailComponent.kt` owns registration flow state and commands. `EventDetailScreen.kt` renders the Compose UI and currently renders `TeamJoinQuestionsDialog`. Event and billing network calls live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`, `TeamRepository.kt`, and `BillingRepository.kt`. JSON request DTOs live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/`.

The backend/web plan adds these optional fields to event and team-registration purchase-intent responses:

- `registrationId?: string | null`
- `registrationHoldExpiresAt?: string | null`, an ISO timestamp.
- `registrationHoldTtlSeconds?: number | null`, expected to be `600`.

The backend already exposes event questions through the same route the web uses:

    GET /api/registration-questions?scopeType=EVENT&scopeId=<eventId>

Responses contain `questions`, each with `id`, `prompt`, `answerType`, `required`, and `sortOrder`. Submitting answers to purchase intent uses an `answers` array or map; mobile should send an array of objects shaped as `{ questionId: string, answer: string }` to match the web service contract.

Local registration progress means a temporary, device-local JSON draft. It is not authoritative. The server must still validate required answers, capacity, document status, division selection, billing address, and payment state every time the user continues.

## Plan of Work

First, add mobile contract types. Create a shared mobile registration question model, for example `RegistrationQuestion`, in the repository layer or a small core data file. Add DTO parsing for `GET /api/registration-questions` and a repository method that can fetch event questions by event id. Reuse the existing team question model or migrate both event and team flows to the shared model. Extend `PurchaseIntentRequestDto` with `answers: List<RegistrationQuestionAnswerDto> = emptyList()`. Extend `PurchaseIntent` with nullable `registrationId`, `registrationHoldExpiresAt`, and `registrationHoldTtlSeconds`.

Second, load event questions for Event Details. In `EventDetailComponent`, fetch event-scoped questions when a selected event id becomes available and expose them through a `StateFlow`. Keep failures non-blocking for read-only event display, but block registration with a clear error if questions cannot be loaded when the user attempts to continue. For team registration, continue using `getTeamJoinRequestContext`, but normalize its questions into the shared model before rendering.

Third, implement shared progress persistence. Add a serializable data class such as `RegistrationProgressDraft` with version, user id, event id, target type, target id, selected division id, weekly `slotId`, `occurrenceDate`, question answers, current step, `registrationId`, `holdExpiresAt`, and `updatedAt`. Add methods to `CurrentUserDataSource` to save, load, and clear registration progress by a deterministic key. The key should include user id, event id, target type, target id, selected occurrence, and selected team when applicable so drafts for different events or weekly occurrences do not collide. Expired drafts should be ignored and removed.

Fourth, update Event Details UI. Add a bottom-of-details `RegistrationQuestionsSection` that displays event questions as a collapsible list. Collapsed state should be stable while the user stays on the event. When the user taps Join and required answers are missing, expand the section and show an inline validation message instead of silently jumping to payment. Answers should save into component state and persist to the local draft as they change. If there are no event questions, do not show an empty decorative section.

Fifth, update team questions to behave the same. Replace the current non-collapsible `TeamJoinQuestionsDialog` body with the shared `RegistrationQuestionsSection` or an equivalent shared composable. The list should start expanded when there are required unanswered questions and be collapsible once visible. Validation should still require required answers before request-to-join, free registration, required document signing, or payment.

Sixth, enforce question-before-payment sequencing. Update `executeJoinEvent`, `executeJoinEventAsTeam`, and the team registration continuation path so event/team answers are collected and validated before `billingRepository.createPurchaseIntent` or `createTeamRegistrationPurchaseIntent` is called. Pass event answers into event purchase-intent calls. For free registrations and payment-plan flows, pass event answers into the existing event participant endpoints if those endpoints accept answers; if they do not, align with the backend plan before implementation continues. Do not start payment if required answers are missing.

Seventh, add the floating timer. Store the server-returned `registrationHoldExpiresAt` when purchase intent starts. Render a floating container from `EventDetailScreen` outside `AlertDialog` content, aligned bottom-left, with `Your registration is held for MM:SS`. Use a coroutine or Compose time state to update once per second. When the timestamp expires, clear the local draft, clear held checkout state, hide the timer, and show a user-facing message that the registration hold expired.

Eighth, resume progress. When Event Details opens or the selected event/occurrence/target changes, load a matching unexpired draft. Restore answers and selection. If the draft had reached checkout, let the user continue from the same registration step by calling the backend again with the saved answers and selection; the backend should reuse the existing held reservation while it is still valid. Clear the draft after confirmed registration success, explicit discard, sign-out/user switch, or timer expiration.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-app`.

1. Update DTOs and repositories in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/BillingDtos.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`, and the repository file chosen for `GET /api/registration-questions`.
2. Add DataStore methods and serializable draft helpers in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/CurrentUserDataSource.kt` or a small adjacent helper used by that data source.
3. Update `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` to load event questions, validate answers, save/load progress, pass answers into checkout, and expose timer state.
4. Update `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt` with the bottom Event Details question section, shared collapsible team-question rendering, and floating timer container.
5. Add focused tests for DTO parsing, DataStore progress serialization, billing payload answers/hold metadata, and EventDetail flow ordering.
6. Run the validation commands below.

## Validation and Acceptance

Focused automated validation should include:

    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest" --tests "com.razumly.mvp.eventDetail.EventDetailMobileJoinFlowTest" --console=plain --no-daemon
    ./gradlew :composeApp:compileDebugKotlinAndroid --console=plain --no-daemon

Add new tests if the named suites do not cover the new behavior. At minimum, test that event checkout sends question answers before payment intent creation, that purchase-intent parsing preserves `registrationHoldExpiresAt`, that local progress reloads only for the matching event/user/target/occurrence, and that a required unanswered question prevents payment.

Manual acceptance is:

- Event Details shows event registration questions at the bottom as a collapsible list when the event has questions.
- Team registration questions use the same collapsible list behavior as event questions.
- Pressing Join with a required unanswered question expands the list and does not open payment.
- Paid checkout starts only after questions and required documents are complete.
- When paid checkout starts, a floating bottom-left container outside the dialog says `Your registration is held for MM:SS` and counts down from up to 10 minutes.
- Closing and reopening Event Details before expiration restores the question answers and registration step for the same event and target.
- Expired progress is cleared and does not block a fresh registration attempt.

## Idempotence and Recovery

The mobile changes should not require a Room database version bump if progress is stored in DataStore rather than Room. DataStore writes are safe to overwrite for the same deterministic draft key. If the backend has not yet deployed the new hold metadata, the app should continue to register normally without showing the timer. If local storage parsing fails, clear that draft and continue without resume support.

Do not run Gradle tests concurrently with another agent in this checkout. Preserve unrelated Gradle/iOS metadata changes already present in the working tree.

## Artifacts and Notes

The backend/web plan intentionally avoids persisting Stripe client secrets as the resume source. Mobile should follow that pattern: store answers, selection, step, registration id, and expiration, then ask the server for current checkout data again when the user continues.

## Interfaces and Dependencies

The final mobile purchase-intent model should include:

    data class PurchaseIntent(
        val paymentIntent: String? = null,
        val publishableKey: String? = null,
        val registrationId: String? = null,
        val registrationHoldExpiresAt: String? = null,
        val registrationHoldTtlSeconds: Int? = null,
        ...
    )

The final mobile purchase-intent request DTO should include:

    val answers: List<RegistrationQuestionAnswerDto> = emptyList()

The final event-detail component should expose enough state for the screen to render event questions, validation, and the active hold timer without putting storage or network calls inside composables.

Revision note, 2026-06-08: Initial plan created after source inspection. It records that mobile has team questions but lacks event-question fetch, local registration progress, and held-registration timer support.
