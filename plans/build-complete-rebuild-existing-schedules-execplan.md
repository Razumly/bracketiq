# Build, Complete, and Rebuild Existing Schedules

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current during implementation. Follow the repository rules in `PLANS.md` and the ASD-STE100 rules in `AGENTS.md`.

## Purpose / Big Picture

Issue #40 gives an Event organizer three clear maintenance operations. The organizer can build a Schedule for an existing unscheduled Event, complete the unplaced Matches in an existing Match Graph, or rebuild the schedule from current Event inputs. The organizer reviews a proposal before any current Schedule changes. The organizer then accepts that exact proposal or rejects it.

The result is safe for an Event that is already in use. Complete keeps every placed Match fixed. Rebuild keeps every completed, in-progress, or explicitly Locked Match fixed. A failed, rejected, or stale operation leaves the current Schedule and Event end unchanged. The web and mobile applications use the same site-owned HTTP contract. Mobile keeps proposals outside Room and writes accepted data to Room in one transaction. After a successful acceptance, a fresh batch sync shows the accepted Schedule on Android and iOS.

This work is for maintenance of an existing Event. It is not support for creating an Event. The existing create-event proposal flow from Issues #37 and #38 remains a separate flow with its own create operation identity and routes. Do not route an existing Event operation through create-event persistence or change create semantics to make this work.

## Progress

- [x] (2026-09-01) Read Issue #40, `PLANS.md`, repository rules, the relevant schedule ADRs, the related create and partial-acceptance plans, and the named site and mobile seams. Recorded base commit `bd683fb698daf504fc59c3a3758ebb6300721636` and the dirty-tree preservation rule.
- [x] (2026-09-01) Mapped every current Build, Complete, Rebuild, direct schedule, and schedule-refresh caller before editing. The web caller map has no direct schedule-mutation caller.
- [x] (2026-09-01) Froze the Issue #40 maintenance HTTP request, proposal, acceptance, stale, and rejected-result contract.
- [x] (2026-09-01) Added the server capability and Event-state projection for operation availability.
- [x] (2026-09-01) Corrected protected-history classification so an explicitly Locked Match is included in `protectedMatchIds`.
- [x] (2026-09-01) Implemented proposal generation for Build, Complete, and Rebuild without changing the accepted Event or Schedule.
- [x] (2026-09-01) Implemented Complete placement for only Unscheduled Matches, with every placed Match fixed.
- [x] (2026-09-01) Implemented Rebuild graph replacement while preserving protected Matches and their history.
- [x] (2026-09-01) Made proposal acceptance revision-safe, operation-identity-safe, and atomic, including Event-end behavior.
- [x] (2026-09-01) Kept Match Graph regeneration exclusive to Build for an unscheduled Event and Rebuild for an existing graph. Complete does not regenerate the graph.
- [x] (2026-09-02) Completed the site maintenance implementation. The route, contract, scheduler, revision binding, protected-history, schema, migration, generated Prisma model, web service, page, and schedule-header paths now support proposal review, explicit acceptance, rejection, stale recovery, and capability-driven controls.
- [x] (2026-09-02) Completed the mobile implementation. `EventEditorDtos.kt`, `EventEditorRemoteGateway.kt`, `EventRepositoryContract.kt`, `EventRepository.kt`, `EventCacheMerge.kt`, `EventEditorSessionMapper.kt`, `EventRoomStore.kt`, `MVPDatabaseService.kt`, the action handler and coordinator, and the Event detail hosts now use the shared maintenance contract.
- [x] (2026-09-02) Added fetch-only accepted relation hydration before the Room write. Accepted data is written in one `databaseService.withTransaction` block. Proposal, stale, rejected, and failed paths do not write proposal data to Room.
- [x] (2026-09-02) Staged the maintenance migration, Prisma schema, generated Prisma model, Room schema `104`, and the Issue #40 regression tests. The iOS CI workflow includes the shared parity check.
- [x] (2026-09-02) Replaced stale web evidence with final evidence from `apps/site`. The page test command passed 1 suite and 98 tests. The focused changed-contract command passed 10 suites and 149 tests. `npx tsc --noEmit` passed. `npm run prisma:validate` passed.
- [x] (2026-09-02) Recorded the final mobile focused evidence. EventEditorDtos maintenance selectors: 8 passed. EventEditorRemoteGateway maintenance selectors: 9 passed. Repository compile and unit-test compile passed. `EventRepositoryRoomPersistenceTest`: 20 passed. EventRepositoryHttp targeted selectors: 6 passed. `EventEditorSessionMapperTest`: 35 passed. `EventCacheMergeTest`: 2 passed. `EventEditActionHandlerTest`: 13 passed. `EventDetailOverlayHostUiTest`: 8 passed. The two iOS parity selectors each passed 1 test with zero skipped tests.
- [x] (2026-09-02) Built the focused lifecycle Complete and Rebuild selectors. Each selector skipped only because `MVP_TEST_BACKEND_URL` was unset.
- [x] (2026-09-02) Attempted the required live check exactly as follows:

      MVP_TEST_REQUIRE_BACKEND=1 ./gradlew --no-daemon :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventDetail.MobileEventEditorApiContractTest.given_mobile_schedule_operation_when_accepted_then_fresh_batch_sync_shows_schedule' --stacktrace

  The run discovered exactly one test and failed at the explicit fixture gate because `MVP_TEST_BACKEND_URL` was unset. This is an environment prerequisite failure. It is not a pass and it is not an assumption skip. The test code includes Complete and Rebuild accepted fresh-batch assertions, full `expectedRevisions` binding, protected Match and placeholder coverage, and cleanup.
- [x] (2026-09-02) Completed the final backend, web, and mobile Standards and Spec reviews. Every finding followed `open → fixed → re-reviewed → verified`. The final Standards and Spec reviews are clean for backend, web, and mobile. No unresolved code findings remain.
- [x] (2026-09-02) Completed Issue #40 closeout. The implementation and all available focused proof are recorded. The live backend proof remains blocked only by the missing `MVP_TEST_BACKEND_URL` prerequisite.

## Surprises & Discoveries

- Initial observation (before the Issue #40 migration): The schedule route mutated the Event inside a Prisma transaction and chose `BUILD`, `REBUILD`, or `RESCHEDULE_PRESERVING_LOCKS` from request flags instead of returning a reviewable proposal.
  Evidence: The pre-migration `apps/site/src/app/api/events/[eventId]/schedule/route.ts` called `reconcileEventSchedule` and returned serialized Event and Match data from the same request.

- Initial observation (before the Issue #40 migration): The web page sent a direct schedule request after a browser confirmation. The confirmation did not review a server-generated proposal.
  Evidence: The pre-migration `apps/site/src/app/events/[id]/schedule/page.tsx` used `runManualScheduleAction` and `eventService.reconcileEventSchedule` for Build and Rebuild actions.

- Observation (2026-09-02): The backend and web flow now uses one canonical schedule route family. POST computes and stores a proposal, PUT accepts the exact still-valid proposal, and DELETE rejects it.
  Evidence: The route, `eventService.ts`, `schedule/page.tsx`, and `EventScheduleHeader.tsx` use the three methods. The final changed-contract run passed 10 suites and 149 tests.

- Observation (2026-09-02): The protected-history classifier had to include the persisted `locked` flag, not only result and timing history.
  Fix: `eventProtectedHistory.ts` now includes an explicitly Locked Match in `protectedMatchIds`.
  Evidence: The protected-history regression and the Rebuild preservation checks pass.

- Observation (2026-09-02): Acceptance required the full revision binding and the full graph projection. A partial binding or a projection with omitted fields could accept data that no longer matched the server state.
  Fix: The site revision-binding and projection paths now carry and validate every required scheduling revision and graph field.
  Evidence: `eventEditorRevisionBinding.test.ts`, `eventEditorWireCompatibility.test.ts`, and the final 10-suite site run passed.

- Observation (2026-09-02): Resource advisory locks must remain held through proposal computation and the acceptance revision check.
  Fix: The maintenance scheduler and transaction keep the retained resource locks for the operation.
  Evidence: `eventScheduleMaintenance.test.ts` and `eventScheduleMutation.test.ts` pass.

- Observation (2026-09-02): Missing optional staffing data is a warning, not a fatal scheduling error.
  Fix: The proposal reports optional staffing warnings while preserving the accepted graph contract.
  Evidence: The maintenance scheduler and route regression checks pass.

- Observation (2026-09-02): An accepted-conflict response must converge on the current accepted result.
  Fix: The gateway and action coordinator refresh the current Schedule instead of retrying acceptance with a new operation.
  Evidence: `EventEditActionHandlerTest` includes acceptance-conflict convergence and passed 13 tests.

- Observation (2026-09-02): Accepted responses can omit relation rows that the Room projection needs.
  Fix: The repository performs fetch-only relation hydration before one Room transaction. It does not expose a partial Room state.
  Evidence: `EventRepositoryRoomPersistenceTest` passed 20 tests, and `EventRepositoryHttpTest` passed 6 targeted maintenance selectors.

- Observation (2026-09-02): Sparse team and official projections, and omitted Event fields, can erase accepted local data if the merge treats omission as deletion.
  Fix: The cache merge preserves local values for omitted fields and fetches only missing authoritative relations.
  Evidence: `EventCacheMergeTest` passed 2 tests and the EventRepository HTTP and Room checks passed.

- Observation (2026-09-02): Complete must preserve the placed Match's placement even when the proposal projection differs. Rebuild must preserve protected Match placement while replacing only replaceable rows.
  Fix: The accepted graph merge keeps protected and placed rows fixed and updates only allowed links and new rows.
  Evidence: The targeted EventRepository HTTP selectors and Room persistence tests pass.

- Observation (2026-09-02): Strict schemas rejected non-canonical fixture shapes during parity work.
  Fix: The shared fixtures and generated projections now use canonical nullable, revision, relation, and graph fields.
  Evidence: Both iOS parity selectors pass 1 test with zero skipped tests.

- Observation (2026-09-02): The migration, schema, generated model, and regression files were missing from the staged change set until closeout.
  Fix: Stage `20260901100000_add_event_editor_maintenance_operations`, the Prisma schema and generated model, Room schema `104`, and the Issue #40 regression tests.
  Evidence: The final changed-path review lists these files.

- Observation (2026-09-02): JSDOM matcher and timing behavior, and Gradle incremental-output behavior, affected focused verification.
  Fix: Use the repository's supported matchers and deterministic waits in web tests. Run Gradle focused checks serially and inspect the selected test result.
  Evidence: The final page result passed 98 tests, and the final mobile selectors produced the counts recorded in `Progress`.

## Decision Log

- Decision: Treat `bd683fb698daf504fc59c3a3758ebb6300721636` as the implementation base.
  Rationale: Issue #40 names this commit as the base even though the working tree contains later staged and unstaged work.
  Date/Author: 2026-09-01 / Codex.

- Decision: Preserve the dirty working tree.
  Rationale: The tree contains substantial work from prior issues. Never reset, clean, stash, checkout, or overwrite unrelated staged or unstaged changes. Edit only Issue #40 files and isolate mixed hunks.
  Date/Author: 2026-09-01 / Codex.

- Decision: Keep existing-Event maintenance separate from create-event proposals.
  Rationale: Create proposals create a new Event and use `createOperationId`. Issue #40 operates on an existing Event and must not accidentally create, replace, or persist an Event through the create flow.
  Date/Author: 2026-09-01 / Codex.

- Decision: Make Build, Complete, and Rebuild explicit proposal operations.
  Rationale: A browser confirmation or a mobile button is not a reviewed proposal. The server must compute a result, bind it to revisions, and commit only the exact result that the organizer explicitly accepts.
  Date/Author: 2026-09-01 / Codex.

- Decision: Use one maintenance operation identity for one user action.
  Rationale: A transport retry must return or accept the same proposal instead of producing duplicate Schedule work. A new user action must receive a new identity. Do not reuse a create-event operation identity.
  Date/Author: 2026-09-01 / Codex.

- Decision: Make revision comparison part of the acceptance transaction.
  Rationale: A proposal is unsafe if Fields, Time Slots, availability, Event settings, or the current Schedule changed after proposal generation. A stale result must write nothing, including no Event end or Room data.
  Date/Author: 2026-09-01 / Codex.

- Decision: Define protected Matches as the union of completed, in-progress, and explicitly Locked Matches.
  Rationale: Rebuild must not move Match history or an organizer's explicit lock. Complete has the stronger fixed rule for every placed Match, even when a placed Match has no protected history.
  Date/Author: 2026-09-01 / Codex.

- Decision: Keep Match Graph regeneration out of Complete.
  Rationale: Complete fills holes in the current graph. Rebuilding the graph would change Match identity or advancement dependencies and would violate the operation boundary.
  Date/Author: 2026-09-01 / Codex.

- Decision: Write mobile data to Room only after explicit acceptance.
  Rationale: Room is the mobile source of truth. A proposal is transient review state. A stale, rejected, or failed proposal must not replace accepted local rows.
  Date/Author: 2026-09-01 / Codex.

- Decision: Obtain operation availability from the server snapshot and Event state.
  Rationale: The UI must not duplicate rules for Automated Scheduling, Event type, existing graph state, or protected history. The server already owns capabilities and schedule state.
  Date/Author: 2026-09-01 / Codex.

- Decision: Use the canonical site contract and one Room transaction for accepted maintenance data.
  Rationale: POST, PUT, and DELETE keep proposal computation, acceptance, and rejection distinct. Fetch-only relation hydration supplies missing rows before `databaseService.withTransaction`, so observers never see a partial accepted graph.
  Date/Author: 2026-09-02 / Codex.

- Decision: Track every review finding through `open → fixed → re-reviewed → verified`.
  Rationale: The final Standards and Spec reviews must show that each finding was repaired and checked again. The backend, web, and mobile reviews are clean, and no code finding remains unresolved.
  Date/Author: 2026-09-02 / Codex.

## Outcomes & Retrospective

Completed state (2026-09-02): Issue #40 is implemented across the site backend, web page, mobile DTO and gateway, repository, cache, Room persistence, action coordinator, and Android/iOS UI. Build, Complete, and Rebuild now use explicit proposals. Only an explicitly accepted, revision-valid proposal changes the server or Room state. Complete preserves placed Matches. Rebuild preserves completed, in-progress, and explicitly Locked Matches. Accepted mobile data uses fetch-only relation hydration and one Room transaction.

Verification state (2026-09-02): The site page test passed 1 suite and 98 tests. The focused changed-contract run passed 10 suites and 149 tests. `npx tsc --noEmit` and `npm run prisma:validate` passed. Mobile DTO, gateway, repository, Room, cache, action, UI, and iOS parity evidence passed with the counts recorded in `Progress`. The Complete and Rebuild lifecycle selectors were built, but each skipped because `MVP_TEST_BACKEND_URL` was unset.

Live backend state (2026-09-02): The required live command discovered exactly one test and failed at the explicit fixture gate because `MVP_TEST_BACKEND_URL` was unset. This is an environment prerequisite failure. It is not a pass and it is not an assumption skip. The test code already includes accepted Complete and Rebuild fresh-batch assertions, full `expectedRevisions` binding, protected Match and placeholder coverage, and cleanup.

Review state (2026-09-02): All backend, web, and mobile findings moved through `open → fixed → re-reviewed → verified`. Final Standards and Spec reviews are clean for backend, web, and mobile. No unresolved code findings remain.

Lessons: Strict schemas require canonical fixtures. Read-only proposals plus explicit acceptance protect accepted state. Preserve unrelated dirty work. Run Gradle focused checks serially. Track new migration, schema, generated-model, and regression files in the staged change set.

## Context and Orientation

The site is the source of truth for the backend, database, and HTTP contract. The mobile app must match the site contract and must not import server TypeScript or Prisma types. The Schedule is the Event's Match Graph plus Match times, Resources, and officiating assignments. It is not a separate Event-owned lifecycle record.

A **Match Graph** is the complete set of Matches for one Event and the advancement links between them. A graph can contain future Matches with no assigned time or Resource. A **Schedule Proposal** is an unaccepted server result that contains the graph and its proposed placements. It is review data, not accepted Schedule data.

**Build Schedule** is the explicit operation that creates a graph and assigns times, Resources, and officiating for an existing unscheduled League or Tournament Event while Automated Scheduling is enabled. In this plan, an unscheduled Event has no existing Match Graph that can be maintained. Build may return a complete or incomplete proposal when the server cannot place every generated Match.

**Complete Schedule** is the explicit operation that tries to place only the Unscheduled Matches in the current graph. It treats every already placed Match as fixed. It does not regenerate the graph. It may return a complete or incomplete proposal.

**Rebuild Schedule** is the explicit operation that generates a replacement graph from the Event's current scheduling inputs and proposes placements. It preserves protected Matches. It is the only maintenance operation in this plan that regenerates an existing Match Graph.

A **Placed Match** has an assigned time and Resource. In the site contract this is represented by `placementState: "PLACED"`. An **Unscheduled Match** is a node in the complete graph with no assigned time or Resource. In the site contract this is represented by `placementState: "UNPLACED"`.

A **protected Match** is a Match that Rebuild must keep fixed because it is completed, in progress, or explicitly Locked. Completed means the result or final state is recorded. In progress means the Match has started or has an in-progress status. Explicitly Locked means its `locked` value is true even if it has not started. The protected set must be computed from authoritative persisted rows and history. The explicit `locked` flag is part of that set.

**Automated Scheduling** is the Event setting that permits server Schedule operations. When it is disabled, Build, Complete, and Rebuild are unavailable. A **revision** is a server value that identifies the current version of an Event's Schedule and scheduling inputs. A proposal stores the revisions that it used. Acceptance compares those revisions to current values before it writes.

The current site seams are these:

- `apps/site/src/app/api/events/[eventId]/schedule/route.ts` authenticates the organizer, locks the Event, and serves the canonical maintenance route. POST computes and stores a proposal. PUT accepts the stored proposal. DELETE rejects it. The route does not perform direct browser Schedule mutation.
- `apps/site/src/server/scheduler/eventScheduleMutation.ts` owns proposal computation and acceptance persistence. Proposal computation is read-only for accepted data. Acceptance persists the stored graph and Event end without rerunning the scheduler.
- `apps/site/src/server/scheduler/reschedulePreservingLocks.ts` contains placement and lock-preservation mechanics. The maintenance classifier adds completed, in-progress, and explicitly Locked Matches to the protected set.
- `apps/site/src/server/events/eventProtectedHistory.ts` loads Match, segment, incident, receipt, check-in, roster, and broadcast history and returns `protectedMatchIds`, including the persisted `locked` flag.
- `apps/site/src/contracts/eventEditor.ts` owns strict site schemas and shared editor types. The maintenance request, proposal, acceptance, and typed stale or rejected results remain separate from create-event schemas.
- `apps/site/src/lib/eventService.ts` is the browser client seam. It exposes maintenance proposal, acceptance, and rejection calls and preserves typed stale results.
- `apps/site/src/app/events/[id]/schedule/page.tsx` and `schedulePage/EventScheduleHeader.tsx` own the web review state, explicit Accept or Reject controls, stale refresh, warnings, and capability-driven operation visibility.

The current mobile seams are these:

- `apps/mobile/core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventEditorDtos.kt` contains the maintenance request, proposal, acceptance, outcome, revision, and error DTOs and their JSON encoders.
- `apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventEditorRemoteGateway.kt` owns the canonical paths, request encoding, response validation, and typed stale, rejected, and acceptance-conflict errors.
- `apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepositoryContract.kt` and `EventRepository.kt` expose maintenance proposal, acceptance, and rejection methods. Proposals stay transient. Accepted data uses fetch-only relation hydration and one `databaseService.withTransaction` Room write.
- `apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventCacheMerge.kt`, `EventEditorSessionMapper.kt`, and `EventRoomStore.kt` preserve sparse fields, relations, placed Matches, and protected Matches during accepted graph merging.
- `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventEditActionHandler.kt` builds maintenance requests and keeps one operation identity per user action. `EventEditActionCoordinator.kt` maps proposal, acceptance, rejection, stale, conflict, and fresh-sync states.
- `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailOverviewEditHost.kt`, `EventDetailScreen.kt`, and `EventDetailOverlayHost.kt` expose capability-driven actions, transient review, explicit confirmation, and result UI.
- `apps/mobile/core/database/src/commonMain/kotlin/com/razumly/mvp/core/db/MVPDatabaseService.kt` supplies the Room transaction boundary. A fresh batch sync reads the accepted server state after acceptance.

The current create proposal flow in `apps/site/src/app/api/events/editor/route.ts`, `apps/site/src/server/events/eventEditorSave.ts`, and the related completed plans is context only. Do not merge its create identity, Event creation transaction, or create-only UI state into the Issue #40 maintenance operation.

## Context Boundary

The minimum source set is `PLANS.md`, `AGENTS.md`, `CONTEXT.md`, Issue #40, `docs/adr/0010-separate-event-configuration-from-schedule-operations.md`, `docs/adr/0011-schedule-complete-phase-divisions-in-phase-order.md`, the named site seams, and the named mobile seams in Context and Orientation. Read `apps/site/AGENTS.md` and `apps/mobile/AGENTS.md` before editing their areas. Read the completed plans `plans/return-complete-schedule-proposals-execplan.md` and `plans/partial-schedule-acceptance-execplan.md` only for existing proposal identity, transient mobile state, typed stale handling, and Room transaction patterns. Do not copy their create-event scope into this plan.

Read direct tests beside a source seam when adding or changing an assertion. Read database schema and migration files only if the operation receipt or proposal snapshot cannot represent a maintenance proposal with existing storage. Read `apps/site/src/app/api/events/editor/route.ts` and `apps/site/src/server/events/eventEditorSave.ts` only if the shared schema change affects create-event parsing or if a shared error/parser change requires a compatibility decision. Read additional scheduler code only if the protected-match merge, graph identity, or Complete placement cannot be implemented from the named mutation and preserving-lock seams.

Expand the boundary when one of these triggers occurs: a request or response field differs between site and mobile; a contract version must change; an operation receipt needs a migration; an existing caller still mutates the Schedule directly; the current Match Graph identity rules conflict with protected preservation; a test cannot distinguish proposal computation from acceptance; or a live mobile-to-site run cannot prove fresh batch reload. Record the trigger and its evidence in `Surprises & Discoveries` before changing the plan.

## Plan of Work

### Milestone 1 — Freeze the maintenance contract and state model

Map all callers and write the maintenance contract first. Define the operation discriminator (`BUILD`, `COMPLETE`, or `REBUILD`), the maintenance operation identity, the proposal revision, the complete revision binding, the graph, the complete or incomplete Schedule outcome, and the accepted result. The request must carry the same operation and revision fields from web and mobile. The result must state the operation, Event identity, proposal identity, current graph/placement outcome, and warnings or exact Unscheduled Matches needed for review. Keep create proposal fields and `createOperationId` separate.

Project operation availability from the server. Availability must reflect authorization, League or Tournament type, Automated Scheduling, current graph state, and protected state. The browser and mobile UI must read this projection. They must not decide that an operation is available from only a local Match count or a duplicated event-type rule.

### Milestone 2 — Implement proposal generation without mutation

Change the site schedule route and service so a Build, Complete, or Rebuild request computes a proposal and stores the proposal snapshot under its maintenance operation identity, but does not change the accepted Schedule or Event end. A repeated request with the same identity and unchanged input must return the same still-valid proposal. Proposal generation must capture all scheduling revisions and validate that the operation is allowed.

Build uses current Event inputs to create the initial graph and proposed placements. Complete uses the current graph and schedules only `UNPLACED` nodes. Rebuild uses current Event inputs to generate a replacement graph and proposed placements while carrying protected Match state into the replacement result. All proposal paths must use the existing complete-division and readiness placement policy from ADR-0011. A partial result must identify every Unscheduled Match and the affected phase data already represented by the site contract.

### Milestone 3 — Implement protected preservation and atomic acceptance

Correct `eventProtectedHistory.ts` so `row.locked` adds the Match ID to `protectedMatchIds`. Build one explicit protected-match classifier for Rebuild. It must include persisted completed state, in-progress state, and explicit locks. It must preserve protected Match identity, history, placement, participants, and advancement links required to keep the current graph valid. It must never silently move or delete a protected Match.

Add the maintenance acceptance path. It must load and lock the Event and every resource row needed for the revision check, load the stored proposal by Event and operation identity, and compare the submitted proposal revision and every bound scheduling revision with current authoritative values. On mismatch, return the typed stale result (`EDITOR_PROPOSAL_STALE` or the repository's equivalent typed maintenance stale code) with no database writes. On malformed, missing, unauthorized, or already rejected proposals, return the existing typed error convention with no Schedule or Event-end write.

On a matching revision, persist the exact stored proposal graph and accepted Schedule in one Prisma transaction. Do not rerun the scheduler during acceptance. Update Event end only as part of this successful accepted result and the existing End Policy. Send notifications and refresh broadcast data only after the transaction commits. A transaction failure must roll back the graph, placements, Event end, operation state, and any related rows together.

### Milestone 4 — Replace the web direct-mutation flow

Update `eventService.ts` and `schedule/page.tsx` to request and display a maintenance proposal. Give Build, Complete, and Rebuild distinct controls and confirmation text. A proposal review must show the operation, complete or incomplete status, placements, protected fixed Matches where relevant, warnings, and exact Unscheduled Matches. The Accept control must be explicit. Reject must discard the review state without changing the accepted Event. A stale result must disable acceptance, retain the proposal details needed for explanation, and offer a refresh path that creates a new operation identity and proposal from current revisions.

Remove the direct browser path that calls the mutating schedule endpoint and then treats its response as accepted. After acceptance, reload the Event and Schedule from the site. On operation failure, keep the previous web state and Event end visible. Keep the create-mode proposal review separate from existing-Event maintenance state.

### Milestone 5 — Implement the shared mobile and Room flow

Update `EventEditorDtos.kt`, the gateway, repository contract, repository, and all action callers together. The mobile request must send the same operation input and revision fields as web. The gateway must decode complete and incomplete proposals and preserve typed stale and rejected errors. It must not add a client-side scheduling fallback.

Keep the proposal and its operation identity transient in the repository and UI. Do not write proposal graph, Match, Event, Field, Time Slot, Resource, or assignment rows to Room before acceptance. On explicit acceptance, write only the accepted response in one `databaseService.withTransaction` block. Complete must merge the accepted result without replacing placed Match rows. Rebuild must not replace protected Match rows. A stale, rejected, malformed, or failed response must perform no Room write.

After acceptance, perform the existing fresh batch Event/Match sync and expose the result from Room. Android and iOS must show the accepted Schedule after that sync. Their operation availability, proposal status, explicit confirmation, stale recovery, and rejection behavior must use the same repository contract even if their Compose or platform adapters differ.

### Milestone 6 — Focused proof and closeout

Add tests at the site contract, route, mutation, protected-history, scheduler, web service/page, mobile DTO, gateway, repository, Room, action, and integration seams. Each test must defend an Issue #40 behavior or an atomicity invariant. Run the exact commands in Validation and Acceptance. Record counts and environment limits in this plan. Review the complete Issue #40 diff against the stated base while preserving unrelated dirty-tree work.

## Concrete Steps

Run site commands from `apps/site` and mobile commands from `apps/mobile`. Do not run a destructive Git command to make the tree clean.

1. Record the initial source boundary and inspect only the named files and their direct tests. Preserve staged and unstaged changes. If an Issue #40 hunk overlaps user work, isolate the hunk rather than rewriting the file.
2. Define and parse the maintenance request and proposal schemas in `apps/site/src/contracts/eventEditor.ts`. Include the operation, operation identity, Event ID, proposal revision, revision binding, complete/incomplete outcome, graph, protected Match information needed for review, and typed stale/rejected fields. Add matching Kotlin DTOs and encoders in `EventEditorDtos.kt`. Keep contract version behavior explicit.
3. Add the server capability projection for Build, Complete, and Rebuild. Return it from the existing Event/editor snapshot path used by both web and mobile. Use Event state and server revisions as the source of truth.
4. Extend `eventProtectedHistory.ts` and the scheduler classifier. Add focused tests for a row with only `locked: true`, a completed row, an in-progress row, and a mixture of protected and replaceable rows.
5. Split proposal computation from persistence in `eventScheduleMutation.ts`. Proposal generation may use scheduler state snapshots and the existing resource-conflict checks, but it must not persist accepted Schedule rows or Event end. Complete must pass only Unscheduled nodes to the placement step. Rebuild must regenerate only in its own operation path and preserve protected state.
6. Add operation receipt or proposal snapshot persistence only if existing storage cannot hold the maintenance identity, proposal revision, request, result, and accepted/rejected state. If a migration is required, use the repository's existing migration process and document the reversible change before applying it.
7. Add the acceptance transaction. Recheck the Event, Schedule, availability/resource revisions, operation identity, proposal revision, and operation state under the transaction locks. Persist the stored graph without scheduler invocation. Return a typed stale result and no writes for every stale case.
8. Update `route.ts` and `eventService.ts` to expose the canonical maintenance proposal and acceptance calls. Migrate every web caller. Do not keep a second direct-mutation route or a compatibility alias that bypasses proposal acceptance.
9. Update `schedule/page.tsx` and its direct schedule header/child control seams. Render capability-driven Build, Complete, and Rebuild actions, transient proposal review, explicit accept/reject controls, complete/incomplete status, stale recovery, and unchanged-state failure handling.
10. Update `EventEditorRemoteGateway.kt`, `EventRepositoryContract.kt`, and `EventRepository.kt`. Keep proposals transient. Make the accepted graph write one Room transaction. Use one batch sync after acceptance. Preserve existing create proposal methods and their create-only identity.
11. Update `EventEditActionHandler.kt`, `EventEditActionCoordinator.kt`, `EventDetailOverviewEditHost.kt`, `EventDetailScreen.kt`, and `EventDetailOverlayHost.kt`. Replace direct schedule calls with proposal and acceptance state. Read operation availability from the server snapshot and Event state. Add Android and iOS matching confirmation and stale/rejected handling.
12. Add focused tests and a real mobile-to-site integration case. Verify the operation identity is stable across the same retry and changes for a new action. Verify that rejected and stale proposals do not write Room or the server Schedule.
13. Run the focused commands below. Update `Progress`, `Surprises & Discoveries`, and `Outcomes & Retrospective` with observed evidence. Do not mark a behavior complete from source inspection alone.

## Validation and Acceptance

Final focused evidence was recorded on 2026-09-02. The commands ran from the repository-relative directories stated below. The live backend result is recorded separately from passing local checks.

### Site focused checks

From `apps/site`, the page check was:

    npm test -- --runInBand --runTestsByPath src/app/events/[id]/schedule/__tests__/page.test.tsx

Observed result: 1 suite and 98 tests passed. The captured result is `artifact://4059`.

From `apps/site`, the focused changed-contract check was:

    npm test -- --runInBand --runTestsByPath \
      src/server/scheduler/__tests__/eventScheduleMaintenance.test.ts \
      src/server/scheduler/__tests__/eventScheduleMutation.test.ts \
      src/server/repositories/__tests__/events.loadWithRelationsFieldConflicts.test.ts \
      src/server/broadcast/__tests__/commands.test.ts \
      src/server/events/__tests__/eventEditorSave.test.ts \
      src/server/events/__tests__/eventEditorRevisionBinding.test.ts \
      src/app/api/events/__tests__/editorContractRoutes.test.ts \
      src/app/api/events/__tests__/eventScheduleMaintenanceRoute.test.ts \
      src/contracts/__tests__/eventEditor.test.ts \
      src/server/events/__tests__/eventEditorWireCompatibility.test.ts

Observed result: 10 suites and 149 tests passed. The captured result is `artifact://4061`.

From `apps/site`, these static checks passed:

    npx tsc --noEmit
    npm run prisma:validate

The site checks cover proposal generation, operation identity, Complete without graph regeneration, Rebuild protected preservation, explicit acceptance, stale and rejected no-write behavior, Event-end rollback, route serialization, revision binding, relation projection, and web request serialization.

### Mobile focused checks

Run the Gradle checks serially. The final verifier recorded these module and class selectors:

- `:core:network:testDebugUnitTest` with `com.razumly.mvp.core.network.dto.EventEditorDtosTest`: 8 maintenance selectors passed.
- `:core:repository-impl:testDebugUnitTest` with `com.razumly.mvp.core.data.repositories.EventEditorRemoteGatewayTest`: 9 maintenance selectors passed.
- `:core:repository-impl:compileDebugKotlin` and `:core:repository-impl:compileDebugUnitTestKotlin`: repository compile and unit-test compile passed.
- `:core:repository-impl:testDebugUnitTest` with `com.razumly.mvp.core.data.repositories.EventRepositoryRoomPersistenceTest`: 20 tests passed.
- `:composeApp:testDebugUnitTest` with `com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest`: 6 targeted selectors passed.
- `:core:repository-impl:testDebugUnitTest` with `com.razumly.mvp.core.data.repositories.EventEditorSessionMapperTest`: 35 tests passed.
- `:core:repository-impl:testDebugUnitTest` with `com.razumly.mvp.core.data.repositories.EventCacheMergeTest`: 2 tests passed.
- `:composeApp:testDebugUnitTest` with `com.razumly.mvp.eventDetail.EventEditActionHandlerTest`: 13 tests passed.
- `:composeApp:testDebugUnitTest` with `com.razumly.mvp.eventDetail.EventDetailOverlayHostUiTest`: 8 tests passed.

The checks cover wire parity, complete and incomplete proposal decoding, transient proposal state, fetch-only relation hydration, one Room transaction on acceptance, no Room writes for stale or rejected results, sparse-field preservation, protected and placed Match preservation, capability-driven action visibility, accepted-conflict convergence, and fresh batch reload state.

The two explicit iOS parity selectors were:

    ./gradlew --no-daemon :core:repository-impl:iosSimulatorArm64Test \
      --tests 'com.razumly.mvp.core.data.repositories.EventEditorTournamentParityCommonTest.given_shared_tournament_draft_when_command_is_encoded_then_complete_canonical_wire_is_preserved' \
      --tests 'com.razumly.mvp.core.data.repositories.EventEditorTournamentParityCommonTest.given_scheduled_tournament_draft_when_command_is_encoded_then_proposal_wire_is_preserved'

Each selector passed 1 test. Both reported zero skipped tests.

The focused lifecycle selectors were built for:

    com.razumly.mvp.eventDetail.EventLifecycleMobileApiIntegrationTest.mobile_complete_maintenance_preserves_placed_rows_and_refreshes_the_event_batch
    com.razumly.mvp.eventDetail.EventLifecycleMobileApiIntegrationTest.mobile_rebuild_maintenance_preserves_protected_rows_and_refreshes_replacements

Each selector skipped only because `MVP_TEST_BACKEND_URL` was unset. These are unavailable backend-backed checks, not local passes.

### Mobile-to-site acceptance check

The required live attempt was:

    MVP_TEST_REQUIRE_BACKEND=1 ./gradlew --no-daemon :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventDetail.MobileEventEditorApiContractTest.given_mobile_schedule_operation_when_accepted_then_fresh_batch_sync_shows_schedule' --stacktrace

The run discovered exactly one test and failed at the explicit fixture gate because `MVP_TEST_BACKEND_URL` was unset. This is an environment prerequisite failure. It is not a pass and it is not an assumption skip. The test code includes Complete and Rebuild accepted fresh batch assertions, full `expectedRevisions` binding, protected Match and placeholder coverage, and cleanup.

### Human-observable acceptance

A complete implementation satisfies every Issue #40 criterion. Build is available only for an existing schedulable Event with Automated Scheduling enabled and no current graph to maintain. Build returns a complete or incomplete proposal and does not change the Event until explicit acceptance. Complete returns a proposal that attempts only Unscheduled Matches; every placed Match remains fixed and the Match Graph is unchanged. Rebuild returns a replacement proposal; completed, in-progress, and explicitly Locked Matches remain fixed and protected. Structural graph regeneration occurs only in Build's initial graph path or Rebuild, never in Complete.

Acceptance checks the stored proposal identity and all bound revisions in the same transaction as the write. Only an explicitly accepted, still-valid proposal changes the Schedule or Event end. A stale proposal returns a typed stale result and writes nothing. A rejected proposal, invalid proposal, failed scheduler computation, failed persistence transaction, or failed post-validation leaves the current Schedule and Event end unchanged. Notifications occur only after a committed acceptance.

Web shows the same operation availability and proposal data from the server. It shows complete/incomplete status and exact Unscheduled Matches. It requires an explicit Accept action and supports Reject and stale refresh without silently accepting or recomputing. Mobile sends the same operation and revision fields, keeps proposals transient, writes only accepted data in one Room transaction, does not replace placed Matches during Complete, does not replace protected Matches during Rebuild, performs no Room write after rejection or staleness, and shows accepted data on both Android and iOS after fresh batch sync.

## Idempotence and Recovery

Preserve the starting staged and unstaged tree. Use narrow edits. If a mixed file cannot be changed without overwriting unrelated work, record the conflict in `Surprises & Discoveries` and isolate the required hunk.

A maintenance operation identity belongs to one user action. Repeating the same proposal request or acceptance request with the same identity and proposal revision must not create a second accepted Schedule. A new user action after Reject or Refresh must receive a new identity and current revisions. Do not reuse the create-event identity.

Proposal computation is read-only for accepted Event data. If computation fails, discard only the transient proposal result and keep the existing Schedule and Event end. If acceptance fails inside the database transaction, rely on rollback. Do not add compensating writes that can create a second partial state.

A stale result is recoverable. Keep the web or mobile review context long enough to tell the user that the proposal is stale, disable its Accept action, and request a fresh proposal with new revisions. Do not write the stale graph to Room. A rejected result is also non-mutating; clear or close only transient review state and leave the accepted Event and Room rows unchanged.

If the response is lost after acceptance, retry with the same operation identity and proposal revision. The server must return the existing accepted result or an equivalent idempotent result. Mobile must not issue a new operation or overwrite Room from an unconfirmed response. After the result is known, run the normal fresh batch sync.

If a required migration is added, use the existing migration versioning and rollback process. Never delete accepted Schedule, Match history, or protected rows to recover a failed proposal. If implementation stops, revert only Issue #40 hunks and leave unrelated user work intact.

## Artifacts and Notes

The recorded base is `bd683fb698daf504fc59c3a3758ebb6300721636`. The dirty-tree rule remains active: preserve unrelated staged and unstaged work, and edit only Issue #40 paths for this change. Final passing transcripts are `artifact://4059` for the page test and `artifact://4061` for the 10-suite site run. The live backend failure is recorded separately from these passes.

The key site implementation and test paths are:

    apps/site/prisma/schema.prisma
    apps/site/prisma/migrations/20260901100000_add_event_editor_maintenance_operations/migration.sql
    apps/site/src/generated/prisma/models/EventEditorMaintenanceOperations.ts
    apps/site/src/contracts/eventEditor.ts
    apps/site/src/contracts/__tests__/eventEditor.test.ts
    apps/site/src/app/api/events/[eventId]/schedule/route.ts
    apps/site/src/app/api/events/__tests__/eventScheduleMaintenanceRoute.test.ts
    apps/site/src/app/api/events/__tests__/editorContractRoutes.test.ts
    apps/site/src/app/events/[id]/schedule/page.tsx
    apps/site/src/app/events/[id]/schedule/schedulePage/EventScheduleHeader.tsx
    apps/site/src/app/events/[id]/schedule/__tests__/page.test.tsx
    apps/site/src/lib/eventService.ts
    apps/site/src/lib/__tests__/eventService.test.ts
    apps/site/src/server/events/eventProtectedHistory.ts
    apps/site/src/server/events/__tests__/eventProtectedHistory.test.ts
    apps/site/src/server/events/__tests__/eventEditorSave.test.ts
    apps/site/src/server/events/__tests__/eventEditorRevisionBinding.test.ts
    apps/site/src/server/events/__tests__/eventEditorWireCompatibility.test.ts
    apps/site/src/server/events/eventEditorRevisionBinding.ts
    apps/site/src/server/events/eventEditorSnapshot.ts
    apps/site/src/server/scheduler/eventScheduleMaintenance.ts
    apps/site/src/server/scheduler/__tests__/eventScheduleMaintenance.test.ts
    apps/site/src/server/scheduler/__tests__/eventScheduleMaintenanceCapability.test.ts
    apps/site/src/server/scheduler/eventScheduleMutation.ts
    apps/site/src/server/scheduler/__tests__/eventScheduleMutation.test.ts
    apps/site/src/server/scheduler/reschedulePreservingLocks.ts
    apps/site/src/server/repositories/__tests__/events.loadWithRelationsFieldConflicts.test.ts
    apps/site/src/server/broadcast/__tests__/commands.test.ts

The key mobile implementation and test paths are:

    apps/mobile/core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventEditorDtos.kt
    apps/mobile/core/network/src/commonTest/kotlin/com/razumly/mvp/core/network/dto/EventEditorDtosTest.kt
    apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventEditorRemoteGateway.kt
    apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepositoryContract.kt
    apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt
    apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepositoryModels.kt
    apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventCacheMerge.kt
    apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventEditorSessionMapper.kt
    apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRoomStore.kt
    apps/mobile/core/repository-impl/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/EventEditorRemoteGatewayTest.kt
    apps/mobile/core/repository-impl/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/EventEditorSessionMapperTest.kt
    apps/mobile/core/repository-impl/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/EventCacheMergeTest.kt
    apps/mobile/core/repository-impl/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/EventEditorTournamentParityCommonTest.kt
    apps/mobile/core/repository-impl/src/androidUnitTest/kotlin/com/razumly/mvp/core/data/repositories/EventEditorTournamentParityAndroidTest.kt
    apps/mobile/core/repository-impl/src/androidUnitTest/kotlin/com/razumly/mvp/core/data/repositories/EventRepositoryRoomPersistenceTest.kt
    apps/mobile/core/database/src/commonMain/kotlin/com/razumly/mvp/core/db/MVPDatabaseService.kt
    apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventEditActionHandler.kt
    apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventEditActionCoordinator.kt
    apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailOverviewEditHost.kt
    apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt
    apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailOverlayHost.kt
    apps/mobile/composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventEditActionHandlerTest.kt
    apps/mobile/composeApp/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/EventRepositoryHttpTest.kt
    apps/mobile/composeApp/src/androidUnitTestDebug/kotlin/com/razumly/mvp/eventDetail/EventDetailOverlayHostUiTest.kt
    apps/mobile/composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/eventDetail/EventLifecycleMobileApiIntegrationTest.kt

The staged platform and database artifacts are:

    .github/workflows/mobile-ci.yml
    apps/mobile/composeApp/schemas/com.razumly.mvp.core.db.MVPDatabaseService/104.json

Initial note (2026-09-01): The plan was created for Issue #40 from the stated base and current source seams. No application source was edited and no project validation was run at that time.

## Interfaces and Dependencies

The site owns the maintenance HTTP contract. Use the existing canonical schedule route family rather than adding a second scheduling authority. The proposal request must identify the existing Event, one explicit operation (`BUILD`, `COMPLETE`, or `REBUILD`), the maintenance operation identity, and the expected schedule and scheduling-input revisions. Optional participant and placeholder inputs may remain only where the current Event and scheduler contract requires them. The request must not contain create-event fields that can create a new Event.

The proposal response must carry a stable operation identity, a proposal revision, the Event ID, the operation, a complete or incomplete schedule outcome, the full graph needed to review and later persist the exact result, revision binding data, and warnings. Incomplete data must identify exact Unscheduled Match IDs and affected competition phase IDs. The accepted response must identify the accepted operation and return the canonical accepted Event and graph. The stale response must use the site's typed error schema and preserve the current revision needed to refresh. Rejected and invalid responses must use the existing typed error convention and must not imply acceptance.

In `apps/site/src/contracts/eventEditor.ts`, define strict schemas and inferred types for the maintenance request, proposal, proposal reference, acceptance command, accepted result, and typed stale/rejected errors. Keep `eventEditorCreateProposalSchema`, create acceptance, and partial create acceptance semantically separate. If the existing contract version cannot safely represent the new required shape, bump it using the repository contract policy and update site and mobile together.

In `apps/site/src/server/scheduler/eventScheduleMutation.ts`, expose a proposal computation seam that accepts an existing Event, operation, current revision binding, and scheduler context, and returns a complete proposal graph plus complete/incomplete outcome without persisting accepted rows. Keep `persistSerializedScheduleGraph` or an equivalent function as the acceptance-only persistence seam. Acceptance must not call `EventBuilder`, `scheduleEvent`, or another placement solver.

In `apps/site/src/server/events/eventProtectedHistory.ts`, `EventProtectedHistory.protectedMatchIds` must include every Match with protected result/history state and every row whose persisted `locked` value is true. In the Rebuild path, use that set together with the explicit in-memory completed/in-progress classifier when deciding which current Matches may be replaced.

In `apps/site/src/lib/eventService.ts`, expose separate methods for proposing, accepting, and handling a maintenance operation. Do not leave `reconcileEventSchedule` as a direct mutation path. Its normalized response types must preserve complete/incomplete status, exact Unscheduled Matches, operation identity, proposal revision, warnings, and typed stale errors.

In `apps/mobile/core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventEditorDtos.kt`, define serializable equivalents for every site field. The encoder must preserve required nullable values and operation/revision identity. In `EventEditorRemoteGateway.kt`, call the canonical site route, validate the contract version and discriminated result, and retain stale/rejected error types.

In `EventRepositoryContract.kt` and `EventRepository.kt`, expose maintenance methods such as `proposeScheduleOperation`, `acceptScheduleProposal`, and `rejectScheduleProposal` with the operation identity and revision fields. Use names that match the final site contract. Keep proposals outside Room. The accepted method must call `databaseService.withTransaction` once for Event, graph-owned resources, Matches, teams, and assignments. It must validate Event and Match identity before writing.

In the mobile action and UI seams, operation availability comes from the server capability projection and Event state. The action handler must not infer Complete or Rebuild rules from a local Match count alone. Android and iOS must share the same transient proposal, explicit confirmation, typed stale, rejected, and accepted-after-sync states. Existing create-event proposal methods remain unchanged and are not a dependency of the maintenance operation.

Revision note (2026-09-01): Marked protected-history classification complete after the focused lock-only and mixed locked/unlocked tests passed. This is historical evidence for the initial implementation milestone.

Revision note (2026-09-01): Recorded the backend contract and route evidence and marked the web schedule-operation migration complete. The canonical flow is proposal-only POST, explicit acceptance PUT, or rejection DELETE on `/api/events/[eventId]/schedule`; operation availability is capability- and Event-state-driven, and the browser has no direct scheduler call.

Revision note (2026-09-02): Updated this living plan after implementation and final review. The update records complete mobile and Room behavior, final site and mobile evidence, staged migration/schema/generated-model/regression paths, the required live backend prerequisite failure, the `open → fixed → re-reviewed → verified` finding lifecycle, and the retrospective. It does not change the recorded base commit or the dirty-tree preservation rule.
