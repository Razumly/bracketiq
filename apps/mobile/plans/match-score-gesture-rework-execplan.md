 # Rework match scorekeeping interactions and set-score details

 This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date in accordance with `PLANS.md`.

 ## Purpose / Big Picture

 Match officials should be able to score quickly without first deciphering which score belongs to which team. On the mobile match screen, each team will own a large half of the scoring area: tapping that half increases the team’s current score and swiping in any direction decreases it. The plus and minus controls will be removed. When the scoring surface first becomes available, a dark transparent instruction overlay will explain “Click to increase” and “Swipe to decrease”; tapping the overlay dismisses it.

 When an official expands Match Details for a set-based match, the set scores will be listed vertically. Each set will show the Home/Away role as a small label above the corresponding team name, with that team’s score beside it. This makes every score-to-team relationship explicit without changing the existing score persistence or set-selection behavior.

 ## Progress

 - [x] (2026-07-14) Read the repository guidelines and `PLANS.md`; confirmed this feature requires a living ExecPlan under `plans/`.
 - [x] (2026-07-14) Inspected the existing match screen, score mutation path, details panel, and relevant tests.
 - [x] (2026-07-14) Implemented tap-to-increase and any-direction swipe-to-decrease on the official mobile score cards.
 - [x] (2026-07-14) Added the first-use gesture instruction overlay and its dismissal behavior.
 - [x] (2026-07-14) Replaced the horizontal Home/Away set table with a vertical named-team set breakdown.
 - [x] (2026-07-14) Updated the focused score UI test and added a vertical set-details UI test.
 - [x] (2026-07-14) Ran focused tests, Android compilation, and diff hygiene checks; Gradle test/compile execution is blocked by an unrelated pre-existing error in `DiscoverOrganizationCard.kt`.
 - [x] (2026-07-14) Wrote the final Outcomes & Retrospective entry after implementation review.

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
 - Decision: Render set details as a vertical stack of set cards, each with Home/Away role labels above the named teams and scores aligned to the team rows.
   Rationale: A vertical stack removes horizontal scrolling and places every score next to the team it belongs to while preserving clickable set selection.
   Date/Author: 2026-07-14, Codex.
 - Decision: Show the gesture hint only when official score controls are present, and store dismissal with `rememberSaveable` keyed by match id.
   Rationale: Web/read-only viewers do not have the gesture interaction, and the hint should not reappear on recomposition or rotation after the official dismisses it.
   Date/Author: 2026-07-14, Codex.

 ## Outcomes & Retrospective

 The requested interaction and presentation changes are implemented in the shared Compose match surface. The focused Android UI tests cover tap/swipe behavior, overlay dismissal, vertical set ordering, named teams, and set selection. `git diff --check` and trailing-whitespace checks are clean for the feature files. The remaining validation gap is environmental/repository-local: both Gradle commands stop on pre-existing nullable-property smart-cast errors in `DiscoverOrganizationCard.kt`, which was not edited because the checkout contains unrelated user work. The implementation preserves the existing score mutation and persistence path.

 ## Context and Orientation

 This is a Kotlin Multiplatform Compose app. Shared mobile UI is under `composeApp/src/commonMain/kotlin/com/razumly/mvp`; Android-specific Compose tests are under `composeApp/src/androidUnitTestDebug/kotlin`, and shared logic tests are under `composeApp/src/commonTest/kotlin`.

 `MatchDetailScreen.kt` collects the current `MatchWithTeams`, determines whether the viewer is an official, computes the current set and display scores, and renders two weighted `ScoreCard` composables. It currently exposes plus/minus icon click targets. The component callback `MatchContentComponent.updateScore(isTeam1: Boolean, increment: Boolean)` is the existing score mutation boundary: `increment = true` increases the active team score and `increment = false` decreases it.

 `MatchDetailsPanel.kt` owns the expanded “Match Details” content. Its `MatchSegmentTable` currently lays out a horizontally scrolling table whose rows are the set number, Home, and Away. The expanded panel already receives `team1Name` and `team2Name` for check-in display, so the same resolved names can be passed to the set breakdown without inventing a new data source.

 The repository has substantial unrelated local changes. Do not use reset, checkout, broad formatting, or broad staging. Use `apply_patch` for edits and inspect diffs only for the files changed by this feature.

 ## Plan of Work

 First, refactor `ScoreCard` in `MatchDetailScreen.kt` so the whole official score region is a semantic, touch-sized interaction surface. A tap invokes the existing increase callback. A drag gesture invokes the existing decrease callback once on drag end for any direction. The icon-only plus/minus controls and their imports will be removed from this score-card implementation; the separate incident button remains available when the rules require or allow it. The read-only/web rendering remains noninteractive.

 Next, add a `rememberSaveable` hint state in `MatchDetailScreen`, keyed by match id. Wrap the score area in a `Box` so the initial overlay can sit above both score halves but below the close and bottom details controls. The overlay will use a black scrim with enough opacity for white text contrast and will dismiss on tap. Its text will be “Click to increase” and “Swipe to decrease” on separate lines, with a descriptive semantics label on the score surface for accessibility.

 Then, replace the `MatchSegmentTable` implementation in `MatchDetailsPanel.kt`. It will render one clickable surface per segment in vertical order. Each surface will show the segment label and active/completed styling, then two team rows. Each row will place a small “Home” or “Away” label above the resolved team name and show that team’s score beside it. The existing `segmentScore` fallback logic and `onSegmentSelected` callback will be reused, so selecting a set still changes the active scoring segment.

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

 ## Validation and Acceptance

 A human reviewer can validate the feature on a mobile official match screen by opening a match with an official checked in and the match started. The two team score regions occupy separate vertical halves. The first time the score controls are available, a transparent dark overlay displays white “Click to increase” and “Swipe to decrease” instructions. Tapping the overlay removes it. After dismissal, tapping the upper or lower team region increases only that team’s current score. Swiping up, down, left, or right inside that team’s region decreases only that team’s current score. No plus or minus icons are visible.

 Opening Match Details on a set-based match shows Set 1, Set 2, and so on in a vertical list. Every set shows two score rows with a small Home/Away label above the corresponding team name, and the numeric score is visually adjacent to that name. Selecting a set card still changes the active set. Read-only/web viewers retain readable scores without interactive gestures.

 Automated acceptance is a passing focused Android UI test for the score surface, a successful `:composeApp:compileDebugKotlinAndroid`, and a clean `git diff --check` for the feature files.

 ## Idempotence and Recovery

 The edits are additive/reversible and can be rerun safely. Because the checkout contains unrelated work, recover from mistakes by reverting only the feature hunks with a targeted patch or by restoring the specific feature files from the saved diff after confirming no user changes overlap; never use `git reset --hard` or broad `git checkout`. Gradle build outputs and caches are disposable, but do not delete source or generated files outside this feature.

 ## Artifacts and Notes

 The primary artifacts are `plans/match-score-gesture-rework-execplan.md`, the updated shared match screen and details panel, and the focused Android UI tests. Keep concise command outcomes and any blocking pre-existing failures in this plan as implementation proceeds.

 ## Interfaces and Dependencies

 Use the existing Compose Foundation gesture APIs `Modifier.clickable`, `Modifier.pointerInput`, and `detectDragGestures`; no new dependency is required. Use `rememberSaveable` for the overlay dismissal state. Keep the existing `MatchContentComponent.updateScore(isTeam1, increment)` interface and the existing `segmentScore` helper. The final `ScoreCard` contract should expose one tap callback and one swipe callback for official mobile interaction, plus the existing read-only display and optional incident button behavior.

 Plan revision note (2026-07-14): Initial plan created after source inspection. It records the existing score mutation boundary, the current horizontal details table, and the scope-preserving implementation decisions.
 Plan revision note (2026-07-14): Updated after implementation. The score-card gestures, first-use overlay, vertical named-team set cards, focused tests, clean diff check, and unrelated Gradle blocker are now recorded.
