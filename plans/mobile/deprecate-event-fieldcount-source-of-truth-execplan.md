# Deprecate Event FieldCount As Source Of Truth

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `/PLANS.md` in this repository root and must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, event field totals are derived from actual linked fields (`fieldIds` and loaded `Field` records), not from a separately persisted `fieldCount` value that can drift. Users should always see the correct field count in Event Details even if legacy records have stale `fieldCount`.

## Progress

- [x] (2026-03-05 22:45Z) Verified the production issue with DB evidence: target event had `fieldCount=1` and `fieldIds.length=2`.
- [x] (2026-03-05 22:52Z) Patched `mvp-app` Event Details read path to derive count from linked fields.
- [x] (2026-03-05 23:05Z) Patched `mvp-app` create/edit DTO and state paths to stop writing event `fieldCount` as authoritative state.
- [x] (2026-03-05 23:15Z) Patched `mvp-site` save/load and scheduler paths to derive/ignore event `fieldCount` from linked fields.
- [x] (2026-03-05 23:31Z) Ran validation commands in both repositories (`:composeApp:compileDebugKotlinAndroid` and split-division schedule route Jest test).

## Surprises & Discoveries

- Observation: The failing event had two linked fields in DB but `Events.fieldCount` was stale at one.
  Evidence: Direct DB query on event `d55b88d0-4694-4eb8-bfa3-8b66bf2f620d` returned `fieldIdsLength=2` and `fieldCount=1`.
- Observation: Event Details view previously preferred `event.fieldCount` over loaded fields.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt` used `event.fieldCount ?: editableFields.size`.

## Decision Log

- Decision: Keep API/schema compatibility fields for now but de-authoritize event `fieldCount` everywhere.
  Rationale: Full schema removal is larger and riskier; deriving from `fieldIds` fixes behavior now without breaking older clients.
  Date/Author: 2026-03-05 / Codex
- Decision: Keep playoff division `playoffConfig.fieldCount` untouched in this pass.
  Rationale: That value is separate from event-level field cardinality and is still used by playoff scheduling configuration.
  Date/Author: 2026-03-05 / Codex

## Outcomes & Retrospective

The user-facing bug is addressed by removing dependence on stale event-level `fieldCount` in read and write paths. Remaining work is long-tail cleanup: removing deprecated `fieldCount` fields from public contracts and database schema after compatibility windows close.

## Context and Orientation

There are two codebases involved:

- `mvp-app` at `/mnt/c/Users/samue/StudioProjects/mvp-app` (Kotlin Multiplatform client).
- `mvp-site` at `/home/camka/Projects/MVP/mvp-site` (Next.js + Prisma backend/source of truth).

`fieldCount` historically existed as a scalar on events while true cardinality lived in `fieldIds` and field records. The bug occurred because these two values diverged.

## Plan of Work

Update event detail rendering and event DTO conversion in `mvp-app` so field totals are derived from linked fields. Remove write-time propagation of event `fieldCount` from create/edit flows. In `mvp-site`, ignore incoming event `fieldCount`, derive persisted/serialized count from `fieldIds` and loaded fields, and remove event-level `fieldCount` from schedule-impact routing filters so stale values do not trigger behavior changes.

## Concrete Steps

From `mvp-app`:

1. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt` to compute field count from `fieldIds` and loaded fields.
2. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt` to stop writing event `fieldCount`.
3. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`, `.../Event.kt`, `.../EventDTO.kt`, and `.../EventConfigs.kt` to de-authoritize serialized `fieldCount`.

From `mvp-site`:

1. Edit `src/server/repositories/events.ts` to derive event `fieldCount` from linked fields when saving/loading scheduler models.
2. Edit `src/app/api/events/[eventId]/route.ts` to stop treating event `fieldCount` as an update/schedule-impact field.
3. Edit `src/lib/eventService.ts`, `src/server/scheduler/types.ts`, `src/server/scheduler/EventBuilder.ts`, `src/server/scheduler/standings.ts`, and `src/server/scheduler/serialize.ts` to derive count from actual fields with legacy fallback only.

## Validation and Acceptance

Validation is complete when:

1. `mvp-app` compiles and Event Details shows the correct count for an event where `fieldIds` and `fieldCount` differ.
2. `mvp-site` type/tests compile for touched modules.
3. Event update payloads that omit or send stale `fieldCount` still result in correct derived count from `fieldIds`.

## Idempotence and Recovery

These edits are safe to re-apply because they are deterministic source-code changes. If rollback is needed, revert the specific touched files in each repository and re-run build/test commands.

## Artifacts and Notes

Key artifact: DB inspection for event `d55b88d0-4694-4eb8-bfa3-8b66bf2f620d` showed:

    {
      "name": "Beach Volleyball Tournament",
      "fieldCount": 1,
      "fieldIdsLength": 2
    }

## Interfaces and Dependencies

No new dependencies were introduced. Existing event data contracts remain backward compatible while deprecating event `fieldCount` as an authoritative value.

Plan revision note (2026-03-05): Initialized this ExecPlan after root-cause confirmation and implementation began, to document decisions, evidence, and validation requirements for the completed cross-repo refactor.
Plan revision note (2026-03-05): Updated `Progress` with final validation results after running compile/test commands in both repositories.
