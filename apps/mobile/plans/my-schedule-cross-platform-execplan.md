# Add Cross-Platform My Schedule Surface (Web + Mobile)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root and must be maintained in accordance with it.

## Purpose / Big Picture

Users need a dedicated "My Schedule" view that shows the events and matches they (or their teams) are involved in, with month/week/day navigation similar to existing event scheduling views. After this work, web users can open `My Schedule` from top navigation, and mobile users can open `My Schedule` from the profile action grid. The existing profile action label `Events` will be renamed to `Event Management` to clarify host-only scope.

## Progress

- [x] (2026-02-21 01:08Z) Audited existing web and mobile navigation, schedule UI components, and repository APIs to identify reusable building blocks.
- [x] (2026-02-21 01:24Z) Implemented batch schedule API endpoint in `mvp-site` at `src/app/api/profile/schedule/route.ts` and added route tests.
- [x] (2026-02-21 01:31Z) Implemented web `My Schedule` page and added navigation entry next to `My Organizations`.
- [x] (2026-02-21 01:46Z) Implemented mobile profile `My Schedule` action, profile route, repository fetch, and month/week/day schedule screen; renamed profile action label to `Event Management`.
- [ ] Validate with focused tests/builds and record results (completed: web route tests + eslint on changed files; remaining: full mobile compile is blocked by pre-existing unrelated `EventDetailScreen` errors).

## Surprises & Discoveries

- Observation: Web navigation currently has only `Discover`, `My Organizations`, and `Profile`; there is no existing top-level schedule entry to extend.
  Evidence: `mvp-site/src/components/layout/Navigation.tsx`.
- Observation: Mobile already has schedule-oriented calendar pieces (`HorizontalCalendar`, `WeekCalendar`) but they are split across features rather than a reusable profile schedule module.
  Evidence: `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/ScheduleView.kt`, `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt`.
- Observation: Full mobile compile currently fails from pre-existing unresolved withdrawal-target symbols in `EventDetailScreen`, unrelated to this schedule work.
  Evidence: `./gradlew :composeApp:compileDebugKotlinAndroid` fails on unresolved `WithdrawTargetOption` / `WithdrawTargetMembership` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`.

## Decision Log

- Decision: Implement a single backend batch endpoint (`/api/profile/schedule`) consumed by both web and mobile instead of each client orchestrating many calls.
  Rationale: Satisfies batch-loading standards and keeps client logic simpler/consistent.
  Date/Author: 2026-02-21 / Codex.
- Decision: Implement mobile `My Schedule` as a profile sub-screen (within `ProfileComponent` stack) instead of a top-level app tab.
  Rationale: Request specified profile entry point and existing profile architecture already supports sub-screens with pull-to-refresh.
  Date/Author: 2026-02-21 / Codex.

## Outcomes & Retrospective

The feature is implemented across backend, web navigation/page, and mobile profile flow. Web validation passed for endpoint tests and lint on changed files. Mobile validation is partially blocked by unrelated compile issues already present in `EventDetailScreen`; no compile errors were emitted from the newly added schedule files after fixing datetime imports.

## Context and Orientation

This change spans two repos:

- Backend + web UI source of truth: `/home/camka/Projects/MVP/mvp-site`.
- Mobile KMP app: `/mnt/c/Users/samue/StudioProjects/mvp-app`.

The web app already uses `react-big-calendar` for event scheduling in `mvp-site/src/app/events/[id]/schedule/components/LeagueCalendarView.tsx`. Mobile already has calendar primitives used by event detail and rentals. Profile action routing on mobile is managed by `ProfileComponent`, then rendered through `RootComponent` and `App.kt` child stack mappings.

## Plan of Work

First add a new authenticated API route in `mvp-site` that resolves the current user, computes involved events using user/team participation arrays, then returns events, involved matches, teams, and fields in one payload. Add route tests that validate participation filtering and batching behavior.

Then build the web page `/my-schedule` to fetch that payload and present calendar entries in month/week/day views. Add top-nav entry for discoverability.

Next add mobile repository support for `/api/profile/schedule`, add profile navigation config/state for a new `My Schedule` screen, add a profile action button with an explicit schedule icon, and implement the month/week/day schedule UI using existing calendar components.

## Concrete Steps

From `/home/camka/Projects/MVP/mvp-site`:

1. Add `src/app/api/profile/schedule/route.ts`.
2. Add `src/app/api/profile/schedule/__tests__/route.test.ts`.
3. Add `src/app/my-schedule/page.tsx`.
4. Update `src/components/layout/Navigation.tsx`.

From `/mnt/c/Users/samue/StudioProjects/mvp-app`:

1. Add schedule DTOs/repository method.
2. Extend profile component state/config/screen routing.
3. Add profile action and `My Schedule` screen UI.
4. Rename profile action label from `Events` to `Event Management`.

## Validation and Acceptance

- Web API: run route test for `/api/profile/schedule` and verify it returns expected batched entities for user/team participation.
- Web UI: run app, open `/my-schedule`, verify month/week/day controls and entries are visible; verify nav contains `My Schedule` next to `My Organizations`.
- Mobile: run compile/test task and confirm profile grid shows `My Schedule` action with icon, opens schedule screen, and `Events` action text is now `Event Management`.

## Idempotence and Recovery

All edits are additive and can be re-run safely. If any API shape mismatch appears during mobile parsing, adjust DTO mapping while preserving endpoint contract.

## Artifacts and Notes

To be filled with command/test transcripts during implementation.

## Interfaces and Dependencies

- Backend endpoint: `GET /api/profile/schedule`.
- Web consumer: `mvp-site/src/app/my-schedule/page.tsx` via `fetch`.
- Mobile consumer: `IEventRepository.getMySchedule()` backed by `MvpApiClient.get("api/profile/schedule")`.

Change log:
- 2026-02-21: Created initial ExecPlan to implement cross-platform My Schedule feature with shared batch backend endpoint.
- 2026-02-21: Updated progress and findings after implementation; documented mobile compile blocker as unrelated pre-existing issue.
