# Cross-Stack Match Rules, Incidents, and Match Operations Refactor

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, matches in both `mvp-site` and `mvp-app` will support richer sport-aware match operations instead of only basic score arrays and official check-in. Hosts will be able to configure match rules per sport and override them per event, officials will be able to record structured match incidents such as goals while updating scores, and readonly match views will show clearer match state, segment-by-segment scoring, official crew context, and incident history.

This plan intentionally covers only the match, sport, and event refactor needed to unlock those features. The planned redesign of teams, team registrations, player jersey numbers, and roster membership is a separate follow-up plan and must not be mixed into this implementation beyond the minimum compatibility needed to keep current match editing working.

## Progress

- [x] (2026-04-15 14:05Z) Audited current Prisma models for `Sports`, `Events`, `Matches`, `Teams`, `UserData`, and `EventOfficials` in `mvp-site`.
- [x] (2026-04-15 14:05Z) Audited current web/mobile match editing and score update surfaces in `mvp-site` and `mvp-app`.
- [x] (2026-04-15 14:05Z) Confirmed that `Sports.usePointsFor*` flags are still required for league scoring configuration filtering and current set-based heuristics.
- [x] (2026-04-15 14:05Z) Confirmed that `Matches.side` is an active bracket-placement concept and already feeds scheduler advancement logic.
- [x] (2026-04-15 14:25Z) Saved this cross-stack ExecPlan for match rules, incidents, and match operations.
- [ ] Define the new persisted rule models and compatibility fields in `mvp-site` Prisma schema and shared TypeScript types.
- [ ] Add backend persistence, API contract, and rules-resolution logic for sport defaults, event overrides, and per-match snapshots.
- [ ] Add incident capture and score-to-incident automation on web and mobile match update flows.
- [ ] Upgrade readonly and edit match UIs on web and mobile to surface lifecycle state, resolved rules, segments, officials, and incidents.
- [ ] Run targeted backend, web, and mobile validation suites and update this plan with final outcomes.

## Surprises & Discoveries

- Observation: the `Sports.usePointsFor*` and related booleans are not dead schema; they are actively used to decide which league scoring fields appear in the web form.
  Evidence: `src/app/discover/components/LeagueScoringConfigPanel.tsx` uses `FLAG_MAP` and `shouldShowField()` to gate the numeric scoring inputs.

- Observation: `usePointsPerSetWin` is also being used as a proxy for "this sport uses sets" in current web event and tournament editors.
  Evidence: `src/app/discover/components/LeagueFields.tsx`, `src/app/discover/components/TournamentFields.tsx`, and `src/app/events/[id]/schedule/components/EventForm.tsx` all derive `requiresSets` from `sport?.usePointsPerSetWin`.

- Observation: `Matches.side` is not merely a rendering hint; it is part of bracket advancement semantics and is already normalized to `LEFT`/`RIGHT` in scheduler code.
  Evidence: `src/server/scheduler/types.ts` defines `sideFrom()` and `Match.advanceTeams()` places advancing teams based on `this.side`.

- Observation: official assignment is already in a half-migrated state. Event staff is normalized in `EventOfficials`, while per-match crew is still stored as JSON on `Matches.officialIds`.
  Evidence: `prisma/schema.prisma` stores `EventOfficials` as rows but keeps `Matches.officialIds` as `Json?`.

- Observation: the current mobile and web match score surfaces assume score changes can be applied immediately without collecting extra context first.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt` updates scores directly, and `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx` edits points without an incident capture step.

## Decision Log

- Decision: keep the existing `Sports.usePointsFor*`, tiebreak, and overtime-related booleans in this implementation.
  Rationale: they are still the source of truth for league scoring configuration visibility and some existing event form heuristics; removing them would expand the migration surface unnecessarily.
  Date/Author: 2026-04-15 / Codex

- Decision: stop treating the `usePointsFor*` booleans as the primary source of truth for match operations.
  Rationale: standings configuration and match operations are related but separate concerns. A sport can be set-based for match play without that being encoded only through standings flags.
  Date/Author: 2026-04-15 / Codex

- Decision: keep `Matches.side`, but constrain it more tightly and preserve its bracket-only meaning.
  Rationale: scheduler and bracket code already rely on `LEFT`/`RIGHT` placement. Future concepts such as `home/away` or `top/bottom` must use different fields rather than overloading `side`.
  Date/Author: 2026-04-15 / Codex

- Decision: implement rules as a three-level model: sport template, event override, and per-match snapshot.
  Rationale: sports provide defaults, events need local overrides, and completed matches must preserve the exact rules that were in force when they were played.
  Date/Author: 2026-04-15 / Codex

- Decision: implement incidents as first-class persisted records instead of trying to encode them inside points arrays or free-text notes.
  Rationale: readonly match views, official reporting, and later analytics all need structured incident data tied to teams, players, officials, and match time.
  Date/Author: 2026-04-15 / Codex

- Decision: keep current score arrays as compatibility fields during the first implementation, while introducing richer match segment and incident models alongside them.
  Rationale: bracket logic, existing DTOs, and mobile/web screens already expect `team1Points`, `team2Points`, and `setResults`. Replacing them immediately would make the migration riskier than necessary.
  Date/Author: 2026-04-15 / Codex

- Decision: treat the team membership and registration redesign as explicitly out of scope for this plan.
  Rationale: the user requested that the current match plan be saved first, and the team redesign will require its own schema, UI, and migration work.
  Date/Author: 2026-04-15 / Codex

## Outcomes & Retrospective

Initial planning only.

This plan now captures the intended match refactor scope, the current constraints discovered in code, and the implementation sequence required to keep the work incremental and cross-stack safe. No code changes have been made yet from this plan. The next major outcome to record here will be after the backend model and API foundation has been implemented.

## Context and Orientation

This work spans two repositories in the same product:

- `mvp-site` is the backend and web source of truth for event, sport, team, and match persistence.
- `mvp-app` is the Kotlin Multiplatform mobile client that consumes those contracts and exposes mobile match detail and match editing surfaces.

In the current backend schema, `Matches` in `mvp-site/prisma/schema.prisma` stores match scheduling, bracket links, seeds, a simple official model, and score arrays. `Sports` stores many booleans that describe which league scoring settings matter. `Events` stores sport-level and event-level scheduling and officiating settings. `EventOfficials` is already a normalized event staffing table, but `Matches.officialIds` is still stored as JSON.

In the current web application, the primary match edit and score update surfaces live in:

- `mvp-site/src/app/events/[id]/schedule/components/MatchEditModal.tsx`
- `mvp-site/src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx`
- `mvp-site/src/app/events/[id]/schedule/components/MatchCard.tsx`
- `mvp-site/src/app/events/[id]/schedule/page.tsx`

In the current mobile application, the primary match edit and score update surfaces live in:

- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt`
- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailScreen.kt`
- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/MatchEditDialog.kt`
- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/MatchDtos.kt`

The term "match rules" in this plan means the persisted description of how a match should be operated. That includes the scoring model (for example sets, periods, or innings), whether a draw is allowed, how overtime or shootout phases work, what official roles are expected, whether incidents should be recorded automatically when points are added, and which incident types are supported. Match rules are not the same thing as league standings configuration.

The term "rules snapshot" means a copy of the fully resolved rules for a single match. A snapshot is stored on the match so that later event or sport edits do not silently reinterpret the historical record for matches that were already played or partially played.

The term "incident" means a structured match event such as a goal, card, substitution, injury, penalty, timeout, or delay. An incident belongs to a match and can optionally point at a segment, team, player, official, and note text.

## Plan of Work

The implementation will proceed in five milestones. Each milestone is independently verifiable and leaves the system in a working state.

### Milestone 1: Persist sport rules, event overrides, and match snapshots

At the end of this milestone, sports and events will be able to express match-operation rules without overloading the standings flags, and matches will store a resolved snapshot of those rules. Existing screens will still work because legacy score arrays and current official assignment shapes will remain in place during the migration.

In `mvp-site/prisma/schema.prisma`, add new JSON-backed fields that are small enough to evolve without forcing a large relational explosion in the first pass:

- `Sports.matchRulesTemplate Json?`
- `Events.matchRulesOverride Json?`
- `Events.autoCreatePointMatchIncidents Boolean? @default(false)`
- `Matches.matchRulesSnapshot Json?`
- `Matches.status String?`
- `Matches.resultStatus String?`
- `Matches.resultType String?`
- `Matches.actualStart DateTime?`
- `Matches.actualEnd DateTime?`
- `Matches.statusReason String?`

Keep `Sports.usePointsFor*`, `Events.officialPositions`, `Matches.side`, `Matches.team1Points`, `Matches.team2Points`, and `Matches.setResults` intact in this milestone.

In `mvp-site/src/types/index.ts`, define explicit interfaces for:

- `SportMatchRulesTemplate`
- `EventMatchRulesOverride`
- `ResolvedMatchRules`
- `MatchLifecycleStatus`
- `MatchResultStatus`
- `MatchResultType`

These types must define, at minimum:

- `scoringModel`: one of `SETS`, `PERIODS`, `INNINGS`, `POINTS_ONLY`
- `segmentType`: one of `SET`, `HALF`, `QUARTER`, `PERIOD`, `INNING`, `OVERTIME`, `SHOOTOUT`
- `segmentCount`
- `supportsDraw`
- `supportsOvertime`
- `supportsShootout`
- `officialRoles`
- `supportedIncidentTypes`
- `autoCreatePointIncidentType`
- `pointIncidentRequiresParticipant`

Add rules-resolution helpers in `mvp-site/src/lib` or `mvp-site/src/server/repositories` that resolve sport template + event override into a final `ResolvedMatchRules`, then stamp that snapshot on each match when matches are created or updated through the event match routes.

Validation for this milestone is complete when web and mobile can still load existing events and matches, and newly created or updated matches return a populated `matchRulesSnapshot` without breaking existing score-entry behavior.

### Milestone 2: Persist match segments and incidents alongside legacy score arrays

At the end of this milestone, the system will be able to persist richer score progression and incident history without yet requiring every screen to render the full new model.

Add new Prisma models in `mvp-site/prisma/schema.prisma`:

- `MatchSegments`
- `MatchIncidents`

`MatchSegments` must contain:

- `id`
- `matchId`
- `order`
- `segmentType`
- `label`
- `team1Score`
- `team2Score`
- `winner`
- `startedAt`
- `endedAt`
- `isComplete`

`MatchIncidents` must contain:

- `id`
- `matchId`
- `segmentId`
- `incidentType`
- `teamId`
- `participantUserId`
- `officialUserId`
- `linkedPointDelta Int?`
- `minute Int?`
- `sequence Int`
- `note String?`
- `createdAt`
- `updatedAt`

Keep the existing score arrays on `Matches` as compatibility fields. The backend must write both:

- segments and incidents as the richer source of truth for new screens
- arrays and set results as compatibility outputs for existing scheduler and bracket code

In `mvp-site/src/app/api/events/[eventId]/matches/route.ts` and `.../[matchId]/route.ts`, extend the match update payload so callers can send:

- segment updates
- incident creates, edits, and deletes
- lifecycle status changes

In `mvp-site/src/server/repositories/events.ts`, load segments and incidents when hydrating matches for event detail and schedule pages.

Validation for this milestone is complete when a match can be updated through the route layer with segment and incident data, the new rows persist, and the legacy arrays still reflect the same score state.

### Milestone 3: Web match-edit and readonly upgrade

At the end of this milestone, web hosts and officials will see resolved match rules, lifecycle state, segment scoring, official context, and incident history in the schedule and match edit surfaces.

Update these files in `mvp-site`:

- `src/app/events/[id]/schedule/components/MatchEditModal.tsx`
- `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx`
- `src/app/events/[id]/schedule/components/MatchCard.tsx`
- `src/app/events/[id]/schedule/page.tsx`
- any event settings panels that currently derive set mode only from `sport.usePointsPerSetWin`

The event settings flow must expose:

- event-level rules override editor
- event-level toggle for `autoCreatePointMatchIncidents`

The match edit flow must expose:

- lifecycle status and reason
- actual start and actual end
- resolved rule summary
- segment editor
- incident timeline

The score update modal must change behavior when `autoCreatePointMatchIncidents` is enabled and the resolved rules declare a point incident type. When an official increments score in that mode, the UI must open a compact incident capture prompt before finalizing the change. That prompt must let the official select the incident inputs required by the rules, such as team, scorer, assisting player if later supported, or note text. If the rules say participant selection is not required, the prompt can prefill or skip that field.

The current flow must remain fast when the toggle is disabled. In that case, score increments continue to behave as they do today.

Validation for this milestone is complete when a host can enable the toggle for an event, an official can increment score and capture a goal incident in the web UI, and the readonly match card or detail surface shows the incident history.

### Milestone 4: Mobile match-detail and match-edit upgrade

At the end of this milestone, the Kotlin Multiplatform mobile app will expose the same rules-aware match operations on mobile.

Update these files in `mvp-app`:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MatchMVP.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/MatchDtos.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailScreen.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/MatchEditDialog.kt`

The shared models must gain the same new match-rule, lifecycle, segment, and incident types introduced on the backend. Room schema and migrations must be updated if new persisted local fields are cached.

The mobile score flow must mirror web behavior:

- if event point-incident automation is off, score entry stays direct
- if it is on, score increment opens a compact incident capture step before the point is committed

Readonly mobile match detail must show:

- match lifecycle status
- resolved rules summary
- segment-by-segment score
- official crew summary
- incident timeline

Validation for this milestone is complete when mobile can sync the new fields, officials can create point-linked incidents during scoring, and readonly mobile match detail renders the incident list for the same match data returned by the backend.

### Milestone 5: Compatibility cleanup and migration hardening

At the end of this milestone, the new rules and incidents system is the preferred path, while legacy fields remain only as compatibility layers where still needed.

Add explicit migration and fallback rules in both repositories so that:

- old sports without `matchRulesTemplate` get inferred defaults from current flags
- old events without `matchRulesOverride` continue using sport defaults
- old matches without a snapshot receive a resolved snapshot on first save
- old matches without segment rows can still render from arrays until touched

Do not remove `Sports.usePointsFor*` or `Matches.side` in this milestone. Do not remove legacy score arrays until the team and roster redesign is complete and the new match flow has been proven stable across both stacks.

Validation for this milestone is complete when existing production-like seeded data can be loaded and edited without manual repairs, and new matches use the richer model end to end.

## Concrete Steps

Run these commands from the named working directories as the work proceeds.

From `/Users/elesesy/StudioProjects/mvp-site`:

1. Edit `prisma/schema.prisma` and create a Prisma migration for the new match rules, lifecycle, segments, and incidents fields.
2. Update `src/types/index.ts`, repository mappers, and event match API routes.
3. Add targeted Jest coverage for repository mapping, API route validation, and score-to-incident automation.

Expected commands:

    npx prisma migrate dev --name match_rules_and_incidents
    npm test -- --runTestsByPath "src/app/api/events/[eventId]/matches/[matchId]/route.test.ts"
    npm test -- --runTestsByPath "src/server/repositories/__tests__/events.upsert.test.ts"
    npm test -- --runTestsByPath "src/app/events/[id]/schedule/components/__tests__/ScoreUpdateModal.test.tsx"

From `/Users/elesesy/StudioProjects/mvp-app`:

1. Update shared Kotlin models, DTOs, repositories, and match detail/edit surfaces.
2. Add or update unit tests for DTO mapping and match scoring component behavior.

Expected commands:

    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.matchDetail.MatchContentComponentTest"
    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.network.dto.MatchDtosTest"
    ./gradlew :composeApp:compileDebugKotlinAndroid

## Validation and Acceptance

Acceptance is met when all of the following behaviors are demonstrably working:

1. A sport can define a structured match rules template without losing the existing league scoring configuration gating driven by `usePointsFor*`.
2. An event can override those rules and toggle automatic point-to-incident creation.
3. A match created or updated through the backend returns a `matchRulesSnapshot`, lifecycle status, segments, and incidents.
4. The web match score flow prompts for incident details when the event toggle is on and directly updates score when it is off.
5. The mobile match score flow behaves the same way.
6. Readonly match views on both platforms show lifecycle status, resolved rule summary, segment scores, official context, and incident timeline.
7. Existing bracket placement still works because `side` remains `LEFT` or `RIGHT` and continues to drive advancement.
8. Existing league scoring configuration UI still filters fields based on the current `Sports.usePointsFor*` flags.

## Idempotence and Recovery

All schema changes in this plan must be additive first. Do not remove legacy fields during the first migration wave. Re-running the Prisma migration command is safe only when the migration name has not already been used locally; otherwise create a new migration name and keep the SQL additive.

If the new rules or segment loading breaks older events, disable the new UI surfaces behind "has data / has rules" guards while preserving the backend schema changes, then fix the mapper logic before re-enabling the surfaces. If mobile Room migrations fail, keep the schema bump and repair the migration SQL rather than rolling back the version number.

## Artifacts and Notes

This section must be updated during implementation with concise proof snippets such as:

- Prisma migration output that shows the new columns and tables were applied.
- Jest output for API route and schedule component tests.
- Gradle output for the targeted mobile tests.
- Short request/response examples showing `matchRulesSnapshot`, segment rows, and incidents in the returned payload.

## Interfaces and Dependencies

At the end of this plan, the following interfaces and persisted shapes must exist.

In `mvp-site/src/types/index.ts`, define:

    export interface ResolvedMatchRules { ... }
    export interface MatchSegment { ... }
    export interface MatchIncident { ... }

In `mvp-site/prisma/schema.prisma`, add fields for:

    Sports.matchRulesTemplate
    Events.matchRulesOverride
    Events.autoCreatePointMatchIncidents
    Matches.matchRulesSnapshot
    Matches.status
    Matches.resultStatus
    Matches.resultType
    Matches.actualStart
    Matches.actualEnd
    Matches.statusReason

and add models:

    MatchSegments
    MatchIncidents

In `mvp-app`, the shared match DTO and domain model layer must round-trip the same new fields and collections.

This plan depends on existing code in:

- `mvp-site/src/server/repositories/events.ts`
- `mvp-site/src/app/api/events/[eventId]/matches/route.ts`
- `mvp-site/src/app/api/events/[eventId]/matches/[matchId]/route.ts`
- `mvp-site/src/server/scheduler/types.ts`
- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt`

The team redesign that removes `playerIds`, `captainId`, `managerId`, `headCoachId`, and `coachIds` from `Teams` is a separate dependency plan and must be completed before any later phase that wants player-backed roster incidents or roster-driven lineup validation. For this match plan, all player selection flows must continue to work against the current team/player relationship until that follow-up lands.

Revision note (2026-04-15 / Codex): Initial plan created to capture the cross-stack match rules, lifecycle, and incident refactor while preserving current standings flags and bracket side semantics.
