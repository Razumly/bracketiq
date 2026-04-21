# Match Finalization Locking And League Rescheduling

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [PLANS.md](/Users/elesesy/StudioProjects/mvp-app/PLANS.md).

## Purpose / Big Picture

After this change, match mutations will behave consistently for officials and schedulers. A match becomes locked as soon as an official checks in, so later reschedule passes treat it as fixed. Finalizing a league match will no longer stop at winner/loser advancement; it will re-run scheduling with lock preservation so downstream league matches can move when needed without disturbing already locked matches. The dead `saveTeamRecords` persistence call will be removed so route behavior matches the actual data model instead of pretending team records are stored separately.

The result is observable in tests: official check-in causes `locked = true`, tournament and league finalization both preserve locked matches, and league finalization can move unlocked downstream matches when a prior result runs long.

## Progress

- [x] (2026-04-15 18:18Z) Read `PLANS.md`, identified the single-match and bulk-match mutation routes, and confirmed `saveTeamRecords` is currently a no-op.
- [x] (2026-04-15 18:18Z) Verified current scheduler behavior: tournament finalize reschedules unlocked downstream matches, league finalize returns early, and preserving-locks reschedule already exists for full event scheduling.
- [x] (2026-04-15 18:24Z) Implemented route and scheduler changes so official check-in locks immediately and league finalization uses preserving-locks rescheduling.
- [x] (2026-04-15 18:24Z) Removed dead `saveTeamRecords` imports/calls and updated affected tests/mocks.
- [x] (2026-04-15 18:24Z) Ran focused Jest coverage for lock behavior, finalize behavior, and match routes; all targeted suites passed.

## Surprises & Discoveries

- Observation: `saveTeamRecords` is exported but intentionally empty.
  Evidence: `src/server/repositories/events.ts` lines 2311-2314 are only `void teams; void client;`.

- Observation: League finalize behavior is explicitly covered by tests that assert no reshuffling and no playoff auto-seeding during regular-season finalize.
  Evidence: `src/server/scheduler/__tests__/finalizeMatch.league.test.ts`.

- Observation: The “league-only” block in `finalizeMatch` checks `seededTeamIds.length`, but `seededTeamIds` is never populated before the league early return.
  Evidence: `src/server/scheduler/updateMatch.ts` initializes `const seededTeamIds: string[] = [];` and returns from the `event instanceof League` branch without mutating it.

- Observation: The split-playoff finalize test needed the completed match marked as locked to match the route path. Without that, the preserving-locks rescheduler tried to move the just-finished playoff match and ran out of slot capacity.
  Evidence: `finalizeMatch.league.test.ts` failed with `No available time slots remaining for scheduling` until `playoffMatch.locked = true` was added to the fixture.

## Decision Log

- Decision: Reuse `rescheduleEventMatchesPreservingLocks` for league finalization instead of extending the tournament-only `processMatches` flow.
  Rationale: The preserving-locks rescheduler already defines the desired invariant for locked matches and already handles league-specific slot/division behavior, including split playoff divisions.
  Date/Author: 2026-04-15 / Codex

- Decision: Treat official check-in as an immediate lock in the route layer, not just a persisted side effect after finalize.
  Rationale: The user-visible rule is “checked-in matches are fixed.” Applying the lock before any later scheduling step makes that invariant explicit and testable.
  Date/Author: 2026-04-15 / Codex

- Decision: Remove `saveTeamRecords` call sites rather than re-implementing fake team record persistence.
  Rationale: Standings are derived from matches; keeping no-op calls adds confusion and suggests a persistence layer that does not exist.
  Date/Author: 2026-04-15 / Codex

## Outcomes & Retrospective

The backend now matches the intended workflow. Match routes lock a match immediately when official check-in is part of the update, so any finalize-time rescheduler sees that match as fixed. League finalization now advances the result and then runs the preserving-locks rescheduler, which moved unlocked downstream league matches in tests while leaving locked downstream matches untouched. The dead `saveTeamRecords` plumbing has been removed from both runtime code and tests.

The dead league-only block inside `finalizeMatch` was an abandoned attempt to do follow-up team-official assignment for newly seeded playoff matches. Because league finalization never actually seeded teams there, `seededTeamIds` stayed empty and the block never ran. Replacing the league early return with the preserving-locks rescheduler made that branch unnecessary.

## Context and Orientation

The backend source of truth for match mutation lives in `/Users/elesesy/StudioProjects/mvp-site`. The single-match PATCH route is `src/app/api/events/[eventId]/matches/[matchId]/route.ts`. The bulk match PATCH route is `src/app/api/events/[eventId]/matches/route.ts`. Both routes load a full in-memory event model, apply updates to `Match` objects, then persist matches with `saveMatches(...)`.

The scheduler logic for single-match finalization lives in `src/server/scheduler/updateMatch.ts`. Today that file contains two separate behaviors. Tournament finalization advances winner/loser links and may unschedule and re-place later unlocked matches. League finalization returns early after `advanceTeams(...)`, which means league schedules do not react to finalized results. Full event rescheduling with lock preservation already exists in `src/server/scheduler/reschedulePreservingLocks.ts`; that module reattaches locked matches first, then only unschedules and reschedules unlocked matches.

`saveTeamRecords` is declared in `src/server/repositories/events.ts` but does not persist anything. Route code and tests still call or mock it even though standings are computed from match scores instead of a team-record table.

## Plan of Work

First, update the scheduler entrypoints. In `src/server/scheduler/updateMatch.ts`, keep the match-update helpers but change league finalization so it no longer returns before scheduling work. The desired behavior is: determine winner/loser, advance the bracket links or seeded targets, then invoke `rescheduleEventMatchesPreservingLocks(event)` for leagues so unlocked matches can move while locked matches remain fixed. Preserve the tournament logic that reschedules only the relevant downstream bracket slice unless the preserving-locks helper becomes the shared path for both event types.

Second, tighten lock semantics in the routes. In `src/app/api/events/[eventId]/matches/[matchId]/route.ts`, if the incoming mutation sets `officialCheckedIn` to true, set `targetMatch.locked = true` before finalize/reschedule processing. Keep `applyPersistentAutoLock(...)` afterward so started matches still auto-lock and explicit host unlocks continue to work where allowed. Mirror the same immediate check-in lock rule in the bulk route `src/app/api/events/[eventId]/matches/route.ts` so both APIs honor the same invariant.

Third, remove dead team-record persistence. Delete the `saveTeamRecords` export from `src/server/repositories/events.ts` if nothing valid needs it, then remove imports and calls from the single-match route, bulk-match route, and standings confirm route. Update Jest mocks in the route tests so they no longer expect `saveTeamRecords` to be called.

Finally, rewrite and add tests. Update the league finalize tests in `src/server/scheduler/__tests__/finalizeMatch.league.test.ts` so they assert the new behavior: leagues reschedule unlocked downstream matches after finalize and still preserve locked matches. Keep the existing tournament locked-match coverage. Add or adjust route tests in `src/app/api/events/__tests__/scheduleRoutes.test.ts` to assert that setting `officialCheckedIn: true` produces a locked match in both single and bulk mutation paths.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site` when editing and testing backend files.

1. Edit:

    - `src/server/scheduler/updateMatch.ts`
    - `src/server/scheduler/reschedulePreservingLocks.ts` only if a small helper export is needed
    - `src/app/api/events/[eventId]/matches/[matchId]/route.ts`
    - `src/app/api/events/[eventId]/matches/route.ts`
    - `src/server/repositories/events.ts`
    - `src/app/api/events/[eventId]/standings/confirm/route.ts`
    - related Jest tests under `src/server/scheduler/__tests__/` and `src/app/api/events/__tests__/`

2. Run focused tests:

    - `cd /Users/elesesy/StudioProjects/mvp-site && pnpm test -- --runInBand src/server/scheduler/__tests__/autoMatchLocking.test.ts`
    - `cd /Users/elesesy/StudioProjects/mvp-site && pnpm test -- --runInBand src/server/scheduler/__tests__/finalizeMatch.league.test.ts`
    - `cd /Users/elesesy/StudioProjects/mvp-site && pnpm test -- --runInBand src/app/api/events/__tests__/scheduleRoutes.test.ts`

3. If route mocks break because `saveTeamRecords` was removed, update the mocks and rerun the affected file until green.

Expected successful transcript snippets should include Jest passing output for the three files above.

Observed successful transcripts:

    PASS src/server/scheduler/__tests__/autoMatchLocking.test.ts
    PASS src/server/scheduler/__tests__/finalizeMatch.league.test.ts
    PASS src/app/api/events/__tests__/scheduleRoutes.test.ts
    PASS src/app/api/events/__tests__/standingsRoutes.test.ts

## Validation and Acceptance

Acceptance is behavioral:

- When a single-match PATCH checks in an official, the returned match is locked even if the start time is still in the future.
- When a bulk match PATCH sets `officialCheckedIn: true`, the persisted match is locked.
- Finalizing a league match can move later unlocked matches when the finalized match runs long or alters readiness of dependent matches.
- Locked downstream league matches stay in place during that reschedule.
- Tournament behavior continues to preserve locked downstream matches.
- No route or test still imports or expects `saveTeamRecords`.

Validation is complete when the focused Jest files above pass and their assertions cover those behaviors.

## Idempotence and Recovery

These edits are code-only and safe to rerun. The focused test commands can be repeated without resetting state. If a partial edit leaves the scheduler in a broken intermediate state, use the failing Jest file as the rollback guide before touching broader route tests.

## Artifacts and Notes

Important evidence to capture after implementation:

    PASS src/server/scheduler/__tests__/autoMatchLocking.test.ts
    PASS src/server/scheduler/__tests__/finalizeMatch.league.test.ts
    PASS src/app/api/events/__tests__/scheduleRoutes.test.ts
    PASS src/app/api/events/__tests__/standingsRoutes.test.ts

If the preserving-locks helper is reused from finalize logic, include a short diff excerpt showing the new call site in `updateMatch.ts` and the removed `saveTeamRecords` imports from the routes.

## Interfaces and Dependencies

No new external libraries are needed. Reuse the existing scheduler types and helpers in:

    src/server/scheduler/updateMatch.ts
    src/server/scheduler/reschedulePreservingLocks.ts
    src/server/repositories/events.ts

At the end of the change, these interfaces should remain true:

    applyPersistentAutoLock(match, { now, explicitLockedValue? }) -> boolean

    finalizeMatch(event, updatedMatch, context, currentTime) -> {
      updatedMatch: Match;
      seededTeamIds: string[];
    }

`finalizeMatch` may internally call the preserving-locks rescheduler for leagues, but its external shape should stay stable so existing callers and tests still compile.
