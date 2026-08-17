# Cross-Platform Team Role Management Alignment

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, mobile team details/edit screens support the same role model as web/backend: `manager`, `headCoach`, and `assistantCoaches`, with creator defaulting to manager+captain on create and role invites sent through the same invite APIs used for player invites.

## Progress

- [x] (2026-02-20 00:00Z) Mapped mobile team detail/edit and invite flow touchpoints.
- [x] (2026-02-20 00:00Z) Updated shared `Team`/DTO/network models for `headCoachId` and assistant-coach alias compatibility.
- [x] (2026-02-20 00:00Z) Updated repository invite APIs to fetch role invites and send role invites (`team_manager`, `team_head_coach`, `team_assistant_coach`).
- [x] (2026-02-20 00:00Z) Updated team management and team detail UI with role display and role invite actions.
- [ ] (2026-02-20 00:00Z) Full mobile unit test run blocked by pre-existing compile failures in `eventDetail/EventDetailScreen.kt` unrelated to this change.

## Surprises & Discoveries

- Observation: Mobile already has `managerId` and `coachIds`, but UI only exposed captain/player invite/edit pathways.
  Evidence: `CreateOrEditTeamDialog.kt` and `TeamDetailsDialog.kt` only rendered players/pending player lists before this change.

- Observation: Project-wide Android debug unit-test compile currently fails in unrelated event-withdrawal code.
  Evidence: `./gradlew :composeApp:testDebugUnitTest` fails in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt` with unresolved `WithdrawTarget*` symbols.

## Decision Log

- Decision: Preserve backward compatibility by keeping `coachIds` in persistence models while exposing assistant-coach naming in updated DTO/API payloads.
  Rationale: Existing backend payloads and local cache still use `coachIds`; this avoids local database churn while enabling new role semantics.
  Date/Author: 2026-02-20 / Codex

- Decision: Allow manager/head coach/assistant coach invites from team edit for existing teams first; keep creator defaults at team creation.
  Rationale: Creation path currently persists team first, while invite endpoints require a real `teamId`; this keeps flow stable without introducing partial pre-create invite state.
  Date/Author: 2026-02-20 / Codex

## Outcomes & Retrospective

Mobile model and repository surfaces are aligned with the new team role contract, and team management UI now exposes staff-role invites plus role labels for incoming invites. Verification is partial because project compile is currently blocked by unrelated existing errors in event detail withdrawal code.

## Context and Orientation

Primary mobile files:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Team.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/TeamDTO.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/TeamDtos.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/TeamRepository.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/teamManagement/CreateOrEditTeamDialog.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/TeamDetailsDialog.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/teamManagement/TeamManagementComponent.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/teamManagement/TeamManagementScreen.kt`

## Plan of Work

Align team model fields with backend updates, then extend invite API payload creation and acceptance logic to include role metadata. Update team details/edit UI with role sections and role-specific invite actions (matching player invite behavior where possible). Keep manager/captain permission checks for initiating role invites.

## Concrete Steps

From `mvp-app`:

1. Update `Team`, `TeamDTO`, and `TeamApiDto` role fields.
2. Update `TeamRepository` invite create/list helpers for role invites.
3. Update team management/detail composables for viewing and inviting manager/head coach/assistant coaches.
4. Run unit tests and compile checks.

## Validation and Acceptance

Executed:

- `./gradlew :composeApp:testDebugUnitTest`

Observed result:

- Task fails due unrelated unresolved `WithdrawTarget*` symbols in `eventDetail/EventDetailScreen.kt`.
- No direct failures surfaced in modified team-role files before the unrelated compile stop.

Acceptance achieved for implemented scope:

- Role fields now round-trip in team models/DTOs.
- Team management UI includes role invite actions.
- Incoming team invites include role labels and accept/decline uses invite endpoint flow.

## Idempotence and Recovery

Model and repository changes are additive and can be rerun safely. If API contract mismatch is found, keep fallback mapping (`coachIds`) until backend deploy is complete.

## Artifacts and Notes

Build artifact note:

- `:composeApp:testDebugUnitTest` fails in pre-existing withdrawal flow file, so full validation must be rerun after that branch conflict is resolved.

## Interfaces and Dependencies

- Depends on backend/web API changes in `mvp-site` for role invite types and team role fields.
- Mobile continues to use shared invite endpoint paths (`api/invites`, `api/invites/{id}`, `api/invites/{id}/accept`) and team routes.

Plan update note: Updated after implementation to record shipped mobile role-model/invite changes and current validation blocker.
