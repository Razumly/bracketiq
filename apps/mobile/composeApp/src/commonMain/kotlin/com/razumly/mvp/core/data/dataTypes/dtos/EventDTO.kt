package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.Division
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.enums.FieldType
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Serializable
@OptIn(ExperimentalTime::class)
data class EventDTO(
    val name: String,
    val description: String,
    val doubleElimination: Boolean = false,
    val divisions: List<String> = emptyList(),
    val winnerSetCount: Int = 1,
    val loserSetCount: Int = 0,
    val winnerBracketPointsToVictory: List<Int> = emptyList(),
    val loserBracketPointsToVictory: List<Int> = emptyList(),
    val winnerScoreLimitsPerSet: List<Int> = emptyList(),
    val loserScoreLimitsPerSet: List<Int> = emptyList(),
    val prize: String = "",
    @Transient val id: String = "",
    val location: String,
    val fieldType: String,
    val start: String,
    val end: String,
    val price: Double,
    val rating: Float? = null,
    val imageUrl: String,
    val hostId: String,
    val lat: Double,
    val long: Double,
    val maxParticipants: Int,
    val teamSizeLimit: Int,
    val teamSignup: Boolean,
    val singleDivision: Boolean,
    @SerialName("waitListIds")
    val waitList: List<String> = emptyList(),
    @SerialName("freeAgentIds")
    val freeAgents: List<String> = emptyList(),
    @SerialName("userIds")
    val playerIds: List<String> = emptyList(),
    val teamIds: List<String> = emptyList(),
    val cancellationRefundHours: Int = 0,
    val registrationCutoffHours: Int = 0,
    val seedColor: Int = 0,
    val isTaxed: Boolean = true,
    @SerialName("imageId")
    val imageId: String = "",
    @SerialName("sportId")
    val sportId: String? = null,
    @SerialName("timeSlotIds")
    val timeSlotIds: List<String> = emptyList(),
    @SerialName("fieldIds")
    val fieldIds: List<String> = emptyList(),
    @SerialName("leagueScoringConfigId")
    val leagueScoringConfigId: String? = null,
    @SerialName("organizationId")
    val organizationId: String? = null,
    @SerialName("autoCancellation")
    val autoCancellation: Boolean = false,
    val eventType: String = EventType.EVENT.name
) {
    fun toEvent(id: String): Event =
        Event(
            doubleElimination = doubleElimination,
            winnerSetCount = winnerSetCount,
            loserSetCount = loserSetCount,
            winnerBracketPointsToVictory = winnerBracketPointsToVictory,
            loserBracketPointsToVictory = loserBracketPointsToVictory,
            winnerScoreLimitsPerSet = winnerScoreLimitsPerSet,
            loserScoreLimitsPerSet = loserScoreLimitsPerSet,
            prize = prize,
            id = id,
            name = name,
            description = description,
            divisions = divisions.map(Division::valueOf),
            location = location,
            fieldType = FieldType.valueOf(fieldType),
            start = Instant.parse(start),
            end = Instant.parse(end),
            price = price,
            rating = rating,
            imageUrl = imageUrl,
            lat = lat,
            long = long,
            hostId = hostId,
            teamSignup = teamSignup,
            singleDivision = singleDivision,
            freeAgents = freeAgents,
            waitList = waitList,
            playerIds = playerIds,
            teamIds = teamIds,
            cancellationRefundHours = cancellationRefundHours,
            registrationCutoffHours = registrationCutoffHours,
            seedColor = seedColor,
            isTaxed = isTaxed,
            imageId = imageId,
            sportId = sportId,
            timeSlotIds = timeSlotIds,
            fieldIds = fieldIds,
            leagueScoringConfigId = leagueScoringConfigId,
            organizationId = organizationId,
            autoCancellation = autoCancellation,
            maxParticipants = maxParticipants,
            teamSizeLimit = teamSizeLimit,
            eventType = EventType.valueOf(eventType),
            lastUpdated = Clock.System.now()
        )
}
