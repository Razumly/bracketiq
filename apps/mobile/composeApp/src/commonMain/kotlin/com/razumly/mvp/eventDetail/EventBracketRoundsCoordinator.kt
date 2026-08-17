package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

internal class EventBracketRoundsCoordinator {
    private val _rounds = MutableStateFlow<List<List<MatchWithRelations?>>>(emptyList())
    val rounds = _rounds.asStateFlow()

    private val _losersBracket = MutableStateFlow(false)
    val losersBracket = _losersBracket.asStateFlow()

    fun refreshRounds(matchesById: Map<String, MatchWithRelations>) {
        _rounds.value = buildBracketRounds(matchesById)
    }

    fun toggleLosersBracket(matchesById: Map<String, MatchWithRelations>) {
        _losersBracket.value = !_losersBracket.value
        refreshRounds(matchesById)
    }

    fun buildBracketRounds(
        matchesById: Map<String, MatchWithRelations>,
    ): List<List<MatchWithRelations?>> {
        if (matchesById.isEmpty()) {
            return emptyList()
        }

        val rounds = mutableListOf<List<MatchWithRelations?>>()
        val visited = mutableSetOf<String>()

        fun nextInScope(matchId: String?): MatchWithRelations? {
            val normalizedId = matchId.normalizedToken() ?: return null
            return matchesById[normalizedId]
        }

        val finalRound = matchesById.values.filter { match ->
            nextInScope(match.match.winnerNextMatchId) == null &&
                nextInScope(match.match.loserNextMatchId) == null
        }

        if (finalRound.isNotEmpty()) {
            rounds += finalRound
            visited += finalRound.map { match -> match.match.id }
        }

        var currentRound: List<MatchWithRelations?> = finalRound
        while (currentRound.isNotEmpty()) {
            val nextRound = mutableListOf<MatchWithRelations?>()

            currentRound.filterNotNull().forEach { match ->
                if (!shouldIncludeInCurrentBracket(match, matchesById)) {
                    nextRound += listOf(null, null)
                    return@forEach
                }

                val leftId = match.match.previousLeftId.normalizedToken()
                val rightId = match.match.previousRightId.normalizedToken()

                val leftMatch = leftId?.let { id -> matchesById[id] }
                if (leftMatch == null) {
                    nextRound += null
                } else if (visited.add(leftMatch.match.id)) {
                    nextRound += leftMatch
                }

                val rightMatch = rightId?.let { id -> matchesById[id] }
                if (rightMatch == null) {
                    nextRound += null
                } else if (visited.add(rightMatch.match.id)) {
                    nextRound += rightMatch
                }
            }

            if (nextRound.any { it != null }) {
                rounds += nextRound
                currentRound = nextRound
            } else {
                break
            }
        }

        return rounds.reversed()
    }

    private fun shouldIncludeInCurrentBracket(
        match: MatchWithRelations,
        matchesById: Map<String, MatchWithRelations>,
    ): Boolean {
        if (!_losersBracket.value) {
            return !match.match.losersBracket
        }

        val left = match.match.previousLeftId.normalizedToken()?.let { id -> matchesById[id] }
        val right = match.match.previousRightId.normalizedToken()?.let { id -> matchesById[id] }

        val finalsMatch = left != null && right != null && left.match.id == right.match.id
        val mergeMatch = left != null && right != null && left.match.losersBracket != right.match.losersBracket
        val opposite = match.match.losersBracket != _losersBracket.value
        val firstRound = left == null && right == null

        return finalsMatch || mergeMatch || !opposite || firstRound
    }

    private fun String?.normalizedToken(): String? =
        this?.trim()?.takeIf(String::isNotBlank)
}
