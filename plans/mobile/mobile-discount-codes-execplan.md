# Mobile Discount Codes

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root.

## Purpose / Big Picture

Mobile users can manage their own discount offers from the regular profile/home area and can enter an optional discount code as part of the payment flow before any paid checkout starts. Organization discount creation is intentionally not added on mobile yet. Checkout requests pass the entered code to the existing `mvp-site` discount-aware APIs for event registration, product purchases, memberships, and team registration.

## Progress

- [x] (2026-06-24T19:05:00Z) Read repository guidance and inspected shared billing, event registration, product, membership, and team-registration payment paths.
- [x] (2026-06-24T19:24:00Z) Added API DTO/repository support for discount listing, target lookup, discount creation, code generation, and passing discount codes into checkout requests.
- [x] (2026-06-24T19:24:00Z) Added reusable optional discount-code prompts in the checkout flow before purchase-intent creation.
- [x] (2026-06-24T19:24:00Z) Added regular-user discount management entry and screen under the profile/home area.
- [x] (2026-06-24T19:29:00Z) Validated with `./gradlew :composeApp:compileDebugKotlinAndroid`.

## Surprises & Discoveries

- Observation: Event registration already has a pre-payment coordinator for document signing, questions, billing address, and fee breakdown.
  Evidence: `EventPurchaseIntentCoordinator` and `EventRegistrationFlowCoordinator` gate purchase intents before opening the payment sheet.

- Observation: Product, membership, and team-registration checkout start from separate component methods but all call `BillingRepository`.
  Evidence: `OrganizationDetailComponent` calls `createProductPurchaseIntent`, `createProductSubscriptionIntent`, and `createTeamRegistrationPurchaseIntent`.

## Decision Log

- Decision: Model discount entry as an optional payment-flow prompt instead of adding separate product/event/team text fields.
  Rationale: The user asked for the mobile behavior to work like document signing and question asking, which are step-based gates before payment starts.
  Date/Author: 2026-06-24 / Codex

- Decision: Skip organization-owned mobile discount creation for now.
  Rationale: The user explicitly said orgs do not need mobile discount creation yet. User-owned discounts are enough for this mobile pass.
  Date/Author: 2026-06-24 / Codex

## Outcomes & Retrospective

Implementation is in progress.

The mobile implementation adds user-owned discount management on the profile home screen and optional discount-code prompts for event registration, organization store products, memberships, paid team registration, and profile-originated child team-registration payments. Validation passed:

    ./gradlew :composeApp:compileDebugKotlinAndroid
    Result: BUILD SUCCESSFUL.

The Gradle task auto-started the local `mvp-site` backend through `startLocalBackend`; that process was stopped after the compile finished.

## Context and Orientation

The backend source of truth is `/Users/elesesy/StudioProjects/mvp-site`. Discount management endpoints are:

- `GET /api/discounts?ownerType=USER`
- `POST /api/discounts`
- `POST /api/discounts/{discountId}/codes`
- `GET /api/discounts/targets?ownerType=USER&itemType=...&query=...`

Checkout endpoints already accept `discountCode` on `api/billing/purchase-intent` and `api/products/{id}/subscriptions`.

Mobile billing code lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt` and request DTOs live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/BillingDtos.kt`.

## Plan of Work

First, extend billing DTOs and repository methods so all purchase-intent methods accept an optional discount code and serialize it as `discountCode`.

Second, add discount data models and repository calls for the user-owned discount management APIs.

Third, add a reusable discount-code prompt state and Compose dialog. Event registration should show it before creating a purchase intent, then continue into the existing billing-address, document, fee-breakdown, and payment-sheet flow. Product, membership, and team-registration checkout should use the same prompt before calling the repository.

Fourth, expose a regular-user Discounts entry from the profile home and render a simple management screen: list existing discounts/codes, select a target type and searchable target, enter the final discounted price, create the discount, and generate codes with optional usage limits.

## Validation and Acceptance

The feature is accepted when a mobile checkout for event registration, product purchase, membership subscription, and team registration can optionally pass a discount code to the backend, and a regular user can manage their own discounts from the profile/home area. Org-owned discount creation is not present on mobile.

Before completion, run a focused compile or test task:

    ./gradlew :composeApp:compileDebugKotlinAndroid

If a broader test is feasible in the dirty checkout, run:

    ./gradlew :composeApp:testDebugUnitTest

## Idempotence and Recovery

The mobile changes are source-only. Re-running checkout with an empty discount code should serialize no code and preserve current behavior. If repository tests or compile fail due unrelated dirty files, document the failing files and keep coupon edits isolated.
