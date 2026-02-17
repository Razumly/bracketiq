package com.razumly.mvp.core.data.dataTypes

import androidx.compose.ui.graphics.toArgb
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.TypeConverters
import com.razumly.mvp.core.data.dataTypes.dtos.EventDTO
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.DivisionConverters
import com.razumly.mvp.core.data.util.normalizeDivisionLabels
import com.razumly.mvp.core.presentation.Primary
import com.razumly.mvp.core.util.newId
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
    val doubleElimination: Boolean = false,
    val winnerSetCount: Int = 1,
    val loserSetCount: Int = 0,
    val winnerBracketPointsToVictory: List<Int> = emptyList(),
    val loserBracketPointsToVictory: List<Int> = emptyList(),
    val prize: String = "",
    @PrimaryKey override val id: String = newId(),
    val name: String = "",
    val description: String = "",
    @field:TypeConverters(DivisionConverters::class)
    val divisions: List<String> = emptyList(),
    val location: String = "",
    @Contextual val start: Instant = Instant.DISTANT_PAST,
    @Contextual val end: Instant = Instant.DISTANT_PAST,
    val priceCents: Int = 0,
    val rating: Double? = null,
    val imageId: String = "",
    val coordinates: List<Double> = listOf(0.0, 0.0),
    val hostId: String = "",
    val teamSignup: Boolean = true,
    val singleDivision: Boolean = true,
    val freeAgentIds: List<String> = emptyList(),
    val waitListIds: List<String> = emptyList(),
    val userIds: List<String> = emptyList(),
    val teamIds: List<String> = emptyList(),
    val cancellationRefundHours: Int = 0,
    val registrationCutoffHours: Int = 0,
    val seedColor: Int = Primary.toArgb(),
    val sportId: String? = null,
    val timeSlotIds: List<String> = emptyList(),
    val fieldIds: List<String> = emptyList(),
    val leagueScoringConfigId: String? = null,
    val organizationId: String? = null,
    val autoCancellation: Boolean = false,
    val maxParticipants: Int = 0,
    val minAge: Int? = null,
    val maxAge: Int? = null,
    val teamSizeLimit: Int = 2,
    val registrationByDivisionType: Boolean = false,
    val eventType: EventType = EventType.EVENT,
    val fieldCount: Int? = null,
    val gamesPerOpponent: Int? = null,
    val includePlayoffs: Boolean = false,
    val playoffTeamCount: Int? = null,
    val usesSets: Boolean = false,
    val matchDurationMinutes: Int? = null,
    val setDurationMinutes: Int? = null,
    val setsPerMatch: Int? = null,
    val doTeamsRef: Boolean? = null,
    val restTimeMinutes: Int? = null,
    val state: String = "UNPUBLISHED",
    val pointsToVictory: List<Int> = emptyList(),
    val refereeIds: List<String> = emptyList(),
    val allowPaymentPlans: Boolean? = null,
    val installmentCount: Int? = null,
    val installmentDueDates: List<String> = emptyList(),
    val installmentAmounts: List<Int> = emptyList(),
    val allowTeamSplitDefault: Boolean? = null,
    val requiredTemplateIds: List<String> = emptyList(),
    @Transient val lastUpdated: Instant = Clock.System.now(),
) : MVPDocument {
    val price: Double get() = priceCents.toDouble() / 100.0

    val latitude: Double get() = coordinates.getOrNull(1) ?: 0.0
    val longitude: Double get() = coordinates.getOrNull(0) ?: 0.0
    val lat: Double get() = latitude
    val long: Double get() = longitude
    val freeAgents: List<String> get() = freeAgentIds
    val waitList: List<String> get() = waitListIds
    val playerIds: List<String> get() = userIds
}

fun Event.toEventDTO(): EventDTO =
    EventDTO(
        id = id,
        name = name,
        description = description,
        doubleElimination = doubleElimination,
        divisions = divisions.normalizeDivisionLabels(),
        winnerSetCount = winnerSetCount,
        loserSetCount = loserSetCount,
        winnerBracketPointsToVictory = winnerBracketPointsToVictory,
        loserBracketPointsToVictory = loserBracketPointsToVictory,
        prize = prize,
        location = location,
        start = start.toString(),
        end = end.toString(),
        priceCents = priceCents,
        rating = rating,
        imageId = imageId,
        hostId = hostId,
        coordinates = coordinates,
        maxParticipants = maxParticipants,
        teamSizeLimit = teamSizeLimit,
        teamSignup = teamSignup,
        singleDivision = singleDivision,
        waitListIds = waitListIds,
        freeAgentIds = freeAgentIds,
        userIds = userIds,
        teamIds = teamIds,
        cancellationRefundHours = cancellationRefundHours,
        registrationCutoffHours = registrationCutoffHours,
        seedColor = seedColor,
        sportId = sportId,
        timeSlotIds = timeSlotIds,
        fieldIds = fieldIds,
        leagueScoringConfigId = leagueScoringConfigId,
        organizationId = organizationId,
        autoCancellation = autoCancellation,
        eventType = eventType.name,
        minAge = minAge,
        maxAge = maxAge,
        registrationByDivisionType = registrationByDivisionType,
        fieldCount = fieldCount,
        gamesPerOpponent = gamesPerOpponent,
        includePlayoffs = includePlayoffs,
        playoffTeamCount = playoffTeamCount,
        usesSets = usesSets,
        matchDurationMinutes = matchDurationMinutes,
        setDurationMinutes = setDurationMinutes,
        setsPerMatch = setsPerMatch,
        doTeamsRef = doTeamsRef,
        restTimeMinutes = restTimeMinutes,
        state = state,
        pointsToVictory = pointsToVictory,
        refereeIds = refereeIds,
        allowPaymentPlans = allowPaymentPlans,
        installmentCount = installmentCount,
        installmentDueDates = installmentDueDates,
        installmentAmounts = installmentAmounts,
        allowTeamSplitDefault = allowTeamSplitDefault,
        requiredTemplateIds = requiredTemplateIds,
    )
