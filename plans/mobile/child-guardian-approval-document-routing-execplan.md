# Expand child join requests, guardian approvals, and document routing across backend/web/app

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

`PLANS.md` exists at the repository root and this plan must be maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, minors can request event participation, guardians can approve or decline those requests from child management, and child/guardian document tasks are surfaced even when a child is missing an email address. The system will no longer hard-fail child registration simply because child email is missing; instead it will persist pending consent state and guide guardians to resolve email gaps. The behavior is observable in both web (`mvp-site`) and mobile (`mvp-app`): child join requests appear as pending guardian approvals, guardian actions update registration state, and profile documents show child-context status and next actions.

## Progress

- [x] (2026-02-17 19:22Z) Audited current backend/web/app behavior and identified blocking points (minor self-registration 403, child email hard-stop, missing guardian-approval API, missing child signer cards in profile documents).
- [x] (2026-02-17 20:06Z) Implemented backend registration + family approval flows (minor self join requests, parent approve/decline endpoints, parent-signing permission for child signature recording).
- [x] (2026-02-17 20:12Z) Implemented backend consent/document status handling (child email no longer hard-fails registration, participant/free-agent warnings, child signer contexts in profile documents).
- [x] (2026-02-17 20:22Z) Updated web `mvp-site` services and profile/event UI for guardian approvals and child-email-required document states.
- [x] (2026-02-17 20:31Z) Updated mobile `mvp-app` repositories/components/screens for guardian approval UI/actions and non-blocking child registration selection.
- [x] (2026-02-17 20:42Z) Ran focused backend + mobile tests and recorded results.

## Surprises & Discoveries

- Observation: `POST /api/events/[eventId]/registrations/self` currently rejects all minors with HTTP 403, so there is no path for child-initiated “request to join”.
  Evidence: `mvp-site/src/app/api/events/[eventId]/registrations/self/route.ts` returns `'Only adults can register themselves. A parent must register you.'` when age < 18.
- Observation: Child registration currently hard-requires child email and returns HTTP 400.
  Evidence: `mvp-site/src/app/api/events/[eventId]/registrations/child/route.ts` rejects when `sensitiveUserData.email` is empty.
- Observation: Team participant add route blocks on pre-signed templates instead of creating pending consent state for team members.
  Evidence: `mvp-site/src/app/api/events/[eventId]/participants/route.ts` returns `'All team members must sign required documents before team registration.'`.
- Observation: Profile document generation does not emit unsigned cards for `requiredSignerType = CHILD`.
  Evidence: `mvp-site/src/app/api/profile/documents/route.ts` only pushes unsigned signer contexts for participant and parent_guardian paths.
- Observation: Mobile event join still uses `/participants` flow for self join, so minor request behavior had to be enforced server-side there (not only in `/registrations/self`).
  Evidence: `mvp-app` `EventRepository.addCurrentUserToEvent` posts to `api/events/{id}/participants`.

## Decision Log

- Decision: Keep BoldSign checkbox/clickwrap logic out of scope.
  Rationale: User explicitly stated that checkbox flow is already implemented and does not need work in this pass.
  Date/Author: 2026-02-17 / Codex.
- Decision: Use existing `EventRegistrations.status = PENDINGCONSENT` plus richer `consentStatus` values for guardian approval and child-email-required states instead of introducing a new Prisma enum value now.
  Rationale: This delivers behavior without enum migration risk and keeps compatibility with existing registration status handling.
  Date/Author: 2026-02-17 / Codex.
- Decision: Add explicit family join-request APIs for guardian approval/decline rather than overloading unrelated endpoints.
  Rationale: A dedicated endpoint keeps ownership and authorization checks clear and simplifies both web/app integration.
  Date/Author: 2026-02-17 / Codex.
- Decision: Add minor-self request handling in `/api/events/[eventId]/participants` in addition to `/registrations/self`.
  Rationale: Mobile currently uses `/participants` for self-join; this ensures child request behavior is consistent across web and app without requiring a full join-flow refactor.
  Date/Author: 2026-02-17 / Codex.

## Outcomes & Retrospective

Implemented in one pass across backend/web/mobile:

- Backend:
  - Minor self join now creates pending guardian approval requests.
  - Parent approval endpoints were added (`GET/PATCH /api/family/join-requests`).
  - Child registration no longer hard-fails for missing child email; it persists `child_email_required`.
  - Participants route no longer hard-blocks on pre-signed templates and now emits under-13 missing-email warnings.
  - Profile documents now include child signer-context cards and status notes for missing child email.
  - Parent can record child signature rows when linked, enabling same-session guardian+child signing flows.
- Web:
  - Event detail supports minor “request to join” and non-blocking child registration when email is missing.
  - Profile children section includes pending join approvals (approve/decline).
  - Profile documents surface consent status/status notes and disable signing actions that require missing child email.
- Mobile:
  - Profile children includes pending join approvals and actions.
  - Event child selection no longer hard-blocks when child email is missing.
  - Profile document cards now expose consent status/status notes and block sign actions when child email is required.

Validation completed:

- Backend Jest targeted suite:
  - `childRegistrationRoute.test.ts`
  - `selfRegistrationRoute.test.ts`
  - `participantsRoute.test.ts`
  - `eventSignRoute.test.ts`
  - `joinRequestsRoute.test.ts`
  - Result: 5 suites passed, 20 tests passed.
- Mobile Gradle targeted unit tests:
  - `:composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest" --tests "com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest"`
  - Result: BUILD SUCCESSFUL.

## Context and Orientation

Work spans two repositories:

- Backend/web source of truth: `/home/camka/Projects/MVP/mvp-site`.
- Mobile client: `/mnt/c/Users/samue/StudioProjects/mvp-app`.

Backend routes governing this behavior live under `mvp-site/src/app/api/events/*`, `mvp-site/src/app/api/family/*`, `mvp-site/src/app/api/profile/documents`, and `mvp-site/src/app/api/documents/record-signature`. Web UI integrations live in `mvp-site/src/app/discover/components/EventDetailSheet.tsx`, `mvp-site/src/app/profile/page.tsx`, and service wrappers in `mvp-site/src/lib/*Service.ts`.

Mobile integrations live in shared Kotlin code: event joining (`composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/*`), profile children/documents (`composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/*`), and API repositories (`composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/*`).

A “guardian approval request” in this plan means a persisted event registration row that was initiated by a child (or is awaiting guardian action) and is visible to linked parents for approve/decline decisions.

## Plan of Work

First, backend routes will be updated so child-initiated self-registration creates a pending guardian-approval registration instead of returning 403. A new family join-request API surface will list pending requests for a guardian and allow approve/decline actions that transition registration status and consent status.

Second, backend consent propagation will be updated so child registration no longer hard-fails when child email is missing. Consent state will persist (`child_email_required`) and profile documents will expose actionable status for guardians and child signer contexts. Team/free-agent additions will create or maintain pending registration/document state instead of hard blocking on pre-signed templates.

Third, web `mvp-site` services and profile/discover UI will consume the new APIs and states: children can request to join events, guardians can approve in the profile child-management area, and document cards communicate missing child email/action requirements.

Fourth, mobile `mvp-app` repositories and screens will mirror the same API behavior: remove child-email hard block in event join flow, add guardian approval actions in profile children, and surface document status hints for child email and signer context.

## Concrete Steps

From `/home/camka/Projects/MVP/mvp-site`:

1. Edit:
   - `src/app/api/events/[eventId]/registrations/self/route.ts`
   - `src/app/api/events/[eventId]/registrations/child/route.ts`
   - `src/app/api/events/[eventId]/participants/route.ts`
   - `src/app/api/events/[eventId]/free-agents/route.ts`
   - `src/app/api/documents/record-signature/route.ts`
   - `src/app/api/profile/documents/route.ts`
   - add `src/app/api/family/join-requests/route.ts`
   - add `src/app/api/family/join-requests/[registrationId]/route.ts`
   - update tests in `src/app/api/events/__tests__/*` and add tests for new family routes.

2. Edit web integration:
   - `src/lib/familyService.ts`
   - `src/lib/registrationService.ts`
   - `src/lib/profileDocumentService.ts`
   - `src/app/discover/components/EventDetailSheet.tsx`
   - `src/app/profile/page.tsx`

From `/mnt/c/Users/samue/StudioProjects/mvp-app`:

3. Edit mobile integration:
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileComponent.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileFeatureScreens.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`

4. Run validation:
   - Backend: targeted Jest for modified API routes.
   - Mobile: targeted `:composeApp:testDebugUnitTest` for modified repository tests.

## Validation and Acceptance

Acceptance criteria:

- Child user (minor) can call self registration and receive pending guardian approval response instead of hard 403 rejection.
- Guardian can list pending child join requests and approve/decline them from profile child management in both site and app.
- Child registration without child email persists with actionable pending status (not immediate failure), and profile documents expose this status.
- Child signer-required templates appear in profile documents with signer-context metadata.
- Team/free-agent child enrollment does not hard-fail due to missing upfront signatures; pending consent/document status is created and trackable.
- Updated backend and mobile tests pass for changed routes/repositories.

## Idempotence and Recovery

All updates are additive and can be safely re-run. Approval/decline handlers will be implemented idempotently by validating ownership and current status before state transition. If a partial implementation fails, recovery is to revert only touched files in each repo and rerun targeted tests to confirm baseline behavior.

## Artifacts and Notes

Evidence to capture during completion:

- Jest output for registration/participants/family join-request routes.
- Kotlin test output for updated repository parsing/post payloads.
- Short response samples for:
  - minor self registration pending guardian approval
  - child registration with missing email (`consentStatus = child_email_required`)
  - guardian approve/decline API responses.

## Interfaces and Dependencies

Backend interfaces to add/extend:

- `GET /api/family/join-requests` returns guardian-visible pending child event requests.
- `PATCH /api/family/join-requests/[registrationId]` accepts action (`approve` or `decline`) and updates registration state.
- Registration endpoints return enriched registration/consent status payloads that preserve backward compatibility for existing clients.

Web/mobile dependencies remain the same:

- Next.js route handlers + Prisma in `mvp-site`.
- Shared KMP repositories/components in `mvp-app` using `MvpApiClient`.

Revision note (2026-02-17 19:22Z): Initial plan created for user-requested child request/guardian approval/document-routing expansion, explicitly excluding BoldSign checkbox implementation per user instruction.
Revision note (2026-02-17 20:42Z): Marked backend/web/mobile implementation complete, documented validation output, and captured final design decisions discovered during integration.
