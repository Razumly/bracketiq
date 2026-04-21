# Kotlin Multiplatform Feature Modularization

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. It is self-contained for a contributor who has only the current working tree and this plan.

## Purpose / Big Picture

The app currently compiles as one large Kotlin Multiplatform Gradle module, `:composeApp`. Moving files between Kotlin packages alone will not materially improve compile time, because Gradle and the Kotlin compiler still treat the project as one source set. This plan introduces real Gradle modules so edits in a feature such as event details, chat, map, profile, or teams recompile only that feature and the thin app shell instead of recompiling the full app.

After this work, a developer should be able to make a UI-only change in event details or chat and observe a smaller set of Gradle compile tasks than today. The observable outcome is not a user-facing feature change; it is a faster incremental build verified by Gradle task output and profile reports while the Android and iOS app behavior remains the same.

## Progress

- [x] (2026-04-18 15:19-07:00) Audited the current Gradle layout and confirmed `settings.gradle.kts` includes only `:composeApp`.
- [x] (2026-04-18 15:19-07:00) Counted current common source sizes by top-level package and identified `eventDetail` and `core` as the largest compile units.
- [x] (2026-04-18 15:19-07:00) Audited imports between current top-level packages and identified feature cycles that must be broken before module extraction.
- [x] (2026-04-18 15:19-07:00) Created this initial ExecPlan.
- [ ] Record baseline clean and incremental Gradle timings before moving source.
- [ ] Add shared Gradle module conventions and the first empty KMP library modules.
- [ ] Extract non-UI core contracts and repository interfaces.
- [ ] Move Room/KSP work into a database module.
- [ ] Move repository implementations behind stable repository API modules.
- [ ] Extract app shell routing and DI out of `core`.
- [ ] Extract shared UI/design modules with no feature dependencies.
- [ ] Extract the first high-value feature modules.
- [ ] Compare final Gradle profiles and test/build behavior against the baseline.

## Surprises & Discoveries

- Observation: The project is not currently modularized at the Gradle level.
  Evidence: `settings.gradle.kts` contains `include(":composeApp")` and no other included project.

- Observation: The largest common source areas are `eventDetail` and `core`.
  Evidence: A source count under `composeApp/src/commonMain/kotlin/com/razumly/mvp` showed `eventDetail` at 53 Kotlin files and 26,129 lines, and `core` at 168 Kotlin files and 18,655 lines.

- Observation: `core` is not a leaf dependency. It imports features and therefore cannot become a clean shared module without first moving the app shell and a few shared contracts.
  Evidence: `core/presentation/App.kt` imports screens from chat, event create, event detail, event management, event search, match detail, organization detail, profile, profile completion, refund manager, team management, and auth. `core/presentation/RootComponent.kt` imports the corresponding feature components. `core/data/repositories/PushNotificationsRepository.kt`, `core/presentation/PlayerInteractionComponent.kt`, and `core/presentation/RootComponent.kt` import chat repository/component types.

- Observation: Some model and network code currently depends on Compose/presentation code, which would force non-UI modules to apply UI dependencies unless cleaned up.
  Evidence: `core/data/dataTypes/Event.kt` imports `androidx.compose.ui.graphics.toArgb` and `core.presentation.Primary`. `core/network/dto/EventDtos.kt` has the same dependency. Several DTO/model paths import `core.presentation.util.toNameCase`.

- Observation: The current `eventDetail` package is both a screen and a shared event-editing/event-scheduling library for other features.
  Evidence: `eventCreate` imports `EventDetails`, signature dialogs, staff helpers, and `IMatchRepository` from `eventDetail`. `matchDetail`, `eventSearch`, and `organizationDetail` also import `eventDetail.data.IMatchRepository`.

- Observation: Rental scheduling code is currently owned by `eventSearch` but reused by organization details.
  Evidence: `organizationDetail` imports `RentalAvailabilityLoader`, rental data types, rental UI content, and rental scheduling helpers from `eventSearch`.

## Decision Log

- Decision: Treat this as Gradle/KMP modularization, not just Kotlin package cleanup.
  Rationale: Kotlin package names affect organization, but compile-time isolation comes from Gradle project boundaries and stable public APIs between those projects.
  Date/Author: 2026-04-18 / Codex

- Decision: Start with a small number of high-value modules instead of one module per screen or repository.
  Rationale: Kotlin Multiplatform modules add configuration and target tasks for common, Android, and iOS. Too many tiny modules can slow clean builds and make dependency management noisy. The first split should isolate the biggest hot spots and expensive processors: event details, core UI, repository implementations, and Room/KSP.
  Date/Author: 2026-04-18 / Codex

- Decision: Repository interfaces should live separately from repository implementations.
  Rationale: Feature modules should compile against stable interfaces and request/result models. Backend or database implementation changes should not force feature UI modules to recompile unless the interface changes.
  Date/Author: 2026-04-18 / Codex

- Decision: Do not put app routing, root navigation, or global Koin assembly in `core`.
  Rationale: The app shell necessarily depends on all features. If it lives in `core`, every feature extraction creates cycles. `core` modules must be reusable lower-level modules, while the app shell is the place that composes features together.
  Date/Author: 2026-04-18 / Codex

- Decision: Extract shared event editing and rental scheduling modules before extracting their current owning features.
  Rationale: `eventCreate` depends on `eventDetail`, and `organizationDetail` depends on `eventSearch`. Moving the owning features first would preserve the wrong dependencies or create Gradle cycles. Shared modules remove those cross-feature imports.
  Date/Author: 2026-04-18 / Codex

## Outcomes & Retrospective

This initial plan records the target module shape and extraction order. No source files have been moved yet. The main implementation risk is not creating build files; it is removing current cycles without behavior changes. The highest-value first targets are `eventDetail`, `core:data`, `core:presentation`, and Room/KSP because they are large or expensive to compile.

## Context and Orientation

This repository is a Kotlin Multiplatform app. The shared app code lives under `composeApp/src/commonMain/kotlin/com/razumly/mvp`, Android-specific code under `composeApp/src/androidMain/kotlin/com/razumly/mvp`, and iOS-specific code under `composeApp/src/iosMain/kotlin/com/razumly/mvp`. The current Android application and iOS framework are both produced by `:composeApp`.

A Gradle module is a separately compiled project such as `:feature:event-detail` or `:core:model`. A Kotlin package is the namespace declared at the top of a Kotlin file, such as `package com.razumly.mvp.eventDetail`. Kotlin packages are useful for code organization, but they are not enough to reduce compile time. This plan uses Gradle modules as the compile boundaries while preserving or gradually adjusting Kotlin package names as needed.

The current source-size map from `commonMain` is:

- `eventDetail`: 53 files, 26,129 lines.
- `core`: 168 files, 18,655 lines.
- `profile`: 7 files, 5,549 lines.
- `icons`: 27 files, 4,248 lines.
- `eventSearch`: 21 files, 4,106 lines.
- `eventCreate`: 4 files, 2,737 lines.
- `matchDetail`: 2 files, 2,711 lines.
- `chat`: 13 files, 2,601 lines.
- Smaller packages: team management, organization detail, auth, map, refunds, profile completion, and event management.

Inside `core`, the largest areas are:

- `core/data`: 84 files, 10,792 lines. This includes models, DTOs, DAOs, repository implementations, repository interfaces, and utility code.
- `core/presentation`: 53 files, 5,270 lines. This includes app/root navigation, shared composables, theme tokens, payment UI, and platform UI expect/actual declarations.
- `core/network`: 21 files, 2,233 lines. This includes Ktor client setup, API errors, auth token storage, upload file support, and network DTOs.

The largest single event-detail files are `EventDetailComponent.kt`, `EventDetailScreen.kt`, and `EventDetails.kt`, each several thousand lines. There is already an existing plan, `plans/event-details-modularization-execplan.md`, that split some read/edit event-detail code within the package. This plan builds on that direction by moving compile boundaries to Gradle modules.

## Target Module Shape

Keep `:composeApp` as the Android application and CocoaPods/iOS framework producer at first. It should become thin: platform entry points, CocoaPods configuration, SKIE configuration, app-level Koin startup, and root app-shell wiring. Do not move CocoaPods, app versioning, Google Services, or Android application configuration out during the first modularization pass.

Add these core modules first:

- `:core:foundation`: small non-UI utilities that are safe everywhere, such as ID generation, platform name, plain string formatting helpers, error/result wrappers, and constants that do not depend on Compose, Ktor, Room, or Koin.
- `:core:model`: domain models, enums, relation models, and pure normalization helpers. This module may initially depend on serialization, datetime, and Room annotations because current entities are also persisted models. It must not depend on Compose or presentation code.
- `:core:network`: Ktor client setup, API error handling, auth token storage, base URL expect/actual declarations, upload file abstractions, and network DTO mappers. This module must not depend on Compose UI.
- `:core:database`: Room database service, DAOs, converters, migrations, database constructor, platform database builders, and Room schemas. This is the only core module that should apply Room and KSP.
- `:core:repository-api`: repository interfaces and stable request/result classes used by features, such as `IEventRepository`, `IUserRepository`, `ITeamRepository`, `IBillingRepository`, `IFieldRepository`, `ISportsRepository`, `IImagesRepository`, `IPushNotificationsRepository`, `IMatchRepository`, `IMessageRepository`, and `IChatGroupRepository`.
- `:core:repository-impl`: concrete repository implementations. It depends on `:core:repository-api`, `:core:network`, `:core:database`, and `:core:model`. If profiling later shows this module is still too hot, split it into domain implementation modules such as `:data:event`, `:data:user`, `:data:billing`, and `:data:chat`.
- `:core:designsystem`: theme tokens, icons, app design primitives, and generic shared Compose controls. This module may depend on Compose and resources, but not on repositories or feature modules.
- `:core:common-ui`: shared domain-aware UI that is reused across multiple features, such as event cards, player cards, network avatars, payment controls, dialogs, platform date/text/dropdown/web controls, and image upload helpers. This module may depend on `:core:model`, `:core:repository-api` only when a component contract truly requires it, and `:core:designsystem`.

Add these shared capability modules before feature modules that currently import each other:

- `:shared:map`: `EventMap`, `MapComponent`, map platform actuals, and map layout constants. This is shared because event search, event detail, and match detail all import map code.
- `:shared:event-editor`: create/edit event form UI, event edit validation, staff invite/editing helpers, signature prompt state/dialogs, division editor logic, and schedule/editing helpers used by both event creation and event details.
- `:shared:event-rules`: pure event/match scheduling rules used outside event-detail UI, including match-rule resolution and schedule eligibility helpers.
- `:shared:rentals`: rental availability loader, rental field option/busy-block models, rental scheduling helpers, and rental builder/confirmation UI currently shared between event search and organization detail.

Add feature modules after those shared dependencies exist:

- `:feature:event-detail`: read-only event details screen/component, event detail state coordination, participant management UI, bracket/schedule detail UI, and event detail tests.
- `:feature:event-create`: event creation flow and component. It should depend on `:shared:event-editor`, not `:feature:event-detail`.
- `:feature:event-search`: discover/search tabs and search component. It may depend on `:shared:map` and `:shared:rentals`.
- `:feature:organization-detail`: organization screen/component. It should depend on `:shared:rentals`, not `:feature:event-search`.
- `:feature:match-detail`: match screen/component. It should depend on `:shared:event-rules`, `:shared:map`, and repository APIs, not `:feature:event-detail`.
- `:feature:chat`: chat list/group UI and components. Chat repository interfaces should be in `:core:repository-api`; implementations should not stay in the feature module if app startup or push notifications need them.
- `:feature:profile`: profile home and profile details.
- `:feature:teams`: team management UI.
- `:feature:auth`: auth UI and auth components, including Android/iOS actuals.
- `:feature:billing`: refund manager and payment-related flows if they remain cohesive. If refund manager stays tiny, it can be delayed until after the larger feature modules are extracted.
- `:feature:event-management` and `:feature:profile-completion`: small modules that can be extracted after the main graph is stable.

The final app shell in `:composeApp` should depend on all feature modules and collect their Koin modules. Feature modules should not depend on `:composeApp`.

## Plan of Work

First, record baseline compile behavior before changing the graph. Run clean and incremental builds with Gradle profile output. Save the profile paths and summarize which tasks dominate. Include Android debug compilation from this Windows workspace. On macOS or CI, also record iOS simulator compilation because KMP modularization can change native compilation behavior differently from Android.

Second, add a small amount of build infrastructure. Create reusable Gradle convention logic or carefully duplicated starter build files for KMP library modules. Each library module needs Kotlin Multiplatform, Android library, and the correct target setup. Compose UI modules additionally need Compose Multiplatform and the Compose compiler plugin. The database module needs Room and KSP. Avoid applying Compose, Room, KSP, Koin, CocoaPods, or Google Services to modules that do not need them.

Third, extract non-UI core modules. Start with `:core:foundation` and `:core:model`, because every other module will depend on them. Before moving models, remove presentation dependencies from model and DTO code. Replace `Event.seedColor` defaults that currently use `core.presentation.Primary.toArgb()` with a non-UI integer constant in `:core:foundation` or `:core:model`. Move `toNameCase` or a non-UI equivalent into `:core:foundation` so DTOs and repositories no longer import `core.presentation.util`.

Fourth, extract `:core:network`, `:core:database`, `:core:repository-api`, and `:core:repository-impl`. Move `IMatchRepository` out of `eventDetail.data` into `:core:repository-api`, because event search, match detail, organization detail, event create, and event detail all use it. Move chat repository interfaces out of `chat.data` for the same reason. Keep repository implementation changes behavior-preserving and do not change endpoint paths or payloads without checking `mvp-site`, which is the backend source of truth named in `AGENTS.md`.

Fifth, move app shell and DI out of `core`. `RootComponent`, `App`, bottom-level root routing, global startup flows, and Koin module aggregation belong in the app shell because they depend on all features. Each feature module should expose its own component factory/Koin module or simple factory function. `:composeApp` imports those feature registrations and wires them together. This removes the current `core -> feature` cycle.

Sixth, extract shared UI and capability modules. Move generic UI tokens and controls to `:core:designsystem` or `:core:common-ui`. Remove feature references from shared UI; for example, `SearchBox` currently imports `eventSearch.util.EventFilter`, so either make it generic or keep it in event search. Move map, event editor/rules, and rentals into their shared modules so feature modules do not depend on each other.

Seventh, extract feature modules in risk/value order. Start with `:feature:event-detail` because it is the largest compile unit. Then extract `:feature:event-search` and `:feature:chat`, because they are moderately sized and have clear boundaries once map/rentals/repository APIs are extracted. Continue with profile, teams, auth, organization detail, match detail, and the smaller features.

Finally, compare Gradle profiles. The desired result is that a UI-only edit in `:feature:event-detail` runs compile tasks for the changed feature and app shell, while unrelated features and repository implementation modules remain up-to-date. Clean builds may not become dramatically faster at first because there are more projects to configure, but incremental builds should improve.

## Concrete Steps

Run all commands from `C:\Users\samue\StudioProjects\mvp-app` in PowerShell unless stated otherwise.

Record baseline Android timings:

    .\gradlew --stop
    Remove-Item -Recurse -Force .\composeApp\build, .\.gradle-local -ErrorAction SilentlyContinue
    .\gradlew :composeApp:assembleDebug --profile
    .\gradlew :composeApp:compileDebugKotlinAndroid --profile

Record an incremental hot-path timing. Make a trivial whitespace-only or comment-only edit in one large feature file, then run:

    .\gradlew :composeApp:compileDebugKotlinAndroid --profile

Revert only the deliberate timing edit, not unrelated user changes.

On macOS or CI with iOS tooling, record:

    ./gradlew :composeApp:compileKotlinIosSimulatorArm64 --profile
    ./gradlew :composeApp:allTests --profile

Add module declarations to `settings.gradle.kts` in phases. The initial include set should be:

    include(":core:foundation")
    include(":core:model")
    include(":core:network")
    include(":core:database")
    include(":core:repository-api")
    include(":core:repository-impl")
    include(":core:designsystem")
    include(":core:common-ui")
    include(":shared:map")
    include(":shared:event-rules")
    include(":shared:event-editor")
    include(":shared:rentals")

Create each module directory with `build.gradle.kts` and standard KMP source-set folders. Use the existing plugin versions from `gradle/libs.versions.toml`. Preserve Android namespace uniqueness, for example `com.razumly.mvp.core.model` for `:core:model`.

Move code incrementally. After each module extraction, run:

    .\gradlew :composeApp:compileDebugKotlinAndroid
    .\gradlew :composeApp:testDebugUnitTest

When moving Room database code, run:

    .\gradlew :core:database:roomGenerateSchema
    .\gradlew :composeApp:testDebugUnitTest

When moving a feature module, run its tests if available and the app compile:

    .\gradlew :feature:event-detail:testDebugUnitTest
    .\gradlew :composeApp:compileDebugKotlinAndroid

If a feature module does not yet have its own test task because tests have not moved, keep tests in `composeApp` temporarily and record that in this plan. Move tests with their production code before marking the feature extraction complete.

## Validation and Acceptance

Acceptance requires both correctness and compile-time evidence.

Correctness acceptance:

- `.\gradlew :composeApp:testDebugUnitTest` passes after every completed milestone.
- `.\gradlew :composeApp:testReleaseUnitTest` passes before final completion.
- `.\gradlew :composeApp:assembleDebug` passes before final completion.
- `.\gradlew :composeApp:allTests` passes on macOS or CI with iOS simulator tooling. If run from Windows and it fails because `xcrun` is unavailable, record the failure and rerun in a supported environment.
- Room schema generation remains owned by the database module, and `composeApp/schemas/` or the chosen schema output path is reviewed if any Room entity or database definition changes.
- The app launches on Android, login still reaches the discover/search experience, event details open, event creation opens, chat opens, and profile opens.
- No endpoint path, request payload, response payload, or shared backend contract is invented in this repo. Any API contract change must be aligned with `C:\Users\samue\Documents\Code\mvp-site\`.

Compile-time acceptance:

- The final Gradle profile summary is recorded in this plan and compared against the baseline.
- After a UI-only edit in event detail, unrelated feature modules such as chat/profile/teams and data implementation modules remain up-to-date.
- After a repository implementation-only edit, feature UI modules remain up-to-date unless a public repository interface or model changed.
- Room/KSP tasks do not run for unrelated Compose UI-only edits.
- Compose compiler is not applied to non-UI modules such as `:core:model`, `:core:network`, `:core:database`, and `:core:repository-api`.

## Idempotence and Recovery

This refactor should be additive-first. Create empty modules, wire dependencies, and move one boundary at a time. Do not combine package renames, behavioral refactors, and module extraction in the same milestone unless the compile boundary requires it.

If a move causes many import failures, prefer adding temporary type aliases or forwarding files in the old package while consumers migrate. Remove the forwarding layer only after all consumers compile and tests pass. This reduces the risk of a half-moved state.

Do not use destructive git commands such as `git reset --hard` or `git checkout --` to recover. Inspect `git diff`, repair the specific files, and preserve unrelated user changes.

If a module extraction unexpectedly increases clean build time, do not immediately revert it. Compare incremental build behavior and task invalidation first. A slightly slower clean build can still be acceptable if common local edit loops become faster.

## Artifacts and Notes

Initial source-size evidence from this checkout:

    Package            Files Lines
    eventDetail           53 26129
    core                 168 18655
    profile                7  5549
    icons                 27  4248
    eventSearch           21  4106
    eventCreate            4  2737
    matchDetail            2  2711
    chat                  13  2601

Initial `core` breakdown:

    CoreArea       Files Lines
    data              84 10792
    presentation      53  5270
    network           21  2233
    util               8   291
    db                 2    69

Initial top cross-package imports showed nearly every feature depending on `core`, and the following important feature-to-feature imports:

    eventCreate -> eventDetail
    eventSearch -> eventMap
    eventSearch -> eventDetail.data.IMatchRepository
    organizationDetail -> eventSearch
    organizationDetail -> eventDetail.data.IMatchRepository
    matchDetail -> eventDetail
    matchDetail -> eventMap
    profile -> eventDetail

These imports are the reason shared modules must be extracted before feature modules are split.

## Interfaces and Dependencies

The dependency graph should point in this direction:

    :composeApp
        depends on feature modules, shared capability modules, core UI modules, repository impl, database, network, and platform setup

    :feature:*
        depends on shared capability modules, :core:common-ui, :core:designsystem, :core:repository-api, and :core:model

    :shared:*
        depends on :core:model, :core:repository-api when needed, and UI modules when the shared module contains Compose UI

    :core:repository-impl
        depends on :core:repository-api, :core:network, :core:database, and :core:model

    :core:database
        depends on :core:model and Room/SQLite dependencies

    :core:network
        depends on :core:model or contract DTO modules, Ktor, serialization, and platform auth/base-url actuals

    :core:model
        depends on serialization, datetime, and possibly Room annotations, but not Compose or feature modules

    :core:foundation
        depends on Kotlin/common libraries only, with minimal platform expect/actuals when unavoidable

Use `api(project(...))` only for modules whose types are exposed in the public API of the current module. Use `implementation(project(...))` for everything else. This matters for compile time because unnecessary `api` dependencies leak ABI changes downstream and cause avoidable recompilation.

Repository guidance:

Repository code should be split by API and implementation, not by putting every repository class directly into the feature that happens to use it first. For this app, repositories are cross-feature data access services. Event search, event detail, event creation, organization detail, match detail, teams, and profile all share event/team/user/match/billing concepts. Put interfaces and request/result types in `:core:repository-api`; put implementations in `:core:repository-impl` initially. Split implementation by domain only after profiling shows it is still a compile hot spot.

Feature guidance:

Feature modules should own screens, Decompose components, presenters/state holders, and feature-specific UI tests. They should not own shared repository interfaces, backend DTOs, Room DAOs, app startup, root navigation, or global Koin assembly. If another feature imports a type from a feature module, first ask whether that type is really shared domain logic, shared UI, or a repository contract. Move it to the appropriate shared/core module before extracting the feature.

