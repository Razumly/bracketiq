# Add Discover Map and Typed Search

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan follows `PLANS.md` in the repository root.

## Purpose / Big Picture

The discover page should let someone search within the tab they are already viewing: events, organizations, rentals, or open-registration teams. It should also offer a map beside the existing location control, showing nearby events, organizations, and rental fields around the user's current or selected location. After the change, a user can open `/discover`, choose a tab, search from that tab's header, open the map modal, pan the map, press "Search this area", and select a result to focus the map or navigate to the relevant page. The map modal uses visible Events/Organizations/Rentals tabs and retains a hidden native category selector only as a compatibility seam, not as a user-facing dropdown.

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

## Surprises & Discoveries

- Observation: The mobile map uses Google Maps camera bounds and a "search places in bounds" model for place search, but its event search currently loads events from a repository using bounds derived from the current location.
  Evidence: `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap/MapComponent.kt` has `updateCameraBounds(...)`, `searchPlaces(...)`, and `getEvents()`.
- Observation: The web repo already has `@react-google-maps/api`, a shared `GOOGLE_MAPS_SCRIPT_ID`, and location helpers, so the discover map should reuse those instead of adding a new map loader.
  Evidence: `src/components/location/LocationSelector.tsx` and `src/lib/googleMapsLoader.ts`.
- Observation: Local data already contains events at the same location.
  Evidence: The local data probe found co-located events. No database move or seed occurred.
- Observation (2026-09-10 environment rerun): Key availability and Google Maps rendering are separate verification results.
  Evidence: After the environment copy, production rebuild, and ready restart, the browser loaded the Maps JavaScript request with the configured key. The canvas still showed the generic `Oops! Something went wrong` surface with no tiles or markers. This run did not establish a specific Google Cloud error.

## Decision Log

- Decision: Implement open-registration team discovery by extending the existing `/api/teams` list path instead of creating a parallel discover-only teams endpoint.
  Rationale: The current `teamService` and `listCanonicalTeamsForUser(...)` already centralize canonical team hydration and compatibility behavior.
  Date/Author: 2026-05-14 / Codex
- Decision: Add a Teams discover tab for open-registration team results.
  Rationale: The existing discover page has separate result panels per entity type, and tab selection is the search scope. Team results need a place to render without overloading events, organizations, or rentals.
  Date/Author: 2026-05-14 / Codex
- Decision: The map modal will focus markers for events, organizations, and rentals, while team search remains page-level because teams do not have their own coordinates.
  Rationale: Teams are attached to organizations, but not every team has a direct mappable location. Mapping team markers would imply a location model that does not exist.
  Date/Author: 2026-05-14 / Codex
- Decision: Replace the map type dropdown with visible tabs. Add a default Nearby events rail and a floating selected-event detail card.
  Rationale: Match the supplied map reference layout.
  Date/Author: 2026-09-10 / Codex

## Outcomes & Retrospective

2026-05-14 outcome (earlier implementation): Implementation is complete. The discover page now owns a Teams tab backed by `teamService.searchOpenRegistrationTeams(...)`, and tab-level search submits against whichever tab is active. The map modal reuses the existing Google Maps loader, keeps its marker-type dropdown, and searches around the user's current discover location first, falling back only if current location is unavailable. Rendered verification confirmed the controls and modal open on the production server; Google Maps marker rendering was blocked locally by `RefererNotAllowedMapError` for `http://localhost:3000`.
2026-05-14 follow-up (earlier implementation): Map behavior now scopes visible markers to the selected modal dropdown type. Event markers are blue, organization markers are green, rental markers are orange, and the user's current location remains a separate blue dot.

2026-09-10 outcome: The reference-style map implementation is complete. Visible tabs replace the earlier map type dropdown. The map has compact search, location, count, and filter controls. It uses coral event dots and a halo around the user location. A grouped Nearby events rail opens by default. A floating detail card shows the selected event. The discover page passes `locationInfo` to the modal.

The focused Jest suite passed all 12 tests. TypeScript and diff checks also passed. The local data probe found co-located events, so no database move or seed occurred. After `.env` and `.env.local` were copied from the sibling `site-ui-operations` worktree, the production build loaded both files. Following the user's authorization, `site-ui-operations-prod` was restarted and became ready. The rebuilt browser run loaded the Maps JavaScript request with the configured key and verified the visible modal tabs, compact chrome, Nearby events rail, selected-event card, and close-to-rail restore. The selected-card summary clamp remained at three lines. The key is available, but the Google Maps canvas still showed its generic `Oops! Something went wrong` surface with no map tiles or markers; map pixels and markers remain unverified. No specific Google Cloud error was established by this run.

## Context and Orientation

The discover page is `src/app/discover/page.tsx`. It owns the active tab, location state, event fetching through `eventService.getEventsPaginated(...)`, and organization/rental loading through `organizationService.listOrganizationsWithFields()`. The event tab's search input currently lives in `src/app/discover/components/EventsTabContent.tsx`; organization and rental search inputs are local functions inside `page.tsx`. The web location button is `src/components/location/LocationSearch.tsx`, and map loading should reuse `src/lib/googleMapsLoader.ts`.

Teams are canonical teams stored through the Prisma `CanonicalTeams` model and exposed by `src/app/api/teams/route.ts`, which calls `listCanonicalTeamsForUser(...)` in `src/server/teams/teamMembership.ts`. Open-registration state is stored as `openRegistration` on canonical teams.

## Plan of Work

First, extend the team listing path so callers can pass `query` and `openRegistration=true`. The API should filter canonical teams by team name, sport, or division and only return open-registration teams when requested. Add a `teamService.searchOpenRegistrationTeams(...)` helper.

Second, create a shared discover search control component with the text field and a search button on the right. Use it in Events, Organizations, Rentals, and the new Teams tab. The existing location button remains beside the search group, with a new map button next to it. Do not show a page-level type dropdown because tab selection already scopes the search.

Third, add the map modal. It opens centered on the current discover location when available, otherwise it asks for current location and falls back to a default center. Initial map loading searches around that center. Panning the map far enough shows "Search this area"; pressing it refreshes event results around the camera center and re-filters organizations/rentals around that center. The modal search bar lets the user choose Events, Organizations, or Rentals, then selecting a result pans to that marker and opens its details. Marker info actions navigate to the existing event or organization pages.

Fourth, validate with focused tests around team API filtering, current-tab search behavior where practical, TypeScript, lint, and rendered browser checks against `/discover`.

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

Acceptance is user-visible. On `/discover`, each tab search area has one input and a Search button to the right, and the search applies to the current tab only. The Teams tab shows only teams with open registration. The Map button appears next to Set Location, opens a modal, and initially searches around the user's selected/current location. Panning the map reveals a Search this area button, and pressing it refreshes nearby markers. Selecting an event, organization, or rental search result in the modal pans to the marker and exposes a navigation action.

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

Reference-layout and environment-rerun artifacts (2026-09-10):

- Reference-layout implementation (2026-09-10): `DiscoverMapModal` now has visible tabs, compact search/location/count/filter controls, coral event dots, and a user halo. It also has a grouped Nearby events rail that opens by default and a floating selected-event detail card. `src/app/discover/page.tsx` passes `locationInfo` to the modal.
- Reference-layout verification (2026-09-10): The focused `DiscoverMapModal` Jest suite passed all 12 tests. `npx tsc --noEmit --pretty false` and `git -c core.whitespace=cr-at-eol diff --check` passed.
- Local data probe (2026-09-10): Co-located events already exist. No database move or seed occurred.
- Environment rebuild (2026-09-10): `.env` and `.env.local` were copied from the sibling `site-ui-operations` worktree. The production build loaded both env files. The user-authorized `site-ui-operations-prod` restart became ready.
- Rebuilt-browser verification (2026-09-10): The rebuilt page loaded the Maps JavaScript request with the configured key. The visible modal tabs, compact chrome, Nearby events rail, selected-event card, and close-to-rail restore rendered.
- Browser limitation (2026-09-10): Despite the configured key being available, the Google Maps canvas still showed the generic `Oops! Something went wrong` surface with no map tiles or markers. Map pixels and markers remain unverified; this run did not establish a specific Google Cloud error.
- Selected-summary clamp (2026-09-10): The three-line selected-summary clamp was rebuilt and observed in the selected-event card. It remained at three lines in the browser rerun after copying the environment files.

## Interfaces and Dependencies

Use `@react-google-maps/api` already present in `package.json`. Reuse `GOOGLE_MAPS_SCRIPT_ID`, `GOOGLE_MAPS_LIBRARIES`, and `GOOGLE_MAP_OPTIONS_WITH_MAP_ID` from `src/lib/googleMapsLoader.ts`. The team list API accepts new optional query parameters:

    GET /api/teams?query=<text>&openRegistration=true&limit=100

`teamService.searchOpenRegistrationTeams(query, limit)` returns `Team[]` hydrated through existing `mapRowToTeam(...)`.

Revision note (2026-09-10): Recorded the completed reference layout and its verification limits so the plan reflects the current implementation. Preserved earlier implementation and browser results as history.

Revision note (2026-09-10, environment rerun): Replaced the current missing-key limitation with the copied-env production rebuild, ready authorized restart, and keyed browser evidence. Distinguished the available key from the unresolved Google Maps rendering failure, retained the three-line summary result, and preserved earlier verification history.
