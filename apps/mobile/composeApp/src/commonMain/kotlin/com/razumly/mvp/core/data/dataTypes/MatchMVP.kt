package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.MatchDTO
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class MatchMVP(
    val matchNumber: Int,
    val team1: String?,
    val team2: String?,
    val tournamentId: String,
    val refId: String?,
    val field: String?,
    var start: Instant,
    var end: Instant?,
    val division: String,
    var team1Points: List<Int>,
    var team2Points: List<Int>,
    val losersBracket: Boolean,
    val winnerNextMatchId: String?,
    val loserNextMatchId: String?,
    val previousLeftMatchId: String?,
    val previousRightMatchId: String?,
    val setResults: List<Int>,
    val refCheckedIn: Boolean?,
    @PrimaryKey override val id: String,
) : MVPDocument

fun MatchMVP.toMatchDTO(): MatchDTO {
    return MatchDTO(
        id = id,
        matchId = matchNumber,
        team1 = team1,
        team2 = team2,
        tournament = tournamentId,
        refId = refId,
        field = field,
        start = start.toString(),
        end = end?.toString(),
        division = division,
        team1Points = team1Points,
        team2Points = team2Points,
        losersBracket = losersBracket,
        winnerNextMatchId = winnerNextMatchId,
        loserNextMatchId = loserNextMatchId,
        previousLeftId = previousLeftMatchId,
        previousRightId = previousRightMatchId,
        setResults = setResults,
        refereeCheckedIn = refCheckedIn,
    )
}