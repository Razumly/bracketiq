package com.razumly.mvp.core.data.dataTypes.dtos

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