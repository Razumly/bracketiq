# Migrate MVP App Off Appwrite to Next.js + Prisma (DigitalOcean)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

Today the mobile app (`composeApp/`, Kotlin Multiplatform) uses Appwrite for authentication, database tables, server-side functions, realtime subscriptions, storage (images), and push messaging. After this migration the app will not compile against Appwrite and will not make any network calls to Appwrite. Instead it will talk to our Next.js API (hosted on DigitalOcean) backed by our Prisma/Postgres database (also on DigitalOcean), using the routes implemented in `~/Projects/MVP/mvp-site/src/app/api/**`.

The user-visible goal is that a tester can install the Android app or run the iOS app, log in, browse/search events, join/leave events, manage teams, chat, and perform billing flows (Stripe) using the DigitalOcean-hosted API; and the app still caches data locally with Room where it does today.

## Progress

- [x] (2026-02-09) Confirm Android build baseline via Windows Gradle (`gradlew.bat :composeApp:assembleDebug`) and record environment constraints (JDK/SDK).
- [x] (2026-02-09) Inventory Appwrite touchpoints and map each area to its Next.js endpoint replacement (Auth/Users/Teams/Events/Matches/Chat/Fields/Invites/Files/Billing/Push).
- [x] (2026-02-10) Restore a working baseline unit test run (`gradlew.bat :composeApp:testDebugUnitTest`) by removing the MockMP Gradle plugin and replacing broken Appwrite tests with Ktor MockEngine-based tests.
- [x] (2026-02-10) Create a typed HTTP API client (Ktor) with auth token storage and base URL configuration; add a stable `newId()` generator replacing `io.appwrite.ID.unique()`.
- [x] (2026-02-10) Replace Appwrite auth (email/password) with Next.js auth routes (`/api/auth/login|register|me|logout|password`), keep current login/signup UI behavior, and remove `io.appwrite.models.User` from public client surfaces.
- [x] (2026-02-10) Server: Expose public `UserData` read endpoints for guests (`GET /api/users?query=...`, `GET /api/users/[id]`) while keeping updates restricted.
- [x] (2026-02-10) Server: Update email-invite flows to resolve invited users via `AuthUser` lookup and create placeholder `AuthUser` + `UserData` on invite when missing.
- [x] (2026-02-10) Server: Add `DELETE /api/invites/[id]` to support id-based invite deletion.
- [x] (2026-02-10) Server: Add `POST /api/invites/[id]/accept` so invited users can accept team invites without captain privileges; mobile uses this endpoint (no local team mutation).
- [x] (2026-02-10) Migrate `TeamRepository` off Appwrite tables to Next.js (`/api/teams/**`, `/api/invites/**`), add invite sync for pending players, and add a MockEngine test for team fetch.
- [x] (2026-02-10) Migrate `EventRepository` + `MatchRepository` off Appwrite (tables/functions/realtime) to Next.js (`/api/events/**`, `/api/events/search`, `/api/events/[eventId]/participants`, `/api/events/[eventId]/matches`, `PATCH /api/events/[eventId]/matches/[matchId]` w/ finalize), add MockEngine tests for event search + participants.
- [x] (2026-02-10) Migrate chat groups + messages off Appwrite to Next.js (`/api/chat/groups`, `PATCH /api/chat/groups/[id]`, `/api/chat/groups/[id]/messages`, `POST /api/messages`), and add a MockEngine unit test for sending a message.
- [x] (2026-02-10) Migrate images/files/avatars off Appwrite Storage/Avatars to Next.js (`POST /api/files/upload`, `GET/DELETE /api/files/[id]`, `GET /api/files/[id]/preview`, `GET /api/avatars/initials`) and remove `io.appwrite.models.InputFile` from upload surfaces.
- [x] (2026-02-10) Migrate `BillingRepository` off Appwrite Functions/Tables to Next.js (`POST /api/billing/purchase-intent`, `POST /api/billing/host/connect`, `POST /api/billing/host/onboarding-link`, `POST /api/billing/refund`, `GET/PATCH /api/refund-requests/**`), add `POST /api/billing/refund-all` for host delete+refund, and add a MockEngine unit test for purchase intent parsing.
- [x] (2026-02-10) Replace Appwrite tables usage with Next.js routes for: users, teams, events, matches, chat groups/messages, fields, invites, files/images, refunds/billing.
- [x] (2026-02-10) Replace Appwrite realtime with polling/refresh (or a websocket/SSE equivalent if we implement one).
- [x] (2026-02-10) Remove all Appwrite SDK dependencies, DI modules, platform callback wiring, and Appwrite-specific tests (push messaging is currently a no-op).
- [x] (2026-02-10) Re-validate Android build + unit tests after Appwrite removal (`gradlew.bat :composeApp:testDebugUnitTest`, `gradlew.bat :composeApp:assembleDebug`).
- [x] (2026-02-11) Server: Add `POST /api/auth/google/mobile` that verifies Google ID tokens, validates allowed audiences (`GOOGLE_MOBILE_ANDROID_CLIENT_ID`, `GOOGLE_MOBILE_IOS_CLIENT_ID`), and returns `{ user, session, token, profile }`.
- [x] (2026-02-11) Mobile: Replace Android/iOS Google OAuth stubs with native sign-in and backend token exchange; keep existing auth state wiring in `UserRepository`.
- [x] (2026-02-11) Validation: `mvp-site` tests/build pass for new route; Android unit test + assemble pass with JDK17 (`JAVA_HOME=C:\\Users\\samue\\.jdks\\temurin17\\jdk-17.0.18+8`).
- [ ] (2026-02-10) Validate via unit tests and at least one end-to-end manual scenario on Android and iOS.

## Surprises & Discoveries

- Observation: KSP (and some Gradle tasks) crash when running on Windows with a JBR/JDK 21 that lacks expected desktop libs (`sun.awt.PlatformGraphicsInfo.hasDisplays0` / `UnsatisfiedLinkError`). Running Gradle with Temurin JDK 17 succeeds.
  Evidence: `gradlew.bat :composeApp:assembleDebug` succeeded only with `JAVA_HOME=C:\\Users\\samue\\.jdks\\temurin17\\jdk-17.0.18+8`.
- Observation: The Kodein MockMP Gradle plugin generated `expect` helpers without corresponding `actual` implementations and also triggered Gradle task validation issues (`mockmpExtractExpectKt`). We removed the plugin and replaced Appwrite tests with Ktor MockEngine tests.
  Evidence: failing task `mockmpExtractExpectKt` and JVM test compilation failures until plugin removal.
- Observation: Our current Kotlin models/DTOs often mark `id` as `@Transient` because Appwrite provided ids via Row wrappers. The new Next.js routes return `id` in JSON payloads, so we must make `id` serializable/decodable for several models (`Invite`, `ChatGroup`, `MessageMVP`, many `*DTO`s) or decode into a separate API DTO and map.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Invite.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/ChatGroup.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MessageMVP.kt`.
- Observation: The Next.js API supports Bearer tokens in addition to cookies, which is the correct approach for native clients.
  Evidence: `~/Projects/MVP/mvp-site/src/lib/authServer.ts` (`getTokenFromRequest` supports `Authorization: Bearer ...`).
- Observation: `POST /api/auth/password` does not return a token in the JSON body (it only refreshes the cookie). For native clients, we must follow up with `GET /api/auth/me` to fetch a refreshed Bearer token and persist it.
  Evidence: `~/Projects/MVP/mvp-site/src/app/api/auth/password/route.ts` returns `{ ok: true }` and calls `setAuthCookie`.
- Observation: `GET /api/users?query=...` and `GET /api/users/[id]` now return public `UserData` for guests (no session required); `PATCH /api/users/[id]` remains restricted to self/admin.
  Evidence: `~/Projects/MVP/mvp-site/src/app/api/users/route.ts`, `~/Projects/MVP/mvp-site/src/app/api/users/[id]/route.ts`.
- Observation: Some Next.js endpoints differ from Appwrite field names (example: Events use `price` in Prisma/routes, while the app currently uses `priceCents` in Kotlin). We must align serialization names or map fields.
  Evidence: `~/Projects/MVP/mvp-site/src/app/api/events/[eventId]/route.ts` (field `price`), `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt` (`priceCents`).
- Observation: `PATCH /api/teams/[id]` is restricted to captain/admin, so invited users cannot accept a team invite by PATCHing the team. The mobile app now expects a dedicated accept endpoint (e.g. `POST /api/invites/[id]/accept`) that performs the membership mutation server-side.
  Evidence: `~/Projects/MVP/mvp-site/src/app/api/teams/[id]/route.ts` (captain/admin check), `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/TeamRepository.kt` (`acceptTeamInvite`).
- Observation: `PATCH /api/events/[eventId]/matches/[matchId]` was restricted to host/admin, but the mobile match-scoring flow is referee-driven. We updated the server to allow referees limited updates (scores/check-in/finalize) while keeping host/admin full control.
  Evidence: `~/Projects/MVP/mvp-site/src/app/api/events/[eventId]/matches/[matchId]/route.ts`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt`.
- Observation: The Next.js API supports deleting a single invite by id (`DELETE /api/invites/[id]`) in addition to the filter-based bulk delete.
  Evidence: `~/Projects/MVP/mvp-site/src/app/api/invites/[id]/route.ts`, `~/Projects/MVP/mvp-site/src/app/api/invites/route.ts`.
- Observation: Invites created by email now resolve the invited user via normalized email (`AuthUser` lookup) and create a placeholder `AuthUser` + `UserData` (and email mapping) when missing; invite emails are only sent for newly-created placeholder users.
  Evidence: `~/Projects/MVP/mvp-site/src/app/api/invites/route.ts`, `~/Projects/MVP/mvp-site/src/server/inviteUsers.ts`.
- Observation: The mobile chat membership flows require updating `ChatGroup.userIds`, but the server only exposed `GET/POST /api/chat/groups`. We added `PATCH /api/chat/groups/[id]` with permissions: host/admin can manage; non-host members can only remove themselves (leave).
  Evidence: `~/Projects/MVP/mvp-site/src/app/api/chat/groups/[id]/route.ts`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/chat/data/ChatGroupRepository.kt`.
- Observation: The server image preview endpoint uses query params `w` and `h` (not Appwrite's `width`/`height`), so the mobile `getImageUrl(...)` helper was updated to call `GET /api/files/[id]/preview?w=...&h=...` via `apiBaseUrl`.
  Evidence: `~/Projects/MVP/mvp-site/src/app/api/files/[id]/preview/route.ts`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/util/util.kt`.
- Observation: `POST /api/billing/purchase-intent` does not return Stripe `customer` / `ephemeralKey` fields (unlike the old Appwrite billing function). We updated the native PaymentSheet wiring to treat these fields as optional and proceed without a customer config when missing.
  Evidence: `~/Projects/MVP/mvp-site/src/app/api/billing/purchase-intent/route.ts`, `composeApp/src/androidMain/kotlin/com/razumly/mvp/core/presentation/PaymentProcessor.android.kt`, `composeApp/src/iosMain/kotlin/com/razumly/mvp/core/presentation/PaymentProcessor.ios.kt`, `iosApp/iosApp/IOSNativeViewFactory.swift`.
- Observation: Host deletion of a paid event previously relied on an Appwrite command (`refund_all_payments`). The Next.js API did not have an equivalent, so we added `POST /api/billing/refund-all` to create refund request rows for participants and team captains before deleting the event.
  Evidence: `~/Projects/MVP/mvp-site/src/app/api/billing/refund-all/route.ts`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`.
- Observation: Running Gradle from WSL/Linux in this environment failed until a JDK was available, and Android builds failed against the Windows SDK due to missing Linux build-tools binaries (AAPT expected at `.../aapt` but Windows installs `aapt.exe`). Running Gradle via Windows (`gradlew.bat`) succeeds for Android builds.
  Evidence: `./gradlew` error: “No Java compiler found”; Linux build error: “Build-tool 35.0.0 is missing AAPT at .../aapt”; Windows build succeeds with `gradlew.bat :composeApp:assembleDebug`.
- Observation: This project does not define `:composeApp:commonTest`. Use `:composeApp:testDebugUnitTest` for JVM/Android unit tests and `:composeApp:allTests` for the full suite (when supported by host OS/targets).
  Evidence: `./gradlew :composeApp:tasks` shows `allTests` + `testDebugUnitTest`.
- Observation: Android/KSP tasks for this repo still require JDK17 in this environment; builds can fail with `Could not initialize class sun.awt.PlatformGraphicsInfo` on other JDKs.
  Evidence: `gradlew.bat :composeApp:testDebugUnitTest` failed until rerun with `JAVA_HOME=C:\\Users\\samue\\.jdks\\temurin17\\jdk-17.0.18+8`.

## Decision Log

- Decision: The mobile app will authenticate with the Next.js API using a JWT stored locally and sent via `Authorization: Bearer <token>` on every request. We will treat `/api/auth/me` as the “token refresh / session validation” call on app start and after a 401.
  Rationale: Native apps should not rely on httpOnly cookies controlled by external browsers; Bearer tokens are already supported by the server.
  Date/Author: 2026-02-09 / Codex
- Decision: Replace `io.appwrite.models.User` in the client with an app-owned `AuthAccount` model (id/email/name) returned from the Next.js auth routes.
  Rationale: Keeps client surfaces stable while we remove Appwrite dependencies; only fields actually used by the app are exposed.
  Date/Author: 2026-02-10 / Codex
- Decision: We will remove Appwrite realtime subscriptions from the app during migration and replace them with explicit refresh + lightweight polling where needed (chat/messages, matches).
  Rationale: The current Next.js API does not provide a realtime stream compatible with the existing client; polling unblocks the migration while keeping behavior acceptable for MVP.
  Date/Author: 2026-02-09 / Codex
- Decision: Google OAuth on mobile will be considered an optional milestone. The default migration path preserves email/password login first, then adds a mobile-specific Google token exchange endpoint if desired.
  Rationale: The existing server Google flow is browser/cookie based and not mobile-friendly; adding it immediately increases risk and scope.
  Date/Author: 2026-02-09 / Codex
- Decision: Disable (stub) Appwrite-based Google OAuth login hooks in the mobile app until we implement a mobile-friendly server endpoint (`POST /api/auth/google/mobile`) and native ID-token exchange.
  Rationale: Existing OAuth helpers depended on Appwrite `Account` + callback flows; keeping them would block compilation after auth migration and is out of scope for email/password milestone.
  Date/Author: 2026-02-10 / Codex
- Decision: Prisma schema sharing will be handled on the server side (not in the mobile app). Recommended approach is a separate `mvp-schema` repo published as a private npm package consumed by the Next.js server.
  Rationale: The Kotlin app should not depend on Prisma; versioned schema sharing reduces duplication across multiple TypeScript services without forcing a monorepo.
  Date/Author: 2026-02-09 / Codex
- Decision: Treat `UserData` as public profile data and expose guest-readable endpoints (`GET /api/users?query=...`, `GET /api/users/[id]`); restrict mutations to authenticated self/admin only.
  Rationale: The mobile app must render other users (participants, chat, teams) without exposing sensitive fields; email remains in the server-only mapping table.
  Date/Author: 2026-02-10 / Codex
- Decision: For email invites, resolve the target user via normalized email (`AuthUser` lookup) and create placeholder `AuthUser` + `UserData` (plus email mapping) when missing; only send an invite email when we created the placeholder user.
  Rationale: Ensures invites reference a stable `userId` before registration while avoiding duplicate/spam invites to existing accounts.
  Date/Author: 2026-02-10 / Codex
- Decision: Add `DELETE /api/invites/[id]` to support id-based invite deletion; keep `DELETE /api/invites` for filter-based bulk delete.
  Rationale: Matches existing mobile repository expectations (`deleteInvite(inviteId)`) while retaining admin/bulk cleanup behavior.
  Date/Author: 2026-02-10 / Codex
- Decision: Verify mobile Google ID tokens using Google `tokeninfo` and enforce a strict audience allow-list from environment (`GOOGLE_MOBILE_ANDROID_CLIENT_ID`, `GOOGLE_MOBILE_IOS_CLIENT_ID`, optional `GOOGLE_OAUTH_CLIENT_ID`).
  Rationale: Keeps the first mobile OAuth iteration simple while still validating issuer, expiry, email verification, and client audience before creating a local session.
  Date/Author: 2026-02-11 / Codex

## Outcomes & Retrospective

- (2026-02-11) Mobile Google OAuth is now wired end-to-end for API/session behavior: native clients acquire an ID token and exchange it with `POST /api/auth/google/mobile`, and the app reuses standard auth token/profile persistence.
- Remaining gap: iOS runtime verification still needs on-device/manual validation with real OAuth credentials and URL scheme value (`GOOGLE_REVERSED_CLIENT_ID`) in Xcode.

## Context and Orientation

### Current mobile architecture (this repo)

`composeApp/` is the Kotlin Multiplatform app with shared logic in `composeApp/src/commonMain/kotlin/com/razumly/mvp/**`. Data is fetched through repositories defined in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/**` and cached in Room via `DatabaseService` and DAOs.

Appwrite was previously wired through (removed 2026-02-10):

- (Removed) DI modules:
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/di/AppwriteModule.kt` (Account/TablesDB/Realtime/Functions/Storage/Messaging/Avatars)
  - `composeApp/src/androidMain/kotlin/com/razumly/mvp/di/ClientModule.android.kt` and `composeApp/src/iosMain/kotlin/com/razumly/mvp/di/ClientModule.ios.kt` (Appwrite `Client` setup)
  - Koin initialization included `clientModule` and `appwriteModule`: `composeApp/src/androidMain/kotlin/com/razumly/mvp/di/KoinInitializer.kt`, `composeApp/src/iosMain/kotlin/com/razumly/mvp/di/KoinInitializer.ios.kt`.
- (Removed) Platform callback wiring for Appwrite OAuth:
  - Android: `composeApp/src/androidMain/AndroidManifest.xml` included `io.appwrite.views.CallbackActivity` + `appwrite-callback-*` scheme.
  - iOS: `iosApp/iosApp/Info.plist` included `appwrite-callback-*` URL scheme, and `composeApp/src/iosMain/kotlin/com/razumly/mvp/core/util/ForceIncludeWebAuthComponent.kt` forced linkage.
- (Removed) Build dependency:
  - `gradle/libs.versions.toml` defined `sdk-for1-kmp`, and `composeApp/build.gradle.kts` included `api(libs.sdk.for1.kmp)` in `commonMain`.

Current state:

- Repositories use the Next.js HTTP API via `MvpApiClient`.
- Server-side push messaging is currently a no-op in `PushNotificationsRepository` until Next.js endpoints exist.

### Target backend (Next.js API)

The new API is implemented in the local repo at `~/Projects/MVP/mvp-site`. It uses:

- Next.js route handlers under `src/app/api/**`
- Prisma models under `prisma/schema.prisma`
- Auth helper `src/lib/authServer.ts` and permissions helper `src/lib/permissions.ts`

For the mobile app, we will treat it as a JSON/HTTP API with Bearer auth. The app does not connect to Prisma/Postgres directly.

## Interfaces and Dependencies

### Mobile network client

We will implement a shared HTTP client in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/**` based on Ktor, with platform engines in `androidMain` and `iosMain`.

At the end of the migration we should have:

1. A token store abstraction:

    - `interface AuthTokenStore { suspend fun get(): String; suspend fun set(token: String); suspend fun clear() }`

2. A small API wrapper:

    - `class MvpApiClient(private val http: HttpClient, private val baseUrl: String, private val tokenStore: AuthTokenStore)`
    - It must attach `Authorization: Bearer <token>` when a token exists.
    - It must surface errors as meaningful exceptions (HTTP status + body) so repositories can use `runCatching { ... }` like they do today.

3. A stable ID generator (replacing `io.appwrite.ID.unique()`):

    - `expect fun newId(): String` in `commonMain`, with `actual` implementations in `androidMain` and `iosMain` using platform UUID utilities.

### Server API additions (if needed)

If the Next.js API is missing a capability required by the mobile app, we will either:

1. Update the app to use the existing API semantics, or
2. Add a minimal route handler in `mvp-site` that preserves the expected behavior.

Previously known gap: delete invite by id. Resolved via `DELETE /api/invites/[id]`.

## Plan of Work

We will migrate by introducing the Next.js API client first, then replacing repositories one at a time behind the existing interfaces so UI changes stay minimal. During the transition we will keep local Room caching behavior the same. When all repository implementations use HTTP, we will remove Appwrite SDK code, manifests, and build dependencies.

### Milestone 1: Add HTTP Client, Token Store, Base URL Config, ID Generator

Implement a Ktor `HttpClient` factory and add an auth token store. Add a single base URL configuration value (for example `MVP_API_BASE_URL`) sourced from Gradle secrets on Android and from a plist on iOS (similar to how `AppSecrets` reads).

Replace all `ID.unique()` usages with `newId()` to fully sever Appwrite from model construction.

### Milestone 2: Replace Authentication and Current User Loading

Replace `UserRepository.login/logout/loadCurrentUser/createNewUser/updatePassword/updateProfile` to call Next.js auth routes:

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/password`

Store the returned token via `AuthTokenStore`. Ensure `UserRepository.currentAccount` becomes an app-specific model (not `io.appwrite.models.User`), and update call sites that only need `email` (payment sheet).

### Milestone 3: Replace Core CRUD Repositories

Implement API calls and response decoding for:

- Teams: `/api/teams`, `/api/teams/[id]`
- Users: `/api/users`, `/api/users/[id]`
- Events: `/api/events`, `/api/events/[eventId]`, `/api/events/search`, `/api/events/[eventId]/participants`
- Fields: `/api/fields`, `/api/fields/[id]` (if needed)
- Matches: `/api/events/[eventId]/matches`, `/api/events/[eventId]/matches/[matchId]`
- Chat: `/api/chat/groups`, `/api/chat/groups/[id]/messages`, `POST /api/messages`
- Invites: `/api/invites`, `DELETE /api/invites/[id]`
- Files/images: `POST /api/files/upload`, `GET/DELETE /api/files/[id]`, avatars `/api/avatars/initials`
- Billing/refunds: `/api/billing/purchase-intent`, `/api/billing/host/connect`, `/api/billing/host/onboarding-link`, `/api/billing/refund`, `/api/refund-requests/**`

As part of this milestone, align Kotlin serialization with the API payloads. If server uses `price` but app uses `priceCents`, use `@SerialName("price")` on the Kotlin field or map via DTO conversion. Remove `@Transient` on ids for any types sent to / read from the API.

### Milestone 4: Replace Realtime and Push Dependencies

Remove `Realtime.subscribe` usage and Appwrite messaging push targets. Replace with:

- Polling for chat messages and match updates (simple interval while screen is visible).
- No-op push notification repository (compile-safe) or an HTTP-backed repository if we implement `/api/messaging/**` fully.

### Milestone 5: Delete Appwrite Code and Dependency Surface

After all features use the HTTP API:

- Remove `appwriteModule` and `clientModule` from Koin initialization.
- Delete Appwrite OAuth callback wiring from `AndroidManifest.xml` and `iosApp/iosApp/Info.plist`.
- Remove Appwrite SDK dependency from Gradle (`sdk-for1-kmp`).
- Delete Appwrite-only shims and tests (`composeApp/src/iosTest/...`, etc.) and replace tests with Ktor MockEngine based tests.

### Milestone 6 (Optional): Mobile Google OAuth

If we want Google Sign-In in the mobile app:

- Add `POST /api/auth/google/mobile` on the server to accept an ID token and return `{ user, session, token, profile }`.
- Use native Google Sign-In on Android/iOS to acquire an ID token and call the endpoint.

## Concrete Steps

All commands are run from this repository root unless stated otherwise.

1. Baseline build before changes:

    - Preferred (Windows host): `gradlew.bat :composeApp:assembleDebug`
    - Tests (after MockMP fix): `gradlew.bat :composeApp:testDebugUnitTest` or `gradlew.bat :composeApp:allTests`
    - If running on macOS/Linux with an Android SDK installed: `./gradlew :composeApp:assembleDebug` and `./gradlew :composeApp:allTests`

2. Keep `~/Projects/MVP/mvp-site` running locally (for manual testing) and note the base URL for emulator/simulator:

    - Android emulator: use `http://10.0.2.2:<port>` for localhost
    - iOS simulator: use `http://localhost:<port>`

3. During migration, re-run at least:

    - Android build: `gradlew.bat :composeApp:assembleDebug` (Windows) or `./gradlew :composeApp:assembleDebug` (macOS/Linux with Android SDK installed)
    - JVM tests: `gradlew.bat :composeApp:testDebugUnitTest` (Windows) or `./gradlew :composeApp:testDebugUnitTest` (macOS/Linux)
    - Full test suite (when available): `gradlew.bat :composeApp:allTests` (Windows) or `./gradlew :composeApp:allTests` (macOS/Linux)

## Validation and Acceptance

### Acceptance criteria (end state)

1. The codebase contains no runtime dependency on Appwrite:
  - No references to `io.appwrite.*` in `composeApp/src/**`
  - No Appwrite dependency in Gradle (`sdk-for1-kmp` removed)
  - No Appwrite OAuth callback configuration in Android/iOS manifests

2. The app can perform these scenarios against the Next.js API:
  - Login with email/password; app remembers the session across relaunch (token persisted) and loads the profile via `/api/auth/me`.
  - Search events (name + distance) via `/api/events/search` and open an event detail screen.
  - Join and leave an event via `/api/events/[eventId]/participants`.
  - View teams and manage membership via `/api/teams/**`.
  - View chat groups and messages, and send a message via `/api/messages`.

3. Tests:
  - `./gradlew :composeApp:testDebugUnitTest` passes (or `:composeApp:allTests` when running on a machine with iOS targets available).
  - New unit tests exist for auth token handling and at least one repository using Ktor MockEngine.

## Idempotence and Recovery

All changes should be safe to apply incrementally. During migration, prefer “parallel implementations” (for example, `UserRepositoryAppwrite` alongside `UserRepositoryHttp`) behind DI bindings so we can switch implementations without breaking compilation. If a milestone breaks too many features at once, revert DI binding to the old implementation and proceed repository-by-repository.

If API mismatches block the app (missing endpoints or incompatible payloads), prefer adding a minimal route handler in `mvp-site` that matches the existing app expectations, then later revisit for cleanup.

## Artifacts and Notes

### API endpoints inventory (mobile-relevant)

Auth:

    POST /api/auth/login
    POST /api/auth/register
    GET  /api/auth/me
    POST /api/auth/logout
    POST /api/auth/password

Users:

    GET   /api/users?query=<term>
    GET   /api/users/[id]
    PATCH /api/users/[id]

Teams:

    GET   /api/teams?ids=a,b,c
    GET   /api/teams?playerId=<userId>
    POST  /api/teams
    GET   /api/teams/[id]
    PATCH /api/teams/[id]
    DELETE /api/teams/[id]

Events:

    GET   /api/events?...filters...
    POST  /api/events
    GET   /api/events/[eventId]
    PATCH /api/events/[eventId]
    DELETE /api/events/[eventId]
    POST  /api/events/search
    POST  /api/events/[eventId]/participants
    DELETE /api/events/[eventId]/participants

Matches:

    GET   /api/events/[eventId]/matches
    PATCH /api/events/[eventId]/matches/[matchId]

Chat:

    GET  /api/chat/groups?userId=<id>
    POST /api/chat/groups
    GET  /api/chat/groups/[id]/messages
    POST /api/messages

Invites:

    GET    /api/invites?userId=<id>&type=<type>&teamId=<id>
    POST   /api/invites
    POST   /api/invites/[id]/accept
    DELETE /api/invites/[id]
    DELETE /api/invites   (filter-based bulk delete)

Files/Images/Avatars:

    POST /api/files/upload (multipart form)
    GET  /api/files/[id]
    DELETE /api/files/[id]
    GET  /api/avatars/initials?name=<name>&size=<px>

Billing / Refunds:

    POST /api/billing/purchase-intent
    POST /api/billing/host/connect
    POST /api/billing/host/onboarding-link
    POST /api/billing/refund
    GET  /api/refund-requests?...filters...
    PATCH /api/refund-requests/[id]

## Task Graph (For `$parallel-task`)

The sections below are intentionally structured so the `parallel-task` skill can dispatch them. Each task contains `depends_on` metadata and acceptance/validation guidance.

### T1: Baseline And Inventory

- **depends_on**: []

Confirm build/test baseline, and capture a list of all Appwrite touchpoints and which Next.js endpoints replace them (use the “API endpoints inventory” section above as the starting point).

Acceptance Criteria:

- Baseline build and tests pass (`assembleDebug`, `testDebugUnitTest`).
- A checklist exists mapping every `io.appwrite.*` usage to either “remove” or “replace with endpoint X”.

Validation:

- Run `./gradlew :composeApp:assembleDebug` and `./gradlew :composeApp:testDebugUnitTest`.

### T2: HTTP Client + Token Store + ID Generator

- **depends_on**: ["T1"]

Add Ktor client plumbing, token persistence, base URL config, and replace `ID.unique()` calls with `newId()`.

Acceptance Criteria:

- App can compile without using `io.appwrite.ID` in shared code.
- `MvpApiClient` exists and can make an unauthenticated request.

Validation:

- `./gradlew :composeApp:assembleDebug`

### T3: Auth Migration (Email/Password)

- **depends_on**: ["T2"]

Replace login/signup/logout/password update/current session load with Next.js routes. Remove `io.appwrite.models.User` from public surfaces.

Acceptance Criteria:

- Login and signup call Next.js endpoints and store token.
- App relaunch loads current user via `/api/auth/me` when token exists.

Validation:

- Add a Ktor MockEngine unit test for login + token persistence.

### T4: Users + Teams Repositories

- **depends_on**: ["T2", "T3"]

Replace `TablesDB` usage for users and teams with `/api/users/**` and `/api/teams/**`. Fix id serialization (`@Transient` removal or DTO mapping).

Acceptance Criteria:

- Team list and team management screens load and mutate via the Next.js API.
- Player search uses `/api/users?query=...`.

Validation:

- Add at least one MockEngine test for a teams fetch.

### T5: Events + Matches Repositories

- **depends_on**: ["T2", "T3", "T4"]

Replace event fetch/search/join/leave and match fetch/update with `/api/events/**`, `/api/events/search`, `/api/events/[eventId]/participants`, and match routes. Remove Appwrite functions usage for event edits and match finalize.

Acceptance Criteria:

- Event discovery/search works.
- Join/leave works and persists.
- Host match editing works (PATCH match).

Validation:

- Add MockEngine tests for `/api/events/search` and `/api/events/[id]/participants`.

### T6: Chat (Groups + Messages)

- **depends_on**: ["T2", "T3", "T4"]

Replace chat group list/create and message list/send with `/api/chat/groups`, `/api/chat/groups/[id]/messages`, and `POST /api/messages`.

Acceptance Criteria:

- Chat list loads groups for current user.
- Opening a group loads messages.
- Sending a message persists and appears after refresh.

Validation:

- MockEngine test for sending a message.

### T7: Images/Files + UnifiedCard Avatars

- **depends_on**: ["T2", "T3"]

Replace Appwrite Storage uploads with `POST /api/files/upload` and update image URL construction to use `GET /api/files/[id]`. Replace Appwrite initials avatar URL with `/api/avatars/initials`.

Acceptance Criteria:

- Upload returns a file id and the UI can render an uploaded image via the new endpoint.
- UnifiedCard no longer references `cloud.appwrite.io`.

Validation:

- Manual: upload an image and display it.

### T8: Billing + Refunds

- **depends_on**: ["T2", "T3", "T5"]

Replace billing function calls and refundRequests table calls with billing/refund endpoints. Align client data types to server response (note: server may not return `ephemeralKey/customer`).

Acceptance Criteria:

- Purchase intent flow hits `/api/billing/purchase-intent` and uses returned keys.
- Refund request calls `/api/billing/refund` and refund manager reads `/api/refund-requests`.

Validation:

- MockEngine test for purchase intent response parsing.

### T9: Realtime + Push Notifications Cleanup

- **depends_on**: ["T3", "T5", "T6"]

Remove Appwrite realtime subscriptions and Appwrite push target usage. Implement polling/no-op push repo so compilation and flows remain stable.

Acceptance Criteria:

- No usage of `io.appwrite.services.Realtime`, `io.appwrite.services.Messaging`, or `account.createPushTarget`.
- Chat and match screens still update via refresh/poll.

Validation:

- Manual: open chat/match, observe refresh behavior.

### T10: Remove Appwrite Dependency Surface (Build + Manifests + Tests)

- **depends_on**: ["T3", "T4", "T5", "T6", "T7", "T8", "T9"]

Remove the Appwrite SDK dependency, delete DI modules and client setup, update manifests/plists, and rewrite tests to avoid Appwrite fakes.

Acceptance Criteria:

- `rg -n \"io\\.appwrite\" composeApp/src` returns no matches.
- App builds and tests pass.

Validation:

- `./gradlew :composeApp:assembleDebug`
- `./gradlew :composeApp:testDebugUnitTest`

### T11: Optional Mobile Google OAuth

- **depends_on**: ["T3"]

If required, add server endpoint `POST /api/auth/google/mobile` and mobile client integration via native Google Sign-In.

Acceptance Criteria:

- Google sign-in returns a JWT token and profile and behaves like email/password login.

Validation:

- Manual on-device login.

### T12: Optional Prisma Schema Sharing Repo

- **depends_on**: []

If multiple server-side repos need the same schema, create `mvp-schema` as a separate repo/package and consume it from `mvp-site`.

Acceptance Criteria:

- `mvp-site` builds using the shared schema package, and migrations are still applied in deploy.

Validation:

- Run `prisma validate` and `prisma migrate deploy` in CI for the server.
