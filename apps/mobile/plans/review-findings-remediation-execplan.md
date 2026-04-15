# Review Findings Remediation Across `mvp-site` and `mvp-app`

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `/Users/elesesy/StudioProjects/mvp-app/PLANS.md`. Keep it current as implementation and verification move forward.

## Purpose / Big Picture

After this change, refund request listing will enforce the same access boundaries as the rest of the billing surface, batched invite creation will either fully succeed or fully fail, playoff team counts will stay unset until a host explicitly enters them, and the mobile refund inbox will stop hydrating related users and events one record at a time. The result should be observable through focused route tests in `mvp-site` and repository/unit tests in `mvp-app`.

## Progress

- [x] (2026-04-15 17:13Z) Confirmed the concrete remediation targets from the review: refund request authorization, invite batch atomicity, playoff count default removal, and refund hydration batching.
- [x] (2026-04-15 17:28Z) Patched `mvp-site` refund list authorization and extended route tests for forbidden `hostId` and `organizationId` queries.
- [x] (2026-04-15 17:37Z) Refactored `mvp-site` invite batch creation to run inside one transaction and added a regression test proving rollback on a later invalid invite.
- [x] (2026-04-15 18:03Z) Removed implicit playoff team count defaults across `mvp-app` event edit DTO/UI paths and added regression coverage for explicit-required behavior.
- [x] (2026-04-15 18:03Z) Added server-side playoff count validation in `mvp-site` create/update event flows so invalid payloads are rejected even if a client drifts.
- [x] (2026-04-15 18:10Z) Batched user and event hydration in `mvp-app` refund loading and covered it in repository tests.
- [x] (2026-04-15 18:25Z) Re-ran focused `mvp-site` Jest suites and `mvp-app` unit tests; app verification required disabling Kotlin incremental compilation to avoid a generated Room/KSP source race in the Android debug compile.

## Surprises & Discoveries

- Observation: `mvp-site` currently fails broad static validation before any review-driven edits.
  Evidence: `npm run lint` fails in `src/app/events/[id]/schedule/__tests__/page.test.tsx`; `npx tsc --noEmit` fails in `src/lib/userService.ts`.
- Observation: `mvp-app` debug unit tests currently fail due to the backend seed helper requiring a reachable local database.
  Evidence: `LeaguePlayoffMobileApiIntegrationTest` fails because `npm run seed:dev` in `mvp-site` returns `ECONNREFUSED` from `prisma/seed.e2e.ts`.
- Observation: narrowed Android debug unit-test runs can fail before test execution because the Kotlin compiler intermittently cannot see freshly generated Room/KSP DAO sources.
  Evidence: repeated `:composeApp:compileDebugKotlinAndroid` failures reported `FileNotFoundException` for `composeApp/build/generated/ksp/android/androidDebug/kotlin/com/razumly/mvp/core/data/dataTypes/daos/ChatGroupDao_Impl.kt`, even though the file existed on disk immediately afterward.

## Decision Log

- Decision: Keep the remediation scope aligned to the reviewed findings rather than expanding into new invite-surface permission work discovered during refactor.
  Rationale: The user asked to address the reported findings set. Tight scope keeps the change auditable and testable without turning this into a second review pass.
  Date/Author: 2026-04-15 / Codex

- Decision: Treat playoff count remediation as a contract change, not a UI-only validation tweak.
  Rationale: The reviewed issue exists because both UI state and backend normalization silently materialize values. Fixing only one side would leave drift in place.
  Date/Author: 2026-04-15 / Codex

- Decision: Keep the app verification command narrowed and run it with `-Pkotlin.incremental=false` once the default debug compile proved flaky.
  Rationale: The failure mode was in the Android debug compiler’s handling of generated Room/KSP sources, not in the modified tests or business logic. Disabling incremental compilation let the same narrowed verification pass without changing product code.
  Date/Author: 2026-04-15 / Codex

## Outcomes & Retrospective

Implemented the four reviewed fixes. `mvp-site` now rejects unauthorized refund list filters, creates invite batches atomically, preserves null division playoff counts on read instead of falling back to event defaults, and validates playoff counts on event create/update before division sync. `mvp-app` now keeps playoff counts null until a host explicitly enters them, sends event-level playoff counts for split leagues without backfilling division counts, and batches refund-related user/event hydration through existing repository APIs.

Focused verification passed in both repos:

- `mvp-site`: `src/app/api/refund-requests/__tests__/route.test.ts`, `src/app/api/invites/__tests__/inviteRoutes.test.ts`, `src/server/repositories/__tests__/events.upsert.test.ts`, `src/app/api/events/__tests__/eventSaveRoute.test.ts`, `src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts`
- `mvp-app`: `./gradlew --no-daemon -Pkotlin.incremental=false :composeApp:testDebugUnitTest --tests "*EventDtosTest" --tests "*EventDetailsDivisionEditorHelpersTest" --tests "*BillingRepositoryHttpTest"`

The pre-existing broad-suite failures recorded above remain outside this remediation scope.

## Context and Orientation

`mvp-site` is the backend and contract source of truth for this work. The refund list route lives at `src/app/api/refund-requests/route.ts`, and its tests live at `src/app/api/refund-requests/__tests__/route.test.ts`. The invite batch creation route lives at `src/app/api/invites/route.ts`, with tests in `src/app/api/invites/__tests__/inviteRoutes.test.ts`. Event create/update payload handling is split between `src/app/api/events/route.ts`, `src/app/api/events/[eventId]/route.ts`, and the shared repository logic in `src/server/repositories/events.ts`.

`mvp-app` consumes those contracts through shared Kotlin code. Refund inbox hydration is in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`. Event edit state and validation live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`. DTO conversion between shared `Event` objects and HTTP payloads lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`, with tests in `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/network/dto/EventDtosTest.kt`.

The key invariant for playoffs is simple: when playoffs are enabled, the count of playoff teams is not allowed to appear by fallback. Hosts must explicitly set it, and the backend must reject payloads that try to rely on defaults.

## Plan of Work

First, harden refund list access in `mvp-site/src/app/api/refund-requests/route.ts`. Add permission checks for `hostId` and `organizationId`, using the existing access-control helpers where possible, and update the route tests to cover both allowed and forbidden queries.

Next, refactor `mvp-site/src/app/api/invites/route.ts` so the route stops returning from the middle of a partially written batch. Move per-invite processing behind one transaction, convert validation failures into structured exceptions that abort the transaction, and keep email delivery after commit. Add a regression test that sends one valid invite followed by one invalid invite and proves that no invite is persisted.

Then, change playoff count handling in both repositories. In `mvp-site`, reject create/update event payloads that enable playoffs without explicit counts. In `mvp-app`, stop materializing `2` or `maxParticipants` as hidden playoff values, preserve `null` until the host enters a count, and stop using event-level defaults to silently populate division details in multi-division payloads. Update DTO and helper tests to prove the new null-preserving behavior.

Finally, change `BillingRepository.getRefundsWithRelations()` so it gathers unique user IDs and event IDs before hydration and uses the existing batch repository APIs instead of one call per refund. Add or extend repository tests so this behavior is locked in.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site`, run:

    npm run test -- --runInBand src/app/api/refund-requests/__tests__/route.test.ts src/app/api/invites/__tests__/inviteRoutes.test.ts

From `/Users/elesesy/StudioProjects/mvp-app`, run:

    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.network.dto.EventDtosTest"
    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.eventDetail.EventDetailsDivisionEditorHelpersTest"
    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest"

If the focused app tests pass, optionally rerun the broader suite:

    ./gradlew :composeApp:testDebugUnitTest

Expected outcome: the focused suites pass. If the broad suite still fails in `LeaguePlayoffMobileApiIntegrationTest`, that is an existing environment dependency on the local backend seed and should be recorded, not treated as a regression from this change.

## Validation and Acceptance

Acceptance for refund list access is behavioral: a non-admin user querying `GET /api/refund-requests?hostId=someone-else` or `?organizationId=org_they_do_not_manage` receives HTTP 403, while their own `hostId` query still succeeds. Acceptance for invites is behavioral: a request with one valid invite and one invalid later invite returns an error and leaves no created invites behind. Acceptance for playoffs is behavioral: enabling playoffs without entering counts keeps those fields empty in the app state and produces a backend 400 if such a payload reaches the server. Acceptance for refund hydration is behavioral: the repository requests related users and events by batched ID lists instead of one request per refund.

## Idempotence and Recovery

These edits are safe to rerun because all verification is test-based. The invite refactor must keep email sending outside the transaction so retries do not repeat partially committed database work. If a focused test fails, fix the underlying behavior and rerun only the affected suite before moving back to the combined verification command.

## Artifacts and Notes

Before remediation, the repo already showed unrelated validation failures:

    /Users/elesesy/StudioProjects/mvp-site/src/app/events/[id]/schedule/__tests__/page.test.tsx:84
      Error: Cannot reassign variables declared outside of the component/hook

    /Users/elesesy/StudioProjects/mvp-site/src/lib/userService.ts:217
      TS2339: Property 'blocked' does not exist on type ...

And the broad mobile test suite currently depends on a local backend seed:

    LeaguePlayoffMobileApiIntegrationTest
      Targeted backend seed failed ... prisma/seed.e2e.ts ... ECONNREFUSED

## Interfaces and Dependencies

Use the existing permission helpers in `mvp-site/src/server/accessControl.ts`, especially `canManageOrganization` and `canManageEvent`. Keep HTTP error responses as `NextResponse.json(...)` objects with explicit status codes, matching the route style already used in the repo. In the app, preserve existing repository interfaces: `BillingRepository` should still call `IUserRepository.getUsers(...)` and `IEventRepository.getEventsByIds(...)` rather than introducing new service abstractions.

Revision note: created this ExecPlan to govern the cross-repo remediation pass after the findings review. It records the pre-existing validation failures so they are not mistaken for regressions from the implementation work.
