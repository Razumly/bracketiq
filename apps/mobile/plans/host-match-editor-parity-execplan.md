# Bring the mobile host match editor to web parity

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

Event managers using the mobile app should be able to correct an entire match in one local draft, just as they can on the web. After this change, the mobile match dialog will show one numeric score-limit field per configured set, a match-specific segment label and count, a numeric `Segment length (min)` stepper for timed sports, direct team scores beside each segment's confirmation checkbox, editable match state, official check-ins, and a read-only preview. Changing the segment count will immediately resize both the score-limit fields and score rows. Confirming one segment will immediately unlock the next without saving or closing the dialog.

## Progress

- [x] (2026-07-20) Audited the existing Compose dialog, bulk event-match save path, match/rules data models, focused tests, and dirty worktree.
- [x] (2026-07-20) Added pure draft-state and policy helpers with six common tests.
- [x] (2026-07-20) Refactored the shared Compose dialog to use the typed local draft, direct per-segment fields, match state, officials, and preview.
- [x] (2026-07-20) Passed the combined 14-test focused Android batch and built the debug APK.
- [x] (2026-07-20) Exercised the authenticated rendered flow in the Android emulator and recorded UI-tree, screenshot, and clean logcat evidence.

## Surprises & Discoveries

- Observation: The current mobile dialog stores score limits as one comma-separated string and renders team score arrays independently with separate add/remove buttons.
  Evidence: `MatchEditDialog.kt` uses `policyTargetsText` and `IndividualScoreInputSection`, allowing the two teams' score-array lengths to drift from the configured match rules.

- Observation: Mobile event management already stages edited matches locally and submits them through one bulk repository call when the host commits event match changes.
  Evidence: `EventMatchEditActionHandler.commitMatchChanges` calls `matchRepository.updateMatchesBulk` through `EventMatchEditingCoordinator.commitChanges`.

- Observation: The available emulator initially had no authenticated session and the configured local API was offline.
  Evidence: After starting `npm run dev:plain`, the documented `host@example.com` seed account authenticated successfully and exposed the E2E Playoff League host-management flow. The rejected first fallback seed login was isolated from final smoke evidence.

## Decision Log

- Decision: Keep score and confirmation state in a typed local draft with one row per configured segment rather than editing the two legacy point arrays independently.
  Rationale: One draft row can synchronize `segments`, `team1Points`, `team2Points`, and `setResults` on save and can enforce ordered confirmation without a network write.
  Date/Author: 2026-07-20 / Codex

- Decision: Treat `matchRulesSnapshot` or `resolvedMatchRules` as the initial mobile policy source and write a new snapshot only when the host changes a policy field or a match snapshot already exists.
  Rationale: This matches the web persistence contract and avoids inventing a second event-only source of truth.
  Date/Author: 2026-07-20 / Codex

- Decision: Use a single-column mobile information hierarchy rather than copying the web modal's desktop columns.
  Rationale: Phone width cannot support two readable admin columns. The same panels and behaviors remain available in a scrollable order optimized for touch.
  Date/Author: 2026-07-20 / Codex

## Outcomes & Retrospective

The mobile host match editor now follows the same persistence and interaction contract as the web editor. A match-specific segment count owns the exact number of score-limit fields and score cards. The host can edit the label, count, timed segment minutes, match state, result type, direct scores, ordered confirmations, officials, check-ins, schedule, bracket links, and lock state in one staged draft. Save synchronizes modern segments and legacy score arrays before the existing event-level bulk commit.

The final focused batch passed 14 tests with zero failures: six `HostMatchEditDraftTest` cases, two `MatchEditDialogUiTest` cases, and six existing `EventMatchEditingCoordinatorTest` cases. `./gradlew :composeApp:assembleDebug --no-daemon --console=plain --quiet` also passed.

Authenticated emulator QA opened E2E Playoff League 19191, entered Schedule Manage mode, and opened Match #1. Increasing Set count from one to three immediately exposed `Set 1 score limit`, `Set 2 score limit`, and `Set 3 score limit`. In the same unsaved dialog, Set 3's checkbox changed from disabled to enabled immediately after entering a valid Set 2 score and confirming Set 2. The draft was cancelled instead of saved. Visual evidence is `/tmp/mvp_app_match_editor_set_count_3.png` and `/tmp/mvp_app_match_editor_set3_enabled.png`; UI hierarchy evidence is `/tmp/mvp_match_editor_set_count_3.xml` and `/tmp/mvp_match_editor_set3_now_enabled.xml`. A subsequent clean editor open/cancel produced an empty error-level log at `/tmp/mvp_app_match_editor_clean_smoke_logcat.txt`.

## Context and Orientation

`composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/MatchEditDialog.kt` is the shared Compose match editor used by Android and iOS event management. It receives a `MatchWithRelations`, edits a local copy, and returns that copy through `onConfirm`. It does not write the server immediately.

`composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventMatchEditingCoordinator.kt` stores that returned match in the event's editable match list. `EventMatchEditActionHandler.kt` later submits all staged creates, updates, and deletes through the bulk match endpoint. This bulk boundary is the atomic save path and must remain unchanged.

`MatchMVP` in `core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MatchMVP.kt` contains both modern `segments` and legacy `team1Points`, `team2Points`, and `setResults`. A segment is one set, half, quarter, period, inning, or total. `ResolvedMatchRulesMVP` contains the scoring model, segment count, singular segment label, per-set point targets, and timekeeping configuration.

The repository already has unrelated team/contact changes. This work must edit only the new plan, the match-edit draft helpers/tests, and `MatchEditDialog.kt` unless compilation proves a narrowly related change is required.

## Plan of Work

First, add a pure helper file under `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/`. Define a typed score-row draft, functions that build and resize rows from a `MatchMVP`, functions that resize and validate numeric score-limit inputs, ordered confirmation logic, and a final mapper that synchronizes modern segments with legacy score arrays and match lifecycle fields. Cover those functions in `commonTest` before wiring them into Compose.

Next, replace `policyTargetsText` and `IndividualScoreInputSection` in `MatchEditDialog.kt`. Initialize segment label, segment count, target fields, duration, score rows, match-started state, result type, forfeiting team, and reason from the selected match. Use direct numeric fields. The segment-count stepper must resize target fields and score rows in the same composition. Editing a completed score clears that row and all later confirmations. Confirming a valid row updates the local draft so the next checkbox enables immediately.

Then, add official check-in controls and a compact read-only preview. Individual event-official check-in state stays inside each `MatchOfficialAssignment`; the team-official check-in flag stays in `MatchMVP.officialCheckedIn`. Keep bracket, schedule, field, and lock controls on the same draft.

Finally, validate pure behavior, Android compilation, and a rendered emulator flow. The rendered scenario is: open event management, edit a three-set match, observe three limit fields and three score cards, change the count to four, enter the fourth target and score, confirm the current set and observe the next set enable without saving, then save and reopen the staged match.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-app`.

Run the focused regression batch with:

    ./gradlew :composeApp:testDebugUnitTest --tests '*HostMatchEditDraftTest*' --tests '*MatchEditDialogUiTest*' --tests '*EventMatchEditingCoordinatorTest*' --no-daemon --console=plain --quiet

Build the Android debug APK with JDK 17:

    ./gradlew :composeApp:assembleDebug --no-daemon --console=plain --quiet

For rendered QA, list devices with `adb devices`, install the debug variant if needed, launch the resolved package activity, navigate using UI-tree-derived coordinates, and capture screenshots plus crash/error logcat output under `/tmp`.

## Validation and Acceptance

A set-based match with `segmentCount = 3` and targets `[21, 21, 15]` visibly shows exactly three numeric score-limit fields and three score cards. Increasing the count to four immediately shows a fourth target field and fourth score card. Saving produces a four-entry `setPointTargets`, four `segments`, four `team1Points`, four `team2Points`, and four `setResults`.

The active singular label drives visible text: `Set`, `Half`, `Quarter`, `Period`, and `Inning` appear in count fields and score cards. Timed non-set formats show `Segment length (min)` as a numeric field with decrement and increment controls and store it in `matchRulesSnapshot.timekeeping.segmentDurationMinutes`.

Checking a valid first segment immediately enables the second checkbox. Editing the first segment afterward clears the first and all later confirmations. The match status, winner, and legacy arrays agree with the confirmed segment draft on save.

The focused tests pass, Android shared code compiles, and emulator QA shows no crash, framework error surface, clipped primary fields, or relevant logcat errors.

## Idempotence and Recovery

All changes are local Kotlin and Markdown files. Pure tests do not access production data. The event-management UI continues to stage edits until the existing event-level commit action, so emulator QA must not commit changes to a live production event. Preserve unrelated working-tree files and never reset the checkout.

## Artifacts and Notes

Rendered screenshots and logcat captures belong under `/tmp`, not in the repository. Record their paths and conclusions in this plan after validation.

## Interfaces and Dependencies

Do not add dependencies. Continue using Compose Material 3, `StandardTextField`, `MatchMVP`, `MatchSegmentMVP`, and `ResolvedMatchRulesMVP`.

The helper layer must expose typed, internal functions for building and resizing score drafts, checking ordered confirmation, editing scores, applying confirmation, building a match-policy snapshot, and producing a synchronized `MatchMVP`. `MatchEditDialog` remains source-compatible with its current call sites and still returns `MatchWithRelations` through `onConfirm`.

Plan revision note: Created on 2026-07-20 after auditing the current mobile dialog and the web parity contract. Completed the same day after focused unit/UI tests, final APK assembly, and authenticated emulator QA.
