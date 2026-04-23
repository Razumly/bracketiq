package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import kotlin.math.absoluteValue
import kotlin.math.round

internal data class TeamStanding(
    val team: TeamWithPlayers?,
    val teamId: String,
    val teamName: String,
    val wins: Int,
    val losses: Int,
    val draws: Int,
    val goalsFor: Int,
    val goalsAgainst: Int,
    val matchesPlayed: Int,
    val basePoints: Double,
    val finalPoints: Double,
    val pointsDelta: Double,
) {
    val goalDifferential: Int get() = goalsFor - goalsAgainst
}

internal enum class LeagueStandingsColumn(
    val label: String,
    val weight: Float,
) {
    WINS("W", 0.45f),
    LOSSES("L", 0.45f),
    DRAWS("D", 0.45f),
    POINTS("Pts", 0.75f);

    fun valueFor(standing: TeamStanding): String =
        when (this) {
            WINS -> standing.wins.toString()
            LOSSES -> standing.losses.toString()
            DRAWS -> standing.draws.toString()
            POINTS -> standing.finalPoints.formatStandingsPoints()
        }
}

internal fun visibleLeagueStandingsColumns(showDrawColumn: Boolean): List<LeagueStandingsColumn> =
    buildList {
        add(LeagueStandingsColumn.WINS)
        add(LeagueStandingsColumn.LOSSES)
        if (showDrawColumn) {
            add(LeagueStandingsColumn.DRAWS)
        }
        add(LeagueStandingsColumn.POINTS)
    }

internal fun resolveLeagueStandingsSupportsDraw(
    event: Event,
    sport: Sport?,
): Boolean = resolveEventMatchRules(event = event, sport = sport).supportsDraw

private data class StandingAccumulator(
    var wins: Int = 0,
    var losses: Int = 0,
    var draws: Int = 0,
    var goalsFor: Int = 0,
    var goalsAgainst: Int = 0,
    var matchesPlayed: Int = 0,
    var points: Double = 0.0,
)

private enum class MatchOutcome { WIN, LOSS, DRAW }

internal fun buildLeagueStandings(
    teams: List<TeamWithPlayers>,
    matches: List<MatchWithRelations>,
    config: LeagueScoringConfig?,
    supportsDraw: Boolean,
): List<TeamStanding> {
    if (teams.isEmpty()) return emptyList()

    val teamMap = teams.associateBy { it.team.id }
    val accumulators = teams.associate { it.team.id to StandingAccumulator() }.toMutableMap()

    matches.forEach { match ->
        val teamOneId = match.match.team1Id ?: return@forEach
        val teamTwoId = match.match.team2Id ?: return@forEach
        if (teamOneId == teamTwoId) return@forEach
        if (!teamMap.containsKey(teamOneId) || !teamMap.containsKey(teamTwoId)) return@forEach

        val teamOneScore = match.match.team1Points.takeIf { it.isNotEmpty() }?.sum()
        val teamTwoScore = match.match.team2Points.takeIf { it.isNotEmpty() }?.sum()
        val winnerId = match.match.winnerEventTeamId
            ?.trim()
            ?.takeIf(String::isNotBlank)

        val outcome = when {
            winnerId == teamOneId -> MatchOutcome.WIN to MatchOutcome.LOSS
            winnerId == teamTwoId -> MatchOutcome.LOSS to MatchOutcome.WIN
            teamOneScore == null || teamTwoScore == null -> return@forEach
            teamOneScore > teamTwoScore -> MatchOutcome.WIN to MatchOutcome.LOSS
            teamOneScore < teamTwoScore -> MatchOutcome.LOSS to MatchOutcome.WIN
            supportsDraw -> MatchOutcome.DRAW to MatchOutcome.DRAW
            else -> return@forEach
        }

        accumulators[teamOneId]?.applyMatchResult(
            goalsFor = teamOneScore ?: 0,
            goalsAgainst = teamTwoScore ?: 0,
            outcome = outcome.first,
            config = config,
        )
        accumulators[teamTwoId]?.applyMatchResult(
            goalsFor = teamTwoScore ?: 0,
            goalsAgainst = teamOneScore ?: 0,
            outcome = outcome.second,
            config = config,
        )
    }

    return teams.map { team ->
        val stats = accumulators[team.team.id] ?: StandingAccumulator()
        TeamStanding(
            team = team,
            teamId = team.team.id,
            teamName = team.team.name.ifBlank { team.team.id },
            wins = stats.wins,
            losses = stats.losses,
            draws = stats.draws,
            goalsFor = stats.goalsFor,
            goalsAgainst = stats.goalsAgainst,
            matchesPlayed = stats.matchesPlayed,
            basePoints = stats.points,
            finalPoints = stats.points,
            pointsDelta = 0.0,
        )
    }.sortedWith(
        compareByDescending<TeamStanding> { it.finalPoints }
            .thenByDescending { it.goalDifferential }
            .thenBy { it.teamName.ifBlank { it.teamId } },
    )
}

private fun StandingAccumulator.applyMatchResult(
    goalsFor: Int,
    goalsAgainst: Int,
    outcome: MatchOutcome,
    config: LeagueScoringConfig?,
) {
    this.goalsFor += goalsFor
    this.goalsAgainst += goalsAgainst
    matchesPlayed += 1

    when (outcome) {
        MatchOutcome.WIN -> wins += 1
        MatchOutcome.LOSS -> losses += 1
        MatchOutcome.DRAW -> draws += 1
    }

    val matchPoints = when (outcome) {
        MatchOutcome.WIN -> (config?.pointsForWin ?: DEFAULT_POINTS_FOR_WIN).toDouble()
        MatchOutcome.LOSS -> (config?.pointsForLoss ?: DEFAULT_POINTS_FOR_LOSS).toDouble()
        MatchOutcome.DRAW -> (config?.pointsForDraw ?: DEFAULT_POINTS_FOR_DRAW).toDouble()
    }

    points += matchPoints
}

internal fun Double.formatStandingsPoints(): String {
    val decimals = when {
        (this % 1.0).absoluteValue < 0.0001 -> 0
        else -> 2
    }
    if (decimals <= 0) return this.toLong().toString()

    var factor = 1.0
    repeat(decimals) { factor *= 10 }
    val roundedValue = (round(this * factor) / factor).let { if (it == -0.0) 0.0 else it }
    val rawText = roundedValue.toString()
    val decimalIndex = rawText.indexOf('.')
    return if (decimalIndex == -1) {
        buildString {
            append(rawText)
            append('.')
            repeat(decimals) { append('0') }
        }
    } else {
        val decimalsPresent = rawText.length - decimalIndex - 1
        if (decimalsPresent >= decimals) {
            rawText
        } else {
            buildString {
                append(rawText)
                repeat(decimals - decimalsPresent) { append('0') }
            }
        }
    }
}

private const val DEFAULT_POINTS_FOR_WIN = 3
private const val DEFAULT_POINTS_FOR_DRAW = 1
private const val DEFAULT_POINTS_FOR_LOSS = 0
