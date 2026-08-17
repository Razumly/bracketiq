# Add organization ownership badges and claiming to mobile

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, Android and iOS users can distinguish an unclaimed organization profile from a claimed or website-verified profile anywhere organizations are presented in Discover or as an event host. On an unclaimed organization detail screen, a Claim action appears on the right side of the organization name and opens the existing BracketIQ web claim wizard. The mobile app does not duplicate the verification wizard; the web flow remains the authoritative place for email, website, DNS, manual-review, and dispute steps.

## Progress

- [x] (2026-07-30 01:38Z) Inspected the web ownership response and badge rules, the mobile organization DTO/model, Android Compose organization surfaces, shared organization/event detail surfaces, and native iOS Discover cards.
- [x] (2026-07-30 01:59Z) Extended the shared organization model and API DTO with normalized ownership fields and backward-compatible defaults.
- [x] (2026-07-30 01:59Z) Added reusable shared ownership badge presentation and a safe claim-URL resolver.
- [x] (2026-07-30 01:59Z) Replaced payment-verification chips with ownership badges on Android/shared public organization surfaces.
- [x] (2026-07-30 01:59Z) Added matching ownership badges to native iOS organization and rental cards.
- [x] (2026-07-30 01:59Z) Added the organization detail Claim action and web-wizard handoff.
- [x] (2026-07-30 01:59Z) Added focused contract, presentation, URL, and Compose UI tests.
- [x] (2026-07-30 01:59Z) Verified model tests, four focused Compose UI tests, Android compilation, Kotlin iOS compilation, a native iOS simulator build, and the final scoped diff.
- [x] (2026-07-30 06:47Z) Manually exercised the complete presentation and claim-entry flow on Android and iOS emulators: card badges, unclaimed detail, claimed detail, and the mobile-to-web claim handoff.
- [x] (2026-07-30 06:47Z) Captured and reviewed Android and iOS screenshots for the accepted states and checked both platforms for crashes.
- [x] (2026-07-30 16:41Z) Changed Android organization and suggestion cards, including loading placeholders, to white adaptive surfaces with subtle outlines and verified the rendered Discover list on the emulator.

## Surprises & Discoveries

- Observation: The existing mobile `OrganizationVerificationBadge` represents Stripe/payment readiness, not organization ownership, but its public label is simply “Verified.”
  Evidence: `core/ui/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/OrganizationVerificationBadge.kt` renders `Organization.verificationStatus`, while the web public badge uses `ownershipStatus` and `claimVerificationLevel`.

- Observation: The organization detail screen is shared Compose UI, while iOS Discover organization and rental cards are native SwiftUI.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailScreen.kt` owns the detail header, and `iosApp/iosApp/Discover/DiscoverCards.swift` owns native Discover cards.

- Observation: The organization cache stores serialized organization snapshots rather than one Room column per ownership field.
  Evidence: organization list/detail queries flow through `BillingOrganizationCoordinator` and `CatalogQueryCacheEntry`, so adding defaulted serializable model properties does not require a Room schema migration.

- Observation: The aggregate `core:network` test targets cannot currently compile an unrelated existing test.
  Evidence: both `:core:network:allTests` and `:core:network:testDebugUnitTest` stop in `ExplicitNullPatchTest.kt:41` because its `TeamPatchRequest(affiliateUrl = null)` call no longer matches that generated constructor. The ownership DTO main source still compiled for both Android and iOS, and the new DTO test remains checked in for when the pre-existing blocker is repaired.

- Observation: The first native iOS build exceeded the build controller response window and left its own `xcodebuild` process holding the build database.
  Evidence: the log stopped advancing and a second build reported `build.db` locked. Terminating only that stale build process and rerunning produced a successful native simulator build in 266 seconds.

- Observation: Running the Android emulator, iOS simulator, simulator mirror, backend, and a full iOS build together exhausted local memory and crashed the desktop session.
  Evidence: after recovery, Docker and the local backend had stopped and temporary DerivedData was gone. Retesting one emulator at a time completed without another memory-pressure failure.

- Observation: An iOS build made with `CODE_SIGNING_ALLOWED=NO` could render the login screen but could not persist the authenticated session.
  Evidence: login reported Keychain error `-34018` because the linker-signed simulator bundle lacked usable application entitlements. A normal simulator-signed Xcode build logged in successfully and completed the ownership flow.

## Decision Log

- Decision: Use the exact web ownership status and verification values in the shared mobile model.
  Rationale: `mvp-site` is the API source of truth, and matching its enums prevents the mobile badge rules from drifting.
  Date/Author: 2026-07-30 / Codex

- Decision: Missing or unknown ownership status defaults to `CLAIMED`, while missing verification defaults to `NONE`.
  Rationale: This is the web normalization behavior and keeps older cached first-party organizations from being mislabeled as unclaimed.
  Date/Author: 2026-07-30 / Codex

- Decision: Show ownership badges along the bottom of public organization cards rather than beside the organization name.
  Rationale: This follows the approved web card placement and leaves the name row readable on narrow screens.
  Date/Author: 2026-07-30 / Codex

- Decision: Open the existing web claim wizard from mobile instead of implementing a native wizard.
  Rationale: The web flow already owns authentication, domain-email verification, website/DNS proof, manual review, disputes, and admin notification.
  Date/Author: 2026-07-30 / Codex

- Decision: Replace the public payment-verification chip with ownership badges, without changing payment eligibility logic.
  Rationale: A generic “Verified” badge currently implies ownership trust even though it only reflects Stripe readiness. Payment state remains available to billing flows through the existing fields and helpers.
  Date/Author: 2026-07-30 / Codex

- Decision: Render Android organization cards with the light theme's white `surfaceContainerLowest` color and an `outlineVariant` border.
  Rationale: The requested white treatment should remain visibly card-like against the Discover background and should adapt safely in dark mode rather than hard-coding white for every theme.
  Date/Author: 2026-07-30 / Codex

## Outcomes & Retrospective

Android and iOS now consume the web ownership contract and show the same public trust labels. Organization and rental cards place the badges at the bottom, shared event details show them on the host card, and organization overview shows them above About. An unclaimed profile receives a right-side Claim action in the shared organization detail top bar; the action resolves the server-provided path against the configured web origin and opens the existing claim wizard.

The model tests and four focused Compose UI tests pass. Android and Kotlin iOS compilation pass, and Xcode successfully builds and runs the native iOS simulator app with the new SwiftUI cards. Manual Android and iOS testing confirmed bottom-aligned unclaimed and claimed badges, a top-right Claim action only on the unclaimed organization, and successful handoff to the web ownership wizard. Neither platform crashed during the final single-emulator runs. iOS development logs still contain failed `localhost:3000` image requests and simulator StoreKit noise, but no ownership-flow exception, Keychain failure, or process crash after the correctly signed build.

The only incomplete automated validation is execution of the new `OrganizationDtosTest` cases because an unrelated existing `ExplicitNullPatchTest` prevents every `core:network` test target from compiling. Main network source compilation on both platforms confirms the production DTO mapping compiles.

Native mobile ownership verification, disputes, transfer requests, and pending-claim management remain intentionally out of scope. Those actions continue through the complete web wizard.

## Context and Orientation

The repository root is `/Users/elesesy/StudioProjects/mvp-app`. The backend response is defined in the sibling checkout `/Users/elesesy/StudioProjects/mvp-site`, primarily by `src/app/api/organizations/route.ts`, `src/app/api/organizations/[id]/route.ts`, and `src/lib/organizationOwnership.ts`.

The mobile organization domain model is `core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Organization.kt`. Network JSON is decoded by `core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/OrganizationDtos.kt`. Because list and detail responses share `OrganizationApiDto`, one mapping change covers both Discover and organization detail.

Android organization and rental cards are Compose functions under `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/tabs/`. The event host card is `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/readonly/ReadOnlyHostContent.kt`. The organization detail header and overview are in `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailScreen.kt`. Native iOS Discover cards are in `iosApp/iosApp/Discover/DiscoverCards.swift`.

An ownership status describes whether a person controls the public profile. A claim verification level describes how that control was verified. These differ from the existing payment verification status, which only controls whether paid billing can be used.

## Plan of Work

First, add serializable enums and defaulted ownership properties to `Organization`. Normalize every backend string in `OrganizationApiDto` using the same fallback rules as web. Keep the properties defaulted so older cached organization JSON continues decoding.

Next, add a shared Compose ownership badge component. It must show one primary badge for `UNCLAIMED`, `CLAIM_PENDING`, `CLAIMED`, review states, or `SUSPENDED`, plus a second Website verified badge only when a claimed organization has `SITE_CONTROL` verification. Add a small pure URL resolver that accepts the API-provided relative claim path and resolves it against the configured mobile web base URL while rejecting blank, protocol-relative, malformed, or non-HTTP values.

Then replace public uses of `OrganizationVerificationBadge` with the ownership component. On cards, render the badges after the descriptive/details content so they sit along the bottom. On the event host card, render them below the organization name and location. Add the same bottom badges to native SwiftUI organization and rental cards using the normalized shared model values.

Finally, add a Claim action to the shared organization detail top bar. It appears only when the normalized server action is `CLAIM`, the organization is claimable, and the claim URL resolves safely. Tapping it opens the web claim wizard using the platform URI handler. Do not add staff-access requests, ownership transfer, or dispute controls to mobile in this milestone.

## Concrete Steps

Work from:

    cd /Users/elesesy/StudioProjects/mvp-app

Run focused model/network and Compose tests with JDK 17:

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :core:model:allTests
    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :core:network:testDebugUnitTest --tests 'com.razumly.mvp.core.network.dto.OrganizationDtosTest'
    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:testDebugUnitTest --tests '*OrganizationOwnership*'

The model and Compose commands pass. The network test command currently reports the pre-existing `ExplicitNullPatchTest.kt:41` constructor error before it can execute the filtered ownership test.

Compile Android:

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:compileDebugKotlinAndroid

Compile the iOS simulator framework or the narrow iOS Kotlin target when the local Xcode/Kotlin environment allows it:

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:compileKotlinIosSimulatorArm64

Then build scheme `iosApp` from `iosApp/iosApp.xcworkspace` for an iPhone simulator with JDK 17 available to the CocoaPods build script. The 2026-07-30 verification completed with `BUILD SUCCEEDED`.

Inspect the final patch:

    git diff --check
    git status --short
    git diff --stat

## Validation and Acceptance

Contract tests must prove that a complete ownership response maps exactly, that missing fields keep an older organization claimed by default, and that unknown strings fall back safely. Presentation tests must prove every primary label and that Website verified only accompanies a claimed `SITE_CONTROL` organization.

Compose UI tests must render the claimed/site-controlled badge pair, render the unclaimed badge without Website verified, and render a Claim action only for a claimable organization with a safe URL. Android compilation must succeed.

On Android and iOS, a Discover organization card must show ownership badges along its bottom. An unclaimed organization detail must show Claim on the right side of the name; tapping it must open the existing `/organizations/{id}/claim` web flow. A claimed organization must not show that Claim action. The event host card may show Unclaimed profile because it is a detail surface, but event list cards must remain unchanged.

## Idempotence and Recovery

All model and UI changes are additive or localized and can be reapplied safely. No database migration or destructive command is required. If cached JSON fails to decode, verify that every new constructor property has a default. If native iOS Swift cannot see a new Kotlin enum property, keep the shared model values and add a small exported Kotlin presentation helper rather than recreating the API normalization in Swift.

## Artifacts and Notes

Manual emulator screenshots:

    /Users/elesesy/Desktop/BracketIQ-Android-organization-cards.png
    /Users/elesesy/Desktop/BracketIQ-Android-unclaimed-organization-detail.png
    /Users/elesesy/Desktop/BracketIQ-Android-claimed-organization-detail.png
    /Users/elesesy/Desktop/BracketIQ-Android-claim-web-flow.png
    /Users/elesesy/Desktop/BracketIQ-Android-white-organization-cards.png
    /Users/elesesy/Desktop/BracketIQ-iOS-organization-cards.png
    /Users/elesesy/Desktop/BracketIQ-iOS-unclaimed-organization-detail.png
    /Users/elesesy/Desktop/BracketIQ-iOS-claimed-organization-detail.png
    /Users/elesesy/Desktop/BracketIQ-iOS-claim-web-flow.png
    /Users/elesesy/Desktop/BracketIQ-iOS-simulator-mirror.png

The authoritative web values are:

    originType: FIRST_PARTY | AFFILIATE_IMPORTED
    ownershipStatus: UNCLAIMED | CLAIM_PENDING | CLAIMED | REVIEW_REQUIRED | DISPUTED | SUSPENDED
    claimVerificationLevel: NONE | AFFILIATION | SITE_CONTROL | MANUAL_REVIEW
    ownershipAction: CLAIM | VIEW_PENDING_CLAIM | REPORT_OWNERSHIP_ISSUE | CONTACT_SUPPORT | NONE

The web badge labels are Unclaimed profile, Claim pending, Claimed profile, Ownership under review, Ownership restricted, and Website verified.

## Interfaces and Dependencies

`Organization` must expose defaulted typed properties for `originType`, `ownershipStatus`, `claimVerificationLevel`, `claimable`, `claimUrl`, and `ownershipAction`. `OrganizationApiDto.toOrganizationOrNull()` remains the single JSON-to-model mapping.

The shared UI module must expose:

    @Composable
    fun OrganizationOwnershipBadges(
        organization: Organization?,
        modifier: Modifier = Modifier,
        compact: Boolean = false,
    )

The claim URL helper must remain pure and accept both the API value and configured web base so it is independently testable.

Revision note (2026-07-30): Created the ExecPlan after tracing the web contract and all mobile ownership presentation surfaces. The plan intentionally keeps claim verification on web and scopes mobile to trustworthy presentation plus entry into that flow.

Revision note (2026-07-30 01:59Z): Marked implementation and platform validation complete, recorded the unrelated network-test compilation blocker and stale first Xcode build, and documented the final web-wizard boundary.

Revision note (2026-07-30 06:47Z): Added final Android and iOS emulator evidence, screenshot paths, crash-log results, and the one-emulator-at-a-time recovery from local memory pressure.

Revision note (2026-07-30 16:41Z): Recorded the Android white-card refinement, adaptive outline treatment, focused build/test pass, and final emulator screenshot.
