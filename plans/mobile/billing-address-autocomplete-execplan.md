# Add Google Places Suggestions To Billing Address Entry

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. It is self-contained so a future contributor can continue the work from this file and the current working tree.

## Purpose / Big Picture

Users currently have to type every billing address field manually before tax and payment totals can be calculated. After this change, the billing address dialog will show address suggestions from the same Google Places provider already used elsewhere in the app. Selecting a suggestion fills address line 1, city, state, ZIP code, and country; State and Country are dropdown fields so users do not type inconsistent codes.

The backend source of truth in `C:\Users\samue\Documents\Code\mvp-site` currently accepts the same billing address payload shape and validates billing addresses as US-only for payment tax calculation. This app change must preserve that contract: submitted billing addresses still use `line1`, `line2`, `city`, `state`, `postalCode`, and `countryCode`, and Country is limited to `US` until the backend supports more countries.

## Progress

- [x] (2026-04-24 11:25-07:00) Read the billing address dialog, billing draft model, payment processor, and existing Google Places map integrations.
- [x] (2026-04-24 11:25-07:00) Checked `mvp-site` billing address validation and confirmed the payload shape and US-only tax validation.
- [x] (2026-04-24 11:39-07:00) Added a shared Google Places billing-address suggestion provider and parser.
- [x] (2026-04-24 11:42-07:00) Updated `BillingAddressDialog` so line 1 shows suggestions and State/Country are dropdowns.
- [x] (2026-04-24 11:44-07:00) Added focused common tests for parsing selected Google Places details into `BillingAddressDraft`.
- [x] (2026-04-24 11:58-07:00) Ran focused tests and compile checks; `compileKotlinMetadata` and the focused `BillingAddressAutocompleteTest` path passed.

## Surprises & Discoveries

- Observation: `rg.exe` is not usable in this Windows shell because it fails with `Access is denied`.
  Evidence: The initial repository search failed before execution, so subsequent searches use `git grep` and PowerShell.
- Observation: The app already passes `BuildConfig.MAPS_API_KEY` into Stripe PaymentSheet address autocomplete on Android and uses `AppSecrets.googlePlacesApiKey` for iOS map search.
  Evidence: `composeApp/src/androidMain/kotlin/com/razumly/mvp/core/presentation/PaymentProcessor.android.kt` calls `googlePlacesApiKey(BuildConfig.MAPS_API_KEY)`, and `composeApp/src/iosMain/kotlin/com/razumly/mvp/di/MapComponentModule.kt` passes `AppSecrets.googlePlacesApiKey`.
- Observation: `mvp-site` rejects non-US billing addresses during tax/payment validation.
  Evidence: `C:\Users\samue\Documents\Code\mvp-site\src\lib\billingAddress.ts` has `validateUsBillingAddress` which throws unless `countryCode` is `US`.
- Observation: The first Android compile attempt failed in KSP before Kotlin compilation because the generated KSP cache directory `composeApp/build/kspCaches/android/androidDebug/symbols` was missing.
  Evidence: `.\gradlew :composeApp:compileDebugKotlinAndroid --console=plain` failed with `The system cannot find the path specified`; creating the missing ephemeral build directory allowed the later focused test command to pass through `kspDebugKotlinAndroid`.
- Observation: Another Gradle wrapper process started in the same checkout while validation was running.
  Evidence: `Get-CimInstance Win32_Process` showed a separate `gradlew --no-daemon :composeApp:compileDebugUnitTestKotlinAndroid :composeApp:testDebugUnitTest ... TeamDetailsDialogTest ...` command. The billing-address focused test was run only after that process finished.

## Decision Log

- Decision: Use Google Places Autocomplete and Place Details web-service requests from shared Kotlin rather than adding separate Android and iOS UI widgets.
  Rationale: The repository already uses the Google Places web-service shape on iOS and has Ktor engines for both Android and iOS. A shared provider keeps parsing and UI behavior consistent across platforms while still using the same Google Places provider.
  Date/Author: 2026-04-24 / Codex
- Decision: Keep Country limited to `US` in the dropdown for now.
  Rationale: The backend contract currently supports only US billing addresses for tax calculation. Allowing unsupported countries in the app would make the form appear valid while the save/payment path fails later.
  Date/Author: 2026-04-24 / Codex
- Decision: Restrict autocomplete requests to the US using `includedRegionCodes`.
  Rationale: Billing tax validation is US-only, so suggesting addresses that cannot be submitted would create avoidable user errors.
  Date/Author: 2026-04-24 / Codex

## Outcomes & Retrospective

Completed. Billing address entry now uses Google Places suggestions and fills the app's existing `BillingAddressDraft` shape from selected Place Details. State and Country are dropdown-backed, with Country intentionally limited to `US` because backend billing/tax validation is US-only. Parser tests cover normal US address details, ZIP+4 suffixes, and formatted-address fallback when street components are missing.

## Context and Orientation

The shared billing address dialog lives at `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/BillingAddressDialog.kt`. It currently renders free-text fields for line 1, line 2, city, state, and ZIP code, and hardcodes `countryCode = "US"` in the `BillingAddressDraft` it submits.

The billing address data model lives at `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/BillingAddress.kt`. `BillingAddressDraft.normalized()` trims fields and uppercases state and country code. `isCompleteForUsTax()` requires line 1, city, state, postal code, and `countryCode == "US"`.

The existing Google Places integrations live under `composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap/` and `composeApp/src/iosMain/kotlin/com/razumly/mvp/eventMap/`. Android initializes the Places SDK with `BuildConfig.MAPS_API_KEY`; iOS calls `https://places.googleapis.com/v1/places:autocomplete` and Place Details with `AppSecrets.googlePlacesApiKey`.

The backend source of truth for the billing payload is `C:\Users\samue\Documents\Code\mvp-site\src\lib\billingAddress.ts`. It stores and returns the same six fields used by `BillingAddressDraft` and validates only US addresses for tax/payment flows.

## Plan of Work

First, add shared composable support classes in the billing address composables package. The new code will expose a small provider that calls Google Places Autocomplete for suggestions, then calls Place Details when the user selects a suggestion. It will parse `addressComponents` into `BillingAddressDraft` fields, using `street_number` and `route` for line 1, `locality` or nearby locality-like components for city, `administrative_area_level_1` for state, `postal_code` plus optional suffix for ZIP, and `country` for country code.

Second, add platform API-key actuals. Android will return `BuildConfig.MAPS_API_KEY`; iOS will return `AppSecrets.googlePlacesApiKey`. The shared provider will do nothing when the key is blank, so local builds without secrets still compile and the form remains manually usable.

Third, update `BillingAddressDialog.kt`. Address line 1 becomes an autocomplete text field that shows Google Places suggestions under the field after a short debounce. Selecting a suggestion fills all known address fields. State becomes a `PlatformDropdown` over US state and territory codes. Country becomes a `PlatformDropdown` with `US`, matching the backend limitation.

Fourth, add common tests for the parser behavior. The tests will verify that a selected Google Places details response maps into a complete US `BillingAddressDraft`, that ZIP+4 suffixes are joined correctly, and that missing street components fall back to the first line of the formatted address.

## Concrete Steps

Work from `C:\Users\samue\StudioProjects\mvp-app`.

1. Add `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/BillingAddressAutocomplete.kt`.
2. Add `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/BillingAddressPlacesConfig.kt` plus Android and iOS actual files with the same name in `androidMain` and `iosMain`.
3. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/BillingAddressDialog.kt` to use the new autocomplete field and dropdown options.
4. Add `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/presentation/composables/BillingAddressAutocompleteTest.kt`.
5. Run `.\gradlew :composeApp:testDebugUnitTest --tests com.razumly.mvp.core.presentation.composables.BillingAddressAutocompleteTest --console=plain`.

Validation commands that were run:

    C:\Users\samue\StudioProjects\mvp-app> .\gradlew :composeApp:compileKotlinMetadata --console=plain
    BUILD SUCCESSFUL

    C:\Users\samue\StudioProjects\mvp-app> .\gradlew :composeApp:testDebugUnitTest --tests com.razumly.mvp.core.presentation.composables.BillingAddressAutocompleteTest --console=plain
    BUILD SUCCESSFUL in 2m 24s

## Validation and Acceptance

Acceptance is met when the billing address dialog behaves as follows:

When a user types at least three characters in Address line 1, Google Places suggestions appear. When the user selects a suggestion, address line 1, city, state, ZIP code, and country are filled from the selected Place Details response. State and Country render as dropdown controls, not free-text fields. Manual entry remains possible if suggestions are unavailable. Saving still submits a normalized `BillingAddressDraft` that passes the existing US tax completeness check.

Automated acceptance is met: `compileKotlinMetadata` passed, and the focused Android debug unit-test command for `BillingAddressAutocompleteTest` passed.

## Idempotence and Recovery

The implementation is additive except for replacing the old State free-text field in `BillingAddressDialog.kt`. If Google Places calls fail or the API key is missing, the provider returns no suggestions and the user can still manually enter the address. Re-running tests is safe. No database schema, backend route, or generated Room schema changes are required.

## Artifacts and Notes

Important source facts:

    mvp-site validateUsBillingAddress rejects non-US countryCode values.
    Android PaymentProcessor already configures Stripe PaymentSheet with BuildConfig.MAPS_API_KEY.
    iOS MapComponent already calls Google Places Autocomplete and Place Details web services.

## Interfaces and Dependencies

Define an expected platform function:

    internal expect fun billingAddressPlacesApiKey(): String

Define shared types and provider behavior:

    internal data class BillingAddressSuggestion(
        val placeId: String,
        val primaryText: String,
        val secondaryText: String,
    )

    internal class GooglePlacesBillingAddressProvider(
        private val httpClient: HttpClient = createMvpHttpClient(),
        private val apiKey: String = billingAddressPlacesApiKey(),
    ) {
        suspend fun findSuggestions(query: String): Result<List<BillingAddressSuggestion>>
        suspend fun resolveAddress(placeId: String): Result<BillingAddressDraft>
        fun close()
    }

The provider must call `places:autocomplete` with `includedRegionCodes = ["us"]` and must request only the fields needed for the UI and parser. Place Details must request `id`, `formattedAddress`, and `addressComponents`.
