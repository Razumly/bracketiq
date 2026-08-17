# Watch-scoped token sync and persistent mobile sessions

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. It is stored in `plans/` because the change crosses the Android mobile app, the Wear OS app, and the sibling backend repository `/Users/elesesy/StudioProjects/mvp-site`.

## Purpose / Big Picture

Officials should not need to type credentials on a watch if they are already logged into the Android mobile app. After this change, a logged-in phone can ask the backend for a short-lived watch setup code, send that setup code to the paired Wear OS app, and the watch can exchange it for its own bearer token. The phone token is never copied to the watch. The mobile and watch bearer tokens should not expire on a fixed seven-day clock; they remain valid until the user logs out, changes password, is disabled, or the backend increments that user's `sessionVersion`.

The visible behavior is: log into the Android app, open the Wear OS app on a paired watch, and the watch should move past the login screen once it receives the setup code. Manual watch login remains available for standalone use.

## Progress

- [x] (2026-06-08T19:00:06Z) Read `PLANS.md`, current mobile auth storage, current Wear auth storage, and backend auth routes.
- [x] (2026-06-08T19:00:06Z) Confirmed current backend session JWTs expire after seven days in `/Users/elesesy/StudioProjects/mvp-site/src/lib/authServer.ts`.
- [x] (2026-06-08T19:00:06Z) Confirmed Google Maven currently publishes `com.google.android.gms:play-services-wearable:20.0.1`.
- [x] (2026-06-08T19:08:00Z) Added backend support for non-expiring session JWTs, short-lived watch setup JWTs, and watch setup/exchange routes.
- [x] (2026-06-08T19:08:00Z) Added backend route/helper tests for watch setup creation, exchange, invalid setup codes, stale setup codes, suspended users, and no fixed session expiry.
- [x] (2026-06-08T19:35:00Z) Added Android mobile phone sync code that requests a setup code and sends it to connected Wear nodes.
- [x] (2026-06-08T19:35:00Z) Added Wear OS receiver code that exchanges setup codes and bootstraps the existing match list without manual credential entry.
- [x] (2026-06-08T19:40:00Z) Ran Android/Wear validation commands and recorded evidence here.

## Surprises & Discoveries

- Observation: The backend already has a logout/password-change invalidation model using `AuthUser.sessionVersion`, so non-expiring JWTs can still be revoked without adding a session database table.
  Evidence: `/Users/elesesy/StudioProjects/mvp-site/src/server/authSessions.ts` increments `sessionVersion`; `requireSession` and `/api/auth/me` compare token `sessionVersion` to the current row.
- Observation: Current app tokens do expire after seven days even though the app refreshes tokens on `/api/auth/me`.
  Evidence: `TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7` and `jwt.sign(payload, getAuthSecret(), { expiresIn: TOKEN_TTL_SECONDS })` in `/Users/elesesy/StudioProjects/mvp-site/src/lib/authServer.ts`.
- Observation: The Wearable Data Layer dependency is not yet in the version catalog.
  Evidence: Google Maven metadata for `com.google.android.gms:play-services-wearable` lists latest/release `20.0.1`; `gradle/libs.versions.toml` has no wearable Play Services entry.
- Observation: Focused backend auth tests pass after adding watch setup/exchange routes and persistent session token helpers.
  Evidence: `npm test -- src/app/api/auth/__tests__/authRoutes.test.ts src/lib/__tests__/authServer.test.ts --runInBand` reported 2 test suites passed, 24 tests passed.
- Observation: The watch bootstrap path was accepting cached user ids even if `/api/auth/me` did not return a current user/session.
  Evidence: `WearMatchRepository.bootstrapSession()` used `response.resolveUserId() ?: tokenStore.currentUserId()` before this change. It now clears the local watch token and returns unauthenticated when `/api/auth/me` cannot resolve the current server-side session.
- Observation: Android/Wear compilation passes with the Data Layer dependency and new listener service.
  Evidence: `./gradlew :wearApp:testDebugUnitTest :wearApp:assembleDebug :composeApp:assembleDebug --console=plain` completed successfully with 94 actionable tasks.
- Observation: Android, iOS, and Wear token stores do not maintain their own local expiration timestamp.
  Evidence: `AuthTokenStore`, `SecureAuthTokenStore.android.kt`, `SecureAuthTokenStore.ios.kt`, and `WearAuthTokenStore.kt` only store/remove token strings; the fixed login expiry was the backend JWT `exp`.
- Observation: Apple Watch compile validation is blocked by local Xcode destination/platform setup, not by a Swift compiler error.
  Evidence: XcodeBuildMCP and direct `xcodebuild -scheme MVPWatch -destination 'platform=watchOS Simulator,name=Apple Watch Series 9 (45mm),OS=10.2' build` both failed before compilation with destination/platform errors.

## Decision Log

- Decision: Use a short-lived watch setup token/code instead of sending the phone's bearer token to the watch.
  Rationale: This keeps the mobile token on the phone and gives the backend one place to enforce setup-code expiration and device-specific token issuance.
  Date/Author: 2026-06-08 / Codex
- Decision: Make normal session JWTs non-expiring but keep `sessionVersion` revocation.
  Rationale: The user's goal is persistent app and watch logins. `sessionVersion` already invalidates all outstanding tokens on logout, password change, account disable, or explicit revocation, so a fixed `exp` claim is not required for revocation.
  Date/Author: 2026-06-08 / Codex
- Decision: Keep manual Wear login as a fallback.
  Rationale: Wear OS Data Layer only helps when the watch is paired to an Android phone with the installed mobile app. A watch may be offline, paired differently, or used before the phone syncs.
  Date/Author: 2026-06-08 / Codex

## Outcomes & Retrospective

Implemented. Normal mobile/watch session JWTs are now issued without a fixed `exp` claim and still carry `sessionVersion` for revocation. The Android app requests short-lived watch setup tokens after authenticated user caching and sends those setup tokens to connected Wear nodes. The Wear app listens for `/mvp/auth/watch-setup`, exchanges the setup token for a watch-scoped bearer token, stores it in `WearAuthTokenStore`, and reboots the existing match list flow. Manual Wear email/password login remains available.

## Context and Orientation

The local checkout `/Users/elesesy/StudioProjects/mvp-app` contains the Kotlin Multiplatform mobile app in `composeApp/` and the Wear OS app in `wearApp/`. The backend and API contract source of truth is the sibling checkout `/Users/elesesy/StudioProjects/mvp-site`.

The mobile app stores its bearer token through `AuthTokenStore`. On Android, `composeApp/src/androidMain/kotlin/com/razumly/mvp/core/network/SecureAuthTokenStore.android.kt` uses `EncryptedSharedPreferences` outside Robolectric tests. The shared `UserRepository` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt` stores `token` from auth routes and refreshes it from `GET api/auth/me`.

The Wear OS app stores its own bearer token in `wearApp/src/main/java/com/razumly/mvp/wear/data/WearAuthTokenStore.kt`. `WearMatchRepository` can log in with email/password and can bootstrap an existing token through `GET api/auth/me`.

The backend signs JWT bearer tokens in `/Users/elesesy/StudioProjects/mvp-site/src/lib/authServer.ts`. A JWT is a signed string that contains claims such as `userId`, `isAdmin`, and `sessionVersion`. Today those JWTs include an `exp` claim because `signSessionToken` passes `expiresIn: TOKEN_TTL_SECONDS`. The backend revokes old tokens by incrementing `AuthUser.sessionVersion`; a token is accepted only if its embedded `sessionVersion` equals the current database row.

A watch setup code is a short-lived JWT that is only accepted by a new backend exchange route. It is not accepted by normal API routes. The exchange route verifies the setup code, checks that the user is still active and the session version is current, then returns a normal session token with `device: 'watch'` metadata in the token payload. Normal API routes continue authorizing through `userId`, `isAdmin`, and `sessionVersion`.

## Plan of Work

First, update the backend auth helpers in `/Users/elesesy/StudioProjects/mvp-site/src/lib/authServer.ts`. Add a `device` field to session tokens, make `signSessionToken` omit `expiresIn`, and add `signWatchSetupToken` / `verifyWatchSetupToken`. Keep cookies persistent by setting a long max age, not a seven-day max age. The setup token should expire quickly, for example five minutes.

Second, add `/Users/elesesy/StudioProjects/mvp-site/src/app/api/auth/watch/setup/route.ts`. This route requires an existing mobile session through `requireSession`, signs a short-lived setup token for the same user/session version, and returns `{ setupToken, expiresInSeconds }`.

Third, add `/Users/elesesy/StudioProjects/mvp-site/src/app/api/auth/watch/exchange/route.ts`. This route accepts `{ setupToken }`, verifies that the setup code is valid and intended for watch setup, loads the `AuthUser`, checks `sessionVersion` and suspension state, then returns the same shape as `/api/auth/me` with a watch-scoped session token. The response should include `session.device = 'watch'` if the DTOs can tolerate it. Existing clients ignore unknown fields, so this is safe.

Fourth, add or update backend Jest tests near `/Users/elesesy/StudioProjects/mvp-site/src/app/api/auth/__tests__/authRoutes.test.ts` or a new route-specific test file. Mock `signWatchSetupToken`, `verifyWatchSetupToken`, `signSessionToken`, `requireSession`, and Prisma. Cover setup success, exchange success, invalid setup token, suspended account, and stale `sessionVersion`.

Fifth, add `playServicesWearable = "20.0.1"` and `play-services-wearable` to `gradle/libs.versions.toml`, then add the dependency to `composeApp` Android and `wearApp`. The phone side can live in Android-specific code because Wear sync is Android-only.

Sixth, add a small Android phone sync component. It should read the existing mobile `AuthTokenStore`, call `POST api/auth/watch/setup`, find connected Wear nodes using `Wearable.getNodeClient(context).connectedNodes`, and send the setup token using `Wearable.getMessageClient(context).sendMessage(node.id, "/mvp/auth/watch-setup", payload)`. It should be safe to call after login and during startup when a valid token is already present. Failure to find a watch should be logged and should not fail phone login.

Seventh, add a Wear OS listener service in `wearApp` that handles path `/mvp/auth/watch-setup`. It should parse the setup token, call `POST api/auth/watch/exchange`, save the returned token in `WearAuthTokenStore`, and notify the app UI to reload. If no UI is open, saving the token is enough because `MvpWearViewModel.bootstrap()` already checks the token store.

Eighth, update Wear UI copy if needed. The login screen can keep email/password but should show that paired phone login is supported once the sync code is present. Avoid blocking manual sign-in.

## Concrete Steps

Run backend tests from the backend checkout:

    cd /Users/elesesy/StudioProjects/mvp-site
    npm test -- src/app/api/auth/__tests__/authRoutes.test.ts

Run Android/Wear tests from the app checkout:

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :wearApp:testDebugUnitTest :wearApp:assembleDebug :composeApp:assembleDebug --console=plain

Install the Wear app on the watch emulator:

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :wearApp:installDebug --console=plain

## Validation and Acceptance

Backend acceptance: `POST /api/auth/watch/setup` with a valid mobile bearer token returns HTTP 200 with a non-empty `setupToken`. `POST /api/auth/watch/exchange` with that setup token returns HTTP 200 with a non-empty `token`, `session.userId`, and profile data. The returned `token` should be accepted by `GET /api/auth/me`. A setup token with the wrong purpose, expired token, unknown user, suspended user, or stale `sessionVersion` should fail.

Mobile/Wear acceptance: after Android login, the phone attempts to send a watch setup token over the Wear Data Layer. When the Wear app receives it, `WearAuthTokenStore` contains a token and `MvpWearViewModel.bootstrap()` routes to the Matches screen without requiring email/password. If sync is unavailable, the Wear login screen still works.

Persistent-login acceptance: JWTs created by normal auth routes no longer contain a fixed seven-day `exp` claim. They still contain `iat` and `sessionVersion`, and they are still rejected after `sessionVersion` changes.

## Idempotence and Recovery

All backend changes are additive except removing the fixed session expiry. The new watch setup endpoint does not require a database migration because setup codes are stateless JWTs. Re-running tests is safe. If Data Layer sync fails on an emulator, manual login remains available and backend endpoint tests still prove the token contract.

If the Android dependency causes Gradle resolution issues, verify `com.google.android.gms:play-services-wearable:20.0.1` in Google Maven metadata and rerun Gradle with network access.

## Artifacts and Notes

Current evidence:

    curl -fsSL https://dl.google.com/dl/android/maven2/com/google/android/gms/play-services-wearable/maven-metadata.xml
    latest/release: 20.0.1

    /Users/elesesy/StudioProjects/mvp-site/src/lib/authServer.ts
    TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7
    signSessionToken(..., { expiresIn: TOKEN_TTL_SECONDS })

Backend validation after implementation:

    npm test -- src/app/api/auth/__tests__/authRoutes.test.ts src/lib/__tests__/authServer.test.ts --runInBand
    PASS src/app/api/auth/__tests__/authRoutes.test.ts
    PASS src/lib/__tests__/authServer.test.ts
    Tests: 24 passed, 24 total

Backend validation rerun after Android/Wear implementation:

    npm test -- src/app/api/auth/__tests__/authRoutes.test.ts src/lib/__tests__/authServer.test.ts --runInBand
    Test Suites: 2 passed, 2 total
    Tests: 24 passed, 24 total

Android/Wear validation after implementation:

    ./gradlew :wearApp:testDebugUnitTest :wearApp:assembleDebug :composeApp:assembleDebug --console=plain
    BUILD SUCCESSFUL in 3m 47s
    94 actionable tasks: 47 executed, 47 up-to-date

## Interfaces and Dependencies

Backend functions to add in `/Users/elesesy/StudioProjects/mvp-site/src/lib/authServer.ts`:

    export type SessionDevice = 'web' | 'mobile' | 'watch';
    export type SessionToken = { userId: string; isAdmin: boolean; sessionVersion: number; device?: SessionDevice };
    export type WatchSetupToken = { userId: string; sessionVersion: number; purpose: 'watch_setup' };
    export const signSessionToken(payload: SessionToken): string;
    export const signWatchSetupToken(payload: Omit<WatchSetupToken, 'purpose'>): string;
    export const verifyWatchSetupToken(token: string): WatchSetupToken | null;

Backend routes to add:

    POST /api/auth/watch/setup
    Response: { setupToken: string, expiresInSeconds: number }

    POST /api/auth/watch/exchange
    Request: { setupToken: string }
    Response: existing AuthResponse shape with token/session/profile

Android Data Layer path:

    /mvp/auth/watch-setup

Payload:

    JSON UTF-8 bytes: { "setupToken": "...", "issuedAt": "2026-06-08T19:00:06Z" }

Revision note 2026-06-08: Initial plan created after reading the current auth implementation and confirming the Wearable dependency version. The plan chooses stateless setup JWTs to avoid a backend migration while still keeping the phone bearer token off the watch.
