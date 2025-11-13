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
data class Event(
    val doubleElimination: Boolean,
    val winnerSetCount: Int,
    val loserSetCount: Int,
    val winnerBracketPointsToVictory: List<Int>,
    val loserBracketPointsToVictory: List<Int>,
    val winnerScoreLimitsPerSet: List<Int>,
    val loserScoreLimitsPerSet: List<Int>,
    val prize: String,
    @PrimaryKey override val id: String,
    override val name: String,
    override val description: String,
    override val divisions: List<Division>,
    override val location: String,
    override val fieldType: FieldType,
    @Contextual override val start: Instant,
    @Contextual override val end: Instant,
    override val price: Double,
    override val rating: Float?,
    override val imageUrl: String,
    override val lat: Double,
    override val long: Double,
    override val hostId: String,
    override val teamSignup: Boolean,
    override val singleDivision: Boolean,
    override val freeAgents: List<String>,
    override val waitList: List<String>,
    override val playerIds: List<String>,
    override val teamIds: List<String>,
    override val cancellationRefundHours: Int,
    override val registrationCutoffHours: Int = 0,
    override val seedColor: Int,
    override val isTaxed: Boolean,
    val imageId: String,
    val sportId: String?,
    val timeSlotIds: List<String>,
    val fieldIds: List<String>,
    val leagueScoringConfigId: String?,
    val organizationId: String?,
    val autoCancellation: Boolean,
    override val maxParticipants: Int,
    override val teamSizeLimit: Int,
    override val eventType: EventType = EventType.EVENT,
    @Transient override val lastUpdated: Instant = Clock.System.now(),
) : EventAbs {
    companion object {
        operator fun invoke(): Event {
            return Event(
                doubleElimination = false,
                winnerSetCount = 1,
                loserSetCount = 0,
                winnerBracketPointsToVictory = listOf(21),
                loserBracketPointsToVictory = emptyList(),
                winnerScoreLimitsPerSet = emptyList(),
                loserScoreLimitsPerSet = emptyList(),
                id = ID.unique(),
                name = "",
                description = "",
                divisions = emptyList(),
                location = "",
                fieldType = FieldType.GRASS,
                start = Instant.DISTANT_PAST,
                end = Instant.DISTANT_PAST,
                hostId = "",
                price = 0.0,
                rating = 0f,
                imageUrl = "",
                lat = 0.0,
                long = 0.0,
                maxParticipants = 0,
                teamSizeLimit = 2,
                singleDivision = true,
                teamSignup = true,
                waitList = emptyList(),
                freeAgents = emptyList(),
                playerIds = emptyList(),
                teamIds = emptyList(),
                cancellationRefundHours = 0,
                registrationCutoffHours = 0,
                prize = "",
                seedColor = Primary.toArgb(),
                isTaxed = true,
                imageId = "",
                sportId = null,
                timeSlotIds = emptyList(),
                fieldIds = emptyList(),
                leagueScoringConfigId = null,
                organizationId = null,
                autoCancellation = false
            )
        }
    }

    fun updateTournamentFromEvent(event: Event): Event =
        copy(
            name = event.name,
            description = event.description,
            divisions = event.divisions,
            location = event.location,
            fieldType = event.fieldType,
            start = event.start,
            end = event.end,
            price = event.price,
            rating = event.rating ?: 0f,
            imageUrl = event.imageUrl,
            imageId = event.imageId,
            lat = event.lat,
            long = event.long,
            maxParticipants = event.maxParticipants,
            teamSizeLimit = event.teamSizeLimit,
            hostId = event.hostId,
            singleDivision = event.singleDivision,
            teamSignup = event.teamSignup,
            waitList = event.waitList,
            freeAgents = event.freeAgents,
            playerIds = event.playerIds,
            teamIds = event.teamIds,
            cancellationRefundHours = event.cancellationRefundHours,
            registrationCutoffHours = event.registrationCutoffHours,
            seedColor = event.seedColor,
            isTaxed = event.isTaxed,
            sportId = event.sportId,
            timeSlotIds = event.timeSlotIds,
            fieldIds = event.fieldIds,
            leagueScoringConfigId = event.leagueScoringConfigId,
            organizationId = event.organizationId,
            autoCancellation = event.autoCancellation,
            eventType = EventType.TOURNAMENT,
            lastUpdated = Clock.System.now()
        )

    fun toEvent(): Event {
        val base = Event()
        return base.copy(
            id = id,
            location = location,
            name = name,
            description = description,
            divisions = divisions,
            fieldType = fieldType,
            start = start,
            end = end,
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
            maxParticipants = maxParticipants,
            teamSizeLimit = teamSizeLimit,
            imageId = imageId,
            sportId = sportId,
            timeSlotIds = timeSlotIds,
            fieldIds = fieldIds,
            leagueScoringConfigId = leagueScoringConfigId,
            organizationId = organizationId,
            autoCancellation = autoCancellation,
            eventType = EventType.EVENT,
            lastUpdated = Clock.System.now()
        )
    }
}

fun Event.toEventDTO(): EventDTO =
    EventDTO(
        id = id,
        name = name,
        description = description,
        doubleElimination = doubleElimination,
        divisions = divisions.map { it.name },
        winnerSetCount = winnerSetCount,
        loserSetCount = loserSetCount,
        winnerBracketPointsToVictory = winnerBracketPointsToVictory,
        loserBracketPointsToVictory = loserBracketPointsToVictory,
        winnerScoreLimitsPerSet = winnerScoreLimitsPerSet,
        loserScoreLimitsPerSet = loserScoreLimitsPerSet,
        prize = prize,
        location = location,
        fieldType = fieldType.name,
        start = start.toString(),
        end = end.toString(),
        price = price,
        rating = rating,
        imageUrl = imageUrl,
        imageId = imageId,
        hostId = hostId,
        lat = lat,
        long = long,
        maxParticipants = maxParticipants,
        teamSizeLimit = teamSizeLimit,
        teamSignup = teamSignup,
        singleDivision = singleDivision,
        waitList = waitList,
        freeAgents = freeAgents,
        playerIds = playerIds,
        teamIds = teamIds,
        cancellationRefundHours = cancellationRefundHours,
        registrationCutoffHours = registrationCutoffHours,
        seedColor = seedColor,
        isTaxed = isTaxed,
        sportId = sportId,
        timeSlotIds = timeSlotIds,
        fieldIds = fieldIds,
        leagueScoringConfigId = leagueScoringConfigId,
        organizationId = organizationId,
        autoCancellation = autoCancellation,
        eventType = eventType.name
    )
