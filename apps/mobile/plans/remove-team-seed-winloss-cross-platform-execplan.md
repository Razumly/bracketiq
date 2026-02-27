# Remove Team-Level Seed/Win/Loss Tracking Across Web And Mobile

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, teams are no longer modeled with persistent `seed`, `wins`, or `losses` fields in either web (`mvp-site`) or mobile (`mvp-app`) app contracts. User interfaces no longer show team win/loss totals or win-rate badges, and standings views no longer expose win/loss columns. Playoff slot ordering still works using match-level seed slots (`team1Seed`/`team2Seed`) so bracket rendering and scheduling stay intact.

## Progress

- [x] (2026-02-26 23:42Z) Committed and pushed pre-change checkpoints in both repositories (`mvp-app`, `mvp-site`) as requested.
- [x] (2026-02-26 23:42Z) Audited all `seed`/`wins`/`losses`/ratio references across web API, web UI, mobile models, and mobile UI.
- [ ] Remove team-level `seed`/`wins`/`losses` and win-rate references from `mvp-site` shared types, API mapping, and team service surfaces.
- [ ] Remove standings `wins`/`losses` columns from `mvp-site` API response types and schedule UI.
- [ ] Update `mvp-site` scheduler serialization/builders to avoid depending on persisted team seed/win/loss fields while preserving match slot seeding.
- [ ] Remove team-level `seed`/`wins`/`losses` from `mvp-app` data models, DTO/network mapping, repositories, and UI label fallbacks.
- [ ] Update/repair tests in both repositories for the removed fields and run focused verification commands.

## Surprises & Discoveries

- Observation: The web scheduler relies on team-level `seed`/`wins`/`losses` in several internals (`Brackets`, `EventBuilder`, `updateMatch`) even though most UI usage only needs match-level slot seeds and computed standings.
  Evidence: `mvp-site/src/server/scheduler/*.ts` references in audit output.

- Observation: Web and app repositories both had unrelated pre-existing local edits before this work.
  Evidence: `git status --porcelain` in both repositories before checkpoint commits.

## Decision Log

- Decision: Keep bracket slot seeds on matches (`team1Seed`, `team2Seed`, `teamRefereeSeed`) while removing team-level seed fields from shared/public team contracts.
  Rationale: Match-level slot seeds are required for bracket placement/visualization, while team-level seeds are the unwanted persistent state.
  Date/Author: 2026-02-26 / Codex

- Decision: Remove win/loss ratio and team win/loss displays from both web and mobile UI, and remove wins/losses from standings response contracts for cross-platform consistency.
  Rationale: User request explicitly asked to remove references to team win/loss tracking and related ratios.
  Date/Author: 2026-02-26 / Codex

## Outcomes & Retrospective

Pending implementation.

## Context and Orientation

This change spans two repositories:

- Mobile app repo (current workspace): `mvp-app` under `/Users/elesesy/StudioProjects/mvp-app`
- Web/API source-of-truth repo: `mvp-site` under `/Users/elesesy/StudioProjects/mvp-site`

Key web files:

- `src/types/index.ts` (`Team` contract, win-rate helper)
- `src/lib/teamService.ts`, `src/lib/eventService.ts`, `src/lib/tournamentService.ts`
- `src/app/api/teams/route.ts`, `src/app/api/teams/[id]/route.ts`
- `src/app/api/events/[eventId]/standings/shared.ts`
- `src/app/events/[id]/schedule/page.tsx`
- `src/components/ui/TeamCard.tsx`, `src/components/ui/TeamDetailModal.tsx`
- `src/server/scheduler/*` (runtime event/team/match scheduling and serialization)

Key mobile files:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Team.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/TeamDTO.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/TeamDtos.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/StandingsDtos.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/util/TeamDisplayLabel.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`

## Plan of Work

First, update `mvp-site` contracts and API mapping so teams no longer carry `seed`/`wins`/`losses` and standings payloads no longer publish `wins`/`losses`. Then update web UI components and schedule standings table to remove win/loss and ratio presentation. Next, adjust scheduler code so match-level seed slots remain authoritative for playoff placement while team-level seed/win/loss persistence is no longer required. After web/API alignment is complete, apply the same contract/UI removals in `mvp-app` team models, DTO mapping, and standings rendering, including fallback labels that previously used `team.seed`.

## Concrete Steps

1. In `/Users/elesesy/StudioProjects/mvp-site`, edit shared types/services/routes/UI/scheduler files above to remove team-level `seed`/`wins`/`losses` and win-rate usage.
2. In `/Users/elesesy/StudioProjects/mvp-app`, edit team data model and network DTOs, then update repositories and UI composables to remove removed fields.
3. Update impacted tests in both repositories for new payload/model expectations.
4. Run focused test/build commands and record results in this plan.

## Validation and Acceptance

Acceptance criteria:

- Team create/update and team fetch APIs no longer require or emit `seed`/`wins`/`losses` as team-level fields.
- Web team cards/details no longer show wins/losses or win-rate.
- Web and mobile standings UI do not expose wins/losses columns.
- Mobile team fallback labels no longer depend on `seed`.
- Playoff bracket placement still renders using match slot seeds (`team1Seed`/`team2Seed`).

Validation commands to run:

- In `mvp-site`: run focused tests for teams/standings/schedule modules (to be filled with exact commands/results after execution).
- In `mvp-app`: run focused Kotlin unit tests covering team DTO/repository/event detail standings (to be filled with exact commands/results after execution).

## Idempotence and Recovery

Edits are source-only and safe to re-apply. If scheduler behavior regresses, rollback can be done file-by-file while retaining the contract/UI removal layers. Match-level seed fields remain available as the safe fallback path for playoff slot ordering.

## Artifacts and Notes

Initial checkpoint commits:

- `mvp-app`: `8856cb4` (`Chore: Checkpoint current workspace before standings refactor`)
- `mvp-site`: `73ab52c` (`Chore: Checkpoint current workspace before standings refactor`)

## Interfaces and Dependencies

No external libraries are introduced. This work updates existing TypeScript and Kotlin interfaces and keeps API compatibility focused on current `mvp-site` server routes and `mvp-app` HTTP DTOs.

Plan update note: Initial plan created after inventory and checkpoint pushes so implementation can proceed milestone-by-milestone with recorded decisions.
