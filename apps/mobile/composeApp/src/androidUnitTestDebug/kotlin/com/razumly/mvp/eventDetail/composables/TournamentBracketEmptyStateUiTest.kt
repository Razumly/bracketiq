package com.razumly.mvp.eventDetail.composables

import android.app.Application
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.eventDetail.EventDetailComponent
import com.razumly.mvp.eventDetail.EventWithFullRelations
import com.razumly.mvp.eventDetail.LocalTournamentComponent
import io.mockk.every
import io.mockk.mockk
import kotlin.test.assertTrue
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(
    sdk = [35],
    application = Application::class,
    qualifiers = "w360dp-h640dp",
)
class TournamentBracketEmptyStateUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun participant_sees_published_state_explanation_instead_of_blank_surface() {
        composeRule.setContent {
            MaterialTheme {
                BracketEmptyState(canManageBracket = false)
            }
        }

        val emptyState = composeRule
            .onNodeWithText("The bracket has not been published yet.")
            .assertIsDisplayed()

        assertTrue(emptyState.fetchSemanticsNode().boundsInRoot.height > 0f)
    }

    @Test
    fun manager_sees_actionable_empty_bracket_guidance() {
        composeRule.setContent {
            MaterialTheme {
                BracketEmptyState(canManageBracket = true)
            }
        }

        composeRule
            .onNodeWithText(
                "No bracket rounds yet. Use match management to build and publish the bracket."
            )
            .assertIsDisplayed()
    }

    @Test
    fun bracket_view_switches_from_a_real_round_to_empty_guidance_and_restores_fab() {
        val event = Event(id = "event-1")
        val match = match(id = "match-1")
        val rounds = MutableStateFlow<List<List<MatchWithRelations?>>>(listOf(listOf(match)))
        val component = bracketComponent(
            event = event,
            rounds = rounds,
            matches = listOf(match),
        )
        var fabVisible = false

        composeRule.setContent {
            CompositionLocalProvider(
                LocalTournamentComponent provides component,
                LocalNavBarPadding provides PaddingValues(),
            ) {
                MaterialTheme {
                    TournamentBracketView(
                        showFab = { isVisible -> fabVisible = isVisible },
                    )
                }
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithText("M: 1").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("M: 1").assertIsDisplayed()
        composeRule
            .onAllNodesWithText("The bracket has not been published yet.")
            .assertCountEquals(0)

        composeRule.runOnIdle {
            rounds.value = emptyList()
        }
        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule
                .onAllNodesWithText("The bracket has not been published yet.")
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        composeRule
            .onNodeWithText("The bracket has not been published yet.")
            .assertIsDisplayed()
        composeRule.runOnIdle {
            assertTrue(fabVisible)
        }
    }

    private fun bracketComponent(
        event: Event,
        rounds: MutableStateFlow<List<List<MatchWithRelations?>>>,
        matches: List<MatchWithRelations>,
    ): EventDetailComponent {
        val component = mockk<EventDetailComponent>(relaxed = true)
        every { component.losersBracket } returns MutableStateFlow(false)
        every { component.rounds } returns rounds
        every { component.editableRounds } returns MutableStateFlow(emptyList())
        every { component.selectedEvent } returns MutableStateFlow(event)
        every { component.divisionTeams } returns MutableStateFlow<Map<String, TeamWithPlayers>>(emptyMap())
        every { component.divisionMatches } returns MutableStateFlow(
            matches.associateBy { relation -> relation.match.id }
        )
        every { component.divisionFields } returns MutableStateFlow<List<FieldWithMatches>>(emptyList())
        every { component.currentUser } returns MutableStateFlow(UserData())
        every { component.eventWithRelations } returns MutableStateFlow(
            EventWithFullRelations(
                event = event,
                players = emptyList(),
                matches = matches,
                teams = emptyList(),
            )
        )
        return component
    }

    private fun match(id: String): MatchWithRelations = MatchWithRelations(
        match = MatchMVP(
            matchId = 1,
            eventId = "event-1",
            id = id,
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
