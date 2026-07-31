 # Rework match scorekeeping interactions and set-score details

 This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date in accordance with `PLANS.md`.

 ## Purpose / Big Picture

 Match officials should be able to score quickly without first deciphering which score belongs to which team. On the mobile match screen, each team will own a large half of the scoring area: tapping that half increases the team’s current score and swiping in any direction decreases it. The plus and minus controls will be removed. When the scoring surface first becomes available, a dark transparent instruction overlay will explain “Click to increase” and “Swipe to decrease”; tapping the overlay dismisses it.

 When an official expands Match Details for a multi-segment match, the two teams remain fixed in a left column while regulation segments run across the top in a horizontally scrollable score grid. This keeps team identity stable, makes cross-segment comparison compact, and scales to sports with many segments. Overtime is not synthesized in advance; an `OT` column appears only when the match data contains an overtime segment.

 The timer is the primary clock control. It is displayed as large flat text without a segment/status card; tapping the timer or its play/pause icon starts, stops, or resumes the clock. A routine clock stoppage does not change the match or segment status: both remain `IN_PROGRESS`, while clock-only metadata preserves the stop instant and accumulated stopped duration. Reset and segment confirmation remain hidden while regulation time is actively running, appearing only after the clock is stopped, the configured segment duration is reached, or the match is suspended.

 ## Progress

 - [x] (2026-07-14) Read the repository guidelines and `PLANS.md`; confirmed this feature requires a living ExecPlan under `plans/`.
 - [x] (2026-07-14) Inspected the existing match screen, score mutation path, details panel, and relevant tests.
 - [x] (2026-07-14) Implemented tap-to-increase and any-direction swipe-to-decrease on the official mobile score cards.
 - [x] (2026-07-14) Added the first-use gesture instruction overlay and its dismissal behavior.
 - [x] (2026-07-14) Replaced the horizontal Home/Away set table with a vertical named-team set breakdown.
 - [x] (2026-07-14) Updated the focused score UI test and added a vertical set-details UI test.
 - [x] (2026-07-14) Ran focused tests, Android compilation, and diff hygiene checks; Gradle test/compile execution is blocked by an unrelated pre-existing error in `DiscoverOrganizationCard.kt`.
 - [x] (2026-07-14) Wrote the final Outcomes & Retrospective entry after implementation review.
 - [x] (2026-07-30 22:26Z) Reopened the living plan after the user selected a compact fixed-team, horizontally scrolling segment grid instead of vertical segment cards.
 - [x] (2026-07-30 22:26Z) Audited the pre-match official control predicates, segment normalization, explicit segment `resultType`, existing Compose UI tests, and backend match segment contract.
 - [x] (2026-07-30 22:34Z) Implemented the fixed-team segment grid, compact regulation/overtime labels, one-row start/delay controls, and conditional confirm-action visibility.
 - [x] (2026-07-30 22:34Z) Added focused Compose tests for fixed team labels, horizontal segment scrolling, overtime labeling, one-row pre-match controls, and confirm-button appearance.
 - [x] (2026-07-30 22:44Z) Built the Android app, passed 13 focused Compose tests, installed on `emulator-5554`, and visually verified pre-match controls plus the fixed-team horizontally scrolling quarter grid.
 - [x] (2026-07-30 22:50Z) Removed the nested rounded grid card, separated every team/segment cell with aligned dividers, and added independent left/right hidden-column cues driven by the horizontal scroll state.
 - [x] (2026-07-30 22:50Z) Extended the scrolling regression test to verify right-only initially, both cues mid-scroll, left-only at the end, and the absence of a cue when no columns are hidden on that side; all 13 focused tests pass.
 - [x] (2026-07-30 23:20Z) Made match-action and bottom-dock buttons content-sized with standard Material button height instead of weighted/fixed 56dp controls.
 - [x] (2026-07-30 23:20Z) Restricted full-team winner styling to finished matches, stamped `endedAt` whenever a segment is confirmed, and stopped/finalized the clock when the last quarter completes.
- [x] (2026-07-30 23:20Z) Added final-quarter, reopen-on-last-quarter, timer-end, and pre-finish winner-visibility regressions; 75 focused component/UI tests pass.
- [x] (2026-07-30 23:42Z) Re-ran Quarter 4 confirmation through the installed Android app and local backend with a clean operation high-water mark; the accepted PATCH completed the match, stopped the timer, and persisted the same end instant on Quarter 4 and the match.
- [x] (2026-07-31 00:04Z) Passed the tapped schedule-card match and teams through navigation as transient preload data, so the destination renders its real identity, number, teams, and current score state on its first frame while Room and the network refresh in the background.
- [x] (2026-07-31 00:04Z) Preserved backend division ids as opaque values in match/team DTO mapping, tightened the segment grid, removed active/completed column fills, and retained winner emphasis only on the winning point value.
- [x] (2026-07-31 00:04Z) Passed 76 focused match component/UI tests plus `AppConfigSerializationTest`, built and installed the Android app, and verified the real QA fixture on `emulator-5554`, including a successful unchanged match save with the canonical division and checked-in official retained.
- [x] (2026-07-31 16:56Z) Reopened the plan for the flat timer/control redesign and audited the Compose timer derivation, component lifecycle operations, backend segment-operation schema, and existing UI/component tests.
- [x] (2026-07-31 16:56Z) Confirmed with the user that a stopped clock is ordinary game flow and must not introduce a `PAUSED` match or segment status.
- [x] (2026-07-31 17:29Z) Implemented persistent clock-only stop/resume metadata without changing match or segment status, including backend metadata merging and local optimistic application.
- [x] (2026-07-31 17:29Z) Flattened and enlarged the timer, removed redundant labels/containers and score-card incident buttons, and moved the conditionally visible incident action into Match Details.
- [x] (2026-07-31 17:43Z) Added timer/action and partial-schedule-cache regressions, passed the focused component/UI/repository/backend suites, built and installed Android, and exercised start/stop/resume against the local backend and Pixel emulator.

 ## Surprises & Discoveries

 - Observation: Score mutation already supports the required semantics. `MatchContentComponent.updateScore(isTeam1, increment)` updates the active segment, clamps decrements at zero, persists locally, and schedules the existing remote sync.
   Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt`, especially the `updateScore` method and its private `updateSegmentScore` helper.
 - Observation: The current main score cards are vertically stacked and each already receives a weighted portion of the available screen, so the new “team half” interaction can be implemented at the existing card boundary without changing match state layout.
   Evidence: `MatchDetailScreen.kt` renders two `ScoreCard` composables with `Modifier.weight(1f)`.
 - Observation: The existing set breakdown is in `MatchDetailsPanel.kt` as three horizontal rows labeled Set, Home, and Away, which is the source of the user’s ambiguity.
   Evidence: `MatchSegmentTable` renders the Home and Away rows with `HorizontalDivider` and horizontally scrolling set columns.
 - Observation: The checkout is already dirty with unrelated edits and untracked files. Changes must remain limited to the requested UI/test/plan files and must not reset or rewrite unrelated work.
   Evidence: `git status --short --branch` on 2026-07-14 showed many pre-existing modifications across `composeApp`, `core`, and generated/test paths.
 - Observation: The focused Gradle compile and test commands are blocked before the touched match UI can complete because the existing `DiscoverOrganizationCard.kt` source has nullable-property smart-cast errors.
   Evidence: Both `./gradlew :composeApp:compileDebugKotlinAndroid` and `./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.matchDetail.MatchIncidentUiTest'` report errors at lines 140-141 for `minPrice` and `maxPrice` in that unrelated file.
 - Observation: Match segments already carry an explicit nullable `resultType`, and the backend accepts values such as `OVERTIME`; no client-side guess based on score or label text is needed.
   Evidence: `core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MatchMVP.kt` defines `MatchSegmentMVP.resultType`, matching the segment operation schema in `mvp-site/src/app/api/events/[eventId]/matches/[matchId]/route.ts`.
 - Observation: The mobile component normalizes regulation segments but does not create a separate overtime column in the details UI.
   Evidence: `MatchContentComponent.resolveExpectedSetCount` and `normalizeSegments` preserve the persisted segment list/count, so rendering only `orderedSegments` naturally hides overtime until an overtime segment is persisted.
 - Observation: Four 72dp score columns do not fit beside the fixed 148dp team column on the Pixel emulator, so the horizontal affordance must be visible before the user tries to swipe.
   Evidence: The initial emulator tree showed `Q1` through `Q3` inside the `HorizontalScrollView` and hid `Q4`; the final build adds a right-edge fade/chevron while `ScrollState.canScrollForward` is true.
 - Observation: A rounded `surfaceVariant` container made the score matrix read as another card nested inside Match Details and obscured the table structure.
   Evidence: The reviewed emulator screenshot showed the fixed team column and scrollable segment columns inside one rounded rectangle even though their content is tabular.
 - Observation: Finalization already records `Matches.actualEnd`, but `completeCurrentSet()` previously left the confirmed segment’s `endedAt` null and the UI clock’s running predicate did not consider `matchFinished` or segment completion.
   Evidence: The local QA row was `COMPLETE` with `actualEnd = 2026-07-30 23:06:08.508`, while all four `MatchSegments.endedAt` values were null and the emulator still displayed Quarter 4 as Running.
 - Observation: `winnerEventTeamId` can be present while later segments remain unfinished, so using that field alone for a full score-card tint overstates a segment winner as the match winner.
   Evidence: The reviewed Quarter 2 screen tinted QA Blue green after its earlier segment win even though `matchFinished` was false.
 - Observation: A reopened completed match kept `currentSet` at its initial zero value because the component only resolved the current segment while the match was unfinished.
   Evidence: The first completed-fixture reinstall displayed Quarter 1 as Final; resolving the segment index for both active and finished matches selects Quarter 4 when every regulation segment is complete.
- Observation: The first fresh-device finalization attempt was contaminated by local QA outbox history rather than rejected by the new finalization code. Removing every local outbox row reset the client sequence to `1`, which the backend correctly rejected because that idempotency key already belonged to an older operation; restoring only the sequence-12 high-water marker allowed the next real operation to use sequence 13.
  Evidence: Android logcat first reported HTTP 409 with `Client operation ID has already been used for a different match operation.` The subsequent sequence-13 Quarter 4 PATCH returned HTTP 200, and Postgres showed `Matches.status = COMPLETE`, Quarter 4 `status = COMPLETE`, and identical `actualEnd`/`endedAt` timestamps.
- Observation: The reported “division does not belong to this event” failure was client-side identifier corruption, not a missing event-division relationship.
  Evidence: The backend detail route returned `qa-official-match-camka14-open`, while the Android Room row held `qa_official_match_camka14_open`. `MatchApiDto.toMatchOrNull()` and related mappings passed the opaque backend id through `normalizeDivisionIdentifier`, which replaced hyphens with underscores.
- Observation: Match navigation previously passed only event and match ids even when the selected schedule card already held the fully related match and teams.
  Evidence: The destination component initially constructed `Match: 0`, `Team 1`, and `Team 2` placeholders until Room/network collection emitted; passing the selected `MatchWithRelations` as transient navigation preload data makes the first emitted `MatchWithTeams` real while preserving the normal refresh path.
- Observation: The focused `core:network` test source is currently blocked by an unrelated stale constructor call.
  Evidence: `:core:network:compileDebugUnitTestKotlinAndroid` fails in the pre-existing `ExplicitNullPatchTest.kt:41`, where `TeamUpdatePayload` is constructed with the removed `affiliateUrl` parameter. The production network source compiles, and the focused Compose and navigation serialization suites pass.
- Observation: The existing segment contract has no clock-pause status, and `endedAt` already means the segment actually ended.
  Evidence: `MatchSegmentMVP.status` uses lifecycle values such as `NOT_STARTED`, `IN_PROGRESS`, and `COMPLETE`; `completeCurrentSet()` writes `endedAt` when a segment is confirmed. The backend segment operation already supports metadata, which is the appropriate place for independent clock state.
- Observation: The profile schedule endpoint is intentionally a narrow card projection, but `getMySchedule()` previously upserted those rows directly into Room and erased detailed `segments` and `incidents` fetched by the match endpoint.
  Evidence: During emulator testing, the backend retained Quarter 2 as `IN_PROGRESS` with `clockStoppedAt`, while the Room `MatchMVP` row had `segments = []`; the next UI action therefore rebuilt an unstarted segment and reset the clock.

 ## Decision Log

 - Decision: Keep `MatchContentComponent.updateScore` unchanged and map tap/swipe gestures onto its existing increment/decrement arguments.
   Rationale: The data and synchronization contract is already correct; changing it would broaden the feature and risk score persistence regressions.
   Date/Author: 2026-07-14, Codex.
 - Decision: Interpret “team’s half of the screen” as the existing top and bottom weighted `ScoreCard` regions on mobile.
   Rationale: The current screen already gives each team a full-width weighted region, so the interaction can be made obvious without moving timers, match identity, or bottom details controls.
   Date/Author: 2026-07-14, Codex.
 - Decision: Use a drag detector that fires once when a drag ends, regardless of direction, and retain a normal tap detector for increasing the score.
   Rationale: This directly matches “swiping in any direction decrements” and avoids treating a simple tap as a decrement. The existing score component clamps at zero.
   Date/Author: 2026-07-14, Codex.
 - Decision: Supersede the 2026-07-14 vertical-card decision with a compact grid that fixes Home/Away team identities on the left and horizontally scrolls the segment columns.
   Rationale: The user selected this structure after reviewing a visual mockup. It supports many quarters, periods, or sets without repeatedly rendering team names or creating a very tall details panel.
   Date/Author: 2026-07-30, Codex.
 - Decision: Show the gesture hint only when official score controls are present, and store dismissal with `rememberSaveable` keyed by match id.
   Rationale: Web/read-only viewers do not have the gesture interaction, and the hint should not reappear on recomposition or rotation after the official dismisses it.
   Date/Author: 2026-07-14, Codex.
 - Decision: Derive compact headers from the canonical segment label (`Q1`, `P1`, `S1`, or `H1`) and use explicit `resultType` for `OT` and `SO`.
   Rationale: Compact headers preserve horizontal space, while explicit result metadata avoids silently misclassifying regulation segments.
   Date/Author: 2026-07-30, Codex.
 - Decision: Separate whether the confirm action should exist from whether it is temporarily enabled.
   Rationale: Before a result reaches the sport-specific confirmation threshold, the action must not occupy the layout. Once confirmable, it remains visible during its saving state so the official receives progress feedback.
   Date/Author: 2026-07-30, Codex.
 - Decision: Render the score matrix directly on the Match Details surface with top, bottom, row, and column dividers instead of an enclosing card.
   Rationale: The data is a single table, so flat grid lines communicate its row/column relationships more clearly and avoid an unnecessary nested-container hierarchy.
   Date/Author: 2026-07-30, Codex.
 - Decision: Derive both edge cues from `ScrollState.canScrollBackward` and `ScrollState.canScrollForward`.
   Rationale: The cues now describe hidden content precisely: only right before scrolling, both while content is hidden on both sides, and only left at the end.
   Date/Author: 2026-07-30, Codex.
 - Decision: Treat `matchFinished` as a required condition for full-team winner highlighting.
   Rationale: Segment winner metadata can exist during regulation; only a finalized match result should color an entire team score surface or fixed team row as the winner.
   Date/Author: 2026-07-30, Codex.
 - Decision: Use one confirmation instant for the segment `endedAt` value and, when final, the match finalization time.
   Rationale: The active timer and match lifecycle end atomically from the user’s confirmation, avoiding a running final-segment clock or mismatched timestamps.
   Date/Author: 2026-07-30, Codex.
- Decision: Use wrap-content Material buttons and `FlowRow` for administrative actions.
  Rationale: The controls should be proportional to their labels like Save Times, while still wrapping safely on narrower screens.
  Date/Author: 2026-07-30, Codex.
- Decision: Carry selected match relations through runtime navigation as a transient preload, while serializing only event and match ids for restored navigation state.
  Rationale: The card already has the data needed for a correct first frame, but process restoration must remain deterministic and continue reloading canonical Room/network state.
  Date/Author: 2026-07-30, Codex.
- Decision: Treat division ids from the API as opaque identifiers and limit DTO sanitation to trimming blank values.
  Rationale: Reformatting a foreign identifier changes its identity and causes otherwise valid atomic match saves to fail backend event-membership validation.
  Date/Author: 2026-07-30, Codex.
- Decision: Give every segment column a transparent background regardless of active or completed state, and highlight only a winning point value.
  Rationale: Q1, Q2, and later columns should read as peers; selection/status fills created unexplained visual hierarchy, while a compact value highlight communicates the result without tinting the grid.
  Date/Author: 2026-07-30, Codex.
- Decision: Never represent an ordinary stopped clock as a `PAUSED` match or segment status, and never overload segment `endedAt` as the clock stop marker.
  Rationale: Sports such as football stop the clock repeatedly while play remains in progress. Status and end timestamps describe match/segment lifecycle, while timer stop/resume data is a separate concern.
  Date/Author: 2026-07-31, Codex.
- Decision: Persist `clockStoppedAt` and accumulated stopped seconds as clock-only segment metadata through explicit segment-operation fields.
  Rationale: The clock must remain frozen across refreshes and devices without shifting the true segment `startedAt`, falsely ending the segment, or replacing unrelated segment metadata.
  Date/Author: 2026-07-31, Codex.
- Decision: Merge the narrow schedule match projection with cached detailed match state before a batched Room upsert.
  Rationale: Schedule status and score summaries can stay current without allowing an unrelated background refresh to erase canonical segment/timer metadata or pending incident history.
  Date/Author: 2026-07-31, Codex.

 ## Outcomes & Retrospective

The original score-gesture work remains intact. The 2026-07-30 revisions replace repeated vertical segment cards with the selected fixed-team grid, streamline the official actions, and align timer/winner presentation with the final match lifecycle. The latest Android build passed 76 focused tests across `MatchContentComponentTest`, `MatchIncidentUiTest`, and `MatchDetailsPanelUiTest`, plus the focused navigation serialization test, then installed successfully on `emulator-5554`.

Runtime verification used the local `Official Match View QA — camka14` fixture. One completed-fixture check rendered a stable `Final` clock instead of `Running`, colored only the finalized match winner, and kept Quarter 4 selected after reopening. A second clean end-to-end confirmation started from three complete quarters and an in-progress fourth quarter: the operation returned HTTP 200, stored Quarter 4 and the match as `COMPLETE`, gave both records the timestamp `2026-07-30 23:41:52.363`, displayed `Final 00:00`, and colored only QA Blue after its 9–8 overall win. The final verification reopened the reset fixture from its schedule card with QA Blue, QA Gold, Match 1, and Quarter 1 already present on the destination, displayed a compact flat score matrix with uniformly transparent Q1-Q4 columns, and completed the host match-save path without the prior division error. The backend and refreshed Room rows both retained `qa-official-match-camka14-open`; the backend retained four regulation segments and Samuel Razumovskiy as the checked-in official. The bottom field/details controls use the standard compact button height.

The 2026-07-31 timer revision keeps ordinary clock stoppages inside the normal `IN_PROGRESS` lifecycle. Emulator testing displayed the large flat clock with play/stop controls and no Ready, Running, Stopped, or Paused status label. Starting Quarter 2 advanced the clock; stopping it froze the display and revealed Reset Timer and Confirm Quarter 2. The local backend retained both the match and segment as `IN_PROGRESS`, kept `endedAt` null, and stored `clockStoppedAt` plus accumulated stopped seconds in segment metadata. A schedule-cache regression found during this run is also fixed: narrow schedule rows now preserve cached detailed segments/incidents via one batched Room lookup. The focused repository/component/UI suites and the 64-test backend schedule route suite pass.

 ## Context and Orientation

 This is a Kotlin Multiplatform Compose app. Shared mobile UI is under `composeApp/src/commonMain/kotlin/com/razumly/mvp`; Android-specific Compose tests are under `composeApp/src/androidUnitTestDebug/kotlin`, and shared logic tests are under `composeApp/src/commonTest/kotlin`.

 `MatchDetailScreen.kt` collects the current `MatchWithTeams`, determines whether the viewer is an official, computes the current set and display scores, and renders two weighted `ScoreCard` composables. It currently exposes plus/minus icon click targets. The component callback `MatchContentComponent.updateScore(isTeam1: Boolean, increment: Boolean)` is the existing score mutation boundary: `increment = true` increases the active team score and `increment = false` decreases it.

 `MatchDetailsPanel.kt` owns the expanded “Match Details” content. `MatchSegmentTable` receives the persisted ordered segments, the regulation segment count from resolved match rules, both team ids and names, legacy score arrays, and the existing segment-selection callback. The team-name area is a fixed-width Compose column. Only the adjacent score columns use `horizontalScroll`, so the user retains Home/Away context while comparing later segments.

 `MatchDetailScreen.kt` derives `canStartMatch`, `showSetDelayedButton`, and the sport-aware `canConfirmCurrentSegment` result. `MatchOfficialResultControls` renders these predicates. The start and delay buttons share one full-width `Row`; the confirm action is composed only after the active segment is valid for confirmation.

 The repository has substantial unrelated local changes. Do not use reset, checkout, broad formatting, or broad staging. Use `apply_patch` for edits and inspect diffs only for the files changed by this feature.

 ## Plan of Work

 First, refactor `ScoreCard` in `MatchDetailScreen.kt` so the whole official score region is a semantic, touch-sized interaction surface. A tap invokes the existing increase callback. A drag gesture invokes the existing decrease callback once on drag end for any direction. The icon-only plus/minus controls and their imports will be removed from this score-card implementation; the separate incident button remains available when the rules require or allow it. The read-only/web rendering remains noninteractive.

 Next, add a `rememberSaveable` hint state in `MatchDetailScreen`, keyed by match id. Wrap the score area in a `Box` so the initial overlay can sit above both score halves but below the close and bottom details controls. The overlay will use a black scrim with enough opacity for white text contrast and will dismiss on tap. Its text will be “Click to increase” and “Swipe to decrease” on separate lines, with a descriptive semantics label on the score surface for accessibility.

Then, implement `MatchSegmentTable` in `MatchDetailsPanel.kt` as one fixed team column followed by a horizontally scrolling row of segment score columns. Render it as a flat table with aligned horizontal and vertical dividers, not as a nested rounded card. Each score column aligns a compact header with the Home and Away scores, uses no active/completed background fill, highlights only the winning point value, and invokes the existing `onSegmentSelected` callback. Reuse `segmentScore` for canonical/legacy compatibility. Use `MatchSegmentMVP.resultType` to label persisted overtime and shootout segments; do not manufacture future overtime columns. Show a left and/or right edge cue whenever the scroll state reports hidden columns on that side.

 Extract the result controls in `MatchDetailScreen.kt` into an internal testable composable. Place Start Match and Set as delayed into the same `Row`. Derive `showConfirmResultButton` from the existing sport-aware confirmation predicate and render the confirm button only when that value is true, while using a separate enabled flag for the in-flight save state.

 Make the Match Details action controls content-sized in a wrapping row and remove fixed dimensions from the bottom field/details buttons. Gate full-team winner colors behind `matchFinished`. When confirming a segment, write the confirmation instant to `MatchSegmentMVP.endedAt`; if it is the deciding final segment, use that same instant for match finalization. The timer may run only for an unfinished, non-complete active segment, and a completed match reopens on its last completed segment.

 Rework the timer in `MatchDetailScreen.kt` as a flat, testable control. Keep the plain match number and active segment identity but remove their shaded container. Remove the segment label and textual `Ready`/`Running` state from the clock, enlarge the clock digits, and place a play or pause icon directly underneath. Tapping either the digits or icon performs the same action. The play action starts an unstarted segment or resumes a stopped clock; the pause action records clock metadata while leaving match and segment statuses `IN_PROGRESS`. A suspend action records the same timer stop atomically with the existing `SUSPEND` action, and play on a suspended match atomically resumes the match and clock.

 Remove `Add Incident` from both `ScoreCard` instances. Add one conditionally composed `Add Incident` action to `MatchDetailsActionsSection`; do not render it until incident recording is valid. If team-scoped incident types exist, first ask which team the incident belongs to, then reuse the existing incident entry dialog. Extend the score-gesture overlay with a timer instruction when a match clock exists.

 Extend the mobile and backend segment-operation contracts with explicit clock metadata patch fields. The backend merges those fields into existing segment metadata so unrelated metadata remains intact. The mobile local applier mirrors that merge, which gives the UI immediate stopped/resumed state while the queued remote operation synchronizes.

 Finally, update `MatchIncidentUiTest.kt` to assert that the new score surface has no plus/minus content descriptions, that a tap calls the increase callback, that a swipe calls the decrease callback, and that the instruction overlay behavior is covered if the screen-level state can be exercised without requiring a full component harness. Add or adjust shared tests for any new pure set-row model/helper. Run the focused Android UI tests and compile the Android target, then run `git diff --check` and review only the feature diff.

 ## Concrete Steps

 Run all commands from `/Users/elesesy/StudioProjects/mvp-app`.

 1. Inspect the pre-change state before editing:

     `git status --short --branch`

     `git diff -- composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailScreen.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailsPanel.kt composeApp/src/androidUnitTestDebug/kotlin/com/razumly/mvp/matchDetail/MatchIncidentUiTest.kt`

 2. After implementation, run the focused UI test:

     `./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.matchDetail.MatchIncidentUiTest'`

     Expected outcome is a successful Gradle task with the focused tests passing. If the repository’s existing unrelated test compilation failures prevent the task, record the exact failure and use the Android compile task plus any test target that does run as evidence.

 3. Compile the shared Android implementation:

     `./gradlew :composeApp:compileDebugKotlinAndroid`

     Expected outcome is `BUILD SUCCESSFUL`. This validates the common Compose code and Android source set without requiring a device.

 4. Check patch hygiene:

     `git diff --check -- composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailScreen.kt composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailsPanel.kt composeApp/src/androidUnitTestDebug/kotlin/com/razumly/mvp/matchDetail/MatchIncidentUiTest.kt plans/match-score-gesture-rework-execplan.md`

 Current successful validation transcript:

     `./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.matchDetail.MatchIncidentUiTest' --tests 'com.razumly.mvp.matchDetail.MatchDetailsPanelUiTest' --console=plain --quiet`

     `MatchContentComponentTest: tests=62, failures=0, errors=0`

     `MatchIncidentUiTest: tests=11, failures=0, errors=0`

     `MatchDetailsPanelUiTest: tests=3, failures=0, errors=0`

     `./gradlew :composeApp:installDebug --console=plain --quiet`

     `Installed on 1 device.`

 ## Validation and Acceptance

 A human reviewer can validate the feature on a mobile official match screen by opening a match with an official checked in and the match started. The two team score regions occupy separate vertical halves. The first time the score controls are available, a transparent dark overlay displays white “Click to increase” and “Swipe to decrease” instructions. Tapping the overlay removes it. After dismissal, tapping the upper or lower team region increases only that team’s current score. Swiping up, down, left, or right inside that team’s region decreases only that team’s current score. No plus or minus icons are visible.

Opening Match Details on a four-quarter match shows one fixed Home/Away team column and `Q1` through `Q4` across the top. On a narrow screen or a match with additional persisted segments, swiping the score side moves only the segment columns; team names stay fixed. Segment columns have no selection, active, or completion background fills; only a segment-winning point value receives a compact highlight. Selecting a score column still changes the active segment. No `OT` column is present during regulation. Once match data contains an overtime segment with `resultType = OVERTIME`, an `OT` column appears.

 Before the match begins, the clock shows `00:00` as large, uncontained text with a play icon beneath it. Tapping the digits or play icon starts the match clock. While running, a pause icon is shown; tapping either control freezes the displayed time without changing the `IN_PROGRESS` match/segment status. Resuming continues from the frozen elapsed time. The score instruction overlay also explains the timer gesture. Confirm Quarter 1 and Reset Timer are absent while the clock is actively running before its configured end; they appear only when the clock is stopped, regulation duration is reached, or the match is suspended.

 Forfeit, Cancel, Suspend/Resume, the field-location control, and Match/Hide Details use standard wrap-content Material sizing rather than weighted or fixed 56dp controls. A segment winner does not tint an entire team green while regulation continues. After the last regulation segment is confirmed, the segment and match receive the same end instant, the timer reads Final and no longer advances, the finalized match winner alone is green, and reopening the match retains the final segment.

 Automated acceptance is a passing focused Android component/UI suite, a successful `:composeApp:compileDebugKotlinAndroid`, and a clean `git diff --check` for the feature files.

 ## Idempotence and Recovery

 The edits are additive/reversible and can be rerun safely. Because the checkout contains unrelated work, recover from mistakes by reverting only the feature hunks with a targeted patch or by restoring the specific feature files from the saved diff after confirming no user changes overlap; never use `git reset --hard` or broad `git checkout`. Gradle build outputs and caches are disposable, but do not delete source or generated files outside this feature.

 ## Artifacts and Notes

 The primary artifacts are `plans/match-score-gesture-rework-execplan.md`, the updated shared match screen and details panel, and the focused Android UI tests. Keep concise command outcomes and any blocking pre-existing failures in this plan as implementation proceeds.

 ## Interfaces and Dependencies

 Use the existing Compose Foundation gesture APIs `Modifier.clickable`, `Modifier.pointerInput`, `detectDragGestures`, `horizontalScroll`, and `rememberScrollState`; no new dependency is required. Use `rememberSaveable` for the overlay dismissal state. Keep the existing `MatchContentComponent.updateScore(isTeam1, increment)`, `MatchContentComponent.selectSegment(index)`, and `segmentScore` interfaces. `MatchOfficialResultControls` is an internal presentation boundary only and delegates to existing component actions.

 Plan revision note (2026-07-14): Initial plan created after source inspection. It records the existing score mutation boundary, the current horizontal details table, and the scope-preserving implementation decisions.
 Plan revision note (2026-07-14): Updated after implementation. The score-card gestures, first-use overlay, vertical named-team set cards, focused tests, clean diff check, and unrelated Gradle blocker are now recorded.
 Plan revision note (2026-07-30): Reopened and revised after the user approved teams fixed on the left with segments scrolling across the top. The prior vertical-card decision is explicitly superseded, overtime visibility is tied to persisted result metadata, and pre-match action visibility is included because it shares the official match surface.
 Plan revision note (2026-07-30): Finalized after focused test, install, UI-tree, screenshot, and horizontal-scroll verification on the Android emulator. A conditional right-edge scroll cue was added after the device proved Q4 is initially off-screen.
 Plan revision note (2026-07-30): Revised after visual review to remove the nested score-grid card. The accepted presentation is a flat divider-based matrix with independently conditional left and right hidden-column cues.
 Plan revision note (2026-07-30): Revised after final-quarter runtime review. Compact action sizing, final-only winner tinting, atomic segment/match end timestamps, stopped final clocks, and final-segment restoration are now part of the acceptance contract.
 Plan revision note (2026-07-30): Final runtime acceptance now records the clean sequence-13 Quarter 4 PATCH, matching segment/match end timestamps, the stopped `Final 00:00` clock, and winner-only final styling. The earlier 409 is retained as a QA outbox-reset artifact so future reruns preserve the client operation high-water mark.
 Plan revision note (2026-07-30): Added schedule-card destination preloading, opaque division-id preservation, compact neutral segment columns, and real-fixture Android verification. The plan now records that the reported division rejection originated in client DTO normalization rather than the backend fixture.
 Plan revision note (2026-07-31): Reopened for the timer-centered official controls. The revision explicitly separates ordinary clock stoppage from lifecycle status, moves clock state into durable metadata, removes redundant timer/incident controls, and adds state-dependent visibility and Android runtime acceptance.
