package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.enums.FieldTypes
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

@Serializable
data class EventDTO(
    val id: String,
    val location: String,
    val name: String,
    val description: String,
    val divisions: List<String>,
    val fieldType: String,
    val start: String,
    val end: String,
    val price: Double,
    val rating: Float?,
    val imageUrl: String,
    val lat: Double,
    val long: Double,
    val hostId: String,
    val teamSizeLimit: Int,
    val maxPlayers: Int,
)

fun EventDTO.toEvent(id: String): EventImp {
    return EventImp(
        id = id,
        location = location,
        name = name,
        description = description,
        divisions = divisions,
        fieldType = FieldTypes.valueOf(fieldType),
        start = Instant.parse(start),
        end = Instant.parse(end),
        price = price,
        rating = rating,
        imageUrl = imageUrl,
        lat = lat,
        long = long,
        lastUpdated = Clock.System.now(),
        hostId = hostId,
        teamSizeLimit = teamSizeLimit,
        maxPlayers = maxPlayers,
    )
}