# Create EventForm Parity In Compose Create Flow

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` will be updated during implementation.

## Purpose / Big Picture

Bring the compose create-event flow to parity with the web schedule form at:

- `/home/camka/Projects/MVP/mvp-site/src/app/events/[id]/schedule/components/EventForm.tsx`

Specifically, this implementation must include:

- Sport selection in create flow.
- League weekly time-slot editing in create flow.
- League field-count + field naming controls.
- Logical section grouping with collapsible edit sections to reduce vertical form noise.
- Same type-based gating/selection behavior already defined in the web form.

## Progress

- [x] (2026-02-12 22:22Z) Audited web form capabilities and mapped missing parity areas in compose create flow.
- [x] (2026-02-12 22:59Z) Added sports API DTO/repository + DI wiring for compose.
- [x] (2026-02-12 23:05Z) Added create/update time-slot and field create/update support in field repository.
- [x] (2026-02-12 23:31Z) Extended `CreateEventComponent` state/actions with sports, local fields, and league slots.
- [x] (2026-02-12 23:31Z) Added persistence flow to create named fields and league time slots before event create.
- [x] (2026-02-13 00:06Z) Added sport picker + league scheduling/facilities editor + collapsible grouped sections in `EventDetails`.
- [x] (2026-02-13 00:06Z) Added validation for required sport, league slot integrity, and league/tournament field count.
- [ ] Tests: `compileCommonMainKotlinMetadata` passes with JDK17; Android/JVM tasks blocked by local SDK build-tools corruption.

## Capability Matrix (Web -> Compose)

1. Basic information:
- Web: Event name, sport selection, description.
- Compose current: Event name + description only.
- Target: Add sport selection and validation.

2. Event details:
- Web: Event type, field type.
- Compose current: Event type, field type.
- Target: Keep parity and retain existing rental/type constraints.

3. Pricing + policy:
- Web: Price, participants/team size, refund/cutoff, payment plan toggles.
- Compose current: Price, participants/team size, refund/cutoff.
- Target: Keep current compose scope; no regression.

4. Field provisioning:
- Web: For league/tournament local setup, select field count and edit field names.
- Compose current: Tournament-only field count; no naming; no league field count control.
- Target: Add field count + naming for league/tournament.

5. Location & time:
- Web: Start/end with event-type gate (end only for EVENT).
- Compose current: Matching type gate already implemented.
- Target: Keep current behavior.

6. Event settings:
- Web: Divisions + team/single division gate by type.
- Compose current: Matching type gate already implemented.
- Target: Keep current behavior.

7. League configuration:
- Web: League config, weekly slots, optional playoffs config.
- Compose current: League config + playoffs config only.
- Target: Add weekly slots editor with same required inputs and gating.

8. Tournament configuration:
- Web: Tournament fields.
- Compose current: Tournament fields present.
- Target: Keep and ensure no regression.

9. Form ergonomics:
- Web: Distinct section blocks.
- Compose current: Long stacked cards.
- Target: Make edit sections collapsible with logical grouping labels.

## Plan of Work

### Sprint 1: Data + Component State Foundations
Goal: Expose all missing create-time data in shared layer and component state.

Tasks:

1. Add sports network DTO/repository and DI wiring.
- Location:
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/`
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/`
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/di/MVPRepositoryModule.kt`
- Acceptance:
  - New repository returns list of `Sport`.
  - `CreateEventComponent` can observe sports list.

2. Add field/time-slot create/update helpers in field repository.
- Location:
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/FieldRepository.kt`
- Acceptance:
  - Ability to create named fields by id.
  - Ability to create/update/delete time slots by id.

3. Extend `CreateEventComponent` interface + implementation state/actions.
- Location:
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt`
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/di/ComponentModule.kt`
- Acceptance:
  - New flows for sports/local fields/league slots.
  - Mutation methods for field count, field names, slot add/update/remove.

Demo/Validation:
- Component compiles with new interface contract.
- State flows update as expected from no-op command-level checks.

### Sprint 2: Create Flow Persistence Logic
Goal: Persist local fields + league slots as first-class resources before event create.

Tasks:

1. Replace count-only field creation in create flow with draft-driven creation.
- Location:
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt`
- Acceptance:
  - Field IDs on created event match created field records.
  - Field names and type are preserved.

2. Add league slot materialization before event create.
- Location:
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt`
- Acceptance:
  - For league create, `timeSlotIds` are created and attached.
  - Slot dates align with event start/end.

3. Keep rental flow and non-league flows behavior intact.
- Acceptance:
  - Rental create path remains EVENT-only and unaffected.

Demo/Validation:
- Local compile passes.
- No create-flow regressions in control paths.

### Sprint 3: UI Parity + Collapsible Groups
Goal: Implement missing UI parity and compact grouped UX.

Tasks:

1. Add sport picker to `EventDetails`.
- Location:
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventScreen.kt`
- Acceptance:
  - Sport dropdown renders from loaded sports.
  - Sport selection updates `editEvent.sportId`.

2. Add league scheduling editor UI section.
- Location:
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/`
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`
- Acceptance:
  - League section includes field count + names and weekly slot editor.
  - Slot rows support field/day/start/end/repeating + add/remove.

3. Make edit sections collapsible with logical grouping labels.
- Location:
  - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`
- Acceptance:
  - Edit-mode cards can collapse/expand.
  - Groups are labeled by workflow intent.

Demo/Validation:
- Create form shows all targeted sections with collapsible behavior.

### Sprint 4: Validation, Tests, and Hardening
Goal: Match behavior rules and verify correctness.

Tasks:

1. Add sport required validation.
2. Add league scheduling validation.
- At least one slot.
- Per-slot: field/day/start/end required and start < end.
- Field count >= 1 for league/tournament local provisioning.

3. Add/extend unit tests for state normalization and create preparation.
- Location:
  - `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/`

4. Run targeted gradle verification and record outcomes.

Demo/Validation:
- Targeted tests pass where environment supports.
- Compile checks pass.

## Testing Strategy

- Unit-test pure create selection and schedule normalization logic.
- Compile-check common metadata for UI and shared code.
- Run android unit-test compile/test tasks when SDK health allows.

## Potential Risks & Gotchas

- Android SDK toolchain corruption can block JVM unit tests.
- Existing event-detail edit flow also uses `EventDetails`; new params must remain backward-compatible.
- Time-slot day indexing must match web scheduler convention (Monday = 0).
- Field/time-slot creation order must ensure slot references point to existing fields.

## Rollback Plan

If regressions appear:

1. Revert create-flow persistence changes while keeping UI-only changes.
2. Revert slot editor integration separately from sport picker/collapsible UI.
3. Keep helper datatypes and selection-rule tests intact unless directly implicated.
