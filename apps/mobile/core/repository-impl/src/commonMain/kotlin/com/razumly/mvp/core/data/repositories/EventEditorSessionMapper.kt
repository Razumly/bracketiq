package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.DivisionPhaseSettingsMVP
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MIN_BRACKET_TEAM_COUNT
import com.razumly.mvp.core.data.dataTypes.isBracketTeamCountEnabled
import com.razumly.mvp.core.data.dataTypes.normalizeBracketTeamCount
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.ManualPaymentLink
import com.razumly.mvp.core.data.dataTypes.normalizeManualPaymentUrl
import com.razumly.mvp.core.data.dataTypes.MatchRulesConfigMVP
import com.razumly.mvp.core.data.dataTypes.StaffingPriority
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.TimeSlotDTO
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.enums.normalizeAutomatedSchedulingForEventType
import com.razumly.mvp.core.network.dto.EVENT_EDITOR_CONTRACT_VERSION
import com.razumly.mvp.core.network.dto.isSupportedEventEditorContractVersion
import com.razumly.mvp.core.network.dto.EventEditorBasicsDto
import com.razumly.mvp.core.network.dto.EventEditorCompetitionDto
import com.razumly.mvp.core.network.dto.EventEditorCreateBootstrapDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCommandDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCompletionMode
import com.razumly.mvp.core.network.dto.EventEditorExpectedCreateRevisionsDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCompletionDto
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
import com.razumly.mvp.core.network.dto.EventEditorSaveScheduleTransitionDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleTransitionMode
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
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
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
private fun JsonElement.stableObjectId(): String? =
    (this as? JsonObject)
        ?.get("id")
        ?.let { value -> (value as? JsonPrimitive)?.content }
        ?.trim()
        ?.takeIf(String::isNotBlank)

private fun JsonArray.mergeModeledJsonArray(
    modeled: JsonArray,
    baselineModeled: JsonArray? = null,
): JsonArray {
    val modeledIds = modeled.map(JsonElement::stableObjectId)
    if (modeledIds.any { id -> id == null } || modeledIds.toSet().size != modeledIds.size) {
        return modeled
    }
    val existingById = mapNotNull { element ->
        element.stableObjectId()?.let { id -> id to element }
    }.toMap()
    val baselineById = baselineModeled
        ?.mapNotNull { element ->
            element.stableObjectId()?.let { id -> id to element }
        }
        ?.toMap()
        .orEmpty()
    return JsonArray(
        modeled.mapIndexed { index, modeledElement ->
            val existingElement = existingById[modeledIds[index]]
            if (existingElement is JsonObject && modeledElement is JsonObject) {
                existingElement.mergeModeledJsonObject(
                    modeled = modeledElement,
                    baselineModeled = baselineById[modeledIds[index]] as? JsonObject,
                )
            } else {
                modeledElement
            }
        },
    )
}

private fun JsonObject.mergeModeledJsonObject(
    modeled: JsonObject,
    baselineModeled: JsonObject? = null,
): JsonObject {
    val merged = toMutableMap()
    modeled.forEach { (key, value) ->
        val existingValue = merged[key]
        val baselineValue = baselineModeled?.get(key)
        merged[key] = when {
            baselineValue != null && value == baselineValue && existingValue != null -> existingValue
            existingValue is JsonObject && value is JsonObject -> {
                existingValue.mergeModeledJsonObject(
                    modeled = value,
                    baselineModeled = baselineValue as? JsonObject,
                )
            }
            existingValue is JsonArray && value is JsonArray -> {
                existingValue.mergeModeledJsonArray(
                    modeled = value,
                    baselineModeled = baselineValue as? JsonArray,
                )
            }
            else -> value
        }
    }
    baselineModeled?.keys
        ?.filterNot { key -> modeled.containsKey(key) }
        ?.forEach { key -> merged.remove(key) }
    return JsonObject(merged)
}


private fun DivisionDetail.toDto(
    existing: EventEditorDivisionDetailDto? = null,
    baseline: DivisionDetail? = null,
): EventEditorDivisionDetailDto {
    fun currentIntOrExisting(
        current: Int?,
        baselineValue: Int?,
        existingValue: Double?,
    ): Double? = if (current != null) {
        current.toDouble()
    } else if (baseline != null && current == baselineValue) {
        existingValue
    } else {
        null
    }

    fun currentBooleanOrExisting(
        current: Boolean?,
        baselineValue: Boolean?,
        existingValue: Boolean?,
    ): Boolean? = if (current != null) {
        current
    } else if (baseline != null && current == baselineValue) {
        existingValue
    } else {
        null
    }

    val phaseSettingsDto = when {
        baseline != null && phaseSettings == baseline.phaseSettings -> existing?.phaseSettings
        phaseSettings.isNotEmpty() -> {
            val modeled = jsonMVP.encodeToJsonElement(phaseSettings).jsonObject
            val baselineModeled = baseline?.phaseSettings?.let {
                jsonMVP.encodeToJsonElement(it).jsonObject
            }
            existing?.phaseSettings?.mergeModeledJsonObject(
                modeled = modeled,
                baselineModeled = baselineModeled,
            ) ?: modeled
        }
        baseline != null && phaseSettings != baseline.phaseSettings -> JsonObject(emptyMap())
        else -> existing?.phaseSettings
    }
    val playoffConfigDto = when {
        baseline != null && playoffConfig == baseline.playoffConfig -> existing?.playoffConfig
        playoffConfig != null -> {
            playoffConfig.toJsonObjectOrNull()?.let { modeled ->
                val baselineModeled = (baseline?.playoffConfig).toJsonObjectOrNull()
                existing?.playoffConfig?.mergeModeledJsonObject(
                    modeled = modeled,
                    baselineModeled = baselineModeled,
                ) ?: modeled
            }
        }
        baseline != null && playoffConfig != baseline.playoffConfig -> null
        else -> existing?.playoffConfig
    }

    return EventEditorDivisionDetailDto(
        id = id.normalizedId(),
        sourceDivisionId = sourceDivisionId ?: existing?.sourceDivisionId,
        key = key,
        name = name,
        kind = kind?.trim()?.uppercase().takeUnless { it.isNullOrBlank() } ?: existing?.kind ?: "LEAGUE",
        isSystemGenerated = isSystemGenerated ?: existing?.isSystemGenerated,
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
        phaseSettings = phaseSettingsDto,
        playoffPlacementDivisionIds = if (playoffPlacementDivisionIds.isNotEmpty()) playoffPlacementDivisionIds else existing?.playoffPlacementDivisionIds.orEmpty(),
        standingsOverrides = existing?.standingsOverrides,
        playoffConfig = playoffConfigDto,
        playoffConfigPresent = playoffConfigDto != null ||
            (baseline != null && playoffConfig != baseline.playoffConfig),
        gamesPerOpponent = currentIntOrExisting(
            gamesPerOpponent,
            baseline?.gamesPerOpponent,
            existing?.gamesPerOpponent,
        ),
        restTimeMinutes = currentIntOrExisting(
            restTimeMinutes,
            baseline?.restTimeMinutes,
            existing?.restTimeMinutes,
        ),
        usesSets = currentBooleanOrExisting(
            usesSets,
            baseline?.usesSets,
            existing?.usesSets,
        ),
        matchDurationMinutes = currentIntOrExisting(
            matchDurationMinutes,
            baseline?.matchDurationMinutes,
            existing?.matchDurationMinutes,
        ),
        setDurationMinutes = currentIntOrExisting(
            setDurationMinutes,
            baseline?.setDurationMinutes,
            existing?.setDurationMinutes,
        ),
        setsPerMatch = currentIntOrExisting(
            setsPerMatch,
            baseline?.setsPerMatch,
            existing?.setsPerMatch,
        ),
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
}

@OptIn(ExperimentalTime::class)
private fun EventEditorDivisionDetailDto.toDomain(): DivisionDetail = DivisionDetail(
    id = id.normalizedId(),
    sourceDivisionId = sourceDivisionId.normalizedIdOrNull(),
    kind = kind.trim().uppercase(),
    isSystemGenerated = isSystemGenerated,
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
        sportIds = sportIds.map(String::trim).filter(String::isNotBlank).distinct(),
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
    val resolvedAutomatedScheduling = normalizeAutomatedSchedulingForEventType(
        eventType,
        schedule.isAutomatedScheduling,
    )
    val resolvedStaffingPriority = staff.staffingPriority
        ?.let(StaffingPriority::valueOf)
        ?: StaffingPriority.BEST_AVAILABLE_COVERAGE
    val effectiveDoTeamsOfficiate = staff.doTeamsOfficiate ?: false
    val isBracketCountEnabled = isBracketTeamCountEnabled(
        eventType,
        competition.includePlayoffs,
    )
    val eventPlayoffTeamCount = if (isBracketCountEnabled) {
        normalizeBracketTeamCount(competition.playoffTeamCount)
    } else {
        competition.playoffTeamCount
    }
    val eventMaxParticipants = if (eventType == EventType.TOURNAMENT) {
        normalizeBracketTeamCount(participation.maxParticipants)
    } else {
        participation.maxParticipants ?: 0
    }
    val regularDetails = competition.divisionDetails
        .map(EventEditorDivisionDetailDto::toDomain)
        .map { detail ->
            val normalizedPlayoffCount = when {
                !isBracketCountEnabled -> detail.playoffTeamCount
                participation.singleDivision -> eventPlayoffTeamCount
                else -> normalizeBracketTeamCount(detail.playoffTeamCount)
            }
            detail.copy(
                maxParticipants = if (eventType == EventType.TOURNAMENT) {
                    normalizeBracketTeamCount(
                        detail.maxParticipants ?: eventMaxParticipants,
                    )
                } else {
                    detail.maxParticipants
                },
                playoffTeamCount = normalizedPlayoffCount,
            )
        }
    val playoffDetails = competition.playoffDivisionDetails
        .map(EventEditorDivisionDetailDto::toDomain)
        .map { detail ->
            detail.copy(
                maxParticipants = if (eventType == EventType.TOURNAMENT) {
                    normalizeBracketTeamCount(detail.maxParticipants)
                } else {
                    detail.maxParticipants
                },
                playoffTeamCount = if (isBracketCountEnabled) {
                    normalizeBracketTeamCount(detail.playoffTeamCount)
                } else {
                    detail.playoffTeamCount
                },
            )
        }
    val allDetails = regularDetails + playoffDetails
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
        coordinates = basics.coordinates,
        hostId = basics.hostId.orEmpty(),
        assistantHostIds = staff.assistantHostIds,
        noFixedEndDateTime =
            schedule.mode.trim().uppercase() == "GENERATED_END",
        isAutomatedScheduling = resolvedAutomatedScheduling,
        teamSignup = participation.teamSignup,
        singleDivision = participation.singleDivision,
        freeAgentIds = participation.freeAgentIds,
        waitListIds = participation.waitListIds,
        cancellationRefundHours = participation.cancellationRefundHours,
        registrationCutoffHours = participation.registrationCutoffHours,
        sportIds = basics.sportIds,
        timeSlotIds = resources.timeSlotIds,
        fieldIds = resources.fieldIds,
        leagueScoringConfigId = if (eventType == EventType.LEAGUE) {
            competition.leagueScoringConfig?.stableObjectId()
        } else {
            null
        },
        organizationId = basics.organizationId,
        affiliateUrl = basics.affiliateUrl.takeIf(String::isNotBlank),
        registrationPaymentMode = payment.mode,
        manualPaymentLinks = payment.manualPaymentLinks.map(EventEditorManualPaymentLinkDto::toDomain),
        manualPaymentInstructions = payment.manualPaymentInstructions,
        maxParticipants = eventMaxParticipants,
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
        doTeamsOfficiate = effectiveDoTeamsOfficiate,
        teamCheckInMode = runCatching {
            TeamCheckInMode.valueOf(staff.teamCheckInMode.trim().uppercase())
        }.getOrDefault(TeamCheckInMode.OFF),
        teamCheckInOpenMinutesBefore = staff.teamCheckInOpenMinutesBefore,
        restTimeMinutes = competition.restTimeMinutes?.roundToInt(),
        state = basics.state,
        pointsToVictory = competition.pointsToVictory,
        allowMatchRosterEdits = staff.allowMatchRosterEdits,
        allowTemporaryMatchPlayers = staff.allowTemporaryMatchPlayers,
        autoCreatePointMatchIncidents = staff.autoCreatePointMatchIncidents,
        staffingPriority = resolvedStaffingPriority,
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
        imageId = basics.imageId.orEmpty(),
    ).withEditorEventTypeInvariants()
}

private fun Event.withoutMatchGenerationConfiguration(): Event = copy(
    leagueScoringConfigId = null,
    gamesPerOpponent = null,
    includePlayoffs = false,
    splitLeaguePlayoffDivisions = false,
    playoffTeamCount = null,
    doubleElimination = false,
    winnerSetCount = 1,
    loserSetCount = 0,
    winnerBracketPointsToVictory = emptyList(),
    loserBracketPointsToVictory = emptyList(),
    usesSets = false,
    matchDurationMinutes = null,
    setDurationMinutes = null,
    setsPerMatch = null,
    matchRulesOverride = null,
    resolvedMatchRules = null,
    restTimeMinutes = null,
    pointsToVictory = emptyList(),
)

private fun Event.withEditorEventTypeInvariants(): Event = when (eventType) {
    EventType.WEEKLY_EVENT -> withoutMatchGenerationConfiguration()
        .copy(isAutomatedScheduling = true)
    EventType.TRYOUT -> withoutMatchGenerationConfiguration()
        .copy(
            isAutomatedScheduling = false,
            teamSignup = false,
            noFixedEndDateTime = false,
            staffingPriority = com.razumly.mvp.core.data.dataTypes.StaffingPriority.FULL_COVERAGE_WITH_CONFLICTS_ALLOWED,
            doTeamsOfficiate = false,
            teamOfficialsMaySwap = false,
            teamCheckInMode = TeamCheckInMode.OFF,
            teamCheckInOpenMinutesBefore = 60,
            allowMatchRosterEdits = false,
            allowTemporaryMatchPlayers = false,
            autoCreatePointMatchIncidents = false,
            officialIds = emptyList(),
            officialPositions = emptyList(),
            eventOfficials = emptyList(),
        )
    EventType.EVENT -> withoutMatchGenerationConfiguration()
    else -> this
}
private fun EventEditorSnapshotDto.toCanonicalState(operationId: String?): EventEditorCanonicalState {
    val eventId = eventId.normalizedIdOrNull() ?: "editor-create-${operationId ?: "session"}"
    val protectedHistory = scheduleState.hasProtectedHistory
    val immutableFields = immutable.fieldNames
        .map(String::trim)
        .filter(String::isNotBlank)
        .toSet()
    val event = draft.toEvent(eventId).copy(
        sourceType = provenance?.sourceType ?: scheduleState.sourceType,
        sourceId = provenance?.sourceId,
        sourceUrl = provenance?.sourceUrl,
        capabilities = capabilities.toDomain(),
        eventTypeLocked = protectedHistory || immutableFields.contains("eventType"),
        registrationUnitLocked = immutableFields.contains("teamSignup"),
        eventTypeHasProtectedHistory = protectedHistory,
    )
    val fallbackStart = draft.basics.start
    val divisionFieldIds = draft.competition.divisionFieldIds
    return EventEditorCanonicalState(
        event = event,
        fields = draft.resources.fields
            .mapNotNull(EventEditorFieldDto::toDomain)
            .withDivisionAssignments(divisionFieldIds),
        timeSlots = draft.resources.timeSlots.mapNotNull { slot -> slot.toDomain(fallbackStart) },
        leagueScoringConfig = draft.competition.leagueScoringConfig
            ?.takeIf { event.eventType == EventType.LEAGUE }
            ?.toLeagueScoringConfigOrNull(),
        questions = draft.registration.questions.map(EventEditorQuestionDto::toDomain),
        pendingStaffInvites = draft.staff.pendingInvites.map(EventEditorStaffInviteDto::toDomain),
        playoffDivisionDetails = draft.competition.playoffDivisionDetails
            .takeIf {
                event.eventType == EventType.LEAGUE || event.eventType == EventType.TOURNAMENT
            }
            .orEmpty()
            .map(EventEditorDivisionDetailDto::toDomain),
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
    preserveEventTypeConfiguration: Boolean = false,
) = existing.copy(
    teamSignup = if (eventType == EventType.TRYOUT && !preserveEventTypeConfiguration) {
        false
    } else if (teamSignup != baseline.teamSignup) {
        teamSignup
    } else {
        existing.teamSignup
    },
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
    preserveEventTypeConfiguration: Boolean = false,
): EventEditorScheduleDto {
    if (preserveEventTypeConfiguration && isAutomatedScheduling == baseline.isAutomatedScheduling &&
        noFixedEndDateTime == baseline.noFixedEndDateTime && end == baseline.end
    ) return existing
    val normalizedAutomatedScheduling = normalizeAutomatedSchedulingForEventType(
        eventType,
        isAutomatedScheduling,
    )
    val effectiveNoFixedEndDateTime =
        noFixedEndDateTime && eventType in setOf(EventType.LEAGUE, EventType.TOURNAMENT, EventType.WEEKLY_EVENT)
    val generatedEndMustBeCleared =
        existing.mode.trim().uppercase() == "GENERATED_END" &&
            !effectiveNoFixedEndDateTime
    val weeklyGeneratedEndMustBeNormalized =
        eventType == EventType.WEEKLY_EVENT &&
            effectiveNoFixedEndDateTime &&
            (
                existing.mode.trim().uppercase() != "GENERATED_END" ||
                    existing.generatedScheduleEnd != null ||
                    existing.endConstraint != null
                )
    val modeChanged = effectiveNoFixedEndDateTime != baseline.noFixedEndDateTime
    val endChanged = end != baseline.end
    val schedulingChanged = normalizedAutomatedScheduling != existing.isAutomatedScheduling
    if (
        !modeChanged &&
        !endChanged &&
        !schedulingChanged &&
        !generatedEndMustBeCleared &&
        !weeklyGeneratedEndMustBeNormalized
    ) {
        return existing
    }

    val withAutomatedScheduling = existing.copy(
        isAutomatedScheduling = normalizedAutomatedScheduling,
    )
    return when {
        effectiveNoFixedEndDateTime -> withAutomatedScheduling.copy(
            mode = "GENERATED_END",
            endConstraint = null,
            generatedScheduleEnd = when {
                eventType == EventType.WEEKLY_EVENT -> null
                existing.mode == "GENERATED_END" -> existing.generatedScheduleEnd
                else -> end.toString()
            },
        )
        else -> withAutomatedScheduling.copy(
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
    val existingRegularById = existing.divisionDetails.associateBy { detail ->
        detail.id.normalizedId()
    }
    val existingPlayoffById = existing.playoffDivisionDetails.associateBy { detail ->
        detail.id.normalizedId()
    }
    val currentRegularDetails = divisionDetails.filterNot { it.kind?.equals("PLAYOFF", ignoreCase = true) == true }
    val baselineRegularDetails = baseline.divisionDetails.filterNot {
        it.kind?.equals("PLAYOFF", ignoreCase = true) == true
    }
    val baselineRegularDetailsById = baselineRegularDetails.associateBy { detail ->
        detail.id.normalizedId()
    }
    val currentDetailsById = divisionDetails.associateBy { detail -> detail.id.normalizedId() }
    val routedPlayoffDetails = linkedMapOf<String, DivisionDetail>()
    playoffDivisionDetails.forEach { playoffDetail ->
        val editedDetail = currentDetailsById[playoffDetail.id.normalizedId()]
        val routedDetail = when {
            editedDetail == null -> playoffDetail
            editedDetail.kind?.equals("PLAYOFF", ignoreCase = true) == true -> editedDetail
            else -> editedDetail.copy(
                kind = "PLAYOFF",
                isSystemGenerated = playoffDetail.isSystemGenerated,
                playoffPlacementDivisionIds = playoffDetail.playoffPlacementDivisionIds,
                teamIds = playoffDetail.teamIds,
            )
        }
        routedPlayoffDetails[playoffDetail.id.normalizedId()] = routedDetail
    }
    divisionDetails
        .filter { detail -> detail.kind?.equals("PLAYOFF", ignoreCase = true) == true }
        .forEach { detail -> routedPlayoffDetails[detail.id.normalizedId()] = detail }
    val baselinePlayoffDetails = baseline.divisionDetails.filter {
        it.kind?.equals("PLAYOFF", ignoreCase = true) == true
    }
    val baselinePlayoffDetailsById = baselinePlayoffDetails.associateBy { detail ->
        detail.id.normalizedId()
    }
    val isCurrentBracketCountEnabled = isBracketTeamCountEnabled(eventType, includePlayoffs)
    val currentPlayoffTeamCount = if (isCurrentBracketCountEnabled) {
        playoffTeamCount ?: MIN_BRACKET_TEAM_COUNT
    } else {
        playoffTeamCount
    }
    val currentRegularDetailsForDto = currentRegularDetails.map { detail ->
        if (isCurrentBracketCountEnabled && detail.playoffTeamCount == null) {
            detail.copy(
                playoffTeamCount = if (singleDivision) {
                    currentPlayoffTeamCount
                } else {
                    MIN_BRACKET_TEAM_COUNT
                },
            )
        } else {
            detail
        }
    }
    val currentPlayoffDetailsForDto = routedPlayoffDetails.values.map { detail ->
        if (isCurrentBracketCountEnabled && detail.playoffTeamCount == null) {
            detail.copy(playoffTeamCount = MIN_BRACKET_TEAM_COUNT)
        } else {
            detail
        }
    }
    val isBaselineBracketCountEnabled = isBracketTeamCountEnabled(
        baseline.eventType,
        baseline.includePlayoffs,
    )
    val baselinePlayoffTeamCount = if (isBaselineBracketCountEnabled) {
        baseline.playoffTeamCount ?: MIN_BRACKET_TEAM_COUNT
    } else {
        baseline.playoffTeamCount
    }
    val baselineRegularDetailsForDto = baselineRegularDetails.map { detail ->
        if (isBaselineBracketCountEnabled && detail.playoffTeamCount == null) {
            detail.copy(
                playoffTeamCount = if (baseline.singleDivision) {
                    baselinePlayoffTeamCount
                } else {
                    MIN_BRACKET_TEAM_COUNT
                },
            )
        } else {
            detail
        }
    }
    val baselinePlayoffDetailsForDto = baselinePlayoffDetails.map { detail ->
        if (isBaselineBracketCountEnabled && detail.playoffTeamCount == null) {
            detail.copy(playoffTeamCount = MIN_BRACKET_TEAM_COUNT)
        } else {
            detail
        }
    }
    val isRegularBracketCountSerializationRequired =
        isCurrentBracketCountEnabled && currentRegularDetailsForDto.any { detail ->
            existingRegularById[detail.id.normalizedId()]?.playoffTeamCount != detail.playoffTeamCount?.toDouble()
        }
    val isPlayoffBracketCountSerializationRequired =
        isCurrentBracketCountEnabled && currentPlayoffDetailsForDto.any { detail ->
            existingPlayoffById[detail.id.normalizedId()]?.playoffTeamCount != detail.playoffTeamCount?.toDouble()
        }
    val regularDetailsChanged =
        currentRegularDetailsForDto != baselineRegularDetailsForDto ||
            isRegularBracketCountSerializationRequired
    val normalizedPlayoffDetailsChanged =
        playoffDivisionDetailsChanged ||
            currentPlayoffDetailsForDto != baselinePlayoffDetailsForDto ||
            isPlayoffBracketCountSerializationRequired
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
            currentRegularDetailsForDto.map { detail ->
                detail.toDto(
                    existing = existingRegularById[detail.id.normalizedId()],
                    baseline = baselineRegularDetailsById[detail.id.normalizedId()],
                )
            }
        } else {
            existing.divisionDetails
        },
        playoffDivisionDetails = if (normalizedPlayoffDetailsChanged) {
            currentPlayoffDetailsForDto.map { detail ->
                detail.toDto(
                    existing = existingPlayoffById[detail.id.normalizedId()],
                    baseline = baselinePlayoffDetailsById[detail.id.normalizedId()],
                )
            }
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

private fun EventEditorCompetitionDto.withoutMatchGenerationConfiguration(
    preserveDivisionFieldIds: Boolean = false,
): EventEditorCompetitionDto =
    copy(
        divisionFieldIds = if (preserveDivisionFieldIds) divisionFieldIds else emptyMap(),
        divisionDetails = divisionDetails.map { detail ->
            detail.copy(
                playoffTeamCount = null,
                poolCount = null,
                poolTeamCount = null,
                phaseSettings = null,
                playoffPlacementDivisionIds = emptyList(),
                playoffConfig = null,
                gamesPerOpponent = null,
                restTimeMinutes = null,
                usesSets = null,
                matchDurationMinutes = null,
                setDurationMinutes = null,
                setsPerMatch = null,
                pointsToVictory = emptyList(),
            )
        },
        playoffDivisionDetails = emptyList(),
        winnerSetCount = null,
        loserSetCount = null,
        doubleElimination = false,
        includePlayoffs = false,
        splitLeaguePlayoffDivisions = false,
        playoffTeamCount = null,
        pointsToVictory = emptyList(),
        winnerBracketPointsToVictory = emptyList(),
        loserBracketPointsToVictory = emptyList(),
        usesSets = false,
        setsPerMatch = null,
        setDurationMinutes = null,
        restTimeMinutes = null,
        matchDurationMinutes = null,
        gamesPerOpponent = null,
        matchRulesOverride = null,
        leagueScoringConfig = null,
    )

private fun EventEditorCompetitionDto.withoutTryoutMatchGenerationConfiguration(): EventEditorCompetitionDto {
    val sanitized = withoutMatchGenerationConfiguration(preserveDivisionFieldIds = true)
    return sanitized.copy(
        divisionDetails = sanitized.divisionDetails.map { detail ->
            detail.copy(
                poolPlay = null,
                standingsOverrides = null,
                standingsConfirmedAt = null,
                standingsConfirmedBy = null,
                teamIds = emptyList(),
            )
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
    sportIds = sportIds.map(String::trim).filter(String::isNotBlank).distinct(),
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
    preserveEventTypeConfiguration: Boolean = false,
): EventEditorStaffDto {
    val isTryout = eventType == EventType.TRYOUT && !preserveEventTypeConfiguration
    fun tryoutStaffTypes(staffTypes: List<String>): List<String> = staffTypes
        .map(String::trim)
        .map(String::uppercase)
        .filter { staffType -> staffType == "HOST" }
        .distinct()
    val canonicalPendingInvites = if (isTryout) {
        pendingStaffInvites.mapNotNull { invite ->
            val staffTypes = tryoutStaffTypes(invite.staffTypes)
            staffTypes.takeIf { it.isNotEmpty() }?.let { invite.copy(staffTypes = it) }
        }
    } else {
        pendingStaffInvites
    }
    return existing.copy(
        staffingPriority = if (isTryout) {
            com.razumly.mvp.core.data.dataTypes.StaffingPriority.FULL_COVERAGE_WITH_CONFLICTS_ALLOWED.name
        } else if (preserveEventTypeConfiguration && staffingPriority == baseline.staffingPriority) {
            existing.staffingPriority
        } else {
            staffingPriority.name
        },
        doTeamsOfficiate = if (isTryout) false else if (
            preserveEventTypeConfiguration && doTeamsOfficiate == baseline.doTeamsOfficiate
        ) existing.doTeamsOfficiate else doTeamsOfficiate == true,
        teamOfficialsMaySwap = if (isTryout) {
            false
        } else if (teamOfficialsMaySwap != baseline.teamOfficialsMaySwap) {
            teamOfficialsMaySwap == true
        } else {
            existing.teamOfficialsMaySwap
        },
        teamCheckInMode = if (isTryout) {
            TeamCheckInMode.OFF.name
        } else if (teamCheckInMode != baseline.teamCheckInMode) {
            teamCheckInMode.name
        } else {
            existing.teamCheckInMode
        },
        teamCheckInOpenMinutesBefore = if (isTryout) {
            60
        } else if (teamCheckInOpenMinutesBefore != baseline.teamCheckInOpenMinutesBefore) {
            teamCheckInOpenMinutesBefore
        } else {
            existing.teamCheckInOpenMinutesBefore
        },
        allowMatchRosterEdits = if (isTryout) {
            false
        } else if (allowMatchRosterEdits != baseline.allowMatchRosterEdits) {
            allowMatchRosterEdits
        } else {
            existing.allowMatchRosterEdits
        },
        allowTemporaryMatchPlayers = if (isTryout) {
            false
        } else if (allowTemporaryMatchPlayers != baseline.allowTemporaryMatchPlayers) {
            allowTemporaryMatchPlayers
        } else {
            existing.allowTemporaryMatchPlayers
        },
        autoCreatePointMatchIncidents = if (isTryout) {
            false
        } else if (autoCreatePointMatchIncidents != baseline.autoCreatePointMatchIncidents) {
            autoCreatePointMatchIncidents
        } else {
            existing.autoCreatePointMatchIncidents
        },
        officialIds = if (isTryout) {
            emptyList()
        } else if (officialIds != baseline.officialIds) {
            officialIds
        } else {
            existing.officialIds
        },
        officialPositions = if (isTryout) {
            emptyList()
        } else if (officialPositions != baseline.officialPositions) {
            officialPositions.map { position ->
                EventEditorOfficialPositionDto(position.id, position.name, position.count, position.order)
            }
        } else {
            existing.officialPositions
        },
        eventOfficials = if (isTryout) {
            emptyList()
        } else if (eventOfficials != baseline.eventOfficials) {
            eventOfficials.map { official ->
                EventEditorOfficialDto(official.id, official.userId, official.positionIds, official.fieldIds, official.isActive)
            }
        } else {
            existing.eventOfficials
        },
        assistantHostIds = if (assistantHostIds != baseline.assistantHostIds) assistantHostIds else existing.assistantHostIds,
        pendingInvites = if (pendingStaffInvitesChanged) {
            canonicalPendingInvites.map { invite ->
                val existingInvite = existing.pendingInvites.firstOrNull { row -> row.id == invite.id }
                val projected = existingInvite?.toDto(invite) ?: EventEditorStaffInviteDto(
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
                if (isTryout) {
                    projected.copy(staffTypes = tryoutStaffTypes(projected.staffTypes))
                } else {
                    projected
                }
            }
        } else if (isTryout) {
            existing.pendingInvites.mapNotNull { invite ->
                val staffTypes = tryoutStaffTypes(invite.staffTypes)
                staffTypes.takeIf { it.isNotEmpty() }?.let { invite.copy(staffTypes = it) }
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
    preserveEventTypeConfiguration: Boolean = false,
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
    val baselineFieldsById = baseline.fields.associateBy { it.id }

    val nextResources = resources.copy(
        fieldIds = if (mutation.event.fieldIds != baseline.event.fieldIds) mutation.event.fieldIds else resources.fieldIds,
        fields = if (fieldsChanged) {
            mutation.fields.map { field ->
                val existing = existingFieldsById[field.id]
                val baselineField = baselineFieldsById[field.id]
                if (existing != null && field.copy(fieldNumber = 0, divisions = emptyList()) ==
                    baselineField?.copy(fieldNumber = 0, divisions = emptyList())) existing
                else field.toDto(existing)
            }
        } else {
            resources.fields
        },
        timeSlotIds = if (mutation.event.timeSlotIds != baseline.event.timeSlotIds) {
            mutation.event.timeSlotIds
        } else {
            resources.timeSlotIds
        },
        timeSlots = if (slotsChanged) {
            mutation.timeSlots.map { slot ->
                val existing = existingSlotsById[slot.id]
                if (existing != null && slot == baseline.timeSlots.firstOrNull { it.id == slot.id }) existing
                else slot.toDto(existing)
            }
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
    ).let { projected ->
        if (preserveEventTypeConfiguration || mutation.event.eventType == EventType.LEAGUE ||
            mutation.event.eventType == EventType.TOURNAMENT
        ) {
            projected
        } else if (mutation.event.eventType == EventType.TRYOUT) {
            projected.withoutTryoutMatchGenerationConfiguration()
        } else {
            projected.withoutMatchGenerationConfiguration()
        }
    }

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
        participation = mutation.event.toParticipationDto(participation, baseline.event, preserveEventTypeConfiguration),
        registration = nextRegistration,
        competition = nextCompetition,
        schedule = mutation.event.toScheduleDto(schedule, baseline.event, preserveEventTypeConfiguration),
        resources = nextResources,
        staff = mutation.event.toStaffDto(
            existing = staff,
            baseline = baseline.event,
            pendingStaffInvites = mutation.pendingStaffInvites,
            pendingStaffInvitesChanged = invitesChanged,
            preserveEventTypeConfiguration = preserveEventTypeConfiguration,
        ),
    )
}

object EventEditorSessionMapper {
    fun fromCreateBootstrap(bootstrap: EventEditorCreateBootstrapDto): EventEditorSession {
        validateSnapshot(bootstrap.snapshot, expectedMode = "CREATE")
        require(isSupportedEventEditorContractVersion(bootstrap.contractVersion)) {
            unsupportedVersionMessage(bootstrap.contractVersion)
        }
        require(bootstrap.createOperationId.normalizedId().isNotBlank()) { "Create bootstrap did not include an operation ID." }
        val canonical = bootstrap.snapshot.toCanonicalState(bootstrap.createOperationId)
        val catalogFields = bootstrap.snapshot.catalogs.fields.mapNotNull { rawField ->
            runCatching {
                jsonMVP.decodeFromJsonElement<EventEditorFieldDto>(rawField)
            }.getOrNull()
                ?.takeIf { field -> field.archivedAt.isNullOrBlank() }
                ?.toDomain()
        }
        return EventEditorSession(
            snapshot = bootstrap.snapshot,
            canonicalState = canonical,
            baseline = canonical,
            createOperationId = bootstrap.createOperationId,
            catalogFields = catalogFields,
        )
    }

    fun fromEditSnapshot(snapshot: EventEditorSnapshotDto): EventEditorSession {
        validateSnapshot(snapshot, expectedMode = "EDIT")
        val canonical = snapshot.toCanonicalState(operationId = null)
        return EventEditorSession(snapshot = snapshot, canonicalState = canonical, baseline = canonical)
    }
    private fun requireValidEndPolicy(event: Event, baseline: Event) {
        if (!event.noFixedEndDateTime) {
            require(event.end > event.start) { "Planned End must be after the Event start." }
            return
        }
        val supportsPolicy = event.eventType in setOf(EventType.LEAGUE, EventType.TOURNAMENT, EventType.WEEKLY_EVENT)
        require(supportsPolicy) { "This Event Type requires a Planned End." }
        require(event.eventType == EventType.WEEKLY_EVENT || event.isAutomatedScheduling || baseline.noFixedEndDateTime) {
            "Set End From Schedule requires Automated Scheduling."
        }
    }

    fun toCreateCommand(session: EventEditorSession, mutation: EventEditorMutation): PendingEventCreate {
        val operationId = session.createOperationId?.normalizedIdOrNull()
            ?: error("Create editor session did not include an operation ID.")
        require(session.snapshot.mode == "CREATE") { "Create command requires a create editor session." }
        val draft = session.snapshot.draft.withMutation(session.baseline, mutation.canonicalState)
        val eventType = runCatching { EventType.valueOf(draft.basics.eventType.trim().uppercase()) }
            .getOrDefault(EventType.EVENT)
        val isAutomatedScheduling = normalizeAutomatedSchedulingForEventType(
            eventType,
            draft.schedule.isAutomatedScheduling,
        )
        if (
            (eventType == EventType.LEAGUE || eventType == EventType.TOURNAMENT) &&
            !isAutomatedScheduling
        ) {
            val start = parseEditorInstant(
                draft.basics.start,
                draft.basics.timeZone,
                Instant.DISTANT_PAST,
            )
            val plannedEnd = draft.schedule.endConstraint
                ?.takeIf(String::isNotBlank)
                ?.let { end ->
                    parseEditorInstant(end, draft.basics.timeZone, Instant.DISTANT_PAST)
                }
            require(
                draft.schedule.mode.trim().uppercase() == "FIXED_END" &&
                    plannedEnd != null &&
                    plannedEnd > start,
            ) {
                "Unscheduled League/Tournament creation requires a planned fixed end."
            }
        }
        val completionMode = if (
            (eventType == EventType.LEAGUE || eventType == EventType.TOURNAMENT) &&
            isAutomatedScheduling
        ) {
            EventEditorCreateCompletionMode.CREATE_AND_BUILD_SCHEDULE
        } else {
            EventEditorCreateCompletionMode.CREATE_ONLY
        }
        val command = EventEditorCreateCommandDto(
            contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
            createOperationId = operationId,
            expectedRevisions = EventEditorExpectedCreateRevisionsDto(
                editorRevision = session.snapshot.editorRevision,
                staffRevision = session.snapshot.staffRevision,
                scheduleRevision = session.snapshot.scheduleState.revision,
            ),
            draft = draft,
            completion = EventEditorCreateCompletionDto(mode = completionMode),
            hasScheduleProposalSupport = completionMode == EventEditorCreateCompletionMode.CREATE_AND_BUILD_SCHEDULE,
        )
        return PendingEventCreate(command = command, bootstrapSnapshot = session.snapshot)
    }

    fun toSaveCommand(session: EventEditorSession, mutation: EventEditorMutation): com.razumly.mvp.core.network.dto.EventEditorSaveCommandDto {
        require(session.snapshot.mode == "EDIT") { "Save command requires an edit editor session." }
        val desired = mutation.canonicalState
        val destinationChanged = desired.event.affiliateUrl != session.baseline.event.affiliateUrl
        // A registration change must not reset configuration from the server's Event Type.
        val draft = session.snapshot.draft.withMutation(
            session.baseline,
            desired,
            preserveEventTypeConfiguration = destinationChanged && desired.event.eventType == session.baseline.event.eventType,
        )
        requireValidEndPolicy(desired.event, session.baseline.event)
        val transition = EventEditorSaveScheduleTransitionDto(mode = EventEditorScheduleTransitionMode.PRESERVE)
        return com.razumly.mvp.core.network.dto.EventEditorSaveCommandDto(
            contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
            editorRevision = session.snapshot.editorRevision,
            staffRevision = session.snapshot.staffRevision,
            draft = draft,
            scheduleTransition = transition,
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
        require(isSupportedEventEditorContractVersion(snapshot.contractVersion)) {
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
