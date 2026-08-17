# Make mobile event administration and officiating reliable

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This document is maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

Platform administrators must be able to repair event matches from the mobile app even when they are not the event host or an assigned official. Team officials must be able to start and score their assigned match without a human-official check-in prompt, while a specifically assigned human official must check in. The finished behavior is visible in Event Details and Match Details and is protected by focused common tests.

## Progress

- [x] (2026-07-12 05:15Z) Reconciled the mobile checkout with `origin/master` at `680c96c0` and preserved the existing dirty worktree.
- [x] (2026-07-12 05:15Z) Traced server session administration, event management access, direct match editing, and official prompt state.
- [x] (2026-07-12 06:05Z) Preserved `AuthSessionDto.isAdmin` in `AuthAccount` for login, registration, social login, session refresh, and session bootstrap.
- [x] (2026-07-12 06:05Z) Granted platform administrators event match-management access and exposed direct score and official check-in editing.
- [x] (2026-07-12 06:05Z) Removed human-official check-in requirements from assigned team officials without weakening human-official rules.
- [x] (2026-07-12 06:05Z) Added authorized event-team arrival controls for assigned human officials and administrators on Event Details, backed by corrected server authorization in `mvp-site`.
- [x] (2026-07-12 06:50Z) Moved active-event team check-in prompting to `RootComponent`/`App`, so it survives app navigation, verifies server state, retries transient failures, and retains Event Details as a manual action after dismissal.
- [x] (2026-07-12 06:50Z) Validated 98 focused Android tests with no failures and a successful touched-code compile; the manifest placeholder did not block the current debug unit-test build.

## Surprises & Discoveries

- Observation: The API already returns an administrator flag in every authenticated response, but the mobile account model drops it.
  Evidence: `AuthSessionDto` has `isAdmin`; `AuthUserDto.toAuthAccountOrNull()` only copies id, email, and name.
- Observation: Event Details already has a direct match editor with per-set numeric inputs, but access is derived only from host, assistant host, and organization manager identity.
  Evidence: `EventDetailScreen.kt` builds `canManageTemplate` without session administration, while `MatchEditDialog.kt` renders `IndividualScoreInputSection`.
- Observation: `checkOfficialStatus()` combines assigned team officials and assigned human officials into one `isOfficial` and prompt decision.
  Evidence: `MatchContentComponent.kt` sets `shouldShowPrompt` when either assignment is true and sets `assignedTeamOfficialPendingCheckIn` for team officials.
- Observation: The server allowed event officials to read arrival status but rejected their check-in write through the shared helper.
  Evidence: the event team-check-in GET route used event-official access, while `checkInTeam` accepted only a target team's manager or coach.

## Decision Log

- Decision: Carry the backend session role in `AuthAccount` instead of inferring administration from an email or user id.
  Rationale: The authenticated server response is the authoritative role source and already refreshes with the session.
  Date/Author: 2026-07-12 / Codex
- Decision: Reuse the existing direct match editor for administrators and add explicit official check-in toggles there.
  Rationale: It already supports absolute set score entry, which matches the requested repair workflow and avoids exposing unrestricted plus/minus controls as the only option.
  Date/Author: 2026-07-12 / Codex
- Decision: Treat team officials as immediately ready while preserving check-in for assigned human officials.
  Rationale: Team assignment identifies the responsible team; the separate human official attendance record remains meaningful only for a person assigned to an official slot.
  Date/Author: 2026-07-12 / Codex

## Outcomes & Retrospective

The mobile administration and check-in milestone is complete. Administrator role state now survives authentication and unlocks the existing direct match editor; that editor supports absolute per-set scores and human-official check-in toggles. Assigned team officials are immediately ready without a human-official prompt, while the assigned-human-official regression still exercises a real check-in write. Event Details exposes team-arrival buttons to authorized staff during the configured window. A root-level prompt now appears on any authenticated screen for an unchecked managed team in an active event, reads authoritative status, retries transient failures, and leaves the Event Details action available after dismissal. The focused Android suite passed 98 tests after compiling all touched common code. Broader offline operation-outbox and finalized-match reconciliation remain separate follow-up work.

## Context and Orientation

The mobile application is a Kotlin Multiplatform Compose app. Authenticated account state is defined in `core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/AuthAccount.kt`. Network authentication types and mapping are in `core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/AuthDtos.kt`, and `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt` stores the current account.

Event management access is evaluated in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailAccessRules.kt`, `DefaultEventDetailComponent.kt`, and `EventDetailScreen.kt`. The direct match editor is `eventDetail/composables/MatchEditDialog.kt`. Match scoring and official check-in state are owned by `matchDetail/MatchContentComponent.kt`; the visible prompts and controls are in `matchDetail/MatchDetailScreen.kt`.

A platform administrator is a user whose authenticated session has `isAdmin=true`. A team official is a participating event team assigned through `MatchMVP.teamOfficialId`. A human official is a user assigned to a normalized official slot in `MatchMVP.officialIds`. Team arrival check-in is separate from official attendance check-in.

## Plan of Work

First add `isAdmin` to `AuthAccount` with a false default for backward-compatible cached/test construction. Change the auth mapping to accept the session flag and update every response path in `UserRepository`. Add an auth repository regression proving a true flag survives login.

Second expose administrator state from `EventDetailComponent`, pass it into shared event-management access rules, and include it in screen capabilities for match editing, standings, officials, and participants. Keep server authorization authoritative. Add an official assignment check-in switch to each occupied slot in `MatchEditDialog`, so an administrator or event manager can repair that state alongside typed scores.

Third split team-official readiness from human-official attendance in `MatchContentComponent`. Assigned team officials will be treated as ready to score immediately and will never open the official check-in prompt. Assigned human officials will retain the match window and check-in write. Tests will assert both roles independently.

Fourth extend Event Details team check-in controls so assigned human officials and platform administrators can check in either participating team through the existing authenticated check-in endpoint. Then introduce an app-level active-event prompt coordinator so a team manager sees arrival prompts regardless of the current event sub-screen and can retry transient load failures.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-app`, run focused tests with:

    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.core.data.repositories.UserRepositoryAuthTest' --tests 'com.razumly.mvp.eventDetail.EventDetailAccessRulesTest' --tests 'com.razumly.mvp.matchDetail.MatchContentComponentTest' -Pmvp.startBackend=false

If the Android manifest merger rejects a missing `MAPS_API_KEY`, fix the test variant fallback in `composeApp/build.gradle.kts` without checking in a real key, then rerun the same command.

## Validation and Acceptance

An admin regression must prove that a session with `isAdmin=true` grants match editing even when the user is not a host, assistant host, organization manager, official, or team member. The direct editor must allow absolute per-set score entry and toggling each assigned human official's checked-in state.

A team-official regression must prove no official prompt appears and scoring is available immediately. A human-official regression must prove the prompt still appears inside the check-in window and scoring remains unavailable until successful check-in. Unrelated users must gain neither capability.

## Idempotence and Recovery

All changes are client capability and UI changes backed by existing authenticated server routes. No database migration or live write is required. Preserve unrelated dirty files and stage only the paths recorded by this plan. Re-running tests is safe. If the main site contract differs, treat `/Users/elesesy/StudioProjects/mvp-site` as authoritative and update both tests and this plan before changing endpoints.

## Artifacts and Notes

The web standings repair is tracked separately in the site repository. This plan begins with mobile HEAD `680c96c0`, which matches `origin/master`; existing uncommitted work includes event and match reliability changes and must not be reset.

## Interfaces and Dependencies

`AuthAccount` will expose `val isAdmin: Boolean = false`. `EventDetailComponent` will expose `val isPlatformAdmin: StateFlow<Boolean>`. `canManageEventForUser` will accept an explicit administrator boolean with a false default. The match component will derive administrator capability only from `IUserRepository.currentAccount`.

Revision note (2026-07-12): Created after reconciling the mobile checkout and tracing the authenticated role, event match editor, and official prompt paths. The first milestone fixes role propagation before changing permission-dependent UI.

Revision note (2026-07-12 06:05Z): Recorded completion of role propagation, administrator match repair, team-official prompt separation, and Event Details arrival controls, plus the 96-test focused validation result.

Revision note (2026-07-12 06:50Z): Recorded completion of the app-level active-event prompt and final 98-test cross-feature validation.
