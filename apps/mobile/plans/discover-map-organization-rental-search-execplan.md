# Complete Discover Map and Catalog Filter Behavior

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must stay current while the work proceeds.

This plan follows `PLANS.md` at the repository root.

## Purpose / Big Picture

Discover currently shows organizations and rentals that the app already loaded, but it cannot request missing results for the visible map area. Organization and rental markers also use a location-picker interaction that Discover disables, and they do not group when their marker icons overlap. After this change, local organizations and rentals appear immediately. The app then searches the initial visible area and offers `Search this area` after a meaningful camera change. A marker tap opens a bottom card. A card tap opens the organization or rental destination. Touching markers form numbered groups on Android and iOS.

The Teams and Rentals lists also need the same filter access as Events and Organizations. Rental facilities must use their own coordinates for distance filtering and nearest-first ordering. Teams must support sport, division, registration-price, location, and distance filters. The Android filter sheet must stay at its expanded anchor while its content scrolls. It must not repeatedly over-drag and spring back. Android dropdown fields in this sheet must use the sheet background color instead of a white field background.

## Progress

- [x] (2026-08-04) Read `PLANS.md` and the Android emulator QA skill.
- [x] (2026-08-04) Audited the Compose Discover screen, native Swift Discover screen, Android and iOS map implementations, mobile organization repository, and web organization endpoint.
- [x] (2026-08-04) Added a cached, visible-area organization query to the mobile repository contract and implementation.
- [x] (2026-08-04) Added map-area organization and rental loading to `EventSearchComponent` without changing list filters.
- [x] (2026-08-04) Added initial and manual visible-area search to the Compose and native Swift Discover screens.
- [x] (2026-08-04) Added organization and rental marker grouping and bottom-card selection on Android and iOS.
- [x] (2026-08-04) Added focused repository request coverage and completed the available platform compile checks.
- [x] (2026-08-04) Checked Android emulator availability. `adb devices` reported no attached device, so visible Android QA was not available.
- [x] (2026-08-04) Recorded the final validation evidence and outcome in this plan.
- [x] (2026-08-04) Audited the shared filter state, Compose sheet, native Swift filter sheet, rental expansion, team data, and distance code.
- [x] (2026-08-04) Confirmed that Rentals are always sorted by name and do not call the existing distance filter.
- [x] (2026-08-04) Confirmed that the Android sheet drag connection and its inner scroll both consume vertical gestures while the sheet has only an expanded anchor.
- [x] (2026-08-04) Added independent Team and Rental filter state to `EventSearchComponent` and exposed it to native Swift.
- [x] (2026-08-04) Filtered rental facilities by their facility coordinates and sorted visible facilities nearest first.
- [x] (2026-08-04) Filtered Teams by sport, division, registration price, and organization distance.
- [x] (2026-08-04) Added Team and Rental filter content to Compose and native Swift Discover.
- [x] (2026-08-04) Stabilized Android filter-sheet scrolling and matched dropdown field backgrounds to the sheet.
- [x] (2026-08-04) Added focused tests and completed Android, iOS, and Swift validation.
- [x] (2026-08-04) Restored the default Android sheet drag handle and gestures, then consumed only upward overflow at the expanded anchor.
- [x] (2026-08-04) Reproduced the required hard-swipe path with 40 to 60 millisecond swipes from the handle to `y=0` on `emulator-5554`.
- [x] (2026-08-04) Verified that five hard upward handle swipes keep the sheet at its expanded anchor and that a downward handle swipe still dismisses it.

## Surprises & Discoveries

- Observation: The web organization endpoint already supports `lat`, `lng`, and `radiusKm`. It also includes active affiliate rental facility coordinates when `includeAffiliateRentals=true`.
  Evidence: `/Users/elesesy/StudioProjects/mvp-site/src/app/api/organizations/route.ts` parses the area parameters, filters organization and facility coordinates, and paginates the result.
- Observation: The mobile organization repository does not expose the endpoint's area parameters.
  Evidence: `IBillingRepository.listOrganizationsPage` and `BillingOrganizationCoordinator.listOrganizationsPage` only pass paging, affiliate rental, tag, price, and division filters.
- Observation: Discover passes `canClickPOI=false`, and Android organization and rental markers return `false` from their click handler in this mode.
  Evidence: `EventSearchScreen.kt` passes `canClickPOI=false`; `EventMap.android.kt` starts the place marker click handler with `if (!canClickPOI) false`.
- Observation: Event markers already use screen-space groups and explicit bottom cards on Android and iOS. Organization and rental markers render one marker for each place and still use Google Maps info windows.
  Evidence: `EventMap.android.kt` and `iosApp/iosApp/EventMap.swift` have event group models and event card carousels, but their place loops do not have matching group or selected-card state.
- Observation: Rental results can represent an affiliate facility with a synthetic ID and facility coordinates instead of the parent organization coordinates.
  Evidence: `EventSearchComponent.toDiscoverRentalEntries` creates one entry per active affiliate rental facility and assigns an ID in the form `<organization-id>:affiliate-rental:<facility-id>`.
- Observation: An area match for one affiliate facility returns every active affiliate facility for the parent organization.
  Evidence: The web route applies the area filter before it attaches the full active facility list. The client therefore filters each expanded rental entry by its own marker coordinate.
- Observation: The worktree contains unrelated event form, version, CocoaPods, and QA changes that existed before this work.
  Evidence: The initial `git status --short` output listed those files before this plan was added.
- Observation: The focused Android unit test task was temporarily blocked by unrelated dirty `commonTest` source, then passed after those concurrent edits left the worktree.
  Evidence: The first run reported missing arguments in `EventDetailsValidationTest.kt`. The final `BillingRepositoryHttpTest` run completed successfully.
- Observation: A direct `syncFramework` invocation linked the simulator framework, but its resource-copy step needs Xcode architecture environment variables.
  Evidence: `linkPodDebugFrameworkIosSimulatorArm64` completed, then `syncPodComposeResourcesForIos` reported that it could not infer iOS target architectures. The produced simulator framework exported both new `EventSearchComponent` methods and the subsequent Xcode simulator build passed.
- Observation: `loadRentalOrganizations` and `loadMoreRentalOrganizationsPage` sort expanded rental entries only by lowercase name.
  Evidence: Both methods call `sortedBy { organization.name.lowercase() }` after affiliate facilities have been expanded.
- Observation: `applyDistanceFilter` is called for the Organizations list only. The Rentals and Teams lists do not retain an unfiltered source list that a changed filter can re-evaluate.
  Evidence: `EventSearchComponent` has `_allOrganizations`, but Rentals and Teams currently write directly to their visible state flows.
- Observation: Open-registration `Team` rows do not contain coordinates. Each row has an optional `organizationId`.
  Evidence: `core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Team.kt` has `organizationId` but no coordinate field. `IBillingRepository.getOrganizationsByIds` already provides the required batch lookup.
- Observation: The Android `ModalBottomSheet` skips its partial anchor but still enables the sheet drag and nested-scroll connection around an inner vertically scrolling column.
  Evidence: `EventFilterSheet` uses `rememberModalBottomSheetState(skipPartiallyExpanded = true)` and leaves `sheetGesturesEnabled` at its default value of `true`.
- Observation: The Android division dropdown calls do not pass `containerColor`, so `StandardTextField` uses `MaterialTheme.colorScheme.surface`, which is white in the current light theme.
  Evidence: `PlatformDropdown.android.kt` forwards an optional container color, but the Discover filter calls omit it.
- Observation: The combined focused test run reported one Kotlin incremental compiler cache error, then retried without the invalid incremental state and passed.
  Evidence: `:composeApp:testDebugUnitTest` completed with `BUILD SUCCESSFUL` after the compiler retry.
- Observation: A hard upward release can start the Material sheet settle animation with enough velocity to move the sheet above its expanded anchor. This is a transient animation state, not another sheet anchor.
  Evidence: Material3 `SheetState.animateTo` states that spring animations can overshoot and sends each overshoot value to the drag state. The two user screenshots show the expanded sheet and this transient over-anchor position.

## Decision Log

- Decision: Add a dedicated organization area query instead of adding location state to the normal paged Discover list.
  Rationale: Map search must use the visible camera area and must not mutate list filters or paging state.
  Date/Author: 2026-08-04 / Codex.
- Decision: Keep the visible-area organization and rental conversion in `EventSearchComponent`.
  Rationale: This component already expands affiliate facilities into rental entries and owns organization navigation. Reusing that path prevents rental marker and navigation data from drifting.
  Date/Author: 2026-08-04 / Codex.
- Decision: Show cached list markers first, then replace them atomically after a visible-area request completes.
  Rationale: Users get immediate offline-capable content, while a completed search does not mix stale out-of-area markers with the new map result.
  Date/Author: 2026-08-04 / Codex.
- Decision: Match the event marker interaction on both platforms.
  Rationale: One marker tap should select one or more results, one bottom carousel should show the selection, and the visible card should own navigation.
  Date/Author: 2026-08-04 / Codex.
- Decision: Bound organization area requests to an Earth-scale radius and omit invalid coordinates before Android grouping.
  Rationale: The endpoint expects a valid radius, and invalid coordinates must not create off-map groups.
  Date/Author: 2026-08-04 / Codex.
- Decision: Keep Team and Rental filters in separate `EventFilter` state flows.
  Rationale: Each Discover tab must show and clear its own selected criteria. Reusing the Organization filter would make changes on one tab alter another tab.
  Date/Author: 2026-08-04 / Codex.
- Decision: Use the existing organization batch endpoint to resolve Team coordinates.
  Rationale: `Team` already has a canonical `organizationId`, and repository rules require one batch request instead of one organization request per team.
  Date/Author: 2026-08-04 / Codex.
- Decision: Use the area organization endpoint when a Rental distance radius is active, then filter each expanded facility by its own coordinates.
  Rationale: This loads missing nearby rental organizations and avoids limiting distance results to the first alphabetical page.
  Date/Author: 2026-08-04 / Codex.
- Decision: Keep the default Android sheet drag handle and gestures. Consume upward pointer motion on the handle and header, plus unhandled upward scroll and fling input from the content, while the sheet is already expanded.
  Rationale: A hard handle swipe bypasses the content nested-scroll path and gives the settle spring a high upward velocity. Consuming only that upward input prevents the over-anchor spring. Downward handle input remains available for sliding and dismissal.
  Date/Author: 2026-08-04 / Codex.

## Outcomes & Retrospective

The map implementation is complete on the shared, Android, and native iOS paths. Cached organization and rental markers still appear first. Each map tab now requests the initial visible area and offers `Search this area` after a camera change. A place marker or numbered place group opens a bottom carousel. The selected card uses the existing organization or rental navigation callback.

The focused `BillingRepositoryHttpTest` passed. The Android production Kotlin compile passed. The iOS simulator Kotlin compile passed. Swift parsing passed. The complete iOS simulator app build passed, and the final app launched with process ID `96515`. Android runtime QA was not possible because `adb devices` reported no device.

The Team and Rental filter follow-up is complete. Each tab now owns separate filter state. Rental results use facility coordinates for radius checks and nearest-first ordering. Team results use the parent organization coordinates and support sport, gender, age, skill, registration price, and distance criteria. The shared Kotlin component remains the data and filter source for both Compose and native Swift.

The Android sheet retains its default drag handle and sheet gestures. Its inner content owns normal vertical scrolling. A pointer guard consumes only upward handle and header motion at the expanded anchor. A nested-scroll guard consumes upward content overflow and fling input at the same anchor. Clear All, Apply Filters, outside-tap, Back, and downward handle dismissal remain available. The Android gender, age, and skill dropdown fields now use the same `surfaceContainerLow` color as the sheet.

The focused filter, bridge, and filter-state tests passed. Android assembly passed. The iOS simulator Kotlin compile passed. Swift parsing passed. The complete arm64 iOS simulator app build passed. A later Android correction passed its focused test and assembly. Runtime validation on `emulator-5554` kept the drag handle at `[592,277][688,289]` through five hard swipes from `640,285` to `640,0` in 40 to 60 milliseconds. An eight-second, 10-frame-per-second recording showed no transient over-anchor frame. A downward handle swipe dismissed the sheet.

## Context and Orientation

The shared Discover presentation is in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt`. Its state owner is `EventSearchComponent.kt`. The native iOS Discover presentation is in `iosApp/iosApp/Discover/NativeDiscoverScreen.swift`.

The shared map contract is `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventMap/MapComponent.kt`. Android map rendering is in `composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap/EventMap.android.kt`. iOS map rendering is in `iosApp/iosApp/EventMap.swift`. Shared Compose map cards are in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventMap/composables/MapEventCard.kt`.

The organization repository contract and implementation are under `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/`. The web data contract is `/Users/elesesy/StudioProjects/mvp-site/src/app/api/organizations/route.ts`.

The shared filter sheet is `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/SearchBox.kt`. The shared filter composition is in `EventSearchScreen.kt`. Native iOS filter presentation is split between `iosApp/iosApp/Discover/DiscoverFilterSheet.swift`, `DiscoverFilterControls.swift`, and `NativeDiscoverViewController.swift`.

An organization map place is an `MVPPlace` whose `markerKind` is `organization`. A rental map place uses `rental`. A rental place can represent either a normal organization rental or one affiliate facility.

## Plan of Work

First, add `listOrganizationsInArea` to `IBillingRepository`, `BillingRepository`, and `BillingOrganizationCoordinator`. The method will normalize the visible radius, request up to 200 rows with `lat`, `lng`, and `radiusKm`, write the response to the existing Room catalog cache, and read the result back from that cache.

Second, add a suspending map search method and a place-to-organization lookup method to `EventSearchComponent`. The implementation will request area organizations, resolve rental field IDs when needed, expand affiliate rental facilities with the existing conversion, store the returned organization entries for later card navigation, and return mapped `MVPPlace` values.

Third, update both Discover presentations. Each map tab will show its currently loaded local markers immediately. Events, organizations, and rentals will perform one initial visible-area request after the map reports its camera radius. After a meaningful camera move or zoom, all three tabs will show `Search this area`. Organization and rental requests will replace place markers only after the request finishes.

Fourth, give Android and iOS place markers the event interaction model. Screen-space grouping will use stable keys based on marker kind and sorted place IDs. A one-place group will render the normal logo or initials marker. A multi-place group will render a numbered marker with the tab color. Tapping either marker will populate a bottom place-card carousel. Tapping the card will call the existing place-selection callback.

Finally, add repository URL and cache regression coverage, mapper or component coverage for affiliate facility results, and marker grouping checks where practical. Run focused tests, Android and iOS Kotlin compiles, Swift parsing, and Android emulator QA.

For the filter follow-up, first add pure Rental and Team filter functions. The Rental function will match selected sports, remove entries outside an active radius, and sort coordinate-bearing facilities by distance before name. The Team function will match selected sports, gender, age, skill, and registration price. It will use a map of organization IDs to organization coordinates for distance filtering and sorting.

Next, add raw Team and Rental source lists plus separate Team and Rental `EventFilter` flows to `EventSearchComponent`. Load Team organizations with `getOrganizationsByIds` in one batch. When Rental distance is active, use `listOrganizationsInArea` before expanding affiliate facilities. Reapply filters after data, sports, radius, or search location changes.

Then expose the two filter flows and their apply, clear, and snapshot actions to native Swift. Add Team and Rental cases to both filter-sheet presentations. Keep the Kotlin component as the filter and result source of truth.

Finally, keep the default Android sheet gestures. Consume upward handle and header motion plus upward content overflow after the sheet reaches its expanded anchor. Pass the sheet container color into Android dropdown fields. Run focused pure tests, Android unit tests and assembly, iOS Kotlin compilation, and Swift parsing.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-app`.

Run focused tests and compiles with JDK 17 and without the unrelated local backend bootstrap:

    ./gradlew :composeApp:testDebugUnitTest --tests '*BillingRepositoryHttpTest*' -Pmvp.startBackend=false
    ./gradlew :composeApp:compileDebugKotlinAndroid -Pmvp.startBackend=false
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64 -Pmvp.startBackend=false
    xcrun swiftc -parse iosApp/iosApp/EventMap.swift iosApp/iosApp/Discover/NativeDiscoverScreen.swift

For the Team and Rental filter follow-up, run:

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:testDebugUnitTest --tests '*DiscoverCatalogFiltersTest*' --tests '*NativeDiscoverBridgeTest*' -Pmvp.startBackend=false
    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:assembleDebug -Pmvp.startBackend=false
    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:compileKotlinIosSimulatorArm64 -Pmvp.startBackend=false
    xcrun swiftc -parse iosApp/iosApp/Discover/NativeDiscoverViewController.swift iosApp/iosApp/Discover/NativeDiscoverScreen.swift iosApp/iosApp/Discover/DiscoverFilterSheet.swift iosApp/iosApp/Discover/DiscoverFilterControls.swift

Check the edited files for whitespace errors:

    git diff --check -- plans/discover-map-organization-rental-search-execplan.md core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepositoryContract.kt core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingOrganizationCoordinator.kt core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchComponent.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventMap/composables/MapEventCard.kt composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap/EventMap.android.kt iosApp/iosApp/Discover/NativeDiscoverScreen.swift iosApp/iosApp/EventMap.swift

## Validation and Acceptance

Open Discover and select Organizations. Open the map. Cached organization markers must appear without waiting for a request. After the initial request finishes, the map must contain the organizations returned for the visible area. Pan far enough to cross the existing threshold. `Search this area` must appear. Press it. The control must show `Searching`, and the marker set must update as one completed result.

Repeat the same checks on Rentals. Affiliate facility rental markers must use facility coordinates and still open the correct rental action.

On both organization and rental maps, place two or more markers close enough that their icons touch. They must render as one numbered marker. Tap it. A bottom card and position controls must appear. Change the selected card, then tap it. The app must open the organization overview for an organization card or the rental destination for a rental card.

The event map behavior must remain unchanged. Location selection maps with `canClickPOI=true` must keep their existing confirmation behavior.

On Android, open Teams and Rentals and confirm that both search bars show the filter action. Apply a sport filter on each tab. Only matching loaded results must remain. Enable a distance radius on Rentals. The list must include only facilities within the radius and must order them nearest first. Enable Team division and distance filters. Each visible Team must satisfy all selected criteria.

Expand the Android filter sheet and scroll from its first section through Apply Filters several times. The content must scroll without moving the expanded sheet above its anchor or entering a spring loop. Swipe the handle hard to the top edge several times. The sheet must remain at its expanded anchor. Swipe the handle down. The sheet must slide and dismiss. Apply Filters, an outside tap, and Back must also dismiss it. Gender, age, and skill dropdown fields must use the same background color as the sheet.

Repeat the Team and Rental filter checks on native iOS. Native Swift must only present and edit filter state. The resulting lists must come from the shared Kotlin component.

## Idempotence and Recovery

The repository query writes through the existing catalog cache and can run repeatedly. Each area has its own cache key, so one viewport does not overwrite another viewport's ordered result. The UI publishes a completed map result only after conversion finishes. If a request fails, the component reports the existing Discover error and leaves the marker result empty instead of silently mixing stale results.

No database migration or destructive command is needed. Do not stage or alter unrelated dirty files.

## Interfaces and Dependencies

`IBillingRepository` will gain a dedicated suspending area-query method with latitude, longitude, radius in miles, and the affiliate rental flag. `BillingOrganizationCoordinator` will convert miles to kilometers because the web endpoint uses `radiusKm`.

`EventSearchComponent` will gain one suspending method that returns map places and one lookup method that returns the matching `Organization`. Both Compose and native Swift Discover will use them.

`EventSearchComponent` will also expose `teamFilter` and `rentalFilter` state flows. It will provide snapshot, update, native apply, and clear actions for both. The filter payload continues to use `EventFilter`, but Team price criteria apply to `registrationPriceCents`, and Rental criteria apply to organization or facility sport and coordinates.

Android will continue to use Maps Compose `MarkerInfoWindowComposable`, `MarkerState`, and camera projection. iOS will continue to use `GMSMapView`, `GMSMarker`, and SwiftUI overlay cards.

Plan revision note: Created on 2026-08-04 after the initial audit. It records the confirmed click-path defect, the existing web area-query contract, and the cross-platform implementation scope before source changes begin.

Plan revision note: Updated on 2026-08-04 after implementation. It records the completed cross-platform behavior, the successful focused test, compiles, and iOS launch, and the unavailable Android emulator.

Plan revision note: Extended on 2026-08-04 for Team and Rental list filters, nearest Rental facility ordering, the Android expanded-sheet drag loop, and Android dropdown background correction. The follow-up keeps Kotlin as the filter source of truth and treats native Swift as presentation.

Plan revision note: Completed on 2026-08-04 after focused tests, Android assembly, iOS Kotlin compilation, Swift parsing, and the arm64 iOS simulator app build passed. Android device validation remains pending because `adb` was not available in the final shell.

Plan revision note: Corrected on 2026-08-04 after product review and exact hard-swipe reproduction. The standard Android drag handle and sheet gestures are restored. Upward pointer motion and nested-scroll overflow are consumed only at the expanded anchor. The focused test, Android assembly, five hard top-edge swipes, an eight-second screen recording, and downward dismissal validation passed.
