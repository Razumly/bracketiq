# Restore Discover Organizations Tab and Add Organization Detail Screen

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, the Discover screen once again has an Organizations tab, and selecting an organization opens a dedicated Organization detail screen in the app. Every viewer sees the same read-only organization view, with tabs for Overview, Events, Teams, Rentals, and Store. The Rentals tab lets users inspect availability and proceed into the existing rental-create flow, and the Store tab lists membership products with purchase flow, matching the behavior found in the web app's organization page.

## Progress

- [x] (2026-02-14 19:40Z) Create Organization detail feature scaffolding (component, screen, navigation route) and wire it into the root app stack.
- [x] (2026-02-14 19:40Z) Restore Discover Organizations tab and wire organization selection to the new Organization detail screen.
- [x] (2026-02-14 19:55Z) Align data contracts: extend organization payloads (teamIds) and add product listing + product purchase endpoints in the mobile repositories.
- [x] (2026-02-14 20:10Z) Implement Organization screen tabs (Overview, Events, Teams, Rentals, Store) with read-only UI and rental/store flows.
- [x] (2026-02-14 20:20Z) Validate (compile/check) and document any blockers.

## Surprises & Discoveries

- Observation: The new Organization detail UI initially failed to compile because the EventCard composable does not accept onClick or modifier arguments and the delegated organization state prevented smart casts.
  Evidence: Gradle compile errors about missing EventCard parameters and smart casts were resolved by wrapping EventCard in a clickable Card and caching the organization in a local val.

## Decision Log

- Decision: Reuse the existing EventCard and keep its map button visible, wiring the map click to a no-op in Organization detail lists.
  Rationale: Avoids introducing a new event list item UI or refactoring EventCard while still enabling event navigation via surrounding Card click.
  Date/Author: 2026-02-14 / Codex

## Outcomes & Retrospective

Organization discovery now includes a dedicated Organizations tab and search suggestions, and organization selection navigates to a new read-only Organization detail screen with Overview, Events, Teams, Rentals, and Store tabs. The Rentals tab reuses the existing availability selector to seed Create Event, and Store lists products with the purchase/subscription flow. Common Kotlin metadata compilation completed successfully on Windows with existing warnings unrelated to this change.

## Context and Orientation

Discover and search UI live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt` and are driven by `EventSearchComponent` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchComponent.kt`. Organizations and rentals are already represented as `Organization` data in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Organization.kt` with `fieldIds` and `productIds`, but no organization detail screen exists yet. Navigation is owned by `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/RootComponent.kt` and routed via `AppConfig` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/AppConfig.kt`.

The web reference implementation is `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site\src\app\organizations\[id]\page.tsx`, which shows tabs for Overview, Events, Teams, Fields (rentals), and Store for non-owners. We will mirror those behaviors for all viewers in mobile (read-only, no owner-only edit actions).

## Plan of Work

First, add a new Organization detail route to `AppConfig`, `INavigationHandler`, and `RootComponent`, and create a new Organization detail component + screen under `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/`. The component will load organization data, events, teams, fields/rentals, and products, and expose them via StateFlows. The screen will render the new tabbed UI and wire actions like "view event" and "purchase product."

Second, update Discover to re-enable an Organizations tab. Use `EventSearchComponent` to load organization lists and drive Discover's organization list and search suggestions. Selecting an organization will call the new navigation handler to push the Organization detail screen.

Third, align the data contract with the backend by extending the Organization data model to include `teamIds`, and add BillingRepository support for listing products by organization plus initiating product purchases and subscriptions, following the web flow (`/api/billing/purchase-intent` + `/api/products/{id}/subscriptions`).

Fourth, reuse the existing rental selection UI from Discover (the weekly selector and timeline grid) inside the Organization Rentals tab so users can preview availability and proceed to Create Event with rental defaults.

Finally, validate compilation (or record blockers) and update this plan's progress, decision log, and outcomes.

## Concrete Steps

1. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/AppConfig.kt` to add `OrganizationDetail` config.
2. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/INavigationHandler.kt` and `RootComponent.kt` to add `navigateToOrganization` and route handling, then wire the new child in `App.kt`.
3. Add `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponent.kt` and `OrganizationDetailScreen.kt`, and register the component in `composeApp/src/commonMain/kotlin/com/razumly/mvp/di/ComponentModule.kt`.
4. Extend organization data models to include `teamIds` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Organization.kt` and the API DTO in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`.
5. Add BillingRepository methods for listing products by organization and purchasing products, plus any DTOs needed.
6. Update `EventSearchComponent.kt` + `EventSearchScreen.kt` to re-enable the Organizations tab and wire organization selection to `navigateToOrganization`.
7. Extract or expose the rental selection UI to reuse in Organization Rentals tab; wire the Rentals tab to the same rental create context as Discover.
8. Run `./gradlew :composeApp:compileCommonMainKotlinMetadata` and record results.

## Validation and Acceptance

Acceptance requires:

- Discover shows `Events`, `Organizations`, and `Rentals` tabs, and organizations can be searched and opened.
- Tapping an organization opens a read-only Organization screen with tabs for Overview, Events, Teams, Rentals, and Store.
- Events and Teams tabs show lists populated from organization data and allow navigation to event detail.
- Store tab lists products and allows purchase via the payment flow, creating a subscription on success.
- Rentals tab shows rental availability and allows creating a rental-based event via existing Create flow.
- `./gradlew :composeApp:compileCommonMainKotlinMetadata` succeeds, or blockers are documented.

## Idempotence and Recovery

All changes are source-only. Re-running the steps is safe; if a step fails, fix the compile error and re-run the build validation. No destructive operations are involved.

## Artifacts and Notes

`.\gradlew :composeApp:compileCommonMainKotlinMetadata` completed with warnings about disabled iOS targets and deprecated APIs (pre-existing).

## Interfaces and Dependencies

At completion, the following interfaces and signatures must exist:

- In `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/AppConfig.kt`:

    data class OrganizationDetail(val organizationId: String) : AppConfig()

- In `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/INavigationHandler.kt`:

    fun navigateToOrganization(organizationId: String)

- In `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponent.kt`:

    interface OrganizationDetailComponent : IPaymentProcessor {
        val organization: StateFlow<Organization?>
        val events: StateFlow<List<Event>>
        val teams: StateFlow<List<TeamWithPlayers>>
        val products: StateFlow<List<Product>>
        val rentalFieldOptions: StateFlow<List<RentalFieldOption>>
        val rentalBusyBlocks: StateFlow<List<RentalBusyBlock>>
        val isLoadingOrganization: StateFlow<Boolean>
        val isLoadingEvents: StateFlow<Boolean>
        val isLoadingTeams: StateFlow<Boolean>
        val isLoadingProducts: StateFlow<Boolean>
        val isLoadingRentals: StateFlow<Boolean>
        val errorState: StateFlow<ErrorMessage?>
        val message: StateFlow<String?>
        fun setLoadingHandler(handler: LoadingHandler)
        fun refreshOrganization(force: Boolean = false)
        fun refreshEvents(force: Boolean = false)
        fun refreshTeams(force: Boolean = false)
        fun refreshProducts(force: Boolean = false)
        fun refreshRentals(force: Boolean = false)
        fun clearRentalData()
        fun startProductPurchase(product: Product)
        fun startRentalCreate(context: RentalCreateContext)
        fun viewEvent(event: Event)
        fun onBackClicked()
    }

- In `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`:

    suspend fun listProductsByOrganization(organizationId: String): Result<List<Product>>
    suspend fun createProductPurchaseIntent(productId: String): Result<PurchaseIntent>
    suspend fun createProductSubscription(productId: String, organizationId: String?, priceCents: Int?, startDate: String?): Result<Subscription>

Update note (2026-02-14 / Codex): Initial ExecPlan drafted before implementation.
Update note (2026-02-14 / Codex): Marked plan steps complete, recorded compile validation, and documented compile issues and decisions from implementation.
