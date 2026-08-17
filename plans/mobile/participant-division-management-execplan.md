# Add division selection to mobile participant invite and manage dialogs

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This file follows the repository-root `PLANS.md` standard for executable plans. It is self-contained so a future contributor can continue from only this file and the current checkout.

## Purpose / Big Picture

Split-division league events need a division choice anywhere a host adds or manages teams. After this change, mobile hosts in participant manage mode can open the invite-team dialog, pick the division before searching or adding a team, and the resulting registration is created for that division. Hosts can also open a team management dialog and move the existing team to another division using a selector under the team name. This mirrors the mvp-site schedule page, where the Add Team modal has an "Assign to division" select and the manage view moves teams by posting the team id plus the next division id to the participants endpoint.

## Progress

- [x] (2026-05-05T01:53Z) Inspected the mvp-site schedule page and participants route to confirm split-division behavior and persistence contract.
- [x] (2026-05-05T01:53Z) Created this ExecPlan before implementation.
- [x] (2026-05-05T02:15Z) Added a division selector above search in the mobile team invite dialog for split-division team events.
- [x] (2026-05-05T02:15Z) Added a division selector under the team name in the mobile manage dialog and persist team moves through a non-waitlist participants POST.
- [x] (2026-05-05T02:17Z) Compiled Android common code and ran focused repository and invite-dialog tests.

## Surprises & Discoveries

- Observation: mvp-site does not use a separate "move team division" endpoint. It reuses `POST /api/events/[eventId]/participants` with `teamId` and `divisionId`, and the backend updates the registered event team snapshot plus its EventRegistrations rows.
  Evidence: `src/app/events/[id]/schedule/page.tsx` has `mutateTeamParticipantMembership({ mode: 'move', divisionId })`, and `src/server/teams/teamMembership.ts` updates an existing registered event team inside `claimOrCreateEventTeamSnapshot`.

- Observation: mvp-site only builds participant division choices from non-playoff divisions.
  Evidence: `leagueDivisionOptions` and `participantDivisionColumns` skip divisions whose `kind` is `PLAYOFF`.

- Observation: The existing mobile `addTeamToEvent` helper includes capacity checks and can post to `/waitlist`.
  Evidence: `EventRepository.addTeamToEvent` calls `isEventAtCapacity(...)` before choosing between `api/events/{id}/waitlist` and `api/events/{id}/participants`.

- Observation: `ParticipantsView` is public, so the division option data class passed into it must also be public.
  Evidence: `:composeApp:compileDebugKotlinAndroid` initially failed with "public function exposes its internal parameter type argument 'EventDetailDivisionOption'"; making only the data class public fixed compilation.

## Decision Log

- Decision: Keep new team adds on `EventRepository.addTeamToEvent`, but add a separate mobile repository method for moving an already-registered team between divisions that always posts to `/participants`.
  Rationale: The backend source of truth uses the participants POST route for moves, but mobile's current add helper has waitlist routing for capacity. Moving an existing team should never become a waitlist action.
  Date/Author: 2026-05-05 / Codex

- Decision: Show the invite-team division selector only for split-division team events with more than one non-playoff division option.
  Rationale: The selector is unnecessary for single-division events and should not expose playoff divisions as registration targets.
  Date/Author: 2026-05-05 / Codex

## Outcomes & Retrospective

Completed. Mobile now has registration-division options derived from the event's non-playoff divisions, an invite-team dropdown that defaults to a valid registration division, and a manage-dialog dropdown that moves an existing team through the participants endpoint. The repository test confirms that move behavior does not route to waitlist even when the event is at capacity.

## Context and Orientation

The mobile screen lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`. The participant list and manage dialog live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/ParticipantsVeiw.kt`. The business logic interface and default implementation live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`. The HTTP repository method that creates team registrations lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`.

In this plan, "split-division event" means a team event, specifically a league-style event where `singleDivision` is false and there are at least two non-playoff division details. "Non-playoff division" means a division whose `kind` is not `PLAYOFF`; these are the divisions where teams register before scheduling. The web schedule page is the behavioral source of truth for this request.

## Plan of Work

First, expose a reusable mobile division-option shape in the event-detail package so both `EventDetailScreen.kt` and `ParticipantsVeiw.kt` can render the same option labels. The existing screen-local `BracketDivisionOption` already has the right fields, but it is private to one file, so the safer approach is to create a small shared data class and helper functions in the event-detail package.

Next, update `EventTeamInviteDialog` so it accepts a selected division id, a list of division options, and a callback. When there is more than one option, render a dropdown above the search field. The selected option should default to the same selected division the component already uses for registration, and changing the dropdown should call `component.selectDivision`.

Then, update `ParticipantsView` and `ParticipantManagementDialog` to accept division options and a move callback. For team targets only, the dialog title area should show the team name, then a division selector below it. Changing the selector should call a new component method that posts the team and next division to the existing participants endpoint. The dialog should leave player targets unchanged because the user asked for the team detail dialog selector.

Finally, compile and run focused tests. If existing unrelated tests fail, record the failure and the known reason.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-app`, inspect current changes with `git status --short --branch`. Edit the Kotlin files listed above using `apply_patch`. Compile with:

    ./gradlew :composeApp:compileDebugKotlinAndroid

Run focused UI or repository tests if the touched test files have relevant coverage:

    ./gradlew :composeApp:testDebugUnitTest --tests com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest

During this implementation, focused validation was:

    ./gradlew :composeApp:compileDebugKotlinAndroid
    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest.moveTeamParticipantDivision_posts_participants_endpoint_without_waitlist_routing"
    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.eventDetail.EventDetailInviteDialogUiTest.team_invite_selects_team_result"

## Validation and Acceptance

Compilation must pass for `:composeApp:compileDebugKotlinAndroid`. Human-visible acceptance is: in participant manage mode on a split-division team event, tapping invite team opens a dialog with a division dropdown above team search; selecting a division and adding a team posts that division to the backend. Tapping an existing team in manage mode opens a dialog where the team name is followed by a division selector; choosing a different division persists the move through the existing participants endpoint and refreshes participant data.

## Idempotence and Recovery

The implementation reuses existing POST semantics and local refresh behavior, so repeated selection of the current division is a no-op. If compilation fails, inspect the first Kotlin compiler error and repair the mismatched call sites rather than reverting unrelated dirty files. Do not discard the user's existing uncommitted work.

## Artifacts and Notes

Relevant validation output:

    BUILD SUCCESSFUL in 47s for :composeApp:compileDebugKotlinAndroid
    BUILD SUCCESSFUL in 57s for the focused move-team repository test
    BUILD SUCCESSFUL in 16s for the invite-dialog UI test

Relevant mvp-site evidence:

    const isSplitDivisionEvent = Boolean(eventType === 'LEAGUE' && !activeEvent?.singleDivision && leagueDivisionOptions.length > 0);
    await eventService.addTeamParticipant(targetEventId, { teamId: params.team.$id, divisionId: params.divisionId ?? undefined });
    await claimOrCreateEventTeamSnapshot({ eventId, canonicalTeamId: teamId, divisionId, divisionTypeId, divisionTypeKey });

## Interfaces and Dependencies

At completion, `EventDetailComponent` should expose a method equivalent to:

    fun moveTeamParticipantDivision(team: TeamWithPlayers, divisionId: String)

The default implementation should call a repository method equivalent to `eventRepository.moveTeamParticipantDivision(event, canonicalTeam, preferredDivisionId = divisionId, occurrence = occurrence)`, where `canonicalTeam` is the original team if it is already canonical, or a copy whose `id` is `parentTeamId` when the displayed team is an event-team snapshot. This repository method must post to `api/events/{eventId}/participants` directly and must not route through waitlist capacity checks.
