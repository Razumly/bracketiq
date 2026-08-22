# Enforce Registration Structure and Competition Event Creation

This ExecPlan is a living document. Maintain it under the requirements in `PLANS.md`.

## Purpose / Big Picture

Event organizers need reliable League and Tournament creation. They must choose valid registration structure, preserve every competition value, and choose whether BracketIQ builds a Schedule during Create. After this work, an organizer can create a scheduled or intentionally unscheduled League or Tournament without losing divisions, timing, Resources, Time Slots, playoff or bracket settings, officiating, or End Policy. A failed Create leaves no partial Event or Match Graph data. An organizer cannot change Event Type or Registration Unit after an accepted Participant Registration or protected Match history.

A human can observe the result through the event editor and its HTTP contract. Focused site tests must prove the create command, End Policy validation, immediate form changes, atomic rollback, registration capacity, and structural locks. Mobile tests must prove that the lock and capability result reaches the editor and Room-backed Event state when issue #30 changes the mobile contract.

## Progress

- [x] (2026-08-21) Read the three issue specifications, repository rules, product context, TDD rules, and code-review workflow.
- [x] (2026-08-21) Confirm that issue #14 is a tracking parent and that issues #30, #31, and #33 are the requested child issues.
- [x] (2026-08-21) Confirm that the current branch is `workstream/repeating-time-slots` and contains the completed repeating Time Slot work on top of `main`.
- [x] (2026-08-21) Map the Event Editor contract, transaction path, registration service, immutable-field derivation, and web event form seams.
- [x] (2026-08-21) Capture review point `f07802b4aaee4ad7b59b27f2b06104c58ac66a6e` for the final code review.
- [x] (2026-08-21) Implement issue #30 registration capacity and structural lock behavior.
- [x] (2026-08-21) Implement issue #31 scheduled and unscheduled League creation on web.
- [x] (2026-08-21) Implement issue #33 scheduled and unscheduled Tournament creation on web.
- [x] (2026-08-21) Add or update focused tests at public site and mobile seams.
- [x] (2026-08-21) Run regular focused type checks and single-test-file checks.
- [x] (2026-08-21) Run the complete site and mobile suites once after all changes.
- [x] (2026-08-21) Run the two-axis code review against the pre-work branch point.
- [x] (2026-08-21) Address review findings and rerun affected checks.
- [x] (2026-08-21) Commit the completed work on the current branch.
- [x] (2026-08-21) Run the follow-up two-axis review from `7adb96ba9eeae3f20cd667e9e37691d924980a6d` through `HEAD`.
- [ ] Preserve event-registration identity when participant bills create or update installment payments.
- [ ] Route paid bill success and failure through the event-registration lifecycle.
- [ ] Replace the delegation-only bill payment capacity test with a provider-independent observable regression.
- [ ] Type the participant registration response mapper from its Prisma select.
- [ ] Extract the shared paid-registration payment-resolution persistence path.
- [ ] Move the finite payment-resolution reason type to the shared response contract.
- [ ] Split `RoomDatabaseBehaviorTest` by DAO capability.

## Surprises & Discoveries

- Observation: The Event Editor already uses `snapshot.immutable.fieldNames` to disable `eventType` and `teamSignup` in the site and mobile editors.
  Evidence: `apps/site/src/server/events/eventEditorSnapshot.ts`, `apps/site/src/app/events/[id]/schedule/components/EventForm.tsx`, and `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventEditDraftCoordinator.kt`.

- Observation: The current registration lock query only checks `PENDING`, `ACTIVE`, and `BLOCKED` participant rows. It does not retain an accepted-registration lock after a row changes to `CANCELLED`.
  Evidence: `hasJoinedEventParticipant` in `apps/site/src/server/events/eventRegistrations.ts` uses `JOINED_EVENT_PARTICIPANT_STATUSES` and excludes cancelled rows.

- Observation: The current Event Editor already has `CREATE_ONLY` and `CREATE_AND_BUILD_SCHEDULE` completion modes, persists a League or Tournament Match Graph for `CREATE_ONLY`, and builds a Schedule for `CREATE_AND_BUILD_SCHEDULE`.
  Evidence: `createEventEditor` in `apps/site/src/server/events/eventEditorSave.ts` and `createEventEditorCommandSchema` in `apps/site/src/contracts/eventEditor.ts`.

- Observation: The site event form already maps fixed and generated End Policy values, but League and Tournament-specific control order and visibility must be verified against the issue acceptance criteria.
  Evidence: `EventDetailsTimingControls.tsx`, `SimpleSetupPlanningPage.tsx`, `editorContractAdapters.ts`, and the event form tests.
- Observation: The complete site suite initially exposed stale Prisma test doubles and a legacy Entry Division expectation after the registration read path changed.
  Evidence: The focused `childConsentProgress`, registration, and repository tests passed after adding the `divisions.findMany` mock and updating the fixture to provide an active Entry Division.

- Observation: Room cache writes must default to non-authoritative. Only Event Editor snapshot responses may replace protected-history state. Regular event reads, scheduling responses, local updates, and registration fallbacks omit capability fields and must preserve cached locks.
  Evidence: `EventRoomStore`, `EventRepository`, `EventRegistrationMutationCoordinator`, and the final `EventRepositoryHttpTest` regression.
- Observation: Detail bootstrap responses can contain an authoritative outer Event and a partial nested participant Event. The mobile merge must use the outer event when the protected-history field is present.
  Evidence: `EventRepository.syncEventDetail` and the nested-event regression in `EventRepositoryHttpTest`.
## Decision Log

- Decision: Keep the Event Editor contract version stable unless a new observable field cannot be represented by existing `immutable.fieldNames`, `scheduleState`, or existing event fields.
  Rationale: Installed mobile clients must continue to decode the server response. Additive fields are safer than an unnecessary version cut.
  Date/Author: 2026-08-21 / Codex.

- Decision: Treat a Participant Registration row as accepted history when its role is `PARTICIPANT` and its lifecycle reached an accepted state. A cancellation or refund does not remove that history. Ignore checkout holds, waitlist rows, failed payments, staff invitations, and unaccepted imports.
  Rationale: The issue locks structure after the first accepted Participant Registration, not after every attempted registration.
  Date/Author: 2026-08-21 / Codex.

- Decision: Use the existing Event Editor completion modes for scheduled and intentionally unscheduled League and Tournament Create. `CREATE_AND_BUILD_SCHEDULE` is scheduled Create. `CREATE_ONLY` persists the complete Match Graph without fake placements and requires a finite Planned End.
  Rationale: The current site and mobile contract already separates graph persistence from Schedule placement. Reusing it avoids a second Create API.
  Date/Author: 2026-08-21 / Codex.

- Decision: Issue #31 owns League web behavior and issue #33 owns Tournament web behavior. The paired mobile issues #32 and #34 are not implemented unless issue #30 requires a shared mobile lock or capacity contract.
  Rationale: The project separates web and mobile League/Tournament creation into paired issues. This keeps the requested scope traceable.
  Date/Author: 2026-08-21 / Codex.

- Decision: Keep all related changes on the current workstream branch and commit them after review.
  Rationale: The user requested implementation on the current branch. The branch already contains the completed issue #27 work needed by the issue dependencies.
  Date/Author: 2026-08-21 / Codex.

## Outcomes & Retrospective

The implementation is complete for the main acceptance paths in issues #30, #31, and #33. The server enforces accepted-registration capacity and structural locks. The web editor supports scheduled and intentionally unscheduled League and Tournament Create. The mobile editor receives the shared lock, capacity, and scheduling state through the Event Editor contract and stores fetched results in Room. Room cache authority now defaults to preservation for non-authoritative writes, with authority enabled only for Event Editor snapshots. Detail bootstrap merges an outer capability-bearing event ahead of a partial nested participant event. The complete site suite passed with 869 suites and 5,167 tests passing, the route coverage check passed for 330 API routes, the site type check passed, the focused Room and repository regression tests passed, the Android unit suite passed, and the iOS simulator shared test passed. A follow-up two-axis review found an open paid-bill metadata gap and implementation-quality follow-ups. The work remains committed on the current branch while the follow-up items remain open.

## Context and Orientation

The backend source of truth is under `apps/site`. The Prisma schema is `apps/site/prisma/schema.prisma`. Event Editor request and response validation is in `apps/site/src/contracts/eventEditor.ts`. The Event Editor route is `apps/site/src/app/api/events/editor/route.ts`. The atomic save and Create transaction is `apps/site/src/server/events/eventEditorSave.ts`. The Create snapshot and immutable fields are built in `apps/site/src/server/events/eventEditorSnapshot.ts`. Registration rows and capacity counts are handled in `apps/site/src/server/events/eventRegistrations.ts` and `apps/site/src/app/api/events/purchase-intent/route.ts`.

The main web form is under `apps/site/src/app/events/[id]/schedule/components`. The form maps legacy Event values to the strict Event Editor draft through `editorContractAdapters.ts`, builds user input through `EventForm.tsx`, and uses the Simple Setup pages under `components/eventForm/simpleSetup/`. Public behavior is observed through the Event Editor HTTP route and the rendered form.

The mobile app is under `apps/mobile/composeApp`. Shared Event Editor DTOs and repository code are under `src/commonMain/kotlin/com/razumly/mvp/core/data`. Shared Event creation and editing code is under `src/commonMain/kotlin/com/razumly/mvp/eventCreate` and `eventDetail`. Room is the mobile source of truth after a successful fetch. Any new fetched lock or capacity state must be written before UI observation.

An Event Type is One-Time Event, Weekly Event, League, Tournament, or Tryout. A Registration Unit is an individual or a Team. One-Time and Weekly Events allow either Registration Unit. League and Tournament require Teams. Tryout requires individuals. A Participant Registration is an accepted registration row. A Match Graph is the complete set of Matches and advancement dependencies for one Event. A Schedule is the placement of that graph in time, Resources, and officiating coverage. Planned End is a fixed organizer-provided end. Set End from Schedule is the generated-end policy. An intentionally unscheduled League or Tournament has a complete Match Graph but no generated placements.

## Milestones

The first milestone implemented issue #30 at the registration and Event Editor seams. It added accepted-registration capacity, structural locks, Entry Division resolution, and the shared mobile state. Focused site and mobile tests proved the lock and capacity behavior.

The second milestone implemented issue #31 for League creation. It connected Automated Scheduling to the create completion mode, hid schedule-construction controls when disabled, preserved competition values, and validated Planned End. Focused form, contract, and save tests proved scheduled and intentionally unscheduled Create.

The third milestone implemented issue #33 for Tournament creation. It preserved pool, bracket, advancement, timing, Resource, Time Slot, scoring, and officiating values through scheduled and intentionally unscheduled Create. Focused save and form tests proved atomic failure and unchanged retry behavior.

The final milestone runs complete site, Android, and iOS shared tests, then reviews the full diff against the captured branch point. The expected result is a clean standards and specification review, passing suites, an updated plan, and one traceable commit.
## Plan of Work

First, implement issue #30 at the server registration seam. Derive accepted-registration history from durable participant rows and keep the existing event lock transaction. Expose the immutable `eventType` and `teamSignup` controls in the snapshot after accepted history or protected Match history. Enforce the same rule inside the save transaction so a forged client cannot change the fields. Ensure event-type and Registration Unit defaults obey the five Event Type rules. Count one accepted Participant Registration per Registration Division capacity. Do not count Team roster members, Phase Division entrants, waitlist rows, checkout holds, failed payments, staff invitations, or unaccepted imports. Add the required persistence, route, and mobile Room or DTO changes only when the existing contract cannot carry the result.

Next, implement issue #31 in the League web form. Make Automated Scheduling the first Schedule control in Advanced Setup and the first Options control in Simple Setup. When it is disabled, hide schedule-construction controls but keep location and independently meaningful Resources. Map fixed Planned End and generated Set End from Schedule to the existing strict draft. Require Planned End for an intentionally unscheduled League. Preserve all League structure, divisions, playoffs, timing, scoring, Resources, Time Slots, and staffing in the first command. Exercise immediate playoff changes and unchanged retry identity through the public Create command path. Keep all Event and Match Graph writes inside the existing transaction.

Then implement issue #33 in the Tournament web form. Apply the same scheduled and intentionally unscheduled Create modes and End Policy rules. Preserve pool counts, capacities, bracket format, seeding, advancement, elimination, Phase Divisions, timing, scoring, Resources, Time Slots, and officiating. Ensure immediate pool, bracket, and elimination edits reach the first command. Verify failed Create leaves the visible form state and durable database state unchanged. Verify unchanged retry returns the stored canonical operation result without creating a second graph.

Finally, run focused tests and type checks after each vertical slice. Run the full site and mobile suites once. Review the complete diff against the pre-work branch point on Standards and Spec axes. Fix every real finding, rerun affected checks, update this plan, and commit.

## Concrete Steps

Run site commands from `apps/site`.

Run mobile commands from `apps/mobile`.

Capture the fixed point for review with `git rev-parse HEAD`.

Record the fixed point in this plan.

Do not use `main` as the comparison point.

The current branch contains the issue #27 dependency work.

Run one focused Jest file at a time with `npx jest --runInBand --runTestsByPath <path>`.

Run `npx tsc --noEmit` from `apps/site` after each completed site slice.

Run the relevant Gradle test class or task from `apps/mobile` after the mobile slice.

Do not run Gradle tests concurrently.

Run the complete site suite with `npm run test:ci` from `apps/site`.

Run `npx tsc --noEmit` after the complete site suite.

Run `./gradlew :composeApp:testDebugUnitTest` from `apps/mobile`.

Run the required iOS test task when the changed Room or shared Kotlin code needs native verification.

Record exact results in `Outcomes & Retrospective`.

## Validation and Acceptance

Issue #30 is accepted when a valid One-Time or Weekly Event allows either Registration Unit, League and Tournament creation requires Team registration, and Tryout creation requires individual registration. One accepted Participant Registration consumes one Registration Division capacity unit. Team roster members and Phase Division entrants do not consume extra capacity. The first accepted Participant Registration keeps Event Type and Registration Unit locked after cancellation or refund. Holds, waitlists, failed payments, staff invitations, and unaccepted imports do not lock structure. Protected Match history also locks Event Type. Site and mobile editors show the same disabled controls and reason.

Issue #31 is accepted when a League form defaults Automated Scheduling on and places it first in both specified setup surfaces. Turning it off removes only schedule-construction controls. Scheduled Create accepts Planned End or Set End from Schedule. Unscheduled Create requires Planned End. A non-default single- or multi-division League command preserves all stated competition values. A change made immediately before Create appears in the first command. Repeating the exact command returns the same operation result and does not duplicate Event or Match Graph rows.

Issue #33 is accepted when a Tournament form defaults Automated Scheduling on and permits disabling it before Create. Scheduled and unscheduled End Policy rules match issue #31. A non-default Tournament command preserves all stated pool, bracket, advancement, timing, Resource, Time Slot, scoring, and officiating values. Immediate structural edits appear in the first command. A failed Create leaves no partial graph or placement rows. An unchanged retry returns the original operation result.

## Idempotence and Recovery

The Event Editor Create operation already claims a client operation ID and stores a canonical result. Preserve that transaction boundary. If a test or local command fails, rerun the focused test after resetting only its test fixtures. Do not run a production migration or alter a live database. If a Prisma migration is needed, generate it from `apps/site`, inspect the SQL, and run the repository's test migration commands only against the configured test database.

The branch contains prior work. Do not reset, rebase, or delete existing commits. Keep unrelated worktree changes untouched. If an agent changes a shared file, reread it before applying another edit.

## Artifacts and Notes

The primary artifacts are the Event Editor contract, Prisma migration if required, server registration and Create behavior, web League and Tournament form behavior, focused regression tests, and this plan. Keep test evidence concise. Record changed contracts and the final commit in the issue close comments only after all acceptance criteria pass.

## Interfaces and Dependencies

The stable site seam is `POST /api/events/editor` with `CreateEventEditorCommand` and `EventEditorCreateResult` from `apps/site/src/contracts/eventEditor.ts`. The command contains `draft`, `completion.mode`, `expectedRevisions`, and `createOperationId`. The result contains the saved snapshot, schedule outcome, and operation identity. Keep this seam strict and versioned.

The stable server seam is `createEventEditor(actor, command, options)` in `apps/site/src/server/events/eventEditorSave.ts`. It must use one Prisma transaction for the Event, divisions, Time Slots, Match Graph, and optional Schedule placement. It must reject immutable-field changes inside the transaction.

The stable mobile seam is the generated Event Editor DTO and repository path under `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data`. The mobile client must send the site command shape and write accepted results to Room before UI observation. Do not import site TypeScript or Prisma types into mobile.

## Review Findings for Next Agent

The follow-up review covers `7adb96ba9eeae3f20cd667e9e37691d924980a6d...HEAD` and the commits `e738b6453` and `60c5ae9ce`. Complete the items below before treating the workstream as fully complete.

### Paid bill registration identity

The paid bill branch in `apps/site/src/app/api/billing/webhook/route.ts` cannot resolve participant registration identity for bills created by `apps/site/src/app/api/events/[eventId]/participants/route.ts`. The bill intent in `apps/site/src/app/api/billing/create_billing_intent/route.ts` sends `purchase_type: 'bill'` with bill, event, and user identifiers, but it does not send `registration_id`. Participant bill line items contain only line-item, type, label, and amount fields. The webhook loader does not select `Bills.sourceType` or `Bills.sourceId`, and it only recognizes a line item that contains `purchaseType`.

As a result, `billPurchaseType` falls back to `bill`, `billRegistrationId` remains null, and `ensureEventRegistrationFromPurchase` returns `not_event_purchase`. The new paid-bill activation and permanent-failure cancellation paths do not run. The payment-intent failure path also does not load bill purchase metadata.

Preserve or derive the event-registration identity from bill source fields or complete line-item metadata. Use the same identity path for paid and failed installments. Add a provider-independent regression at the application boundary.

### Standards follow-up

- Replace the delegation-only capacity test in `apps/site/src/server/billing/__tests__/billPaymentActions.test.ts`. Assert the resulting registration status or capacity failure at a provider-independent boundary.
- Replace `row: any` and `status: 'CANCELLED' as any` in the participant response mapper with the typed Prisma select result and generated registration status type.
- Extract the repeated payment-resolution persistence branch in `apps/site/src/app/api/billing/webhook/route.ts`.
- Define the finite payment-resolution reason type at the shared site response contract. Use it in `apps/site/src/lib/eventService.ts`.
- Split `apps/mobile/core/database/src/androidInstrumentedTest/kotlin/com/razumly/mvp/core/data/RoomDatabaseBehaviorTest.kt` by DAO capability.

The destructive Room migration policy is not a follow-up finding. The explicit product instruction treats Room as disposable cache data, and `apps/site/CODING_STANDARDS.md` now requires destructive migration for schema changes. Issue #30 requires lock persistence across an app restart, not preservation across a schema upgrade.

## Revision Note

2026-08-21: Updated the living plan with completed implementation milestones, full site and mobile verification evidence, review findings and fixes, the Room authority regressions, nested detail-event precedence, and the completed commit state. This revision records the completed workstream.

2026-08-21: Split compound Concrete Steps instructions. Record this update so future contributors can follow one action per instruction.

2026-08-21: Added the follow-up review findings for the next agent. The paid-bill identity gap remains open. The standards follow-ups remain open. The destructive Room cache policy is intentional and is not a finding.