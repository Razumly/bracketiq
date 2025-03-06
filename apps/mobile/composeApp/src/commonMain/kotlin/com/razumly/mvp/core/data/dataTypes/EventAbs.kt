package com.razumly.mvp.core.data.dataTypes

import com.razumly.mvp.core.data.dataTypes.enums.FieldTypes
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

@Serializable
sealed interface EventAbs : MVPDocument {
    val location: String
    val name: String
    val description: String?
    val divisions: List<String>
    val lat: Double
    val long: Double
    val fieldType: FieldTypes
    val start: Instant
    val end: Instant
    val price: Double
    val rating: Float?
    val imageUrl: String
    val maxPlayers: Int
    val teamSizeLimit: Int
    val collectionId: String
    val lastUpdated: Instant
    val hostId: String
    override val id: String
}