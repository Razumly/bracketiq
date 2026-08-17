# Participant Management Dialog For Mobile Event Details

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. It is stored under `plans/` as required by that file.

## Purpose / Big Picture

Event managers on mobile need to tap a team or participant while in participant manage mode and see payment and document status before acting. After this change, the old inline `Refund`, `Send Bill`, and `Remove` buttons will move into a dedicated management dialog. The dialog will mirror the mvp-site schedule page compliance modal: it shows payment completion, required-signature completion, and per-user details that expand only after tapping a user row.

## Progress

- [x] (2026-05-04 20:02Z) Read the mobile participant view, existing mobile billing/refund actions, and the mvp-site schedule compliance modal and endpoints.
- [x] (2026-05-04 22:30Z) Added mobile repository DTOs, repository methods, and component state for team and participant compliance summaries.
- [x] (2026-05-04 22:38Z) Replaced inline manage buttons with click-to-open management dialogs for teams and participants.
- [x] (2026-05-04 22:38Z) Rendered per-user collapsed cards that expand to show bill/payment and required-document details.
- [x] (2026-05-04 22:38Z) Preserved the existing refund, send bill, and remove behaviors from the new dialog action area.
- [x] (2026-05-04 22:55Z) Ran focused Gradle verification and recorded results.

## Surprises & Discoveries

- Observation: The current mobile `Refund`, `Send Bill`, and `Remove` buttons are in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/ParticipantsVeiw.kt`, not in `EventDetailScreen.kt`.
  Evidence: The button rows are rendered under `TeamCard` and `PlayerCardWithActions` when `manageMode && canManageParticipants`.
- Observation: The web schedule page already exposes compliance endpoints that return the exact payment/document summaries needed by mobile.
  Evidence: `mvp-site/src/app/events/[id]/schedule/page.tsx` fetches `/api/events/{eventId}/teams/compliance` and `/api/events/{eventId}/users/compliance`.
- Observation: The mvp-site compliance modal shows per-user document rows only after expanding a user row, and payment information is represented by a primary bill summary rather than a full bill ledger.
  Evidence: `selectedComplianceSummary.users.map(...)` renders an Expand button, and the expanded row maps `userSummary.requiredDocuments`.
- Observation: The open mobile dialog must re-resolve its target against the latest compliance maps.
  Evidence: If a manager taps before compliance loading finishes, storing only the initial target snapshot would leave the dialog on fallback/default details after the state updates.

## Decision Log

- Decision: Consume the existing mvp-site compliance endpoints from `EventRepository` rather than deriving payment and document state locally from registration status.
  Rationale: The web endpoints already combine bills, signatures, parent/child context, and required templates. Reimplementing that logic in mobile would drift from the backend source of truth.
  Date/Author: 2026-05-04 / Codex
- Decision: Keep the full refund and bill creation dialogs as separate flows opened from the new management dialog.
  Rationale: Those dialogs already handle payment-specific input and API mutation. The new dialog should collect the management entry point and summary information, not duplicate refund amount or bill creation forms inline.
  Date/Author: 2026-05-04 / Codex

## Outcomes & Retrospective

Implemented. Mobile participant manage mode now opens a dedicated dialog for team and participant card taps. The dialog shows target-level payment and required-signature status, hides each user's bill/document detail until that user card is tapped, and moves the existing `Refund`, `Send Bill`, and `Remove` actions into the dialog footer with `Remove` full width at the bottom.

Verification:

- `./gradlew :composeApp:compileDebugKotlinAndroid` completed with `BUILD SUCCESSFUL`.
- `./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest.getEventTeamCompliance_fetches_team_payment_and_document_status' --tests 'com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest.getEventUserCompliance_fetches_user_payment_and_document_status'` completed with `BUILD SUCCESSFUL`.
- Running the full `EventRepositoryHttpTest` class still fails in existing cache/forbidden tests unrelated to the compliance endpoints: `getEventsByIds_removes_stale_cached_events_missing_from_server` expects an encoded comma in the raw query, and `getEvent_removes_cached_event_when_server_returns_forbidden` does not observe the expected cache eviction.

## Context and Orientation

The mobile app is a Kotlin Multiplatform project under `composeApp/`. The relevant UI file is `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/ParticipantsVeiw.kt`. Despite the misspelling in the filename, this is the active Participants tab body. It renders team cards, participant cards, the old inline management action buttons, the existing refund dialog, and the existing send-bill dialog.

The backing component is `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`. It already exposes participant manage mode data through `participantManagementSnapshot` and supports the existing mutations: `removeTeamParticipant`, `removeUserParticipant`, `getParticipantBillingSnapshot`, `createParticipantBill`, and `refundParticipantPayment`.

The backend source of truth is the sibling repo `/Users/elesesy/StudioProjects/mvp-site`. The schedule page at `src/app/events/[id]/schedule/page.tsx` uses two compliance endpoints while editing an event: `/api/events/{eventId}/teams/compliance` for team-signup events and `/api/events/{eventId}/users/compliance` for non-team participant events. Those endpoints return payment summaries and required-document summaries.

## Plan of Work

First, add mobile data classes for compliance payment summaries, document counts, required documents, user summaries, and team summaries in `EventRepository.kt`. Add interface methods and DTO mappings for the two site endpoints.

Second, add state to `EventDetailComponent` for team compliance summaries keyed by team id, user compliance summaries keyed by user id, and loading state. Load this state when participant manage mode starts, clear it when manage mode stops, and refresh it after bill/refund/remove mutations where needed.

Third, update `ParticipantsVeiw.kt` so manage-mode team and participant cards open a new management dialog instead of showing inline buttons. Non-manage behavior remains unchanged: team cards open the normal team details dialog and participant cards open their social/action popup.

Fourth, implement the management dialog. The top of the dialog shows the target name, payment summary, and required-signature summary. The middle shows collapsed user rows. Tapping a user row expands bill/payment and required-document details beneath that user. The bottom action area has `Refund` and `Send Bill` side by side, then a full-width `Remove` button below.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-app`.

1. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`.
2. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`.
3. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/ParticipantsVeiw.kt`.
4. Update test fakes that implement `IEventRepository`.
5. Run focused Gradle tests.

## Validation and Acceptance

Acceptance is user-visible. On a team-signup event, enter participant manage mode and tap a real team card. A management dialog opens. The dialog shows payment and required-signature status at the top, then user rows. Tapping a user row expands bill/payment and required-document details. The bottom action area shows `Refund` and `Send Bill` next to each other and a full-width `Remove` button beneath them.

On a non-team event, enter participant manage mode and tap a participant card. The same dialog pattern opens for that participant. The old inline action buttons should no longer appear under team or participant cards.

Targeted verification command:

    ./gradlew :composeApp:compileDebugKotlinAndroid
    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest.getEventTeamCompliance_fetches_team_payment_and_document_status" --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest.getEventUserCompliance_fetches_user_payment_and_document_status"

The command should complete with `BUILD SUCCESSFUL`.

## Idempotence and Recovery

All changes are source-only and safe to re-run. If the repository DTO mapping fails, inspect the mvp-site endpoint response types in `src/lib/eventTeamCompliance.ts` and update the Kotlin DTOs to match. If the dialog layout fails to compile, revert only the touched `ParticipantsVeiw.kt` section and keep repository/component tests in place.

## Artifacts and Notes

Important source snippets discovered during research:

    mvp-site schedule page fetches /api/events/{eventId}/teams/compliance and /api/events/{eventId}/users/compliance.
    mvp-site compliance user summaries include payment, documents, and requiredDocuments.
    mobile ParticipantsVeiw.kt already has reusable billing/refund contexts and mutation calls.

## Interfaces and Dependencies

In `EventRepository.kt`, define compliance models and methods:

    data class EventCompliancePaymentSummary(...)
    data class EventComplianceDocumentCounts(...)
    data class EventComplianceRequiredDocument(...)
    data class EventComplianceUserSummary(...)
    data class EventTeamComplianceSummary(...)
    suspend fun getEventTeamCompliance(eventId: String): Result<List<EventTeamComplianceSummary>>
    suspend fun getEventUserCompliance(eventId: String): Result<List<EventComplianceUserSummary>>

In `EventDetailComponent.kt`, expose state:

    val teamComplianceSummaries: StateFlow<Map<String, EventTeamComplianceSummary>>
    val userComplianceSummaries: StateFlow<Map<String, EventComplianceUserSummary>>
    val participantComplianceLoading: StateFlow<Boolean>

Plan revision note: Initial plan authored after inspecting both mobile participant management and mvp-site compliance surfaces.
