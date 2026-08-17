# Add Single-Purchase Store Products Across `mvp-site` and `mvp-app`

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with [PLANS.md](/Users/samue/StudioProjects/mvp-app/PLANS.md) at the `mvp-app` repository root.

## Purpose / Big Picture

Organization owners currently create store products in `mvp-site`, but the form and purchase flow assume every product is a recurring membership. After this change, owners can create either recurring memberships or one-time items, choose a `SINGLE` billing period for non-recurring purchases, select from a more useful set of product tax categories, and see “Add product” language instead of “Add membership product”. Buyers in both `mvp-site` and `mvp-app` will be able to purchase these products correctly: recurring products continue through the subscription flow, while one-time products use the standard one-time payment intent flow without being mirrored as subscriptions.

The visible proof is:

1. In `mvp-site`, the organization store tab shows `Add product`, offers `Single purchase` in billing period, offers richer tax-category choices, and renders one-time products without a repeating period label.
2. In `mvp-site`, buying a `SINGLE` product uses the one-time payment path and does not create a `Subscriptions` row.
3. In `mvp-app`, the organization store renders `SINGLE` products as one-time purchases and routes checkout through the one-time payment intent path instead of the subscription path.

## Progress

- [x] 2026-04-08T10:20:25-07:00 Researched the existing product, Stripe, webhook, and app purchase flows in both repositories.
- [x] 2026-04-08T10:20:25-07:00 Confirmed `mvp-site` already has a generic one-time `productId` payment intent path at `src/app/api/billing/purchase-intent/route.ts`, but the organization UI and `mvp-app` currently bypass it for products.
- [x] 2026-04-08T10:20:25-07:00 Confirmed the Stripe webhook currently creates a local `Subscriptions` row for any `purchase_type === 'product'`, which must be narrowed so one-time products are not misclassified.
- [x] 2026-04-08T11:30:00-07:00 Added `SINGLE` to the product period enum, added `DAY_PASS` and `EQUIPMENT_RENTAL` product tax categories, and created the additive Prisma migration in `mvp-site`.
- [x] 2026-04-08T12:15:00-07:00 Updated `mvp-site` product helpers, Stripe catalog sync, API routes, organization store UI, receipt labeling, and webhook behavior so one-time products use the payment-intent path and no longer create local subscription rows.
- [x] 2026-04-08T12:35:00-07:00 Updated `mvp-app` shared product types, organization-store purchase routing, success messaging, and store-card presentation for one-time products.
- [x] 2026-04-08T12:50:00-07:00 Ran focused validation in both repositories and recorded the outcomes below.
- [x] 2026-04-08T13:35:00-07:00 Replaced the user-facing product `tax category` picker with a period-aware `product type` picker in `mvp-site`, and derived stored tax behavior from that type.
- [x] 2026-04-08T13:45:00-07:00 Added server-side validation so invalid billing-period/product-type combinations are rejected even if callers bypass the UI.

## Surprises & Discoveries

- Observation: The Android/KMP app already has a one-time product purchase repository method, `createProductPurchaseIntent`, in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`, but `OrganizationDetailComponent` never calls it.
  Evidence: `OrganizationDetailComponent.startProductPurchase` currently calls `createProductSubscriptionIntent(product.id)`.

- Observation: `mvp-site` already supports one-time tax quotes and payment intents for products through `src/app/api/billing/purchase-intent/route.ts`.
  Evidence: `resolvePurchaseContext` accepts `productId`, and the purchase-intent route appends `product_id`, `product_name`, and `product_period` metadata before creating a Stripe `paymentIntents.create` request.

- Observation: The webhook currently treats any product payment as a subscription mirror.
  Evidence: In `src/app/api/billing/webhook/route.ts`, the `purchaseType === 'product'` branch creates a `Subscriptions` row without checking whether the product is recurring.

- Observation: Running `npm test` directly from the Windows UNC path for `mvp-site` fails before Jest starts because `cmd.exe` does not support UNC working directories.
  Evidence: `npm test -- --runInBand ...` failed with `CMD.EXE was started with the above path as the current directory. UNC paths are not supported. Defaulting to Windows directory.` The tests passed when rerun inside WSL with `wsl bash -lc`.

## Decision Log

- Decision: Model one-time products by adding `SINGLE` to the product period enum instead of inventing a second “product type” column.
  Rationale: The user explicitly asked for “billing period should also have SINGLE for a single purchase and no repeating billing.” This keeps recurrence rules in one field that both the UI and Stripe sync helpers can branch on.
  Date/Author: 2026-04-08 / Codex

- Decision: Keep subscription-specific persistence in `Subscriptions` limited to recurring products only.
  Rationale: One-time purchases already produce bills, bill payments, and receipt emails through the generic payment-intent flow. Creating a subscription mirror for one-time products is semantically incorrect and would pollute profile membership screens in both clients.
  Date/Author: 2026-04-08 / Codex

- Decision: Expand product tax categories in a backward-compatible way by keeping existing values and adding a small set of new product-specific categories.
  Rationale: Existing `ONE_TIME_PRODUCT`, `SUBSCRIPTION`, and `NON_TAXABLE` values may already exist in data. Adding a few new categories for day-pass and equipment-rental style products satisfies the request without forcing immediate data cleanup.
  Date/Author: 2026-04-08 / Codex

- Decision: Hardcode the Stripe tax-code mapping in `mvp-site` instead of sourcing it from env vars.
  Rationale: The repo had no canonical env values checked in, so the env-based lookup only added config drift and failure modes. The hardcoded mapping now uses Stripe's general services code for service-like categories, Stripe's general tangible-goods code for the generic one-time product bucket, and Stripe's non-taxable code for explicit non-taxable items.
  Date/Author: 2026-04-08 / Codex

- Decision: Keep the persisted `taxCategory` field internal, but move all user-facing authoring to a derived `productType` model.
  Rationale: This avoids a cross-repo schema rename while still removing tax-code language from the admin UI. The organization page and product API now accept/display type labels such as `Membership`, `Merchandise`, `Day pass`, and `Equipment rental`, and then derive the stored tax behavior from that choice.
  Date/Author: 2026-04-08 / Codex

## Outcomes & Retrospective

Implemented the cross-repo split between recurring and one-time store products.

- `mvp-site` now supports `SINGLE` products end to end. Product creation/edit accepts `single`, Stripe product sync only creates recurring Stripe prices for recurring periods, the organization store page says `Add product`, and owners can pick `Single purchase`, `Day pass`, and `Equipment rental` tax categories in addition to the existing options.
- `mvp-site` now supports `SINGLE` products end to end. Product creation/edit accepts `single`, Stripe product sync only creates recurring Stripe prices for recurring periods, the organization store page says `Add product`, and owners now pick a product type instead of a tax category. The selected type drives the stored tax behavior.
- The `mvp-site` checkout flow now branches correctly. Recurring products still use `/api/products/[id]/subscriptions`, but `SINGLE` products use the generic product payment-intent flow and only create a paid bill plus bill payment after the webhook completes.
- The webhook no longer creates local `Subscriptions` rows for generic product payments. Recurring product subscriptions are still mirrored through the Stripe subscription webhook path, which keeps membership behavior intact without polluting subscriptions with one-time purchases.
- `mvp-app` now deserializes the expanded tax categories, routes `SINGLE` products through `createProductPurchaseIntent(...)`, shows a one-time success message after payment, and renders one-time products without a recurring `/ month|week|year` label.
- The product API is now tighter than the UI change alone: invalid combinations like `Membership + Single purchase` or `Merchandise + Monthly` are rejected at the route layer, so direct API callers cannot bypass the guardrails by posting tax-category values manually.

Validation completed:

1. `wsl bash -lc "cd /home/camka/Projects/MVP/mvp-site && npm test -- --runInBand src/app/api/billing/__tests__/webhookRoute.test.ts src/lib/__tests__/productService.test.ts"`
   Result: passed.
2. `wsl bash -lc "cd /home/camka/Projects/MVP/mvp-site && npx eslint 'src/app/organizations/[id]/page.tsx' 'src/app/api/products/route.ts' 'src/app/api/products/[id]/route.ts' 'src/app/api/products/[id]/subscriptions/route.ts' 'src/app/api/billing/webhook/route.ts'"`
   Result: passed.
3. `.\gradlew.bat :composeApp:compileCommonMainKotlinMetadata`
   Result: passed.
4. `wsl bash -lc "cd /home/camka/Projects/MVP/mvp-site && npm test -- --runInBand src/lib/__tests__/stripeTax.test.ts src/app/api/billing/__tests__/webhookRoute.test.ts src/lib/__tests__/productService.test.ts"`
   Result: passed.
5. `wsl bash -lc "cd /home/camka/Projects/MVP/mvp-site && npx eslint 'src/lib/stripeTax.ts' 'src/lib/__tests__/stripeTax.test.ts'"`
   Result: passed.
6. `wsl bash -lc "cd /home/camka/Projects/MVP/mvp-site && npm test -- --runInBand src/lib/__tests__/productTypes.test.ts src/lib/__tests__/productService.test.ts src/lib/__tests__/stripeTax.test.ts src/app/api/billing/__tests__/webhookRoute.test.ts"`
   Result: passed.
7. `wsl bash -lc "cd /home/camka/Projects/MVP/mvp-site && npx eslint 'src/app/organizations/[id]/page.tsx' 'src/app/api/products/route.ts' 'src/app/api/products/[id]/route.ts' 'src/lib/productService.ts' 'src/lib/productTypes.ts' 'src/lib/__tests__/productTypes.test.ts' 'src/lib/__tests__/productService.test.ts' 'src/lib/stripeTax.ts' 'src/lib/__tests__/stripeTax.test.ts'"`
   Result: passed.

One verification misstep occurred during implementation:

- `.\gradlew.bat :composeApp:compileKotlinJvm` is not a valid task in this multiplatform project. I queried `:composeApp:tasks --all` and switched to `:composeApp:compileCommonMainKotlinMetadata` for the actual shared-code verification pass.

## Context and Orientation

There are two repositories involved in this feature.

The current workspace is `mvp-app` at `C:\Users\samue\StudioProjects\mvp-app`. Its shared Kotlin Multiplatform code lives under `composeApp/src/commonMain/kotlin/com/razumly/mvp`. The organization store screen and purchase logic live mainly in:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponent.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailScreen.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Product.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/ProductDTO.kt`

The source of truth for backend routes and web admin behavior is `mvp-site` at `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site`. The store product schema, Stripe helpers, API routes, and organization page live mainly in:

- `prisma/schema.prisma`
- `src/types/index.ts`
- `src/lib/productService.ts`
- `src/lib/stripeProducts.ts`
- `src/lib/stripeTax.ts`
- `src/lib/purchaseContext.ts`
- `src/server/purchaseReceipts.ts`
- `src/app/api/products/route.ts`
- `src/app/api/products/[id]/route.ts`
- `src/app/api/products/[id]/subscriptions/route.ts`
- `src/app/api/billing/purchase-intent/route.ts`
- `src/app/api/billing/webhook/route.ts`
- `src/app/organizations/[id]/page.tsx`

In the current code, recurring products are effectively assumed everywhere:

- `ProductsPeriodEnum` only allows `WEEK`, `MONTH`, and `YEAR`.
- The organization page copy says “Add membership product”.
- The `mvp-site` organization page always calls `productService.createSubscriptionCheckout(...)`.
- The KMP app always calls `createProductSubscriptionIntent(...)`.
- The Stripe webhook creates a local subscription mirror for any product payment, even when the payment came from the one-time `purchase-intent` flow.

This plan keeps the API contract aligned with `mvp-site`, then updates `mvp-app` to consume that contract.

## Plan of Work

First, update the server-side product model in `mvp-site`. Add `SINGLE` to the Prisma `ProductsPeriodEnum` and generate a matching migration under `prisma/migrations/`. Update the TypeScript `ProductPeriod` union in `src/types/index.ts` and the normalization helpers in `src/lib/productService.ts` so `single`, `SINGLE`, and any legacy casing normalize consistently. Extend the product tax category union to include a few new store-specific choices while preserving existing values for backward compatibility.

Next, update Stripe and tax resolution in `mvp-site`. In `src/lib/stripeProducts.ts`, stop treating every product as recurring. Add helpers that can tell whether a product period is recurring, only create Stripe recurring prices for recurring periods, and still keep the Stripe product metadata/tax code in sync for one-time products. In `src/lib/stripeTax.ts` and `src/lib/purchaseContext.ts`, map the new product tax categories to internal tax categories and Stripe tax-code environment variables with safe development fallbacks. In `src/server/purchaseReceipts.ts`, render `SINGLE` as a one-time purchase label instead of a recurring billing label.

Then, update the `mvp-site` API routes and organization page. The create and edit product routes at `src/app/api/products/route.ts` and `src/app/api/products/[id]/route.ts` must accept the expanded enums and only create recurring Stripe prices when the product period is recurring. The subscription route at `src/app/api/products/[id]/subscriptions/route.ts` must reject `SINGLE` products with a clear error so callers cannot accidentally start a subscription for a one-time item. The organization page at `src/app/organizations/[id]/page.tsx` must rename the card to “Add product”, update the explanatory copy, offer `Single purchase` in both create/edit forms, offer the richer tax-category options, render one-time items without `/ period` copy, and branch checkout so `SINGLE` products call the generic one-time product payment intent path while recurring products keep using the subscription path.

After that, fix webhook behavior in `src/app/api/billing/webhook/route.ts`. Keep instant bill creation and receipt sending for one-time product payments, but only create or sync a local `Subscriptions` row when the purchased product is actually recurring. This preserves membership behavior while preventing one-time products from leaking into profile subscription lists.

Finally, update the KMP app. In `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Product.kt`, `ProductDTO.kt`, and `BillingRepository.kt`, allow `SINGLE` periods and any new tax categories to deserialize cleanly. In `OrganizationDetailComponent.kt`, choose `createProductPurchaseIntent(product.id)` for `SINGLE` products and keep `createProductSubscriptionIntent(product.id)` for recurring products, with success messages that distinguish one-time purchases from subscriptions. In `OrganizationDetailScreen.kt`, change the store card display so one-time products show a one-time price label instead of `price / period`.

## Concrete Steps

Work from `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site` when editing or testing the web/backend repository.

1. Update `prisma/schema.prisma` and add a new migration for the `ProductsPeriodEnum` and product tax-category enum changes.
2. Update the TypeScript product types, service normalization, Stripe/tax helpers, webhook logic, and organization page in `mvp-site`.
3. Run focused web tests:

    npm test -- --runInBand src/lib/__tests__/productService.test.ts src/lib/__tests__/paymentService.test.ts src/app/api/billing/__tests__/purchaseIntentRoute.test.ts src/app/api/billing/__tests__/webhookRoute.test.ts

4. From `C:\Users\samue\StudioProjects\mvp-app`, update the Kotlin product models, repository parsing, and organization store purchase UI/logic.
5. Run a focused app build or test command that exercises the changed shared code without touching iOS tasks:

    .\gradlew :composeApp:testDebugUnitTest

The exact commands and outcomes will be updated here after execution.

## Validation and Acceptance

Acceptance is behavior-based:

1. Creating a store product in `mvp-site` allows selecting `Single purchase` as the billing period and the new tax categories in both the create card and edit modal.
2. Saving a `SINGLE` product succeeds and stores `period: SINGLE` in the API response and Prisma row.
3. Attempting to use the subscription route for a `SINGLE` product returns a clear client error instead of silently creating a recurring Stripe subscription.
4. Buying a recurring product still returns subscription checkout data and still results in a `Subscriptions` mirror row after Stripe completion.
5. Buying a `SINGLE` product uses the generic product payment-intent flow and does not create a `Subscriptions` row in the webhook handler.
6. In `mvp-app`, the organization store screen shows one-time products without `/ month|week|year` text and successfully starts checkout for both recurring and one-time products.

## Idempotence and Recovery

The Prisma migration must be additive and safe to apply once. Enum additions are non-destructive, so retrying the migration is safe if it fails before commit. Stripe sync changes must tolerate existing products that already have Stripe IDs. The implementation should continue to accept legacy tax-category values and legacy non-`SINGLE` periods so existing data remains valid.

If a partial code change breaks checkout, the safe rollback is to revert the modified route/component files together rather than reverting only the UI. The product period and webhook logic are tightly coupled: do not ship one without the other.

## Artifacts and Notes

Evidence gathered before implementation:

    mvp-site/src/app/organizations/[id]/page.tsx currently renders:
      "Add membership product"
      "Create a recurring membership product that users can purchase."

    mvp-site/src/app/api/products/[id]/subscriptions/route.ts currently assumes all products are memberships.

    mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponent.kt currently sets:
      _message.value = "Subscription started for ${pendingProduct.name}."
      billingRepository.createProductSubscriptionIntent(product.id)

    mvp-site/src/app/api/billing/webhook/route.ts currently creates a local subscription row for any `purchase_type === 'product'`.

## Interfaces and Dependencies

At the end of this work, these interfaces and behaviors must exist:

- `mvp-site/prisma/schema.prisma`
  `enum ProductsPeriodEnum` includes `SINGLE`.

- `mvp-site/src/types/index.ts`
  `type ProductPeriod = 'single' | 'week' | 'month' | 'year'`
  `Product['taxCategory']` includes the expanded store-product tax categories.

- `mvp-site/src/lib/stripeProducts.ts`
  Product sync helpers must expose a clear branch between recurring and one-time products so only recurring products create Stripe recurring prices.

- `mvp-site/src/app/api/products/[id]/subscriptions/route.ts`
  The route must reject one-time products and remain valid for recurring products.

- `mvp-site/src/app/api/billing/webhook/route.ts`
  Local subscription mirroring must occur only for recurring products.

- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Product.kt`
  The `Product` model must accept `SINGLE` periods and the expanded tax categories.

- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponent.kt`
  Product purchase routing must branch between one-time and recurring flows based on the product period.

Revision note: created this ExecPlan after repository research to guide a coordinated cross-repo implementation for single-purchase store products, richer tax categories, and correct recurring-vs-one-time checkout behavior.
