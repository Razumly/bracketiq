# Parent-Targeted Event Withdrawal and Refund Routing (Web + Mobile)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root (`PLANS.md`) and coordinates with backend/source-of-truth changes in `mvp-site`.

## Purpose / Big Picture

Parents and guardians need to withdraw a specific child from an event across all relevant participation states: participant, waitlist, and free-agent. After this change, both web and mobile flows will let a parent choose exactly which profile (self vs linked child) to remove and/or request a refund for, preventing accidental refunds or withdrawals for the wrong person when both are registered in the same event.

## Progress

- [x] (2026-02-20 09:48Z) Audited existing mobile join/leave/refund paths and identified missing target-user support.
- [x] (2026-02-20 09:48Z) Audited `mvp-site` API routes for participants/waitlist/free-agents/refund and confirmed parent permission gaps for participant removal + refund attribution.
- [x] (2026-02-20 17:54Z) Implemented backend API support for parent-managed participant removal and target-user refund attribution/withdrawal in `mvp-site`.
- [x] (2026-02-20 17:54Z) Updated web services and discover/refund UI to select withdrawal/refund target user (self or child).
- [x] (2026-02-20 17:54Z) Updated mobile shared DTO/repository/component/UI flows to select withdrawal/refund target user (self or child).
- [x] (2026-02-20 17:54Z) Ran focused backend/web/mobile tests and recorded results.

## Surprises & Discoveries

- Observation: Waitlist and free-agent APIs already allow parent-managed linked child operations, but participant DELETE currently blocks non-self userId.
  Evidence: `mvp-site/src/app/api/events/[eventId]/waitlist/route.ts`, `mvp-site/src/app/api/events/[eventId]/free-agents/route.ts`, `mvp-site/src/app/api/events/[eventId]/participants/route.ts`.
- Observation: Refund requests are always created for the authenticated user, not an explicit target user.
  Evidence: `mvp-site/src/app/api/billing/refund/route.ts` sets `userId: session.userId`.
- Observation: Mobile leave path uses participants DELETE even when user is waitlisted/free-agent, so removing from all user-linked lists in participants DELETE avoids state drift.
  Evidence: `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` leave flow.
- Observation: Updating repository method signatures required aligning test fake repositories in `commonTest`, otherwise Android unit-test compile fails.
  Evidence: `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/BillingRepositoryHttpTest.kt`, `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/CreateEventTestFixtures.kt`.

## Decision Log

- Decision: Implement target-user support as additive fields (`userId`) in existing request bodies instead of introducing new endpoints.
  Rationale: Keeps web/mobile parity with minimal API surface changes and preserves existing clients.
  Date/Author: 2026-02-20 / Codex.
- Decision: On refund request, also withdraw the target user from participant/waitlist/free-agent arrays in one backend transaction.
  Rationale: Aligns behavior with the user’s “withdraw child” requirement and avoids stale participation after refund request.
  Date/Author: 2026-02-20 / Codex.

## Outcomes & Retrospective

Implemented end-to-end target-user withdrawal/refund routing across backend, web, and mobile:

- Backend (`mvp-site`) now supports parent-managed participant removal and target-user refunds with atomic withdrawal + refund request creation.
- Web discover/refund flow now lets users pick a specific withdraw target (self vs linked child) and routes actions by membership state (participant/waitlist/free-agent).
- Mobile `EventDetail` flow now surfaces withdraw targets and passes explicit target user IDs for leave/refund operations.

Validation completed:

- `mvp-site`: `npm test -- src/lib/__tests__/paymentService.test.ts src/app/api/billing/__tests__/refundRoute.test.ts src/app/api/events/__tests__/participantsRoute.test.ts` (pass).
- `mvp-site`: `npx eslint ...` on touched backend/web files (no errors/warnings after dependency fixes).
- `mvp-app`: `./gradlew :composeApp:compileDebugKotlinAndroid` (pass).
- `mvp-app`: `./gradlew :composeApp:testDebugUnitTest` (pass after updating test fixtures to new repository signatures).

## Context and Orientation

Mobile code lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/`. Event leave/refund behavior is in `eventDetail/EventDetailComponent.kt`, `eventDetail/EventDetailScreen.kt`, `core/data/repositories/EventRepository.kt`, `core/data/repositories/BillingRepository.kt`, and request DTOs in `core/network/dto/EventDtos.kt` plus `core/network/dto/BillingDtos.kt`.

Backend/web source-of-truth lives in `/home/camka/Projects/MVP/mvp-site`. API handlers are under `src/app/api/events/[eventId]/...` and `src/app/api/billing/refund/route.ts`. Web discover UI is `src/app/discover/components/EventDetailSheet.tsx`, shared event actions in `src/lib/paymentService.ts` and `src/lib/eventService.ts`, and refund UI in `src/components/ui/RefundSection.tsx`.

## Plan of Work

First, update backend routes in `mvp-site` to support parent-managed participant removal and target-user refund requests. Participant removal will accept `userId` for linked children, and refund requests will accept target `userId`, validate permissions, remove that target from participant/waitlist/free-agent lists, and create refund requests against that target.

Second, update web service methods and event UI so leave/refund actions can be targeted. The UI will present target options (self and linked children currently registered/waitlisted/free-agent), route free-agent/waitlist removal to those routes, route participant removal via leave, and route paid-event refund requests with target user ID.

Third, update KMP mobile DTOs/repositories and event detail UI/component with a parallel target-selection flow for leave/refund, including the case where parent is not registered but linked child is.

## Concrete Steps

From `/home/camka/Projects/MVP/mvp-site`:

- Edit API routes and tests:
  - `src/app/api/events/[eventId]/participants/route.ts`
  - `src/app/api/billing/refund/route.ts`
  - `src/app/api/events/__tests__/participantsRoute.test.ts`
  - add billing refund route tests under `src/app/api/billing/__tests__/`.
- Edit web services/UI:
  - `src/lib/paymentService.ts`
  - `src/lib/eventService.ts`
  - `src/components/ui/RefundSection.tsx`
  - `src/app/discover/components/EventDetailSheet.tsx`
  - `src/lib/__tests__/paymentService.test.ts`.

From `/mnt/c/Users/samue/StudioProjects/mvp-app`:

- Edit DTOs/repositories:
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/BillingDtos.kt`
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`
- Edit event detail component/screen:
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`.

## Validation and Acceptance

Behavioral acceptance:

1. Parent with linked child on free-agent list can choose child and remove child without removing self.
2. Parent with linked child on waitlist can choose child and remove child without removing self.
3. Parent with linked child as participant in paid event can choose child and request refund for child; created refund request `userId` is child and event no longer lists child in participant/waitlist/free-agent arrays.
4. Parent and child both registered in same event can independently withdraw/refund either profile via explicit selection.

Verification commands:

- In `mvp-site`: run targeted Jest suites for participants/waitlist/free-agents/refund/payment-service.
- In `mvp-app`: run focused unit tests/build task for changed modules.

## Idempotence and Recovery

All changes are additive and safe to rerun. If a test fails due to unrelated local changes, re-run targeted suites only and document failures. No destructive migration is required.

## Artifacts and Notes

Implementation artifacts (key diff snippets and test outputs) will be added after coding.

## Interfaces and Dependencies

Expected interface updates:

- Backend refund request body accepts optional `userId` target while preserving existing payload shape.
- Web payment service methods accept optional target user id for leave/refund flows.
- Mobile `EventParticipantsRequestDto` and `BillingRefundRequestDto` carry optional target user id, threaded through repositories and event detail component APIs.

Plan update note: Created initial execution plan to coordinate cross-repo backend/web/mobile implementation for target-user withdrawal and refund handling.
