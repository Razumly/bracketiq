package com.razumly.mvp.eventDetail.composables

import android.app.Application
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchOfficialAssignment
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.OfficialAssignmentHolderType
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.eventDetail.EventDetailComponent
import com.razumly.mvp.eventDetail.EventWithFullRelations
import com.razumly.mvp.eventDetail.LocalTournamentComponent
import io.mockk.every
import io.mockk.mockk
import kotlin.test.assertEquals
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

    @Test
    fun manage_match_card_keeps_role_and_official_rows_vertically_aligned() {
        val roleAndOfficialNames = listOf(
            "Referee" to "Samuel Razumovskiy",
            "Assistant Referee" to "Caleb Wright",
            "Scorekeeper" to "Jordan Lee",
            "Line Judge 1" to "Marcus Nguyen",
            "Line Judge 2" to "Olivia Davis",
            "Replay Official" to "Maya Chen",
        )
        val positions = roleAndOfficialNames.mapIndexed { index, (role, _) ->
            EventOfficialPosition(
                id = "position-$index",
                name = role,
                order = index,
            )
        }
        val users = roleAndOfficialNames.mapIndexed { index, (_, fullName) ->
            val names = fullName.split(" ", limit = 2)
            user(
                id = "official-$index",
                firstName = names.first(),
                lastName = names.getOrElse(1) { "" },
            )
        }
        val team1 = team(id = "team-blue", name = "QA Blue")
        val team2 = team(id = "team-gold", name = "QA Gold")
        val event = Event(
            id = "event-1",
            officialPositions = positions,
        )
        val match = MatchWithRelations(
            match = MatchMVP(
                matchId = 1,
                eventId = event.id,
                team1Id = team1.team.id,
                team2Id = team2.team.id,
                officialIds = positions.mapIndexed { index, position ->
                    MatchOfficialAssignment(
                        positionId = position.id,
                        slotIndex = 0,
                        holderType = OfficialAssignmentHolderType.OFFICIAL,
                        userId = users[index].id,
                        eventOfficialId = "event-official-$index",
                    )
                },
                id = "match-1",
            ),
            field = null,
            team1 = team1.team,
            team2 = team2.team,
            teamOfficial = null,
            winnerNextMatch = null,
            loserNextMatch = null,
            previousLeftMatch = null,
            previousRightMatch = null,
        )
        val component = bracketComponent(
            event = event,
            rounds = MutableStateFlow(listOf(listOf(match))),
            matches = listOf(match),
            teams = listOf(team1, team2),
            players = users,
        )

        composeRule.setContent {
            CompositionLocalProvider(LocalTournamentComponent provides component) {
                MaterialTheme {
                    MatchCard(
                        match = match,
                        onClick = {},
                        modifier = Modifier.width(340.dp),
                        manageMode = true,
                    )
                }
            }
        }

        val alignedRows = listOf(
            "M: 1" to "QA Blue",
            "F: Field TBD" to "QA Gold",
        ) + roleAndOfficialNames
        alignedRows.forEach { (leftLabel, rightLabel) ->
            val leftTop = composeRule
                .onNodeWithText(leftLabel, useUnmergedTree = true)
                .getUnclippedBoundsInRoot()
                .top
            val rightTop = composeRule
                .onNodeWithText(rightLabel, useUnmergedTree = true)
                .getUnclippedBoundsInRoot()
                .top

            assertEquals(
                expected = leftTop.value,
                actual = rightTop.value,
                absoluteTolerance = 0.5f,
                message = "$leftLabel and $rightLabel should share a row top",
            )
        }
    }

    private fun bracketComponent(
        event: Event,
        rounds: MutableStateFlow<List<List<MatchWithRelations?>>>,
        matches: List<MatchWithRelations>,
        teams: List<TeamWithPlayers> = emptyList(),
        players: List<UserData> = emptyList(),
    ): EventDetailComponent {
        val component = mockk<EventDetailComponent>(relaxed = true)
        every { component.losersBracket } returns MutableStateFlow(false)
        every { component.rounds } returns rounds
        every { component.editableRounds } returns MutableStateFlow(emptyList())
        every { component.selectedEvent } returns MutableStateFlow(event)
        every { component.divisionTeams } returns MutableStateFlow(
            teams.associateBy { team -> team.team.id }
        )
        every { component.divisionMatches } returns MutableStateFlow(
            matches.associateBy { relation -> relation.match.id }
        )
        every { component.divisionFields } returns MutableStateFlow<List<FieldWithMatches>>(emptyList())
        every { component.currentUser } returns MutableStateFlow(UserData())
        every { component.eventWithRelations } returns MutableStateFlow(
            EventWithFullRelations(
                event = event,
                players = players,
                matches = matches,
                teams = teams,
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

    private fun team(id: String, name: String): TeamWithPlayers = TeamWithPlayers(
        team = Team(
            division = "Open",
            name = name,
            captainId = "",
            teamSize = 0,
            id = id,
        ),
        captain = null,
        players = emptyList(),
        pendingPlayers = emptyList(),
    )

    private fun user(id: String, firstName: String, lastName: String): UserData = UserData(
        firstName = firstName,
        lastName = lastName,
        friendIds = emptyList(),
        friendRequestIds = emptyList(),
        friendRequestSentIds = emptyList(),
        followingIds = emptyList(),
        userName = "",
        hasStripeAccount = false,
        uploadedImages = emptyList(),
        id = id,
    )
}
