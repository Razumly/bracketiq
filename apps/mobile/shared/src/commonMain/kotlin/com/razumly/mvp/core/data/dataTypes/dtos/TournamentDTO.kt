package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Tournament
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

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
    val price: String,
    val rating: Float,
    val imageUrl: String,
    val lat: Double,
    val long: Double,
    val collectionId: String,
)