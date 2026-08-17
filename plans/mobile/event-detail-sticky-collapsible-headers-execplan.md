# Event Detail Sticky Collapsible Headers

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [PLANS.md](../PLANS.md) at the repository root.

## Purpose / Big Picture

After this change, every collapsible section on the mobile event detail screen keeps its title row pinned at the top of the scrolling content while the user scrolls through that section’s fields. The same title row still acts as the collapse toggle, so tapping the pinned header collapses the section immediately. A user can verify the behavior by opening an event with long collapsible sections, scrolling within the detail form, and observing the active section title remain visible until the next section takes over.

## Progress

- [x] (2026-04-03 22:31Z) Reviewed `PLANS.md`, located the shared collapsible section builder in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`, and confirmed all collapsible event-detail cards route through `animatedCardSection`.
- [x] (2026-04-03 22:38Z) Refactored `animatedCardSection` so collapsible sections now render as a sticky header item plus a separate animated body item, backed by shared per-section expansion state.
- [x] (2026-04-03 22:39Z) Ran `./gradlew :composeApp:compileDebugKotlinAndroid` successfully after the refactor.
- [ ] Manually verify the sticky behavior on device or simulator and inspect the seam between the sticky header and body while scrolling.

## Surprises & Discoveries

- Observation: The current collapsible UI is implemented inside a single `LazyColumn` item, which means the title row cannot become sticky without splitting the section into more than one lazy-list entry.
  Evidence: `animatedCardSection` currently emits one `item(key = sectionId)` that contains both the header row and the entire body card.
- Observation: In this Compose version, `stickyHeader` is available directly on `LazyListScope`; importing `androidx.compose.foundation.lazy.stickyHeader` caused a compile failure.
  Evidence: The first compile failed with `Unresolved reference 'stickyHeader'` on the import line, and the build succeeded after removing that import.

## Decision Log

- Decision: Implement sticky behavior at the shared `animatedCardSection` layer instead of patching individual sections.
  Rationale: Every collapsible event-detail card already routes through this helper, so one refactor applies the behavior uniformly and avoids per-section drift.
  Date/Author: 2026-04-03 / Codex
- Decision: Split expanded collapsible sections into two cards, a sticky header card and a separate body card, and overlap the body upward by `1.dp`.
  Rationale: This preserves lazy-list sticky-header behavior while minimizing the visible seam where the two bordered surfaces meet.
  Date/Author: 2026-04-03 / Codex

## Outcomes & Retrospective

The shared event-detail section renderer now supports sticky collapsible headers across all sections that opt into collapse behavior. The refactor stayed localized to `EventDetails.kt`, so the individual section content lambdas did not need to be rewritten. The Android debug compile succeeded, which confirms the new lazy-list structure is valid. The remaining gap is visual verification on a real device or simulator, especially to confirm the header/body overlap looks clean while the sticky header is pinned.

## Context and Orientation

The event detail and edit experience lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`. That file owns the large `EventDetails(...)` composable and the `LazyColumn` that renders the hero, summary card, and every form/detail section. The helper `animatedCardSection(...)` is a `LazyListScope` extension near the bottom of the file. It receives the section title, collapse settings, summary text, and view/edit content lambdas. Several sections such as “Basic Information” and “Event Details” call it with `collapsibleInEditMode = true` and `collapsibleInViewMode = true`, so it is the single source of truth for collapsible cards on this screen.

A sticky header in this repository means a `LazyColumn` item created with `stickyHeader { ... }`, which remains pinned to the top edge of the scrolling list until the next sticky header pushes it away. To make a section title sticky while its fields continue scrolling, the title must be emitted as its own sticky lazy-list item and the body must be emitted separately after it.

## Plan of Work

Update `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt` in three parts. First, introduce saveable expansion state storage that can be shared between the sticky header item and the section body item. The current `rememberSaveable` state lives inside a single lazy item, so it must be replaced with a state map owned by `EventDetails(...)` and read by `animatedCardSection(...)`.

Second, refactor `animatedCardSection(...)`. Keep the current single-card code path for non-collapsible sections. For collapsible sections, emit a `stickyHeader` that renders the clickable title row inside a card-like container, then emit a normal `item` for the body only when the section is expanded. Preserve the existing summary text when collapsed, preserve the required-missing badge and expand/collapse icon, and keep the no-horizontal-padding behavior added for collapsible cards.

Third, keep the visual styling coherent. The sticky header must have an opaque surface background so the scrolled content does not bleed through. When expanded, the title row should visually connect to the body by using top-rounded corners on the header and bottom-rounded corners on the body. If a small seam appears where the two pieces meet, overlap them slightly instead of changing unrelated section spacing.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-app`:

1. Edit `plans/event-detail-sticky-collapsible-headers-execplan.md` to keep this plan current while implementing the feature.
2. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`:
   - add the imports and opt-in needed for `stickyHeader`
   - add saveable section expansion state
   - split collapsible sections into sticky header and body rendering
3. Run:

       ./gradlew :composeApp:compileDebugKotlinAndroid

4. If the compile succeeds, manually verify on device or simulator when practical by opening an event detail screen with long collapsible sections and scrolling through them.

Expected compile transcript:

    > Task :composeApp:compileDebugKotlinAndroid
    BUILD SUCCESSFUL

## Validation and Acceptance

Acceptance is behavioral. In edit mode or view mode on the event detail screen, open a long collapsible section such as “Event Details”, scroll downward, and confirm the section title row remains pinned at the top of the viewport while that section’s fields scroll underneath it. Continue scrolling until the next collapsible section reaches the top and verify it replaces the previous sticky title. Tap the pinned title row and confirm the section collapses immediately and the body disappears.

Also run `./gradlew :composeApp:compileDebugKotlinAndroid` from the repository root and expect a successful build. If no simulator/device validation is available in this turn, record that as the remaining gap instead of guessing.

## Idempotence and Recovery

This refactor is safe to repeat because it only changes shared Compose rendering logic in `EventDetails.kt` and does not touch backend data or persisted models. If the sticky split introduces layout regressions, revert just the `animatedCardSection(...)` changes and restore the prior single-item implementation. The compile command is safe to rerun after each edit.

## Artifacts and Notes

Key source anchors before the refactor:

    composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt
      - `EventDetails(...)` owns the `LazyColumn`
      - `animatedCardSection(...)` currently emits one lazy item per section

## Interfaces and Dependencies

Use Jetpack Compose Foundation’s lazy list sticky-header support in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`. The helper `fun LazyListScope.animatedCardSection(...)` must still exist after the change because multiple sections call it directly. It should continue accepting the current section metadata and content lambdas, but it may gain additional internal state plumbing so the sticky header item and section body item share the same expanded/collapsed state.

Revision Note (2026-04-03 22:39Z): Updated this plan after implementation to record the shared sticky-header refactor, the compile validation result, and the remaining manual UI-check gap.
