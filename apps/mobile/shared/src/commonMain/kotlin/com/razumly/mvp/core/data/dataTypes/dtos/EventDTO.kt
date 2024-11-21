package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventImp
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

data class EventDTO(
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

fun EventDTO.toEvent(): EventAbs {
    return EventImp(
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
        lastUpdated = Clock.System.now(),
    )
}