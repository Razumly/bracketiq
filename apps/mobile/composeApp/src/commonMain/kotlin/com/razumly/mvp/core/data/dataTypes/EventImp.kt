package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.enums.FieldTypes
import com.razumly.mvp.core.util.DbConstants
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Entity
@Serializable
data class EventImp(
    override val hostId: String,
    @PrimaryKey override val id: String,
    override val location: String,
    override val name: String,
    override val description: String? = null,
    override val divisions: List<String>,
    override val lat: Double,
    override val long: Double,
    override val fieldType: FieldTypes,
    override val start: Instant,
    override val end: Instant,
    override val price: Double,
    override val rating: Float?,
    override val imageUrl: String,
    override val teamSizeLimit: Int,
    override val maxPlayers: Int,
    @Transient override val collectionId: String = "",
    @Transient override val lastUpdated: Instant = Clock.System.now(),
): EventAbs {
    companion object {
        operator fun invoke(): EventImp {
            return EventImp(
                hostId = "",
                id = "",
                location = "",
                name = "",
                description = "",
                divisions = listOf(),
                lat = 0.0,
                long = 0.0,
                fieldType = FieldTypes.GRASS,
                start = Instant.DISTANT_PAST,
                end = Instant.DISTANT_PAST,
                price = 0.0,
                rating = 0f,
                imageUrl = "",
                teamSizeLimit = 0,
                maxPlayers = 0,
                collectionId = DbConstants.EVENT_COLLECTION,
            )
        }
    }
}