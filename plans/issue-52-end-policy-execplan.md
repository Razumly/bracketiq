# Enforce End Policy during Schedule and Match changes

This ExecPlan follows `PLANS.md`. Keep its progress, findings, decisions, and results current.

## Purpose / Big Picture

Issue #52 requires stable Event boundaries. Build and Rebuild can set an Event end only under Set End From Schedule. Reflow can change that end only when the latest scheduled Match changes. Manual Match changes must respect the current Event bounds. Disabling Automated Scheduling must preserve the selected End Policy and concrete end. Web and mobile must display the accepted server state.

## Progress

- [x] (2026-09-07) Read issue #52 and all comments. Confirm all five blockers are closed. Claim the issue. Set project Status to In progress and Area to Shared.
- [x] (2026-09-07) Read the root, site, and mobile rules. Read the implement, TDD, and code-review skills.
- [x] (2026-09-07) Trace End Policy through save, scheduling, manual Match operations, web, and mobile. Complete the requested implementation audit before application edits.
- [x] (2026-09-07) Add regression tests at the existing API, editor, scheduler, and Room boundaries. Fix the observed implementation failures.
- [x] (2026-09-07) Run client-to-site validation for changed contracts. Run type checks, lint, and the affected complete suites. Record existing failures separately.
- [x] (2026-09-07) Review the implementation against standards and issue #52. Fix all findings.
- [ ] Commit the verified changes and reconcile issue #52.

## Context Boundary

Use issue #52 and its comments as the requirement boundary. Use `CONTEXT.md` Event, End Policy, Schedule, Build, Rebuild, and Reflow entries and `docs/adr/0001-event-creation-and-schedule-lifecycle.md` for terms. The issue has no unresolved blocker decision. Do not read historical plans or parent issue #14 unless an implementation decision remains unresolved.

Use `apps/site/src/contracts/eventEditor.ts`, `apps/site/src/server/events/eventEditorSave.ts`, `apps/site/src/server/scheduler/eventScheduleMutation.ts`, `apps/site/src/server/scheduler/scheduleEvent.ts`, and `apps/site/src/server/scheduler/reflow/eventReflow.ts` for server policy. Follow their direct save and validation calls only as needed. Inspect Match routes and their direct mutation handlers for manual placement and deletion.

Use mobile `core/repository-impl`, `core/network`, and `composeApp` Event and Schedule files that encode, persist, or display these results. Read the exact DTO and site parser together before changing a wire field. Use existing tests beside these modules. Read database isolation guidance before database-backed checks.

## Context and Orientation

The current branch is `workstream/issue-42-schedule-diagnostics`. The issue base is commit `083c6cfde1ec559fece4baef3d4f32928f4f154d`. The user requested the implement skill, which requires a commit on the current branch. Existing untracked files under `apps/site/test-results` belong to earlier work.

The code stores End Policy with `noFixedEndDateTime` and the editor schedule fields. `scheduleEndConstraint` stores Planned End. `generatedScheduleEnd` stores an accepted scheduler end. The Event `end` is its concrete boundary. Mobile uses Room as its local cache and must commit accepted Event and Match results in one transaction.

## Plan of Work

First trace the existing rules and test the failure paths through their public interfaces. Preserve End Policy when automation is disabled. Reject an unsupported new policy selection. Require a concrete end when selecting Planned End. Keep revision checks bound to the complete settings so previous proposals become stale.

Next enforce current bounds for manual Match placement. Preserve Event ends during manual movement and deletion. Check Build, Rebuild, and Reflow end writes at their transaction boundary. Preserve typed failures through the shared mobile code. Apply accepted server Event and Match data to Room atomically.

Finally run focused checks, then the complete affected suites. Run the code-review skill against the issue base with separate standards and specification reviews. Resolve every actionable finding before the final commit.

## Concrete Steps

Run site commands from `apps/site`. Use `npx tsc --noEmit`, `npm run lint:changed`, and focused `npx jest --runInBand --runTestsByPath <test-path>` commands. Run the complete site suite once at the final gate. Record exact paths and results below as tests are selected.

Run mobile commands from `apps/mobile`. Use JDK 17. Use the existing module test tasks for focused DTO and repository tests. Run `:composeApp:testDebugUnitTest` for the primary full mobile suite. Native iOS execution requires macOS.

Reuse an authorized local test runtime if available. Allocate `bracketiq_e2e_52_563b` for live backend checks. Run migrations and confirm no pending migrations before test seeding. Do not start, stop, or reconfigure a runtime without the exact user authorization required by `AGENTS.md`.

## Validation and Acceptance

Prove that Build and Rebuild preserve Planned End and set only schedule-selected ends. Prove Reflow commits Match and end changes together and leaves the end unchanged when only an earlier Match or officiating changes. Prove disabling automation preserves policy and end. Prove Planned End requires a concrete value and rejects stale proposals. Prove manual out-of-bounds placement returns a typed failure with no partial writes. Prove moving or deleting the latest Match preserves the Event end. Use the mobile serializer with the site parser or API for each changed contract. Prove Room preserves its previous state after rejection.

## Interfaces and Dependencies

`apps/site` owns every HTTP shape. Record each request and response field change here before editing clients. Preserve parser compatibility or increase the contract version before adding a required field. The manual Match error response adds `code`, `eventId`, `eventStart`, `eventEnd`, and `matchIds` beside the existing `error` field. The new code is `MATCH_OUTSIDE_EVENT_BOUNDS`. The single Match PATCH parser also accepts optional ISO `start` and `end` fields. Mobile `MatchUpdateDto` already defines those fields. Existing success shapes and editor contract versions remain unchanged. Mobile `MatchBoundaryErrorDto`, `ApiException`, and `userMessage` decode and display this error. The existing Match repository callers receive the enriched exception before any Room write. No database or Room schema change is planned.

## Idempotence and Recovery

Keep changes scoped to issue #52. Do not stage earlier test results. A rejected server save must roll back its complete transaction. A rejected mobile operation must preserve Room. Retry tests against isolated local data. Keep production unchanged.

## Surprises & Discoveries

Mobile editor mapping and Event Type handling can clear the generated-end choice when automation is off. Reflow already compares the previous and next latest Match end before writing the Event.

The existing four focused site suites pass all 51 tests. Those suites do not catch the two audit probe failures. A generated end of `2026-09-10T20:00:00.000Z` lets `changeScheduleMode(draft, 'FIXED_END')` succeed without a supplied end. `applyMatchUpdates` accepts a Match from 13:00 to 14:00 when Planned End is 12:00. The probes do not call the HTTP routes or write the database. Inspection of the single and bulk routes confirms that neither route adds a current Event boundary check before persistence.

The direct Reflow endpoint calls `loadLockedScheduleEvent` but does not validate the returned automation flag or restrict the Event Type to Tournament. The terminal Match completion path does both checks before Reflow. Keep these paths consistent.

The current single Match route, bulk Match route, and `updateMatch.ts` have 25 existing complexity or nesting errors under the changed-file lint policy. `eventEditorSave.ts` passes that baseline check. Changing the Match files will require cohesive extraction of existing logic as well as the new boundary checks.

## Decision Log

Use the current branch as required by the explicitly requested implement skill. Use the starting commit as the issue review base. The existing issue branch contains prerequisite work. The issue defines API and Event/Schedule behavior, so use those existing test boundaries.

On 2026-09-07, the user requested an implementation audit before application edits. Complete that audit first. The user also authorized an isolated site test server on port 3052 with the existing local Postgres server and a new issue database. That authorization remains available for implementation validation. The audit did not require starting the server.

## Outcomes & Retrospective

The audit is complete. Its findings below describe the code before implementation. The implementation and validation results follow in the final section.

Build and Rebuild already derive a generated end from placed Matches only when `noFixedEndDateTime` is true. `saveEventSchedule` does not write the concrete Event end for Planned End. Existing maintenance capability checks require automation. Reflow already compares the latest scheduled Match end before and after the operation and writes its changes through the caller transaction. These paths need focused End Policy regression coverage, not replacement scheduler logic.

Schedule revisions already include the concrete end and both stored end fields. Maintenance proposal acceptance compares the current revision binding before writing. The stale-proposal mechanism exists. Add a specific policy-switch regression to prove it.

Ordinary single and bulk Match changes persist Matches without recalculating the Event end. Match deletion also preserves the concrete Event end. Mobile manual bulk writes occur only after an accepted response and use a Room transaction. These mechanisms exist. Manual placement outside current Event bounds is not rejected. Add one shared boundary rule to single updates, bulk updates, and placed Match creation. Return a typed boundary error that both mobile platforms can display.

Both web automation controls call `onNoFixedEndDateTimeChange(false)` when disabled. Mobile `Event.withAutomatedScheduling` also clears `noFixedEndDateTime` and can fabricate an end one hour after start. Mobile snapshot mapping hides a saved generated policy when automation is disabled. Its command mapper converts that policy to Planned End. Preserve the existing policy and concrete end across all these paths. Continue to reject a new generated-policy selection when the Event Type or automation state forbids it.

Planned End requires an ISO end in the server contract. However, the web transition helper silently uses the previous generated end when the caller omits one. Web and mobile controls can also invent a one-hour end. Replace these inferred transitions with an explicit concrete end selection. Retain the existing stale-proposal check.

Accepted Build/Rebuild and Reflow results already use Room transactions. Reflow writes the server graph end, and terminal Match results write the server Event end. Existing Room tests cover write rollback. Manual mutation responses currently contain Match data but no Event end projection. Decide whether the boundary error and success response need an additive Event projection during the client-to-site contract slice. Do not introduce a required field without versioning or a compatible parser.

## Artifacts and Notes

Issue: https://github.com/Razumly/bracketiq/issues/52. The issue had no comments when read. All native blockers were closed. The project Workstream is Cross-Platform Event-to-Schedule Lifecycle.

Audit evidence is in `apps/site/test-results/issue-52-audit-jest.json`, `issue-52-audit-jest.txt`, `issue-52-audit-probe.txt`, and `issue-52-lint-baseline.txt`. These local evidence files are not part of the proposed application change.

The exact focused test command, run from `apps/site`, was:

    npx jest --runInBand --runTestsByPath src/server/scheduler/reflow/__tests__/eventReflow.test.ts src/server/scheduler/__tests__/eventScheduleMutation.test.ts src/server/scheduler/__tests__/eventScheduleMaintenance.test.ts "src/app/events/[id]/schedule/components/eventForm/__tests__/editorTransitions.test.ts" --json --outputFile=test-results/issue-52-audit-jest.json

The result was 4 suites passed and 51 tests passed.

Plan created on 2026-09-07 to record issue scope, boundaries, and verification.

Plan updated on 2026-09-07 with the requested implementation audit, observed gaps, and focused test evidence.

## Implementation progress on 2026-09-07

The manual placement check now runs at `saveMatches` before any write. Build and Rebuild pass an internal approved end. The check uses that end only when the stored policy and automation permit it. Manual moves and deletion retain their existing success shapes because those operations do not change the Event end.

Web and mobile automation changes preserve the selected policy. Web Planned End selection clears the date input. Mobile Planned End selection opens the shared date picker and changes policy only after selection. The mobile mapper rejects a new forbidden policy and keeps the server date representation when automation changes.

The live check found a database Date conversion defect. The editor adapter discarded Date-valued generated ends. A settings save then cleared the stored end. The adapter now converts Date values before creating the editor snapshot. New snapshot tests cover enabled and disabled automation. The three snapshot and contract suites pass all 72 tests. The four web control suites pass all 24 tests.

Changed-file lint now passes with four advisory TSX warnings. The touched scheduler and adapter functions required extraction because the rule checks complete files. Keep those extractions behavior-preserving. The current TypeScript check passes.

The authorized site server runs on port 3052. It uses `bracketiq_e2e_52_563b` on the existing PostgreSQL server at port 5543. Migration deploy and migration status passed before seeding. `test-results/issue-52-runtime.cjs` holds local runtime configuration. No production runtime changed.

The first live failure came from an unseeded Room host dependency. The next exposed the Date conversion defect. The next correctly rejected a Planned End before an existing Time Slot end. The fixture now selects a Planned End that includes that Time Slot.

Commit `14159e41c` records the initial implementation. The complete site and mobile suites and GitHub completion remain pending.

The complete live mobile-to-site and Room test passed in 54 seconds. Evidence: `apps/site/test-results/issue-52-live-fifth.txt`. It covered Planned End Build and Rebuild, generated Rebuild, automation off/on, an explicit Planned End, stale acceptance, typed manual rejection, unchanged Room after rejection, explicit end extension, accepted movement, and deletion with a stable end. The complete site suite and the mobile unit tests and lint are now running. TypeScript passes. Changed-file lint has no errors.

The Standards review found one naming breach. New boolean identifiers now use the required `is` or `has` prefix. The Spec review found one placement bypass. An existing unplaced Match kept its old state when a manual request assigned dates and a field. Validation skipped that state, but persistence then marked the Match placed. The boundary check now uses the assigned field and dates. A regression checks the old state. The live test also checks both single and bulk routes and unchanged Room data. The Spec reviewer confirmed the fix by source review. Verification of these follow-up changes remains pending.

The first complete mobile run checked 1,662 Compose tests, 161 repository tests, and 107 network tests. The repository and network tests passed. Seventeen tests were skipped across the complete run. Four creation tests failed. Three expected the old policy reset. Their assertions now require policy and end preservation. The fourth exposed an Event Type rule that depended on the removed reset. `CreateEventSelectionRules` now explicitly clears the unsupported policy for One-Time Events and Tryouts. The Spec reviewer confirmed that fix. The two creation test classes, expanded live test, and Android lint are running again.

The first 20 failing site suites also failed in the saved earlier full run, `issue-49-full-site.json`. Failures include Windows process launch, socket, symbolic link, path, and line-ending assumptions. The family route fixture also lacks the existing transaction lock method. These failures do not involve an issue #52 change. Compare final results before recording the complete site gate.

All 99 tests in the two creation classes now pass. TypeScript and changed-file lint pass after the review fixes. Android lint passes. The expanded live check exposed two single-route details. A full Match command includes score fields and triggers the existing scoring guard. The test now sends a placement-only `MatchUpdateDto`. The single-route parser then discarded its dates. Add optional `start` and `end` instant fields to that parser. The Event form staffing test also failed in `issue-51-full-site.txt` with the same false/true assertion, before this issue.

## Final validation on 2026-09-07

The complete expanded mobile-to-site test passed in 56 seconds. Evidence: `apps/site/test-results/issue-52-live-single-parser.txt`. It proves typed rejection of an unplaced Match through both single and bulk routes. It also proves the Build, Rebuild, policy, stale proposal, Room, movement, and deletion requirements listed above. The single route uses the mobile placement DTO. The bulk route uses the mobile Match repository. Android lint passed. Native iOS execution is not available on Windows; the shared Kotlin error and persistence paths were tested on Android.

The final Spec review found a second defect. Date conversion in the single-route parser caused the receipt hash to discard the dates. A changed start or end could be treated as an exact retry. The hash now converts Date values to ISO strings. Both regressions failed before the fix and pass after it. Exact retries still pass. All five receipt tests pass after the final refactor. Both reviewers report no open finding. The review resolved one Standards finding and two Spec findings.

The complete site run finished in 2,393.866 seconds. It reported 898 passed suites, 32 failed suites, and seven skipped suites. It reported 6,139 passed tests, 57 failed tests, and 62 skipped tests. Evidence: `apps/site/test-results/issue-52-full-site.json`. Thirty failing suites also failed in `issue-49-full-site.json`. The Event form staffing failure also occurred before this issue in `issue-51-full-site.txt`. The email failure came from the test runtime's disabled provider setting. The complexity timeout and email tests pass in the focused rerun with the normal test environment. The remaining failures are existing Windows, Playwright/Jest discovery, and fixture/UI failures. No issue #52 regression remains.

The four focused suites for receipt replay, Match boundaries, email, and complexity pass all 27 tests. Evidence: `apps/site/test-results/issue-52-final-rechecks.json`. The final receipt rerun passes all five tests. TypeScript and changed-file lint pass after the final changes. The touched contract and receipt files needed small refactors to pass existing complexity limits. A direct comparison against the issue base verified identical terminal-action results for 540 input combinations. Evidence: `apps/site/test-results/issue-52-terminal-equivalence.txt`.

All issue acceptance criteria are satisfied. The local test server remains available on port 3052 under the user's start authorization. The final commit and GitHub reconciliation follow this validation record.
