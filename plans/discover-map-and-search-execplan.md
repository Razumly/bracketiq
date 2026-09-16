# Add Discover Map and Typed Search

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan follows `PLANS.md` in the repository root.

## Purpose / Big Picture

The Discover page always renders the map and result list together. Desktop uses two equal columns. Mobile stacks the map above the list. Page filters stay in one horizontal row. Sport stays in the search bar. The page has no distance filter. The embedded map has no Nearby result rail. The map reports visible result IDs, and the list filters to those IDs. The page first loads an approximate IP location, then offers an exact browser-location action.

## Progress

- [x] (2026-05-14T19:34:28Z) Read the current web discover page, location components, team API, and the mobile map component used as behavioral reference.
- [x] (2026-05-14T19:34:28Z) Committed the previous discover event-search fix separately as `6cf5d47`.
- [x] (2026-05-14T20:06:12Z) Added shared search controls for discover tabs.
- [x] (2026-05-14T20:06:12Z) Added open-registration team search to the teams API and surfaced it in a Teams discover tab.
- [x] (2026-05-14T20:06:12Z) Added a discover map modal with nearby event, organization, and rental markers plus a search-this-area button.
- [x] (2026-05-14T20:06:12Z) Added focused tests for team service and canonical team filtering behavior.
- [x] (2026-05-14T20:52:09Z) Validated with TypeScript, focused Jest tests, lint, diff checks, production build, and rendered browser checks.
- [x] (2026-05-14T21:18:34Z) Removed the page-level search dropdown so each tab search runs against the current tab only while keeping the map modal dropdown.
- [x] (2026-05-14T21:32:18Z) Made the map modal dropdown filter visible markers/results by type and added color-coded event, organization, and rental markers.
- [x] (2026-09-10) Completed the reference-style map layout. Passed `locationInfo` from the discover page to `DiscoverMapModal`.
- [x] (2026-09-10) Confirmed that local data already contains co-located events. No database move or seed occurred.
- [x] (2026-09-10) Passed the focused `DiscoverMapModal` Jest suite (12 tests), `npx tsc --noEmit --pretty false`, and `git -c core.whitespace=cr-at-eol diff --check`.
- [x] (2026-09-10) Copied `.env` and `.env.local` from the sibling `site-ui-operations` worktree. The production build loaded both files, and the user-authorized `site-ui-operations-prod` restart became ready.
- [x] (2026-09-10) Browser-verified the rebuilt page's Maps JavaScript request with the configured key, visible modal tabs, compact chrome, Nearby events rail, selected-event card, and close-to-rail restore. The selected-card summary clamp remained at three lines. The Google Maps canvas still showed `Oops! Something went wrong` with no tiles or markers, so map pixels and markers remain unverified. See `Artifacts and Notes`.
- [x] (2026-09-10, filter-race fix) Committed `a7923e3f6`. A delayed close for the old filter no longer clears the new filter. The fix covers page-level and map-level filter owners.
- [x] (2026-09-10, filter-race rerun) Passed all 14 tests in `DiscoverMapModal.test.tsx`. TypeScript, ESLint for the four touched Discover files, and the CRLF-aware diff check passed.
- [x] (2026-09-10, filter-race rerun) Passed `npm run build`. Restarted the user-authorized `site-ui-operations-prod` runtime. It became ready on port 3001.
- [x] (2026-09-10, filter-race rerun) Verified page-level Dates to Price and Event type to Event tags switching on rebuilt `/discover`. Verified map Tags to Sports switching. Each new filter stayed open while the prior filter closed.
- [x] (2026-09-10, filter-race rerun) Verified map tiles, markers, and the selected-event card in the rebuilt browser. The summary clamp stayed at three lines. This result supersedes the earlier generic Google Maps error. No production deploy occurred.
- [x] (2026-09-10, date and map filter parity) Added a scoped Dates popover overflow rule. The outer date panel no longer clips the nested calendar or acts as its scroll container.
- [x] (2026-09-10, date and map filter parity) Shared filter controls between the page and map. Added active-tab map opening and matching filters for Events, Organizations, Rentals, and Teams. Preserved the filter-race fix in `a7923e3f6`.
- [x] (2026-09-10, date and map filter parity) Added team map results at organization coordinates. Added explicit organization-location labels and team selection actions. Removed the hidden native map category selector.
- [x] (2026-09-10, date and map filter parity) Passed 51/51 focused Jest tests across `DiscoverMapModal.test.tsx`, `EventsTabContent.test.tsx`, and `page.test.tsx`. TypeScript, ESLint, and the CRLF-aware diff check passed.
- [x] (2026-09-10, date and map filter parity) Recorded the browser verification limit. The existing `site-ui-operations-prod` runtime predates these source edits. No restart was authorized for this pass, so browser inspection could not validate this edit. No production deploy occurred.

- [x] (2026-09-10, Discover split redesign) Made the Discover shell full width with an always-visible map and list split. Desktop uses equal columns. Mobile stacks the two regions.
- [x] (2026-09-10, Discover split redesign) Removed the embedded map's Nearby result rail. The map now reports its loaded center, radius, filter key, result IDs, and organization IDs to the page.
- [x] (2026-09-10, Discover split redesign) Scoped Events, Organizations, Rentals, and Teams lists to the current map result set. Rental cards use the same listing IDs as map markers.
- [x] (2026-09-10, Discover split redesign) Replaced page filter overflow buttons with one inline row. Removed Sports from that row and removed page distance controls.
- [x] (2026-09-10, Discover split redesign) Added approximate location loading through `/api/location/approximate`. Added an explicit `Use Exact Location` action for browser permission.
- [x] (2026-09-10, Discover split redesign) Updated focused page, map, shell, event, location, and route tests. The latest focused run passed 7 suites and 87 tests.
- [x] (2026-09-13T23:17:43Z) Refined the Discover search surface into one compact summary that expands over the result content.
- [x] (2026-09-13T23:17:43Z) Moved location entry into the expanded search and kept only Nearby plus recommendations in the location panel.
- [x] (2026-09-13T23:17:43Z) Validated the unified sections, green filter exception, date section clear action, and responsive layout.
- [x] (2026-09-13, search motion follow-up) Replaced the abrupt expanded-panel jump with a shared selector morph, height transition, query fade, and grey backdrop fade. Non-active tabs fade before their containers collapse to zero, and the compact layout keeps the active tab at the left.
- [x] (2026-09-13, shared search control correction) Replaced the separate compact summary with one persistent Where, When, Sport, and Search control row. The same controls now resize between states, keep visible dividers, center the type selector in both states, and expand from the surface background. Open surfaces allow dropdown overflow. Location labels show `Near by` for current and approximate location and `Near [city/state or ZIP]` for manual location.

## Surprises & Discoveries

- Observation: The mobile map uses Google Maps camera bounds and a "search places in bounds" model for place search, but its event search currently loads events from a repository using bounds derived from the current location.
  Evidence: `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap/MapComponent.kt` has `updateCameraBounds(...)`, `searchPlaces(...)`, and `getEvents()`.
- Observation: The web repo already has `@react-google-maps/api`, a shared `GOOGLE_MAPS_SCRIPT_ID`, and location helpers, so the discover map should reuse those instead of adding a new map loader.
  Evidence: `src/components/location/LocationSelector.tsx` and `src/lib/googleMapsLoader.ts`.
- Observation: Local data already contains events at the same location.
  Evidence: The local data probe found co-located events. No database move or seed occurred.
- Observation (2026-09-10 environment rerun): Key availability and Google Maps rendering are separate verification results.
  Evidence: After the environment copy, production rebuild, and ready restart, the browser loaded the Maps JavaScript request with the configured key. The canvas still showed the generic `Oops! Something went wrong` surface with no tiles or markers. This run did not establish a specific Google Cloud error.
- Observation (2026-09-10, filter-race fix): A delayed close for an old filter could clear a newly selected filter.
  Evidence: Commit `a7923e3f6` prevents this stale close in both page-level and map-level filter owners. The focused `DiscoverMapModal.test.tsx` suite passed all 14 tests.
- Observation (2026-09-10, filter-race rerun): The earlier generic Google Maps error is historical evidence from before this rerun.
  Evidence: The latest rebuilt `/discover` browser run rendered tiles and markers. Page-level and map-level filter switching left the new filter open.
- Observation (2026-09-10, date and map filter parity): The outer Discover popover applied its height limit and scrolling to the nested Dates calendar.
  Evidence: `apps/site/src/app/globals.css` applied `max-height` and `overflow-y` to `.discover-filter-popover`. The new `.discover-filter-popover--dates` rule permits visible overflow only for Dates.
- Observation (2026-09-10, date and map filter parity): Team map results need a stated location source because teams have no direct coordinates.
  Evidence: `DiscoverMapModal` loads nearby organizations with relations. It uses `buildTeamDivisionFilterOptions` and `filterOpenRegistrationTeams`, then displays each matching team at its organization coordinates.
- Observation (2026-09-10, date and map filter parity): A running browser surface does not prove later source edits.
  Evidence: The existing `site-ui-operations-prod` runtime predates this pass. No restart was authorized. Earlier browser results remain evidence for the earlier build only.

- Observation (2026-09-10, Discover split redesign): A map result callback needs a filter key. Without it, a delayed result from an earlier query can replace the current list scope.
  Evidence: The page rejects callbacks whose target or filter key is not current. Map and page tests cover filter changes.
- Observation (2026-09-10, Discover split redesign): Rental map IDs must match page rental IDs. Organization-only filtering can show cards for rentals that are not on the map.
  Evidence: Both map and page use `${organizationId}:facility:${facilityId}` or `${organizationId}:${fieldId}:${slotId}`.
- Observation (2026-09-10, Discover split redesign): Browser exact-location permission must start from a user action.
  Evidence: `LocationSearch` exposes `Use Exact Location` for an approximate location. Opening the picker does not call geolocation.
- Observation (2026-09-13, compact search surface): The existing location component serves map and page callers with different interaction contracts.
  Evidence: Inline `LocationSearch` mode now provides the Airbnb-style field while the default mode preserves the existing trigger, exact-location action, summary, and clear behavior for other callers.
- Observation (2026-09-13, compact search surface): Section spacing must be removed on desktop for hover backgrounds to meet the divider edges.
  Evidence: `.discover-search-sections` uses zero desktop gap and gives the Search action its own margin; the mobile stack keeps a small row gap.

## Decision Log

- Decision: Implement open-registration team discovery by extending the existing `/api/teams` list path instead of creating a parallel discover-only teams endpoint.
  Rationale: The current `teamService` and `listCanonicalTeamsForUser(...)` already centralize canonical team hydration and compatibility behavior.
  Date/Author: 2026-05-14 / Codex
- Decision: Add a Teams discover tab for open-registration team results.
  Rationale: The existing discover page has separate result panels per entity type, and tab selection is the search scope. Team results need a place to render without overloading events, organizations, or rentals.
  Date/Author: 2026-05-14 / Codex
- Historical decision (superseded on 2026-09-10 by the date and map filter parity work): The map modal will focus markers for events, organizations, and rentals, while team search remains page-level because teams do not have their own coordinates.
  Rationale: Teams are attached to organizations, but not every team has a direct mappable location. Mapping team markers would imply a location model that does not exist.
  Date/Author: 2026-05-14 / Codex
- Decision: Replace the map type dropdown with visible tabs. Add a default Nearby events rail and a floating selected-event detail card.
  Rationale: Match the supplied map reference layout.
  Date/Author: 2026-09-10 / Codex
- Decision: Use the active Discover tab when the map opens. Share page and map filter controls and values for all four tabs.
  Rationale: A map opened from Organizations, Rentals, or Teams must not silently display event results. Shared controls keep filter labels and behavior consistent.
  Date/Author: 2026-09-10 / Codex
- Decision: Show open-registration teams at their loaded organization coordinates. State the organization-location meaning in markers, result rows, and selection details.
  Rationale: This supports team discovery without claiming that a team has direct coordinates. It supersedes the earlier page-only team map decision.

- Decision (2026-09-10, Discover split redesign): Use the embedded map callback as the list scope authority.
  Rationale: The list must show the same filtered result set as the map. A second list-only distance model would diverge.
- Decision (2026-09-10, Discover split redesign): Keep `Search this area` for map movement.
  Rationale: It avoids request storms while making the list update after the user commits the new map area.
- Decision (2026-09-10, Discover split redesign): Ask for exact location through the visible location picker action.
  Rationale: Browsers require a user gesture for reliable permission prompts. Approximate location remains active when permission is denied.
  Date/Author: 2026-09-10 / Codex

- Decision (2026-09-13, compact search surface): Keep one `DiscoverSearchBar` component for collapsed and expanded states. The collapsed summary remains in normal flow, while the expanded controls use the same surface at a larger size instead of a separate fade-in card.
  Rationale: The reference shows continuity between the summary and the open search. One component avoids duplicate state and preserves focus restoration.
- Decision (2026-09-13, inline location entry): Put the location text input in the expanded search surface. The location panel keeps only the Nearby action and recommendation results, with no separate clear action.
  Rationale: The location field should behave like the reference search field, while clearing is unnecessary when the user can replace the text.
- Decision (2026-09-13, filter exception): Keep Discover filter controls green even though the site default field focus color is orange.
  Rationale: Filter state must remain visually distinct from ordinary text entry.

## Outcomes & Retrospective

2026-05-14 outcome (earlier implementation): Implementation is complete. The discover page now owns a Teams tab backed by `teamService.searchOpenRegistrationTeams(...)`, and tab-level search submits against whichever tab is active. The map modal reuses the existing Google Maps loader, keeps its marker-type dropdown, and searches around the user's current discover location first, falling back only if current location is unavailable. Rendered verification confirmed the controls and modal open on the production server; Google Maps marker rendering was blocked locally by `RefererNotAllowedMapError` for `http://localhost:3000`.
2026-05-14 follow-up (earlier implementation): Map behavior now scopes visible markers to the selected modal dropdown type. Event markers are blue, organization markers are green, rental markers are orange, and the user's current location remains a separate blue dot.

2026-09-10 outcome: The reference-style map implementation is complete. Visible tabs replace the earlier map type dropdown. The map has compact search, location, count, and filter controls. It uses coral event dots and a halo around the user location. A grouped Nearby events rail opens by default. A floating detail card shows the selected event. The discover page passes `locationInfo` to the modal.

Earlier reference-layout verification (2026-09-10; before the filter-race rerun):

The focused Jest suite passed all 12 tests. TypeScript and diff checks also passed. The local data probe found co-located events, so no database move or seed occurred. After `.env` and `.env.local` were copied from the sibling `site-ui-operations` worktree, the production build loaded both files. Following the user's authorization, `site-ui-operations-prod` was restarted and became ready. The rebuilt browser run loaded the Maps JavaScript request with the configured key and verified the visible modal tabs, compact chrome, Nearby events rail, selected-event card, and close-to-rail restore. The selected-card summary clamp remained at three lines. The key is available, but the Google Maps canvas still showed its generic `Oops! Something went wrong` surface with no map tiles or markers; map pixels and markers remain unverified. No specific Google Cloud error was established by this run.

2026-09-10 outcome (filter-race fix and rebuilt rerun): Commit `a7923e3f6` fixed the stale popover close race for page-level and map-level filter owners. A delayed close for the old filter no longer clears the newly selected filter. The focused suite passed 14 tests. TypeScript, ESLint for the four touched Discover files, and the CRLF-aware diff check passed. The build passed. The user-authorized runtime restart became ready on port 3001.

The rebuilt browser verified page-level Dates to Price and Event type to Event tags switching, plus map Tags to Sports switching. Each new filter stayed open while the prior filter closed. The map rendered tiles and markers. Selecting a nearby event showed the selected-event card, hid the rail, and exposed the View event action. The summary clamp stayed at three lines. The earlier generic Google Maps error describes the pre-rerun state, not this result. No production deploy occurred.

2026-09-10 outcome (date and map filter parity): The Dates overflow fix is scoped to the date panel. The map opens on the current Discover tab. Events use the shared event filter bar and apply event type, dates, sports, tags, division, price, and distance filters. Organizations use tag slugs, sports, division filters, and distance in area requests. Rentals use the shared rental-resource sport helper and the same time-range rules as the page. Teams use the shared open-registration and division helpers. Their markers and details state that they use organization locations.

The focused Jest run passed 51/51 tests across the map, event tab, and page suites. TypeScript, ESLint, and the CRLF-aware diff check passed. These results cover source behavior and code checks, not the rendered calendar or map layout. Browser verification could not validate this edit because `site-ui-operations-prod` predates the source edits and no restart was authorized. No production deploy occurred.

2026-09-10 outcome (Discover split redesign): The page now renders a full-width map and list together. The list follows map-visible IDs for all four tabs. The embedded map has no Nearby rail. Page filters are inline, and Sports remains in the search bar. The page distance filter is absent. Discover loads approximate network location and lets the user replace it with exact browser location.

The focused direct Jest run passed 7 suites and 87 tests. Changed-file ESLint passed with no output. Workspace TypeScript still reports 51 existing diagnostics in unrelated Prisma and API files. The package test command remains blocked by the existing generated shared-icon check; direct Jest bypassed that unrelated pretest gate. The CRLF-aware diff check passed. The running port-3001 process serves an older bundle that still shows the previous cards-only and distance-filter surface. No restart or deploy was authorized, so browser inspection did not validate this source revision.

2026-09-13 outcome (compact search surface): Discover now uses one bounded search surface. The collapsed summary shows Where, When, and Sport as independent section buttons. The expanded surface reuses those sections over the result content, removes the inner bordered grid and backdrop fade, and keeps the orange search/query actions distinct from green filters. Where uses an inline destination field with recommendation results and only the green Nearby action. When uses a right-side X action and no calendar footer clear control. Sport opens in the same active section.

The focused Discover run passed 3 suites and 23 tests. TypeScript and targeted ESLint passed. The production build passed and the user-authorized `site-ui-operations-prod` restart became ready on port 3001. Browser verification on rebuilt `/discover` confirmed the desktop summary, expanded overlay, section hover and selection, typed location recommendations, green Nearby action, date clearing affordance, sport list, and mobile stacked layout with no horizontal page overflow. No production deploy occurred.

2026-09-13 outcome (search motion follow-up): The collapsed and expanded states now share one selector group and one bounded surface. The active tab stays at the compact left anchor, then the other tabs expand around it and move it to the centered expanded position. The surface height, query, sections, and grey backdrop animate independently. Non-active tab content fades before width, padding, and borders collapse. The expanded panel remains hidden from layout and tab order after close.

The focused Jest run passed 3 suites and 23 tests. TypeScript and targeted ESLint passed. The production build passed with the existing multiple-lockfile warning. Browser verification on rebuilt port 3001 covered desktop and mobile open/close transitions, zero-width collapsed tabs, query visibility, no input clipping at settled states, mobile no-overflow, and reduced-motion styles. No production deploy occurred.
2026-09-13 outcome (shared search control correction): The compact and expanded Discover states now use the same rendered location, date, sport, and Search controls. Compact styling reduces the controls and hides only the Search label while preserving the circular action. Vertical dividers remain visible. The centered tab selector uses the same tab buttons in both states. The search surface and panel no longer clip open dropdowns. Background clicks expand the surface. Discover location labels use `Near by` for current or approximate location and `Near [city/state or ZIP]` for manual selections.

The focused Jest run passed 3 suites and 24 tests. TypeScript, targeted ESLint, and the production build passed. Browser verification on rebuilt port 3001 confirmed shared DOM identity across states, centered compact and expanded controls, visible sport options beyond the surface edge, `Near by` and `Near Vancouver, WA` labels, mobile no-horizontal-overflow, background-click expansion, and reduced-motion overrides. No production deploy occurred.

## Context and Orientation

The discover page is `src/app/discover/page.tsx`. It owns the active tab, location state, event fetching through `eventService.getEventsPaginated(...)`, and organization/rental loading through `organizationService.listOrganizationsWithFields()`. The event tab's search input currently lives in `src/app/discover/components/EventsTabContent.tsx`; organization and rental search inputs are local functions inside `page.tsx`. The web location button is `src/components/location/LocationSearch.tsx`, and map loading should reuse `src/lib/googleMapsLoader.ts`.

Teams are canonical teams stored through the Prisma `CanonicalTeams` model and exposed by `src/app/api/teams/route.ts`, which calls `listCanonicalTeamsForUser(...)` in `src/server/teams/teamMembership.ts`. Open-registration state is stored as `openRegistration` on canonical teams.

## Context Boundary

For the date and map filter parity work, read `apps/site/src/app/discover/components/DiscoverFilterBar.tsx`, `DiscoverTabFilterBar.tsx`, `DiscoverMapModal.tsx`, `DivisionDiscoveryFilters.tsx`, `apps/site/src/app/discover/page.tsx`, and the Discover rules in `apps/site/src/app/globals.css`. Use `apps/site/src/app/discover/rentalSportFilters.ts`, `utils/teamFilters.ts`, and `apps/site/src/components/events/event-list-filtering.ts` for existing matching rules. Use the three focused Discover test suites named in `Artifacts and Notes` for regression coverage.

Expand to the event or organization service only to confirm a request parameter or loaded relation. Browser verification of these edits requires a runtime built from these source files. A runtime restart requires separate authorization. Do not use the earlier browser results as proof of this pass.

## Plan of Work

First, extend the team listing path so callers can pass `query` and `openRegistration=true`. The API should filter canonical teams by team name, sport, or division and only return open-registration teams when requested. Add a `teamService.searchOpenRegistrationTeams(...)` helper.

Second, create a shared discover search control component with the text field and a search button on the right. Use it in Events, Organizations, Rentals, and the new Teams tab. The existing location button remains beside the search group, with a new map button next to it. Do not show a page-level type dropdown because tab selection already scopes the search.

Third, add the map modal. It opens on the active Discover tab and uses the current location when available. Otherwise, it requests the current location and uses a default center if that request cannot supply one. The fallback must retain the opening tab. Moving the map exposes "Search this area". Selecting that action reloads the current result type around the map center. Events, Organizations, Rentals, and Teams share the page's filter values and controls. Server-backed filter changes reload the current area. Local rental and team filters update loaded results. Selection actions open the relevant event, organization, rental, or team destination. Team results use organization coordinates with explicit location labels.

Fourth, validate with focused tests around team API filtering, current-tab search behavior where practical, TypeScript, lint, and rendered browser checks against `/discover`.

Fifth, reshape `src/app/discover/components/DiscoverSearchBar.tsx` and the related Discover CSS into a single bounded search surface. The collapsed state shows the Where, When, and Sport sections without nested control boxes. The expanded state grows over the result content, uses the same section layout, and removes the old backdrop fade. Section hover states use rounded rectangles that stop at the dividers. Selecting When opens the calendar, which exposes a right-side clear action instead of a footer clear button. Selecting Where keeps the text input in the search surface and leaves only a Nearby action and recommendation results in the location panel.

Sixth, preserve green Discover filter tokens as a local exception to the orange default field focus tokens. Verify that the search summary, event-creation field primitives, and expanded search text input use orange, while sport, date, and other filter controls use green.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-site`.

1. Edit `src/server/teams/teamMembership.ts`, `src/app/api/teams/route.ts`, and `src/lib/teamService.ts` to support `query` and `openRegistration`.
2. Add `src/app/discover/components/DiscoverSearchControls.tsx` and `src/app/discover/components/DiscoverMapModal.tsx`.
3. Update `src/app/discover/page.tsx` and `src/app/discover/components/EventsTabContent.tsx` to use shared controls, add the Teams tab, and wire the map modal.
4. Add or update Jest tests for the team API and any focused discover component behavior that can be tested without loading Google Maps.
5. Run:

    npm test -- --runTestsByPath <focused test paths> --runInBand
    npx tsc --noEmit --pretty false
    npx eslint <touched files>

6. Start or reuse a dev server and inspect `/discover` in a browser.

## Validation and Acceptance

Acceptance is user-visible. On `/discover`, each tab search applies to the current tab only. The Teams tab shows only teams with open registration. The Map button opens the same category as the active page tab. Each map category exposes and applies the matching page filters. Map search remains separate from the page query. Moving the map reveals "Search this area", which refreshes nearby results when selected. Selecting a result exposes its details and navigation action. Teams appear at organization coordinates with clear organization-location labels. The Dates panel must not clip its nested calendar or become the calendar's scroll container. Long non-date option lists must remain scrollable.

## Idempotence and Recovery

All edits are additive or scoped replacements. The previous search fix is already committed separately. If the map validation fails because `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is unavailable, the map component should show a clear inline error and the non-map discover search should remain usable.

## Artifacts and Notes

Earlier implementation artifacts (2026-05-14; preserved as historical evidence):

- `npx tsc --noEmit --pretty false` passed.
- `npm test -- --runTestsByPath src/lib/__tests__/teamService.test.ts src/server/teams/__tests__/teamMembership.test.ts src/app/discover/components/__tests__/EventsTabContent.test.tsx --runInBand` passed: 3 suites, 25 tests.
- `npx eslint src/app/discover/page.tsx src/app/discover/components/EventsTabContent.tsx src/app/discover/components/DiscoverSearchControls.tsx src/app/discover/components/DiscoverMapModal.tsx src/app/api/teams/route.ts src/lib/teamService.ts src/server/teams/teamMembership.ts src/lib/__tests__/teamService.test.ts src/server/teams/__tests__/teamMembership.test.ts src/app/discover/components/__tests__/EventsTabContent.test.tsx` passed.
- `git diff --check -- <touched files>` passed after removing one trailing whitespace line.
- `npm run build` passed. It emitted an existing Turbopack NFT warning for `next.config.mjs` through `src/lib/storage.ts` and two existing `z-index` warnings.
- Browser verification at `http://localhost:3000/discover` confirmed Events/Organizations/Rentals/Teams tabs, the original discover target dropdown, the Teams search target switching to the Teams tab, the Map button, and the map modal search controls. The Google Maps script returned `RefererNotAllowedMapError` for `http://localhost:3000`.
- Follow-up implementation removed the page-level dropdown so search is scoped by the active tab. This still needs post-follow-up rendered verification on a restarted production server or a fast enough local dev surface.

Reference-layout and environment-rerun artifacts (2026-09-10; historical evidence before the filter-race rerun):

- Reference-layout implementation (2026-09-10): `DiscoverMapModal` now has visible tabs, compact search/location/count/filter controls, coral event dots, and a user halo. It also has a grouped Nearby events rail that opens by default and a floating selected-event detail card. `src/app/discover/page.tsx` passes `locationInfo` to the modal.
- Reference-layout verification (2026-09-10): The focused `DiscoverMapModal` Jest suite passed all 12 tests. `npx tsc --noEmit --pretty false` and `git -c core.whitespace=cr-at-eol diff --check` passed.
- Local data probe (2026-09-10): Co-located events already exist. No database move or seed occurred.
- Environment rebuild (2026-09-10): `.env` and `.env.local` were copied from the sibling `site-ui-operations` worktree. The production build loaded both env files. The user-authorized `site-ui-operations-prod` restart became ready.
- Rebuilt-browser verification (2026-09-10): The rebuilt page loaded the Maps JavaScript request with the configured key. The visible modal tabs, compact chrome, Nearby events rail, selected-event card, and close-to-rail restore rendered.
- Browser limitation (2026-09-10): Despite the configured key being available, the Google Maps canvas still showed the generic `Oops! Something went wrong` surface with no map tiles or markers. Map pixels and markers remain unverified; this run did not establish a specific Google Cloud error.
- Selected-summary clamp (2026-09-10): The three-line selected-summary clamp was rebuilt and observed in the selected-event card. It remained at three lines in the browser rerun after copying the environment files.

Filter-race fix and rebuilt-rerun artifacts (2026-09-10; historical evidence before the date and map filter parity work):

- Commit `a7923e3f6` fixed the stale popover close race. It covers page-level and map-level filter owners. A delayed close for the old filter no longer clears the newly selected filter.
- The focused `DiscoverMapModal.test.tsx` suite passed all 14 tests after the fix. The earlier 12-test result remains historical evidence.
- `npx tsc --noEmit --pretty false` passed. ESLint passed for the four touched Discover files. The CRLF-aware `git -c core.whitespace=cr-at-eol diff --check` passed.
- `npm run build` passed after the fix. Prisma generated successfully. Next compiled, TypeScript completed, and 127/127 static pages generated. The existing multiple-lockfile workspace-root warning remained.
- The user-authorized `site-ui-operations-prod` runtime restarted and became ready on port 3001.
- Rebuilt `/discover` browser verification passed. Page-level Dates to Price and Event type to Event tags switching kept the new filter open while closing the prior filter. Map Tags to Sports switching did the same.
- The rebuilt map rendered tiles and markers. Selecting a nearby event showed the selected-event card and hid the rail. The View event action appeared. The selected-summary clamp stayed at three lines.
- The generic Google Maps error above occurred before this rerun. It is historical evidence, not the latest map result. No production deploy occurred.

Date and map filter parity artifacts (2026-09-10; latest source verification):

- Added `.discover-filter-popover--dates` through the shared `FilterPopover` panel class hook. Other filter panels retain their scrolling rules.
- Added `apps/site/src/app/discover/components/DiscoverTabFilterBar.tsx`. Both the page and map use its organization, rental, and team controls. Events use `DiscoverFilterBar`.
- The map receives the active page tab and tab-specific state and setters. Event requests include event type, division, and price parameters. Organization requests include tag slugs, sports, division, price, and distance parameters. Rental and team results use the shared matching helpers.
- Team results load through nearby organizations with relations. The UI labels the marker position as an organization location. The hidden native category selector was removed.
- Focused Jest result reported by integration validation: 3 suites passed, 51/51 tests passed. The suites were `apps/site/src/app/discover/components/__tests__/DiscoverMapModal.test.tsx`, `apps/site/src/app/discover/components/__tests__/EventsTabContent.test.tsx`, and `apps/site/src/app/discover/__tests__/page.test.tsx`.
- TypeScript passed. ESLint passed. The CRLF-aware diff check passed.
- Browser inspection did not validate this edit. The existing `site-ui-operations-prod` runtime predates the source edits. No restart was authorized for this pass. Earlier rebuilt-browser results apply only to the earlier source state.
- No production deploy occurred.

## Interfaces and Dependencies

Use `@react-google-maps/api` already present in `package.json`. Reuse `GOOGLE_MAPS_SCRIPT_ID`, `GOOGLE_MAPS_LIBRARIES`, and `GOOGLE_MAP_OPTIONS_WITH_MAP_ID` from `src/lib/googleMapsLoader.ts`. The team list API accepts new optional query parameters:

    GET /api/teams?query=<text>&openRegistration=true&limit=100

`teamService.searchOpenRegistrationTeams(query, limit)` returns `Team[]` hydrated through existing `mapRowToTeam(...)`.

Revision note (2026-09-10): Recorded the completed reference layout and its verification limits so the plan reflects the current implementation. Preserved earlier implementation and browser results as history.

Revision note (2026-09-10, environment rerun): Replaced the current missing-key limitation with the copied-env production rebuild, ready authorized restart, and keyed browser evidence. Distinguished the available key from the unresolved Google Maps rendering failure, retained the three-line summary result, and preserved earlier verification history.

Revision note (2026-09-10, filter-race rerun): Recorded commit `a7923e3f6`, the 14-test focused suite, code checks, build results, authorized runtime readiness, and rebuilt browser verification. Marked the earlier generic Maps error as pre-rerun history. The latest run rendered tiles and markers. Preserved earlier evidence and acceptance text. No production deploy occurred.

Revision note (2026-09-10, date and map filter parity): Recorded the scoped Dates overflow fix, shared filters, active-tab map behavior, organization-location team results, and the 51/51 focused test result. Recorded the TypeScript, ESLint, and CRLF-aware diff check results. Corrected current category-selector and team map descriptions. Preserved earlier implementation and browser history. Browser verification of this edit remains incomplete because the runtime predates the edits and no restart was authorized. No production deploy occurred.
Revision note (2026-09-10, Issue 121 completion pass): Completed the remaining Discover map and search parity work. Map retries now remount only the script loader, map requests retain stale-response guards, and current-location and clear-location controls expose retryable errors. Grouped result close restores the matching rail row focus. Event local filtering now matches server-searchable event and organization fields and server date boundaries. The final focused Discover run passed 8 suites and 92 tests. Changed-file lint passed with 0 errors and 9 complexity warnings. Workspace typechecking, full CI, full Jest, and production build remain blocked by unrelated existing Prisma/API errors, generated shared-icon drift, and the test setup MouseEvent failure. Browser smoke used the existing pre-edit runtime; it was not restarted. No production deploy occurred.
Revision note (2026-09-10, Airbnb-style Discover redesign): Replaced the page title and legacy primary controls with a bounded target-aware search surface for Events, Organizations, Rentals, and Teams. Added location, event dates, sports, expand/collapse focus restoration, and explicit Events-only date state for non-event targets. Added the post-search split results shell with inline embedded map, responsive mobile stacking, per-tab Filters modal, and shared event card width rules with content growth. Embedded map queries and active targets now follow the page search. Rental map/list search fields now match. Focused Discover validation passed 9 suites and 104 tests. Changed-file lint passed with 0 errors and 14 warnings. Typechecking still reports 51 unrelated diagnostics. Full CI and build remain blocked by unrelated generated shared-icon drift and project errors. Browser verification of this source remains unavailable because the existing port-3001 process predates the edit and no restart was authorized. No production deploy occurred.
Revision note (2026-09-10, search overlay refinement): Removed the visible collapse control. The expanded search keeps the compact summary anchor in normal flow, renders the full controls over the results, dims the viewport with an animated grey backdrop, dismisses on outside click or Escape, restores focus, and honors reduced motion. Focused Discover validation passed 9 suites and 108 tests. Changed-file lint passed with 0 errors and 1 existing complexity warning. Browser verification of this source awaits an explicit rebuild and restart because the current runtime serves the previous bundle. No production deploy occurred.

Revision note (2026-09-10, Discover split redesign): Recorded the full-width map/list shell, map-authoritative list scope, inline filters, distance-control removal, approximate-to-exact location flow, focused validation, and browser verification limit. Preserved earlier map-modal history. No restart or production deploy occurred.

Revision note (2026-09-13, compact search surface): Added the plan for the reference-style Discover search redesign. The implementation will preserve one search component, move location entry into the expanded surface, replace the date footer clear action with the section clear action, and keep green filter styling as a scoped exception to the orange default field theme.
Revision note (2026-09-13, compact search surface completion): Marked the reference-style search work complete. Recorded the controlled Where, When, and Sport sections, inline location entry, date section clear action, transform-only expansion, focused Jest/type/lint/build checks, and rebuilt desktop/mobile browser evidence. No production deploy occurred.
Revision note (2026-09-13, search motion follow-up): Replaced the transform-only and open-on-mount behavior with a persistent closed panel that reveals on the next animation frame. Added height and selector-grid transitions, delayed tab fade-in, fast tab fade-out before zero-width collapse, query and section fade transitions, grey backdrop fade-in and fade-out keyframes, mobile transitions, and reduced-motion overrides. Updated the overlay focus test. Rebuilt browser verification passed on desktop and mobile. No production deploy occurred.
Revision note (2026-09-13, shared search control correction): Removed the duplicate compact summary controls. Kept one persistent control row and resized its existing components for compact mode. Centered the selector, restored explicit dividers, allowed open dropdown overflow, added current/manual location display labels, and made the surface background expand the search. Added shared-label and background-expansion regression coverage. Rebuilt and verified desktop, mobile, dropdown, location-label, identity, and reduced-motion behavior. No production deploy occurred.
Revision note (2026-09-13, search surface sizing correction): Removed fixed collapsed and expanded surface heights and the surface height transition. The surface now follows its content. Matched bottom padding to horizontal padding in desktop and mobile states. Synchronized the query transition with the section transition and added a mobile sections frame so the stacked filters expand and collapse within the same motion window. Active filter popovers remain visible. Focused Jest validation passed 3 suites and 24 tests. TypeScript, targeted ESLint, Prettier, production build, and rebuilt browser checks passed. No production deploy occurred.
Revision note (2026-09-13, search control motion correction): Made the expanded Search control the same icon-only circular control as the collapsed state at 48px, centered it with the filters, and added 360ms geometry transitions for the button, type buttons, and filter controls. Preserved reduced-motion overrides. Focused Jest passed 3 suites and 24 tests. TypeScript, targeted ESLint, Prettier, production build, and rebuilt desktop/mobile browser checks passed. No production deploy occurred.
Revision note (2026-09-13, search collapse clipping correction): Reserved a 48px minimum action-column track so the expanded icon button remains inside its grid cell while it shrinks to the 40px compact size. Focused Jest passed 3 suites and 24 tests. TypeScript, targeted ESLint, Prettier, production build, and desktop/mobile collapse containment checks passed. No production deploy occurred.
Revision note (2026-09-13, mobile reference examples): Generated fourteen approved mobile browser examples at 853x1844 RGB pixels under `docs/images/site-ui/discovery-list/`. Coverage includes Events, Organizations, Rentals, Teams, searchable tags, division filters, price filters, loading, no-results, network-error, location-unavailable, end-of-results, grouped-map selection, and single-event map selection. The examples use the local site runtime; temporary browser fixtures supplied the open team result and failure states only during capture. No production deploy occurred.
