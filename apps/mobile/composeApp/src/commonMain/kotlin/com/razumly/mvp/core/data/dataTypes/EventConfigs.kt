package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable

@Serializable
data class LeagueConfig(
    val gamesPerOpponent: Int = 1,
    val includePlayoffs: Boolean = false,
    val playoffTeamCount: Int? = null,
    val usesSets: Boolean = false,
    val matchDurationMinutes: Int = 60,
    val restTimeMinutes: Int = 0,
    val setDurationMinutes: Int? = null,
    val setsPerMatch: Int? = null,
    val pointsToVictory: List<Int> = emptyList(),
    val doTeamsRef: Boolean = false,
)

@Serializable
data class TournamentConfig(
    val doubleElimination: Boolean = false,
    val winnerSetCount: Int = 1,
    val loserSetCount: Int = 1,
    val winnerBracketPointsToVictory: List<Int> = listOf(21),
    val loserBracketPointsToVictory: List<Int> = listOf(21),
    val prize: String = "",
    val fieldCount: Int = 1,
    val restTimeMinutes: Int = 0,
)

fun Event.toLeagueConfig(): LeagueConfig = LeagueConfig(
    gamesPerOpponent = gamesPerOpponent ?: 1,
    includePlayoffs = includePlayoffs,
    playoffTeamCount = playoffTeamCount,
    usesSets = usesSets,
    matchDurationMinutes = matchDurationMinutes ?: 60,
    restTimeMinutes = restTimeMinutes ?: 0,
    setDurationMinutes = setDurationMinutes,
    setsPerMatch = setsPerMatch,
    pointsToVictory = pointsToVictory,
    doTeamsRef = doTeamsRef ?: false,
)

fun Event.withLeagueConfig(config: LeagueConfig): Event {
    val timedMode = !config.usesSets
    return copy(
        gamesPerOpponent = config.gamesPerOpponent,
        includePlayoffs = config.includePlayoffs,
        playoffTeamCount = if (config.includePlayoffs) config.playoffTeamCount else null,
        usesSets = config.usesSets,
        matchDurationMinutes = if (config.usesSets) null else config.matchDurationMinutes,
        setDurationMinutes = if (config.usesSets) config.setDurationMinutes else null,
        setsPerMatch = if (config.usesSets) config.setsPerMatch else null,
        pointsToVictory = if (config.usesSets) config.pointsToVictory else emptyList(),
        winnerSetCount = if (timedMode) 1 else winnerSetCount,
        loserSetCount = if (timedMode) 1 else loserSetCount,
        winnerBracketPointsToVictory = if (timedMode) {
            winnerBracketPointsToVictory.take(1).ifEmpty { listOf(21) }
        } else {
            winnerBracketPointsToVictory
        },
        loserBracketPointsToVictory = if (timedMode) {
            loserBracketPointsToVictory.take(1).ifEmpty { listOf(21) }
        } else {
            loserBracketPointsToVictory
        },
        restTimeMinutes = config.restTimeMinutes,
        doTeamsRef = config.doTeamsRef,
        teamRefsMaySwap = if (config.doTeamsRef) teamRefsMaySwap else false,
    )
}

fun Event.toTournamentConfig(): TournamentConfig = TournamentConfig(
    doubleElimination = doubleElimination,
    winnerSetCount = winnerSetCount,
    loserSetCount = loserSetCount.coerceAtLeast(1),
    winnerBracketPointsToVictory = if (winnerBracketPointsToVictory.isEmpty()) {
        listOf(21)
    } else {
        winnerBracketPointsToVictory
    },
    loserBracketPointsToVictory = if (loserBracketPointsToVictory.isEmpty()) {
        listOf(21)
    } else {
        loserBracketPointsToVictory
    },
    prize = prize,
    fieldCount = (fieldCount ?: 1).coerceAtLeast(1),
    restTimeMinutes = (restTimeMinutes ?: 0).coerceAtLeast(0),
)

fun Event.withTournamentConfig(config: TournamentConfig): Event = copy(
    doubleElimination = config.doubleElimination,
    winnerSetCount = config.winnerSetCount.coerceAtLeast(1),
    loserSetCount = config.loserSetCount.coerceAtLeast(1),
    winnerBracketPointsToVictory = config.winnerBracketPointsToVictory,
    loserBracketPointsToVictory = config.loserBracketPointsToVictory,
    prize = config.prize,
    fieldCount = config.fieldCount.coerceAtLeast(1),
    restTimeMinutes = config.restTimeMinutes.coerceAtLeast(0),
)
