# Event Detail Invite Participant Dock

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. It is stored under `plans/` as required by that file.

## Purpose / Big Picture

Event managers using the mobile event detail screen need the same participant-management entry point that exists on the web schedule page. After this change, the Participants tab bottom dock shows an invite action next to the section dropdown. For team-signup events, the action opens a team lookup and lets the manager add a team to the event. For non-team events, the action opens a player lookup and email invite flow so the manager can invite existing players or invite a player who only has an email address.

## Progress

- [x] (2026-05-04 17:55Z) Read `PLANS.md`, inspected the mobile event detail dock, existing mobile invite/search components, and the mvp-site schedule add team/add participant flow.
- [x] (2026-05-04 19:18Z) Added repository and component APIs for event team lookup, team participant adds, existing-player participant adds, and email-based event invites.
- [x] (2026-05-04 19:18Z) Added dock actions and mobile dialogs for team and player invite flows.
- [x] (2026-05-04 19:18Z) Added focused tests for request payloads, bounded team search, component behavior, and dialog behavior.
- [x] (2026-05-04 19:20Z) Ran targeted Gradle verification successfully.
- [x] (2026-05-04 19:37Z) Tightened team invite search so empty/one-character queries show no team list and results are filtered to the event sport.

## Surprises & Discoveries

- Observation: The web schedule page's "Add Team" flow adds a selected team through `/api/events/{eventId}/participants`, while non-team email participant invites use `/api/invites` with type `EVENT`.
  Evidence: `mvp-site/src/app/events/[id]/schedule/page.tsx` calls `mutateTeamParticipantMembership` for team adds and `userService.inviteUsersByEmail` with `type: 'EVENT'` for email participant invites.
- Observation: Mobile already has a shared `SearchPlayerDialog`, but it only supports a single email string and does not collect first and last name. The web participant email flow requires first name, last name, and email in its UI.
  Evidence: `SearchPlayerDialog.kt` exposes `onInviteByEmail(email)`, while the web schedule modal validates every email invite row for first name, last name, and email before sending.
- Observation: The mobile team repository can fetch team collections by organization or id, but it does not expose the web schedule page's broad searchable team pool.
  Evidence: `ITeamRepository` has `getTeamsByOrganization` and `getTeams(ids)`, while `mvp-site` loads `/api/teams?limit=200` and filters client-side.
- Observation: The web schedule page adds an existing searched participant through `/api/events/{eventId}/participants`; only email-only participant rows go through `/api/invites`.
  Evidence: `mutateUserParticipantMembership` posts `userId` to the participants route, while `handleInviteParticipantsByEmail` calls `userService.inviteUsersByEmail` with `type: 'EVENT'`.
- Observation: Opening the team invite dialog with an empty query returned the repository's bounded team pool, which could look like all database teams.
  Evidence: `EventDetailScreen.kt` called `searchInviteTeams("")`, and `TeamRepository.searchTeamsForEventInvite` treated blank query as match-all before the 2026-05-04 tightening.

## Decision Log

- Decision: Use `EventRepository.addTeamToEvent` for team-signup event team selection, not `/api/invites`.
  Rationale: This is the behavior implemented by the mvp-site schedule page's Add Team modal, and it preserves division and capacity routing already centralized in the mobile event repository.
  Date/Author: 2026-05-04 / Codex
- Decision: Use `UserRepository.createInvites` with `InviteCreateDto(type = "EVENT")` for non-team event player invites by email.
  Rationale: `/api/invites` is the current source-of-truth route for email EVENT invites and sends invite email for newly created placeholder accounts.
  Date/Author: 2026-05-04 / Codex
- Decision: Use `EventRepository.addPlayerToEvent` for existing-user player selection.
  Rationale: This matches the mvp-site schedule page: selected users are added as participants, while email rows create `EVENT` invite records.
  Date/Author: 2026-05-04 / Codex
- Decision: Add a new event-specific player invite dialog instead of extending `SearchPlayerDialog`.
  Rationale: The event schedule email flow needs first name, last name, and email fields, while `SearchPlayerDialog` is shared by other invite paths that intentionally only ask for an email.
  Date/Author: 2026-05-04 / Codex

## Outcomes & Retrospective

Implemented. The bottom participants dock now exposes `Invite Team` for team-signup events and `Invite Player` for non-team events when the current user can manage participants. Team search uses bounded team collection loading and selected teams are added through the event participants path. Player search excludes existing participants and adds selected users through the event participants path. The email tab collects first name, last name, and email, then creates `EVENT` invites through the existing invite repository path.

The final implementation stayed source-only and added focused tests rather than a broad UI redesign.

## Context and Orientation

The mobile app is a Kotlin Multiplatform project under `composeApp/`. The relevant screen is `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`. It renders a bottom floating dock for the Participants tab through `ParticipantsFloatingBar`. The current dock contains the participant-section dropdown, an optional Manage/Done button, and Back to details.

The screen is backed by `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`. `DefaultEventDetailComponent` already has access to `IUserRepository`, `ITeamRepository`, and `IEventRepository`, and it already exposes `suggestedUsers` plus `searchUsers(query)` for staff invite user lookup.

The backend source of truth is the sibling repo `/Users/elesesy/StudioProjects/mvp-site`. Its schedule page lives at `src/app/events/[id]/schedule/page.tsx`. For team-signup events, the web page searches teams and calls the event participants API to add a team. For non-team events, it searches users for direct participant add and uses `/api/invites` with `type: 'EVENT'` for email invitations.

## Plan of Work

First, extend `ITeamRepository` and `TeamRepository` with a searchable team-list method that uses existing collection endpoints: organization teams when an organization id is available, and `/api/teams?limit=200` for the general search pool. Filter locally by team name, sport, and division, and exclude already-participating teams. This keeps the request count bounded and avoids per-team API calls.

Second, extend `EventDetailComponent` with state for invite team suggestions and actions for searching teams, adding a selected team to the event, adding an existing player to a non-team event, and inviting an email address to a non-team event. Existing player selection should use the participants endpoint through `EventRepository.addPlayerToEvent`. Email invites should create `EVENT` invites through `UserRepository.createInvites`. Team selection should call `EventRepository.addTeamToEvent`, then refresh event details.

Third, update `ParticipantsFloatingBar` so managers see `Invite Team` beside the dropdown for team-signup events and `Invite Player` for non-team events. Add event-specific dialogs in `EventDetailScreen.kt`: one dialog for teams and one for players. The team dialog shows a search field and team results. The player dialog uses tabs for Search and Email, user suggestions from `component.suggestedUsers`, and email fields for first name, last name, and email.

Fourth, add tests. Repository tests should prove team search uses the expected `/api/teams?limit=200` endpoint and filters locally. UI tests should prove the new player dialog can submit an existing user and an email invite with names.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-app`.

1. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/TeamRepository.kt`.
2. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`.
3. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`.
4. Add or update focused tests under `composeApp/src/commonTest` and `composeApp/src/androidUnitTestDebug`.
5. Run targeted Gradle tests and update this plan with the observed results.

## Validation and Acceptance

Acceptance is user-visible. On a team-signup event where the current user can manage participants, opening the Participants tab shows `Invite Team` immediately after the participant-section dropdown. Tapping it opens team search. Selecting a team adds it through the same event participant path as the web schedule page.

On a non-team event where the current user can manage participants, the Participants tab dock shows `Invite Player`. Tapping it opens a player invite dialog. Searching by name shows player suggestions and selecting a player adds that user through the participants endpoint. Switching to Email allows entry of first name, last name, and email, then sends an event invite.

Targeted verification commands:

    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.TeamRepositoryTeamsFetchTest" --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest.addPlayerToEvent_posts_selected_user_to_participants_endpoint" --tests "com.razumly.mvp.eventDetail.EventDetailInviteDialogUiTest" --tests "com.razumly.mvp.eventDetail.EventDetailMobileJoinFlowTest.invitePlayerToEvent_adds_existing_user_to_event_participants" --tests "com.razumly.mvp.eventDetail.EventDetailMobileJoinFlowTest.invitePlayerToEventByEmail_creates_event_invite_with_name_and_email"

Result on 2026-05-04 after team-search tightening: `BUILD SUCCESSFUL in 19s`.

## Idempotence and Recovery

All changes are source-only and safe to re-run. If a UI change fails to compile, revert only the touched event detail screen/component files. If a repository contract fails, inspect `mvp-site/src/app/api/teams/route.ts` and `mvp-site/src/app/api/invites/route.ts` again before changing endpoint paths.

## Artifacts and Notes

Important source-of-truth snippets discovered during research:

    mvp-site schedule page: Add Team uses the event participants mutation path.
    mvp-site schedule page: Existing participant search uses the event participants mutation path.
    mvp-site schedule page: Email participant invites call /api/invites with type EVENT.
    mvp-app SearchPlayerDialog: email invite mode currently only returns one email string.

## Interfaces and Dependencies

In `TeamRepository.kt`, add an interface method:

    suspend fun searchTeamsForEventInvite(
        query: String,
        eventId: String? = null,
        organizationId: String? = null,
        excludeTeamIds: Set<String> = emptySet(),
        limit: Int = 200,
    ): Result<List<Team>>

In `EventDetailComponent.kt`, add state and functions:

    val inviteTeamSuggestions: StateFlow<List<Team>>
    val inviteTeamsLoading: StateFlow<Boolean>
    fun searchInviteTeams(query: String)
    fun inviteTeamToEvent(team: Team)
    fun invitePlayerToEvent(user: UserData)
    fun invitePlayerToEventByEmail(firstName: String, lastName: String, email: String)

In `EventRepository.kt`, add a manager-side participant helper for existing users:

    suspend fun addPlayerToEvent(
        event: Event,
        player: UserData,
        preferredDivisionId: String? = null,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<SelfRegistrationResult>

Plan revision note: Initial plan authored after inspecting both mobile and web source-of-truth participant invite flows.
