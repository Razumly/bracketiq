# Migrate the Event details and editing surface

This ExecPlan is a living document. Maintain it in accordance with `PLANS.md` in the repository root. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current.

## Purpose / Big Picture

Issue #125 covers the post-creation Event management surfaces. This first milestone migrates the Event details and editing surface. After this milestone, an organizer can open an existing Event, enter Manage, edit the Event Configuration with the same `EventForm` used by Create Event, and use the management save, discard, lifecycle, status, warning, and action controls without the old Mantine presentation layer in the migrated editing shell.

The change is visual and structural. It does not change Event Configuration fields, validation, permissions, schedule rules, editor revisions, HTTP paths, request fields, or save behavior. The user-visible proof is the existing Event management route: open an existing Event, select Manage, change a form value, observe the pending-change and Save states, save or discard the change, and confirm that the existing Event management tabs still load.

This plan does not claim the complete issue #125 checklist. Schedule, participants, rosters, matches, brackets, scoring, check-in, staffing, finance, rentals, and their state surfaces remain separate milestones because they have separate behavior and ownership.

## Progress

- [x] (2026-09-11 00:07Z) Read the issue #125 body and comments, repository rules, `apps/site/AGENTS.md`, `PLANS.md`, the completed Create Event migration plan, and the Event editor architecture plan.
- [x] (2026-09-11 00:07Z) Confirmed that issue #138 is closed and issue #125 is assigned to the current operator.
- [x] (2026-09-11 00:07Z) Confirmed that `EventForm.tsx` already serves both Create Event and existing-Event edit mode, and that the editor save path already uses `EventEditorSnapshot`, `EventEditorDraft`, and `/api/events/{id}/editor`.
- [x] (2026-09-11 00:07Z) Confirmed that the target Event schedule page and header contain unrelated uncommitted user changes. Those changes are preserved.
- [x] (2026-09-11 00:30Z) Replace the Event editing header controls with the owned operation controls and preserve all callbacks and disabled states. The delegated code review also added the Event status accessible name and preserved the non-searchable status control.
- [x] (2026-09-11 00:30Z) Remove the Mantine wrapper from `DetailsTabPanel` while keeping the page-level tab host compatible with the remaining operational tabs.
- [x] (2026-09-11 00:30Z) Run focused Event editor behavior checks, TypeScript, changed-file lint, and the applicable browser smoke check. The focused edit/menu checks passed; target-file lint passed with six existing hook warnings; TypeScript stopped on unrelated Prisma and route errors; the browser daemon was unavailable.
- [x] (2026-09-11 00:31Z) Record the result on issue #125 without closing the issue. Comment: `https://github.com/Razumly/bracketiq/issues/125#issuecomment-5627541406`.

## Surprises & Discoveries

- Observation: Create Event and existing-Event editing already share one form implementation.
  Evidence: `apps/site/src/app/events/[id]/schedule/schedulePage/DetailsTabPanel.tsx` passes `isCreateMode` into `components/EventForm.tsx`; `EventForm.tsx` derives edit mode from the snapshot and keeps section navigation for edit mode.

- Observation: The Create Event migration intentionally left existing-Event editing in issue #125.
  Evidence: `plans/site-create-event-ui-migration-execplan.md` states that create mode uses the new navigation-free shell while edit mode keeps section navigation and remains in issue #125.

- Observation: The management header and page already have uncommitted changes from the user.
  Evidence: `git status --short` reports modifications in `EventScheduleHeader.tsx` and `page.tsx`; the diff removes create-mode pending-change props from `CreateEventScheduleView` and keeps the edit-only pending-change controls inside the header.

- Observation: The owned compatibility layer supports the management header controls, but its `Badge` does not support Mantine's `rightSection` prop and its menu uses standalone Base UI wrappers.
  Evidence: `organization-operation-ui.tsx` exposes owned `ActionIcon`, `Alert`, `Badge`, `Button`, `Group`, `Select`, and `Title`; `components/ui/menu.tsx` exposes `Menu`, `MenuContent`, `MenuItem`, and `MenuTrigger`.
- Observation: The focused edit and menu behavior checks pass after the migration.
  Evidence: The Event schedule page test ran four edit-state cases with `4 passed`; the management menu test ran two cases with `2 passed`.

- Observation: The repository TypeScript check remains blocked by unrelated generated-client and route errors.
  Evidence: `npm exec tsc -- --noEmit` reported missing Prisma properties and `protectEventResponse` in files outside this slice; it reported no target-file error before stopping.

- Observation: Browser smoke verification could not start.
  Evidence: `browser.open` returned `Shared browser daemon unavailable`; the existing `site-ui-production` runtime is a pre-existing production process and was not restarted.

## Decision Log

- Decision: Treat the shared `EventForm` as the editing seam and do not create a second edit form.
  Rationale: The form already maps the edit snapshot to the same field model used by Create Event. A second implementation would split validation and payload behavior and violate the user's reuse requirement.
  Date/Author: 2026-09-11 / Codex.

- Decision: Migrate the header controls through `organization-operation-ui.tsx` and use the existing owned menu primitives for the More menu.
  Rationale: The owned compatibility layer preserves current Mantine-shaped props and existing Create Event uses the same adapter. Direct control rewrites would increase behavior risk without improving the seam.
  Date/Author: 2026-09-11 / Codex.

- Decision: Keep the page-level Mantine tab host in this milestone because schedule, participant, standings, bracket, and finance panels still use that host. Make `DetailsTabPanel` own only Event details content and move its `Tabs.Panel` wrapper to the page.
  Rationale: This removes the old presentation dependency from the details editor module without changing the tab contract required by the other operational panels. A full tab-host migration is a separate surface and must not be hidden in an editing-only change.
  Date/Author: 2026-09-11 / Codex.

- Decision: Preserve all existing uncommitted user changes in target files.
  Rationale: The repository policy treats unexpected changes as user work. The edit must apply only the owned-control migration and the required details wrapper change.
  Date/Author: 2026-09-11 / Codex.

- Decision: Do not add visual or style tests.
  Rationale: Issue #125 explicitly prohibits visual/style tests. Use existing EventForm and schedule-page behavior tests, TypeScript, lint, and a browser smoke check.
  Date/Author: 2026-09-11 / Codex.

## Outcomes & Retrospective

- Outcome: `EventScheduleHeader.tsx` now uses the owned operation controls and owned Base UI menu primitives. It preserves Event title, Manage, Save, Discard Changes, lifecycle status, More actions, loading states, disabled states, alerts, callbacks, and the user's existing edit-only pending-change behavior.
- Outcome: `DetailsTabPanel.tsx` now owns only details content. The existing page tab host wraps it, so the shared `EventForm` continues to serve both Create Event and existing-Event editing with the same editor snapshot, draft callbacks, validation, and save route.
- Outcome: The focused edit-state cases passed (`4 passed`). The focused management menu cases passed (`2 passed`). Target-file ESLint passed with no errors and six existing hook warnings in the large schedule page. TypeScript remains red on unrelated Prisma-generated-client and route errors. Browser verification was unavailable because the browser daemon failed to launch.
- Outcome: No Event Configuration field, editor payload, HTTP route, permission rule, schedule transition, database schema, or generated file changed. Issue #125 remains open for the other operations surfaces.
- Retrospective: The Create Event migration paid back directly. Existing-Event editing did not need a second form or a new save path; the first issue-125 slice only needed the management shell and details seam to adopt the owned presentation layer. Keep later operational migrations separate because their panels still own Mantine tab content and different behavior.

## Context and Orientation

The authenticated Event management route is `apps/site/src/app/events/[id]/page.tsx`, which re-exports `apps/site/src/app/events/[id]/schedule/page.tsx`. The schedule page renders the `EventScheduleContent` client module. Its page-level tab host contains Details, Participants, Schedule, Standings, Bracket, and Finance panels.

`apps/site/src/app/events/[id]/schedule/schedulePage/DetailsTabPanel.tsx` selects between the shared `EventForm` for creation/editing and `EventDetailSheet` for read-only detail display. The page passes the current `EventEditorSnapshot`, form ref, dirty state callback, validity callback, draft callback, and submit callback. The details module must not create a new draft or save path.

`apps/site/src/app/events/[id]/schedule/components/EventForm.tsx` is the shared form module. In create mode it renders the Create Event shell. In edit mode it renders the existing-event section navigation and the same Event Configuration fields. It reports drafts through `onDraftStateChange` and exposes imperative validation and draft capture through `EventFormHandle`.

`apps/site/src/app/events/[id]/schedule/schedulePage/EventScheduleHeader.tsx` renders the Event name, selected weekly occurrence badge, notification and report actions, Manage action, QR action, pending changes, discard, lifecycle status, Save action, More menu, and alert messages. Its callbacks are supplied by `EventScheduleContent` in `page.tsx`.

`apps/site/src/components/organization/organization-operation-ui.tsx` is the owned compatibility adapter. It provides BracketIQ-owned controls with the existing Mantine-shaped props used by this route. `apps/site/src/components/ui/menu.tsx` supplies the owned menu primitives needed for the More menu.

The event editor contract lives under `apps/site/src/contracts/eventEditor.ts` and the save route is `/api/events/[id]/editor`. The edit save command contains the editor contract version, editor revision, staff revision, draft, and a preserve-schedule transition. This milestone changes none of those values.

## Context Boundary

The minimum sources for this milestone are:

- `AGENTS.md` and `apps/site/AGENTS.md`.
- `PLANS.md`.
- Issue #125 body and comments.
- `plans/site-create-event-ui-migration-execplan.md`.
- `plans/event-editor-architecture-hardening-execplan.md`.
- `apps/site/src/app/events/[id]/schedule/page.tsx`, limited to EventScheduleContent imports, the header call, the details tab host, and edit/save state wiring.
- `apps/site/src/app/events/[id]/schedule/schedulePage/EventScheduleHeader.tsx`.
- `apps/site/src/app/events/[id]/schedule/schedulePage/DetailsTabPanel.tsx`.
- `apps/site/src/app/events/[id]/schedule/schedulePage/EventSchedulePendingChangesPopover.tsx`.
- `apps/site/src/app/events/[id]/schedule/components/EventForm.tsx` and its existing editor tests.
- `apps/site/src/components/organization/organization-operation-ui.tsx`.
- `apps/site/src/components/ui/menu.tsx`.

Expand the context only when TypeScript reports a prop mismatch, a focused test reports an edit/save regression, or the browser smoke check shows a control or state outside these modules. Do not read or migrate other operational panels unless the details seam cannot be verified without them.

## Plan of Work

First, keep the current worktree intact and confirm the exact dirty diff in the two target files. The user changes must remain in the final diff.

Next, replace the production Mantine control import in `EventScheduleHeader.tsx` with the owned operation controls. Keep the current event title, action conditions, loading states, disabled conditions, status selection, alert content, and callbacks. Replace the Mantine `Badge` close affordance with a semantic owned badge composition. Replace the Mantine More menu with `Menu`, `MenuContent`, `MenuItem`, and `MenuTrigger` while preserving each item label, color meaning, condition, disabled state, and callback.

Then, make `DetailsTabPanel.tsx` render only its details content. Move the page-tab wrapper to the Details location in `page.tsx`, so the existing Mantine tab context remains valid for the other panels while the details editor module has no direct Mantine import. Preserve the loading state, EventForm props, read-only EventDetailSheet props, and active-state behavior.

Finally, run the existing EventForm and schedule-page behavior tests, run TypeScript and changed-file lint, and use the browser against the authorized local site if the site is available. Verify the edit path at desktop and narrow mobile widths. Record the checks and any repository baseline failures in this plan and issue comment.

## Concrete Steps

Run site commands from `apps/site`.

1. Inspect `git diff -- apps/site/src/app/events/[id]/schedule/schedulePage/EventScheduleHeader.tsx apps/site/src/app/events/[id]/schedule/page.tsx` before editing. Do not reset, clean, or stage unrelated paths.
2. Edit `EventScheduleHeader.tsx` and `DetailsTabPanel.tsx`. Edit only the details tab insertion in `page.tsx` that is required to host the moved `Tabs.Panel`; retain the existing user changes.
3. Search the affected production files for `@mantine/core`. The migrated header and details module must not import Mantine. The page may retain Mantine because the remaining operational tabs still use it.
4. Run the focused tests from `apps/site`:

       npx jest --runInBand --runTestsByPath src/app/events/[id]/schedule/__tests__/page.test.tsx src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx

   The route path contains brackets, so use `--runTestsByPath` rather than a broad path expression.
5. Run the affected static checks from `apps/site`:

       npm run lint:changed
       npm exec tsc -- --noEmit

   Treat unrelated existing generated-client or environment failures as baseline failures. Do not modify generated files to make this slice appear clean.
6. Start or reuse only an already authorized local site runtime. Open an existing Event management route in a browser at a desktop width and a 390-pixel mobile width. Enter Manage, change a field, observe pending changes, discard, enter Manage again, save, and confirm the Details and another existing tab remain usable. Do not start, stop, or reconfigure a runtime without explicit authorization.
7. Run `git diff --check`. Review the final diff for only the plan and issue-owned source changes. Stage and commit only those paths when the checks pass.
8. Comment on issue #125 with the completed Event details/editing slice, the preserved contracts, the verification results, and the remaining operational surfaces. Keep issue #125 open.

## Validation and Acceptance

The Event details and editing milestone is accepted when all of these observable results hold:

- The existing Event management route still opens the same Event and uses the same `EventForm` in edit mode.
- Manage still enters edit mode. Event fields, section navigation, validation, draft capture, dirty state, save, discard, and lifecycle status callbacks remain connected to the existing state model.
- The header controls use the owned operation controls. The header has no direct `@mantine/core` import.
- `DetailsTabPanel.tsx` has no direct `@mantine/core` import. It still renders the loading state, shared EventForm, and read-only EventDetailSheet with the same props.
- The page-level tab host still renders Details, Participants, Schedule, Standings, Bracket, and Finance according to the existing feature flags.
- Pending-change, loading, disabled, error, warning, conflict, and permission behavior remains controlled by the existing booleans and callbacks.
- No request or response field changes. No API route changes. No Prisma or database changes.
- Desktop and 390-pixel mobile smoke checks show no page-level horizontal overflow and no eyebrow text.
- Focused behavior tests pass. Changed-file lint has no errors. TypeScript passes or records only pre-existing failures that are outside this slice.

This milestone does not accept issue #125 as complete. The issue remains open until its other operational surfaces have approved references and independent migrations.

## Idempotence and Recovery

The work is source-only. It requires no database migration and no runtime state change. Repeating the import and JSX edits is safe if the current file content is checked first. If an owned control exposes a type or behavior mismatch, restore only that control's prior import and markup, keep the rest of the slice intact, and rerun the focused check. Never reset the worktree because unrelated user changes must remain intact.

If browser verification exposes an edit/save regression, stop the migration at the affected control, compare its callback and disabled expression with the pre-edit implementation, and restore the exact expression before investigating any broader module.

## Artifacts and Notes

The completed Create Event references and event capacity references are under `docs/images/site-ui/`. This milestone reuses the existing Create Event form and does not add new visual reference files.

Expected issue comment evidence includes:

       Event details/editing migrated through the shared EventForm and owned operation controls.
       No Event Configuration fields, editor save payloads, permissions, or HTTP routes changed.
       Focused tests, lint, TypeScript, and browser smoke results listed with exact outcomes.
       Issue #125 remains open for the remaining operational surfaces.

## Interfaces and Dependencies

The details module must preserve this existing interface in `DetailsTabPanel.tsx`:

       type DetailsTabPanelProps = {
         shouldShowCreationSheet: boolean;
         user: UserData | null | undefined;
         eventFormRenderKey: string;
         eventFormRef: RefObject<EventFormHandle | null>;
         isActive: boolean;
         onClose: () => void;
         onDirtyStateChange: (hasChanges: boolean) => void;
         onValidityChange?: (isValid: boolean) => void;
         onDraftStateChange: (state: { draft: EventEditorDraft; baselineDraft: EventEditorDraft }) => void;
         onSubmitRequest?: () => void;
         event: Event;
         editorSnapshot: EventEditorSnapshot | null;
         organization: Organization | null;
         defaultLocation?: DefaultLocation;
         isCreateMode: boolean;
         rentalPurchase?: RentalPurchaseContext;
         templateOrganizationId?: string;
         selectedOccurrence: WeeklyOccurrenceSelection | null;
         onWeeklyOccurrenceChange: (occurrence: { slotId: string; occurrenceDate: string } | null) => void;
       };

The header must preserve its current `EventScheduleHeaderProps` interface. Its owned controls may change only presentation props and JSX composition. The `EventSchedulePendingChangesPopover` remains the adapter for pending editor changes and keeps its current interface.

The shared editor interface remains `EventFormProps` and `EventFormHandle` in `apps/site/src/app/events/[id]/schedule/components/eventForm/types.ts`. The save seam remains `saveEditorConfiguration` in `apps/site/src/app/events/[id]/schedule/page.tsx`, which sends the existing `SaveEventEditorCommand` to `/api/events/{eventId}/editor`.

The implementation depends on React, Next.js, the existing BracketIQ owned operation controls, the existing Base UI menu primitives, React Hook Form, the event editor contract, and the existing Event management page state. No new dependency is allowed.

## Plan Revision Note

Created on 2026-09-11 after issue #138 closure and issue #125 claim. The scope is intentionally the Event details/editing milestone so the shared Create Event work can be reused without mixing unrelated schedule and operations migrations.

Updated on 2026-09-11 after the issue commit was amended and the issue #125 progress comment was posted. The issue remains open because this plan covers only the Event details/editing milestone.
