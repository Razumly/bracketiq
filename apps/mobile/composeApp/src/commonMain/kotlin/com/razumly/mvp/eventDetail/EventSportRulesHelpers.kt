package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.enums.EventType

private val allowedSetCounts = setOf(1, 3, 5)

internal fun Event.withSportRules(sports: List<Sport>): Event {
    val requiresSets = sportId
        ?.let { selectedSportId -> sports.firstOrNull { sport -> sport.id == selectedSportId } }
        ?.usePointsPerSetWin
        ?: false
    return when (eventType) {
        EventType.EVENT,
        EventType.TRYOUT,
        EventType.WEEKLY_EVENT -> this

        EventType.LEAGUE -> applyLeagueSportRules(requiresSets)
        EventType.TOURNAMENT -> applyTournamentSportRules(requiresSets)
    }
}

private fun Event.applyLeagueSportRules(requiresSets: Boolean): Event {
    return if (requiresSets) {
        val normalizedSets = setsPerMatch?.takeIf { it in allowedSetCounts } ?: 1
        val normalizedPoints = pointsToVictory
            .take(normalizedSets)
            .toMutableList()
            .apply {
                while (size < normalizedSets) add(21)
            }
        copy(
            usesSets = true,
            setsPerMatch = normalizedSets,
            setDurationMinutes = setDurationMinutes,
            pointsToVictory = normalizedPoints,
            matchDurationMinutes = null,
            divisionDetails = divisionDetails.map { detail ->
                detail.applyLeagueDivisionSportRules(requiresSets = true)
            },
        )
    } else {
        copy(
            usesSets = false,
            setsPerMatch = null,
            setDurationMinutes = null,
            pointsToVictory = emptyList(),
            matchDurationMinutes = matchDurationMinutes,
            winnerSetCount = 1,
            loserSetCount = 1,
            winnerBracketPointsToVictory = winnerBracketPointsToVictory.take(1).ifEmpty { listOf(21) },
            loserBracketPointsToVictory = loserBracketPointsToVictory.take(1).ifEmpty { listOf(21) },
            divisionDetails = divisionDetails.map { detail ->
                detail.applyLeagueDivisionSportRules(requiresSets = false)
            },
        )
    }
}

private fun Event.applyTournamentSportRules(requiresSets: Boolean): Event {
    return if (!requiresSets) {
        copy(
            usesSets = false,
            setDurationMinutes = null,
            matchDurationMinutes = matchDurationMinutes,
            winnerSetCount = 1,
            loserSetCount = 1,
            winnerBracketPointsToVictory = winnerBracketPointsToVictory.take(1).ifEmpty { listOf(21) },
            loserBracketPointsToVictory = loserBracketPointsToVictory.take(1).ifEmpty { listOf(21) },
            divisionDetails = divisionDetails.map { detail ->
                detail.copy(playoffConfig = detail.playoffConfig?.applyTournamentSportRules(requiresSets = false))
            },
        )
    } else {
        val winnerSets = winnerSetCount.takeIf { it in allowedSetCounts } ?: 1
        val loserSets = loserSetCount.takeIf { it in allowedSetCounts } ?: 1
        copy(
            usesSets = true,
            setDurationMinutes = setDurationMinutes,
            matchDurationMinutes = null,
            winnerSetCount = winnerSets,
            loserSetCount = loserSets,
            winnerBracketPointsToVictory = winnerBracketPointsToVictory
                .take(winnerSets)
                .toMutableList()
                .apply {
                    while (size < winnerSets) add(21)
                },
            loserBracketPointsToVictory = loserBracketPointsToVictory
                .take(loserSets)
                .toMutableList()
                .apply {
                    while (size < loserSets) add(21)
                },
            divisionDetails = divisionDetails.map { detail ->
                detail.copy(playoffConfig = detail.playoffConfig?.applyTournamentSportRules(requiresSets = true))
            },
        )
    }
}

private fun DivisionDetail.applyLeagueDivisionSportRules(requiresSets: Boolean): DivisionDetail {
    return if (requiresSets) {
        val normalizedSets = setsPerMatch?.takeIf { count -> count in allowedSetCounts } ?: 1
        val normalizedPoints = pointsToVictory
            .take(normalizedSets)
            .toMutableList()
            .apply {
                while (size < normalizedSets) add(21)
            }
        copy(
            usesSets = true,
            setsPerMatch = normalizedSets,
            setDurationMinutes = setDurationMinutes,
            pointsToVictory = normalizedPoints,
            matchDurationMinutes = null,
            playoffConfig = playoffConfig?.applyTournamentSportRules(requiresSets = true),
        )
    } else {
        copy(
            usesSets = false,
            setsPerMatch = null,
            setDurationMinutes = null,
            pointsToVictory = emptyList(),
            matchDurationMinutes = matchDurationMinutes,
            playoffConfig = playoffConfig?.applyTournamentSportRules(requiresSets = false),
        )
    }
}

private fun TournamentConfig.applyTournamentSportRules(requiresSets: Boolean): TournamentConfig {
    return if (requiresSets) {
        val winnerSets = winnerSetCount.takeIf { count -> count in allowedSetCounts } ?: 1
        val loserSets = loserSetCount.takeIf { count -> count in allowedSetCounts } ?: 1
        copy(
            usesSets = true,
            setDurationMinutes = setDurationMinutes,
            matchDurationMinutes = null,
            winnerSetCount = winnerSets,
            loserSetCount = loserSets,
            winnerBracketPointsToVictory = winnerBracketPointsToVictory
                .take(winnerSets)
                .toMutableList()
                .apply {
                    while (size < winnerSets) add(21)
                },
            loserBracketPointsToVictory = loserBracketPointsToVictory
                .take(loserSets)
                .toMutableList()
                .apply {
                    while (size < loserSets) add(21)
                },
        )
    } else {
        copy(
            usesSets = false,
            setDurationMinutes = null,
            matchDurationMinutes = matchDurationMinutes,
            winnerSetCount = 1,
            loserSetCount = 1,
            winnerBracketPointsToVictory = winnerBracketPointsToVictory.take(1).ifEmpty { listOf(21) },
            loserBracketPointsToVictory = loserBracketPointsToVictory.take(1).ifEmpty { listOf(21) },
        )
    }
}
