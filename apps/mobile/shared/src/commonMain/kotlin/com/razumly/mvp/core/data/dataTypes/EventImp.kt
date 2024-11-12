package com.razumly.mvp.core.data.dataTypes

import kotlinx.datetime.Instant

data class EventImp(
    override val id: String,
    override val location: String,
    override val lat: Double,
    override val long: Double,
    override val type: String,
    override val start: Instant,
    override val end: Instant,
    override val price: String,
    override val rating: Float,
    override val imageUrl: String,
    override val collectionId: String
) : EventAbs() {
}