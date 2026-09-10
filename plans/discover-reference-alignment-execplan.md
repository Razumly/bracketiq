# Align Discover events with the organization event surface

This ExecPlan is a living document. Maintain `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` in accordance with `PLANS.md`.

## Purpose / Big Picture

Users will see the Discover Events tab with the same BracketIQ-owned event controls, card treatment, and responsive grid used by organization event management. The page will keep its current search, URL, filtering, sorting, pagination, map, loading, empty, error, and event-opening behavior. A user can search events, choose a location, open the map, create an event, adjust sports and division filters, sort results, and use the same controls on a phone without horizontal overflow.

The visible result is checked at `/discover` against the approved references in `docs/images/site-ui/discovery-list/`. The implementation must use owned primitives instead of Mantine imports in the Discover event surface.

## Progress

- [x] (2026-09-10 04:09Z) Read the repository, site, plan, UI, and frontend design guidance.
- [x] (2026-09-10 04:09Z) Read the approved Discover references and the current Discover and organization event implementations.
- [x] (2026-09-10 04:49Z) Extracted shared organization event controls and filter panel primitives for Discover.
- [x] (2026-09-10 04:49Z) Aligned the Discover event toolbar, filters, event cards, and result grid.
- [x] (2026-09-10 04:52Z) Preserved focused behavior and accessibility coverage.
- [x] (2026-09-10 04:55Z) Ran focused validation and compared the approved desktop evidence with the responsive source layout.
- [x] (2026-09-10 04:55Z) Recorded final outcomes, gaps, and verification evidence.

## Surprises & Discoveries

- Observation: `OrganizationEventsTabContent` already uses the owned operation primitives, `OrganizationEventCard`, and `.org-event-grid`.
  Evidence: `apps/site/src/app/organizations/[id]/OrganizationEventsTabContent.tsx` imports `organization-operation-ui` and renders `OrganizationEventCard` in `org-event-grid`.
- Observation: Discover currently renders a separate search control, a desktop left filter rail, `ResponsiveCardGrid`, and the older `EventCard`.
  Evidence: `apps/site/src/app/discover/components/EventsTabContent.tsx` renders the sidebar at its final grid and `EventCard` at the card loop.
- Observation: `LocationSearch` is a transitive Discover dependency with Mantine and Material UI imports.
  Evidence: `apps/site/src/components/location/LocationSearch.tsx` imports both libraries.
- Observation: No language server is configured for this worktree, so symbol references must use repository search and focused validation.
  Evidence: all four attempted LSP reference requests returned `No language server found for this action`.

## Decision Log

- Decision: Keep the Discover data and URL state in `apps/site/src/app/discover/page.tsx` and change only the presentation seam plus shared control/card modules.
  Rationale: the request changes alignment, not the HTTP contract or data model. This avoids breaking pagination, URL synchronization, or map behavior.
  Date/Author: 2026-09-10 / Codex.
- Decision: Reuse `OrganizationEventCard` and `.org-event-grid` for Discover results rather than restyling a second card implementation.
  Rationale: the organization event surface is the stated reference setup and already owns the requested responsive three-column event layout.
  Date/Author: 2026-09-10 / Codex.
- Decision: Extract only presentation primitives that can accept Discover-only filters such as tags and division filters.
  Rationale: organization event management does not have every Discover filter. A small shared seam avoids duplicating the common search, date, sports, sort, reset, and mobile behavior while preserving those extra filters.
  Date/Author: 2026-09-10 / Codex.
- Decision: Do not change the global navigation or backend routes in this task.
  Rationale: the user requested Discover alignment and reuse of the organization event setup. Global shell changes would affect unrelated surfaces and do not change the event filter contract.
  Date/Author: 2026-09-10 / Codex.
- Decision: Do not restart the existing local production server during implementation.
  Rationale: repository rules require a current explicit request for a runtime state change. Build and focused tests can validate source changes; live browser comparison requires a later explicit server restart authorization.
  Date/Author: 2026-09-10 / Codex.

## Outcomes & Retrospective

- Added the shared `EventFilterControls` module. The organization event list now imports its common controls and active-filter rendering from that module.
- Discover events now use one owned search and action shell, shared sports/date/event-type controls, Discover tag and division controls, `OrganizationEventCard`, and `.org-event-grid`.
- `LocationSearch` now uses BracketIQ-owned primitives. Its location request, prediction, selection, failure, and clear behavior remain intact.
- Focused validation passed: 4 suites and 18 tests. The site type check passed. The production build passed with the local `DATABASE_URL` validation value.
- The shared date trigger is explicitly controlled and keyboard/click activation opens its date inputs. `OrganizationEventCard` uses the next occurrence and its time zone for recurring-event date and status display.
- The full suite ran 882 suites. 371 suites and 2,664 tests passed. 511 suites and 36 tests failed during shared setup with `ReferenceError: MouseEvent is not defined` at `test/setupTests.ts:21`.
- Live browser comparison was not performed. The existing local production server cannot be restarted without explicit runtime authorization. Static reference review and rendered component smoke tests were used instead.

## Context and Orientation

`apps/site` is the Next.js site. The Discover route is a client-rendered page in `apps/site/src/app/discover/page.tsx`. It owns event fetching, debounce, URL synchronization, location state, pagination, and map state. `apps/site/src/app/discover/components/EventsTabContent.tsx` owns event filtering, local filtering of cached results, sorting, filter states, and event result rendering.

`apps/site/src/app/organizations/[id]/OrganizationEventsTabContent.tsx` is the organization event-list setup that this task reuses. It uses owned controls from `apps/site/src/components/organization/organization-operation-ui.tsx`, renders `OrganizationEventCard` from `apps/site/src/components/organization/OrganizationEventCard.tsx`, and relies on `.org-event-grid` and `.org-event-card` in `apps/site/src/app/organization-reference.css`.

`apps/site/src/app/discover/components/DivisionDiscoveryFilters.tsx` supplies Discover gender, age group, skill level, and price inputs. `apps/site/src/components/events/event-list-filtering.ts` is the shared local-cache filtering logic and must remain the behavior source. `apps/site/src/components/location/LocationSearch.tsx` supplies location selection and is used by the Discover search toolbar.

The approved references are in `docs/images/site-ui/discovery-list/`. The event desktop reference shows a dark shell, Discover tabs, one search/location/map/create toolbar, sport shortcuts, compact filter controls, a result count and sort control, and a three-column event-card grid. The mobile reference requires a one-column layout with accessible filter controls and no horizontal overflow. Issue #121 requires preserving search, filters, sorting, pagination, URL state, retry, saved actions where present, API contracts, and permissions.

## Context Boundary

Minimum sources:

- `AGENTS.md` and `apps/site/AGENTS.md` for repository and site rules.
- `PLANS.md` for this living-plan format.
- `issue://121` for the Discover acceptance criteria.
- `docs/images/site-ui/discovery-list/` for approved visual references.
- `apps/site/src/app/discover/page.tsx` for state, URL, fetch, and composition contracts.
- `apps/site/src/app/discover/components/EventsTabContent.tsx` for Discover event filtering and result states.
- `apps/site/src/app/discover/components/DiscoverSearchControls.tsx` for the existing search/location seam.
- `apps/site/src/app/discover/components/DivisionDiscoveryFilters.tsx` for Discover division and price controls.
- `apps/site/src/app/organizations/[id]/OrganizationEventsTabContent.tsx` for the reusable organization event setup.
- `apps/site/src/components/organization/OrganizationEventCard.tsx` and `apps/site/src/app/organization-reference.css` for the reusable card and grid.
- `apps/site/src/components/organization/organization-operation-ui.tsx` for owned controls.
- `apps/site/src/components/events/event-list-filtering.ts` for shared filtering behavior.
- focused Discover, organization event, location, and event-card tests before changing their contracts.

Expand the boundary only if an edit changes a symbol with callers not covered by the listed files, if a focused test exposes a contract outside these modules, or if browser comparison shows a shared-shell issue that cannot be isolated to Discover.

## Plan of Work

First extract the common organization event controls into a reusable event-list presentation module. The shared module will expose stable sort options and typed controls for search, sports, event types, date range, distance, weekly-child visibility, reset, active filters, and mobile presentation. Discover will compose its tag and division controls around that common seam. Keep the organization page behavior unchanged by replacing its local common controls with the shared exports.

Next update `DiscoverSearchControls` to use the owned operation primitives and to support the single Discover toolbar layout. Keep the existing form submit callback and location hook behavior. Add an optional create-event action so the event tab can place Map and Create event beside search and location while organizations, rentals, and teams keep their current action set.

Then update `EventsTabContent` to compose the shared controls, the Discover-specific division and tag controls, and the organization event card/grid. Keep `useEventListFiltering`, sort order, active-filter removal, reset behavior, infinite-scroll sentinel, retry, no-results, and end-of-results branches. Put the desktop filters in the inline toolbar style and use the shared mobile filter presentation. Keep event click analytics before the existing callback.

Finally migrate `LocationSearch` from Mantine and Material UI to the owned operation primitives. Keep its current location service calls, current-location request, prediction behavior, clear behavior, and open/close semantics. Update focused tests only where the rendered primitive contract changes. Add or adjust behavior tests for filter removal/reset, mobile filter access, sort behavior, location search, and event opening. Do not add style snapshot tests.

## Concrete Steps

Run all commands from `apps/site` unless a command names a repository-root file.

1. Re-read each file immediately before editing it and use the current line anchors. Search all callers of any renamed or exported component because no language server is available.
2. Create or update the shared event-list control module under `apps/site/src/components/events/` using the existing organization operation primitives. Keep its props typed around common event filters.
3. Replace local common control definitions in `OrganizationEventsTabContent.tsx` with imports from the shared module. Preserve its event segments and organization-specific heading/results states.
4. Extend `DiscoverSearchControls.tsx` with optional map and create-event actions while retaining its form submit behavior and accessible labels.
5. Update `EventsTabContent.tsx` to use the shared controls and `OrganizationEventCard` with the `.org-event-grid` layout. Preserve all existing filtering and loading/error branches.
6. Migrate `LocationSearch.tsx` to owned primitives without changing its location service behavior.
7. Run focused tests from `apps/site`, for example:

       npm test -- --runInBand src/app/discover/components/__tests__/EventsTabContent.test.tsx src/app/discover/__tests__/page.test.tsx src/components/location/__tests__/LocationSearch.test.tsx src/app/organizations/[id]/__tests__/OrganizationEventsTabContent.test.tsx

   Interpret a passing result as proof that filtering, URL-driven loading, organization controls, retry, mobile filter access, and location selection still work. If the repository test script uses a different Jest argument form, use the existing script documented in `apps/site/package.json`.
8. Run the site type check and production build from `apps/site` using the existing package scripts. Expect no TypeScript errors and a successful Next.js build. Do not restart a runtime in this task.
9. If a current explicit runtime-start instruction is provided later, start the local site with the isolated database and local storage variables already used by this worktree, open `/discover` at desktop and mobile widths, and compare the rendered toolbar, cards, states, and overflow against the approved references. Until then, record that live comparison is not performed because the existing production process cannot be restarted under the repository rules.

## Validation and Acceptance

The source-level acceptance is that Discover events render one owned event toolbar, the organization event-card component, and the organization three-column grid on desktop, with a one-column mobile layout. Search submission still invokes the existing page callback. Changing a sport, date, event type, tag, division, price, distance, or weekly-child setting still changes the visible cached results and active filter removal clears only that filter. Reset clears all Discover event filters. Sorting still changes cached result order without an unnecessary fetch. The sentinel still requests the next page. Error, empty, refreshing, loading, and end-of-results states remain reachable and retain retry and clear-filter actions.

Accessibility acceptance is that every control has an accessible name, filter popovers/sheets can be opened and closed by keyboard, focus-visible styles remain present, buttons meet the existing minimum touch-size classes, text can zoom without horizontal overflow, and reduced-motion users do not receive required animated feedback. Location selection still opens from Set Location, submits a ZIP or place search, stays open when resolution fails, and can clear the selected location.

Behavior proof consists of focused tests for the contracts above, a clean site type check, and a successful production build. Visual browser proof is required when a current runtime restart is explicitly authorized. No visual style snapshots are required.

## Idempotence and Recovery

The edits are additive and safe to repeat. Re-read files after each edit because line anchors and hashes change. If a focused test fails, restore the smallest changed component contract and rerun only that test before continuing. Do not modify the database, storage objects, production services, or backend API routes. Do not restart or reconfigure the existing runtime without a current explicit authorization.

## Artifacts and Notes

The primary artifact is the source change under `apps/site/src/`. The living implementation record is this file. Keep verification evidence concise, such as focused test pass counts, type-check output, build success, and any authorized desktop/mobile browser observations.

## Interfaces and Dependencies

The shared event controls must use `@/components/organization/organization-operation-ui` for buttons, text inputs, selects, multiselects, date inputs, papers, and layout. They may use `@/components/ui/sheet` for the mobile filter sheet and `DivisionDiscoveryFilters` for Discover-only division filters.

The Discover event component must continue to accept the current `EventsTabContentProps` contract from `apps/site/src/app/discover/page.tsx`, including `onSearchSubmit`, `onOpenMap`, `onCreateEvent`, event cache metadata, `sentinelRef`, and all event filter setters. The organization event component must continue to accept its current props from `apps/site/src/app/organizations/[id]/page.tsx`.

The event result card interface remains `OrganizationEventCard({ event, onClick })`. The event data source remains `eventService.getEventsPage`; no HTTP request or response field changes are allowed. The shared local filtering interface remains `useEventListFiltering` and `eventListFilterKey` from `apps/site/src/components/events/event-list-filtering.ts`.

Revision note (2026-09-10 04:09Z): Created this plan after confirming the approved Discover references, the current Discover composition, the organization event setup, and the absence of a configured language server. The plan chooses a shared presentation seam and defers live browser comparison until runtime restart is explicitly authorized.

Revision note (2026-09-10 04:49Z): Added `components/events/EventFilterControls.tsx` as the shared event filter seam. Discover now uses the organization event card and grid, places search, location, map, create, sports, and common filters in the shared composition, and migrates `LocationSearch` to owned primitives. Focused tests and TypeScript checks pass. Live browser comparison remains unavailable because the existing server must not be restarted without explicit authorization.

Revision note (2026-09-10 04:55Z): Focused tests, typechecking, and the production build passed. The full suite exposed a shared `MouseEvent` setup failure in 511 suites; no Discover test failed in that run's reported failures. Live browser comparison remains unavailable under the runtime-state rule.
Revision note (2026-09-10 05:02Z): Code review found and fixed the controlled Dates trigger and recurring-event card schedule regression. Shared filter props were also composed once in Discover. Focused validation now passes 4 suites and 18 tests.

Revision note (2026-09-10 05:09Z): Final review also identified a non-blocking prop-clump smell. The compact desktop control now picks only the filter fields it reads from the shared panel props.

Revision note (2026-09-10 05:12Z): Final review found that shared card tokens were scoped only to organization ancestors. Added `.discover-shell` to that token scope so Discover card borders, accents, and keyboard focus outlines resolve.

Revision note (2026-09-10 05:16Z): Final review found two location-picker accessibility and reflow gaps. The Discover location dropdown now aligns to the action group's safe edge, and Escape returns focus to the Set Location trigger.

Revision note (2026-09-10 05:18Z): The mobile reflow review required a separate edge rule because the owned Popover root is the trigger-sized containing block. Mobile location popovers now use the left edge of the first full-width action item; the width cap keeps the panel inside the viewport.
