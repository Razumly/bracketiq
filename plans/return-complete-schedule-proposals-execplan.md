# Return Complete Schedule Proposals During Create

This ExecPlan is a living document. Update it as the implementation changes.

## Purpose / Big Picture

Scheduled League and Tournament Create must produce a complete Schedule Proposal before the Event is committed. The proposal must contain the full Match Graph, time placements, Resource placements, and officiating assignments. The server must bind the proposal to the submitted Event Editor draft and current authoritative Resource, Rental Booking, and Time Slot revisions. A later accept request must persist the exact proposal in one transaction. A stale or rejected proposal must leave no Event or Match Graph rows.

The site and mobile applications use the same HTTP proposal and accept seam. Mobile writes accepted data to Room in one transaction. Mobile keeps the editor draft while the proposal is reviewed.

## Progress

- [x] (2026-08-25 15:42Z) Read issue #37, parent issue #14, dependencies #31 and #33, repository rules, and the existing Event Editor paths.
- [x] (2026-08-25 15:42Z) Map the Event Editor contract, create operation receipt, scheduler, graph persistence, web submit flow, and mobile create flow.
- [x] (2026-08-25 15:42Z) Add proposal and accept contracts with revision bindings.
- [x] (2026-08-25 15:42Z) Persist pending proposals without persisting Events.
- [x] (2026-08-25 15:42Z) Accept the exact stored graph with atomic Event persistence.
- [x] (2026-08-25 15:42Z) Add site and mobile review and accept flows.
- [x] (2026-08-25 15:42Z) Add focused regression tests.
- [x] (2026-08-25 15:42Z) Run focused type checks and tests.
- [x] (2026-08-25 15:42Z) Run the complete site and mobile suites once.
- [x] (2026-08-25 16:25Z) Run the required two-axis code review.
- [x] (2026-08-25 16:25Z) Address the review finding for stale accepted-proposal replay and recover abandoned create-operation claims.
- [x] (2026-08-25 16:27Z) Commit the work on the current branch.
## Milestones

The first milestone establishes the wire contract and durable proposal storage. It adds the `PROPOSED` result, the accept and reject commands, revision bindings, and the operation-receipt columns. Run `npx tsc --noEmit` from `apps/site` and the focused Event Editor contract tests from `apps/site`; the expected result is a passing type check and passing contract tests that show a proposal response can be parsed and accepted.

The second milestone makes proposal computation and acceptance transactional. A scheduled League or Tournament create computes the complete graph and placements, then stores the proposal without leaving an Event row. Acceptance reads that stored graph, rechecks revisions, and persists the Event and graph without calling the scheduler again. Run the focused `eventEditorSave` and scheduler tests from `apps/site`; the expected result is a proposed response, an accepted response, and stale or rejected requests with no persisted Event.

The third milestone exposes review on web and mobile. The web page keeps the draft while it shows proposal assignments, and mobile keeps the proposal outside Room until acceptance. Run the proposal display Jest test and the mobile proposal dialog and repository tests; the expected result is a complete review, a disabled accept action for missing labels, and Room rows only after acceptance.

The final milestone proves the integrated contract and records review results. Run the exact site and mobile commands in Concrete Steps, then run the two-axis review. The expected result is passing suites, a clean worktree, and a committed implementation with any remaining findings recorded here.

## Surprises & Discoveries

- The current scheduled Create path persists the Event and builds the Schedule in `createEventEditor`.
- The scheduler returns a complete in-memory Match Graph through `reconcileEventSchedule`, and `serializeMatches` already includes placements, links, official assignments, fields, and teams.
- The current create operation receipt reserves an Event ID and stores the canonical result. It can be extended to store a pending proposal while retaining idempotent retries.
- The current mobile repository writes the Event and Match rows when the create response arrives. It needs a proposal branch that does not write Room until accept.
- The proposal review UI must show explicit unavailable states when authoritative display names are absent. It must format proposal times in the Event time zone.
- The persistence seam accepts the typed `EventEditorCreateProposalGraph` contract and does not invoke the scheduler during acceptance.
- A fresh isolated integration database hit migration `20260821070000_repair_document_evidence_and_version_guards` because its temporary repair table used `ON COMMIT DROP` before later statements. The verification database applied the same SQL without that drop clause and marked only that test migration applied; no production migration file changed.
- The first real mobile check found that the seeded fixture set was absent. Running `npm run seed:dev` against the isolated database prepared the host and Basketball fixtures, and the rerun passed one test without a skip.
- An accepted proposal retry must validate the submitted draft before it returns the stored result. Otherwise a changed editor state can receive a successful replay.
- A persisted `PROCESSING` operation with no result can block the same request forever after a process interruption. Reclaim only rows older than the lease and compare the full operation identity and state in one conditional update.

## Decision Log

- Decision: Keep the Event Editor contract version at 3. Add a discriminated `PROPOSED` response and an accept command. Existing immediate Create responses remain `SAVED`.
  Rationale: The new response is additive and keeps installed mobile clients from receiving a different command shape. The mobile gateway can decode the response discriminator.
  Date/Author: 2026-08-24 / Codex.

- Decision: Store the canonical pending proposal in `EventEditorCreateOperations` and reserve its Event ID. Do not create a durable Event during proposal computation.
  Rationale: The existing operation receipt gives retries one durable identity. The scheduler requires an Event row, so proposal computation uses a rollback-only transaction. The transaction returns the serialized graph through a sentinel rollback, and no Event row remains.
  Date/Author: 2026-08-24 / Codex.

- Decision: Accept only by operation ID and proposal revision. Do not accept a client-supplied graph.
  Rationale: The server must persist the exact reviewed graph and must reject client recomputation or graph tampering.
  Date/Author: 2026-08-24 / Codex.

- Decision: Bind selected Fields, Time Slots, Rental Booking rows, and field availability to stable hashes of authoritative rows and blocker intervals.
  Rationale: `updatedAt` alone does not detect all availability changes. A canonical blocker hash detects a new or changed placement conflict before accept.
  Date/Author: 2026-08-24 / Codex.

## Context and Orientation

The backend source of truth is under `apps/site`. The strict Event Editor contract is `apps/site/src/contracts/eventEditor.ts`. The create operation receipt is `apps/site/src/server/events/eventCreateOperationReplay.ts`. The create transaction is `apps/site/src/server/events/eventEditorSave.ts`. The Event Editor route is `apps/site/src/app/api/events/editor/route.ts`. The scheduler and graph persistence are under `apps/site/src/server/scheduler/eventScheduleMutation.ts` and `apps/site/src/server/repositories/events.ts`.

The site create screen is `apps/site/src/app/events/[id]/schedule/page.tsx`. The shared mobile DTOs are under `apps/mobile/core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventEditorDtos.kt`. The mobile HTTP gateway is `apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventEditorRemoteGateway.kt`. The Room write path is `EventRepository.createEventEditor`.

In this plan, a discriminated response is a JSON response whose `status` selects one complete shape, either `SAVED` or `PROPOSED`; the parser is `eventEditorCreateResultSchema`. An operation receipt is the durable `EventEditorCreateOperations` row keyed by `createOperationId`; it stores the request hash and canonical result so retries do not recompute or duplicate effects. A rollback-only transaction is a database transaction used to build a proposal while deliberately discarding temporary Event and graph rows. A sentinel rollback is the private exception that carries the serialized proposal out of that transaction so the caller can return it after the database rolls back.

## Plan of Work

First, add strict proposal, revision-binding, accept, and reject shapes to the shared server contract. Add the proposal fields to the operation receipt model and create a migration. Extend the mobile DTOs with the same wire fields.

Next, compute a proposal in a rollback-only transaction. Validate the create command and source revisions. Reuse the existing `saveWithinTransaction` and scheduler path. Serialize the complete graph and schedule outcome. Store the proposal in the operation receipt after the rollback. Do not send staff, social, admin, or schedule notifications during this phase.

Then, add accept and reject server routes. Accept must lock the reserved Event ID, recheck the Event Editor and authoritative resource revisions, recreate the Event from the stored draft, persist the stored Match Graph and placements without calling the scheduler, save the canonical create result in the same transaction, and run post-commit effects once. Reject must delete only an unaccepted pending proposal.

Then, update the site to show the proposal before redirect. Keep the current draft in the form. Add accept and reject actions. Apply the canonical result only after accept.

Then, update mobile to decode proposal responses, keep proposal state outside Room, show the proposed match count and placement range, and accept or reject through the canonical site route. Write the accepted Event, divisions, Matches, Fields, Time Slots, and assignments to Room in one transaction.

Finally, add backend, contract, route, web, mobile gateway, repository, and Room regression tests. Run focused checks after each slice. Run the complete site and mobile suites once. Review the completed diff and commit.

## Concrete Steps

From `apps/site`, run `npx jest --runInBand --runTestsByPath 'src/app/events/[id]/schedule/__tests__/proposalDisplay.test.ts'`. Expect all proposal display tests to pass.

From `apps/site`, run `npx jest --runInBand --runTestsByPath 'src/app/api/events/__tests__/editorContractRoutes.test.ts'`. Expect the route tests to pass and the proposal route to return `202`.

From `apps/site`, run `npx jest --runInBand --runTestsByPath 'src/server/events/__tests__/eventEditorSave.test.ts'`. Expect proposal, accept, stale, reject, and rollback tests to pass.

From `apps/site`, run `npx tsc --noEmit`. Expect the command to exit with status 0.

From `apps/site`, run `npm run test:ci`. Expect the site suite to report 874 suites and 5,218 tests passed, followed by API route coverage for 330 files.

From `apps/mobile`, run `ANDROID_HOME=/Users/elesesy/Library/Android/sdk ./gradlew --no-daemon :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.ScheduleProposalDialogUiTest'`. Expect the proposal review UI tests to pass.

From `apps/mobile`, run `ANDROID_HOME=/Users/elesesy/Library/Android/sdk ./gradlew --no-daemon :composeApp:testDebugUnitTest`. Expect the task to finish with `BUILD SUCCESSFUL` and no failed tests.

From `apps/mobile`, run `./gradlew --no-daemon :composeApp:iosSimulatorArm64Test`. Expect the shared Kotlin test task to finish with `BUILD SUCCESSFUL`.

For the real mobile-to-site check, set `MVP_TEST_BACKEND_URL`, `MVP_TEST_DATABASE_URL`, `MVP_TEST_ALLOW_DB_SEED=true`, `MVP_TEST_REQUIRE_BACKEND=true`, and `MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1`, then run `./gradlew --no-daemon :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventDetail.MobileEventEditorApiContractTest.given_mobile_editor_create_command_when_sent_to_site_then_event_is_persisted'` from `apps/mobile`. Expect one test to pass without a skip.

Record exact results in Outcomes & Retrospective.

## Validation and Acceptance

A scheduled League or Tournament POST returns `202` and a `PROPOSED` payload. The payload contains the complete graph, all placed times and Fields, official assignments, the source snapshot, a proposal revision, and revision bindings.

An accept request with the unchanged proposal returns `201`, creates one Event, persists all graph nodes and placements atomically, and does not call the scheduler again. Repeating accept returns the canonical result without a second Event.

Changing the Event Editor source, selected Field, Rental Booking, Time Slot, or conflicting availability causes accept to return a typed stale or proposal-invalid error. The Event and graph remain absent.

Rejecting a proposal leaves the Event and graph absent. A failed proposal computation emits no post-commit effect. The web form and mobile editor retain the submitted draft after failure.

Android and iOS can receive and display a proposal before Room contains the Event. After accept, Room contains the accepted Event and related rows. After reject or stale failure, Room contains none of those rows.

## Idempotence and Recovery

The operation ID remains the stable retry key. A proposal POST with the same command returns the stored proposal. A proposal POST with the same operation ID and a changed command returns a typed payload mismatch. Accept uses the stored proposal hash and operation ID. The proposal row is deleted only when computation fails or an explicit reject request succeeds before accept.

Do not run a production migration or change a live runtime. Inspect generated Prisma output after changing the schema. Preserve existing worktree commits and unrelated changes.

## Outcomes & Retrospective

- `apps/site`: `npx tsc --noEmit` passed after the final changes.
- `apps/site`: focused Event Editor and operation replay tests passed: 33 tests.
- `apps/site`: proposal route and display tests passed: 25 tests.
- `apps/site`: full `npm run test:ci` passed: 874 suites passed, 5,216 tests passed, 4 skipped tests, and API route coverage for 330 files.
- `apps/mobile`: full Android unit suite passed with `BUILD SUCCESSFUL`.
- `apps/mobile`: full iOS simulator suite passed with `BUILD SUCCESSFUL`.
- `apps/mobile`: mobile-to-site contract test passed with the isolated seeded backend and database.
- The first full site invocation used extra Jest arguments. The test suite passed, but the appended arguments reached route coverage and caused a false coverage-parser failure. The final unparameterized `npm run test:ci` passed.
- Accepted proposal replay now checks the submitted draft revision before returning its canonical result.
- Stale `PROCESSING` operation claims now use a conditional lease reclaim so an interrupted same-request retry can continue without allowing a different request to reuse the receipt.
## Revision Note

2026-08-24: Created for issue #37. The plan records the rollback-only proposal computation, durable operation receipt, exact accept path, authoritative revision binding, and site/mobile review flows.

2026-08-25: Added stale accepted-replay validation and conditional abandoned operation-claim recovery after the two-axis review. Recorded final site, mobile, and mobile-to-site verification.
