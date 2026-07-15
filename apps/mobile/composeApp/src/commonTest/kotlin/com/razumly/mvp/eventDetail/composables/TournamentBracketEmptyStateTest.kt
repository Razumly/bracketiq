package com.razumly.mvp.eventDetail.composables

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TournamentBracketEmptyStateTest {

    @Test
    fun empty_and_placeholder_only_rounds_are_not_displayable_brackets() {
        assertFalse(hasDisplayableBracketRounds(emptyList()))
        assertFalse(
            hasDisplayableBracketRounds(
                listOf<List<MatchWithRelations?>>(listOf(null), emptyList()),
            )
        )
    }

    @Test
    fun a_round_with_a_real_match_uses_the_bracket_surface() {
        val match = MatchWithRelations(
            match = MatchMVP(
                matchId = 1,
                eventId = "event-1",
                id = "match-1",
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

        assertTrue(hasDisplayableBracketRounds(listOf(listOf(match))))
    }
}
