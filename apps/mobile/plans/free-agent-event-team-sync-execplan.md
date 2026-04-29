# Free-Agent Invites With Event-Team Sync Mobile Parity

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. It covers only the mobile repository at `C:\Users\samue\StudioProjects\mvp-app`; the backend source of truth is implemented in `C:\Users\samue\Documents\Code\mvp-site`.

## Purpose / Big Picture

Team managers in the mobile app need the same player invite behavior as the web app. After this change, Team Management can show Free Agents, Invite User, and Invite by Email tabs, let managers select future event-team snapshots, and submit to the new `POST /api/teams/{id}/member-invites` endpoint. The shared `SearchPlayerDialog` remains available for chat and generic user-search flows.

## Progress

- [x] (2026-04-29 11:09-07:00) Created `codex/free-agent-event-team-sync` branch in `mvp-app`.
- [x] (2026-04-29 11:09-07:00) Reviewed Team Management, `SearchPlayerDialog`, DTOs, and `TeamRepository`.
- [ ] Add mobile DTOs and repository methods for extended free-agent context and member invites.
- [ ] Replace Team Management invite usage with a team-scoped dialog.
- [ ] Add or update unit/UI tests.
- [ ] Run `.\gradlew :composeApp:testDebugUnitTest` and, if clean, `.\gradlew :composeApp:assembleDebug`.

## Surprises & Discoveries

- Observation: `SearchPlayerDialog` is shared outside Team Management.
  Evidence: It lives under `core/presentation/composables`, while Team Management calls it from `CreateOrEditTeamScreen.kt`.

## Decision Log

- Decision: Add default interface methods for the new repository calls where possible.
  Rationale: The mobile test suite has many fake repository implementations; default methods preserve compile compatibility while the real repository uses the new backend API.
  Date/Author: 2026-04-29 / Codex
- Decision: Implement a new team invite dialog instead of modifying `SearchPlayerDialog`.
  Rationale: Event-team checkbox behavior is team-specific and should not appear in chat search.
  Date/Author: 2026-04-29 / Codex

## Outcomes & Retrospective

No mobile implementation outcome has been recorded yet.

## Context and Orientation

The mobile app is a Kotlin Multiplatform Compose project. Team Management state is in `composeApp/src/commonMain/kotlin/com/razumly/mvp/teamManagement/TeamManagementComponent.kt`. The Team Management screen delegates invite UI to `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/screens/CreateOrEditTeamScreen.kt`. Network DTOs live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto`, and API calls live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/TeamRepository.kt`.

## Plan of Work

Add serializable DTOs for `eventTeams`, `freeAgentEventsByUserId`, and `freeAgentEventTeamIdsByUserId`. Add domain models in the repository layer so UI code does not depend on raw network DTOs. Add a real repository method for `GET /api/teams/{id}/invite-free-agents` extended context and a new method for `POST /api/teams/{id}/member-invites`.

Then add a new Compose dialog for Team Management player invites. The dialog should have the same three tabs as the web UI, show first 10 free agents when search is empty, show event names beside free agents, and show event-team checkboxes before sending. Wire `CreateOrEditTeamScreen` and `TeamManagementComponent` to call the new repository method for player invites while preserving the existing generic `SearchPlayerDialog` elsewhere.

## Concrete Steps

Run commands from `C:\Users\samue\StudioProjects\mvp-app`:

    .\gradlew :composeApp:testDebugUnitTest
    .\gradlew :composeApp:assembleDebug

## Validation and Acceptance

The mobile Team Management invite action should open a team-scoped dialog with Free Agents, Invite User, and Invite by Email tabs. Selecting a free agent should precheck the event-team boxes from `freeAgentEventTeamIdsByUserId`. Submitting should call `createTeamMemberInvite` with the selected `eventTeamIds`. Existing chat/search flows using `SearchPlayerDialog` should continue rendering the old dialog.

## Idempotence and Recovery

The mobile changes are additive at the API boundary. If a fake repository fails to compile, add an override only where the test needs explicit behavior; otherwise keep the interface default method.

## Artifacts and Notes

No validation transcript has been recorded yet.

## Interfaces and Dependencies

The real repository must expose a context method shaped like:

    suspend fun getInviteFreeAgentContext(teamId: String): Result<TeamInviteFreeAgentContext>

The member invite method must accept:

    suspend fun createTeamMemberInvite(teamId: String, userId: String?, email: String?, role: RoleInviteType, eventTeamIds: List<String>): Result<Unit>

Revision note, 2026-04-29: Created this mobile ExecPlan after completing the site-side API and web implementation.
