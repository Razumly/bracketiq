# Cross-Platform Friends + Following System

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` have been updated as implementation progressed.

This plan follows `PLANS.md` at the repository root (`/mnt/c/Users/samue/StudioProjects/mvp-app/PLANS.md`).

## Purpose / Big Picture

After this change, both the web app and mobile app support social connections with explicit friend request approval plus one-way following. Users can send/accept/decline friend requests, follow/unfollow users, manage those relationships from profile sections, and receive new-event notifications when they are either a friend or follower of the host.

## Progress

- [x] (2026-02-18 15:05Z) Audited current social model and found mobile repository stubs + missing backend social endpoints.
- [x] (2026-02-18 15:21Z) Implemented backend social APIs and shared mutation rules under `/api/users/social/*`.
- [x] (2026-02-18 15:24Z) Wired event creation notifications to host friends + followers.
- [x] (2026-02-18 15:37Z) Added web profile social sections and actions.
- [x] (2026-02-18 15:46Z) Implemented mobile repository social API calls.
- [x] (2026-02-18 15:54Z) Added mobile profile Connections section and actions.
- [x] (2026-02-18 16:22Z) Validation completed with backend tests/lint and a successful `:composeApp:compileKotlinMetadata` compile; full Android compile task remained non-deterministic in this shell.

## Surprises & Discoveries

- Observation: Social fields already exist in both schemas/models (`friendIds`, `friendRequestIds`, `friendRequestSentIds`, `followingIds`), so this was primarily behavior/UI work.
  Evidence: Existing model definitions in both repositories and populated DTOs.

- Observation: Android compile task (`:composeApp:compileDebugKotlinAndroid`) progressed through resource/KSP/Kotlin phases but did not provide a terminal completion signal in this shell session.
  Evidence: Gradle output reached `:composeApp:compileDebugKotlinAndroid`; daemon stayed active with Kotlin compile CPU usage.

- Observation: `:composeApp:compileKotlinMetadata --quiet` completed successfully and is a viable syntax validation signal for commonMain/profile changes.
  Evidence: Gradle command exited with status code `0`.

## Decision Log

- Decision: Use dedicated social endpoints instead of generic `PATCH /api/users/:id` for friend/follow operations.
  Rationale: Avoid insecure arbitrary patching for relationship mutations and ensure symmetric updates happen atomically.
  Date/Author: 2026-02-18 / Codex

- Decision: Keep event-creation social fanout best-effort and non-blocking for event persistence semantics.
  Rationale: Event creation must succeed even if push/email transport is unavailable.
  Date/Author: 2026-02-18 / Codex

## Outcomes & Retrospective

Backend/web/mobile feature behavior was implemented end-to-end. Backend tests and lint pass on changed surfaces, and commonMain Kotlin compilation succeeded (`compileKotlinMetadata`). The only caveat observed was non-deterministic completion behavior for the full Android compile task in this shell session.

## Context and Orientation

Mobile code is in `composeApp/src/commonMain/kotlin/com/razumly/mvp/`. Social action methods in `core/data/repositories/UserRepository.kt` were implemented to call backend social APIs. Profile navigation/sections were extended in `profile/ProfileComponent.kt`, `profile/ProfileHomeScreen.kt`, `profile/ProfileFeatureScreens.kt`, and `profile/ProfileScreen.kt` with a new Connections area.

Web/backend code is in `/home/camka/Projects/MVP/mvp-site`. New social API routes were added under `src/app/api/users/social/`. Shared social logic lives in `src/server/socialGraph.ts`. Event creation fanout lives in `src/server/eventCreationNotifications.ts` and is called from `src/app/api/events/route.ts`.

## Plan of Work

Implemented backend-first so both clients share one source of truth. Added server-side social mutation helpers and `/api/users/social/...` routes for send/accept/decline/remove friend and follow/unfollow, plus `/api/users/social` graph retrieval for profile sections. Added `/api/events` creation fanout to notify host friends/followers.

Extended web `userService` with social API methods and added profile social sections in `src/app/profile/page.tsx` for incoming requests, friends, following, followers, and user search actions.

Replaced mobile repository social stubs with API-backed implementations and added a profile Connections section with request approvals and friend/follow management.

## Concrete Steps

1. Added backend social service and API routes in `mvp-site`.
2. Added event creation social notification helper and route call site.
3. Extended web `userService` and profile UI.
4. Implemented mobile repository social calls and profile Connections UI.
5. Ran focused backend tests and lint.

## Validation and Acceptance

Validation run:

- In `/home/camka/Projects/MVP/mvp-site`:
  - `npm test -- src/app/api/users/__tests__/socialRoutes.test.ts src/server/__tests__/socialGraph.test.ts src/app/api/events/__tests__/eventSaveRoute.test.ts`
  - `npm run lint -- src/app/api/users/social src/server/socialGraph.ts src/server/eventCreationNotifications.ts src/app/profile/page.tsx src/lib/userService.ts`

Observed:

- Social route tests passed.
- Social graph mutation logic tests passed.
- Event save route test (with notification fanout mock assertion) passed.
- Lint passed on changed web/backend files.

Mobile validation attempt:

- In `/mnt/c/Users/samue/StudioProjects/mvp-app`:
  - `./gradlew :composeApp:compileDebugKotlinAndroid`

Observed:

- Task progressed through resource/KSP/Kotlin stages but did not provide a terminal completion signal in this shell environment.

## Idempotence and Recovery

Relationship mutations are set-like (`add unique` / `remove`) and safe to repeat. Notifications are best-effort and do not block event creation. If a social request endpoint call is retried, state converges without duplicate list entries.

## Artifacts and Notes

Backend test evidence:

    PASS src/server/__tests__/socialGraph.test.ts
    PASS src/app/api/events/__tests__/eventSaveRoute.test.ts
    PASS src/app/api/users/__tests__/socialRoutes.test.ts

    Test Suites: 3 passed, 3 total
    Tests:       10 passed, 10 total

## Interfaces and Dependencies

Implemented backend interfaces in `mvp-site`:

- `getSocialGraphForUser(userId: string)`
- `sendFriendRequest(actorUserId: string, targetUserId: string)`
- `acceptFriendRequest(actorUserId: string, requesterUserId: string)`
- `declineFriendRequest(actorUserId: string, requesterUserId: string)`
- `removeFriend(actorUserId: string, friendUserId: string)`
- `followUser(actorUserId: string, targetUserId: string)`
- `unfollowUser(actorUserId: string, targetUserId: string)`

Mobile repository methods in `UserRepository.kt` now call `/api/users/social/...` and refresh cached current user after successful mutations.

Plan revision note: Updated from initial draft to reflect implemented files, validation results, and compile-environment caveat.
