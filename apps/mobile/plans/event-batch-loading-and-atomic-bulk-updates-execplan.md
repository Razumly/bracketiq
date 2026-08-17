# Event Batch Loading and Atomic Bulk Updates

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

`PLANS.md` at repository root governs this document. This plan is maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, loading an event no longer fan-outs into one request per user ID on either client. Instead, clients request users in batches using `ids` query params, which cuts request count and backend load. Also, saving match edits uses a bulk endpoint that applies all edits in a single database transaction, so if one edit fails the full operation rolls back and returns a clear error.

The user-visible outcomes are: event screens load faster with fewer `/api/users/:id` calls; app/web match-save paths send bulk match updates; and bulk update failures return one error without partial persistence.

## Progress

- [x] (2026-02-19 00:00Z) Audited current app/web/backend flows for event-load user hydration and match save paths.
- [x] (2026-02-19 00:34Z) Added backend batch user lookup via `GET /api/users?ids=...` while preserving existing search behavior.
- [x] (2026-02-19 00:40Z) Updated web client user hydration to consume batched `ids` endpoint with chunking.
- [x] (2026-02-19 00:52Z) Updated app `UserRepository.getUsers` to use batched user fetches instead of per-ID requests.
- [x] (2026-02-19 01:08Z) Added backend bulk match update route (`PATCH /api/events/:eventId/matches`) with transaction rollback semantics.
- [x] (2026-02-19 01:17Z) Updated app match-edit save path to use bulk match endpoint in one request.
- [x] (2026-02-19 01:25Z) Updated web event-save flow to persist match edits via bulk path.
- [x] (2026-02-19 01:39Z) Added/adjusted tests for new backend user-batch and bulk-match behavior.
- [x] (2026-02-19 02:13Z) Ran verification commands and captured outputs.

## Surprises & Discoveries

- Observation: Web event save already carries match data in client payload construction, but backend event PATCH currently strips `payload.matches` before update.
  Evidence: `/home/camka/Projects/MVP/mvp-site/src/app/api/events/[eventId]/route.ts` contains `delete payload.matches;`.

- Observation: App event-detail match commits currently call per-match PATCH in a loop.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` uses `matches.forEach { matchRepository.updateMatch(...) }`.

## Decision Log

- Decision: Implement explicit batch user lookup through existing `/api/users` route using `ids`, instead of adding a separate `/api/users/batch` route.
  Rationale: Existing list routes for events/teams/fields/timeslots already use `ids` query patterns; this keeps API surface consistent.
  Date/Author: 2026-02-19 / Codex

- Decision: Add dedicated bulk match update endpoint at `/api/events/:eventId/matches` (PATCH) and use one transaction for all edits.
  Rationale: This directly enforces atomicity for match-save operations and is reusable by both app and web.
  Date/Author: 2026-02-19 / Codex

## Outcomes & Retrospective

Implemented across both repos:

- Backend now supports `GET /api/users?ids=<csv>` with dedupe + order-preserving response and unchanged search mode fallback.
- Web user hydration now batches IDs by chunks and requests `/api/users?ids=...` instead of per-user fetch fanout.
- App user hydration path now batches `getUsers(...)` requests via `/api/users?ids=...` chunked requests.
- Backend now supports atomic `PATCH /api/events/:eventId/matches` bulk updates in a single transaction with rollback on failure.
- Web event save path now persists match edits using a single bulk match call.
- App event-detail match commit now persists edits via one bulk match request instead of per-match loop.
- Repo policy (`AGENTS.md`) now codifies required batch list APIs and atomic bulk save behavior.

Validation transcript:

- `npm test -- src/app/api/users/__tests__/usersRoute.test.ts src/app/api/events/__tests__/scheduleRoutes.test.ts`
  - Result: PASS (`2` suites, `10` tests).
- `./gradlew :composeApp:testDebugUnitTest --tests com.razumly.mvp.core.data.repositories.UserRepositoryAuthTest`
  - Result: BUILD SUCCESSFUL after fixing token-store setup in the new batch-user test fixture.
- `./gradlew :composeApp:assembleDebug`
  - Result: BUILD SUCCESSFUL.

Retrospective:

- The largest behavior change was moving match save semantics to transaction-backed bulk writes; this reduced client request count and removed partial-write risk.
- The user list batching change was low-risk because it extended an existing route contract pattern already used by other entities.

## Context and Orientation

This work spans two repositories:

- App repo: `/mnt/c/Users/samue/StudioProjects/mvp-app`
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt` currently resolves user batches by issuing one `/api/users/{id}` call per user.
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt` provides per-match PATCH updates only.
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` commits edited matches by looping per-match network calls.

- Backend/web repo: `/home/camka/Projects/MVP/mvp-site`
  - `src/app/api/users/route.ts` currently supports text search (`query`) but no `ids` batch retrieval.
  - `src/lib/userService.ts` currently performs `Promise.all` over `/api/users/:id` for multi-user loads.
  - `src/app/api/events/[eventId]/matches/route.ts` currently supports GET/DELETE but no bulk PATCH.
  - `src/app/events/[id]/schedule/page.tsx` saves event changes and match edits; match persistence must be shifted to bulk-save semantics.

Atomic update in this plan means one database transaction (`prisma.$transaction`) for the full set of match edits in a single request. Any thrown error aborts all writes.

## Plan of Work

First, extend `/api/users` list route to support `ids` lookup in addition to existing search mode. Keep search behavior unchanged when `ids` is not present. Normalize and dedupe IDs, fetch all matches in one query, and return users ordered by requested IDs so clients can preserve deterministic mapping.

Second, update both clients to use `ids` batching. In web (`src/lib/userService.ts`), change `getUsersByIds` to chunk IDs and request `/api/users?ids=...` per chunk. In app (`UserRepository`), replace per-ID fetch loop inside `getUsers` with chunked list calls.

Third, implement bulk match update endpoint in backend (`PATCH /api/events/[eventId]/matches`). Validate payload, check permissions, lock the event, load relations, apply updates, and persist all matches in one transaction. If any match is missing or input invalid, return an error and rollback.

Fourth, wire app and web save flows to bulk endpoint. In app, add `updateMatchesBulk` to `IMatchRepository`/`MatchRepository` and switch `commitMatchChanges` to one call. In web, use the bulk endpoint in event-save flow to persist match edits in one request.

Finally, add/adjust tests and run targeted verification in both repos.

## Concrete Steps

From `/home/camka/Projects/MVP/mvp-site`:

1. Edit `src/app/api/users/route.ts` to add `ids` support.
2. Edit `src/lib/userService.ts` to batch user fetches via `ids`.
3. Edit `src/app/api/events/[eventId]/matches/route.ts` to add transactional bulk PATCH.
4. Edit `src/lib/tournamentService.ts` and `src/app/events/[id]/schedule/page.tsx` to use bulk match update on save.
5. Add/update Jest tests under `src/app/api/users/__tests__/` and `src/app/api/events/__tests__/`.
6. Run:
   - `npm test -- src/app/api/users/__tests__/...`
   - `npm test -- src/app/api/events/__tests__/...`

From `/mnt/c/Users/samue/StudioProjects/mvp-app`:

1. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt` to batch by `ids` query.
2. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt` and interface for bulk update method.
3. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` to call bulk update once per save.
4. Update test fakes implementing `IMatchRepository`.
5. Run:
   - `./gradlew :composeApp:compileDebugKotlinAndroid`
   - `./gradlew :composeApp:testDebugUnitTest` (or targeted tests if suite is too heavy)

## Validation and Acceptance

Acceptance criteria:

- Loading an event in web/app no longer causes N calls to `/api/users/:id` for participant hydration; client code path uses `/api/users?ids=...` in chunks.
- Backend accepts `/api/users?ids=...` and returns matching users with legacy fields.
- App match-save path sends one bulk request instead of per-match loop.
- Web event-save path sends one bulk match update request for edited matches.
- Bulk match update endpoint is transactional: if one match update fails, no partial match rows are persisted.
- Error responses from failed bulk updates include a clear message.

## Idempotence and Recovery

All edits are additive and safe to re-run. If a test fails mid-change, rerun after fixing code; no destructive migrations are introduced by this plan. Bulk update endpoint uses transactions, so failures rollback automatically. If client-side integration breaks, fallback is to restore previous per-match calls and keep endpoint in place until consumers are corrected.

## Artifacts and Notes

Implementation and test transcripts will be appended after execution.

## Interfaces and Dependencies

The following interfaces must exist after implementation:

- Backend route contract:
  - `GET /api/users?ids=<csv>` -> `{ users: UserData[] }`
  - `PATCH /api/events/:eventId/matches` with body `{ matches: MatchUpdate[] }` -> `{ matches: Match[] }`

- App repository contract:
  - `IMatchRepository.updateMatchesBulk(matches: List<MatchMVP>): Result<List<MatchMVP>>`

- Web service contract:
  - `userService.getUsersByIds(ids: string[])` uses batch list endpoint
  - `tournamentService.updateMatchesBulk(eventId, matches)` posts one payload to bulk match route

Plan revision note: Initial version created to satisfy complex multi-repo batching + atomic bulk-update implementation request.
Reason: This change crosses backend contracts, web client hydration, and app repository flows and requires coordinated rollout.
