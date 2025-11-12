package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.Division
import com.razumly.mvp.core.data.dataTypes.enums.FieldType
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Serializable
@OptIn(ExperimentalTime::class)
data class EventDTO(
    @Transient
    val id: String = "",
    val location: String,
    val name: String,
    val description: String,
    val divisions: List<String>,
    val fieldType: String,
    val start: String,
    val end: String,
    val price: Double,
    val rating: Float?,
    val imageUrl: String,
    val lat: Double,
    val long: Double,
    val hostId: String,
    val teamSizeLimit: Int,
    val maxParticipants: Int,
    val teamSignup: Boolean,
    val singleDivision: Boolean,
    val waitList: List<String>,
    val freeAgents: List<String>,
    val playerIds: List<String>,
    val teamIds: List<String>,
    val cancellationRefundHours: Int,
    val registrationCutoffHours: Int,
    val seedColor: Int,
    val isTaxed: Boolean,
) {
    fun toEvent(id: String): Event {
        return Event(
            id = id,
            location = location,
            name = name,
            description = description,
            divisions = divisions.map { Division.valueOf(it) },
            fieldType = FieldType.valueOf(fieldType),
            start = Instant.parse(start),
            end = Instant.parse(end),
            price = price,
            rating = rating,
            imageUrl = imageUrl,
            lat = lat,
            long = long,
            lastUpdated = Clock.System.now(),
            hostId = hostId,
            teamSizeLimit = teamSizeLimit,
            maxParticipants = maxParticipants,
            teamSignup = teamSignup,
            singleDivision = singleDivision,
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