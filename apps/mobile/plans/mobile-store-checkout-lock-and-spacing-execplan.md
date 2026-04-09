# Tighten Mobile Store Checkout Locking And List Spacing

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with [PLANS.md](/Users/samue/StudioProjects/mvp-app/PLANS.md) at the `mvp-app` repository root.

## Purpose / Big Picture

The mobile organization store already understands one-time products, but it still allows repeated taps while checkout is being prepared and it applies bottom navigation padding to the top of list tabs. After this change, the mobile store will match the web behavior by locking product purchase buttons while checkout creation is in flight, and the first list item under the tab row will sit against the normal top spacing instead of a large blank gap.

The visible proof is:

1. On the organization `Store` tab in `mvp-app`, tapping `Buy now` or `Subscribe` disables product purchase buttons until the checkout sheet is ready or the start request fails.
2. Repeated taps on the same product do not create duplicate checkout-start requests.
3. The `Events`, `Teams`, and `Store` tabs keep normal top padding while still respecting bottom navigation inset padding.

## Progress

- [x] 2026-04-08T17:09:00-07:00 Audited the current mobile organization store flow and confirmed the app already routes one-time products to `createProductPurchaseIntent(...)`.
- [x] 2026-04-08T17:09:00-07:00 Identified the top-gap cause: `PaddingValues(horizontal = 16.dp, vertical = 16.dp + bottomPadding)` is applying bottom inset padding to the top edge of `LazyColumn` tabs.
- [x] 2026-04-08T18:41:00-07:00 Added checkout-start state to `OrganizationDetailComponent` so duplicate product taps are ignored until the current start request resolves.
- [x] 2026-04-08T18:41:00-07:00 Threaded checkout-start state through `OrganizationDetailScreen.kt` so the active product button shows loading and all product buttons are disabled during request startup.
- [x] 2026-04-08T18:41:00-07:00 Fixed list-tab padding so bottom inset is only applied to the bottom edge of `Events`, `Teams`, and `Store`.
- [x] 2026-04-08T18:41:00-07:00 Added a regression test that proves duplicate product taps only call the billing repository once while a checkout-start request is suspended.
- [x] 2026-04-08T18:41:00-07:00 Ran focused Gradle validation and recorded the exact results below.

## Surprises & Discoveries

- Observation: The mobile product flow is already mostly aligned with the site-side single-purchase changes.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponent.kt` already branches to `createProductPurchaseIntent(product.id)` when `product.period == SINGLE`.

- Observation: The large list gap is not store-specific.
  Evidence: `EventsTabContent`, `TeamsTabContent`, and `StoreTabContent` all use `PaddingValues(horizontal = 16.dp, vertical = 16.dp + bottomPadding)`, which increases both top and bottom padding.

- Observation: The local Windows Gradle environment in this checkout can exhaust native memory with the default `-Xmx8g` heap setting.
  Evidence: `:composeApp:compileCommonMainKotlinMetadata` previously produced `hs_err_pid*.log` with `There is insufficient memory for the Java Runtime Environment to continue`, and the same tasks completed successfully after overriding `GRADLE_OPTS` to `-Dorg.gradle.jvmargs=-Xmx2g -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8`.

- Observation: The new organization-detail regression test initially surfaced unrelated stale test fakes rather than a feature regression.
  Evidence: several common-test fake `IUserRepository` implementations were missing the new `deleteAccount(confirmationText: String)` method; adding the no-op overrides restored the focused test task.

## Decision Log

- Decision: Lock product purchase buttons only while the checkout-start request is in flight, not for the entire lifetime of the payment sheet.
  Rationale: The regression to prevent is duplicate request creation from repeated taps. Once the payment sheet has been handed off to Stripe, the app should rely on the existing payment processor flow rather than keep the store UI in a pseudo-loading state.
  Date/Author: 2026-04-08 / Codex

- Decision: Use component state for the active checkout-start product id instead of a purely local Compose flag.
  Rationale: The request is started inside `OrganizationDetailComponent`, so the component is the correct source of truth for guarding duplicate work and for exposing a testable state machine.
  Date/Author: 2026-04-08 / Codex

## Outcomes & Retrospective

The mobile app was already up to date on the underlying product purchase split: `SINGLE` products already used the one-time purchase-intent endpoint and recurring products already used the subscription-intent endpoint. The remaining parity gap was UI/state handling around checkout startup and the incorrect list padding.

Implemented outcomes:

1. `OrganizationDetailComponent` now exposes `startingProductCheckoutId` and ignores duplicate `startProductPurchase(product)` calls while one checkout-start request is active.
2. `OrganizationDetailScreen` disables all store purchase buttons during checkout startup, shows a progress treatment on the tapped product, and preserves the existing `Buy now` vs `Subscribe` labels once idle.
3. `Events`, `Teams`, and `Store` list tabs now keep the normal top spacing while still honoring bottom navigation inset padding.
4. A new common test covers both one-time and recurring duplicate-tap suppression.

Validation results:

1. `GRADLE_OPTS='-Dorg.gradle.jvmargs=-Xmx2g -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8' ./gradlew :composeApp:compileCommonMainKotlinMetadata`
   Result: passed on 2026-04-08.
2. `GRADLE_OPTS='-Dorg.gradle.jvmargs=-Xmx2g -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8' ./gradlew :composeApp:testDebugUnitTest --tests com.razumly.mvp.organizationDetail.OrganizationDetailComponentTest`
   Result: passed on 2026-04-08 after updating stale common-test fakes to satisfy the current `IUserRepository` interface.

## Context and Orientation

The relevant screen is `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailScreen.kt`. It renders five tabs for an organization. The `Store` tab uses `StoreTabContent`, which renders each product with `ProductCard`. Right now `ProductCard` only checks whether the organization has Stripe enabled and whether the product is active, so repeated taps can fire duplicate checkout-start calls.

The product checkout logic lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponent.kt`. `DefaultOrganizationDetailComponent.startProductPurchase(product)` checks for a logged-in user, ensures the buyer has a billing address, and then calls either `billingRepository.createProductPurchaseIntent(product.id)` or `billingRepository.createProductSubscriptionIntent(product.id)`. There is currently no in-flight guard around that work.

Regression coverage belongs in `composeApp/src/commonTest/kotlin/com/razumly/mvp`. This repository already provides reusable coroutine-test helpers in `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/CreateEventTestFixtures.kt`, including `MainDispatcherTest` for `Dispatchers.Main` and a fake `IBillingRepository` implementation that can be extended or wrapped for this feature test.

## Plan of Work

First, extend `OrganizationDetailComponent` with a `StateFlow<String?>` that holds the product id whose checkout-start request is currently active. Back it with a private `MutableStateFlow` in `DefaultOrganizationDetailComponent`. Guard `startProductPurchase(product)` so it returns immediately when a start request is already active, set the active id before the network call begins, and clear it on every exit path where the request has either failed, been deferred for billing-address capture, or successfully handed off to `showPaymentSheet(...)`.

Next, update `OrganizationDetailScreen.kt`. Collect the new active checkout-start id near the existing product and loading flows. Pass it into `StoreTabContent`, then into `ProductCard`, so the clicked product can render a loading treatment and every product button is disabled during startup. Keep the text labels consistent with the existing `Buy now` and `Subscribe` behavior.

Then, fix the list padding in `EventsTabContent`, `TeamsTabContent`, and `StoreTabContent` by replacing the combined `vertical` padding with explicit `top = 16.dp` and `bottom = 16.dp + bottomPadding`. This preserves the bottom safe-area spacing without inflating the top gap under the tab row.

Finally, add a common test for `DefaultOrganizationDetailComponent`. The test should suspend the fake billing repository inside product checkout creation, call `startProductPurchase(product)` twice, prove only one repository call is recorded, and assert that the new active checkout-start id is cleared once the suspended request completes.

## Concrete Steps

From `C:\Users\samue\StudioProjects\mvp-app`:

1. Update `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponent.kt` to expose and maintain product checkout-start state.
2. Update `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailScreen.kt` to consume that state and correct list paddings.
3. Add a new test file under `composeApp/src/commonTest/kotlin/com/razumly/mvp/organizationDetail/`.
4. Run focused Gradle validation:

    .\gradlew :composeApp:testDebugUnitTest

If the full test task is too noisy, run at least:

    .\gradlew :composeApp:compileCommonMainKotlinMetadata

and a targeted JVM test task if available, then record the exact command and result here.

## Validation and Acceptance

Acceptance is behavior-based:

1. While a product checkout request is starting, the `Store` tab disables product purchase buttons and the tapped product indicates that startup is in progress.
2. The billing repository is called only once when `startProductPurchase(product)` is invoked repeatedly before the first request completes.
3. The `Store`, `Events`, and `Teams` tabs no longer show an oversized blank gap under the top tab row.
4. Shared-code compilation and the new regression test pass.

## Idempotence and Recovery

These changes are additive and safe to rerun. If the component-state change causes any purchase regression, revert the `OrganizationDetailComponent.kt`, `OrganizationDetailScreen.kt`, and new test file together so the UI and logic do not drift apart.

## Artifacts and Notes

Baseline observations before implementation:

    OrganizationDetailComponent.startProductPurchase(product):
      - already routes SINGLE -> createProductPurchaseIntent(product.id)
      - already routes recurring -> createProductSubscriptionIntent(product.id)
      - has no in-flight guard

    OrganizationDetailScreen list tabs:
      contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp + bottomPadding)

## Interfaces and Dependencies

At the end of this work:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponent.kt`
  must expose a new `startingProductCheckoutId: StateFlow<String?>`.

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailScreen.kt`
  must disable product purchase buttons while a checkout-start request is active and must only apply bottom inset padding to the bottom edge of list tabs.

- `composeApp/src/commonTest/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponentTest.kt`
  must contain a regression test covering duplicate product-tap suppression.

Revision note: created this ExecPlan for the mobile follow-up after auditing the current organization store implementation and identifying the missing checkout-start lock plus the list-padding bug.
