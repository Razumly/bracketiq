# Kotlin Multiplatform Compile-Time Modularization

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. Keep this file self-contained: a contributor should be able to restart the module split using only the current checkout and this plan.

## Purpose / Big Picture

The app currently compiles most product code through one large Kotlin Multiplatform Gradle module, `:composeApp`. A Gradle module is a separately compiled project declared in `settings.gradle.kts`; it is different from a Kotlin package, which is only the namespace at the top of a `.kt` file. Moving code between packages will not substantially reduce development compile time if Gradle still compiles everything as `:composeApp`.

This plan splits the app into stable core modules, shared capability modules, and feature modules so that a developer changing a screen such as event details, chat, profile, or event search does not recompile unrelated app areas. The observable outcome is faster incremental development builds with unchanged app behavior. The proof is Gradle profile output showing fewer invalidated compile, Compose compiler, Room/KSP, and downstream module tasks after small feature edits.

## Progress

- [x] (2026-06-28 18:52Z) Re-read `PLANS.md` and refreshed this ExecPlan to match the current repository state.
- [x] (2026-06-28 18:52Z) Confirmed `settings.gradle.kts` currently includes only `:composeApp` and `:wearApp`.
- [x] (2026-06-28 18:52Z) Counted current `commonMain` source sizes by top-level package and identified `eventDetail`, `core`, `profile`, `eventSearch`, and `icons` as the largest current compile areas.
- [x] (2026-06-28 18:52Z) Audited current import direction and found that `core/presentation` imports every feature through the root app shell, while several features import helpers from `eventDetail`, `eventSearch`, and `eventMap`.
- [x] (2026-06-28 19:13Z) Recorded baseline clean and incremental Gradle timings before moving source. Captured profile report paths and dominant tasks.
- [x] (2026-06-28 21:52Z) Added carefully duplicated starter KMP library build files for the initial core modules.
- [x] (2026-06-28 21:52Z) Moved the root app shell out of `core/presentation` into `composeApp` app-shell package so lower-level core modules no longer depend on feature modules.
- [x] (2026-06-28 21:52Z) Extracted `:core:model`, keeping pure data contracts, DTO-facing helpers, shared JSON utilities, ID generation, timezone helpers, and platform metadata below app/UI.
- [x] (2026-06-28 21:52Z) Extracted `:core:database`, making it the only module that applies Room and KSP for app data.
- [x] (2026-06-28 21:52Z) Extracted `:core:network`, `:core:repository-api`, and `:core:repository-impl`.
- [x] (2026-06-28 21:52Z) Extracted `:core:ui` for theme, shared icons, and generic shared Compose controls with no feature imports.
- [ ] Extract `:feature:event-map`, including its Android and iOS actual implementations.
- [ ] Extract `:feature:event-shared` before moving event create, event detail, match detail, profile schedule, organization detail, or event search into feature modules.
- [ ] Extract high-value feature modules in order: `event-detail`, `event-search`, `profile`, `match-detail`, `chat`, `event-create`, `team-management`, `organization-detail`, `auth`, then smaller features.
- [ ] After every update, run the smallest relevant compile/test task and keep tests passing before proceeding.
- [ ] Compare final Gradle profiles against the baseline and record the result in `Outcomes & Retrospective`.

## Surprises & Discoveries

- Observation: The project is still effectively unmodularized for shared app code.
  Evidence: `settings.gradle.kts` currently contains only `include(":composeApp")` and `include(":wearApp")`.

- Observation: `:composeApp` applies many expensive or broad plugins at once.
  Evidence: `composeApp/build.gradle.kts` applies Kotlin Multiplatform, CocoaPods, Android application, Compose Multiplatform, Compose compiler, Kotlin serialization, KSP, Room, Compose vectorize, secrets, Google Services, and SKIE in one module.

- Observation: Room and KSP currently live in the same module as feature UI.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/db/MVPDatabaseService.kt` declares all Room entities and DAOs, and `composeApp/build.gradle.kts` wires `kspAndroid`, `kspIosArm64`, and `kspIosSimulatorArm64`.

- Observation: `core` cannot be moved as one clean lower-level module yet because the app shell lives inside `core/presentation`.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/App.kt` imports screens from chat, event create, event detail, event management, event search, match detail, organization detail, profile, profile completion, refund manager, team management, and auth. `RootComponent.kt` similarly imports feature components and repositories.

- Observation: `eventDetail` is not just one feature. It currently owns shared event editing, schedule, signature, match rule, and repository code used by other features.
  Evidence: import auditing showed `eventCreate`, `matchDetail`, `organizationDetail`, `eventSearch`, and `profile` importing types from `eventDetail`.

- Observation: Rental scheduling is currently owned by `eventSearch` even though organization detail uses it.
  Evidence: `organizationDetail` imports rental availability, rental selection, rental details, and rental range helpers from `eventSearch`.

- Observation: Map code is already shared behavior and has platform actuals.
  Evidence: event detail, event search, event create, match detail, and root navigation import `eventMap.EventMap` or `eventMap.MapComponent`; Android and iOS implementations live under `composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap` and `composeApp/src/iosMain/kotlin/com/razumly/mvp/eventMap`.

- Observation: A no-change focused Android compile still executes Android KSP work.
  Evidence: `./gradlew :composeApp:compileDebugKotlinAndroid --profile -Pmvp.startBackend=false` completed successfully in 11.397s, with `:composeApp:kspDebugKotlinAndroid` taking 9.123s while `:composeApp:compileDebugKotlinAndroid` was up-to-date.

- Observation: A one-line event-detail UI comment edit invalidates the full `:composeApp` Android Kotlin compile and still runs KSP first.
  Evidence: the temporary edit profile completed successfully in 1m20.27s, with `:composeApp:compileDebugKotlinAndroid` taking 1m10.24s and `:composeApp:kspDebugKotlinAndroid` taking 8.060s.

- Observation: The baseline Gradle build emits configuration-time dependency resolution warnings.
  Evidence: each profiled command reported configurations such as `debugCompileClasspath`, `debugRuntimeClasspath`, `kotlinCompilerPluginClasspathAndroidDebug`, and `kspDebugKotlinAndroidProcessorClasspath` being resolved during configuration time.

- Observation: After extracting `:core:database`, app feature UI changes no longer require `:composeApp:kspDebugKotlinAndroid` because that task no longer exists in the app module task graph.
  Evidence: `./gradlew :composeApp:compileDebugKotlinAndroid -Pmvp.startBackend=false` showed `:core:database:kspDebugKotlinAndroid` and no `:composeApp:kspDebugKotlinAndroid`.

- Observation: Kotlin smart casts against public properties become invalid when DTO/model/repository classes cross module boundaries.
  Evidence: moving model, network, and repository files required local variable fixes in event detail, league schedule fields, refund manager, user repository, and Android payment processor.

- Observation: Some current "core UI" components are not actually core UI yet because they depend on network URL construction or feature/search types.
  Evidence: `NetworkAvatar` depends on `apiBaseUrl` and `getImageUrl`, `SearchBox` imports `eventSearch.util.EventFilter`, `PlayerInteractionComponent` imports `IChatGroupRepository`, and native date picker wiring imports app-level native view factory. These were left in `composeApp`.

## Decision Log

- Decision: Treat this work as Gradle/KMP modularization, not package cleanup.
  Rationale: Compile isolation comes from Gradle project boundaries and stable public APIs. Kotlin package moves alone do not stop unrelated source sets from recompiling.
  Date/Author: 2026-06-28 / Codex

- Decision: Keep `:composeApp` as the Android application and CocoaPods/iOS framework producer during the first phase.
  Rationale: Moving CocoaPods, SKIE, app versioning, Android application configuration, Google Services, and platform entry points at the same time would add risk without being required for the initial compile-time win.
  Date/Author: 2026-06-28 / Codex

- Decision: Split lower-level core modules before feature modules.
  Rationale: Features all depend on models, repositories, networking, database access, and shared UI. Extracting feature modules first would either duplicate those dependencies or preserve bad feature-to-feature imports.
  Date/Author: 2026-06-28 / Codex

- Decision: Move root navigation and app-level DI into the app shell, not a `core` module.
  Rationale: Root navigation and app assembly necessarily depend on every feature. If they remain in `core`, `core` depends on features and features depend on `core`, creating cycles that Gradle modules cannot represent cleanly.
  Date/Author: 2026-06-28 / Codex

- Decision: Isolate Room/KSP into `:core:database`.
  Rationale: Room annotation processing is expensive and should not run when the developer changes unrelated Compose UI. The database module should own `MVPDatabaseService`, DAOs, Room constructor code, migrations, and schema generation.
  Date/Author: 2026-06-28 / Codex

- Decision: Create `:feature:event-shared` before extracting event feature modules.
  Rationale: Current event helpers are imported across event create, event detail, match detail, organization detail, profile, and event search. A shared event module avoids making those features depend on `:feature:event-detail`.
  Date/Author: 2026-06-28 / Codex

- Decision: Use `api(project(...))` only when a dependency's public types appear in the current module's public API; otherwise use `implementation(project(...))`.
  Rationale: `api` leaks ABI changes downstream and causes avoidable recompilation. Keeping dependency exposure narrow is part of the compile-time goal.
  Date/Author: 2026-06-28 / Codex

- Decision: Keep repository interfaces and implementations mostly together in `:core:repository-impl` for the first extraction, with only the base `IMVPRepository` in `:core:repository-api`.
  Rationale: Existing repository files mix public interfaces, public result models, helper functions, and concrete implementations. Splitting every interface into separate files during this milestone would greatly expand behavioral risk. The compile boundary still removes repository implementation source from `:composeApp`; finer API separation can follow once feature extraction starts.
  Date/Author: 2026-06-28 / Codex

- Decision: Move platform metadata (`Platform`) to `:core:model` and initialize Android app version/build values from `MvpApp`.
  Rationale: Repositories and UI both consume platform metadata. Keeping it in `composeApp` would create reverse dependencies; putting it in repository implementation would make UI depend on repositories. The app still owns the actual Android version values through explicit startup configuration.
  Date/Author: 2026-06-28 / Codex

- Decision: Keep network-aware avatar/card UI in `composeApp` rather than forcing it into `:core:ui`.
  Rationale: `NetworkAvatar` constructs API-backed image URLs and `UnifiedCard` depends on it. `:core:ui` should stay limited to theme, icons, and generic controls until image URL construction is abstracted behind a cleaner model or UI contract.
  Date/Author: 2026-06-28 / Codex

## Outcomes & Retrospective

This refreshed plan updates the previous modularization plan with current source sizes, current coupling, and a concrete split order. The first milestone recorded baseline Gradle timing evidence without moving source files. The evidence confirms the main hypothesis: a small event-detail UI edit originally recompiled the large `:composeApp` Kotlin Android source set, and KSP ran even for a no-change compile.

As of the core-module milestone, the app has separate `:core:model`, `:core:database`, `:core:network`, `:core:repository-api`, `:core:repository-impl`, and `:core:ui` modules. The root app shell now lives under `composeApp/src/commonMain/kotlin/com/razumly/mvp/app`. Room and KSP run in `:core:database`; network client/DTO code compiles in `:core:network`; repository implementation code compiles in `:core:repository-impl`; and theme/icons/generic controls compile in `:core:ui`. Verification passed with `./gradlew :composeApp:compileDebugKotlinAndroid -Pmvp.startBackend=false` after the `:core:ui` extraction, and `git diff --check` passed.

The next milestone should start feature/shared capability extraction, beginning with `:feature:event-map` and then `:feature:event-shared`. Before that, consider a smaller repository contract cleanup pass if feature modules need to depend on `:core:repository-api` without seeing concrete implementations.

## Context and Orientation

The repository root for this plan is `/Users/elesesy/StudioProjects/mvp-app`. The governing repository instructions are in `AGENTS.md`; they require backend endpoint and data contract alignment with `mvp-site`, located on macOS at `/Users/elesesy/StudioProjects/mvp-site/`. Do not invent mobile API paths, payloads, or shared data models while moving code. If a repository or DTO move exposes a contract question, inspect `mvp-site` first.

The current shared app code is under `composeApp/src/commonMain/kotlin/com/razumly/mvp`. Android-specific source is under `composeApp/src/androidMain/kotlin/com/razumly/mvp`. iOS-specific source is under `composeApp/src/iosMain/kotlin/com/razumly/mvp`. Unit tests live mostly under `composeApp/src/commonTest/kotlin` and `composeApp/src/androidUnitTest/kotlin`.

Current Gradle shape:

    settings.gradle.kts
      include(":composeApp")
      include(":wearApp")

`composeApp/build.gradle.kts` is both a Kotlin Multiplatform app module and an Android application module. It configures Android, iOS, CocoaPods, SKIE, Compose resources, KSP, Room, app versioning, local backend startup, iOS simulator test booting, and Compose resource sanitization. The target state keeps app packaging and platform entry points here but moves reusable code into library modules.

Current `commonMain` source-size evidence from this checkout:

    Package              Files   Lines
    eventDetail            113   45538
    core                   197   30191
    profile                  7    8034
    eventSearch             22    5770
    icons                   31    4945
    matchDetail              3    4816
    teamManagement           3    3030
    chat                    13    2739
    eventCreate              4    2485
    organizationDetail       2    2433
    eventMap                 6     834
    userAuth                 2     776
    refundManager            2     380
    di                       7     372
    profileCompletion        2     325
    eventManagement          2     165

Current rough module-sized areas inside `core`:

    Area                         Files   Lines
    core/data/repositories          14   10391
    core/data/dataTypes             75    5796
    core/presentation/composables   38    5382
    core/network                    19    3310
    core/presentation app shell     14    2092
    core/data other                  8    1412
    core/presentation util/guides   13    1326
    core/util                        9     377
    core/db                          2      96
    core/auth                        2      26

Important current coupling:

    chat -> core
    eventCreate -> core, eventDetail, eventMap
    eventDetail -> core, eventMap, icons
    eventManagement -> core, eventSearch
    eventSearch -> core, eventMap, icons, eventDetail
    matchDetail -> core, eventDetail, eventMap, icons
    organizationDetail -> core, eventSearch, eventDetail, icons
    profile -> core, icons, eventDetail
    teamManagement -> core
    userAuth -> core
    core/presentation -> every feature through App and RootComponent
    di -> every feature through ComponentModule

The split must make dependencies point one way: lower-level core modules must not import features, and feature modules must not import other feature modules unless that relationship is intentionally shared and acyclic.

## Target Module Shape

Keep these existing modules:

    :composeApp
    :wearApp

Add these core modules first:

    :core:model
    :core:database
    :core:network
    :core:repository-api
    :core:repository-impl
    :core:ui
    :core:platform

`core:model` owns domain models, Room entity classes if the project continues using the same classes for persistence, enums, relation models, serializable DTO-facing value types, and pure helpers. It may depend on Kotlin serialization and datetime. It must not depend on Compose UI, Decompose, Koin, Ktor clients, repositories, or feature modules.

`core:database` owns `MVPDatabaseService`, DAOs, Room converters, Room constructor code, migrations, and schema generation. It depends on `core:model`. It is the only planned module that applies the Room Gradle plugin and KSP for mobile app data.

`core:network` owns `MvpApiClient`, API error handling, base URL resolution, auth token storage abstractions and platform actuals, upload file abstractions, Ktor client creation, and network DTO mappers that are not pure model types. It depends on `core:model`.

`core:repository-api` owns repository interfaces and stable request/result classes used by features. This includes event, user, team, billing, field, sports, image, push notification, app update, chat group, message, and match repository contracts. `IMatchRepository` must move here from `eventDetail.data`, and chat repository interfaces must move here from `chat.data`.

`core:repository-impl` owns concrete repository classes. It depends on `core:repository-api`, `core:network`, `core:database`, and `core:model`. Keep it as one implementation module initially; split it by domain only after Gradle profiles show it remains a hot incremental compile target.

`core:ui` owns theme tokens, app design primitives, shared icons/resources, and generic shared Compose controls. It may use Compose Multiplatform and Compose resources. It must not import feature packages. If a shared composable currently imports a feature type, either make it generic or leave it in the feature until a cleaner shared contract exists.

`core:platform` owns small platform wrappers that are not specific to a feature or data layer, such as URL handling, screen metrics, share services, platform loading/date/text/dropdown/web controls, and payment processor platform bridges if they remain broadly used. If a wrapper is purely UI, it can live in `core:ui` instead; decide by dependency direction.

Add these shared capability modules before feature modules:

    :feature:event-map
    :feature:event-shared

`feature:event-map` owns `EventMap`, `MapComponent`, map constants, and Android/iOS actual implementations. It is named as a feature module because it contains real map UI and platform behavior, but several features depend on it.

`feature:event-shared` owns event-specific shared logic and UI that is not the event detail screen: event form models, event edit validation, staff invite helpers, signature prompt state/dialogs, match rule resolution, schedule display primitives, rental scheduling primitives if they remain event-specific, and shared event image helpers. It exists to prevent `event-create`, `match-detail`, `profile`, `organization-detail`, and `event-search` from depending on `event-detail`.

Add these feature modules after core and shared capability modules are stable:

    :feature:event-detail
    :feature:event-search
    :feature:profile
    :feature:match-detail
    :feature:chat
    :feature:event-create
    :feature:team-management
    :feature:organization-detail
    :feature:auth
    :feature:refund-manager
    :feature:profile-completion
    :feature:event-management

`composeApp` becomes the app shell. It owns platform entry points, app versioning, CocoaPods/SKIE configuration, Android application configuration, global startup and root navigation, app-level DI assembly, and dependency on every feature module. Feature modules must not depend on `composeApp`.

The final dependency direction should be:

    composeApp
      -> feature modules
      -> core:repository-impl
      -> core:ui
      -> core:platform

    feature modules
      -> feature:event-shared when event-specific shared behavior is needed
      -> feature:event-map when map UI or map state is needed
      -> core:ui
      -> core:repository-api
      -> core:model

    core:repository-impl
      -> core:repository-api
      -> core:network
      -> core:database
      -> core:model

    core:database
      -> core:model

    core:network
      -> core:model

    core:ui
      -> core:model only when shared UI renders domain models

## Plan of Work

Start with measurement. From `/Users/elesesy/StudioProjects/mvp-app`, record a clean debug build profile and an incremental compile profile before changing modules. Use `-Pmvp.startBackend=false` for build measurements so local backend startup does not distort compile timing. Save the generated Gradle profile paths in `Artifacts and Notes`.

Then create the module scaffolding without moving many source files. Add includes to `settings.gradle.kts` for the first core modules. Create each module directory with a minimal `build.gradle.kts`, `src/commonMain/kotlin`, `src/commonTest/kotlin`, `src/androidMain/kotlin`, and `src/iosMain/kotlin` as appropriate. Use unique Android namespaces such as `com.razumly.mvp.core.model`. Apply only the plugins each module needs.

Next, move the app shell out of lower-level `core`. Create an app-shell package under `composeApp/src/commonMain/kotlin/com/razumly/mvp/app` and move root app composition and global navigation there. The key files are `core/presentation/App.kt`, `core/presentation/RootComponent.kt`, `core/presentation/AppConfig.kt`, route types, root navigation support, and `di/ComponentModule.kt`. Do not change behavior. The purpose is to make future `core` modules free of feature imports.

Extract `core:model`. Move model/data classes and pure helpers from `core/data/dataTypes` and related pure files. If a model imports Compose presentation colors or UI formatting, replace the dependency with a pure constant or helper in `core:model` or `core:platform`. Do not alter serialized field names, Room annotations, or API contract semantics.

Extract `core:database`. Move `core/db`, DAOs, Room converters, database constructor, and platform database actuals. Update Room schema configuration so schema generation still writes to a reviewed tracked schema location. After this milestone, a UI-only feature edit must not trigger Room/KSP tasks unless a database public API changed.

Extract `core:network`, `core:repository-api`, and `core:repository-impl`. Move repository interfaces before implementations. `IMatchRepository` and chat repository interfaces move into `core:repository-api` so all feature modules can compile against stable contracts. Repository implementations move into `core:repository-impl`. Keep local data flow intact: remote refresh methods write API results to Room first, and screens continue observing Room-backed flows.

Extract `core:ui`. Move generic controls, theme, icons, and resources. Any reusable UI component with feature imports must be made generic or delayed. Do not place app root routing or feature screen selection in `core:ui`.

Extract `feature:event-map`. Move common, Android, and iOS map code together. Ensure Android-specific Google Maps and iOS-specific map implementation dependencies are declared only where needed.

Extract `feature:event-shared`. Move shared event helpers out of `eventDetail`, `eventSearch`, and related packages before extracting final feature modules. This is where current cross-feature imports should be resolved. Prefer pure helpers and stable UI contracts rather than broad feature dependencies.

Extract high-value feature modules one at a time. For each feature, move production code and its focused tests together when possible. After every module move, run the smallest relevant compile/test command and keep it passing before continuing. Do not batch multiple feature extractions behind one validation step.

At the end, compare profiles. Make a small UI-only edit in `feature:event-detail` and verify unrelated feature modules, repository implementations, and Room/KSP tasks remain up-to-date. Revert the deliberate timing edit afterward.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-app` on macOS unless stated otherwise.

Baseline clean Android build:

    ./gradlew --stop
    rm -rf composeApp/build .gradle/buildOutputCleanup
    ./gradlew :composeApp:assembleDebug --profile -Pmvp.startBackend=false

Baseline focused Android compile:

    ./gradlew :composeApp:compileDebugKotlinAndroid --profile -Pmvp.startBackend=false

Baseline incremental feature edit:

Make a deliberate temporary comment-only edit in a large event detail UI file such as `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`. Then run:

    ./gradlew :composeApp:compileDebugKotlinAndroid --profile -Pmvp.startBackend=false

Record the profile path and restore only the deliberate timing edit. Do not revert unrelated user changes.

Optional iOS baseline on macOS:

    ./gradlew :composeApp:compileKotlinIosSimulatorArm64 --profile -Pmvp.startBackend=false

After adding empty modules, run:

    ./gradlew projects
    ./gradlew :composeApp:compileDebugKotlinAndroid -Pmvp.startBackend=false

After each source move, run at least:

    ./gradlew :composeApp:compileDebugKotlinAndroid -Pmvp.startBackend=false

If the move touches common logic or tests exist for that area, also run:

    ./gradlew :composeApp:testDebugUnitTest -Pmvp.startBackend=false

After moving Room or database code, run:

    ./gradlew :core:database:roomGenerateSchema
    ./gradlew :composeApp:testDebugUnitTest -Pmvp.startBackend=false

Before marking the full plan complete, run:

    ./gradlew :composeApp:assembleDebug -Pmvp.startBackend=false
    ./gradlew :composeApp:testDebugUnitTest -Pmvp.startBackend=false
    ./gradlew :composeApp:testReleaseUnitTest -Pmvp.startBackend=false

If iOS simulator tooling is available and JDK 17 is active:

    ./gradlew :composeApp:allTests -Pmvp.startBackend=false

If `allTests` fails because the iOS simulator or `xcrun` is unavailable, record the exact failure in `Surprises & Discoveries` and run the iOS validation in a supported macOS environment.

## Validation and Acceptance

Functional acceptance requires unchanged app behavior:

- Android debug compilation succeeds after each milestone.
- The focused test task for any moved code passes after that move.
- `:composeApp:testDebugUnitTest`, `:composeApp:testReleaseUnitTest`, and `:composeApp:assembleDebug` pass before the full plan is complete.
- On a supported macOS/iOS environment, `:composeApp:allTests` passes or any environmental simulator failure is recorded with a follow-up.
- The app still launches on Android, reaches auth or search according to session state, opens event search, opens event detail, opens event creation, opens profile, opens chat, and opens match detail.
- Room schema generation remains reviewable and database version rules from `AGENTS.md` are still followed.
- Backend endpoints, request payloads, response payloads, and shared data models remain aligned with `mvp-site`.

Compile-time acceptance requires profile evidence:

- The baseline profile and final profile paths are recorded in this plan.
- After a UI-only event detail edit, Gradle does not recompile unrelated feature modules such as chat, profile, team management, or organization detail.
- After a UI-only event detail edit, Room/KSP tasks are up-to-date unless a Room entity, DAO, database, or schema-facing type changed.
- After a repository implementation-only edit, feature UI modules remain up-to-date unless a public repository API or public model changed.
- Non-UI modules such as `core:model`, `core:network`, `core:database`, and `core:repository-api` do not apply the Compose compiler.
- Only `core:database` applies Room/KSP for the mobile app database.

## Idempotence and Recovery

This refactor must be additive-first and recoverable. Create empty modules and wire dependencies before moving large code areas. Move one boundary at a time, compile, test, and update this plan before continuing.

Avoid destructive recovery commands. Do not run `git reset --hard` or `git checkout --` unless the user explicitly asks for that operation. The worktree may contain unrelated user changes; preserve them. If a deliberate timing edit was made for profile measurement, revert only that edit.

If imports break after a move, prefer adding temporary forwarding declarations or moving the smallest missing contract into the intended core/shared module. Remove forwarding declarations once all consumers compile. Do not leave feature modules depending on each other just to make a move compile quickly.

If clean build time increases, compare incremental edit behavior before reversing course. More modules can add clean build overhead while still improving the daily development loop.

If a source move reveals an API contract ambiguity, inspect `/Users/elesesy/StudioProjects/mvp-site/` before changing mobile DTOs or endpoint usage.

## Artifacts and Notes

Current module declarations:

    rootProject.name = "MVP"
    include(":composeApp")
    include(":wearApp")

Current largest files by line count include:

    4038 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt
    3297 composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt
    3157 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/DefaultEventDetailComponent.kt
    3072 composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileFeatureScreens.kt
    2974 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt
    2848 composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileComponent.kt
    2669 composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt

Current top-level import evidence:

    core -> chat, profile, icons, eventDetail, eventSearch, userAuth, eventCreate, eventManagement, matchDetail, organizationDetail, profileCompletion, refundManager, teamManagement, eventMap
    eventCreate -> core, eventDetail, eventMap
    eventDetail -> core, icons, eventMap
    eventSearch -> core, eventMap, icons, eventDetail
    matchDetail -> core, eventDetail, eventMap, icons
    organizationDetail -> core, eventSearch, eventDetail, icons
    profile -> core, icons, eventDetail

Recorded baseline profile artifacts:

    Baseline clean assembleDebug profile: build/reports/profile/profile-2026-06-28-12-08-51.html
    Command: ./gradlew :composeApp:assembleDebug --profile -Pmvp.startBackend=false
    Result: BUILD SUCCESSFUL in 2m36s; 51 actionable tasks: 50 executed, 1 up-to-date.
    Profile total build time: 2m36.17s.
    Dominant tasks: :composeApp:compileDebugKotlinAndroid 1m16.36s; :composeApp:dexBuilderDebug 30.902s; :composeApp:kspDebugKotlinAndroid 25.465s; :composeApp:mergeExtDexDebug 19.163s.

    Baseline no-change compileDebugKotlinAndroid profile: build/reports/profile/profile-2026-06-28-12-11-34.html
    Command: ./gradlew :composeApp:compileDebugKotlinAndroid --profile -Pmvp.startBackend=false
    Result: BUILD SUCCESSFUL in 11s; 29 actionable tasks: 4 executed, 25 up-to-date.
    Profile total build time: 11.397s.
    Dominant tasks: :composeApp:kspDebugKotlinAndroid 9.123s; :composeApp:kmpPartiallyResolvedDependenciesChecker 0.246s; :composeApp:compileDebugKotlinAndroid 0.049s UP-TO-DATE.

    Baseline incremental event-detail edit profile: build/reports/profile/profile-2026-06-28-12-12-05.html
    Command: ./gradlew :composeApp:compileDebugKotlinAndroid --profile -Pmvp.startBackend=false after a temporary comment-only edit in composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt
    Result: BUILD SUCCESSFUL in 1m20s; 29 actionable tasks: 5 executed, 24 up-to-date.
    Profile total build time: 1m20.27s.
    Dominant tasks: :composeApp:compileDebugKotlinAndroid 1m10.24s; :composeApp:kspDebugKotlinAndroid 8.060s; :composeApp:kmpPartiallyResolvedDependenciesChecker 0.202s.

    Final incremental event-detail edit profile: not yet recorded.

## Interfaces and Dependencies

The following module interfaces must exist by the time their milestones are complete.

In `:core:repository-api`, define or move repository contracts used by features:

    package com.razumly.mvp.core.repository

    interface IEventRepository
    interface IUserRepository
    interface ITeamRepository
    interface IBillingRepository
    interface IFieldRepository
    interface ISportsRepository
    interface IImagesRepository
    interface IPushNotificationsRepository
    interface IAppUpdateRepository
    interface IMatchRepository
    interface IMessageRepository
    interface IChatGroupRepository

The exact method signatures must be copied from the current interfaces without behavior changes. If package names must change, migrate imports in a single milestone and keep tests passing.

In `:core:database`, expose the app database and database service contracts currently represented by:

    com.razumly.mvp.core.db.MVPDatabaseService
    com.razumly.mvp.core.db.MVPDatabaseCtor
    com.razumly.mvp.core.data.DatabaseService
    com.razumly.mvp.core.data.dataTypes.daos.*

In `:composeApp`, app-level DI assembly must continue to provide:

    RootComponent
    feature components
    repository implementations
    database module
    network module
    platform modules

Feature modules should expose either a small Koin module or constructor/factory function for their component. The app shell composes these; lower-level core modules do not.

Use these dependency rules:

- Use `implementation(projects.core.model)` when a module only uses model types internally.
- Use `api(projects.core.model)` when model types appear in public function signatures or public properties.
- Use `implementation` for repository implementations and network/database internals.
- Do not expose `core:repository-impl` to feature modules. Features compile against `core:repository-api`.
- Do not expose Room types to feature modules unless a DAO/database type is intentionally part of a test-only seam.

## Revision Notes

- 2026-06-28 / Codex: Replaced the stale April modularization plan with current June source-size evidence, current coupling observations, macOS-oriented commands, and a stricter implementation order focused on app shell, core layers, Room/KSP isolation, event shared code, and feature modules.
- 2026-06-28 / Codex: Completed the first milestone by recording baseline clean, no-change compile, and event-detail incremental edit Gradle profiles. Added the profile paths and task-duration evidence that will be used to compare the modularized build.
