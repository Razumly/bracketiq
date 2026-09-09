# Complete the Officiating Plan scheduler

This ExecPlan is a living document. Maintain the `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` sections in accordance with `PLANS.md`.

## Purpose / Big Picture

Issue 43 makes the Officiating Plan reliable for event hosts. A host can configure Team duties, named Official Positions, and one of five Staffing Priorities. The scheduler then applies the selected hard requirements, keeps optional gaps as warnings, and chooses eligible officials and Teams in a stable order.

The visible proof is a complete site scheduler test set and a mobile round-trip test set. The tests must show that every priority has the intended hard requirements, that repeated non-overlapping Team duties work, that no Team officiates its own Match, and that the same input produces the same assignments on web and mobile.

## Progress

- [x] (2026-09-03) Read Issue 43, the repository rules, the site and workstream guidance, and the existing staffing implementation.
- [x] (2026-09-03) Confirmed that the five canonical priorities, named positions, event officials, Room fields, and mobile selector already exist.
- [x] (2026-09-03) Identified the initial Team-duty assignment path as separate from the approved reflow ranking.
- [x] (2026-09-03) Add regression tests for repeated Team-duty assignments and approved candidate ranking in the initial scheduler.
- [x] (2026-09-03) Share the deterministic Team-duty ranking between initial scheduling and explicit reflow.
- [x] (2026-09-03) Verify hard and optional Staffing Priority behavior through the complete proposal path.
- [x] (2026-09-03) Verify the existing mobile encode, decode, Room persistence, and warning state behavior by source and test inspection.
- [x] (2026-09-03) Run focused checks and the affected full site suites. The mobile Gradle runner was unavailable in this Windows sandbox.
- [x] (2026-09-03) Commit the completed Issue 43 changes to the current Workstream branch.

## Surprises & Discoveries

- Observation: The site already contains a canonical five-value Staffing Priority policy.
  Evidence: `apps/site/src/server/officials/config.ts` defines all five values and their hard-coverage flags.

- Observation: Initial Team-duty assignment removes a Team from an `unassigned` list after its first duty.
  Evidence: `EventBuilder.assignTeamOfficials` and `selectTeamOfficialCandidate` permanently remove the selected Team, even when a later Match is non-overlapping.

- Observation: Explicit reflow has a richer Team candidate order than initial scheduling.
  Evidence: `reschedulePreservingLocks.ts` ranks eliminated Teams, recent losers, assignment count, rest, and stable Team ID.

## Decision Log

- Decision: Keep the canonical Staffing Priority enum and existing HTTP contract.
  Rationale: Issue 42 already established the versioned Event Editor contract and the current site and mobile models already encode all five values.
  Date/Author: 2026-09-03 / Codex

- Decision: Reuse one deterministic Team-duty ranking for initial scheduling and explicit reflow.
  Rationale: A Team should receive a duty based on the same elimination, loss, activity, rest, and stable identity rules regardless of which scheduling operation assigns it.
  Date/Author: 2026-09-03 / Codex

- Decision: Allow a Team to receive multiple duties when each duty satisfies normal availability and rest rules.
  Rationale: Team-duty capacity is a time-window constraint, not a one-duty-per-event limit. Removing a Team forever can make Full Coverage fail even when the schedule has valid non-overlapping assignments.
  Date/Author: 2026-09-03 / Codex

## Outcomes & Retrospective

The scheduler now uses one deterministic Team-duty ranking for initial placement and explicit reflow. A Team can receive multiple non-overlapping duties when the availability rules allow it. The site test matrix passes. The existing mobile implementation already carries the canonical priorities, staffing fields, Room state, and warning split. Mobile Gradle execution is blocked by the sandbox returning `Access is denied` for the Gradle wrapper. The Issue 43 changes are committed on the Workstream branch.

## Context and Orientation

The site package is `apps/site`. `EventBuilder.ts` places the Match Graph and assigns initial named officials and Team duties. `officialStaffing.ts` defines the canonical Staffing Priority policy adapter and deterministic named-official matching. `reschedulePreservingLocks.ts` preserves existing placements and replaces missing Team duties during explicit reflow. `eventScheduleMutation.ts` combines unresolved staffing warnings with proposal diagnostics.

The mobile package is `apps/mobile`. `OfficialStaffing.kt` defines the five shared Staffing Priority values and assignment models. Event Editor DTOs and Room persistence carry the selected priority, Team-duty settings, named positions, and event officials. Mobile must observe server results and must not turn optional warnings into hard causes.

A hard requirement is a staffing condition that can leave a Match Unscheduled. Optional staffing is assigned when possible and is reported as a warning when it remains unresolved. A Team-duty assignment must not use either playing Team in the same Match.

## Context Boundary

The minimum source set is Issue 43 and its comments, root `AGENTS.md`, `apps/site/AGENTS.md`, `apps/mobile/AGENTS.md`, `PLANS.md`, `apps/site/src/server/officials/config.ts`, `apps/site/src/server/scheduler/officialStaffing.ts`, `apps/site/src/server/scheduler/EventBuilder.ts`, `apps/site/src/server/scheduler/reschedulePreservingLocks.ts`, `apps/site/src/server/scheduler/eventScheduleMutation.ts`, the affected site tests, and the mobile staffing, DTO, mapper, Room, and warning-state tests.

Read the exact Event Editor route and contract files only if a changed staffing field crosses the HTTP boundary. Read database isolation guidance before a backend-backed mobile test. Expand the source set if a test proves that a changed field reaches a new DTO, mapper, persistence entity, or UI state.

## Plan of Work

First, add a failing site regression for a hard Team-duty event with more Matches than Teams where later duties are non-overlapping. The regression must prove that a Team can serve again after the scheduler checks its activity and rest. Add a deterministic ranking regression that gives candidate Teams different loss and activity histories and verifies the approved order.

Next, extract or share the Team candidate ranking used by `reschedulePreservingLocks.ts`. The shared function must exclude playing Teams, apply Division eligibility, apply overlap and rest checks at the caller seam, then rank candidates by elimination status, most recent loss, current duty count, longest rest, and stable Team ID. Initial scheduling may not require check-in because check-in is only an explicit reflow input.

Replace the initial `unassigned` rotation in `EventBuilder.assignTeamOfficials` with the shared candidate selection. Keep conflict-allowed behavior explicit. Preserve the existing hard Team-duty failure when no eligible candidate remains. Do not change named-official eligibility or the five priority meanings unless a focused regression proves a defect.

Then verify each canonical priority through the scheduler and proposal response. Full Coverage must require named positions and Team duties. Team Coverage must require Team duties but not named officials. Official Coverage must require named officials but not Team duties. Best Available must place Matches and expose unresolved slots as optional warnings. Full Coverage with Conflicts Allowed must keep eligible named assignments and Team duties while marking permitted conflicts.

Finally, add or update mobile tests only where a complete round trip is missing. Every canonical priority must encode its own value. The selected priority, Team duties, named positions, and event officials must survive decode and Room persistence. Optional staffing warnings must remain warnings and must not populate hard Restricting Factors.

## Concrete Steps

Run commands from `apps/site` for site work and from `apps/mobile` for Gradle work. Use the existing local backend and database only when a backend-backed test requires them; do not change their runtime state without current authorization.

Use focused tests during implementation:

    npm test -- --runInBand src/server/scheduler/__tests__/officialStaffingModes.test.ts
    npm test -- --runInBand src/server/scheduler/__tests__/reschedulePreservingLocks.test.ts

Then run the relevant mobile module tests and the complete affected site and Android suites. Run `npx tsc --noEmit` and `npm run lint:changed` from `apps/site`. Run the code-review skill against the Issue 43 change base before committing.

## Validation and Acceptance

The site must pass tests for all five priorities. A hard shortage must return the correct Restricting Factor. Optional Team-duty and named-position gaps must keep all Matches placed and must appear only as assignment warnings. The scheduler must never assign a playing Team to its own Match.

Two or more non-overlapping Team duties for one Team must succeed when the Team has the required rest. Candidate selection must prefer an eliminated Team, then a recent loser with no remaining Match, then a recent loser with a remaining Match, then other eligible Teams. Assignment count, longest rest, and stable Team ID must resolve ties.

The same event input must produce the same named-official and Team-duty assignments. Mobile must preserve the five canonical priority strings and the structured assignment data through decode and Room persistence. Web and mobile must show optional staffing gaps as warnings, not hard causes.

## Idempotence and Recovery

The scheduler must remain deterministic and must not mutate unrelated user or Team history while evaluating candidates. If a focused regression fails, preserve the existing successful schedule behavior and narrow the change to the shared staffing seam. Do not stage or modify the unrelated dirty files already present in the Workstream worktree.

## Artifacts and Notes

The current Workstream branch contains the Issue 42 diagnostics implementation and pre-existing local environment changes. Issue 43 changes must be isolated by file when staging. The linked-worktree Git metadata is outside the writable workspace, so a commit may require an approved Git operation even after the files are complete.

## Interfaces and Dependencies

The canonical site type is `StaffingPriority` from `apps/site/src/server/officials/config.ts`. A `Match` exposes `requiresTeamOfficial`, `reservesTeamOfficial`, `teamOfficial`, and named `officialAssignments`. `OfficialStaffingPlanner` remains the source of hard-coverage decisions. Team-duty candidate selection must use the existing `Team`, `Match`, `Division`, and event types and must not add a second priority vocabulary.
