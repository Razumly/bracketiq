# Rebuild schedules without placeholder teams

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository contains `PLANS.md` at the repository root. This plan must be maintained in accordance with that file. The backend and web UI live in `C:\Users\samue\Documents\Code\mvp-site`; this mobile repository consumes that backend contract.

## Purpose / Big Picture

Event hosts can currently rebuild a league or tournament schedule with placeholder teams so the full capacity is scheduled before all teams register. When fewer real teams register, the host needs a second rebuild action that removes empty placeholder teams and rebuilds only from registered teams. After this change, both the mobile app and web app expose a "Rebuild Without Placeholders" action. Running that action sends an explicit schedule API option, rebuilds matches without padding the roster, cancels placeholder participant registrations, and deletes empty placeholder team rows. Running the normal rebuild later still creates fresh placeholder teams because the default API behavior remains unchanged.

## Progress

- [x] (2026-05-05 22:18Z) Read the placeholder team plan, mobile rebuild flow, web rebuild flow, schedule API route, scheduler padding logic, and roster persistence path.
- [x] (2026-05-05 22:42Z) Add a backend schedule option in `mvp-site` that defaults to existing placeholder behavior but can rebuild without placeholder padding.
- [x] (2026-05-05 22:48Z) Clean persisted placeholder registrations and team rows when the no-placeholder schedule option is used.
- [x] (2026-05-05 22:55Z) Wire the web event management menu to call the new API option.
- [x] (2026-05-05 23:02Z) Wire the mobile event detail edit actions to call the new API option.
- [x] (2026-05-05 23:08Z) Add focused backend/web tests and run validation. Mobile Gradle compiled but existing `EventRepositoryHttpTest` failures remain outside the scheduling path.
- [x] (2026-05-06 00:04Z) Trace manual participant team removal from mobile and web clients to the shared backend `DELETE /api/events/[eventId]/participants` route.
- [x] (2026-05-06 00:12Z) Adjust schedulable league/tournament removals so a registered event-team slot is reset back to a placeholder instead of being removed from the active participant roster.
- [x] (2026-05-06 00:23Z) Add regression coverage for manual removal resetting an event-team slot to `PLACEHOLDER` and keeping an active TEAM registration for the same slot id.

## Surprises & Discoveries

- Observation: `rg.exe` is blocked with "Access is denied" in this Windows shell.
  Evidence: the initial repository search failed before any code changes, so subsequent searches use `git grep` and PowerShell.
- Observation: Persisted placeholder slots are event team rows and active `EventRegistrations`, not only in-memory scheduler fillers.
  Evidence: `persistScheduledRosterTeams` creates team rows with `kind: captainId ? 'REGISTERED' : 'PLACEHOLDER'` and syncs `teamIds` into active participant registrations.
- Observation: Existing web and mobile rebuild flows already delete matches before scheduling with placeholders.
  Evidence: web `saveExistingEvent` calls `leagueService.deleteMatchesByEvent` for `buildBrackets`; mobile `buildBrackets` calls `matchRepository.deleteMatchesOfTournament` before `eventRepository.scheduleEvent(updated.id, participantCount)`.
- Observation: Mobile targeted validation compiled the changed Kotlin sources but failed in three unrelated `EventRepositoryHttpTest` cases.
  Evidence: `.\gradlew :composeApp:testDebugUnitTest --tests "*EventRepository*"` reported failures for `getEventsByIds_removes_stale_cached_events_missing_from_server`, `getEvent_removes_cached_event_when_server_returns_forbidden`, and `getCachedEventsFlow_clears_cached_events_when_current_user_changes`; none reference scheduling.
- Observation: Manual team removal already flowed through one shared backend route for both web and mobile.
  Evidence: web calls `eventService.removeTeamParticipant`, and mobile `EventRepository.removeTeamFromEvent` both send `DELETE /api/events/[eventId]/participants` with `teamId`.
- Observation: The route defined `isSlotProvisionedTeam` but did not use it in the removal branch.
  Evidence: `src/app/api/events/[eventId]/participants/route.ts` only cancelled the team registration and then synced division membership, which drops the slot from active participant team ids.

## Decision Log

- Decision: Add an explicit `includePlaceholderTeams` boolean to the schedule API request, defaulting to `true`.
  Rationale: Existing rebuild, preview, and create behavior must remain unchanged. The new button can opt out without changing old callers.
  Date/Author: 2026-05-05 / Codex
- Decision: The no-placeholder path removes empty placeholder slots before scheduling rather than reducing `maxParticipants`.
  Rationale: Capacity should remain a configured event setting. The scheduling roster is what changes for the one rebuild action.
  Date/Author: 2026-05-05 / Codex
- Decision: Persist cleanup belongs in the backend transaction, not only in mobile/web clients.
  Rationale: The backend is the data contract source of truth, and this keeps every client consistent.
  Date/Author: 2026-05-05 / Codex
- Decision: Manual removal of a registered league/tournament event-team slot should cancel the real team's registration, scrub the same event team row to an empty placeholder, and reactivate a placeholder TEAM registration for that slot.
  Rationale: Existing matches and division capacity point at the event-team slot id. Keeping that id active preserves the scheduled participant count until the host explicitly runs the no-placeholder rebuild.
  Date/Author: 2026-05-06 / Codex

## Outcomes & Retrospective

The backend now accepts `includePlaceholderTeams: false`, filters empty placeholder teams out of the scheduler roster, avoids placeholder capacity padding, bypasses preserve-existing-match rescheduling for that explicit rebuild, and deletes omitted placeholder team rows inside the schedule transaction. The web app exposes a More-menu action, and the mobile event edit screen exposes a confirmed rebuild-without-placeholders action. Normal rebuild behavior still passes participant capacity and defaults to placeholder creation.

Validation completed for `mvp-site`: targeted Jest passed and `npx tsc --noEmit` passed. Mobile Gradle validation compiled but the targeted `*EventRepository*` run failed in unrelated existing tests, so the remaining risk is not from the scheduling code path but from the repository test suite baseline.

Manual participant team removal now preserves schedulable league/tournament capacity by resetting the removed registered event-team slot to a placeholder and reactivating that slot's TEAM participant registration before division membership sync runs. Both canonical-parent removal and direct event-team id removal are covered. No mobile API change was required because both mobile and web already call the shared participants DELETE endpoint.

## Context and Orientation

`mvp-site/src/server/scheduler/scheduleEvent.ts` accepts a `ScheduleRequest` and invokes `EventBuilder`. `EventBuilder` pads league rosters up to `maxParticipants` by creating `Team` objects named `Place Holder N` with blank `captainId`. `mvp-site/src/server/repositories/events.ts` persists the scheduled roster in `persistScheduledRosterTeams`, where teams with blank `captainId` become `PLACEHOLDER` event team rows and active team participant registrations. The mobile app calls this API through `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`, using `ScheduleEventRequestDto`. The web app calls the same API through `src/lib/eventService.ts`.

The mobile action lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` and is rendered in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`. The web action lives in `mvp-site/src/app/events/[id]/schedule/page.tsx`.

## Plan of Work

First, extend the backend contract with `includePlaceholderTeams?: boolean` in both schedule route schemas and the scheduler `ScheduleRequest`. When the option is `false`, filter empty placeholder teams out of the scheduler event before building and disable `EventBuilder` roster padding. The default remains `true`.

Second, extend `persistScheduledRosterTeams` so callers can request removal of omitted placeholders. In that mode, it should cancel active participant registrations through the existing compatibility sync and delete event team rows for the same event whose id is no longer in the scheduled roster and whose row looks like an empty placeholder (`kind=PLACEHOLDER`, blank `captainId`, or a `Place Holder` name). The operation runs in the same schedule transaction.

Third, add UI actions. Web gets a new More-menu item, "Rebuild Without Placeholders", which uses the same rebuild save path but sends `includePlaceholderTeams: false` and does not pass a forced participant count. Mobile gets a matching edit-mode action and repository method argument.

Finally, add regression coverage: scheduler behavior without padding, schedule route forwarding and cleanup options, web service payload serialization, and mobile DTO/repository call behavior if practical in the existing tests.

## Concrete Steps

From `C:\Users\samue\Documents\Code\mvp-site`, edit `src/server/scheduler/scheduleEvent.ts`, `src/server/scheduler/EventBuilder.ts`, `src/server/repositories/events.ts`, `src/app/api/events/schedule/route.ts`, `src/app/api/events/[eventId]/schedule/route.ts`, `src/lib/eventService.ts`, and `src/app/events/[id]/schedule/page.tsx`.

From `C:\Users\samue\StudioProjects\mvp-app`, edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`, and `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`.

## Validation and Acceptance

Backend acceptance: a league with two real teams and a capacity of four schedules only two teams when `includePlaceholderTeams: false`, and the returned event has no `Place Holder` teams. The API route should call `scheduleEvent` rather than preserve existing placeholder matches when that option is false, save the new matches, and persist scheduled roster teams with placeholder cleanup enabled.

Web acceptance: in edit mode for a league or tournament, the More menu shows both normal "Rebuild" and "Rebuild Without Placeholders". The new action sends `includePlaceholderTeams: false`. The normal action still sends the participant count and uses placeholder behavior.

Mobile acceptance: in event edit mode where bracket rebuilding is available, the screen exposes a rebuild-without-placeholders action. It calls the schedule endpoint with `includePlaceholderTeams = false`; the existing build action still calls the endpoint with placeholder behavior.

Targeted commands:

    cd C:\Users\samue\Documents\Code\mvp-site
    npm test -- --runInBand src/server/scheduler/__tests__/leagueTimeSlots.test.ts src/app/api/events/__tests__/scheduleRoutes.test.ts src/lib/__tests__/eventService.test.ts

    cd C:\Users\samue\StudioProjects\mvp-app
    .\gradlew :composeApp:testDebugUnitTest --tests "*EventRepository*"

If the narrow Gradle test filter does not match existing tests, run `.\gradlew :composeApp:testDebugUnitTest`.

Actual validation run:

    cd C:\Users\samue\Documents\Code\mvp-site
    npm test -- --runInBand src/server/scheduler/__tests__/leagueTimeSlots.test.ts src/app/api/events/__tests__/scheduleRoutes.test.ts src/lib/__tests__/eventService.test.ts src/server/repositories/__tests__/events.upsert.test.ts
    Result: PASS, 4 suites and 119 tests.

    cd C:\Users\samue\Documents\Code\mvp-site
    npx tsc --noEmit
    Result: PASS.

    cd C:\Users\samue\StudioProjects\mvp-app
    .\gradlew :composeApp:testDebugUnitTest --tests "*EventRepository*"
    Result: FAIL, 30 tests run with 3 unrelated EventRepositoryHttpTest failures in batched-id URL encoding and cache-clearing expectations.

    cd C:\Users\samue\Documents\Code\mvp-site
    npm test -- --runInBand src/app/api/events/__tests__/participantsRoute.test.ts
    Result: PASS, 28 tests.

    cd C:\Users\samue\Documents\Code\mvp-site
    npx tsc --noEmit --pretty false
    Result: PASS.

## Idempotence and Recovery

The new API flag is optional, so old clients keep working. The no-placeholder cleanup deletes only omitted event-team rows that match placeholder markers in the current event. Re-running the no-placeholder action should leave the same real team roster and rebuilt matches. Re-running the normal rebuild should create new placeholder teams because `includePlaceholderTeams` defaults to true.

## Artifacts and Notes

Initial evidence:

    EventBuilder.ensurePlaceholderCapacity creates blank-captain teams named Place Holder N.
    persistScheduledRosterTeams persists blank-captain teams as kind PLACEHOLDER.
    Web and mobile normal rebuild flows delete existing matches before scheduling.

## Interfaces and Dependencies

`ScheduleRequest` in `mvp-site/src/server/scheduler/scheduleEvent.ts` must expose:

    includePlaceholderTeams?: boolean

`ScheduleEventRequestDto` in mobile must expose:

    val includePlaceholderTeams: Boolean? = null

The web service `eventService.scheduleEvent` options must expose:

    includePlaceholderTeams?: boolean

Revision note 2026-05-05: Initial plan created after tracing the cross-stack schedule rebuild flow. The plan records why the new behavior is an explicit API option and why persisted cleanup must happen server-side.

Revision note 2026-05-05: Updated progress, discoveries, outcomes, and validation after implementing the backend contract, web action, mobile action, and tests. The note records the remaining mobile test-suite failures as unrelated to the scheduling path.
