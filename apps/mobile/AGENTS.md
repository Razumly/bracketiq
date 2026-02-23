# Repository Guidelines

# ExecPlans
When writing complex features or significant refactors, use an ExecPlan (as described in `PLANS.md` at the repository root) from design to implementation.

## Project Structure & Module Organization
`composeApp/` hosts the shared Kotlin Multiplatform app; keep cross-platform logic under `composeApp/src/commonMain/kotlin/com/razumly/mvp/<feature>` (e.g., `chat`, `eventMap`). Platform overrides stay in `androidMain` and `iosMain`, while `iosApp/` provides the Swift entry point and Podfile. Generated Room snapshots belong in `composeApp/schemas/`; treat `build/` and other Gradle outputs as ephemeral. Root scripts (`build.gradle.kts`, `settings.gradle.kts`, `gradle/`) centralize plugin versions; edit them only when updating shared build logic.

## Backend & Data Contract Source of Truth
The backend and database definitions live in `mvp-site`. On macOS for this workspace, use `/Users/elesesy/StudioProjects/mvp-site/`. On Windows/WSL, use `/home/camka/Projects/MVP/mvp-site/` (Windows UNC path: `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site`). For all API endpoint usage and request/response data types in this repo, reference that project as the source of truth. Do not invent or drift endpoint paths, payloads, or shared data models without first aligning with `mvp-site`.

## Batch & Atomic API Standards
Any feature that loads collections of entities must expose and consume batch retrieval APIs (typically `ids` query params with chunking) instead of N per-item requests. This applies to users, organizations, events, teams, fields, and timeslots, especially on event load paths.
When adding or editing list-fetching code, ensure both backend route support and client repository/service usage are updated together so the runtime path actually uses batching.
Any save flow that updates multiple related records (for example event match edits) must use a bulk endpoint and execute inside a single database transaction. Partial success is not allowed: on any failure, rollback all changes and return a clear error response that clients can surface.

## Build, Test, and Development Commands
- `./gradlew :composeApp:assembleDebug` builds the Android artifact with the shared Compose UI (PowerShell equivalent: `.\gradlew :composeApp:assembleDebug`).
- `./gradlew :composeApp:run` launches the desktop runtime for Compose smoke testing.
- `./gradlew :composeApp:testDebugUnitTest` runs the primary local JVM/Android unit test suite (Robolectric-enabled).
- `./gradlew :composeApp:testReleaseUnitTest` runs release-variant JVM tests.
- `./gradlew :composeApp:test` runs all Android JVM unit tests.
- `./gradlew :composeApp:allTests` runs aggregated multiplatform tests; on Linux/WSL this can fail due to iOS simulator tasks (`xcrun`) and should be run on macOS.
- `./gradlew bootIOSSimulator && ./gradlew :composeApp:iosSimulatorArm64Test` boots the configured iOS simulator and runs native tests (macOS only).
- `cd iosApp; pod install` refreshes the CocoaPods workspace after touching `composeApp.podspec`.

## Local Test Environment (WSL)
- Use JDK 17 for Gradle builds/tests. Set `org.gradle.java.home` in `~/.gradle/gradle.properties`.
- Point Android SDK to a Linux SDK path in `local.properties` (for this machine: `sdk.dir=/home/camka/Android/Sdk`), not the Windows SDK path under `C:\...`.
- Ensure SDK packages required by this project are installed: `platform-tools`, `platforms;android-35`, `platforms;android-36`, `build-tools;35.0.0`, `build-tools;36.0.0`.
- Export `ANDROID_SDK_ROOT`/`ANDROID_HOME` to the Linux SDK path before running tests in new shells.
- Do not run Gradle test tasks concurrently from multiple agents in the same checkout; they can contend on `build/` and Gradle caches and cause flaky failures.

## Coding Style & Naming Conventions
Follow the Kotlin style guide: 4-space indents, prefer `val`, and lean on focused data classes. Compose surfaces use PascalCase suffixed with `Screen`, `Presenter`, or `UnifiedCard`, mirroring the feature folders under `com/razumly/mvp`. Cross-platform extensions belong in `core/` and should be grouped by capability (e.g., `LocationExtensions.kt`). Hoist state out of composables and run `.\gradlew :composeApp:lint` (or IDE inspections) before a PR.

## Testing Guidelines
Name tests with `given_when_then` phrasing and keep them beside the feature they cover (e.g., `EventSearchPresenterTest`). Shared logic lives in `commonTest`, Android helpers in `androidUnitTest`, and Swift interop checks in `iosTest`. Mock platform APIs through MockMP utilities already defined in `composeApp/build.gradle.kts`. When Room entities move, run `.\gradlew :composeApp:roomGenerateSchema` and review diffs under `composeApp/schemas/`. Add screenshots or snapshots for UI-heavy work so both platforms can verify behavior.

## Form & Scheduling Standards
Use date-only calendar pickers for all birthday/date-of-birth input. Do not use datetime pickers for DOB fields, and persist DOB in `YYYY-MM-DD` semantics.
Use 12-hour time presentation (`AM/PM`) for user-facing time pickers and time labels.
Do not duplicate the same setting behind multiple control types in one form section (for example, both dropdown and checkbox for scoring mode). Keep a single source-of-truth control and ensure the full labeled row is clickable.
When playoffs are enabled, `playoffTeamCount` must have no implicit default and must be treated as required with an explicit validation error until set.
For league/tournament field provisioning, each field must carry explicit `divisions` assignment. If no explicit division is selected, fallback must be deterministic (`event.divisions` first, then `OPEN`) and must never leave fields with empty divisions for scheduling.
Weekly timeslots that allow multiple weekdays must be represented as a multi-select day list at the UI boundary and normalized consistently across API/storage/scheduler layers with backward compatibility for legacy single-day records.
Any change that affects create/edit event forms must ship with regression tests for validation, payload mapping, and scheduler eligibility to prevent "no fields available for division" regressions.

## Commit & Pull Request Guidelines
Follow the observed format `<Type>: <Sentence case summary>` (e.g., `Refactor: Standardize List Item Display`). Keep each commit focused on one change with matching tests or assets. Pull requests must summarize the change, list affected modules (`composeApp`, `iosApp`, etc.), link issues, and attach before/after screenshots for UI updates. Tag reviewers from Android and iOS whenever platform code is touched.

## Security & Configuration Tips
Store secrets in `secrets.properties` with fallbacks in `local.defaults.properties`, and never commit personal keys. Keep `google-services.json` and `sdk.*` values scoped to trusted environments via Gradle properties or CI secrets. When mocking payments or location flows, gate constants behind build-config flags instead of checking them into `commonMain`.
