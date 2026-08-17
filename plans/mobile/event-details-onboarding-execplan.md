# Event Details Onboarding Guides

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, users who join an event will receive targeted guidance inside event details, event tabs, and match details. The app will explain where to find participants, schedules, brackets, standings, and, for assigned team officials, how official check-in and scoring works.

The visible result is the existing full-screen gray guide scrim highlighting event-detail controls as the user moves through the event. The default event guide runs after joining an event and again on the user's first match day. The tab guides run independently the first time the user opens each relevant tab. The official match guide runs only when the user's team is assigned as the match's official team and the team has not checked in yet.

## Progress

- [x] (2026-06-25 00:53Z) Read the root guide infrastructure, existing root onboarding ExecPlan, and match official check-in flow.
- [x] (2026-06-25 00:53Z) Captured the guide ids, trigger rules, official check-in gating, and validation scenarios in this ExecPlan.
- [x] (2026-06-25 01:12Z) Added event and match guide target constants, guide id helpers, and reusable guide specs in `EventOnboardingGuides.kt`.
- [x] (2026-06-25 01:12Z) Added guide controller read helpers for completed/active guide state.
- [x] (2026-06-25 01:12Z) Registered event overview targets and implemented the joined-event and first-match-day overview guide triggers.
- [x] (2026-06-25 01:12Z) Registered participants, schedule, bracket, standings, tab-strip, and division-selector targets and implemented independent tab guide triggers.
- [x] (2026-06-25 01:12Z) Registered match identity, official assignment, score control, and result-control targets and implemented the assigned-team official pre-check-in guide trigger.
- [x] (2026-06-25 01:12Z) Gated the official check-in dialog in `MatchDetailScreen.kt` so assigned team officials see the guide before the prompt.
- [ ] Add focused tests for trigger policy and official prompt gating where practical.
- [ ] Validate with Android emulator QA.

## Surprises & Discoveries

- Observation: The guide infrastructure already supports root-hosted rendering, target registration, completed-guide persistence, and required target gating.
  Evidence: `GuideController.maybeStartGuide(...)` checks `completedGuideIdsLoaded`, skips active or completed guides, waits for required targets, and filters steps to targets currently registered by `Modifier.guideTarget(...)`.

- Observation: The current official check-in flow still treats "can swap into official" as a reason to show the check-in prompt.
  Evidence: `MatchContentComponent.checkOfficialStatus()` computes `canSwapIntoOfficial = !checkedIn && canCurrentUserSwapIntoOfficial(currentMatch)` and includes it in `shouldShowPrompt = canCheckIn && !checkedIn && (isOfficial || canSwapIntoOfficial)`.

- Observation: The switch-to-official path currently assigns the user's team and immediately shows the official check-in dialog.
  Evidence: `MatchContentComponent.confirmOfficialCheckIn()` updates `teamOfficialId = currentUserEventTeamId`, sets `officialCheckedIn = false`, then sets `_showOfficialCheckInDialog.value = true` on success.

- Observation: Event detail `MatchWithRelations` contains `Team` relations, not `TeamWithRelations`, so first-match-day detection cannot read joined player relation rows there.
  Evidence: The first compile attempt failed on `team.team` and `team.players` references in `EventDetailScreen.kt`; `MatchWithRelations.kt` shows `team1`, `team2`, and `teamOfficial` are `Team?`.

## Decision Log

- Decision: Keep the visual guide overlay rooted in the app shell and keep trigger logic near event detail and match detail screens.
  Rationale: The root guide host can cover the full screen including navigation, while event and match screens know which tabs, match state, and controls are visible.
  Date/Author: 2026-06-25 / Codex

- Decision: Store guide completion with event-scoped ids for event details and official match guidance.
  Rationale: A user may need onboarding in each event because event format, tabs, and officiating rules can differ. The official guide should not repeat for every match in the same event once the user has learned the flow.
  Date/Author: 2026-06-25 / Codex

- Decision: Use a separate first-match-day overview guide id that reuses the same overview content as the joined-event guide.
  Rationale: The user explicitly wants the same flow to appear again on the first match day. A separate id lets the app replay that content without clearing the original joined-event completion.
  Date/Author: 2026-06-25 / Codex

- Decision: Do not trigger the official match guide merely because teams can officiate.
  Rationale: Teams-can-officiate is permission to become assigned, not assignment itself. The guide should run only after the user's team is actually assigned as the official team and before check-in.
  Date/Author: 2026-06-25 / Codex

- Decision: Gate the official check-in prompt behind guide completion when the official guide is eligible.
  Rationale: The user should see the official explanation before being asked to check in. After the guide completes, the existing check-in prompt can appear.
  Date/Author: 2026-06-25 / Codex

## Outcomes & Retrospective

Update 2026-06-25 01:12Z: Implemented the first functional version of event-details onboarding. Event overview guides now use event-scoped joined and first-match-day ids. Participants, schedule, bracket, and standings each have independent event-scoped tab guides. Match detail now has an assigned-team official guide that runs before the check-in dialog when `match.teamOfficialId` is one of the user's event team ids and `officialCheckedIn != true`. The implementation compiles for common metadata. Remaining work is emulator QA and focused tests if the component seams make them practical.

## Context and Orientation

The shared Compose guide system lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/guides/`. A guide is an `AppGuide`, which has an id and a list of `AppGuideStep` values. A step points to a target id. UI elements become targets by adding `Modifier.guideTarget(targetId)`, which reports the element bounds to `GuideController`. The root app shell renders `GuideHost`, which draws the gray scrim, target highlight, text card, and previous/next controls.

The root app shell lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/App.kt`. It creates the `GuideController`, provides it through `LocalGuideController`, and renders `GuideHost` above the app content. Completed guide ids are exposed through `RootComponent` and persisted by `CurrentUserDataSource`.

The event detail screen lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`. It renders the event overview, the event tabs, and tab-specific content for participants, schedule, brackets, and standings or leagues. The same screen includes primary actions such as joining an event and viewing schedule and participants.

The match detail screen lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailScreen.kt`. Its state and official check-in logic are driven by `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt`. Team official assignment is represented by `match.teamOfficialId`. Team official check-in is represented by `match.officialCheckedIn == true`. A user is a team official for this plan only when one of the user's current event team ids matches `match.teamOfficialId`.

The phrase "first match day" means the first local calendar date on which the current user has at least one match in the joined event. The implementation should compute this from event schedule data already loaded in event detail or profile schedule data if that is the only available source. The completed id should be event-scoped, so the match-day replay happens once per event, not once per date forever.

## Guide Ids

Use versioned guide ids so a future guide revision can intentionally rerun by changing the version suffix. Use event ids in guide ids to keep completion scoped to the event.

The event overview guide after joining uses:

    event_overview_joined_v1:event:<eventId>

The first-match-day replay uses:

    event_overview_match_day_v1:event:<eventId>

The independent event tab guides use:

    event_participants_tab_v1:event:<eventId>
    event_schedule_tab_v1:event:<eventId>
    event_bracket_tab_v1:event:<eventId>
    event_standings_tab_v1:event:<eventId>

The official match guide uses:

    match_official_pre_checkin_v1:event:<eventId>

If a match detail screen ever lacks an event id, fall back to `match_official_pre_checkin_v1:match:<matchId>` for that edge case only. Prefer event-scoped completion whenever the event id is available.

## Guide Content and Targets

Add constants to `AppGuideTargets` or a nearby event-specific guide target object. Keep target names stable and descriptive.

The event overview guide should highlight the event header/status, the joined or primary action area, event format details, and the event tab row. Its text should explain that event details are the user's home base for event updates, registration state, schedule entry, divisions, location, and event-specific tabs.

The participants tab guide should highlight participant sections, a division or category selector when visible, roster or team cards, and permission-based manage or invite actions only when the user can use them. If the user cannot manage participants, do not include management-only controls in the basic participant guide.

The schedule tab guide should highlight date or filter controls when visible, match cards, the match detail entry point, and the empty schedule state when no match card is available. Its text should explain time, field, teams, match status, official assignment, and that tapping a match opens details.

The bracket tab guide should highlight bracket selectors or toggles, bracket match cells, advancement behavior, and the empty bracket state when no bracket exists yet. Its text should explain that completed results move teams through the bracket once matches are finalized.

The standings tab guide should highlight the standings table, division or pool selector when visible, and any confirmation or finalization indicator when visible. Its text should explain rank, record, points, tiebreakers, and how standings may feed bracket placement.

The official match guide should highlight the official assignment/check-in area, match identity details, the check-in action, score or segment controls, timing or result controls when visible, and the submit or finalization action. Steps for controls that only appear after check-in should either be skipped until those targets are available or split into a second post-check-in guide in a later revision. For this implementation, the required pre-check-in targets should be the official assignment/check-in area and match identity area.

## Trigger Conditions

The joined event overview guide starts only when all of these are true:

- The event detail overview screen is visible.
- The current user has joined or registered for the event.
- The event id is non-blank.
- The required overview guide targets are registered.
- The guide id `event_overview_joined_v1:event:<eventId>` is not completed.
- `GuideController.activeGuide` is null.

The first-match-day overview replay starts only when all of these are true:

- The event detail overview screen or an event-specific match-day entry screen is visible.
- The current user has joined or registered for the event.
- The current local date is the first known match day for the user in this event.
- The required overview guide targets are registered.
- The guide id `event_overview_match_day_v1:event:<eventId>` is not completed.
- `GuideController.activeGuide` is null.

The participants, schedule, bracket, and standings tab guides start only when their tab is active, their required targets or empty-state target are registered, the user is joined or otherwise viewing the event as a participant, and their guide id is not completed.

The official match guide starts only when all of these are true:

- Match detail is visible.
- The match id and event id are available.
- The user belongs to at least one team in the event.
- `match.teamOfficialId` equals one of the user's event team ids.
- `match.officialCheckedIn != true`.
- The required official guide targets are registered.
- The guide id `match_official_pre_checkin_v1:event:<eventId>` is not completed.
- `GuideController.activeGuide` is null.

The official match guide must not start only because `canCurrentUserSwapIntoOfficial(match)` returns true. Teams-can-officiate or swap eligibility is only permission to become assigned. Once a swap action sets `match.teamOfficialId` to the user's team id, the assigned-team condition becomes true and the official guide can start.

## Plan of Work

First, add event and match guide target constants. Use a small helper object if adding many constants to `AppGuideTargets` makes the shared object too broad. The constants should cover event overview header, primary action, event metadata or format, event tabs, participants section, participants division selector, schedule filters, schedule first match or empty state, bracket selector, bracket first match or empty state, standings table or empty state, match official assignment, match identity, check-in action, score controls, and finalization controls.

Next, add guide id helper functions near the event detail guide code. These helpers should accept event id and optionally match id, trim inputs, and return the exact ids listed in this plan. Keeping ids in helpers avoids hand-written string drift across tabs and tests.

Then add guide targets to `EventDetailScreen.kt`. Attach `Modifier.guideTarget(...)` to stable containers instead of tiny text nodes so the spotlight is visually useful. Required overview targets should be always-present containers such as the header and tab row. Optional targets can be included as guide steps and will be filtered by `GuideController` when absent.

After the overview targets exist, implement the joined overview guide and first-match-day overview replay. Both guides may reuse the same `AppGuideStep` content and target ids, but they must use different guide ids. Start the joined guide after join state is true and overview targets are visible. Start the match-day guide when the user is on their first known match day and the joined guide is already completed or not currently active. Do not start both at the same time.

Next implement tab-specific guides. In `EventDetailScreen.kt` or small tab-specific composables, construct the participants, schedule, bracket, and standings guides only when their tab is active. Call `maybeStartGuide(...)` with required target ids that represent visible content or the empty state. These guides should be stored and completed independently, so completing schedule does not complete participants, bracket, or standings.

Then add guide targets to match detail. In `MatchDetailScreen.kt` and `MatchDetailsPanel.kt`, mark the official assignment/check-in area, match identity section, and any stable scoring/finalization controls. Required pre-check-in targets should be visible before official check-in. Optional after-check-in targets can be present in the guide but must not be required.

Finally, update official prompt gating in `MatchContentComponent.kt` or the screen layer. Today, `checkOfficialStatus()` shows a prompt for assigned officials or users who can swap into officiating. After this change, swap eligibility alone should not show the official guide. When a user chooses to switch into officiating, the match should first update `teamOfficialId` to the user's team id and keep `officialCheckedIn = false`; then the guide should run before the check-in dialog appears. The check-in prompt may appear automatically after the official guide completes if the assigned team condition still holds.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-app`.

1. Inspect the existing targets and root guide implementation:

       rg -n "AppGuideTargets|guideTarget|maybeStartGuide|completedGuide" composeApp/src/commonMain/kotlin/com/razumly/mvp

2. Add event and match target constants under the existing guide package or in a new event guide target file.

3. Add guide id helper functions for:

       eventOverviewJoinedGuideId(eventId)
       eventOverviewMatchDayGuideId(eventId)
       eventParticipantsTabGuideId(eventId)
       eventScheduleTabGuideId(eventId)
       eventBracketTabGuideId(eventId)
       eventStandingsTabGuideId(eventId)
       matchOfficialPreCheckInGuideId(eventId, matchId)

4. Add overview, tab, and empty-state `Modifier.guideTarget(...)` calls to event detail UI.

5. Add `LaunchedEffect` blocks or equivalent screen-level trigger code that calls `guideController.maybeStartGuide(...)` only after state and targets are ready.

6. Add match-detail `Modifier.guideTarget(...)` calls for official assignment/check-in and match identity.

7. Update official prompt logic so assigned team officials with an incomplete official guide do not see the check-in prompt until the guide completes. Ensure swap eligibility alone does not trigger the guide.

8. Add focused tests for pure trigger helpers if helper functions are extracted. Add match official gating tests if `MatchContentComponent` can be tested without heavy UI setup.

9. Validate:

       ./gradlew :composeApp:compileCommonMainKotlinMetadata
       ./gradlew :composeApp:testDebugUnitTest

10. Use Android emulator QA to verify the user-visible flows:

       Fresh joined event overview guide
       Participants tab guide after View Schedule and Participants
       Schedule, bracket, and standings guides independently
       First-match-day overview replay
       Assigned team official guide before check-in
       Switch-to-official assignment guide before check-in

## Validation and Acceptance

Acceptance is met when a joined user can open an event and see the event overview guide once for that event. After completion, reopening the same event does not replay the joined guide. On the user's first match day for that event, the same overview content appears again through `event_overview_match_day_v1:event:<eventId>`, and completion of that replay does not affect other tab guides.

Acceptance is met for tabs when opening participants, schedule, bracket, and standings starts each tab's guide at most once per event. Empty states must be supported, so a missing schedule, bracket, or standings table should guide the visible empty-state container rather than failing silently or crashing.

Acceptance is met for officials when a user whose team is assigned as `match.teamOfficialId` opens match detail before check-in and sees the official guide before any check-in dialog. After completing the guide, the check-in dialog can appear. If teams can officiate but the user's team is not assigned, the official guide must not appear. If a team switches into officiating, the match assignment must update first, the guide must appear next, and check-in must come after guide completion.

Run `./gradlew :composeApp:compileCommonMainKotlinMetadata` and expect success. Run `./gradlew :composeApp:testDebugUnitTest` and record any failures here with whether they are caused by this change or existing checkout state. Manual Android emulator QA must include a real or seeded joined event with schedule, bracket, standings, and a match where the user's team is assigned as official team.

Validation performed on 2026-06-25:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata

Result: passed. The first attempt failed because first-match-day detection assumed `MatchWithRelations.team1` and `team2` exposed nested players. The helper was corrected to read `Team.playerIds`, then the command passed.

    git diff --check -- composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/guides/GuideController.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/guides/EventOnboardingGuides.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailOverviewSections.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailScreen.kt plans/event-details-onboarding-execplan.md

Result: passed.

    ./gradlew :composeApp:testDebugUnitTest

Result: failed after 835 tests with six failures. The failures were `EventLifecycleMobileApiIntegrationTest.event_lifecycle_matrix_creates_joins_schedules_and_updates_matches`, `LeaguePlayoffMobileApiIntegrationTest.league_playoff_mobile_api_flow_loads_staff_invites_periphery_join_and_schedule_data`, three `OrganizationDetailComponentTest` checkout/document assertions, and `TeamInviteDialogUiTest.existing_team_read_only_view_uses_team_name_title_inline_jersey_and_expandable_details`. These failures are outside the new guide files and should be triaged separately before treating the full debug unit suite as green.

## Idempotence and Recovery

All guide completion state is local preference data stored as completed guide ids. Re-running the implementation or validation commands is safe. The debug onboarding reset should clear these ids if it clears the shared completed-guide set. If a developer needs to replay guides manually, use the debug reset or clear app data.

Do not add backend or database schema changes for this plan unless first-match-day detection cannot be computed from existing event or schedule data. If a guide target is missing because content is loading or a tab has no data, wait for required targets or use the tab's empty-state target. Do not crash on missing optional targets.

If official guide gating causes the check-in prompt not to appear, verify the guide id is not already active, the required official targets are registered, the event id is present, and the completed guide id set has loaded. The fallback recovery is to allow the check-in prompt when the official guide is completed, canceled by navigation away, or ineligible because required targets never appear after loading finishes.

## Artifacts and Notes

Current guide model:

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

Current guide startup behavior:

    fun maybeStartGuide(
        guide: AppGuide,
        requiredTargetIds: Set<String> = emptySet(),
    ) {
        if (!completedGuideIdsLoaded) return
        if (activeGuide != null || guide.id in completedGuideIds) return
        if (!requiredTargetIds.all(::hasTarget)) return

        val availableSteps = guide.steps.filter { step -> hasTarget(step.targetId) }
        if (availableSteps.isEmpty()) return

        activeGuide = guide.copy(steps = availableSteps)
        activeStepIndex = 0
    }

Current official check-in prompt condition includes swap eligibility:

    val canSwapIntoOfficial = !checkedIn && canCurrentUserSwapIntoOfficial(currentMatch)
    val isOfficial = isAssignedTeamOfficial || isAssignedUserOfficial
    val shouldShowPrompt = canCheckIn && !checkedIn && (isOfficial || canSwapIntoOfficial)

The final implementation should preserve the ability to switch into officiating, but the guide trigger should only consider the assigned-team state after the switch updates `teamOfficialId`.

## Interfaces and Dependencies

The existing `GuideController` should remain the central dependency for guide state. The implementation may add read helpers such as:

    fun isGuideCompleted(guideId: String): Boolean
    val hasActiveGuide: Boolean

If check-in gating needs to respond immediately when a guide finishes, add a minimal completion observer or use existing `completedGuideIds` state from `GuideController` in `MatchDetailScreen.kt`. Do not introduce a second persistence mechanism for event guides.

The event guide implementation should depend on:

    LocalGuideController
    AppGuide
    AppGuideStep
    Modifier.guideTarget(...)
    EventDetailScreen.kt tab and join state

The official guide implementation should depend on:

    MatchContentComponent.matchWithTeams
    MatchContentComponent.officialCheckedIn
    MatchContentComponent.isOfficial
    MatchContentComponent.showOfficialCheckInDialog
    MatchMVP.teamOfficialId
    MatchMVP.officialCheckedIn

At the end of implementation, the code should expose a clear assigned-team official eligibility check equivalent to:

    val isAssignedTeamOfficial =
        match.teamOfficialId != null && currentUserEventTeamIds.contains(match.teamOfficialId)

    val shouldShowOfficialGuide =
        isAssignedTeamOfficial &&
        match.officialCheckedIn != true &&
        !guideController.isGuideCompleted(matchOfficialPreCheckInGuideId(eventId, match.id))

Update note (2026-06-25 / Codex): Initial ExecPlan written after planning the event detail, event tab, first-match-day, and assigned-team official onboarding behavior.
Update note (2026-06-25 / Codex): Implemented guide ids, targets, event overview/tab triggers, match official pre-check-in gating, and recorded validation results.
Update note (2026-06-25 / Codex): Android emulator QA with `test-android-apps` verified the debug reset flow, Discover onboarding replay, joined event overview guide, participants guide, schedule guide, standings guide, and bracket guide. Evidence screenshots were written to `/tmp/mvp-guide-participants.png`, `/tmp/mvp-guide-schedule.png`, `/tmp/mvp-guide-standings.png`, `/tmp/mvp-guide-event-overview.png`, and `/tmp/mvp-guide-bracket.png`.
Update note (2026-06-25 / Codex): Official-flow QA seeded `codex_official_20260624_112404__match__1` in the emulator Room database with `officialIds = []`, `officialCheckedIn = 0`, and `teamOfficialId = codex_official_20260624_112404__team__cascade_crew`. This exposed that event-team snapshots are filtered out of `getTeamsWithPlayersFlow`, so the assigned-team check must also inspect the loaded `teamOfficial` relation. The relation-aware fix compiled with `./gradlew :composeApp:compileCommonMainKotlinMetadata`, but the follow-up `./gradlew :composeApp:installDebug` hung in `:composeApp:compileDebugKotlinAndroid` and was interrupted, so the official guide still needs a completed Android reinstall and emulator confirmation.
