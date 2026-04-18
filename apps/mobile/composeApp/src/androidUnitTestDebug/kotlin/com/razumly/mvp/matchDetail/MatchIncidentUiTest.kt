package com.razumly.mvp.matchDetail

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
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
    fun player_required_scoring_hides_plus_minus_and_shows_goal_button() {
        composeRule.setContent {
            MaterialTheme {
                ScoreCard(
                    title = "Red Wolves",
                    score = "0",
                    decrease = {},
                    increase = {},
                    enabled = true,
                    showControls = true,
                    showAdjustControls = false,
                    addIncidentLabel = "Add Goal",
                    onAddIncident = {},
                )
            }
        }

        composeRule.onNodeWithText("Add Goal").assertIsDisplayed()
        composeRule.onAllNodesWithContentDescription("Increase score").assertCountEquals(0)
        composeRule.onAllNodesWithContentDescription("Decrease score").assertCountEquals(0)
    }

    @Test
    fun scoring_without_player_requirement_keeps_plus_minus_and_shows_non_scoring_incident_button() {
        composeRule.setContent {
            MaterialTheme {
                ScoreCard(
                    title = "Red Wolves",
                    score = "2",
                    decrease = {},
                    increase = {},
                    enabled = true,
                    showControls = true,
                    showAdjustControls = true,
                    addIncidentLabel = "Add Incident",
                    onAddIncident = {},
                )
            }
        }

        composeRule.onNodeWithText("Add Incident").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Increase score").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Decrease score").assertIsDisplayed()
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
