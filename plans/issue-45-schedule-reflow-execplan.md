# Implement atomic Schedule Reflow for issue 45


This plan follows root `PLANS.md`. Keep the progress, findings, decisions, and outcomes current.

## Purpose / Big Picture


After a Tournament Match changes, repair only the affected Schedule. Keep completed, in-progress, explicitly locked, and unaffected Matches unchanged. Try official reassignment at the published times before moving Matches. Move an affected Match only to a feasible time and Resource. Save the complete change or save nothing.

Issue: https://github.com/Razumly/bracketiq/issues/45. The user approved a shared planner, two Resource policies, bounded search, atomic persistence, mobile parity, and a walkthrough that calls the real planner.

## Progress


- [x] (2026-09-04 04:30Z) Read issue 45 and its comments. Claim the issue. Set project Status to In progress and Area to Shared.
- [x] (2026-09-04 04:40Z) Start the required merge from local main at `a877f70c849298c1eb1f0362209a7ff2c4badbfd`.
- [x] (2026-09-04 05:04Z) Verify and commit the merge resolution as `091b4e65c407ffbec1f87ed45b7ba3bb0faaa132`. Site typecheck and 41 Schedule tests passed. Mobile compilation and 61 billing tests passed.
- [x] Implement and test the shared, side-effect-free planner.
  - [x] Add affected-chain placement, joint staffing, field policies, input validation, and unresolved entrant reservations.
  - [x] Add the canonical rule adapter. Keep running Match occupancy and retained historical Resources separate from new placement eligibility.
  - [x] (2026-09-04 08:30Z) Pass 34 planner, adapter, and executable walkthrough tests. Benchmark connected 31, 127, and 511 Match graphs.
- [x] Add the versioned HTTP contract and atomic persistence.
  - [x] Add the version 1 contract, transaction service, and route. Five focused service tests pass.
  - [x] Verify real database rollback, authorization, revision races, assignment-only saves, and retained historical Resources. Five database tests pass.
  - [x] Verify HTTP rejection and unchanged-state failures. Six route tests pass.
- [x] Add mobile decoding and one-transaction Room refresh.
  - [x] Pass client-to-site serializer, time-change, Team Duty, no-op, failure, and Room rollback tests.
  - [x] Complete the named-official client-to-site case. All three focused Room tests pass, including time, Team Duty, and named-official variants.
- [ ] Connect the HTML walkthrough to the shared planner.
  - [x] Replace scripted outcomes with the real planner. Preserve explicit Team names and winner links. Correct the issue 46 transaction diagram.
  - [ ] Restart and inspect the local walkthrough after current runtime permission is supplied.
- [x] Run performance checks, complete relevant suites, and client-to-site integration. Record unrelated full-suite failures below.
- [ ] Complete the two-axis review. Fix findings. Commit and close issue 45 when its acceptance criteria pass.

## Surprises & Discoveries


The legacy `reschedulePreservingLocks` helper clears every unlocked placement. It does not implement affected-only Reflow. Build, Complete, and Rebuild still need their existing behavior.

The main merge contains a site-only release change that removes the mobile document cache feature. It also restores obsolete Room migration code. The resolution keeps the document removal but preserves this branch's destructive cache policy. The merged Room version is 105.

The documented `:composeApp:roomGenerateSchema` task does not exist in the current module graph. `:core:database:compileDebugKotlinAndroid` runs KSP and copies the generated schema.

The previous HTML walkthrough has scripted outcomes. It is not proof of scheduler behavior. Its diagram also places result persistence before asynchronous Reflow. Issue 46 instead requires one atomic terminal operation.

The shared protected-history query omitted Event-scoped check-ins. Reflow therefore rejected an eligible Team in the real database test. Include all check-ins for the Event in the snapshot and its revision.

The default Event loader omits Resources removed from the current configuration. Use retained Match IDs for Reflow hydration. Keep those Resources in the returned graph, but do not offer them for new placements.

The Windows client-to-site subprocess blocked when the test waited before reading stdout. Read stdout concurrently while the site parser runs.

## Decision Log


Decision: Add a dedicated Reflow planner. Do not route Reflow through the helper that clears all unlocked Matches. Reason: unaffected placements and assignments must remain exact. Date: 2026-09-04.

Decision: Use the three test boundaries already approved by the user: the shared planner, the atomic API save, and the mobile Room refresh. Reason: these boundaries prove scheduling behavior and rollback without testing private helpers. Date: 2026-09-04.

Decision: Keep terminal commands, event-level command coalescing, replay identity, and notifications in issue 46. Do not add `previousMatchTeamOfficial` in issue 45. Reason: these are separate agreed changes. This planner must support a caller-owned transaction so issue 46 can save the result and Reflow together. Date: 2026-09-04.

Decision: Report search exhaustion separately from proven infeasibility. Both results leave storage unchanged. Reason: a bounded search cannot claim that no solution exists after it reaches its limit. Date: 2026-09-04.

## Outcomes & Retrospective


Implementation is in final review. The final focused site run passed 73 tests across eight suites. This includes the real database tests and a walkthrough interaction test that calls the shared planner. All three focused mobile Room tests pass. TypeScript and focused ESLint checks pass. Full site lint reports zero errors and 51 warnings.

The full site run completed 931 suites: 884 passed, 42 failed, and five were skipped. It reported 6,050 passed tests, 82 failed tests, and 40 skipped tests. Failures include Windows path, socket, symlink, shell, and CRLF assumptions; older Event UI and search assertions; one existing pool-play duty assertion; and ten Playwright files collected by Jest. The issue 45 suites pass independently. The full JSON report is at `apps/site/test-results/issue-45-jest.json` and is not part of the implementation commit.

The full Android/JVM run covered reports for 1,955 tests in 283 suites. It reported six failures and ten skips. One Reflow test expectation was corrected and now passes. The other five failures are unchanged Event-editor parity tests: their golden fixtures or wire assertions still expect contract version 3 instead of the current version 4. Native iOS tests did not run on Windows. Do not report the full suites as green.

## Context and Orientation


`apps/site/src/server/scheduler/types.ts` defines the hydrated Match, Tournament, Team, and Resource objects. `apps/site/src/server/repositories/events.ts` loads and saves them. `apps/site/src/server/scheduler/eventScheduleMutation.ts` owns existing Schedule mutations. `eventScheduleMaintenance.ts` implements Build, Complete, and Rebuild proposals. `eventScheduleMaintenanceRevisionBinding.ts` binds proposals to configuration, availability, and Schedule revisions.

A revision is a value that identifies the state used to make a decision. Reject a write when its expected revision no longer matches. An affected Match is one whose placement or assignment must be reconsidered because an input changed or a repair creates a conflict. A protected Match cannot move or receive a different assignment. An unaffected Match keeps all stored values.

The shared planner belongs under `apps/site/src/server/scheduler/reflow/`. Its input contains plain data. It has no Prisma, HTTP, or browser dependency. Its output contains only proposed placement and assignment differences plus evidence. The backend builds this input from canonical models. The walkthrough supplies explicit connected bracket fixtures to the same function.

Mobile HTTP models belong in `apps/mobile/core/network`. Schedule repository logic belongs in `apps/mobile/core/repository-impl`. Room remains the source observed by Android and iOS screens.

## Context Boundary


Read issue 45 and its comments, root and child AGENTS policies, `apps/site/CODING_STANDARDS.md`, the Schedule and Officiating Plan entries in `CONTEXT.md`, and this plan. Read the scheduler files named above, `officialStaffing.ts`, `teamDutyRanking.ts`, `matchSchedulingOrder.ts`, and the canonical Time Slot resolvers. Read the exact affected mobile DTO, repository, and Room transaction tests.

Read issue 46 only to preserve the transaction boundary. Read other issues only if an acceptance criterion leaves a required decision unresolved. Read database isolation guidance before database tests. Expand to route authorization and field-blocker code when wiring the API. Do not inspect unrelated affiliate modules unless a merge check exposes a failure there.

## Plan of Work


### Milestone 1: Shared planner


Create `planReflow` with a snapshot, changed Match IDs, current time, Resource policy, and search budget. Return `CHANGED`, `NO_OP`, `INFEASIBLE`, or `SEARCH_LIMIT`. Validate inputs. Keep input objects immutable. Index dependencies and Resource and participant commitments. Use actual Match end times when an anchor completed. Keep unrelated unplaced Matches unplaced.

First try joint Team-duty and named-official reassignment at existing times. Permit swaps across competing, unprotected Matches. Enforce the current Staffing Priority and canonical eligibility. Optional missing coverage gives a warning without causing a time change. A required missing assignment makes the placement infeasible.

When assignment repair cannot retain the times, search deterministic candidate boundaries. Bound the number of explored states. Use dependency, phase, Division, Resource, Team-rest, and official constraints. Add another Match to the affected set only when a repair reaches it. Keep protected Matches fixed. Preserve Match identities, graph links, participants, scores, and seeds by returning only assignment and placement changes.

`KEEP_ASSIGNED_FIELDS` permits only the existing Resource. `ALLOW_ELIGIBLE_FIELD_CHANGES` permits any canonical eligible Resource. Prefer the existing Resource for equal feasible start times. Try the earliest feasible time first. Do not scan every minute.

### Milestone 2: Atomic HTTP operation


Add a dedicated versioned Reflow request and result in `apps/site/src/contracts/scheduleReflow.ts`. The request identifies the Event, changed Matches, expected revision, and Resource policy. The response separates affected IDs, protected IDs, placement changes, assignment changes, warnings, and unchanged-state failures. Reject unauthorized, malformed, and stale requests before any Schedule write.

Add a server service that can run inside a caller's Prisma transaction. Load the canonical Event and availability under the existing lock conventions. Plan from that state. Write only changed placement and assignment fields. Do not call an upsert that rewrites every Match. Return no-op without writes. Throw or return before any write when the plan is infeasible or the search budget is exhausted. Roll back if one write fails. Retain a complete changed Schedule response for a consistent mobile refresh.

### Milestone 3: Mobile parity


Add matching Kotlin request and result DTOs. Decode assignment-only changes separately from placement changes. Use the shared repository on both Android and iOS. Persist a successful Schedule refresh in one Room transaction. Do not touch Room on no-op, infeasible, stale, or search-limit results. Surface typed errors. Prove that a failed Room write leaves the prior Schedule visible.

### Milestone 4: Walkthrough and final verification


Replace scripted planner outcomes in `apps/site/src/server/scheduler/prototypes/reflow-flow/` with the shared function. Keep explicit Match numbers, named Teams, and winner/loser graph links. Mark the loser-linked duty setting as future work. Correct the terminal-operation diagram to show one atomic save. Do not start or restart a runtime without current authorization.

Measure connected brackets at realistic sizes. Record explored states and elapsed time. Run the full relevant site and mobile suites once after focused tests pass. Use the implement skill's parallel Standards and Spec review. Fix findings, rerun affected checks, and commit on the current branch.

## Concrete Steps


Run site commands from `apps/site`:

    npm run prisma:generate
    npx tsc --noEmit
    npm test -- --runInBand --testPathPatterns=reflow
    npm test -- --runInBand
    npm run lint

Run mobile commands from `apps/mobile`:

    .\gradlew :core:database:compileDebugKotlinAndroid
    .\gradlew :core:repository-impl:testDebugUnitTest
    .\gradlew :composeApp:test

Use the existing authorized local Postgres server. Create only the fresh logical test database `bracketiq_e2e_45_563b`. Scope its URL to each test process. Run `npm run migrate:deploy`, then `npx prisma migrate status`. Run database tests only after all migrations are applied. Record exact integration commands after selecting the existing test harness.

## Validation and Acceptance


A delayed quarter-final moves only its affected semifinal chain. An early finish can release a dependent Match earlier. An unrelated Match stays byte-for-byte unchanged. Completed, in-progress, explicitly locked, and history-protected Matches keep their placement and assignments.

A staffing swap repairs competing Matches without changing their times. A required staffing shortage delays an affected Match to a feasible boundary or returns an unchanged-state failure. Optional missing staffing only warns. The field-retaining policy never changes a field. The flexible policy can select another eligible field.

No-op performs zero Schedule and Room writes. Infeasibility, budget exhaustion, stale revisions, and injected save failures preserve the prior Schedule. Client-serialized requests reach the real site parser or API. Android and iOS use the same repository result and do not label reassignment as a time change.

## Idempotence and Recovery


Do not reset or clean the worktree. Preserve the untracked walkthrough files created for the user. Resolve conflicts on this branch. A failed planner leaves the snapshot untouched. A failed backend save rolls back the transaction. A failed Room refresh rolls back its transaction. Keep issue 45 open until all required verification succeeds. Do not deploy or publish images.

## Artifacts and Notes


Pre-implementation HEAD: `23653afa2de298ce4c829d73004b16a3463a617f`.
Current branch: `workstream/issue-42-schedule-diagnostics`.
Walkthrough URL: `http://localhost:3100/` when its existing server is available.

Isolated database: `bracketiq_e2e_45_563b` on the already-running local PostgreSQL server at port 5543. All 224 migrations are applied. Do not expose its connection URL. Scope the URL to test processes.

Run `node --import tsx scripts/benchmark-schedule-reflow.ts` from `apps/site`. One local run measured 63 ms for 31 Matches, 41 ms for 127 Matches, and 430 ms for 511 Matches. These fixtures include unresolved entrants, required fluid Team Duty, and four concurrent completed anchors. The test checks the 20,000-state limit and immutable input. These are single-run measurements, not service-level guarantees.

Review baseline: use `091b4e65c407ffbec1f87ed45b7ba3bb0faaa132`, the completed main merge, to isolate issue 45. The user did not supply a different baseline after the question. The local walkthrough restart still needs current authorization. No backend or walkthrough runtime was started or restarted during this implementation.

## Interfaces and Dependencies


Use TypeScript, Jest, Zod, Prisma, Kotlin serialization, and Room already present in the repository. Do not add an optimization service or external solver. Keep `planReflow` callable from Node and the browser build. Adapt canonical Time Slot, Officiating Plan, and Match Graph data at the backend boundary. Do not duplicate canonical policy values in the planner.

### Changed contract

Add `POST /api/events/{eventId}/schedule/reflow`, contract version 1. This is a new contract. Event-editor contract version 4 does not change. Prisma and Room schemas do not change.

Request fields: `contractVersion`, `eventId`, `changedMatchIds`, `expectedScheduleRevision`, and `fieldPolicy`.

Response fields: `contractVersion`, `eventId`, `status`, `scheduleRevision`, `affectedMatchIds`, `protectedMatchIds`, `placementChanges`, `assignmentChanges`, `warnings`, `exploredStates`, and `graph`.

Each placement change has `matchId`, `before`, and `after`. Each placement has `start`, `end`, and `fieldId`. Each assignment change has `matchId`, `before`, and `after`. Each assignment set has `teamOfficialId` and `officialAssignments`. Each official assignment has `positionId`, `slotIndex`, `holderType`, `userId`, `eventOfficialId`, `checkedIn`, and `hasConflict`. Each warning has `code`, `matchIds`, and `message`. The nullable `graph` reuses the canonical Event-editor Event and Match Graph schema.

`status` is `CHANGED`, `NO_OP`, `INFEASIBLE`, `SEARCH_LIMIT`, or `STALE`. `fieldPolicy` is `KEEP_ASSIGNED_FIELDS` or `ALLOW_ELIGIBLE_FIELD_CHANGES`. Only `CHANGED` returns a graph and deltas. All other outcomes save no Schedule or Room changes. The opaque Schedule revision now includes official assignments and Event-scoped Team check-ins.

Plan revision: 2026-09-04. Created after issue claim and the main merge inspection. This records the user-approved scope and the three test boundaries.
