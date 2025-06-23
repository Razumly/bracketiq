package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.enums.Division
import com.razumly.mvp.core.data.dataTypes.enums.FieldType
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class TournamentDTO(
    val name: String,
    val description: String,
    val doubleElimination: Boolean,
    val divisions: List<String>,
    val winnerSetCount: Int,
    val loserSetCount: Int,
    val winnerBracketPointsToVictory: List<Int>,
    val loserBracketPointsToVictory: List<Int>,
    val winnerScoreLimitsPerSet: List<Int>,
    val loserScoreLimitsPerSet: List<Int>,
    @Transient
    val id: String = "",
    val location: String,
    val fieldType: String,
    val start: String,  // ISO-8601 format string
    val end: String,    // ISO-8601 format string
    val price: Double,
    val rating: Float,
    val imageUrl: String,
    val hostId: String,
    val lat: Double,
    val long: Double,
    val maxParticipants: Int,
    val teamSizeLimit: Int,
    val teamSignup: Boolean,
    val singleDivision: Boolean,
    val freeAgents: List<String>,
    val waitList: List<String>,
    val cancellationRefundHours: Int,
)

fun TournamentDTO.toTournament(id: String): Tournament {
    return Tournament(
        id = id,
        name = name,
        description = description,
        doubleElimination = doubleElimination,
        divisions = divisions.map { Division.valueOf(it)},
        winnerSetCount = winnerSetCount,
        loserSetCount = loserSetCount,
        winnerBracketPointsToVictory = winnerBracketPointsToVictory,
        loserBracketPointsToVictory = loserBracketPointsToVictory,
        winnerScoreLimitsPerSet = winnerScoreLimitsPerSet,
        loserScoreLimitsPerSet = loserScoreLimitsPerSet,
        location = location,
        fieldType = FieldType.valueOf(fieldType),
        start = Instant.parse(start),
        end = Instant.parse(end),
        hostId = hostId,
        price = price,
        rating = rating,
        imageUrl = imageUrl,
        lat = lat,
        long = long,
        lastUpdated = Clock.System.now(),
        maxParticipants = maxParticipants,
        teamSizeLimit = teamSizeLimit,
        teamSignup = teamSignup,
        singleDivision = singleDivision,
        waitList = waitList,
        freeAgents = freeAgents,
        cancellationRefundHours = cancellationRefundHours
    )
}