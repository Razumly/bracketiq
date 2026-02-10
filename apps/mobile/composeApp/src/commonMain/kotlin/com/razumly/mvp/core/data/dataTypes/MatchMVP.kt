package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.MatchDTO
import kotlinx.serialization.Contextual
import kotlinx.serialization.Serializable
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Entity
@Serializable
@OptIn(ExperimentalTime::class)
data class MatchMVP (
    val matchId: Int,
    val team1Id: String? = null,
    val team2Id: String? = null,
    val eventId: String,
    val refereeId: String? = null,
    val fieldId: String? = null,
    @Contextual
    val start: Instant,
    val end: Instant? = null,
    val division: String? = null,
    var team1Points: List<Int> = emptyList(),
    var team2Points: List<Int> = emptyList(),
    val setResults: List<Int> = emptyList(),
    val side: String? = null,
    val losersBracket: Boolean = false,
    val winnerNextMatchId: String? = null,
    val loserNextMatchId: String? = null,
    val previousLeftId: String? = null,
    val previousRightId: String? = null,
    val refereeCheckedIn: Boolean? = null,
    val teamRefereeId: String? = null,
    @PrimaryKey override val id: String,
) : MVPDocument {
    fun toMatchDTO(): MatchDTO {
        return MatchDTO(
            id = id,
            matchId = matchId,
            team1Id = team1Id,
            team2Id = team2Id,
            eventId = eventId,
            refereeId = refereeId,
            fieldId = fieldId,
            start = start.toString(),
            end = end?.toString(),
            division = division,
            team1Points = team1Points,
            team2Points = team2Points,
            setResults = setResults,
            side = side,
            losersBracket = losersBracket,
            winnerNextMatchId = winnerNextMatchId,
            loserNextMatchId = loserNextMatchId,
            previousLeftId = previousLeftId,
            previousRightId = previousRightId,
            refereeCheckedIn = refereeCheckedIn,
            teamRefereeId = teamRefereeId,
        )
    }
}
