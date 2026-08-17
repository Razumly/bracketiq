# Implement Child-Aware Event Join and Template Signer Routing Across Web, Backend, and Mobile

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` in this repository and `PLANS.md` in `/home/camka/Projects/MVP/mvp-site` because the implementation spans both codebases.

## Purpose / Big Picture

After this change, users who have linked children are prompted at join time to choose whether they are joining themselves or registering a child. Document templates can explicitly declare who must sign: participant, parent/guardian, child, or parent/guardian+child. Signing links are filtered by signer context so each signer only receives relevant templates. Child registrations are blocked when the child has no email, and signer-type labels are visible in template management and selection surfaces.

## Progress

- [x] (2026-02-14 15:10Z) Investigated current join/sign flows in `mvp-app` and `mvp-site`; identified existing child registration routes and current signer handling gaps.
- [x] (2026-02-14 15:40Z) Implemented backend schema/API updates for required signer type and sign-link filtering.
- [x] (2026-02-14 16:05Z) Implemented web UI updates for signer-type template setting/labels and child-aware join prompt.
- [x] (2026-02-14 16:45Z) Implemented mobile join/sign updates for child prompt and signer-context-aware signing.
- [x] (2026-02-14 17:05Z) Added and ran targeted tests in both repos.

## Surprises & Discoveries

- Observation: Web already has dedicated registration routes (`/registrations/self` and `/registrations/child`) and child registration UI, but signing flows are still generic and not signer-context-aware.
  Evidence: `src/app/api/events/[eventId]/registrations/*` and `src/app/discover/components/EventDetailSheet.tsx`.
- Observation: Mobile currently joins directly through `/api/events/{id}/participants` and does not use registration routes, so child flow requires new repository/component paths.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt` and `EventDetailComponent.kt`.
- Observation: `DefaultEventDetailComponent` constructor accepted `userRepository` but did not store it as a property, which blocked the new linked-children lookup helper.
  Evidence: compile failure in `EventDetailComponent.kt` at `loadJoinableChildren()` and fix by storing `private val userRepository`.

## Decision Log

- Decision: Add a dedicated `requiredSignerType` field on template records instead of overloading existing BoldSign role fields.
  Rationale: BoldSign signer roles already represent PDF role metadata; reusing them would couple unrelated concerns and create brittle filtering logic.
  Date/Author: 2026-02-14 / Codex
- Decision: Keep existing participant endpoints intact while adding signer-context parameters to sign-link APIs.
  Rationale: Limits regression risk and preserves current join behavior for teams and existing clients while enabling signer-aware filtering.
  Date/Author: 2026-02-14 / Codex
- Decision: Enforce child-email requirement in both client flow and backend registration route.
  Rationale: Prevents incomplete consent/signing sessions and matches requirement that children without email cannot sign up.
  Date/Author: 2026-02-14 / Codex

## Outcomes & Retrospective

Implemented across both repositories:

- Backend/web now persist template `requiredSignerType`, filter required sign links by signer context, and return signer labels with each sign step.
- Web join flow now prompts users with linked children to choose self vs child registration, routes child flow through parent/guardian signer context, and blocks child signup when email is missing.
- Mobile join flow now mirrors self-vs-child prompt behavior, enforces child email before registration, requests signer-context-specific sign links, and displays signer labels in signing UI.
- Regression tests added/updated for sign-link filtering, child-email requirement, signer-context request payload, and child-registration API payload.

## Context and Orientation

This work touches two repositories:

1. Mobile app (`/home/camka/Projects/MVP/mvp-app`): Kotlin Multiplatform Compose app. Event joining and signing are controlled by:
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`

2. Web/backend (`/home/camka/Projects/MVP/mvp-site`): Next.js + Prisma app. Template and signing behavior is implemented in:
- `src/app/api/organizations/[id]/templates/route.ts`
- `src/app/api/events/[eventId]/sign/route.ts`
- `src/app/api/events/[eventId]/registrations/self/route.ts`
- `src/app/api/events/[eventId]/registrations/child/route.ts`
- `src/app/discover/components/EventDetailSheet.tsx`
- `src/app/organizations/[id]/page.tsx`
- `src/app/events/[id]/schedule/components/EventForm.tsx`
- `prisma/schema.prisma`

Key terms used here:
- "Signer context": which person is currently signing (participant, parent/guardian, or child).
- "Required signer type": template-level rule describing which signer context should receive the template.

## Plan of Work

First, update backend template persistence and API payloads to include required signer type. Then update sign-link generation logic to filter templates by signer context while preserving current PDF/TEXT behavior and sign-once handling. Next, wire web UI template create/list/select views so required signer type is configurable and visible. Then update web join flow to prompt users with children and pass signer context when creating sign links. Finally, update mobile repository/component/signing state so child-aware join prompting and signer-context sign requests are available there too, including child email validation.

## Concrete Steps

From `/home/camka/Projects/MVP/mvp-site`:

1. Add schema + route/type updates for `requiredSignerType`.
2. Update sign route filtering and child-email validation.
3. Update web UIs for template setting + labels + join prompt context.
4. Run targeted tests:
   npm test -- src/app/api/events/__tests__/eventSignRoute.test.ts
   npm test -- src/app/api/events/[eventId]/registrations

From `/home/camka/Projects/MVP/mvp-app`:

1. Update repository request DTOs and event detail component/screen states.
2. Update/extend tests:
   ./gradlew :composeApp:testDebugUnitTest --tests "*EventRepositoryHttpTest*" --tests "*BillingRepositoryHttpTest*"

## Validation and Acceptance

Acceptance is met when:

1. Creating a template in organization settings includes a signer-type selector and saves that value.
2. Event required-template selectors and template cards show signer-type labels.
3. A user with linked children attempting to join is prompted to choose self or child registration.
4. Sign-link responses only include templates matching signer context.
5. Parent/guardian-only templates are returned only for parent/guardian signer context during child registration.
6. Child registration fails when the child account has no email, both in client validation and backend validation.
7. Mobile join flow exposes the same self-vs-child prompt and routes signing with signer context.

## Idempotence and Recovery

All edits are additive and safe to re-run. If migration or schema generation fails, restore to the previous migration state and re-run with the corrected schema field definitions. If UI changes regress join flow, fallback is to preserve old join behavior while keeping signer-type labels read-only until filtering logic is fixed.

## Artifacts and Notes

Validation commands executed:

- `/home/camka/Projects/MVP/mvp-site`
  - `npm test -- src/app/api/events/__tests__/eventSignRoute.test.ts src/app/api/events/__tests__/childRegistrationRoute.test.ts src/lib/__tests__/boldsignService.test.ts`
  - Result: 3 suites passed, 10 tests passed.

- `/home/camka/Projects/MVP/mvp-app`
  - `./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest" --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest"`
  - Result: build successful; focused repository HTTP tests passed.

Representative payload expectations validated in tests:

- Sign-link request includes signer context + child metadata (`signerContext`, `childUserId`, `childEmail`) for child registration signing.
- Child registration request posts `{ "childId": "<id>" }` to `/api/events/{eventId}/registrations/child`.

## Interfaces and Dependencies

Required interface outcomes:

- Backend template model includes:
  `requiredSignerType: 'PARTICIPANT' | 'PARENT_GUARDIAN' | 'CHILD' | 'PARENT_GUARDIAN_CHILD'`

- Sign-link request supports signer context:
  `signerContext: 'participant' | 'parent_guardian' | 'child'`
  plus optional child target metadata.

- Sign-link response includes template signer metadata so clients can render signer labels.

Revision note (2026-02-14): Created initial living ExecPlan after codebase discovery to guide full implementation across backend/web/mobile.
