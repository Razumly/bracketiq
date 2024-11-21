package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.TypeConverter
import androidx.room.TypeConverters
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class Tournament(
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
    @PrimaryKey override var id: String,
    override val location: String,
    override val type: String,
    override val start: Instant,
    override val end: Instant,
    override val price: String,
    override val rating: Float,
    override val imageUrl: String,
    override val lat: Double,
    override val long: Double,
    override val collectionId: String,
    override val lastUpdated: Instant = Instant.fromEpochSeconds(0),
) : EventAbs()