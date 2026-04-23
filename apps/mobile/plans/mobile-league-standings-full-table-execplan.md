# Restore Full Mobile League Standings Columns

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at repository root and must remain compliant with its requirements.

## Purpose / Big Picture

Mobile league standings currently collapse the backend standings contract into just score and draws, which hides wins and losses and produces confusing `S` and `D` labels. After this change, the mobile standings tab will show a fuller table that matches the web product more closely: team, wins, losses, optional draws, and final points. The draws column must disappear for sports whose resolved match rules do not allow draws.

## Progress

- [x] (2026-04-22 23:35Z) Verified the backend standings API already returns `wins`, `losses`, `draws`, `matchesPlayed`, and points fields from `mvp-site`.
- [x] (2026-04-22 23:39Z) Verified the mobile app drops `wins` and `losses` in `StandingsDtos.kt` and `LeagueStandingsModels.kt`, and hardcodes `S` / `D` in `EventDetailScreen.kt`.
- [x] (2026-04-22 23:42Z) Verified draw support should come from resolved match rules (`supportsDraw`) rather than inferring from scoring config nullability.
- [x] (2026-04-22 23:59Z) Restored `wins` and `losses` through the mobile DTO and repository mapping path.
- [x] (2026-04-23 00:08Z) Replaced the mobile `S` / `D` standings layout with a fuller `W / L / optional D / Pts` table driven by shared standings-column helpers.
- [x] (2026-04-23 00:14Z) Added focused regression tests for standings mapping and mobile standings presentation helpers.
- [x] (2026-04-23 00:31Z) Ran targeted Gradle validation for repository/event-detail tests and confirmed success after fixing one missing `round` import.

## Surprises & Discoveries

- Observation: The backend contract was already correct; the regression is entirely on the mobile side.
  Evidence: `mvp-site/src/app/api/events/[eventId]/standings/shared.ts` includes `wins` and `losses`, while `composeApp/.../StandingsDtos.kt` omits them.
- Observation: The existing mobile fallback standings calculator also only tracked draws and points, so even pre-API rendering could not show the fuller table.
  Evidence: `EventDetailScreen.kt` `TeamStanding` and `StandingAccumulator` only stored `draws`, goal totals, and score.
- Observation: The authoritative “can this sport end in a draw?” flag already exists in the shared mobile match-rule resolver.
  Evidence: `resolveEventMatchRules(...)` in `EventMatchRules.kt` resolves `supportsDraw` from sport template, event override, and persisted fallback rules.
- Observation: Extracting standings formatting into a new helper exposed a still-live `round(...)` dependency elsewhere in `EventDetailScreen.kt`.
  Evidence: The first `testDebugUnitTest` compile failed with `Unresolved reference 'round'` at `EventDetailScreen.kt:4422` until the import was restored.
- Observation: The initial Gradle daemon-backed test run failed for an environment reason before reporting assertions.
  Evidence: `Gradle build daemon has been stopped: stop command received`; rerunning with `--no-daemon` produced a stable result.

## Decision Log

- Decision: Use resolved match rules (`supportsDraw`) to decide whether the draw column is visible.
  Rationale: This is the same rule path used elsewhere in the app for match-result behavior and avoids guessing from optional scoring-config fields.
  Date/Author: 2026-04-22 / Codex
- Decision: Match the existing web standings shape on mobile with `W`, `L`, optional `D`, and `Pts`, instead of introducing extra columns like goals for/against.
  Rationale: The user asked for the fuller standings table, and the web schedule page is the current product reference for that table.
  Date/Author: 2026-04-22 / Codex

## Outcomes & Retrospective

Completed. Mobile standings now preserve backend `wins` and `losses`, render a fuller standings table, and omit the draw column when the event’s resolved match rules do not support draws. The implementation also extracted the standings math/column configuration into a shared helper so the UI and tests use the same rules. Targeted JVM validation passed.

## Context and Orientation

`composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/StandingsDtos.kt` defines the mobile network contract for standings responses. `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/LeagueStandingsModels.kt` and `EventRepository.kt` convert that DTO into shared repository models. `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt` renders the league standings tab.

The backend source of truth is `C:/Users/samue/Documents/Code/mvp-site`. In that repository, `src/app/api/events/[eventId]/standings/shared.ts` shows the standings payload that mobile must honor. Web standings rendering in `src/app/events/[id]/schedule/page.tsx` is the reference for the intended column set.

“Resolved match rules” means the final match behavior after combining sport defaults, sport template overrides, event overrides, and any persisted event fallback. In this repository that logic lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventMatchRules.kt`.

## Plan of Work

First, extend the mobile standings DTO and repository model so `wins` and `losses` flow from the backend response into `LeagueDivisionStandings`. Keep the existing fields untouched so confirmation and points override flows continue to work.

Next, update the standings presentation inside `EventDetailScreen.kt`. Replace the current two-column score/draw display with a fuller row layout that includes wins, losses, optional draws, and points. Keep the team cell using `TeamCard`, and compute draw visibility from `resolveEventMatchRules(selectedEvent.event, selectedSportForEvent)`.

Finally, add regression tests. Update the existing HTTP repository test to assert `wins` and `losses` survive response mapping. Add an event-detail test around the extracted standings presentation helper so draw-column visibility is driven by resolved match rules and the fallback standings builder retains wins/losses/draws for local rendering before the API response arrives.

## Concrete Steps

Run from `C:\Users\samue\StudioProjects\mvp-app`:

1. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/StandingsDtos.kt`.
2. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/LeagueStandingsModels.kt`.
3. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`.
4. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt` and extract any testable standings helpers if needed.
5. Edit or add tests under `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/` and `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/`.
6. Run targeted Gradle tests for the touched suites.

Completed command:

    .\gradlew --no-daemon :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest" --tests "com.razumly.mvp.eventDetail.LeagueStandingsPresentationTest" --tests "com.razumly.mvp.eventDetail.EventDetailsMatchRulesTest"

## Validation and Acceptance

Acceptance is met when:

1. A league standings API response containing wins and losses maps into mobile repository models without dropping those fields.
2. The mobile standings tab no longer shows `S` and `D` as the primary headers.
3. The standings tab shows `W`, `L`, optional `D`, and `Pts` with team rows populated from server standings.
4. For a sport whose resolved match rules have `supportsDraw = false`, the draw column is omitted entirely.
5. Targeted Gradle tests pass.

## Idempotence and Recovery

These are additive client-side changes. Reapplying the edits is safe as long as the backend contract remains the same. If the new standings row layout proves too dense on smaller screens, the recovery path is to keep the fuller data contract and adjust only the visual spacing; do not revert the restored `wins` and `losses` mapping.

## Artifacts and Notes

The database investigation that motivated this plan found that `Test Event creation` is a `LEAGUE` event with a scoring config that only sets `pointsForWin = 3`. The confusing `S` and `D` labels were therefore confirmed to be a mobile rendering issue, not an event-data issue.

Validation artifact:

    .\gradlew --no-daemon :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest" --tests "com.razumly.mvp.eventDetail.LeagueStandingsPresentationTest" --tests "com.razumly.mvp.eventDetail.EventDetailsMatchRulesTest"

  Result: `BUILD SUCCESSFUL`

## Interfaces and Dependencies

The implementation must continue using:

- `StandingsResponseDto`, `StandingsDivisionDto`, and `StandingsRowDto` for API decoding.
- `LeagueDivisionStandings` and `LeagueStandingsRow` for repository models.
- `resolveEventMatchRules(event, sport)` from `EventMatchRules.kt` for draw-support decisions.
- The backend standings source of truth in `mvp-site/src/app/api/events/[eventId]/standings/shared.ts`.

Revision note (2026-04-22 / Codex): Initial plan authored after inspecting the mobile standings UI, backend standings contract, and draw-support rule source.
Revision note (2026-04-23 / Codex): Updated progress, discoveries, validation, and outcomes after implementing the standings data-flow restoration, shared presentation helper, conditional draw-column behavior, and targeted tests.
