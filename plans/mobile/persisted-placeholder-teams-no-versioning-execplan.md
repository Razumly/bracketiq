# Persisted placeholder teams + parent-linked event slots (no team versioning)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository contains `PLANS.md` at `/Users/elesesy/StudioProjects/mvp-app/PLANS.md`. This plan must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, league/tournament events display stable “slots” inside the schedule as real team rows (UUIDs) named `Place Holder <seed>`. When a real (canonical) team joins, the server will fill one slot by updating the slot team row in-place and setting `parentTeamId = <canonicalTeamId>`. This makes schedules stable (match team IDs never change) and removes the need for “team versioning”. The client UI must stop using `event.teamIds.size` as a measure of “filled” capacity and instead count non-placeholder teams by `captainId.isNotBlank()`, and it must consider `team.parentTeamId` when checking whether the current user is registered.

## Progress

- [x] (2026-02-26 08:07Z) Initialized ExecPlan and captured requirements.
- [x] (2026-02-26 08:55Z) Implement placeholder slot handling in event detail UI.
- [x] (2026-02-26 08:55Z) Update “event full” and division summaries to ignore placeholders.
- [x] (2026-02-26 08:55Z) Update participant checks to use `parentTeamId`.
- [x] (2026-02-26 08:55Z) Run `./gradlew :composeApp:testDebugUnitTest` and verify pass.

## Surprises & Discoveries

- (none yet)

## Decision Log

- Decision: A team is a placeholder slot iff `captainId.isBlank()`.
  Rationale: No schema changes; aligns with backend plan and existing data patterns.
  Date/Author: 2026-02-26 / Codex

- Decision: “Filled count” for team-signup events is computed from hydrated teams, not `event.teamIds`.
  Rationale: `event.teamIds` will contain placeholder slot IDs up to capacity; only non-placeholder slots are real registrations.
  Date/Author: 2026-02-26 / Codex

## Outcomes & Retrospective

- (not started)

## Context and Orientation

The backend will change league/tournament events so that `Event.teamIds` stores a fixed roster of “event-slot teams”, including placeholder teams, and the schedule/matches refer to these slot team IDs. Slot teams have `parentTeamId = null` when empty, and when filled they have `parentTeamId = <canonicalTeamId>` and their visible team profile fields copied from the canonical team. The client must treat empty slots as unfilled capacity and must map a user’s canonical team IDs to a slot team by checking `slotTeam.parentTeamId`.

The primary impacted UI lives under:

- `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`
- `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`
- `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/DivisionCapacitySummary.kt`

## Plan of Work

Add a shared placeholder predicate `Team.isPlaceholderSlot()` and use it wherever the event detail UI calculates capacity/fullness or membership for team-signup events. Replace any logic that treats `event.teamIds.size` as “registered teams” with counting hydrated teams where `captainId` is not blank.

Update participant checks so that if the user belongs to canonical team IDs `{T1, T2, ...}`, they are considered registered if any hydrated event team has `parentTeamId in {T1, T2, ...}` (with a fallback to legacy `team.id in {T1, T2, ...}`).

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-app`:

1. Update the event detail component/screen to compute filled slots from hydrated teams.
2. Run unit tests:

   - `./gradlew :composeApp:testDebugUnitTest`

## Validation and Acceptance

- Given a league event with `maxParticipants = 10` and 10 placeholder slot teams, the event overview should show `0/10` filled.
- After joining with a canonical team, the event overview should show `1/10` filled and the UI should show the user as registered (via `parentTeamId`).

## Idempotence and Recovery

These changes are pure client-side logic and are safe to apply repeatedly. If the backend has not yet shipped, the new logic should still work because it has a legacy fallback path (`team.id in userTeamIds`).
