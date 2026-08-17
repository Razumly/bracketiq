# ExecPlan: Weekly Event Single-Instance Registration Cutover

Revision note: Initial draft created on 2026-04-12. This plan is the working source of truth for the weekly-event refactor across `/Users/elesesy/StudioProjects/mvp-app` and `/Users/elesesy/StudioProjects/mvp-site`. Update `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` as work proceeds.

## Purpose / Big Picture

Weekly events currently create child event records per selected session. That leaks occurrence handling into the event model, duplicates roster state, and makes billing, participants, compliance, and schedule views depend on both event arrays and registrations. This refactor removes that split model.

After this cutover, a weekly event remains a single parent event. Registrations become the only participation source of truth for all event types. A weekly registration is scoped by `slotId + occurrenceDate`, not by a child event id and not by cached session start/end timestamps. The app and site both select an occurrence directly from the parent event schedule and then read/manage occurrence-scoped registrations.

This is a hard cutover with migration. Existing weekly child event registrations must be migrated onto their parent event and associated to the correct `slotId + occurrenceDate`. Event-level roster arrays are removed. Waitlist and free-agent state move into registrations. Weekly events support both team signup and individual signup.

## Progress

- [x] `(2026-04-12)` Freeze the target contract in this ExecPlan and use it as the implementation checklist.
- [x] `(2026-04-12)` Audit every backend route and helper that reads or writes `event.userIds`, `event.teamIds`, `event.waitListIds`, or `event.freeAgentIds`.
- [x] `(2026-04-12)` Add registration schema changes in `mvp-site`. Migration logic is still outstanding.
- [ ] `(2026-04-12)` Rewrite registration, participant, waitlist, free-agent, billing, compliance, and schedule-count flows to use registrations only.
- [x] `(2026-04-12)` Remove weekly child-event creation and replace it with parent-occurrence selection on web and app.
- [x] `(2026-04-12)` Remove weekly team-signup forcing in the mobile create flow.
- [ ] `(2026-04-12)` Add backend-computed participant count/capacity for non-weekly list/detail surfaces only.
- [x] `(2026-04-12)` Add weekly occurrence fullness handling for selected occurrences only.
- [ ] `(2026-04-12)` Migrate legacy weekly child event participation into parent registrations and validate parity.
- [ ] `(2026-04-12)` Run backend, site, and app regression coverage.
- [x] `(2026-04-12)` Update this plan with in-flight outcomes and cleanup notes.
- [x] `(2026-04-12)` Add app-side current-user registration cache backed by Room/DataStore delta sync for weekly occurrence blocking.

## Surprises & Discoveries

- Current app weekly flow still calls `POST /api/events/{parentId}/weekly-sessions` from `EventDetailComponent.selectWeeklySession(...)` and navigates into a child event.
- Current site discover detail uses the same weekly-session creation flow instead of keeping selection on the parent event.
- The site event schedule page was still gating the `Schedule` tab to league/tournament events only, so weekly parent deep links with `slotId + occurrenceDate` updated the URL without exposing any visible selection UI. Weekly parents now need the same schedule tab, selected-occurrence badge, and selected-card state as other schedule-capable views.
- The `/events/[id]` details tab is backed by `EventDetailSheet`, which had its own weekly-session selector and never consumed the parent page's selected occurrence state. That prevented the title chip, occurrence-scoped participant hydration, and join controls from ever reflecting the selected weekly occurrence on the inline event page.
- The app currently forces `WEEKLY_EVENT` into `teamSignup = true` in `CreateEventSelectionRules.kt`, while the web form does not.
- Participant views on both sides still rely on event roster arrays and derived relations, not on a single participant endpoint backed by registrations.
- The backend already uses deterministic registration ids for billing on some paths, which should be preserved conceptually when weekly occurrence identity is introduced.
- Current registration status usage mixes lifecycle and roster intent. Waitlist and free-agent are still stored on `Event`, while consent progress updates registration status.
- Existing weekly child event records include `parentEvent` linkage today, but the target model should not require `parentEventId` after migration.
- The app can stay on its existing Room cross-ref model if the participant snapshot endpoint rewrites the local event roster view after each join/leave or weekly occurrence selection. That let the weekly cutover land without rewriting the entire mobile participant UI in one pass.
- `GET /api/events/[id]/participants` now works as the bridge contract for both the site and the app: the site consumes it directly, and the app uses it to repopulate local roster arrays/cross refs until those arrays can be deleted completely.
- The remaining hard blocker for a full cutover is data migration of historical weekly child rows. Runtime child-session creation is now disabled, but legacy child participation has not been folded into parent registrations yet.
- The backend runtime paths now accept `slotId + occurrenceDate` for weekly participation and billing flows, but full serializer cleanup is still pending because the app currently depends on snapshot-driven roster projections.
- Validation status after implementation: `pnpm exec tsc --noEmit` passed in `mvp-site`; `./gradlew :composeApp:assembleDebug` passed in `mvp-app`; targeted `EventRepositoryHttpTest` passed after updating mocks for the participant snapshot flow; the full Android unit suite still has two unrelated failures (`LeaguePlayoffMobileApiIntegrationTest`, `MatchCardOfficialSummaryTest`).
- The Prisma schema migration for the weekly registration cutover has been applied to the local `mvp-site` PostgreSQL database with `pnpm migrate:deploy`.
- The create-event schedule page was still trying to load `/api/events/{draftId}/participants` before the draft existed in the database. The fix was to short-circuit participant hydration in create mode and keep participants as an empty local draft state until the event is actually created.
- The organization-field hydration path in the web event form was keyed off the raw `resolvedOrganization.fields` array reference, which caused repeated `/api/fields?organizationId=...` requests when the organization payload was rehydrated with structurally identical field data. The fix was to depend on a stable field signature instead of the array identity.
- The web event serializer was still sending timeslot identity as `$id`, while the hardened `POST /api/events` route now validates `timeSlots[*].id`. That mismatch blocked both event creation and template creation whenever a schedule included timeslots. The serializer contract now normalizes timeslots to `id` before submission.
- The create-event flow could still fail with `Please fix the highlighted fields before submitting.` while showing no actionable field error. Two issues caused that: template creation bypassed full form validation, and the event-level `End Date & Time` picker did not render its validation message even when the schedulable-event schema rejected it. The submit banner now includes the first concrete validation messages, and the end picker now displays its own error text.
- The app-side weekly block state was still selection-racy even after switching weekly detail over to parent-occurrence selection. Occurrence participant sync writes were updating the shared event cache, so a stale occurrence response could temporarily make `isUserInEvent` disagree with the currently selected occurrence. A current-user registration cache is now needed as the source of truth for self/team occurrence blocking.

## Decision Log

- Decision: Registrations are the only participation source of truth for all event types.
  Reason: Event roster arrays duplicate state, force multi-path logic, and break weekly occurrence handling.

- Decision: Remove `userIds`, `teamIds`, `waitListIds`, and `freeAgentIds` from `Event`.
  Reason: All of these become registration-backed projections.

- Decision: Weekly occurrence identity is `slotId + occurrenceDate`.
  Reason: A weekly timeslot may recur on multiple days; the user considers one day within one slot to be the occurrence boundary.

- Decision: Do not add `sessionStart` or `sessionEnd` to the registration schema.
  Reason: They are redundant with `slotId + occurrenceDate` and the user explicitly removed them from scope.

- Decision: Weekly duplicate registration is blocked per `eventId + registrant + slotId + occurrenceDate`.
  Reason: A registrant may register multiple times in one week across different days or slots, but not twice for the same occurrence.

- Decision: Team events create one `TEAM` registration row per team, not one row per player.
  Reason: Team participation semantics remain team-scoped.

- Decision: Waitlist and free-agent state move into registrations through a roster-role field, while lifecycle state remains a separate status field.
  Reason: Roster placement and lifecycle are different concerns and should not overload one enum.

- Decision: Do not keep `PENDINGCONSENT`.
  Reason: Required-document completion should be derived from signed documents and event requirements, not stored as a long-lived registration state.

- Decision: Weekly events support both team signup and individual signup everywhere.
  Reason: Product requirement.

- Decision: Non-weekly event list/detail payloads may include backend-computed `participantCount` and `participantCapacity`.
  Reason: Client surfaces still need count/capacity display without downloading registration rows.

- Decision: Weekly events do not show event-level participant count.
  Reason: Weekly participation is occurrence-scoped and event-level totals are misleading.

- Decision: Weekly detail fullness is occurrence-scoped and shown only after selecting an occurrence.
  Reason: In weekly mode, users are functionally signing up for a day within a slot, not for a division abstractly.

- Decision: Existing weekly child event participation is migrated into parent registrations, then the system stops creating child weekly events.
  Reason: Hard cutover with data preservation.

## Context and Orientation

There are two codebases involved.

`/Users/elesesy/StudioProjects/mvp-site` is the backend and web source of truth for event schemas, API contracts, billing, compliance, and event detail behavior. Registration schema changes, migration logic, API rewrites, and web UI changes all start there.

`/Users/elesesy/StudioProjects/mvp-app` is the Kotlin Multiplatform client. It must be brought into contract parity after backend contracts are stable. App weekly detail, participant rendering, create/edit behavior, and floating-dock behavior all depend on the site contract.

The current weekly child-event implementation is spread across:
- backend weekly session resolution and creation route
- site event detail session selection
- app event detail session selection
- participant and billing flows that still expect event arrays or child event ids

The cutover must remove that entire pattern and replace it with parent-event occurrence selection plus occurrence-scoped registration APIs.

## Interfaces and Dependencies

### Registration schema

Extend `EventRegistrations` in `mvp-site` so it can represent all roster states and weekly occurrences:

- Keep:
  - `eventId`
  - `registrantId`
  - `registrantType` (`SELF`, `CHILD`, `TEAM`)
  - `status` for lifecycle only
  - division selection fields
  - created/updated metadata
- Add:
  - `rosterRole` enum with `PARTICIPANT`, `WAITLIST`, `FREE_AGENT`
  - `slotId` nullable for non-weekly, required for weekly registrations
  - `occurrenceDate` nullable for non-weekly, required for weekly registrations
- Remove lifecycle reliance on `PENDINGCONSENT`
- Enforce uniqueness:
  - non-weekly: one row per `eventId + registrantType + registrantId`
  - weekly: one row per `eventId + registrantType + registrantId + slotId + occurrenceDate`

Registration ids must remain deterministic:
- non-weekly:
  - self: `${eventId}__self__${userId}`
  - child: `${eventId}__child__${childId}`
  - team: `${eventId}__team__${teamId}`
- weekly:
  - self: `${eventId}__self__${userId}__${slotId}__${occurrenceDate}`
  - child: `${eventId}__child__${childId}__${slotId}__${occurrenceDate}`
  - team: `${eventId}__team__${teamId}__${slotId}__${occurrenceDate}`

### Event contract

Remove event roster arrays from backend and app/site DTOs:
- `userIds`
- `teamIds`
- `waitListIds`
- `freeAgentIds`

Add optional aggregate fields for non-weekly events:
- `participantCount`
- `participantCapacity`

Weekly events should return these as absent or `null`; clients must not render count UI for weekly parents.

### Weekly occurrence API input

Define one shared occurrence input shape everywhere weekly occurrence context is required:

- `slotId: string`
- `occurrenceDate: YYYY-MM-DD`

Use this on:
- registration create/update/delete routes
- participant query routes
- billing flows
- compliance/document lookups
- any join/manage action for weekly events

Reject occurrence params on non-weekly events.
Require occurrence params on weekly parent registration and participant flows.

### Participant endpoint

Standardize on `GET /api/events/[id]/participants` with:
- optional non-weekly mode: no occurrence params
- required weekly mode: `slotId` and `occurrenceDate`

Return registration-backed sections:
- `teams`
- `users`
- `children`
- `waitlist`
- `freeAgents`
- `participantCount`
- `participantCapacity`
- division metadata needed for manage/signup UI
- for weekly: occurrence-scoped fullness only

### Capacity rules

For non-weekly events:
- team-signup participant count = active `TEAM` registrations with `rosterRole = PARTICIPANT`
- individual participant count = active `SELF` and `CHILD` registrations with `rosterRole = PARTICIPANT`
- waitlist and free-agent rows never count
- participant capacity = event max if there is no meaningful division max breakdown, otherwise sum of division max values used for signup capacity

For weekly events:
- do not expose event-level count
- selected occurrence fullness = active participant registrations for the selected `slotId + occurrenceDate`
- selected occurrence capacity = summed applicable division max values, or event max when division-specific capacity is not the governing limit
- do not show weekly division fullness cards

## Plan of Work

### 1. Registration model cutover in `mvp-site`

First, move the backend to a coherent single-source registration model. This includes schema changes, deterministic id updates, route rewrites, and helper cleanup. No client should be updated until the backend contract is stable and migration logic exists.

The key outcome of this phase is that every participant-like state can be represented and queried from `EventRegistrations` alone, for both weekly and non-weekly events.

### 2. Weekly migration and child-event shutdown

Second, migrate all legacy weekly child participation into parent-event registrations keyed by `slotId + occurrenceDate`. Once migration validation passes, delete the runtime path that creates or resolves weekly child events. Weekly selection becomes UI state plus request parameters, not event creation.

The key outcome of this phase is that no new weekly child event records are created anywhere.

### 3. Web cutover in `mvp-site`

Third, rewrite the site event detail and schedule views to use selected parent occurrences. This includes the Schedule tab, selected-occurrence chip near the title, occurrence-scoped participants, occurrence-scoped fullness, and hiding the weekly division control in the floating dock.

The key outcome of this phase is that the web experience matches the target product behavior end to end.

### 4. App cutover in `mvp-app`

Fourth, bring the KMP app into the same contract and UX. Remove weekly child creation, store occurrence selection in screen state, render the removable button on mobile, hide the weekly division button, and fetch participants from the new endpoint.

The key outcome of this phase is that app and site share the same mental model and backend behavior.

### 5. Regression and cleanup

Last, remove dead code paths and validate league, tournament, compliance, billing, and schedule behavior that currently depends on event roster arrays or child weekly events.

The key outcome of this phase is a codebase with one participation model and no hidden dependencies on removed event fields.

## Concrete Steps

1. In `/Users/elesesy/StudioProjects/mvp-site`, audit all direct references to:
   - `userIds`
   - `teamIds`
   - `waitListIds`
   - `freeAgentIds`
   - weekly-session creation routes and helpers

   Use:
   - `rg "userIds|teamIds|waitListIds|freeAgentIds|weekly-sessions|parentEvent|PENDINGCONSENT" src prisma`
   - keep the output summarized in this ExecPlan under `Surprises & Discoveries`

2. Update Prisma schema:
   - add `rosterRole`
   - add `slotId`
   - add `occurrenceDate`
   - remove dependency on `PENDINGCONSENT` from the registration lifecycle model
   - add unique indexes for weekly and non-weekly registrations
   - keep existing division fields
   - keep deterministic registration ids compatible with billing/webhook lookups

3. Create a migration script in `mvp-site` that:
   - finds weekly child events
   - resolves their parent weekly event
   - derives `slotId` and `occurrenceDate` from child event timing and parent time slots
   - migrates participant, waitlist, and free-agent state into parent registrations
   - migrates division selections onto the new parent registration rows
   - updates dependent registration-linked systems to reference the parent registration ids where necessary
   - verifies no duplicate same-occurrence rows are created
   - writes a migration report with counts of:
     - child events processed
     - registrations created/updated
     - duplicates skipped or merged
     - unresolved child events, if any

4. Rewrite backend routes to read/write registrations only:
   - `/api/events/[eventId]/participants`
   - `/api/events/[eventId]/registrations/self`
   - `/api/events/[eventId]/registrations/child`
   - `/api/events/[eventId]/waitlist`
   - `/api/events/[eventId]/free-agents`
   - purchase intent, billing, webhook, compliance, signed-document helpers, and any participant-count helper

5. Remove weekly child-event creation paths:
   - delete `POST /api/events/[eventId]/weekly-sessions`
   - delete or retire `weeklySessionResolver.ts`
   - replace callers with occurrence-scoped registration and participant calls

6. Add backend event aggregate computation:
   - non-weekly list/detail/search endpoints return `participantCount` and `participantCapacity`
   - weekly list/detail/search endpoints suppress those fields
   - schedule-generation team counting for leagues/tournaments reads from registrations, not event arrays

7. Update site event detail and schedule pages:
   - add weekly Schedule tab on the parent event
   - render occurrences from parent `timeSlots`
   - store selected occurrence in URL query params: `slotId` and `occurrenceDate`
   - show selected occurrence chip beside the title with a red `x`
   - when nothing is selected, participants tab shows a prompt and disables participant-management actions
   - selected occurrence drives participant fetch, billing actions, compliance actions, and fullness display
   - hide the division button in the floating dock for weekly events
   - remove weekly division fullness cards and show occurrence fullness instead

8. Update app contract and UI:
   - remove `createWeeklySession(...)` from repository usage
   - remove navigation into weekly child events
   - add weekly occurrence selection state to the detail screen/component
   - render selected occurrence as a removable button in the mobile button island
   - hide the division button on the weekly floating dock
   - fetch participants from the new participants endpoint
   - remove weekly team-signup forcing from create/edit rules
   - update app DTOs/models to remove roster arrays and consume optional participant aggregates for non-weekly events only

9. Remove dead code and stale assumptions:
   - event-array-based participant hydration
   - child-event-only weekly helper code
   - consent-status branching that assumes `PENDINGCONSENT`
   - any fallback logic that silently rehydrates event rosters from registrations

10. Update this ExecPlan after each completed phase:
   - mark `Progress`
   - add concrete issues found to `Surprises & Discoveries`
   - record any contract changes in `Decision Log`
   - capture final cleanup and risk notes in `Outcomes & Retrospective`

## Validation and Acceptance

### Backend correctness

- A non-weekly self registration creates one deterministic row and never writes to `Event.userIds`.
- A non-weekly child registration creates one deterministic row and never writes to `Event.userIds`.
- A non-weekly team registration creates one deterministic row and never writes to `Event.teamIds`.
- Waitlist and free-agent actions only update registration rows.
- Weekly self/child/team registrations require `slotId` and `occurrenceDate`.
- Weekly registration for the same occurrence twice is rejected.
- Weekly registration for a different day in the same slot is allowed.
- Division data remains on the same registration row and does not create duplicate participation rows.
- Compliance/document requirements are derived from signed documents and event requirements, not from `PENDINGCONSENT`.
- Purchase intent and webhook registration lookup still resolve deterministic ids.

### Migration correctness

- Every migrated weekly child participant appears on the parent event under the correct `slotId + occurrenceDate`.
- No migrated participant is lost.
- No duplicate same-occurrence registrations are created.
- Child-event division selections carry over correctly.
- Migration report totals match pre-cutover child-event participation counts.

### Web behavior

- Weekly parent detail shows a Schedule tab.
- Selecting an occurrence adds the selected chip near the event title.
- Clicking the chip `x` clears the selected occurrence.
- Participants tab is empty and non-mutating until an occurrence is selected.
- Weekly floating dock does not show division control.
- Weekly fullness shows selected-occurrence fullness only.
- Weekly individual and team signup both work.

### App behavior

- Weekly detail never creates or opens a child weekly event.
- Selecting an occurrence adds a removable button to the button island.
- Clearing the button removes the selection.
- Weekly floating dock hides division control.
- Weekly individual and team signup both work.
- App create/edit no longer forces `WEEKLY_EVENT` into team signup.

### Regression coverage

- League and tournament schedule/team counting still works from registration aggregates.
- Non-weekly event lists still display participant count and capacity.
- Billing, compliance, signed documents, and notifications still resolve the correct registrants.
- Deleting or editing an event no longer assumes event roster arrays exist.

## Idempotence and Recovery

- The migration must be idempotent. Running it twice should not create duplicate registrations for the same weekly occurrence.
- Migration should work in batches and record enough audit output to resume after failure.
- If a child event cannot be mapped to exactly one `slotId + occurrenceDate`, the migration must skip it, log it, and fail the overall job unless explicitly rerun with a repair step.
- Route rewrites should land behind passing tests before event arrays are physically removed from API serializers.
- If rollout fails after schema migration but before UI cutover, backend routes must still reject new weekly child creation and keep registrations authoritative. Do not reintroduce array writes as rollback logic.

## Artifacts and Notes

Implementation should leave behind:
- Prisma migration for registration schema changes
- migration script and migration report format
- backend tests for participant, registration, waitlist, free-agent, billing, and compliance flows
- site tests for weekly detail/schedule selection behavior
- app tests for weekly detail occurrence selection and create/edit rules

Expected working directories and verification commands:

In `/Users/elesesy/StudioProjects/mvp-site`:
- `pnpm test -- src/app/api/events/__tests__/participantsRoute.test.ts`
- `pnpm test -- src/app/api/events/__tests__/selfRegistrationRoute.test.ts`
- `pnpm test -- src/app/api/events/__tests__/childRegistrationRoute.test.ts`
- `pnpm test -- src/app/api/teams/[teamId]/compliance/__tests__/route.test.ts`
- `pnpm test -- src/app/api/billing/webhook/__tests__/route.test.ts`
- `pnpm test -- src/app/api/billing/bills/[billId]/pay/__tests__/route.test.ts`
- `pnpm test -- src/app/discover/components/__tests__/EventDetailSheet.test.tsx`

In `/Users/elesesy/StudioProjects/mvp-app`:
- `./gradlew :composeApp:testDebugUnitTest`
- `./gradlew :composeApp:assembleDebug`

If browser-only weekly behavior is hard to verify from tests alone, start the site dev server and use Chrome DevTools MCP to validate:
- selected occurrence query params
- participants empty state before selection
- chip clear behavior
- hidden weekly division control
- selected-occurrence fullness rendering

## Outcomes & Retrospective

Implementation is underway. Current state:

- Runtime weekly child-event creation is disabled. Web and app weekly detail now keep selection on the parent event and pass `slotId + occurrenceDate` into registration and billing calls.
- `EventRegistrations` now has `rosterRole`, `slotId`, and `occurrenceDate`, plus deterministic weekly registration ids and occurrence uniqueness at the schema level.
- The site schedule page and discover detail now route users into parent-weekly schedule selection instead of creating child events.
- The app detail flow now keeps selected weekly occurrence state locally, shows the removable mobile chip/button, hides the weekly division dock button, and hydrates participants through the new participant snapshot endpoint.
- Event roster arrays are still present as transitional client-side projections in the app and some backend/event serializers. They are no longer the runtime source of truth for the weekly flows that were cut over here.
- Historical weekly child-event migration is still outstanding, along with the final deletion of legacy roster-array fields from all contracts and any remaining downstream compliance/scheduling helpers.
