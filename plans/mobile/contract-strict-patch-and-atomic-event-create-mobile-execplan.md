# Contract-Strict Update Payload Migration + Atomic Event Create Command (Mobile)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This file follows `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, mobile no longer sends full-object payloads to strict patch routes and uses the atomic event create command contract (core event IDs-only + optional `newFields`, `timeSlots`, `leagueScoringConfig`). Weekly join flows can include session context directly in participants requests.

## Progress

- [x] (2026-04-01 22:07Z) Created consolidated mobile ExecPlan aligned with backend strict-contract rollout.
- [x] Update mobile event update DTO/payload generation to strict patch-compatible fields only.
- [x] Update mobile event create request to command contract (`event` + `newFields` + `timeSlots` + optional league config).
- [x] Update weekly join participants request DTOs for session context when joining weekly parent sessions.
- [x] Run shared Kotlin compilation for touched modules and capture outcomes.

## Surprises & Discoveries

- Observation: Mobile currently serializes `EventUpdateDto` with nested `fields` and `timeSlots` in general update path, conflicting with strict route contracts.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt` + `EventRepository.updateEvent`.

- Observation: Mobile create flow already has separate prepared local fields/time slots available before calling create, which maps naturally to command payload split.
  Evidence: `DefaultCreateEventComponent.prepareEventForCreation(...)` returns `(event, fields, timeSlots)`.

## Decision Log

- Decision: Keep strict create/update DTOs separate to avoid regression in existing call sites.
  Rationale: Clear contract mapping and safer staged migration.
  Date/Author: 2026-04-01 / Codex

- Decision: Prioritize strict route compatibility over minimal payload size for this milestone; then optimize to changed-field-only payloads where feasible.
  Rationale: Prevents immediate 400/403 contract breakage while preserving UX.
  Date/Author: 2026-04-01 / Codex

## Outcomes & Retrospective

Completed on branch `codex/strict-patch-atomic-event-create-app`.

Validation run summary:

- `./gradlew :composeApp:compileCommonMainKotlinMetadata --no-daemon`
- Result: successful (Windows host warnings for disabled iOS targets are expected in this environment).

Notable implementation details:

- `EventRepository.createEvent` now sends strict command payload:
  - top-level `id`, `event`, optional `newFields`, optional `timeSlots`, optional `leagueScoringConfig`.
- `EventRepository.updateEvent` now excludes immutable/disallowed nested relationship payloads (`organizationId`, `fields`, `timeSlots`) for strict PATCH compatibility.
- Participants request DTOs now support weekly session context (`sessionStart`, `sessionEnd`, `slotId`) for backend child-session resolution.

## Context and Orientation

The key files are:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`

Backend source-of-truth is `mvp-site`; this migration aligns mobile payloads to backend strict route schemas and create command shape.

## Plan of Work

First, introduce strict patch DTO mapping that excludes disallowed nested relationship objects. Next, introduce create command DTO containing core event + optional new fields/time slots/league config, and move create repository call to this DTO. Then update weekly participants request payload support for session context for parent weekly joins. Finally, run compile/test checks and adjust any failing call sites.

## Concrete Steps

From `mvp-app` root:

1. Edit `EventDtos.kt` for strict patch/create command DTO shapes and mappers.
2. Edit `EventRepository.kt` to use new DTOs in create/update/weekly join paths.
3. Edit event create/detail components only where payload contract wiring is required.
4. Run:
   - `.\gradlew :composeApp:compileCommonMainKotlinMetadata --no-daemon`

## Validation and Acceptance

Acceptance requires:

- Mobile update calls no longer include forbidden nested relationships for strict PATCH routes.
- Mobile create calls use command payload with `event` IDs-only relations and separate `newFields` / `timeSlots`.
- Weekly join payloads can include session context for backend auto-child resolution.
- Shared Kotlin compile succeeds.

## Idempotence and Recovery

Code-only changes are repeatable. If regressions are introduced, revert touched DTO/repository/component files together.

## Artifacts and Notes

Pending implementation outputs.

## Interfaces and Dependencies

No new external dependencies. Work is limited to existing Kotlin DTO/repository layers and feature components.

Revision Note (2026-04-01): Initial comprehensive mobile plan created for strict patch payload migration and atomic event create command adoption.
