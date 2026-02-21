# Implement Profile Children Management Screen

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root and must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, the Profile "Children" section in the shared Compose app supports end-user child management workflows: refresh linked children, create/link child accounts, edit child details, and browse children in a responsive square-card grid. The add-child flow is now explicitly user-triggered through an `Add child` button, with the form shown on demand and the children grid rendered below that management section.

## Progress

- [x] (2026-02-11 18:24Z) Inspected current Profile children placeholder in `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileFeatureScreens.kt`.
- [x] (2026-02-11 18:25Z) Reviewed web reference implementation in `~/Projects/MVP/mvp-site/src/app/profile/page.tsx` and family API routes/services.
- [x] (2026-02-11 18:27Z) Mapped current mobile architecture and confirmed missing family APIs in `IUserRepository`.
- [x] (2026-02-11 18:41Z) Implemented family children API methods and DTOs in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt`.
- [x] (2026-02-11 18:45Z) Extended `ProfileComponent` with children state and actions (refresh/create/link).
- [x] (2026-02-11 18:52Z) Replaced children placeholder UI with full management UI in `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileFeatureScreens.kt`.
- [x] (2026-02-11 18:56Z) Updated `IUserRepository` test fakes and added family endpoint tests in `UserRepositoryAuthTest`.
- [x] (2026-02-14 20:41Z) Added child update API contract in `IUserRepository`/`UserRepository` and added `updateChildAccount_patches_family_child_endpoint` in `UserRepositoryAuthTest`.
- [x] (2026-02-14 20:44Z) Extended `ProfileComponent` with child update state/action (`isUpdatingChild`, `updateError`, `updateChild(...)`).
- [x] (2026-02-14 20:49Z) Reworked `ProfileChildrenScreen` UX: add-child button gating, edit-in-place form prefill, list moved below forms, responsive right-then-down grid, and square child cards.
- [x] (2026-02-14 20:58Z) Ran `./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.UserRepositoryAuthTest"` successfully.

## Surprises & Discoveries

- Observation: The existing shared app has no family-related repository methods or child state, so this work requires both data and UI layers.
  Evidence: `rg -n "family|children|linkChild|createChild" composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories` returned no family endpoints.
- Observation: The web reference route returns `children` from `/api/family/children` with `age`, `linkStatus`, and `hasEmail` fields and uses `/api/family/links` for linking existing child accounts.
  Evidence: `~/Projects/MVP/mvp-site/src/app/api/family/children/route.ts` and `~/Projects/MVP/mvp-site/src/app/api/family/links/route.ts`.
- Observation: The family backend reference currently exposes `GET/POST /api/family/children` and `POST /api/family/links`; no child update route is defined there yet.
  Evidence: `~/Projects/MVP/mvp-site/src/app/api/family/children/route.ts` and `~/Projects/MVP/mvp-site/src/app/api/family/links/route.ts` only define those handlers.
- Observation: The expected old test task `:composeApp:commonTest` is not available in this checkout; `:composeApp:testDebugUnitTest` is the runnable local JVM test task used for verification.
  Evidence: `./gradlew :composeApp:tasks --all` and successful run of `./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.UserRepositoryAuthTest"`.

## Decision Log

- Decision: Implement family API methods in `IUserRepository`/`UserRepository` instead of creating a new repository.
  Rationale: Profile already depends on `IUserRepository`; this keeps dependency injection unchanged and minimizes churn.
  Date/Author: 2026-02-11 / Codex
- Decision: Keep child form field state local in Compose and keep network/loading/error state in `ProfileComponent`.
  Rationale: This mirrors existing profile patterns (component manages async state, composables manage transient text field input).
  Date/Author: 2026-02-11 / Codex
- Decision: Use lightweight date-of-birth validation (`YYYY-MM-DD`) in `ProfileComponent` before API calls.
  Rationale: It matches the web form contract and provides deterministic cross-platform validation without platform-specific date pickers.
  Date/Author: 2026-02-11 / Codex
- Decision: Add an explicit `updateChildAccount` repository method and `ProfileComponent.updateChild(...)` action for edit mode instead of overloading create/link flows.
  Rationale: Editing must be semantically distinct from create/link and needs dedicated loading/error state to keep the UI deterministic.
  Date/Author: 2026-02-14 / Codex
- Decision: Implement the children list as an adaptive grid built from rows/chunks with `aspectRatio(1f)` cards, instead of a simple vertical list.
  Rationale: This guarantees right-then-down ordering and square cards across narrow and wide form factors in shared Compose.
  Date/Author: 2026-02-14 / Codex

## Outcomes & Retrospective

The Profile children section now includes add/link/edit UI flows, responsive square-card grid rendering, and a button-gated add form with the list placed below management controls. Local JVM validation now runs in this environment via `:composeApp:testDebugUnitTest`. Remaining risk: the backend source-of-truth currently does not yet define a child-update family endpoint, so client-side `updateChildAccount` requires matching backend support for end-to-end runtime success.

## Context and Orientation

`composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileScreen.kt` routes Profile child stacks to feature screens. The current Children screen implementation is a placeholder in `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileFeatureScreens.kt`.

`composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileComponent.kt` is the state/action owner for profile feature screens. It already contains implemented payment plans and memberships patterns that are suitable templates for children management state transitions.

`composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt` defines `IUserRepository` and network-backed user methods. This is the right place to add `/api/family/children` and `/api/family/links` access.

## Plan of Work

Add domain models and methods in `IUserRepository` for listing children, creating child accounts, and linking existing children. Implement those methods in `UserRepository` with dedicated request/response DTOs and error handling that matches current repository conventions.

Extend `ProfileComponent` with children-specific state (`loading`, `children`, `create/link in-flight`, and per-section errors) and with methods to refresh children and submit create/link actions. Keep validation checks in component methods, mirroring the web behavior for required fields.

Replace the current placeholder in `ProfileFeatureScreens.kt` with a full screen that includes:

- A refreshable linked-children list with empty/loading/error states.
- An "Add a child" form (first name, last name, optional email, date of birth, relationship).
- A "Link an existing child" form (child email or user ID, relationship).

Update existing test doubles that implement `IUserRepository` to satisfy the expanded interface. Add targeted `UserRepositoryAuthTest` cases for the new family endpoints.

## Concrete Steps

From repo root (`/home/camka/Projects/MVP/mvp-app`):

1. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt`:
   - Add family child models.
   - Add interface methods and implementation for list/create/link.
2. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileComponent.kt`:
   - Add children state models/flows and actions.
3. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileFeatureScreens.kt`:
   - Replace `ProfileChildrenScreen` placeholder with complete UI and actions.
4. Edit test files that implement `IUserRepository`:
   - `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/BillingRepositoryHttpTest.kt`
   - `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/EventRepositoryHttpTest.kt`
   - `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/TeamRepositoryTeamsFetchTest.kt`
5. Extend `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/UserRepositoryAuthTest.kt` with family endpoint tests.
6. Run targeted tests:
   - `./gradlew :composeApp:commonTest --tests "com.razumly.mvp.core.data.repositories.UserRepositoryAuthTest"`
   - `./gradlew :composeApp:commonTest`

## Validation and Acceptance

Acceptance criteria:

- Children screen no longer shows placeholder text.
- Users can tap refresh and see loading/error/empty/list states.
- Users can submit "Add a child" and "Link an existing child" forms.
- Relationship options include parent and guardian.
- Child cards display name, age (or Unknown), and link status; show missing-email warning when applicable.
- User repository tests pass for list/create/link family endpoints in a Java 11+ build environment.

## Idempotence and Recovery

The change is source-only and additive. Re-running build/test commands is safe. If API endpoints are unavailable in an environment, errors are surfaced in screen state without crashing profile navigation.

## Artifacts and Notes

Primary web reference files:

- `~/Projects/MVP/mvp-site/src/app/profile/page.tsx`
- `~/Projects/MVP/mvp-site/src/lib/familyService.ts`
- `~/Projects/MVP/mvp-site/src/app/api/family/children/route.ts`
- `~/Projects/MVP/mvp-site/src/app/api/family/links/route.ts`

## Interfaces and Dependencies

Post-change, `IUserRepository` will include:

- `suspend fun listChildren(): Result<List<FamilyChild>>`
- `suspend fun createChildAccount(...): Result<Unit>`
- `suspend fun updateChildAccount(...): Result<Unit>`
- `suspend fun linkChildToParent(...): Result<Unit>`

`ProfileComponent` will include:

- `val childrenState: StateFlow<ProfileChildrenState>`
- `fun refreshChildren()`
- `fun createChild(...)`
- `fun updateChild(...)`
- `fun linkChild(...)`

Plan revision note (2026-02-11): Initial plan created before implementation with repository and UI scope aligned to web profile reference.
Plan revision note (2026-02-11): Updated after implementation with completed milestones, test additions, and Java runtime blocker details.
Plan revision note (2026-02-14): Extended plan status for follow-up UX refinements (add-button gated form, square grid cards), child edit contract wiring, and successful `testDebugUnitTest` validation in the current environment.
