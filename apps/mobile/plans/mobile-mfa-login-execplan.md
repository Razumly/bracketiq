# Handle mobile MFA login without a missing-token error

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This document is maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

Email login currently treats every HTTP 200 response from the backend as a completed login and immediately requires an access token. Accounts with an authenticator enabled instead receive a successful multi-factor authentication challenge response with no token, so Android and iOS surface the misleading error `Login response missing token`. After this change, the shared mobile login flow recognizes that challenge, asks for the authenticator code, confirms it with the backend, and only then stores the returned token. A developer can also use the backend's existing local-only MFA bypass to test ordinary simulator login without weakening deployed behavior.

## Progress

- [x] (2026-07-23 02:18Z) Captured the iOS runtime request and confirmed that `/api/auth/login` returned HTTP 200 followed by `Login response missing token`.
- [x] (2026-07-23 02:24Z) Compared the response with the `mvp-site` login and MFA confirmation routes and identified the missing mobile MFA contract.
- [x] (2026-07-23 02:27Z) Relaunched the local backend on port 3000 with `AUTH_MFA_DISABLED_LOCAL=true` for immediate simulator login testing.
- [x] (2026-07-23 02:30Z) Added MFA response DTOs, repository challenge handling, and shared component state/actions.
- [x] (2026-07-23 02:33Z) Added the authenticator-code state and controls to the shared Compose auth screen used by Android and iOS.
- [x] (2026-07-23 02:34Z) Added focused repository tests for the challenge and confirmation paths.
- [x] (2026-07-23 02:41Z) Compiled Android and iOS, ran 29 focused repository tests, and visually confirmed the iOS login screen in the booted iPhone 16 Pro simulator.

## Surprises & Discoveries

- Observation: The backend intentionally returns HTTP 200 without a token when the account requires an authenticator code.
  Evidence: `mvp-site/src/app/api/auth/login/route.ts` returns `requiresMfa`, an `mfa.challengeId`, expiry, and method; the iOS log then showed the old client throwing `Login response missing token`.

- Observation: The backend already exposes the completion contract needed by mobile.
  Evidence: `mvp-site/src/app/api/auth/mfa/login/confirm/route.ts` accepts `challengeId` and `code` and returns the same token-bearing auth payload as ordinary login.

- Observation: The iOS app could reach the local backend even though the Xcode build phase emitted a non-fatal backend-bootstrap warning.
  Evidence: The launched app's runtime log repeatedly recorded HTTP 200 responses from `http://localhost:3000/api/auth/me`, and `lsof` showed the Node server listening on port 3000 from `/Users/elesesy/StudioProjects/mvp-site`.

## Decision Log

- Decision: Model MFA-required login as a typed repository exception carrying a challenge rather than returning a partially authenticated user.
  Rationale: The existing repository API returns `Result<UserData>` and callers must not treat a challenge as authenticated state. A typed exception preserves the API while giving `AuthComponent` explicit data for the next screen state.
  Date/Author: 2026-07-23 / Codex

- Decision: Put the authenticator prompt in `AuthScreenBase` and state in `AuthComponent`.
  Rationale: Both Android and iOS use this shared authentication surface, so one implementation fixes both platforms and keeps platform behavior consistent.
  Date/Author: 2026-07-23 / Codex

- Decision: Keep the local MFA bypass as a backend launch-time environment flag and still implement full client MFA support.
  Rationale: The bypass unblocks local simulator login now, while the client must remain correct against production and local servers where MFA is enabled.
  Date/Author: 2026-07-23 / Codex

## Outcomes & Retrospective

The misleading missing-token path is fixed across the shared Android/iOS authentication stack. A tokenless MFA challenge now opens a dedicated authenticator-code prompt, confirmation uses the backend's established endpoint, and successful confirmation follows the same token, Room, account, and current-user persistence path as ordinary login. The local backend remains available on port 3000 with the local-only MFA bypass for simulator use. All 29 focused `UserRepositoryAuthTest` cases passed, the Android debug APK assembled successfully, and Xcode built, installed, and launched the app on the iPhone 16 Pro simulator. The ordinary iOS login screen was visually confirmed; exercising a real MFA code remains dependent on user credentials and an active authenticator.

## Context and Orientation

The repository is a Kotlin Multiplatform mobile app. `core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/AuthDtos.kt` defines JSON payloads. `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt` sends login requests, stores the token, persists the returned profile into Room, and publishes current-user state. `composeApp/src/commonMain/kotlin/com/razumly/mvp/userAuth/AuthComponent.kt` converts repository results into observable screen state. `composeApp/src/commonMain/kotlin/com/razumly/mvp/userAuth/AuthScreen.kt` renders the shared Compose login UI on Android and in the iOS app. `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/UserRepositoryAuthTest.kt` verifies repository request and state behavior with a mock HTTP engine.

Multi-factor authentication, abbreviated MFA, is the second login step where a user enters the temporary code from an authenticator application. The first request returns a short-lived challenge identifier, not an access token. The confirmation request exchanges that identifier and the code for the normal authenticated payload.

The backend is the source of truth and lives at `/Users/elesesy/StudioProjects/mvp-site`. Its login confirmation endpoint is `POST /api/auth/mfa/login/confirm` with JSON `{ "challengeId": "...", "code": "..." }`.

## Plan of Work

Keep the existing ordinary login behavior intact. Extend `AuthResponseDto` with nullable MFA response fields and add a serializable confirmation request. In `UserRepository.login`, detect `requiresMfa` before reading `token`, validate the challenge identifier, and return a typed failure that carries the challenge. Add `confirmLoginMfa` to `IUserRepository` and its concrete implementation; it posts the confirmation payload and passes the successful response through the same token, Room, account, session, and analytics completion helper as ordinary email login.

Expose the active challenge from `AuthComponent`. When login yields `LoginMfaRequiredException`, return the screen to an interactive state and retain the challenge. Add an action that sends the entered code through the repository and transitions to success only after a real user and token response. Add a dismissal action that returns to the email/password form.

In `AuthScreenBase`, render an authenticator-code form when a challenge is active. Filter the input to digits, cap it at 16 characters to match backend recovery-code tolerance, submit with the keyboard Done action or Verify button, and provide a Back to sign in control. Hide ordinary email, password, signup, Apple, and Google actions while the challenge is active so a user cannot accidentally start another auth flow.

Add mock-engine tests proving that a challenge does not write a token and that confirmation posts the exact identifier/code, stores the returned token, writes the user to Room, and updates current-user state. Then compile the Android application, build and run the iOS app in the booted simulator, and inspect the rendered auth UI.

## Concrete Steps

Run all commands from `/Users/elesesy/.codex/worktrees/e09f/mvp-app` unless stated otherwise.

After editing, check patch formatting:

    git diff --check

Run the focused shared repository tests and Android compile with JDK 17 and the local Android SDK:

    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home ./gradlew :composeApp:testDebugUnitTest --tests '*UserRepositoryAuthTest*' :composeApp:assembleDebug

Build and run `iosApp/iosApp.xcworkspace`, scheme `iosApp`, against the already booted iOS simulator through XcodeBuildMCP. After launch, inspect the accessibility hierarchy and take a screenshot. The ordinary login form should render without a missing-token alert; an MFA mock or real MFA-enabled server should instead render `Authenticator code` and `Verify code`.

The local backend can be relaunched from `/Users/elesesy/StudioProjects/mvp-site` with:

    AUTH_MFA_DISABLED_LOCAL=true npm run dev:plain

Expected startup evidence includes `ready on http://0.0.0.0:3000`.

## Validation and Acceptance

The repository test `login_with_mfa_challenge_returns_typed_failure_without_storing_token` must fail on the old implementation with `Login response missing token` and pass after the change with a `LoginMfaRequiredException` whose challenge identifier, email, expiry, and method match the backend payload. The test must also observe an empty token store.

The repository test `confirmLoginMfa_posts_challenge_and_completes_login` must observe a request to `/api/auth/mfa/login/confirm`, verify that the body contains the expected challenge identifier and code, and then confirm the token, Room profile, and current-user identifier were saved.

Android acceptance is a successful `:composeApp:assembleDebug`. iOS acceptance is a successful simulator build and launch with the login form visible. With the local bypass server, valid credentials must follow the ordinary token-bearing path. With MFA enabled, valid credentials must show a code prompt rather than `Login response missing token`; a valid authenticator code must complete sign-in.

## Idempotence and Recovery

The code and tests are additive and safe to rerun. Restarting the backend command is safe after terminating only the process group that owns port 3000. Do not delete or reset unrelated worktree changes. If the simulator build uses stale shared code, rebuild the workspace rather than deleting user data or global caches. If an MFA challenge expires, dismiss the prompt and submit email/password again to obtain a new challenge.

## Artifacts and Notes

The original iOS log sequence was:

    POST http://localhost:3000/api/auth/login
    HTTP 200 OK
    Login response missing token

The corrected state sequence is:

    email/password -> LoginMfaRequiredException(challenge) -> authenticator prompt
    challenge/code -> /api/auth/mfa/login/confirm -> token/profile/session -> LoginState.Success

## Interfaces and Dependencies

The final code must expose these shared interfaces:

    data class LoginMfaChallenge(
        val challengeId: String,
        val email: String?,
        val expiresAt: String?,
        val method: String,
    )

    class LoginMfaRequiredException(
        val challenge: LoginMfaChallenge,
        message: String,
    ) : Exception(message)

    suspend fun IUserRepository.confirmLoginMfa(challengeId: String, code: String): Result<UserData>

    val AuthComponent.loginMfaChallenge: StateFlow<LoginMfaChallenge?>
    fun AuthComponent.onConfirmLoginMfa(code: String)
    fun AuthComponent.dismissLoginMfa()

No new external library is required. Kotlin serialization handles the request and response DTOs, Ktor sends the requests, Room remains the local user-profile source of truth, and the existing shared Compose UI renders both mobile platforms.

Revision note (2026-07-23 02:30Z): Created the plan after reproducing the production-contract mismatch and recording the already completed backend, DTO, repository, and component work. UI, tests, and simulator validation remain intentionally explicit.

Revision note (2026-07-23 02:41Z): Marked implementation and validation complete after focused tests, Android assembly, iOS build-and-run, runtime backend checks, and simulator visual confirmation all succeeded.
