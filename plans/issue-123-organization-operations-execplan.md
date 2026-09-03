# Migrate Organization operation surfaces to BracketIQ UI primitives

This ExecPlan is a living document. It follows `PLANS.md` and records the work for GitHub issue #123.

## Purpose / Big Picture

Organization members need one predictable management workspace for events, teams, customers, facilities, templates, staff, reviews, finance, refunds, public-page settings, divisions, discounts, and store operations. After this work, these surfaces will use the BracketIQ-owned Base UI primitives already used by the Organization shell. Cards, controls, tables, dialogs, drawers, loading states, errors, empty states, disabled controls, and permission states will keep one visual and accessibility system across the Organization area.

The existing services, API routes, persistence rules, and permission rules remain unchanged. A reviewer can verify the result by opening an Organization, switching through the available tabs, using the record actions and dialogs, and confirming that each tab keeps its content area while it loads or reports an error.

## Progress

- [x] (2026-09-02) Read the issue, its comments, repository rules, implementation skill, UI guidance, TDD guidance, and `apps/site` guidance.
- [x] (2026-09-02) Confirmed #123 has no open native blockers, no assignee before claim, and project Status `Todo`.
- [x] (2026-09-02) Added `ready-for-agent`, assigned #123 to the current user, set Workstream to `Site UI`, and set project Status to `In progress`.
- [x] (2026-09-02) Mapped the Organization operation render paths and added shared BracketIQ-owned operation UI and state primitives.
- [x] (2026-09-02) Migrated the Organization operation render paths without changing service, API, persistence, financial, or permission contracts.
- [x] (2026-09-02) Updated focused tests for operation actions, confirmation dialogs, notifications, rental selection state, and the responsive Events path.
- [x] (2026-09-02) Passed normal changed-file ESLint, focused tests, standalone TypeScript, and the production site build.
- [ ] Run the required two-axis code review against the issue specification.
- [x] (2026-09-02) Committed the implementation as `9e3626b26` and posted the verification record to issue #123.
- [ ] Complete the issue close gate after browser smoke and the shared CI environment are available.

## Surprises & Discoveries

- Observation: The Organization route is a 6,249-line client component that owns data loading, mutations, tab selection, and most operation markup in one file.
  Evidence: `apps/site/src/app/organizations/[id]/page.tsx` contains the operation state and render paths from lines 755 through the end of the file.
- Observation: The Organization shell already uses BracketIQ-owned Base UI primitives, but the operation content still imports Mantine controls directly.
  Evidence: `OrganizationManagementShell.tsx` imports local `Button`, `Card`, `Checkbox`, `Input`, `Sheet`, and `Tabs`; `page.tsx` still imports `@mantine/core`.
- Observation: The shell still contains small uppercase section text in the mobile section trigger. This conflicts with the repository rule that product UI must not add eyebrow text.
  Evidence: `OrganizationManagementShell.tsx` renders `Organization sections` as a small uppercase span above the active section.
- Observation: #123 has no explicit native blockers after #119, #120, #122, #134, and #136 closed, but it was missing `ready-for-agent` and Workstream metadata.
  Evidence: `gh api repos/Razumly/bracketiq/issues/123/dependencies/blocked_by` returned only closed issues; project metadata showed no Workstream value before this run.
- Observation: The migrated route needed a local compatibility layer because its operation components use a broad set of Mantine prop shapes, while the BracketIQ primitives expose smaller APIs.
  Evidence: Standalone TypeScript initially reported variant, size, spacing, link, date, popover, and value-handler mismatches. The local adapter now maps these props to BracketIQ primitives and native controls.
- Observation: `FacilityDetailsWorkspace` reset its edit history on parent object identity changes and recorded duplicate snapshots because the previous snapshot ref was updated before the history decision.
  Evidence: The reset effect depended on `initialSnapshot` and pending count, and the change callback compared the current ref after assigning it. The migration now keys reset behavior to the stable snapshot key and records the prior snapshot before updating the ref.
- Observation: The Events search and create controls had minimum widths that exceeded a 320px viewport.
  Evidence: The responsive audit identified page overflow at 320 CSS px. The controls now use a full-width mobile layout and retain their desktop minimum only from the `sm` breakpoint.

## Decision Log

- Decision: Keep the current service and state boundaries while migrating the presentation layer.
  Rationale: The issue requires UI migration and explicitly preserves persistence, permission, validation, financial, and HTTP behavior. Keeping the existing data boundary lowers regression risk.
  Date/Author: 2026-09-02 / Codex
- Decision: Use the local Base UI primitives and semantic theme tokens as the only new Organization operation UI foundation.
  Rationale: The Organization shell already establishes the target visual language and the repository has local primitives for cards, buttons, inputs, selects, dialogs, sheets, tabs, tables, checkboxes, badges, and skeletons.
  Date/Author: 2026-09-02 / Codex
- Decision: Treat the issue checklist states as the test seams: tab loading, permission denial, empty results, recoverable errors, record actions, edit/create dialogs, and validation feedback.
  Rationale: These are the observable boundaries named by the issue and the approved Data management mobile reference. They avoid tests that assert CSS classes or implementation details.
  Date/Author: 2026-09-02 / Codex
- Decision: Use a shared local adapter for the migrated operation controls instead of rewriting the route state and service boundaries.
  Rationale: This provides one BracketIQ-owned visual and accessibility seam across the large Organization route while keeping the existing operation callbacks and HTTP contracts stable.
  Date/Author: 2026-09-02 / Codex
- Decision: Keep unrelated Mantine consumers outside the completed Organization operation paths.
  Rationale: Claim flow, location selectors, and unrelated shared route components belong to separate migration slices. The completed Organization operation files no longer import Mantine controls.
  Date/Author: 2026-09-02 / Codex

## Outcomes & Retrospective

The Organization operation route and its directly owned panels now use BracketIQ-owned operation controls, shared operation states, and the local notification adapter. This covers the Events, Teams, Customers, customer detail, templates, Staff, Facilities, Reviews, Finance, Refunds, Public-page settings, Divisions, Discounts, and Store render paths owned by the route and panels. The shell now uses the shared loading and permission states, and the mobile section trigger no longer adds eyebrow text. The Events search and create controls no longer overflow a 320px viewport. Facility edit history now preserves user edits across parent refreshes and records one prior snapshot per meaningful change.

Verification completed:

- Normal changed-file ESLint: passed with 0 errors and 22 existing hook-dependency warnings. The separate complexity config reports baseline complexity errors in the large pre-existing route components.
- Focused tests: passed 108 assertions across 11 suites, plus 6 rental-selection hook tests.
- Standalone TypeScript: passed.
- Production build: passed with a temporary local `DATABASE_URL`; no environment files were changed.
- `git diff --check`: passed.

The full `npm run test:ci` attempt was stopped after it exposed broad baseline/environment failures: many suites fail before execution because `test/setupTests.ts` extends an unavailable `MouseEvent`; Playwright suites fail while loading the bundled runtime; and unrelated event, affiliate, and CI-configuration assertions also fail. The Organization-focused suites passed independently. Browser smoke requires an explicitly started local runtime and configured application credentials, which were not part of this implementation request.

## Context and Orientation

`apps/site/src/app/organizations/[id]/page.tsx` is the client route for one Organization. It loads the Organization, derives the visible tabs from permissions and enabled features, and renders the tab content. The file also owns operation actions such as creating events and teams, editing Organization data, managing customers and documents, and managing store products.

`apps/site/src/components/organization/OrganizationManagementShell.tsx` is the shared Organization frame. It owns the Organization header, responsive section navigation, page-scoped loading state, and shell-level error and permission states. `apps/site/src/components/ui/` contains the BracketIQ-owned Base UI wrappers. These wrappers use `@base-ui/react`, Tailwind classes, and semantic CSS tokens from `apps/site/src/app/globals.css`.

The current operation implementation still uses Mantine components in the route and in directly owned Organization panels. Mantine is a component library. In this work, “migrate” means replace the operation surface's Mantine presentation components with local BracketIQ-owned components or native semantic elements while keeping the existing service calls and user-visible behavior.

The approved mobile references are in `docs/images/site-ui/data-management/`. They define the Data management Layout Family at `853×1844`, including default list, bulk selection, detail sheet, edit validation, loading, empty, recoverable error, permission denied, and facilities schedule states.

## Plan of Work

First, define the small set of shared Organization operation presentation components needed by more than one surface. Use local `Card`, `Button`, `Input`, `Textarea`, `Checkbox`, `Select`, `Dialog`, `Sheet`, `Tabs`, `Badge`, `Avatar`, `Skeleton`, and `Loading` primitives. Add shared page-scoped error, empty, permission, table, and form field patterns only when two or more operation surfaces need the same behavior.

Next, migrate the main Organization route in vertical slices. Start with the Events and Teams list paths because they are the primary record-list surfaces and expose loading, empty, permission, and row-action behavior. Then migrate Customers and the customer detail path, Facilities, templates, Staff, Reviews, Divisions, Discounts, Finance, Refunds, Public Page, and Store. Keep each slice small enough to run its focused tests and changed-file lint before the next slice.

Then, migrate directly owned dialogs and panel components that still render Mantine controls. Preserve their callbacks and service calls. Replace notification calls with the existing application toast surface where the component is part of the migrated Organization operation path. Do not change API payloads, permission checks, or persistence models.

Finally, remove Organization-specific Mantine imports and stale Organization Mantine CSS selectors that no longer have consumers. Keep Mantine code used by unrelated routes until its owning issue migrates it. Run the complete site checks, perform a browser smoke pass at a small phone width and a desktop width, and record the evidence in the issue close comment.

## Concrete Steps

Run all site commands from `C:/Users/samue/.codex/worktrees/c2a7/BracketIQ/apps/site`.

1. Inspect the current operation render paths and tests.

       rg -n "@mantine|<Paper|<Table|<Modal|<Select|<TextInput|<Button" src/app/organizations src/components
       npm test -- --runInBand src/app/organizations/[id]/__tests__/organizationTabs.test.ts

2. Implement one vertical slice. Run its focused test and changed-file lint.

       npm run lint:changed
       npm test -- --runInBand <focused-test-file>

3. Run the route type check after each coherent migration slice.

       npx tsc --noEmit

4. Run the full site verification after all slices.

       npm run lint:changed
       npm run test:ci
       npm run build

5. Inspect the final diff and review it against issue #123. Commit only the implementation files owned by this issue.

## Validation and Acceptance

The issue is complete when the Organization route uses the local BracketIQ-owned primitives for every completed operation Surface in #123. A user can open the Organization page and switch tabs without the whole page going blank. The active content area shows a loading state while its data loads. Empty, recoverable error, disabled, and permission states provide clear text and a recovery action where applicable. Record lists and tables remain usable at mobile and desktop widths. Bulk actions, row actions, detail drawers, creation dialogs, edit dialogs, and inline validation retain their current service behavior.

Tests must observe public behavior. They must not assert CSS class names, exact spacing, Mantine internals, or static markup. Focused tests should cover tab selection and permission visibility, loading-to-content transitions, empty and error recovery, form validation, and action callbacks at the component or route boundary.

Manual verification must include a 375px-wide viewport and a desktop viewport. Check keyboard focus, visible focus rings, 44px minimum interactive targets, readable labels, error text next to the affected control, reduced-motion behavior for loading animation, and no horizontal page overflow. Do not add visual regression tests or screenshot assertions.

## Idempotence and Recovery

The migration is additive at the file level. Re-running the checks is safe. Do not reset or discard unrelated worktree changes. If a slice causes a type or test failure, fix that slice before starting another one. If a service or API contract appears to require a change, stop the presentation migration and record the contract question rather than changing persistence or permissions under this issue.

## Artifacts and Notes

The canonical approved mobile references are in `docs/images/site-ui/data-management/`. The current worktree contains commit `1e1cb02b7` for those reference assets before this implementation work. The implementation commit for #123 will be recorded here when complete.

## Interfaces and Dependencies

The implementation must continue to use the existing interfaces:

- `organizationService` for Organization reads and writes.
- `eventService` for Organization Event reads and mutations.
- Existing customer, template, finance, refund, staff, facility, discount, and product services already called by the route or panels.
- `OrganizationManagementShell` for Organization frame state and tab navigation.
- Local UI primitives under `apps/site/src/components/ui/`.
- Semantic theme tokens from `apps/site/src/app/globals.css`.

No new persistence model, HTTP route, shared mobile model, or permission contract belongs in this issue.
