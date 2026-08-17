# EventDetails bootstrap endpoint and mobile hydration

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. It covers a cross-repository change: backend route work in `/Users/elesesy/StudioProjects/mvp-site` and mobile client work in `/Users/elesesy/StudioProjects/mvp-app`.

## Purpose / Big Picture

Opening EventDetails should hydrate the screen from one server payload instead of letting several independent client requests race each other. Today the mobile app can briefly show a cached participant count, replace it with the base event route's partial roster, then correct it when the participant snapshot route returns. After this change, a host or participant entering an event receives the event shell, participant snapshot, matches, fields, time slots, scoring config, staff invites, and host-only management data from one bootstrap endpoint. The app persists the durable pieces into Room so the visible screen is driven by local state and does not flicker through partial remote states.

## Progress

- [x] (2026-05-20 00:00Z) Confirmed the current app has a pending guard that prevents `getEvent()` from overwriting cached participant rosters with a partial base event response.
- [x] (2026-05-20 00:00Z) Read the existing mobile EventDetails participant, management, field/time-slot, match, and staff-invite load paths.
- [x] (2026-05-20 00:00Z) Read the existing backend event, participants, matches, compliance, field, time-slot, and league-scoring config route shapes.
- [x] (2026-05-20 00:00Z) Add a backend `GET /api/events/[eventId]/detail` route that returns the bootstrap payload using existing route contracts.
- [x] (2026-05-20 00:00Z) Add mobile DTOs and repository hydration that persists event, participant, team, user, match, field, management, and compliance rows into Room.
- [x] (2026-05-20 00:00Z) Wire EventDetailComponent to call the bootstrap path for event entry and occurrence changes, with `manage=true` when the viewer can manage the event.
- [x] (2026-05-20 00:00Z) Run focused backend and mobile tests plus diff checks.

## Surprises & Discoveries

- Observation: Mobile time slots and league scoring config are fetched for EventDetails but are not currently stored in Room DAOs.
  Evidence: `DatabaseService` exposes DAOs for events, teams, users, matches, fields, participant management, and compliance, but there is no TimeSlot DAO or LeagueScoringConfig DAO. The initial bootstrap will therefore persist the Room-backed entities and expose time slots/scoring config through the EventDetailComponent's in-memory state.

- Observation: The backend event route has the canonical event shell response, while participant and compliance routes already own their specialized shapes.
  Evidence: `/api/events/[eventId]` builds division details, official metadata, staff invites, and participant ID compatibility fields; `/api/events/[eventId]/participants` builds participant snapshots and management registrations; `/api/events/[eventId]/teams/compliance` and `/api/events/[eventId]/users/compliance` build host-only compliance summaries.

## Decision Log

- Decision: Add an additive bootstrap endpoint instead of changing the existing event, participants, matches, or compliance endpoints.
  Rationale: Existing web and mobile callers rely on those route contracts. An additive route lets the mobile EventDetails screen move to one initial request without breaking narrower refresh and mutation paths.
  Date/Author: 2026-05-20 / Codex

- Decision: Preserve Room as the visible source of truth for entities that already have DAOs, and carry time slots/scoring config in component state until dedicated DAOs exist.
  Rationale: Adding new Room tables for time slots and league scoring config would expand the migration and schema surface. The flicker reported by the user comes from event/participant/match/team state, which is already Room-backed.
  Date/Author: 2026-05-20 / Codex

- Decision: When `manage=true`, request the host-only participant registrations and compliance summaries during the bootstrap request.
  Rationale: Hosts should not wait until toggling manage mode to load registration detail. Loading it on event entry matches the user's preferred behavior and avoids the manage-mode button/list flicker from a late refresh.
  Date/Author: 2026-05-20 / Codex

## Outcomes & Retrospective

The implementation adds an additive backend event-detail bootstrap route and moves the mobile EventDetails initial hydration to that route. Room remains the source of truth for persisted event, participant, team, user, match, field, management, and compliance rows; time slots and league scoring config are carried in component state because they do not currently have Room DAOs.

Validation passed with:

    npm test -- --runInBand src/app/api/events/__tests__/eventDetailBootstrapRoute.test.ts
    npx tsc --noEmit --pretty false
    git diff --check
    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest.getEventDetailBootstrap_persists_detail_payload_and_management_cache"
    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.eventDetail.EventDetailMobileJoinFlowTest.eventEntryLoadsRegistrationDetailsAndManageModeReusesThemUntilRefresh"
    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest.getEvent_preserves_cached_participant_roster_until_participant_snapshot_refresh" --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest.getEventDetailBootstrap_persists_detail_payload_and_management_cache"

The only deliberate remaining gap is persistence for time slots and league scoring config. They are included in the one-call payload and used by EventDetailComponent, but durable local storage for them would require adding new Room entities, DAOs, schema migration, and tests.

## Context and Orientation

The mobile app lives at `/Users/elesesy/StudioProjects/mvp-app`. EventDetails is coordinated by `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`. Durable local state is stored through Room DAOs exposed by `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/DatabaseService.kt`. The event repository in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt` already knows how to fetch and merge participant snapshots, management registration snapshots, and compliance summaries.

The backend lives at `/Users/elesesy/StudioProjects/mvp-site`. The existing event shell route is `src/app/api/events/[eventId]/route.ts`. The participant snapshot route is `src/app/api/events/[eventId]/participants/route.ts`. Match list serialization lives in `src/app/api/events/[eventId]/matches/route.ts` and `src/server/scheduler/serialize.ts`. Compliance summaries are served from `src/app/api/events/[eventId]/teams/compliance/route.ts` and `src/app/api/events/[eventId]/users/compliance/route.ts`.

In this plan, "bootstrap" means the first server payload needed to render an EventDetails screen for one event and, for weekly events, one selected occurrence. "Room" means AndroidX Room, the local SQLite-backed database used by the shared Kotlin app.

## Plan of Work

Add a backend route at `src/app/api/events/[eventId]/detail/route.ts`. It should accept `slotId`, `occurrenceDate`, and `manage=true` query params. It should return the canonical event shell, participant snapshot, matches, fields, time slots, league scoring config, staff invites, and, when allowed and requested, either team or user compliance. It should reuse the existing route contracts so the mobile DTOs match the current app models.

Add `EventDetailBootstrapResponseDto` and `EventDetailSyncResult` on the mobile side. The repository method should fetch `api/events/{eventId}/detail`, merge the participant snapshot using the existing `mergeEventParticipantsSnapshot`, upsert teams/users/fields/matches into Room, replace management/compliance caches when present, and return the in-memory detail-only pieces such as time slots and league scoring config.

Update `EventDetailComponent` so initial non-weekly event entry and weekly occurrence changes call the bootstrap method. For viewers who can manage participant data, pass `manage=true`; otherwise pass `manage=false`. The old participant-management collector should stop issuing an additional immediate management fetch on the same view transition. Mutation paths may continue using narrow refresh calls because they are explicit state changes rather than initial hydration.

## Concrete Steps

Run these commands from `/Users/elesesy/StudioProjects/mvp-site` after the backend edit:

    npm test -- --runInBand src/app/api/events/__tests__/eventDetailBootstrapRoute.test.ts

Run these commands from `/Users/elesesy/StudioProjects/mvp-app` after the mobile edit:

    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest.getEventDetailBootstrap_*"
    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.eventDetail.EventDetailMobileJoinFlowTest.eventEntryLoadsRegistrationDetailsAndManageModeReusesThemUntilRefresh"
    git diff --check

The exact test names may be adjusted to match the final regression names, but validation must include one backend route test and one mobile repository or EventDetails behavior test.

## Validation and Acceptance

Acceptance is behavior-based. A non-host opening EventDetails should populate event, teams or participants, matches, fields, and time slots without a count regression from cached values to a partial roster. A host opening EventDetails should also populate participant registration management data immediately, before entering manage mode. Switching into manage mode should reuse the local Room-backed management snapshot rather than starting a new initial load.

The new mobile repository test should fail before the bootstrap client exists and pass after the endpoint DTO is handled. The backend route test should prove that `manage=true` includes registrations and the correct compliance section, while a non-manage request omits host-only compliance.

## Idempotence and Recovery

The backend endpoint is additive and can be retried safely. The mobile bootstrap merge uses upserts and cache replacement scoped by event id plus optional weekly occurrence, so calling it more than once should converge to the same local rows. If the endpoint is unavailable, the repository method should fall back to existing behavior only where the default interface implementation is used in tests; production EventRepository should surface the error so stale remote content is not silently treated as fresh.

## Artifacts and Notes

The currently pending mobile guard in `EventRepository.getEvent()` preserves cached `teamIds`, `userIds`, `waitListIds`, and `freeAgentIds` while refreshing the event shell. That guard remains useful even after the bootstrap endpoint, because other screens still call the base event route.

## Interfaces and Dependencies

The backend route response should have this shape:

    {
      event,
      participantSnapshot,
      matches,
      fields,
      timeSlots,
      leagueScoringConfig,
      staffInvites,
      teamCompliance,
      userCompliance
    }

The mobile repository should expose:

    suspend fun syncEventDetail(
        event: Event,
        occurrence: EventOccurrenceSelection? = null,
        manage: Boolean = false,
    ): Result<EventDetailSyncResult>

`EventDetailSyncResult` should include the existing `EventParticipantsSyncResult`, plus `matches`, `fields`, `timeSlots`, `leagueScoringConfig`, and `staffInvites`.
