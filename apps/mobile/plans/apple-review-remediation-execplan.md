# Apple Review Remediation For Mobile Auth, Privacy Copy, and Account Deletion

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root of `mvp-app`. The mobile client work happens in `C:/Users/samue/StudioProjects/mvp-app-apple-review` on branch `codex/apple-review-remediation`, and the backend work happens in `//wsl.localhost/Ubuntu/home/camka/Projects/MVP/mvp-site-apple-review` on branch `codex/apple-review-remediation`. The app repo uses `master` as the primary branch root for this work. The site repo uses `main` as the primary branch root for this work.

## Purpose / Big Picture

After this change, the iOS app can pass the code-backed portions of the April 8, 2026 App Review rejection for BracketIQ. A reviewer will see clearer iOS location permission copy, a first-party mobile Sign in with Apple option alongside Google sign-in, and an in-app account deletion action that starts and completes a self-serve deletion flow instead of sending the user to a support email page. The deletion flow must disable future sign-in, remove sensitive account data, preserve records needed for billing, refunds, and event history, and leave historical event participation intact.

The one rejected item that is not code-backed is the App Store Connect age rating metadata. That must be updated manually to set `Parental Controls` and `Age Assurance` to `None` unless the product owner chooses to build those controls later.

## Progress

- [x] (2026-04-07 20:17-07:00) Created isolated worktrees for both repos on `codex/apple-review-remediation` so this work can proceed in parallel with other active agents.
- [x] (2026-04-07 20:17-07:00) Confirmed the branch roots: `mvp-app` must branch from `master`, `mvp-site` must branch from `main`.
- [x] (2026-04-07 20:17-07:00) Verified the current state on the branch roots: iOS uses Google login only, the profile home screen has no deletion action, `iosApp/iosApp/Info.plist` contains vague location purpose strings, and `mvp-site` only exposes a public `/delete-data` instruction page rather than a self-serve deletion API.
- [x] (2026-04-07 23:39-07:00) Updated `iosApp/iosApp/Info.plist` so the app only declares the location permission it appears to use in practice and the visible purpose string now explains map centering, nearby events, and venue discovery.
- [x] (2026-04-07 23:39-07:00) Added Sign in with Apple wiring for the easy/code-backed portion of the review: shared mobile DTO and repository support, iOS auth entry points and button surface, backend `api/auth/apple/mobile`, and iOS entitlements.
- [x] (2026-04-07 23:39-07:00) Added backend Apple auth route tests and a shared repository auth test for the Apple payload path.
- [x] (2026-04-07 23:39-07:00) Validated the backend Apple route tests and Android main-source compile in the remediation worktree.
- [ ] Account deletion flow remains pending product decisions on blocking conditions and retained/scrubbed data before implementation begins.
- [ ] Manual App Store Connect metadata update remains pending: set `Parental Controls` and `Age Assurance` to `None` unless those features are intentionally added later.

## Surprises & Discoveries

- Observation: `mvp-app` and `mvp-site` do not share the same primary branch name. The mobile app is rooted on `master`, but the site repo is rooted on `main`.
  Evidence: `git branch -a -vv` in `mvp-app-apple-review` shows `master` tracking `origin/master`; `git branch -a -vv` in `mvp-site-apple-review` shows `main` tracking `origin/main`.
- Observation: the backend already publishes a `/delete-data` page that describes retained records, including keeping first name, last name, username, signed documents, Stripe records, and finished event participation, but that page is manual-request copy only and does not satisfy App Review.
  Evidence: `//wsl.localhost/Ubuntu/home/camka/Projects/MVP/mvp-site-apple-review/src/app/delete-data/page.tsx`.
- Observation: the iOS worktree under the WSL-backed site path required a Git safe-directory exception before Git commands would run from Windows.
  Evidence: Git returned `fatal: detected dubious ownership in repository` until the new worktree path was added to `safe.directory`.
- Observation: the Android unit-test task in this checkout is currently blocked by unrelated pre-existing test-source compile errors, so repository-level validation had to stop at backend Jest plus Android main-source compilation.
  Evidence: `:composeApp:testDebugUnitTest --tests "*UserRepositoryAuthTest*"` fails in `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventDetailsScheduleLockingTest.kt` with unresolved `EventType`, while `:composeApp:compileDebugKotlinAndroid` succeeds.

## Decision Log

- Decision: treat Sign in with Apple as required work instead of trying to argue that the existing email/password flow is equivalent.
  Rationale: App Review already rejected the current combination of email/password plus Google sign-in, so arguing equivalence is lower confidence than shipping Apple’s explicitly accepted option.
  Date/Author: 2026-04-07 / Codex
- Decision: keep deletion as a “sensitive-data removal plus account disablement” flow rather than deleting all user-linked records.
  Rationale: the product owner explicitly requires retention of names, event history, payments, refunds, signed documents, and other matters of record so users cannot avoid billing or refund obligations by deleting their account.
  Date/Author: 2026-04-07 / Codex
- Decision: implement the client and server work in paired worktrees on the primary branches instead of continuing on the active `codex/stripe-tax-billing` branches.
  Rationale: the user asked for the fixes to be made from the primary lines and also requested parallel-safe worktrees.
  Date/Author: 2026-04-07 / Codex
- Decision: pause the account deletion implementation after the easy fixes and return with decision questions instead of guessing the retention and refund-blocking policy.
  Rationale: the user explicitly asked to fix the easy items first and to surface anything needing decisions afterward; deletion logic is where the unresolved business rules sit.
  Date/Author: 2026-04-07 / Codex

## Outcomes & Retrospective

The easy/code-backed review fixes are now in place. The iOS permission sheet copy no longer advertises background tracking the app does not appear to request, and the app/backend now have a concrete Sign in with Apple path built alongside the existing Google mobile auth flow. Backend route tests pass, and Android main-source compilation passes in the remediation worktree, which gives confidence in the shared DTO and repository changes.

The remaining rejected work is policy-heavy rather than technically ambiguous. Account deletion still needs product-owner decisions about exactly when deletion is blocked, exactly what is scrubbed versus retained, and whether Apple token revocation is part of the first implementation. The App Store Connect age-rating selection also still requires a manual metadata change outside the codebase.

## Context and Orientation

The mobile login screen lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/userAuth/AuthScreen.kt`. Platform-specific login entry points live in `composeApp/src/androidMain/kotlin/com/razumly/mvp/userAuth/AuthComponent.android.kt`, `composeApp/src/iosMain/kotlin/com/razumly/mvp/userAuth/AuthComponent.ios.kt`, and `composeApp/src/iosMain/kotlin/com/razumly/mvp/core/data/Outh2.kt`. The shared mobile repository that turns login tokens into authenticated app state lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt`, and the request/response data contracts live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/AuthDtos.kt`.

The profile home surface where a self-serve deletion action belongs lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileHomeScreen.kt`. The stateful logic behind that screen lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileComponent.kt`. The app already uses Compose Material `AlertDialog` in multiple screens, so a destructive confirmation dialog can be implemented in the shared UI instead of adding a new platform-only modal system.

The iOS permission strings and entitlements live under `iosApp/iosApp`. `iosApp/iosApp/Info.plist` contains the location usage copy rejected by Apple. `iosApp/iosApp/iosApp.entitlements` and `iosApp/iosApp/iosAppRelease.entitlements` currently declare push and associated domains only; Sign in with Apple capability must be added there if required by Xcode’s signing flow.

The backend auth routes live under `//wsl.localhost/Ubuntu/home/camka/Projects/MVP/mvp-site-apple-review/src/app/api/auth`. Mobile Google sign-in already exists at `src/app/api/auth/google/mobile/route.ts`. Session cookie and JWT helpers live in `src/lib/authServer.ts`, and authenticated route checks live in `src/lib/permissions.ts`. Database models for account records live in `prisma/schema.prisma`, with `UserData` storing public profile and relationship fields, `SensitiveUserData` storing email, and `AuthUser` storing the authentication record and password hash.

For deletion, the backend source of truth already documents the intended retention rules in `src/app/delete-data/page.tsx`: remove authentication access and sensitive data, keep first name, last name, username, billing and refund records, signed documents, Stripe records, and finished event participation, and do not remove pending refund obligations. This plan implements that documented policy through a real authenticated API and a mobile UI entry point.

## Plan of Work

First, update the mobile shell so the rejected iOS copy is fixed and the user-facing auth and profile surfaces are ready. In `iosApp/iosApp/Info.plist`, replace the location strings with copy that explicitly says BracketIQ uses location to center maps, show nearby events, and help users find event venues. In `composeApp/src/commonMain/kotlin/com/razumly/mvp/userAuth/AuthScreen.kt`, add a Sign in with Apple button alongside the existing Google button without disturbing the existing email signup flow. In the iOS-specific auth files, add a second native login entry point that requests an Apple ID credential, extracts the identity token, and forwards it to the shared repository. In `AuthDtos.kt` and `UserRepository.kt`, add an Apple mobile login request model and repository method that call a new backend endpoint.

Second, add the self-serve deletion entry point in the profile surface. Extend `ProfileComponent` and `DefaultProfileComponent` with deletion state and a `deleteAccount()` action. Add a destructive action to `ProfileHomeScreen.kt` and a Compose confirmation dialog that explains which data is deleted versus retained. On success, clear local auth state and navigate back to login just as logout does. On failure, surface the server’s error to the user.

Third, implement the backend auth and deletion APIs. Add a mobile Apple auth route under `src/app/api/auth/apple/mobile/route.ts` that validates Apple identity tokens using Apple’s public keys, requires a stable Apple subject and verified email, and then follows the same transaction pattern already used by the Google mobile route to create or update `AuthUser`, `SensitiveUserData`, and `UserData`. Add an authenticated deletion route under `src/app/api/auth/delete/route.ts` or a similarly clear path under `api/profile`. That route must run inside one Prisma transaction. It must verify the current session, load the user’s related records, block deletion only when the documented refund rule requires it, delete or clear sensitive records and sessions, clean up social graph references and removable user-owned records, preserve historical record fields, and return a response the mobile client can use for confirmation.

Fourth, align the documentation and tests. Update the `/delete-data` page copy so it describes the new self-serve in-app initiation rather than the current support-email process. Add backend tests for Apple auth token validation and deletion behavior. Add mobile repository tests for the new deletion call and, where feasible, auth request serialization tests for Apple login. Finish by running the relevant mobile and backend test commands and recording the outcomes in this document.

## Concrete Steps

From `C:/Users/samue/StudioProjects/mvp-app-apple-review`, edit the mobile files with `apply_patch` and run:

    .\gradlew :composeApp:testDebugUnitTest

If a narrower test target is needed while iterating, run:

    .\gradlew :composeApp:testDebugUnitTest --tests "*UserRepositoryAuthTest*"

From `//wsl.localhost/Ubuntu/home/camka/Projects/MVP/mvp-site-apple-review`, run:

    npm test -- --runInBand

If that is too broad during iteration, run the route-focused Jest files directly with:

    npm test -- --runInBand src/app/api/auth/google/mobile/__tests__/googleMobileRoute.test.ts

The exact backend test files for Apple login and deletion will be added during implementation and should be run explicitly once they exist.

## Validation and Acceptance

Acceptance for the mobile client is behavioral. On iOS, the login screen must show both Google and Apple sign-in options. On the first location request, the permission sheet text must clearly say BracketIQ uses location to show the user on the map, center nearby events, or help them reach a venue. In the profile area, a reviewer must be able to open a delete-account action, confirm it, and end on the login screen with the account no longer authenticated.

Acceptance for the backend is also behavioral. `POST /api/auth/apple/mobile` must accept a valid Apple mobile identity token, create or reuse the correct `AuthUser` and `UserData` rows, and return the same session envelope shape as the existing login routes. The deletion route must remove sign-in access and sensitive email-backed records, preserve historical event and billing records, and reject or defer completion only under the documented refund rule. Tests must prove these behaviors with explicit before/after assertions on Prisma rows.

The App Store Connect age rating rejection is accepted as an external follow-up item. Completion of this ExecPlan is not blocked by that metadata change, but the final summary must call it out clearly.

## Idempotence and Recovery

The paired worktrees make this implementation safe to repeat without disturbing the active `codex/stripe-tax-billing` branches. Re-running the mobile Gradle tests and backend Jest tests is safe. If the backend Prisma changes require a migration, the migration must be additive and safe to re-apply through the normal Prisma workflow. If the Apple auth route or deletion route fails mid-implementation, the worktree can be reset by removing only the dedicated remediation worktrees rather than touching the primary working directories.

For account deletion logic specifically, every database mutation must occur inside one Prisma transaction so the system cannot land in a half-deleted state. If any deletion precondition fails, the route must return a clear error and leave the account untouched.

## Artifacts and Notes

Important evidence gathered before implementation:

    mvp-app primary branch root: master @ 69c41b4
    mvp-site primary branch root: main @ adee0d8

    Existing iOS location strings in iosApp/iosApp/Info.plist:
    - "This app needs access to location when in the background to track your position."
    - "This app needs access to location when in the background for continuous location updates."
    - "This app needs access to location when open to show your current location on the map."

    Existing delete-data page still instructs:
    - "Email support@bracket-iq.com from the email address associated with your BracketIQ account."

## Interfaces and Dependencies

The mobile repository must end with a new Apple login request type in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/AuthDtos.kt` and a matching repository call in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt`. The backend must expose a stable JSON route that returns the same envelope shape already used by `api/auth/login` and `api/auth/google/mobile`:

    {
      "user": { "id": "...", "email": "...", "name": "..." },
      "session": { "userId": "...", "isAdmin": false },
      "token": "...",
      "profile": { ...public user fields... }
    }

The deletion route must require an authenticated session from `src/lib/permissions.ts` and must use a single Prisma transaction for all row updates. The mobile deletion call should return a simple success envelope such as:

    { "ok": true }

or a similarly minimal response already consistent with the repo’s `OkResponseDto`.

Revision note: updated after completing the easy fixes so the plan now reflects the shipped location-copy change, the new Sign in with Apple implementation, the verification results, and the deliberate pause before the policy-heavy deletion work.
