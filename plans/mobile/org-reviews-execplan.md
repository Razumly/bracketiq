# Add organization reviews to the mobile organization screen

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan is maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, a person who opens an organization in the Kotlin Multiplatform app can read its rating and reviews and, when eligible, create, edit, or delete one review without leaving the app. The mobile client will consume the review API implemented in `/Users/elesesy/StudioProjects/mvp-site` and will present Reviews as a first-class organization tab.

## Progress

- [x] (2026-07-09 21:28Z) Inspected `OrganizationDetailComponent`, `OrganizationDetailScreen`, `OrganizationDetailTab`, organization models, repository methods, and current tests.
- [x] (2026-07-09 21:56Z) Added serializable review models and exact repository methods for read, save, delete, and report operations.
- [x] (2026-07-09 21:56Z) Added review state, refresh, save, delete, report, and sign-in behavior to the organization detail component.
- [x] (2026-07-09 21:56Z) Added a scrollable Reviews tab, Overview summary, distribution/list states, moderation state, and create/edit bottom sheet.
- [x] (2026-07-09 21:56Z) Added repository and component regression tests and passed Android production compilation. Focused Android unit-test execution is blocked by unrelated common-test API drift already present in the checkout.

## Surprises & Discoveries

- Observation: The repository has unrelated event-detail and event-tag work in progress, but the organization detail production files are currently clean.
  Evidence: `git status --short` on 2026-07-09 listed those existing files and no organization-detail production edits.

- Observation: `testDebugUnitTest` compiles all shared tests before applying the selected test filter, and unrelated event/match tests are currently incompatible with their production interfaces.
  Evidence: The task fails in existing `CreateEventTestFixtures.kt`, `EventPurchaseIntentCoordinatorTest.kt`, `EventRegistrationFlowCoordinatorTest.kt`, and match fakes before any selected review test executes. `:composeApp:compileDebugKotlinAndroid` succeeds.

## Decision Log

- Decision: Add `REVIEWS` immediately after `OVERVIEW` and replace the fixed primary tab row with a scrollable primary tab row.
  Rationale: Six labeled icon tabs cannot remain legible at phone width in a fixed row.
  Date/Author: 2026-07-09 / Codex

- Decision: Keep review results in `StateFlow` owned by `OrganizationDetailComponent` and do not add a Room entity.
  Rationale: This data is local to one profile screen and can be refreshed atomically after each mutation without changing the shared database schema version.
  Date/Author: 2026-07-09 / Codex

- Decision: Use `IBillingRepository` for the review endpoints.
  Rationale: This repository already owns organization API calls and is injected into the organization detail component.
  Date/Author: 2026-07-09 / Codex

## Outcomes & Retrospective

The mobile organization screen now loads the web review contract, shows a compact summary on Overview, and exposes Reviews as the second tab in a horizontally scrollable tab row. Eligible users can create or edit a required 1-to-5-star review with optional text, delete it, or report another user's review. Owners and staff receive the server-provided restriction reason, and moderation-hidden authors are told that editing will not republish the review.

Android production compilation passed. Two repository HTTP tests and one component state test were added. The repository's unrelated common-test compilation failures prevent selected Android tests from running, so those tests remain written but not executed in this checkout.

## Context and Orientation

`core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/OrganizationReview.kt` will contain the Kotlin serialization models that mirror the web response. `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt` defines `IBillingRepository` and its implementation around `MvpApiClient`.

`composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponent.kt` owns screen state and background refresh work. `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailScreen.kt` renders the tab row and tab content. `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/AppConfig.kt` contains the serializable tab enum used by navigation.

The API source of truth is the sibling web repository. GET `api/organizations/{organizationId}/reviews` returns summary, reviews, current viewer review, and review eligibility. POST to that path upserts rating and optional body. PATCH and DELETE use `api/organizations/{organizationId}/reviews/{reviewId}`.

## Plan of Work

Define review models in `core:model`, including summary distribution and a viewer-safe reviewer identity. Add repository methods to fetch, save, and delete reviews with encoded path parameters and serializable request bodies. Add state flows and loading/mutation flags to the organization component. Refresh reviews after the organization loads and after every mutation; surface failures through the existing `ErrorMessage` path and successful changes through the existing message flow.

Add `REVIEWS` to the navigation enum. Replace `PrimaryTabRow` with `PrimaryScrollableTabRow`, preserving tab icons and labels. Render a dedicated review content composable with aggregate stars, distribution, empty/error/loading states, and review rows. Eligible users receive a Write review or Edit review action. Use a Material 3 modal bottom sheet with a 1-to-5 star selector, optional text field, Save, and Delete when editing.

Add focused repository tests using the existing Ktor mock engine pattern and component tests using current fakes. Compile Android common code after tests.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-app`, run:

    ./gradlew :composeApp:testDebugUnitTest --tests '*OrganizationDetail*' --tests '*BillingRepositoryHttpTest*'
    ./gradlew :composeApp:compileDebugKotlinAndroid
    git diff --check

Expected evidence is focused tests passing and the Android Kotlin compile completing without exhaustive `when` failures from the new tab enum.

## Validation and Acceptance

On a narrow mobile viewport, the tab row must scroll horizontally and retain readable labels. Opening Reviews shows the server summary and review rows. An eligible user can select a required star rating, enter optional text, save, reopen the same review for editing, and delete it. Network errors preserve the screen and surface an actionable message. Owners and staff can read reviews but cannot open the editor.

## Idempotence and Recovery

GET is read-only and mutations are safe to retry because POST is an upsert. No Room migration is required. All edits must preserve unrelated dirty work. If the backend response changes during implementation, update the web source of truth first and then the Kotlin models and tests in the same stopping point.

## Artifacts and Notes

The first release intentionally omits owner replies, anonymous reviews, and offline review caching. Those additions require separate product and moderation rules and are not needed to make the requested read/write flow complete.

## Interfaces and Dependencies

`IBillingRepository` will expose `getOrganizationReviews(organizationId: String): Result<OrganizationReviewsPayload>`, `saveOrganizationReview(organizationId: String, rating: Int, body: String?): Result<OrganizationReviewsPayload>`, and `deleteOrganizationReview(organizationId: String, reviewId: String): Result<OrganizationReviewsPayload>`. The component will expose matching read-only state flows and command methods to the Compose screen.

Plan update note: Created the initial mobile implementation plan on 2026-07-09 and aligned it to the sibling web API contract. Updated it at completion with delivered behavior, compile evidence, and the unrelated common-test blocker.
