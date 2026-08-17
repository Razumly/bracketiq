package com.razumly.mvp.matchDetail

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.click
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import androidx.compose.ui.test.swipeUp
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class MatchIncidentUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun given_match_score_is_tied_then_winner_highlight_is_suppressed() {
        val tiedPresentation = resolveMatchScorePresentation(
            scoringModel = "PERIODS",
            segments = emptyList(),
            team1Id = "team-a",
            team2Id = "team-b",
            team1LegacyScores = listOf(3),
            team2LegacyScores = listOf(3),
            actualStart = "2026-07-31T18:00:00Z",
            actualEnd = "2026-07-31T19:00:00Z",
            selectedSegmentIndex = null,
        )
        val winningPresentation = resolveMatchScorePresentation(
            scoringModel = "PERIODS",
            segments = emptyList(),
            team1Id = "team-a",
            team2Id = "team-b",
            team1LegacyScores = listOf(4),
            team2LegacyScores = listOf(3),
            actualStart = "2026-07-31T18:00:00Z",
            actualEnd = "2026-07-31T19:00:00Z",
            selectedSegmentIndex = null,
        )

        assertNull(tiedPresentation.winnerEventTeamId)
        assertEquals(
            "team-a",
            winningPresentation.winnerEventTeamId,
        )
    }

    @Test
    fun given_pre_match_controls_when_start_and_delay_are_available_then_they_share_one_row_and_confirm_is_hidden() {
        composeRule.setContent {
            MaterialTheme {
                MatchOfficialResultControls(
                    canStartMatch = true,
                    showSetDelayedButton = true,
                    canResetMatchTimer = false,
                    showConfirmResultButton = false,
                    confirmResultEnabled = false,
                    matchStartSaving = false,
                    matchTimeSaving = false,
                    segmentConfirmSaving = false,
                    startButtonLabel = "Start Match",
                    confirmButtonLabel = "Confirm Quarter 1",
                    onStartMatch = {},
                    onMarkDelayed = {},
                    onResetTimer = {},
                    onConfirmResult = {},
                )
            }
        }

        val startTop = composeRule.onNodeWithText("Start Match").getUnclippedBoundsInRoot().top
        val delayTop = composeRule.onNodeWithText("Set as delayed").getUnclippedBoundsInRoot().top

        assertEquals(startTop, delayTop)
        composeRule.onAllNodesWithText("Confirm Quarter 1").assertCountEquals(0)
    }

    @Test
    fun given_set_score_tracker_when_selecting_match_and_set_then_callbacks_receive_selection() {
        var selectedSegmentIndex: Int? = null
        composeRule.setContent {
            MaterialTheme {
                MatchSegmentScoreTracker(
                    entries = listOf(
                        MatchSegmentTrackerEntry(
                            label = "Set 1",
                            team1Score = null,
                            team2Score = null,
                            isActive = true,
                            isComplete = false,
                        ),
                        MatchSegmentTrackerEntry(
                            label = "Set 2",
                            team1Score = 25,
                            team2Score = 21,
                            isActive = false,
                            isComplete = true,
                        ),
                    ),
                    selectedSegmentIndex = selectedSegmentIndex,
                    onMatchSelected = { selectedSegmentIndex = null },
                    onSegmentSelected = { index -> selectedSegmentIndex = index },
                )
            }
        }

        composeRule.onNodeWithText("Set 2").performClick()
        composeRule.runOnIdle { assertEquals(1, selectedSegmentIndex) }
        composeRule.onNodeWithText("Match").performClick()
        composeRule.runOnIdle { assertNull(selectedSegmentIndex) }
        composeRule.onNodeWithText("—-—").assertIsDisplayed()
    }

    @Test
    fun given_confirm_segment_becomes_available_then_the_button_appears_enabled() {
        val showConfirm = mutableStateOf(false)
        composeRule.setContent {
            MaterialTheme {
                MatchOfficialResultControls(
                    canStartMatch = false,
                    showSetDelayedButton = false,
                    canResetMatchTimer = false,
                    showConfirmResultButton = showConfirm.value,
                    confirmResultEnabled = showConfirm.value,
                    matchStartSaving = false,
                    matchTimeSaving = false,
                    segmentConfirmSaving = false,
                    startButtonLabel = "Start Match",
                    confirmButtonLabel = "Confirm Quarter 1",
                    onStartMatch = {},
                    onMarkDelayed = {},
                    onResetTimer = {},
                    onConfirmResult = {},
                )
            }
        }

        composeRule.onAllNodesWithText("Confirm Quarter 1").assertCountEquals(0)
        composeRule.runOnIdle { showConfirm.value = true }
        composeRule.onNodeWithText("Confirm Quarter 1").assertIsDisplayed().assertIsEnabled()
    }

    @Test
    fun given_ready_timer_when_tapped_then_it_starts_without_a_ready_status_label() {
        var startCount = 0
        composeRule.setContent {
            MaterialTheme {
                MatchTimerControl(
                    clockDisplay = "00:00",
                    action = MatchTimerAction.Start,
                    actionEnabled = true,
                    clockColor = Color.Black,
                    onAction = { startCount += 1 },
                )
            }
        }

        composeRule.onAllNodesWithText("Ready").assertCountEquals(0)
        composeRule.onNodeWithText("00:00").performClick()

        assertEquals(1, startCount)
    }

    @Test
    fun given_running_or_stopped_timer_then_the_control_shows_stop_or_resume_action() {
        val action = mutableStateOf(MatchTimerAction.Stop)
        composeRule.setContent {
            MaterialTheme {
                MatchTimerControl(
                    clockDisplay = "01:12",
                    action = action.value,
                    actionEnabled = true,
                    clockColor = Color.Black,
                    onAction = {},
                )
            }
        }

        composeRule.onNodeWithContentDescription("Stop timer").assertIsDisplayed()
        composeRule.runOnIdle { action.value = MatchTimerAction.Resume }
        composeRule.onNodeWithContentDescription("Resume timer").assertIsDisplayed()
    }

    @Test
    fun given_player_required_scoring_when_rendered_then_plus_minus_and_incident_button_are_absent() {
        composeRule.setContent {
            MaterialTheme {
                ScoreCard(
                    title = "Red Wolves",
                    score = "0",
                    onTap = {},
                    onSwipeDecrease = {},
                    enabled = true,
                    showControls = true,
                )
            }
        }

        composeRule.onAllNodesWithText("Add Incident").assertCountEquals(0)
        composeRule.onAllNodesWithContentDescription("Increase score").assertCountEquals(0)
        composeRule.onAllNodesWithContentDescription("Decrease score").assertCountEquals(0)
    }

    @Test
    fun given_score_surface_when_tapped_or_swiped_then_callbacks_match_gesture() {
        var tapCount = 0
        var swipeCount = 0
        composeRule.setContent {
            MaterialTheme {
                ScoreCard(
                    title = "Red Wolves",
                    score = "2",
                    onTap = { tapCount += 1 },
                    onSwipeDecrease = { swipeCount += 1 },
                    enabled = true,
                    showControls = true,
                )
            }
        }

        composeRule.onAllNodesWithText("Add Incident").assertCountEquals(0)
        composeRule.onAllNodesWithContentDescription("Increase score").assertCountEquals(0)
        composeRule.onAllNodesWithContentDescription("Decrease score").assertCountEquals(0)
        composeRule
            .onNodeWithContentDescription("Red Wolves score 2. Tap to increase. Swipe to decrease.")
            .performTouchInput { click() }
        composeRule
            .onNodeWithContentDescription("Red Wolves score 2. Tap to increase. Swipe to decrease.")
            .performTouchInput { swipeUp() }
        composeRule
            .onNodeWithContentDescription("Red Wolves score 2. Tap to increase. Swipe to decrease.")
            .performTouchInput { swipeDown() }

        assertEquals(1, tapCount)
        assertEquals(2, swipeCount)
    }

    @Test
    fun given_gesture_instruction_overlay_when_clicked_then_it_dismisses() {
        var dismissed = false
        var bottomActionClicks = 0
        composeRule.setContent {
            MaterialTheme {
                MatchGestureInstructionHost(
                    showOverlay = true,
                    showTimerInstruction = true,
                    onDismiss = { dismissed = true },
                    modifier = Modifier.size(240.dp),
                ) {
                    Button(
                        onClick = { bottomActionClicks += 1 },
                        modifier = Modifier.align(androidx.compose.ui.Alignment.BottomCenter),
                    ) {
                        Text("Bottom action")
                    }
                }
            }
        }

        composeRule.onNodeWithText("Click to increase").assertIsDisplayed()
        composeRule.onNodeWithText("Swipe to decrease").assertIsDisplayed()
        composeRule.onNodeWithText("Tap timer to start or stop").assertIsDisplayed()
        composeRule.onNodeWithText("Bottom action").performTouchInput { click() }

        assertTrue(dismissed)
        assertEquals(0, bottomActionClicks)
    }

    @Test
    fun player_required_goal_dialog_shows_player_field_and_enabled_save_when_player_selected() {
        val rules = ResolvedMatchRulesMVP(
            supportedIncidentTypes = listOf("GOAL", "DISCIPLINE", "NOTE"),
            autoCreatePointIncidentType = "GOAL",
            pointIncidentRequiresParticipant = true,
        )
        val options = incidentDialogTypes(rules, teamScoped = true)
        val player = MatchParticipantOption(
            selectionId = "reg-a",
            label = "Alex Striker (#9)",
            eventRegistrationId = "reg-a",
            participantUserId = "player-a",
        )

        composeRule.setContent {
            MaterialTheme {
                MatchIncidentEntryDialog(
                    incidentOptions = options,
                    selectedIncidentType = defaultIncidentDialogType(rules, options),
                    onIncidentTypeChange = {},
                    teamScoped = true,
                    participantOptions = listOf(player),
                    selectedParticipant = player,
                    onParticipantSelected = {},
                    requiresParticipant = true,
                    minute = "",
                    onMinuteChange = {},
                    note = "",
                    onNoteChange = {},
                    onSave = {},
                    onDismiss = {},
                )
            }
        }

        composeRule.onNodeWithText("Record incident").assertIsDisplayed()
        composeRule.onNodeWithText("Goal").assertIsDisplayed()
        composeRule.onNodeWithText("Player").assertIsDisplayed()
        composeRule.onNodeWithText("Alex Striker (#9)").assertIsDisplayed()
        composeRule.onNodeWithText("Save Goal").assertIsEnabled()
    }

    @Test
    fun player_required_goal_dialog_disables_save_until_player_selected() {
        val rules = ResolvedMatchRulesMVP(
            supportedIncidentTypes = listOf("GOAL", "DISCIPLINE"),
            autoCreatePointIncidentType = "GOAL",
            pointIncidentRequiresParticipant = true,
        )
        val options = incidentDialogTypes(rules, teamScoped = true)

        composeRule.setContent {
            MaterialTheme {
                MatchIncidentEntryDialog(
                    incidentOptions = options,
                    selectedIncidentType = defaultIncidentDialogType(rules, options),
                    onIncidentTypeChange = {},
                    teamScoped = true,
                    participantOptions = emptyList(),
                    selectedParticipant = null,
                    onParticipantSelected = {},
                    requiresParticipant = true,
                    minute = "",
                    onMinuteChange = {},
                    note = "",
                    onNoteChange = {},
                    onSave = {},
                    onDismiss = {},
                )
            }
        }

        composeRule.onNodeWithText("No roster available").assertIsDisplayed()
        composeRule.onNodeWithText("Save Goal").assertIsNotEnabled()
    }

    @Test
    fun player_not_required_dialog_excludes_goal_point_options() {
        val rules = ResolvedMatchRulesMVP(
            supportedIncidentTypes = listOf("GOAL", "POINT", "DISCIPLINE", "NOTE"),
            autoCreatePointIncidentType = "GOAL",
            pointIncidentRequiresParticipant = false,
        )
        val options = incidentDialogTypes(rules, teamScoped = true)

        composeRule.setContent {
            MaterialTheme {
                MatchIncidentEntryDialog(
                    incidentOptions = options,
                    selectedIncidentType = defaultIncidentDialogType(rules, options),
                    onIncidentTypeChange = {},
                    teamScoped = true,
                    participantOptions = emptyList(),
                    selectedParticipant = null,
                    onParticipantSelected = {},
                    requiresParticipant = false,
                    minute = "",
                    onMinuteChange = {},
                    note = "",
                    onNoteChange = {},
                    onSave = {},
                    onDismiss = {},
                )
            }
        }

        composeRule.onAllNodesWithText("Goal").assertCountEquals(0)
        composeRule.onAllNodesWithText("Point").assertCountEquals(0)
        composeRule.onNodeWithText("Penalty or card").assertIsDisplayed()
        composeRule.onNodeWithText("Player (optional)").assertIsDisplayed()
        composeRule.onNodeWithText("Save Incident").assertIsEnabled()
    }

    @Test
    fun official_incident_card_exposes_remove_button() {
        var removed = false

        composeRule.setContent {
            MaterialTheme {
                MatchIncidentCard(
                    summary = "Red Wolves | Alex Striker #9 | 12'",
                    canRemove = true,
                    onRemove = { removed = true },
                )
            }
        }

        composeRule.onNodeWithText("Red Wolves | Alex Striker #9 | 12'").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Remove incident").performClick()

        assertTrue(removed)
    }

    @Test
    fun non_official_incident_card_hides_remove_button() {
        composeRule.setContent {
            MaterialTheme {
                MatchIncidentCard(
                    summary = "Match note: Delay",
                    canRemove = false,
                    onRemove = {},
                )
            }
        }

        composeRule.onNodeWithText("Match note: Delay").assertIsDisplayed()
        composeRule.onAllNodesWithContentDescription("Remove incident").assertCountEquals(0)
    }
}
