# Complete mobile Schedule Proposal review

This plan follows `PLANS.md`. Keep this record current during implementation.

## Purpose / Big Picture

An organizer must review a complete or incomplete Schedule before acceptance. A failed request must retain setup and offer retry. Back must return to setup. A Partial Schedule must still show its Unscheduled Matches after the app reloads Room.

## Context Boundary

Use issue #39 and its comments, the root and mobile AGENTS files, and the Event creation and maintenance proposal components. Read the site `src/contracts/eventEditor.ts` and editor route to confirm existing request and response fields. Use `CONTEXT.md` Schedule terms and ADRs 0001 and 0010. Expand into repository and database files only to prove accepted Schedule reload. No HTTP, Prisma, or Room entity change is planned.

## Progress

- [x] (2026-09-04) Read the issue, skills, and applicable repository rules. Claim issue #39.
- [x] Add failure recovery and back navigation with focused tests.
- [x] Share review lifecycle behavior and require explicit partial confirmation.
- [x] Show accepted Unscheduled Matches in the Room-backed Schedule. Add an offline database reload test.
- [x] Run focused checks and the complete Android/JVM suite. Review both standards and specification.
- [x] Complete the final review fixes and the aggregate test task. Record the final commit in the issue close comment.

## Surprises & Discoveries

Creation and maintenance already have proposal contracts, diagnostics, stale rejection, and acceptance persistence. Creation ignores dialog dismissal. Maintenance uses a generic Accept action for incomplete results. The Schedule tab removes Matches with no start time. Creation display validation also treats optional staffing gaps as errors.

The real Room reload test found an unconditional Event and time-slot deletion at repository startup. Remove that deletion. Keep cache invalidation on account changes. The first disk-backed run also exceeded the native SQLite path limit on Windows. Use a shorter test name with the same unique database identity.

## Decision Log

Use the current branch, as directed by the implement skill and the ongoing Workstream. The review base is commit `9ce03fc72`. Use the public test boundaries identified in the preceding review: component actions, shared Compose dialogs, and repository reads after Room reload. Existing site contracts remain the authority. Native iOS execution remains excluded on Windows, as requested earlier.

## Context and Orientation

`apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt` owns transient creation state. `CreateEventScreen.kt` renders the proposal. `eventDetail/EventEditActionHandler.kt` owns maintenance actions. `EventDetailOverlayHost.kt` renders maintenance review. `schedule/` contains shared review presentation. `EventDetailTabsHost.kt` supplies the Room-backed Schedule. `apps/mobile/core/repository-impl` saves accepted graphs in Room transactions.

## Plan of Work

First prove failure recovery and unchanged setup through the Create component boundary. Add explicit retry and return-to-setup behavior with stable request identities. Then share lifecycle presentation across creation and maintenance. Require a separate confirmation before accepting an incomplete result. Keep stale and busy results non-accepting. Finally expose Unscheduled Matches in the Schedule and prove accepted placements survive Room reload.

## Concrete Steps

Run commands from `apps/mobile` with JDK 17. Use `./gradlew :composeApp:testDebugUnitTest --tests '*DefaultCreateEventComponentTest'` for the first slice. Add the relevant dialog filters for later slices. Use `:core:repository-impl:testDebugUnitTest` for Room checks. Run `./gradlew testDebugUnitTest --continue` once at the end. Do not run concurrent Gradle commands in this checkout.

## Validation and Acceptance

Failure retains all setup values and allows retry. Back returns to those values without acceptance. Complete proposals need review acceptance. Partial proposals also need explicit confirmation. Stale proposals need a new review. Proposed data does not enter Room. Accepted unplaced Matches remain visible after repository and database reload. Use existing client-to-site tests if the local backend is available and compatible. Record any unavailable verification explicitly. No runtime restart is part of this implementation request.

## Idempotence and Recovery

Retry an unchanged request with the same operation identity. Use a new identity after setup changes or explicit refresh of a stale proposal. Preserve existing untracked issue 45 reports. Keep local test databases isolated. Do not change external runtimes.

## Artifacts and Notes

Record test counts and review results here after verification. The site and mobile HTTP shapes remain unchanged unless new evidence requires a contract change.

The first retry test failed because the error had no retry action. The partial-confirmation and optional-staffing tests also failed before their fixes. A later focused run compiled and ran 124 tests. Two tests failed. The refresh test needed the new explicit failed state. Maintenance dismissal needed to cancel a read-only refresh before it could write. Both paths were corrected. The first Room test compile found that Event relations do not contain Matches. The reload test now reads the public Match DAO flow that feeds the Schedule.

No API path, request field, response field, serializer, Prisma model, or Room entity changes. The existing partial acceptance mode and operation identities remain in use. No runtime was started, stopped, or restarted.

The standards review found dialog-owned confirmation state and duplicate transitions. Move confirmation into the shared review state and its owners. The specification review found that Create returned to Preview and that maintenance back required an online rollback. Return Create to its prior setup step. Hide maintenance review immediately while retaining rollback recovery. Add regression tests for Preview navigation, stable retry identity, and offline setup access. The focused run then passed 127 tests, including the real Room reload test. The full run found a wrong property name in an added time-slot assertion (`id` instead of `slotId`). Correct that test assertion before completing verification.

The second review found startup account restoration and editor cancellation gaps. Ignore the unresolved empty user while startup authentication is Checking. Retain rollback recovery when the organizer cancels the editor. Extend the Room test to restore the same account, then change accounts. Await the public cache flow before checking asynchronous account-change cleanup. Replace optional confirmation branches in tests with a helper that requires confirmation before acceptance. Remove two old fixture reseeds that compensated for startup cache deletion.

Android lint ran. It reports 13 existing errors and 83 warnings. The errors are one `PropertyEscape` in ignored `apps/mobile/local.properties` and 12 `UnrememberedMutableState` errors in Event Map and unrelated search/team dialog tests. Git comparison with the issue base confirms those tracked files are unchanged. No lint error points to issue 39 code. Do not change unrelated files to hide these errors.

## Interfaces and Dependencies

Use Kotlin StateFlow for transient review state and shared Compose for Android and iOS presentation. Use existing Event Editor DTOs at HTTP boundaries. Use Room-backed repository reads for the accepted Schedule. Do not copy the scheduler into mobile code.

## Outcomes & Retrospective

Issue #39 is implemented. The Android/JVM suites cover 1,974 tests: 1,961 passed and 13 skipped. All seven modules with test results passed. Shared Kotlin and Compose code compiled. Native iOS execution remains excluded on Windows. Live backend integration was not rerun because no HTTP path, DTO, serializer, request, or response changed.

The checks cover proposal failure and retry, exact acceptance identities, stale rejection, separate Partial Schedule confirmation, Preview back navigation, offline maintenance recovery, and the visible Unscheduled Matches section. The disk-backed Room test verifies exact placements, Event and time-slot retention, restored-account startup, and account-change cleanup. The complete repository suite passed after the asynchronous cleanup assertion was corrected.

Run `./gradlew testDebugUnitTest --continue --console=plain -q` from `apps/mobile` for the aggregate test task. Android lint has the unrelated errors listed above. No production runtime changed. No HTTP or database schema changed. Preserve the two unrelated issue 45 report files.

Final aggregate verification: the command above exited with code 0. The JUnit reports contain 1,974 tests, 0 failures, 0 errors, and 13 skips.

## Standards

No unresolved findings remain. Confirmation state belongs to the review owners. Both owners use the shared transitions. Confirmation tests assert the first step before acceptance.

## Spec

No unresolved findings remain. Create returns to setup. Offline maintenance return retains setup and recovery. Restart restores the accepted Schedule. Cancel cannot discard pending rollback recovery.

Review totals: Standards 0 unresolved findings; Spec 0 unresolved findings.

Plan revision: 2026-09-04. Created from the issue review and current source inspection.
