# Cross-Stack Match Rules, Segments, Incidents, and Match Operations Refactor

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, officials and hosts can run a match from one operational view instead of editing raw score arrays. Scores are represented as match segments, match history is represented as incidents, and the UI shows the full operational state of the match: lifecycle, rules, segment scores, officials, check-ins, field location, and incident timeline. A user can verify the feature by opening a match on web or mobile, toggling `Match Details` next to `View Field Location`, switching segments, checking in as an assigned official, updating score, and adding an incident.

This work spans `mvp-site`, which is the backend and web source of truth, and `mvp-app`, which is the Kotlin Multiplatform client. The backend contract must be implemented first, then mirrored in the mobile DTOs and Room cache.

## Progress

- [x] (2026-04-16 00:35Z) Re-read `PLANS.md` and confirmed this complex cross-stack refactor must use a living ExecPlan.
- [x] (2026-04-16 00:40Z) Audited current backend schema and found `Matches.team1Points`, `Matches.team2Points`, and `Matches.setResults` are still persisted directly on `Matches`.
- [x] (2026-04-16 00:45Z) Audited web score surfaces and found `ScoreUpdateModal` already has the `View Field Location` row where the new `Match Details` toggle belongs.
- [x] (2026-04-16 00:50Z) Audited mobile match detail and found its bottom action bar has `View Field Location`, while scoring state is still driven by `currentSet`, `team1Points`, `team2Points`, and `setResults`.
- [x] (2026-04-16 00:55Z) Revised this ExecPlan from the earlier compatibility design to the approved coordinated-removal design.
- [x] (2026-04-16 07:20Z) Added backend Prisma fields, models, and migration SQL for rules, lifecycle, segments, and incidents.
- [x] (2026-04-16 07:45Z) Added backend TypeScript contracts and rules-resolution helpers.
- [x] (2026-04-16 08:20Z) Updated backend event/match repositories and match routes to load and write segments/incidents while keeping compatibility projections where existing flows still need them.
- [x] (2026-04-16 09:05Z) Replaced web score-array modal behavior with match operations behavior and kept schedule/admin edits in `MatchEditModal`.
- [x] (2026-04-16 09:45Z) Mirrored backend match contracts in mobile DTOs, Room models, repositories, and match detail UI.
- [x] (2026-04-16 10:25Z) Ran targeted backend and mobile validation and recorded outputs here.

## Surprises & Discoveries

- Observation: Web already has the field-location expansion in `ScoreUpdateModal`.
  Evidence: `mvp-site/src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx` renders `View Field Location`, `Open in Maps`, and an iframe map preview.

- Observation: Web has two separate match surfaces that should not be merged. `ScoreUpdateModal` is the live operations surface, while `MatchEditModal` is the schedule/admin setup surface.
  Evidence: `ScoreUpdateModal.tsx` owns score entry and field location. `MatchEditModal.tsx` owns teams, field, start/end, bracket links, and official assignments.

- Observation: Mobile already has a bottom action surface that can hold both `View Field Location` and `Match Details`.
  Evidence: `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailScreen.kt` renders a bottom `Surface` containing the field-location button.

- Observation: Mobile Room cache currently serializes score arrays directly on `MatchMVP`.
  Evidence: `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MatchMVP.kt` has `team1Points`, `team2Points`, and `setResults`.

- Observation: `npx tsc --noEmit` initially failed on a malformed generated Next validator under `.next/dev/types/validator.ts`.
  Evidence: the file contained a truncated route validation block. Removing the generated cache file and rerunning `npx tsc --noEmit` passed.

## Decision Log

- Decision: Remove `team1Points`, `team2Points`, and `setResults` from runtime contracts in this coordinated release.
  Rationale: The user chose a coordinated backend/web/mobile release and wants `MatchSegments` plus optional `MatchIncidents` to replace score arrays rather than preserving them as the runtime API.
  Date/Author: 2026-04-16 / Codex

- Decision: Do not store `segmentType` on `MatchSegment`.
  Rationale: All segments in a match derive their meaning from the resolved rules. A row only needs `sequence`; UI labels such as "Set 1" or "Period 1" are derived from rules.
  Date/Author: 2026-04-16 / Codex

- Decision: Treat `MatchSegments` as the authoritative scoreboard/result projection and `MatchIncidents` as the operational log.
  Rationale: Brackets, standings, and UI need fast current state, while incidents explain how that state changed when incident capture is enabled.
  Date/Author: 2026-04-16 / Codex

- Decision: Use hybrid scoring history based on `Events.autoCreatePointMatchIncidents`.
  Rationale: The user chose hybrid behavior. When the toggle is on, point deltas create incidents; when off, segment scores can update directly.
  Date/Author: 2026-04-16 / Codex

- Decision: Keep `Sports.usePointsFor*` booleans and `Matches.side`.
  Rationale: The booleans still drive league scoring config visibility, and `side` is bracket-placement metadata used by advancement logic.
  Date/Author: 2026-04-16 / Codex

## Outcomes & Retrospective

The cross-stack refactor is implemented in the backend/web project and mirrored in the KMP client. Backend schema and migration SQL add rule config, lifecycle/result fields, `MatchSegments`, and `MatchIncidents`. Match responses now include resolved rules, segments, incidents, lifecycle/result state, and winner projection. The atomic match PATCH route accepts lifecycle, segment, incident, and official check-in operations and freezes `matchRulesSnapshot` on the first operational write.

The web schedule score modal is now the match operations modal with `View Field Location` and `Match Details` side by side, a segment selector, score controls, lifecycle/rules/officials/incidents display, and incident creation. `MatchEditModal` no longer exposes the old score-array editor.

The mobile match detail screen now mirrors the same operational concepts, including the bottom `Match Details` action, segment-based scoring state, lifecycle/rules/officials/incidents display, and Room-compatible segment/incident fields. `MVP_DATABASE_VERSION` was incremented to 12 and the available Room schema copy task completed.

## Context and Orientation

`mvp-site` lives at `C:\Users\samue\Documents\Code\mvp-site` on this Windows machine. It contains the Prisma schema in `prisma/schema.prisma`, TypeScript public contracts in `src/types/index.ts`, backend event/match repository mapping in `src/server/repositories/events.ts`, atomic match routes under `src/app/api/events/[eventId]/matches`, web schedule UI under `src/app/events/[id]/schedule`, and client service calls in `src/lib/tournamentService.ts`.

`mvp-app` lives at `C:\Users\samue\StudioProjects\mvp-app`. It contains shared Kotlin models in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes`, backend DTOs in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto`, Room setup in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/db/MVPDatabaseService.kt`, match repository calls in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt`, and the match detail UI in `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail`.

In this plan, a "segment" is one scoring unit in a match. For volleyball it is a set; for soccer it may be a period or half; for baseball it may be an inning; for a simple points-only match it is a single total segment. A segment row stores sequence and scores, not its type. The resolved rules define what the sequence means.

In this plan, an "incident" is a structured match event such as a scoring action, card, penalty, or administrative note. Incidents can optionally point at the segment, event team, event registration, participant user, and official user involved.

## Plan of Work

Start in `mvp-site`. Add JSON-backed rule fields to `Sports` and `Events`, lifecycle/result fields to `Matches`, and new `MatchSegments` and `MatchIncidents` models. Add a Prisma migration that backfills existing score arrays into segment rows before dropping or no longer selecting the old runtime fields. The migration must map `setResults[i] === 1` to `team1Id` and `setResults[i] === 2` to `team2Id` as the segment `winnerEventTeamId`.

Add TypeScript types for `ResolvedMatchRules`, `MatchSegment`, `MatchIncident`, lifecycle values, segment operations, incident operations, and official check-in operations in `src/types/index.ts`. Add a rules helper that resolves `sport.matchRulesTemplate` and `event.matchRulesOverride`, applies defaults, and freezes a match snapshot on the first segment or incident write.

Update `src/server/repositories/events.ts` and the match API routes so match responses include lifecycle fields, `winnerEventTeamId`, resolved rules, `segments`, and `incidents`. Match update requests must accept `lifecycle`, `segmentOperations`, `incidentOperations`, and `officialCheckIn`. Score changes must update `MatchSegments`; if `Events.autoCreatePointMatchIncidents` is true, the same transaction must also create a scoring incident.

Update web `ScoreUpdateModal` into the match operations modal. Keep the field-location row and add a `Match Details` button next to `View Field Location`. The expanded panel must show lifecycle, rules, teams, field/time, bracket links, segment score table, officials/check-in state, and incidents. Segment switching must use labels derived from rules. Move old score-array editing out of `MatchEditModal` so that modal stays focused on teams, field, time, bracket links, and official assignments.

Mirror the same contract in `mvp-app`. Replace `MatchMVP` score arrays with segment and incident collections plus lifecycle/result fields. Increment `MVP_DATABASE_VERSION`, update converters if needed, regenerate the Room schema, and update repository payloads. Replace `currentSet` and array-based scoring in `MatchContentComponent` with selected segment state and operation calls. Add a `Match Details` button beside `View Field Location` in `MatchDetailScreen`.

## Concrete Steps

Run commands from `C:\Users\samue\Documents\Code\mvp-site` for backend and web work:

    npm test -- --runTestsByPath "src/app/events/[id]/schedule/components/__tests__/ScoreUpdateModal.test.tsx"
    npm test -- --runTestsByPath "src/lib/__tests__/tournamentService.test.ts"
    npm test -- --runTestsByPath "src/app/api/events/[eventId]/matches/[matchId]/route.test.ts"

Run commands from `C:\Users\samue\StudioProjects\mvp-app` for mobile work:

    .\gradlew :composeApp:testDebugUnitTest
    .\gradlew :composeApp:roomGenerateSchema
    .\gradlew :composeApp:compileDebugKotlinAndroid

When Prisma migration generation is available, run from `mvp-site`:

    npx prisma migrate dev --name match_segments_incidents_operations

If the local database is not available, create the migration SQL manually under `mvp-site/prisma/migrations/<timestamp>_match_segments_incidents_operations/migration.sql` and validate it through tests that mock Prisma.

## Validation and Acceptance

Acceptance is met when opening a match on web shows `View Field Location` and `Match Details` side by side, expanding `Match Details` shows lifecycle, rules, segments, officials, and incidents, and changing score updates a segment. With `autoCreatePointMatchIncidents` on, the score action creates an incident before committing the point. With the toggle off, the score action updates only the segment.

Acceptance is met on mobile when opening the match detail screen shows the same two bottom actions, the details panel renders segment scores and incidents, segment switching changes the active scoring segment, and official check-in updates the correct assignment slot.

Backend acceptance is met when a match response no longer needs score arrays and instead returns lifecycle fields, `winnerEventTeamId`, resolved rules, `segments`, and `incidents`; bracket advancement uses `winnerEventTeamId`; and existing schedule/bracket loads work when segments and incidents are empty.

## Idempotence and Recovery

Schema migration must be safe to run once on a database that has legacy match arrays. Backfill should create segment rows only when they do not already exist for a match/sequence. If a migration fails before dropping old columns, it can be rerun after deleting partial segment rows for the affected migration. If a code step breaks either stack, keep the new additive models and repair mappers before removing any compatibility parsing.

Room schema changes in `mvp-app` require incrementing `MVP_DATABASE_VERSION` exactly once for this refactor and regenerating schema JSON. If generation fails, do not lower the version; fix the entity/converter mismatch and regenerate.

## Artifacts and Notes

Artifacts will be recorded here as implementation progresses, including the Prisma migration path, focused Jest output, Gradle output, and any short request/response examples that prove segments and incidents round-trip.

- Prisma migration: `C:\Users\samue\Documents\Code\mvp-site\prisma\migrations\20260416003000_match_segments_incidents_operations\migration.sql`
- Backend validation: `npx tsc --noEmit` from `C:\Users\samue\Documents\Code\mvp-site` passed after removing the stale generated `.next/dev/types/validator.ts` cache file.
- Mobile validation: `.\gradlew :composeApp:compileDebugKotlinAndroid --no-daemon` from `C:\Users\samue\StudioProjects\mvp-app` passed.
- Room schema validation: `.\gradlew :composeApp:roomGenerateSchema --no-daemon` is not available in this repo; `.\gradlew :composeApp:copyRoomSchemas --no-daemon` passed instead.

## Interfaces and Dependencies

At completion, `mvp-site/src/types/index.ts` must define `ResolvedMatchRules`, `MatchSegment`, `MatchIncident`, lifecycle/result string unions, and operation payload types for lifecycle, segment, incident, and official check-in changes.

At completion, `mvp-site/prisma/schema.prisma` must expose JSON rule fields on `Sports` and `Events`, lifecycle/result fields on `Matches`, and relational `MatchSegments` and `MatchIncidents` models. `MatchSegments` must not include `segmentType`.

At completion, `mvp-app` must have serializable Kotlin equivalents for the same match fields, segments, incidents, and operation payloads. The mobile DTOs must mirror backend names.

Revision note (2026-04-16 / Codex): Replaced the earlier compatibility-first plan with the approved coordinated removal of legacy score arrays, removed `segmentType` from `MatchSegment`, and added explicit web/mobile operations-panel requirements.
