package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Entity
@Serializable
data class Tournament(
    val doubleElimination: Boolean = false,
    val winnerSetCount: Int = 0,
    val loserSetCount: Int = 0,
    val winnerBracketPointsToVictory: List<Int> = listOf(),
    val loserBracketPointsToVictory: List<Int> = listOf(),
    val winnerScoreLimitsPerSet: List<Int> = listOf(),
    val loserScoreLimitsPerSet: List<Int> = listOf(),
    @PrimaryKey override var id: String,
    override val name: String = "",
    override val description: String = "",
    override val divisions: List<String> = listOf(),
    override val location: String = "",
    override val type: String = "",
    override val start: Instant = Instant.DISTANT_PAST,
    override val end: Instant = Instant.DISTANT_PAST,
    override val price: Double = 0.0,
    override val rating: Float = 0f,
    override val imageUrl: String = "",
    override val lat: Double = 0.0,
    override val long: Double = 0.0,
    @Transient override val collectionId: String = "",
    @Transient override val lastUpdated: Instant = Instant.fromEpochSeconds(0),
) : EventAbs()