# Customer list and detail workspace

This plan follows root PLANS.md. Keep the progress and outcomes current.

## Purpose

Give customer details enough space without losing customer navigation. Open Customers with the full table. After selection, show a 280-pixel list with name, avatar, and User or Team. Use the remaining space for the selected customer. On small screens, show only the details and a Back button.

## Context Boundary

Limit changes to apps/site/src/app/organizations/[id]/OrganizationCustomersTabContent.tsx, OrganizationCustomerDetailPanel.tsx, the customer rendering functions in page.tsx, a new OrganizationCustomerProfile.tsx, their tests, and apps/site/src/app/organization-reference.css. Read OrganizationCustomerBills.tsx, OrganizationCustomerDocuments.tsx, and organizationCustomerModel.ts to preserve existing behavior. Expand only if these interfaces require it. Do not change API, database, mobile, or scheduling behavior.

## Progress

- [x] Read the existing customer list, detail rendering, permissions, and tests.
- [x] Add compact selection layout and Back navigation.
- [x] Add Overview, Teams/Roster, Events, Billing, and Documents tabs.
- [x] Run focused tests: five customer suites pass, with 11 tests. Customer component lint passes.
- [x] Complete production compilation and its TypeScript check. Compilation passed in 5.4 minutes. TypeScript passed in 24 minutes. All 127 static pages generated. The standalone check was stopped to avoid duplicate work.
- [x] Check desktop at 1280 by 900 and mobile at 390 by 844 in the Codex browser. Confirm user and team details, tab switching, roster, billing, documents, retained search, and Back navigation. Mobile has no page-width overflow. Browser warnings and errors are empty.

## Decision Log

The user approved a narrow list based on Salesforce and grouped detail content based on Attio on 2026-09-07. Preserve BracketIQ colors, small radii, and the no-eyebrow rule. Keep the list DOM mounted to retain list scroll. Keep filters in the existing parent state. Stop selecting the first customer automatically. Reuse existing bill and document controls and permissions. Reset the detail tab to Overview when a different customer is selected.

## Surprises & Discoveries

The existing page automatically selected the first result. This prevented an initial full-list state. The detail panel also had a fixed maximum scroll height and only 320 pixels of width. Remove that nested detail scroll limit.

## Plan of Work

First keep the full table mounted and change its visible columns when a selection exists. Add Back navigation that clears the selection path without clearing filters. Then add a small tab component with arrow-key navigation. Put existing content and authorized actions in the correct tab. Team billing and documents retain player context. Finally run the customer tests and TypeScript. Check the rendered page at desktop and mobile widths.

## Concrete Steps and Validation

Run commands from apps/site. Run npx jest --runInBand --runTestsByPath with the OrganizationCustomersTabContent and OrganizationCustomerProfile test paths under src/app/organizations/[id]/__tests__. Run the existing OrganizationCustomerBills and OrganizationCustomerDocuments suites. Run npx tsc --noEmit. Run ESLint for changed customer files.

In the browser, open /organizations/org_1/customers. Search for a customer. Select it. Confirm the compact list and wider detail view. Change each detail tab. Select another customer and confirm Overview is active. Use Back and confirm the filter and list position remain. At 390 pixels, confirm the list is hidden during detail viewing and Back returns to it. Do not restart a runtime without current user authorization.

## Interfaces and Dependencies

OrganizationCustomersTabContent receives onCustomerClose in addition to its existing controlled selection. OrganizationCustomerProfile receives a header, Teams or Roster label, and a renderContent callback keyed by CustomerDetailTab. Existing summaries, permission checks, billing actions, and document actions remain unchanged. There are no new libraries or HTTP contracts.

## Idempotence and Recovery

Tests do not write database data. Preserve all prior worktree edits. Do not discard files to undo this slice. Revert only the customer-layout hunks if recovery is necessary.

## Outcomes & Retrospective

The layout and detail tabs are implemented and verified. Production preview runs on port 3155 with process 6228. Its build ID is ihES801yGRFun1qybBwnC. The output is apps/site/.cache/issue123-customers-v1. The temporary launcher is C:/Users/samue/AppData/Local/Temp/issue123-customers-production.cjs. It uses only the local bracketiq_e2e_155_samue database. No environment files or database records changed. The temporary next.config.mjs output hook and generated tsconfig include paths were removed after server startup. Add the same temporary output hook before a future restart with this launcher. No issue closure or broad worktree commit occurred.

The browser initially opened before the server was ready. A later tab loaded correctly after the server reported ready and /api/sports returned 200. The final tab has no console warnings or errors. The checked flow used keyboard activation. Jest also covers click activation. Provider-backed document uploads and financial writes were not performed.

## Revision Note

Created on 2026-09-07 for the user-approved customer workspace change.
