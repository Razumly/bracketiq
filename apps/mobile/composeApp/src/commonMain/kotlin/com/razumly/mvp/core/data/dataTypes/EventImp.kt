package com.razumly.mvp.core.data.dataTypes

import androidx.compose.ui.graphics.toArgb
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.EventDTO
import com.razumly.mvp.core.data.dataTypes.enums.Division
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.enums.FieldType
import com.razumly.mvp.core.presentation.Primary
import io.appwrite.ID
import kotlinx.serialization.Contextual
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Entity
@Serializable
@OptIn(ExperimentalTime::class)
data class EventImp (
    override val hostId: String,
    @PrimaryKey override val id: String,
    override val location: String,
    override val name: String,
    override val description: String,
    override val divisions: List<Division>,
    override val lat: Double,
    override val long: Double,
    override val fieldType: FieldType,
    @Contextual
    override val start: Instant,
    override val end: Instant,
    override val price: Double,
    override val rating: Float?,
    override val imageUrl: String,
    override val teamSizeLimit: Int,
    override val maxParticipants: Int,
    override val teamSignup: Boolean,
    override val singleDivision: Boolean,
    override val waitList: List<String>,
    override val freeAgents: List<String>,
    override val playerIds: List<String>,
    override val teamIds: List<String>,
    override val cancellationRefundHours: Int,
    override val registrationCutoffHours: Int = 0,
    override val seedColor: Int,
    override val isTaxed: Boolean,
    @Transient override val eventType: EventType = EventType.EVENT,
    @Transient override val lastUpdated: Instant = Clock.System.now(),
): EventAbs {
    companion object {
        operator fun invoke(): EventImp {
            return EventImp(
                hostId = "",
                id = ID.unique(),
                location = "",
                name = "",
                description = "",
                divisions = listOf(),
                lat = 0.0,
                long = 0.0,
                fieldType = FieldType.GRASS,
                start = Clock.System.now(),
                end = Clock.System.now(),
                price = 0.0,
                rating = 0f,
                imageUrl = "",
                teamSizeLimit = 2,
                maxParticipants = 0,
                singleDivision = true,
                teamSignup = false,
                waitList = listOf(),
                freeAgents = listOf(),
                playerIds = listOf(),
                teamIds = listOf(),
                cancellationRefundHours = 0,
                registrationCutoffHours = 0,
                seedColor = Primary.toArgb(),
                isTaxed = true
            )
        }
    }

    fun toEventDTO(): EventDTO {
        return EventDTO(
            id = id,
            location = location,
            name = name,
            description = description,
            divisions = divisions.map { it.name },
            fieldType = fieldType.name,
            start = start.toString(),
            end = end.toString(),
            price = price,
            rating = rating,
            imageUrl = imageUrl,
            lat = lat,
            long = long,
            hostId = hostId,
            teamSizeLimit = teamSizeLimit,
            maxParticipants = maxParticipants,
            singleDivision = singleDivision,
            teamSignup = teamSignup,
            waitList = waitList,
            freeAgents = freeAgents,
            playerIds = playerIds,
            teamIds = teamIds,
            cancellationRefundHours = cancellationRefundHours,
            registrationCutoffHours = registrationCutoffHours,
            seedColor = seedColor,
            isTaxed = isTaxed
        )
    }
}