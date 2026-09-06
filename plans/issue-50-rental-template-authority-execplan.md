# Preserve Rental Booking and Event Template authority

This plan follows root `PLANS.md`. Keep its progress and evidence current.

## Purpose

An organizer can add Resources and nonconflicting Time Slots to an Event that uses a Rental Booking. The editor must preserve the booked Resources, booked Time Slots, destination Organization, and booking identity. A Resource is a field or court. A Time Slot is an availability interval. Event Template values are editable defaults. A failed save must leave the Event and mobile Room cache unchanged.

## Context Boundary

Use issue #50 and its parent #14. Blockers #24, #26, and #47 are closed. Read root and application AGENTS files, the issue workflow documents, `CONTEXT.md` entries for Rental Booking and Event Template, and ADRs 0001, 0002, and 0010. The initial code boundary is `apps/site/src/server/events/eventEditorSave.ts`, `eventEditorSnapshot.ts`, `apps/site/src/contracts/eventEditor.ts`, their routes and tests, and the mobile Event Editor mapper, gateway, rental coordinator, shared resource controls, and Room tests. Expand into rental checkout locks only to prove concurrent reservation behavior. Expand into billing only to identify booking ownership; do not change payment behavior.

## Progress

- [x] (2026-09-05) Read the issue and approved parent spec. Claim #50 and set Project Status to In progress and Area to Shared.
- [x] (2026-09-05) Identify blanket collection locks and mobile removal of attached rental resources.
- [x] (2026-09-05) Add failing command-boundary tests and implement source authority checks. The first 65 focused site tests pass.
- [x] (2026-09-05) Preserve booked selections in mobile and expose editable additions in shared controls. Focused coordinator tests pass after a 15-minute Android build.
- [ ] Verify API compatibility, Room preservation, template defaults, and real database reservation races.
- [x] (2026-09-05) Run the focused Android create, edit, rental selection, and shared control tests: 128 passed, no failures or skips. Fix review findings for complete Resource collections, booked field defaults, and template proposal source identity.
- [x] (2026-09-05) Pass the latest site type check. Pass 128 focused site control and repository tests. Complete the Spec follow-up for current Division assignments on attached and unsaved rental selections. The Standards review reports no remaining breach.
- [x] (2026-09-05) Pass 100 schedule-page tests and 41 Event search tests. Pass all three split-division route tests after fixing proposal validation and test fixtures.
- [x] (2026-09-05) Complete the broad related site run: 192 suites and 1,329 tests passed. Resolve all four failures in the three remaining suites. The final authority and form-section rerun passed all 39 tests. Both isolated EventForm rechecks passed.
- [x] (2026-09-05) Pass the final site TypeScript check and targeted lint. Full site lint passed with 51 warnings and no errors. Complete both review follow-ups with no open findings.
- [x] (2026-09-05) Pass all 106 mobile network tests and 1,639 Compose tests. Compose reports ten skipped tests and no failures or errors. Fix a missing Field import in the mapper regression test before the repository test rerun.
- [x] (2026-09-05) Pass Android lint with 68 warnings and no errors. The combined run took 16 minutes and failed only on the mapper test import that was then fixed.
- [x] (2026-09-05) Pass all 149 repository Android tests after updating the shared contract fixtures. Five tests require live or environment-specific fixtures and were skipped. The live #50 test compiled but did not run.
- [x] (2026-09-05) Complete local checks and both final review follow-ups. Prepare the implementation commit. Keep #50 open until live acceptance checks pass.

## Context and Orientation

The current branch is `workstream/issue-42-schedule-diagnostics`. The implementation base is `cdb8270ed`. The server Event Editor uses one transaction for each save. Its snapshot supplies the current draft and immutable fields. The current rental guard locks entire resource and slot collections, which prevents valid additions. Mobile stores booking identity and slot locks in Time Slot records in Room, but its rental coordinator can remove attached slots. Checkout already uses transaction advisory locks per Resource and rejects overlapping active holds.

## Decision Log

Use the precedence from #14: Event Type rules, registration and protected Match history locks, Rental Booking constraints, Organization policy, organizer values, then template defaults where no value exists. Conflicting immutable sources fail. A template does not acquire booking authority.

Treat concurrent nonblocking requests as simultaneous reservations for available windows. Preserve rejection of overlapping reservations. Do not add an approval-request lifecycle or change payment, cancellation, or refund workflows.

Use the approved Event Editor command/result seam for tests. Use database tests for transaction races and rollback. Use thin shared Compose interaction tests for controls. Existing booking-to-Event attachment remains allowed; booking dates, Resources, destination, price, and lifecycle state must not change through Event editing.

## Plan of Work

First add command tests that distinguish booked rows from organizer additions. Replace the collection lock in `eventEditorSave.ts` with booked-row checks. Reject conflicting Organization input during bootstrap. Preserve current organizer values when template defaults are loaded. Reuse canonical typed immutable errors where the contract already supports them.

Next update the mobile rental coordinator and shared resource controls to retain attached booking selections. Keep new selections editable. Carry the existing booking fields through DTOs and Room. Surface the server error without discarding the current editor draft.

Finally exercise the site API from the mobile client. Use the isolated database `bracketiq_e2e_50_samue`. Prove that disjoint reservations both succeed and overlapping reservations have one winner. Run the relevant site suites, TypeScript, ESLint, Android tests, and lint in sequence. Use the code-review skill for Standards and Spec reviews. Commit only task files.

## Concrete Steps

Run site commands from `apps/site`. Run focused Jest files with `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath <files>`. Run `node node_modules/typescript/bin/tsc --noEmit`. Run the full Jest suite with `--runInBand --coverage --json --outputFile=test-results/issue-50-full.json`. Then run `npm run coverage:check-routes`. This uses one worker because this host has limited memory. Run Gradle from `apps/mobile` with `.\gradlew :composeApp:testDebugUnitTest` and `.\gradlew :composeApp:lintDebug`.

The focused Android command uses `:composeApp:testDebugUnitTest` with `--tests` filters for `EventRentalResourcesCoordinatorTest`, `EventEditDraftCoordinatorTest`, `EventEditPayloadBuilderTest`, `DefaultCreateEventComponentTest`, and `EventDetailsScheduleControlsUiTest`. It uses `--console=plain --offline --max-workers=1`.

After runtime recovery, run `scripts/seed-rental-authority-contract.ts` with the named database and a local test `AUTH_SECRET`. Start the approved site on port 3108 with the same database and secret, plus `MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1`. Pass the fixture token and Event ID privately through `MVP_ISSUE50_TOKEN` and `MVP_ISSUE50_EVENT_ID`. Set `MVP_ISSUE50_API_URL` to the local site URL. Run the live rental test in `EventRepositoryRoomPersistenceTest`. Then run `scripts/verify-rental-authority-contract.ts` to check template current values, create replay, and complete booking row equality. Run `rentalCheckoutLocks.database.integration.test.ts` with `RUN_DATABASE_INTEGRATION=1` against the same isolated database.

Before database tests, prepare the isolated logical database. Run `npm run migrate:deploy`, then `npx prisma migrate status` against that database. Proceed only with no pending migrations. Inspect the existing Postgres container on port 5543. Obtain current explicit authorization before any required runtime start or reconfiguration. Windows cannot run native iOS simulator tests; report this limit and use shared-code evidence without claiming native execution.

## Validation and Acceptance

A booked row cannot be removed, moved, or rebound. An organizer can add a separate Resource and a nonconflicting Time Slot. A template-derived name or configuration remains editable. An explicit destination Organization that conflicts with a booking returns a typed error before mutation. Both site and mobile preserve current values after failure. A successful API result reaches Room before the UI observes it. Concurrent disjoint rental reservations succeed; an overlap cannot double-book a Resource. A failed multi-window reservation leaves no partial holds.

## Idempotence and Recovery

Keep test data in the named issue database. Do not expose local session tokens. Preserve existing untracked reports. Do not stop or restart runtimes without authorization. Let heavy checks finish and run them sequentially. Retry a create only with its original operation identity after a user action.

## Interfaces and Dependencies

The Event Editor contract now uses version 5. Its parser accepts versions 3 and 4. Version 5 adds optional `draft.resources.sourceTemplateId` to snapshots, save commands, create commands, and proposal drafts. This field identifies the source Event Template. `requiredTemplateIds` continues to carry document requirements. Template bootstrap now uses the actual template requirements instead of inserting the Event Template ID. Legacy create commands retain the old source lookup for versions below 5. Update the site adapter, site create bootstrap query, mobile DTO, and mobile encoder together. The mobile mutation mapper retains source metadata through the existing DTO copy. Pending create snapshots already persist this DTO as JSON in Room. No Room entity shape change is needed.

## Surprises & Discoveries

The server compared entire `fields` and `timeSlots` arrays for rental immutability. Mobile selected every item that shared a booking ID. Both behaviors conflict with #50. Booking `organizationId` identifies the facility; `renterOrganizationId` identifies the destination. Template bootstrap also confused an Event Template ID with document requirements. Version 5 separates these values.

Docker Desktop failed during the approved start. It could not remove `AppData/Local/Docker/run/userAnalyticsOtlpHttp.sock`. A separate approval request is pending to close Docker Desktop, remove only that stale socket, and start Docker Desktop again. No container or volume deletion is proposed.

## Artifacts and Notes

Store disposable validation reports under `apps/site/test-results`. Do not commit credentials or session files.

The full site run found Windows platform failures in the affiliate runner and deployment tests. They require Linux sockets, file modes, symlinks, and no-follow file access. Stop this test run after the platform failures are confirmed. Do not claim a full-suite or coverage pass. Run the remaining Event, scheduling, rental, and contract suites without repeating suites that already passed on this implementation.

The schedule-page suite found four expectations for version 4 and four missing Save controls. Update the current-version fixtures. Rerun this suite and check the Save control failures before changing production behavior. Two Event search tests assumed that date clauses were at the top level. The current route groups these clauses by Event Type. Update the assertions to inspect the nonweekly branch. The split-division route tests used an empty field blocker catalog. Supply its required date boundary and interval maps so these tests reach the scheduling assertions.

The isolated Save test took 1.5 seconds and passed with a longer wait. The default UI wait was one second. Set a five-second wait for this suite and restore the prior setting after the suite. All 100 page tests then passed. This changes only the test wait.

The split-division route tests exposed two production validation gaps. Partial proposal generation skipped the League roster validation used by full scheduling. Reuse that preparation function before the partial builder. Missing split playoff divisions raised a generic Error and produced HTTP 500. Use the existing ScheduleError so the API returns HTTP 400. The route tests now prove no proposal or schedule writes for both invalid inputs. The acceptance fixture also supplies Division persistence and verifies the reviewed Team memberships.

The authority regression test exposed a duplicate-row bypass. Validation selected one booked Resource row, but persistence processed every row. Require exactly one submitted row for each booked Resource and Time Slot. The regression failed before the guard change and passed after it.

The broad related run skipped five suites and 34 tests. Real database tests require the approved local database. Two EventForm tests failed during the broad run and passed in isolation without code changes. The stale affiliate form-section test now changes Resource Count and verifies the editor callback. External registration retains Event resource controls under #48.

The full repository Android run found six stale version 4 expectations in shared League and Tournament fixtures and proposal request tests. Update these expectations for version 5. Keep the complete independent Tournament wire assertion and add its nullable sourceTemplateId field. Site parity tests now require the current contract version in shared fixtures. All six site parity tests pass. The final site type check and targeted lint pass. Both review follow-ups report no findings.

## Outcomes & Retrospective

The implementation preserves booked rows and permits separate organizer additions. Template defaults remain editable. Site and mobile use contract version 5 and retain parsers for versions 3 and 4. The relevant site tests, type checks, lint, and Android unit tests pass. Both final reviews have no findings.

Live acceptance is incomplete. Docker Desktop failed during its approved start. The separate recovery approval remains pending. The client-to-site Room test, booking-row comparison, and real database reservation races still require the isolated local database and site. Keep #50 open. The full site suite has confirmed Windows platform failures. No full-suite coverage pass or native iOS execution is claimed.

Plan created on 2026-09-05 to record the accepted authority rules and verification boundaries.

Plan updated on 2026-09-05 to record source identity, contract version 5, focused test evidence, and the Docker startup failure.

Plan updated on 2026-09-05 to record all local checks, parity fixture updates, final reviews, and the remaining live acceptance gate.
