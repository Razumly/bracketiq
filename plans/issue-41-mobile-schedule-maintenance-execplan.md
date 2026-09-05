# Complete mobile Schedule maintenance for issue 41

This ExecPlan is a living document. Maintain it under root `PLANS.md`.

## Purpose / Big Picture


An authorized organizer must be able to Build, Complete, and Rebuild from the mobile Schedule surface. Each operation must use the server proposal and acceptance rules. Complete must preserve placed Matches. Rebuild must preserve protected Matches. The phone must display the accepted result after a restart and an offline reload.

PostgreSQL owns the accepted Schedule. Room supplies fetched data to the mobile UI. These databases use separate transactions. A failed Room update must not undo a successful server operation. The phone must retain a consistent cache and offer synchronization recovery.

## Context Boundary


Start with GitHub issue `Razumly/bracketiq#41`, its complete body and comments, root `AGENTS.md`, `apps/mobile/AGENTS.md`, `PLANS.md`, and the issue tracker and Workstream runbooks under `docs/agents/`. Use the Schedule terms in `CONTEXT.md` and `docs/adr/0010-separate-event-configuration-from-schedule-operations.md`.

The initial mobile sources are `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventEditActionHandler.kt`, `EventEditActionCoordinator.kt`, `EventDetailOverviewEditHost.kt`, `EventDetailTabsHost.kt`, `EventDetailOverlayHost.kt`, `EventDetailScreen.kt`, and `EventDetailComponent.kt` in that same directory. The cache boundary is `apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`. Read the adjacent tests that cover the selected behavior.

If an API caller, API path, request or response field, DTO, encoder, or mapper changes, read `apps/site/AGENTS.md` and the exact site route and schema first. List the changed fields. Run a real client-to-site integration check if the HTTP contract changes. Do not expand into unrelated site behavior. Read other ADRs only when an unresolved operation rule requires them. Do not load historical plans unless this plan later names one.

## Progress


- [x] (2026-09-04) Read the implement, TDD, and code-review skills. Read the mobile and Workstream rules.
- [x] (2026-09-04) Confirm that issue 41 has no open blocker or sub-issue. Claim it and set project Status to In progress.
- [x] (2026-09-04) Confirm that the interrupted turn left no implementation changes. Preserve the two unrelated untracked issue-45 test reports.
- [x] (2026-09-04) Inspect existing maintenance actions, proposal review, and accepted-result Room writes.
- [x] (2026-09-04) The user approved both test boundaries and review base `1c758491b`.
- [x] (2026-09-04) Add the Schedule entry point through failing action and UI tests. Verify all three operations, capability restrictions, and cancelled loading.
- [x] (2026-09-04) Verify stale acceptance and offline Room reload for Build, Complete, and Rebuild. Check Match links, assignments, placements, protected state, and the server Event end.
- [x] (2026-09-04) Fix the three Spec findings through failing regressions. Verify fresh proposal revisions, accepted protected Match values, and current-graph recovery after offline reload.
- [x] (2026-09-04) Run focused checks and the complete Android/JVM suite. Final result: 1,982 tests, 1,969 passed, 13 live-backend tests skipped, zero failures or errors. Exclude iOS execution as previously requested.
- [x] (2026-09-04) Complete independent Standards and Spec reviews through `07ef50d44`. Both axes report zero remaining findings. Commit the implementation and review fixes.
- [x] (2026-09-04) Obtain explicit runtime approval. Create the isolated issue 41 database. Launch a separate loopback test backend with outbound providers disabled. Both live maintenance tests pass with no skips.
- [ ] Record verification and contract changes on the issue. Close only when all scoped criteria pass.

## Surprises & Discoveries


Build, Complete, and Rebuild already call the shared repository methods. `EventEditActionHandler` checks server-provided `availableMaintenanceOperations`. `EventRepository.persistAcceptedMaintenanceResult` already writes related accepted data in a Room transaction. The repository reports `EventEditorMaintenanceAcceptedSyncPendingException` when local synchronization fails after acceptance.

The current action menu is in `EventDetailOverviewEditHost`. The Schedule tab in `EventDetailTabsHost` exposes Match editing and Add Match, but has no maintenance entry point. The issue explicitly requires these operations in the shared Compose Schedule surface.

The proposal dialog displays all proposed Match rows. Its separate protected-Match list displays only eight raw identifiers. Inspect whether the detailed rows always include each protected Match before deciding the required review change.

The complete graph already displays every Match with placement, protection, teams, officials, and dependencies. No extra protected-Match list is needed for issue 41. The new entry point reuses that review without changing it.

Existing tests cover partial confirmation, proposal retries, stale acceptance, accepted-sync recovery, failed Room writes, and protected Match persistence. Add missing coverage instead of duplicating these tests.

The new disk test initially failed on invalid test data. The response helper omitted explicit null captain and placement fields. Add those fields to the test helper; retain the strict production parser. The long test name also exceeded the Windows native SQLite path limit. A shorter test name fixed the path. The final focused Room test passed for all three operations.

The first Spec review found three recovery gaps. A proposal-time stale response retried with old revisions. Accepted protected Matches retained stale Room values. Accepted-sync recovery replayed an old graph before upsert-only collection reads. The last path could retain Matches removed by a newer Rebuild.

The first full Android/JVM run confirmed the stale-revision regression. An existing Reflow contract bridge also timed out. The bridge test passed when run alone. Do not change its timeout without a repeatable failure.

## Decision Log


Use the current Workstream branch for this issue slice. The user requested implementation on the current worktree. The implement skill requires a commit on the current branch. The approved review base is `1c758491b103dab4dedce422472c31f1d925d85e`.

The user approved two test boundaries: the shared mobile Schedule actions and proposal review; and repository save-to-Room behavior, observed through repository reads after failure and offline reload. Use these boundaries for each regression test.

Keep PostgreSQL authoritative. Reuse the existing accepted-result Room transaction. Do not introduce cross-database transactions or run the scheduler again after a local cache failure.

Use the UI skill for accessible controls and review content. Keep the existing Compose theme, platform controls, and navigation patterns. Do not apply the skill's React Native examples to this Kotlin project.

Read the site Schedule route and maintenance contract before adding the UI entry point. The API path, request fields, response fields, DTOs, encoders, and repository API callers remain unchanged. The test-response helper now includes existing required nullable fields. This is not an HTTP contract change. No Prisma or Room schema changed. No backend or DB runtime operation is needed.

For the review fixes, use the accepted server graph for every Match. Match protection constrains the server operation, not cache refresh. Use `syncEventDetail` for authoritative recovery. Read the existing site detail route before changing the handler caller. This endpoint returns the full graph. Its Room writer removes absent Match IDs in the same transaction. Do not replay a stored or synthetic accepted result during recovery. No endpoint, request field, response field, DTO, or encoder changes. The detail response has no Schedule revision token. Do not claim that its separate server reads represent one revision under concurrent writes.

The Standards review required the `Screen` suffix for the new composable. Use one operation-label mapping. Replace the artificial save outcome with an explicit preparation result that records whether settings were saved. Keep the two small UI test setups explicit. The reviewer accepted that choice because the scenarios use different state transitions and callbacks.

## Context and Orientation


Build generates and places a Match Graph. Complete places only Unscheduled Matches and fixes all already placed Matches. Rebuild replaces only eligible graph structure and preserves protected Match history. A Schedule Proposal is transient until the backend accepts it. The accepted result contains the server graph and placements.

The action handler owns the editor and review state. The overview edit host currently renders maintenance menu items. The tabs host renders the Schedule and its floating controls. The overlay host renders proposal review and confirmation. The repository applies the accepted result to Room. The UI must continue to observe Room-backed data.

## Plan of Work


### Milestone 1: Expose maintenance from Schedule


Add a Schedule entry point that uses the same authoritative capability result and canonical proposal flow. Recheck capability when an action runs. Preserve the existing Match editing controls. Do not expose maintenance for unsupported Event Types, disabled Automated Scheduling, read-only accounts, or forbidden Event states. Avoid an independent scheduler or operation policy in the UI. Verify the public action flow and visible controls at the agreed boundary.

### Milestone 2: Complete review and persistence evidence


Check that review identifies protected, placed, and Unscheduled Matches with their teams and assignments. Check stale and failed operations against the prior Room-backed Schedule. Use existing in-memory Room tests where possible. Use a unique disk-backed Room database for restart coverage. Confirm that the accepted Event end, Match identities, placements, and assignments survive offline reload. Do not add an unnecessary Room schema change.

### Milestone 3: Verify, review, and deliver


Check whether the current local `main` contains commits absent from this branch before the final gate. Follow the Workstream synchronization rules. Run the complete Android/JVM suite once after implementation. Run the Standards and Spec reviews in separate agents against the agreed base. Resolve findings. Commit only this issue's changes. Do not push or deploy without separate authorization.

## Concrete Steps


Run mobile commands from `apps/mobile`. During each test-first cycle, run the affected class through the owning module. Example commands are:

    .\gradlew.bat :composeApp:testDebugUnitTest --tests '*EventEditActionHandlerTest' --console=plain -q
    .\gradlew.bat :composeApp:testDebugUnitTest --tests '*EventDetailOverlayHostUiTest' --console=plain -q
    .\gradlew.bat :core:repository-impl:testDebugUnitTest --tests '*EventRepositoryRoomPersistenceTest' --console=plain -q

These tasks also compile the affected Kotlin test and production sources. Run Gradle tasks sequentially in this worktree. At the final gate run:

    .\gradlew.bat testDebugUnitTest --continue --console=plain -q

Record the actual counts and failures below. Do not start, stop, or reconfigure the backend or DB without a current explicit request for that runtime operation.

## Validation and Acceptance


An eligible organizer can select the permitted maintenance operation from Schedule and review the server proposal. A forbidden operation cannot be submitted through the public action flow. Complete retains placed Matches. Rebuild retains protected Matches. Stale acceptance and rejected operations retain the prior cached Schedule. An accepted result remains readable offline after Room closes and reopens. A failed local write reports synchronization recovery and does not imply server rollback.

Use a regression test that fails before each behavior fix and passes after it. Observe persistence through the public repository interface where possible. Mock transport only at the network boundary. Do not describe mock transport tests as proof of client-to-site compatibility.

## Idempotence and Recovery


Keep stable operation identity for an unchanged retry. Use the existing accepted-sync recovery after a server commit. Give each disk Room test a unique database and remove that test database during teardown. Preserve all unrelated work. No production operation is in scope.

## Interfaces and Dependencies


Reuse `IEventRepository.proposeEventScheduleMaintenance` and `acceptEventScheduleMaintenance`. Use `syncEventDetail` for recovery from a current full snapshot. Reuse `EventEditorMaintenanceOperation` and the existing proposal DTOs. Use `EventEditorSnapshotDto.scheduleState.availableMaintenanceOperations` as the server operation result. Do not add a new API or duplicate server scheduling rules.

## Artifacts and Notes


Issue: https://github.com/Razumly/bracketiq/issues/41

Initial commit: `1c758491b103dab4dedce422472c31f1d925d85e`.

Initial branch: `workstream/issue-42-schedule-diagnostics`.

The first regression failed because the Schedule entry point did not exist. Implementation is in progress. No runtime state changed. The UI skill search script is absent, so use its written accessibility checklist and the existing app theme.

Focused action-handler results: 20 passed. The initial UI regression and existing proposal UI checks passed. The added UI retry check will run at the final gate. The focused disk Room test passed with Build, Complete, and Rebuild cases. The local `main` commit `a877f70c849298c1eb1f0362209a7ff2c4badbfd` is an ancestor of this branch. Its worktree was clean at the synchronization check, so no merge was needed.

## Outcomes & Retrospective


The Schedule entry point is implemented. It loads permitted operations from the server and does not save Event settings. The canonical proposal review remains in use. Accepted Matches use server values. Recovery reads the current full detail snapshot instead of replaying an old accepted graph. Offline maintenance persistence is verified. The Android/JVM suite and both independent reviews pass. The live Complete and Rebuild API tests also pass. They verify the full-detail recovery path against the site backend.

Revision note (2026-09-04): Created the plan after issue claim and the initial acceptance audit. Recorded the pending skill-required confirmations and existing implementation to avoid duplicate work.

Revision note (2026-09-04): Recorded user approval and the first test-first cycle. The new Schedule flow must use saved server settings without an Event save.

Revision note (2026-09-04): Recorded the implementation, focused verification, unchanged contract boundary, and test-fixture repairs before the final gate.

Revision note (2026-09-04): Recorded the independent review findings and the recovery decisions. The first implementation commit is `fc79fa6c2`. The protected-Match regressions failed with the old cached start time. Verification of the fixes remains in progress.

Revision note (2026-09-04): The user paused the work. The active test run stopped. Work resumed after the user requested continuation. The focused action-handler, coordinator, and UI suites now pass all 45 tests. The Room suite passed 26 tests. The new recovery test initially exceeded the Windows SQLite path limit, then passed with a shorter name. All 27 Room cases have now passed against the fixes. The recovery test verifies that failed refresh retains the cache and that a newer graph replaces old Match IDs before offline reload.

Revision note (2026-09-04): The review-fix commit is `fddbce1a7`. The next complete suite found two additional legacy assertions in `EventRepositoryHttpTest` that expected stale local Match values. Align them with the accepted server graph. Keep the stale-row deletion and Unscheduled Match checks. The repeat Spec review found no remaining implementation gap. The Standards review suggested shared Match assertion helpers. Apply that test-only cleanup and rerun the complete Android/JVM suite.

Revision note (2026-09-04): Commit `07ef50d44` contains the final test corrections. The complete Android/JVM command exited successfully. XML reports contain 1,982 tests, zero failures, zero errors, and 13 skips. The skipped tests require a live backend, including the existing Complete and Rebuild API checks. Standards and Spec reviewers report zero remaining findings through this commit. Local `main` remains the clean ancestor `a877f70c849298c1eb1f0362209a7ff2c4badbfd`.

Revision note (2026-09-04): The issue tracker runbook requires client-to-site verification for a changed site/mobile workflow. The current `.env.local` points to local database `bracketiq_e2e_40_563b` on port 5543. Its configuration does not set the outbound-provider test guard. Ports 3000 and 5543 respond, but this does not prove that the process configuration matches the worktree file. Do not run fixture writes against that database. Prepare `bracketiq_e2e_41_563b` and a separately configured local test backend only after the user approves the runtime operation. No backend or database process was started, stopped, or reconfigured. Keep issue 41 open until the live maintenance check passes.

Revision note (2026-09-04): The user approved the isolated database and backend. Created `bracketiq_e2e_41_563b` on the existing PostgreSQL server at `127.0.0.1:5543`. Applied all 224 migrations. Migration status reported no pending migrations before fixture seeding. Started the HTTP test backend on `127.0.0.1:3111`, with its own build cache under `apps/site/.tmp/issue41/next`. The app-version isolation probe confirmed the database URL hash and the disabled outbound-provider guard. The existing backend and `.env.local` remain unchanged. Runtime helpers are ignored local artifacts under `apps/site/.tmp/issue41`.

Revision note (2026-09-04): Extended the two existing live maintenance tests with `syncEventDetail` checks. Both pass, with zero failures and zero skips. They verify the accepted Event end and full Match Graph after detail refresh. The Complete test verifies placed-Match protection. The Rebuild test verifies in-progress and Locked Match protection, stale-row removal, replacement rows, and Unscheduled Matches. The command uses `.tmp/issue41/run-mobile-tests.mjs` with the two `EventLifecycleMobileApiIntegrationTest` maintenance selectors. No production code or HTTP field changed during this final check. The earlier full Android/JVM run remains 1,969 passed and 13 live-backend skips; these two live tests now have separate passing evidence. iOS execution remains excluded by the user.
