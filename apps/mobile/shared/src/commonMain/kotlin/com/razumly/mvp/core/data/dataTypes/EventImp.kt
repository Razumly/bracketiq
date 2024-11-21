package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.datetime.Instant

@Entity
data class EventImp(
    @PrimaryKey override val id: String,
    override val location: String,
    override val lat: Double,
    override val long: Double,
    override val type: String,
    override val start: Instant,
    override val end: Instant,
    override val price: String,
    override val rating: Float,
    override val imageUrl: String,
    override val collectionId: String,
    override val lastUpdated: Instant,
) : EventAbs() {
}