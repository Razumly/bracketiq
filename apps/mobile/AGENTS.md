# Repository Guidelines

# ExecPlans
When writing complex features or significant refactors, use an ExecPlan (as described in .agent/PLANS.md) from design to implementation.

## Project Structure & Module Organization
`composeApp/` hosts the shared Kotlin Multiplatform app; keep cross-platform logic under `composeApp/src/commonMain/kotlin/com/razumly/mvp/<feature>` (e.g., `chat`, `eventMap`). Platform overrides stay in `androidMain` and `iosMain`, while `iosApp/` provides the Swift entry point and Podfile. Generated Room snapshots belong in `composeApp/schemas/`; treat `build/` and other Gradle outputs as ephemeral. Root scripts (`build.gradle.kts`, `settings.gradle.kts`, `gradle/`) centralize plugin versions�edit them only when updating shared build logic.

## Build, Test, and Development Commands
- `.\gradlew :composeApp:assembleDebug` builds the Android artifact with the shared Compose UI.
- `.\gradlew :composeApp:run` launches the desktop runtime for Compose smoke testing.
- `.\gradlew :composeApp:commonTest` executes the multiplatform unit suite in `commonTest`.
- `.\gradlew :composeApp:androidUnitTest` runs JVM/Android tests with Robolectric resources enabled.
- `.\gradlew bootIOSSimulator && .\gradlew :composeApp:iosSimulatorArm64Test` boots the configured device and runs native tests.
- `cd iosApp; pod install` refreshes the CocoaPods workspace after touching `composeApp.podspec`.

## Coding Style & Naming Conventions
Follow the Kotlin style guide: 4-space indents, prefer `val`, and lean on focused data classes. Compose surfaces use PascalCase suffixed with `Screen`, `Presenter`, or `UnifiedCard`, mirroring the feature folders under `com/razumly/mvp`. Cross-platform extensions belong in `core/` and should be grouped by capability (e.g., `LocationExtensions.kt`). Hoist state out of composables and run `.\gradlew :composeApp:lint` (or IDE inspections) before a PR.

## Testing Guidelines
Name tests with `given_when_then` phrasing and keep them beside the feature they cover (e.g., `EventSearchPresenterTest`). Shared logic lives in `commonTest`, Android helpers in `androidUnitTest`, and Swift interop checks in `iosTest`. Mock platform APIs through MockMP utilities already defined in `composeApp/build.gradle.kts`. When Room entities move, run `.\gradlew :composeApp:roomGenerateSchema` and review diffs under `composeApp/schemas/`. Add screenshots or snapshots for UI-heavy work so both platforms can verify behavior.

## Commit & Pull Request Guidelines
Follow the observed format `<Type>: <Sentence case summary>` (e.g., `Refactor: Standardize List Item Display`). Keep each commit focused on one change with matching tests or assets. Pull requests must summarize the change, list affected modules (`composeApp`, `iosApp`, etc.), link issues, and attach before/after screenshots for UI updates. Tag reviewers from Android and iOS whenever platform code is touched.

## Security & Configuration Tips
Store secrets in `secrets.properties` with fallbacks in `local.defaults.properties`, and never commit personal keys. Keep `google-services.json` and `sdk.*` values scoped to trusted environments via Gradle properties or CI secrets. When mocking payments or location flows, gate constants behind build-config flags instead of checking them into `commonMain`.
