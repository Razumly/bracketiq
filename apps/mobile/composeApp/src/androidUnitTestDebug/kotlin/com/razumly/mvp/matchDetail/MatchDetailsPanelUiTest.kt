package com.razumly.mvp.matchDetail

import android.app.Application
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.click
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import kotlin.test.assertEquals
import kotlin.test.assertNull
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
    fun given_many_segments_when_rendered_then_teams_stay_fixed_and_segment_columns_scroll() {
        var selectedSegment = -1
        composeRule.setContent {
            MaterialTheme {
                MatchSegmentTable(
                    segments = List(8) { index ->
                        MatchSegmentMVP(
                            id = "segment-${index + 1}",
                            eventId = "event-1",
                            matchId = "match-1",
                            sequence = index + 1,
                            status = if (index == 0) "COMPLETE" else "NOT_STARTED",
                            scores = mapOf("team-a" to index + 1, "team-b" to index),
                            winnerEventTeamId = if (index == 0) "team-a" else null,
                        )
                    },
                    segmentLabel = "Quarter",
                    regulationSegmentCount = 4,
                    team1Id = "team-a",
                    team2Id = "team-b",
                    team1Scores = emptyList(),
                    team2Scores = emptyList(),
                    team1Name = "Red Wolves",
                    team2Name = "Blue Jays",
                    matchWinnerEventTeamId = "team-a",
                    onSegmentSelected = { selectedSegment = it },
                    modifier = Modifier.width(320.dp),
                )
            }
        }

        composeRule.onNodeWithText("Q1").assertIsDisplayed()
        composeRule.onAllNodesWithText("Home").assertCountEquals(1)
        composeRule.onAllNodesWithText("Away").assertCountEquals(1)
        composeRule.onAllNodesWithText("Red Wolves").assertCountEquals(1)
        composeRule.onAllNodesWithText("Blue Jays").assertCountEquals(1)
        composeRule.waitForIdle()
        composeRule
            .onNodeWithTag(MatchSegmentScrollBackwardCueTestTag)
            .assertDoesNotExist()
        composeRule
            .onNodeWithTag(MatchSegmentScrollForwardCueTestTag)
            .assertExists()

        val teamLeftBeforeScroll = composeRule
            .onNodeWithText("Red Wolves")
            .getUnclippedBoundsInRoot()
            .left
        composeRule
            .onNodeWithTag(MatchSegmentColumnsTestTag)
            .performTouchInput { swipeLeft() }
        composeRule.waitForIdle()
        composeRule
            .onNodeWithTag(MatchSegmentScrollBackwardCueTestTag)
            .assertExists()
        composeRule
            .onNodeWithTag(MatchSegmentScrollForwardCueTestTag)
            .assertExists()

        repeat(5) {
            composeRule
                .onNodeWithTag(MatchSegmentColumnsTestTag)
                .performTouchInput { swipeLeft() }
        }
        composeRule.waitForIdle()

        composeRule.onNodeWithText("Q8").assertIsDisplayed()
        composeRule
            .onNodeWithTag(MatchSegmentScrollBackwardCueTestTag)
            .assertExists()
        composeRule
            .onNodeWithTag(MatchSegmentScrollForwardCueTestTag)
            .assertDoesNotExist()
        val teamLeftAfterScroll = composeRule
            .onNodeWithText("Red Wolves")
            .getUnclippedBoundsInRoot()
            .left
        assertEquals(teamLeftBeforeScroll, teamLeftAfterScroll)

        composeRule.onNodeWithText("Q8").performTouchInput { click() }
        assertEquals(7, selectedSegment)
    }

    @Test
    fun given_regulation_and_overtime_segments_when_rendered_then_overtime_appears_only_for_existing_overtime_data() {
        val regulationSegments = List(4) { index ->
            MatchSegmentMVP(
                id = "segment-${index + 1}",
                eventId = "event-1",
                matchId = "match-1",
                sequence = index + 1,
            )
        }

        assertEquals(
            listOf("Q1", "Q2", "Q3", "Q4"),
            regulationSegments.map { segment ->
                matchSegmentHeaderLabel(
                    segment = segment,
                    segmentLabel = "Quarter",
                    regulationSegmentCount = 4,
                )
            },
        )
        assertEquals(
            "OT",
            matchSegmentHeaderLabel(
                segment = MatchSegmentMVP(
                    id = "segment-5",
                    eventId = "event-1",
                    matchId = "match-1",
                    sequence = 5,
                    resultType = "OVERTIME",
                ),
                segmentLabel = "Quarter",
                regulationSegmentCount = 4,
            ),
        )
    }

    @Test
    fun given_completed_legacy_segment_when_scores_are_uneven_then_higher_score_is_the_winner() {
        val segment = MatchSegmentMVP(
            id = "segment-1",
            matchId = "match-1",
            sequence = 1,
            status = "COMPLETE",
        )

        assertEquals(
            "team-a",
            resolveSegmentWinnerEventTeamId(
                segment = segment,
                team1Id = "team-a",
                team2Id = "team-b",
                team1Score = 21,
                team2Score = 18,
            ),
        )
        assertNull(
            resolveSegmentWinnerEventTeamId(
                segment = segment.copy(status = "IN_PROGRESS"),
                team1Id = "team-a",
                team2Id = "team-b",
                team1Score = 21,
                team2Score = 18,
            ),
        )
    }

    @Test
    fun given_match_set_score_limits_when_rendered_then_each_configured_target_appears() {
        val match = MatchMVP(
            matchId = 1,
            eventId = "event-1",
            id = "match-1",
            matchRulesSnapshot = ResolvedMatchRulesMVP(
                scoringModel = "SETS",
                segmentCount = 5,
                segmentLabel = "Set",
                setPointTargets = listOf(25, 25, 25, 25, 15),
            ),
        )
        val limits = matchSetScoreLimits(match = match, segmentLabel = "Set")

        assertEquals(
            listOf(
                MatchSetScoreLimit("S1", 25),
                MatchSetScoreLimit("S2", 25),
                MatchSetScoreLimit("S3", 25),
                MatchSetScoreLimit("S4", 25),
                MatchSetScoreLimit("S5", 15),
            ),
            limits,
        )

        composeRule.setContent {
            MaterialTheme {
                MatchSetScoreLimitsSection(limits = limits)
            }
        }

        composeRule.onNodeWithText("Set score limits").assertIsDisplayed()
        composeRule.onNodeWithText("S1: 25").assertIsDisplayed()
        composeRule.onNodeWithText("S5: 15").assertIsDisplayed()
    }

    @Test
    fun given_no_match_set_score_limits_when_rendered_then_limits_section_is_hidden() {
        val limits = matchSetScoreLimits(
            match = MatchMVP(
                matchId = 1,
                eventId = "event-1",
                id = "match-1",
                resolvedMatchRules = ResolvedMatchRulesMVP(scoringModel = "SETS"),
            ),
            segmentLabel = "Set",
        )

        assertEquals(emptyList(), limits)
        composeRule.setContent {
            MaterialTheme {
                MatchSetScoreLimitsSection(limits = limits)
            }
        }

        composeRule.onNodeWithText("Set score limits").assertDoesNotExist()
    }
}
