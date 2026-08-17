# Cluster Discover Map Event Markers

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. It is stored under `plans/` because the repository requires ExecPlans to live there.

## Purpose / Big Picture

Discover map users currently see one marker per event, so events at the same venue or very nearby venues can overlap until individual markers become hard or impossible to tap. After this change, event markers whose circular icons touch at the current map zoom are shown as a single numbered marker. Tapping that marker opens the same bottom event-card surface used for one event, with carousel controls when the marker represents more than one event. A user can verify the behavior by zooming the Discover map until several event markers overlap, tapping the numbered marker, swiping through or using the carousel controls, and tapping a card to open the selected event detail.

## Progress

- [x] (2026-06-27T17:04Z) Read `PLANS.md`, inspected Android `EventMap.android.kt`, shared `MapEventCard.kt`, and iOS `EventMap.swift`, and confirmed this touches marker rendering plus the selected-card surface.
- [x] (2026-06-27T17:18Z) Added shared Compose marker/card controls for Android clustered markers and grouped selected cards.
- [x] (2026-06-27T17:18Z) Replaced Android one-event marker state with zoom-aware event groups and a selected-event carousel.
- [x] (2026-06-27T17:35Z) Replaced iOS one-event marker rendering with native Google Maps event groups and a SwiftUI bottom carousel.
- [x] (2026-06-27T17:40Z) Ran focused Android and iOS Kotlin compile checks, Swift syntax parsing, and diff whitespace checks.

## Surprises & Discoveries

- Observation: Android already uses a bottom Compose `MapEventCard` overlay for selected events, but iOS still uses Google Maps info windows for event taps.
  Evidence: `composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap/EventMap.android.kt` keeps `selectedMapEvent`; `iosApp/iosApp/EventMap.swift` implements `markerInfoWindow` and `didTapInfoWindowOf`.
- Observation: The checkout was dirty before this plan with unrelated registration/payment files, so map edits must stay scoped.
  Evidence: `git status --short` showed modified `ManualRegistrationPayment.kt`, `EventDetailsRegistrationSection.kt`, and `EventDtosTest.kt` before map files were edited.
- Observation: The first Android compile attempt failed before Kotlin compilation because the Gradle `startLocalBackend` helper started `mvp-site` but `/api/app-version?platform=android` returned HTTP 500.
  Evidence: `backend.err.log` reported missing `/Users/elesesy/StudioProjects/mvp-site/.next/dev/required-server-files.json`; rerunning with `-Pmvp.startBackend=false` reached Kotlin compilation and passed.
- Observation: The Xcode workspace build did not reach Swift compilation because it remained inside the CocoaPods `composeApp` Gradle framework script.
  Evidence: Two `xcodebuild -workspace iosApp/iosApp.xcworkspace -scheme iosApp -destination 'generic/platform=iOS Simulator' -configuration Debug build` attempts had to be interrupted in `[CP-User] Build composeApp`; `./gradlew :composeApp:compileKotlinIosSimulatorArm64 -Pmvp.startBackend=false` passed independently.

## Decision Log

- Decision: Cluster events in screen space instead of latitude/longitude distance.
  Rationale: The user asked for grouping when markers are touching at a specified zoom level. Screen-space distance is the direct representation of whether fixed-size marker icons overlap after zoom and camera changes.
  Date/Author: 2026-06-27 / Codex.
- Decision: Treat a one-event group and a many-event group as the same selected-card model.
  Rationale: This keeps marker tapping consistent and avoids maintaining separate event-card paths for single markers and clusters.
  Date/Author: 2026-06-27 / Codex.
- Decision: Test after every implementation update and require passing focused compile checks before calling the work done.
  Rationale: This repo's prior planning guidance emphasizes that incremental implementation needs validation in the plan itself, and these map changes cross Kotlin/Compose and Swift boundaries.
  Date/Author: 2026-06-27 / Codex.

## Outcomes & Retrospective

Implemented clustered event markers on Android and iOS. Android now uses a shared Compose carousel for the selected event group. iOS now uses a SwiftUI bottom carousel for event and event-cluster marker taps instead of requiring a Google Maps event info-window tap. Focused events are folded into the same grouping path so the same event is not rendered twice at the same coordinate. Full Xcode build verification remains inconclusive because the local CocoaPods Kotlin framework script did not complete in the allotted time, but the Swift file parses successfully and both focused Gradle platform compiles passed.

## Context and Orientation

The shared Kotlin Multiplatform app lives in `composeApp/`. Android's actual Discover map implementation is `composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap/EventMap.android.kt`. Shared Compose card and marker UI lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventMap/composables/MapEventCard.kt`. iOS uses a native Swift Google Maps bridge in `iosApp/iosApp/EventMap.swift`.

An "event marker group" in this plan means one visual map marker that represents one or more `Event` objects. A "screen-space cluster" means a group calculated from marker center points after Google Maps projects latitude and longitude onto the device screen. If two 50 dp or 50 pt circular markers would touch or overlap, they should be grouped.

## Plan of Work

First, extend the shared Compose event-map UI with a numbered circular cluster marker and a small event-card carousel wrapper. The carousel should show a normal `MapEventCard`, show previous/next controls only when there is more than one event, display the current card position, and call the existing event-selection callback when the card is tapped.

Second, update Android `EventMap.android.kt` so it projects all currently rendered events, including a focused event when present, into screen points and greedily groups nearby marker centers. The map should keep marker state by group key, render a normal `MapEventMarker` for a one-event group, render the new numbered marker for a multi-event group, and set `selectedMapEvents` plus `selectedMapEventIndex` when a group is tapped. Camera movement should trigger regrouping because screen positions change with zoom.

Third, update iOS `EventMap.swift` so `GoogleMapView` creates one Google marker per event group instead of one marker per event. A one-event group should keep the same image/initials marker behavior. A multi-event group should render a blue numbered marker. Tapping either should call back into SwiftUI with the event group, and the SwiftUI `EventMap` should show a bottom carousel matching the Android behavior.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-app`.

Run focused searches before editing:

    rg -n "selectedMapEvent|MapEventMarker|focusedEvent" composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap/EventMap.android.kt
    rg -n "EventMarkerData|didTap marker|focusedEvent" iosApp/iosApp/EventMap.swift

After each platform update, run the relevant compile check:

    ./gradlew :composeApp:compileDebugKotlinAndroid
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64

After all edits, run:

    git diff --check -- composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap/EventMap.android.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventMap/composables/MapEventCard.kt iosApp/iosApp/EventMap.swift plans/discover-map-event-clustering-execplan.md

Actual validation results from this implementation:

    ./gradlew :composeApp:compileDebugKotlinAndroid -Pmvp.startBackend=false
    BUILD SUCCESSFUL in 1m 48s

    ./gradlew :composeApp:compileKotlinIosSimulatorArm64 -Pmvp.startBackend=false
    BUILD SUCCESSFUL in 57s

    xcrun swiftc -parse iosApp/iosApp/EventMap.swift
    exited 0

    git diff --check -- composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap/EventMap.android.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventMap/composables/MapEventCard.kt iosApp/iosApp/EventMap.swift plans/discover-map-event-clustering-execplan.md
    exited 0

## Validation and Acceptance

Android acceptance: on the Discover map, two or more events whose 50 dp markers would touch at the current zoom render as one numbered marker. Tapping the numbered marker opens the bottom event card. The carousel controls appear only when the marker represents more than one event, and tapping the visible card calls the existing `onEventSelected` callback for that specific event. `./gradlew :composeApp:compileDebugKotlinAndroid` must pass.

iOS acceptance: on the iOS Discover map, overlapping event markers render as one numbered marker. Tapping either a single event marker or a cluster marker opens a bottom SwiftUI card carousel instead of requiring a Google Maps info-window tap. Tapping the card opens that event through the existing `onEventSelected` callback. `./gradlew :composeApp:compileKotlinIosSimulatorArm64` must pass, and a full Xcode build should be attempted if the local CocoaPods Gradle script is responsive.

## Idempotence and Recovery

The plan uses additive UI/helper changes and local marker regrouping only. Re-running compile commands is safe. If clustering behaves incorrectly, the previous behavior can be restored by rendering `events` directly again in `EventMap.android.kt` and `EventMap.swift`; no database or API changes are involved. The unrelated dirty files shown in the worktree before this task should not be staged or modified for this plan.

## Artifacts and Notes

Relevant initial evidence:

    git status --short
     M composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/ManualRegistrationPayment.kt
     M composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailsRegistrationSection.kt
     M composeApp/src/commonTest/kotlin/com/razumly/mvp/core/network/dto/EventDtosTest.kt

## Interfaces and Dependencies

Android should keep using `com.google.maps.android.compose.MarkerInfoWindowComposable`, `MarkerState`, and `cameraPositionState.projection`. New Compose helpers should live in `MapEventCard.kt` and accept plain `Event` values plus callbacks rather than depending on map APIs.

iOS should keep using `GMSMarker`, `GMSMapViewDelegate`, and the existing image URL helpers in `EventMap.swift`. New iOS marker-group data should be small Swift structs next to `EventMarkerData`, and the bottom carousel should be SwiftUI inside the existing `EventMap` view.

Plan revision note: Created on 2026-06-27 to capture the map-marker clustering request before implementation because it changes both platform marker rendering and selected-card behavior.

Plan revision note: Updated on 2026-06-27 after the Android implementation. The Android compile check passed with backend startup disabled because local backend health was failing for an unrelated missing Next.js dev artifact.

Plan revision note: Updated on 2026-06-27 after the iOS implementation and final validation. The Xcode build attempt is documented as inconclusive because it did not get past the CocoaPods Kotlin framework script, while focused Kotlin compiles, Swift parsing, and whitespace checks passed.
