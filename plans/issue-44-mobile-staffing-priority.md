# Complete mobile Staffing Priority behavior for issue #44

This ExecPlan follows `PLANS.md`. Keep this file current as work continues.

## Purpose / Big Picture

Hosts must retain the exact Staffing Priority when they save an Event. They must understand which staffing gaps can prevent Match placement. Mobile must use the same five priorities as the site. It must keep Team duties separate from named Official Positions.

## Progress

- [x] (2026-09-05) Read issue #44 and all comments. Both native blockers, #39 and #43, are closed. Claim the issue in the existing isolated Workstream.
- [x] (2026-09-05) Trace mobile state, DTOs, Room, proposal review, and the site response contract.
- [x] (2026-09-05) Remove mobile scheduling-mode types, conversions, and fallback parsing. Generate Room schema 106.
- [x] (2026-09-05) Add one shared proposal coverage summary. Expose accessible radio selection.
- [x] (2026-09-05) Verify all five priorities through serialization, Room, the site parser and scheduler, and both review interactions.
- [x] (2026-09-05) Run the complete mobile suites. Fix the remaining graph validator dependency. Rerun the affected checks. Run the site suite and focused contract checks. Complete independent Standards and Spec reviews. Commit the work.

## Surprises & Discoveries

The site proposal graph requires `officialSchedulingMode` as well as `staffingPriority`. Mobile currently converts between these fields even when it has the canonical priority. Two priorities collapse into the same obsolete value.

The current branch is `workstream/issue-42-schedule-diagnostics`. The task starts at commit `9841a4d90a3a07fecd22d1c795ad27c29e344841`. Two untracked issue-45 test reports already exist. They are outside this change.

The sandbox cannot use the network or the normal user Gradle cache. Run authorized build commands with escalation when needed.

## Decision Log

Keep the existing site response field for supported clients. Remove it from mobile DTOs and state. The mobile graph validator can accept the site's existing extra field without interpreting it. Do not change the required HTTP response shape or contract version. `apps/site` owns the contract. No API path or request field changes. Mobile continues to send `staff.staffingPriority`, `doTeamsOfficiate`, `teamOfficialsMaySwap`, `officialPositions`, and `eventOfficials` independently.

Use the verification boundaries requested in the user audit: save and reload, offline Room persistence, equivalent mobile/site scheduling, and accessible selection and proposal review. These are the test boundaries for the TDD workflow.

Follow the existing Room cache policy. Increase schema version 105 to 106. Generate the schema through Gradle. Keep the existing destructive cache migration policy.

## Context and Orientation

`apps/mobile/core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/OfficialStaffing.kt` defines Staffing Priority and staffing helpers. `Event.kt` is also the Room Event entity. `core/network/.../dto/EventDtos.kt` hydrates Events. `EventEditorDtos.kt` defines editor and proposal messages. `core/repository-impl/.../EventEditorSessionMapper.kt` maps editor state to save commands. `EventEditorRemoteGateway.kt` validates responses before Room writes.

`composeApp/.../eventDetail/shared/StaffingPrioritySelector.kt` supplies both editor variants. Create proposal review is in `eventCreate/CreateEventScreen.kt`. Maintenance review is in `eventDetail/EventDetailOverlayHost.kt`. Both use `schedule/ScheduleDiagnosticsReview.kt` for hard Restricting Factors.

`apps/site/src/contracts/eventEditor.ts` owns the editor wire format. `src/server/scheduler` owns staffing assignment and outcomes. Existing contract test scripts accept client JSON on standard input. Reuse this pattern to run client-produced commands through the real site parser and scheduler.

## Context Boundary

Use issue #44, the user audit, root and child AGENTS files, `PLANS.md`, `docs/agents/issue-tracker.md`, `docs/agents/workstream-execution.md`, and the database isolation runbook. Read the named mobile sources, their direct callers and tests, the exact site editor schema and scheduler adapters, and the Officiating Plan entries in `CONTEXT.md`. Expand only when a changed field or failed check identifies another caller. No parent issue or historical plan is required.

## Plan of Work

First, add a regression at the Event hydration boundary. Prove that obsolete wire data cannot enable Team duties or overwrite a canonical priority. Remove the enum, converters, fields, and obsolete test expectations. Keep the established default for an absent priority. Reject an invalid explicit value.

Next, share the approved priority descriptions between selection and review. Show the selected priority and its coverage requirements. Explain required coverage, optional warnings, and conflict behavior. Keep the existing diagnostics. Make each selector row one radio control with a selected state.

Finally, add a five-priority matrix. Build commands through the mobile mapper. Send serialized commands to a site test script. Compare them with site commands from the same fixture. Compare assignments, outcomes, and warnings from the scheduler. Test reload and offline reads through the repository with an in-memory Room database. Exercise selection and acceptance through Compose semantics.

## Concrete Steps

Run mobile commands from `apps/mobile`. Use `.\gradlew.bat :core:network:testDebugUnitTest --tests '*EventDtosTest' --console=plain` for the first slice. Run the focused repository and Compose tests as they are added. Run `.\gradlew.bat :composeApp:roomGenerateSchema` or the owning `:core:database` schema task if the old alias no longer exists.

Run site commands from `apps/site`. Use `npx tsc --noEmit`. Run focused Jest tests for the editor contract and staffing scheduler. At the final gate, run each affected complete test suite once. Record failures and their scope.

## Validation and Acceptance

Every priority must retain its exact enum value after editor serialization, API hydration, and an offline Room read. Changing a priority must leave Team duty settings and named positions intact. The same mobile and web fixture must produce equal staffing assignments, schedule outcomes, and warnings. Optional gaps must allow acceptance. Hard Restricting Factors must remain distinct. Screen-reader semantics must identify all five radio options, their descriptions, and the selected option. Both proposal review paths must explain coverage without relying on color.

## Idempotence and Recovery

Tests use in-memory Room databases or unique test files. Contract checks run in a test process and need no deployed runtime. Do not start or reconfigure an application service. Do not change production. Preserve unrelated files. Retry failed build commands after resolving the reported environment or code error.

## Interfaces and Dependencies

Keep `StaffingPriority` as the only mobile priority type. Keep `Event.withStaffingPriority` as the editor state update. Remove `OfficialSchedulingMode`, its Room converters, and its bidirectional mappings. Update EventApiDto, EventEditorMaintenanceGraphEventDto, graph-to-Event mapping, EventEditorSessionMapper, and EventEditorRemoteGateway together. Use the existing Kotlin serialization, Room, Compose, Zod, and scheduler modules.

## Artifacts and Notes

The initial Gradle command failed before compilation because the sandbox could not download the Gradle distribution. Escalated tests used the installed cache. The obsolete-wire regression failed before the change and passed after it. The radio-role regression failed before the change. The revised selector and the five-priority create review test passed.

The site test fixture must set a fixed end. The scheduler model defaults to an open end. Match UUIDs differ between separate scheduler runs. The comparison maps warning references to stable Match numbers and retains warning codes, text, and affected Matches. All 20 site-side cases passed. The site type check passed after the required fixture IDs were checked. Complete suites are running.

## Outcomes & Retrospective

Issue #44 is implemented. Mobile has one canonical Staffing Priority. Both review paths explain required and optional coverage. The selector exposes one radio row for each priority. Room schema 106 removes only the obsolete Event column. No server response field was removed. No scheduler was added.

The complete mobile run covered 104 network tests, 148 repository tests, and 1,643 application tests. It found 14 failures caused by the remaining required graph key. After that fix, all 145 runnable repository tests passed, with three skipped. All 96 affected application tests passed. This includes all prior application failures and both five-priority review tests. The 104 network tests passed. The other application tests passed in the complete run; ten integration tests were skipped because no backend was configured.

The 20-case test sends a mobile-serialized save command to the real site parser and scheduler. It compares the site editor output, assignments, outcomes, and warnings. It saves the returned draft through the repository. It reloads the Event. It then reads from Room while the transport rejects all requests. Every priority and all four combinations of Team duties and named positions passed.

Site typechecking and ESLint for the new script passed. Five site contract and scheduler suites passed all 75 tests. The broad site run did not pass. It was stopped after at least 30 failing suites in unchanged code. Failures included sandbox process-launch failures, timeouts, and old UI and scheduler expectations. This task does not claim a green full site suite. The focused site checks ran outside the sandbox and passed in 4.913 seconds.

Standards review found no documented breaches. Its one Duplicated Code concern was resolved by sharing the site test-process helper. The follow-up review found no remaining concern. Spec review found no remaining gaps after the graph key became optional.

All new product UI code is shared Compose code. Android JVM semantics tests passed. Native TalkBack and VoiceOver device checks were not available in this Windows workspace. No deployment or production state change was made.

Plan created on 2026-09-05 after the contract trace. The response compatibility decision limits the cutover to mobile while retaining the supported site wire shape.


## Final Verification Commands

From `apps/mobile`, the complete run used `.\gradlew.bat :core:network:testDebugUnitTest :core:repository-impl:testDebugUnitTest :composeApp:testDebugUnitTest :core:database:copyRoomSchemas --offline --continue --console=plain`. The final rerun used `.\gradlew.bat :core:repository-impl:testDebugUnitTest :composeApp:testDebugUnitTest --tests '*EventRepositoryHttpTest' --tests '*StaffingPrioritySelectorUiTest' --tests '*ScheduleProposalDialogUiTest' --tests '*EventDetailOverlayHostUiTest' --offline --continue --console=plain`. It completed with `BUILD SUCCESSFUL`.

From `apps/site`, run `node node_modules/typescript/bin/tsc --noEmit --pretty false`. Run `node node_modules/eslint/bin/eslint.js scripts/test-staffing-priority-contract.ts`. The focused Jest command is `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/contracts/__tests__/eventEditor.test.ts src/server/scheduler/__tests__/officialStaffingModes.test.ts src/server/scheduler/__tests__/serialize.test.ts src/server/scheduler/__tests__/leagueEditorParity.test.ts src/server/scheduler/__tests__/tournamentEditorParity.test.ts`. It reported five passed suites and 75 passed tests.

Plan updated on 2026-09-05 with final verification, the graph validator fix, independent review results, and the broad site-suite limitation. The current local main branch is already an ancestor of this Workstream; no merge was required.
