# Add database-backed app update prompts

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `PLANS.md` at the repository root. This document must be maintained in accordance with that file. The backend and database contract live in `/Users/elesesy/StudioProjects/mvp-site`, and the mobile app implementation lives in `/Users/elesesy/StudioProjects/mvp-app`.

## Purpose / Big Picture

After this work, Bracket IQ can publish a mobile app release record in the database with a platform, version, build number, change list, update URL, and a flag indicating whether the release has breaking changes. When someone opens an older mobile app, the app asks the backend whether a newer release exists. If the newer release is non-breaking, the app shows a dialog with an Update now button and an X close button. If the newer release is breaking, the app shows the same change list and Update now button but removes the X and prevents outside/back dismissal so the update is required.

The observable result is a new public backend endpoint under `mvp-site`, a new database table and Prisma model for app releases, and a global `mvp-app` startup dialog that appears before or on top of the normal navigation stack when an update is available.

## Progress

- [x] (2026-05-18 23:52Z) Read `PLANS.md`, confirmed this is a cross-stack feature that warrants an ExecPlan, and identified the root mobile startup surface in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/RootComponent.kt` and `App.kt`.
- [x] (2026-05-18 23:52Z) Confirmed the current app-owned version sources are `composeApp/build.gradle.kts` for Android version/build, `composeApp/composeApp.podspec`, and `iosApp/iosApp/Info.plist` for iOS version/build.
- [x] (2026-05-18 23:58Z) Added the `AppReleases` database model, generated schema snapshot addition, SQL migration with seeded `1.5.6` platform rows, backend release comparison helper, and public `/api/app-version` route in `mvp-site`.
- [x] (2026-05-18 23:59Z) Added mobile DTOs, `AppUpdateRepository`, platform version/build access, persistent dismissal state, platform update URL opening, and the global root update dialog in `mvp-app`.
- [x] (2026-05-19 00:02Z) Added focused backend and mobile tests, ran validation, and recorded the passing commands here.

## Surprises & Discoveries

- Observation: The iOS app uses `CFBundleShortVersionString=1.5.6` and `CFBundleVersion=52`, while Android uses `versionName=1.5.6` and `versionCode=40`.
  Evidence: `/usr/libexec/PlistBuddy` against `iosApp/iosApp/Info.plist` returned `1.5.6` and `52`; `composeApp/build.gradle.kts` declares `val mvpVersion = "1.5.6"` and `val mvpVersionCode = 40`.

- Observation: `npx prisma generate` updates the generated TypeScript client but does not update `prisma/schema.generated.prisma`.
  Evidence: after generation, `src/generated/prisma/models/AppReleases.ts` existed, but `prisma/schema.generated.prisma` still needed a manual `AppReleasePlatformEnum` and `AppReleases` addition.

## Decision Log

- Decision: Store release rows in `mvp-site` rather than in mobile local storage.
  Rationale: `mvp-site` is the repository's source of truth for API and database contracts, and the app should not invent release metadata locally.
  Date/Author: 2026-05-18 / Codex

- Decision: Compare by platform-specific build number when both the app and database row have one, then fall back to semantic version-name comparison.
  Rationale: Android and iOS build numbers differ for the same marketing version, but each platform's build number is the most reliable ordering field within that platform. Version-name comparison keeps the API useful if a future row lacks a build number.
  Date/Author: 2026-05-18 / Codex

- Decision: Suppress locally dismissed non-breaking prompts by latest release key, but always show required prompts.
  Rationale: The X should let a user dismiss a non-breaking update without being nagged every cold open, while breaking changes must require the update regardless of prior dismissal.
  Date/Author: 2026-05-18 / Codex

## Outcomes & Retrospective

Implemented the end-to-end release prompt contract. `mvp-site` now has an additive `AppReleases` database table, seeded active `1.5.6` Android and iOS release rows, a public `/api/app-version` route, and focused route coverage. `mvp-app` now checks that endpoint on root startup, persists dismissal for non-breaking prompts, ignores dismissal for required prompts, and renders a global update dialog with an Update now button plus an X only when dismissal is allowed.

Validation passed with `npx prisma validate`, `npx jest src/app/api/app-version/__tests__/route.test.ts --runInBand`, `npx tsc --noEmit`, `./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.AppUpdateRepositoryTest"`, and `./gradlew :composeApp:compileKotlinIosSimulatorArm64`. The Android unit-test Gradle task also ran `:composeApp:compileDebugKotlinAndroid`.

The migration was not applied to the local database in this run. `npx prisma migrate status` targeted PostgreSQL `mvp` at `localhost:5433` but exited with a Prisma schema engine error before reporting migration state, so the implementation remains at the checked-in migration stage.

## Context and Orientation

`mvp-site` is a Next.js backend with Prisma. API route files live under `src/app/api/**/route.ts`, the Prisma schema is `prisma/schema.prisma`, and migrations live under `prisma/migrations/`. The mobile app calls backend routes through `MvpApiClient` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/MvpApiClient.kt`. The HTTP client ignores unknown JSON fields, so adding fields to this new response is backward compatible for future clients.

`mvp-app` is a Kotlin Multiplatform Compose app. The global root component is `RootComponent`, and the root composable is `App`. `RootComponent` already runs startup auth, registration, push, and chat refresh checks. `App` already renders global overlays and snackbars, so the update dialog should be added there as another global overlay. Local persistent preferences use `CurrentUserDataSource`, backed by DataStore.

The term "breaking changes" means a release record whose `hasBreakingChanges` boolean is true. A required update is an available update where at least one newer active release row for that same platform has `hasBreakingChanges=true`.

## Plan of Work

In `mvp-site`, add an `AppReleasePlatformEnum` enum and an `AppReleases` model to `prisma/schema.prisma`. The model should include `platform`, `versionName`, `buildNumber`, `changes`, `hasBreakingChanges`, `isActive`, `updateUrl`, `createdAt`, and `updatedAt`. Add an additive migration that creates the enum, table, and indexes. Seed rows for the currently shipped `1.5.6` Android and iOS releases so older installed apps have a latest release to compare against once the migration is deployed.

Add `src/lib/appReleases.ts` with platform normalization, version comparison, and response-shaping helpers. Add `src/app/api/app-version/route.ts` as a public GET endpoint. It accepts `platform`, `versionName`, and `buildNumber` query parameters, loads active release rows for that platform, finds the newest row, computes whether the current app is behind, computes whether any newer row is breaking, and returns the latest release plus `updateAvailable` and `updateRequired`.

In `mvp-app`, expose packaged version metadata through `Platform` actuals in Android and iOS. Add app-update DTOs and an `AppUpdateRepository` that calls `GET api/app-version?platform=...&versionName=...&buildNumber=...`, maps the response into an `AppUpdatePrompt`, and checks `CurrentUserDataSource` so dismissed non-breaking releases stay dismissed. Inject the repository into `RootComponent`, add a startup check, and expose a `StateFlow<AppUpdatePrompt?>`.

Add `AppUpdateDialog` in the root presentation layer. The dialog is custom rather than a stock `AlertDialog` so the X can sit in the top right. It shows the version, change bullets, "Update now", and only shows the X when `updateRequired` is false. The dialog opens the store URL through a small platform opener. Android can use the application context; iOS can use `UIApplication.openURL`.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site`, edit `prisma/schema.prisma`, add a migration folder under `prisma/migrations/`, add the release helper and route, and add route tests. Then run:

    npx prisma generate
    npx jest src/app/api/app-version/__tests__/route.test.ts
    npx tsc --noEmit

From `/Users/elesesy/StudioProjects/mvp-app`, edit common/platform Kotlin files and Koin modules, then run:

    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.AppUpdateRepositoryTest"
    ./gradlew :composeApp:compileDebugKotlinAndroid

If the focused unit test task is not accepted by Gradle source-set naming, run `./gradlew :composeApp:testDebugUnitTest` and inspect the full output for the new test class.

## Validation and Acceptance

Backend acceptance: a GET request like `/api/app-version?platform=android&versionName=1.5.5&buildNumber=39` returns HTTP 200 with `updateAvailable: true`, `latestVersion.versionName: "1.5.6"`, and a non-empty `changes` list once the seeded row exists. A request with the current Android build number `40` returns `updateAvailable: false`.

Mobile acceptance: when the repository receives an available non-breaking update, `RootComponent.appUpdatePrompt` becomes non-null, `App` renders a dialog with the change list, the X button is visible, and dismissing it persists the latest release key. When the response is required, the prompt appears even if a matching dismissal key exists, the X is absent, and the dialog cannot be dismissed by outside tap or back press.

## Idempotence and Recovery

The migration is additive. It creates a new table and enum and does not modify existing user, event, billing, or team data. If a local migration fails before completing, rerun Prisma migration status, fix the schema or SQL error, and retry before deploying. The seeded release row ids are deterministic, so repeated manual insert attempts can use `ON CONFLICT DO NOTHING`.

The mobile app stores only a dismissed release key in DataStore. Clearing app storage removes the dismissal and causes non-breaking prompts to appear again when appropriate. Required prompts ignore the dismissal key.

## Artifacts and Notes

Current version evidence:

    composeApp/build.gradle.kts: mvpVersion = "1.5.6", mvpVersionCode = 40
    iosApp/iosApp/Info.plist: CFBundleShortVersionString = 1.5.6, CFBundleVersion = 52

## Interfaces and Dependencies

The backend API response must have this shape:

    {
      "updateAvailable": true,
      "updateRequired": false,
      "latestVersion": {
        "platform": "ANDROID",
        "versionName": "1.5.6",
        "buildNumber": 40,
        "changes": ["..."],
        "hasBreakingChanges": false,
        "updateUrl": "https://play.google.com/store/apps/details?id=com.razumly.mvp",
        "releasedAt": "2026-05-18T00:00:00.000Z"
      }
    }

The mobile repository should expose:

    data class AppUpdatePrompt(
        val versionName: String,
        val buildNumber: Int?,
        val changes: List<String>,
        val updateRequired: Boolean,
        val updateUrl: String,
        val releaseKey: String,
    )

    interface IAppUpdateRepository {
        suspend fun checkForUpdate(): Result<AppUpdatePrompt?>
        suspend fun dismiss(prompt: AppUpdatePrompt)
        suspend fun openUpdate(prompt: AppUpdatePrompt): Result<Unit>
    }

Revision note 2026-05-18: Created the plan after repository exploration to capture the cross-repo database, API, and mobile startup-dialog contract before code edits.

Revision note 2026-05-19: Updated progress, discoveries, and outcomes after implementing the backend route, mobile repository/dialog, and focused validation.

Revision note 2026-05-19: Added iOS simulator Kotlin compile validation after the iOS actual version metadata and update URL opener compiled successfully.
