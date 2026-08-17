# Sync iOS login to watchOS

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root.

## Purpose / Big Picture

Officials should not need to type credentials on the watch if they are already signed in on the iPhone app. After this change, the iOS app will request a watch-scoped setup token from the backend after mobile authentication, deliver it to the watchOS app through Apple WatchConnectivity, and the watchOS app will exchange that setup token for its own watch-scoped session token. The visible result is that opening the watch app after signing into the iOS app can move directly into the official schedule once the sync message is received.

## Progress

- [x] (2026-06-09T03:47:53Z) Confirmed Android already implements `WatchAuthSync` using the `/api/auth/watch/setup` and `/api/auth/watch/exchange` flow.
- [x] (2026-06-09T03:47:53Z) Confirmed the iOS `WatchAuthSync` actual is currently `NoOpWatchAuthSync`.
- [x] (2026-06-09T03:47:53Z) Confirmed the shared `UserRepository` already calls `syncAuthenticatedWatchAsync()` after successful login/bootstrap/profile caching.
- [x] (2026-06-09T04:07:00Z) Implement iOS `WatchAuthSync` with `WCSession`.
- [x] (2026-06-09T04:07:00Z) Implement watchOS `WCSession` receiver and setup-token exchange.
- [x] (2026-06-09T04:09:00Z) Validate with Kotlin/iOS compilation, watchOS build/run, the CocoaPods iOS framework link task, and the iOS workspace simulator build.

## Surprises & Discoveries

- Observation: The shared auth repository already has the right trigger point.
  Evidence: `UserRepository.cacheCurrentUserProfile` calls `syncAuthenticatedWatchAsync()` after setting authenticated state.
- Observation: The backend payload types already exist in shared code.
  Evidence: `WatchSetupRequestDto`, `WatchSetupResponseDto`, and `WatchSetupMessageDto` are defined in `AuthDtos.kt`.
- Observation: Kotlin/Native exposes the `sendMessage` error callback value as nullable.
  Evidence: The first `:composeApp:compileKotlinIosSimulatorArm64` run failed on a non-safe access to `error.localizedDescription`.
- Observation: The iOS app scheme must be built from `iosApp.xcworkspace`, not the raw project, when validating imports from CocoaPods.
  Evidence: The raw project build failed resolving `FirebaseCore`, `FirebaseMessaging`, `GoogleSignIn`, and `IQKeyboardManagerSwift`, while the workspace build resolved Pods.
- Observation: Kotlin/Native failed to generate code for an `object` singleton implementing `WCSessionDelegateProtocol` during the CocoaPods framework link.
  Evidence: `:composeApp:linkPodDebugFrameworkIosSimulatorArm64` failed with `Allocation of Obj-C class CLASS OBJECT name:IosWatchAuthSessionDelegate should have been lowered`.

## Decision Log

- Decision: Use WatchConnectivity user info transfer plus reachable message delivery.
  Rationale: `sendMessage` is fast when the watch app is reachable, while `transferUserInfo` gives a queued delivery path when the watch app is installed but not currently active.
  Date/Author: 2026-06-09 / Codex.
- Decision: Keep the watch token scoped to the watch by exchanging the setup token on watchOS rather than copying the phone session token.
  Rationale: This matches the Android Wear flow and avoids sharing the full mobile session token with the watch.
  Date/Author: 2026-06-09 / Codex.
- Decision: Check for a paired watch with the watch app installed before requesting a backend setup token.
  Rationale: This avoids spending backend operations for users who are signed into the iOS app but do not have the watch app available.
  Date/Author: 2026-06-09 / Codex.

## Outcomes & Retrospective

The iOS app now checks for a paired watch with the watch app installed, requests a watch setup token after the shared authenticated-user cache path runs, and sends that token to the paired watch with WatchConnectivity. The watchOS app now activates its own `WCSession`, receives either immediate messages or queued user info payloads, exchanges the setup token for a watch-scoped token, saves the session, and loads the official schedule.

Validation completed:

    ./gradlew :composeApp:compileKotlinIosSimulatorArm64
    ./gradlew :composeApp:linkPodDebugFrameworkIosSimulatorArm64 -Pkotlin.native.cocoapods.platform=iphonesimulator -Pkotlin.native.cocoapods.archs=arm64 -Pkotlin.native.cocoapods.configuration=Debug
    XcodeBuildMCP build/run for the MVPWatch watchOS simulator scheme
    XcodeBuildMCP build_sim for iosApp from iosApp.xcworkspace

The only warnings seen were existing Kotlin/iOS deprecation and naming warnings plus existing Xcode script/deprecation warnings. No new auth-sync compiler errors remain.

## Context and Orientation

The shared phone auth flow lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt`. The `WatchAuthSync` interface lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/auth/WatchAuthSync.kt`. Android implements it in `composeApp/src/androidMain/kotlin/com/razumly/mvp/core/auth/WatchAuthSync.android.kt`; iOS currently returns a no-op in `composeApp/src/iosMain/kotlin/com/razumly/mvp/core/auth/WatchAuthSync.ios.kt`. The watchOS app lives in `iosApp/watchApp`. `WatchTokenStore` saves watch auth tokens, `WatchAPIClient` talks to the backend, and `WatchOfficialViewModel` controls the signed-in UI state.

WatchConnectivity is Apple's paired-device messaging framework. In this repository it will be used in two directions: the iOS app sends a setup token to the paired watch, and the watch app receives that token and exchanges it with the backend.

## Plan of Work

First, replace the iOS no-op `WatchAuthSync` implementation with a Kotlin/Native implementation that imports `platform.WatchConnectivity`. It will check for a current mobile session token, call `api/auth/watch/setup` with `platform = "watchos"`, and send a dictionary containing `setupToken` and `issuedAt` through `WCSession`. The implementation will activate `WCSession`, use `sendMessage` if the watch is reachable, and always call `transferUserInfo` so an installed watch app can receive the token later.

Second, add a Swift watchOS receiver file, `iosApp/watchApp/WatchAuthConnectivity.swift`. It will own the watch-side `WCSessionDelegate`, parse incoming messages/userInfo dictionaries, and call a new `WatchOfficialViewModel.acceptSyncedSetupToken(_:)` method.

Third, add `WatchMatchRepository.exchangeWatchSetupToken(_:)`, which posts to `api/auth/watch/exchange`, saves the returned watch-scoped token in `WatchTokenStore`, and schedules pending operation sync. `WatchOfficialViewModel.acceptSyncedSetupToken(_:)` will call that repository method and load the official schedule.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-app`.

Validate Kotlin/Android/Wear quickly with:

    ./gradlew :composeApp:compileDebugKotlin :wearApp:assembleDebug

Validate iOS/watchOS with XcodeBuildMCP `build_run_sim` for the `MVPWatch` scheme. If Kotlin/Native iOS compilation is not exercised by that watch-only build, also run a Gradle iOS framework sync task or build the iOS app scheme.

## Validation and Acceptance

Acceptance requires the iOS actual to compile, the watchOS app to build and launch, and no whitespace errors from `git diff --check`. Behaviorally, when the iOS app has a valid mobile session and a paired watch app is installed, the iOS app should request a setup token and send it to the watch. The watch should exchange the token, save a watch-scoped token, and bootstrap into the matches screen.

## Idempotence and Recovery

Sending a setup token more than once is safe because the watch will overwrite its token with the latest successful exchange. If the watch is not installed or not paired, the iOS sync should log and return without failing mobile login. If the watch receives an expired setup token, the exchange fails and the watch remains in its previous auth state.

## Artifacts and Notes

Current evidence before implementation:

    composeApp/src/iosMain/kotlin/com/razumly/mvp/core/auth/WatchAuthSync.ios.kt returns NoOpWatchAuthSync.
    wearApp/src/main/java/com/razumly/mvp/wear/auth/WearAuthSyncService.kt exchanges setup tokens with api/auth/watch/exchange.

## Interfaces and Dependencies

iOS mobile:

    actual fun createWatchAuthSync(api: MvpApiClient): WatchAuthSync

watchOS:

    final class WatchAuthConnectivity: NSObject, WCSessionDelegate
    func start(viewModel: WatchOfficialViewModel)
    func acceptSyncedSetupToken(_ setupToken: String)

Revision note: Created this plan before implementing iOS-to-watchOS login sync so the cross-platform auth flow is explicit and restartable.
Revision note: Replaced the Kotlin/Native `object` WCSession delegate with a retained class instance after the CocoaPods framework link found a codegen failure that the simpler compile task did not catch.
Revision note: Validation now includes the full CocoaPods workspace iOS app build because the phone-side auth sync lives in the KMP framework used by the iOS target.
Revision note: Added the paired-watch and installed-watch-app guard before requesting a setup token, then reran the iOS Kotlin compile, CocoaPods framework link, and iOS workspace build.
