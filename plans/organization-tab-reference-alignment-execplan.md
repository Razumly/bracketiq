# Align organization tabs with generated references

This ExecPlan is a living document. Maintain it in accordance with `PLANS.md`.

## Purpose / Big Picture

The organization management tabs must match the generated BracketIQ reference images. The references are checked into `docs/images`. They are the design source for this work. User screenshots are not design sources.

The work will proceed one tab at a time. Each completed tab must preserve its current data and actions while matching the reference layout, colors, spacing, responsive behavior, and loading state. The shared shell and Overview are implemented. The user has requested completion of the remaining tabs. Continue through each milestone without a separate approval stop.

## Progress

- [x] (2026-09-04) Read repository, site, and UI implementation instructions.
- [x] (2026-09-04) Inventory the generated organization reference assets in `docs/images`.
- [x] (2026-09-04) Align the shared organization shell with the generated header and navigation.
- [x] (2026-09-04) Align the Overview tab on desktop and mobile.
- [x] (2026-09-04) Add Overview regression coverage.
- [x] (2026-09-04) Run focused tests, type checking, lint, and a production build.
- [x] (2026-09-04) User requested completion of the remaining tabs.
- [x] (2026-09-04) Implement shared spacing, typography, grid, and button variant fixes. Check production CSS in the final browser pass.
- [x] (2026-09-04) Implement the Reviews summary, feed, filters, and detail cards.
- [x] (2026-09-04) Implement the Events toolbar and compact image cards. Keep the local event cache.
- [x] (2026-09-04) Implement Teams summary counts, local filters, and compact roster cards.
- [x] (2026-09-04) Implement Customers summary counts, horizontal filters, table, and detail panel.
- [x] (2026-09-04) Implement Facilities summary counts, horizontal controls, resource timeline, and detail cards.
- [x] (2026-09-04) Implement Event Templates cards and the Document Templates table with a detail panel.
- [x] (2026-09-04) Implement Staff, Discounts, Finance, and Refunds compositions. Keep existing action handlers.
- [x] (2026-09-04) Implement Public Page settings with a draft preview. Implement Store counts, filters, and product creation dialog.
- [x] (2026-09-04) Run TypeScript and the affected workflow tests. All selected suites passed after the test updates.
- [x] (2026-09-05) Apply the user-approved complexity policy and pass the changed-file gate with no errors. JSX and TSX complexity above 20 is advisory. Keep other rules active. See the closeout plan for current test and review evidence.
- [x] (2026-09-04) User approved the local production rebuild, restart, and Codex browser checks.
- [x] (2026-09-04) Build the production app and check every tab route in the Codex in-app browser at desktop and mobile widths.
- [x] (2026-09-04) Refine Facilities after review. Use natural calendar height, one details action, colored layer filters, a right-side create palette, larger resize edges, and an in-calendar drag preview.

## Surprises & Discoveries

- Shared controls used dynamic Tailwind class names that production extraction could miss. Numeric font-weight class names were invalid. Static class maps now control spacing and grids. Inline styles now control numeric font weights and table text alignment.
- The shared button did not map `ghost` or `default`. These variants became filled buttons. The mapping now preserves neutral secondary actions.
- Input layout styles were applied to inputs instead of their field containers. The field containers now receive these styles.
- The Windows lint command tried to spawn `eslint.cmd` directly and failed with EINVAL. The launcher now uses Node to execute `eslint.js`.
- The strict complexity check reports more than 100 violations across the touched controllers and shared controls. Many existed before this pass. The gate remains required. No commit or issue closure is complete.
- The Finance response has revenue and cost data but no available payout balance, bank account details, or prior-period comparison. The dashboard uses only returned values. Revenue is grouped by service date, not an invented payment date.
- No dedicated generated reference exists for Discounts or Store. On 2026-09-05, the user explicitly approved an exception to the dedicated-image requirement. Review these tabs against the approved shared controls and layout rules. Behavior, accessibility, and visual checks remain required.
- The Public Page preview shows draft branding and text. It is not a full preview of the public event, team, or rental data. The saved public page link remains available.
- The user requires the Codex in-app browser. Do not open Chrome. The Codex browser can sign in with the local test account and open `/organizations/org_1`. It currently shows the previous production build.
- The current organization shell uses the correct general hierarchy but its cover area is taller than the generated reference, its sport values are pills instead of icon-labelled values, and its mobile section control does not show the reference description.
- The current Overview content uses generic event and team cards. The generated Overview reference uses an event list, compact team cards, summary metrics, and stacked detail cards.
- The first production browser pass found that the mobile organization name overlapped the logo. The shared identity row now stacks on narrow screens.
- The imported preview event references local event and organization file records without usable images. The organization event card now tries the normal event source, the organization or host fallback, and then a generated local initials image.
- The local initials endpoint returns SVG. The event card must load already-sized local preview endpoints directly because the Next.js image optimizer rejects the SVG fallback.
- The organization API type does not expose a dedicated email or phone field. The Overview layout must render only data that exists, or provide a neutral unavailable state. It must not invent contact data.
- The shared `Button` uses an accessible name from all visible children. The mobile section selector now sets its tab label as the accessible name and keeps the descriptive line visible.

## Decision Log

- Decision: Use only checked-in generated images under `docs/images/site-ui` as visual references for this work. Rationale: the user identified these assets as the intended source of truth. Date/Author: 2026-09-04, Codex.
- Decision: Complete the Overview tab first and stop for review. Rationale: the user requested one tab at a time, and Overview establishes the shared shell used by every later tab. Date/Author: 2026-09-04, Codex.
- Decision: Keep business actions in `src/app/organizations/[id]/page.tsx` and place the visual Overview composition in a focused component. Rationale: the page owns organization loading and mutations, while a focused component makes visual iteration safer. Date/Author: 2026-09-04, Codex.
- Decision: Use CSS tokens and existing Lucide icons. Rationale: the repository already uses these systems and the generated references require consistent vector icons and compact radiuses. Date/Author: 2026-09-04, Codex.
- Decision: Remove the organization cover image and use a compact white identity header. Rationale: the user explicitly replaced the generated cover treatment with a consistent white surface. Date/Author: 2026-09-04, Codex.

## Outcomes & Retrospective

Current pass: The remaining tab compositions are implemented. The production browser pass loaded all 14 tab routes at desktop width. The mobile pass found no page-level horizontal overflow across the tab routes. The Facilities pass confirmed 7 horizontal date headers, 49 horizontal time slots, and vertical resource rows. The final header check placed the desktop name below the cover and the mobile name 20 pixels below the logo. The ownership eyebrow is absent. The preview event image loads at 640 by 240. TypeScript and the production build passed. Focused suites passed for Events, Teams, Customers, Reviews, Staff, Store, Public Page, Finance, Event Templates, Document Templates, Refunds, shared filters, the resource calendar, and Facilities workflows. The final Facilities and refund-filter run passed 45 tests. Shared popover tests cover outside-click and Escape dismissal. The revenue test checks date grouping and excludes refunds from the trend. The refund test checks local filters and blocks approval without a valid payment preview.

The user approved the local production rebuild and restart. The first build could not fetch the configured Google Fonts because network access was restricted. The network-enabled retry compiled successfully. The remaining build stages and visual checks are in progress. The old local server on port 3000 was stopped. Keep issue 123 open.

The first milestone is complete. The shared organization shell now uses a shorter cover, a larger overlapping logo, icon-labelled sports, and a mobile section selector with the generated description. The Overview tab now uses the generated event list, compact team cards, mobile At a glance metrics, and stacked desktop detail cards.

The existing actions remain available. These include event selection, navigation to Events, navigation to Teams, navigation to Reviews, organization sharing, organization editing, event creation, and payment verification actions. The component renders only available organization contact fields.

Validation passed on 2026-09-04:

- Focused Jest tests passed: 7 tests in 2 suites.
- TypeScript passed with `npx tsc --noEmit`.
- ESLint passed with no errors. It reports two existing hook-dependency warnings in `page.tsx`.
- The production build passed. Next.js generated 127 static pages.

The user has requested continued implementation. The broader facilities page composition and the other tab-specific layouts are now active milestones.

## Context and Orientation

`apps/site/src/app/organizations/[id]/page.tsx` loads organization data, owns the active tab, and currently renders the Overview content inline. It passes the organization and navigation actions to `OrganizationManagementShell`.

`apps/site/src/components/organization/OrganizationManagementShell.tsx` renders the organization cover, logo, name, sport values, actions, and desktop or mobile section navigation. All organization tabs use this shell.

The generated Overview references are:

    docs/images/site-ui/management-shell/organization-overview--default--desktop-1536x1024.png
    docs/images/site-ui/management-shell/organization-overview--default--mobile-852x1846.png

The generated Overview reference shows a dark global header, a short organization cover image, a large overlapping logo, the organization name with location and sport values, two tab rows on desktop, a compact section selector on mobile, an Overview heading, a Create event action, an About card, an Upcoming events list, an At a glance metric card on mobile, a Teams section, and right-side organization detail cards on desktop.

The current shell must not add eyebrow text. Small descriptive text inside controls is allowed when it matches the generated reference and does not sit above an entity name.

## Plan of Work

First, update `OrganizationManagementShell.tsx` so the shared cover height, logo overlap, sport presentation, action layout, and mobile section selector match the generated Overview reference. Keep all existing tab values, permission checks, callbacks, loading states, error states, and empty states.

Next, add `OrganizationOverviewTabContent.tsx` under `apps/site/src/app/organizations/[id]/`. Move the Overview markup out of `page.tsx` and pass the existing organization, recent events, teams, review navigation callback, events navigation callback, team navigation callback, event click callback, and create event callback. Render compact list rows for events and compact team cards. Render only available organization fields. Keep the existing review summary component as the data boundary unless a later visual change requires a small summary prop interface.

Then, add component-scoped classes in `apps/site/src/app/globals.css`. Use the existing BracketIQ color tokens, spacing rhythm, and reduced radius tokens. Keep the desktop grid within the page width. Let mobile content flow vertically without page-level horizontal overflow.

Finally, add tests for the Overview event list, team summary, create event action, responsive section control, and existing navigation behavior. Run the focused tests, type checking, lint, and the production build. Do not restart a runtime unless the user gives a current explicit restart request.

## Concrete Steps

Run site commands from `apps/site`.

    npx jest --runInBand --runTestsByPath "src/app/organizations/[id]/__tests__/page.test.tsx" "src/components/organization/__tests__/OrganizationManagementShell.test.tsx"
    npx tsc --noEmit
    npx eslint "src/app/organizations/[id]/OrganizationOverviewTabContent.tsx" "src/app/organizations/[id]/page.tsx" "src/components/organization/OrganizationManagementShell.tsx"
    npm run build

Use `git diff --check` from the repository root after the edits. A successful milestone has no whitespace errors, no TypeScript errors, no ESLint errors, passing focused tests, and a successful production build.

## Validation and Acceptance

After the milestone, a desktop user can open an organization and see a short cover, the overlapping logo, the organization name, location, sport values, two navigation rows, and the Overview content in the same hierarchy as the generated desktop image.

On a narrow viewport, the user can see the compact organization section control, About content, Upcoming events, At a glance metrics, and Teams in a vertical flow. The page does not gain horizontal overflow outside a component that explicitly needs it.

The Overview keeps the Create event action, event selection, View all events navigation, View all teams navigation, edit action, share action, and review navigation. Loading, error, permission, and empty states remain available. No eyebrow text appears.

## Idempotence and Recovery

The edits are additive and safe to repeat. Do not reset or discard existing worktree changes. If a visual component test fails because it expects the old inline markup, update the test to assert the user-visible result through the new component boundary. Do not replace real data with hard-coded reference content.

## Artifacts and Notes

The visual sources for the first milestone are:

    docs/images/site-ui/management-shell/organization-overview--default--desktop-1536x1024.png
    docs/images/site-ui/management-shell/organization-overview--default--mobile-852x1846.png

The broader sequence uses these generated references for later milestones:

    docs/images/site-ui/data-management/organization-reviews--default--desktop-1536x1024.png
    docs/images/site-ui/data-management/organization-events--default--desktop-1536x1024.png
    docs/images/site-ui/data-management/organization-events--default--mobile-853x1844.png
    docs/images/site-ui/data-management/organization-teams--default--desktop-1536x1024.png
    docs/images/site-ui/data-management/organization-customers--default--desktop-1536x1024.png
    docs/images/site-ui/data-management/organization-facilities--default--desktop-1536x1024.png

## Interfaces and Dependencies

The Overview component should accept typed `Organization`, `Event[]`, and `Team[]` values plus narrow callback props. It should use existing `Event`, `TeamCard`, and review components where they preserve the generated information hierarchy. It must not import server modules or Prisma types.

## Change Notes

2026-09-04: Created this plan after the user selected the generated `docs/images` assets as the design source and requested one-tab-at-a-time alignment.
2026-09-04: Completed the shared shell and Overview milestone. Added `OrganizationOverviewTabContent`, generated-reference styling, and focused tests. The plan now stops for user review before the next tab.
2026-09-04: The user requested completion of the remaining tabs. Continue through all tab milestones. Fix shared controls whose dynamic class names are absent from production CSS before changing each composition.
2026-09-04: Implemented the remaining tab compositions. Preserved real data and mutation handlers. Fixed the Windows lint launcher. Recorded the remaining complexity violations. Prepared the Codex browser with the local test account. Production browser verification is still pending approval to rebuild and restart the local server.
2026-09-04: Ran the first production browser pass in the Codex in-app browser. Loaded every tab route at 1536 by 1024 and checked narrow layouts at 375 by 812. Fixed the shared mobile identity overlap and removed the ownership eyebrow from the header. Added a three-stage event-image fallback because both imported file records were missing. Bypassed image optimization for the already-sized local preview endpoints so the final SVG fallback can render. The final production rebuild and browser confirmation are in progress.
2026-09-04: Completed the final production browser confirmation. The direct event preview endpoint returned a valid 640 by 240 image. Facilities rendered the reference axis orientation. Desktop and mobile headers no longer overlap. Left the production server running on port 3000 and the Facilities tab open in the Codex in-app browser.
2026-09-04: Removed the shared organization cover image and decorative fallback. The organization logo, name, metadata, and actions now use one compact white identity header on every organization tab.
2026-09-04: Added a readable 44-pixel minimum time-label scale to the Facilities timeline. Added bounded local zoom for Control plus wheel and Control plus or minus. Normal wheel input remains available for page and timeline scrolling.
2026-09-04: Refined the Facilities workspace after review. Removed the fixed calendar body height and the three summary cards. Added a clear Back to schedule action. Moved create cards to a readable right column in edit mode. Colored the layer filters so they also act as the legend. Added start and end resize edges and a floating preview for existing calendar entries.
