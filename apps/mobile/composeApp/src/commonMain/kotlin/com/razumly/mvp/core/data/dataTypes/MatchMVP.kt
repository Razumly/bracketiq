package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.MatchDTO
import com.razumly.mvp.core.data.dataTypes.enums.Division
import kotlinx.serialization.Contextual
import kotlinx.serialization.Serializable
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Entity
@Serializable
@OptIn(ExperimentalTime::class)
data class MatchMVP (
    val matchNumber: Int,
    val team1: String?,
    val team2: String?,
    val tournamentId: String,
    val refId: String?,
    val field: String?,
    @Contextual
    var start: Instant,
    var end: Instant?,
    val division: Division,
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
) : MVPDocument {
    fun toMatchDTO(): MatchDTO {
        return MatchDTO(
            id = id,
            matchId = matchNumber,
            team1 = team1,
            team2 = team2,
            tournamentId = tournamentId,
            refId = refId,
            field = field,
            start = start.toString(),
            end = end?.toString(),
            division = division.name,
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
}