# Match Detail Official Scoring Stability

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, an official can tap the match-detail `+/-` score controls rapidly without the visible score bouncing back to an older value from the database or a background refresh. Direct score edits remain local-first, incident-based scoring keeps its queue semantics, and set confirmation remains the authoritative full-match sync step when incidents must be drained or when earlier direct-score writes failed.

The result is observable in focused Kotlin tests: rapid direct score taps coalesce into one absolute score write, stale remote match refreshes do not overwrite the local score fields for the selected match, and set confirmation continues to finalize against the latest local score state.

## Progress

- [x] (2026-04-22 22:17Z) Read `PLANS.md`, inspected the match-detail scoring flow, and confirmed the current rollback comes from optimistic-state clearing plus repository refreshes that do not honor `setIgnoreMatch(...)`.
- [x] (2026-04-22 22:33Z) Implemented debounced direct-score syncing, lifecycle-bound cleanup, and set-confirmation debounce cancellation in `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt`.
- [x] (2026-04-22 22:39Z) Activated ignored-match score preservation in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt` for both single-match and multi-match remote upserts.
- [x] (2026-04-22 22:47Z) Added focused component and repository regression tests covering debounce, stale repository emissions, delayed older score responses, and ignored-match remote refresh preservation.
- [ ] (2026-04-22 22:59Z) Validation is partially complete: attempted `.\gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.matchDetail.MatchContentComponentTest"` but the build is blocked by an unrelated compile error in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt` (`Unresolved reference 'round'` around line 4422). Remaining: rerun the focused Gradle suites after that unrelated compile issue is fixed.

## Surprises & Discoveries

- Observation: `MatchContentComponent.updateScore(...)` already uses the dedicated `/score` endpoint instead of the full match PATCH route.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt` calls `matchRepository.setMatchScore(...)`.

- Observation: `IMatchRepository.setIgnoreMatch(...)` exists but the current `MatchRepository.getMatchFlow(...)` and remote upsert helpers do not consult the ignored match at all.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt` stores `_ignoreMatch` but only `setIgnoreMatch(...)` writes it.

- Observation: the current component-level optimistic overlay replaces the full `MatchWithTeams` flow while present, so clearing it too early exposes any stale Room or remote re-emission immediately.
  Evidence: `matchWithTeams` switches to `flowOf(optimisticMatch)` whenever `_optimisticMatch` is non-null.

- Observation: focused Gradle validation is currently blocked by unrelated worktree breakage in `EventDetailScreen.kt`.
  Evidence: `:composeApp:compileDebugKotlinAndroid` fails with `Unresolved reference 'round'` at `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt:4422`.

## Decision Log

- Decision: Keep the existing direct-score contract on `POST /api/events/{eventId}/matches/{matchId}/score` and debounce client writes to that endpoint instead of changing backend APIs.
  Rationale: the backend already accepts absolute score values for a single team/segment, which is exactly the safe write model needed for rapid score tapping.
  Date/Author: 2026-04-22 / Codex

- Decision: Preserve only local score-owned fields (`segments`, `team1Points`, `team2Points`, `setResults`) for the ignored match during remote refreshes rather than freezing the whole match.
  Rationale: score edits must not roll back, but other match fields should still be free to refresh from the repository once the optimistic overlay is gone.
  Date/Author: 2026-04-22 / Codex

- Decision: Keep incident queue behavior separate from direct-score debounce behavior.
  Rationale: incident uploads have ordering and retry semantics that direct absolute score writes do not need when player-recorded scoring is disabled.
  Date/Author: 2026-04-22 / Codex

## Outcomes & Retrospective

The implementation is complete in the touched files. `MatchContentComponent` now keeps direct score edits local-first, persists them to Room without immediately dropping the optimistic overlay, coalesces rapid taps into one debounced absolute score write, and cancels pending debounce work before set confirmation. The incident queue path was left intact.

`MatchRepository` now gives `setIgnoreMatch(...)` real behavior by preserving local score-owned fields for the selected ignored match during both single-match and multi-match remote refreshes, while still allowing other remote fields to update. New tests were added for debounce and ignored-match preservation.

Validation is blocked, not missing. The focused Gradle test run could not reach the touched suites because the module currently fails compilation on an unrelated unresolved `round` reference in `EventDetailScreen.kt`. Once that external compile issue is fixed, rerun the two focused `:composeApp:testDebugUnitTest --tests ...` commands listed below.

## Context and Orientation

The mobile/shared match-detail screen lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt`. That component owns official check-in state, score edits, incident queue processing, and set confirmation. Direct `+/-` scoring currently updates `_optimisticMatch`, saves to Room, and immediately posts `setMatchScore(...)` for every tap.

The shared match repository lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt`. It exposes `getMatchFlow(...)` for the match detail screen, refreshes matches from backend endpoints, merges pending local incidents into remote matches, and already has a `setIgnoreMatch(...)` hook intended to protect the selected match while the user is on the detail screen.

The backend source of truth is the sibling `mvp-site` repository, but no backend change is required here. The existing `src/app/api/events/[eventId]/matches/[matchId]/score/route.ts` handler in that project already accepts absolute score writes for a single team and segment.

Relevant tests already exist in `composeApp/src/commonTest/kotlin/com/razumly/mvp/matchDetail/MatchContentComponentTest.kt` and `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/data/MatchRepositoryHttpTest.kt`. The new work should extend those suites instead of creating new test files.

## Plan of Work

First, refactor direct score editing in `MatchContentComponent.kt`. Keep the immediate local score increment behavior in `updateScore(...)`, but replace the fire-on-every-tap repository write with explicit debounced score-sync state that tracks the latest absolute score payload and a monotonic edit version. Persist every local score edit to Room without clearing `_optimisticMatch` on the local save. After 500 ms without another score tap, post only the latest absolute score to `matchRepository.setMatchScore(...)`. A successful score response may clear `_optimisticMatch` only when no newer score edit is pending or in flight. A failed score response must leave the local score in Room and on screen and must not create a retry queue.

Second, keep set confirmation authoritative. In `confirmSet()`, cancel or invalidate any scheduled debounced score write before draining the incident queue and constructing the final match payload. The confirmation path must read from the latest local match state already held in `_optimisticMatch` or Room, then continue using the existing full-match sync helpers so segment completion and finalize behavior remain centralized.

Third, activate ignored-match protection in `MatchRepository.kt`. When remote data is about to upsert a match whose id matches `_ignoreMatch`, load the local copy and preserve its score-owned fields before saving the remote match back to Room. Keep the existing pending-incident merge behavior so queued incident rows remain intact. Apply the same preservation in both the single-match and multi-match remote upsert helpers so the initial detail fetch and the background event schedule refresh cannot overwrite in-progress local scoring.

Finally, update the focused tests. Component tests should cover debouncing, protection against stale repository emissions while scoring, delayed older score responses, and set confirmation after an earlier debounced score failure. Repository tests should prove that ignored-match refreshes preserve local score fields while still allowing some non-score remote field to update.

## Concrete Steps

Work from the repository root `C:\Users\samue\StudioProjects\mvp-app`.

1. Edit:

    - `plans/match-detail-official-scoring-stability-execplan.md`
    - `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt`
    - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt`
    - `composeApp/src/commonTest/kotlin/com/razumly/mvp/matchDetail/MatchContentComponentTest.kt`
    - `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/data/MatchRepositoryHttpTest.kt`

2. Run focused tests:

    - `.\gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.matchDetail.MatchContentComponentTest"`
    - `.\gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.eventDetail.data.MatchRepositoryHttpTest"`

3. If either test suite exposes a timing issue in the fake repository, adjust only the test doubles in the touched test files and rerun the focused commands.

## Validation and Acceptance

Acceptance is behavioral:

- Rapid direct `+/-` taps produce immediate local score changes but only one debounced `setMatchScore(...)` call with the final absolute points.
- A stale Room or remote re-emission cannot make the visible score jump backward while an official is actively editing.
- A delayed older score response cannot clear or overwrite a newer local score edit.
- If a direct score write fails, the latest local score stays visible and set confirmation later syncs that latest score.
- Incident queue behavior is unchanged and still gates set confirmation when incident work is pending.
- Remote refresh for the ignored match preserves local score fields while still allowing at least one non-score remote field to update.

Validation is complete when the focused Gradle test commands above pass and their assertions cover those behaviors.

## Idempotence and Recovery

These changes are code-only and safe to rerun. The focused Gradle commands may be repeated without cleaning the repo. If the component and repository changes fall out of sync, restore consistency by making sure both layers agree on the same invariant: the ignored selected match may accept remote non-score fields, but its local score-owned fields win until scoring settles.

## Artifacts and Notes

Observed validation blocker:

    > Task :composeApp:compileDebugKotlinAndroid FAILED
    e: file:///C:/Users/samue/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt:4422:19 Unresolved reference 'round'.

This error is outside the touched scoring files. Re-run the two focused Gradle commands after that compile issue is resolved.

## Interfaces and Dependencies

No public DTO or API contract change is required.

`MatchContentComponent` must continue to expose `updateScore(...)`, `recordPointIncident(...)`, `requestSetConfirmation()`, and `confirmSet()` with their current signatures. `IMatchRepository.setIgnoreMatch(match: MatchMVP?)` also keeps its current signature, but by the end of this work it must have active semantics for ignored-match score preservation during remote refresh.

Revision note (2026-04-22 / Codex): Created the initial ExecPlan before implementation because `AGENTS.md` and `PLANS.md` require a living ExecPlan for this match-detail scoring stabilization work.

Revision note (2026-04-22 / Codex): Updated the plan after implementation to record the completed component/repository/test edits and the unrelated `EventDetailScreen.kt` compile blocker that prevented the focused Gradle suites from running to completion.
