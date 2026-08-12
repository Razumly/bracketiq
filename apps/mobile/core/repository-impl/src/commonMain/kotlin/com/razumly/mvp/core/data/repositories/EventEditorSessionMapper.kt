package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.DivisionPhaseSettingsMVP
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.ManualPaymentLink
import com.razumly.mvp.core.data.dataTypes.normalizeManualPaymentUrl
import com.razumly.mvp.core.data.dataTypes.MatchRulesConfigMVP
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.TimeSlotDTO
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.network.dto.EVENT_EDITOR_CONTRACT_VERSION
import com.razumly.mvp.core.network.dto.EventEditorBasicsDto
import com.razumly.mvp.core.network.dto.EventEditorCompetitionDto
import com.razumly.mvp.core.network.dto.EventEditorCreateBootstrapDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCommandDto
import com.razumly.mvp.core.network.dto.EventEditorDivisionDetailDto
import com.razumly.mvp.core.network.dto.EventEditorDraftDto
import com.razumly.mvp.core.network.dto.EventEditorFieldDto
import com.razumly.mvp.core.network.dto.EventEditorManualPaymentLinkDto
import com.razumly.mvp.core.network.dto.EventEditorOfficialDto
import com.razumly.mvp.core.network.dto.EventEditorOfficialPositionDto
import com.razumly.mvp.core.network.dto.EventEditorPaymentDto
import com.razumly.mvp.core.network.dto.EventEditorQuestionDto
import com.razumly.mvp.core.network.dto.EventEditorRegistrationDto
import com.razumly.mvp.core.network.dto.EventEditorResourcesDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleDto
import com.razumly.mvp.core.network.dto.EventEditorSnapshotDto
import com.razumly.mvp.core.network.dto.EventEditorStaffDto
import com.razumly.mvp.core.network.dto.EventEditorStaffInviteDto
import com.razumly.mvp.core.network.dto.EventEditorTagDto
import com.razumly.mvp.core.network.dto.EventEditorTimeSlotDto
import com.razumly.mvp.core.network.dto.EventEditorSaveResultDto
import com.razumly.mvp.core.util.jsonMVP
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlin.math.roundToInt
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private fun String.normalizedId(): String = trim()

private fun String?.normalizedIdOrNull(): String? = this?.trim()?.takeIf(String::isNotBlank)

@OptIn(ExperimentalTime::class)
private fun parseEditorInstant(value: String?, timeZone: String, fallback: Instant): Instant {
    val candidate = value?.trim()?.takeIf(String::isNotBlank) ?: return fallback
    runCatching { Instant.parse(candidate) }.getOrNull()?.let { return it }
    val normalized = when {
        Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(candidate) -> "${candidate}T00:00:00"
        Regex("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$").matches(candidate) -> "$candidate:00"
        else -> candidate
    }
    val zone = runCatching { TimeZone.of(timeZone.trim().ifBlank { "UTC" }) }.getOrDefault(TimeZone.UTC)
    return runCatching { LocalDateTime.parse(normalized).toInstant(zone) }.getOrDefault(fallback)
}

private fun JsonObject.toLeagueScoringConfigOrNull(): LeagueScoringConfigDTO? =
    runCatching { jsonMVP.decodeFromJsonElement<LeagueScoringConfigDTO>(this) }.getOrNull()

private fun JsonObject.toMatchRulesOrNull(): MatchRulesConfigMVP? =
    runCatching { jsonMVP.decodeFromJsonElement<MatchRulesConfigMVP>(this) }.getOrNull()

private fun JsonObject.toTournamentConfigOrNull(): TournamentConfig? =
    runCatching { jsonMVP.decodeFromJsonElement<TournamentConfig>(this) }.getOrNull()

private fun JsonObject.toPhaseSettingsOrEmpty(): Map<String, DivisionPhaseSettingsMVP> =
    runCatching { jsonMVP.decodeFromJsonElement<Map<String, DivisionPhaseSettingsMVP>>(this) }.getOrDefault(emptyMap())

private fun LeagueScoringConfigDTO?.toJsonObjectOrNull(): JsonObject? = this?.let {
    jsonMVP.encodeToJsonElement(it).jsonObject
}

private fun MatchRulesConfigMVP?.toJsonObjectOrNull(): JsonObject? = this?.let {
    jsonMVP.encodeToJsonElement(it).jsonObject
}

private fun TournamentConfig?.toJsonObjectOrNull(): JsonObject? = this?.let {
    jsonMVP.encodeToJsonElement(it).jsonObject
}

private fun DivisionDetail.toDto(existing: EventEditorDivisionDetailDto? = null): EventEditorDivisionDetailDto =
    EventEditorDivisionDetailDto(
        id = id.normalizedId(),
        sourceDivisionId = sourceDivisionId ?: existing?.sourceDivisionId,
        key = key,
        name = name,
        kind = kind?.trim()?.uppercase().takeUnless { it.isNullOrBlank() } ?: existing?.kind ?: "LEAGUE",
        poolPlay = existing?.poolPlay,
        divisionTypeId = divisionTypeId,
        skillDivisionTypeId = skillDivisionTypeId,
        ageDivisionTypeId = ageDivisionTypeId,
        divisionTypeName = divisionTypeName,
        ratingType = ratingType,
        gender = gender.takeIf(String::isNotBlank) ?: existing?.gender,
        price = price?.toDouble() ?: existing?.price,
        maxParticipants = maxParticipants?.toDouble() ?: existing?.maxParticipants,
        playoffTeamCount = playoffTeamCount?.toDouble() ?: existing?.playoffTeamCount,
        poolCount = poolCount?.toDouble() ?: existing?.poolCount,
        poolTeamCount = poolTeamCount?.toDouble() ?: existing?.poolTeamCount,
        phaseSettings = existing?.phaseSettings ?: phaseSettings.takeIf { it.isNotEmpty() }?.let {
            jsonMVP.encodeToJsonElement(it).jsonObject
        },
        playoffPlacementDivisionIds = if (playoffPlacementDivisionIds.isNotEmpty()) playoffPlacementDivisionIds else existing?.playoffPlacementDivisionIds.orEmpty(),
        standingsOverrides = existing?.standingsOverrides,
        playoffConfig = existing?.playoffConfig ?: playoffConfig.toJsonObjectOrNull(),
        gamesPerOpponent = gamesPerOpponent?.toDouble() ?: existing?.gamesPerOpponent,
        restTimeMinutes = restTimeMinutes?.toDouble() ?: existing?.restTimeMinutes,
        usesSets = usesSets ?: existing?.usesSets,
        matchDurationMinutes = matchDurationMinutes?.toDouble() ?: existing?.matchDurationMinutes,
        setDurationMinutes = setDurationMinutes?.toDouble() ?: existing?.setDurationMinutes,
        setsPerMatch = setsPerMatch?.toDouble() ?: existing?.setsPerMatch,
        pointsToVictory = if (pointsToVictory.isNotEmpty()) pointsToVictory else existing?.pointsToVictory.orEmpty(),
        standingsConfirmedAt = existing?.standingsConfirmedAt,
        standingsConfirmedBy = existing?.standingsConfirmedBy,
        allowPaymentPlans = allowPaymentPlans ?: existing?.allowPaymentPlans,
        installmentCount = installmentCount?.toDouble() ?: existing?.installmentCount,
        installmentDueDates = if (installmentDueDates.isNotEmpty()) installmentDueDates else existing?.installmentDueDates.orEmpty(),
        installmentDueRelativeDays = if (installmentDueRelativeDays.isNotEmpty()) installmentDueRelativeDays else existing?.installmentDueRelativeDays.orEmpty(),
        installmentAmounts = if (installmentAmounts.isNotEmpty()) installmentAmounts else existing?.installmentAmounts.orEmpty(),
        ageCutoffDate = ageCutoffDate ?: existing?.ageCutoffDate,
        ageCutoffLabel = ageCutoffLabel ?: existing?.ageCutoffLabel,
        ageCutoffSource = ageCutoffSource ?: existing?.ageCutoffSource,
        fieldIds = if (fieldIds.isNotEmpty()) fieldIds else existing?.fieldIds.orEmpty(),
        teamIds = if (teamIds.isNotEmpty()) teamIds else existing?.teamIds.orEmpty(),
    )

@OptIn(ExperimentalTime::class)
private fun EventEditorDivisionDetailDto.toDomain(): DivisionDetail = DivisionDetail(
    id = id.normalizedId(),
    sourceDivisionId = sourceDivisionId.normalizedIdOrNull(),
    kind = kind.trim().uppercase(),
    key = key,
    name = name,
    divisionTypeId = divisionTypeId,
    divisionTypeName = divisionTypeName,
    ratingType = ratingType,
    gender = gender.orEmpty(),
    skillDivisionTypeId = skillDivisionTypeId,
    ageDivisionTypeId = ageDivisionTypeId,
    price = price?.roundToInt(),
    maxParticipants = maxParticipants?.roundToInt(),
    playoffTeamCount = playoffTeamCount?.roundToInt(),
    poolCount = poolCount?.roundToInt(),
    poolTeamCount = poolTeamCount?.roundToInt(),
    allowPaymentPlans = allowPaymentPlans,
    installmentCount = installmentCount?.roundToInt(),
    installmentDueDates = installmentDueDates,
    installmentDueRelativeDays = installmentDueRelativeDays,
    installmentAmounts = installmentAmounts,
    ageCutoffDate = ageCutoffDate,
    ageCutoffLabel = ageCutoffLabel,
    ageCutoffSource = ageCutoffSource,
    fieldIds = fieldIds,
    playoffPlacementDivisionIds = playoffPlacementDivisionIds,
    playoffConfig = playoffConfig?.toTournamentConfigOrNull(),
    gamesPerOpponent = gamesPerOpponent?.roundToInt(),
    restTimeMinutes = restTimeMinutes?.roundToInt(),
    usesSets = usesSets,
    matchDurationMinutes = matchDurationMinutes?.roundToInt(),
    setDurationMinutes = setDurationMinutes?.roundToInt(),
    setsPerMatch = setsPerMatch?.roundToInt(),
    pointsToVictory = pointsToVictory,
    phaseSettings = phaseSettings?.toPhaseSettingsOrEmpty() ?: emptyMap(),
    teamIds = teamIds,
)

private fun EventEditorFieldDto.resolvedId(): String? = (id ?: legacyId).normalizedIdOrNull()

private fun EventEditorFieldDto.toDomain(): Field? {
    val resolvedId = resolvedId() ?: return null
    return Field(
        fieldNumber = 0,
        divisions = emptyList(),
        lat = lat ?: latitude,
        long = long ?: longitude,
        heading = heading,
        inUse = inUse,
        name = name,
        rentalSlotIds = rentalSlotIds,
        location = location,
        organizationId = organizationId,
        facilityId = facilityId,
        id = resolvedId,
    )
}

private fun List<Field>.withDivisionAssignments(
    divisionFieldIds: Map<String, List<String>>,
): List<Field> {
    val divisionsByFieldId = buildMap<String, MutableList<String>> {
        divisionFieldIds.forEach { (divisionId, fieldIds) ->
            fieldIds.forEach { fieldId ->
                val normalizedFieldId = fieldId.normalizedIdOrNull() ?: return@forEach
                getOrPut(normalizedFieldId) { mutableListOf() }.add(divisionId)
            }
        }
    }
    return map { field ->
        field.copy(
            divisions = divisionsByFieldId[field.id].orEmpty().distinct(),
        )
    }
}

private fun EventEditorTimeSlotDto.resolvedId(): String? = (id ?: legacyId).normalizedIdOrNull()

@OptIn(ExperimentalTime::class)
private fun EventEditorTimeSlotDto.toDomain(fallbackStart: String): TimeSlot? {
    val resolvedId = resolvedId() ?: return null
    val startDateValue = startDate ?: start ?: fallbackStart
    return TimeSlotDTO(
        id = resolvedId,
        dayOfWeek = dayOfWeek,
        daysOfWeek = daysOfWeek.takeIf { it.isNotEmpty() },
        divisions = (divisions.ifEmpty { division?.let(::listOf).orEmpty() }).takeIf { it.isNotEmpty() },
        startTimeMinutes = startTimeMinutes,
        endTimeMinutes = endTimeMinutes,
        startDate = startDateValue,
        timeZone = timeZone,
        repeating = repeating == true,
        endDate = endDate ?: end,
        scheduledFieldId = scheduledFieldId ?: fieldId,
        scheduledFieldIds = scheduledFieldIds.ifEmpty { fieldIds },
        price = price?.roundToInt(),
        requiredTemplateIds = requiredTemplateIds,
        hostRequiredTemplateIds = hostRequiredTemplateIds,
        sourceType = sourceType,
        rentalBookingId = rentalBookingId,
        rentalBookingItemId = rentalBookingItemId,
        rentalLocked = rentalLocked,
    ).toTimeSlot(resolvedId)
}

private fun EventEditorTagDto.toDomain(): EventTag = EventTag(
    id = (id ?: legacyId).normalizedIdOrNull(),
    name = name ?: label.orEmpty(),
    slug = slug.orEmpty(),
)

private fun EventEditorManualPaymentLinkDto.toDomain(): ManualPaymentLink = ManualPaymentLink(
    id = id.orEmpty(),
    provider = provider.orEmpty(),
    label = label.orEmpty(),
    url = url.orEmpty(),
)

private fun EventEditorOfficialPositionDto.toDomain(): EventOfficialPosition = EventOfficialPosition(
    id = id.normalizedId(),
    name = name,
    count = count,
    order = order,
)

private fun EventEditorOfficialDto.toDomain(eventId: String): EventOfficial {
    val normalizedUserId = userId.normalizedId()
    return EventOfficial(
        id = id.normalizedIdOrNull() ?: "event_official_${eventId}_$normalizedUserId",
        userId = normalizedUserId,
        positionIds = positionIds,
        fieldIds = fieldIds,
        isActive = isActive,
    )
}

private fun EventEditorStaffInviteDto.toDomain(): Invite = Invite(
    type = type ?: roles.firstOrNull() ?: "STAFF",
    email = email,
    status = status,
    staffTypes = (staffTypes + roles).distinct(),
    eventId = eventId,
    organizationId = organizationId,
    teamId = teamId,
    userId = resolvedUserId ?: userId,
    createdBy = createdBy,
    firstName = firstName,
    lastName = lastName,
    id = id.orEmpty(),
)

private fun EventEditorQuestionDto.toDomain(): RegistrationQuestionDraft = RegistrationQuestionDraft(
    id = id.normalizedIdOrNull(),
    clientId = clientId.normalizedIdOrNull(),
    prompt = prompt,
    answerType = answerType,
    required = required,
    sortOrder = sortOrder,
)

@OptIn(ExperimentalTime::class)
private fun EventEditorDraftDto.toEvent(eventId: String): Event {
    val basics = basics
    val participation = participation
    val payment = registration.payment
    val competition = competition
    val schedule = schedule
    val start = parseEditorInstant(basics.start, basics.timeZone, Instant.DISTANT_PAST)
    val end = parseEditorInstant(
        schedule.endConstraint ?: schedule.generatedScheduleEnd,
        basics.timeZone,
        start,
    )
    val eventType = runCatching { EventType.valueOf(basics.eventType.trim().uppercase()) }.getOrDefault(EventType.EVENT)
    val officialMode = runCatching { OfficialSchedulingMode.valueOf(staff.officialSchedulingMode.trim().uppercase()) }
        .getOrDefault(OfficialSchedulingMode.SCHEDULE)
    val checkInMode = runCatching { TeamCheckInMode.valueOf(staff.teamCheckInMode.trim().uppercase()) }
        .getOrDefault(TeamCheckInMode.OFF)
    val regularDetails = competition.divisionDetails.map(EventEditorDivisionDetailDto::toDomain)
    val playoffDetails = competition.playoffDivisionDetails.map(EventEditorDivisionDetailDto::toDomain)
    val allDetails = regularDetails + playoffDetails
    val isMultiDivisionLeague = eventType == EventType.LEAGUE && regularDetails.size > 1
    val eventPlayoffTeamCount = if (isMultiDivisionLeague) {
        null
    } else {
        competition.playoffTeamCount ?: regularDetails.firstOrNull()?.playoffTeamCount
    }
    return Event(
        id = eventId,
        name = basics.name,
        description = basics.description,
        divisions = competition.divisionIds,
        divisionDetails = allDetails,
        location = basics.location,
        address = basics.address.takeIf(String::isNotBlank),
        start = start,
        end = end,
        timeZone = basics.timeZone,
        priceCents = payment.priceCents,
        imageId = basics.imageId.orEmpty(),
        coordinates = basics.coordinates,
        hostId = basics.hostId.orEmpty(),
        assistantHostIds = staff.assistantHostIds,
        noFixedEndDateTime = schedule.mode == "GENERATED_END",
        teamSignup = participation.teamSignup,
        singleDivision = participation.singleDivision,
        freeAgentIds = participation.freeAgentIds,
        waitListIds = participation.waitListIds,
        cancellationRefundHours = participation.cancellationRefundHours,
        registrationCutoffHours = participation.registrationCutoffHours,
        sportIds = basics.sportIds,
        timeSlotIds = resources.timeSlotIds,
        fieldIds = resources.fieldIds,
        organizationId = basics.organizationId,
        affiliateUrl = basics.affiliateUrl.takeIf(String::isNotBlank),
        registrationPaymentMode = payment.mode,
        manualPaymentLinks = payment.manualPaymentLinks.map(EventEditorManualPaymentLinkDto::toDomain),
        manualPaymentInstructions = payment.manualPaymentInstructions,
        maxParticipants = participation.maxParticipants ?: 0,
        minAge = participation.minAge,
        maxAge = participation.maxAge,
        teamSizeLimit = participation.teamSizeLimit ?: 2,
        registrationByDivisionType = participation.registrationByDivisionType,
        eventType = eventType,
        matchRulesOverride = competition.matchRulesOverride?.toMatchRulesOrNull(),
        gamesPerOpponent = competition.gamesPerOpponent,
        includePlayoffs = competition.includePlayoffs,
        splitLeaguePlayoffDivisions = competition.splitLeaguePlayoffDivisions,
        playoffTeamCount = eventPlayoffTeamCount,
        doubleElimination = competition.doubleElimination,
        winnerSetCount = competition.winnerSetCount ?: 1,
        loserSetCount = competition.loserSetCount ?: 0,
        winnerBracketPointsToVictory = competition.winnerBracketPointsToVictory,
        loserBracketPointsToVictory = competition.loserBracketPointsToVictory,
        usesSets = competition.usesSets,
        matchDurationMinutes = competition.matchDurationMinutes?.roundToInt(),
        setDurationMinutes = competition.setDurationMinutes?.roundToInt(),
        setsPerMatch = competition.setsPerMatch,
        teamOfficialsMaySwap = staff.teamOfficialsMaySwap,
        doTeamsOfficiate = officialMode == OfficialSchedulingMode.TEAM_STAFFING,
        officialSchedulingMode = officialMode,
        teamCheckInMode = checkInMode,
        teamCheckInOpenMinutesBefore = staff.teamCheckInOpenMinutesBefore,
        allowMatchRosterEdits = staff.allowMatchRosterEdits,
        allowTemporaryMatchPlayers = staff.allowTemporaryMatchPlayers,
        autoCreatePointMatchIncidents = staff.autoCreatePointMatchIncidents,
        restTimeMinutes = competition.restTimeMinutes?.roundToInt(),
        state = basics.state,
        pointsToVictory = competition.pointsToVictory,
        officialPositions = staff.officialPositions.map(EventEditorOfficialPositionDto::toDomain),
        eventOfficials = staff.eventOfficials.map { official -> official.toDomain(eventId) },
        officialIds = staff.officialIds,
        allowPaymentPlans = payment.allowPaymentPlans,
        installmentCount = payment.installmentCount,
        installmentDueDates = payment.installmentDueDates,
        installmentDueRelativeDays = payment.installmentDueRelativeDays,
        installmentAmounts = payment.installmentAmounts,
        allowTeamSplitDefault = participation.allowTeamSplitDefault,
        requiredTemplateIds = resources.requiredTemplateIds,
        tags = basics.tags.map(EventEditorTagDto::toDomain),
    )
}

private fun EventEditorSnapshotDto.toCanonicalState(operationId: String?): EventEditorCanonicalState {
    val eventId = eventId.normalizedIdOrNull() ?: "editor-create-${operationId ?: "session"}"
    val event = draft.toEvent(eventId)
    val fallbackStart = draft.basics.start
    val divisionFieldIds = draft.competition.divisionFieldIds
    return EventEditorCanonicalState(
        event = event,
        fields = draft.resources.fields
            .mapNotNull(EventEditorFieldDto::toDomain)
            .withDivisionAssignments(divisionFieldIds),
        timeSlots = draft.resources.timeSlots.mapNotNull { slot -> slot.toDomain(fallbackStart) },
        leagueScoringConfig = draft.competition.leagueScoringConfig?.toLeagueScoringConfigOrNull(),
        questions = draft.registration.questions.map(EventEditorQuestionDto::toDomain),
        pendingStaffInvites = draft.staff.pendingInvites.map(EventEditorStaffInviteDto::toDomain),
        playoffDivisionDetails = draft.competition.playoffDivisionDetails.map(EventEditorDivisionDetailDto::toDomain),
        divisionFieldIds = divisionFieldIds,
    )
}

private fun EventEditorFieldDto.toDomainKey(): String? = resolvedId()

private fun Event.toBasicsDto(
    existing: EventEditorBasicsDto,
    baseline: Event,
): EventEditorBasicsDto = existing.copy(
    name = if (name != baseline.name) name else existing.name,
    description = if (description != baseline.description) description else existing.description,
    eventType = if (eventType != baseline.eventType) eventType.name else existing.eventType,
    sportIds = if (sportIds != baseline.sportIds) sportIds else existing.sportIds,
    start = if (start != baseline.start) start.toString() else existing.start,
    timeZone = if (timeZone != baseline.timeZone) timeZone else existing.timeZone,
    location = if (location != baseline.location) location else existing.location,
    address = if (address != baseline.address) address.orEmpty() else existing.address,
    coordinates = if (coordinates != baseline.coordinates) {
        if (coordinates.size == 2) coordinates else listOf(0.0, 0.0)
    } else {
        existing.coordinates
    },
    affiliateUrl = if (affiliateUrl != baseline.affiliateUrl) affiliateUrl.orEmpty() else existing.affiliateUrl,
    // Event does not model parentEvent. Keep the canonical snapshot value.
    parentEvent = existing.parentEvent,
    organizationId = if (organizationId != baseline.organizationId) organizationId else existing.organizationId,
    hostId = if (hostId != baseline.hostId) hostId.takeIf(String::isNotBlank) else existing.hostId,
    state = if (state != baseline.state) state else existing.state,
    imageId = if (imageId != baseline.imageId) imageId.takeIf(String::isNotBlank) else existing.imageId,
    tags = if (tags != baseline.tags) {
        tags.map { tag ->
            EventEditorTagDto(id = tag.id, slug = tag.slug, name = tag.name)
        }
    } else {
        existing.tags
    },
)

private fun Event.toParticipationDto(
    existing: com.razumly.mvp.core.network.dto.EventEditorParticipationDto,
    baseline: Event,
) = existing.copy(
    teamSignup = if (teamSignup != baseline.teamSignup) teamSignup else existing.teamSignup,
    singleDivision = if (singleDivision != baseline.singleDivision) singleDivision else existing.singleDivision,
    registrationByDivisionType = if (registrationByDivisionType != baseline.registrationByDivisionType) {
        registrationByDivisionType
    } else {
        existing.registrationByDivisionType
    },
    teamSizeLimit = if (teamSizeLimit != baseline.teamSizeLimit) teamSizeLimit.takeIf { it > 0 } else existing.teamSizeLimit,
    maxParticipants = if (maxParticipants != baseline.maxParticipants) maxParticipants.takeIf { it > 0 } else existing.maxParticipants,
    minAge = if (minAge != baseline.minAge) minAge else existing.minAge,
    maxAge = if (maxAge != baseline.maxAge) maxAge else existing.maxAge,
    cancellationRefundHours = if (cancellationRefundHours != baseline.cancellationRefundHours) {
        cancellationRefundHours
    } else {
        existing.cancellationRefundHours
    },
    registrationCutoffHours = if (registrationCutoffHours != baseline.registrationCutoffHours) {
        registrationCutoffHours
    } else {
        existing.registrationCutoffHours
    },
    allowTeamSplitDefault = if (allowTeamSplitDefault != baseline.allowTeamSplitDefault) {
        allowTeamSplitDefault == true
    } else {
        existing.allowTeamSplitDefault
    },
    waitListIds = if (waitListIds != baseline.waitListIds) waitListIds else existing.waitListIds,
    freeAgentIds = if (freeAgentIds != baseline.freeAgentIds) freeAgentIds else existing.freeAgentIds,
)

private fun Event.toPaymentDto(
    existing: EventEditorPaymentDto,
    baseline: Event,
) = existing.copy(
    mode = if (registrationPaymentMode != baseline.registrationPaymentMode) {
        registrationPaymentMode
    } else {
        existing.mode
    },
    priceCents = if (priceCents != baseline.priceCents) priceCents.coerceAtLeast(0) else existing.priceCents,
    // Event does not model the tax policy fields. Keep the canonical snapshot values.
    manualPaymentInstructions = if (manualPaymentInstructions != baseline.manualPaymentInstructions) {
        manualPaymentInstructions
    } else {
        existing.manualPaymentInstructions
    },
    manualPaymentLinks = if (manualPaymentLinks != baseline.manualPaymentLinks) {
        manualPaymentLinks.map { link ->
            EventEditorManualPaymentLinkDto(
                id = link.id.takeIf(String::isNotBlank),
                provider = link.provider,
                label = link.label,
                url = normalizeManualPaymentUrl(link.provider, link.url)
                    ?: throw IllegalArgumentException("Invalid manual payment URL."),
            )
        }
    } else {
        existing.manualPaymentLinks
    },
    allowPaymentPlans = if (allowPaymentPlans != baseline.allowPaymentPlans) {
        allowPaymentPlans == true
    } else {
        existing.allowPaymentPlans
    },
    installmentCount = if (installmentCount != baseline.installmentCount) installmentCount else existing.installmentCount,
    installmentDueDates = if (installmentDueDates != baseline.installmentDueDates) {
        installmentDueDates
    } else {
        existing.installmentDueDates
    },
    installmentDueRelativeDays = if (installmentDueRelativeDays != baseline.installmentDueRelativeDays) {
        installmentDueRelativeDays
    } else {
        existing.installmentDueRelativeDays
    },
    installmentAmounts = if (installmentAmounts != baseline.installmentAmounts) {
        installmentAmounts
    } else {
        existing.installmentAmounts
    },
)

private fun Event.toScheduleDto(
    existing: EventEditorScheduleDto,
    baseline: Event,
): EventEditorScheduleDto {
    val modeChanged = noFixedEndDateTime != baseline.noFixedEndDateTime
    val endChanged = end != baseline.end
    if (!modeChanged && !endChanged) return existing

    return when {
        noFixedEndDateTime -> existing.copy(
            mode = "GENERATED_END",
            endConstraint = null,
            generatedScheduleEnd = end.toString(),
        )
        else -> existing.copy(
            mode = "FIXED_END",
            endConstraint = end.toString(),
            generatedScheduleEnd = null,
        )
    }
}

private fun EventEditorDivisionDetailDto.withDomain(detail: DivisionDetail): EventEditorDivisionDetailDto = detail.toDto(this)

private fun Event.toCompetitionDto(
    existing: EventEditorCompetitionDto,
    baseline: Event,
    playoffDivisionDetails: List<DivisionDetail>,
    playoffDivisionDetailsChanged: Boolean,
    divisionFieldIds: Map<String, List<String>>,
    divisionFieldIdsChanged: Boolean,
    leagueScoringConfig: LeagueScoringConfigDTO?,
    scoringChanged: Boolean,
): EventEditorCompetitionDto {
    val existingById = (existing.divisionDetails + existing.playoffDivisionDetails).associateBy { it.id }
    val currentRegularDetails = divisionDetails.filterNot { it.kind?.equals("PLAYOFF", ignoreCase = true) == true }
    val baselineRegularDetails = baseline.divisionDetails.filterNot { it.kind?.equals("PLAYOFF", ignoreCase = true) == true }
    val isMultiDivisionLeague = eventType == EventType.LEAGUE && currentRegularDetails.size > 1
    val currentRegularDetailsForDto = if (
        includePlayoffs &&
        !isMultiDivisionLeague &&
        currentRegularDetails.size == 1 &&
        playoffTeamCount != null
    ) {
        currentRegularDetails.map { detail ->
            detail.copy(playoffTeamCount = detail.playoffTeamCount ?: playoffTeamCount)
        }
    } else {
        currentRegularDetails
    }
    val currentPlayoffTeamCount = if (includePlayoffs) {
        if (isMultiDivisionLeague) {
            null
        } else {
            playoffTeamCount ?: currentRegularDetailsForDto.firstOrNull()?.playoffTeamCount
        }
    } else {
        playoffTeamCount
    }
    val baselineIsMultiDivisionLeague =
        baseline.eventType == EventType.LEAGUE && baselineRegularDetails.size > 1
    val baselinePlayoffTeamCount = if (baseline.includePlayoffs) {
        if (baselineIsMultiDivisionLeague) {
            null
        } else {
            baseline.playoffTeamCount ?: baselineRegularDetails.firstOrNull()?.playoffTeamCount
        }
    } else {
        baseline.playoffTeamCount
    }
    val regularDetailsChanged = currentRegularDetailsForDto != baselineRegularDetails
    val currentDivisionIdsChanged = divisions != baseline.divisions
    val currentWinnerSetCountChanged = winnerSetCount != baseline.winnerSetCount
    val currentLoserSetCountChanged = loserSetCount != baseline.loserSetCount
    val currentDoubleEliminationChanged = doubleElimination != baseline.doubleElimination
    val currentIncludePlayoffsChanged = includePlayoffs != baseline.includePlayoffs
    val currentSplitPlayoffsChanged = splitLeaguePlayoffDivisions != baseline.splitLeaguePlayoffDivisions
    val currentPlayoffTeamCountChanged = currentPlayoffTeamCount != baselinePlayoffTeamCount
    val currentPointsToVictoryChanged = pointsToVictory != baseline.pointsToVictory
    val currentWinnerBracketPointsChanged = winnerBracketPointsToVictory != baseline.winnerBracketPointsToVictory
    val currentLoserBracketPointsChanged = loserBracketPointsToVictory != baseline.loserBracketPointsToVictory
    val currentUsesSetsChanged = usesSets != baseline.usesSets
    val currentSetsPerMatchChanged = setsPerMatch != baseline.setsPerMatch
    val currentSetDurationChanged = setDurationMinutes != baseline.setDurationMinutes
    val currentRestTimeChanged = restTimeMinutes != baseline.restTimeMinutes
    val currentMatchDurationChanged = matchDurationMinutes != baseline.matchDurationMinutes
    val currentGamesPerOpponentChanged = gamesPerOpponent != baseline.gamesPerOpponent
    val currentMatchRulesChanged = matchRulesOverride != baseline.matchRulesOverride

    return existing.copy(
        divisionIds = if (currentDivisionIdsChanged) divisions else existing.divisionIds,
        divisionDetails = if (regularDetailsChanged) {
            currentRegularDetailsForDto.map { detail -> detail.toDto(existingById[detail.id]) }
        } else {
            existing.divisionDetails
        },
        playoffDivisionDetails = if (playoffDivisionDetailsChanged) {
            playoffDivisionDetails.map { detail -> detail.toDto(existingById[detail.id]) }
        } else {
            existing.playoffDivisionDetails
        },
        divisionFieldIds = if (divisionFieldIdsChanged) divisionFieldIds else existing.divisionFieldIds,
        winnerSetCount = if (currentWinnerSetCountChanged) winnerSetCount.takeIf { it > 0 } else existing.winnerSetCount,
        loserSetCount = if (currentLoserSetCountChanged) loserSetCount.takeIf { it > 0 } else existing.loserSetCount,
        doubleElimination = if (currentDoubleEliminationChanged) doubleElimination else existing.doubleElimination,
        includePlayoffs = if (currentIncludePlayoffsChanged) includePlayoffs else existing.includePlayoffs,
        splitLeaguePlayoffDivisions = if (currentSplitPlayoffsChanged) {
            splitLeaguePlayoffDivisions
        } else {
            existing.splitLeaguePlayoffDivisions
        },
        playoffTeamCount = if (includePlayoffs) {
            currentPlayoffTeamCount
        } else if (currentPlayoffTeamCountChanged) {
            playoffTeamCount
        } else {
            existing.playoffTeamCount
        },
        pointsToVictory = if (currentPointsToVictoryChanged) pointsToVictory else existing.pointsToVictory,
        winnerBracketPointsToVictory = if (currentWinnerBracketPointsChanged) {
            winnerBracketPointsToVictory
        } else {
            existing.winnerBracketPointsToVictory
        },
        loserBracketPointsToVictory = if (currentLoserBracketPointsChanged) {
            loserBracketPointsToVictory
        } else {
            existing.loserBracketPointsToVictory
        },
        usesSets = if (currentUsesSetsChanged) usesSets else existing.usesSets,
        setsPerMatch = if (currentSetsPerMatchChanged) setsPerMatch else existing.setsPerMatch,
        setDurationMinutes = if (currentSetDurationChanged) setDurationMinutes?.toDouble() else existing.setDurationMinutes,
        restTimeMinutes = if (currentRestTimeChanged) restTimeMinutes?.toDouble() else existing.restTimeMinutes,
        matchDurationMinutes = if (currentMatchDurationChanged) matchDurationMinutes?.toDouble() else existing.matchDurationMinutes,
        gamesPerOpponent = if (currentGamesPerOpponentChanged) gamesPerOpponent else existing.gamesPerOpponent,
        matchRulesOverride = if (currentMatchRulesChanged) {
            matchRulesOverride.toJsonObjectOrNull()
        } else {
            existing.matchRulesOverride
        },
        leagueScoringConfig = if (scoringChanged) {
            leagueScoringConfig.toJsonObjectOrNull()
        } else {
            existing.leagueScoringConfig
        },
    )
}

private fun Field.toDto(existing: EventEditorFieldDto? = null): EventEditorFieldDto = EventEditorFieldDto(
    id = id,
    legacyId = existing?.legacyId,
    name = name,
    location = location,
    lat = lat,
    long = long,
    heading = heading,
    inUse = inUse,
    rentalSlotIds = rentalSlotIds,
    sportIds = existing?.sportIds.orEmpty(),
    createdBy = existing?.createdBy,
    archivedAt = existing?.archivedAt,
    archivedByUserId = existing?.archivedByUserId,
    archiveReason = existing?.archiveReason,
    organizationId = organizationId,
    facilityId = facilityId,
    latitude = lat,
    longitude = long,
)

@OptIn(ExperimentalTime::class)
private fun TimeSlot.toDto(existing: EventEditorTimeSlotDto? = null): EventEditorTimeSlotDto = EventEditorTimeSlotDto(
    id = id,
    legacyId = existing?.legacyId,
    eventId = existing?.eventId,
    dayOfWeek = dayOfWeek,
    daysOfWeek = daysOfWeek.orEmpty(),
    startTimeMinutes = startTimeMinutes,
    endTimeMinutes = endTimeMinutes,
    startDate = startDate.toString(),
    endDate = endDate?.toString(),
    start = existing?.start,
    end = existing?.end,
    timeZone = timeZone,
    scheduledFieldId = scheduledFieldId,
    scheduledFieldIds = scheduledFieldIds.orEmpty(),
    fieldId = existing?.fieldId,
    fieldIds = existing?.fieldIds.orEmpty(),
    divisions = divisions.orEmpty(),
    division = existing?.division,
    divisionKeys = existing?.divisionKeys.orEmpty(),
    requiredTemplateIds = requiredTemplateIds,
    hostRequiredTemplateIds = hostRequiredTemplateIds,
    repeating = repeating,
    price = price?.toDouble(),
    taxHandling = existing?.taxHandling,
    sourceType = sourceType,
    rentalBookingId = rentalBookingId,
    rentalBookingItemId = rentalBookingItemId,
    rentalLocked = rentalLocked,
)

private fun EventEditorQuestionDto.toDto(question: RegistrationQuestionDraft): EventEditorQuestionDto = copy(
    id = question.id,
    clientId = question.clientId,
    prompt = question.prompt,
    answerType = question.answerType,
    required = question.required,
    sortOrder = question.sortOrder,
)

private fun EventEditorStaffInviteDto.toDto(invite: Invite): EventEditorStaffInviteDto = copy(
    id = invite.id.takeIf(String::isNotBlank),
    email = invite.email,
    firstName = invite.firstName,
    lastName = invite.lastName,
    staffTypes = invite.staffTypes,
    resolvedUserId = invite.userId,
    userId = invite.userId,
    type = invite.type,
    status = invite.status,
    eventId = invite.eventId,
    organizationId = invite.organizationId,
    teamId = invite.teamId,
    createdBy = invite.createdBy,
)

private fun Event.toStaffDto(
    existing: EventEditorStaffDto,
    baseline: Event,
    pendingStaffInvites: List<Invite>,
    pendingStaffInvitesChanged: Boolean,
): EventEditorStaffDto {
    val schedulingModeChanged = officialSchedulingMode != baseline.officialSchedulingMode ||
        doTeamsOfficiate != baseline.doTeamsOfficiate
    return existing.copy(
        officialSchedulingMode = if (schedulingModeChanged) officialSchedulingMode.name else existing.officialSchedulingMode,
        teamOfficialsMaySwap = if (teamOfficialsMaySwap != baseline.teamOfficialsMaySwap) {
            teamOfficialsMaySwap == true
        } else {
            existing.teamOfficialsMaySwap
        },
        teamCheckInMode = if (teamCheckInMode != baseline.teamCheckInMode) teamCheckInMode.name else existing.teamCheckInMode,
        teamCheckInOpenMinutesBefore = if (teamCheckInOpenMinutesBefore != baseline.teamCheckInOpenMinutesBefore) {
            teamCheckInOpenMinutesBefore
        } else {
            existing.teamCheckInOpenMinutesBefore
        },
        allowMatchRosterEdits = if (allowMatchRosterEdits != baseline.allowMatchRosterEdits) {
            allowMatchRosterEdits
        } else {
            existing.allowMatchRosterEdits
        },
        allowTemporaryMatchPlayers = if (allowTemporaryMatchPlayers != baseline.allowTemporaryMatchPlayers) {
            allowTemporaryMatchPlayers
        } else {
            existing.allowTemporaryMatchPlayers
        },
        autoCreatePointMatchIncidents = if (autoCreatePointMatchIncidents != baseline.autoCreatePointMatchIncidents) {
            autoCreatePointMatchIncidents
        } else {
            existing.autoCreatePointMatchIncidents
        },
        officialIds = if (officialIds != baseline.officialIds) officialIds else existing.officialIds,
        officialPositions = if (officialPositions != baseline.officialPositions) {
            officialPositions.map { position ->
                EventEditorOfficialPositionDto(position.id, position.name, position.count, position.order)
            }
        } else {
            existing.officialPositions
        },
        eventOfficials = if (eventOfficials != baseline.eventOfficials) {
            eventOfficials.map { official ->
                EventEditorOfficialDto(official.id, official.userId, official.positionIds, official.fieldIds, official.isActive)
            }
        } else {
            existing.eventOfficials
        },
        assistantHostIds = if (assistantHostIds != baseline.assistantHostIds) assistantHostIds else existing.assistantHostIds,
        pendingInvites = if (pendingStaffInvitesChanged) {
            pendingStaffInvites.map { invite ->
                val existingInvite = existing.pendingInvites.firstOrNull { row -> row.id == invite.id }
                existingInvite?.toDto(invite) ?: EventEditorStaffInviteDto(
                    id = invite.id.takeIf(String::isNotBlank),
                    email = invite.email,
                    firstName = invite.firstName,
                    lastName = invite.lastName,
                    staffTypes = invite.staffTypes,
                    resolvedUserId = invite.userId,
                    userId = invite.userId,
                    type = invite.type,
                    status = invite.status,
                    eventId = invite.eventId,
                    organizationId = invite.organizationId,
                    teamId = invite.teamId,
                    createdBy = invite.createdBy,
                )
            }
        } else {
            existing.pendingInvites
        },
    )
}
private fun Map<String, List<String>>.withFieldDivisionAssignments(
    fields: List<Field>,
    activeFieldIds: List<String>,
): Map<String, List<String>> {
    val activeIds = activeFieldIds
        .map(String::normalizedId)
        .filter(String::isNotBlank)
        .toSet()
        .ifEmpty {
            fields.map { field -> field.id.normalizedId() }
                .filter(String::isNotBlank)
                .toSet()
        }
    val next = mapValues { (_, fieldIds) ->
        fieldIds
            .filter { fieldId -> fieldId.normalizedId() in activeIds }
            .toMutableList()
    }.toMutableMap()
    fields.forEach { field ->
        val fieldId = field.id.normalizedId().takeIf(String::isNotBlank) ?: return@forEach
        if (fieldId !in activeIds) return@forEach
        next.values.forEach { fieldIds ->
            fieldIds.removeAll { existingFieldId -> existingFieldId.normalizedId() == fieldId }
        }
        field.divisions
            .map(String::normalizedId)
            .filter(String::isNotBlank)
            .forEach { divisionId ->
                next.getOrPut(divisionId) { mutableListOf() }.add(fieldId)
            }
    }
    return next.mapValues { (_, fieldIds) -> fieldIds.distinct() }
}
private fun EventEditorDraftDto.withMutation(
    baseline: EventEditorCanonicalState,
    mutation: EventEditorCanonicalState,
): EventEditorDraftDto {
    val fieldsChanged = mutation.fields != baseline.fields
    val slotsChanged = mutation.timeSlots != baseline.timeSlots
    val questionsChanged = mutation.questions != baseline.questions
    val invitesChanged = mutation.pendingStaffInvites != baseline.pendingStaffInvites
    val scoringChanged = mutation.leagueScoringConfig != baseline.leagueScoringConfig
    val playoffDetailsChanged = mutation.playoffDivisionDetails != baseline.playoffDivisionDetails
    val effectiveDivisionFieldIds = if (
        fieldsChanged &&
        mutation.divisionFieldIds == baseline.divisionFieldIds
    ) {
        baseline.divisionFieldIds.withFieldDivisionAssignments(
            fields = mutation.fields,
            activeFieldIds = mutation.event.fieldIds,
        )
    } else {
        mutation.divisionFieldIds
    }
    val divisionFieldIdsChanged = effectiveDivisionFieldIds != baseline.divisionFieldIds
    val existingFieldsById = resources.fields.mapNotNull { field -> field.toDomainKey()?.let { it to field } }.toMap()
    val existingSlotsById = resources.timeSlots.mapNotNull { slot -> slot.resolvedId()?.let { it to slot } }.toMap()

    val nextResources = resources.copy(
        fieldIds = if (mutation.event.fieldIds != baseline.event.fieldIds) mutation.event.fieldIds else resources.fieldIds,
        fields = if (fieldsChanged) {
            mutation.fields.map { field -> field.toDto(existingFieldsById[field.id]) }
        } else {
            resources.fields
        },
        timeSlotIds = if (mutation.event.timeSlotIds != baseline.event.timeSlotIds) {
            mutation.event.timeSlotIds
        } else {
            resources.timeSlotIds
        },
        timeSlots = if (slotsChanged) {
            mutation.timeSlots.map { slot -> slot.toDto(existingSlotsById[slot.id]) }
        } else {
            resources.timeSlots
        },
        requiredTemplateIds = if (mutation.event.requiredTemplateIds != baseline.event.requiredTemplateIds) {
            mutation.event.requiredTemplateIds
        } else {
            resources.requiredTemplateIds
        },
    )

    val nextCompetition = mutation.event.toCompetitionDto(
        existing = competition,
        baseline = baseline.event,
        playoffDivisionDetails = mutation.playoffDivisionDetails,
        playoffDivisionDetailsChanged = playoffDetailsChanged,
        divisionFieldIds = effectiveDivisionFieldIds,
        divisionFieldIdsChanged = divisionFieldIdsChanged,
        leagueScoringConfig = mutation.leagueScoringConfig,
        scoringChanged = scoringChanged,
    )

    val nextRegistration = registration.copy(
        payment = mutation.event.toPaymentDto(registration.payment, baseline.event),
        questions = if (questionsChanged) {
            mutation.questions.map { question ->
                val existing = registration.questions.firstOrNull { row -> row.id == question.id || row.clientId == question.clientId }
                existing?.toDto(question) ?: EventEditorQuestionDto(
                    id = question.id,
                    clientId = question.clientId,
                    prompt = question.prompt,
                    answerType = question.answerType,
                    required = question.required,
                    sortOrder = question.sortOrder,
                )
            }
        } else {
            registration.questions
        },
    )

    return copy(
        basics = mutation.event.toBasicsDto(basics, baseline.event),
        participation = mutation.event.toParticipationDto(participation, baseline.event),
        registration = nextRegistration,
        competition = nextCompetition,
        schedule = mutation.event.toScheduleDto(schedule, baseline.event),
        resources = nextResources,
        staff = mutation.event.toStaffDto(
            existing = staff,
            baseline = baseline.event,
            pendingStaffInvites = mutation.pendingStaffInvites,
            pendingStaffInvitesChanged = invitesChanged,
        ),
    )
}

object EventEditorSessionMapper {
    fun fromCreateBootstrap(bootstrap: EventEditorCreateBootstrapDto): EventEditorSession {
        validateSnapshot(bootstrap.snapshot, expectedMode = "CREATE")
        require(bootstrap.contractVersion == EVENT_EDITOR_CONTRACT_VERSION) {
            unsupportedVersionMessage(bootstrap.contractVersion)
        }
        require(bootstrap.createOperationId.normalizedId().isNotBlank()) { "Create bootstrap did not include an operation ID." }
        val canonical = bootstrap.snapshot.toCanonicalState(bootstrap.createOperationId)
        return EventEditorSession(
            snapshot = bootstrap.snapshot,
            canonicalState = canonical,
            baseline = canonical,
            createOperationId = bootstrap.createOperationId,
        )
    }

    fun fromEditSnapshot(snapshot: EventEditorSnapshotDto): EventEditorSession {
        validateSnapshot(snapshot, expectedMode = "EDIT")
        val canonical = snapshot.toCanonicalState(operationId = null)
        return EventEditorSession(snapshot = snapshot, canonicalState = canonical, baseline = canonical)
    }

    fun toCreateCommand(session: EventEditorSession, mutation: EventEditorMutation): PendingEventCreate {
        val operationId = session.createOperationId?.normalizedIdOrNull()
            ?: error("Create editor session did not include an operation ID.")
        require(session.snapshot.mode == "CREATE") { "Create command requires a create editor session." }
        val draft = session.snapshot.draft.withMutation(session.baseline, mutation.canonicalState)
        val command = EventEditorCreateCommandDto(
            contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
            createOperationId = operationId,
            draft = draft,
        )
        return PendingEventCreate(command = command, bootstrapSnapshot = session.snapshot)
    }

    fun toSaveCommand(session: EventEditorSession, mutation: EventEditorMutation): com.razumly.mvp.core.network.dto.EventEditorSaveCommandDto {
        require(session.snapshot.mode == "EDIT") { "Save command requires an edit editor session." }
        val draft = session.snapshot.draft.withMutation(session.baseline, mutation.canonicalState)
        return com.razumly.mvp.core.network.dto.EventEditorSaveCommandDto(
            contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
            editorRevision = session.snapshot.editorRevision,
            staffRevision = session.snapshot.staffRevision,
            draft = draft,
        )
    }

    fun applySaveResult(
        result: EventEditorSaveResultDto,
        previous: EventEditorSession,
    ): EventEditorSession {
        validateSnapshot(result.snapshot, expectedMode = previous.snapshot.mode)
        val operationId = previous.createOperationId
        val canonical = result.snapshot.toCanonicalState(operationId)
        return EventEditorSession(
            snapshot = result.snapshot,
            canonicalState = canonical,
            baseline = canonical,
            createOperationId = operationId,
        )
    }

    fun canonicalState(snapshot: EventEditorSnapshotDto, operationId: String? = null): EventEditorCanonicalState {
        validateSnapshot(snapshot)
        return snapshot.toCanonicalState(operationId)
    }

    private fun validateSnapshot(snapshot: EventEditorSnapshotDto, expectedMode: String? = null) {
        require(snapshot.contractVersion == EVENT_EDITOR_CONTRACT_VERSION) {
            unsupportedVersionMessage(snapshot.contractVersion)
        }
        require(snapshot.mode == "CREATE" || snapshot.mode == "EDIT") { "Unsupported event editor mode ${snapshot.mode}." }
        if (expectedMode != null) require(snapshot.mode == expectedMode) {
            "Expected an $expectedMode editor snapshot, received ${snapshot.mode}."
        }
        require(snapshot.editorRevision.normalizedId().isNotBlank()) { "Event editor snapshot did not include an editor revision." }
        require(snapshot.draft.basics.start.normalizedId().isNotBlank()) { "Event editor snapshot did not include a start date." }
    }

    private fun unsupportedVersionMessage(version: Int): String =
        "Update BracketIQ to edit this event (contract version $version is not supported)."
}
