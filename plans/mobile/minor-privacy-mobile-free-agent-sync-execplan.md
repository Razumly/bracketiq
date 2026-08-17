# Mobile Minor Privacy and Team Free-Agent Sourcing

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `/Users/elesesy/StudioProjects/mvp-app/PLANS.md`.

## Purpose / Big Picture

After this change, mobile renders hidden users as `Name Hidden`, blocks social card actions for restricted minors, and stops relying on navigation-passed free-agent IDs. Team management will fetch free agents by team from backend current-event context so manager/parent exceptions are enforced server-side.

## Progress

- [x] (2026-03-15 18:42Z) Audited mobile user DTO/entity mapping, player card actions, team management free-agent dependency, and Room migration/version wiring.
- [ ] Add user privacy fields (`isMinor`, `isIdentityHidden`, `displayName`) to DTO/entity mapping and UI rendering.
- [ ] Disable message/friend/follow actions for hidden/restricted users in action cards.
- [ ] Replace navigation-passed free-agent dependency with team-scoped backend fetch in team management.
- [ ] Bump Room version + migrations and update schema snapshots.
- [ ] Add/adjust tests.

## Surprises & Discoveries

- Observation: Team management currently computes free agents only from nav-passed IDs (`freeAgents: List<String>`), not from team/event state.
  Evidence: `teamManagement/TeamManagementComponent.kt` `freeAgentsFiltered` flow.

## Decision Log

- Decision: Keep navigation parameters for backwards compatibility initially, but stop using free-agent IDs for data sourcing.
  Rationale: Minimizes routing churn while meeting requirement to source free agents from backend by selected team.
  Date/Author: 2026-03-15 / Codex

## Outcomes & Retrospective

Pending implementation.

## Context and Orientation

Relevant files are `core/data/dataTypes/UserData.kt`, `core/network/dto/AuthDtos.kt`, `core/presentation/composables/PlayerCardWithActions.kt`, `teamManagement/TeamManagementComponent.kt`, `core/data/repositories/TeamRepository.kt`, and Room migration files in `androidMain` and `iosMain`.

## Plan of Work

Extend user models and DTO parsing to include backend privacy fields and compute display name fallback to `Name Hidden` when required. Update action popup and card click behavior so social actions are disabled for hidden users. Add team repository call for `/api/teams/{id}/invite-free-agents`, and update team management to fetch free agents for selected team from that endpoint. Bump Room DB version and add migration adding new UserData columns.

## Concrete Steps

Run from `/Users/elesesy/StudioProjects/mvp-app`:

    ./gradlew :composeApp:testDebugUnitTest

    ./gradlew :composeApp:assembleDebug

## Validation and Acceptance

- Hidden users render `Name Hidden` in cards and dialogs.
- Action popup does not allow message/add-friend/follow for hidden users.
- Team management free-agent list loads from backend for selected team (no dependency on navigation free-agent payload).
- Room migration upgrades existing DB without destructive reset for new user columns.

## Idempotence and Recovery

Code changes are additive and safe to rerun. Migration is additive via `ALTER TABLE ... ADD COLUMN`; if migration partially fails, re-open DB with fixed migration sequence.

## Artifacts and Notes

Will append command outputs and schema/migration evidence after implementation.

## Interfaces and Dependencies

Use existing Ktor API client/repository pattern (`MvpApiClient`, repository interfaces) and Room migrations in `RoomMigrations.android.kt` / `iosMain/getDatabase.kt`.

Plan update note: Initial execution plan created before implementation to satisfy PLANS.md process for this cross-cutting feature.
