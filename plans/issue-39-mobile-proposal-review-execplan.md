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
- [ ] Run focused checks and the complete Android/JVM suite. Review both standards and specification. Commit the changes.

## Surprises & Discoveries

Creation and maintenance already have proposal contracts, diagnostics, stale rejection, and acceptance persistence. Creation ignores dialog dismissal. Maintenance uses a generic Accept action for incomplete results. The Schedule tab removes Matches with no start time. Creation display validation also treats optional staffing gaps as errors.

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

## Interfaces and Dependencies

Use Kotlin StateFlow for transient review state and shared Compose for Android and iOS presentation. Use existing Event Editor DTOs at HTTP boundaries. Use Room-backed repository reads for the accepted Schedule. Do not copy the scheduler into mobile code.

## Outcomes & Retrospective

Implementation is in progress.

Plan revision: 2026-09-04. Created from the issue review and current source inspection.
