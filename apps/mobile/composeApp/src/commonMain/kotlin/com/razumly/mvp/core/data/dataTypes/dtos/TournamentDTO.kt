package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Tournament
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

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
    val id: String,
    val location: String,
    val type: String,
    val start: String,  // ISO-8601 format string
    val end: String,    // ISO-8601 format string
    val price: Double,
    val rating: Float,
    val imageUrl: String,
    val lat: Double,
    val long: Double,
    val collectionId: String,
)

fun TournamentDTO.toTournament(): Tournament {
    return Tournament(
        name = name,
        description = description,
        doubleElimination = doubleElimination,
        divisions = divisions,
        winnerSetCount = winnerSetCount,
        loserSetCount = loserSetCount,
        winnerBracketPointsToVictory = winnerBracketPointsToVictory,
        loserBracketPointsToVictory = loserBracketPointsToVictory,
        winnerScoreLimitsPerSet = winnerScoreLimitsPerSet,
        loserScoreLimitsPerSet = loserScoreLimitsPerSet,
        id = id,
        location = location,
        type = type,
        start = Instant.parse(start),
        end = Instant.parse(end),
        price = price,
        rating = rating,
        imageUrl = imageUrl,
        lat = lat,
        long = long,
        collectionId = collectionId,
        lastUpdated = Clock.System.now()
    )
}