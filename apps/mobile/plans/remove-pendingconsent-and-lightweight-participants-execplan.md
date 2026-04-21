# Remove PENDINGCONSENT And Split Participant Snapshot Loading

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root and must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, registration lifecycle no longer uses `PENDINGCONSENT`. A registration that still needs signatures remains registered through `STARTED`, and hosts learn what is missing from required document/compliance state instead of from a separate lifecycle value. At the same time, the normal event participants load path becomes lightweight: it returns the participant id sets the app/site need for regular event actions, while host manage mode performs a second, explicit fetch for full registration rows so management screens can show document state and take admin actions.

This matters because the current model mixes two different concerns. Registration lifecycle answers whether someone is still in the event. Document completion answers whether anything is still missing. Those should not be stored in the same enum. The current participants endpoint also sends expanded registration rows to every consumer even when the consumer only needs participant ids to determine membership, fill caches, or render standard actions.

## Progress

- [x] (2026-04-13 19:05Z) Audited the current `PENDINGCONSENT` write/read paths in `mvp-site` and confirmed the enum still exists in Prisma plus several family/document routes.
- [x] (2026-04-13 19:12Z) Audited the current participants contract in both repos and confirmed that `GET /api/events/[eventId]/participants` still returns full registration rows to all consumers.
- [x] (2026-04-13 19:18Z) Confirmed that `mvp-app` currently treats `STARTED` as membership-active and that manage mode on mobile is only a UI toggle with no dedicated registration fetch.
- [ ] Replace `PENDINGCONSENT` with `STARTED` everywhere in backend runtime code, schema, and migration flow.
- [ ] Redefine the participants endpoint contract so normal mode returns id sets, counts, and division-scoped ids, while manage mode returns full registration rows.
- [ ] Update `mvp-app` to consume the lightweight snapshot by default and to fetch/manage full registrations only when the host enters manage mode.
- [ ] Run focused regression coverage in both repos and record outcomes.

## Surprises & Discoveries

- Observation: `PENDINGCONSENT` is still a live Prisma enum value, not just a legacy compatibility string.
  Evidence: `mvp-site/prisma/schema.prisma` still defines `EventRegistrationsStatusEnum.PENDINGCONSENT`, and routes under `src/app/api/documents/consent` and `src/app/api/family/join-requests` still read or write it.

- Observation: The backend already has a partial abstraction that treats `PENDINGCONSENT` like `STARTED`, but the write paths still create the deprecated status.
  Evidence: `src/server/events/eventRegistrations.ts` normalizes `PENDINGCONSENT` to `STARTED`, while separate route handlers still persist `PENDINGCONSENT`.

- Observation: Mobile manage mode currently cannot show host-only registration/document state because it never downloads management rows.
  Evidence: `EventDetailScreen.kt` only toggles a local `isManagingParticipants` flag, and `ParticipantsVeiw.kt` renders from event arrays and cached team/user entities.

## Decision Log

- Decision: `PENDINGCONSENT` is removed from active code and from the Prisma enum.
  Rationale: Missing signatures are a compliance/document concern, not a registration lifecycle concern. `STARTED` already covers “registered but not complete”.
  Date/Author: 2026-04-13 / Codex

- Decision: Normal participant loading remains available through `GET /api/events/[eventId]/participants`, but it returns lightweight ids instead of full registration rows.
  Rationale: This keeps one stable endpoint for regular participant sync while cutting payload size and removing the need to expose host-only registration details to every consumer.
  Date/Author: 2026-04-13 / Codex

- Decision: Full registration rows move behind an explicit manage-mode fetch.
  Rationale: Hosts need richer state for management, but standard viewers and standard app flows only need membership ids plus aggregate counts.
  Date/Author: 2026-04-13 / Codex

- Decision: Division-scoped participant ids are part of the normal participant snapshot.
  Rationale: The user explicitly wants per-division ids for waitlist, users, teams, and free agents so both repos can drive normal actions without loading registration rows.
  Date/Author: 2026-04-13 / Codex

## Outcomes & Retrospective

This section will be updated after implementation and validation complete. The target outcome is a cleaner registration lifecycle (`STARTED` vs. `ACTIVE`, without `PENDINGCONSENT`) and a split participant-loading model where standard screens use lightweight id snapshots and host management screens opt into the heavier registration payload.

## Context and Orientation

Two repositories are involved.

`/Users/elesesy/StudioProjects/mvp-site` is the backend and web source of truth. Prisma schema changes, API route changes, registration helpers, and web participant-management behavior all start there.

`/Users/elesesy/StudioProjects/mvp-app` is the Kotlin Multiplatform client. It mirrors site API contracts through Kotlin DTOs and repositories. The mobile event detail screen currently depends on a participant snapshot endpoint to repopulate local event membership arrays and cached team/user relations.

The current backend participant helper is `src/server/events/eventRegistrations.ts` in `mvp-site`. It builds the participants payload used by `src/app/api/events/[eventId]/participants/route.ts`. Today that payload includes full registration entries in five sections: `teams`, `users`, `children`, `waitlist`, and `freeAgents`.

The current app contract lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt` and `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`. The repository currently maps the full registration-entry sections back into the event’s cached `teamIds`, `userIds`, `waitListIds`, and `freeAgentIds`.

“Manage mode” means the host/event-manager participant administration surface. On mobile this is currently only a visual toggle in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`; it does not yet trigger any special data load.

## Interfaces and Dependencies

The target backend contract for `GET /api/events/[eventId]/participants` is:

- Always available to standard consumers.
- Returns event metadata needed today (`participantCount`, `participantCapacity`, occurrence context when relevant).
- Returns lightweight participant ids in two shapes:
  - a flat event-level summary for existing consumers:
    - `teamIds`
    - `userIds`
    - `childIds` or child-user ids if the app/site still needs to distinguish child registrations
    - `waitListIds`
    - `freeAgentIds`
  - a per-division array so each division carries:
    - `divisionId`
    - `teamIds`
    - `userIds`
    - `childIds`
    - `waitListIds`
    - `freeAgentIds`

The target manage-mode contract is one explicit fetch, either on the same route via a query flag or through a sibling route. This plan adopts a query flag to avoid a second endpoint name:

- `GET /api/events/[eventId]/participants?manage=true`
- Requires the caller to be able to manage the event.
- Returns the current lightweight payload plus `registrations`, where each registration row includes:
  - registration id
  - registrant id/type
  - roster role
  - lifecycle status
  - division assignment
  - document/compliance fields already needed by host UI

The target lifecycle statuses after the cutover are:

- `STARTED`
- `ACTIVE`
- `BLOCKED`
- `CANCELLED`
- `CONSENTFAILED`

`STARTED` is considered registered for membership checks, schedule inclusion, and participant snapshot membership. The difference between `STARTED` and `ACTIVE` is not “in or out”; it is “registration has begun and remains valid, but some completion step may still be pending”.

## Plan of Work

First, remove `PENDINGCONSENT` from backend lifecycle usage. Update every route that currently writes or queries `PENDINGCONSENT` so it uses `STARTED` plus the existing consent/document fields to describe what is missing. Then add a Prisma migration that rewrites existing rows from `PENDINGCONSENT` to `STARTED` before replacing the enum definition.

Second, refactor the participant snapshot helper in `mvp-site` so the default payload is lightweight. The helper should still compute participant counts and should still identify the same logical sections, but those sections now become id lists instead of full registration entries. The helper must also compute division-scoped id sets because those are part of the target contract.

Third, add the manage-mode expansion on the same participants route. When `manage=true` and the caller can manage the event, the backend should include the full registration rows and any supporting team/user detail already used by management UI. Standard consumers should not receive those rows.

Fourth, update `mvp-app` DTOs and repository code to parse the new snapshot shape. Default event hydration should continue to repopulate local `teamIds`, `userIds`, `waitListIds`, and `freeAgentIds`, but it should do that from the lightweight id payload. Mobile manage mode should trigger a dedicated repository fetch with `manage=true` and store the returned registration rows in component state for the participant management UI.

Fifth, update the mobile participant-management path so the manage toggle actually performs the fetch. The view should use the returned registration rows to show host-relevant status based on missing required documents rather than on a deprecated `PENDINGCONSENT` lifecycle value.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site`:

1. Search for `PENDINGCONSENT` and replace active runtime usage with `STARTED` plus existing document/consent metadata.
2. Update `prisma/schema.prisma` and any generated Prisma schema copy used in the repo.
3. Add a Prisma migration that:
   - updates existing `EventRegistrations.status = 'PENDINGCONSENT'` rows to `STARTED`
   - replaces the enum definition without `PENDINGCONSENT`
4. Refactor `src/server/events/eventRegistrations.ts` and `src/app/api/events/[eventId]/participants/route.ts` to emit the lightweight snapshot by default and the expanded registrations when `manage=true`.
5. Update backend/web tests that assert the old enum or the old participant payload.

From `/Users/elesesy/StudioProjects/mvp-app`:

1. Update `EventDtos.kt` for the new lightweight participants payload and the manage-mode registrations payload.
2. Update `EventRepository.kt` so default participant sync uses id lists and a separate method requests `manage=true`.
3. Update `EventDetailComponent.kt`, `EventDetailScreen.kt`, and `ParticipantsVeiw.kt` so entering manage mode fetches the expanded registrations and exposes host status from document/compliance state.
4. Update or add tests around repository parsing and participant-management state transitions.

## Validation and Acceptance

Backend acceptance is met when all active code paths in `mvp-site` use `STARTED` instead of `PENDINGCONSENT`, a local migration can be applied without enum conflicts, and:

- `GET /api/events/[eventId]/participants` returns only the lightweight participant ids plus counts and division-scoped ids.
- `GET /api/events/[eventId]/participants?manage=true` returns the lightweight payload plus full registrations for authorized managers.
- A registration that previously would have been `PENDINGCONSENT` still appears as registered in participant membership and schedule queries.

App acceptance is met when:

- Regular event detail hydration still knows whether the current user/team is in the event without needing full registration rows.
- Mobile participant lists still render correctly from ids plus cached user/team entities.
- Entering manage mode triggers a second fetch and surfaces management status from missing required signed documents instead of from `PENDINGCONSENT`.

Suggested validation commands:

From `/Users/elesesy/StudioProjects/mvp-site`:

    pnpm test -- --runInBand src/app/api/events/__tests__/participantsRoute.test.ts
    pnpm test -- --runInBand src/app/api/family/__tests__
    pnpm exec tsc --noEmit

From `/Users/elesesy/StudioProjects/mvp-app`:

    ./gradlew :composeApp:testDebugUnitTest

If the full Android unit suite is too expensive after focused fixes, run at minimum:

    ./gradlew :composeApp:compileDebugKotlinAndroid

## Idempotence and Recovery

The migration must be written so it can be re-run safely on a database that already has no `PENDINGCONSENT` rows. The runtime refactor is additive from a retry perspective: if the manage-mode payload is not finished yet, the default participant snapshot must remain valid and testable on its own.

If backend and app changes land in separate commits, merge/deploy the backend contract first, then update the app. During local development, retry by running the site tests first, then the app repository parsing tests, before running broader verification.

## Artifacts and Notes

Important active files for the cutover:

- `mvp-site/prisma/schema.prisma`
- `mvp-site/src/server/events/eventRegistrations.ts`
- `mvp-site/src/app/api/events/[eventId]/participants/route.ts`
- `mvp-site/src/app/api/documents/consent/route.ts`
- `mvp-site/src/app/api/family/join-requests/route.ts`
- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`
- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`
- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`
- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/ParticipantsVeiw.kt`

Revision note: Initial draft created on 2026-04-13 to drive the `PENDINGCONSENT` removal and participant snapshot split across `mvp-site` and `mvp-app`.
