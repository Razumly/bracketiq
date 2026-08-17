# Center Navigation Schedule Shortcut

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root.

## Purpose / Big Picture

The bottom navigation should match the requested mobile pattern: Discover, Messages, a raised circular center action, Schedule, and Home. The center action normally creates an event, but it must be replaceable so the app can show an event image and route directly to the relevant upcoming event or match. After this change, a user can tap Schedule directly from the bottom bar, tap the center plus to create an event, or tap an event-image center action near game time to jump into the event or match detail screen.

## Progress

- [x] (2026-06-16 22:04Z) Read the root navigation, bottom nav, profile schedule screen, schedule repository, match repository, and Android/iOS deep-link parsers.
- [x] (2026-06-16 22:04Z) Confirmed `api/profile/schedule` already returns events and matches, so no backend route is needed for center-action timing decisions.
- [x] (2026-06-16 23:31Z) Implement root Schedule tab, replace the old Create tab with Schedule, and render Create as a raised circular center action.
- [x] (2026-06-16 23:31Z) Implement replaceable center action selection for create, event shortcut, and match shortcut.
- [x] (2026-06-16 23:31Z) Add match deep-link parsing and resolution for Android and iOS.
- [x] (2026-06-16 23:31Z) Add focused unit tests for center-action timing rules.
- [x] (2026-06-16 23:31Z) Run focused Gradle tests and Android emulator visual QA using the `test-android-apps` flow.

## Surprises & Discoveries

- Observation: The profile schedule screen is currently nested under the Home/Profile stack rather than a root tab.
  Evidence: `ProfileMyScheduleScreen` is rendered by `ProfileScreen` when `ProfileComponent.Child.MySchedule` is active.
- Observation: Match detail navigation already exists in the root component, but deep links currently only resolve events.
  Evidence: `RootComponent.DeepLinkNav` contains `Event`, `Refresh`, and `Return`; Android and iOS URL parsers return only those event/onboarding cases.
- Observation: The schedule endpoint is already present in the app data layer and maps to `UserScheduleSnapshot`.
  Evidence: `EventRepository.getMySchedule()` calls `api/profile/schedule` and upserts returned events, matches, teams, and fields.
- Observation: The first emulator screenshot showed the raised center image too close to the neighboring labels when the nav bar still distributed four equal items.
  Evidence: `/tmp/mvp-nav-screenshot.png` showed the center action visually crowding Messages and Schedule.
- Observation: The existing common test compile path was blocked by a fake DAO missing a method from the current dirty worktree's `MatchOperationOutboxDao` interface.
  Evidence: The focused Gradle test failed before running `CenterNavActionResolverTest` until `MatchRepositoryHttp_FakeOutboxDao.pendingOperationCount(...)` was added.

## Decision Log

- Decision: Add a root-level `Schedule` app config instead of making the bottom item open Home and then pushing schedule manually.
  Rationale: Schedule is now a primary tab, and its selected state should be independent from Home.
  Date/Author: 2026-06-16 / Codex.
- Decision: Model the center button as a sealed center-action state rather than as another nav item.
  Rationale: The requested button needs replaceable behavior and appearance while staying physically centered between the normal nav tabs.
  Date/Author: 2026-06-16 / Codex.
- Decision: Prefer match shortcuts over event shortcuts when an eligible match is within one hour or already started.
  Rationale: The user explicitly asked that match proximity route to the match screen specifically.
  Date/Author: 2026-06-16 / Codex.
- Decision: Insert a weighted center spacer between Messages and Schedule in the Material `NavigationBar` and render the center button as a separate overlay.
  Rationale: This keeps the raised circular action centered while preserving tappable, non-overlapping labels for all four root tabs.
  Date/Author: 2026-06-16 / Codex.

## Outcomes & Retrospective

Implemented the requested bottom navigation shape. The root tabs are now Discover, Messages, Schedule, and Home, with Create moved into a replaceable raised center action. The center action defaults to Create, switches to an event-image shortcut for active or upcoming events within twenty-four hours, and prioritizes a match shortcut when a match is within one hour or already started.

Android and iOS deep-link parsers now recognize match routes with event context, including event match paths and query fallback shapes carrying both `eventId` and `matchId`. Root navigation resolves these links by fetching the event, refreshing event matches, and opening the existing match detail screen.

Validation passed with the focused center-action unit test, the debug Android build, and Android emulator visual QA. The emulator pass caught an initial layout overlap; the final nav screenshot shows clear spacing, the Schedule tab opens My Schedule, and tapping the active center image opened the match detail screen.

## Context and Orientation

`composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/MVPBottomNavBar.kt` renders the bottom bar. It currently treats Create as a normal navigation item, so the bar has Discover, Messages, Create, and Home.

`composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/RootComponent.kt` owns the root Decompose stack. Decompose is the navigation library used here; a stack is the list of screens where the last entry is visible. RootComponent also owns startup deep-link handling, selected tab state, and methods like `navigateToMatch`.

`composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileMyScheduleScreen.kt` renders My Schedule, but it is currently nested under `ProfileScreen`. A new root Schedule tab can reuse `ProfileScreen` if the profile component can start at the My Schedule child.

`composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt` already exposes `getMySchedule()`. It returns a `UserScheduleSnapshot` containing `events`, `matches`, `teams`, and `fields`.

`composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt` can refresh matches for an event and the match detail screen can observe a match by id after it is cached.

Android deep links are parsed in `composeApp/src/androidMain/kotlin/com/razumly/mvp/MainActivity.kt`. iOS URL parsing is mirrored in `iosApp/iosApp/ContentView.swift`.

## Plan of Work

First, add a public profile start destination so the existing profile component can start at Home or My Schedule. Update the Koin factory to accept this optional parameter, and add a root `AppConfig.Schedule` that creates a profile component starting at My Schedule.

Second, replace the bottom nav items with Discover, Messages, Schedule, and Home. Add a separate center action parameter to `MVPBottomNavBar`, render it as a raised circle centered over the bar, and use an event-image circle when the action is an event or match shortcut.

Third, add a small pure helper under root presentation code that chooses the center action from `UserScheduleSnapshot` and the current time. It should return Create by default, return a match shortcut when a non-final match starts within one hour or is already in progress, and return an event shortcut when a non-ended event is active or starts within twenty-four hours. Add common unit tests for those cases.

Fourth, update RootComponent to keep a center-action state flow. When the current user is authenticated, it should refresh the schedule snapshot and recompute the center action periodically. Tapping the center action should either open create, resolve the event, or resolve the match. Match resolution should fetch the event, refresh event matches through `IMatchRepository`, find the target match, and push `AppConfig.MatchDetail`.

Fifth, update Android and iOS deep-link parsing for event match paths such as `/events/{eventId}/matches/{matchId}` and for query fallback shapes that contain both `eventId` and `matchId`.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-app`.

After implementation, run:

    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.presentation.CenterNavActionResolverTest"

Then run:

    ./gradlew :composeApp:assembleDebug

For Android visual QA with `test-android-apps`, use adb to list devices, install the debug variant if an emulator is available, launch the app, dump the UI tree, and capture a screenshot of the bottom navigation.

## Validation and Acceptance

The focused unit test must pass. It proves the center action chooses Create when no event is near, chooses an event shortcut inside the twenty-four-hour event window, chooses a match shortcut inside the one-hour match window, and ignores completed/cancelled matches.

The debug build must compile.

On Android emulator visual QA, the bottom navigation must show Discover, Messages, a centered circular plus action, Schedule, and Home. Schedule must appear as a normal bottom tab label. The center button must be visually circular and raised above the bar.

## Idempotence and Recovery

All edits are code-only and safe to rerun. If the center-action schedule refresh fails, the app should keep the Create action so navigation remains usable. If a deep-linked match cannot be resolved, RootComponent should show a startup notice and fall back to Discover.

## Artifacts and Notes

Validation commands run:

    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.presentation.CenterNavActionResolverTest"
    ./gradlew :composeApp:assembleDebug

Both commands completed successfully after the test fake DAO was updated for the existing outbox interface.

Android emulator QA artifacts:

    /tmp/mvp-nav-screenshot-spaced.png
    /tmp/mvp-schedule-tab.png
    /tmp/mvp-center-match-settled.png

The final emulator UI tree showed the center circle between Messages and Schedule without label overlap, and the center action routed into an active match detail screen.

## Interfaces and Dependencies

Define a sealed action type available to root and UI code:

    sealed class CenterNavAction {
        data object CreateEvent : CenterNavAction()
        data class EventShortcut(...)
        data class MatchShortcut(...)
    }

RootComponent must expose:

    val centerNavAction: StateFlow<CenterNavAction>
    fun onCenterNavActionSelected()

RootComponent deep links must include:

    RootComponent.DeepLinkNav.Match(eventId: String, matchId: String)

The bottom nav composable must accept:

    centerAction: CenterNavAction
    onCenterActionClick: () -> Unit

Plan revision note: Initial plan created after source inspection to satisfy the repository ExecPlan requirement for this navigation and deep-link feature.
