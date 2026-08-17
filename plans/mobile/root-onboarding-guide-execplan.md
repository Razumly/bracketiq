# Root-Hosted Onboarding Guide

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, a first-time user can land on Discover and receive a guided tour that dims the entire app, including the bottom navigation, while highlighting the exact control being explained. The guide will start with Discover because it is the default authenticated screen, and the architecture will allow later screens to declare their own guides without hardcoding every guide step into the root component.

The visible result is a gray scrim over the whole app with a clear highlighted area, a short information card, and previous/next/skip/done controls. The root app shell owns the overlay so it can cover the whole screen, while the currently visible screen owns the guide sequence and target ids because only that screen knows which UI elements are present.

## Progress

- [x] (2026-06-24 00:00Z) Read the Discover screen, root app shell, bottom nav, DataStore-backed current user data source, dependency wiring, and existing `PLANS.md` requirements.
- [x] (2026-06-24 00:00Z) Decided on a hybrid architecture: root-level host and persistence with screen-level guide registration.
- [x] (2026-06-24 16:18Z) Added shared guide model, controller, target modifier, and root overlay composable under `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/guides/`.
- [x] (2026-06-24 16:19Z) Added persistent completed-guide storage through `CurrentUserDataSource` and exposed completed guide ids from `RootComponent`.
- [x] (2026-06-24 16:20Z) Rendered `GuideHost` in `App.kt` above app content and navigation while suppressing it behind loading and app update overlays.
- [x] (2026-06-24 16:23Z) Registered Discover guide steps and target bounds in `EventSearchScreen.kt`, `EventList.kt`, `DiscoverOrganizationList.kt`, and `DiscoverRentalList.kt`.
- [x] (2026-06-24 16:23Z) Registered the center create action target in `MVPBottomNavBar.kt`.
- [x] (2026-06-24 16:35Z) Ran focused Gradle validation. `:composeApp:compileCommonMainKotlinMetadata` passes. `:composeApp:testDebugUnitTest` runs 833 tests but fails one existing team-management UI test unrelated to guide code.

## Surprises & Discoveries

- Observation: The checkout already has unrelated modified files in match and event-detail areas.
  Evidence: `git status --short` showed edits under `MatchMVP.kt`, `MatchDtos.kt`, `MatchCard.kt`, `MatchRepository.kt`, `MatchContentComponent.kt`, and `MatchCardMembershipTest.kt` before this work began.

- Observation: Discover already measures search box coordinates using `boundsInWindow`, which is the right coordinate space for a full-app overlay.
  Evidence: `EventSearchScreen.kt` stores `searchBoxPosition` and `searchBoxSize` from `SearchBox.onPositionChange` and uses those values to position `SearchOverlay`.

- Observation: Root `App.kt` wraps both app content and `MVPBottomNavBar`, so a guide host rendered as the last child in that app-level `Box` can cover both screen content and bottom navigation.
  Evidence: `App.kt` renders `MVPBottomNavBar(...) { Scaffold { AppContent(...) } }` inside a top-level `Box`.

- Observation: The guide should wait until completed guide ids have loaded from DataStore before starting.
  Evidence: Without a loaded flag, `GuideController` would initially see an empty completed set and could briefly start `discover_onboarding_v1` for users who had already completed it.

- Observation: The broad debug unit test task currently has one failure outside the onboarding guide implementation.
  Evidence: `:composeApp:testDebugUnitTest` completed 833 tests with one failure: `TeamInviteDialogUiTest.existing_team_read_only_view_uses_team_name_title_inline_jersey_and_expandable_details` failed with `IllegalStateException: No padding values provided` from `LocalNavBarPadding` while composing `CreateOrEditTeamScreen`.

## Decision Log

- Decision: Host the visual guide overlay at the app root, not inside `EventSearchScreen`.
  Rationale: The guide must dim and target the whole app surface, including bottom navigation, which a screen-level overlay cannot reliably cover.
  Date/Author: 2026-06-24 / Codex

- Decision: Let screens register guide specs and target ids through a `LocalGuideController` rather than encoding screen-specific guides in `RootComponent`.
  Rationale: The root should provide guide infrastructure and persistence, while each screen knows which controls exist, when they are loaded, and which steps should be skipped.
  Date/Author: 2026-06-24 / Codex

- Decision: Persist completion with a versioned guide id, starting with `discover_onboarding_v1`.
  Rationale: A versioned id prevents repeat prompting after completion while allowing a future revised guide to be shown intentionally.
  Date/Author: 2026-06-24 / Codex

- Decision: Use four scrim rectangles around the target instead of a blend-mode cutout.
  Rationale: Drawing separate rectangles keeps the target area clear, covers the rest of the app, and avoids relying on platform-specific compositing behavior across shared Compose targets.
  Date/Author: 2026-06-24 / Codex

- Decision: Gate guide startup on a completed-guide loaded flag from root state.
  Rationale: This prevents a startup flash for users who already completed the guide but whose DataStore values have not been collected yet.
  Date/Author: 2026-06-24 / Codex

## Outcomes & Retrospective

Implemented the first milestone of the onboarding guide system. The app root now hosts a full-screen `GuideHost` and provides a `GuideController` through `LocalGuideController`. Screens and shared components can register target bounds with `Modifier.guideTarget(...)`, and the root persists completed guide ids through `CurrentUserDataSource`.

Discover now declares `discover_onboarding_v1` and starts it only from a quiet default Events-tab state: search overlay closed, filters closed, map hidden, query empty, and required tab/search targets measured. The guide can highlight the Discover tabs, floating search card, filter area, first result card when available, map button when available, and bottom-nav center action when available.

Validation succeeded for `./gradlew :composeApp:compileCommonMainKotlinMetadata`. The broader `./gradlew :composeApp:testDebugUnitTest` task compiles the app and runs tests but fails one team-management UI test unrelated to this guide change because that test composes `CreateOrEditTeamScreen` without providing `LocalNavBarPadding`.

## Context and Orientation

The shared Compose app shell lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/App.kt`. It creates a top-level `Box`, renders `MVPBottomNavBar`, renders screen content through `AppContent`, and shows global overlays such as loading and app update dialogs. This is the correct place to render a guide overlay because it can cover the navigation bar and screen content together.

The root navigation component lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/RootComponent.kt`. It already owns app-wide state such as selected page, unread counts, pending invite counts, startup notices, and app update prompts. It should expose completed guide ids and write guide completion to storage, but it should not own layout bounds.

The current user preference storage lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/CurrentUserDataSource.kt`. It is backed by AndroidX DataStore preferences. A DataStore preference is a persistent key-value entry stored on device. This plan adds one string preference that stores completed guide ids as a comma-separated list, mirroring existing helper behavior for muted chat ids.

The Discover screen lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt`. It renders a tab row, floating search card, event/organization/rental lists, a search overlay, and a map button. The first Discover guide should be declared here because this screen knows which tab is active and which targets are visible.

The bottom navigation lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/MVPBottomNavBar.kt`. It owns the center action button, so that composable should report the guide target bounds for the create-action step.

## Plan of Work

First add a reusable guide package under `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/guides/`. It will define a guide spec, steps, active state, a controller, a composition local, a `Modifier.guideTarget(...)` helper, and a `GuideHost` composable that draws the gray scrim, highlight, message card, and navigation controls.

Next extend `CurrentUserDataSource` with `getCompletedGuideIds()` and `markGuideCompleted(guideId)`. Then inject `CurrentUserDataSource` into `RootComponent`, collect completed guide ids into a `StateFlow`, and add a `markGuideCompleted` method that writes completion from the guide host.

Then render `GuideHost` inside `App.kt` as the last visual layer in the app-level `Box`, and provide the controller through `LocalGuideController` so screens and the nav bar can register targets.

Finally register the Discover guide in `EventSearchScreen.kt`. The guide starts only when the current tab is Events, no search overlay is open, no filter panel is open, the map is not visible, and the essential targets are measured. The guide steps are Discover tabs, search, filters, first result if present, map button if present, and center create action if the nav bar target has been measured. List composables will report the first visible card as a target.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-app`.

1. Create the guide package files:
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/guides/GuideModels.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/guides/GuideController.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/guides/GuideHost.kt`

2. Update `CurrentUserDataSource.kt` with completed-guide persistence.

3. Update `RootComponent.kt` and `ComponentModule.kt` so root exposes and writes completed guide ids.

4. Update `App.kt` to create and provide the guide controller and render `GuideHost`.

5. Update Discover and bottom navigation target registration:
   - `EventSearchScreen.kt`
   - `EventList.kt`
   - `DiscoverOrganizationList.kt`
   - `DiscoverRentalList.kt`
   - `MVPBottomNavBar.kt`

6. Validate with:

       ./gradlew :composeApp:compileCommonMainKotlinMetadata
       ./gradlew :composeApp:testDebugUnitTest

## Validation and Acceptance

Acceptance is met when a first-time authenticated user lands on Discover and sees a full-app onboarding overlay with these behaviors:

- The gray scrim covers both Discover content and the bottom navigation.
- The active target is visually highlighted.
- The message card has previous and next controls, and first/last step states behave correctly.
- Skip or Done hides the guide and prevents `discover_onboarding_v1` from showing again.
- The Discover screen owns the Discover guide sequence, while the app root owns rendering and persistence.
- Missing optional targets, such as the first result or map button while not measured, do not crash the app.

Validation must include at least `./gradlew :composeApp:compileCommonMainKotlinMetadata`. Run `./gradlew :composeApp:testDebugUnitTest` if the local environment allows it. Any failure must be recorded here with whether it is caused by this change or existing checkout/environment state.

Validation performed:

- `./gradlew :composeApp:compileCommonMainKotlinMetadata` passed on 2026-06-24 after fixing guide host offset/import issues.
- `./gradlew :composeApp:testDebugUnitTest` failed on 2026-06-24 after running 833 tests. The single failure is `TeamInviteDialogUiTest.existing_team_read_only_view_uses_team_name_title_inline_jersey_and_expandable_details`, caused by missing `LocalNavBarPadding` in that test setup. This failure is outside the guide files and occurs while composing `CreateOrEditTeamScreen`.

## Idempotence and Recovery

The implementation is source-only. Re-running the build or tests is safe. The DataStore guide key is additive and versioned; if a developer needs to see the guide again during manual testing, they can clear app data or later add a debug reset helper. No database schema, Room migration, backend endpoint, or destructive operation is required.

If guide targets are missing because a screen is loading or a target is offscreen, the controller must skip those steps or wait until required targets are measured rather than crashing.

## Artifacts and Notes

Initial dirty-tree evidence before this work:

    M composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MatchMVP.kt
    M composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/MatchDtos.kt
    M composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/MatchCard.kt
    M composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt
    M composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt
    M composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/composables/MatchCardMembershipTest.kt

## Interfaces and Dependencies

The guide system must expose these shared types:

    data class AppGuide(
        val id: String,
        val steps: List<AppGuideStep>,
    )

    data class AppGuideStep(
        val id: String,
        val targetId: String,
        val title: String,
        val body: String,
    )

    class GuideController {
        fun registerTarget(targetId: String, bounds: Rect)
        fun removeTarget(targetId: String)
        fun maybeStartGuide(guide: AppGuide, requiredTargetIds: Set<String> = emptySet())
        fun next()
        fun previous()
        fun dismiss()
    }

The root component must expose:

    val completedGuideIds: StateFlow<Set<String>>
    fun markGuideCompleted(guideId: String)

`CurrentUserDataSource` must expose:

    fun getCompletedGuideIds(): Flow<Set<String>>
    suspend fun markGuideCompleted(guideId: String)

Update note (2026-06-24 / Codex): Initial plan written after codebase orientation and user confirmation that the guide should be root-hosted.
Update note (2026-06-24 / Codex): Implemented the root-hosted guide infrastructure, Discover guide registration, center-nav target registration, persistence, and validation notes.
