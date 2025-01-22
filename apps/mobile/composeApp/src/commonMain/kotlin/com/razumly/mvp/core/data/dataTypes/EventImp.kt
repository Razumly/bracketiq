package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.datetime.Instant
import kotlinx.serialization.Transient

@Entity
data class EventImp(
    @PrimaryKey override val id: String,
    override val location: String,
    override val name: String,
    override val description: String,
    override val lat: Double,
    override val long: Double,
    override val type: String,
    override val start: Instant,
    override val end: Instant,
    override val price: Double,
    override val rating: Float,
    override val imageUrl: String,
    @Transient override val collectionId: String,
    @Transient override val lastUpdated: Instant,
) : EventAbs() {
}