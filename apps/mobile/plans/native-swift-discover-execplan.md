# Render the iOS Discover screen in native Swift

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, an iOS user opening Discover sees a screen whose tabs, floating search control, suggestion dropdown, filter bottom sheet, result lists, result cards, loading and empty states, map transition, and map controls are implemented in Swift and SwiftUI. Android continues to use the existing Compose implementation. The existing Kotlin `EventSearchComponent` remains the screen's state and business-action owner, so both platforms keep the same repository, pagination, filtering, location, analytics, and navigation behavior rather than creating an independent iOS data path.

The change is visible by launching the iOS app, selecting Discover, switching among Events, Organizations, Teams, and Rentals, searching each category, applying event and organization filters, opening and closing the map, using Search this area, pulling to refresh, paging each list, and opening cards. None of the Discover presentation on that iOS route should be rendered by Compose.

## Progress

- [x] (2026-07-21 23:12Z) Audited the current Compose Discover screen, Kotlin component contract, Swift map and event-card implementations, Compose-to-UIKit factory, SKIE flow bridge, iOS deployment target, and existing Discover plans.
- [x] (2026-07-21 23:12Z) Chose an expect/actual platform entry point so Android retains Compose and iOS embeds one native SwiftUI view controller.
- [x] (2026-07-21) Added a Swift-friendly Kotlin component surface for atomic filter updates, normalized card/map display data, external-link actions, and map synchronization without moving business logic into Swift.
- [x] (2026-07-21) Added the iOS native factory entry point and platform-specific Discover composable host.
- [x] (2026-07-21) Implemented the Swift observable state bridge and native SwiftUI Discover screen, split into focused tabs, controls, cards, filters, suggestions, and map presentation.
- [x] (2026-07-21) Added common Kotlin regression coverage for native filter snapshot and normalization behavior and compiled the complete Swift target through Xcode.
- [x] (2026-07-21) Passed the focused unit tests, Android Kotlin compile, iOS simulator framework compile, and iOS workspace build with JDK 17. After the user authorized simulator testing, built, installed, launched, authenticated, and exercised Discover on an iPhone 16 Pro running iOS 18.6.
- [x] (2026-07-21) Updated this plan with validation evidence, final decisions, and the outcome.
- [x] (2026-07-22 00:50Z) Fixed simulator follow-up issues: dismissible search focus/suggestions, cancellation-safe suggestion errors, finite image loading with fallbacks, and automatic initial visible-area map search; reran focused tests and interactive simulator QA.
- [x] (2026-07-22) Hid Search this area after a completed viewport fetch, re-showed it only after a meaningful camera pan or zoom, and validated the full transition in the iOS simulator.
- [x] (2026-07-22) Sized native search suggestions to their rendered content and made explicit Search/Enter submission filter the active Discover results on both iOS and Android.
- [x] (2026-07-22) Used the compact Orgs label consistently and added the account-scoped Discover onboarding spotlight walkthrough to the native SwiftUI screen; validated its first and final targets in the iOS simulator.
- [x] (2026-07-22) Tightened the iOS walkthrough geometry so the filter spotlight uses a safe-area-aware root target and the map spotlight measures only the Map capsule instead of its bottom-placement padding.
- [x] (2026-07-22) Preserved nested guide anchors through the search-bar preference hierarchy so the filter spotlight uses the button's measured center, and added screen/controller completion latches so the native walkthrough cannot restart while Kotlin persists completion.
- [x] (2026-07-22) Replaced the native iOS Discover image placeholder's overlapping local icon/initials treatment with the shared backend-generated initials fallback, cover scaling, and a proportional offline initials fallback.
- [x] (2026-07-22 16:22Z) Restored event-detail close/overflow controls to the shared parallax hero layer and gave native iOS event-card details an artwork-backed ultra-thin material treatment; verified the header behavior on Android and iOS emulators and the card treatment on iOS.
- [x] (2026-07-22) Corrected event-detail action hit testing with a hero-sized foreground layer that shares the hero's parallax translation; verified that Close and More options are clickable before scrolling and absent after scrolling on Android and iOS simulators.
- [x] (2026-07-22) Preferred canonical organization logo IDs over request-origin display URLs, added an event-initials retry when Android image loading fails, and combined the native iOS card material, gradient shade, and shadow into one composited glass surface; verified real organization logos and the event-initials retry on the Android emulator, then rebuilt, launched, and visually checked the card treatment in the iOS simulator.
- [x] (2026-07-22) Replaced Android's tall detail-style Discover card with the same compact hero/metadata hierarchy as native iOS, reduced its type scale and map control, and changed the iOS details glass from a light salmon material band to a neutral dark gradient treatment; Android compile, focused tests, install, and runtime sizing passed.

## Surprises & Discoveries

- Observation: Most Discover business behavior already lives in `EventSearchComponent`, but map content synchronization, selected tab, search debounce, external affiliate links, and some filter mutations currently live in the Compose screen.
  Evidence: `EventSearchScreen.kt` collects component flows and calls `mapComponent.setEvents`, `mapComponent.setPlaces`, suggestion methods, filter lambdas, and URI handling directly.

- Observation: The native map is already a SwiftUI view backed by Google Maps, and SKIE already exposes Kotlin `StateFlow` values to Swift as observable/async sequences.
  Evidence: `iosApp/iosApp/EventMap.swift` renders `EventMap` and uses `Observing(component.currentLocation, component.events, component.places)`.

- Observation: iOS supports SwiftUI but deploys back to iOS 15.3, so the screen cannot depend on the iOS 17 Observation framework.
  Evidence: `composeApp/build.gradle.kts` sets `ios.deploymentTarget = "15.3"`; the native bridge will therefore use `ObservableObject` and `@StateObject`.

- Observation: The current active Discover categories are Events, Organizations, Teams, and Rentals, even though an older plan describes a period when Organizations was hidden.
  Evidence: `DiscoverTab.values()` in the current `EventSearchScreen.kt` renders all four enum values.

- Observation: The pre-existing iOS source set did not implement the expected `PaymentProcessor.emitPaymentResult` method, which prevented any iOS framework compile before the Discover Swift code could be checked.
  Evidence: The first `:composeApp:compileKotlinIosSimulatorArm64` run failed on that missing actual. Adding the narrow actual that delegates to the existing `handlePaymentResult` implementation unblocked the baseline iOS target.

- Observation: A generic simulator Xcode build attempted to link the Kotlin framework for `x86_64`, but this project exports the Apple Silicon simulator slice used by the local toolchain.
  Evidence: The first workspace build failed on the unsupported architecture; repeating it with `ARCHS=arm64 ONLY_ACTIVE_ARCH=YES` passed.

- Observation: The local checkout has no `Secrets.plist`, and the Xcode build phase otherwise tries to bootstrap an unrelated local backend before compiling the app.
  Evidence: Validation used `EXCLUDED_SOURCE_FILE_NAMES=Secrets.plist` and `OVERRIDE_KOTLIN_BUILD_IDE_SUPPORTED=YES`, allowing a source-and-link build without inventing secrets or depending on the backend process.

- Observation: A simulator launch requires the gitignored `iosApp/iosApp/Secrets.plist`, and this debug configuration targets `http://localhost:3000`.
  Evidence: The initial simulator launch exited with `Fatal error: Couldn't find file 'Secrets.plist'`. Copying the existing ignored file from the canonical checkout and starting `npm run dev:plain` in `mvp-site` allowed the seeded host account to authenticate and Discover requests to return HTTP 200.

- Observation: Search suggestion cancellation is delivered as a failed Kotlin `Result`, so the existing failure handler surfaced the expected cancellation of a superseded query as `Failed to fetch events: StandaloneCoroutine was cancelled`.
  Evidence: The simulator alert used that exact message, and `suggestEvents` cancelled the prior job before its `onFailure` unconditionally populated `errorState`.

- Observation: Affiliate event and organization image references in the local dataset point at preview routes that return HTTP 404, so those records need the designed initials/icon fallback rather than an unbounded loading indicator.
  Evidence: The running local backend logged repeated 404 responses for `/api/files/affiliate_.../preview` requests made by Discover cards and suggestions.

- Observation: The Compose Discover screen already waits for the native map viewport and performs an initial `refreshEventsForVisibleArea()`, but the Swift screen only exposed that refresh behind the manual Search this area button.
  Evidence: `EventSearchScreen.kt` has a `loadedInitialMapArea` effect; `NativeDiscoverScreen.swift` previously called the refresh only from `searchThisArea()`.

- Observation: SwiftUI anchor preferences measure every layout modifier applied before the anchor, so attaching the map guide target after its bottom padding made the highlighted rectangle extend toward the navigation bar. The nested filter anchor also preserved its horizontal position but resolved against the wrong vertical coordinate space in the hosted Discover hierarchy.
  Evidence: Simulator screenshots placed the filter spotlight over Rentals and stretched the map spotlight from the Map capsule through the bottom placement area.

- Observation: Adding a parent search-bar anchor with `anchorPreference` replaced the nested filter button's value for the same preference key, forcing the overlay onto an approximate fallback rectangle. Native completion also crossed an asynchronous SwiftUI-to-Kotlin update boundary where the incoming show flag could remain true briefly.
  Evidence: The filter key was absent when resolving the overlay, and the user could see the full native walkthrough start again before its persisted completion propagated back through `UIKitViewController.update`.

- Observation: The first native Discover image fallback generated only two initials in Swift and then overlaid a translucent calendar/entity symbol at the same center point. Failed affiliate preview requests never tried the existing backend initials endpoint.
  Evidence: `DiscoverImageFallback` stacked `Text(discoverInitials(name))` and `Image(systemName:)`, while the shared `getInitialsAvatarUrl` already requests a PNG with up to three initials and deterministic backend colors.

- Observation: The dedicated `heroTopControls` slot had regressed from the hero box into a full-screen root overlay when the sticky-header backdrop was added, leaving the actions viewport-fixed over section headers on both platforms.
  Evidence: `EventDetails.kt` invoked `heroTopControls()` in a trailing `fillMaxSize()` box instead of beside `BackgroundImage` inside the parallax-translated hero box.

- Observation: Rendering the controls directly inside the background hero fixed their visual movement but placed the full-screen `LazyColumn` above them for pointer hit testing.
  Evidence: Both buttons rendered in the right location but stopped responding until the action slot was moved into a foreground layer composed after the list.

- Observation: Local organization logos existed and their canonical file IDs returned HTTP 200, but the mobile model selected absolute `http://0.0.0.0:3000` display URLs ahead of those IDs.
  Evidence: The first organization response included both `logoId=affiliate_org_03_international_badminton_logo_square_204a993ccbb3` and a `0.0.0.0` URL; the file endpoint for the ID returned `image/png`, while the Android emulator could not use the request-origin URL.

- Observation: Resolving an organization logo ID before event initials is insufficient by itself because an existing-but-broken logo request still needs a finite fallback.
  Evidence: The event card initially selected its organization logo, failed the request, and displayed the error state until the image loader explicitly retried the backend-generated event-initials URL.

- Observation: Android Discover still rendered the legacy full-detail card after iOS moved to a compact native card, so reducing a single font or spacer would have retained five stacked metadata rows and the oversized text map button.
  Evidence: The reported Android card showed event type, registration, division, divider, date, and price below a 232dp artwork spacer, while native iOS used a 170pt hero and three compact metadata rows.

- Observation: The initial iOS gradient-glass pass combined correctly at the modifier level but used a light material plus a weak black/white tint, producing a distinct salmon-brown footer band instead of the neutral dark glass seen on Android.
  Evidence: The user screenshot showed a hard light footer boundary even though artwork continued behind the material.

## Decision Log

- Decision: Keep `EventSearchComponent` and `MapComponent` as the authoritative Kotlin objects and add only narrow, Swift-friendly methods or display DTOs where Kotlin function types and extension functions are awkward to consume.
  Rationale: This preserves one product contract and prevents Swift from duplicating repository queries, filter semantics, analytics, or navigation decisions.
  Date/Author: 2026-07-21 / Codex

- Decision: Convert `EventSearchScreen` into an expected platform composable, keep the current implementation as `ComposeEventSearchScreen`, call it from Android, and embed a Swift-owned `UIHostingController` from iOS.
  Rationale: The root navigation remains in shared Kotlin while the complete iOS Discover subtree is native. Android behavior remains unchanged.
  Date/Author: 2026-07-21 / Codex

- Decision: Use a thin Swift `ObservableObject` as an interop store, not a second view model.
  Rationale: SwiftUI on iOS 15 needs an observable owner to redraw from Kotlin flows, but all decisions and mutations still delegate to `EventSearchComponent` and `MapComponent`.
  Date/Author: 2026-07-21 / Codex

- Decision: Reuse the existing Swift `EventMap` and share small Swift image, price, date, avatar, verification, and external-link helpers across the native cards.
  Rationale: The map already implements the native Google Maps behavior and event grouping, while native SwiftUI cards make the iOS list independent of Compose.
  Date/Author: 2026-07-21 / Codex

- Decision: Present event and organization filters as a native SwiftUI bottom sheet, while keeping search suggestions anchored below the floating search bar.
  Rationale: The filter set is too tall and varied for a compact dropdown; a bottom sheet provides a scrollable, keyboard-safe surface for all options without obscuring list navigation.
  Date/Author: 2026-07-21 / Codex

- Decision: Treat view-driven search cancellation as a normal control-flow outcome in both Kotlin and Swift, and keep map-area results owned exclusively by `MapComponent`.
  Rationale: Debounce cancellation should never alert the user, and preserving the established map/list separation prevents stale list events from flashing as map markers before the visible-area request completes.
  Date/Author: 2026-07-21 / Codex

- Decision: Track the last successfully searched native map viewport and use the same movement thresholds as the Compose Discover screen before revealing Search this area again.
  Rationale: The control should represent pending camera changes, not remain visible after its current viewport has already been fetched, and matching the shared screen avoids platform-specific behavior drift.
  Date/Author: 2026-07-22 / Codex

- Decision: Keep the submitted query as presentation state, but project the filtered current lists through a Kotlin `EventSearchComponent` snapshot shared by SwiftUI and Compose.
  Rationale: Type-ahead text should not mutate the rendered list until the user submits, while the matching rules must remain in the Kotlin view model instead of drifting between iOS and Android.
  Date/Author: 2026-07-22 / Codex

- Decision: Render the Discover walkthrough as a native SwiftUI spotlight overlay while recording completion through the shared Kotlin `GuideController`.
  Rationale: Native controls need native geometry anchors for accurate highlights, but guide completion must remain account-scoped and consistent across iOS and Android.
  Date/Author: 2026-07-22 / Codex

- Decision: Measure the Map button before applying its bottom-placement padding and use a safe-area-aware root target for the filter spotlight.
  Rationale: Guide targets should describe only the visible control; placement padding and nested hosting coordinate behavior must not enlarge or displace the cutout.
  Date/Author: 2026-07-22 / Codex

- Decision: Merge target anchors with `transformAnchorPreference` and latch completion both in the SwiftUI screen and its hosting-controller session.
  Rationale: Nested controls must retain their exact measured bounds, and local completion must become authoritative immediately instead of waiting for the persisted Kotlin state to round-trip.
  Date/Author: 2026-07-22 / Codex

- Decision: Try each card/avatar's explicit image first, then the shared backend PNG initials URL, and use proportional local initials only if both network paths fail.
  Rationale: This matches the established cross-platform fallback contract, preserves uploaded images, removes the overlapping icon artifact, and keeps a finite offline state.
  Date/Author: 2026-07-22 / Codex

- Decision: Keep close/overflow actions in the existing shared hero slot and render each native event card from one full-card artwork layer with an `.ultraThinMaterial` details panel.
  Rationale: Hero actions must inherit the image's parallax translation, and SwiftUI material needs artwork behind the details area in order to produce visible glass rather than an opaque white footer.
  Date/Author: 2026-07-22 / Codex

- Decision: Compose the shared hero action slot after the `LazyColumn` in a hero-height foreground box, using the same parallax translation as the background and a narrow z-index elevation.
  Rationale: The controls need to win hit testing while visible without restoring a full-screen overlay that can intercept touches or cover sticky section headers after the hero scrolls away.
  Date/Author: 2026-07-22 / Codex

- Decision: Resolve event artwork as event image, then canonical organization logo ID, then backend-generated event initials; if either remote artwork request fails at runtime, retry the initials URL.
  Rationale: Canonical IDs are portable across simulator, emulator, device, and backend host configuration, while a runtime retry covers stale or missing logo files without leaving a spinner or blank card.
  Date/Author: 2026-07-22 / Codex

- Decision: Apply the iOS shade gradient inside the glass background and place the card shadows after a compositing group.
  Rationale: SwiftUI Liquid Glass accepts a color tint rather than a gradient, so layering the gradient over the native glass material keeps the shade visibly part of the translucent surface and lets the shadow describe the combined card silhouette.
  Date/Author: 2026-07-22 / Codex

- Decision: Give Android and iOS the same card information hierarchy: 170-unit hero with type, price, and a circular map action, followed by title, location, date, and registration in a dark gradient glass panel.
  Rationale: Matching hierarchy, not just nominal font sizes, removes the Android height disparity while retaining every field visible on the native iOS Discover card.
  Date/Author: 2026-07-22 / Codex

## Outcomes & Retrospective

The iOS Discover route is now a native SwiftUI surface from its tab selector through search suggestions, category cards, empty/loading states, pagination controls, map overlay, and filters. The event and organization filter button presents a scrollable bottom sheet with medium and large detents where supported, while iOS 15 receives the compatible sheet presentation. Android still delegates to the original Compose screen.

`EventSearchComponent` and `MapComponent` remain the business and data owners. Swift observes their exported flows and delegates filter, paging, refresh, selection, analytics, location, and map actions back to Kotlin. The new Swift-facing snapshot tests passed, Android compiled, the Kotlin iOS simulator framework compiled, and the full Swift app target linked successfully.

Runtime verification also passed on an iPhone 16 Pro simulator with iOS 18.6. The test authenticated with the seeded host account, rendered and switched among Events, Organizations, Teams, and Rentals, returned live list data, opened both event and organization filter sheets at medium and expanded detents, exposed and scrolled the complete organization filter catalog, dismissed through Apply Filters, entered `bat` through simulator HID input and received rental suggestions plus filtered results, opened and closed the rental map with markers, and followed a rental card into the existing outbound-link confirmation page. The post-test log contained successful Discover HTTP responses and no crash or Discover-specific error.

The simulator follow-up pass verified the reported regressions against the rebuilt native screen. Focusing an empty search now exposes an X; outside taps dismiss the suggestion surface while preserving the query; dragging the suggestion list dismisses it; and the X clears and dismisses. Search results whose local `/api/files/.../preview` request returns 404 now replace the loading state with initials/icon fallbacks, and repeated search interaction no longer surfaces cancellation alerts. Opening the Events map without pressing Search this area produced a new successful `POST /api/events/search`, proving the initial viewport refresh runs automatically after the native map reports its camera radius. The runtime log contained no `StandaloneCoroutine`, `Failed to fetch events`, fatal, or uncaught-error match.

The final map-state pass verified that Search this area is absent after the initial automatic viewport request, returns after both zooming and horizontally panning the simulator map, stays visible as a Searching progress control during the request, and disappears again after the changed-area request succeeds. The local backend recorded each visible-area `POST /api/events/search` call with an HTTP 200 response.

Search submission now has a separate committed-query state on both presentations, while Kotlin projects matching current events, organizations, teams, and rentals through one shared snapshot. The Android focused tests verified both IME and magnifier submission plus case-insensitive multi-field matching. On the iPhone 16 Pro simulator, a no-result query rendered a single-row suggestion dropdown, Return and the magnifier each replaced the cards with the matching empty state, and X cleared the committed query and restored the original cards. No Android emulator was attached for an additional runtime pass, so Android validation used the successful Compose compile and focused Robolectric/shared tests.

The native tab and search copy now use the same compact Orgs label already present in Compose. iOS also renders the six-step Discover walkthrough as a native SwiftUI spotlight overlay using live anchors for tabs, search, filters, the first result, and map controls plus an inset-aware center-action target. The simulator verified the first tab spotlight and final create-action spotlight on an iPhone 16 Pro. Skip and completion route through the shared account-scoped Kotlin `GuideController`; its focused regression test and the final iOS workspace build both passed.

The walkthrough geometry follow-up was also verified on the iPhone 16 Pro simulator. Step 3 now centers its circular spotlight on the filter icon instead of the Rentals tab, and step 5 wraps the Map capsule with only the intended eight-point highlight inset instead of including the button's bottom-placement padding.

The final onboarding follow-up keeps the filter button's nested anchor when the enclosing search anchor is added, producing a tighter glyph-centered spotlight in the iPhone 16 Pro simulator. Native completion is now latched immediately in both the SwiftUI screen and its hosting-controller session, preventing a stale incoming eligibility value from scheduling the six-step walkthrough a second time while Kotlin persists the account completion.

The image fallback follow-up was verified on the iPhone 16 Pro simulator against the running local backend. Events without usable preview images rendered backend PNG initials such as `OG7` and `HSC` with deterministic colors, up to three characters, and cover scaling across the hero area; the prior translucent calendar icon no longer appeared over the initials.

The event-detail/card polish follow-up rebuilt the shared iOS framework and launched successfully on the iPhone 16 Pro simulator. Native event-card detail content now shows the underlying pink/orange initials artwork through the same ultra-thin material used by the tab surface. The final hero action layer preserved both behavior requirements: More options opened its menu and Close returned to Discover before scrolling, while both controls disappeared with the hero after scrolling. This interaction pass succeeded on the iPhone 16 Pro iOS 18.6 simulator and the Pixel 9 Pro API 35 emulator. The shared Android build/install and full Xcode build/run both passed.

The organization-logo follow-up confirmed that the local backend already contained the expected uploaded PNGs; the failure was mobile reference selection, not missing seed data. Organization cards now use their canonical logo IDs before display URLs. Android event cards also retry the shared backend event-initials image when event or organization artwork fails, which the Pixel 9 Pro API 35 runtime pass verified with real 03 International Badminton Club, 1 Flight VBC, and 503 Baseball logos plus the `OG7` event-initials fallback. The iOS details panel now composes native glass or its backward-compatible material fallback with a top-to-bottom shade gradient, then applies shadow to the combined card surface. The updated Xcode workspace built, installed, and launched on the iPhone 16 Pro iOS 18.6 simulator; the Discover screenshot showed the gradient shade and unified card shadow, and its runtime logs contained no fatal, uncaught, or Discover fetch errors.

The cross-platform sizing follow-up replaced Android's 232dp artwork spacer and stacked detail rows with a 170dp hero plus a compact three-row details panel. The Pixel 9 Pro API 35 UI tree measured the rebuilt cards at about 273dp tall and showed two complete cards in the Discover viewport; the new circular map control opened the map and Close Map returned to the list. On iOS, stronger neutral black tinting inside the glass changed the prior salmon-brown footer into the same dark translucent treatment as Android while preserving artwork blur, white metadata, the composited card shadow, and the iOS 26 native-glass availability path. The iPhone 16 Pro iOS 18.6 workspace build/install/launch and screenshot passed, and neither platform's runtime logs contained a crash or Discover fetch failure.

## Context and Orientation

`composeApp/src/commonMain/kotlin/com/razumly/mvp/app/App.kt` renders `EventSearchScreen` when the Decompose navigation stack contains `RootComponent.Child.Search`. Decompose is the shared navigation library; the child carries an `EventSearchComponent` and a `MapComponent`.

`composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchComponent.kt` is the Discover state and action contract. It owns event, organization, team, and rental lists; suggestions; event and organization filter state; paging flags; sports and tags; current location and search location; rental availability; errors; and navigation actions.

`composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt` is the current Compose presentation. It owns transient presentation state such as the active tab, search focus/query, dropdown visibility, and map reveal state. Its list/card helpers live below `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/tabs/`. Android must continue using this screen after it is renamed to `ComposeEventSearchScreen`.

`composeApp/src/iosMain/kotlin/com/razumly/mvp/core/presentation/composables/NativeViewFactory.kt` is the Kotlin interface implemented by Swift in `iosApp/iosApp/IOSNativeViewFactory.swift`. It already creates native map and event-card controllers. A new factory method will create the native Discover controller.

`iosApp/iosApp/EventMap.swift` contains the existing native SwiftUI `EventMap`, backed by Google Maps. The new Discover screen should compose this view directly rather than creating another map implementation.

SKIE is the Kotlin/Swift interop plugin configured in `composeApp/build.gradle.kts`. It turns exported Kotlin flows into Swift-observable/async-sequence surfaces, allowing a Swift `ObservableObject` to collect the existing component flows without polling.

## Plan of Work

First, make the shared screen entry platform-specific without changing Android behavior. Rename the current common composable to `ComposeEventSearchScreen`, declare `EventSearchScreen` as an expected composable, add an Android actual that delegates to Compose, and add an iOS actual that fills the available area with a `UIKitViewController` returned by `NativeViewFactory`. Pass the shared bottom-navigation inset to Swift so native lists and buttons do not hide behind the Compose bottom bar.

Second, make the Kotlin component convenient and safe to drive from Swift. Add explicit methods that replace an event or organization filter atomically, reset filters, and update individual sets/ranges without asking Swift to construct Kotlin receiver lambdas. Add map display helpers or DTOs only where required to turn organizations into `MVPPlace` objects and to keep event/organization/rental map content in sync. Move affiliate rental/team click analytics and URL resolution behind component actions or exported helpers so Swift does not fork product behavior. Cover these methods with common tests.

Third, add `iosApp/iosApp/Discover/` Swift files and include them in the Xcode target. A `NativeDiscoverViewController` will be a `UIHostingController<NativeDiscoverScreen>`. A thin `DiscoverObservableState` will collect the component and map flows, publish immutable snapshots, cancel tasks when released, and expose only delegating actions. `NativeDiscoverScreen` will own transient view state and use dedicated subviews for the tab strip, floating search control, anchored suggestion panel, scrollable filter bottom sheet, each category list, cards, empty/loading states, and the map overlay. The view tree will remain stable and non-trivial sections will live in separate view types.

Fourth, preserve the exact behavior of all four tabs. Events support native cards, map focusing, create-event empty state, refresh, paging, suggestions, event price/date/sport/tag/location/distance filters, and Search this area. Organizations support native cards, map markers, refresh, paging, suggestions, sport/tag/division/location/distance filters, and detail navigation. Teams support native cards, refresh, paging, suggestions, internal navigation, and external registration links. Rentals support native cards, map markers, refresh, paging, suggestions, Rentals detail navigation, and external booking links.

Finally, validate both platforms. Run common tests and Android metadata compilation to prove the expect/actual split did not break Android. Build the Xcode workspace using JDK 17 and a workspace-local or temporary DerivedData path. If a simulator is available, launch the app and exercise the acceptance scenarios, capturing screenshots for the UI-heavy migration.

## Concrete Steps

Work from `/Users/elesesy/.codex/worktrees/e09f/mvp-app`.

1. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt`, add the common platform declaration, and add Android/iOS actual files under the corresponding source sets.

2. Edit `composeApp/src/iosMain/kotlin/com/razumly/mvp/core/presentation/composables/NativeViewFactory.kt` and `iosApp/iosApp/IOSNativeViewFactory.swift` to create the native Discover controller.

3. Edit `EventSearchComponent.kt` and focused bridge files/tests to expose Swift-safe state mutation and map/click behavior while preserving its current repositories and flows.

4. Add Swift files beneath `iosApp/iosApp/Discover/` and register them in `iosApp/iosApp.xcodeproj/project.pbxproj`.

5. Run:

    JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home ./gradlew :composeApp:compileKotlinIosSimulatorArm64

    JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventSearch.NativeDiscoverBridgeTest' :composeApp:compileDebugKotlinAndroid

   Both commands passed. The focused test command ran three tests and the Android compile in one Gradle invocation.

6. Run:

    JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home OVERRIDE_KOTLIN_BUILD_IDE_SUPPORTED=YES xcodebuild -quiet -workspace iosApp/iosApp.xcworkspace -scheme iosApp -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath build/ios-derived-data ARCHS=arm64 ONLY_ACTIVE_ARCH=YES ENABLE_DEBUG_DYLIB=NO EXCLUDED_SOURCE_FILE_NAMES=Secrets.plist CODE_SIGNING_ALLOWED=NO build

   This passed. Remaining output was limited to existing deprecation, pod deployment-target, and framework target-version warnings.

7. Run the configured simulator workflow if available and exercise the scenarios in Validation and Acceptance.

## Validation and Acceptance

The migration is accepted when the iOS Discover route has no Compose-rendered child controls and the following behaviors work:

Opening Discover displays four native tabs and a native floating search bar. Switching tabs changes the placeholder and list. Entering fewer than two characters explains the minimum; entering two or more characters displays the correct category suggestions; selecting a suggestion follows the existing Kotlin navigation or external-link action.

Events and Organizations display a native, scrollable filter bottom sheet. Event filters preserve price, start/end date, sport, tag, location, and distance behavior. Organization filters preserve sport, tag, gender, age, skill, division price, location, and distance behavior. Clear All resets the matching Kotlin filter and distance, Apply Filters commits the draft and dismisses the sheet, and active-filter indication reflects Kotlin state.

Each category supports pull-to-refresh, empty/loading states, pagination near the end, and native cards. Card taps preserve internal detail navigation. Team affiliate registration and rental affiliate booking open their normalized external URLs; non-affiliate rows navigate through the component.

The Map control opens the existing Swift Google map. Events, organizations, and rentals display the right markers for the active tab; Teams show no markers. Event marker/card selection opens the event, organization markers open the organization, rental markers perform the rental action, Close Map returns to the list, and Search this area refreshes the visible event map area.

Android continues to render the pre-existing Compose screen with no changed behavior. Common tests, the Android/shared compile target, and the iOS workspace build pass.

## Idempotence and Recovery

All work is source-only. No database or external state mutation is required. The expect/actual migration should be additive until both actual implementations compile; if the iOS host is temporarily broken, Android still delegates to `ComposeEventSearchScreen`. Swift flow tasks must cancel on deinitialization so repeatedly entering and leaving Discover does not leak collectors. Re-running Gradle and Xcode builds is safe. Generated `build/` and DerivedData outputs are ephemeral and must not be committed.

## Artifacts and Notes

The baseline checkout was clean before implementation:

    ## codex/... [clean]

The current iOS deployment target is 15.3, and the framework already uses SKIE 0.10.13. The existing native map is in `iosApp/iosApp/EventMap.swift`; it must be reused rather than duplicated.

Final validation evidence:

    :composeApp:compileKotlinIosSimulatorArm64 — BUILD SUCCESSFUL
    NativeDiscoverBridgeTest plus :composeApp:compileDebugKotlinAndroid — BUILD SUCCESSFUL
    iosApp workspace arm64 simulator source-and-link build — exit 0
    XcodeBuildMCP iPhone 16 Pro iOS 18.6 build/install/launch — succeeded
    Simulator Discover interaction smoke test — passed
    Simulator regression pass for search dismissal, image fallback, cancellation alert, and automatic map-area search — passed
    Android Pixel 9 Pro API 35 event-detail expanded/scroll runtime check — passed
    iPhone 16 Pro iOS 18.6 event-detail expanded/scroll and glass-card runtime checks — passed
    DiscoverImageFallbackTest (3 tests) — passed
    Pixel 9 Pro API 35 local organization-logo and event-initials runtime checks — passed
    iPhone 16 Pro iOS 18.6 gradient-glass card build/run/visual check — passed
    Pixel 9 Pro API 35 compact-card height and map-action runtime checks — passed
    iPhone 16 Pro iOS 18.6 dark-gradient glass visual check — passed
    plutil -lint iosApp/iosApp.xcodeproj/project.pbxproj — OK
    git diff --check — clean

## Interfaces and Dependencies

At completion, the common source set declares:

    @Composable
    expect fun EventSearchScreen(
        component: EventSearchComponent,
        mapComponent: MapComponent,
    )

Android supplies an actual function that invokes:

    ComposeEventSearchScreen(component, mapComponent)

The iOS `NativeViewFactory` supplies a method shaped like:

    fun createNativeDiscoverViewController(
        component: EventSearchComponent,
        mapComponent: MapComponent,
        bottomPadding: Float,
    ): UIViewController

Swift supplies `NativeDiscoverViewController`, `NativeDiscoverScreen`, and a thin observable bridge over `EventSearchComponent` and `MapComponent`. New Kotlin filter methods must accept ordinary exported values such as `Set<String>`, `Double?`, and `Instant?`; Swift must not reimplement `EventFilter.filter(event)` or any repository call.

Update note (2026-07-21 / Codex): Created the ExecPlan after auditing the current Kotlin/Compose and Swift/iOS paths. The plan keeps shared component behavior authoritative and makes only the iOS presentation native.
Update note (2026-07-21 / Codex): Replaced the native filter dropdown direction with a SwiftUI bottom sheet at the user's request so the complete filter set has sufficient room.
Update note (2026-07-22 / Codex): Closed the simulator follow-up by making search presentation explicitly dismissible, filtering expected Kotlin cancellation, bounding native image loading, and matching Compose's automatic initial map-area refresh; added the new runtime and regression-test evidence.
