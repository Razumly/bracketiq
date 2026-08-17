# Migrate Field-Division Ownership To Division Field Maps

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` will be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, field eligibility by division is derived from division-owned field mappings (`division.fieldIds`) instead of legacy field-level division tags (`field.divisions`). This removes ambiguity when the same field is reused across events and aligns mobile and web behavior with the backend source of truth. Observable result: schedule filtering and validation use event division mappings, and the database no longer stores `Fields.divisions`.

## Progress

- [x] (2026-03-31 18:28Z) Audited current usage in `mvp-app` and `mvp-site` and identified migration touchpoints.
- [x] (2026-03-31 19:02Z) Implemented web filtering/form derivation updates in `mvp-site/src/app/events/[id]/schedule/components/EventForm.tsx` to stop deriving from `field.divisions`.
- [x] (2026-03-31 19:05Z) Implemented mobile division field filtering in `composeApp/.../EventDetailComponent.kt` using `divisionDetails.fieldIds` with fallback behavior when mapping is empty.
- [x] (2026-03-31 19:11Z) Removed backend read/write dependency on `Fields.divisions` in `mvp-site/src/server/repositories/events.ts`, `src/app/api/events/[eventId]/route.ts`, and `src/app/api/fields/*` routes.
- [x] (2026-03-31 19:14Z) Updated Prisma schema and added migration `20260331184500_remove_fields_divisions_column` to drop `Fields.divisions`; regenerated Prisma client.
- [x] (2026-03-31 19:17Z) Ran targeted mvp-site Jest suites for event upsert, event patch sanitize, and field routes; all passed. Mobile Gradle tests failed in environment during KSP init (`sun.awt.PlatformGraphicsInfo`).

## Surprises & Discoveries

- Observation: Backend already treats `field.divisions` as a compatibility mirror while canonical mapping exists in divisions.
  Evidence: `mvp-site/src/server/repositories/events.ts` upsert path comments and fallback chain around legacy field division map.

## Decision Log

- Decision: Perform migration in one slice across web, mobile, backend, and DB instead of phased compatibility-only rollout.
  Rationale: User explicitly requested immediate replacement and DB parameter removal.
  Date/Author: 2026-03-31 / Codex

## Outcomes & Retrospective

The migration now uses division-owned field mappings as the operational source for filtering in both web and mobile, and storage-level `Fields.divisions` has been removed from schema and persistence paths. Remaining gap: Android unit tests could not run in this shell due local KSP/AWT environment initialization failure, so mobile validation is partially blocked by environment rather than code failures.

## Context and Orientation

`mvp-app` (Kotlin Multiplatform) currently filters visible fields in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` using `field.divisions`. Division metadata already includes `fieldIds` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/DivisionDetail.kt`.

`mvp-site` (Next.js + Prisma) already models canonical division field ownership via `Divisions.fieldIds` in `prisma/schema.prisma`, but still stores and consumes legacy `Fields.divisions` in API routes, repository load/upsert flows, and form derivation fallback code.

## Plan of Work

First, update web client derivation and filtering logic to rely on event division mappings (`divisionFieldIds` and division details fieldIds) and stop deriving from `field.divisions`. Next, update mobile field filtering to compute allowed field ids from selected division detail and filter by field id membership. Then, remove `Fields.divisions` reads/writes in backend API/repository flows while keeping scheduler behavior via division map-driven field assignment. Finally, remove `divisions` from Prisma `Fields` model and add a migration to drop the column.

## Concrete Steps

From `C:\Users\samue\StudioProjects\mvp-app`:

    wsl -e sh -lc "cd /home/camka/Projects/MVP/mvp-site && rg -n -S 'field\.divisions|divisions: fieldDivisions|model Fields' src prisma"

    wsl -e sh -lc "cd /home/camka/Projects/MVP/mvp-site && npm test -- --runInBand src/server/scheduler/__tests__/leagueTimeSlots.test.ts"

    .\gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.eventDetail.*" --tests "com.razumly.mvp.eventCreate.*"

## Validation and Acceptance

Acceptance criteria:

1. Web schedule/event edit uses division field ownership only, and no path depends on `field.divisions` for division eligibility.
2. Mobile division field filtering uses `divisionDetails.fieldIds` and correctly falls back to “all event fields for selected division” when explicit mapping is absent.
3. Backend event load/schedule validation still works with division mappings and no `Fields.divisions` storage.
4. Prisma schema no longer includes `Fields.divisions`, with migration applied in code.
5. Targeted web and mobile regression tests pass.

## Idempotence and Recovery

All code edits are additive/refactor-safe until the final DB migration. If migration introduces issues, the rollback path is to restore `Fields.divisions` in schema and revert migration plus corresponding code paths.

## Artifacts and Notes

Key affected areas expected:

- `mvp-site/src/app/events/[id]/schedule/components/EventForm.tsx`
- `mvp-site/src/server/repositories/events.ts`
- `mvp-site/src/app/api/events/[eventId]/route.ts`
- `mvp-site/src/app/api/fields/*.ts`
- `mvp-site/prisma/schema.prisma` and new migration directory
- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`

## Interfaces and Dependencies

Division-to-field ownership interface should be:

- Web/backend: `divisionFieldIds: Record<string, string[]>` and `Division.fieldIds: string[]`.
- Mobile: `Event.divisionDetails[].fieldIds` as canonical source for division-specific field filtering.

Revision note (2026-03-31): Initial plan created to execute cross-repo migration requested by user.

Revision note (2026-03-31): Updated progress/outcomes after implementing web, backend, DB, and mobile filtering changes plus targeted test runs.
