# Implement Profile Payment Plans and Membership Screens

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root and must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, Profile pages in the shared Compose app will provide real, usable screens for Payment Plans and Memberships instead of placeholder text. A user will be able to open Payment Plans, refresh bills, see installment details, and start payment for the next installment. A user will also be able to open Memberships, refresh subscription state, and trigger cancel/restart actions when subscriptions are available. This mirrors the intent and structure of `~/Projects/MVP/mvp-site/src/app/profile/page.tsx` while preserving the current Compose profile style.

## Progress

- [x] (2026-02-11 17:48Z) Mapped current shared Profile screens and identified unimplemented areas in `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileFeatureScreens.kt`.
- [x] (2026-02-11 17:48Z) Reviewed web reference implementation in `~/Projects/MVP/mvp-site/src/app/profile/page.tsx` and related services/routes.
- [x] (2026-02-11 17:56Z) Added billing repository methods/DTOs for bills, bill payments, billing intents, subscriptions, and product/organization lookups.
- [x] (2026-02-11 17:57Z) Extended `ProfileComponent` state/actions for Payment Plans and Memberships and wired team dependency for team-owned bill loading.
- [x] (2026-02-11 17:58Z) Replaced Payment Plans and Memberships placeholders with refreshable card-based Compose implementations.
- [x] (2026-02-11 17:58Z) Added `BillingRepositoryHttpTest` coverage for `listBills` and `createBillingIntent`.
- [ ] Run targeted test commands and record acceptance evidence (blocked by host KSP/graphics issue).

## Surprises & Discoveries

- Observation: The web profile currently contains membership UI, but its `userService.listUserSubscriptions` in `mvp-site` currently returns an empty list.
  Evidence: `~/Projects/MVP/mvp-site/src/lib/userService.ts` has `listUserSubscriptions(_userId: string): Promise<Subscription[]> { return []; }`.
- Observation: Mobile shared data models (`Bill`, `BillPayment`, `Subscription`, `Product`) already exist, but billing repository methods for profile list/manage flows were not implemented.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/*.kt` contains models; `IBillingRepository` lacked list/manage APIs for bills/subscriptions.
- Observation: Local Gradle verification is blocked by an environment-level KSP failure (`Could not initialize class sun.awt.PlatformGraphicsInfo`) before Kotlin compile/test tasks complete.
  Evidence: `gradlew.bat :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest"` failed at `:composeApp:kspDebugKotlinAndroid` with that error.

## Decision Log

- Decision: Implement real Payment Plans behavior end-to-end (bill list + installment load + pay-next intent) using existing API routes used by the web app.
  Rationale: Payment Plans has stable endpoints in `mvp-site` API and directly addresses the current placeholders.
  Date/Author: 2026-02-11 / Codex
- Decision: Implement Memberships screen/actions with graceful fallback when subscription list endpoints are unavailable.
  Rationale: Membership list endpoint availability is uncertain across deployments; graceful fallback avoids hard failures while still delivering complete UI/actions.
  Date/Author: 2026-02-11 / Codex

## Outcomes & Retrospective

Payment Plans and Memberships are now implemented in the shared Profile feature as data-driven pages with refresh states, error states, and row-level actions. Billing repository capabilities were expanded to support the required profile flows and the profile component now orchestrates these operations in one place. Two targeted HTTP tests were added for new billing endpoints. The remaining gap is environment validation: Gradle/KSP fails on this host before test execution, so runtime confirmation requires re-running the listed commands in a compatible build environment.

## Context and Orientation

Profile navigation in the shared app routes through `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileScreen.kt`, which dispatches to child screens. The placeholder pages are in `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileFeatureScreens.kt`. State and actions are owned by `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileComponent.kt`.

Billing/network behavior currently lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt` and uses `MvpApiClient` for server routes. The web app reference implementation for these sections is in `~/Projects/MVP/mvp-site/src/app/profile/page.tsx`, with API access patterns in `~/Projects/MVP/mvp-site/src/lib/billService.ts` and `~/Projects/MVP/mvp-site/src/lib/productService.ts`.

In this repository, a “payment plan” means a `Bill` with one or more `BillPayment` installments. A “membership” means a `Subscription`, optionally decorated with `Product` and `Organization` display info.

## Plan of Work

First, extend `IBillingRepository` and `BillingRepository` with profile-focused methods for bill listing, bill-payment listing, billing intent creation, subscription list/load, subscription status updates, and product/organization lookups. Keep this additive so existing event/refund billing flows are unaffected.

Second, extend `ProfileComponent` with observable UI state for Payment Plans and Memberships, plus actions that refresh lists and trigger per-item operations. Update dependency wiring in DI for any new repository dependency needed by profile-owner labeling.

Third, replace placeholder Payment Plans and Memberships Composables with implemented sections. Preserve existing profile page visual language: top app bar, descriptive intro text, Material 3 cards, and action buttons.

Fourth, add or update repository HTTP tests using existing MockEngine patterns in `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/BillingRepositoryHttpTest.kt`.

## Concrete Steps

From repo root (`/home/camka/Projects/MVP/mvp-app`):

1. Update billing repository interface and implementation in:
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`
2. Update profile component contract and implementation in:
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileComponent.kt`
3. Update profile DI wiring in:
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/di/ComponentModule.kt`
4. Replace placeholder screens in:
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileFeatureScreens.kt`
5. Add/extend tests in:
   - `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/BillingRepositoryHttpTest.kt`
6. Run targeted tests:
   - `./gradlew :composeApp:commonTest --tests "com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest"`
   - `./gradlew :composeApp:commonTest`

Expected proof during validation:

- Billing repository tests pass with new endpoint behaviors.
- Project compiles/tests with updated `ProfileComponent` API.
- Payment Plans and Memberships screens render implemented content (no placeholder “future update” text).

## Validation and Acceptance

Acceptance criteria:

- Opening Payment Plans shows a refreshable list state with cards for bills, including amount and next-payment details.
- Payment Plans exposes a “Pay next installment” action that routes through billing intent + payment sheet integration.
- Opening Memberships shows implemented list/empty states and action buttons for cancel/restart where data exists.
- The placeholders in Payment Plans/Memberships are removed.
- `BillingRepositoryHttpTest` covers at least one new list endpoint and one new action endpoint.

## Idempotence and Recovery

All changes are additive and source-only. Re-running tests is safe and should produce identical results. If a specific API route is unavailable (for example, subscription listing), the Memberships loader must degrade to empty-state UI instead of crashing the screen.

## Artifacts and Notes

Validation attempt output (abbreviated):

- `gradlew.bat :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest"`
  - Failed during `:composeApp:kspDebugKotlinAndroid`
  - Error: `java.lang.NoClassDefFoundError: Could not initialize class sun.awt.PlatformGraphicsInfo`

## Interfaces and Dependencies

The following interface capabilities must exist after this work:

- `IBillingRepository` must provide methods for listing bills, fetching bill payments, creating billing intents for installment payments, listing subscriptions, canceling/restarting subscriptions, and fetching related product/organization records.
- `ProfileComponent` must expose Payment Plans and Memberships state plus imperative actions for refresh and row-level operations.

These behaviors depend on the existing API routes already used in `mvp-site`, especially:

- `GET /api/billing/bills`
- `GET /api/billing/bills/{id}/payments`
- `POST /api/billing/create_billing_intent`
- `GET /api/products`
- `PATCH|DELETE /api/subscriptions/{id}`

Plan revision note (2026-02-11): Initial plan created from current repository and `mvp-site` reference before implementation.
Plan revision note (2026-02-11): Updated after implementation to reflect completed tasks, added validation evidence, and documented environment-specific test blocker.
