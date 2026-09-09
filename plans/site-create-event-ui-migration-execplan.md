# Migrate the Create Event web surfaces

This ExecPlan is a living document. Maintain it in accordance with `PLANS.md` in the repository root. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current.

## Purpose / Big Picture

Issue #124 moves the web Create Event experience from the remaining Mantine presentation layer to the BracketIQ-owned UI primitives. After this work, Simple Setup and Advanced Setup use the approved Create Event references at desktop and mobile widths, while the existing React Hook Form state, validation, drafts, navigation, publishing, and HTTP contracts remain unchanged.

A user can verify the result by opening the authenticated Create Event route, switching between Simple and Advanced modes, moving through the setup pages, opening date and selection controls, triggering validation, saving a draft, and returning to the form. The UI must remain usable at desktop and narrow mobile widths. This issue does not change event-domain behavior or the post-creation management surfaces owned by issue #125.

## Progress

- [x] (2026-09-08) Read issue #124, its comments, the approved desktop and mobile references, repository rules, PLANS.md, and the existing Create Event plans.
- [x] (2026-09-08) Claimed issue #124 on the current `workstream/site-ui-operations` branch.
- [x] (2026-09-08) Confirmed the current Simple Setup page architecture already separates page content from the Advanced Setup renderer.
- [x] (2026-09-08) Inventoried the remaining Mantine imports in the Create Event form tree and identified the owned compatibility controls in `organization-operation-ui.tsx`.
- [x] (2026-09-08) Replace Create Event production Mantine imports with owned controls without changing form contracts.
- [x] (2026-09-08) Align the create-mode shell, Simple Setup progress and page frame, Advanced Setup navigation, section cards, and responsive layout with the approved references.
- [x] (2026-09-08) Run focused Create Event behavior checks: the final owned-control suite passed 1 suite and 22 tests; the final EventForm coverage passed 3 suites and 141 tests. The broader owned-control batch passed 6 suites and 61 tests before the last three owned-control cases.
- [x] (2026-09-08) Run TypeScript, changed-file lint, and the production build after all remediation. TypeScript and build passed; lint passed with 26 warnings and no errors.
- [x] (2026-09-08) Run the full site test suite once. The Create Event suites passed, but the repository-wide run stopped with 506 setup failures caused by `MouseEvent is not defined` in `test/setupTests.ts`; 369 suites and 2,424 tests passed.
- [x] (2026-09-08) Migrate reachable Create Event child controls and restore owned Select clearing and native options, keyboard navigation and active-option scrolling, decimal and empty draft handling, field error associations, date and time preservation, visible focus states, and inert collapsed content.
- [x] (2026-09-08) Run manual browser checks and Standards/Spec review. The final 1536px desktop check showed the create-only Advanced two-column grid with zero horizontal overflow; the final 390px check showed the one-column mobile layout and Simple validation recovery with zero horizontal overflow. Final standards and spec reviews reported no actionable findings.
- [x] (2026-09-08) Commit only issue-owned changes, comment on issue #124, and close the issue.

## Surprises & Discoveries

- Observation: The Simple Setup wizard is already implemented as a separate page dispatcher.
  Evidence: `EventForm.tsx` sends planning pages to `SimpleSetupPlanningPage`, data pages to `SimpleSetupFormPage`, and Advanced Setup to `EventFormSections`.

- Observation: The Create Event form itself does not import Mantine, but its production leaf components still contain many `@mantine/core` and `@mantine/dates` imports.
  Evidence: The remaining imports are under `eventForm/`, and the create-mode shell is `schedulePage/CreateEventScheduleView.tsx`.

- Observation: The repository already has an owned compatibility layer that accepts most existing Mantine-shaped props.
  Evidence: `components/organization/organization-operation-ui.tsx` exports `Button`, `Stack`, `Text`, `Title`, `Paper`, `TextInput`, `Textarea`, `NumberInput`, `Select`, `MultiSelect`, `DatePickerInput`, `DateTimePicker`, `Switch`, `Checkbox`, `SegmentedControl`, `Modal`, `Alert`, `Badge`, `Collapse`, `Popover`, and related controls.

- Observation: The approved references describe a Create Event shell, not a new domain model.
  Evidence: The references show the same Simple/Advanced mode choice, progress steps, sections, draft action, and publish/continue actions already represented by the current form state.
- Observation: The completed Create Event surface reaches shared location, discovery field, pending-change, and rental modal components.
  Evidence: `CreateEventScheduleView.tsx` mounts the pending-change and rental controls, while `EventFormSections.tsx` reaches `LocationSelector`, `LeagueFields`, and `TournamentFields`; those production imports now use owned controls.

- Observation: Owned controls need behavior parity, not only matching prop names.
  Evidence: Focused tests caught controlled decimal editing, clearable Select actions, and keyboard exposure of collapsed content; the owned controls now retain the draft string while editing, expose a clear action, and set closed content inert.

- Observation: The approved Advanced reference uses a two-column card grid on desktop and a single column on mobile. It does not show a section navigation rail.
  Evidence: The final browser check at 1536px showed equal-width Basic Information and Event Details cards with no section rail; the 390px check showed one card column and zero horizontal overflow.

- Observation: Owned field `className` values are layout classes in the migrated form tree.
  Evidence: Moving them from the native input to the field frame restored the Event Name grid column from 31px to 174px on desktop and 306px on mobile.

## Decision Log

- Decision: Migrate the Create Event production tree through the existing owned compatibility controls before adding new primitives.
  Rationale: The compatibility layer preserves current prop and callback contracts, reduces behavior risk, and matches the migration pattern already used by completed Organization UI work.
  Date/Author: 2026-09-08 / Codex

- Decision: Keep `EventForm.tsx`, React Hook Form state, schema validation, controller hooks, draft mapping, and submission handlers unchanged unless a UI adapter requires a type-only adjustment.
  Rationale: Issue #124 requires visual migration and behavior preservation. A second form state or payload path would violate the issue boundary.
  Date/Author: 2026-09-08 / Codex

- Decision: Limit this migration to Create Event rendering paths and the create-mode shell. Do not migrate unrelated schedule tabs or post-creation Event management controls owned by issue #125.
  Rationale: The issues split Create Event from post-creation management. Limiting ownership prevents a large mixed commit and keeps review traceable.
  Date/Author: 2026-09-08 / Codex

- Decision: Do not add visual or style tests.
  Rationale: Issue #124 explicitly prohibits them. Use existing behavior tests, TypeScript, lint, build, and manual browser comparison.
  Date/Author: 2026-09-08 / Codex
- Decision: Keep the existing eight-page Simple Setup state model and render it through the migrated responsive rail instead of introducing a second four-step form state.
  Rationale: The current page model owns prerequisite locks, optional page usage, validation recovery, and draft preservation. A second page model would duplicate lifecycle behavior and risk changing the Event Configuration contract.
  Date/Author: 2026-09-08 / Codex

- Decision: Apply the navigation-free two-column shell only when `isCreateMode` is true.
  Rationale: Existing-event editing uses the same form component and remains in issue #125. The create reference needs the new grid, but edit mode must keep its existing navigation and layout.
  Date/Author: 2026-09-08 / Codex

- Decision: Add the missing owned `TagsInput` compatibility control for the shared Match Rules section.
  Rationale: `MatchRulesSection` is used by Create Event Advanced Setup. Keeping its production import on Mantine would violate the completed Create Event import boundary.
  Date/Author: 2026-09-08 / Codex

## Outcomes & Retrospective

- Outcome: The Create Event shell, Simple Setup flow, and create-mode Advanced Setup now use the approved owned visual system. Advanced Setup uses two columns on desktop and one column on mobile. Existing-event editing keeps its section navigation.
- Outcome: The React Hook Form state, Event Configuration draft mapping, lifecycle callbacks, and HTTP contracts stayed unchanged. Reachable form descendants now use owned controls.
- Outcome: Focused behavior coverage passed. TypeScript, changed-file lint, production build, and browser checks passed. The full site test run still has a repository setup failure because `MouseEvent` is not defined in `test/setupTests.ts`; the same run passed 369 suites and 2,424 tests.
- Retrospective: The main risk was compatibility behavior hidden behind Mantine-shaped props. Tests and browser checks found missing Select options, field-frame layout classes, date time loss, and focus styles. The migration fixed each case without adding a new form state or API path.

## Context and Orientation

The Create Event route is `apps/site/src/app/events/[id]/schedule/page.tsx`. In create mode it renders `schedulePage/CreateEventScheduleView.tsx`, which owns the navigation, template prompt, draft controls, error presentation, and `EventForm` mount. `components/EventForm.tsx` owns one React Hook Form draft for both Simple and Advanced modes. Its behavior is defined by `eventForm/schema.ts`, `eventForm/defaultValues.ts`, `eventForm/editorContractAdapters.ts`, and the controller hooks under `eventForm/hooks/`.

Advanced Setup renders `eventForm/sections/EventFormSections.tsx`. Simple Setup renders page components under `eventForm/simpleSetup/`, including basics, planning, divisions, schedule and location, pricing and registration, documents and questions, staff and operations, and review. Shared leaf controls live under `eventForm/sections/` and `eventForm/components/`.

The owned presentation layer is `apps/site/src/components/organization/organization-operation-ui.tsx`, supported by `apps/site/src/components/ui/`. It is a compatibility adapter for the current Mantine-shaped props and maps them to BracketIQ-owned Base UI and Tailwind primitives. Use it for Create Event controls that need existing Mantine prop compatibility. Use direct `components/ui` primitives only when a component is not represented by the compatibility adapter.

## Context Boundary

Minimum sources:

- Issue #124 body and comments.
- `AGENTS.md` and `apps/site/AGENTS.md`.
- `PLANS.md`.
- Approved references under `docs/images/site-ui/form-flow/`.
- `apps/site/src/app/events/[id]/schedule/schedulePage/CreateEventScheduleView.tsx`.
- `apps/site/src/app/events/[id]/schedule/components/EventForm.tsx`.
- `apps/site/src/app/events/[id]/schedule/components/eventForm/` production components.
- `apps/site/src/components/organization/organization-operation-ui.tsx` and the owned `components/ui` primitives.
- Existing Create Event tests under `eventForm/__tests__`, `eventForm/simpleSetup/__tests__`, and `components/__tests__`.

Expand the context only when a focused test shows a form-state or contract regression, a component needs a primitive not supplied by the owned layer, or browser verification exposes a Create Event surface outside the initial production tree.

## Plan of Work

First, preserve the current dirty worktree and record the complete production import inventory. Migrate the create-mode shell in `CreateEventScheduleView.tsx` and the shared Event form shell components. Replace Mantine imports with the existing owned compatibility exports where the APIs match. Replace unsupported layout or media components with semantic HTML and owned primitives without changing callbacks or form field names.

Next, migrate the Simple Setup pages and shared leaf controls in vertical slices. Start with the basics and navigation shell, then schedule and location, divisions, pricing and registration, documents and questions, staff and operations, and review. Keep each page's current controllers, `Controller` bindings, validation messages, and action callbacks. Run its existing focused tests after each slice.

Then, migrate the Advanced Setup sections and their shared editors. Preserve dynamic divisions, payment plans, dates, time slots, resources, staff, documents, registration questions, image upload, and event-type transition behavior. Use the existing owned `DatePickerInput`, `DateTimePicker`, `Select`, `MultiSelect`, `NumberInput`, `Switch`, `Checkbox`, `Modal`, `Alert`, and layout exports. Do not remove any domain field or change an API payload.

Finally, align the create-mode shell and page composition with the approved references. Check the visual hierarchy, white content surface, progress navigation, responsive stacking, sticky actions, section borders, focus rings, error summaries, and touch targets. Keep the no-eyebrow rule. Do not migrate post-creation tabs or schedule-management controls that belong to issue #125.

## Concrete Steps

Run all site commands from `apps/site`.

1. Keep `skills-lock.json` and `.agents/skills/` out of every issue commit. Use explicit paths for all edits and staging.
2. Migrate one Create Event vertical slice at a time. After each slice, run the affected Jest file with `--runTestsByPath` because the Next.js route contains bracketed path segments.
3. Run `npm run lint:changed` after the production import migration.
4. Run `node_modules/.bin/tsc --noEmit` from `apps/site`.
5. Run `npm run build` from `apps/site`. Restore generated Prisma output if the build changes tracked generated files.
6. Run `npm run test:ci` once after implementation. Record any pre-existing environment-wide failure without weakening scoped acceptance.
7. Start or reuse the authorized local production preview and use the Codex browser at desktop and 390-pixel mobile widths. Verify Simple and Advanced Create Event paths, date and selection controls, validation, draft action, mode switching, and responsive action controls.
8. Run the Standards and Spec reviews against a valid fixed point and the issue specification. Address every actionable finding, then rerun affected checks.
9. Run `git diff --check` and stage only issue-owned source, test, and plan files.

## Validation and Acceptance

The focused Create Event suites must pass, including EventForm integration, Simple Setup navigation and page tests, section behavior tests, date and slot validation tests, and any regression tests touched by the migration. TypeScript and changed-file lint must pass with no errors. The production build must pass.

Manual browser acceptance must show:

- Simple mode opens with the approved heading, mode selector, progress rail, page content, and Cancel/Save draft/Continue actions.
- Advanced mode shows the approved one-page section layout with Event basics, Schedule & location, Divisions & eligibility, Registration & capacity, Pricing & payments, and Visibility & publishing sections where applicable.
- Date pickers, selects, toggles, segmented registration controls, image upload, dialogs, validation messages, and errors remain usable with keyboard and pointer input.
- Switching modes preserves entered values. Draft and publish actions remain connected to the existing callbacks.
- Desktop and 390-pixel mobile layouts do not clip content or create page-level horizontal overflow.
- No eyebrow text appears.
- The Create Event production tree no longer imports Mantine directly. Unrelated post-creation Event management imports may remain for issue #125.

## Idempotence and Recovery

The migration is source-only and does not require a database migration or provider operation. Repeat focused tests and builds safely. If a component adapter changes behavior, revert only that component's explicit import and JSX change, rerun its focused test, and continue with the next slice. Never reset the worktree broadly because the user setup files are unrelated and must remain intact.

## Artifacts and Notes

Approved reference files:

- `docs/images/site-ui/form-flow/create-event--simple--desktop-1536x1024.png`
- `docs/images/site-ui/form-flow/create-event--simple--default--mobile-853x1844.png`
- `docs/images/site-ui/form-flow/create-event--advanced--desktop-1536x1024.png`
- `docs/images/site-ui/form-flow/create-event--advanced--default--mobile-853x1844.png`

Expected final evidence includes focused Jest output, TypeScript output, build output, changed-file lint output, browser observations at desktop and 390px widths, review results, the commit hash, and the issue close comment.

## Interfaces and Dependencies

The public behavior boundary remains the `EventForm` props and the existing create-mode callbacks from `CreateEventScheduleView.tsx`. The migration must preserve `EventFormHandle`, `EventFormProps`, `onDraftStateChange`, `onDirtyStateChange`, `onValidityChange`, and `onSubmitRequest`.

The form contract remains the existing `CreateEventEditorCommand` and `EventEditorSnapshot` contract under `apps/site/src/contracts/eventEditor.ts`. This issue changes no request or response field and no server route.
