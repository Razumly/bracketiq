# Audit and repair event creation flows

This ExecPlan follows `PLANS.md`. It is a living record of the audit, fixes, and proof for tournament, league, event, and repeating weekly event creation.

## Purpose / Big Picture

An organizer must be able to create each supported event type without blocked navigation, clipped controls, broken dates, unclear validation, or visual drift. The completed flow must show one BracketIQ control system on desktop and mobile. A reviewer can verify the result by opening the local production site, creating each event type, entering invalid values, and confirming clear recovery messages.

## Progress

- [x] (2026-03-08) Started a production-browser audit on the local database.
- [x] (2026-03-08) Reproduced a guest creation blocker. The event editor stays on `Loading user...` because guest onboarding routes to a create URL without a user profile.
- [x] (2026-03-08) Audited tournament creation from start to saved event.
- [x] (2026-03-08) Audited league creation from start to saved event.
- [x] (2026-03-08) Audited one-off event creation from start to saved event.
- [x] (2026-03-08) Audited repeating weekly event creation from start to saved event.
- [x] (2026-03-08) Recorded blockers and visual findings.
- [x] (2026-03-08) Repair the event type selector, field focus spacing, date controls, validation, and layout defects.
- [x] (2026-03-08) Add focused regression coverage for each repaired behavior.
- [x] (2026-03-09) Rebuild and restart the production server.
- [x] (2026-03-09) Repeat every flow at desktop and mobile widths.

## Surprises & Discoveries

- Observation: Selecting `Create events as an individual` as a guest routes to `/events/<id>/schedule?create=1&mode=edit&tab=details`.
  Evidence: The production browser reached that URL, then remained on `Loading user...`.
- Observation: `/api/auth/me`, `/api/sports`, and `/api/division-types` return HTTP 200, but `/api/auth/me` returns no user for a guest session.
  Evidence: The browser request bodies contained `{"user":null,"session":null}` and valid catalog payloads.
- Observation: The local production environment uses PostgreSQL on `127.0.0.1:5543` with database `bracketiq_e2e_146_local`. No live database write is required for this audit.
  Evidence: The environment target was inspected by host, port, and database name only.

- Observation: The production event-form controls passed `native` to the shared select in several sections. This created native browser menus beside BracketIQ menus.
  Evidence: Removing the `native` branch produced zero native `select` elements in the audited create flows.
- Observation: A new tournament started with a one-hour window. The proposal could not place the full bracket.
  Evidence: The repaired defaults use three hours for tournaments and six hours for leagues.
- Observation: A default `BEST_AVAILABLE_COVERAGE` proposal reported unassigned officials as errors. This blocked event creation even though the staffing policy permits best effort.
  Evidence: The repaired proposal display reports these slots as warnings. It keeps hard coverage policies as errors.
- Observation: Google Maps returned an authentication failure in the local production browser.
  Evidence: The editor now shows an explicit map-unavailable status. It keeps coordinate validation strict and does not save a fake location.
- Observation: Required and numeric validation messages identify the field and the recovery action.
  Evidence: The browser showed `Event image is required`, `Max participants is required`, and `Select at least one division` during invalid input checks.
- Observation: Focus rings, date values, and custom selects fit at 1365px and 390px widths.
  Evidence: The audited saved pages reported no horizontal overflow at either width.
- Observation: Animated sections must allow overflow when they contain an opened custom menu.
  Evidence: Playoff placement and pricing menus were clipped by the section's collapsed-content overflow rule.
- Observation: The simple Event Type control needs an explicit accessible name because its visual label is not a native label.
  Evidence: The final control uses `aria-label="Event type"` and keeps the existing visual layout.
- Observation: Valid short one-off, tryout, and weekly windows must remain unchanged during event-type transitions.
  Evidence: The configuration helper now applies minimum durations only to team events and keeps a 30-minute one-off window.
- Observation: The external Maps provider boundary stays unmocked in tests.
  Evidence: The browser verified the explicit unavailable-map status after the provider returned an authentication failure.

## Decision Log

- Decision: Use the local production server and local database for the full browser audit.
  Rationale: The request requires real end-to-end saves, while the local environment avoids writing test data to the live database.
  Date/Author: 2026-03-08 / Codex
- Decision: Keep the audit findings in this ExecPlan.
  Rationale: The user asked for notes. The plan preserves blockers, evidence, decisions, and final proof in one repository artifact.
  Date/Author: 2026-03-08 / Codex

## Outcomes & Retrospective

The repaired browser audit saved all four event types in the local database:

- Tournament: `/events/f5d0c2c7-0a56-4b8c-9b70-52dcd7ef0ef3/schedule?mode=edit&tab=details`
- League: `/events/f7030f82-3d69-407c-80a5-aa6ed0a21cbe/schedule?mode=edit&tab=details`
- One-off event: `/events/d9a338cb-37e2-4b77-bfa4-a2d19bc31dc8/schedule?tab=details`
- Repeating weekly event: `/events/3608d232-cac1-4427-995d-0d1c96bfc200/schedule?mode=edit&tab=details`

The tournament and league proposals showed unassigned official slots as warnings under best-effort staffing. The accept action then saved the event. The first league accept attempt returned a stale-proposal message. Rejecting that proposal and creating a fresh proposal saved the event.

The one-off event used a fixed one-hour window. The weekly event used an open-ended Monday timeslot from 9:00 AM to 11:00 AM on Court 1.

The local Maps key is not valid for this browser. The fallback status is clear. The form still requires real coordinates before save.

The final focused test suites, TypeScript check, changed-file lint, production build, and production restart passed. The browser confirmed the guest create-event guard and the rebuilt public site. The saved event URLs above remain the full-flow audit evidence.

The audit is complete. Issue #124 remains closed. The delivery comment records the commit and verification.

## Context and Orientation

The create surface is rendered by `apps/site/src/app/events/[id]/schedule/page.tsx` and `apps/site/src/app/events/[id]/schedule/schedulePage/CreateEventScheduleView.tsx`. `EventForm` and its sections live under `apps/site/src/app/events/[id]/components`. Shared BracketIQ controls live in `apps/site/src/components/organization/organization-operation-ui.tsx`. Guest onboarding lives in `apps/site/src/app/onboarding/page.tsx` and `apps/site/src/components/onboarding/GuestIntentOnboarding.tsx`.

The browser process named `site-ui-production` serves the built site on port `3160`. Port `3000` is occupied by an unrelated listener. The local database is selected by the copied environment files. Do not print secret values.

## Context Boundary

Read the named create-page, create-view, event form, shared-control, onboarding, and API contract files first. Read the exact API route only when a browser flow reaches that route or a request fails. Read existing tests beside any changed component. Do not expand into mobile or unrelated schedule operations unless the create-flow audit proves a dependency.

## Plan of Work

First, establish a browser feedback loop for each event type. Record the URL, visible fields, control dimensions, validation messages, request status, and save result. Use desktop and mobile viewports. Use invalid values where the form accepts numeric, date, or required text input.

Next, repair the smallest shared seam that explains each failure. The event type control must use the owned BracketIQ select. Text fields must keep padding and visible focus rings inside their field frame. Date fields must show the complete value and preserve local date and time. Invalid values must produce field-level messages and an actionable summary. Layout changes must remove accidental empty gaps without changing form state, API payloads, or lifecycle behavior.

Finally, run focused tests, type checking, lint, and a production build. Restart the authorized production process. Repeat the four flows and inspect console, network, overflow, focus, and error states.

## Concrete Steps

Run site commands from `apps/site`.

    npm run test -- --runInBand <focused test paths>
    npx tsc --noEmit
    npm run lint
    npm run build

Start the built server with `npm start -- --port 3160`. Use the browser at `http://127.0.0.1:3160`. Keep all environment values redacted in notes and output.

## Validation and Acceptance

Acceptance requires all four flows to reach a successful save in the local database: a tournament, a league, a one-off event, and a repeating weekly event. The event type field must use the BracketIQ dropdown visual language. Every focused text field must show a complete border and readable value. Date and time values must fit at desktop and mobile widths. Invalid required, numeric, and date inputs must show a specific message near the field and a usable recovery path. No audited viewport may have horizontal overflow or unexplained layout gaps.

The browser proof must include the final URL or saved event identifier for each flow, visible validation states, viewport widths, and any non-blocking console warnings. Tests must cover each repaired shared behavior rather than implementation details.

## Idempotence and Recovery

Use unique test names and dates for each run. If a save creates a local record, keep its identifier in this plan. Do not use the live database. If the server stops, rebuild only when source or environment inputs changed, then restart the named process on port `3160`. Do not stop unrelated processes.

## Artifacts and Notes

Add concise browser observations and command results under `Surprises & Discoveries` and `Outcomes & Retrospective`. Do not include credentials, tokens, cookies, or full database URLs.

## Interfaces and Dependencies

Use the existing `apiRequest` client, `EventForm` lifecycle, event editor snapshot contract, and shared controls. Do not introduce a second form state model or a parallel select implementation. The final surface must preserve the existing create and save HTTP contracts.
