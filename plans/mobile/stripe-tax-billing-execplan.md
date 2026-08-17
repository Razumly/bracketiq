# Stripe Tax Billing For One-Time Payments And Memberships

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with `PLANS.md` at the repository root of `mvp-app`. This work spans two repositories: `mvp-app` at `C:\Users\samue\StudioProjects\mvp-app` and `mvp-site` at `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site`.

## Purpose / Big Picture

After this change, a user buying an event registration, rental, bill payment, or organization product can see sales tax before paying, and the total charged by Stripe will be based on a server-side Stripe Tax calculation instead of a locally inferred amount. The same billing address can be reused across purchases, and the payment UI can prefill that address instead of asking for it every time. Memberships also move toward real Stripe Billing ownership on the platform account instead of the current local-only subscription rows.

The first observable milestone is one-time payments. A signed-in user with a saved billing address should be able to request a payment preview, see a `Tax` line plus the merged Stripe fee line, and then pay the exact quoted total with the existing Payment Element on web or PaymentSheet on Android. The second observable milestone is recurring memberships backed by Stripe Billing.

## Progress

- [x] (2026-04-07 18:55Z) Created `codex/stripe-tax-billing` from the current branch in both repositories so implementation can proceed without touching the user’s existing branches.
- [x] (2026-04-07 19:20Z) Audited the current state. `mvp-site` creates platform-side PaymentIntents in `src/app/api/billing/purchase-intent/route.ts`, creates only local product rows in `src/app/api/products/route.ts`, and creates only local subscription rows in `src/app/api/products/[id]/subscriptions/route.ts` and `src/app/api/billing/webhook/route.ts`.
- [x] (2026-04-07 19:35Z) Verified the installed Stripe SDK supports `tax.calculations.create` and PaymentIntent `hooks.inputs.tax.calculation`, which lets the current custom one-time payment flow stay on PaymentIntents while still letting Stripe own the tax transaction lifecycle.
- [x] (2026-04-08 01:10Z) Implemented one-time billing-address persistence and tax-preview APIs in `mvp-site`. Added normalized billing-address storage on `SensitiveUserData`, the authenticated billing-address route, and a shared Stripe tax-calculation helper stack.
- [x] (2026-04-08 01:40Z) Updated `mvp-site` one-time purchase intent creation to require and reuse the server-side tax calculation. `purchase-intent` now resolves the taxable context, computes tax server-side, persists tax metadata, and creates PaymentIntents from the quoted total.
- [x] (2026-04-08 02:05Z) Added product tax category storage and Stripe-facing recurring product metadata for organization products in `mvp-site`. Product create/update now sync platform Stripe Products and recurring Prices with backend-owned tax-category mapping.
- [x] (2026-04-08 02:25Z) Updated `mvp-site` web payment previews to render tax explicitly, merge the Stripe Tax service fee into the displayed Stripe fee line, prompt for a missing billing address, and prefill the Payment Element from the saved billing profile.
- [x] (2026-04-08 02:45Z) Updated `mvp-app` shared data contracts, repositories, and PaymentSheet setup to use billing addresses and tax-aware fee breakdowns. Android now prompts for a missing billing address and prefills full billing details when present.
- [x] (2026-04-08 03:05Z) Replaced the local-only membership purchase flow with real Stripe Billing primitives in `mvp-site`. Product subscription checkout now creates a Stripe subscription with automatic tax, local subscription rows mirror Stripe state, and billing webhooks process subscription/invoice events.
- [x] (2026-04-08 03:20Z) Updated the web and Android callers to use the new subscription checkout path. Web organization purchases and app membership purchases now request the Stripe subscription intent instead of creating a one-time product charge and a local-only subscription row.
- [x] (2026-04-08 03:35Z) Validated the changed paths. `mvp-site` passes `npx tsc --noEmit` and focused Jest suites for participants, payment service, and product service. `mvp-app` passes `.\gradlew :composeApp:compileDebugKotlinAndroid --console=plain` on Windows. Full `mvp-site` lint is still blocked by a pre-existing unrelated failure in `src/app/events/[id]/schedule/__tests__/page.test.tsx:82`.
- [x] (2026-04-08 04:05Z) Added editable billing-address profile surfaces in both repos. `mvp-site` profile now loads, displays, and saves billing-address fields in the profile UI, and `mvp-app` Profile now exposes a dedicated Billing Address action that opens the existing cross-platform billing-address editor directly from the profile surface.

## Surprises & Discoveries

- Observation: The current “subscription” system is not Stripe Billing. It is a one-time product PaymentIntent plus a local `subscriptions` row that is written either by `POST /api/products/[id]/subscriptions` or by the payment webhook.
  Evidence: `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site\src\app\api\products\[id]\subscriptions\route.ts` writes Prisma rows only, and `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site\src\app\api\billing\webhook\route.ts` creates local subscription rows on `payment_intent.succeeded`.
- Observation: The current Stripe customer mapping already exists in `StripeAccounts.customerId`, so billing-address work should reuse that table instead of creating a second customer lookup.
  Evidence: `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site\src\app\api\billing\customer\route.ts` finds or creates the Stripe customer and persists `customerId` on `stripeAccounts`.
- Observation: The installed Stripe SDK already exposes PaymentIntent tax hooks, so one-time flows do not need a separate manual `tax.transactions.createFromCalculation` call if the PaymentIntent is created with the calculation hook.
  Evidence: `node_modules/stripe/types/PaymentIntentsResource.d.ts` defines `hooks.inputs.tax.calculation`.
- Observation: The event join endpoint was still receiving stale checkout-context fields from the web client (`event`, `timeSlot`, `organization`) even though the participants route no longer accepts them.
  Evidence: `src/lib/paymentService.ts` was serializing those legacy fields into join and leave payloads, and `src/app/api/events/[eventId]/participants/route.ts` correctly rejected them with `400 Invalid input` once strict validation was restored.
- Observation: Web checkout had no billing-address recovery path even after the backend started requiring one, so missing billing data surfaced as a hard API failure until the UI added a billing-address prompt and retry flow.
  Evidence: `src/app/api/billing/purchase-intent/route.ts` and `src/app/api/products/[id]/subscriptions/route.ts` returned `billingAddressRequired: true`, but no web component handled that field before `src/components/ui/BillingAddressModal.tsx` and the EventDetail/Organization integrations were added.

## Decision Log

- Decision: Keep one-time payments on the current custom PaymentIntent architecture instead of moving web immediately to Checkout.
  Rationale: The user explicitly wants to keep the current stack, and the installed Stripe SDK supports PaymentIntent tax hooks, which removes the need for a hosted Checkout migration for the first milestone.
  Date/Author: 2026-04-07 / Codex
- Decision: Store billing address fields as separate columns on `SensitiveUserData` rather than a single address string.
  Rationale: The payment UI and Stripe Tax both need discrete address fields such as line 1, city, state, postal code, and country. Separate fields also let the app prefill Billing Details directly.
  Date/Author: 2026-04-07 / Codex
- Decision: Keep Stripe products, prices, customers, and subscriptions on the platform account.
  Rationale: Current one-time charges are platform-side, tax liability for this rollout is platform-side, and connected organization accounts are not currently the billing object owner.
  Date/Author: 2026-04-07 / Codex
- Decision: Make product tax categories internal enums and map them to Stripe tax code environment variables on the backend.
  Rationale: Product managers and organization staff should choose from curated business categories, not raw Stripe tax-code identifiers, and exact tax-code assignments still need tax-advisor confirmation.
  Date/Author: 2026-04-07 / Codex

## Outcomes & Retrospective

The implementation now covers both planned milestones at compile/test level.

- One-time payments now store normalized billing addresses, calculate tax on the server, persist Stripe tax metadata, display tax explicitly, and recover from missing billing data on both Android and web.
- Membership purchases now create real Stripe subscriptions on the platform account, confirm the first invoice with the existing payment UI surfaces, and mirror Stripe subscription state locally through webhooks instead of creating local-only rows after a one-time payment.

The remaining work is operational rather than structural: run broader manual Stripe test-mode verification, confirm the final Stripe tax-code mappings with a tax advisor, and clean up unrelated repository lint/test debt that already predates this branch.

## Context and Orientation

`mvp-site` is the backend and web client source of truth for billing APIs and shared payment contracts. The one-time purchase entry point is `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site\src\app\api\billing\purchase-intent\route.ts`. This route currently derives a base amount from an event, rental, bill, or product, applies `calculateMvpAndStripeFees` from `src/lib/billingFees.ts`, and creates a plain PaymentIntent with metadata only.

The current Stripe customer mapping already exists in `StripeAccounts`, and the customer bootstrap route is `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site\src\app\api\billing\customer\route.ts`. `SensitiveUserData` currently stores only `email`, so billing addresses need new columns and a new authenticated API surface. The Prisma schema entries that matter most are `SensitiveUserData`, `Products`, `Subscriptions`, `BillPayments`, and `StripeAccounts` in `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site\prisma\schema.prisma`.

`mvp-app` consumes the `mvp-site` routes directly. The current Android and shared payment flow lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt` and `composeApp/src/androidMain/kotlin/com/razumly/mvp/core/presentation/PaymentProcessor.android.kt`. The app currently asks the backend for a purchase intent, then presents PaymentSheet using only name and email as default billing details. Contract changes must therefore be made in `mvp-site` first and mirrored in `mvp-app`.

In this plan, “tax preview” means a server response that contains the subtotal, the MVP fee, the Stripe processing fee, the Stripe Tax service fee, the sales tax amount, and the total amount the user will be charged. “Tax category” means an internal business category such as `EVENT_PARTICIPANT`, `RENTAL`, or `ONE_TIME_PRODUCT`, not a raw Stripe tax code string. “Billing address” means separate address fields stored on `SensitiveUserData`.

## Plan of Work

The first milestone is one-time payments. In `mvp-site`, extend `SensitiveUserData` with billing-address columns and expose `GET` and `PATCH` handlers under `src/app/api/profile/billing-address/route.ts`. Add a Stripe-tax helper module under `src/lib` or `src/server` that validates a US billing address, resolves the internal tax category, looks up the Stripe customer, and creates a Stripe Tax calculation with one line item. Use environment variables for Stripe tax-code mappings so the implementation stays deployable before the final legal tax-code review.

After the helper exists, update `src/app/api/billing/purchase-intent/route.ts` to stop calculating the final amount locally. It should still resolve the base amount and reserve event or rental capacity, but it must call the shared tax calculation helper before creating the PaymentIntent. The PaymentIntent amount must come from the Stripe calculation, and the request must pass `hooks.inputs.tax.calculation` so Stripe links the eventual charge to the tax calculation. The route response must extend `FeeBreakdown` to include `taxAmount` and use a merged user-facing `stripeFee` line that equals the Stripe processing fee plus the Stripe Tax service fee.

Once the server-side one-time flow is correct, update the web payment UI in `mvp-site`. `src/lib/paymentService.ts`, `src/components/ui/PriceWithFeesPreview.tsx`, and `src/components/ui/PaymentModal.tsx` must request and render the new tax preview fields. The UI should show `Tax` explicitly and keep `Stripe fee` as the merged line.

In `mvp-app`, update the shared models for `SensitiveUserData`, `Product`, `Subscription`, `PurchaseIntent`, and `FeeBreakdown`. Then update `BillingRepository.kt` to read and write the billing address, request tax previews before starting payment, and consume the extended purchase-intent response. `PaymentProcessor.android.kt` must prefill line1, city, state, postal code, and country in PaymentSheet when they exist.

The second milestone is memberships. In `mvp-site`, change product creation and update flows to persist a curated tax category and create or update platform Stripe Products and Prices. Replace the current local-only `POST /api/products/[id]/subscriptions` behavior with real Stripe Billing creation using the platform customer, the platform product price, and automatic tax. The local `Subscriptions` table becomes a mirror keyed by Stripe subscription identifiers, and the billing webhook must process subscription and invoice events instead of only `payment_intent.succeeded`. The app then stops treating membership purchase as a one-time product payment followed by a local row insert.

## Concrete Steps

Work in `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site` for backend and web edits.

1. Update `prisma/schema.prisma` with billing-address columns on `SensitiveUserData`, a product tax-category field, and any Stripe subscription mirror fields required by the first membership pass.
2. Add a new Prisma migration under `prisma/migrations/<timestamp>_stripe_tax_billing/`.
3. Add tax and billing-address helper modules under `src/lib` or `src/server`.
4. Add `src/app/api/profile/billing-address/route.ts`.
5. Add `src/app/api/billing/tax-preview/route.ts`.
6. Patch `src/app/api/billing/purchase-intent/route.ts` to use the new tax helper and PaymentIntent tax hook.
7. Patch `src/app/api/billing/customer/route.ts` so it can update Stripe customer address details from `SensitiveUserData`.
8. Patch `src/app/api/products/route.ts`, `src/app/api/products/[id]/route.ts`, and `src/app/api/products/[id]/subscriptions/route.ts` for tax categories and the Stripe Billing migration.
9. Patch `src/app/api/billing/webhook/route.ts` to process the new tax and subscription metadata.

Work in `C:\Users\samue\StudioProjects\mvp-app` for client and Android edits.

1. Update the shared data classes and DTOs under `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data`.
2. Update `BillingRepository.kt` to call the new billing-address and tax-preview endpoints.
3. Update payment preview and purchase UI so the tax line is visible before payment.
4. Update `PaymentProcessor.android.kt` to pass full billing details into PaymentSheet defaults.
5. Replace the local membership-creation callback with the new subscription endpoint once the backend supports it.

Commands used so far:

    cd C:\Users\samue\StudioProjects\mvp-app
    git switch -c codex/stripe-tax-billing

    cd \\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site
    git switch -c codex/stripe-tax-billing

Commands planned for validation:

    cd \\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site
    npm test -- --runInBand

    cd C:\Users\samue\StudioProjects\mvp-app
    .\gradlew :composeApp:testDebugUnitTest

## Validation and Acceptance

One-time payment acceptance is the first gate. A signed-in user with no saved billing address should be prompted to supply billing line 1, city, state, postal code, and country before payment preview is shown. After saving that address, repeating the same purchase should prefill the address and show a preview with `eventPrice`, `processingFee`, `stripeFee`, `taxAmount`, and `totalCharge`. Paying the previewed amount should create a PaymentIntent whose amount equals the Stripe Tax calculation total and whose metadata includes the calculation identifier and tax amount.

Product acceptance for the first pass is that organization staff can create or update a product with a curated tax category, and the API stores that category alongside the product. Membership acceptance is that purchasing a recurring product creates a real Stripe subscription on the platform account and syncs the local subscription mirror from Stripe-owned state, not from a one-time payment callback.

Automated proof should include route tests in `mvp-site` for billing-address persistence and tax previews, plus app and Android tests for the new shared data contracts and PaymentSheet billing defaults. If any piece cannot be proven in a test because Stripe live calls are mocked, the plan must include a short manual verification transcript using test mode.

## Idempotence and Recovery

The schema and route work should be additive. Re-running the new billing-address `PATCH` should overwrite the same `SensitiveUserData` row for the signed-in user instead of creating duplicates. Re-running a tax preview should create a fresh Stripe Tax calculation but must not reserve duplicate event or rental capacity, because preview does not commit the purchase. `purchase-intent` must continue to release reserved event or rental state if Stripe PaymentIntent creation fails. If Stripe product or price creation for memberships fails, the local product update must not partially mark the row as Stripe-backed.

If the Prisma migration fails in development, reset only the in-progress migration directory and regenerate it; do not hand-edit prior migrations. If a Stripe tax-code environment variable is missing, the API should fail with a clear configuration error rather than silently charging with the wrong tax assumptions.

## Artifacts and Notes

Important current-state evidence:

    src/app/api/billing/purchase-intent/route.ts
      - derives `amountCents` from event, rental, or product
      - applies `calculateMvpAndStripeFees`
      - creates `stripe.paymentIntents.create({ amount: totalChargeCents, ... })`

    src/app/api/products/[id]/subscriptions/route.ts
      - creates a local Prisma `subscriptions` row only

    src/app/api/billing/webhook/route.ts
      - ignores every Stripe event except `payment_intent.succeeded`
      - creates a local `subscriptions` row when `purchase_type === 'product'`

Stripe SDK evidence already confirmed in the installed dependency:

    node_modules/stripe/types/Tax/CalculationsResource.d.ts
      - exposes `stripe.tax.calculations.create`

    node_modules/stripe/types/PaymentIntentsResource.d.ts
      - exposes `hooks.inputs.tax.calculation`

## Interfaces and Dependencies

Use the existing `stripe` Node SDK already installed in `mvp-site`. The backend must expose these stable interfaces by the end of the first milestone:

In `mvp-site/src/lib/stripeTax.ts`, define functions with this shape:

    export type BillingAddress = {
      line1: string;
      line2?: string | null;
      city: string;
      state: string;
      postalCode: string;
      countryCode: string;
    };

    export type InternalTaxCategory =
      | 'EVENT_PARTICIPANT'
      | 'EVENT_SPECTATOR'
      | 'RENTAL'
      | 'SUBSCRIPTION'
      | 'ONE_TIME_PRODUCT'
      | 'NON_TAXABLE';

    export type TaxQuote = {
      calculationId: string;
      subtotalCents: number;
      processingFeeCents: number;
      stripeProcessingFeeCents: number;
      stripeTaxServiceFeeCents: number;
      combinedStripeFeeCents: number;
      taxAmountCents: number;
      totalChargeCents: number;
      hostReceivesCents: number;
      purchaseType: string;
      taxCategory: InternalTaxCategory;
    };

    export async function calculateTaxQuote(params: { ... }): Promise<TaxQuote>;

In `mvp-site/src/app/api/profile/billing-address/route.ts`, expose:

    GET -> { billingAddress: BillingAddress | null }
    PATCH -> { billingAddress: BillingAddress }

In `mvp-site/src/app/api/billing/tax-preview/route.ts`, expose:

    POST -> {
      feeBreakdown: {
        eventPrice: number;
        processingFee: number;
        stripeFee: number;
        taxAmount: number;
        totalCharge: number;
        hostReceives: number;
        feePercentage: number;
        purchaseType?: string;
      };
      taxCalculationId: string;
      taxCategory: InternalTaxCategory;
    }

In `mvp-app`, mirror those shapes in Kotlin data classes so the app treats `taxAmount` as first-class data instead of a derived local value.

Revision note: 2026-04-07. Created the initial cross-repo ExecPlan after confirming the current local subscription model and the installed Stripe SDK support for PaymentIntent tax hooks, so the implementation can proceed backend-first without losing the larger migration context.
