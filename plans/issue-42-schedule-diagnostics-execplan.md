# Produce evidence-based schedule diagnostics during placement

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must stay current while work proceeds.

Maintain this document in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this work, a failed or incomplete schedule proposal tells an organizer how many Matches the complete Match Graph requires, how many Matches the configured Resource windows can hold as an optimistic upper bound, and which scheduling restrictions the placement search actually observed. The proposal does not infer a cause from an exception message. It does not claim that total Resource capacity is insufficient when the upper bound meets or exceeds Match Demand.

The placement search records evidence while it evaluates candidate Resource and time assignments. Required Official coverage participates in the same candidate decision. The scheduler commits the Match time, Resource, and required Official assignments together. Optional Official coverage does not block Match placement.

An organizer can verify the result in the web and mobile proposal review dialogs. Both clients show Match Demand, Estimated Capacity, the minimum capacity deficit, evidenced Restricting Factors, and only the remedies supported by that evidence. Mobile proposal diagnostics stay transient. Accepted Event and Schedule data remains authoritative in Room.

## Progress

- [x] (2026-09-03 17:52Z) Review Issue 42, the current scheduler, proposal contracts, web proposal review, and mobile proposal review.
- [x] (2026-09-03 17:52Z) Record the design decisions for in-search placement evidence and required Official coverage in this ExecPlan.
- [ ] Claim Issue 42 and set its project Status to `In progress` when implementation starts.
- [ ] Create a fresh Issue 42 Workstream branch after the prerequisite Issue 35 and Issue 36 work reaches `main`.
- [ ] Add the canonical scheduling diagnostic types and the Resource capacity calculation.
- [ ] Record structured candidate rejection evidence during Match placement.
- [ ] Make required named Official and Team-duty coverage part of candidate feasibility.
- [ ] Add evidence-based diagnostic aggregation and remedies.
- [ ] Add the versioned site HTTP contract and both site proposal review displays.
- [ ] Add mobile decoding, validation, review display, and accessibility behavior.
- [ ] Add focused scheduler, contract, web, mobile, and backend-backed integration tests.
- [ ] Run the complete site and Android JVM suites that cover the changed contract.
- [ ] Run the final two-axis code review and resolve every finding.

## Surprises & Discoveries

- Observation: The current backend already derives Match Demand from generated and persisted Match Graph nodes.
  Evidence: `apps/site/src/server/scheduler/matchGraph.ts` defines `matchDemandFromGraph` and `matchDemandFromPersistedGraph`. The existing Event Editor snapshot schema exposes optional Match Demand.

- Observation: The current failure interface loses most placement evidence.
  Evidence: `apps/site/src/server/scheduler/scheduleErrors.ts` stores only a message and one `restrictingFactor`. `apps/site/src/server/scheduler/EventBuilder.ts` reduces a failed Match placement to the Match ID, message, and factor.

- Observation: The existing capacity message is an estimate based on summed slot minutes and an event-level duration with a hard-coded buffer.
  Evidence: `describeScheduleFailure` in `apps/site/src/server/scheduler/scheduleEvent.ts` builds prose after failure and does not compare the estimate with Match Demand before it emits the insufficient-time message.

- Observation: One-Time Time Slot availability already unions overlapping windows per Resource.
  Evidence: `calculateOneTimeAvailabilityMinutes` in `apps/site/src/server/scheduler/timeSlotAvailability.ts` groups and merges resolved windows. Recurring and One-Time intervals do not yet share one diagnostic calculation.

- Observation: The named Official planner already distinguishes hard coverage from best-available coverage.
  Evidence: `OfficialStaffingPlanner.hasStaffingRequirement` in `apps/site/src/server/scheduler/officialStaffing.ts` requires both hard Official coverage and at least one required position slot.

- Observation: The mobile maintenance parser validates an exact key set.
  Evidence: `apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventEditorRemoteGateway.kt` must add every new diagnostic field to its maintenance outcome and warning validation.

## Decision Log

- Decision: Generate the complete Match Graph before placement, but do not schedule the graph before assigning required Officials.
  Rationale: The complete graph is required for Match Demand and dependency structure. A Match with hard Official coverage is complete only when its time, Resource, and required Official assignments are valid together.
  Date/Author: 2026-09-03 / Codex with user direction.

- Decision: Record causal evidence inside the placement search.
  Rationale: The placement search knows which Resource, time, Team, dependency, Division, and Official checks rejected each candidate. Later text parsing cannot recover these facts reliably.
  Date/Author: 2026-09-03 / Codex with user direction.

- Decision: Keep global capacity facts separate from placement feasibility.
  Rationale: Estimated Capacity is an optimistic Resource-only upper bound. It intentionally ignores Teams, dependencies, Division order, and staffing. An upper bound that meets Match Demand does not prove that a complete schedule exists.
  Date/Author: 2026-09-03 / Codex.

- Decision: Call the reported deficit `minimumDeficitMatches` in the implementation and explain it as the minimum capacity deficit in the UI.
  Rationale: When Estimated Capacity is an upper bound, actual capacity can be lower. If the upper bound is below Match Demand, `Match Demand - Estimated Capacity` is the minimum number of Matches that cannot fit.
  Date/Author: 2026-09-03 / Codex.

- Decision: Treat named Official availability as a placement restriction only when `OfficialStaffingPlanner.hasStaffingRequirement(match)` is true.
  Rationale: This condition means the staffing policy requires full named Official coverage and the Match has required position slots. Best-available coverage must not prevent Match placement.
  Date/Author: 2026-09-03 / Codex with user direction.

- Decision: Commit a Match time, Resource, and required staffing assignments as one scheduling decision.
  Rationale: A later staffing pass must not discover that a schedule reported as complete violates a hard staffing policy.
  Date/Author: 2026-09-03 / Codex with user direction.

- Decision: Distinguish Official inventory, qualification, concurrency, and time-alignment restrictions.
  Rationale: More Time Slots can resolve a concurrency or alignment restriction. More Time Slots cannot resolve a Match that requires more simultaneous qualified Officials than the roster can provide.
  Date/Author: 2026-09-03 / Codex with user direction.

- Decision: Show an add-or-extend-Time-Slots remedy for an Official restriction only when a shadow search finds a time with complete staffing and no Resource Time Slot.
  Rationale: This makes the remedy evidence-based. It prevents a generic Time Slot recommendation when no alternate staffed time exists.
  Date/Author: 2026-09-03 / Codex.

- Decision: Do not add general backtracking to Issue 42.
  Rationale: Issue 42 concerns truthful diagnostics. The search evidence must state whether it is global or local to the current placement state. The recorded blocker IDs can support a later conflict-directed repair issue without expanding this work into a new scheduler.
  Date/Author: 2026-09-03 / Codex.

- Decision: Use Event Editor contract version 4 for required diagnostics and retain a temporary version 3 response adapter during the independent site and mobile release sequence.
  Rationale: The maintenance parser is strict. Adding required fields under version 3 would break an existing mobile client. The site remains the HTTP contract owner.
  Date/Author: 2026-09-03 / Codex.

## Outcomes & Retrospective

The design and implementation sequence are recorded. No Issue 42 product code has been implemented. Update this section after each milestone. At completion, compare the observed proposal behavior with every Issue 42 acceptance criterion and record the final test results, commit references, and any retained version 3 compatibility work.

## Context and Orientation

Issue 42 is `Report Match Demand, Estimated Capacity, and Restricting Factors`. It covers the Next.js backend and web application under `apps/site` and the Kotlin Multiplatform client under `apps/mobile`. The site owns the HTTP contract.

A Match Graph is the complete set of Matches and dependency links generated for an Event. Match Demand is the number of nodes in that complete graph. Match placement assigns a graph node to a Resource and time. A Resource is a playable field, court, or equivalent scheduling location.

A canonical Resource interval is a concrete Resource availability window inside the proposal planning horizon. Canonicalization expands recurrence, expands global availability to actual Resources, applies eligibility, clips to the horizon, and merges duplicate or overlapping windows for the same Resource.

Estimated Capacity is the number of Match-sized placements that canonical Resource intervals could hold under optimistic assumptions. It is an upper bound. It ignores Team, dependency, staffing, and Division-order conflicts. It must never be presented as proof that all Matches can be scheduled.

A candidate placement is one Resource, start time, and end time considered by the scheduler for one Match. A placement search journal is a bounded structured summary of candidate rejections. It stores counts and a small stable sample of IDs and intervals. It does not store an unbounded log.

A hard staffing requirement means the configured staffing policy requires a complete assignment. Named Official coverage is hard only when `OfficialStaffingPlanner.hasStaffingRequirement(match)` returns true. Team-duty coverage is hard only when `OfficialStaffingPlanner.isHardTeamCoverageRequired(match)` and `isTeamDutyRequired(match)` are both true.

The current scheduler lives primarily in `apps/site/src/server/scheduler/Schedule.ts`, `EventBuilder.ts`, `officialStaffing.ts`, and `scheduleEvent.ts`. The site contract lives in `apps/site/src/contracts/eventEditor.ts`. Create and maintenance proposal assembly lives in `apps/site/src/server/events/eventEditorSave.ts` and `apps/site/src/server/scheduler/eventScheduleMaintenance.ts`. The web review is in `apps/site/src/app/events/[id]/schedule/page.tsx`.

The mobile DTOs live in `apps/mobile/core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventEditorDtos.kt`. Response validation lives in `apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventEditorRemoteGateway.kt`. Create review UI lives in `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventScreen.kt`. Maintenance review UI lives in `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailOverlayHost.kt`.

## Context Boundary

The minimum source set is Issue 42 with all comments, root `AGENTS.md`, `apps/site/AGENTS.md`, `apps/mobile/AGENTS.md`, `PLANS.md`, and the files named in `Context and Orientation`. Read `apps/site/src/server/scheduler/divisionPhaseRules.ts` and `matchTimingPolicy.ts` when extracting the canonical Match duration. Read `apps/site/src/server/officials/config.ts` when implementing the hard staffing policy gate.

Read `docs/agents/workstream-database-isolation.md` before running the backend-backed mobile contract test. Read the exact Event Editor route only when the version 4 transport work starts. Read mobile mappers or encoders only if the diagnostic fields pass through them. Do not read parent or closed blocker issues unless a current Issue 42 acceptance criterion remains ambiguous after the issue comment and this plan.

Do not read unrelated scheduler plans. Use existing parity fixtures only when a new regression test consumes them. Expand the source set when a changed HTTP field reaches an additional DTO, parser, mapper, or caller that is not listed here.

## Plan of Work

First, add a pure diagnostic model under `apps/site/src/server/scheduler`. Define Match Demand, Estimated Capacity, minimum deficit, search completeness, Restricting Factor evidence, and Possible Remedy types. Keep this model independent of HTTP and UI text. Add one entry point named `diagnoseScheduleProposal` that accepts the Event, complete Match Graph, and placement failures and returns the complete diagnostic result.

Build canonical Resource intervals before Match placement. Materialize recurring Time Slots within the same finite horizon used by the proposal. Resolve One-Time Time Slots through the existing canonical resolver. Expand global Time Slots to each Event Resource. Apply Resource and Division eligibility. Clip intervals to the horizon. Union overlapping and adjacent windows for the same Resource without counting the same Resource minute twice. Preserve stable Resource, Division, and Time Slot IDs as evidence.

Resolve each Match's on-Resource duration through the same timing rules used by `EventBuilder`. Include internal segment breaks. Do not include Team rest or dependency buffers in Resource capacity because those limits receive separate factors. For each canonical interval, use the shortest eligible configured Match duration to calculate an optimistic slot count. Sum the slot counts to produce Estimated Capacity. Also calculate Division-specific upper bounds.

Calculate controlled bounds with eligibility and fragmentation relaxed. A total Resource-time restriction is globally proven only when capacity remains below Match Demand after both restrictions are relaxed. Eligibility is proven when relaxing eligibility makes the upper bound meet demand. Fragmentation is proven when pooling separated minutes makes the upper bound meet demand. Record both restrictions when they interact and neither single relaxation is sufficient.

Next, add a placement search journal to `Schedule`. The journal records the complete candidate count, whether the search was exhaustive, rejection counts by factor, and a bounded stable sample of affected Match, Team, Resource, Division, dependency, Time Slot, and Official IDs. Candidate start times are the times where feasibility can change: interval starts, conflict ends, dependency-ready times, Division-order cursors, and staffing conflict ends. Evaluate every relevant predicate for a candidate before the candidate is rejected. Do not choose a cause based on predicate order.

Return structured placement failure evidence through `ScheduleError` or a discriminated placement result. Preserve the existing success path. `EventBuilder` must aggregate the structured failures without reducing them to message text. A factor is `PROVEN_GLOBAL_BOUND` when the capacity calculation proves it. A factor is `PROVEN_FOR_ATTEMPT` when it rejects every examined candidate in an exhaustive search. A factor is `OBSERVED` when it rejects only some candidates. Bounded searches cannot produce a global claim.

Integrate Official matching into candidate feasibility. For a Match with hard named Official coverage, obtain its required position slots. Build a bipartite graph from required position slots to eligible Event Officials. An edge exists when the Official is active, can fill the position, can serve the Resource, and has no prohibited Team or assignment conflict. Use a deterministic augmenting-path matching algorithm. The candidate is staffable when the matching size equals the required slot count.

Run the Official matching twice for diagnostics. Static matching ignores time conflicts and identifies inventory or qualification shortages. Candidate matching includes time conflicts and identifies concurrency or alignment shortages. More Time Slots are not a remedy for a static shortage. Adding an eligible Official is a remedy when an otherwise valid candidate lacks one or more required assignments.

When static Official matching succeeds but every otherwise valid Resource candidate fails candidate-time matching, run a shadow search inside the Event horizon. The shadow search keeps Team, dependency, Division-order, duration, and hard staffing constraints but relaxes Resource Time Slot coverage. If it finds a staffed time, emit `ADD_OR_EXTEND_TIME_SLOTS` with that time and the missing Resource coverage as evidence. Otherwise, do not emit the Time Slot remedy.

Keep optional Official coverage outside hard candidate rejection. For best-available staffing, place the Match and retain an optional staffing warning. Keep Team-duty evidence and remedies separate from named Official evidence.

Then, replace `describeScheduleFailure` and message-text classification with diagnostic summary rules. When the Resource upper bound is below Match Demand, report the minimum deficit. When the upper bound meets or exceeds Match Demand, state that total Resource capacity is not proven insufficient. When no factor is globally or locally proven, use the canonical non-causal message and return no remedies.

Add diagnostics to version 4 create and maintenance proposal outcomes in `apps/site/src/contracts/eventEditor.ts`. Keep a version 3 adapter during rollout. Version 3 responses omit version 4 diagnostics. Version 4 requires them for incomplete or failed scheduling proposals. Update all proposal builders and accepted-result paths together.

Render the canonical result in both web proposal dialogs. The web code must not infer factors. Update mobile DTOs and strict response validation for the complete version 4 shape. Render the same values on Android and iOS. Group the demand, upper bound, minimum deficit, factors, evidence, and remedies into explicit text and accessibility semantics. Do not use color as the only indicator.

Keep mobile diagnostics in the existing transient proposal review state. Do not add Room entities or columns for diagnostics. After acceptance, keep the existing flow that refreshes authoritative Event and Schedule rows into Room.

## Milestones

### Milestone 1: Canonical demand and capacity facts

At the end of this milestone, one pure scheduler module returns Match Demand, canonical Resource intervals, Estimated Capacity as an upper bound, and the minimum deficit. It handles recurring and One-Time windows, duplicate overlaps, multiple Resources, Division eligibility, mixed Match durations, and fragmented windows. Focused site tests demonstrate each calculation without running the full proposal workflow.

### Milestone 2: In-search placement evidence

At the end of this milestone, failed Match placement returns a structured search journal. Resource, Team, dependency, eligibility, Division order, fragmented-window, named Official, and Team-duty checks record rejection evidence at the point of evaluation. Tests prove that predicate order does not change the factor summary and that a bounded search does not produce a global claim.

### Milestone 3: Required Official feasibility and remedies

At the end of this milestone, hard named Official coverage participates in each candidate placement. Static and candidate-time bipartite matching distinguish inventory from concurrency. Optional coverage does not block placement. A Time Slot remedy appears only when the shadow search finds a staffed time without Resource coverage. An add-Officials remedy appears only for an otherwise valid candidate with an assignment deficit.

### Milestone 4: Canonical proposal contract and web review

At the end of this milestone, version 4 create and maintenance proposal results carry the same diagnostic structure. Version 3 remains usable during rollout. The web create and maintenance dialogs show the canonical facts and remedies. The eight-Team fixture and true insufficient-time fixtures produce noncontradictory output.

### Milestone 5: Mobile parity and final proof

At the end of this milestone, Android and iOS decode and present all diagnostic fields. Screen readers announce every value. Diagnostics remain transient. A backend-backed mobile test sends a client-produced version 4 request through the real site route, decodes the proposal, accepts it when applicable, and confirms that authoritative Event and Schedule data returns through Room.

## Concrete Steps

From the repository root, claim Issue 42 and set its project Status to `In progress`. Create the approved isolated Workstream from a clean current `main`. Do not implement this plan on the completed Issue 36 branch.

From `apps/site`, add the diagnostic and scheduler tests first. Use focused commands while each milestone is active:

    npm test -- --runInBand src/server/scheduler/__tests__/scheduleDiagnostics.test.ts
    npm test -- --runInBand src/server/scheduler/__tests__/officialStaffingModes.test.ts
    npm test -- --runInBand src/server/scheduler/__tests__/leagueTimeSlots.test.ts
    npm test -- --runInBand src/server/scheduler/__tests__/eventScheduleMutation.test.ts
    npm test -- --runInBand src/server/scheduler/__tests__/eventScheduleMaintenance.test.ts

Add focused contract and web tests under the existing Event Editor and proposal test locations. Run them from `apps/site` with Jest file filters. Then run:

    npx tsc --noEmit

From `apps/mobile`, add DTO, strict response validation, proposal review, and accessibility tests. Run focused module tests:

    .\gradlew --no-daemon :core:network:testDebugUnitTest --tests "com.razumly.mvp.core.network.dto.EventEditorDtosTest"
    .\gradlew --no-daemon :core:repository-impl:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.EventEditorRemoteGatewayTest"
    .\gradlew --no-daemon :composeApp:testDebugUnitTest --tests "*ScheduleProposalDialogUiTest*" --tests "*EventDetailOverlayHostUiTest*"

Before the backend-backed contract test, read `docs/agents/workstream-database-isolation.md`. Use the worktree-local backend and database. Do not start or stop that runtime without current user authorization. With the authorized runtime active, run the focused `EventLifecycleMobileApiIntegrationTest` selector from `apps/mobile` with the documented loopback backend and isolated database environment.

At the final gate, merge current local `main` into the Workstream branch. Run the full affected suites from their application roots:

    npm test -- --runInBand
    npx tsc --noEmit
    .\gradlew --no-daemon :composeApp:testDebugUnitTest

Run the repository code-review skill against the batch base and Issue 42. Resolve every finding. Rerun affected checks. Commit the final changes. Add the Issue 42 close comment only after all acceptance criteria and the real mobile-to-site contract test pass.

## Validation and Acceptance

The complete Match Graph must be the only source of Match Demand. A test with regular-season and playoff nodes must report the exact graph total and exact Division and phase totals, independent of placement success.

Two duplicate two-hour Time Slots for one Resource must not produce four hours of capacity. One two-hour Time Slot on each of two Resources must count as four Resource-hours. A Resource that is ineligible for the affected Division must not contribute to that Division's upper bound.

A fragmented-window test must use separated 45-minute and 75-minute intervals with 60-minute Matches. The pooled minutes equal two Match durations, but only one Match fits the canonical intervals. The result must identify fragmentation and must not call it a total Resource-minute shortage.

An eight-Team playoff regression must calculate demand from the complete graph. When Estimated Capacity meets or exceeds that demand, `minimumDeficitMatches` must be zero and the summary must not claim insufficient total capacity.

A true insufficient-time test must produce an Estimated Capacity below Match Demand. The displayed deficit must equal `Match Demand - Estimated Capacity`. The result must label Estimated Capacity as an upper bound.

A hard named Official test with two simultaneous Matches, one required Referee per Match, and one qualified Referee must identify Official concurrency. It may offer both `ADD_ELIGIBLE_OFFICIALS` and `ADD_OR_EXTEND_TIME_SLOTS` only when the shadow search proves an alternate staffed time.

A hard named Official test with one Match requiring two simultaneous Referees and only one qualified Referee must identify an inventory or qualification shortage. It may offer `ADD_ELIGIBLE_OFFICIALS`. It must not offer more Time Slots.

A best-available Official test with no available Referee must still place the Match. It may return an optional staffing warning. It must not return a named Official Restricting Factor.

A no-proven-cause fixture must use the canonical non-causal message and return an empty remedy list. Web and mobile must display that result without adding local advice.

The mobile accessibility test must find demand, upper-bound capacity, minimum deficit, each factor name, and each evidence value in semantics text. The result must remain understandable without badge color.

The backend-backed test must cross the real HTTP seam with a mobile-produced version 4 command. A mocked transport test does not satisfy this acceptance condition.

## Idempotence and Recovery

The diagnostic calculations are pure and can run repeatedly without changing the Event or Match Graph. The placement journal must not mutate scheduler state beyond the existing candidate placement behavior. Shadow searches must use cloned or read-only state and must not commit a proposed placement.

Keep version 3 and version 4 response adapters explicit and covered by tests. If version 4 decoding fails during rollout, the server can continue to serve version 3 callers without diagnostics. Do not weaken version 4 required fields to hide a parser mismatch.

Use a dedicated test database for backend-backed tests. Reuse the existing cleanup helper and exact operation and Event identifiers. Do not delete broad database content. Preserve unrelated worktree changes.

If the placement journal changes scheduler output, stop and reduce the change until success-path schedule fixtures remain stable. Evidence collection must observe decisions. It must not alter candidate ranking.

## Artifacts and Notes

The expected non-causal message is:

    The scheduler could not place all Matches. It did not prove one restricting factor.

The expected capacity statement when the upper bound meets demand is:

    Total Resource capacity is not proven insufficient.

The minimum deficit calculation is:

    minimumDeficitMatches = max(0, matchDemand.total - estimatedCapacity.matchUpperBound)

The required named Official policy gate is:

    planner.hasStaffingRequirement(match)

This is equivalent to hard named Official coverage plus at least one required Official position slot. Optional coverage is not a placement gate.

## Interfaces and Dependencies

Create a deep diagnostic module under `apps/site/src/server/scheduler`. Its external interface must stay small:

    diagnoseScheduleProposal({ event, matches, placementFailures }): ScheduleDiagnostics

The implementation can use internal pure helpers for canonical intervals, Match durations, capacity bounds, evidence aggregation, and remedy rules. Do not expose those helpers through the external interface only to make tests convenient. Test the observable result through `diagnoseScheduleProposal`. Add focused internal tests only for mathematically significant interval or matching algorithms.

`ScheduleDiagnostics` must contain `matchDemand`, `estimatedCapacity`, `minimumDeficitMatches`, `summaryCode`, `restrictingFactors`, `possibleRemedies`, and a canonical message. `estimatedCapacity` must contain `matchUpperBound`, the literal label `UPPER_BOUND`, Resource minutes, canonical interval count, and the planning horizon.

Each Restricting Factor must use a discriminated evidence type. Common fields are factor code, evidence level, affected Match IDs, examined candidate count, rejected candidate count, and search completeness. Factor-specific fields contain only stable IDs, counts, durations, and timestamps needed to explain the restriction.

Change the named Official preview interface in `apps/site/src/server/scheduler/officialStaffing.ts` so it returns a decision with assignments, completeness, required slot count, matching size, missing slots, and rejected Official reasons. Do not reduce this result to a boolean before the placement journal records it.

Use an in-process deterministic augmenting-path matcher for required Official slots. Do not add an external optimization library. Sort slots and Official IDs before matching so tests and proposal evidence remain stable.

The HTTP adapter in `apps/site/src/contracts/eventEditor.ts` owns versioned serialization. Mobile must not recreate diagnostic rules. Web and mobile receive the same canonical fields and message.

Plan revision note, 2026-09-03: Created the initial Issue 42 ExecPlan after review and design discussion. The plan records in-search causal evidence, atomic required staffing placement, evidence-based Official remedies, versioned cross-application contract work, and the required validation path.
