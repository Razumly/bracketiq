# Complete overnight time-slot editing

## Purpose

Users must be able to create one-time overnight availability and repeat rental availability on several weekdays. Each occurrence must span at most one local day. A non-repeating slot must end in the future when saved. Expired records must remain readable. Maintain this plan under root `PLANS.md`.

## Context Boundary

Read `apps/site/src/lib/timeSlotAvailability.ts`, `repeatingTimeSlotAvailability.ts`, `apps/site/src/server/timeSlotCanonical.ts`, the time-slot mutation routes, and their tests. Read `apps/site/src/components/ui/CreateRentalSlotModal.tsx` and `apps/site/src/app/organizations/[id]/fieldsTab/` for the editor and calendar. Expand to event commands and mobile callers when these shared validators change their contract. Use issues #26 and #27 to distinguish one-time and repeating behavior. Keep visual component work under #123. Track the intentional contract change separately.

## Progress

- [x] (2026-09-06) Rebase the UI branch onto scheduling checkpoint `9bbad4d8a`. Restore all prior uncommitted work without conflicts.
- [x] (2026-09-06) Create and claim #155. Set project Area to Shared, Workstream to Site UI, and Status to In progress.
- [x] (2026-09-06) Add one-time overnight and full-local-day resolution on site and mobile. Reject explicit multi-day ranges.
- [x] (2026-09-06) Add future-end checks to direct time-slot routes, event slot persistence, rental editor, and mobile save paths. Keep read resolution clock-independent.
- [ ] Complete mobile and event editor regression checks and client-to-site verification. The caller changes are implemented.
- [x] (2026-09-06) Add rental time inputs, multiple weekdays, and owned dialog components. Eight rental modal behavior tests pass.
- [x] (2026-09-06) Add calendar range limits and hidden-hour snapping. Keep one record across visible day segments. Focused calendar tests pass.
- [ ] Run affected behavior, type, and lint checks.
- [ ] Verify the current production build in the Codex browser after explicit runtime authorization.

## Decision Log

End times earlier than start times end on the next local date. Equal times mean one full local day. Weekday selections identify occurrence start dates. A local day can span 23 or 25 elapsed hours at a daylight-saving transition. This preserves the existing repeating resolver contract.

The future-end rule applies to non-repeating slot creation and updates. It does not apply to read normalization, historical display, or recurring date bounds. Do not require the start to be in the future.

## Context and Orientation

The site owns API contracts. The shared one-time resolver currently requires a same-day end. The repeating resolver already supports overnight and full-day windows. The rental modal only submits one weekday and hides time inputs for non-repeating slots. The facilities calendar renders one record as several visible day segments. Those segments must not become independent records.

## Milestones and Plan of Work

First, add shared interval regression tests. Resolve the next local date from the clock range. Reject explicit end dates outside that interval instead of silently clipping multi-day data. Add a separate save-time assertion that rejects an end at or before the supplied current instant. Apply this assertion to all relevant mutation boundaries. Keep existing typed API error handling.

Next, inspect site event and mobile encoders and validators. Preserve the current request shape. Update client validation when it conflicts with overnight semantics. Run a client-produced request through the site parser before claiming cross-application completion.

Then, adapt the rental modal to existing owned controls. Keep start date and clock times available in non-repeating mode. Show multiple weekday selections and an overnight warning for recurrence. Keep document and pricing behavior intact. Apply the same local-day boundary to calendar movement and resize. Show a live in-place resize preview and suppress the click after pointer release.

Finally, run focused checks and review the facilities workflow in the Codex in-app browser. Do not start or restart a server without current explicit authorization. Do not close #123 while required UI or behavior checks remain.

## Concrete Steps and Validation

Run site commands from `apps/site`. Use `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath` with the changed suites. Run `node node_modules/typescript/bin/tsc --noEmit --incremental false`. Run `npm run lint:changed`. Run suites sequentially to limit memory use.

Verify Monday 10 PM to Tuesday 2 AM, equal-time full-day availability, several selected weekdays, and explicit intervals longer than one local day. At a fixed test clock, reject past ends and ends equal to now. Accept a past start with a future end. Confirm that historical reads still resolve. Verify API failures do not write records. For UI checks, save and reload an overnight rental, resize it, move it, and confirm no edit modal opens from the release click.

## Interfaces and Dependencies

Keep existing slot request fields and typed errors. Use named time zones and the existing date utilities. Keep the clock-dependent write check separate from `resolveOneTimeTimeSlot`, because scheduling and reads also use that resolver. No schema migration is planned unless inspection proves it necessary.

## Idempotence and Recovery

The pre-rebase branch is `codex/issue-123-before-49-rebase-20260906`. All prior tracked and untracked edits are also preserved at `codex/issue-123-wip-before-49-20260906` (`7da20a120`). Do not drop these recovery references. Preserve unrelated UI edits. Do not change another worktree, live data, or runtime.

## Surprises & Discoveries

The rebase completed without conflicts. The new UI HEAD is `6ba27fecf`. The existing repeating tests already cover equal-time full days and overnight daylight-saving behavior.

## Outcomes & Retrospective

The rebase and implementation are complete. Validation remains in progress. The earlier six-suite run passed 56 shared resolver, calendar, and rental modal tests. Subsequent runs passed 25 direct API tests, 11 event form tests, 21 calendar and range tests, eight rental modal tests, and four shared control tests. All 16 mobile model tests and all 12 mobile editor tests passed. TypeScript passes. Both review axes have no remaining findings in the named timeslot scope. The isolated production bundle compiled; final build checks remain active. The full site suite is active in session 20339 and has reached the known Node `MouseEvent` setup failure. No application server has started for these checks, and nothing was pushed.

The default Node API test invocation fails in `test/setupTests.ts` because it extends `MouseEvent` in a Node environment. Use an isolated Jest Node configuration with the same ts-jest transform and alias mapping, without that browser setup. Do not change the unrelated setup file. The first isolated route run passed 22 tests and failed three tests. Two failures came from a missing test envelope and its unused one-shot mock. One came from a past fixture date. Corrected the envelope and fixed the suite clock at 2026-01-01. All 25 tests pass after the final route extraction.

Changed-file lint found pre-existing errors in the direct time-slot routes and three `events.ts` helpers. Extract route parsing, normalization, and interval validation into named functions without changing their behavior. The scheduling task owns the three unrelated `events.ts` fixes under #51 and requested that this task leave them unchanged. Do not commit or close either issue until required checks pass.

## Revision Notes

2026-09-06: The user reported that unsaved rental cards do not open their editor. A focused grid regression reproduced a no-move pointer sequence that invoked no selection callback. Pointer capture routes the click to the outer entry, whose handler accepted saved rentals but not selection drafts. The handler now accepts a selection draft when the click targets that outer entry. Inner card handlers retain ownership of their own clicks. All 34 grid and panel tests pass, including completed-move suppression for both saved rentals and unsaved drafts. TypeScript and focused lint are still running. Asked for current approval to rebuild and restart port 3155. The running production build does not contain this fix yet. The user instructed this task to stop checking or coordinating #51; do not contact that task or inspect it.

2026-09-06: Restored `next.config.mjs` and `tsconfig.json` after the isolated server loaded its build configuration. These temporary test hooks must not enter the commit. The running server retains its isolated build. A future restart must explicitly restore the temporary build-directory hook or use a fresh default production build. No restart is authorized by this note. The full site run is still active in session 20339. Its latest log contains seven passing suites and 43 failures, mostly the known Node setup failure. This is not a final result. The browser tab is retained for the user's manual Edit schedule check. No timeslot commit or issue closure has occurred.

2026-09-06: The production build passed and generated all 127 static pages. The authorized isolated server is running at `http://127.0.0.1:3155` in production mode, session 94385. It uses only `bracketiq_e2e_155_samue`. A live HTTP smoke check passed overnight resolution, equal-time full-day resolution, overlong rejection, expired rejection, ongoing one-time save, multi-weekday recurrence, and persisted weekday updates. It removed its own temporary slots. The helper is outside the repository at `C:/Users/samue/AppData/Local/Temp/issue155-live-slot-smoke.mjs`.

The Codex browser loaded the Facilities page with the test host session, populated data, and no warning/error console entries. Browser automation does not activate controls: semantic clicks, coordinate clicks, and keyboard input do not change tabs or schedule mode. Do not classify this as an application defect without manual confirmation. Asked the user to click Edit schedule manually. The full site suite remains active; Node-only suites encounter the existing MouseEvent setup failure. The #51 task requested no additional heavy checks until its active suite completes. Defer the mobile live test until that resource contention ends. Do not claim browser interactions or the mobile wire check passed.

2026-09-06: TypeScript passed after the rental form fixes. The rerun of all 12 mobile editor tests passed with no skips. The four owned date/filter control tests pass, including disabled-date interaction. Calendar complete-file complexity lint passes. The production bundle compiled successfully; its final type and route checks remain active in session 33562. Next.js added two isolated build-type include paths to `apps/site/tsconfig.json`. Remove those temporary paths with the `NEXT_DIST_DIR` hook before the final commit. Live API and browser checks have not run yet.

2026-09-06: Both review agents confirmed their findings are resolved. The calendar and range limiter pass 21 tests with `TZ=America/Los_Angeles`. All eight rental modal tests pass. TypeScript found a weekday array type mismatch and a missing disabled date-control prop. Both are corrected; the rerun is active. A new disabled-date regression found that Clear still changed the value. The control now hides Clear and the calendar while disabled. Its rerun is active.

The user authorized an isolated local database and production server for live checks. Created `bracketiq_e2e_155_samue` on the existing local server at port 5433. Applied all 224 migrations. Migration status confirms the schema is current. Seeding uses `--skip-reset`. Outbound providers are disabled. The build will use `.cache/issue155-next` through a temporary `NEXT_DIST_DIR` configuration hook. Remove the hook before the final commit. Do not change another task's runtime.

Contract inventory: No request or response field is added, removed, renamed, or made required. Existing `startDate`, `endDate`, `startTimeMinutes`, `endTimeMinutes`, `timeZone`, `repeating`, `dayOfWeek`, and `daysOfWeek` retain their types. The compatible parser accepts an overnight clock range and derives its next local date. The site direct slot routes and event repository enforce future ends on one-time writes. Mobile `TimeSlot`, `FieldRepository`, `DefaultCreateEventComponent`, and `EventEditPayloadBuilder` use the same rules. The existing rental DTOs and event editor serializer retain their wire shape. No Room schema or contract version change is required. The new real-HTTP test remains pending.

2026-09-06: The user confirmed the implement skill applies to this task. Finish #155 before resuming #123. Read implement, TDD, and code-review. The web form extraction now passes complexity lint and 11 tests. All 12 mobile event editor tests passed after fixing stale minute fields that overwrote updated one-time dates. Renamed collection preparation to `validateAndKeepChangedManagedCollections` to expose its validation role. Added a real-HTTP test in `EventLifecycleMobileApiIntegrationTest.kt` for editor and rental serializers; it is not run yet. A fresh mobile session will verify persisted values. The TypeScript check is active in session 11421.

The two review agents reported two standards smells and two spec findings. Standards: keyboard resize duplicated range logic; collection filtering hid future-end validation. Spec: elapsed-minute calendar coordinates shifted local times on DST dates; keyboard resize bypassed range limits. The rename addresses the naming finding. Keyboard resizing now uses the pointer range limiter. Its regression failed before that fix. The DST regression and calendar review rerun are active. Do not close issues or commit until review fixes and required verification pass.

2026-09-06: Started named-function extraction in `schema.ts`. The extraction preserves statement order and messages but is not yet verified. Focused lint is running in session 4442. The user then explicitly requested the implement skill for #51. Read the skill and #51 in full. Sent the skill requirement to the existing scheduling task that owns #51. Do not claim these #155 validator edits as #51 work.

2026-09-06: The scheduling task confirmed that #51 does not change `schema.ts` or `slotValidation.ts`. This task owns their #155 complexity extraction. There is no ownership blocker for that work.

2026-09-06: The final form lint check failed on five inherited complexity errors: `schema.ts` callbacks score 94, 13, 13, and 22; `slotValidation.ts` has a callback at 22. These files are in scope because their temporal validation changed. Do not suppress the rules. Coordinate extraction ownership with the scheduling task before the next refactor. The direct time-slot route/helper lint remains clean. Mobile event editor compilation is still active in session 26782. Issue #155 and issue #123 must remain open.

2026-09-06: Removed the event form's duplicate end-before-start rejection. The shared resolver now decides whether that clock range is overnight. All four form schema tests pass, including the new overnight regression. The total is now 92 passing site tests and 16 passing mobile model tests. The mobile event editor build remains active in exec session 26782. Its XML results will be under `apps/mobile/composeApp/build/test-results/testDebugUnitTest`. The final schema and slot-validation lint check is active in session 34685. The scheduling task confirmed it will preserve the seven-line schema removal. Its three `events.ts` helper fixes are implemented but not yet verified. Keep the production runtime unchanged until the pending authorization request is answered.

2026-09-06: Resumed after interruption. Recovered the API result: all 25 tests passed. The direct routes and shared resolver pass focused complexity lint after extraction. All 56 tests in six resolver, calendar, and rental modal suites passed after the precision and local-duration follow-ups. Moved mobile future-end validation after unchanged collections are omitted. Added a historical metadata-only regression and an exact-duration mobile regression. Updated the mobile draft test to accept overnight slots. Mobile compilation and the event editor test are running. Cancelled this task's long-running TypeScript check to reduce memory contention; it still requires a rerun. The production browser and real client-to-site checks remain pending. No application runtime was changed.

2026-09-06: The user approved the port 3155 production rebuild. Removed synthetic conflict entries from the manager display and removed the Conflicts layer control. Existing conflict pairs now mark their rental and booking cards with red borders. A nonzero conflict count appears beside Resources. Save keeps its pending-state behavior without a count. Focused calendar checks passed 80 of 81 tests. The save-retry test failed on a seven-hour range difference in both the local and UTC runs. The conflict workflow passed again after adding the empty-week check. Complexity lint passed for the three changed calendar modules. Production build session 15160 uses `.cache/issue155-next-v2`; the previous server remains running. Do not claim full schedule verification.

2026-09-06: Production build completed with TypeScript and all 127 static pages. Restarted only preview port 3155. PID 42076 runs build `VIJMmLcAm-p9d-Db-8I5H` from `.cache/issue155-next-v2`. The server reports production mode and `/api/sports` returns 200. Removed temporary Next config and TypeScript include changes after startup. Codex browser inspection confirms four conflict pairs, no conflict cards or Conflicts filter, and red borders on five affected cards while preserving their background colors. Browser scrolling still has no effect through automation. Do not claim complete live pointer verification. The save-retry time-zone regression remains open.

2026-09-06: Created this plan after the user approved the sequence and added mandatory future-end validation for non-repeating slots.

2026-09-06: Recorded implementation progress, passing focused checks, isolated Node test setup, SDK path, and the lint coordination boundary after an interruption.
