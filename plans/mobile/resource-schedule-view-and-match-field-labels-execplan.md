# Add Mobile Field-Oriented Schedule Mode and Match Field Labels

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at repository root and must remain compliant with its requirements.

## Purpose / Big Picture

Mobile users need the same field-first scheduling context that web users are getting. After this change, the schedule tab in event detail can switch between time-ordered and field-grouped presentation, giving a resource-like mobile view. Match cards will also consistently show which field a match is on, with fallback labels when full field relations are not available.

## Progress

- [x] (2026-02-17 19:28Z) Located schedule rendering in `eventDetail/composables/ScheduleView.kt` and tournament card rendering in `eventDetail/composables/MatchCard.kt`.
- [x] (2026-02-17 19:34Z) Added schedule view mode toggle (`By Time` / `By Field`) in `ScheduleView.kt` and field-grouped rendering for the selected day.
- [x] (2026-02-17 19:35Z) Added robust field label resolution in both schedule cards and tournament match cards (`MatchCard.kt`) with relation/name/number/id fallback.
- [x] (2026-02-17 19:36Z) Ran targeted Android/JVM validation (`compileDebugKotlinAndroid` + `testDebugUnitTest` scoped invocation); build and tests succeeded.

## Surprises & Discoveries

- Observation: Schedule list cards currently use `match.field?.fieldNumber` only, and bracket cards render `F: <number>` from a lookup that can return null.
  Evidence: `ScheduleView.kt` computes `fieldLabel = match.field?.fieldNumber?.toString() ?: "TBD"`; `MatchCard.kt` renders `F: ${fields.find(...)?....}`.
- Observation: The local Gradle pipeline starts or checks the local backend service during Android tasks.
  Evidence: `:composeApp:startLocalBackend` output reported “already running on http://localhost:3000”.

## Decision Log

- Decision: Implement a grouped-list “By field” mode instead of a full visual time-grid for each field.
  Rationale: The existing mobile schedule UX is list/calendar based; grouped sections provide resource semantics with lower complexity and better mobile readability.
  Date/Author: 2026-02-17 / Codex
- Decision: Keep chronological mode as the default and add field grouping as an explicit toggle.
  Rationale: Preserves existing behavior for users while enabling resource-like inspection without navigation surprises.
  Date/Author: 2026-02-17 / Codex

## Outcomes & Retrospective

Completed. Mobile schedule now supports a resource-like grouping mode by field and retains the existing chronological mode. Tournament and schedule match cards now consistently expose field information with fallback labels so cards do not show blank/null field metadata. Validation passed on a combined compile + unit-test run.

## Context and Orientation

`ScheduleView.kt` controls the mobile schedule tab UI for `DetailTab.SCHEDULE` in `EventDetailScreen.kt`. It already groups matches by date and shows cards in chronological order. `MatchCard.kt` is used in tournament bracket rendering and includes a small metadata section with match number and field info. Both places need stronger field-label fallback behavior to avoid blank or null displays.

## Plan of Work

Update `ScheduleView.kt` with a small mode selector so users can view the selected day as either chronological list or field-grouped sections. Keep existing date picker behavior unchanged. Build field grouping from match relation/name/number first and fallback to `fieldId` or `Unassigned`.

Update `MatchCard.kt` to centralize field label resolution and render a stable label string for every match card.

Keep all changes in shared `commonMain` so Android and iOS benefit together.

## Concrete Steps

Run from `/mnt/c/Users/samue/StudioProjects/mvp-app`:

1. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/ScheduleView.kt` for mode toggle and grouped field sections.
2. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/MatchCard.kt` for robust field label rendering.
3. Run targeted Gradle unit tests/compile checks for impacted event-detail code.

Expected command examples:

    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest"

## Validation and Acceptance

Acceptance is met when:

1. Schedule tab offers two modes: chronological and field-grouped.
2. Field-grouped mode clearly groups selected day matches under field headers.
3. Schedule cards and tournament match cards always show a non-empty field label.
4. Targeted Gradle validation succeeds.

## Idempotence and Recovery

UI-only changes are additive and safe to reapply. If grouping introduces UX regressions, keep default mode as chronological and preserve the grouping toggle for iterative tuning. If Gradle tasks fail due local environment constraints, record failure details and verify via compilation of touched files where possible.

## Artifacts and Notes

- Android/JVM validation:

    ./gradlew :composeApp:compileDebugKotlinAndroid :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest"

  Result: `BUILD SUCCESSFUL` (compile + unit test task execution completed).

## Interfaces and Dependencies

Use existing shared Compose components and data models:

- `MatchWithRelations`, `Field`, and existing event-detail flows.
- Material3 controls already in the module (`FilterChip`, `Card`, etc.).

No API contract changes are required for this work.

Revision note (2026-02-17 / Codex): Initial plan authored for mobile resource-like schedule grouping and match field-label reliability.
Revision note (2026-02-17 / Codex): Updated progress, discoveries, decisions, validation artifacts, and outcomes after implementation and Gradle verification.
