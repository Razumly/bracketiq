# Multi-Position Official Staffing Across Sports, Events, Matches, and Scheduler Modes

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with `PLANS.md` at the repository root. The backend source of truth for schema and API work is `//wsl.localhost/Ubuntu/home/camka/Projects/MVP/mvp-site`.

## Purpose / Big Picture

After this change, each sport can define default official position templates such as `R1`, `R2`, `line judge`, `umpire`, or `scorekeeper`, each with a default count. Each event copies those defaults into editable event-specific official positions stored on the event itself, can add more positions, can define which officials are eligible for which positions and fields, and can assign event officials or player users to match positions instead of being limited to one `officialId` and one `teamOfficialId`.

The scheduler will also expose an explicit event staffing mode. `STAFFING` makes match placement staffing-aware and prefers fully staffed conflict-free schedules. `SCHEDULE` prioritizes match times and fields first, then staffs without conflicts when possible and leaves empty slots when needed. `OFF` prioritizes the match schedule entirely, staffs afterward, and allows overlapping official assignments while still distributing work fairly. A human should be able to verify the change by opening an event schedule, seeing multiple official positions on the event and on each match, editing official eligibility per position, running schedule generation in each mode, and observing that the resulting matches show filled, unfilled, or conflicted staffing according to the selected mode.

## Progress

- [x] (2026-03-22 03:20Z) Audited the current `Event`, `Match`, Prisma schema, match bulk API, scheduler participant model, profile schedule route, and match editor to confirm the present contract is single-slot.
- [x] (2026-03-22 03:32Z) Reviewed prior official/staff plans in both repositories to preserve the current event-staff direction and terminology cutover.
- [x] (2026-03-22 03:45Z) Finalized the initial target design direction: sport-level default templates, event-level editable positions, event-scoped official eligibility rows, per-match assignment data, and explicit staffing modes.
- [x] (2026-03-22 10:05Z) Revised the target persisted model to the lighter shape: `Sports.officialPositionTemplates` JSON, `Events.officialPositions` JSON, `EventOfficials` table, and `Matches.officialIds` JSON assignment entries.
- [x] (2026-03-22 19:55Z) Drafted the Prisma schema diff and manual SQL migration in `mvp-site`, including sport template seeding plus deterministic backfills for event positions, event officials, and legacy match official assignments.
- [x] (2026-03-22 21:10Z) Implemented the Prisma migration plus repository/API normalization in `mvp-site` for event positions, event officials, match assignment JSON, and `officialSchedulingMode`, while keeping scalar compatibility mirrors.
- [x] (2026-03-22 22:05Z) Landed scheduler staffing-mode behavior in `mvp-site` for `STAFFING`, `SCHEDULE`, and `OFF`, with targeted scheduler regression coverage for staffing feasibility and conflict handling.
- [x] (2026-03-22 23:20Z) Updated `mvp-app` shared models, DTOs, event detail/editor surfaces, and template/event flows to understand event-level staffing structures and preserve official role mappings.
- [x] (2026-03-23 00:35Z) Updated `mvp-site` event editing/template flows so the web form can edit event staffing mode, event positions, and official eligibility by position/field, and so templates preserve official staffing instead of clearing it.
- [x] (2026-03-23 01:05Z) Finished the main `mvp-site` match-level schedule UI cutover: the match editor now edits structured per-position assignments, match update services/bulk payloads persist `officialIds`, schedule permission checks read assignment arrays, and match cards no longer collapse displays to one `officialId`.
- [x] (2026-03-23 09:10Z) Extended `mvp-app` match/schedule surfaces beyond the event editor: `MatchMVP` and match DTOs now carry structured `officialIds`, match detail check-in reads assignment arrays, event/profile schedule cards render multi-position assignment summaries, and schedule filtering tracks assigned officials from the new array instead of one scalar `officialId`.
- [x] (2026-03-23 19:30Z) Added explicit `mvp-site` route/repository regression coverage for persisted staffing payloads, including PATCH normalization plus repository persistence for `officialSchedulingMode`, `officialPositions`, and `eventOfficials`, and reran the broader route/repository/scheduler validation bundle successfully in the site worktree.
- [x] (2026-03-23 19:55Z) Extended `mvp-site` scheduler coverage for fairness edge cases: sequential matches now assert exact-position balancing across eligible officials, and `OFF` mode now asserts the same user is never assigned twice within one match even when overlaps are allowed.
- [x] (2026-03-23 20:15Z) Fixed `mvp-site` match-route validation so invalid `officialIds` payloads now return `400` instead of leaking as `500` or being ignored on the host single-match path, and added route regressions for invalid bulk-create and single-match official assignment payloads.
- [x] (2026-03-23 21:35Z) Fixed Android Room startup crash on stale local DBs in the `mvp-app` worktree by introducing a shared `MVP_DATABASE_VERSION` constant and pre-open schema-version guard that deletes `tournament.db` when on-device schema version does not match expected version 6.
- [ ] Run full dev/staging migration validation and remaining broader regression coverage across backend fairness edge cases and both clients.

## Surprises & Discoveries

- Observation: the current backend and KMP contract is still single-slot. Events only store an official pool, and matches only store one user official plus one team official.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MatchMVP.kt`, and `//wsl.localhost/Ubuntu/home/camka/Projects/MVP/mvp-site/prisma/schema.prisma`.

- Observation: the current scheduler conflict system works by treating assigned officials as participants, but that only works when each match already knows its exact official before time placement.
  Evidence: `//wsl.localhost/Ubuntu/home/camka/Projects/MVP/mvp-site/src/server/scheduler/types.ts` adds `teamOfficial` and `official` to `Match.getParticipants()`, and `Schedule.ts` computes conflicts from participant overlap.

- Observation: once positions become event-configurable and officials are only eligible for subsets of positions and fields, `STAFFING` mode can no longer be implemented by a simple global "officials are participants" flag. It needs a staffing feasibility or assignment step during placement.
  Evidence: no current data structure can express "this match needs two eligible officials from this subset" before assignment rows exist.

## Decision Log

- Decision: store sport-level official position defaults on the `Sports` record as template data, not as live event state.
  Rationale: the user wants official positions to be part of the general sport configuration, but old events must not silently change when a sport template is edited later.
  Date/Author: 2026-03-22 / Codex

- Decision: make event positions the operational source of truth for scheduling and UI, even when they were initially seeded from sport defaults.
  Rationale: events must be allowed to rename positions, delete template-derived positions, or add extra positions without mutating the sport-wide template.
  Date/Author: 2026-03-22 / Codex

- Decision: use an `EventOfficials` table for event-scoped official eligibility, with `positionIds` and `fieldIds` stored as arrays on the row.
  Rationale: this matches the user-requested shape, keeps one row per `(eventId, userId)`, and fits the existing schema style that already uses Postgres arrays for event/team/field membership.
  Date/Author: 2026-03-22 / Codex

- Decision: store event positions as JSON on `Events` instead of introducing an `EventOfficialPositions` table.
  Rationale: event positions are always loaded and edited with the event as a whole, and the user prefers to keep that state embedded on the event record rather than normalized into another table.
  Date/Author: 2026-03-22 / Codex

- Decision: store match assignment state as structured JSON on `Matches.officialIds` instead of introducing a `MatchOfficialAssignments` table.
  Rationale: the user wants a lighter schema, there is no requirement to query assignment rows independently, and the match payload always needs the full assignment set together.
  Date/Author: 2026-03-22 / Codex

- Decision: allow a match assignment entry to represent either an event official or a player user via `holderType`.
  Rationale: managers need to be able to assign player user ids into official roles, while the event-official roster remains the source for scheduler-managed official eligibility.
  Date/Author: 2026-03-22 / Codex

- Decision: replace the proposed boolean "schedule around official availability" with a persisted enum mode on the event: `STAFFING`, `SCHEDULE`, or `OFF`.
  Rationale: the user already described three materially different behaviors, and an enum prevents ambiguous boolean semantics.
  Date/Author: 2026-03-22 / Codex

- Decision: keep the current scalar fields (`Events.officialIds`, `Matches.officialId`, `Matches.teamOfficialId`, `Matches.officialCheckedIn`) as temporary compatibility mirrors during rollout.
  Rationale: both repos currently depend on those fields for schedule cards, match editing, mobile DTOs, and profile schedule lookups. Removing them in the same change would add unnecessary cutover risk.
  Date/Author: 2026-03-22 / Codex

## Outcomes & Retrospective

Core implementation is in place across schema, API, scheduler logic, the KMP event editor, the KMP match/schedule rendering surfaces, and the main web schedule UI, including event-level staffing editing and match-level assignment editing. `mvp-site` validation is now green for `tsc --noEmit` plus the focused route/repository/scheduler bundle covering `scheduleRoutes`, `eventPatchSanitizeRoutes`, `events.upsert`, `officialStaffingModes`, `leagueTimeSlots`, and `reschedulePreservingLocks`, and the route layer now explicitly rejects invalid match official assignment payloads with client `400`s on both bulk and single-match saves. The scheduler suite also locks down exact-position fairness plus the invariant that `OFF` mode may overlap users across matches but never duplicate the same user within one match. The main remaining gaps are rollout-oriented: dev/staging migration validation and full client-side verification once the local Android KSP/AWT blocker is resolved. The original `STAFFING` risk was resolved by introducing a dedicated staffing feasibility/assignment pass instead of relying on the old participant-overlap shortcut, and the app-side match rendering risk was resolved by carrying structured `officialIds` through `MatchMVP` instead of trying to infer multi-position state from the legacy scalar mirrors.

## Context and Orientation

The work spans both repositories:

- `C:/Users/samue/StudioProjects/mvp-app`
- `//wsl.localhost/Ubuntu/home/camka/Projects/MVP/mvp-site`

`mvp-site` is the backend source of truth. Prisma schema changes, API changes, scheduler logic, web types, and server-side event/match repositories must be designed there first. `mvp-app` then mirrors the new contracts in its KMP models, DTOs, and schedule/event detail flows.

Today the core contract is still single-slot. `Events` has `officialIds` plus `doTeamsOfficiate` and `teamOfficialsMaySwap`. `Matches` has `officialId`, `teamOfficialId`, and `officialCheckedIn`. The bulk match save route accepts only those scalar fields, the scheduler only adds those two assignments to `Match.getParticipants()`, the web `MatchEditModal` only renders one `Team Official` select and one `Official` select, and the profile schedule route only filters on one user-official field and one team-official field.

This plan introduces four concepts that do not exist today:

Sport official position template: a default position definition stored on a sport, such as `R1`, `R2`, `line_judge`, or `scorekeeper`. This is only a template source.

Event official position: an event-scoped editable position definition copied from the sport template or added manually on the event. Scheduling and match assignment read from this layer, not from the sport template directly. These positions are stored as JSON on the event, not in a separate table.

Event official: an event-scoped official eligibility record for one user. This row answers which event positions and fields that user may work.

Match official assignment entry: one JSON entry for one match position slot. This entry can point to an `EventOfficial` user or to a player user, can be empty, and can later carry conflict or check-in state. These entries live inside `Matches.officialIds`, which becomes a structured JSON field rather than a plain string array.

## Plan of Work

The first milestone is data model scaffolding in `mvp-site`. Add a persisted event staffing mode to `Events`. Add a sport-level template field to `Sports`. Add one new table, `EventOfficials`, and two new JSON-backed fields: `Events.officialPositions` and `Matches.officialIds`. Keep the existing event and match scalar official fields in place for compatibility, but stop treating them as the long-term source of truth. In the same milestone, define a migration and backfill that creates default event positions from sport templates or legacy mirrors, creates `EventOfficials` rows from current `officialIds`, and creates structured `Matches.officialIds` JSON entries from current `officialId` and `teamOfficialId` where appropriate.

The second milestone is backend event and sport API support. Extend sport read and write routes so sport payloads can include `officialPositionTemplates`. Extend event create and update routes so event payloads can include `officialSchedulingMode`, `officialPositions`, and `eventOfficials`. Event creation must seed `officialPositions` from the selected sport when the client does not supply an explicit event position list. Event updates must treat event positions and event officials as full replace sets inside a single transaction, removing deleted position references from `EventOfficials.positionIds` and normalizing any stale match assignment entries that reference deleted event position ids. Event reads must return the new structures and derive `officialIds` as a compatibility list from `EventOfficials.userId`.

The same milestone must also seed initial defaults for existing sport rows in the database. The migration should populate `Sports.officialPositionTemplates` with explicit `{ name, count }` arrays for every currently supported sport so newly created events always have a deterministic starting point instead of an empty position list.

The third milestone is match assignment API support. Extend both match routes (`/api/events/[eventId]/matches` and `/api/events/[eventId]/matches/[matchId]`) so reads include structured `officialIds` assignment entries, and writes accept that assignment array instead of only scalar official fields. The existing bulk save path must remain atomic. One bulk request should be able to update matches and their assignment JSON in a single database transaction. During rollout, the backend should keep mirroring one designated primary event-official user assignment into `officialId`, keep `teamOfficialId` unchanged for the team-official flow, and mirror one designated assignment check-in into `officialCheckedIn` so old clients still see consistent data.

The fourth milestone is scheduler behavior. The scheduler must first place matches according to the selected event staffing mode, then run or consult a staffing assignment engine. `STAFFING` means match placement is staffing-aware: a candidate placement is accepted only if a valid set of official assignments exists for all overlapping matches in the affected window. `SCHEDULE` means match placement ignores officials entirely, then assigns officials afterward without overlaps where possible and leaves empty assignment entries when not enough eligible officials exist. `OFF` means match placement ignores officials and the post-pass fills assignments even when it creates overlap conflicts. Fairness in all three modes uses the same ordering: fewest assignments for that exact event position first, then fewest total assignments across scheduler-managed positions, then least recent work. `fieldIds` on `EventOfficials` must already be enforced whenever a match has a concrete field; if a match has no field yet, the field filter is skipped. Player-held assignments are allowed only in the post-match team-manager workflow and must not be chosen automatically by the scheduler unless a later feature explicitly introduces that behavior.

The fifth milestone is web UI in `mvp-site`. Sport admin and sport config surfaces need editing controls for official position templates. The event schedule editor needs a staff configuration area where event positions can be viewed, reordered, renamed, deleted, and manually added beyond the sport defaults. The same editor needs an event-official roster section where organizers can add users and limit each user by position and by field. Match editing needs to display assignment rows per position instead of one `Official` and one `Team Official`. Schedule results need visible badges or warnings for unfilled required positions and overlap conflicts.

The sixth milestone is KMP/mobile parity in `mvp-app`. Shared event and match models must mirror the new structures. Network DTOs must support sport templates, event positions, event officials, and match assignments. Event and match detail screens must render multiple positions and assignments. The mobile code may continue reading the legacy scalar fields during the cutover window, but its write paths must move to the new arrays before the compatibility mirrors are removed.

## Concrete Steps

Work in `C:/Users/samue/StudioProjects/mvp-app` for plan maintenance and in `//wsl.localhost/Ubuntu/home/camka/Projects/MVP/mvp-site` for backend implementation.

From `//wsl.localhost/Ubuntu/home/camka/Projects/MVP/mvp-site`, implement the schema changes in `prisma/schema.prisma` and a migration under `prisma/migrations/`. The final schema must include:

1. An enum on `Events` named `officialSchedulingMode` with values `STAFFING`, `SCHEDULE`, and `OFF`.
2. A new nullable `officialPositionTemplates` field on `Sports` stored as JSON template data. Application code must normalize `null` to `[]`.
3. A new nullable `officialPositions` field on `Events` stored as JSON event-position data. Application code must normalize `null` to `[]`.
4. A new `EventOfficials` model with at least: `id`, `createdAt`, `updatedAt`, `eventId`, `userId`, `positionIds`, `fieldIds`, `isActive`, and a uniqueness constraint on `(eventId, userId)`.
5. A new nullable `officialIds` field on `Matches` stored as JSON assignment-entry data. Application code must normalize `null` to `[]`.

From `//wsl.localhost/Ubuntu/home/camka/Projects/MVP/mvp-site`, update the repository and API layers in these files:

- `src/server/repositories/events.ts`
- `src/app/api/events/[eventId]/route.ts`
- `src/app/api/events/[eventId]/matches/route.ts`
- `src/app/api/events/[eventId]/matches/[matchId]/route.ts`
- any sport admin routes or services that already read and write `Sports`
- `src/server/scheduler/*`

The server contract must use these payload shapes and normalization rules:

Common JSON types:

    type OfficialSchedulingMode = "STAFFING" | "SCHEDULE" | "OFF"

    type SportOfficialPositionTemplate = {
      name: string
      count: number
    }

    type EventOfficialPosition = {
      id: string
      name: string
      count: number
      order: number
    }

    type EventOfficial = {
      id: string
      userId: string
      positionIds: string[]
      fieldIds: string[]
      isActive?: boolean
    }

    type MatchOfficialAssignment = {
      positionId: string
      slotIndex: number
      holderType: "OFFICIAL" | "PLAYER"
      userId: string
      eventOfficialId?: string
      checkedIn?: boolean
      hasConflict?: boolean
    }

Normalization rules:

- `Sports.officialPositionTemplates`: normalize `null` to `[]`.
- `Events.officialPositions`: normalize `null` to `[]`.
- `Matches.officialIds`: normalize `null` to `[]`.
- `SportOfficialPositionTemplate.count` must be `>= 1`.
- `EventOfficialPosition.count` must be `>= 1`.
- `EventOfficial.positionIds` must reference existing `Events.officialPositions[].id` values and must not be empty for active rows.
- `EventOfficial.fieldIds = []` means the official may work any field in the event. Non-empty arrays restrict to those fields only.
- `MatchOfficialAssignment.slotIndex` must be `>= 0` and `< EventOfficialPosition.count` for that assignment's `positionId`.
- `MatchOfficialAssignment.holderType = "OFFICIAL"` requires `eventOfficialId` and that `userId` match the referenced `EventOfficial.userId`.
- `MatchOfficialAssignment.holderType = "PLAYER"` forbids `eventOfficialId`.
- One match may not contain duplicate assignment entries for the same `positionId + slotIndex`.
- One user may not appear more than once in the same match assignment array, even in `OFF` mode.

Sport payload:

    {
      id: "sport_volleyball",
      name: "Volleyball",
      officialPositionTemplates: [
        {
          name: "R1",
          count: 1
        },
        {
          name: "Line Judge",
          count: 2
        }
      ]
    }

Event payload:

    {
      id: "event_123",
      officialSchedulingMode: "SCHEDULE",
      officialIds: ["user_a", "user_b"], // compatibility mirror only
      officialPositions: [
        {
          id: "event_pos_r1",
          name: "R1",
          count: 1,
          order: 0
        },
        {
          id: "event_pos_line_judge",
          name: "Line Judge",
          count: 2,
          order: 1
        }
      ],
      eventOfficials: [
        {
          id: "event_official_user_a",
          userId: "user_a",
          positionIds: ["event_pos_r1"],
          fieldIds: ["field_1", "field_2"]
        }
      ]
    }

Match payload:

    {
      id: "match_456",
      officialId: "user_a",       // compatibility mirror only
      teamOfficialId: null,       // compatibility mirror only
      officialIds: [
        {
          positionId: "event_pos_r1",
          slotIndex: 0,
          holderType: "OFFICIAL",
          eventOfficialId: "event_official_user_a",
          userId: "user_a",
          checkedIn: false,
          hasConflict: false
        }
      ]
    }

The initial default sport templates seeded in the database should be:

- `Volleyball`: `R1 x1`, `R2 x1`, `Line Judge x2`, `Scorekeeper x1`
- `Indoor Volleyball`: `R1 x1`, `R2 x1`, `Line Judge x2`, `Scorekeeper x1`
- `Beach Volleyball`: `R1 x1`, `R2 x1`, `Scorekeeper x1`
- `Grass Volleyball`: `R1 x1`, `R2 x1`, `Line Judge x2`, `Scorekeeper x1`
- `Basketball`: `Referee x2`, `Scorekeeper x1`, `Timekeeper x1`
- `Soccer`: `Referee x1`, `Assistant Referee x2`
- `Indoor Soccer`: `Referee x2`, `Scorekeeper x1`
- `Grass Soccer`: `Referee x1`, `Assistant Referee x2`
- `Beach Soccer`: `Referee x2`, `Scorekeeper x1`
- `Tennis`: `Umpire x1`
- `Pickleball`: `Referee x1`
- `Football`: `Referee x1`, `Umpire x1`, `Head Linesman x1`, `Line Judge x1`, `Back Judge x1`
- `Hockey`: `Referee x2`, `Linesperson x2`
- `Baseball`: `Plate Umpire x1`, `Base Umpire x2`
- `Other`: `Official x1`

These are product defaults, not hard rules. Organizers can edit event positions after the event is seeded from the sport.

The event API must support full-replace updates for `officialPositions` and `eventOfficials` inside one transaction. If the client omits `officialPositions` during event creation and the event has a `sportId`, the server must seed the event positions from `Sports.officialPositionTemplates`. If the client explicitly supplies event positions, those positions win and no automatic merge happens.

The match bulk API must accept structured `officialIds` assignment arrays in the same request body that already supports bulk match creates, updates, and deletes. The server must persist match rows and assignment JSON together. If any assignment write fails validation, the entire request must roll back.

The scheduler implementation must introduce a dedicated staffing assignment helper in `src/server/scheduler/`. This helper must expose a deterministic function such as:

    assignOfficialsForMatches(matches, event, mode) -> {
      assignmentsByMatchId,
      warnings,
      staffingFeasible
    }

`staffingFeasible` is used during placement only in `STAFFING` mode. `warnings` is used in `SCHEDULE` and `OFF` modes to tell the client which positions remain unfilled or conflicted. This helper must be reused by schedule generation, reschedule flows, and explicit match edits so the same fairness and conflict rules apply everywhere.

For the web UI in `mvp-site`, update these files or their modern equivalents:

- sport configuration editor surfaces that already read and write `Sports`
- `src/app/events/[id]/schedule/page.tsx`
- `src/app/events/[id]/schedule/components/EventForm.tsx`
- `src/app/events/[id]/schedule/components/MatchEditModal.tsx`
- `src/app/events/[id]/schedule/components/MatchCard.tsx`
- any schedule warning display components

The event schedule editor must let organizers:

1. Choose `officialSchedulingMode`.
2. See sport-derived event official positions.
3. Add, rename, delete, and reorder event positions.
4. Add event officials and limit each by positions and fields.
5. See per-match position slots and edit assignments manually.

For `mvp-app`, update the following shared layers:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MatchMVP.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/*`
- repositories and schedule/detail UI modules that currently read `officialId`, `teamOfficialId`, and `officialIds`

The KMP side must add event-level official positions, event officials, and structured match `officialIds` assignment entries to the shared model. It must also keep mapping the legacy scalar mirrors during the transition so old cached data continues to load.

## Validation and Acceptance

The backend acceptance criteria are behavioral:

- Creating an event with a `sportId` and no explicit event positions seeds `officialPositions` from the sport template.
- Editing the event and adding a new custom position persists that position only on the event, not back onto the sport.
- Adding an `EventOfficials` row with `positionIds` and `fieldIds` persists and returns those restrictions on the next event read.
- Saving match assignments through the bulk matches route persists one structured entry per position slot and rolls back completely if any assignment payload is invalid.
- Running schedule generation in `STAFFING` mode fails or warns only when staffing feasibility truly cannot be met.
- Running schedule generation in `SCHEDULE` mode produces a valid match schedule even when some position slots remain unfilled, and those unfilled slots are returned as warnings.
- Running schedule generation in `OFF` mode produces a valid match schedule and assignment rows even when overlap conflicts exist, and those conflicts are returned explicitly.

The UI acceptance criteria are user-visible:

- Sport config shows default official positions.
- Event schedule settings show editable event positions seeded from the sport defaults.
- Event staff settings show officials with selectable positions and fields.
- Match cards and match edit dialogs show multiple official positions instead of one scalar official.
- Schedule results visually distinguish filled, unfilled, and conflicted staffing slots.

The cross-platform acceptance criteria are:

- Web and mobile event fetches can read the new event structures.
- Web and mobile match fetches can read structured `officialIds` assignment arrays.
- Old scalar fields continue to appear during rollout so old screens do not break before their write paths are updated.

Run these backend validation commands from `//wsl.localhost/Ubuntu/home/camka/Projects/MVP/mvp-site`:

    npm test -- --runInBand src/app/api/events/__tests__/scheduleRoutes.test.ts
    npm test -- --runInBand src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts
    npm test -- --runInBand src/server/scheduler/__tests__/reschedulePreservingLocks.test.ts
    npm test -- --runInBand src/server/scheduler/__tests__/leagueTimeSlots.test.ts
    npm test -- --runInBand src/server/repositories/__tests__/events.upsert.test.ts
    npx tsc --noEmit

Add new backend tests for:

- sport template seeding
- event position add/remove normalization
- `EventOfficials` validation for unknown position IDs and field IDs
- match assignment JSON validation and bulk save rollback
- staffing mode behavior for `STAFFING`, `SCHEDULE`, and `OFF`
- fairness across positions and across total workload

Run these KMP validation commands from `C:/Users/samue/StudioProjects/mvp-app`:

    ./gradlew :composeApp:testDebugUnitTest
    ./gradlew :composeApp:test

Add new KMP tests for DTO mapping of `officialSchedulingMode`, `officialPositions`, `eventOfficials`, and structured match `officialIds`.

## Idempotence and Recovery

The migration must be safe to run once in production and safe to re-run in development from a clean database. Backfill should be additive and deterministic: if a legacy event already has compatibility mirror values but the new rows exist, the backfill must not duplicate them.

During rollout, the server remains authoritative for both the new structures and the legacy mirror fields. If a partial client rollout fails, recovery is to continue serving the mirror fields and temporarily disable writes from clients that do not yet understand assignment arrays. Do not remove the mirror fields until both repos have shipped the new write path and targeted regression tests are green.

If the staffing helper proves too slow or too complex for `STAFFING` mode on first implementation, fall back to implementing `SCHEDULE` and `OFF` first behind the new schema while keeping `STAFFING` routed through a guarded compatibility path. That fallback must be recorded in the `Decision Log` and reflected in the acceptance criteria before shipping.

## Artifacts and Notes

The schema and API changes intentionally separate template data, eligibility data, and actual match assignment data:

- `Sports.officialPositionTemplates` answers "what positions does this sport normally use?"
- `Events.officialPositions` answers "what positions does this event use right now?"
- `EventOfficials` answers "which users are eligible for which event positions and fields?"
- `Matches.officialIds` answers "who is currently assigned to each match position slot, and are they serving as an official or as a player?"

This separation is what allows:

- sport defaults without retroactively mutating old events
- event-specific custom positions
- field-specific eligibility
- staffing modes that fill, leave empty, or conflict assignment entries explicitly

The match assignment JSON must be structured. It cannot be a plain list of ids, because the server and clients need to know which person fills which position and which repeated slot. Each entry must include at least:

- `positionId`
- `slotIndex`
- `holderType` with values `OFFICIAL` or `PLAYER`
- `userId`

When `holderType` is `OFFICIAL`, the entry should also carry `eventOfficialId` so the assignment can be traced back to event eligibility and fairness accounting. When `holderType` is `PLAYER`, `eventOfficialId` is absent and the entry is treated as a team-managed override or manual assignment.

One special note for `STAFFING` mode: the old scheduler behavior of simply treating officials as already-known participants is not sufficient once assignments are dynamic. The implementation must instead prove that a valid assignment exists for the candidate placement. A small matching or feasibility helper is expected and should be treated as first-class scheduler logic, not as a late UI-only warning pass.

## Interfaces and Dependencies

The final backend interface must expose these named concepts:

- `officialSchedulingMode` on `Events`
- `officialPositionTemplates` on `Sports`
- `officialPositions` on event payloads
- `eventOfficials` on event payloads
- structured `officialIds` on match payloads

The final Prisma schema must include:

- `EventOfficials`
- JSON fields for `Sports.officialPositionTemplates`, `Events.officialPositions`, and `Matches.officialIds`

The final scheduler helper must be a reusable module under `src/server/scheduler/` rather than logic buried only in one route. The final backend must continue to use batch and atomic save flows: collection loads use batch queries, and multi-record match plus assignment saves use a single transaction, consistent with the repository guidelines in `AGENTS.md`.

Update note: This ExecPlan was created to turn the multi-position official staffing discussion into a concrete cross-repo schema and API design. It explicitly adopts the user-requested `EventOfficials` table and three staffing modes, while correcting the implementation detail that `STAFFING` mode requires staffing feasibility rather than the old single-official participant shortcut.

Progress update: Prisma schema, migration draft, repository loading/persistence, event routes, and match routes are now wired for `officialSchedulingMode`, event-level positions, `EventOfficials`, and structured match `officialIds`. Scheduler staffing modes are now implemented in `mvp-site` with an explicit official staffing planner for `STAFFING`, `SCHEDULE`, and `OFF`, route/repository regressions cover explicit staffing payload persistence and normalization, match routes now reject invalid assignment payloads as `400` on both bulk and single-match writes, and scheduler regressions cover exact-position balancing plus same-match uniqueness in `OFF`. Validation currently passes in the site worktree with `npx prisma validate --schema prisma/schema.prisma`, `npx tsc --noEmit`, `jest --runInBand src/app/api/events/__tests__/scheduleRoutes.test.ts src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts src/server/repositories/__tests__/events.upsert.test.ts src/server/scheduler/__tests__/officialStaffingModes.test.ts src/server/scheduler/__tests__/leagueTimeSlots.test.ts src/server/scheduler/__tests__/reschedulePreservingLocks.test.ts`, and the focused route/repository subset for the new staffing persistence tests.

Progress update: `mvp-app` now mirrors structured match official assignments end-to-end in shared models and schedule UI. Validation in the app worktree currently passes for `./gradlew :composeApp:compileCommonMainKotlinMetadata`. Android/unit-test tasks in the worktree now get through local SDK and Google services configuration, but they are still blocked by the pre-existing local KSP/AWT failure (`:composeApp:kspDebugKotlinAndroid` -> `sun.awt.PlatformGraphicsInfo`). Broader app regression runs remain follow-up work once that machine-level KSP issue is resolved.
