package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.util.normalizeDivisionLabel
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Serializable
data class MatchApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,

    val matchId: Int? = null,
    val team1Id: String? = null,
    val team2Id: String? = null,
    val eventId: String? = null,
    val refereeId: String? = null,
    val fieldId: String? = null,
    val start: String? = null,
    val end: String? = null,
    val division: String? = null,
    val team1Points: List<Int>? = null,
    val team2Points: List<Int>? = null,
    val setResults: List<Int>? = null,
    val side: String? = null,
    val losersBracket: Boolean? = null,
    val winnerNextMatchId: String? = null,
    val loserNextMatchId: String? = null,
    val previousLeftId: String? = null,
    val previousRightId: String? = null,
    val refereeCheckedIn: Boolean? = null,
    val teamRefereeId: String? = null,

    // Legacy/alternate field; ignore if present.
    val refCheckedIn: Boolean? = null,
) {
    @OptIn(ExperimentalTime::class)
    fun toMatchOrNull(): MatchMVP? {
        val resolvedId = id ?: legacyId
        val resolvedMatchId = matchId
        val resolvedEventId = eventId
        val resolvedStart = start
        if (resolvedId.isNullOrBlank() || resolvedMatchId == null) return null
        if (resolvedEventId.isNullOrBlank() || resolvedStart.isNullOrBlank()) return null

        return MatchMVP(
            id = resolvedId,
            matchId = resolvedMatchId,
            team1Id = team1Id,
            team2Id = team2Id,
            eventId = resolvedEventId,
            refereeId = refereeId,
            fieldId = fieldId,
            start = Instant.parse(resolvedStart),
            end = end?.let { Instant.parse(it) },
            division = division?.normalizeDivisionLabel(),
            team1Points = team1Points ?: emptyList(),
            team2Points = team2Points ?: emptyList(),
            setResults = setResults ?: emptyList(),
            side = side,
            losersBracket = losersBracket ?: false,
            winnerNextMatchId = winnerNextMatchId,
            loserNextMatchId = loserNextMatchId,
            previousLeftId = previousLeftId,
            previousRightId = previousRightId,
            refereeCheckedIn = refereeCheckedIn ?: refCheckedIn,
            teamRefereeId = teamRefereeId,
        )
    }
}

@Serializable
data class MatchesResponseDto(
    val matches: List<MatchApiDto> = emptyList(),
)

@Serializable
data class MatchResponseDto(
    val match: MatchApiDto? = null,
)

@Serializable
data class MatchUpdateDto(
    val team1Points: List<Int>? = null,
    val team2Points: List<Int>? = null,
    val setResults: List<Int>? = null,
    val team1Id: String? = null,
    val team2Id: String? = null,
    val refereeId: String? = null,
    val teamRefereeId: String? = null,
    val fieldId: String? = null,
    val previousLeftId: String? = null,
    val previousRightId: String? = null,
    val winnerNextMatchId: String? = null,
    val loserNextMatchId: String? = null,
    val side: String? = null,
    val refereeCheckedIn: Boolean? = null,
    val matchId: Int? = null,
    val finalize: Boolean? = null,
    val time: String? = null,
)

@Serializable
data class BulkMatchUpdateEntryDto(
    val id: String,
    val matchId: Int? = null,
    val team1Points: List<Int>? = null,
    val team2Points: List<Int>? = null,
    val setResults: List<Int>? = null,
    val team1Id: String? = null,
    val team2Id: String? = null,
    val refereeId: String? = null,
    val teamRefereeId: String? = null,
    val fieldId: String? = null,
    val previousLeftId: String? = null,
    val previousRightId: String? = null,
    val winnerNextMatchId: String? = null,
    val loserNextMatchId: String? = null,
    val side: String? = null,
    val refereeCheckedIn: Boolean? = null,
)

@Serializable
data class BulkMatchUpdateRequestDto(
    val matches: List<BulkMatchUpdateEntryDto>,
)

fun MatchMVP.toBulkMatchUpdateEntryDto(): BulkMatchUpdateEntryDto = BulkMatchUpdateEntryDto(
    id = id,
    matchId = matchId,
    team1Points = team1Points,
    team2Points = team2Points,
    setResults = setResults,
    team1Id = team1Id,
    team2Id = team2Id,
    refereeId = refereeId,
    teamRefereeId = teamRefereeId,
    fieldId = fieldId,
    previousLeftId = previousLeftId,
    previousRightId = previousRightId,
    winnerNextMatchId = winnerNextMatchId,
    loserNextMatchId = loserNextMatchId,
    side = side,
    refereeCheckedIn = refereeCheckedIn,
)
