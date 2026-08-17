# Team Membership and Event Team Snapshot Refactor

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository contains `PLANS.md` at `/Users/elesesy/StudioProjects/mvp-app/PLANS.md`. This plan must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, canonical teams and event teams will no longer be the same data record. Canonical teams will hold only team metadata plus canonical player/staff membership rows. Event participation will freeze a mutable event-owned snapshot that can be edited later without being overwritten by canonical team changes. Success is visible when joining an event either creates or claims an `EventTeam`, copies player/staff snapshots into event-scoped rows, and later canonical roster edits do not rewrite historical event rosters.

## Progress

- [x] (2026-04-15 21:02Z) Audited `mvp-site` and `mvp-app` touchpoints that currently treat `Teams` as both canonical and event-owned data.
- [x] (2026-04-15 21:08Z) Created this ExecPlan and recorded the compatibility approach for the refactor.
- [x] (2026-04-15 21:25Z) Implemented Prisma schema changes, generated client updates, and a migration that renames `VolleyBallTeams` to `EventTeams`, creates canonical team membership tables, and backfills canonical/event snapshot data.
- [x] (2026-04-15 21:43Z) Refactored canonical team APIs to write canonical team metadata plus normalized player/staff membership rows while preserving compatibility fields in responses.
- [x] (2026-04-15 21:58Z) Refactored event join/withdraw to claim placeholders, create/update `EventTeams`, freeze player/staff snapshots, and cancel event-scoped rows on withdraw instead of deleting history.
- [x] (2026-04-15 22:04Z) Updated compatibility-sensitive server paths (`teamChatSync`, invite acceptance, placeholder creation, event-delete placeholder detection) to understand the new split.
- [x] (2026-04-15 22:13Z) Ran `pnpm exec tsc --noEmit` plus focused Jest coverage for team routes and participant flows in `mvp-site`.
- [x] (2026-04-15 22:20Z) Added the new normalized team wire fields to the shared mobile DTO layer and verified `:composeApp:compileKotlinMetadata`.
- [x] (2026-04-15 22:42Z) Updated `mvp-app` persisted team model, Room converters, repositories, and key team/event UI surfaces to carry structured player/staff rows while still synchronizing legacy aliases for compatibility.
- [x] (2026-04-15 22:45Z) Updated the `mvp-site` schedule UI placeholder detection to honor explicit `kind == PLACEHOLDER` before any fallback heuristics.
- [x] (2026-04-15 22:47Z) Re-ran `./gradlew :composeApp:compileDebugKotlinAndroid` and `pnpm exec tsc --noEmit` to confirm the mobile and site changes compile cleanly.

## Surprises & Discoveries

- Observation: The current Prisma `Teams` model is mapped to the `VolleyBallTeams` table and is used heavily by event, match, billing, compliance, and profile flows as an event-facing team row rather than a purely canonical team.
  Evidence: `mvp-site/src/app/api/events/[eventId]/participants/route.ts`, `mvp-site/src/app/api/events/[eventId]/matches/route.ts`, `mvp-site/src/server/repositories/events.ts`, and many other routes read and mutate `prisma.teams` directly.
- Observation: `mvp-app` still consumes flat team membership fields (`playerIds`, `captainId`, `managerId`, `headCoachId`, `coachIds`, `pending`) broadly across persistence and UI, so an abrupt API contract removal would create a larger parallel client migration than this phase needs.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Team.kt`, `.../core/network/dto/TeamDtos.kt`, `.../teamCreation/TeamRepository.kt`, and `.../teamCreation/CreateOrEditTeamDialog.kt`.
- Observation: Once explicit `playerRegistrations` exist on the app model, editing only `playerIds` and `pending` is not enough because `withSynchronizedMembership()` prefers the structured rows and would otherwise preserve the old roster.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/teamManagement/CreateOrEditTeamDialog.kt` needed to rebuild `playerRegistrations` explicitly during save/leave flows after the new model landed.
- Observation: This repository does not expose a `roomGenerateSchema` Gradle task even though the team entity changed; the available Room-related task is `copyRoomSchemas`, which currently reports `NO-SOURCE`.
  Evidence: `./gradlew :composeApp:tasks --all | rg -i room` listed `copyRoomSchemas`, and `./gradlew :composeApp:copyRoomSchemas` completed with `NO-SOURCE`.

## Decision Log

- Decision: Keep the Prisma `teams` delegate as the event-team source during this refactor and introduce a new canonical team model for `/api/teams`.
  Rationale: Event flows already depend on `prisma.teams` everywhere. Repointing every event path and every test to a renamed delegate in one pass would turn this into a much larger breakage campaign. Using `prisma.teams` for event-owned rows lets the event refactor land while canonical membership is normalized.
  Date/Author: 2026-04-15 / Codex

- Decision: Preserve legacy flat roster/staff fields on event-team rows for compatibility while adding normalized canonical and event-scoped membership tables.
  Rationale: This keeps existing UI and query surfaces running while new source-of-truth tables are introduced. The compatibility fields become derived snapshots on event teams, not canonical ownership fields.
  Date/Author: 2026-04-15 / Codex

- Decision: In `mvp-app`, synchronize both the structured membership rows and the legacy mirror fields on every team edit instead of trying to switch all UI/state code to the new model in one pass.
  Rationale: The app still has many screens that read the old scalar/list fields. Rebuilding the structured rows in the editor and repository layer preserves correctness now while allowing a later cleanup pass to retire the mirrors safely.
  Date/Author: 2026-04-15 / Codex

## Outcomes & Retrospective

Backend support for the split model is now in place. Canonical team CRUD writes `CanonicalTeams`, `TeamRegistrations`, and `TeamStaffAssignments`; event joins claim/create `EventTeams` and freeze player/staff snapshots into `EventRegistrations` and `EventTeamStaffAssignments`; and placeholder handling is now explicit via `kind`. The mobile app now persists the new structured roster/staff rows, keeps the legacy mirrors synchronized for older screens, and updates its high-touch team/event displays to read the normalized rows first. The site schedule UI also respects explicit placeholder kind. Dedicated event-team management UX remains intentionally deferred, but the data model and join/edit paths now support it without another schema rewrite.

## Context and Orientation

Today the backend stores canonical teams and event copies in one table, with `parentTeamId` and placeholder heuristics (`captainId == ''`, placeholder names) standing in for an explicit event snapshot model. The new target model is:

- Canonical `Teams`: metadata only.
- `TeamRegistrations`: canonical player membership with status, jersey number, position, and captain marker.
- `TeamStaffAssignments`: canonical staff membership with role and status.
- `EventTeams`: event-owned snapshot rows, including placeholders, with `kind`, `eventId`, and registration references.
- `EventRegistrations`: event-scoped player rows plus the TEAM row keyed by `eventTeamId`.
- `EventTeamStaffAssignments`: event-scoped staff snapshots.

This work spans `mvp-site` as the backend/data-contract source of truth and `mvp-app` as the client. The server changes must land first so mobile and site code can consume the split model.

## Plan of Work

First, extend the Prisma schema and migration so canonical membership and event snapshot tables exist, the old event-facing team rows gain explicit `eventId` and `kind`, and event registrations can store event-team snapshot data. Backfill canonical teams and canonical memberships from existing flat rows, and mark event placeholders explicitly.

Next, refactor canonical team routes to read and write the new canonical tables while still returning compatibility aliases where the client still needs them. Then refactor event join and withdraw flows so they claim placeholder event teams when available, freeze canonical roster/staff rows into event-scoped records, and stop deleting historical event rows on withdrawal. After the backend paths work, update shared types and the most critical app/site consumers to read the new data safely.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site`:

1. Update `prisma/schema.prisma` and add a migration.
2. Regenerate Prisma client.
3. Refactor:
   - `src/app/api/teams/route.ts`
   - `src/app/api/teams/[id]/route.ts`
   - `src/app/api/events/[eventId]/participants/route.ts`
   - `src/server/events/eventRegistrations.ts`
   - placeholder creation paths in event/match routes
4. Run targeted tests for team routes, participants, and related event flows.

From `/Users/elesesy/StudioProjects/mvp-app`:

1. Update shared team DTO/model contracts for the new canonical/event split.
2. Keep compatibility fields where required in this phase, but ensure edits rebuild the structured membership rows so mobile state does not drift.
3. Update key team/event UI surfaces (`TeamDetailsDialog`, `CreateOrEditTeamDialog`, `ParticipantsVeiw`, `MatchCard`) to consume normalized player/staff data first.
4. Run focused compile/tests around team persistence and event detail flows.

## Validation and Acceptance

Acceptance criteria:

1. Canonical team create/update reads and writes canonical player/staff collections instead of mutating flat member/staff arrays as source of truth.
2. Joining a team-backed event either creates a new event team or claims a compatible placeholder while preserving the event-team id.
3. Player and staff event snapshots are copied from canonical registrations/assignments, including captain and jersey number when present.
4. Withdraw/leave updates event registration status instead of deleting historical event rows.
5. Event queries can distinguish placeholders by explicit `kind` instead of captain/name heuristics.
6. Existing client/server flows still receive enough compatibility data to function during this phase.
7. Editing a team in `mvp-app` updates both the structured roster rows and the compatibility mirror fields, so a reopened dialog shows the saved roster instead of stale structured data.

## Idempotence and Recovery

Most code changes are idempotent. The migration is one-way and must be applied once per database. If backfill fails because legacy rows have unexpected shapes, inspect the offending rows, patch the migration SQL, and rerun against a clean database snapshot before promoting it.

## Interfaces and Dependencies

Required end state:

- Canonical team APIs are backed by normalized canonical membership tables.
- Event APIs treat event-owned team rows as the schedule/registration/match source of truth.
- Placeholder detection uses `kind == PLACEHOLDER`.
- Client contracts can consume both canonical team rosters and event-team snapshots.

Revision note (2026-04-15): Initial plan created for the team membership and event-team snapshot refactor.
Revision note (2026-04-15): Updated after the mobile/client implementation to record the structured roster sync requirement, the app/UI files touched, and the final compile/typecheck validation.
