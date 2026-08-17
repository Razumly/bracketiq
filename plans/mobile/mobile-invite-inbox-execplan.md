# Mobile Invite Inbox Parity

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows [PLANS.md](/mnt/c/Users/samue/StudioProjects/mvp-app/PLANS.md) from the repository root.

## Purpose / Big Picture

Mobile currently only understands team invites, and it fetches them through a legacy query pattern that no longer matches the web/backend contract. After this change, a signed-in mobile user can open a dedicated Invites section from Profile, see pending organization, team, and event invites, notice the pending count from a badge on the Profile home action, and accept or decline the supported invite types from mobile.

The visible proof is straightforward: on a user with pending invites, Profile shows an Invites action with a badge count, the Invites screen groups pending organization/team/event invites, team and staff invites can be accepted or declined, and event invites can be opened or declined. Team Management continues to show team invites without duplicate rows.

## Progress

- [x] (2026-03-10 17:05Z) Audited `mvp-site` invite changes and confirmed the required mobile scope is inbox parity, not full staff-management parity.
- [ ] Add shared invite contract and repository methods for generic invite list/accept/decline and event batch fetch.
- [ ] Add profile invite count, navigation destination, badge, and invite inbox screen.
- [ ] Adapt Team Management to consume the normalized `TEAM` invite contract without duplicate queries.
- [ ] Run targeted tests and record outcomes.

## Surprises & Discoveries

- Observation: the backend now normalizes legacy team invite types to the single stored category `TEAM`, so mobile’s current `listTeamInvites()` implementation will duplicate rows by querying four legacy types.
  Evidence: `mvp-site/src/app/api/invites/route.ts` uses `normalizeInviteType()` in GET filtering, and mobile currently loops `player`, `team_manager`, `team_head_coach`, and `team_assistant_coach`.

- Observation: invite acceptance is no longer symmetric across invite kinds.
  Evidence: `mvp-site/src/app/api/invites/[id]/accept/route.ts` handles `STAFF` and `TEAM`, but returns `400` for non-team/eventless invites; event invites in web profile navigate to the event rather than POSTing accept.

## Decision Log

- Decision: keep generic invite list/accept/decline methods on `IUserRepository` instead of `ITeamRepository`.
  Rationale: the inbox is user-owned, spans three invite categories, and should not force team-specific dependencies into profile state.
  Date/Author: 2026-03-10 / Codex

- Decision: preserve the existing Team Management UI but switch its data source to the normalized `TEAM` invite list and shared role inference.
  Rationale: this keeps current team workflows intact while removing duplication caused by the old legacy-type loop.
  Date/Author: 2026-03-10 / Codex

- Decision: event invites will render `Open Event` and `Decline`, not `Accept`.
  Rationale: current backend behavior does not support accepting event invites through `/api/invites/{id}/accept`, and the web client reflects that limitation.
  Date/Author: 2026-03-10 / Codex

## Outcomes & Retrospective

Pending implementation.

## Context and Orientation

The relevant mobile code is split across three areas. Shared API contracts live under `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data` and `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network`. The current team-only invite flow lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/teamManagement/TeamManagementComponent.kt` and `TeamManagementScreen.kt`. Profile navigation and section screens live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/`.

The backend source of truth is the sibling `mvp-site` repository. The invite record now carries `type`, `status`, `staffTypes`, and optional `organizationId`, `teamId`, `eventId`, and `userId`. The normalized invite categories are `STAFF`, `TEAM`, and `EVENT`, with statuses `PENDING` and `DECLINED`. Legacy team role strings still appear when invites are created, but they are normalized by the server when stored and queried.

On mobile today, `Invite` lacks `staffTypes`, `TeamRepository.listTeamInvites()` issues four separate GETs for legacy team types, and profile has no invite screen or badge count. The implementation must align the shared model and repositories first, then build the profile UI on top.

## Plan of Work

First, update the invite contract in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Invite.kt` and `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/InviteDtos.kt` so mobile can deserialize the current backend payload, including `staffTypes`.

Next, extend `IUserRepository` and `UserRepository` with generic invite operations backed by `api/invites`, `api/invites/{id}/accept`, and `api/invites/{id}/decline`. At the same time, add `getEventsByIds()` to `IEventRepository` and `EventRepository` so the inbox can hydrate event records in a batched way using the backend `ids` query param. Then simplify `TeamRepository.listTeamInvites()` so it fetches only normalized `TEAM` invites, and change team decline behavior to call the new decline route instead of hard-deleting a single invite by id.

After the data layer is stable, add invite state to `ProfileComponent`: a count for pending invites, a screen state that stores pending invites plus hydrated organization/team/event maps, and action loading/error state. Add a new `ProfileConfig.Invites`, `ProfileComponent.Child.Invites`, `navigateToInvites()`, and a `ProfileInvitesScreen()` in `ProfileFeatureScreens.kt`. The screen should use the existing profile section scaffold, group pending invites by category, and reuse existing team/event cards where they fit.

Finally, update `ProfileHomeScreen.kt` to add an Invites action card with a badge overlay on the icon when pending invites exist, and adjust Team Management to consume the normalized `TEAM` invite list and the same team-role inference logic used by the inbox.

## Concrete Steps

From `/mnt/c/Users/samue/StudioProjects/mvp-app`:

1. Patch shared invite data types and repository interfaces.
2. Patch repository implementations and any test doubles impacted by the interface changes.
3. Patch profile navigation, state, and UI.
4. Patch Team Management invite loading/decline behavior.
5. Run targeted Gradle tests:

    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.UserRepositoryAuthTest"

    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.TeamRepositoryTeamsFetchTest"

    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.teamManagement.*"

If Team Management has no dedicated test class yet, replace the last command with the relevant repository/component tests added during implementation.

## Validation and Acceptance

Acceptance is behavioral:

1. A user with pending invites sees an Invites action on Profile with a numeric badge when the count is greater than zero.
2. Opening the Invites section shows pending organization/team/event invites without duplicate team rows.
3. Accepting a team invite removes it from the inbox and refreshes team membership-related caches.
4. Accepting a staff invite removes it from the inbox.
5. Declining any invite updates the inbox and does not rely on deleting the invite row.
6. Event invites render an action that opens the event details and a decline action; they do not show a broken accept action.
7. Team Management still lists team invites and uses the same backend contract.

## Idempotence and Recovery

All code edits are additive or localized refactors and are safe to re-run. If a test double fails to compile after an interface change, update that test fixture in the same pass rather than partially reverting the interface. If UI wiring compiles but a specific invite category is missing hydration, the safe fallback is to render a generic text row for that category while preserving action buttons.

## Artifacts and Notes

Key backend references used during implementation:

    mvp-site/src/app/api/invites/route.ts
    mvp-site/src/app/api/invites/[id]/accept/route.ts
    mvp-site/src/app/api/invites/[id]/decline/route.ts
    mvp-site/src/components/ui/ProfileInvitesSection.tsx

## Interfaces and Dependencies

The final implementation must expose these mobile-side interfaces:

    interface IUserRepository {
        suspend fun listInvites(userId: String, type: String? = null): Result<List<Invite>>
        suspend fun acceptInvite(inviteId: String): Result<Unit>
        suspend fun declineInvite(inviteId: String): Result<Unit>
    }

    interface IEventRepository {
        suspend fun getEventsByIds(eventIds: List<String>): Result<List<Event>>
    }

Profile state should include a dedicated invite screen model with pending count, loading/error flags, the invite rows, and hydrated subject records. The implementation should continue to use existing repositories for subject hydration: organizations through `IBillingRepository.getOrganizationsByIds`, teams through `ITeamRepository.getTeamsWithPlayers`, and events through the new `IEventRepository.getEventsByIds`.

Revision note: created this ExecPlan at implementation start to satisfy repository policy for complex, cross-cutting feature work.
