package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import io.appwrite.ID
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Entity
@Serializable
data class Tournament(
    val description: String = "",
    val doubleElimination: Boolean = false,
    val divisions: List<String> = listOf(),
    val winnerSetCount: Int = 0,
    val loserSetCount: Int = 0,
    val winnerBracketPointsToVictory: List<Int> = listOf(),
    val loserBracketPointsToVictory: List<Int> = listOf(),
    val winnerScoreLimitsPerSet: List<Int> = listOf(),
    val loserScoreLimitsPerSet: List<Int> = listOf(),
    @Transient @PrimaryKey override var id: String = ID.unique(),
    override val name: String = "",
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