# Harden Mobile Event/Field Update Payloads for Ownership Safety

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This file follows `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, mobile update requests will align with stricter backend ownership rules so routine event/field edits cannot mutate field ownership accidentally. The primary user-visible behavior is that rebuilding/rescheduling from mobile no longer causes field ownership drift, and mobile field updates avoid immutable ownership writes.

## Progress

- [x] (2026-04-01 21:20Z) Audited mobile event and field update payload builders (`EventRepository`, `EventDetailComponent`, `FieldRepository`).
- [x] (2026-04-01 21:32Z) Aligned mobile field PATCH payload to omit immutable ownership fields.
- [x] (2026-04-01 21:33Z) Kept mobile event update flow stable for this milestone and aligned behavior through backend ownership-preservation hardening.
- [x] (2026-04-01 21:47Z) Ran shared Kotlin compilation for touched modules and captured environment caveats.

## Surprises & Discoveries

- Observation: `EventDetailComponent` currently passes prepared nested `fields` and `timeSlots` into event PATCH calls during save/reschedule/build-brackets flows.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` around `prepareEventForUpdate()` and `eventRepository.updateEvent(...)` call sites.

- Observation: Mobile field PATCH currently sends `organizationId`, which conflicts with desired immutability.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/FieldRepository.kt` `FieldPatchPayload.organizationId`.

- Observation: The Kotlin daemon is unstable in this environment, but Gradle succeeds after fallback compile.
  Evidence: `:composeApp:compileCommonMainKotlinMetadata` first failed with daemon connection reset, second run with `--no-daemon` completed successfully.

## Decision Log

- Decision: Remove ownership mutation fields from mobile field PATCH payloads immediately.
  Rationale: This is low-risk and directly compatible with backend immutability enforcement.
  Date/Author: 2026-04-01 / Codex

- Decision: Keep event update behavior functionally intact while relying on backend ownership-preservation safeguards for nested field payloads in this milestone.
  Rationale: Full client-side replacement of nested schedule payload writes requires a broader multi-endpoint migration and should be staged separately.
  Date/Author: 2026-04-01 / Codex

## Outcomes & Retrospective

Completed for this milestone. Mobile field PATCH payload no longer includes `organizationId`, which aligns with backend immutability enforcement and prevents accidental ownership writes from field edits. Event update flow in mobile was intentionally left structurally unchanged in this pass; ownership drift risk is addressed by backend ownership-preservation in nested field upsert paths. Shared Kotlin compilation succeeded.

## Context and Orientation

The affected mobile files are:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/FieldRepository.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`

Backend contract source of truth is in `mvp-site`; this plan assumes backend enforcement that field ownership is immutable on patch/update paths.

## Plan of Work

First remove immutable ownership keys from field PATCH payload construction in mobile repositories. Then ensure event update calls remain compatible with backend ownership-preserving behavior without introducing regressions in rebuild/reschedule workflows. Finally run a shared-module compilation check for touched Kotlin files.

## Concrete Steps

From `mvp-app` root:

1. Edit `FieldRepository.kt` to stop sending `organizationId` in field patch payloads.
2. Adjust event update flow only where needed to stay compatible with backend hardening while preserving current UX flow.
3. Run:
   - `.\gradlew :composeApp:compileCommonMainKotlinMetadata`

## Validation and Acceptance

Acceptance is met when:

- Mobile field updates still work for editable field attributes (`name`, `location`, `lat/long`, `fieldNumber`, etc.) without sending ownership updates.
- Event save/reschedule/build-brackets calls compile and remain aligned with backend event update expectations.
- Shared Kotlin compilation succeeds for touched modules.

## Idempotence and Recovery

These are code-only edits and can be reapplied safely. If a regression appears, revert the touched repository/component files together.

## Artifacts and Notes

Validation command executed:

- `.\gradlew :composeApp:compileCommonMainKotlinMetadata --no-daemon`

## Interfaces and Dependencies

No new dependencies. Work is limited to existing repositories/components and DTO payload structures.

Revision Note (2026-04-01): Initial plan created before implementing mobile payload hardening aligned with backend ownership immutability.
Revision Note (2026-04-01): Updated with completed payload change, compile validation results, and explicit scope note that event-flow structural migration is staged.
