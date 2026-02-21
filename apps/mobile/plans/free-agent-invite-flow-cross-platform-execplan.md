# Add Free-Agent Card Invite-To-Team Flow (Web + Mobile)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root and must be maintained in accordance with it.

## Purpose / Big Picture

Event free-agent lists currently show users but do not provide a direct action path from a specific free agent to team invitation management. After this change, users can tap/click a free-agent user card, choose an invite-to-team action, and land in Team Management with that same free agent highlighted as the suggested invite target.

The observable outcome is: start from an event free-agent list, pick a user card, choose `Invite to Team`, then see Team Management opened with that free agent emphasized in the invite UI.

## Progress

- [x] (2026-02-21 02:35Z) Audited current mobile and web free-agent display, card-action, and team-management navigation paths.
- [x] (2026-02-21 03:05Z) Implemented mobile navigation contract and Team Management suggestion plumbing (`AppConfig.Teams`, `INavigationHandler`, `RootComponent`, DI, TeamManagement flows).
- [x] (2026-02-21 03:12Z) Implemented mobile event participants free-agent list with clickable user cards and `Invite to Team` action routing.
- [x] (2026-02-21 03:24Z) Implemented web free-agent user-card action modal in event detail and redirect to `/teams?event=...&freeAgent=...`.
- [x] (2026-02-21 03:31Z) Implemented web team-management free-agent suggestion banner and Team Detail modal highlighted suggested invite target.
- [ ] Run focused validation for changed mobile/web surfaces and record results (completed: web route tests + web TypeScript check + mobile metadata compile; remaining: Android `compileDebugKotlinAndroid` hangs in this WSL environment and did not produce a final pass/fail result).

## Surprises & Discoveries

- Observation: Mobile team-signup participants view currently renders team cards but not a detailed free-agent list in the participants tab.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/ParticipantsVeiw.kt`.
- Observation: Mobile Team Management already accepts event free-agent IDs and surfaces them in `SearchPlayerDialog` when inviting players.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/teamManagement/TeamManagementComponent.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/SearchPlayerDialog.kt`.
- Observation: Web Team Detail modal already merges event free agents into invite candidate lists, so only a direct event free-agent user-card action + targeted highlighting path is missing.
  Evidence: `src/components/ui/TeamDetailModal.tsx`.
- Observation: `:composeApp:compileDebugKotlinAndroid` repeatedly stalls after entering Kotlin Android compile in this WSL setup, even when dependency/resource tasks complete.
  Evidence: multiple runs remained at `> Task :composeApp:compileDebugKotlinAndroid` with no terminal completion until process termination.

## Decision Log

- Decision: Extend existing `navigateToTeams` payloads to carry an optional selected free-agent ID instead of inventing a new screen.
  Rationale: The existing Team Management screen already supports event free-agent suggestion data; adding one optional target ID keeps behavior centralized and avoids duplicate UI.
  Date/Author: 2026-02-21 / Codex.
- Decision: Reuse current player-card popup patterns and add an explicit optional invite action, instead of creating a separate free-agent card component family.
  Rationale: Maintains consistent interaction model and minimizes UI divergence.
  Date/Author: 2026-02-21 / Codex.
- Decision: Keep free-agent suggestion state query-driven on web (`freeAgent` query param) and non-blocking when missing/invalid.
  Rationale: Allows deep-linking from event free-agent list while preserving existing team-management behavior for all other entry paths.
  Date/Author: 2026-02-21 / Codex.

## Outcomes & Retrospective

Cross-platform behavior is now implemented:

- Mobile now routes invite actions from event free-agent user cards into Team Management with a selected free-agent suggestion.
- Web now supports clicking free-agent user cards, choosing `Invite to Team`, and landing in Team Management with the same free agent highlighted for invite.

Validation is partially complete. Web tests and type-check passed. Mobile metadata compile passed, but Android debug Kotlin compile did not finish in this environment due repeated task stalling.

## Context and Orientation

This work spans:

- Mobile repo: `/mnt/c/Users/samue/StudioProjects/mvp-app`.
- Web/backend source of truth repo: `/home/camka/Projects/MVP/mvp-site`.

On mobile, event detail and participants interaction live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail`. Team Management routing is configured through `AppConfig.Teams`, `INavigationHandler.navigateToTeams`, `RootComponent`, and the DI factory in `composeApp/src/commonMain/kotlin/com/razumly/mvp/di/ComponentModule.kt`.

On web, event free-agent list UI is rendered by `src/app/discover/components/EventDetailSheet.tsx`, while team invite suggestion logic exists inside `src/components/ui/TeamDetailModal.tsx` and route entry is `src/app/teams/page.tsx`.

## Plan of Work

First, extend the mobile navigation contract so `navigateToTeams` can optionally include a focused free-agent ID. Thread that through app config and Team Management component initialization, and keep free-agent suggestion ordering stable so the focused user appears first.

Second, update mobile event participant/free-agent UI to show clickable user cards for free agents in team-signup events and add an `Invite to Team` action in the player action popup. That action must route to Team Management with event free-agent context and selected user ID.

Third, update web free-agent dropdown cards in event detail so clicking a card opens an action modal with `Invite to Team`. Redirect to `/teams` with event and free-agent query parameters.

Fourth, update web Team Management and Team Detail modal to detect the `freeAgent` query target and surface a highlighted suggestion row with a direct invite button, while preserving existing event free-agent invite behavior.

## Concrete Steps

From `/mnt/c/Users/samue/StudioProjects/mvp-app`:

1. Update `AppConfig.Teams`, `INavigationHandler`, `RootComponent`, and DI factory to carry optional selected free-agent ID.
2. Update `TeamManagementComponent`/`TeamManagementScreen` to expose and surface selected free-agent suggestion.
3. Update `PlayerCardWithActions` and `ParticipantsVeiw.kt` to add invite-to-team action on free-agent cards and route via `EventDetailComponent`.

From `/home/camka/Projects/MVP/mvp-site`:

1. Update `EventDetailSheet.tsx` free-agent dropdown to use clickable user cards with an action modal.
2. Update `/teams` page query handling to read `freeAgent` and pass highlight data into `TeamDetailModal`.
3. Update `TeamDetailModal.tsx` invite section to emphasize and invite the selected free-agent target.

## Validation and Acceptance

- Mobile:
  - Run targeted Kotlin compile/tests for changed UI/presentation modules.
  - In app flow, open a team-signup event with free agents, tap a free-agent card, select `Invite to Team`, and verify Team Management opens with that user highlighted in invite candidates.
- Web:
  - Run lint/type-check or focused tests for changed files.
  - In browser flow, open event free agents list, click a user card, choose `Invite to Team`, confirm `/teams?event=...&freeAgent=...` navigation and highlighted invite suggestion appears.

## Idempotence and Recovery

All changes are additive UI/flow wiring. If any navigation payload mismatch appears, revert only the new optional selected free-agent argument and keep existing free-agent list behavior intact. Query-param-driven behavior on web is optional and should no-op when params are missing.

## Artifacts and Notes

- Web tests:
  - `cd /home/camka/Projects/MVP/mvp-site && npm test -- --runInBand src/app/api/events/__tests__/freeAgentsRoute.test.ts src/app/api/events/__tests__/waitlistRoute.test.ts`
  - Result: `PASS` for both suites (13 tests total).
- Web types:
  - `cd /home/camka/Projects/MVP/mvp-site && npx tsc -p tsconfig.json --noEmit`
  - Result: command exited successfully with no type errors.
- Mobile metadata compile:
  - `cd /mnt/c/Users/samue/StudioProjects/mvp-app && ./gradlew :composeApp:compileKotlinMetadata`
  - Result: `BUILD SUCCESSFUL`.
- Mobile Android compile attempt:
  - `./gradlew --no-daemon :composeApp:compileDebugKotlinAndroid`
  - Result: task progressed to `:composeApp:compileDebugKotlinAndroid` then stalled without terminal completion in this WSL environment.

## Interfaces and Dependencies

- Mobile interface change:
  - `INavigationHandler.navigateToTeams(freeAgents: List<String>, event: Event?, selectedFreeAgentId: String? = null)`.
  - `AppConfig.Teams` to include `selectedFreeAgentId`.
- Mobile UI extension:
  - `PlayerCardWithActions` optional `Invite to Team` callback.
- Web routing/query:
  - `/teams` reads `event` and `freeAgent` query params.
- Web UI:
  - Event free-agent card action modal in `EventDetailSheet.tsx`.
  - Highlighted invite suggestion in `TeamDetailModal.tsx`.

Change log:
- 2026-02-21: Created initial ExecPlan after auditing existing cross-platform free-agent and team-management flows.
- 2026-02-21: Updated progress, decisions, and validation outcomes after implementing mobile and web invite-to-team free-agent card flows.
