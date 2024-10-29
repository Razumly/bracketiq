package com.razumly.mvp.core.data.dataTypes

import kotlinx.datetime.LocalDateTime

data class EventImp(
    override val id: String,
    override val location: String,
    override val lat: Double,
    override val long: Double,
    override val type: String,
    override val start: LocalDateTime,
    override val end: LocalDateTime,
    override val price: String,
    override val rating: Float,
    override val imageUrl: String,
    override val collectionId: String
) : EventAbs() {
}