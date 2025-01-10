package com.razumly.mvp.core.data.dataTypes

import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

@Serializable
abstract class EventAbs : MVPDocument() {
    abstract val location: String
    abstract val name: String
    abstract val lat: Double
    abstract val long: Double
    abstract val type: String
    abstract val start: Instant
    abstract val end: Instant
    abstract val price: Double
    abstract val rating: Float
    abstract val imageUrl: String
    abstract val collectionId: String
    abstract val lastUpdated: Instant
}