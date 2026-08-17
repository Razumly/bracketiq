# Shared Map Underlay Reveal

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [PLANS.md](C:\Users\samue\StudioProjects\mvp-app\PLANS.md).

## Purpose / Big Picture

After this change, every fullscreen map transition in this repository uses the same shared effect on Android and iOS. Instead of clipping the native map itself, the screen content stays on top and a transparent circular hole expands through that content, revealing the map underneath. A user should see the same reveal when opening the map from `EventSearch`, `EventDetails`, or `MatchDetail`, and the same effect should reverse when closing it.

## Progress

- [x] (2026-03-22 11:53 -07:00) Read `PLANS.md` and inspected the existing map reveal implementation in common, Android, and iOS code.
- [x] (2026-03-22 12:06 -07:00) Replaced the old `CircularRevealShape` implementation with a shared `CircularRevealUnderlay` composable that clears an expanding circular hole from foreground content.
- [x] (2026-03-22 12:14 -07:00) Moved `EventSearchScreen`, `EventDetails`, and the mobile path in `MatchDetailScreen` to place `EventMap` under foreground content and drive the transition with the shared reveal overlay.
- [x] (2026-03-22 12:18 -07:00) Removed reveal-specific parameters and state from `EventMap.android.kt`, `EventMap.ios.kt`, `NativeViewFactory`, `IOSNativeViewFactory.swift`, `MapComponent.ios.kt`, and `iosApp/EventMap.swift`.
- [x] (2026-03-22 12:27 -07:00) Ran focused validation commands and recorded the environment blockers and unrelated repo compile failures.

## Surprises & Discoveries

- Observation: The Android implementation already uses a shared `CircularRevealShape`, but it is applied directly to the native map container in `composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap/EventMap.android.kt`.
  Evidence: `EventMap.android.kt` computes `localRevealCenter` and applies `.clip(CircularRevealShape(animationProgress, localRevealCenter))`.
- Observation: iOS uses a completely separate reveal path driven by `component.isMapVisible` and SwiftUI opacity in `iosApp/iosApp/EventMap.swift`.
  Evidence: `EventMap.ios.kt` calls `component.revealMap()` / `hideMap()`, and `EventMap.swift` observes `component.isMapVisible`.
- Observation: This Windows workspace cannot complete Android debug compilation because KSP fails before Kotlin compilation with `sun.awt.PlatformGraphicsInfo`.
  Evidence: `:composeApp:kspDebugKotlinAndroid` fails during `.\gradlew :composeApp:compileDebugKotlinAndroid` even with `JAVA_TOOL_OPTIONS=-Djava.awt.headless=true`.
- Observation: Common metadata compilation is already failing on unrelated sources in the current tree.
  Evidence: `.\gradlew :composeApp:compileCommonMainKotlinMetadata` fails in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/MatchDtos.kt` and `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`.

## Decision Log

- Decision: The reveal effect will move to a common Compose overlay instead of staying inside either platform map implementation.
  Rationale: The user explicitly wants the map below the screen content so the animation is no longer OS-dependent. A common overlay lets both platforms use the same visual behavior.
  Date/Author: 2026-03-22 / Codex
- Decision: The `EventMap` expect/actual API will no longer accept a reveal center.
  Rationale: The reveal center still exists, but it now belongs to the foreground overlay container. Keeping it on the map API would preserve the old platform-owned animation boundary.
  Date/Author: 2026-03-22 / Codex
- Decision: The existing inline large-screen map in `MatchDetailScreen` will stay inline, while only the fullscreen mobile map path uses the shared underlay reveal.
  Rationale: The inline large-screen section is already a normal in-layout map, not a fullscreen overlay that needs this transition pattern.
  Date/Author: 2026-03-22 / Codex

## Outcomes & Retrospective

The shared underlay reveal is now implemented in common Compose code, and the three map entry points now treat the map as background content instead of clipping the native map itself. Android no longer computes a local reveal center inside `EventMap.android.kt`, and iOS no longer carries a second reveal visibility flow or SwiftUI transition code.

The main gap is validation. The intended compile checks were attempted, but this workspace is currently blocked by unrelated KSP and existing common-source errors that predate this refactor. A Mac build is still required to validate the Swift side in Xcode, and the existing repo compile issues need to be cleared before a clean Gradle confirmation is possible here.

## Context and Orientation

The shared map entry point is `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventMap/EventMap.kt`. Android implements it in `composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap/EventMap.android.kt`, and iOS implements it in `composeApp/src/iosMain/kotlin/com/razumly/mvp/eventMap/EventMap.ios.kt` with Swift support in `iosApp/iosApp/EventMap.swift` and `iosApp/iosApp/IOSNativeViewFactory.swift`.

There are three current callers. `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt` uses the map as an overlay over the discover tabs. `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt` uses it for location picking. `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailScreen.kt` uses it for field location viewing. All three already track a reveal center in window coordinates.

The current Android behavior clips the map itself. The current iOS behavior fades a SwiftUI-hosted map based on a second visibility flow that only exists on iOS. The target state is a shared foreground overlay in common Compose code that clears a circular hole through the foreground content. The map should sit underneath that content. When the map is fully open, the foreground content should no longer intercept touches.

## Plan of Work

First, add a common composable in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/util/` that can host background map content and foreground screen content together. It will animate a `Float` progress from `0f` to `1f`, where `0f` means the foreground is fully visible and `1f` means the foreground is fully cleared by a circular hole. The composable will compute a safe local reveal center from window coordinates and clear the hole with a Compose drawing operation so the same code runs on Android and iOS.

Second, update `EventSearchScreen.kt` so the tab content and search overlay become the foreground content of this new container, while `EventMap` becomes the background child. The map floating button already records its center; that same point will drive the reveal. The existing `showMap` flow remains the source of truth for whether the reveal is opening or closing.

Third, update `EventDetails.kt` and `MatchDetailScreen.kt` to use the same container. `EventDetails.kt` already reports button and selected-marker centers through `onMapRevealCenterChange`, so those centers can remain unchanged while the map is moved below the main content. `MatchDetailScreen.kt` will keep recording the button center and will use the same shared reveal container for the mobile fullscreen map path and the larger-screen inline map section.

Fourth, simplify the platform map implementations. Remove `revealCenter` from the `EventMap` expect/actual API. Remove Android-specific clipping logic and iOS-specific `revealMap` / `hideMap` plumbing. Update `NativeViewFactory.kt`, `IOSNativeViewFactory.swift`, and `iosApp/iosApp/EventMap.swift` so they no longer pass or depend on reveal coordinates for display.

## Concrete Steps

From `C:\Users\samue\StudioProjects\mvp-app`, implement the change in this order:

1. Add the shared reveal container in common code and wire it with `animateFloatAsState`.
2. Replace the direct overlay ordering in `EventSearchScreen.kt` with the new container.
3. Replace the direct overlay ordering in `EventDetails.kt` and `MatchDetailScreen.kt` with the new container.
4. Remove reveal-specific parameters and state from Android and iOS map implementations.
5. Run a focused Gradle compile or test command that covers the touched shared and Android code.

Expected validation commands:

    cd C:\Users\samue\StudioProjects\mvp-app
    .\gradlew :composeApp:compileDebugKotlinAndroid

If the compile succeeds, Gradle should end with a `BUILD SUCCESSFUL` line. If there is an iOS-only syntax issue in Swift, it will need to be resolved by inspecting the changed Swift files because this Windows environment cannot run Xcode.

Actual validation results in this run:

    cd C:\Users\samue\StudioProjects\mvp-app
    .\gradlew :composeApp:compileDebugKotlinAndroid
    -> fails in :composeApp:kspDebugKotlinAndroid with java.lang.NoClassDefFoundError: Could not initialize class sun.awt.PlatformGraphicsInfo

    cd C:\Users\samue\StudioProjects\mvp-app
    .\gradlew :composeApp:compileCommonMainKotlinMetadata
    -> fails on unrelated existing errors in MatchDtos.kt and EventDetailScreen.kt before this map refactor can be cleanly validated

## Validation and Acceptance

Acceptance is behavioral:

1. Opening the map from the discover screen should reveal the map from the recorded button or card center, with the tab content acting as the mask and the map visible underneath.
2. Closing that map should reverse the same animation instead of abruptly swapping layers.
3. Opening the event location picker and the match field location map should use the same reveal behavior without any platform-specific branching.
4. `EventMap.android.kt` and `iosApp/iosApp/EventMap.swift` should no longer contain circular reveal display logic.

## Idempotence and Recovery

These edits are source-only and safe to repeat. If the shared reveal overlay fails on one caller, the rollback path is to keep the new common composable and temporarily route that caller back to the previous child ordering while leaving the platform API cleanup intact. No database or persisted data changes are involved.

## Artifacts and Notes

Important starting references:

    composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap/EventMap.android.kt
    composeApp/src/iosMain/kotlin/com/razumly/mvp/eventMap/EventMap.ios.kt
    iosApp/iosApp/EventMap.swift
    composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt
    composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt
    composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailScreen.kt

## Interfaces and Dependencies

At the end of this work, the shared map API in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventMap/EventMap.kt` should no longer require a reveal center. The reveal center should instead belong to the new common overlay container, which will accept:

    isRevealed: Boolean
    revealCenterInWindow: Offset
    backgroundContent: @Composable () -> Unit
    foregroundContent: @Composable () -> Unit

The Android and iOS platform map implementations should remain responsible only for displaying and interacting with the map itself, not for animating how the screen transitions into map mode.

Revision note: Created this plan before implementation to document the shared-underlay migration and the files involved.
Revision note: Updated after implementation to record the completed refactor, the API simplifications, and the validation blockers encountered in this workspace.
