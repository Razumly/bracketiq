# Division Capacity From Loaded Teams

This ExecPlan is a living document. Follow `PLANS.md` while implementing and keep Progress, Discoveries, Decisions, and Outcomes current.

## Purpose

The event detail capacity UI should be driven by the teams returned from the participant snapshot instead of division `teamIds` or client-side registration sections. When registered event teams are already loaded, the fullness counts should use those loaded teams, excluding placeholder/provisioned slots. While a team-signup event is still loading and no teams have arrived yet, the fullness meter should show an indeterminate loading bar instead of a misleading empty determinate state.

## Progress

- [x] Read the existing division capacity summary, overview capacity, event detail UI, repository sync, and participants snapshot backend path.
- [x] Confirmed the participants endpoint already fetches team rows from event registrations and returns `teams` without registration sections unless management mode is requested.
- [x] Refactor `DivisionCapacitySummary` to count loaded visible teams by division metadata instead of `DivisionDetail.teamIds`.
- [x] Add loading-state rendering to the main fullness meter and division rows when team data is still loading.
- [x] Update focused client tests for team-derived division capacity.
- [x] Run focused Gradle tests.
- [x] Record final test results and any backend follow-up.

## Discoveries

- `Event.visibleTeams(...)` already excludes placeholders for team-signup league/tournament events by requiring registered event teams to have a non-blank `parentTeamId`; this matches the desired “parentId assigned” behavior in the app model.
- `GET /api/events/[eventId]/participants` calls `buildEventParticipantSnapshot(...)`, which queries event registrations server-side and returns `teams`. It only returns registration sections when `manage=true`.
- The current division capacity helper still intersects `DivisionDetail.teamIds` with loaded team ids, so stale division membership can affect the UI even when the returned team list is authoritative.
- The filtered Gradle run needed a longer timeout/forced rerun to prove the changed common test executed; the initial two-minute command timed out before Gradle returned a result.

## Decisions

- Keep the public helper signature `buildDivisionCapacitySummaries(event, divisionDetails, teams)` unchanged and change its internals to classify `event.visibleTeams(teams)` by `Team` division fields.
- Treat `DivisionDetail.teamIds` as non-authoritative for this UI; it will no longer affect filled counts.
- Keep the loading animation as a UI concern, passed from `EventOverviewSections` into progress rendering, rather than adding transient loading state to the pure summary model.
- Do not change the backend endpoint in this pass because the participant snapshot already implements the desired server-side registration-to-team lookup and omits registration sections for non-management fetches.

## Implementation Plan

1. Update `DivisionCapacitySummary.kt` to:
   - Count only loaded visible teams.
   - Match teams to divisions via `team.division`, `team.divisionTypeId`, and combined skill/age/gender metadata against each `DivisionDetail`.
   - Preserve unassigned capacity rows for loaded teams that do not match any configured division.
2. Update the team capacity gate to reuse the same division metadata matching, so join validation and displayed capacity agree.
3. Update `EventDetailScreen.kt` to:
   - Detect `event.teamSignup && teamsAndParticipantsLoading && visibleTeams.isEmpty() && selectedWeeklyOccurrenceSummary == null`.
   - Render the main fullness `LinearProgressIndicator` indeterminately while that condition is true.
   - Render division capacity rows indeterminately under the same condition.
4. Update `DivisionCapacitySummaryTest` and `EventOverviewCapacityTest` to assert that loaded team division metadata is the source of truth, parentless placeholders are excluded, and stale `DivisionDetail.teamIds` do not inflate counts.
5. Run the focused common tests for the capacity helpers, then a broader debug unit test if feasible.

## Validation

Commands to run from `C:\Users\samue\StudioProjects\mvp-app`:

```
.\gradlew :composeApp:testDebugUnitTest --tests "*DivisionCapacitySummaryTest*"
.\gradlew :composeApp:testDebugUnitTest --tests "*EventOverviewCapacityTest*"
.\gradlew :composeApp:testDebugUnitTest
```

## Outcomes

Implemented in the app repo.

- `DivisionCapacitySummary` now counts loaded visible teams by team division metadata and no longer uses `DivisionDetail.teamIds` for filled counts.
- `countTeamSignupParticipantsForCapacity` now uses the same division metadata matcher when checking whether a selected division is full.
- The main fullness meter and expanded division capacity rows use indeterminate `LinearProgressIndicator` rendering while a team-signup event is loading and no visible teams have been loaded yet.
- Known selected weekly occurrence summaries continue to render during a team refresh; the indeterminate fallback only applies when no occurrence summary is available.
- Updated tests cover team-derived division capacity, unassigned teams, and placeholder exclusion.

Validation results:

```
.\gradlew :composeApp:testDebugUnitTest --tests "*DivisionCapacitySummaryTest*" --tests "*EventOverviewCapacityTest*" --rerun-tasks
.\gradlew :composeApp:testDebugUnitTest
git diff --check
```

All commands completed successfully on Windows. Gradle reported the existing Kotlin/Native iOS target warnings for this non-macOS host.
