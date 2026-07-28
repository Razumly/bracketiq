# S-01 Startup Splash Evidence

Status: captured; human visual approval pending.

## Contract and ownership

- `RootComponent.Child.Splash` remains the source of truth for whether the splash is active.
- The screen exposes no form state, business actions, repository access, or local navigation.
- Android renders `ComposeStartupSplashScreen`.
- iOS renders `NativeStartupSplashScreen` through `NativeViewFactory` and retains the Compose implementation behind `IosNativeScreenFlags.startupSplash` as a rollback path.

## Automated verification

- `JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home ./gradlew :composeApp:testDebugUnitTest --tests com.razumly.mvp.app.StartupSplashScreenUiTest :composeApp:assembleDebug`
  - Result: pass on 2026-07-23.
- Xcode workspace `iosApp/iosApp.xcworkspace`, scheme `iosApp`, Debug, iPhone 16 Pro / iOS 18.6.
  - Result: Kotlin iOS framework compiled; `NativeStartupSplashScreen.swift` compiled; app linked, signed, validated, installed, and launched on 2026-07-23.

## Simulator recipe

1. Stop `com.razumly.mvp` on the baseline simulator.
2. Start screen recording.
3. Cold-launch the installed main-worktree `BracketIQ.app`.
4. Confirm the centered `BracketIQ` title and circular loading indicator appear on the system background.
5. Confirm the Kotlin root route advances from Splash to Login.

## Files

- `startup-splash.png`: extracted full-resolution frame showing the SwiftUI splash.
- `startup-splash-run.mp4`: cold-launch recording showing Splash -> Login route progression.

The screenshot is an after-conversion artifact. A separate pre-conversion image was not available when S-01 work began; layout parity was checked against the extracted Compose implementation retained in `StartupSplashScreen.compose.kt`. Do not change the ledger to `Approved` until the user reviews the captured image.
