package com.razumly.mvp.eventDetail.composables

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchTimekeepingConfigMVP
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.eventDetail.MatchCreateContext
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class MatchEditDialogUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun segmentCountAndConfirmationStateUpdateInsideTheOpenDialog() {
        val relation = matchWithRelations()
        composeRule.setContent {
            MaterialTheme {
                MatchEditDialog(
                    match = relation,
                    teams = emptyList(),
                    fields = emptyList(),
                    allMatches = listOf(relation),
                    eventOfficials = emptyList(),
                    officialPositions = emptyList(),
                    users = emptyList(),
                    eventType = EventType.LEAGUE,
                    isCreateMode = false,
                    creationContext = MatchCreateContext.BRACKET,
                    onDismissRequest = {},
                    onConfirm = {},
                    onDelete = {},
                )
            }
        }

        composeRule.onNodeWithTag("match-edit-content", useUnmergedTree = true).performScrollToIndex(4)
        composeRule.onNodeWithText("Set 1 score limit", useUnmergedTree = true).assertExists()
        composeRule.onNodeWithText("Set 2 score limit", useUnmergedTree = true).assertExists()
        composeRule.onNodeWithText("Set 3 score limit", useUnmergedTree = true).assertExists()
        composeRule.onNodeWithText("Set 4 score limit", useUnmergedTree = true).assertDoesNotExist()

        composeRule.onNodeWithContentDescription("Increase Set count", useUnmergedTree = true).performClick()

        composeRule.onNodeWithText("Set 4 score limit", useUnmergedTree = true).assertExists()
        composeRule.onNodeWithTag("match-edit-content", useUnmergedTree = true).performScrollToIndex(8)
        composeRule.onNodeWithContentDescription("Set 1 confirmation", useUnmergedTree = true)
            .assertIsEnabled()
        composeRule.onNodeWithContentDescription("Set 2 confirmation", useUnmergedTree = true).assertIsNotEnabled()

        composeRule.onNodeWithContentDescription("Set 1 confirmation", useUnmergedTree = true).performClick()

        composeRule.onNodeWithContentDescription("Set 2 confirmation", useUnmergedTree = true).assertIsEnabled()
    }

    @Test
    fun timedMatchUsesSegmentMinutesStepperAndSavesTheEditedDuration() {
        val relation = timedMatchWithRelations()
        var savedMatch: MatchWithRelations? = null
        composeRule.setContent {
            MaterialTheme {
                MatchEditDialog(
                    match = relation,
                    teams = emptyList(),
                    fields = emptyList(),
                    allMatches = listOf(relation),
                    eventOfficials = emptyList(),
                    officialPositions = emptyList(),
                    users = emptyList(),
                    eventType = EventType.LEAGUE,
                    isCreateMode = false,
                    creationContext = MatchCreateContext.BRACKET,
                    onDismissRequest = {},
                    onConfirm = { savedMatch = it },
                    onDelete = {},
                )
            }
        }

        composeRule.onNodeWithTag("match-edit-content", useUnmergedTree = true).performScrollToIndex(4)
        composeRule.onNodeWithText("Quarter count", useUnmergedTree = true).assertExists()
        composeRule.onNodeWithText("Segment length (min)", useUnmergedTree = true).assertExists()
        composeRule.onNodeWithContentDescription(
            "Increase Segment length (min)",
            useUnmergedTree = true,
        ).performClick()
        composeRule.onNodeWithText("Save").performClick()

        composeRule.runOnIdle {
            assertEquals(
                11,
                savedMatch?.match?.matchRulesSnapshot?.timekeeping?.segmentDurationMinutes,
            )
        }
    }

    private fun matchWithRelations(): MatchWithRelations = MatchWithRelations(
        match = MatchMVP(
            id = "match-1",
            matchId = 1,
            eventId = "event-1",
            team1Id = "team-a",
            team2Id = "team-b",
            status = "IN_PROGRESS",
            team1Points = listOf(21, 0, 0),
            team2Points = listOf(10, 0, 0),
            setResults = listOf(0, 0, 0),
            matchRulesSnapshot = ResolvedMatchRulesMVP(
                scoringModel = "SETS",
                segmentCount = 3,
                segmentLabel = "Set",
                setPointTargets = listOf(21, 21, 15),
            ),
        ),
        field = null,
        team1 = null,
        team2 = null,
        teamOfficial = null,
        winnerNextMatch = null,
        loserNextMatch = null,
        previousLeftMatch = null,
        previousRightMatch = null,
    )

    private fun timedMatchWithRelations(): MatchWithRelations = MatchWithRelations(
        match = MatchMVP(
            id = "match-timed",
            matchId = 2,
            eventId = "event-1",
            team1Id = "team-a",
            team2Id = "team-b",
            matchRulesSnapshot = ResolvedMatchRulesMVP(
                scoringModel = "PERIODS",
                segmentCount = 4,
                segmentLabel = "Quarter",
                timekeeping = ResolvedMatchTimekeepingConfigMVP(
                    timerMode = "COUNT_DOWN",
                    segmentDurationMinutes = 10,
                ),
            ),
        ),
        field = null,
        team1 = null,
        team2 = null,
        teamOfficial = null,
        winnerNextMatch = null,
        loserNextMatch = null,
        previousLeftMatch = null,
        previousRightMatch = null,
    )
}
