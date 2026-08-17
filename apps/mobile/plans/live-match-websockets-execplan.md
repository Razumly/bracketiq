# Add Live Match WebSocket Updates Across Site and App

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. The implementation spans two worktrees: `/Users/elesesy/StudioProjects/mvp-app-live-match-websockets` for the Kotlin Multiplatform app and `/Users/elesesy/StudioProjects/mvp-site-live-match-websockets` for the Next.js backend and web UI. The backend and API contract source of truth is `mvp-site`.

## Purpose / Big Picture

Users viewing an event schedule should see match score, incident, scheduled start/end, and actual start/end changes appear without manually refreshing. The backend will publish match changes over a WebSocket channel scoped to one event. The web schedule page and the mobile app event detail screen will subscribe to that event channel. REST remains the initial load mechanism and a disconnect fallback only; there will be no steady REST reconciliation loop while a WebSocket connection is open.

The observable behavior is: start the site with the custom server, open the same event in two clients, change a match score or lifecycle in one client, and see the other client update from the WebSocket message.

## Progress

- [x] (2026-05-12T16:59:53Z) Created isolated worktrees for both repositories on `codex/live-match-websockets`.
- [x] (2026-05-12T16:59:53Z) Inspected the existing match mutation routes in `mvp-site` and the existing no-op realtime methods in `mvp-app`.
- [x] (2026-05-12T17:32:00Z) Added the `mvp-site` WebSocket server, event-scoped token route, and broadcaster used by match mutation routes.
- [x] (2026-05-12T17:32:00Z) Added `mvp-site` schedule-page subscription that merges incoming match payloads without adding continuous polling.
- [x] (2026-05-12T17:32:00Z) Added Ktor WebSocket support and event-scoped match subscription in `mvp-app`.
- [x] (2026-05-12T17:42:00Z) Ran focused validation in both repositories and recorded outcomes here.
- [x] (2026-05-12T18:06:48Z) Added local-edit pause behavior so host manage mode and open match-detail editing take priority over realtime messages.
- [x] (2026-05-12T18:11:07Z) Re-ran focused validation after the pause behavior changes.
- [x] (2026-05-13T20:29:07Z) Diagnosed local runtime failure, fixed custom-server startup/env loading, and narrowed match-detail pausing to assigned officials.

## Surprises & Discoveries

- Observation: `mvp-app` already has `subscribeToMatches()` and `unsubscribeFromRealtime()` in `IMatchRepository`, but both currently return success without doing work.
  Evidence: `/Users/elesesy/StudioProjects/mvp-app-live-match-websockets/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt` contains no-op implementations near the end of the file.
- Observation: `mvp-site` has three committed match mutation paths that must publish: bulk match updates, single match operations including incidents and lifecycle, and the score endpoint.
  Evidence: `/Users/elesesy/StudioProjects/mvp-site-live-match-websockets/src/app/api/events/[eventId]/matches/route.ts`, `/Users/elesesy/StudioProjects/mvp-site-live-match-websockets/src/app/api/events/[eventId]/matches/[matchId]/route.ts`, and `/Users/elesesy/StudioProjects/mvp-site-live-match-websockets/src/app/api/events/[eventId]/matches/[matchId]/score/route.ts`.
- Observation: Full `npm run lint` in `mvp-site` fails on unrelated existing React lint errors, but all touched files lint clean.
  Evidence: `npm run lint` reports errors in `TournamentBracketView.tsx`, `ScoreUpdateModal.test.tsx`, `OrganizationPublicSettingsPanel.tsx`, and `LandingPage.tsx`; `npx eslint server.mjs src/server/realtime/matchRealtime.ts src/server/realtime/__tests__/matchRealtime.test.ts src/app/api/realtime/matches/token/route.ts src/lib/matchRealtimeClient.ts src/app/api/events/[eventId]/matches/route.ts src/app/api/events/[eventId]/matches/[matchId]/route.ts src/app/api/events/[eventId]/matches/[matchId]/score/route.ts src/app/events/[id]/schedule/page.tsx` exits 0.
- Observation: The fresh `mvp-app` worktree does not include local Firebase Android config, so Android debug compile and debug unit tests stop before Kotlin test execution.
  Evidence: `:composeApp:compileDebugKotlinAndroid` and `:composeApp:testDebugUnitTest` both fail at `:composeApp:processDebugGoogleServices` because `composeApp/google-services.json` is missing. `:composeApp:compileCommonMainKotlinMetadata` succeeds.
- Observation: Local match edits are not a background reconciliation problem; they are an ownership problem for the current screen.
  Evidence: `EventDetailComponent` already tracks host edit state through `_isEditing` and `_isEditingMatches`, and `MatchContentComponent` is the scoped surface where a specific match is open for score, incident, and time edits.
- Observation: The local site process on port 3000 was running plain `next dev --webpack`, not the custom websocket server.
  Evidence: `.mvp-site-dev.log` showed `dev:plain > next dev --webpack`, websocket upgrade probes hung, and restarting with `server.mjs` exposed `/api/realtime/matches`.
- Observation: `server.mjs` failed under Next 16 when `getUpgradeHandler()` was called before `app.prepare()`, and the custom entrypoint needed explicit Next env loading for websocket token verification.
  Evidence: `node server.mjs --dev --port 3001` threw `prepare() must be called before performing this operation`; after moving `getUpgradeHandler()` after prepare and loading env with `@next/env`, a signed websocket token received a `subscribed` message.

## Decision Log

- Decision: Use WebSockets as the primary live transport and use REST only for the initial load plus a single refresh after connection loss.
  Rationale: The user explicitly rejected REST reconciliation while a WebSocket is connected and accepted polling only as a fallback after losing the connection.
  Date/Author: 2026-05-12 / Codex
- Decision: Scope every WebSocket subscription to one event id and broadcast serialized full match objects plus deleted ids.
  Rationale: Clients already understand `serializeMatchesLegacy` payloads. Sending full match objects avoids client-specific diff logic and covers scores, incidents, scheduled times, actual times, and related match fields in one contract.
  Date/Author: 2026-05-12 / Codex
- Decision: Add a custom Next.js server for `mvp-site` using the `ws` package.
  Rationale: Next route handlers do not own raw HTTP upgrade handling. A custom server can host Next and a WebSocket upgrade endpoint in the same DigitalOcean process.
  Date/Author: 2026-05-12 / Codex
- Decision: Keep the WebSocket broadcast process-local.
  Rationale: The current DigitalOcean deployment can run this as a single app process. If the site is scaled to multiple app instances later, broadcasts will need a shared pub/sub layer such as Redis or Postgres LISTEN/NOTIFY so mutations on one instance reach sockets connected to another.
  Date/Author: 2026-05-12 / Codex
- Decision: Pause match WebSockets while local match editing has priority, then perform one REST refresh before reconnecting.
  Rationale: A host in manage mode or an official with a match detail open should not have draft score, incident, or time changes overwritten by incoming socket messages. The refresh on resume catches missed committed changes without running redundant REST reconciliation while the socket is connected.
  Date/Author: 2026-05-12 / Codex

## Outcomes & Retrospective

Implemented the end-to-end live match update path. `mvp-site` now serves `/api/realtime/matches` from `server.mjs`, mints short-lived event-scoped tokens from `/api/realtime/matches/token`, and publishes serialized match updates after successful score, incident, lifecycle, start/end, bulk update, and delete mutations. The schedule page subscribes to the event socket and only uses REST as initial load and a one-shot disconnect recovery.

`mvp-app` now installs Ktor WebSockets, connects to the same event socket from `MatchRepository.subscribeToMatches(eventId)`, persists incoming match payloads into Room, preserves pending local incident state, deletes removed matches, and performs one REST refresh after socket loss before reconnecting. The main remaining risk is multi-instance DigitalOcean scaling because the broadcaster is process-local.

Local edit ownership is now explicit. On the site, host manage mode and open match edit or score dialogs block the socket effect; on the app, `MatchRepository` supports named pause reasons, `EventDetailComponent` pauses for host event/match editing, and `MatchContentComponent` pauses only when the current user is an assigned official for the open match. When the final pause reason clears, the app refreshes matches once and reconnects.

## Context and Orientation

`mvp-site` is the backend and web app. Match data is loaded through REST routes under `src/app/api/events/[eventId]/matches`. Match changes are serialized for old and new clients by `serializeMatchesLegacy` from `src/server/scheduler/serialize`. The schedule web UI lives in `src/app/events/[id]/schedule/page.tsx` and already stores canonical matches in `matches` plus draft matches in `changesMatches`.

A WebSocket is a long-lived browser or app connection where the server can push JSON messages to clients. In this plan, the WebSocket endpoint is `/api/realtime/matches?eventId=<eventId>&token=<short-lived-token>`. The token is minted by a normal authenticated REST route so the raw WebSocket server does not need to duplicate full session and database authorization logic.

`mvp-app` is a Kotlin Multiplatform app. `MatchRepository` owns match REST calls, local Room persistence, and the no-op realtime methods. The event detail component in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` already tracks `selectedEventId`; this should drive subscribing and unsubscribing.

## Plan of Work

In `mvp-site`, add `ws` as a dependency and create `server.mjs`. The custom server will prepare Next, serve normal requests through Next, handle HTTP upgrades for `/api/realtime/matches`, verify the short-lived realtime token with `AUTH_SECRET`, store clients by event id, and expose a process-local broadcaster on `globalThis`.

Add `src/server/realtime/matchRealtime.ts` with the shared message shape and a `publishEventMatchChanges` function. Match route handlers will call this function only after database transactions succeed. The message shape is `type: "match.changed"`, `eventId`, `matches`, `deleted`, and `sentAt`. The `matches` array must contain the same serialized match objects returned by existing REST endpoints.

Add `src/app/api/realtime/matches/token/route.ts`. It will require a normal session, verify the event exists, and return a JWT token scoped to one event id with a short expiry. Published events can be subscribed to by an authenticated user. Hidden, draft, and template events require management access.

Update `src/app/events/[id]/schedule/page.tsx` to subscribe after an event is loaded. Incoming matches will be normalized with `normalizeApiMatch` and merged by `$id`. Deletes remove matches by id. The page should not start interval polling. If the WebSocket closes unexpectedly, the page may perform one REST fetch to catch missed updates before reconnecting.

In `mvp-app`, add `ktor-client-websockets` to `gradle/libs.versions.toml` and `composeApp/build.gradle.kts`, install the Ktor `WebSockets` plugin in `MvpHttpClientConfig`, and add a WebSocket helper to `MvpApiClient`.

Update `MatchDtos.kt` with the realtime token and message DTOs. Update `IMatchRepository.subscribeToMatches` to accept an event id, then implement it in `MatchRepository` by cancelling any existing event subscription, fetching a realtime token through REST, connecting through Ktor WebSockets, decoding `match.changed` messages, persisting embedded fields, upserting changed matches while preserving pending local incident state, and deleting ids from the local cache. On socket close or failure, perform one `refreshMatchesFromRemote(eventId)` before reconnect delay.

Update `EventDetailComponent` so `selectedEventId` starts the scoped subscription and blank event ids unsubscribe.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site-live-match-websockets`, run dependency installation:

    npm install ws

Then edit the site files described above. From `/Users/elesesy/StudioProjects/mvp-app-live-match-websockets`, edit the Gradle, network, DTO, repository, and component files described above.

Run focused checks from `/Users/elesesy/StudioProjects/mvp-site-live-match-websockets`:

    npm test -- --runTestsByPath src/server/realtime/__tests__/matchRealtime.test.ts
    npm run lint
    npx eslint server.mjs src/server/realtime/matchRealtime.ts src/server/realtime/__tests__/matchRealtime.test.ts src/app/api/realtime/matches/token/route.ts src/lib/matchRealtimeClient.ts 'src/app/api/events/[eventId]/matches/route.ts' 'src/app/api/events/[eventId]/matches/[matchId]/route.ts' 'src/app/api/events/[eventId]/matches/[matchId]/score/route.ts' 'src/app/events/[id]/schedule/page.tsx'
    npx tsc --noEmit --pretty false

Run focused checks from `/Users/elesesy/StudioProjects/mvp-app-live-match-websockets`:

    ./gradlew :composeApp:testDebugUnitTest

If a full app unit test run is too broad or fails on existing unrelated tests, run a compile-focused task and record the exact failure:

    ./gradlew :composeApp:compileDebugKotlinAndroid
    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:compileCommonMainKotlinMetadata

## Validation and Acceptance

Site acceptance: after `npm run dev:plain`, the process logs that it is ready and owns both normal HTTP traffic and the WebSocket upgrade endpoint. A client can call `/api/realtime/matches/token?eventId=<eventId>` while authenticated, connect to `/api/realtime/matches`, and receive `subscribed`. When a match is changed through the existing REST score or match operation routes, connected clients for that event receive a `match.changed` message containing the changed match.

Web UI acceptance: with the schedule page open in two browser sessions for the same event, changing a score, adding an incident, starting a match, ending a match, or editing match start/end times in one session updates the other session without manual refresh. If the socket is interrupted, the page performs a one-shot REST refresh and reconnects.

Mobile acceptance: with the same event detail screen open on the app, changes made from the web update the local match list through the existing Room-backed flow. If the socket is interrupted, the repository performs one REST refresh and reconnects. While connected, the repository does not run periodic REST reconciliation.

## Idempotence and Recovery

The WebSocket broadcaster is process-local and additive. If the custom server is not running, `publishEventMatchChanges` is a no-op and REST mutations still succeed. Running `npm install ws` repeatedly is safe. Ktor WebSocket subscription startup cancels the previous job for the same repository instance before opening a new one, so changing selected events does not leave duplicate subscriptions.

If validation fails in one repository, keep the other repository changes in place and fix only the failing surface. Do not modify the original non-worktree checkouts and do not revert unrelated dirty files.

## Artifacts and Notes

The branch and worktree setup completed before implementation:

    mvp-site worktree: /Users/elesesy/StudioProjects/mvp-site-live-match-websockets
    mvp-app worktree: /Users/elesesy/StudioProjects/mvp-app-live-match-websockets
    branch in both worktrees: codex/live-match-websockets

Validation evidence:

    npm test -- --runTestsByPath src/server/realtime/__tests__/matchRealtime.test.ts
    PASS src/server/realtime/__tests__/matchRealtime.test.ts
    Tests: 3 passed, 3 total

    npx eslint <touched site files>
    exit 0

    npx tsc --noEmit --pretty false
    exit 0

    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:compileCommonMainKotlinMetadata
    BUILD SUCCESSFUL

    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:testDebugUnitTest
    FAILED at :composeApp:processDebugGoogleServices because composeApp/google-services.json is missing from this worktree.

    Revalidation after local-edit pause changes:
    npx tsc --noEmit --pretty false
    exit 0

    npx eslint <touched site files>
    exit 0

    npm test -- --runTestsByPath src/server/realtime/__tests__/matchRealtime.test.ts
    PASS src/server/realtime/__tests__/matchRealtime.test.ts

    git diff --check
    exit 0 in both worktrees

    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:compileCommonMainKotlinMetadata
    BUILD SUCCESSFUL

    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:testDebugUnitTest
    FAILED at :composeApp:processDebugGoogleServices because composeApp/google-services.json is missing from this worktree.

## Interfaces and Dependencies

In `mvp-site`, define `src/server/realtime/matchRealtime.ts` with:

    export type MatchRealtimeMessage = {
      type: 'match.changed';
      eventId: string;
      matches: unknown[];
      deleted: string[];
      sentAt: string;
    };

    export function publishEventMatchChanges(input: {
      eventId: string;
      matches?: unknown[];
      deleted?: string[];
    }): number;

In `mvp-site`, define `src/app/api/realtime/matches/token/route.ts` GET to return:

    {
      token: string;
      expiresAt: string;
    }

In `mvp-app`, change the repository interface to:

    suspend fun subscribeToMatches(eventId: String): Result<Unit>
    suspend fun unsubscribeFromRealtime(): Result<Unit>

In `mvp-app`, add DTOs:

    data class MatchRealtimeTokenResponseDto(val token: String, val expiresAt: String? = null)
    data class MatchRealtimeMessageDto(
        val type: String,
        val eventId: String? = null,
        val matches: List<MatchApiDto> = emptyList(),
        val deleted: List<String> = emptyList(),
    )

Revision note 2026-05-12: Created the initial ExecPlan after inspecting both new worktrees. This records the user decision to avoid REST reconciliation while WebSockets are connected and the exact implementation surfaces in both repos.

Revision note 2026-05-12: Updated the ExecPlan after implementation and validation. This records the completed site/app surfaces, the process-local DigitalOcean scaling assumption, and the exact validation commands and blockers.

Revision note 2026-05-12: Updated the ExecPlan after adding local-edit pause behavior. This records the host manage mode and match-detail pause rules plus the successful revalidation commands and unchanged Google Services blocker.

Revision note 2026-05-13: Updated the ExecPlan after runtime debugging. This records the stale plain-Next process, the `server.mjs` startup/env fixes, the successful websocket handshake probe, and the app-side narrowing from any open match detail to assigned-official match ownership.
