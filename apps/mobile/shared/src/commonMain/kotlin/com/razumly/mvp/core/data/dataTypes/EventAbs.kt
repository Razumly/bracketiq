package com.razumly.mvp.core.data.dataTypes

import kotlinx.datetime.LocalDateTime

abstract class EventAbs : Document() {
    abstract val location: String
    abstract val lat: Double
    abstract val long: Double
    abstract val type: String
    abstract val start: LocalDateTime
    abstract val end: LocalDateTime
    abstract val price: String
    abstract val rating: Float
    abstract val imageUrl: String
    abstract val collectionId: String
}