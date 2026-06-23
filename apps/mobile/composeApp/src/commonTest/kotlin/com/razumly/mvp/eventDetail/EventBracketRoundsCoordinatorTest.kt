package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventBracketRoundsCoordinatorTest {
    @Test
    fun refresh_rounds_builds_winner_bracket_from_leaf_round_to_final() {
        val coordinator = EventBracketRoundsCoordinator()
        val left = relation(match(id = "left", winnerNextMatchId = "final"))
        val right = relation(match(id = "right", winnerNextMatchId = "final"))
        val final = relation(match(id = "final", previousLeftId = "left", previousRightId = "right"))

        coordinator.refreshRounds(matchesById(left, right, final))

        assertEquals(
            listOf(listOf("left", "right"), listOf("final")),
            coordinator.rounds.value.ids(),
        )
        assertFalse(coordinator.losersBracket.value)
    }

    @Test
    fun toggle_losers_bracket_rebuilds_rounds_for_losers_branch() {
        val coordinator = EventBracketRoundsCoordinator()
        val winnerLeft = relation(match(id = "winner-left", winnerNextMatchId = "winner-final"))
        val winnerRight = relation(match(id = "winner-right", winnerNextMatchId = "winner-final"))
        val winnerFinal = relation(
            match(
                id = "winner-final",
                previousLeftId = "winner-left",
                previousRightId = "winner-right",
            )
        )
        val loserLeft = relation(match(id = "loser-left", losersBracket = true, winnerNextMatchId = "loser-final"))
        val loserRight = relation(match(id = "loser-right", losersBracket = true, winnerNextMatchId = "loser-final"))
        val loserFinal = relation(
            match(
                id = "loser-final",
                losersBracket = true,
                previousLeftId = "loser-left",
                previousRightId = "loser-right",
            )
        )
        val matches = matchesById(winnerLeft, winnerRight, winnerFinal, loserLeft, loserRight, loserFinal)
        coordinator.refreshRounds(matches)

        coordinator.toggleLosersBracket(matches)

        assertTrue(coordinator.losersBracket.value)
        assertEquals(
            listOf(listOf(null, null, "loser-left", "loser-right"), listOf("winner-final", "loser-final")),
            coordinator.rounds.value.ids(),
        )
    }

    @Test
    fun refresh_rounds_clears_state_for_empty_matches() {
        val coordinator = EventBracketRoundsCoordinator()
        val final = relation(match(id = "final"))
        coordinator.refreshRounds(matchesById(final))

        coordinator.refreshRounds(emptyMap())

        assertEquals(emptyList(), coordinator.rounds.value)
    }

    private fun matchesById(vararg matches: MatchWithRelations): Map<String, MatchWithRelations> =
        matches.associateBy { relation -> relation.match.id }

    private fun List<List<MatchWithRelations?>>.ids(): List<List<String?>> =
        map { round -> round.map { relation -> relation?.match?.id } }

    private fun relation(match: MatchMVP): MatchWithRelations =
        MatchWithRelations(
            match = match,
            field = null,
            team1 = null,
            team2 = null,
            teamOfficial = null,
            winnerNextMatch = null,
            loserNextMatch = null,
            previousLeftMatch = null,
            previousRightMatch = null,
        )

    private fun match(
        id: String,
        losersBracket: Boolean = false,
        winnerNextMatchId: String? = null,
        previousLeftId: String? = null,
        previousRightId: String? = null,
    ): MatchMVP =
        MatchMVP(
            id = id,
            matchId = id.hashCode(),
            eventId = "event-1",
            losersBracket = losersBracket,
            winnerNextMatchId = winnerNextMatchId,
            previousLeftId = previousLeftId,
            previousRightId = previousRightId,
        )
}
