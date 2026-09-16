# Repair Event and Schedule regression checks

This ExecPlan follows `PLANS.md`.

## Purpose

Keep staffing controls independent. Preserve selected Organization and rental Resources when the Event Editor loads and captures configuration. Correct the six failing EventForm tests according to the product specs. Resolve the 13 reported Android lint errors without suppressing the checks.

## Context Boundary

Use the six EventForm failures and the saved Android lint report. Read root and application AGENTS guidance, site coding standards, and the workstream runbook. Specs #43 and #44 define independent Team duties, named Official Positions, and Staffing Priority. Spec #50 defines Rental Booking authority. Spec #57 defines Facility expansion behavior. Spec #11 defines Simple Setup validation and current-value preservation. ADRs 0001, 0002, 0004, and 0010 define atomic creation, canonical availability, independent Resource Source, and explicit Schedule operations. Read the relevant Resource and staffing terms in `CONTEXT.md`.

Start with `apps/site/src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx`, its editor adapters, staffing panel, Resource controller, and direct tests. On mobile, inspect the four MarkerState factories and the three UI test files named by lint. Expand only when a failure traces to another caller. Do not treat this repair as completion of all remaining work in issue #50.

## Progress

- [x] (2026-09-05) Read the related specs, comments, ADRs, and application rules.
- [x] (2026-09-05) Reproduce all six site failures with a focused 58-second command.
- [x] (2026-09-05) Prove the Resource selection defect at the adapter boundary. The focused regression fails before the fix and passes after it.
- [x] (2026-09-05) Fix staffing controls, Resource handling, and outdated test expectations. All six original failures pass.
- [x] (2026-09-05) Fix marker and test state ownership. Correct the ignored local SDK path.
- [x] (2026-09-05) Run the complete Android Compose unit suite and lint. There are 1,636 passing tests, 10 skipped tests, and no test failures. Lint has no errors and 68 warnings.
- [x] (2026-09-05) Complete independent Standards and Spec reviews. Resolve all findings.
- [x] (2026-09-05) Complete the final affected site suite rerun. The latest results cover 13 suites and 318 passing tests, with no failures or skips.
- [x] (2026-09-05) Complete TypeScript checking and ESLint. Both commands exit successfully with no reported errors.
- [x] (2026-09-05) Record final results and prepare the repair for commit on the current workstream branch.

## Decision Log

The user authorized repair of these failures in the existing workstream. Use `ecbb1a080` as the repair base. Preserve unrelated reports and completed issue #48 work. Keep issue #50 open unless its complete acceptance criteria are proven separately.

The initial hypotheses are stale staffing visibility expectations, incomplete Resource catalog fixtures, and loss of selected Resource IDs through the editor adapter. Check each against the current contract. Existing MarkerState maps retain identity, but their factories need explicit Compose state ownership. UI test hosts must also retain state across recomposition.

No HTTP request or response shape, Prisma definition, Room schema, or mobile DTO change is planned. The site editor already owns `resources.fieldIds`. Any discovered contract change requires a coordinated client update and live API verification before completion.

## Work and Verification

First reproduce the adapter defect with a selected Resource subset and an available unselected Resource. Prove that loading and capturing the editor preserves the selected IDs. Use the existing EventForm interactions for Organization Resources, rental selection, and End Policy changes. Keep booking identity, booked Time Slots, and booking locks in the assertions.

Then retain Staffing Priority and Team duties independently of dedicated-person assignments. Keep named positions available when priority changes. Use actual interactions and captured state in the tests. Preserve the guided option that hides custom position editing while retaining its configured requirements.

Finally wrap cached marker factories and UI test state in the proper Compose state scope. Keep marker identity and position updates. Do not fake the Google Maps provider. Use Android lint to check state construction. Run the existing affected Compose interaction tests to check state changes. Keep `local.properties` outside the commit.

Run commands from the application root. Do not run heavy site and mobile checks together on this host. The original site reproduction is:

    node node_modules/jest/bin/jest.js --runInBand --runTestsByPath 'src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx' --testNamePattern 'keeps requirements but clears hidden assignments|preserves team policy and named positions|builds organization event drafts with selected|groups rented and organization resources|loads reserved rental resources and serializes|allows selected rental resources to use no fixed'

It reported six failed tests and 126 skipped tests in 58.327 seconds. The final site gate includes the complete EventForm suite and the affected adapter, staffing, Resource, validation, and scheduling eligibility suites. Run `node node_modules/typescript/bin/tsc --noEmit --pretty false` and ESLint on changed site files.

From `apps/mobile`, the final command is:

    .\gradlew.bat :composeApp:testDebugUnitTest :composeApp:lintDebug --offline --max-workers=1 --console=plain

The complete Compose suite includes the affected UI test classes. This command passed in 8 minutes and 2 seconds. It reported 1,646 tests, with 1,636 passed and 10 skipped. Lint reported no errors and 68 warnings. The ignored SDK path correction remains local. Native iOS and real Maps provider checks were not run on this Windows host.

After the final review fixes, rerun the complete EventForm, StaffManagementPanel, and tournamentTimeSlots suites. The ten other affected site suites already passed and have no later code changes. Keep the first complete run and the final rerun in separate result files so the final evidence retains the initial failures.

The final three-suite command passed all 142 tests in 180.396 seconds. Combining each suite's latest result with the unchanged suites gives 13 passing suites and 318 passing tests. No test is skipped. The result files are `apps/site/test-results/event-schedule-regressions-final.json` and `apps/site/test-results/event-schedule-regressions-rerun.json`.

The site TypeScript check and ESLint on all six changed site files both exit with code 0. Both logs are empty. `git diff --check` passes.

## Surprises & Discoveries

The first full EventForm run confirms all six saved failures. `editorDraftToLegacyEvent` omits `resources.fieldIds`, while the form's state mapper reads `event.fieldIds` to restore selection. The first staffing failure also reaches a real visibility condition: the panel hides Staffing Priority when dedicated assignments are disabled. The second staffing test expects named positions to disappear based on priority, which conflicts with the independent configuration requirement.

The Resource catalog fixtures were valid. Restoring the selected IDs in the adapter fixed all four Resource failures without fixture changes. The focused adapter test preserves a selected subset when the available pool also contains an unselected Resource.

Spec review found that unconditional officiating controls exposed settings that Tryout serialization discards. The repair now preserves the Tryout Event Type rule. A focused presentation test failed before this correction and passed after it. The final regression extends the actual Tryout price-edit interaction and verifies captured staffing values and control visibility. Standards review required the standard ExecPlan section names and removal of the standalone presence-only test. Both findings are corrected. Both reviewers report no remaining findings.

The first complete affected site run reported 316 passing tests and three failures. One new failure required every pool duty Team to belong to the bracket division. A focused assignment probe showed that the scheduler selected an eligible Team from the Match's own pool. The test now uses canonical Best Available Coverage and checks both eligible division sources and the never-own-Match rule. Scheduler code is unchanged. The other failures concerned form edits after navigation. The tests now wait for restored values and captured edits before the next action. All three follow-up checks pass. The Cash App field test had sent an empty value before the saved value loaded; no payment implementation change was needed. Temporary probe code is removed.

## Recovery

Use local test output directories. Preserve user files. Keep runtime state unchanged unless a specific operation is authorized. No database or application service start is needed for the planned checks. Remove temporary diagnostic output before commit.

## Outcomes & Retrospective

The six original EventForm failures are fixed. Selected Resource IDs survive editor projection and capture. Supported Event Types retain independent Team duties, named Official Positions, and Staffing Priority. Tryouts preserve their existing staffing rule. The full affected site suites pass. Android unit tests and lint pass. Both independent reviews have no remaining findings. TypeScript and ESLint pass. The repair follows issues #11, #43, #44, #50, and #57. Issue #50 remains open for its broader acceptance criteria.
