@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchOfficialAssignment
import com.razumly.mvp.core.data.util.normalizeDivisionLabel
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Serializable
data class MatchDTO(
    @Transient
    val id: String = "",
    val matchId: Int,
    val team1Id: String?,
    val team2Id: String?,
    val team1Seed: Int? = null,
    val team2Seed: Int? = null,
    val eventId: String,
    val officialId: String?,
    val fieldId: String?,
    val start: String?,
    val end: String?,
    val division: String?,
    val team1Points: List<Int>,
    val team2Points: List<Int>,
    val setResults: List<Int>,
    val side: String? = null,
    val losersBracket: Boolean,
    val winnerNextMatchId: String?,
    val loserNextMatchId: String?,
    val previousLeftId: String?,
    val previousRightId: String?,
    val officialCheckedIn: Boolean?,
    val officialIds: List<MatchOfficialAssignment> = emptyList(),
    val teamOfficialId: String? = null,
    val locked: Boolean = false,
)

fun MatchDTO.toMatch(id: String): MatchMVP {
    return MatchMVP(
        id = id,
        eventId = eventId,
        team1Id = team1Id,
        team2Id = team2Id,
        team1Seed = team1Seed,
        team2Seed = team2Seed,
        matchId = matchId,
        officialId = officialId,
        fieldId = fieldId,
        start = start?.let { Instant.parse(it) },
        end = end?.let { Instant.parse(it) },
        division = division?.normalizeDivisionLabel(),
        team1Points = team1Points,
        team2Points = team2Points,
        setResults = setResults,
        side = side,
        losersBracket = losersBracket,
        officialCheckedIn = officialCheckedIn,
        officialIds = officialIds,
        winnerNextMatchId = winnerNextMatchId,
        loserNextMatchId = loserNextMatchId,
        previousLeftId = previousLeftId,
        previousRightId = previousRightId,
        teamOfficialId = teamOfficialId,
        locked = locked,
    )
}
