package com.razumly.mvp.core.data.dataTypes

import kotlinx.datetime.LocalDateTime
import kotlinx.serialization.Serializable

@Serializable
data class Tournament(
    val name: String,
    val description: String,
    val doubleElimination: Boolean,
    val matches: Map<String, Match>,
    val teams: Map<String, Team>,
    val divisions: List<String>,
    val fields: Map<String, Field>,
    val players: Map<String, UserData>,
    val winnerSetCount: Int,
    val loserSetCount: Int,
    val winnerBracketPointsToVictory: List<Int>,
    val loserBracketPointsToVictory: List<Int>,
    val winnerScoreLimitsPerSet: List<Int>,
    val loserScoreLimitsPerSet: List<Int>,
    override var id: String,
    override val location: String,
    override val type: String,
    override val start: LocalDateTime,
    override val end: LocalDateTime,
    override val price: String,
    override val rating: Float,
    override val imageUrl: String,
    override val lat: Double,
    override val long: Double,
    override val collectionId: String,
) : EventAbs()