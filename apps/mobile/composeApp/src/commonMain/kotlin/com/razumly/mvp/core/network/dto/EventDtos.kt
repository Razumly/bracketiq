package com.razumly.mvp.core.network.dto

import androidx.compose.ui.graphics.toArgb
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.normalizeDivisionDetails
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.presentation.Primary
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Serializable
data class EventApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,

    val name: String? = null,
    val description: String? = null,

    val divisions: List<String>? = null,
    val divisionDetails: List<DivisionDetail>? = null,
    val location: String? = null,

    val start: String? = null,
    val end: String? = null,

    val price: Int? = null,
    val rating: Double? = null,
    val imageId: String? = null,
    val coordinates: List<Double>? = null,

    val hostId: String? = null,
    val noFixedEndDateTime: Boolean? = null,
    val teamSignup: Boolean? = null,
    val singleDivision: Boolean? = null,
    val registrationByDivisionType: Boolean? = null,

    val freeAgentIds: List<String>? = null,
    val waitListIds: List<String>? = null,
    val userIds: List<String>? = null,
    val teamIds: List<String>? = null,

    val cancellationRefundHours: Int? = null,
    val registrationCutoffHours: Int? = null,
    val seedColor: Int? = null,

    val sportId: String? = null,
    val timeSlotIds: List<String>? = null,
    val fieldIds: List<String>? = null,
    val leagueScoringConfigId: String? = null,
    val organizationId: String? = null,

    val autoCancellation: Boolean? = null,
    val maxParticipants: Int? = null,
    val minAge: Int? = null,
    val maxAge: Int? = null,
    val teamSizeLimit: Int? = null,

    val eventType: String? = null,
    val fieldCount: Int? = null,
    val gamesPerOpponent: Int? = null,
    val includePlayoffs: Boolean? = null,
    val playoffTeamCount: Int? = null,

    val doubleElimination: Boolean? = null,
    val winnerSetCount: Int? = null,
    val loserSetCount: Int? = null,
    val winnerBracketPointsToVictory: List<Int>? = null,
    val loserBracketPointsToVictory: List<Int>? = null,
    val prize: String? = null,

    val usesSets: Boolean? = null,
    val matchDurationMinutes: Int? = null,
    val setDurationMinutes: Int? = null,
    val setsPerMatch: Int? = null,
    val doTeamsRef: Boolean? = null,
    val restTimeMinutes: Int? = null,

    val state: String? = null,
    val pointsToVictory: List<Int>? = null,
    val refereeIds: List<String>? = null,

    val allowPaymentPlans: Boolean? = null,
    val installmentCount: Int? = null,
    val installmentDueDates: List<String>? = null,
    val installmentAmounts: List<Int>? = null,
    val allowTeamSplitDefault: Boolean? = null,
    val requiredTemplateIds: List<String>? = null,

    val prizeTitle: String? = null, // legacy/unused; ignore if present
) {
    @OptIn(ExperimentalTime::class)
    fun toEventOrNull(): Event? {
        val resolvedId = id ?: legacyId
        val resolvedName = name
        val resolvedHostId = hostId
        val resolvedStart = start
        val resolvedEnd = end
        if (resolvedId.isNullOrBlank() || resolvedName.isNullOrBlank() || resolvedHostId.isNullOrBlank()) return null
        if (resolvedStart.isNullOrBlank() || resolvedEnd.isNullOrBlank()) return null

        val resolvedEventType = runCatching { EventType.valueOf(eventType ?: EventType.EVENT.name) }
            .getOrDefault(EventType.EVENT)
        val resolvedNoFixedEndDateTime = when {
            noFixedEndDateTime != null -> noFixedEndDateTime
            resolvedEventType == EventType.LEAGUE || resolvedEventType == EventType.TOURNAMENT ->
                resolvedStart == resolvedEnd
            else -> false
        }
        val normalizedDetails = (divisionDetails ?: emptyList()).normalizeDivisionDetails(resolvedId)
        val normalizedDivisions = (
            (divisions ?: emptyList()).normalizeDivisionIdentifiers() +
                normalizedDetails.map { detail -> detail.id }.normalizeDivisionIdentifiers()
            ).normalizeDivisionIdentifiers()
        val mergedDetails = mergeDivisionDetailsForDivisions(
            divisions = normalizedDivisions,
            existingDetails = normalizedDetails,
            eventId = resolvedId,
        )

        return Event(
            id = resolvedId,
            name = resolvedName,
            description = description ?: "",
            divisions = normalizedDivisions,
            divisionDetails = mergedDetails,
            location = location ?: "",
            start = Instant.parse(resolvedStart),
            end = Instant.parse(resolvedEnd),
            priceCents = price ?: 0,
            rating = rating,
            imageId = imageId ?: "",
            coordinates = coordinates ?: listOf(0.0, 0.0),
            hostId = resolvedHostId,
            noFixedEndDateTime = resolvedNoFixedEndDateTime,
            teamSignup = teamSignup ?: true,
            singleDivision = singleDivision ?: true,
            freeAgentIds = freeAgentIds ?: emptyList(),
            waitListIds = waitListIds ?: emptyList(),
            userIds = userIds ?: emptyList(),
            teamIds = teamIds ?: emptyList(),
            cancellationRefundHours = cancellationRefundHours ?: 0,
            registrationCutoffHours = registrationCutoffHours ?: 0,
            seedColor = seedColor ?: Primary.toArgb(),
            sportId = sportId,
            timeSlotIds = timeSlotIds ?: emptyList(),
            fieldIds = fieldIds ?: emptyList(),
            leagueScoringConfigId = leagueScoringConfigId,
            organizationId = organizationId,
            autoCancellation = autoCancellation ?: false,
            maxParticipants = maxParticipants ?: 0,
            minAge = minAge,
            maxAge = maxAge,
            teamSizeLimit = (teamSizeLimit ?: 0).takeIf { it > 0 } ?: 2,
            registrationByDivisionType = registrationByDivisionType ?: false,
            eventType = resolvedEventType,
            fieldCount = fieldCount,
            gamesPerOpponent = gamesPerOpponent,
            includePlayoffs = includePlayoffs ?: false,
            playoffTeamCount = playoffTeamCount,
            doubleElimination = doubleElimination ?: false,
            winnerSetCount = winnerSetCount ?: 1,
            loserSetCount = loserSetCount ?: 0,
            winnerBracketPointsToVictory = winnerBracketPointsToVictory ?: emptyList(),
            loserBracketPointsToVictory = loserBracketPointsToVictory ?: emptyList(),
            prize = prize ?: "",
            usesSets = usesSets ?: false,
            matchDurationMinutes = matchDurationMinutes,
            setDurationMinutes = setDurationMinutes,
            setsPerMatch = setsPerMatch,
            doTeamsRef = doTeamsRef,
            restTimeMinutes = restTimeMinutes,
            state = state ?: "UNPUBLISHED",
            pointsToVictory = pointsToVictory ?: emptyList(),
            refereeIds = refereeIds ?: emptyList(),
            allowPaymentPlans = allowPaymentPlans,
            installmentCount = installmentCount,
            installmentDueDates = installmentDueDates ?: emptyList(),
            installmentAmounts = installmentAmounts ?: emptyList(),
            allowTeamSplitDefault = allowTeamSplitDefault,
            requiredTemplateIds = requiredTemplateIds ?: emptyList(),
            lastUpdated = Clock.System.now(),
        )
    }
}

@Serializable
data class EventsResponseDto(
    val events: List<EventApiDto> = emptyList(),
)

@Serializable
data class EventResponseDto(
    val event: EventApiDto? = null,
)

@Serializable
data class ScheduleEventRequestDto(
    val participantCount: Int? = null,
)

@Serializable
data class ScheduleEventResponseDto(
    val preview: Boolean? = null,
    val event: EventApiDto? = null,
    val matches: List<MatchApiDto> = emptyList(),
)

@Serializable
data class EventSearchUserLocationDto(
    val lat: Double,
    val lng: Double? = null,
    val long: Double? = null,
)

@Serializable
data class EventSearchFiltersDto(
    val query: String? = null,
    val maxDistance: Double? = null,
    val userLocation: EventSearchUserLocationDto? = null,
    val dateFrom: String? = null,
    val dateTo: String? = null,
    val priceMax: Int? = null,
    val eventTypes: List<String>? = null,
    val sports: List<String>? = null,
    val divisions: List<String>? = null,
)

@Serializable
data class EventSearchRequestDto(
    val filters: EventSearchFiltersDto? = null,
    val limit: Int? = null,
    val offset: Int? = null,
)

@Serializable
data class EventParticipantsRequestDto(
    val userId: String? = null,
    val teamId: String? = null,
    val divisionId: String? = null,
    val divisionTypeId: String? = null,
    val divisionTypeKey: String? = null,
)

@Serializable
data class EventParticipantsResponseDto(
    val event: EventApiDto? = null,
    val requiresParentApproval: Boolean? = null,
    val error: String? = null,
)

@Serializable
data class EventChildRegistrationRequestDto(
    val childId: String,
)

@Serializable
data class EventRegistrationStatusDto(
    val id: String? = null,
    val status: String? = null,
    val consentStatus: String? = null,
)

@Serializable
data class EventConsentStatusDto(
    val documentId: String? = null,
    val status: String? = null,
    val requiresChildEmail: Boolean? = null,
)

@Serializable
data class EventChildRegistrationResponseDto(
    val registration: EventRegistrationStatusDto? = null,
    val consent: EventConsentStatusDto? = null,
    val requiresParentApproval: Boolean? = null,
    val warnings: List<String> = emptyList(),
    val error: String? = null,
)

@Serializable
data class ProfileScheduleResponseDto(
    val events: List<EventApiDto> = emptyList(),
    val matches: List<MatchApiDto> = emptyList(),
    val teams: List<TeamApiDto> = emptyList(),
    val fields: List<Field> = emptyList(),
)

@Serializable
data class EventUpdateDto(
    val name: String? = null,
    val start: String? = null,
    val end: String? = null,
    val description: String? = null,
    val divisions: List<String>? = null,
    val divisionDetails: List<DivisionDetail> = emptyList(),
    val winnerSetCount: Int? = null,
    val loserSetCount: Int? = null,
    val doubleElimination: Boolean? = null,
    val location: String? = null,
    val rating: Double? = null,
    val teamSizeLimit: Int? = null,
    val maxParticipants: Int? = null,
    val minAge: Int? = null,
    val maxAge: Int? = null,
    val hostId: String? = null,
    val noFixedEndDateTime: Boolean? = null,
    val price: Int? = null,
    val singleDivision: Boolean? = null,
    val registrationByDivisionType: Boolean? = null,
    val waitListIds: List<String>? = null,
    val freeAgentIds: List<String>? = null,
    val cancellationRefundHours: Int? = null,
    val teamSignup: Boolean? = null,
    val prize: String? = null,
    val registrationCutoffHours: Int? = null,
    val seedColor: Int? = null,
    val imageId: String? = null,
    val fieldCount: Int? = null,
    val winnerBracketPointsToVictory: List<Int>? = null,
    val loserBracketPointsToVictory: List<Int>? = null,
    val coordinates: List<Double>? = null,
    val gamesPerOpponent: Int? = null,
    val includePlayoffs: Boolean? = null,
    val playoffTeamCount: Int? = null,
    val usesSets: Boolean? = null,
    val matchDurationMinutes: Int? = null,
    val setDurationMinutes: Int? = null,
    val setsPerMatch: Int? = null,
    val restTimeMinutes: Int? = null,
    val state: String? = null,
    val pointsToVictory: List<Int>? = null,
    val sportId: String? = null,
    val timeSlotIds: List<String>? = null,
    val fieldIds: List<String>? = null,
    val teamIds: List<String>? = null,
    val userIds: List<String>? = null,
    val leagueScoringConfigId: String? = null,
    val leagueScoringConfig: LeagueScoringConfigDTO? = null,
    val organizationId: String? = null,
    val autoCancellation: Boolean? = null,
    val eventType: String? = null,
    val doTeamsRef: Boolean? = null,
    val refereeIds: List<String>? = null,
    val allowPaymentPlans: Boolean? = null,
    val installmentCount: Int? = null,
    val installmentDueDates: List<String>? = null,
    val installmentAmounts: List<Int>? = null,
    val allowTeamSplitDefault: Boolean? = null,
    val requiredTemplateIds: List<String>? = null,
)

@Serializable
data class CreateEventRequestDto(
    val id: String,
    val event: EventUpdateDto,
)

@Serializable
data class UpdateEventRequestDto(
    val event: EventUpdateDto,
)

fun Event.toUpdateDto(
    requiredTemplateIdsOverride: List<String>? = null,
    leagueScoringConfigOverride: LeagueScoringConfigDTO? = null,
): EventUpdateDto {
    val sourceRequiredTemplateIds = requiredTemplateIdsOverride ?: requiredTemplateIds
    val resolvedRequiredTemplateIds = sourceRequiredTemplateIds
        ?.map { templateId -> templateId.trim() }
        ?.filter { templateId -> templateId.isNotEmpty() }
        ?.distinct()
        ?: emptyList()
    val normalizedDivisions = divisions.normalizeDivisionIdentifiers()
    val normalizedDivisionDetails = mergeDivisionDetailsForDivisions(
        divisions = normalizedDivisions,
        existingDetails = divisionDetails,
        eventId = id,
    )

    return EventUpdateDto(
        name = name,
        start = start.toString(),
        end = end.toString(),
        description = description,
        divisions = normalizedDivisions,
        divisionDetails = normalizedDivisionDetails,
        winnerSetCount = winnerSetCount,
        loserSetCount = loserSetCount,
        doubleElimination = doubleElimination,
        location = location,
        rating = rating,
        teamSizeLimit = teamSizeLimit,
        maxParticipants = maxParticipants,
        minAge = minAge,
        maxAge = maxAge,
        hostId = hostId,
        noFixedEndDateTime = noFixedEndDateTime,
        price = priceCents,
        singleDivision = singleDivision,
        registrationByDivisionType = registrationByDivisionType,
        waitListIds = waitListIds,
        freeAgentIds = freeAgentIds,
        cancellationRefundHours = cancellationRefundHours,
        teamSignup = teamSignup,
        prize = prize,
        registrationCutoffHours = registrationCutoffHours,
        seedColor = seedColor,
        imageId = imageId,
        fieldCount = fieldCount,
        winnerBracketPointsToVictory = winnerBracketPointsToVictory,
        loserBracketPointsToVictory = loserBracketPointsToVictory,
        coordinates = coordinates,
        gamesPerOpponent = gamesPerOpponent,
        includePlayoffs = includePlayoffs,
        playoffTeamCount = playoffTeamCount,
        usesSets = usesSets,
        matchDurationMinutes = matchDurationMinutes,
        setDurationMinutes = setDurationMinutes,
        setsPerMatch = setsPerMatch,
        restTimeMinutes = restTimeMinutes,
        state = state,
        pointsToVictory = pointsToVictory,
        sportId = sportId,
        timeSlotIds = timeSlotIds,
        fieldIds = fieldIds,
        teamIds = teamIds,
        userIds = userIds,
        leagueScoringConfigId = leagueScoringConfigId,
        leagueScoringConfig = leagueScoringConfigOverride,
        organizationId = organizationId,
        autoCancellation = autoCancellation,
        eventType = eventType.name,
        doTeamsRef = doTeamsRef,
        refereeIds = refereeIds,
        allowPaymentPlans = allowPaymentPlans,
        installmentCount = installmentCount,
        installmentDueDates = installmentDueDates,
        installmentAmounts = installmentAmounts,
        allowTeamSplitDefault = allowTeamSplitDefault,
        requiredTemplateIds = resolvedRequiredTemplateIds,
    )
}
