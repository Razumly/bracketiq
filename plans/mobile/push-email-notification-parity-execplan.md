# Email + Push Notification Parity (Mobile App)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root and must be maintained in accordance with those requirements.

## Purpose / Big Picture

After this change, the mobile app will stop treating push notifications as local-only stubs and will actually call backend messaging endpoints for topic subscription and message dispatch. Device targeting will also be managed automatically as authentication state changes so backend systems can attempt push delivery whenever they send email. You will be able to verify behavior by running repository tests and by observing network requests from the app to `/api/messaging/topics/...` flows.

## Progress

- [x] (2026-02-12 12:58Z) Audited current app push flow and confirmed `PushNotificationsRepository` is stubbed (no backend calls).
- [x] (2026-02-12 13:00Z) Audited backend source-of-truth in `mvp-site` and confirmed existing messaging route contract (`/api/messaging/topics/...`) plus current email invite flows.
- [x] (2026-02-12 13:12Z) Implemented API-backed push repository methods and messaging DTOs in `composeApp`.
- [x] (2026-02-12 13:16Z) Wired auth lifecycle hooks so device target registration/unregistration is automatic.
- [x] (2026-02-12 13:18Z) Added a targeted API client test for body-bearing no-response POST calls.
- [x] (2026-02-12 13:20Z) Added backend/Firebase rollout notes for true email+push parity.
- [ ] Run validation commands and record outcomes (blocked by local JDK availability in this environment).

## Surprises & Discoveries

- Observation: Existing backend messaging routes are currently persistence/echo style and do not yet perform true FCM/APNs delivery.
  Evidence: `mvp-site/src/app/api/messaging/topics/[topicId]/messages/route.ts` currently returns `{ ok: true, topicId, payload }` without calling push providers.

- Observation: App already includes Firebase + kmp-notifier initialization on Android and iOS, but repository methods were returning `Result.success(Unit)` without network side effects.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/PushNotificationsRepository.kt`.

- Observation: Gradle tests could not be fully executed in this environment because the runtime reports no Java compiler/JDK available.
  Evidence: `No Java compiler found, please ensure you are running Gradle with a JDK` from `./gradlew :composeApp:commonTest`.

## Decision Log

- Decision: Use existing backend route contract (`/api/messaging/topics/...`) for all mobile push API calls instead of inventing new endpoints.
  Rationale: Repository guidance requires alignment with `mvp-site` as contract source of truth.
  Date/Author: 2026-02-12 / Codex

- Decision: Treat “email + push parity” as best-effort in this repo by ensuring the app registers device targeting and can dispatch notification intents, while documenting remaining backend delivery work.
  Rationale: The backend currently sends email but does not yet deliver provider-backed push payloads.
  Date/Author: 2026-02-12 / Codex

- Decision: Reuse `api/messaging/topics/[topicId]/subscriptions` payload passthrough fields (`pushToken`, `pushTarget`) for mobile token sync instead of adding new app-side endpoint paths.
  Rationale: This keeps mobile aligned with existing backend routes while enabling backend-side token persistence enhancements with minimal future client churn.
  Date/Author: 2026-02-12 / Codex

## Outcomes & Retrospective

Mobile-side scaffolding is now substantially complete: notification repository methods are real network calls, device target registration is automated by auth state, and team invite flow attempts a push in addition to backend invite creation/email. A rollout guide was added with concrete Firebase/backend steps for true delivery parity.

Remaining gap is runtime verification in this environment due missing JDK for Gradle execution. Functional backend push delivery work remains in `mvp-site` and is documented in the rollout guide.

## Context and Orientation

The shared mobile app lives under `composeApp/src/commonMain/kotlin/com/razumly/mvp`. Network requests go through `core/network/MvpApiClient.kt`. Authentication state is managed by `core/data/repositories/UserRepository.kt` and navigation/lifecycle coordination is in `core/presentation/RootComponent.kt`. Dependency injection is configured in `di/MVPRepositoryModule.kt` and `di/ComponentModule.kt`.

Push notification logic is centralized in `core/data/repositories/PushNotificationsRepository.kt`, but that file is currently a scaffold. It listens for token changes via `NotifierManager`, stores values in `CurrentUserDataSource`, and stubs all API behavior.

Backend contract reference (outside this repo) is `mvp-site`. Relevant routes are:

- `src/app/api/messaging/topics/[topicId]/subscriptions/route.ts`
- `src/app/api/messaging/topics/[topicId]/messages/route.ts`
- `src/app/api/messaging/topics/[topicId]/route.ts`
- `src/app/api/invites/route.ts` and `src/server/inviteEmails.ts` for email flows

The key limitation today is that backend messaging routes do not yet fan out to FCM/APNs, so this ExecPlan includes rollout notes for that required backend work.

## Plan of Work

First, add explicit messaging request DTOs in `core/network/dto` so push-related repository calls are strongly typed and consistent with backend payload expectations. Add an overload in `MvpApiClient` to support `POST` with body and no typed response payload, since messaging endpoints frequently return route-specific response shapes that the app does not consume.

Next, implement the `PushNotificationsRepository` methods to call backend messaging routes. Topic subscription/unsubscription methods will hit `/subscriptions` endpoints. Send methods will call `/messages` endpoints. Topic creation/deletion methods will call the topic endpoints directly. Device registration will map user sessions to a deterministic user topic and update local cached token/target state.

Then, wire auth lifecycle behavior in `RootComponent` so login/startup registers the device target and logout/removal clears it. Update DI constructors accordingly.

After that, add targeted tests in `commonTest` to verify at least one representative messaging API call (path + auth header + payload) and ensure new no-response API helper behavior is correct.

Finally, add a concise runbook markdown file in this repo describing the remaining backend and Firebase steps needed for production-grade email+push parity.

## Concrete Steps

Run all commands from:

    /home/camka/Projects/MVP/mvp-app

Commands executed during implementation:

    rg -n "email|notification|firebase|fcm|push|device token|token" composeApp iosApp -S
    sed -n '1,260p' composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/PushNotificationsRepository.kt
    sed -n '1,320p' /home/camka/Projects/MVP/mvp-site/src/app/api/messaging/topics/[topicId]/subscriptions/route.ts
    sed -n '1,320p' /home/camka/Projects/MVP/mvp-site/src/server/inviteEmails.ts

Validation attempts:

    ./gradlew :composeApp:commonTest --tests com.razumly.mvp.core.network.MvpApiClientTest
    GRADLE_USER_HOME=.gradle-user-home ./gradlew :composeApp:commonTest --tests com.razumly.mvp.core.network.MvpApiClientTest

Observed blocker:

    No Java compiler found, please ensure you are running Gradle with a JDK

## Validation and Acceptance

Acceptance for this repo:

1. `PushNotificationsRepository` no longer returns stubbed `Result.success(Unit)` for all messaging operations.
2. Network calls for messaging operations use existing backend routes and authenticated requests.
3. Device registration/unregistration is triggered by authenticated state transitions.
4. New/updated tests pass and cover request-shape behavior.
5. A runbook clearly states what backend/Firebase actions are still required to achieve actual push delivery when backend emails are sent.

Validation commands (to execute and record):

    ./gradlew :composeApp:commonTest

Optionally:

    ./gradlew :composeApp:androidUnitTest

## Idempotence and Recovery

All code changes are additive or localized. Re-running tests is safe. If a test fails due unrelated existing issues, record the failure output and scope; do not revert unrelated repository work. If backend route behavior changes, repository methods can be adapted in one place (`PushNotificationsRepository`) without schema migration in this repo.

## Artifacts and Notes

- Added `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/MessagingDtos.kt` for messaging route payloads.
- Added `push-email-rollout-guide.md` with Firebase + backend rollout checklist.
- Test execution artifact: Gradle invocation failed locally with `No Java compiler found`.

## Interfaces and Dependencies

The final implementation must expose these concrete interfaces and calls:

- `MvpApiClient` supports posting a JSON body without requiring a typed response decode.
- `PushNotificationsRepository` methods call:
  - `POST /api/messaging/topics/{topicId}/subscriptions`
  - `DELETE /api/messaging/topics/{topicId}/subscriptions`
  - `POST /api/messaging/topics/{topicId}/messages`
  - `POST /api/messaging/topics/{topicId}`
  - `DELETE /api/messaging/topics/{topicId}`
- `RootComponent` invokes `IPushNotificationsRepository.addDeviceAsTarget()` when user session is active and `removeDeviceAsTarget()` when user session is cleared.

Change note (2026-02-12): Initial ExecPlan authored after contract and codebase audit to guide implementation and preserve decision history.
Change note (2026-02-12): Updated after implementation to reflect completed milestones, test blocker, and final rollout guidance.
