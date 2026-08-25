# Return Complete Schedule Proposals During Create

This ExecPlan is a living document. Update it as the implementation changes.

## Purpose / Big Picture

Scheduled League and Tournament Create must produce a complete Schedule Proposal before the Event is committed. The proposal must contain the full Match Graph, time placements, Resource placements, and officiating assignments. The server must bind the proposal to the submitted Event Editor draft and current authoritative Resource, Rental Booking, and Time Slot revisions. A later accept request must persist the exact proposal in one transaction. A stale or rejected proposal must leave no Event or Match Graph rows.

The site and mobile applications use the same HTTP proposal and accept seam. Mobile writes accepted data to Room in one transaction. Mobile keeps the editor draft while the proposal is reviewed.

## Progress

- [x] (2026-08-24) Read issue #37, parent issue #14, dependencies #31 and #33, repository rules, and the existing Event Editor paths.
- [x] (2026-08-24) Map the Event Editor contract, create operation receipt, scheduler, graph persistence, web submit flow, and mobile create flow.
- [x] (2026-08-24) Add proposal and accept contracts with revision bindings.
- [x] (2026-08-24) Persist pending proposals without persisting Events.
- [x] (2026-08-24) Accept the exact stored graph with atomic Event persistence.
- [x] (2026-08-24) Add site and mobile review and accept flows.
- [x] (2026-08-24) Add focused regression tests.
- [x] (2026-08-24) Run focused type checks and tests.
- [x] (2026-08-24) Run the complete site and mobile suites once.
- [ ] Run the required two-axis code review.
- [ ] Address review findings and commit the work on the current branch.

## Surprises & Discoveries

- The current scheduled Create path persists the Event and builds the Schedule in `createEventEditor`.
- The scheduler returns a complete in-memory Match Graph through `reconcileEventSchedule`, and `serializeMatches` already includes placements, links, official assignments, fields, and teams.
- The current create operation receipt reserves an Event ID and stores the canonical result. It can be extended to store a pending proposal while retaining idempotent retries.
- The current mobile repository writes the Event and Match rows when the create response arrives. It needs a proposal branch that does not write Room until accept.
- The proposal review UI must show explicit unavailable states when authoritative display names are absent. It must format proposal times in the Event time zone.
- The persistence seam accepts the typed `EventEditorCreateProposalGraph` contract and does not invoke the scheduler during acceptance.

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

## Plan of Work

First, add strict proposal, revision-binding, accept, and reject shapes to the shared server contract. Add the proposal fields to the operation receipt model and create a migration. Extend the mobile DTOs with the same wire fields.

Next, compute a proposal in a rollback-only transaction. Validate the create command and source revisions. Reuse the existing `saveWithinTransaction` and scheduler path. Serialize the complete graph and schedule outcome. Store the proposal in the operation receipt after the rollback. Do not send staff, social, admin, or schedule notifications during this phase.

Then, add accept and reject server routes. Accept must lock the reserved Event ID, recheck the Event Editor and authoritative resource revisions, recreate the Event from the stored draft, persist the stored Match Graph and placements without calling the scheduler, save the canonical create result in the same transaction, and run post-commit effects once. Reject must delete only an unaccepted pending proposal.

Then, update the site to show the proposal before redirect. Keep the current draft in the form. Add accept and reject actions. Apply the canonical result only after accept.

Then, update mobile to decode proposal responses, keep proposal state outside Room, show the proposed match count and placement range, and accept or reject through the canonical site route. Write the accepted Event, divisions, Matches, Fields, Time Slots, and assignments to Room in one transaction.

Finally, add backend, contract, route, web, mobile gateway, repository, and Room regression tests. Run focused checks after each slice. Run the complete site and mobile suites once. Review the completed diff and commit.

## Concrete Steps

Run site commands from `apps/site`.

Run mobile commands from `apps/mobile`.

Run one focused Jest file at a time with `npx jest --runInBand --runTestsByPath <path>`.

Run `npx tsc --noEmit` after each backend or site slice.

Run the relevant Gradle unit test task after each mobile slice. Do not run Gradle tests concurrently.

Run `npm run test:ci` once after all site changes.

Run `npx tsc --noEmit` after the complete site suite.

Run `./gradlew :composeApp:testDebugUnitTest` once after all mobile changes.

Run the iOS simulator test task when shared Kotlin code changes need native verification.

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

- `apps/site`: `npx tsc --noEmit` passed.
- `apps/site`: `npm run test:ci` passed: 874 suites, 5,218 tests, and API route coverage for 330 files.
- `apps/mobile`: `ANDROID_HOME=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:testDebugUnitTest` passed: 154 actionable tasks, 10 executed, 144 up to date.
- Focused proposal, route, scheduler, template, and mobile UI checks passed.
- The first full site run exposed one validator fixture mismatch and two load-sensitive UI failures. The validator now allows an ID-only team-official relationship while still rejecting a conflicting nested identity. The focused regressions and the complete site suite pass on the rerun.
- Template-backed proposals now lock the template revision during proposal computation and acceptance. Template archive uses the same transaction-scoped lock.

## Revision Note

2026-08-24: Created for issue #37. The plan records the rollback-only proposal computation, durable operation receipt, exact accept path, authoritative revision binding, and site/mobile review flows.
