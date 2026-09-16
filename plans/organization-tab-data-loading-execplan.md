# Keep organization tab controls visible during data loading

This ExecPlan follows `PLANS.md`. Keep it current as the work proceeds.

## Purpose / Big Picture

Organization tabs must show their titles, filters, and actions as soon as the user selects them. Only fetched values, cards, table rows, and calendar resources use loading placeholders. A request must not reset a search field or close its filter menu. Keep permission checks and the initial organization identity loading state.

## Progress

- [x] (2026-09-04) Read the repository rules and trace the tab loading paths.
- [x] (2026-09-04) Remove the shared whole-tab replacement and the artificial 180 ms delay.
- [x] (2026-09-04) Add reusable data placeholders for organization tab values, lists, tables, summaries, and resource rows.
- [x] (2026-09-04) Test filter state and focus across pending requests and request completion. Add checks for request failure, retry, calendar navigation, and Public Page drafts.
- [x] (2026-09-04) Run affected tests, TypeScript, and the changed-file lint gate. Tests and TypeScript pass. The broader worktree still fails the complexity gate.
- [x] (2026-09-04) Build and restart the local production preview. Check all 14 visible organization tabs in the Codex browser.

## Surprises & Discoveries

The shared `OrganizationManagementShell` replaces its children during a tab request. This unmounts controls and also delays requests owned by those children. `page.tsx` adds a separate 180 ms timer on every tab change. Several tabs already have local loading states, but the shell hides them.

The worktree has existing issue 123 edits and a known failing complexity gate. Preserve these edits. Do not commit until the required gate passes.

Headings now appear before responses. Two Finance tests used headings as request-completion signals. They now wait for the returned figure or action. The empty Facilities schedule keeps its controls and uses the single Facility details action. The corresponding create-resource test now uses this action.

## Decision Log

Use a shared loading context only for organization data refreshes. Each data section combines that state with its own request state. Keep filters outside data regions. Keep stat labels visible and replace only unknown values. Do not insert fabricated totals while a request is pending. Date navigation and calendar time headers stay visible while resource rows load.

## Outcomes & Retrospective

The first affected run passed 111 tests. Four failures came from three outdated expectations and an incorrect test-file extension in the command. The corrected rerun passed 81 tests in seven suites. The final page and Reviews checks passed 11 tests in two suites. A later TypeScript check found a missing Alert import in the refresh error notice. The import is fixed, and the final TypeScript check passes. The changed-file gate still reports 132 complexity errors and 21 warnings across the broader worktree. No API, database, or mobile contract changed.

The UI skill's search script is not installed. Its written checklist was used to check loading labels, keyboard focus, semantic color tokens, and reduced motion. Prisma validation and client generation passed. The first build could not fetch Google Fonts through the sandbox. The same release build passed with network access. Its full TypeScript phase took 23 minutes. All 127 static pages generated. No database migration or remote deployment was done.

The local production preview runs at http://localhost:3000 with `npm run start -- --port 3000`. The Codex browser checked all 14 visible organization tabs. Customers retained Search text after Refresh. Finance retained an unsaved pay-run title after Refresh. Both test values were cleared without saving records. No new browser console errors were recorded. The Events tab is left open for the user. Local responses finished before the browser snapshots could capture placeholders. Deferred-request tests verify those pending states. The new loading primitives, calendar loading rows, and Reviews view pass their focused complexity check. The full worktree complexity gate still fails, so this work is not committed and issue 123 is not closed.

The first server launch reported a port conflict. The earlier PowerShell stop had failed, and process 42000 still served the updated client files. That verified old process was then stopped with taskkill. The new server reported production mode and readiness on port 3000. A full browser reload and further Events, Customers, and Facilities checks passed on the fresh server. No new console errors appeared.

## Context and Orientation

`apps/site/src/app/organizations/[id]/page.tsx` owns tab selection and organization requests. `apps/site/src/components/organization/OrganizationManagementShell.tsx` owns shared identity and navigation. The tab components and their panels own the lists, controls, and additional requests. `OrganizationTabLayout.tsx` contains the shared headings and stat strip. Reusable loading primitives will live beside it in `OrganizationDataLoading.tsx`.

## Plan of Work

First, keep the shell children mounted and remove timer-based loading. Provide the organization refresh state to data regions. Then update card lists, tables, review summaries, finance data, and calendar rows. Preserve control nodes across request transitions. Keep local fetch errors visible beside the same controls. Finish with regression tests that edit filters during a deferred request and verify the filtered result after it resolves.

## Concrete Steps

Run site commands from `apps/site`. Run the affected Jest suites with `npx jest --runInBand --runTestsByPath`. Run `npx tsc --noEmit` and `npm run lint:changed`. Run `git diff --check` from the repository root. Use only the Codex in-app browser for browser checks. Source edits need a production rebuild before runtime validation. The current preview contains this change.

## Validation and Acceptance

With a delayed data request, a user can still read the tab heading, type in Search, change local filters, and see the actions. The request shows card or row placeholders and unknown summary values. When it completes, only the data sections change. Filter values, focus, and open menus survive. The calendar keeps its date controls and horizontal time headers. An error does not remove the controls or present a false empty result.

## Idempotence and Recovery

Do not discard unrelated worktree edits. Do not change runtime state without the required authorization. The edits are local and can be adjusted without data migration. Record incomplete checks accurately.

## Artifacts and Notes

Issue 123 remains open. This change refines the existing reference layouts. The generated images in `docs/images` remain the visual source.

The later closeout pass is recorded in `organization-operations-closeout-execplan.md`. It adds a shared loading hook, request-order guards, visible refresh errors, event-cache coverage metadata, and calendar movement fixes. These later source edits have not been rebuilt or relaunched. The earlier production-preview results above apply to the earlier build.

## Interfaces and Dependencies

The shared loading context carries one boolean. Data regions accept a loading label, a placeholder layout, and children. Table row placeholders use valid table markup. Loading values retain their surrounding labels. Placeholders use existing color and radius tokens and respect reduced motion.
