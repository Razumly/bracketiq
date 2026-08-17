# Local-first official match operations and watch sync

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. It is self-contained for the `mvp-app` work and includes the paired backend contract in `/Users/elesesy/StudioProjects/mvp-site`, which `AGENTS.md` names as the source of truth for API paths and payloads.

## Purpose / Big Picture

Officials using the phone app or Wear OS watch must be able to start a match, record score changes, add incidents, end segments, and finish a match immediately, even if the network or backend write is slow or unavailable. The screen should not block on a remote write before the timer starts. Instead, the app records a local operation first, applies it to the local match view, and retries the server write in the background. When phone and watch are connected, both devices exchange the same local operation records so each device can display the most recent official action. Remote match snapshots are still used for schedule/team/field data, but pending local official operations take precedence for official-controlled fields.

The visible outcome is that pressing `Start` on the phone or watch starts the timer immediately. If the API request fails, later incident or score updates keep using the locally-started timer, and subsequent sync sends the start operation before the later operation.

## Progress

- [x] (2026-06-08T23:05:00Z) Read `PLANS.md`, the current Wear repository, the shared phone `MatchRepository`, Room DB declarations, existing match-detail optimistic code, backend match mutation route, and watch auth Data Layer bridge.
- [x] (2026-06-08T23:08:00Z) Confirmed the current server route already applies `segmentOperations`, `incidentOperations`, `officialCheckIn`, `finalize`, and direct score writes atomically, and incident create is already idempotent when the same incident id is retried.
- [x] (2026-06-09T00:12:00Z) Added a shared Room-backed `MatchOperationOutboxEntry` and DAO in `composeApp`, exposed it through `DatabaseService`, and bumped `MVP_DATABASE_VERSION` to 24.
- [x] (2026-06-09T00:21:00Z) Made `MatchRepository.updateMatchOperations`, `setMatchScore`, `addMatchIncident`, and `updateMatchFinished` local-first for official operations, with background retry through `syncPendingMatchOperations`.
- [x] (2026-06-09T00:38:00Z) Added backend client operation metadata support in `mvp-site` route validation and persistence for segment, incident, and direct score operations.
- [x] (2026-06-09T01:13:00Z) Added Wear local operation persistence/cache so `Start`, check-in, score, incident, reset, segment end, and finish actions update the watch immediately and retry remote sync.
- [x] (2026-06-09T01:21:00Z) Added a minimal Wear Data Layer operation bridge: the watch sends operation envelopes to connected phones, and Android imports them into the shared Room outbox and triggers repository sync.
- [x] (2026-06-09T01:28:00Z) Added focused tests for local-first phone operations, failed sync retention, and backend client operation metadata persistence.
- [x] (2026-06-09T01:34:00Z) Ran focused app, Wear, and backend validation commands and recorded the observed output below.
- [x] (2026-06-09T00:51:01Z) Added the reverse Android phone-to-Wear operation bridge so phone-created official operations can update a connected watch without waiting for the watch to refresh from the backend. The implementation avoids repeated Wearable API node lookups and sends when no watch is connected.

## Surprises & Discoveries

- Observation: The phone app already has an optimistic layer in `MatchContentComponent` for direct scores and incidents, including pending incident upload status values.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt` defines `MATCH_INCIDENT_UPLOAD_PENDING`, writes local incidents with `saveMatchLocally`, and retries them through `processIncidentQueueUntilBlocked`.

- Observation: The lower-level phone `MatchRepository` remains remote-first for match operations.
  Evidence: `updateMatchOperations` currently uses `singleResponse`, which calls the network first and saves only the returned remote match.

- Observation: The backend route can support retry-friendly operations without a new Prisma model because `MatchSegments` and `MatchIncidents` already have JSON `metadata` fields.
  Evidence: `src/types/index.ts` includes `metadata` on `MatchSegment` and `MatchIncident`; `prisma/schema.prisma` has `metadata Json?` on both models.

- Observation: Match-level metadata does not exist today.
  Evidence: `src/types/index.ts` `Match` does not include `metadata`, so idempotency for lifecycle-only operations should be represented through client operation records in the client outbox and by idempotent field values such as `actualStart`/`startedAt`, rather than a match-level applied-operation list.

- Observation: The documented `:composeApp:roomGenerateSchema` task is not present in this checkout; the available task is `:composeApp:copyRoomSchemas`, which reports `NO-SOURCE`.
  Evidence: `./gradlew :composeApp:tasks --all --console=plain | rg -i 'room|schema|ksp'` lists `copyRoomSchemas`, and `./gradlew :composeApp:copyRoomSchemas --console=plain` completed with `NO-SOURCE`.

- Observation: `composeApp/schemas` is ignored by `.gitignore`, but KSP produced `composeApp/schemas/com.razumly.mvp.core.db.MVPDatabaseService/24.json` containing `MatchOperationOutboxEntry`.
  Evidence: `git check-ignore -v composeApp/schemas/com.razumly.mvp.core.db.MVPDatabaseService/24.json` points to `.gitignore:22:composeApp/schemas`, and `rg 'MatchOperationOutboxEntry' composeApp/schemas/com.razumly.mvp.core.db.MVPDatabaseService/24.json` found the new table.

## Decision Log

- Decision: Represent official actions as operation records rather than overwriting whole match snapshots.
  Rationale: Operation records preserve ordering, can be retried idempotently, and avoid stale watch data overwriting schedule/team/field updates owned by the host or server.
  Date/Author: 2026-06-08 / Codex

- Decision: Pending local official operations take precedence only for official-controlled fields: lifecycle status, actual start/end, official check-in, segments, scores, incidents, and finalization.
  Rationale: The user wants official local values to win, but a stale watch should not overwrite teams, fields, scheduled start time, or host schedule edits.
  Date/Author: 2026-06-08 / Codex

- Decision: Use additive client operation metadata fields (`clientOperationId`, `clientDeviceId`, `clientCreatedAt`, `clientSequence`, `sourceDevice`) in API payloads.
  Rationale: These fields make retries and phone/watch dedupe deterministic while keeping the existing API endpoint and transaction path.
  Date/Author: 2026-06-08 / Codex

- Decision: Keep the direct phone/watch sync bridge operation-based, not snapshot-based.
  Rationale: Importing watch operations into the phone outbox preserves ordering and avoids stale watch snapshots overwriting host-owned schedule, field, or team changes.
  Date/Author: 2026-06-09 / Codex

- Decision: Mirror phone-created operations to connected watches opportunistically and do not queue a separate phone-to-watch retry when no Wear node exists.
  Rationale: The phone already owns remote sync for phone-created operations. The watch can later refresh from the backend if disconnected. Repeatedly asking the Wearable APIs to send messages when no watch is paired or connected wastes work and battery without improving correctness.
  Date/Author: 2026-06-09 / Codex

- Decision: Store imported phone operations on Wear as local overlays, not as Wear-origin pending retries.
  Rationale: A phone operation may arrive on the watch before the backend has accepted it. Keeping it as an imported overlay lets the watch continue showing the phone's local value across remote refreshes while preventing duplicate watch-to-backend replay.
  Date/Author: 2026-06-09 / Codex

## Outcomes & Retrospective

Implemented the local-first official operation foundation across phone, Wear, and backend. Phone official operations now apply locally and enqueue a Room outbox row before any network write. Wear official operations now apply locally through a SharedPreferences-backed outbox/cache and retry remote sync in the background. When connected, Wear sends the same operation envelope to the Android phone; the phone imports it into the shared outbox and invokes `syncPendingMatchOperations`. Android phone operations are now also mirrored to connected Wear nodes. If no Wear nodes are connected, the phone suppresses repeat node lookup/send work for a short window. The watch imports phone operations as local overlays so they remain visible across remote schedule refreshes without being replayed by the watch to the backend.

Validation passed:

    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventDetail.data.MatchRepositoryHttpTest' --console=plain
    ./gradlew :composeApp:assembleDebug --console=plain
    ./gradlew :wearApp:assembleDebug --console=plain
    ./gradlew :wearApp:testDebugUnitTest --console=plain
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64 --console=plain
    npm test -- --runTestsByPath src/app/api/events/__tests__/scheduleRoutes.test.ts
    npx tsc --noEmit

The remaining production hardening is conflict-policy refinement for simultaneous phone/watch edits of the same incident field and a real-device Data Layer QA pass. The implemented bridge uses deterministic operation ids and shared outbox ordering, but emulator/unit validation does not prove Bluetooth/device connectivity behavior.

2026-06-09 phone-to-Wear bridge validation passed:

    ./gradlew :composeApp:assembleDebug --console=plain
    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventDetail.data.MatchRepositoryHttpTest' --console=plain
    ./gradlew :wearApp:testDebugUnitTest --console=plain
    ./gradlew :wearApp:assembleDebug --console=plain
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64 --console=plain

## Context and Orientation

The `mvp-app` repository is a Kotlin Multiplatform app. Shared phone app code lives under `composeApp/src/commonMain/kotlin/com/razumly/mvp`. Wear OS code lives under `wearApp/src/main/java/com/razumly/mvp/wear`. The phone local database is Room, declared in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/db/MVPDatabaseService.kt`. The paired backend lives at `/Users/elesesy/StudioProjects/mvp-site`.

An operation record is a small local row that describes one official action. It has a stable id, the event id, the match id, a device id, a timestamp, an ordered sequence number, the API payload JSON, a status such as `PENDING` or `ACKED`, and retry metadata. The outbox is a local database table holding operation records that have not been accepted by the server yet.

The existing backend mutation route is `/api/events/[eventId]/matches/[matchId]` in `mvp-site`. It already accepts `lifecycle`, `segmentOperations`, `incidentOperations`, `officialCheckIn`, `finalize`, and `time`. The direct score endpoint is `/api/events/[eventId]/matches/[matchId]/score`.

## Plan of Work

First add the shared operation entity and DAO to `composeApp`, expose it from `DatabaseService`, and bump `MVP_DATABASE_VERSION` from `23` to `24`. Add helper code in the match repository that can build operation payload JSON, apply that payload to a `MatchMVP`, enqueue the operation, save the locally-applied match, and then try to sync pending operations in creation order.

Second change `MatchRepository.updateMatchOperations`, `setMatchScore`, and `addMatchIncident` to call the local-first helper. They should return `Result.success(localMatch)` once the local row is saved. Network failure should mark the operation as failed or leave it pending, not fail the user action. Explicit local persistence failures should still return failure because the app cannot safely continue without local storage.

Third add server metadata support in `mvp-site` so operation payloads can include client operation identity fields. For segment and incident operations, copy those identity fields into the row `metadata` object using a `clientOperation` key so future retries and audits can identify the source operation.

Fourth add Wear-side local persistence and phone/watch exchange. The Wear app does not use the shared Room database, so it needs a small SharedPreferences-backed operation store that uses the same JSON envelope. Android phone/watch Data Layer messages will use paths under `/mvp/matches/operations`.

Fifth add the reverse Android phone-to-Wear bridge. `MatchRepository` should call a platform abstraction after it enqueues and applies a local phone operation. The Android implementation should use `Wearable.getNodeClient(context).connectedNodes` and `Wearable.getMessageClient(context).sendMessage(...)` to send the same operation JSON envelope to connected watches. If `connectedNodes` is empty, the implementation should remember that absence for a short time window and return without calling `sendMessage` for subsequent operations during the window. The iOS implementation is a no-op because Wear OS Data Layer is Android-only. The watch receiver should import phone operations into the watch match cache, but should not add them to the watch's pending remote-sync queue; otherwise both phone and watch could replay the same score operation to the backend.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-app` unless the command explicitly says to use `/Users/elesesy/StudioProjects/mvp-site`.

After Room entity changes, run:

    ./gradlew :composeApp:roomGenerateSchema --console=plain

After shared app changes, run:

    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventDetail.data.MatchRepositoryHttpTest' --console=plain
    ./gradlew :wearApp:testDebugUnitTest :wearApp:assembleDebug --console=plain

After backend route changes, run from `/Users/elesesy/StudioProjects/mvp-site`:

    npm test -- --runTestsByPath src/app/api/events/__tests__/scheduleRoutes.test.ts
    npx tsc --noEmit

## Validation and Acceptance

Acceptance for the first milestone: a test creates a match with a not-started first segment, configures the backend mock to fail the PATCH, calls `updateMatchOperations` with `actualStart` and a segment `startedAt`, and receives `Result.success` with an `IN_PROGRESS` match. The fake match DAO contains the locally-updated match, and the fake outbox DAO contains one non-acked operation.

Acceptance for backend metadata: a route test sends a segment or incident operation with `clientOperationId`, and the saved match row includes that id in the segment or incident metadata without rejecting the payload.

Acceptance for watch behavior: on the Wear emulator, tapping `Start` moves directly to the timer screen and the timer advances even if the API write cannot complete immediately.

Acceptance for phone-to-watch sync: with a connected Wear node, a phone local match operation is sent on `/mvp/matches/operations`, the watch imports it, and the watch cached match reflects the operation. With no connected Wear nodes, repeated phone operations during the no-watch cache window do not call `sendMessage` and do not block phone local-first behavior.

## Idempotence and Recovery

The outbox table uses `clientOperationId` as its primary key. Re-enqueueing the same operation replaces the same row rather than duplicating it. Remote sync processes operations ordered by `clientSequence` and creation time. If a sync attempt fails, the row remains pending or failed and can be retried later. If the local Room database version changes, the existing app behavior destructively recreates the local cache on startup, so this change does not require a hand-written data migration for preserved user data.

## Artifacts and Notes

This plan was created after observing that `wearApp` is currently untracked in git and both `mvp-app` and `mvp-site` have unrelated dirty files. Do not revert unrelated changes. Keep edits focused to the operation outbox, repository sync code, Wear local sync, backend match route metadata, tests, and generated Room schema.

## Interfaces and Dependencies

In `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MatchOperationOutboxEntry.kt`, define a Room entity with `id`, `eventId`, `matchId`, `operationKind`, `payloadJson`, `status`, `sourceDevice`, `clientDeviceId`, `clientSequence`, `clientCreatedAt`, `attemptCount`, `lastError`, and `lastAttemptAt`.

In `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/daos/MatchOperationOutboxDao.kt`, define DAO methods to upsert operations, list pending operations for a match, mark operations acked, mark operations failed, and delete old acked rows.

In `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt`, add local-first helpers that can apply operations locally and sync pending rows.

In `/Users/elesesy/StudioProjects/mvp-site/src/app/api/events/[eventId]/matches/[matchId]/route.ts`, extend route schemas and metadata application for client operation identity fields.

In `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/auth/WatchMatchOperationSync.kt`, define a small platform abstraction that can send `MatchOperationOutboxEntry` values to connected watches. Android should implement it in `composeApp/src/androidMain/kotlin/com/razumly/mvp/core/auth/WatchMatchOperationSync.android.kt`; iOS should return a no-op implementation.

In `wearApp/src/main/java/com/razumly/mvp/wear/auth/WearMatchOperationSyncService.kt`, receive `/mvp/matches/operations` messages sent by the phone and ask the Wear repository/store layer to apply them locally without enqueueing remote retry work.

## Revision Notes

2026-06-08: Created this plan to turn the user-approved design into a concrete cross-repo implementation plan. The plan starts with the local-first outbox because it is the required foundation for both offline behavior and phone/watch synchronization.

2026-06-09: Extended the plan for phone-to-watch operation mirroring. The new bridge is intentionally opportunistic: connected watches receive phone operations immediately, disconnected watches rely on backend refresh, and the phone caches the no-watch result briefly to avoid waste.
