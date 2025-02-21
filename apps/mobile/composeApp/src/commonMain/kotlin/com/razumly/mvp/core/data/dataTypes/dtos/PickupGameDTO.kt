package com.razumly.mvp.core.data.dataTypes.dtos

import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.PickupGame
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class PickupGameDTO(
    val hostId: String,
    @PrimaryKey val id: String,
    val location: String,
    val name: String,
    val description: String? = null,
    val divisions: List<String>,
    val lat: Double,
    val long: Double,
    val type: String,
    val start: String,
    val end: String?,
    val price: Double?,
    val rating: Float?,
    val imageUrl: String,
    @Transient val collectionId: String = "",
    @Transient val lastUpdated: Instant = Instant.fromEpochSeconds(0),
)



fun PickupGameDTO.toPickupGame(id: String): PickupGame {
    return PickupGame(
        hostId = hostId,
        name = name,
        description = description,
        divisions = divisions,
        id = id,
        location = location,
        type = type,
        start = Instant.parse(start),
        end = end?.let { Instant.parse(it) },
        price = price,
        rating = rating,
        imageUrl = imageUrl,
        lat = lat,
        long = long,
        collectionId = collectionId,
        lastUpdated = Clock.System.now(),
    )
}