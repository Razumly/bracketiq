package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.DEFAULT_EVENT_SEED_COLOR_ARGB
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.data.dataTypes.MatchIncidentMVP
import com.razumly.mvp.core.data.dataTypes.MatchOfficialAssignment
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.EventTimeSlotCacheEntry
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.toTimeSlot
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.analytics.AnalyticsEvent
import com.razumly.mvp.core.analytics.AnalyticsTracker
import dev.icerock.moko.geo.LatLng
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.EventApiDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCommandDto
import com.razumly.mvp.core.network.dto.EventEditorDraftDto
import com.razumly.mvp.core.network.dto.EventEditorCreateProposalGraphDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceAcceptedResultDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphEventDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphMatchDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceOperation
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceRequestDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseDto
import com.razumly.mvp.core.network.dto.EventEditorSaveCommandDto
import com.razumly.mvp.core.network.dto.EventEditorBootstrapQueryDto
import com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorAcceptMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.MatchApiDto
import com.razumly.mvp.core.network.dto.MatchSegmentApiDto
import com.razumly.mvp.core.network.dto.EventEditorRejectMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.TeamApiDto
import com.razumly.mvp.core.network.dto.CreateEventTemplateRequestDto
import com.razumly.mvp.core.network.dto.EventParticipantsSnapshotResponseDto
import com.razumly.mvp.core.network.dto.EventTemplateResponseDto
import com.razumly.mvp.core.network.dto.ProfileScheduleResponseDto
import com.razumly.mvp.core.network.dto.toEventsOrThrow
import com.razumly.mvp.core.network.dto.ProfileScheduleNextActionResponseDto
import com.razumly.mvp.core.network.dto.StandingsConfirmRequestDto
import com.razumly.mvp.core.network.dto.StandingsConfirmResponseDto
import com.razumly.mvp.core.network.dto.StandingsPatchRequestDto
import com.razumly.mvp.core.network.dto.StandingsPointOverrideDto
import com.razumly.mvp.core.network.dto.StandingsResponseDto
import kotlinx.serialization.json.JsonElement
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import com.razumly.mvp.core.util.jsonMVP
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlin.time.Clock
import kotlin.time.Duration.Companion.days
import kotlin.time.Instant



private const val MY_SCHEDULE_PAGE_SIZE = 200
private const val MY_SCHEDULE_MAX_PAGE_COUNT = 100
private const val MY_SCHEDULE_PAST_DAYS = 90
private const val MY_SCHEDULE_FUTURE_DAYS = 366

private fun Event.analyticsProperties(): Map<String, String> = buildMap {
    put("event_id", id)
    put("event_type", eventType.name)
    put("team_signup", teamSignup.toString())
    organizationId?.trim()?.takeIf(String::isNotBlank)?.let { put("organization_id", it) }
    sportIds.firstOrNull()?.trim()?.takeIf(String::isNotBlank)?.let { put("sport_id", it) }
}

internal fun mergeScheduleMatchProjection(
    scheduleMatch: MatchMVP,
    cachedMatch: MatchMVP?,
): MatchMVP {
    if (cachedMatch == null) return scheduleMatch

    // The schedule endpoint intentionally returns a narrow card projection. Do not let
    // that partial response erase detailed state already fetched from the match endpoint.
    return scheduleMatch.copy(
        matchRulesSnapshot = scheduleMatch.matchRulesSnapshot ?: cachedMatch.matchRulesSnapshot,
        resolvedMatchRules = scheduleMatch.resolvedMatchRules ?: cachedMatch.resolvedMatchRules,
        segments = scheduleMatch.segments.ifEmpty { cachedMatch.segments },
        incidents = scheduleMatch.incidents.ifEmpty { cachedMatch.incidents },
    )
}

private fun JsonElement.toMaintenanceIncidentMetadataString(): String = when (this) {
    is JsonPrimitive -> content
    else -> toString()
}

private fun JsonObject.decodeMaintenanceIncidentOrThrow(): MatchIncidentMVP {
    val metadata = this["metadata"]
    if (metadata !is JsonObject) {
        return decodeJsonOrThrow()
    }
    val normalizedMetadata = JsonObject(
        metadata.mapValues { (_, value) ->
            JsonPrimitive(value.toMaintenanceIncidentMetadataString())
        },
    )
    return JsonObject(toMutableMap().apply { put("metadata", normalizedMetadata) })
        .decodeJsonOrThrow()
}

private fun EventEditorMatchProjectionDto.toMatchOrThrow(fallbackMatchId: Int? = null): MatchMVP =
    MatchApiDto(
        id = id.trim().takeIf(String::isNotBlank),
        matchId = matchId ?: fallbackMatchId,
        team1Id = team1Id,
        team2Id = team2Id,
        team1Seed = team1Seed,
        team2Seed = team2Seed,
        eventId = eventId.trim().takeIf(String::isNotBlank),
        officialId = officialId,
        fieldId = fieldId,
        status = status,
        resultStatus = resultStatus,
        resultType = resultType,
        actualStart = actualStart,
        actualEnd = actualEnd,
        statusReason = statusReason,
        winnerEventTeamId = winnerEventTeamId,
        matchRulesSnapshot = matchRulesSnapshot?.decodeJsonOrThrow<ResolvedMatchRulesMVP>(),
        resolvedMatchRules = resolvedMatchRules?.decodeJsonOrThrow<ResolvedMatchRulesMVP>(),
        segments = segments.map { segment -> segment.decodeJsonOrThrow<MatchSegmentApiDto>() },
        incidents = incidents.map { incident -> incident.decodeMaintenanceIncidentOrThrow() },
        start = start,
        end = end,
        placementState = placementState,
        phase = phase,
        sourceDivisionId = sourceDivisionId,
        phaseDivisionId = phaseDivisionId,
        division = division,
        team1Points = team1Points.map(Double::toInt),
        team2Points = team2Points.map(Double::toInt),
        side = side,
        losersBracket = losersBracket,
        winnerNextMatchId = winnerNextMatchId,
        loserNextMatchId = loserNextMatchId,
        previousLeftId = previousLeftId,
        previousRightId = previousRightId,
        officialCheckedIn = officialCheckedIn,
        officialIds = officialIds.map { assignment ->
            assignment.decodeJsonOrThrow<MatchOfficialAssignment>()
        },
        teamOfficialId = teamOfficialId,
        locked = locked,
    ).toMatchOrNull()
        ?: error("Editor schedule response contained a match without canonical identity: $id")

private fun EventEditorMaintenanceGraphMatchDto.toMatchOrThrow(
    fallbackMatchId: Int? = null,
): MatchMVP = MatchApiDto(
    id = id.trim().takeIf(String::isNotBlank),
    matchId = matchId ?: fallbackMatchId,
    team1Id = team1Id,
    team2Id = team2Id,
    team1Seed = team1Seed,
    team2Seed = team2Seed,
    eventId = eventId.trim().takeIf(String::isNotBlank),
    officialId = officialIds.firstOrNull { assignment ->
        assignment.holderType.equals("OFFICIAL", ignoreCase = true)
    }?.userId,
    fieldId = fieldId,
    status = status,
    resultStatus = resultStatus,
    resultType = resultType,
    actualStart = actualStart,
    actualEnd = actualEnd,
    statusReason = statusReason,
    winnerEventTeamId = winnerEventTeamId,
    matchRulesSnapshot = (matchRulesSnapshot as? JsonObject)
        ?.decodeJsonOrThrow<ResolvedMatchRulesMVP>(),
    resolvedMatchRules = (resolvedMatchRules as? JsonObject)
        ?.decodeJsonOrThrow<ResolvedMatchRulesMVP>(),
    segments = segments.map { segment -> segment.decodeJsonOrThrow<MatchSegmentApiDto>() },
    incidents = incidents.map { incident -> incident.decodeMaintenanceIncidentOrThrow() },
    start = start,
    end = end,
    placementState = placementState,
    phase = phase,
    sourceDivisionId = sourceDivisionId,
    phaseDivisionId = phaseDivisionId,
    division = division,
    team1Points = team1Points.map(Double::toInt),
    team2Points = team2Points.map(Double::toInt),
    side = side,
    losersBracket = losersBracket,
    winnerNextMatchId = winnerNextMatchId,
    loserNextMatchId = loserNextMatchId,
    previousLeftId = previousLeftId,
    previousRightId = previousRightId,
    officialCheckedIn = officialCheckedIn,
    officialIds = officialAssignments.map { assignment ->
        jsonMVP.encodeToJsonElement(assignment).jsonObject
            .decodeJsonOrThrow<MatchOfficialAssignment>()
    },
    teamOfficialId = teamOfficialId,
    locked = locked,
).toMatchOrNull()
    ?: error("Accepted maintenance proposal contained an invalid Match graph.")

private fun List<EventEditorMaintenanceGraphMatchDto>.toCanonicalMaintenanceMatchesOrThrow():
    List<MatchMVP> {
    val stableMatchIds = stableGraphMatchIds(map(EventEditorMaintenanceGraphMatchDto::matchId))
    return mapIndexed { index, match ->
        match.toMatchOrThrow(fallbackMatchId = stableMatchIds[index])
    }
}

private fun stableGraphMatchIds(explicitMatchIds: List<Int?>): List<Int> {
    val occupied = explicitMatchIds.filterNotNull().toMutableSet()
    var nextFallback = 1
    return explicitMatchIds.map { explicitMatchId ->
        explicitMatchId ?: run {
            while (nextFallback in occupied) {
                require(nextFallback < Int.MAX_VALUE) {
                    "Accepted Match graph exhausted stable ordinal ids."
                }
                nextFallback += 1
            }
            occupied += nextFallback
            nextFallback++
            nextFallback - 1
        }
    }
}

private fun List<EventEditorMatchProjectionDto>.toMaintenanceMatchesOrThrow(): List<MatchMVP> {
    val stableMatchIds = stableGraphMatchIds(map(EventEditorMatchProjectionDto::matchId))
    return mapIndexed { index, matchDto ->
        matchDto.toMatchOrThrow(fallbackMatchId = stableMatchIds[index])
    }
}

private fun List<MatchApiDto>.toAcceptedMatchesOrThrow(): List<MatchMVP> {
    val stableMatchIds = stableGraphMatchIds(map(MatchApiDto::matchId))
    return mapIndexed { index, matchDto ->
        matchDto.toMatchOrNull(fallbackMatchId = stableMatchIds[index])
            ?: error("Accepted schedule proposal contained an invalid Match graph.")
    }
}

private fun List<EventEditorMatchProjectionDto>.toScheduleMatchesOrThrow(): List<MatchMVP> {
    val stableMatchIds = stableGraphMatchIds(map(EventEditorMatchProjectionDto::matchId))
    return mapIndexed { index, matchDto ->
        matchDto.toMatchOrThrow(fallbackMatchId = stableMatchIds[index])
    }
}

private fun com.razumly.mvp.core.network.dto.EventEditorSaveResultDto.matchesForPersistence(
    expectedEventId: String,
    useGraph: Boolean = true,
): List<MatchMVP>? {
    val normalizedEventId = expectedEventId.trim().takeIf(String::isNotBlank)
        ?: error("Event id is required.")
    graph?.let { graphPayload ->
        require(graphPayload.event.id?.trim() == normalizedEventId) {
            "Editor save response contained a graph for the wrong Event."
        }
    }
    val graphMatches = graph?.matches?.toAcceptedMatchesOrThrow()
    graphMatches?.let { matches ->
        require(matches.all { match -> match.eventId == normalizedEventId }) {
            "Editor save response contained a Match graph for the wrong Event."
        }
    }
    val matches = when {
        useGraph && graphMatches != null -> graphMatches
        scheduleOutcome.matches.isNotEmpty() -> scheduleOutcome.matches.toScheduleMatchesOrThrow()
        scheduleOutcome.status == EventEditorScheduleOutcomeStatus.DELETED -> emptyList()
        else -> return null
    }
    require(matches.all { match -> match.eventId == normalizedEventId }) {
        "Editor save response contained a Match graph for the wrong Event."
    }
    return matches
}

private fun MatchMVP.mergeAcceptedMaintenanceStructure(graph: MatchMVP): MatchMVP = copy(
    winnerNextMatchId = graph.winnerNextMatchId,
    loserNextMatchId = graph.loserNextMatchId,
    previousLeftId = graph.previousLeftId,
    previousRightId = graph.previousRightId,
)

private fun requireResolvedMatchGraph(matches: List<MatchMVP>) {
    val matchIds = matches.map(MatchMVP::id).toSet()
    matches.forEach { match ->
        listOf(
            "winnerNextMatchId" to match.winnerNextMatchId,
            "loserNextMatchId" to match.loserNextMatchId,
            "previousLeftId" to match.previousLeftId,
            "previousRightId" to match.previousRightId,
        ).forEach { (field, referencedId) ->
            val normalizedReferencedId = referencedId?.trim()?.takeIf(String::isNotBlank)
                ?: return@forEach
            require(normalizedReferencedId in matchIds) {
                "Accepted Match ${match.id}.$field references missing Match $normalizedReferencedId."
            }
        }
    }
}


private data class AcceptedRoomRelationCache(
    val event: Event,
    val teams: List<Team>,
    val users: List<UserData>,
)
private data class AcceptedRelationHydration(
    val eventBeforeHydration: Event?,
    val relations: HydratedEventRelations,
)
private data class DecodedProposalGraph(
    val event: Event,
    val teams: List<Team>,
    val fields: List<Field>,
    val timeSlots: List<TimeSlot>,
    val matches: List<MatchMVP>,
)

private fun List<String>.normalizedAcceptedRelationIds(): List<String> = asSequence()
    .map(String::trim)
    .filter(String::isNotBlank)
    .distinct()
    .toList()

private fun String.orCanonical(canonical: String): String =
    trim().takeIf(String::isNotBlank) ?: canonical

private fun <T> List<T>.orCanonical(canonical: List<T>): List<T> =
    if (isEmpty()) canonical else this

private fun Event.mergeAcceptedMaintenanceProjection(
    graph: Event,
    graphFields: List<Field>,
): Event {
    if (id == graph.id && this == graph) return this
    val merged = copy(
        id = graph.id,
        name = graph.name.orCanonical(name),
        description = graph.description.orCanonical(description),
        location = graph.location.orCanonical(location),
        address = graph.address ?: address,
        start = graph.start.takeUnless { start -> start == Instant.DISTANT_PAST } ?: start,
        end = graph.end.takeUnless { end -> end == Instant.DISTANT_PAST } ?: end,
        timeZone = if (
            graph.timeZone.equals("UTC", ignoreCase = true) &&
            !timeZone.equals("UTC", ignoreCase = true)
        ) {
            timeZone
        } else {
            graph.timeZone
        },
        state = if (
            graph.state.equals("UNPUBLISHED", ignoreCase = true) &&
            !state.equals("UNPUBLISHED", ignoreCase = true)
        ) {
            state
        } else {
            graph.state
        },
        divisions = graph.divisions,
        divisionDetails = mergeAcceptedMaintenanceDivisionDetails(
            canonical = divisionDetails,
            graph = graph.divisionDetails,
            fields = graphFields,
        ),
        teamIds = graph.teamIds,
        fieldIds = graph.fieldIds,
        timeSlotIds = graph.timeSlotIds,
        eventType = if (
            graph.eventType == EventType.EVENT &&
            eventType != EventType.EVENT
        ) {
            eventType
        } else {
            graph.eventType
        },
        isAutomatedScheduling = isAutomatedScheduling || graph.isAutomatedScheduling,
        noFixedEndDateTime = noFixedEndDateTime || graph.noFixedEndDateTime,
        eventTypeLocked = eventTypeLocked || graph.eventTypeLocked,
        registrationUnitLocked = registrationUnitLocked || graph.registrationUnitLocked,
        eventTypeHasProtectedHistory =
            eventTypeHasProtectedHistory || graph.eventTypeHasProtectedHistory,
    )
    return merged.also { event ->
        event.nextOccurrence = graph.nextOccurrence ?: nextOccurrence
    }
}

private fun mergeAcceptedMaintenanceDivisionDetails(
    canonical: List<DivisionDetail>,
    graph: List<DivisionDetail>,
    fields: List<Field>,
): List<DivisionDetail> {
    if (graph.isEmpty()) return canonical
    val canonicalById = canonical.associateBy { detail ->
        detail.id.normalizeDivisionIdentifier()
    }
    val fieldIdsByDivision = buildMap<String, MutableList<String>> {
        fields.forEach { field ->
            val fieldId = field.id.trim().takeIf(String::isNotBlank) ?: return@forEach
            field.divisions.forEach { divisionId ->
                val normalizedDivisionId = divisionId.normalizeDivisionIdentifier()
                if (normalizedDivisionId.isBlank()) return@forEach
                val fieldIds = getOrPut(normalizedDivisionId) { mutableListOf() }
                if (fieldId !in fieldIds) fieldIds += fieldId
            }
        }
    }
    return graph.map { graphDetail ->
        val normalizedId = graphDetail.id.normalizeDivisionIdentifier()
        val canonicalDetail = canonicalById[normalizedId]
        val graphFieldIds = fieldIdsByDivision[normalizedId]
        if (canonicalDetail == null) {
            graphDetail.copy(
                fieldIds = graphFieldIds ?: graphDetail.fieldIds,
            )
        } else {
            canonicalDetail.copy(
                id = graphDetail.id,
                sourceDivisionId = graphDetail.sourceDivisionId,
                kind = graphDetail.kind,
                isSystemGenerated = graphDetail.isSystemGenerated,
                name = graphDetail.name,
                teamIds = graphDetail.teamIds,
                playoffTeamCount = graphDetail.playoffTeamCount,
                playoffPlacementDivisionIds = graphDetail.playoffPlacementDivisionIds,
                fieldIds = graphFieldIds
                    ?: graphDetail.fieldIds.takeIf { it.isNotEmpty() }
                    ?: canonicalDetail.fieldIds,
                phaseSettings = graphDetail.phaseSettings
                    .takeIf { it.isNotEmpty() }
                    ?: canonicalDetail.phaseSettings,
                gamesPerOpponent = graphDetail.gamesPerOpponent
                    ?: canonicalDetail.gamesPerOpponent,
                restTimeMinutes = graphDetail.restTimeMinutes
                    ?: canonicalDetail.restTimeMinutes,
                usesSets = graphDetail.usesSets ?: canonicalDetail.usesSets,
                matchDurationMinutes = graphDetail.matchDurationMinutes
                    ?: canonicalDetail.matchDurationMinutes,
                setDurationMinutes = graphDetail.setDurationMinutes
                    ?: canonicalDetail.setDurationMinutes,
                setsPerMatch = graphDetail.setsPerMatch ?: canonicalDetail.setsPerMatch,
                pointsToVictory = graphDetail.pointsToVictory
                    .takeIf { it.isNotEmpty() }
                    ?: canonicalDetail.pointsToVictory,
            )
        }
    }
}

private fun mergeAcceptedMaintenanceFields(
    canonical: List<Field>,
    graph: List<Field>,
): List<Field> {
    val canonicalById = canonical.associateBy { field -> field.id.trim() }
    return graph.map { graphField ->
        canonicalById[graphField.id.trim()]?.copy(
            divisions = graphField.divisions,
        ) ?: graphField
    }
}

private fun mergeAcceptedMaintenanceTimeSlots(
    canonical: List<TimeSlot>,
    graph: List<TimeSlot>,
): List<TimeSlot> {
    val canonicalById = canonical.associateBy { timeSlot -> timeSlot.id.trim() }
    return graph.map { graphSlot ->
        canonicalById[graphSlot.id.trim()]?.copy(
            divisions = graphSlot.divisions,
            scheduledFieldId = graphSlot.scheduledFieldId,
            scheduledFieldIds = graphSlot.scheduledFieldIds,
        ) ?: graphSlot
    }
}

private fun mergeAcceptedMaintenanceTeams(
    canonical: List<Team>,
    graph: List<Team>,
): List<Team> {
    val canonicalById = canonical.associateBy { team -> team.id.trim().lowercase() }
    val graphById = graph.associateBy { team -> team.id.trim().lowercase() }
    return buildList {
        canonical.forEach { canonicalTeam ->
            val graphTeam = graphById[canonicalTeam.id.trim().lowercase()]
            add(
                graphTeam?.let {
                    canonicalTeam.copy(
                        // These fields are part of the site graph and are authoritative, including
                        // empty membership arrays.
                        division = graphTeam.division,
                        name = graphTeam.name,
                        kind = graphTeam.kind,
                        captainId = graphTeam.captainId,
                        playerIds = graphTeam.playerIds,
                        playerRegistrations = graphTeam.playerRegistrations,
                        // The remaining fields are omitted by the site graph projection. Keep the
                        // canonical Room values rather than allowing DTO defaults to erase them.
                        managerId = canonicalTeam.managerId,
                        headCoachId = canonicalTeam.headCoachId,
                        coachIds = canonicalTeam.coachIds,
                        parentTeamId = canonicalTeam.parentTeamId,
                        playerRegistrationIds = canonicalTeam.playerRegistrationIds,
                        pending = canonicalTeam.pending,
                        staffAssignmentIds = canonicalTeam.staffAssignmentIds,
                        teamSize = canonicalTeam.teamSize,
                        profileImageId = canonicalTeam.profileImageId,
                        sport = canonicalTeam.sport,
                        divisionTypeId = canonicalTeam.divisionTypeId,
                        skillDivisionTypeId = canonicalTeam.skillDivisionTypeId,
                        skillDivisionTypeName = canonicalTeam.skillDivisionTypeName,
                        ageDivisionTypeId = canonicalTeam.ageDivisionTypeId,
                        ageDivisionTypeName = canonicalTeam.ageDivisionTypeName,
                        divisionGender = canonicalTeam.divisionGender,
                        organizationId = canonicalTeam.organizationId,
                        createdBy = canonicalTeam.createdBy,
                        joinPolicy = canonicalTeam.joinPolicy,
                        openRegistration = canonicalTeam.openRegistration,
                        registrationPriceCents = canonicalTeam.registrationPriceCents,
                        affiliateUrl = canonicalTeam.affiliateUrl,
                        requiredTemplateIds = canonicalTeam.requiredTemplateIds,
                        staffAssignments = canonicalTeam.staffAssignments,
                    )
                } ?: canonicalTeam,
            )
        }
        val canonicalIds = canonicalById.keys
        graph.forEach { graphTeam ->
            if (graphTeam.id.trim().lowercase() !in canonicalIds) {
                add(graphTeam)
            }
        }
    }
}

internal fun mergeAcceptedGraphDivisionDetails(
    canonical: List<DivisionDetail>,
    graph: List<DivisionDetail>,
): List<DivisionDetail> {
    if (graph.isEmpty()) return canonical
    val knownIds = canonical
        .map { detail -> detail.id.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .toMutableSet()
    return buildList {
        addAll(canonical)
        graph.forEach { detail ->
            val normalizedId = detail.id.normalizeDivisionIdentifier()
            if (normalizedId.isNotBlank() && knownIds.add(normalizedId)) {
                add(detail)
            }
        }
    }
}

internal fun mergeAcceptedGraphDivisionIds(
    canonical: List<String>,
    graph: List<String>,
): List<String> = buildList {
    val knownIds = mutableSetOf<String>()
    (canonical + graph).forEach { rawId ->
        val id = rawId.trim()
        if (id.isNotBlank() && knownIds.add(id.normalizeDivisionIdentifier())) {
            add(id)
        }
    }
}
private fun <T> mergeAcceptedGraphRows(
    canonical: List<T>,
    graph: List<T>,
    id: (T) -> String,
    mergeExisting: (canonical: T, graph: T) -> T,
): List<T> {
    if (graph.isEmpty()) return canonical
    val graphById = graph.associateBy { row -> id(row).trim() }
    val canonicalIds = canonical.map { row -> id(row).trim() }.toSet()
    return buildList {
        canonical.forEach { row ->
            add(graphById[id(row).trim()]?.let { graphRow -> mergeExisting(row, graphRow) } ?: row)
        }
        graph.forEach { row ->
            if (id(row).trim() !in canonicalIds) {
                add(row)
            }
        }
    }
}

internal fun mergeAcceptedGraphTimeSlots(
    canonical: List<TimeSlot>,
    graph: List<TimeSlot>,
): List<TimeSlot> = mergeAcceptedGraphRows(
    canonical = canonical,
    graph = graph,
    id = TimeSlot::id,
    mergeExisting = { canonicalSlot, graphSlot ->
        val graphScheduledFieldIds = graphSlot.scheduledFieldIds.orEmpty()
        canonicalSlot.copy(
            divisions = graphSlot.divisions.orEmpty(),
            scheduledFieldId = graphSlot.scheduledFieldId
                ?: graphScheduledFieldIds.firstOrNull(),
            scheduledFieldIds = graphScheduledFieldIds,
        )
    },
)

private fun mergeAcceptedGraphFields(
    canonical: List<Field>,
    graph: List<Field>,
): List<Field> = mergeAcceptedGraphRows(
    canonical = canonical,
    graph = graph,
    id = Field::id,
    mergeExisting = { canonicalField, graphField ->
        canonicalField.copy(divisions = graphField.divisions)
    },
)
private fun Event.editorGraphDivisionSourceAliases(): Map<String, List<String>> {
    val graphDivisionIds = editorGraphDivisionIds()
        .map(String::normalizeDivisionIdentifier)
        .filter(String::isNotBlank)
        .toSet()
    if (graphDivisionIds.isEmpty()) return emptyMap()

    val detailsById = divisionDetails.associateBy { detail ->
        detail.id.normalizeDivisionIdentifier()
    }
    return buildMap {
        divisionDetails.forEach { detail ->
            val normalizedId = detail.id.normalizeDivisionIdentifier()
            if (normalizedId.isBlank() || normalizedId !in graphDivisionIds) {
                return@forEach
            }
            val sourceAliases = mutableListOf<String>()
            val visited = mutableSetOf(normalizedId)
            var sourceId = detail.sourceDivisionId
                ?.normalizeDivisionIdentifier()
                ?.takeIf(String::isNotBlank)
            while (sourceId != null && visited.add(sourceId)) {
                sourceAliases += sourceId
                sourceId = detailsById[sourceId]
                    ?.sourceDivisionId
                    ?.normalizeDivisionIdentifier()
                    ?.takeIf(String::isNotBlank)
            }
            sourceAliases += normalizedId
            put(normalizedId, sourceAliases)
        }
    }
}

private fun normalizedEditorDivisionFieldAssignments(
    divisionFieldIds: Map<String, List<String>>,
): Map<String, List<String>> = buildMap {
    divisionFieldIds.forEach { (divisionId, fieldIds) ->
        val normalizedDivisionId = divisionId
            .normalizeDivisionIdentifier()
            .takeIf(String::isNotBlank)
            ?: return@forEach
        put(
            normalizedDivisionId,
            fieldIds
                .map(String::trim)
                .filter(String::isNotBlank)
                .distinct(),
        )
    }
}

private fun Event.withReconciledEditorGraphFieldAssignments(
    divisionFieldIds: Map<String, List<String>>,
): Event {
    val graphSourceAliases = editorGraphDivisionSourceAliases()
    if (graphSourceAliases.isEmpty()) return this
    val assignments = normalizedEditorDivisionFieldAssignments(divisionFieldIds)
    val reconciledDetails = divisionDetails.map { detail ->
        val aliases = graphSourceAliases[detail.id.normalizeDivisionIdentifier()]
            ?: return@map detail
        val assignedFieldIds = aliases
            .firstNotNullOfOrNull { sourceId -> assignments[sourceId] }
            .orEmpty()
        if (detail.fieldIds == assignedFieldIds) {
            detail
        } else {
            detail.copy(fieldIds = assignedFieldIds)
        }
    }
    return if (reconciledDetails == divisionDetails) {
        this
    } else {
        copy(divisionDetails = reconciledDetails)
    }
}

private fun List<Field>.withReconciledEditorGraphFieldAssignments(
    event: Event,
    divisionFieldIds: Map<String, List<String>>,
): List<Field> {
    val graphSourceAliases = event.editorGraphDivisionSourceAliases()
    if (isEmpty() || graphSourceAliases.isEmpty()) return this
    val assignments = normalizedEditorDivisionFieldAssignments(divisionFieldIds)
    val graphDivisionIds = graphSourceAliases.keys
    val graphDivisionIdsByField = buildMap<String, MutableList<String>> {
        graphSourceAliases.forEach { (graphDivisionId, sourceAliases) ->
            val assignedFieldIds = sourceAliases
                .firstNotNullOfOrNull { sourceId -> assignments[sourceId] }
                .orEmpty()
            assignedFieldIds.forEach { fieldId ->
                val normalizedFieldId = fieldId.trim().takeIf(String::isNotBlank)
                    ?: return@forEach
                getOrPut(normalizedFieldId) { mutableListOf() }.add(graphDivisionId)
            }
        }
    }
    return map { field ->
        val incomingDivisions = field.divisions.filterNot { divisionId ->
            divisionId.normalizeDivisionIdentifier() in graphDivisionIds
        }
        val reconciledDivisions = buildList {
            addAll(incomingDivisions)
            graphDivisionIdsByField[field.id.trim()]
                .orEmpty()
                .forEach { graphDivisionId ->
                    if (graphDivisionId !in this) add(graphDivisionId)
                }
        }
        if (reconciledDivisions == field.divisions) {
            field
        } else {
            field.copy(divisions = reconciledDivisions)
        }
    }
}

private fun List<TimeSlot>.withReconciledEditorGraphDivisionAssignments(
    cached: List<TimeSlot>,
    cachedEvent: Event?,
): List<TimeSlot> {
    val graphSourceAliases = cachedEvent?.editorGraphDivisionSourceAliases().orEmpty()
    if (isEmpty() || cached.isEmpty() || graphSourceAliases.isEmpty()) return this
    val graphDivisionIds = graphSourceAliases.keys
    val cachedById = cached.associateBy { slot -> slot.id.trim() }
    return map { slot ->
        val cachedSlot = cachedById[slot.id.trim()] ?: return@map slot
        val incomingDivisionIds = slot.divisions.orEmpty()
        val incomingNormalizedDivisionIds = incomingDivisionIds
            .map(String::normalizeDivisionIdentifier)
            .filter(String::isNotBlank)
            .toSet()
        val validCachedGraphDivisions = cachedSlot.divisions.orEmpty().filter { divisionId ->
            val normalizedDivisionId = divisionId.normalizeDivisionIdentifier()
            normalizedDivisionId in graphDivisionIds &&
                graphSourceAliases[normalizedDivisionId]
                    .orEmpty()
                    .any { sourceId -> sourceId in incomingNormalizedDivisionIds }
        }
        val reconciledDivisions = buildList {
            incomingDivisionIds
                .filterNot { divisionId ->
                    divisionId.normalizeDivisionIdentifier() in graphDivisionIds
                }
                .forEach(::add)
            validCachedGraphDivisions.forEach { divisionId ->
                if (divisionId !in this) add(divisionId)
            }
        }
        if (reconciledDivisions == incomingDivisionIds) {
            slot
        } else {
            slot.copy(divisions = reconciledDivisions)
        }
    }
}


private fun EventEditorMaintenanceGraphEventDto.toLegacyEvent(event: EventApiDto): EventApiDto {
    val legacyDetailsById = event.divisionDetails.orEmpty()
        .associateBy { detail -> detail.id.normalizeDivisionIdentifier() }
    val legacyPlayoffDetailsById = event.playoffDivisionDetails.orEmpty()
        .associateBy { detail -> detail.id.normalizeDivisionIdentifier() }
    return event.copy(
        id = id,
        name = name,
        description = description,
        start = start,
        end = end,
        location = location,
        coordinates = coordinates,
        price = price?.toInt(),
        minAge = minAge,
        maxAge = maxAge,
        rating = rating,
        imageId = imageId,
        noFixedEndDateTime = noFixedEndDateTime,
        scheduleEndConstraint = scheduleEndConstraint,
        generatedScheduleEnd = generatedScheduleEnd,
        state = state,
        maxParticipants = maxParticipants,
        teamSizeLimit = teamSizeLimit,
        teamSignup = teamSignup,
        singleDivision = singleDivision,
        waitListIds = waitListIds,
        freeAgentIds = freeAgentIds,
        teamIds = teamIds,
        userIds = userIds,
        fieldIds = fieldIds,
        timeSlotIds = timeSlotIds,
        officialIds = officialIds,
        eventType = eventType,
        sportIds = sportIds,
        leagueScoringConfigId = leagueScoringConfigId,
        organizationId = organizationId,
        requiredTemplateIds = requiredTemplateIds,
        allowPaymentPlans = allowPaymentPlans,
        installmentCount = installmentCount,
        installmentDueDates = installmentDueDates,
        installmentDueRelativeDays = installmentDueRelativeDays,
        installmentAmounts = installmentAmounts.map(Double::toInt),
        allowTeamSplitDefault = allowTeamSplitDefault,
        splitLeaguePlayoffDivisions = splitLeaguePlayoffDivisions,
        divisionDetails = divisionDetails.map { detail ->
            val fallback = legacyDetailsById[detail.id.normalizeDivisionIdentifier()]
                ?: DivisionDetail(id = detail.id)
            val leagueConfig = detail.leagueConfig
            fallback.copy(
                id = detail.id,
                sourceDivisionId = detail.sourceDivisionId,
                kind = detail.kind,
                isSystemGenerated = detail.isSystemGenerated,
                name = detail.name,
                teamIds = detail.teamIds,
                playoffTeamCount = detail.playoffTeamCount,
                playoffPlacementDivisionIds = detail.playoffPlacementDivisionIds,
                // Keep every canonical Room field (including phaseSettings) from the fallback
                // while flattening the graph-only league configuration into DivisionDetail.
                gamesPerOpponent = leagueConfig?.gamesPerOpponent ?: fallback.gamesPerOpponent,
                restTimeMinutes = leagueConfig?.restTimeMinutes ?: fallback.restTimeMinutes,
                usesSets = leagueConfig?.usesSets ?: fallback.usesSets,
                matchDurationMinutes =
                    leagueConfig?.matchDurationMinutes ?: fallback.matchDurationMinutes,
                setDurationMinutes =
                    leagueConfig?.setDurationMinutes ?: fallback.setDurationMinutes,
                setsPerMatch = leagueConfig?.setsPerMatch ?: fallback.setsPerMatch,
                pointsToVictory = leagueConfig?.pointsToVictory
                    ?.map(Double::toInt)
                    ?: fallback.pointsToVictory,
            )
        },
        playoffDivisionDetails = playoffDivisionDetails.map { detail ->
            val fallback = legacyPlayoffDetailsById[detail.id.normalizeDivisionIdentifier()]
                ?: DivisionDetail(id = detail.id)
            val leagueConfig = detail.leagueConfig
            fallback.copy(
                id = detail.id,
                sourceDivisionId = detail.sourceDivisionId,
                kind = detail.kind,
                isSystemGenerated = detail.isSystemGenerated,
                name = detail.name,
                teamIds = detail.teamIds,
                playoffTeamCount = detail.playoffTeamCount,
                playoffPlacementDivisionIds = detail.playoffPlacementDivisionIds,
                // Keep every canonical Room field (including phaseSettings) from the fallback
                // while flattening the graph-only league configuration into DivisionDetail.
                gamesPerOpponent = leagueConfig?.gamesPerOpponent ?: fallback.gamesPerOpponent,
                restTimeMinutes = leagueConfig?.restTimeMinutes ?: fallback.restTimeMinutes,
                usesSets = leagueConfig?.usesSets ?: fallback.usesSets,
                matchDurationMinutes =
                    leagueConfig?.matchDurationMinutes ?: fallback.matchDurationMinutes,
                setDurationMinutes =
                    leagueConfig?.setDurationMinutes ?: fallback.setDurationMinutes,
                setsPerMatch = leagueConfig?.setsPerMatch ?: fallback.setsPerMatch,
                pointsToVictory = leagueConfig?.pointsToVictory
                    ?.map(Double::toInt)
                    ?: fallback.pointsToVictory,
            )
        },
        doubleElimination = doubleElimination,
        winnerSetCount = winnerSetCount,
        loserSetCount = loserSetCount,
        winnerBracketPointsToVictory = winnerBracketPointsToVictory?.map(Double::toInt),
        loserBracketPointsToVictory = loserBracketPointsToVictory?.map(Double::toInt),
        prize = prize,
        fieldCount = fieldCount,
        usesSets = usesSets,
        matchDurationMinutes = matchDurationMinutes,
        setDurationMinutes = setDurationMinutes,
        setsPerMatch = setsPerMatch,
        doTeamsOfficiate = doTeamsOfficiate,
        teamOfficialsMaySwap = teamOfficialsMaySwap,
        teamCheckInOpenMinutesBefore = teamCheckInOpenMinutesBefore,
        allowMatchRosterEdits = allowMatchRosterEdits,
        allowTemporaryMatchPlayers = allowTemporaryMatchPlayers,
        gamesPerOpponent = gamesPerOpponent,
        includePlayoffs = includePlayoffs,
        playoffTeamCount = playoffTeamCount,
        pointsToVictory = pointsToVictory?.map(Double::toInt),
    )
}

private fun EventEditorMaintenanceGraphDto.eventForPersistence(): EventApiDto =
    canonicalEvent?.toLegacyEvent(event) ?: event

private fun EventEditorCreateProposalGraphDto.decodeOrThrow(
    expectedEventId: String,
    requireMatches: Boolean = true,
): DecodedProposalGraph {
    val graphEvent = event.toEventOrNull()
        ?: error("Accepted schedule proposal contained an invalid Event graph.")
    require(graphEvent.id == expectedEventId) {
        "Accepted schedule proposal contained the wrong Event id."
    }
    val graphTeams = event.teams.map { teamDto ->
        teamDto.toTeamOrNull()
            ?: error("Accepted schedule proposal contained an invalid Team graph.")
    }
    val graphFields = event.fields
    val graphTimeSlots = event.timeSlots.map { slotDto ->
        val slotId = slotDto.id?.trim()?.takeIf(String::isNotBlank)
            ?: error("Accepted schedule proposal contained a time slot without an id.")
        slotDto.toTimeSlot(slotId)
    }
    val graphMatches = matches.toAcceptedMatchesOrThrow()
    if (requireMatches) {
        require(graphMatches.isNotEmpty()) {
            "Accepted schedule proposal contained no Match Graph nodes."
        }
    }
    require(graphMatches.all { match -> match.eventId == expectedEventId }) {
        "Accepted schedule proposal contained a Match Graph for the wrong Event."
    }
    return DecodedProposalGraph(
        event = graphEvent,
        teams = graphTeams,
        fields = graphFields,
        timeSlots = graphTimeSlots,
        matches = graphMatches,
    )
}

private fun EventEditorMaintenanceGraphDto.decodeOrThrow(
    expectedEventId: String,
    requireMatches: Boolean = true,
): DecodedProposalGraph {
    val graphEventDto = eventForPersistence()
    val graphEvent = graphEventDto.toEventOrNull(requireOwnerIdentity = false)
        ?: error("Accepted maintenance proposal contained an invalid Event graph.")
    require(graphEvent.id == expectedEventId) {
        "Accepted maintenance proposal contained the wrong Event id."
    }
    val graphTeams = graphEventDto.teams.map { teamDto ->
        teamDto.toTeamOrNull()
            ?: error("Accepted maintenance proposal contained an invalid Team graph.")
    }
    val graphFields = graphEventDto.fields
    val graphTimeSlots = graphEventDto.timeSlots.map { slotDto ->
        val slotId = slotDto.id?.trim()?.takeIf(String::isNotBlank)
            ?: error("Accepted maintenance proposal contained a time slot without an id.")
        slotDto.toTimeSlot(slotId)
    }
    val graphMatches = if (canonicalMatches.isNotEmpty()) {
        canonicalMatches.toCanonicalMaintenanceMatchesOrThrow()
    } else {
        matches.toMaintenanceMatchesOrThrow()
    }
    if (requireMatches) {
        require(graphMatches.isNotEmpty()) {
            "Accepted maintenance proposal contained no Match Graph nodes."
        }
    }
    require(graphMatches.all { match -> match.eventId == expectedEventId }) {
        "Accepted maintenance proposal contained a Match Graph for the wrong Event."
    }
    return DecodedProposalGraph(
        event = graphEvent,
        teams = graphTeams,
        fields = graphFields,
        timeSlots = graphTimeSlots,
        matches = graphMatches,
    )
}

private inline fun <reified T> JsonObject.decodeJsonOrThrow(): T =
    jsonMVP.decodeFromJsonElement<T>(this)

class EventRepository(
    private val databaseService: DatabaseService,
    private val api: MvpApiClient,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
    currentUserDataSource: CurrentUserDataSource? = null,
    coroutineDispatcher: CoroutineDispatcher = Dispatchers.Default,
) : IEventRepository {
    private val roomStore = EventRoomStore(databaseService)
    private val detailRemoteGateway = EventDetailRemoteGateway(api)
    private val editorRemoteGateway = EventEditorRemoteGateway(api)
    private val participantSyncCoordinator = EventParticipantSyncCoordinator(
        databaseService = databaseService,
        detailRemoteGateway = detailRemoteGateway,
        roomStore = roomStore,
        teamRepository = teamRepository,
        userRepository = userRepository,
    )
    private val registrationCacheCoordinator = EventRegistrationCacheCoordinator(
        registrationDao = { databaseService.getEventRegistrationDao },
        api = api,
        currentUserDataSource = currentUserDataSource,
    )
    private val registrationMutationCoordinator = EventRegistrationMutationCoordinator(
        api = api,
        roomStore = roomStore,
        detailRemoteGateway = detailRemoteGateway,
        participantSyncCoordinator = participantSyncCoordinator,
        registrationCacheCoordinator = registrationCacheCoordinator,
        teamRepository = teamRepository,
        userRepository = userRepository,
    )
    private val sessionCacheCoordinator = EventSessionCacheCoordinator(
        databaseService = databaseService,
        userRepository = userRepository,
        coroutineDispatcher = coroutineDispatcher,
    )
    private val catalogCoordinator = EventCatalogCoordinator(
        databaseService = databaseService,
        api = api,
        userRepository = userRepository,
        sessionCacheCoordinator = sessionCacheCoordinator,
    )

    fun close() {
        sessionCacheCoordinator.close()
    }

    override fun resetCursor() {
        // Paging is currently handled by the UI by re-issuing search calls; keep this as a no-op for now.
    }

    override suspend fun getRegistrationQuestions(
        scopeType: String,
        scopeId: String,
    ): Result<List<TeamJoinQuestion>> = catalogCoordinator.getRegistrationQuestions(scopeType, scopeId)


    override fun getCachedEventsFlow(): Flow<Result<List<Event>>> =
        sessionCacheCoordinator.observeCachedEvents()

    override fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>> =
        callbackFlow {
            val localJob = launch {
                roomStore.observeEventWithRelations(eventId)
                    .collect { local ->
                        if (local != null) {
                            trySend(Result.success(local))
                        } else {
                            trySend(
                                Result.failure(
                                    NoSuchElementException("Event $eventId not found in local cache")
                                )
                            )
                        }
                    }
            }

            val remoteJob = launch {
                getEvent(eventId).onFailure { error ->
                    trySend(Result.failure(error))
                }
            }

            awaitClose {
                localJob.cancel()
                remoteJob.cancel()
            }
        }

    override fun getCachedEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>> {
        val normalizedEventId = eventId.trim()
        if (normalizedEventId.isBlank()) {
            return flowOf(Result.failure(IllegalArgumentException("Event id is required.")))
        }
        return roomStore.observeEventWithRelations(normalizedEventId)
            .map { relations ->
                if (relations != null) {
                    Result.success(relations)
                } else {
                    Result.failure(NoSuchElementException("Event $normalizedEventId not found in local cache"))
                }
            }
    }

    private suspend fun persistBootstrapMatches(
        eventId: String,
        matches: List<MatchMVP>,
    ) {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank) ?: return
        val localMatches = databaseService.getMatchDao.getMatchesOfTournament(normalizedEventId)
        val remoteIds = matches.map(MatchMVP::id).toSet()
        val staleIds = localMatches
            .map(MatchMVP::id)
            .filter { localId -> localId !in remoteIds }
        if (staleIds.isNotEmpty()) {
            databaseService.getMatchDao.deleteMatchesById(staleIds)
        }
        if (matches.isNotEmpty()) {
            databaseService.getMatchDao.upsertMatches(matches)
        }
    }

    private suspend fun persistAcceptedMaintenanceMatches(
        eventId: String,
        matches: List<MatchMVP>,
        operation: EventEditorMaintenanceOperation,
        protectedMatchIds: Set<String>,
    ) {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: error("Accepted maintenance result contained a blank Event id.")
        val matchDao = databaseService.getMatchDao
        val localMatches = matchDao.getMatchesOfTournament(normalizedEventId)
        val fixedMatchIds = when (operation) {
            EventEditorMaintenanceOperation.BUILD -> emptySet()
            EventEditorMaintenanceOperation.COMPLETE,
            EventEditorMaintenanceOperation.REBUILD -> protectedMatchIds
                .map(String::trim)
                .filter(String::isNotBlank)
                .toSet()
        }
        val graphMatchIds = matches
            .map { match -> match.id.trim() }
            .filter(String::isNotBlank)
            .toSet()
        val preservedMatchesById = localMatches
            .asSequence()
            .filter { match ->
                val normalizedId = match.id.trim()
                normalizedId in fixedMatchIds && normalizedId in graphMatchIds
            }
            .associateBy { match -> match.id.trim() }
        val staleIds = localMatches
            .asSequence()
            .map(MatchMVP::id)
            .filter { localId -> localId.trim() !in graphMatchIds }
            .toList()
        if (staleIds.isNotEmpty()) {
            matchDao.deleteMatchesById(staleIds)
        }
        val matchesToWrite = matches.map { graphMatch ->
            preservedMatchesById[graphMatch.id.trim()]?.let { localMatch ->
                localMatch.mergeAcceptedMaintenanceStructure(graphMatch)
            } ?: graphMatch
        }
        requireResolvedMatchGraph(matchesToWrite)
        if (matchesToWrite.isNotEmpty()) {
            matchDao.upsertMatches(matchesToWrite)
        }
    }
    private fun Event.maintenanceRelatedUserIds(teams: List<Team>): List<String> {
        val eventTeamIds = teamIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .map(String::lowercase)
            .toSet()
        return (
            userIds +
                freeAgentIds +
                waitListIds +
                assistantHostIds +
                officialIds +
                eventOfficials.map { official -> official.userId } +
                hostId +
                teams
                    .filter { team -> team.id.trim().lowercase() in eventTeamIds }
                    .flatMap(Team::playerIds)
            )
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
    }

    private suspend fun prepareAcceptedRelationHydration(
        event: Event,
        graphTeams: List<Team>,
    ): AcceptedRelationHydration {
        val eventBeforeHydration = roomStore.getEvent(event.id)
        val teamIds = (
            event.teamIds +
                eventBeforeHydration?.teamIds.orEmpty() +
                graphTeams.map(Team::id)
            )
            .normalizedAcceptedRelationIds()
        val cachedTeams = if (teamIds.isEmpty()) {
            emptyList()
        } else {
            databaseService.getTeamDao.getTeams(teamIds)
        }
        val preloadedTeams = (cachedTeams + graphTeams)
            .mapNotNull { team ->
                team.id.trim()
                    .takeIf(String::isNotBlank)
                    ?.lowercase()
                    ?.let { teamId -> teamId to team }
            }
            .toMap()
            .values
            .toList()
        val hydrationEvent = event.copy(
            teamIds = teamIds,
            userIds = (
                event.userIds +
                    listOfNotNull(eventBeforeHydration)
                        .flatMap { cached -> cached.maintenanceRelatedUserIds(preloadedTeams) }
                )
                .normalizedAcceptedRelationIds(),
        )
        val relatedUserIds = hydrationEvent.maintenanceRelatedUserIds(preloadedTeams)
        val cachedUsers = if (relatedUserIds.isEmpty()) {
            emptyList()
        } else {
            databaseService.getUserDataDao.getUserDatasById(relatedUserIds)
        }
        val relations = participantSyncCoordinator.hydrateAcceptedMaintenanceRelations(
            event = hydrationEvent,
            preloadedTeams = preloadedTeams,
            preloadedUsers = cachedUsers,
        )
        return AcceptedRelationHydration(
            eventBeforeHydration = eventBeforeHydration,
            relations = relations,
        )
    }
    private suspend fun persistAcceptedMaintenanceRelations(
        event: Event,
        teams: List<Team>,
        users: List<UserData>,
    ) {
        val relationTeams = acceptedRelationTeams(
            event = event,
            availableTeams = teams,
        )
        participantSyncCoordinator.persistAcceptedMaintenanceRelationsInTransaction(
            event = event,
            relations = HydratedEventRelations(
                teams = relationTeams,
                users = acceptedRelationUsers(event, relationTeams, users),
            ),
        )
    }

    private fun acceptedRelationTeams(
        event: Event,
        availableTeams: List<Team>,
    ): List<Team> {
        val eventTeamIds = event.teamIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .map(String::lowercase)
            .toSet()
        return availableTeams
            .asSequence()
            .filter { team -> team.id.trim().lowercase() in eventTeamIds }
            .distinctBy { team -> team.id.trim().lowercase() }
            .toList()
    }

    private fun acceptedRelationUsers(
        event: Event,
        teams: List<Team>,
        availableUsers: List<UserData>,
    ): List<UserData> {
        val relatedUserIds = event.maintenanceRelatedUserIds(teams)
            .map(String::lowercase)
            .toSet()
        return availableUsers
            .asSequence()
            .filter { user -> user.id.trim().lowercase() in relatedUserIds }
            .distinctBy { user -> user.id.trim().lowercase() }
            .toList()
    }

    private fun Event.preserveCurrentRelationIds(current: Event): Event = copy(
        teamIds = current.teamIds,
        userIds = current.userIds,
        freeAgentIds = current.freeAgentIds,
        waitListIds = current.waitListIds,
        assistantHostIds = current.assistantHostIds,
        officialIds = current.officialIds,
        eventOfficials = current.eventOfficials,
        hostId = current.hostId,
    )

    private suspend fun refreshAcceptedMaintenanceRelations(
        event: Event,
        preloadedTeams: List<Team>,
        cachedUsers: List<UserData>,
    ) {
        // Re-read the event before deciding whether a replacement is needed. The accepted
        // projection can race with a participant update, and that newer relation set owns Room.
        val currentEvent = roomStore.getEvent(event.id) ?: return
        val relatedUserIds = currentEvent.maintenanceRelatedUserIds(preloadedTeams)
        val cachedTeamIds = preloadedTeams
            .map { team -> team.id.trim() }
            .filter(String::isNotBlank)
            .map(String::lowercase)
            .toSet()
        val missingTeam = currentEvent.teamIds.any { teamId ->
            teamId.trim().isNotBlank() && teamId.trim().lowercase() !in cachedTeamIds
        }
        val cachedUserIds = cachedUsers
            .map { user -> user.id.trim() }
            .filter(String::isNotBlank)
            .map(String::lowercase)
            .toSet()
        val missingUser = relatedUserIds.any { userId ->
            userId.lowercase() !in cachedUserIds
        }
        if (!missingTeam && !missingUser) return

        participantSyncCoordinator.persistAcceptedMaintenanceRelations(
            event = currentEvent,
            preloadedTeams = preloadedTeams,
            preloadedUsers = cachedUsers,
        )
    }

    private suspend fun persistAcceptedMaintenanceResult(
        result: EventEditorMaintenanceAcceptedResultDto,
    ) {
        val normalizedEventId = result.eventId.trim().takeIf(String::isNotBlank)
            ?: error("Accepted maintenance result contained a blank Event id.")
        val graph = result.graph.decodeOrThrow(
            expectedEventId = normalizedEventId,
            requireMatches = true,
        )
        // Hydrate outside Room. The accepted graph transaction must never wait on HTTP.
        val relationHydration = prepareAcceptedRelationHydration(
            event = graph.event,
            graphTeams = graph.teams,
        )

        val persistedRelationCache = databaseService.withTransaction {
            // Read every canonical row in the same Room transaction as its projection write. This
            // prevents a stale pre-transaction snapshot from overwriting a newer local row.
            val cachedEvent = roomStore.getEvent(normalizedEventId)
            val cachedTimeSlots = databaseService.getEventTimeSlotDao
                .getTimeSlotsByEventId(normalizedEventId)
                .map(EventTimeSlotCacheEntry::toTimeSlot)
            val fieldIds = (
                cachedEvent?.fieldIds.orEmpty() +
                    graph.event.fieldIds +
                    graph.fields.map(Field::id)
                )
                .map(String::trim)
                .filter(String::isNotBlank)
                .distinct()
            val cachedFields = if (fieldIds.isEmpty()) {
                emptyList()
            } else {
                databaseService.getFieldDao.getFieldsByIds(fieldIds)
            }
            val teamIds = (
                cachedEvent?.teamIds.orEmpty() +
                    graph.event.teamIds +
                    graph.teams.map(Team::id)
                )
                .map(String::trim)
                .filter(String::isNotBlank)
                .distinct()
            val cachedTeams = if (teamIds.isEmpty()) {
                emptyList()
            } else {
                databaseService.getTeamDao.getTeams(teamIds)
            }
            val projection = cachedEvent?.mergeAcceptedMaintenanceProjection(
                graph = graph.event,
                graphFields = graph.fields,
            ) ?: graph.event
            val relationIdsChangedDuringHydration = cachedEvent != null &&
                if (relationHydration.eventBeforeHydration != null) {
                    !cachedEvent.hasSameParticipantRelationIds(
                        relationHydration.eventBeforeHydration,
                    )
                } else {
                    !cachedEvent.hasSameParticipantRelationIds(graph.event)
                }
            val eventToPersist = if (relationIdsChangedDuringHydration) {
                projection.preserveCurrentRelationIds(cachedEvent)
            } else {
                projection
            }
            val fieldsToPersist = mergeAcceptedMaintenanceFields(
                canonical = cachedFields,
                graph = graph.fields,
            )
            val timeSlotsToPersist = mergeAcceptedMaintenanceTimeSlots(
                canonical = cachedTimeSlots,
                graph = graph.timeSlots,
            )
            val teamsToPersist = mergeAcceptedMaintenanceTeams(
                canonical = cachedTeams,
                graph = graph.teams,
            )

            val persisted = roomStore.cacheAndReadEventInTransaction(
                event = eventToPersist,
                expectedEventId = normalizedEventId,
                protectedHistoryAuthoritative = false,
            )
            roomStore.cacheEventTimeSlots(
                eventId = persisted.id,
                timeSlots = timeSlotsToPersist,
            )
            if (fieldsToPersist.isNotEmpty()) {
                databaseService.getFieldDao.upsertFields(fieldsToPersist)
            }
            if (teamsToPersist.isNotEmpty()) {
                databaseService.getTeamDao.upsertTeamsWithRelations(teamsToPersist)
            }
            val relationTeams = acceptedRelationTeams(
                event = persisted,
                availableTeams = teamsToPersist +
                    cachedTeams +
                    relationHydration.relations.teams,
            )
            val relationUsers = acceptedRelationUsers(
                event = persisted,
                teams = relationTeams,
                availableUsers = relationHydration.relations.users,
            )
            if (!relationIdsChangedDuringHydration) {
                participantSyncCoordinator.persistAcceptedMaintenanceRelationsInTransaction(
                    event = persisted,
                    relations = HydratedEventRelations(
                        teams = relationTeams,
                        users = relationUsers,
                    ),
                )
            }
            persistAcceptedMaintenanceMatches(
                eventId = persisted.id,
                matches = graph.matches,
                operation = result.operation,
                protectedMatchIds = result.protectedMatchIds.toSet(),
            )
            AcceptedRoomRelationCache(
                event = persisted,
                teams = relationTeams,
                users = relationUsers,
            )
        }

        refreshAcceptedMaintenanceRelations(
            event = persistedRelationCache.event,
            preloadedTeams = persistedRelationCache.teams,
            cachedUsers = persistedRelationCache.users,
        )
    }
    private suspend fun persistAcceptedMaintenanceResultWithSyncPending(
        result: EventEditorMaintenanceAcceptedResultDto,
    ) {
        try {
            persistAcceptedMaintenanceResult(result)
        } catch (throwable: kotlinx.coroutines.CancellationException) {
            throw throwable
        } catch (throwable: Throwable) {
            throw EventEditorMaintenanceAcceptedSyncPendingException(
                result = result,
                cause = throwable,
            )
        }
    }

    /**
     * The editor draft is a configuration projection. It does not carry registration identities or
     * several server-owned presentation and derived values. Keep those values from Room when the
     * projection cannot represent them. Every editable field stays authoritative on the projection.
     */
    private fun Event.withCachedEditorOmittedFields(cached: Event?): Event {
        if (cached == null) return this

        val supportsMatchGeneration = eventType == EventType.LEAGUE || eventType == EventType.TOURNAMENT
        val matchRulesUnchanged = matchRulesOverride == cached.matchRulesOverride

        return copy(
            // The editor cannot clear registrations. A non-empty incoming graph still wins.
            userIds = userIds.ifEmpty { cached.userIds },
            teamIds = teamIds.ifEmpty { cached.teamIds },
            // These fields are absent from EventEditorDraftDto.
            rating = rating ?: cached.rating,
            seedColor = if (seedColor == DEFAULT_EVENT_SEED_COLOR_ARGB) {
                cached.seedColor
            } else {
                seedColor
            },
            scheduleText = scheduleText ?: cached.scheduleText,
            dateDisplayMode = dateDisplayMode ?: cached.dateDisplayMode,
            dateDisplayText = dateDisplayText ?: cached.dateDisplayText,
            autoCancellation = cached.autoCancellation,
            prize = if (prize.isBlank()) cached.prize else prize,
            fieldCount = fieldCount ?: cached.fieldCount,
            // Match generation metadata is only valid for League and Tournament events.
            leagueScoringConfigId = if (eventType == EventType.LEAGUE) {
                leagueScoringConfigId ?: cached.leagueScoringConfigId
            } else {
                leagueScoringConfigId
            },
            // Do not keep derived rules after an editable rules override changes.
            resolvedMatchRules = if (supportsMatchGeneration && matchRulesUnchanged) {
                resolvedMatchRules ?: cached.resolvedMatchRules
            } else {
                resolvedMatchRules
            },
        )
    }

    private suspend fun mergeEditorEventForPersistence(
        event: Event,
        divisionFieldIds: Map<String, List<String>>? = null,
        preserveEditorOmittedFields: Boolean = false,
    ): Event {
        val cachedEvent = roomStore.getEvent(event.id)
        val editorProjection = if (preserveEditorOmittedFields) {
            event.withCachedEditorOmittedFields(cachedEvent)
        } else {
            event
        }
        val mergedEvent = editorProjection
            .withCachedEditorDivisionState(cachedEvent)
            .copy(archivedAt = event.archivedAt ?: cachedEvent?.archivedAt)
        return if (divisionFieldIds != null && event.eventType == EventType.TOURNAMENT) {
            mergedEvent.withReconciledEditorGraphFieldAssignments(divisionFieldIds)
        } else {
            mergedEvent
        }
    }

    private suspend fun mergeEditorTimeSlotsForPersistence(
        eventId: String,
        timeSlots: List<TimeSlot>,
        cachedEvent: Event? = null,
    ): List<TimeSlot> {
        val event = cachedEvent ?: roomStore.getEvent(eventId)
        val cachedTimeSlots = databaseService.getEventTimeSlotDao
            .getTimeSlotsByEventId(eventId)
            .map(EventTimeSlotCacheEntry::toTimeSlot)
        return if (event?.eventType == EventType.TOURNAMENT) {
            timeSlots.withReconciledEditorGraphDivisionAssignments(
                cached = cachedTimeSlots,
                cachedEvent = event,
            )
        } else {
            timeSlots.withCachedEditorDivisionAssociations(
                cached = cachedTimeSlots,
                cachedGraphDivisionIds = event?.editorGraphDivisionIds().orEmpty(),
            )
        }
    }

    private fun Event.withEditorCanonicalDivisionState(incoming: Event): Event = copy(
        divisions = incoming.divisions,
        divisionDetails = incoming.divisionDetails,
    )


    override suspend fun getEvent(eventId: String): Result<Event> =
        runCatching {
            val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
                ?: error("Event id is required.")
            val event = try {
                detailRemoteGateway.fetchEvent(normalizedEventId)
            } catch (throwable: Throwable) {
                if (shouldEvictEventFromCache(throwable)) {
                    roomStore.evictEvent(normalizedEventId)
                }
                throw throwable
            }
            if (event.eventType == EventType.TOURNAMENT) {
                databaseService.withTransaction {
                    roomStore.cacheAndReadEventInTransaction(
                        event = mergeEditorEventForPersistence(event),
                        expectedEventId = normalizedEventId,
                    )
                }
            } else {
                roomStore.cacheAndReadEvent(
                    event = event,
                    expectedEventId = normalizedEventId,
                )
            }
        }
    override suspend fun getEventStaffInvites(eventId: String): Result<List<com.razumly.mvp.core.data.dataTypes.Invite>> =
        runCatching {
            val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
                ?: return@runCatching emptyList()
            detailRemoteGateway.fetchEventDto(normalizedEventId).staffInvites.orEmpty()
        }
    override suspend fun getEventEditorCreateBootstrap(
        query: EventEditorBootstrapQueryDto,
    ): Result<EventEditorSession> = runCatching {
        EventEditorSessionMapper.fromCreateBootstrap(editorRemoteGateway.openCreate(query))
    }

    override suspend fun createEventEditor(
        command: EventEditorCreateCommandDto,
    ): Result<EventEditorSaveOutcome> = runCatching {
        when (val response = editorRemoteGateway.create(command)) {
            is com.razumly.mvp.core.network.dto.EventEditorCreateResponseDto.Saved ->
                persistCreatedEventEditor(
                    result = response.result,
                    operationId = command.createOperationId,
                )
            is com.razumly.mvp.core.network.dto.EventEditorCreateResponseDto.Proposed -> {
                val canonical = EventEditorSessionMapper.canonicalState(
                    snapshot = response.proposal.snapshot,
                    operationId = command.createOperationId,
                )
                EventEditorSaveOutcome(
                    session = EventEditorSession(
                        snapshot = response.proposal.snapshot,
                        canonicalState = canonical,
                        baseline = canonical,
                        createOperationId = command.createOperationId,
                    ),
                    questionIdMap = emptyMap(),
                    staffEmailDelivery = "NOT_REQUESTED",
                    scheduleOutcome = response.proposal.scheduleOutcome,
                    proposal = response.proposal,
                )
            }
        }
    }

    override suspend fun acceptEventEditorProposal(
        createOperationId: String,
        proposalRevision: String,
        draft: EventEditorDraftDto,
    ): Result<EventEditorSaveOutcome> = runCatching {
        persistCreatedEventEditor(
            result = editorRemoteGateway.acceptProposal(
                createOperationId = createOperationId,
                proposalRevision = proposalRevision,
                draft = draft,
            ),
            operationId = createOperationId,
            requireCompleteGraph = true,
        )
    }

    override suspend fun acceptEventEditorPartialProposal(
        createOperationId: String,
        proposalRevision: String,
        acceptanceOperationId: String,
        draft: EventEditorDraftDto,
    ): Result<EventEditorSaveOutcome> = runCatching {
        persistCreatedEventEditor(
            result = editorRemoteGateway.acceptPartialProposal(
                createOperationId = createOperationId,
                proposalRevision = proposalRevision,
                acceptanceOperationId = acceptanceOperationId,
                draft = draft,
            ),
            operationId = createOperationId,
            requireCompleteGraph = true,
        )
    }

    override suspend fun rejectEventEditorProposal(
        createOperationId: String,
        proposalRevision: String,
    ): Result<Unit> = runCatching {
        editorRemoteGateway.rejectProposal(createOperationId, proposalRevision)
    }

    private suspend fun persistCreatedEventEditor(
        result: com.razumly.mvp.core.network.dto.EventEditorSaveResultDto,
        operationId: String,
        requireCompleteGraph: Boolean = false,
    ): EventEditorSaveOutcome {
        val canonical = EventEditorSessionMapper.canonicalState(
            snapshot = result.snapshot,
            operationId = operationId,
        )
        val proposalGraph = result.graph?.decodeOrThrow(canonical.event.id)
        if (requireCompleteGraph && proposalGraph == null) {
            error("Accepted schedule proposal did not include a complete Match Graph.")
        }
        val eventToPersist = when {
            proposalGraph == null -> canonical.event
            requireCompleteGraph -> {
                val graphEvent = proposalGraph.event
                canonical.event.copy(
                    divisions = mergeAcceptedGraphDivisionIds(
                        canonical = canonical.event.divisions,
                        graph = graphEvent.divisions,
                    ),
                    divisionDetails = mergeAcceptedGraphDivisionDetails(
                        canonical = canonical.event.divisionDetails,
                        graph = graphEvent.divisionDetails,
                    ),
                    teamIds = graphEvent.teamIds.ifEmpty { canonical.event.teamIds },
                    fieldIds = graphEvent.fieldIds.ifEmpty { canonical.event.fieldIds },
                    timeSlotIds = graphEvent.timeSlotIds.ifEmpty { canonical.event.timeSlotIds },
                    officialPositions = canonical.event.officialPositions,
                    eventOfficials = canonical.event.eventOfficials,
                )
            }
            else -> proposalGraph.event.let { graphEvent ->
                canonical.event.copy(
                    divisions = mergeAcceptedGraphDivisionIds(
                        canonical = canonical.event.divisions,
                        graph = graphEvent.divisions,
                    ),
                    divisionDetails = mergeAcceptedGraphDivisionDetails(
                        canonical = canonical.event.divisionDetails,
                        graph = graphEvent.divisionDetails,
                    ),
                    teamIds = graphEvent.teamIds.ifEmpty { canonical.event.teamIds },
                    fieldIds = graphEvent.fieldIds.ifEmpty { canonical.event.fieldIds },
                    timeSlotIds = graphEvent.timeSlotIds.ifEmpty { canonical.event.timeSlotIds },
                    officialIds = graphEvent.officialIds.ifEmpty { canonical.event.officialIds },
                    officialPositions = graphEvent.officialPositions.ifEmpty {
                        canonical.event.officialPositions
                    },
                    eventOfficials = graphEvent.eventOfficials.ifEmpty {
                        canonical.event.eventOfficials
                    },
                )
            }
        }
        val timeSlotsToPersist = if (proposalGraph != null) {
            mergeAcceptedGraphTimeSlots(
                canonical = canonical.timeSlots,
                graph = proposalGraph.timeSlots,
            )
        } else {
            canonical.timeSlots
        }
        val fieldsToPersist = if (proposalGraph != null) {
            mergeAcceptedGraphFields(
                canonical = canonical.fields,
                graph = proposalGraph.fields,
            )
        } else {
            canonical.fields
        }
        val matchesToPersist = proposalGraph?.matches
            ?: result.matchesForPersistence(canonical.event.id)
        val acceptedRelationHydration = if (requireCompleteGraph && proposalGraph != null) {
            // Hydrate outside Room. The accepted graph transaction must never wait on HTTP.
            prepareAcceptedRelationHydration(
                event = eventToPersist,
                graphTeams = proposalGraph.teams,
            )
        } else {
            null
        }

        val persistedResult = databaseService.withTransaction {
            val currentEventBeforeProjection = roomStore.getEvent(eventToPersist.id)
            val persistedEventProjection = if (
                acceptedRelationHydration != null &&
                    currentEventBeforeProjection != null &&
                    (
                        if (acceptedRelationHydration.eventBeforeHydration != null) {
                            !currentEventBeforeProjection.hasSameParticipantRelationIds(
                                acceptedRelationHydration.eventBeforeHydration,
                            )
                        } else {
                            !currentEventBeforeProjection.hasSameParticipantRelationIds(eventToPersist)
                        }
                    )
            ) {
                eventToPersist.preserveCurrentRelationIds(currentEventBeforeProjection)
            } else {
                eventToPersist
            }
            val persistedEvent = roomStore.cacheAndReadEventInTransaction(
                event = persistedEventProjection,
                expectedEventId = eventToPersist.id,
                protectedHistoryAuthoritative = true,
            )
            roomStore.cacheEventTimeSlots(
                eventId = persistedEvent.id,
                timeSlots = timeSlotsToPersist,
            )
            if (fieldsToPersist.isNotEmpty()) {
                databaseService.getFieldDao.upsertFields(fieldsToPersist)
            }
            val teamIds = (
                persistedEvent.teamIds +
                    proposalGraph?.teams.orEmpty().map(Team::id)
                )
                .map(String::trim)
                .filter(String::isNotBlank)
            val cachedTeams = if (teamIds.isEmpty()) {
                emptyList()
            } else {
                databaseService.getTeamDao.getTeams(teamIds)
            }
            val teamsToPersist = if (proposalGraph != null) {
                mergeAcceptedMaintenanceTeams(
                    canonical = cachedTeams,
                    graph = proposalGraph.teams,
                )
            } else {
                emptyList()
            }
            if (teamsToPersist.isNotEmpty()) {
                databaseService.getTeamDao.upsertTeamsWithRelations(teamsToPersist)
            }
            val relationTeams = acceptedRelationTeams(
                event = persistedEvent,
                availableTeams = teamsToPersist +
                    cachedTeams +
                    proposalGraph?.teams.orEmpty() +
                    acceptedRelationHydration?.relations?.teams.orEmpty(),
            )
            val relationUsers = if (acceptedRelationHydration != null) {
                acceptedRelationUsers(
                    event = persistedEvent,
                    teams = relationTeams,
                    availableUsers = acceptedRelationHydration.relations.users,
                )
            } else {
                val relatedUserIds = persistedEvent.maintenanceRelatedUserIds(relationTeams)
                val cachedUsers = if (relatedUserIds.isEmpty()) {
                    emptyList()
                } else {
                    databaseService.getUserDataDao.getUserDatasById(relatedUserIds)
                }
                cachedUsers
            }
            val relationIdsChangedDuringHydration = acceptedRelationHydration != null &&
                currentEventBeforeProjection != null &&
                (
                    if (acceptedRelationHydration.eventBeforeHydration != null) {
                        !currentEventBeforeProjection.hasSameParticipantRelationIds(
                            acceptedRelationHydration.eventBeforeHydration,
                        )
                    } else {
                        !currentEventBeforeProjection.hasSameParticipantRelationIds(eventToPersist)
                    }
                )
            if (!relationIdsChangedDuringHydration) {
                participantSyncCoordinator.persistAcceptedMaintenanceRelationsInTransaction(
                    event = persistedEvent,
                    relations = HydratedEventRelations(
                        teams = relationTeams,
                        users = relationUsers,
                    ),
                )
            }
            matchesToPersist?.let { matches ->
                persistBootstrapMatches(
                    eventId = persistedEvent.id,
                    matches = matches,
                )
            }
            val persistedCanonical = canonical.copy(
                event = persistedEvent,
                fields = fieldsToPersist,
                timeSlots = timeSlotsToPersist,
            )
            AcceptedRoomRelationCache(
                event = persistedEvent,
                teams = relationTeams,
                users = relationUsers,
            ) to EventEditorSaveOutcome(
                session = EventEditorSession(
                    snapshot = result.snapshot,
                    canonicalState = persistedCanonical,
                    baseline = persistedCanonical,
                    createOperationId = operationId,
                ),
                questionIdMap = result.questionIdMap,
                staffEmailDelivery = result.staffEmailDelivery,
                scheduleOutcome = result.scheduleOutcome,
                acceptanceOperationId = result.acceptanceOperationId,
            )
        }
        if (acceptedRelationHydration != null) {
            refreshAcceptedMaintenanceRelations(
                event = persistedResult.first.event,
                preloadedTeams = persistedResult.first.teams,
                cachedUsers = persistedResult.first.users,
            )
        }
        return persistedResult.second
    }
    override suspend fun getEventEditor(eventId: String): Result<EventEditorSession> = runCatching {
        val session = EventEditorSessionMapper.fromEditSnapshot(editorRemoteGateway.openEdit(eventId))
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        val incomingEvent = session.canonicalState.event
        databaseService.withTransaction {
            val persistedEvent = roomStore.cacheAndReadEventInTransaction(
                event = mergeEditorEventForPersistence(
                    event = incomingEvent,
                    preserveEditorOmittedFields = true,
                ),
                expectedEventId = normalizedEventId,
                protectedHistoryAuthoritative = true,
            )
            val persistedCanonical = session.canonicalState.copy(
                event = persistedEvent.withEditorCanonicalDivisionState(incomingEvent),
            )
            session.copy(
                canonicalState = persistedCanonical,
                baseline = persistedCanonical,
            )
        }
    }
    override suspend fun saveEventEditor(
        eventId: String,
        command: EventEditorSaveCommandDto,
        persistLocally: Boolean,
    ): Result<EventEditorSaveOutcome> = runCatching {
        val response = editorRemoteGateway.save(eventId, command)
        val canonical = EventEditorSessionMapper.canonicalState(response.snapshot)
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        if (!persistLocally) {
            return@runCatching EventEditorSaveOutcome(
                session = EventEditorSession(
                    snapshot = response.snapshot,
                    canonicalState = canonical,
                    baseline = canonical,
                ),
                questionIdMap = response.questionIdMap,
                staffEmailDelivery = response.staffEmailDelivery,
                scheduleOutcome = response.scheduleOutcome,
            )
        }
        val incomingEvent = canonical.event
        val isTournamentScheduleReconcile = incomingEvent.eventType == EventType.TOURNAMENT &&
            when (response.scheduleOutcome.status) {
                EventEditorScheduleOutcomeStatus.BUILT,
                EventEditorScheduleOutcomeStatus.REBUILT -> true
                else -> false
            }
        val rebuiltGraph = if (isTournamentScheduleReconcile) {
            val graphPayload = response.graph
                ?: error("Tournament schedule reconcile response missing the authoritative graph.")
            graphPayload.decodeOrThrow(
                expectedEventId = normalizedEventId,
                requireMatches = false,
            ).also { graph ->
                require(graph.event.eventType == EventType.TOURNAMENT) {
                    "Tournament schedule reconcile response contained a non-Tournament graph."
                }
            }
        } else {
            null
        }
        val matchesToPersist = if (rebuiltGraph != null) {
            rebuiltGraph.matches
        } else {
            response.matchesForPersistence(
                expectedEventId = normalizedEventId,
                useGraph = false,
            )
        }
        val persistedResult = databaseService.withTransaction {
            val eventToPersist = if (rebuiltGraph != null) {
                mergeEditorEventForPersistence(
                    event = incomingEvent,
                    preserveEditorOmittedFields = true,
                ).withRebuiltEditorGraphState(rebuiltGraph.event)
            } else {
                mergeEditorEventForPersistence(
                    event = incomingEvent,
                    divisionFieldIds = canonical.divisionFieldIds,
                    preserveEditorOmittedFields = true,
                )
            }
            val persistedEvent = roomStore.cacheAndReadEventInTransaction(
                event = eventToPersist,
                expectedEventId = normalizedEventId,
                protectedHistoryAuthoritative = true,
            )
            val timeSlotsToPersist = if (rebuiltGraph != null) {
                mergeRebuiltEditorGraphTimeSlots(
                    canonical = canonical.timeSlots,
                    graph = rebuiltGraph.timeSlots,
                )
            } else {
                mergeEditorTimeSlotsForPersistence(
                    eventId = persistedEvent.id,
                    timeSlots = canonical.timeSlots,
                    cachedEvent = persistedEvent,
                )
            }
            roomStore.cacheEventTimeSlots(
                eventId = persistedEvent.id,
                timeSlots = timeSlotsToPersist,
            )
            val fieldsToPersist = when {
                rebuiltGraph != null -> mergeRebuiltEditorGraphFields(
                    canonical = canonical.fields,
                    graph = rebuiltGraph.fields,
                )
                incomingEvent.eventType == EventType.TOURNAMENT ->
                    canonical.fields.withReconciledEditorGraphFieldAssignments(
                        event = persistedEvent,
                        divisionFieldIds = canonical.divisionFieldIds,
                    )
                else -> canonical.fields
            }
            if (fieldsToPersist.isNotEmpty()) {
                databaseService.getFieldDao.upsertFields(fieldsToPersist)
            }
            var relationCache: AcceptedRoomRelationCache? = null
            if (rebuiltGraph != null) {
                val teamIds = (
                    persistedEvent.teamIds +
                        rebuiltGraph.teams.map(Team::id)
                    )
                    .map(String::trim)
                    .filter(String::isNotBlank)
                    .distinct()
                val cachedTeams = if (teamIds.isEmpty()) {
                    emptyList()
                } else {
                    databaseService.getTeamDao.getTeams(teamIds)
                }
                val teamsToPersist = mergeAcceptedMaintenanceTeams(
                    canonical = cachedTeams,
                    graph = rebuiltGraph.teams,
                )
                if (teamsToPersist.isNotEmpty()) {
                    databaseService.getTeamDao.upsertTeamsWithRelations(teamsToPersist)
                }
                val relationTeams = teamsToPersist
                val relatedUserIds = persistedEvent.maintenanceRelatedUserIds(relationTeams)
                val cachedUsers = if (relatedUserIds.isEmpty()) {
                    emptyList()
                } else {
                    databaseService.getUserDataDao.getUserDatasById(relatedUserIds)
                }
                persistAcceptedMaintenanceRelations(
                    event = persistedEvent,
                    teams = relationTeams,
                    users = cachedUsers,
                )
                relationCache = AcceptedRoomRelationCache(
                    event = persistedEvent,
                    teams = relationTeams,
                    users = cachedUsers,
                )
            }
            matchesToPersist?.let { matches ->
                persistBootstrapMatches(
                    eventId = persistedEvent.id,
                    matches = matches,
                )
            }
            val persistedCanonical = canonical.copy(
                event = if (rebuiltGraph != null) {
                    persistedEvent
                } else {
                    persistedEvent.withEditorCanonicalDivisionState(incomingEvent)
                },
                fields = fieldsToPersist,
                timeSlots = timeSlotsToPersist,
            )
            relationCache to EventEditorSaveOutcome(
                session = EventEditorSession(
                    snapshot = response.snapshot,
                    canonicalState = persistedCanonical,
                    baseline = persistedCanonical,
                ),
                questionIdMap = response.questionIdMap,
                staffEmailDelivery = response.staffEmailDelivery,
                scheduleOutcome = response.scheduleOutcome,
            )
        }
        persistedResult.first?.let { relationCache ->
            refreshAcceptedMaintenanceRelations(
                event = relationCache.event,
                preloadedTeams = relationCache.teams,
                cachedUsers = relationCache.users,
            )
        }
        persistedResult.second
    }

    override suspend fun proposeEventScheduleMaintenance(
        request: EventEditorMaintenanceRequestDto,
    ): Result<EventEditorMaintenanceResponseDto> = runCatching {
        when (val response = editorRemoteGateway.proposeMaintenance(request)) {
            is EventEditorMaintenanceResponseDto.Proposed -> response
            is EventEditorMaintenanceResponseDto.Accepted -> {
                persistAcceptedMaintenanceResultWithSyncPending(response.result)
                response
            }
            is EventEditorMaintenanceResponseDto.Rejected -> response
        }
    }

    override suspend fun acceptEventScheduleMaintenance(
        request: EventEditorAcceptMaintenanceProposalDto,
    ): Result<EventEditorMaintenanceAcceptedResultDto> = runCatching {
        editorRemoteGateway.acceptMaintenance(request).also { result ->
            persistAcceptedMaintenanceResultWithSyncPending(result)
        }
    }

    override suspend fun syncAcceptedEventScheduleMaintenance(
        result: EventEditorMaintenanceAcceptedResultDto,
    ): Result<Unit> = runCatching {
        persistAcceptedMaintenanceResultWithSyncPending(result)
    }

    override suspend fun rejectEventScheduleMaintenance(
        request: EventEditorRejectMaintenanceProposalDto,
    ): Result<com.razumly.mvp.core.network.dto.EventEditorMaintenanceRejectedResultDto> =
        runCatching { editorRemoteGateway.rejectMaintenance(request) }

    override suspend fun syncEventParticipants(
        event: Event,
        occurrence: EventOccurrenceSelection?,
    ): Result<EventParticipantsSyncResult> =
        runCatching { participantSyncCoordinator.syncParticipants(event, occurrence) }

    override suspend fun syncEventDetail(
        event: Event,
        occurrence: EventOccurrenceSelection?,
        manage: Boolean,
    ): Result<EventDetailSyncResult> = runCatching {
        val normalizedEventId = event.id.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        val bootstrap = detailRemoteGateway.fetchDetailBootstrap(
            eventId = normalizedEventId,
            occurrence = occurrence,
            manage = manage,
        )
        val cachedEvent = roomStore.getEvent(normalizedEventId)
        val bootstrapEvent = bootstrap.event
            ?.toEventOrNull(requireOwnerIdentity = manage)
        val baseEvent = bootstrapEvent ?: cachedEvent ?: event
        val protectedHistoryAuthoritative = bootstrap.event?.eventTypeHasProtectedHistory != null
        val participantSnapshot = bootstrap.participantSnapshot
            ?.let { snapshot ->
                if (protectedHistoryAuthoritative) {
                    snapshot.copy(event = bootstrap.event)
                } else {
                    snapshot
                }
            }
            ?: EventParticipantsSnapshotResponseDto(event = bootstrap.event)

        databaseService.withTransaction {
            val participantResult = participantSyncCoordinator.mergeParticipantsSnapshot(
                baseEvent = baseEvent,
                snapshot = participantSnapshot,
                protectedHistoryAuthoritative = protectedHistoryAuthoritative,
            )
            participantSyncCoordinator.persistDetailCaches(
                eventId = normalizedEventId,
                occurrence = occurrence,
                manage = manage,
                registrations = participantSnapshot.registrations,
                teamCompliance = bootstrap.teamCompliance?.teams,
                userCompliance = bootstrap.userCompliance?.users,
            )

            val fields = bootstrap.fields
            if (fields.isNotEmpty()) {
                databaseService.getFieldDao.upsertFields(fields)
            }
            roomStore.cacheEventTimeSlots(
                eventId = normalizedEventId,
                timeSlots = bootstrap.timeSlots,
            )

            val matches = bootstrap.matches.mapNotNull { dto -> dto.toMatchOrNull() }
            persistBootstrapMatches(participantResult.event.id, matches)

            val scoringConfigId = participantResult.event.leagueScoringConfigId
                ?.trim()
                ?.takeIf(String::isNotBlank)
            val leagueScoringConfig = if (scoringConfigId != null) {
                bootstrap.leagueScoringConfig?.toLeagueScoringConfig(scoringConfigId)
            } else {
                null
            }
            val persistedRelations = roomStore.getEventWithRelations(normalizedEventId)

            EventDetailSyncResult(
                participants = participantResult.copy(event = persistedRelations.event),
                matches = matches,
                fields = fields,
                timeSlots = persistedRelations.timeSlots,
                leagueScoringConfig = leagueScoringConfig,
                staffInvites = bootstrap.staffInvites,
                staffRevision = bootstrap.staffRevision?.trim()?.takeIf(String::isNotBlank),
            )
        }
    }

    override suspend fun getEventParticipantsSummary(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Result<EventParticipantsSummary> =
        runCatching { participantSyncCoordinator.getParticipantsSummary(eventId, occurrence) }

    override suspend fun getEventParticipantManagementSnapshot(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Result<EventParticipantManagementSnapshot> =
        runCatching { participantSyncCoordinator.getManagementSnapshot(eventId, occurrence) }

    override fun observeEventParticipantManagementSnapshot(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Flow<EventParticipantManagementSnapshot> =
        participantSyncCoordinator.observeManagementSnapshot(eventId, occurrence)

    override suspend fun getEventTeamCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Result<List<EventTeamComplianceSummary>> =
        runCatching { participantSyncCoordinator.getTeamCompliance(eventId, occurrence) }

    override fun observeEventTeamCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Flow<List<EventTeamComplianceSummary>> =
        participantSyncCoordinator.observeTeamCompliance(eventId, occurrence)

    override suspend fun getEventUserCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Result<List<EventComplianceUserSummary>> =
        runCatching { participantSyncCoordinator.getUserCompliance(eventId, occurrence) }

    override fun observeEventUserCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Flow<List<EventComplianceUserSummary>> =
        participantSyncCoordinator.observeUserCompliance(eventId, occurrence)

    override suspend fun syncCurrentUserRegistrationCache(): Result<Unit> =
        runCatching { registrationCacheCoordinator.syncAll() }

    override suspend fun syncCurrentUserRegistrationCacheForEvent(eventId: String): Result<Unit> =
        runCatching { registrationCacheCoordinator.syncForEvent(eventId) }

    override fun observeCurrentUserRegistrationsForEvent(eventId: String): Flow<List<EventRegistrationCacheEntry>> {
        return registrationCacheCoordinator.observeForEvent(eventId)
    }

    override suspend fun clearCurrentUserRegistrationCache(): Result<Unit> =
        runCatching { registrationCacheCoordinator.clear() }

    override suspend fun getLeagueScoringConfig(eventId: String): Result<LeagueScoringConfig?> = runCatching {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank) ?: return@runCatching null
        val dto = detailRemoteGateway.fetchEventDto(normalizedEventId)
        val scoringConfigId = dto.leagueScoringConfigId
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: roomStore.getEvent(normalizedEventId)
                ?.leagueScoringConfigId
                ?.trim()
                ?.takeIf(String::isNotBlank)
            ?: return@runCatching null
        val embeddedConfig = dto.leagueScoringConfig
        if (embeddedConfig != null) {
            embeddedConfig.toLeagueScoringConfig(scoringConfigId)
        } else {
            detailRemoteGateway.fetchLeagueScoringConfig(scoringConfigId)
        }
    }



    override suspend fun getEventsByIds(eventIds: List<String>): Result<List<Event>> =
        catalogCoordinator.getEventsByIds(eventIds)

    override suspend fun getEventsByOrganization(
        organizationId: String,
        limit: Int,
    ): Result<List<Event>> = catalogCoordinator.getEventsByOrganization(organizationId, limit)

    override suspend fun getOrganizationEventsPage(
        organizationId: String,
        limit: Int,
        offset: Int,
    ): Result<OrganizationEventPage> =
        catalogCoordinator.getOrganizationEventsPage(organizationId, limit, offset)

    override suspend fun createEventTemplateFromEvent(sourceEventId: String): Result<EventTemplateSummary> = runCatching {
        val normalizedSourceEventId = sourceEventId.trim()
        if (normalizedSourceEventId.isEmpty()) error("Template source event id is required.")

        val response = api.post<CreateEventTemplateRequestDto, EventTemplateResponseDto>(
            path = "api/event-templates",
            body = CreateEventTemplateRequestDto(sourceEventId = normalizedSourceEventId),
        )
        response.template?.toEventTemplateSummaryOrNull() ?: error("Create template response missing template")
    }

    override suspend fun updateLocalEvent(newEvent: Event): Result<Event> = runCatching {
        if (newEvent.eventType == EventType.TOURNAMENT) {
            databaseService.withTransaction {
                roomStore.cacheAndReadEventInTransaction(
                    event = mergeEditorEventForPersistence(newEvent),
                    expectedEventId = newEvent.id,
                )
            }
        } else {
            roomStore.cacheAndReadEvent(
                event = newEvent,
                expectedEventId = newEvent.id,
            )
        }
    }

    override fun getEventsInBoundsFlow(bounds: Bounds): Flow<Result<List<Event>>> =
        catalogCoordinator.getEventsInBoundsFlow(bounds)

    override suspend fun getEventsInBounds(bounds: Bounds): Result<Pair<List<Event>, Boolean>> =
        catalogCoordinator.getEventsInBounds(bounds)

    override suspend fun getEventsInBounds(
        bounds: Bounds,
        dateFrom: Instant?,
        dateTo: Instant?,
        sports: List<String>,
        tags: List<String>,
        limit: Int,
        offset: Int,
        includeDistanceFilter: Boolean,
    ): Result<Pair<List<Event>, Boolean>> = catalogCoordinator.getEventsInBounds(
        bounds = bounds,
        dateFrom = dateFrom,
        dateTo = dateTo,
        sports = sports,
        tags = tags,
        limit = limit,
        offset = offset,
        includeDistanceFilter = includeDistanceFilter,
    )

    override suspend fun getEventsInBounds(
        bounds: Bounds,
        dateFrom: Instant?,
        dateTo: Instant?,
        sports: List<String>,
        tags: List<String>,
        price: Pair<Double, Double>?,
        divisionGenders: List<String>,
        skillDivisionTypeIds: List<String>,
        ageDivisionTypeIds: List<String>,
        limit: Int,
        offset: Int,
        includeDistanceFilter: Boolean,
        sort: EventSearchSort,
    ): Result<Pair<List<Event>, Boolean>> = catalogCoordinator.getEventsInBounds(
        bounds = bounds,
        dateFrom = dateFrom,
        dateTo = dateTo,
        sports = sports,
        tags = tags,
        price = price,
        divisionGenders = divisionGenders,
        skillDivisionTypeIds = skillDivisionTypeIds,
        ageDivisionTypeIds = ageDivisionTypeIds,
        limit = limit,
        offset = offset,
        includeDistanceFilter = includeDistanceFilter,
        sort = sort.name,
    )

    override suspend fun searchEvents(
        searchQuery: String,
        userLocation: LatLng?,
        limit: Int,
        offset: Int,
    ): Result<Pair<List<Event>, Boolean>> =
        catalogCoordinator.searchEvents(searchQuery, userLocation, limit, offset)

    override suspend fun getEventTags(query: String?, filterOnly: Boolean): Result<List<EventTag>> =
        catalogCoordinator.getEventTags(query, filterOnly)

    override suspend fun reportEvent(eventId: String, notes: String?): Result<Unit> = runCatching {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank) ?: error("Event id is required.")
        val response = api.post<EventModerationReportRequestDto, EventModerationReportResponseDto>(
            path = "api/moderation/reports",
            body = EventModerationReportRequestDto(
                targetType = "EVENT",
                targetId = normalizedEventId,
                category = "report_event",
                notes = notes?.trim()?.takeIf(String::isNotBlank),
            ),
        )

        val hiddenIds = response.hiddenEventIds
            .map { hiddenId -> hiddenId.trim() }
            .filter(String::isNotBlank)
            .distinct()
        if (hiddenIds.isNotEmpty()) {
            databaseService.getEventDao.deleteEventsWithCrossRefs(hiddenIds)
        }

        val currentProfile = userRepository.currentUser.value.getOrNull()
            ?: error("No current user profile available.")
        userRepository.setCachedCurrentUserProfile(
            currentProfile.copy(
                hiddenEventIds = if (hiddenIds.isNotEmpty()) {
                    hiddenIds
                } else {
                    (currentProfile.hiddenEventIds + normalizedEventId).distinct()
                },
            )
        ).getOrThrow()
    }

    override fun getEventsByHostFlow(hostId: String): Flow<Result<List<Event>>> =
        catalogCoordinator.getEventsByHostFlow(hostId)

    override suspend fun getHostEventsPage(
        hostId: String,
        limit: Int,
        offset: Int,
    ): Result<HostEventPage> = catalogCoordinator.getHostEventsPage(hostId, limit, offset)

    override fun getEventTemplatesByHostFlow(hostId: String): Flow<Result<List<EventTemplateSummary>>> =
        catalogCoordinator.getEventTemplatesByHostFlow(hostId)

    override suspend fun addCurrentUserToEvent(
        event: Event,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<SelfRegistrationResult> = addCurrentUserToEvent(
        event = event,
        preferredDivisionId = preferredDivisionId,
        occurrence = occurrence,
        answers = emptyMap(),
    )

    override suspend fun addCurrentUserToEvent(
        event: Event,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
        answers: Map<String, String>,
    ): Result<SelfRegistrationResult> =
        registrationMutationCoordinator.addCurrentUser(
            event = event,
            preferredDivisionId = preferredDivisionId,
            occurrence = occurrence,
            answers = answers,
        )
    override suspend fun addPlayerToEvent(
        event: Event,
        player: UserData,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<SelfRegistrationResult> =
        registrationMutationCoordinator.addPlayer(
            event = event,
            player = player,
            preferredDivisionId = preferredDivisionId,
            occurrence = occurrence,
        )
    override suspend fun requestCurrentUserRegistration(
        event: Event,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<SelfRegistrationResult> =
        registrationMutationCoordinator.requestCurrentUserRegistration(
            event = event,
            preferredDivisionId = preferredDivisionId,
            occurrence = occurrence,
        )
    override suspend fun registerChildForEvent(
        eventId: String,
        childUserId: String,
        joinWaitlist: Boolean,
        occurrence: EventOccurrenceSelection?,
    ): Result<ChildRegistrationResult> =
        registrationMutationCoordinator.registerChild(
            eventId = eventId,
            childUserId = childUserId,
            joinWaitlist = joinWaitlist,
            occurrence = occurrence,
        )
    override suspend fun addTeamToEvent(
        event: Event,
        team: Team,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<Unit> = addTeamToEvent(
        event = event,
        team = team,
        preferredDivisionId = preferredDivisionId,
        occurrence = occurrence,
        answers = emptyMap(),
    )

    override suspend fun addTeamToEvent(
        event: Event,
        team: Team,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
        answers: Map<String, String>,
    ): Result<Unit> =
        registrationMutationCoordinator.addTeam(
            event = event,
            team = team,
            preferredDivisionId = preferredDivisionId,
            occurrence = occurrence,
            answers = answers,
        )
    override suspend fun moveTeamParticipantDivision(
        event: Event,
        team: Team,
        preferredDivisionId: String,
        occurrence: EventOccurrenceSelection?,
    ): Result<EventParticipantsSyncResult> =
        registrationMutationCoordinator.moveTeamDivision(
            event = event,
            team = team,
            preferredDivisionId = preferredDivisionId,
            occurrence = occurrence,
        )
    override suspend fun getLeagueDivisionStandings(
        eventId: String,
        divisionId: String,
    ): Result<LeagueDivisionStandings> = runCatching {
        val normalizedEventId = eventId.trim()
        val normalizedDivisionId = divisionId.trim()
        if (normalizedEventId.isBlank() || normalizedDivisionId.isBlank()) {
            error("Event id and division id are required.")
        }
        val encodedDivisionId = normalizedDivisionId.encodeURLQueryComponent()
        val response = api.get<StandingsResponseDto>(
            "api/events/$normalizedEventId/standings?divisionId=$encodedDivisionId",
        )
        val division = response.division ?: error("Standings response missing division.")
        division.toLeagueDivisionStandings()
    }

    override suspend fun updateLeagueDivisionStandings(
        eventId: String,
        divisionId: String,
        pointsOverrides: List<LeagueStandingsPointUpdate>,
    ): Result<LeagueDivisionStandings> = runCatching {
        val normalizedEventId = eventId.trim()
        val normalizedDivisionId = divisionId.trim()
        if (normalizedEventId.isBlank() || normalizedDivisionId.isBlank()) {
            error("Event id and division id are required.")
        }
        val normalizedUpdates = pointsOverrides.map { update ->
            val teamId = update.teamId.trim()
            if (teamId.isBlank()) {
                error("Team id is required for every standings update.")
            }
            val points = update.points
            if (points != null && !points.isFinite()) {
                error("Standings points must be a finite number.")
            }
            StandingsPointOverrideDto(
                teamId = teamId,
                points = points?.let(::JsonPrimitive) ?: JsonNull,
            )
        }
        val response = api.patch<StandingsPatchRequestDto, StandingsResponseDto>(
            path = "api/events/$normalizedEventId/standings",
            body = StandingsPatchRequestDto(
                divisionId = normalizedDivisionId,
                pointsOverrides = normalizedUpdates,
            ),
        )
        val division = response.division ?: error("Standings update response missing division.")
        division.toLeagueDivisionStandings()
    }

    override suspend fun confirmLeagueDivisionStandings(
        eventId: String,
        divisionId: String,
        applyReassignment: Boolean,
    ): Result<LeagueStandingsConfirmResult> = runCatching {
        val normalizedEventId = eventId.trim()
        val normalizedDivisionId = divisionId.trim()
        if (normalizedEventId.isBlank() || normalizedDivisionId.isBlank()) {
            error("Event id and division id are required.")
        }
        val response = api.post<StandingsConfirmRequestDto, StandingsConfirmResponseDto>(
            path = "api/events/$normalizedEventId/standings/confirm",
            body = StandingsConfirmRequestDto(
                divisionId = normalizedDivisionId,
                applyReassignment = applyReassignment,
            ),
        )
        val division = response.division ?: error("Standings confirm response missing division.")
        LeagueStandingsConfirmResult(
            division = division.toLeagueDivisionStandings(),
            applyReassignment = response.applyReassignment ?: applyReassignment,
            reassignedPlayoffDivisionIds = response.reassignedPlayoffDivisionIds,
            seededTeamIds = response.seededTeamIds,
        )
    }

    override suspend fun removeTeamFromEvent(
        event: Event,
        teamWithPlayers: TeamWithPlayers,
        refundMode: EventParticipantRefundMode?,
        refundReason: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<Unit> =
        registrationMutationCoordinator.removeTeam(
            event = event,
            teamWithPlayers = teamWithPlayers,
            refundMode = refundMode,
            refundReason = refundReason,
            occurrence = occurrence,
        )
    override suspend fun removeCurrentUserFromEvent(
        event: Event,
        targetUserId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<Unit> =
        registrationMutationCoordinator.removeCurrentUser(
            event = event,
            targetUserId = targetUserId,
            occurrence = occurrence,
        )
    override suspend fun getMySchedule(): Result<UserScheduleSnapshot> = runCatching {
        val requestedAt = Instant.fromEpochMilliseconds(Clock.System.now().toEpochMilliseconds())
        val windowFrom = requestedAt.minus(MY_SCHEDULE_PAST_DAYS.days)
        val windowTo = requestedAt.plus(MY_SCHEDULE_FUTURE_DAYS.days)
        val encodedWindow = "from=${windowFrom.toString().encodeURLQueryComponent()}" +
            "&to=${windowTo.toString().encodeURLQueryComponent()}"
        val eventsById = linkedMapOf<String, Event>()
        val matchesById = linkedMapOf<String, MatchMVP>()
        val teamsById = linkedMapOf<String, Team>()
        val fieldsById = linkedMapOf<String, Field>()
        val seenCursors = mutableSetOf<String>()
        var cursor: String? = null
        var pageCount = 0

        do {
            pageCount += 1
            check(pageCount <= MY_SCHEDULE_MAX_PAGE_COUNT) {
                "Schedule endpoint exceeded the safe pagination limit"
            }
            val cursorQuery = cursor?.let { value ->
                "&cursor=${value.encodeURLQueryComponent(encodeFull = true)}"
            }.orEmpty()
            val response = api.get<ProfileScheduleResponseDto>(
                "api/profile/schedule?$encodedWindow&limit=$MY_SCHEDULE_PAGE_SIZE$cursorQuery",
            )

            response.events.toEventsOrThrow("Schedule events page")
                .forEach { event -> eventsById[event.id] = event }
            response.matches.mapNotNull { it.toMatchOrNull() }
                .forEach { match -> matchesById[match.id] = match }
            response.teams.mapNotNull { it.toTeamOrNull() }
                .forEach { team -> teamsById[team.id] = team }
            response.fields.forEach { field -> fieldsById[field.id] = field }

            val pagination = response.pagination
            if (pagination == null) {
                check(pageCount == 1) {
                    "Schedule response dropped pagination metadata during continuation"
                }
                check(response.events.size < MY_SCHEDULE_PAGE_SIZE) {
                    "Schedule response reached the legacy server cap without completeness metadata"
                }
                cursor = null
            } else if (!pagination.hasMore) {
                check(pagination.isComplete != false) {
                    "Schedule response declared an incomplete final page"
                }
                pagination.windowFrom?.let { returnedFrom ->
                    check(Instant.parse(returnedFrom) == windowFrom) {
                        "Schedule response window changed while paging"
                    }
                }
                pagination.windowTo?.let { returnedTo ->
                    check(Instant.parse(returnedTo) == windowTo) {
                        "Schedule response window changed while paging"
                    }
                }
                cursor = null
            } else {
                check(pagination.isComplete != true) {
                    "Schedule response marked a page complete while also returning a continuation"
                }
                pagination.windowFrom?.let { returnedFrom ->
                    check(Instant.parse(returnedFrom) == windowFrom) {
                        "Schedule response window changed while paging"
                    }
                }
                pagination.windowTo?.let { returnedTo ->
                    check(Instant.parse(returnedTo) == windowTo) {
                        "Schedule response window changed while paging"
                    }
                }
                val nextCursor = pagination.nextCursor
                    ?.trim()
                    ?.takeIf(String::isNotBlank)
                    ?: error("Schedule page is incomplete but did not provide a continuation cursor")
                check(seenCursors.add(nextCursor)) {
                    "Schedule pagination returned the same continuation cursor more than once"
                }
                cursor = nextCursor
            }
        } while (cursor != null)

        val events = databaseService.cachePartialEventsPreservingDivisionState(eventsById.values.toList())
        val cachedMatches = databaseService.getMatchDao
            .getMatchesByIds(matchesById.keys.toList())
            .associateBy(MatchMVP::id)
        val matches = matchesById.values.map { match ->
            mergeScheduleMatchProjection(match, cachedMatches[match.id])
        }
        val teams = teamsById.values.toList()
        val fields = fieldsById.values.toList()

        if (matches.isNotEmpty()) {
            databaseService.getMatchDao.upsertMatches(matches)
        }
        if (teams.isNotEmpty()) {
            databaseService.getTeamDao.upsertTeams(teams)
        }
        if (fields.isNotEmpty()) {
            databaseService.getFieldDao.upsertFields(fields)
        }

        UserScheduleSnapshot(
            events = events,
            matches = matches,
            teams = teams,
            fields = fields,
        )
    }

    override suspend fun getMyScheduleNextAction(): Result<UserScheduleNextAction> = runCatching {
        val response = api.get<ProfileScheduleNextActionResponseDto>(
            "api/profile/schedule/next-action",
        )
        check(response.contractVersion == 1) {
            "Unsupported schedule next-action contract version ${response.contractVersion}"
        }

        val action = response.action
        fun requiredValue(value: String?, label: String): String =
            value?.trim()?.takeIf(String::isNotBlank)
                ?: error("Schedule next-action response is missing $label")

        when (action.type.trim().uppercase()) {
            "CREATE_EVENT" -> UserScheduleNextAction.CreateEvent
            "EVENT" -> UserScheduleNextAction.EventShortcut(
                eventId = requiredValue(action.eventId, "eventId"),
                eventName = requiredValue(action.eventName, "eventName"),
                eventImageId = action.eventImageId.orEmpty(),
            )
            "MATCH" -> UserScheduleNextAction.MatchShortcut(
                eventId = requiredValue(action.eventId, "eventId"),
                matchId = requiredValue(action.matchId, "matchId"),
                eventName = requiredValue(action.eventName, "eventName"),
                eventImageId = action.eventImageId.orEmpty(),
            )
            else -> error("Unsupported schedule next-action type ${action.type}")
        }
    }

    override suspend fun deleteEvent(eventId: String): Result<Unit> = runCatching {
        api.deleteNoResponse("api/events/$eventId")
        databaseService.getEventDao.deleteEventWithCrossRefs(eventId)
    }

    private fun shouldEvictEventFromCache(throwable: Throwable): Boolean {
        val apiException = throwable as? ApiException ?: return false
        return apiException.statusCode == 403 || apiException.statusCode == 404
    }

}
