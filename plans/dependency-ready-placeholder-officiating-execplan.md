# Place Match Graphs by Readiness and Stable Officiating Slots

This ExecPlan is a living document. Maintain the `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` sections while work continues.

Maintain this document in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

Event Hosts need a Schedule that uses every eligible Resource without breaking Match Graph order. A Match can start after all of its incoming Matches finish and the required rest ends. It must not wait for an unrelated conceptual round to finish.

The Schedule must also exist before every entrant or official is known. Placeholder Teams reserve stable entrant and Team-duty slots. Unbound named Official Positions remain real assignment slots with no fake User. An accepted Participant Registration claims one Placeholder Team in place. The claim keeps Match IDs, graph links, Resources, and times unchanged.

The visible proof has three parts. A dependency-ready scheduler test shows a downstream Match using an idle Resource. Registration route tests show free and paid registrations claiming the same stable EventTeam row. The Event editor shows one canonical Staffing Priority control and saves its value.

## Progress

- [x] (2026-08-17) Read issue #94, `CONTEXT.md`, ADR 0008, repository rules, and the current scheduler, persistence, registration, and form seams.
- [x] (2026-08-17) Add failing placement tests for dependency readiness, numerical participant demand, deterministic ordering, and stable Match identity.
- [x] (2026-08-17) Add failing free and paid Participant Registration tests for in-place Placeholder Team claims and transaction rollback.
- [x] (2026-08-17) Add failing Staffing Priority tests for each canonical priority and stable unbound named-position slots.
- [x] (2026-08-17) Add failing Schedule Reflow tests for check-in filtering, Division scope, conflicts, rest, imminent Matches, and deterministic ranking.
- [ ] Implement dependency-ready Match placement and hard numerical reservations.
- [ ] Implement canonical Staffing Priority behavior and persistence.
- [ ] Implement stable Placeholder Team claims for free and paid acceptance.
- [ ] Implement checked-in Team-duty replacement during explicit Schedule Reflow.
- [ ] Add the canonical Staffing Priority host control.
- [ ] Run focused scheduler, registration, persistence, and form tests.
- [ ] Run the complete site test suite, TypeScript check, Prisma validation, and lint.
- [ ] Start the site and verify the changed Event editor flow in a browser.
- [ ] Review the final change against repository standards and issue #94, then resolve all actionable findings.
- [ ] Commit the completed change to the current branch.

## Surprises & Discoveries

- Observation: the restored scheduler still used a global regular-round barrier.
  Evidence: the first dependency-readiness test failed because the ready downstream Match started after both remaining opening Matches instead of using one idle Resource in the second wave.

- Observation: current placement used known Team objects as the only participant-capacity signal.
  Evidence: unresolved Bracket Matches could be scheduled without reserving both playing-Team slots, so numerical demand and known-identity conflicts need separate checks.

- Observation: named Official Position assignments are stored in the `Matches.officialIds` JSON field, not in a separate Prisma assignment table.
  Evidence: `prisma/schema.prisma` defines `Matches.officialIds Json?` and has no MatchOfficialAssignment model.

- Observation: paid registration changed the reservation to `ACTIVE` before a stable Placeholder Team claim completed.
  Evidence: the new webhook rollback test failed with the reservation at `ACTIVE` after Division membership synchronization failed.

- Observation: check-in context was not available at the Team-duty replacement seam.
  Evidence: direct Schedule Reflow tests selected an unchecked same-Phase Team before the new operation context was supplied.

## Decision Log

- Decision: use one canonical `StaffingPriority` with five values: `FULL_COVERAGE_REQUIRED`, `TEAM_COVERAGE_REQUIRED`, `OFFICIAL_COVERAGE_REQUIRED`, `BEST_AVAILABLE_COVERAGE`, and `FULL_COVERAGE_WITH_CONFLICTS_ALLOWED`.
  Rationale: issue #94 and the project glossary define one vocabulary. A second active mode vocabulary would make placement and UI behavior ambiguous.
  Date/Author: 2026-08-17 / Codex

- Decision: map legacy modes at input and migration boundaries. Map `STAFFING` to `OFFICIAL_COVERAGE_REQUIRED`, `TEAM_STAFFING` to `TEAM_COVERAGE_REQUIRED`, `SCHEDULE` to `BEST_AVAILABLE_COVERAGE`, and `OFF` to `FULL_COVERAGE_WITH_CONFLICTS_ALLOWED`.
  Rationale: this preserves legacy intent while every canonical operation uses one priority.
  Date/Author: 2026-08-17 / Codex

- Decision: represent an unbound named Official Position in the existing assignment JSON.
  Rationale: each `(positionId, slotIndex)` remains stable without a fake User or a new persistence model. The holder fields are nullable.
  Date/Author: 2026-08-17 / Codex

- Decision: mutate a claimed Placeholder EventTeam row in place.
  Rationale: the EventTeam ID is the stable Schedule slot already referenced by Match entrants, Team duties, Divisions, and the accepted EventRegistration. In-place mutation needs no Match rewrite.
  Date/Author: 2026-08-17 / Codex

- Decision: use Team Check-In only when an explicit reschedule or Schedule Reflow operation selects a missing Team-duty replacement.
  Rationale: check-in is event-day input. It must not invalidate a current Schedule, change initial placement, or change Participant Registration acceptance.
  Date/Author: 2026-08-17 / Codex

## Outcomes & Retrospective

Implementation is in progress. The red tests establish the intended public behavior. The main remaining risks are the breadth of legacy scheduling-mode call sites, transaction ordering in the paid webhook, and deterministic interaction between graph readiness and hard staffing reservations.

## Context and Orientation

The site package is `apps/site`. The canonical scheduling entry point is `apps/site/src/server/scheduler/scheduleEvent.ts`. `EventBuilder` builds a complete Match Graph before it places Matches. `Schedule` owns Time Slot, Resource, and participant occupancy. `officialStaffing.ts` assigns named officials. `reschedulePreservingLocks.ts` performs Schedule Reflow while protecting Match history and locks.

A Match Graph is the set of Matches plus winner and loser advancement links. A dependency-ready Match is a Match whose incoming Matches already have placed end times. Its earliest legal start is the latest incoming end plus the configured rest interval.

A Phase Division owns a Match Graph section. An Entry Division owns accepted Participant Registrations. `EventDivisionPhaseSources` maps an Entry Division into a Phase Division. A Placeholder Team is an `EventTeams` row with `kind = PLACEHOLDER`. It is a stable Schedule slot, not an accepted registration.

An Officiating Plan contains Team duties and named Official Positions. Staffing Priority decides which shortage is hard. Full Coverage requires both parts. Team Coverage requires only a Team duty. Official Coverage requires only all named positions. Best Available preserves placement with visible unresolved slots. Conflicts Allowed can bind an otherwise eligible official who overlaps and marks the assignment conflict.

Event schedule persistence is in `apps/site/src/server/repositories/events.ts`. Scheduler JSON conversion is in `apps/site/src/server/scheduler/serialize.ts`. Event editor contracts are in `apps/site/src/contracts/EventEditor.ts`. Event and EventTemplate storage is in `apps/site/prisma/schema.prisma`.

Free registration acceptance is handled by `apps/site/src/app/api/events/[eventId]/participants/route.ts`. Paid reservation creation is in `apps/site/src/app/api/billing/purchase-intent/route.ts`. Paid acceptance is in `apps/site/src/app/api/billing/webhook/route.ts`. The shared in-place EventTeam claim belongs in `apps/site/src/server/teams/teamMembership.ts`.

The host form is under `apps/site/src/app/events/[id]/schedule/components/eventForm`. It already separates Team officiating from named Official Positions. It must add one Staffing Priority field without adding a second host-facing vocabulary.

## Plan of Work

First, replace the global round barrier in `EventBuilder.placeMatchGraph`. Process the complete graph in deterministic topological order. For each Match, calculate the latest dependency end plus rest. Ask `Schedule` for the earliest eligible Resource window at or after that lower bound. Keep a numerical occupancy ledger for unknown entrant demand. Keep known Team and official conflicts as identity checks.

Next, implement canonical Staffing Priority. Normalize old values only at boundaries. Thread the canonical value through scheduler event models, Event and EventTemplate persistence, API contracts, and form state. Make the named-official planner preserve every configured position slot. Use null holder IDs for unresolved slots. Apply hard feasibility only to the shortage types selected by the priority.

Then, implement the stable Placeholder Team claim. Lock the Event during acceptance. Select one deterministic Placeholder Team in the requested Entry Division or use the reserved ID from paid metadata. Update that EventTeam row in place with the canonical Team details. Point the accepted EventRegistration at the stable EventTeam ID. Synchronize Entry and Phase Division membership in the same transaction. Do not write Matches.

Then, implement Team-duty replacement for explicit Schedule Reflow. Pass checked-in Team IDs as operation context. Keep any existing duty unchanged. For a missing required duty, filter candidates by check-in, Phase Division or mapped Entry Division, play and duty overlap, rest, and imminent Match. Rank eliminated Teams, recent losers, then other eligible Teams. Use assignment count, longest rest, and stable Team ID as tie-breakers.

Finally, update the Event Host form. Show one `Staffing Priority` control with the five canonical choices. Keep Team officiating and Official Position editors independent. Normalize a legacy loaded record before display. Submit the canonical value for create, edit, and template flows.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/bracketiq/apps/site` unless a command names another directory.

Run the focused scheduler tests:

    node node_modules/jest/bin/jest.js --runInBand \
      src/server/scheduler/__tests__/eventScheduleMutation.test.ts \
      src/server/scheduler/__tests__/leagueScheduleMatrix.test.ts \
      src/server/scheduler/__tests__/officialStaffingModes.test.ts \
      src/server/scheduler/__tests__/reschedulePreservingLocks.test.ts

Run the focused registration tests:

    node node_modules/jest/bin/jest.js --runInBand \
      src/app/api/events/__tests__/participantsRoute.test.ts \
      src/app/api/billing/__tests__/purchaseIntentRoute.test.ts \
      src/app/api/billing/__tests__/webhookRoute.test.ts

Run related persistence and form tests identified by the changed files. Then run:

    npx prisma validate --schema prisma/schema.prisma
    npx tsc --noEmit
    node node_modules/jest/bin/jest.js --runInBand
    npm run lint

Start the application with the repository development command. Open an editable Event schedule in the browser. Verify that the form shows one Staffing Priority field, keeps Team officiating and named positions separate, saves the selected value, and restores it after reload.

## Validation and Acceptance

Placement acceptance requires a complete graph. Four of six opening Matches use four Resources in wave one. Two remaining opening Matches use two Resources in wave two. A downstream Match whose dependencies are complete may use either other Resource in wave two. Every dependent Match starts after its latest incoming Match plus rest. The same input gives the same placement.

Staffing acceptance requires position-aware matching. A missing eligible R2 blocks Full Coverage and Official Coverage even when total official count is sufficient. Team Coverage blocks only a missing Team duty. Best Available keeps the Match placed and emits stable unbound assignment slots. Conflicts Allowed keeps bound assignments and marks accepted overlaps.

Registration acceptance requires one transaction. One Placeholder EventTeam row changes to `REGISTERED` but keeps its ID. All Match entrant and Team-duty references resolve through that same row without a Match write. Entry and mapped Phase Division membership contains the stable row ID. The real registration consumes capacity; remaining placeholders do not. Any claim or membership failure rolls back the EventTeam and registration state.

Reflow acceptance requires host intent and check-in input. Check-in changes alone perform no scheduling write. An existing unchecked Team duty remains unchanged. A missing duty can select only a checked-in, in-scope, conflict-free Team. Ranking is deterministic. A hard required-replacement failure leaves the previous Schedule unchanged.

UI acceptance requires one canonical field on create, edit, and template flows. The payload carries one of the five canonical values. The old mode label is not shown as a second choice.

## Idempotence and Recovery

The scheduler and tests are deterministic and safe to run repeatedly. The migration uses a transaction and backfills every old row before it makes canonical columns required. Do not run migration deployment against a shared database during local validation.

Participant Registration uses the existing Event lock and database transaction. A retry first detects an existing accepted registration or a previously claimed EventTeam. It must not claim a second placeholder.

If a focused test fails, fix the source behavior. Do not weaken assertions, add timing sleeps, or special-case fixture IDs. Preserve unrelated working-tree edits.

## Artifacts and Notes

The initial red scheduler run reported 15 failures across the new Staffing Priority and Team-duty reflow cases. The initial red placement run reported the downstream Match after the round barrier and the wrong known-Team selection. The initial red registration run reported missing in-place claim arguments and paid rollback ordering.

The companion accepted decision record is `docs/adr/0008-place-match-graphs-by-readiness-and-placeholder-backed-officiating.md`. The domain vocabulary is in `CONTEXT.md`. GitHub issue #94 is the authoritative behavior specification.

## Interfaces and Dependencies

`StaffingPriority` is one shared string union with the five canonical values. A normalization helper accepts an explicit canonical value and can map a legacy `OfficialSchedulingMode` at input boundaries.

`MatchOfficialAssignment.userId` and `MatchOfficialAssignment.eventOfficialId` are nullable. Each configured position produces one assignment record per `slotIndex`, including when no User is bound.

`rescheduleEventMatchesPreservingLocks` accepts optional Team-duty reflow context with an event checked-in Team set and a per-Match checked-in Team set. Existing callers can omit the context.

The stable claim helper accepts a transaction client, Event ID, canonical Team ID, optional reserved Placeholder EventTeam ID, Division selection, and registration metadata. It returns the stable claimed EventTeam ID. The caller writes the accepted EventRegistration and runs Division synchronization in the same transaction.

Plan created on 2026-08-17 after the red behavioral tests were established. It records the implementation seams and migration decisions so work can resume from the repository alone.
