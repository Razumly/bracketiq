@file:OptIn(kotlin.experimental.ExperimentalObjCName::class)

package com.razumly.mvp.core.network.dto

import androidx.compose.ui.graphics.toArgb
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.normalizeDivisionDetails
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.presentation.Primary
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.native.ObjCName
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Serializable
data class EventApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,

    val name: String? = null,
    @property:ObjCName(swiftName = "eventDescription")
    val description: String? = null,

    val divisions: List<String>? = null,
    val divisionDetails: List<DivisionDetail>? = null,
    val location: String? = null,
    val address: String? = null,

    val start: String? = null,
    val end: String? = null,

    val price: Int? = null,
    val rating: Double? = null,
    val imageId: String? = null,
    val coordinates: List<Double>? = null,

    val hostId: String? = null,
    val assistantHostIds: List<String>? = null,
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
    val leagueScoringConfig: LeagueScoringConfigDTO? = null,
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
    val doTeamsOfficiate: Boolean? = null,
    val teamOfficialsMaySwap: Boolean? = null,
    val restTimeMinutes: Int? = null,

    val state: String? = null,
    val pointsToVictory: List<Int>? = null,
    val officialSchedulingMode: String? = null,
    val officialPositions: List<EventOfficialPosition>? = null,
    val eventOfficials: List<EventOfficial>? = null,
    val officialIds: List<String>? = null,
    val staffInvites: List<Invite>? = null,

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
        if (resolvedStart.isNullOrBlank()) return null
        val parsedStart = runCatching { Instant.parse(resolvedStart) }.getOrNull() ?: return null

        val normalizedEventType = eventType?.trim()?.uppercase()
        val resolvedEventType = runCatching { EventType.valueOf(normalizedEventType ?: EventType.EVENT.name) }
            .getOrDefault(EventType.EVENT)
        val resolvedNoFixedEndDateTime = when {
            noFixedEndDateTime != null -> noFixedEndDateTime
            resolvedEventType == EventType.LEAGUE || resolvedEventType == EventType.TOURNAMENT ->
                resolvedEnd.isNullOrBlank() || resolvedStart == resolvedEnd
            resolvedEventType == EventType.WEEKLY_EVENT ->
                resolvedEnd.isNullOrBlank()
            else -> false
        }
        val parsedEnd = when {
            !resolvedEnd.isNullOrBlank() -> runCatching { Instant.parse(resolvedEnd) }.getOrNull()
            resolvedNoFixedEndDateTime -> parsedStart
            else -> null
        } ?: return null
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
        val resolvedFieldIds = (fieldIds ?: emptyList())
            .map { fieldId -> fieldId.trim() }
            .filter(String::isNotBlank)
            .distinct()
        val resolvedFieldCount = resolvedFieldIds.size.takeIf { count -> count > 0 }
        val resolvedPriceCents = (price ?: 0).coerceAtLeast(0)
        val resolvedMaxParticipants = (maxParticipants ?: 0).coerceAtLeast(0)
        val resolvedEventPlayoffTeamCount = playoffTeamCount?.coerceAtLeast(2)
        val resolvedEventInstallmentAmounts = (installmentAmounts ?: emptyList())
            .map { amount -> amount.coerceAtLeast(0) }
        val resolvedEventInstallmentDueDates = (installmentDueDates ?: emptyList())
            .map { dueDate -> dueDate.trim() }
            .filter(String::isNotBlank)
        val resolvedEventInstallmentCount = maxOf(
            installmentCount ?: 0,
            resolvedEventInstallmentAmounts.size,
            resolvedEventInstallmentDueDates.size,
        ).takeIf { count -> count > 0 }
        val resolvedEventAllowPaymentPlans = allowPaymentPlans == true &&
            resolvedEventInstallmentCount != null &&
            resolvedPriceCents > 0
        val mergedDetailsWithCapacity = mergedDetails.map { detail ->
            val fallbackMaxParticipants = resolvedMaxParticipants.coerceAtLeast(2)
            detail.copy(
                price = if (singleDivision != false) {
                    resolvedPriceCents
                } else {
                    (detail.price ?: resolvedPriceCents).coerceAtLeast(0)
                },
                maxParticipants = if (singleDivision != false) {
                    fallbackMaxParticipants
                } else {
                    (detail.maxParticipants ?: fallbackMaxParticipants).coerceAtLeast(2)
                },
                playoffTeamCount = when {
                    includePlayoffs != true -> null
                    singleDivision != false -> resolvedEventPlayoffTeamCount
                    else -> (detail.playoffTeamCount ?: resolvedEventPlayoffTeamCount)?.coerceAtLeast(2)
                },
                allowPaymentPlans = if (singleDivision != false) {
                    resolvedEventAllowPaymentPlans
                } else {
                    detail.allowPaymentPlans ?: resolvedEventAllowPaymentPlans
                },
                installmentCount = if (singleDivision != false) {
                    resolvedEventInstallmentCount
                } else {
                    maxOf(
                        detail.installmentCount ?: 0,
                        detail.installmentAmounts.size,
                        detail.installmentDueDates.size,
                    ).takeIf { count -> count > 0 } ?: resolvedEventInstallmentCount
                },
                installmentDueDates = if (singleDivision != false) {
                    resolvedEventInstallmentDueDates
                } else {
                    val normalized = detail.installmentDueDates
                        .map { dueDate -> dueDate.trim() }
                        .filter(String::isNotBlank)
                    if (normalized.isNotEmpty()) normalized else resolvedEventInstallmentDueDates
                },
                installmentAmounts = if (singleDivision != false) {
                    resolvedEventInstallmentAmounts
                } else {
                    val normalized = detail.installmentAmounts
                        .map { amount -> amount.coerceAtLeast(0) }
                    if (normalized.isNotEmpty()) normalized else resolvedEventInstallmentAmounts
                },
            )
        }

        return Event(
            id = resolvedId,
            name = resolvedName,
            description = description ?: "",
            divisions = normalizedDivisions,
            divisionDetails = mergedDetailsWithCapacity,
            location = location ?: "",
            address = address,
            start = parsedStart,
            end = parsedEnd,
            priceCents = resolvedPriceCents,
            rating = rating,
            imageId = imageId ?: "",
            coordinates = coordinates ?: listOf(0.0, 0.0),
            hostId = resolvedHostId,
            assistantHostIds = assistantHostIds ?: emptyList(),
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
            fieldIds = resolvedFieldIds,
            leagueScoringConfigId = leagueScoringConfigId,
            organizationId = organizationId,
            autoCancellation = autoCancellation ?: false,
            maxParticipants = resolvedMaxParticipants,
            minAge = minAge,
            maxAge = maxAge,
            teamSizeLimit = (teamSizeLimit ?: 0).takeIf { it > 0 } ?: 2,
            registrationByDivisionType = registrationByDivisionType ?: false,
            eventType = resolvedEventType,
            fieldCount = resolvedFieldCount,
            gamesPerOpponent = gamesPerOpponent,
            includePlayoffs = includePlayoffs ?: false,
            playoffTeamCount = if (singleDivision == false) {
                null
            } else {
                resolvedEventPlayoffTeamCount
            },
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
            doTeamsOfficiate = doTeamsOfficiate,
            teamOfficialsMaySwap = if (doTeamsOfficiate == true) teamOfficialsMaySwap else false,
            restTimeMinutes = restTimeMinutes,
            state = state ?: "UNPUBLISHED",
            pointsToVictory = pointsToVictory ?: emptyList(),
            officialSchedulingMode = runCatching {
                OfficialSchedulingMode.valueOf(
                    officialSchedulingMode?.trim()?.uppercase() ?: OfficialSchedulingMode.SCHEDULE.name,
                )
            }.getOrDefault(OfficialSchedulingMode.SCHEDULE),
            officialPositions = officialPositions ?: emptyList(),
            eventOfficials = eventOfficials ?: emptyList(),
            officialIds = officialIds ?: emptyList(),
            allowPaymentPlans = resolvedEventAllowPaymentPlans,
            installmentCount = resolvedEventInstallmentCount,
            installmentDueDates = resolvedEventInstallmentDueDates,
            installmentAmounts = resolvedEventInstallmentAmounts,
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
data class WeeklySessionCreateRequestDto(
    val sessionStart: String,
    val sessionEnd: String,
    val slotId: String? = null,
    val divisionId: String? = null,
    val divisionTypeId: String? = null,
    val divisionTypeKey: String? = null,
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
    val sessionStart: String? = null,
    val sessionEnd: String? = null,
    val slotId: String? = null,
    val refundMode: String? = null,
    val refundReason: String? = null,
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
    @property:ObjCName(swiftName = "eventDescription")
    val description: String? = null,
    val divisions: List<String>? = null,
    val divisionDetails: List<DivisionDetail> = emptyList(),
    val winnerSetCount: Int? = null,
    val loserSetCount: Int? = null,
    val doubleElimination: Boolean? = null,
    val location: String? = null,
    val address: String? = null,
    val rating: Double? = null,
    val teamSizeLimit: Int? = null,
    val maxParticipants: Int? = null,
    val minAge: Int? = null,
    val maxAge: Int? = null,
    val hostId: String? = null,
    val assistantHostIds: List<String>? = null,
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
    val officialSchedulingMode: String? = null,
    val officialPositions: List<EventOfficialPosition>? = null,
    val eventOfficials: List<EventOfficial>? = null,
    val sportId: String? = null,
    val timeSlotIds: List<String>? = null,
    val fieldIds: List<String>? = null,
    val fields: List<Field>? = null,
    val timeSlots: List<TimeSlot>? = null,
    val teamIds: List<String>? = null,
    val userIds: List<String>? = null,
    val leagueScoringConfigId: String? = null,
    val leagueScoringConfig: LeagueScoringConfigDTO? = null,
    val organizationId: String? = null,
    val autoCancellation: Boolean? = null,
    val eventType: String? = null,
    val doTeamsOfficiate: Boolean? = null,
    val teamOfficialsMaySwap: Boolean? = null,
    val officialIds: List<String>? = null,
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
    val newFields: List<Field>? = null,
    val timeSlots: List<TimeSlot>? = null,
    val leagueScoringConfig: LeagueScoringConfigDTO? = null,
)

@Serializable
data class UpdateEventRequestDto(
    val event: EventUpdateDto,
)

fun Event.toUpdateDto(
    requiredTemplateIdsOverride: List<String>? = null,
    leagueScoringConfigOverride: LeagueScoringConfigDTO? = null,
    fieldsOverride: List<Field>? = null,
    timeSlotsOverride: List<TimeSlot>? = null,
    includeOrganizationId: Boolean = true,
    includeFieldObjects: Boolean = true,
    includeTimeSlotObjects: Boolean = true,
): EventUpdateDto {
    val sourceRequiredTemplateIds = requiredTemplateIdsOverride ?: requiredTemplateIds
    val resolvedRequiredTemplateIds = sourceRequiredTemplateIds
        .map { templateId -> templateId.trim() }
        .filter { templateId -> templateId.isNotEmpty() }
        .distinct()
    val normalizedDivisions = divisions.normalizeDivisionIdentifiers()
    val normalizedDivisionDetails = mergeDivisionDetailsForDivisions(
        divisions = normalizedDivisions,
        existingDetails = divisionDetails,
        eventId = id,
    )
    val normalizedDivisionDetailsForPayload = normalizedDivisionDetails.map { detail ->
        val fallbackMaxParticipants = maxParticipants.coerceAtLeast(2)
        val defaultInstallmentAmounts = installmentAmounts.map { amount -> amount.coerceAtLeast(0) }
        val defaultInstallmentDueDates = installmentDueDates
            .map { dueDate -> dueDate.trim() }
            .filter(String::isNotBlank)
        val defaultInstallmentCount = maxOf(
            installmentCount ?: 0,
            defaultInstallmentAmounts.size,
            defaultInstallmentDueDates.size,
        ).takeIf { count -> count > 0 }
        val defaultAllowPaymentPlans = allowPaymentPlans == true &&
            defaultInstallmentCount != null &&
            priceCents > 0
        val detailInstallmentAmounts = detail.installmentAmounts
            .map { amount -> amount.coerceAtLeast(0) }
        val detailInstallmentDueDates = detail.installmentDueDates
            .map { dueDate -> dueDate.trim() }
            .filter(String::isNotBlank)
        val detailInstallmentCount = maxOf(
            detail.installmentCount ?: 0,
            detailInstallmentAmounts.size,
            detailInstallmentDueDates.size,
        ).takeIf { count -> count > 0 }
        val detailAllowPaymentPlans = detail.allowPaymentPlans == true &&
            detailInstallmentCount != null &&
            (detail.price ?: priceCents).coerceAtLeast(0) > 0
        detail.copy(
            price = if (singleDivision) {
                priceCents.coerceAtLeast(0)
            } else {
                (detail.price ?: priceCents).coerceAtLeast(0)
            },
            maxParticipants = if (singleDivision) {
                fallbackMaxParticipants
            } else {
                (detail.maxParticipants ?: fallbackMaxParticipants).coerceAtLeast(2)
            },
            playoffTeamCount = when {
                !includePlayoffs -> null
                singleDivision -> playoffTeamCount?.coerceAtLeast(2)
                else -> (detail.playoffTeamCount ?: playoffTeamCount)?.coerceAtLeast(2)
            },
            allowPaymentPlans = if (singleDivision) {
                defaultAllowPaymentPlans
            } else {
                detailAllowPaymentPlans
            },
            installmentCount = if (singleDivision) {
                defaultInstallmentCount
            } else if (detailAllowPaymentPlans) {
                detailInstallmentCount
            } else {
                null
            },
            installmentDueDates = if (singleDivision) {
                defaultInstallmentDueDates
            } else if (detailAllowPaymentPlans) {
                detailInstallmentDueDates
            } else {
                emptyList()
            },
            installmentAmounts = if (singleDivision) {
                defaultInstallmentAmounts
            } else if (detailAllowPaymentPlans) {
                detailInstallmentAmounts
            } else {
                emptyList()
            },
        )
    }

    return EventUpdateDto(
        name = name,
        start = start.toString(),
        end = if (noFixedEndDateTime) null else end.toString(),
        description = description,
        divisions = normalizedDivisions,
        divisionDetails = normalizedDivisionDetailsForPayload,
        winnerSetCount = winnerSetCount,
        loserSetCount = loserSetCount,
        doubleElimination = doubleElimination,
        location = location,
        address = address,
        rating = rating,
        teamSizeLimit = teamSizeLimit,
        maxParticipants = maxParticipants,
        minAge = minAge,
        maxAge = maxAge,
        hostId = hostId,
        assistantHostIds = assistantHostIds,
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
        fieldCount = null,
        winnerBracketPointsToVictory = winnerBracketPointsToVictory,
        loserBracketPointsToVictory = loserBracketPointsToVictory,
        coordinates = coordinates,
        gamesPerOpponent = gamesPerOpponent,
        includePlayoffs = includePlayoffs,
        playoffTeamCount = if (includePlayoffs && singleDivision) {
            playoffTeamCount?.coerceAtLeast(2)
        } else {
            null
        },
        usesSets = usesSets,
        matchDurationMinutes = matchDurationMinutes,
        setDurationMinutes = setDurationMinutes,
        setsPerMatch = setsPerMatch,
        restTimeMinutes = restTimeMinutes,
        state = state,
        pointsToVictory = pointsToVictory,
        officialSchedulingMode = officialSchedulingMode.name,
        officialPositions = officialPositions,
        eventOfficials = eventOfficials,
        sportId = sportId,
        timeSlotIds = timeSlotIds,
        fieldIds = fieldIds,
        fields = if (includeFieldObjects) fieldsOverride else null,
        timeSlots = if (includeTimeSlotObjects) timeSlotsOverride else null,
        teamIds = teamIds,
        userIds = userIds,
        leagueScoringConfigId = leagueScoringConfigId,
        leagueScoringConfig = leagueScoringConfigOverride,
        organizationId = if (includeOrganizationId) organizationId else null,
        autoCancellation = autoCancellation,
        eventType = eventType.name,
        doTeamsOfficiate = doTeamsOfficiate,
        teamOfficialsMaySwap = if (doTeamsOfficiate == true) teamOfficialsMaySwap else false,
        officialIds = officialIds,
        allowPaymentPlans = allowPaymentPlans,
        installmentCount = installmentCount,
        installmentDueDates = installmentDueDates,
        installmentAmounts = installmentAmounts,
        allowTeamSplitDefault = allowTeamSplitDefault,
        requiredTemplateIds = resolvedRequiredTemplateIds,
    )
}
