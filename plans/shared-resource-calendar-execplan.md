# Implement the shared Resource calendar workflow

This ExecPlan is a living document. Maintain it in accordance with `PLANS.md` in the repository root. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current.

## Purpose / Big Picture

After this change, an Event organizer can configure availability from one calendar surface. The organizer can select one-time availability, create or edit a Repeating Time Slot, assign Resources, and see Event timing above the calendar. The organizer can control Start and Planned End independently or reset each boundary to valid calendar-derived timing. Invalid Time Slots block save without changing existing Matches.

An organization manager can use the same Resource calendar model in the Facility workspace. Week view remains a horizontal Resource timeline and shows every accessible Resource. Month view becomes a seven-column calendar grid. Month-only Facility and Resource search changes visibility only.

The implementation must preserve the existing HTTP shapes, database schema, Event End Policy, Schedule operations, permissions, Resource eligibility, local-time recurrence, and mobile behavior. Save and Create remain configuration writes. They must not build or mutate a Match Schedule.

## Progress

- [x] (2026-09-13) Read the implementation skill, repository rules, site rules, issue #159, parent issue #125, related issue #155, `PLANS.md`, and existing Event and Facility calendar plans.
- [x] (2026-09-13) Claimed issue #159. Confirmed the issue has `enhancement`, `area: web`, and `ready-for-agent` labels.
- [x] (2026-09-13) Confirmed the worktree contains unrelated user changes. Preserve them. Do not reset or clean the worktree.
- [x] (2026-09-13) Mapped the existing Event form, slot validation, recurrence resolver, Facility calendar model, Facility calendar grid, and searchable Resource filter.
- [x] (2026-09-13) Recorded the first implementation design for shared calendar data, presentation modes, Event timing state, and write-path validation.
- [x] (2026-09-13) Add the shared Resource calendar model and Month-grid renderer.
- [x] (2026-09-13) Connect the shared calendar to Event slot creation, editing, repetition, and Resource assignment.
- [x] (2026-09-13) Make Event timing source state explicit without changing the persisted contract.
- [x] (2026-09-13) Make Facility Week and Month behavior match issue #159.
- [x] (2026-09-13) Close direct Time Slot write-path validation gaps without changing valid rental writes.
- [x] (2026-09-13) Add behavior-focused tests at the existing form, calendar, Facility adapter, and server seams.
- [x] (2026-09-13) Run focused checks, site type checking, changed-file lint, the full site suite, and browser smoke when the authorized runtime is available.
- [x] (2026-09-13) Run code review against the issue and this plan, address findings, commit the issue-owned changes, and prepare issue #159 closure.

## Surprises & Discoveries

- Observation: The current Facility calendar already has a custom horizontal Resource timeline and a searchable `FieldCalendarFilter`, but its Month view still renders a variable-length timeline. Evidence: `FacilityResourceCalendarGrid.tsx` uses one day track per day for both views, and `FieldsTabContent.tsx` passes the same selected Resource state to both views.
- Observation: Event creation and Event editing already share `EventForm`, `ScheduleConfigBody`, and the canonical Event editor save path. Evidence: `EventForm.tsx` constructs one `EventFormSections` model for both workflows, and `ScheduleConfigBody.tsx` delegates slot fields to `LeagueFields`.
- Observation: League and Tournament Schedule configuration is hidden when Automated Scheduling is disabled. Evidence: `useEventFormSectionsController.ts` gates `showScheduleConfig` on `isAutomatedSchedulingDisabled`. Issue #159 requires a boundary-only calendar range in this state, so the visibility rule must change.
- Observation: Repeating `startDate` is already a local date boundary and the shared occurrence resolver already supports optional `endDate`, overnight ranges, and DST resolution. Evidence: `repeatingTimeSlotAvailability.ts` and its focused tests preserve the local recurrence values.
- Observation: Current draft serialization copies Event End into an open repeating slot in one branch. Evidence: `buildEventDraft.ts` writes `serialized.endDate = source.end` for a finite source Event. Issue #159 requires controlled Event boundaries to remain separate from slot-owned date fields, so this branch must be removed or narrowed.
- Observation: Direct Time Slot PATCH already validates Event boundary ranges for referenced Events, but the canonical Event editor path and direct route have different validation seams. Evidence: `apps/site/src/app/api/time-slots/[id]/route.ts` reloads referencing Events and calls `assertValidOneTimeTimeSlots`; the editor route maps validation errors separately.
- Observation: The current worktree has 91 changed tracked files and 54 untracked paths from prior user work. Evidence: `git status --short --branch` and `git diff --stat`. This plan owns only the calendar files, the Event form integration files, the necessary shared validation, tests, this plan, and no unrelated paths.
- Observation: A timing-source key can change when a form gains or loses schedule capability. A keyed fallback avoids render-time state updates and effect loops.
- Observation: Validation must use a bounded lookahead to test recurrence, but an open recurrence must render beyond that lookahead.
- Observation: A repeating `startDate` timestamp carries a local-date boundary. The slot clock belongs to `startTimeMinutes`; hydration uses local midnight for the boundary.
- Observation: Automated Scheduling off needs a visible Event boundary range without creating or persisting a synthetic Time Slot.
- Observation: A moved timeline entry must preserve the pointer's grab offset. Snapping the entry origin changes the selected time.
- Observation: Browser DST gaps require actual instant carriers plus Event-timezone wall coordinates. Fold intervals need actual-duration fallback.
- Observation: A week view can clip one side of an entry. Resize must preserve the untouched original instant.
- Observation: The Resource row uses `display: contents`, so drag reassignment needs ancestor hit testing from the actual track element.
- Observation: Fixed time-header ticks and proportional day columns keep the timeline readable at narrow widths.
- Observation: Explicit repeating boundaries equal to Event boundaries must survive form hydration. The normal conflict normalization still strips derived boundary metadata.
- Observation: An open recurrence validation horizon must never become a persisted Planned End for a Tryout or a manual League or Tournament.
- Observation: The dirty worktree contains unrelated user changes. Issue-owned paths were staged selectively. Unrelated paths remain unstaged.

## Decision Log

- Decision: Keep issue #159 as one end-to-end implementation issue, but organize the work by internal milestones. Rationale: Event and Facility consumers share one calendar contract and one acceptance boundary, while the code can still be committed in traceable increments. Date/Author: 2026-09-13 / Main.
- Decision: Add a small shared calendar model and adapter seam instead of copying Facility-specific event assembly into the Event form. Rationale: Both surfaces need Resource identity, Facility context, view ranges, occurrence filtering, and navigation. A pure model is easier to test and does not import server or Prisma types. Date/Author: 2026-09-13 / Main.
- Decision: Keep the existing custom horizontal Week timeline. Add a separate seven-column Month grid. Rationale: The issue requires a Resource-row Week view and a real Month view. Reusing the timeline for Month would preserve the reported defect. Date/Author: 2026-09-13 / Main.
- Decision: Keep timing-source state transient in the Event form until the existing HTTP and database contract has an explicit field. Rationale: Issue #159 forbids a contract version increase and new public fields. The UI can derive source state from the current draft baseline and local boundary-control state. Date/Author: 2026-09-13 / Main.
- Decision: Treat a controlled Start or Planned End as a hard instant bound. Do not extend the Event, copy the bound into a Time Slot, clip a one-time interval, or remove a Match. Rationale: The confirmed issue decision requires blocking Time Slot errors and warning-only Match overruns. Date/Author: 2026-09-13 / Main.
- Decision: Keep open Repeating Time Slots open in their own fields. Use a finite controlled Event End as the occurrence window only. Rationale: Copying the Event End into the slot loses ownership and makes Reset to calendar irreversible. Date/Author: 2026-09-13 / Main.
- Decision: Use the current `FieldCalendarFilter` search and selection behavior for Month visibility. Do not reuse persisted Event Resource selection as the visibility state. Rationale: Filtering must never mutate Event configuration. Date/Author: 2026-09-13 / Main.
- Decision: Do not add a synthetic Time Slot for an unscheduled League or Tournament with Automated Scheduling disabled. Rationale: Existing validation accepts zero slots in this state and the issue requires a boundary-only calendar range. Date/Author: 2026-09-13 / Main.
- Decision: Boundary-only selection sends no Resource ID. A synthetic display row is used only when no Resources exist. Rationale: Unscheduled competition has no persisted slot or Resource assignment.
- Decision: Keep actual instant fields and Event-timezone wall coordinates as separate calendar carriers. Rationale: Browser-local Date formatting cannot represent DST gaps and folds reliably.
- Decision: Preserve the untouched resize boundary instant when a visible Week range clips the other boundary. Rationale: A resize must change one boundary only.
- Decision: Add a preserve flag for explicit persisted repeating date bounds during form hydration. Rationale: Event-equal boundaries are owned data, not derived conflict metadata.
- Decision: Use fixed four-hour labels and 12rem timeline day columns. Rationale: Lower tick density prevents label clipping while proportional day widths preserve time scale.
- Decision: Resolve Resource reassignment through the closest Resource ancestor. Rationale: `display: contents` rows have no hit-test box.
- Decision: Treat an unbounded repeating pattern as having no calendar-derived finite End. Rationale: The recurrence validation horizon is not an Event boundary; manual competition and Tryout flows need an explicit finite End.

## Outcomes & Retrospective

Implementation commit before this plan update: 544b2d6a7.

Issue #159 is implemented end to end. Event and Facility use the shared Resource calendar model. Event Week and Month views support slot selection, repetition, Resource assignment, move, and resize. Facility Week shows all accessible Resources. Facility Month uses a seven-column grid with visibility-only Resource search. Event timing keeps Start and Planned End ownership separate, supports independent Reset to calendar actions, rejects boundary violations, and warns when existing Matches overrun a changed boundary. Boundary-only unscheduled competition uses a visible non-persisted range. Save and Create remain configuration writes and do not invoke scheduling operations. HTTP shapes, database schema, mobile code, permissions, Resource eligibility, Event End Policy, overnight handling, and DST contracts remain unchanged.

Final verification:

- Focused Jest command with the 21 issue-owned paths passed: 21 suites and 197 tests passed.
- `npx tsc --noEmit` passed from `apps/site`.
- Targeted complexity lint passed with 0 errors and 2 warnings: `EventResourceCalendar.tsx:194:32` (complexity 22) and `SimpleSetupScheduleLocationPage.tsx:41:42` (complexity 33).
- `git diff HEAD^ HEAD --check` passed for the implementation commit.
- `npm run lint:changed` exited 1 on 79 changed site files with 67 problems: 42 errors and 25 warnings. The errors are in the dirty schedule worktree and the warnings include unrelated dirty files. No unrelated file was changed.
- `npm test -- --runInBand` stopped before Jest because the generated shared icon manifest is out of date. The command requested `apps/site/src/components/ui/sharedIconManifest.generated.ts` to be synchronized. The generated file was not changed.
- Full `npx jest --runInBand` exited 1: 28 failed suites, 14 skipped, and 863 passed (891 of 905 suites); 126 failed tests, 129 skipped, and 6,780 passed (7,035 tests). Remaining failures are outside the issue-focused seams and include dirty scheduler, contract-inventory, affiliate, finance, registration, location, and baseline schedule fixtures. The issue-owned schedule-visibility regression was updated and passes in the focused run.
- Browser smoke was attempted with `browser.open` but could not run: `Shared browser daemon unavailable (broker start or Chromium launch failed; check hub ps for omp.browser.* daemons and ~/.omp/logs for details)`. No runtime was started or reconfigured.
- Final two-axis review of `be942da39..544b2d6a7` found no actionable standards or specification findings.

No schema migration, mobile change, deployment, or runtime state change was made. The final issue comment records the amended commit that contains this plan update.

## Context and Orientation

`apps/site/src/app/events/[id]/schedule/components/EventForm.tsx` owns the React Hook Form draft and connects configuration, Resource, slot, and submission controllers. `EventFormSections.tsx` renders the advanced form. `SimpleSetupScheduleLocationPage.tsx` renders the simple setup timing, location, and Schedule surfaces. `ScheduleConfigBody.tsx` currently passes `leagueSlots` to `LeagueFields.tsx`, which owns the current list-oriented slot editor.

A `Time Slot` is Event availability. A one-time slot owns a local date and time range. A Repeating Time Slot owns selected weekdays, local start and end times, and optional local date boundaries. `apps/site/src/lib/repeatingTimeSlotAvailability.ts` resolves repeating local values to instants. `apps/site/src/lib/timeSlotAvailability.ts` resolves one-time values and enforces future and Event-boundary rules.

`apps/site/src/app/organizations/[id]/FieldsTabContent.tsx` owns the organization Facility workspace. It builds Facility and Resource data, loads field Event and Match data, applies layer filters, and passes calendar entries to `FacilityCalendarPanel.tsx`. `FacilityResourceCalendarGrid.tsx` renders the horizontal Resource timeline. `FieldCalendarFilter.tsx` is the existing searchable Resource filter.

The Event Location supplies the Event Time Zone. Do not infer it from the browser. A calendar event displayed in a Resource row must use the slot or Event local time zone for wall-clock labels and must retain the original local values when an organizer edits the slot.

The existing Event editor save route is `/api/events/{eventId}/editor`. The existing direct slot routes are under `/api/time-slots`. The existing scheduler operations are separate routes and services. This issue must not invoke them from Save or Create.

## Context Boundary

Required sources:

- `AGENTS.md`, `apps/site/AGENTS.md`, and `PLANS.md` for repository rules, testing standards, and living-plan requirements.
- Issue #159, parent issue #125, and related issue #155 for the acceptance boundary and existing contract ownership.
- `CONTEXT.md` and the timing-related glossary terms for Event Timing Source, Calendar-Derived Timing, Organizer-Controlled Timing, Schedule Boundary Error, and Schedule Boundary Warning.
- `apps/site/src/components/calendar/FieldCalendarFilter.tsx` and its tests for searchable Resource selection.
- `apps/site/src/app/organizations/[id]/FieldsTabContent.tsx`, `fieldCalendar.ts`, `fieldCalendarHydration.ts`, `fieldsTab/FacilityCalendarPanel.tsx`, `fieldsTab/FacilityResourceCalendarGrid.tsx`, `fieldsTab/facilityCalendarTypes.ts`, and Facility calendar tests for the current Facility workflow.
- `apps/site/src/app/events/[id]/schedule/components/EventForm.tsx`, `eventForm/sections/EventFormSections.tsx`, `eventForm/sections/ScheduleConfigBody.tsx`, `eventForm/sections/EventDetailsPanel.tsx`, `eventForm/sections/EventDetailsTimingControls.tsx`, `eventForm/simpleSetup/SimpleSetupScheduleLocationPage.tsx`, and `eventForm/simpleSetup/SimpleSetupPlanningPage.tsx` for Event form integration.
- `apps/site/src/app/discover/components/LeagueFields.tsx`, `eventForm/slotForm.ts`, `eventForm/slotValidation.ts`, and the slot controller for existing slot ownership and validation.
- `apps/site/src/lib/repeatingTimeSlotAvailability.ts`, `timeSlotAvailability.ts`, `dateUtils.ts`, and the existing recurrence and one-time tests for local-time behavior.
- `apps/site/src/server/repositories/events.ts`, `apps/site/src/app/api/events/editor/route.ts`, `apps/site/src/app/api/time-slots/route.ts`, and `apps/site/src/app/api/time-slots/[id]/route.ts` for canonical and direct write validation.

Expand the boundary only when a focused check proves that a current caller serializes Event timing or slot dates differently, when TypeScript exposes a contract mismatch, when a browser smoke check reaches an unexamined Event or Facility state, or when a direct write path bypasses the same invariant. Do not read or modify mobile files unless a changed HTTP field or route requires it.

## Plan of Work

First, preserve the dirty worktree and add the smallest shared calendar model. Define Resource and calendar-entry types that carry a stable Resource ID, Facility context, local display label, event interval, and optional interaction metadata. Add pure helpers for week ranges, six-row Month ranges, Resource filtering, occurrence expansion, and logical-slot boundary aggregation. Use these helpers in both Event and Facility adapters. Keep the model independent of React, Prisma, and server types.

Next, add the Month renderer beside the existing Facility Week renderer. The Month renderer must use seven day columns, include leading and trailing days needed for complete weeks, show selected Resource entries in each day cell, and keep click and keyboard selection callbacks. Keep drag and resize operations in the Week timeline. Render a Month-only searchable Facility and Resource picker through `FieldCalendarFilter`; never write Event Resource values from that picker. Update Facility tests for all accessible Week Resources, Month grid structure, Month filtering, navigation, and persisted-selection isolation.

Then, add an Event calendar adapter. Build one calendar entry per logical slot occurrence and assigned Resource for the visible range. Use the shared repeating occurrence resolver. Keep aggregation at the logical-slot level so multiple Resource copies do not extend Event timing twice. Normal calendar selections create one-time slots. The first standalone Weekly Event selection creates a Repeating Time Slot with the clicked weekday. Open the existing slot editor for repetition, date boundaries, local times, divisions, and Resource assignment. A slot without a valid Resource stays visibly invalid and offers Assign Resource or Delete for legacy data.

Integrate the Event adapter in both Simple and Advanced setup. Keep Start and End controls above the calendar. Remove the global Schedule Style choice from the visible planning page. Use the existing timing controls for direct edits, add Calendar-Derived or Organizer-Controlled status, and add independent Reset to calendar actions. Keep the End Policy matrix and Automated Scheduling control. Show Schedule configuration for standalone slot-bearing Event Types even when Automated Scheduling is disabled, so the boundary-only League and Tournament calendar state remains visible.

Add transient boundary-source state to the Event form lifecycle. Initialize it from the incoming Event and current valid slot timing. Editing Start controls only Start. Editing End controls End and selects Planned End. Reset clears only the selected control. Recompute Calendar-Derived boundaries when valid slots change. Treat controlled boundaries as hard bounds. Surface Schedule Boundary Error for new or edited slots outside them. Surface Schedule Boundary Warning when existing Matches extend past a changed Planned End. Preserve existing Matches and do not render an Effective Event End.

Update draft serialization and server validation only where required to keep the ownership rules true. Do not copy a controlled Event End into a repeating slot. Keep the current one-time overnight, DST, future-end, Event-Type, division, Resource eligibility, and rental-lock behavior. Make the canonical Event save path and direct Time Slot writes reject invalid new slot assignments and Event-Type combinations. Preserve rental-backed slot writes and current response shapes.

Finally, add behavior coverage at the shared model, Event form, Facility adapter, and server seams. Run focused checks after each milestone. Run the complete site validation once after the implementation and review fixes. Use the actual site surface for browser smoke if an authorized runtime is already available. Do not start, stop, restart, deploy, or reconfigure a runtime without a separate explicit authorization.

## Concrete Steps

Run site commands from `apps/site` unless a command names a repository-root plan file.

1. Read each target file immediately before editing. Preserve unrelated hunks in the dirty files. Do not run reset, clean, checkout, or broad formatting commands.
2. Add the shared Resource calendar model, pure range helpers, Event adapter, and focused model tests.
3. Add the Month renderer and connect it to the Facility panel. Keep the existing Week interaction behavior and use the shared model for Resource identity and date ranges.
4. Connect the Event calendar to `ScheduleConfigBody`, `EventFormSections`, `SimpleSetupScheduleLocationPage`, and the Event slot controller. Add the transient timing-source state at the form lifecycle seam.
5. Remove the visible global Schedule Style choice and make the standalone slot-bearing schedule surface visible for all supported Event Types.
6. Update `buildEventDraft.ts`, canonical Event save validation, and direct Time Slot validation only where the new ownership and Resource invariants require it.
7. Run focused Jest suites after each milestone. Use `npx jest --runInBand --runTestsByPath` with exact paths for the changed files.
8. Run `npx tsc --noEmit` from `apps/site` after the shared model, Event integration, and server validation milestones.
9. Run `npm run lint:changed` and `git diff --check` after the implementation. Treat unrelated baseline failures as baseline. Do not modify generated files to hide them.
10. Use `browser.open` for the actual Event and Facility surfaces when the shared browser daemon is available. Verify desktop and narrow responsive widths. Verify Week, Month, Resource search, slot selection, repetition editing, Reset to calendar, boundary error, Match warning, and Save/Create separation.
11. Run the full site test command from `apps/site` once after review fixes. Record the exact command and result in this plan.
12. Run `/code-review` against the issue #159 specification and the implementation base. Address every finding. Rerun affected checks.
13. Stage only issue-owned source, test, plan, and necessary style paths. Commit the implementation on the current branch. Comment on issue #159 with the outcome, verification, commit reference, and contract notes. Close the issue only after all acceptance criteria pass.

## Validation and Acceptance

The shared model tests must prove that Week ranges and complete Month ranges have the expected dates, Resource filters are visibility-only, repeating occurrences use the slot timezone and local date boundaries, and multiple Resource assignments do not duplicate logical timing aggregation.

The Event form tests must prove that a one-time calendar selection creates one canonical slot, the first standalone Weekly Event selection creates a repeating slot, mixed slot types remain valid, weekday edits preserve a repeating `startDate`, no-occurrence ranges fail with `The selected date range contains no occurrence for the selected weekdays.`, and missing Resource data exposes Assign Resource and Delete recovery actions.

The Event timing tests must prove that valid slots derive Start and finite Planned End, Calendar-Derived timing recalculates after valid slot edits, editing Start controls only Start, editing End selects Planned End, Reset to calendar clears only the selected control, and controlled boundaries stay fixed while valid slots change.

The boundary tests must prove that a new or edited Time Slot outside a controlled Event boundary blocks Save/Create with a Schedule Boundary Error, does not clip or mutate the slot, and does not extend the Event. Existing Matches beyond a changed boundary remain in the Event and produce only a Schedule Boundary Warning. No Effective Event End is displayed.

The End Policy tests must prove that finite slots use Planned End, open League and Tournament Events with Automated Scheduling use Set End from Schedule, open League and Tournament Events without Automated Scheduling require a finite Planned End, open standalone Weekly Events use No Planned End, Tryouts retain finite Resource-assigned availability, and unscheduled League and Tournament Events use a boundary-only range without a synthetic slot.

The Facility tests must prove that Week view includes every accessible Resource across every Facility, Resource labels include Facility context, Month view renders seven day columns with all selected occurrences, Month search filters only visible entries, navigation does not mutate persisted Event Resources, and existing rental, staff, official, conflict, drag, resize, and permission behavior remains intact.

The persistence tests must prove that Event Save and Create use the canonical Event editor path, preserve the current HTTP and database shapes, do not invoke scheduling operations, preserve local overnight and DST behavior, and reject direct Time Slot writes that would bypass Resource or Event-Type invariants. A mocked transport-only test is not sufficient.

The final evidence must include focused Jest results, the affected TypeScript result, changed-file lint result, full site test result, `git diff --check`, browser smoke results or the explicit browser-daemon limitation, code-review results, and the final commit reference.

## Idempotence and Recovery

All model and UI changes are source-only. No database migration is expected. Re-running focused tests and TypeScript is safe. Do not reset the dirty worktree. If an edit collides with a user hunk, re-read the file, narrow the edit to the issue-owned construct, and preserve the user hunk.

If the Month renderer fails, keep the existing Week renderer intact and fix the Month branch in isolation. If an Event calendar update creates an invalid draft, reject the update at the form seam and preserve the prior slot. Do not silently normalize a user-selected date, weekday, Resource, or Event boundary.

If a server validation test exposes a rental-backed slot path, distinguish rental ownership from organizer-owned Event availability before changing validation. Preserve rental locks and use the existing canonical validation helpers.

If full validation reports failures in unrelated dirty files, record the exact paths and messages in this plan. Do not change unrelated code or generated Prisma output to make the final result appear clean.

## Artifacts and Notes

The issue specification is `https://github.com/Razumly/bracketiq/issues/159`. The parent Event operations issue is #125. The related one-time overnight and future-end work is #155.

The current Facility calendar uses `facilityCalendarTypes.ts` for entries and `FacilityResourceCalendarGrid.tsx` for rendering. The current Event form uses `LeagueSlotForm` for editable slots. Keep those existing public shapes where possible and adapt them at the shared calendar seam instead of changing the HTTP contract.

Expected final issue comment evidence:

    Event and Facility now use the shared Resource calendar model.
    Week view shows all accessible Resources and Month view is a seven-column grid.
    Event timing source, Reset to calendar, slot boundary errors, and Match warnings preserve the confirmed ownership rules.
    Save and Create do not invoke scheduling operations.
    HTTP, database, mobile, permission, Resource, End Policy, overnight, and DST contracts remain intact.
    Focused checks, full site validation, browser smoke, and code review results are listed.
    Commit: final commit containing this plan update.

## Interfaces and Dependencies

Add a pure shared module under `apps/site/src/components/calendar/` or `apps/site/src/lib/` with no Prisma or React dependency. It must expose stable Resource and calendar-entry types, a Week range helper, a complete Month range helper, visibility filtering, and logical-slot boundary aggregation. Use `date-fns` and the existing local-time utilities.

The shared calendar UI must accept a Resource list, calendar entries, current view, current date, navigation callback, view callback, selection callback, and event activation callback. Week mode must support Resource-row interactions already required by Facility operations. Month mode must support seven day columns, keyboard-accessible cells, selected Resource visibility, and slot selection.

The Event adapter must accept `LeagueSlotForm[]`, `Field[]`, Event Start, Event End, Event Time Zone, and the visible calendar range. It must return shared calendar entries and retain the source slot key, Resource ID, occurrence date, and logical slot identity for callbacks.

The Event timing state must expose Calendar-Derived or Organizer-Controlled source per boundary, a reset action per boundary, and blocking or warning messages without adding a persisted field. Existing `EventFormValues`, `EventEditorDraft`, `SaveEventEditorCommand`, and API response shapes remain unchanged.

No new external dependency is allowed. Reuse React, React Hook Form, Mantine-owned controls, `date-fns`, existing Resource labels, existing `FieldCalendarFilter`, and existing recurrence and one-time availability helpers.

Plan update note: Updated on 2026-09-13 after implementation, validation, and final two-axis review. The plan records the exact verification results, intentional validation limits, and selective staging of a dirty worktree.