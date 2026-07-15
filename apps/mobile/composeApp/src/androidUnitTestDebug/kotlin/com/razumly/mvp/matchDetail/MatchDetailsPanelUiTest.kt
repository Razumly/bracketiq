package com.razumly.mvp.matchDetail

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.click
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.createComposeRule
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTouchInput
import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class MatchDetailsPanelUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun given_set_match_details_when_rendered_then_scores_are_vertical_and_named_teams_are_shown() {
        var selectedSegment = -1
        composeRule.setContent {
            MaterialTheme {
                MatchSegmentTable(
                    segments = listOf(
                        MatchSegmentMVP(
                            id = "segment-1",
                            eventId = "event-1",
                            matchId = "match-1",
                            sequence = 1,
                            scores = mapOf("team-a" to 21, "team-b" to 18),
                        ),
                        MatchSegmentMVP(
                            id = "segment-2",
                            eventId = "event-1",
                            matchId = "match-1",
                            sequence = 2,
                            scores = mapOf("team-a" to 7, "team-b" to 11),
                        ),
                    ),
                    segmentLabel = "Set",
                    team1Id = "team-a",
                    team2Id = "team-b",
                    team1Scores = listOf(21, 7),
                    team2Scores = listOf(18, 11),
                    team1Name = "Red Wolves",
                    team2Name = "Blue Jays",
                    onSegmentSelected = { selectedSegment = it },
                )
            }
        }

        composeRule.onNodeWithText("Set 1").assertIsDisplayed()
        composeRule.onNodeWithText("Set 2").assertIsDisplayed()
        composeRule.onAllNodesWithText("Home").assertCountEquals(2)
        composeRule.onAllNodesWithText("Away").assertCountEquals(2)
        composeRule.onNodeWithText("Red Wolves").assertIsDisplayed()
        composeRule.onNodeWithText("Blue Jays").assertIsDisplayed()
        composeRule.onNodeWithText("21").assertIsDisplayed()
        composeRule.onNodeWithText("18").assertIsDisplayed()

        val firstSetTop = composeRule.onNodeWithText("Set 1").getUnclippedBoundsInRoot().top
        val secondSetTop = composeRule.onNodeWithText("Set 2").getUnclippedBoundsInRoot().top
        assertTrue(firstSetTop < secondSetTop)

        composeRule.onNodeWithText("Set 2").performTouchInput { click() }
        assertEquals(1, selectedSegment)
    }
}
