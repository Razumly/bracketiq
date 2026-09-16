# Build the facility resource-time calendar

This ExecPlan is a living document. Maintain it in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

The facilities schedule must match the generated BracketIQ references in `docs/images/site-ui/data-management/organization-facilities--default--desktop-1536x1024.png` and `docs/images/site-ui/data-management/organization-facilities--schedule-table--mobile-853x1844.png`. A user must see resources as rows and time as the horizontal axis. In the weekly view, each date must group its time columns. On a narrow screen, the schedule must keep the resource column visible and allow the time grid to scroll horizontally.

The schedule must keep the current behavior for navigation, layer visibility, rental selection, manager draft creation, event selection, and manager schedule edits. A user can verify the result at `/organizations/<organizationId>/facilities` after starting the site and selecting the Facilities tab.

## Progress

- [x] (2026-09-03) Read the repository instructions and the UI/UX skill.
- [x] (2026-09-03) Confirmed the generated desktop and mobile reference assets.
- [x] (2026-09-03) Confirmed the current implementation uses the default `react-big-calendar` time grid.
- [x] (2026-09-04) Add a resource-time grid component with dates and time intervals on the horizontal axis.
- [x] (2026-09-04) Preserve navigation, selection, drag, resize, and loading behavior at the calendar boundary.
- [x] (2026-09-04) Update styles for the generated reference layout and responsive horizontal scrolling.
- [x] (2026-09-04) Add regression coverage for the observable grid structure and interaction mapping.
- [x] (2026-09-04) Run lint, type checking, focused tests, and a production build.
- [x] (2026-09-04) Update this plan with final evidence and remaining gaps.

## Surprises & Discoveries

- The generated desktop reference uses a two-level horizontal header. The first level groups dates. The second level shows time labels within each date.
- The generated mobile reference uses one date with a horizontal time strip and resource rows. It confirms that horizontal scrolling belongs to the schedule grid, not the full page.
- The current `FacilityCalendarPanel` uses `react-big-calendar`'s default week view. Its time axis is vertical and its resource IDs are event metadata only. The current CSS change controls overflow but cannot transpose the calendar.
- The manager drag resolver currently reads `.rbc-time-content` and `.rbc-day-slot` geometry. The new grid must provide an equivalent geometry seam or the resolver must use new grid data attributes.
- The existing range callback reset the selected calendar date to local midnight during navigation. The new grid calls the date navigation callback directly, so the selected time remains stable.
- The existing slot selection calculation applied the configured minimum time twice. The new grid passes the absolute snapped time to the existing selection handler.
- The focused `FieldsTabContent` tests depended on the old calendar mock DOM. The mock now targets the new grid seam, while the new grid tests cover the real layout.

## Decision Log

- Decision: Build a dedicated resource-time grid inside `FacilityCalendarPanel` instead of trying to transpose `react-big-calendar` with CSS. Rationale: the reference changes the calendar's axis model, and CSS transforms would make event hit testing and drag coordinates unreliable. Date: 2026-09-03. Author: Codex.
- Decision: Keep `react-big-calendar` in the repository for the event schedule and other consumers, but remove it from the facilities calendar panel. Rationale: the dependency is shared by other site surfaces and the facilities layout needs different semantics. Date: 2026-09-03. Author: Codex.
- Decision: Keep the existing `View` state as `week` and `day`. In week mode, render seven date groups. In day mode, render one date group. Rationale: these are the controls currently exposed by the facilities panel. Date: 2026-09-03. Author: Codex.
- Decision: Use 30-minute layout units for positioning and 2-hour labels for the visual header. Rationale: existing selection logic snaps to 30 minutes, while the generated references use readable two-hour labels. Date: 2026-09-03. Author: Codex.
- Decision: Use the selected resource list from the existing sidebar as the vertical row list. Rationale: this preserves the current filtering contract and makes the visible rows match the selected resources. Date: 2026-09-03. Author: Codex.
- Decision: Keep event callbacks at the panel boundary and translate custom grid gestures into the current callback shapes. Rationale: `FieldsTabContent` owns business rules for rentals, staff assignments, and manager drafts. Date: 2026-09-03. Author: Codex.

## Outcomes & Retrospective

The facilities calendar now uses the generated desktop and mobile assets as its visual source. Dates and time intervals run horizontally. Selected resources run vertically. Week and month navigation remain available. The schedule scrolls horizontally inside its own surface on narrow screens. Event selection, layer visibility, manager draft movement, event movement, resizing, and local loading behavior remain at the existing panel boundary.

Validation passed on 2026-09-04:

- Focused Jest tests passed: 47 tests in 2 suites.
- TypeScript passed with `npx tsc --noEmit`.
- ESLint passed with no errors. It reports 15 existing hook-dependency warnings in `FieldsTabContent.tsx`.
- The production build passed. Next.js generated 127 static pages.

The remaining gap is the wider facilities page composition. The current panel still keeps the existing resource sidebar and details flow. A later issue can align the summary metrics and right-side facility details with the full generated desktop reference.

## Context and Orientation

`apps/site/src/app/organizations/[id]/FieldsTabContent.tsx` owns facility calendar state, event preparation, date-range hydration, business rules, and callbacks. It passes the prepared event list and interaction callbacks to `fieldsTab/FacilityCalendarPanel.tsx`.

`apps/site/src/app/organizations/[id]/fieldsTab/FacilityCalendarPanel.tsx` currently renders `react-big-calendar` with a week or day view. `react-big-calendar` places dates in columns and time in rows. That is the behavior to replace for the facilities surface.

`apps/site/src/app/organizations/[id]/fieldsTab/ManagerFacilityCalendarSidebar.tsx` owns the facility selector, calendar layer controls, manager create templates, and the selected resource filter. The new calendar must use the same selected resource IDs and must not allow its grid to cover the sidebar.

`apps/site/src/app/organizations/[id]/fieldCalendar.ts` builds `CalendarEventData` entries. Each entry has `start`, `end`, `resourceId`, `fieldName`, and a type-specific `resource` object. The new grid must use `resourceId` to place an entry in the matching resource row.

`apps/site/src/app/organizations/[id]/FieldsTabContent.tsx` contains the existing rules for empty-slot selection, staff assignment activation, rental slot updates, manager draft movement, and manager create-template drops. The grid must call these rules through the existing panel props. It must not duplicate business decisions in the visual component.

## Plan of Work

Add a small calendar-grid module under `apps/site/src/app/organizations/[id]/fieldsTab/`. It will define the visible date groups, the 30-minute timeline units, resource rows, event rectangles, and pointer-to-date conversion. It will accept the current event list, selected resource IDs, date range, minimum and maximum times, and callback props. The module will render a semantic table-like grid with a sticky resource column, date headers, time labels, low-contrast grid lines, and accessible event buttons where an event is clickable.

Keep `FacilityCalendarPanel.tsx` as the integration boundary. Replace the `react-big-calendar` render with the new grid. Keep the existing loading and empty states. Translate the panel navigation controls into the same date and view callbacks that `FieldsTabContent` already supplies. Translate empty-cell clicks into `{ start, end, resourceId }`. Translate event movement and resize into `{ event, start, end, resourceId }` so the existing rental, staff, and draft handlers remain the single source of truth.

Update `FieldsTabContent.tsx` only where the old calendar geometry is assumed. Replace queries for `.rbc-time-content` and `.rbc-day-slot` with the new grid geometry attributes. Map the horizontal pointer position to a date and time, and map the vertical pointer position to the resource row when the user moves a manager draft or drops a create template. Preserve 30-minute snapping and the current one-day draft restriction.

Update `apps/site/src/app/globals.css` with component-scoped classes for the two-level header, resource labels, time cells, event positioning, selected and unavailable cells, focus states, and horizontal scrolling. Use the existing BracketIQ color and radius tokens. Do not add eyebrow text. Do not use emoji icons. Keep the resource label column readable on small screens and keep horizontal scrolling inside the schedule surface.

Add focused tests in `apps/site/src/app/organizations/[id]/__tests__/FieldsTabContent.test.tsx` or a new adjacent component test. The tests must prove the grid renders resource rows and date/time columns, an empty cell produces the expected date and resource ID, and an event remains selectable. Update only tests whose old assumptions depend on `react-big-calendar`'s mock DOM.

## Concrete Steps

Run all commands from `apps/site` unless a command names a root path.

    npx tsc --noEmit
    npx eslint "src/app/organizations/[id]/fieldsTab/FacilityCalendarPanel.tsx" "src/app/organizations/[id]/fieldsTab/FacilityResourceCalendarGrid.tsx" "src/app/organizations/[id]/FieldsTabContent.tsx"
    npm test -- --runInBand --runTestsByPath "src/app/organizations/[id]/__tests__/FieldsTabContent.test.tsx"
    npm run build

Start the production site only after the user explicitly requests a runtime restart. Open `http://127.0.0.1:3000/organizations/<organizationId>/facilities`. In week view, verify that date names group the time labels across the top and resources form the rows. In day view, verify that the same horizontal time axis remains and only one date is shown. On a narrow viewport, verify that the page does not scroll horizontally outside the calendar surface.

## Validation and Acceptance

The implementation is accepted when the facilities schedule has the same axis orientation as both generated references. The resource name column is vertical. The time axis is horizontal. In week view, date groups appear above their time labels. Events occupy the correct resource row and horizontal time range.

The navigation buttons change the visible date range without a full page reload. Layer controls hide and show matching events. A public user can click an available time range and create a rental selection. A manager can drag a create template to a resource row and time range, move a manager draft, and resize an editable event. Existing unavailable and booked ranges remain visually distinct and cannot be selected by public users.

The grid has visible keyboard focus for event buttons and accessible names for resource rows and navigation controls. The schedule keeps horizontal scrolling inside its own surface on small screens. Loading and empty states remain local to the calendar panel.

## Idempotence and Recovery

The implementation is additive until the new grid replaces the old panel render. Re-running type checks and tests is safe. If the new interaction mapping fails, keep the existing business callbacks and correct only the grid-to-callback translation. Do not reset or discard unrelated worktree changes.

## Artifacts and Notes

The visual sources of truth are the checked-in generated assets:

    docs/images/site-ui/data-management/organization-facilities--default--desktop-1536x1024.png
    docs/images/site-ui/data-management/organization-facilities--schedule-table--mobile-853x1844.png

The prior user screenshots are not design sources for this task. They are only evidence of the current implementation.

## Interfaces and Dependencies

The new grid should expose a narrow props interface through `FacilityCalendarPanel`. It should use `CalendarEventData` and the existing `View` type. It should not import Prisma types, server modules, or business services.

The grid may use `date-fns` functions already installed in `apps/site`, including `addMinutes`, `differenceInMinutes`, `endOfDay`, `format`, `isSameDay`, `startOfDay`, and `eachDayOfInterval`. It should use CSS positioning for event rectangles and pointer event handlers for interaction. It should not add a new calendar dependency.

## Change Notes

2026-09-03: Created this plan after confirming that the generated references require a transposed resource-time layout. The plan replaces the earlier assumption that the standard `react-big-calendar` week view was visually correct.
