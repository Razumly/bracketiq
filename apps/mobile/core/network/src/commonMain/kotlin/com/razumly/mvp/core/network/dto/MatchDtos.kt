package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchIncidentMVP
import com.razumly.mvp.core.data.dataTypes.MatchOfficialAssignment
import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.util.normalizeDivisionLabel
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Serializable
data class MatchEmbeddedFieldDto(
    val id: String? = null,
    val fieldNumber: Int? = null,
    val divisions: List<String>? = null,
    val lat: Double? = null,
    val long: Double? = null,
    val heading: Double? = null,
    val inUse: Boolean? = null,
    val name: String? = null,
    val rentalSlotIds: List<String>? = null,
    val location: String? = null,
    val organizationId: String? = null,
) {
    fun resolvedId(): String? = id

    fun toFieldOrNull(): Field? {
        val resolvedId = resolvedId()?.trim()?.takeIf(String::isNotBlank) ?: return null
        val resolvedFieldNumber = fieldNumber?.takeIf { it > 0 } ?: return null
        return Field(
            id = resolvedId,
            fieldNumber = resolvedFieldNumber,
            divisions = divisions ?: emptyList(),
            lat = lat,
            long = long,
            heading = heading,
            inUse = inUse,
            name = name,
            rentalSlotIds = rentalSlotIds ?: emptyList(),
            location = location,
            organizationId = organizationId,
        )
    }
}

@Serializable
data class MatchApiDto(
    val id: String? = null,

    val matchId: Int? = null,
    val team1Id: String? = null,
    val team2Id: String? = null,
    val team1Seed: Int? = null,
    val team2Seed: Int? = null,
    val eventId: String? = null,
    val officialId: String? = null,
    val fieldId: String? = null,
    val field: MatchEmbeddedFieldDto? = null,
    val status: String? = null,
    val resultStatus: String? = null,
    val resultType: String? = null,
    val actualStart: String? = null,
    val actualEnd: String? = null,
    val statusReason: String? = null,
    val winnerEventTeamId: String? = null,
    val matchRulesSnapshot: ResolvedMatchRulesMVP? = null,
    val resolvedMatchRules: ResolvedMatchRulesMVP? = null,
    val segments: List<MatchSegmentApiDto>? = null,
    val incidents: List<MatchIncidentMVP>? = null,
    val start: String? = null,
    val end: String? = null,
    val division: String? = null,
    val team1Points: List<Int>? = null,
    val team2Points: List<Int>? = null,
    val setResults: List<Int>? = null,
    val side: String? = null,
    val losersBracket: Boolean? = null,
    val winnerNextMatchId: String? = null,
    val loserNextMatchId: String? = null,
    val previousLeftId: String? = null,
    val previousRightId: String? = null,
    val officialCheckedIn: Boolean? = null,
    val officialIds: List<MatchOfficialAssignment>? = null,
    val teamOfficialId: String? = null,
    val locked: Boolean? = null,
) {
    @OptIn(ExperimentalTime::class)
    fun toMatchOrNull(): MatchMVP? {
        val resolvedId = id
        val resolvedMatchId = matchId
        val resolvedEventId = eventId
        val resolvedFieldId = fieldId?.trim()?.takeIf(String::isNotBlank)
            ?: field?.resolvedId()?.trim()?.takeIf(String::isNotBlank)
        if (resolvedId.isNullOrBlank() || resolvedMatchId == null) return null
        if (resolvedEventId.isNullOrBlank()) return null

        return MatchMVP(
            id = resolvedId,
            matchId = resolvedMatchId,
            team1Id = team1Id,
            team2Id = team2Id,
            team1Seed = team1Seed,
            team2Seed = team2Seed,
            eventId = resolvedEventId,
            officialId = officialId,
            fieldId = resolvedFieldId,
            status = status,
            resultStatus = resultStatus,
            resultType = resultType,
            actualStart = actualStart,
            actualEnd = actualEnd,
            statusReason = statusReason,
            winnerEventTeamId = winnerEventTeamId,
            matchRulesSnapshot = matchRulesSnapshot,
            resolvedMatchRules = resolvedMatchRules,
            segments = segments?.mapNotNull(MatchSegmentApiDto::toMatchSegmentOrNull) ?: emptyList(),
            incidents = incidents ?: emptyList(),
            start = start?.let { Instant.parse(it) },
            end = end?.let { Instant.parse(it) },
            division = division?.normalizeDivisionLabel(),
            team1Points = team1Points ?: emptyList(),
            team2Points = team2Points ?: emptyList(),
            setResults = setResults ?: emptyList(),
            side = side,
            losersBracket = losersBracket ?: false,
            winnerNextMatchId = winnerNextMatchId,
            loserNextMatchId = loserNextMatchId,
            previousLeftId = previousLeftId,
            previousRightId = previousRightId,
            officialCheckedIn = officialCheckedIn,
            officialIds = officialIds ?: emptyList(),
            teamOfficialId = teamOfficialId,
            locked = locked ?: false,
        )
    }
}

@Serializable
data class MatchSegmentApiDto(
    val id: String? = null,
    val eventId: String? = null,
    val matchId: String? = null,
    val sequence: Int? = null,
    val status: String? = null,
    val scores: Map<String, Int>? = null,
    val winnerEventTeamId: String? = null,
    val startedAt: String? = null,
    val endedAt: String? = null,
    val resultType: String? = null,
    val statusReason: String? = null,
    val metadata: Map<String, JsonElement>? = null,
) {
    fun toMatchSegmentOrNull(): MatchSegmentMVP? {
        val resolvedId = id
        val resolvedMatchId = matchId
        val resolvedSequence = sequence
        if (resolvedId.isNullOrBlank() || resolvedMatchId.isNullOrBlank() || resolvedSequence == null) return null

        return MatchSegmentMVP(
            id = resolvedId,
            eventId = eventId,
            matchId = resolvedMatchId,
            sequence = resolvedSequence,
            status = status ?: "NOT_STARTED",
            scores = scores ?: emptyMap(),
            winnerEventTeamId = winnerEventTeamId,
            startedAt = startedAt,
            endedAt = endedAt,
            resultType = resultType,
            statusReason = statusReason,
            metadata = metadata.toStringMetadata(),
        )
    }
}

private fun Map<String, JsonElement>?.toStringMetadata(): Map<String, String>? =
    this
        ?.mapValues { (_, value) ->
            when (value) {
                is JsonPrimitive -> value.content
                else -> value.toString()
            }
        }
        ?.takeIf { it.isNotEmpty() }

@Serializable
data class MatchesResponseDto(
    val matches: List<MatchApiDto> = emptyList(),
)

@Serializable
data class MatchResponseDto(
    val match: MatchApiDto? = null,
)

@Serializable
data class MatchRealtimeTokenResponseDto(
    val token: String,
    val expiresAt: String? = null,
)

@Serializable
data class MatchRealtimeMessageDto(
    val type: String,
    val eventId: String? = null,
    val matches: List<MatchApiDto> = emptyList(),
    val deleted: List<String> = emptyList(),
    val sentAt: String? = null,
)

@Serializable
data class MatchLifecycleOperationDto(
    val status: String? = null,
    val resultStatus: String? = null,
    val resultType: String? = null,
    val actualStart: String? = null,
    val actualEnd: String? = null,
    val statusReason: String? = null,
    val winnerEventTeamId: String? = null,
    @Transient val clearActualStart: Boolean = false,
    @Transient val clearActualEnd: Boolean = false,
)

@Serializable
data class MatchSegmentOperationDto(
    val id: String? = null,
    val sequence: Int,
    val status: String? = null,
    val scores: Map<String, Int>? = null,
    val winnerEventTeamId: String? = null,
    val startedAt: String? = null,
    val endedAt: String? = null,
    val resultType: String? = null,
    val statusReason: String? = null,
    val clientOperationId: String? = null,
    val clientDeviceId: String? = null,
    val clientCreatedAt: String? = null,
    val clientSequence: Long? = null,
    val sourceDevice: String? = null,
    @Transient val clearStartedAt: Boolean = false,
    @Transient val clearEndedAt: Boolean = false,
    @Transient val clearWinnerEventTeamId: Boolean = false,
    @Transient val clearResultType: Boolean = false,
    @Transient val clearStatusReason: Boolean = false,
)

@Serializable
data class MatchIncidentOperationDto(
    val action: String,
    val id: String? = null,
    val segmentId: String? = null,
    val eventTeamId: String? = null,
    val eventRegistrationId: String? = null,
    val participantUserId: String? = null,
    val officialUserId: String? = null,
    val incidentType: String? = null,
    val sequence: Int? = null,
    val minute: Int? = null,
    val clock: String? = null,
    val clockSeconds: Int? = null,
    val linkedPointDelta: Int? = null,
    val note: String? = null,
    val clientOperationId: String? = null,
    val clientDeviceId: String? = null,
    val clientCreatedAt: String? = null,
    val clientSequence: Long? = null,
    val sourceDevice: String? = null,
)

@Serializable
data class MatchScoreSetDto(
    val segmentId: String? = null,
    val sequence: Int,
    val eventTeamId: String,
    val points: Int,
    val clientOperationId: String? = null,
    val clientDeviceId: String? = null,
    val clientCreatedAt: String? = null,
    val clientSequence: Long? = null,
    val sourceDevice: String? = null,
)

@Serializable
data class MatchOfficialCheckInOperationDto(
    val positionId: String? = null,
    val slotIndex: Int? = null,
    val userId: String? = null,
    val checkedIn: Boolean,
)

@Serializable
data class MatchActionOperationDto(
    val action: String,
    val forfeitingEventTeamId: String? = null,
    val winnerEventTeamId: String? = null,
    val reason: String? = null,
)

@Serializable
data class TeamCheckInDto(
    val id: String? = null,
    val eventId: String? = null,
    val matchId: String? = null,
    val eventTeamId: String? = null,
    val checkedInAt: String? = null,
    val checkedInByUserId: String? = null,
    val scope: String? = null,
    val status: String? = null,
)

@Serializable
data class TeamCheckInsResponseDto(
    val checkIns: List<TeamCheckInDto> = emptyList(),
    val teamCheckInMode: String? = null,
    val teamCheckInOpenMinutesBefore: Int? = null,
)

@Serializable
data class TeamCheckInRequestDto(
    val eventTeamId: String,
)

@Serializable
data class TeamCheckInResponseDto(
    val checkIn: TeamCheckInDto? = null,
)

@Serializable
data class MatchRosterEntryDto(
    val id: String? = null,
    val source: String? = null,
    val status: String? = null,
    val userId: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val userName: String? = null,
    val email: String? = null,
    val noAccount: Boolean? = null,
    val linkedAt: String? = null,
    val removedAt: String? = null,
)

@Serializable
data class MatchRosterDto(
    val eventTeamId: String? = null,
    val entries: List<MatchRosterEntryDto> = emptyList(),
)

@Serializable
data class MatchRostersResponseDto(
    val rosters: List<MatchRosterDto> = emptyList(),
    val allowMatchRosterEdits: Boolean? = null,
    val allowTemporaryMatchPlayers: Boolean? = null,
)

@Serializable
data class MatchRosterPlayerRequestDto(
    val userId: String,
)

@Serializable
data class MatchRosterAddPlayerRequestDto(
    val firstName: String? = null,
    val lastName: String? = null,
    val email: String? = null,
    val entryId: String? = null,
)

@Serializable
data class MatchRosterOperationRequestDto(
    val eventTeamId: String,
    val removePlayer: MatchRosterPlayerRequestDto? = null,
    val restorePlayer: MatchRosterPlayerRequestDto? = null,
    val addPlayer: MatchRosterAddPlayerRequestDto? = null,
)

@Serializable
data class MatchRosterResponseDto(
    val roster: MatchRosterDto? = null,
)

@Serializable
data class MatchUpdateDto(
    val lifecycle: MatchLifecycleOperationDto? = null,
    val segmentOperations: List<MatchSegmentOperationDto>? = null,
    val incidentOperations: List<MatchIncidentOperationDto>? = null,
    val officialCheckIn: MatchOfficialCheckInOperationDto? = null,
    val matchAction: MatchActionOperationDto? = null,
    val team1Points: List<Int>? = null,
    val team2Points: List<Int>? = null,
    val setResults: List<Int>? = null,
    val team1Id: String? = null,
    val team2Id: String? = null,
    val team1Seed: Int? = null,
    val team2Seed: Int? = null,
    val officialId: String? = null,
    val teamOfficialId: String? = null,
    val fieldId: String? = null,
    val previousLeftId: String? = null,
    val previousRightId: String? = null,
    val winnerNextMatchId: String? = null,
    val loserNextMatchId: String? = null,
    val side: String? = null,
    val officialCheckedIn: Boolean? = null,
    val officialIds: List<MatchOfficialAssignment>? = null,
    val matchId: Int? = null,
    val finalize: Boolean? = null,
    val time: String? = null,
    val start: String? = null,
    val end: String? = null,
    val division: String? = null,
    val losersBracket: Boolean? = null,
    val locked: Boolean? = null,
    val matchRulesSnapshot: ResolvedMatchRulesMVP? = null,
    val resolvedMatchRules: ResolvedMatchRulesMVP? = null,
    val clientOperationId: String? = null,
    val clientDeviceId: String? = null,
    val clientCreatedAt: String? = null,
    val clientSequence: Long? = null,
    val sourceDevice: String? = null,
)

fun MatchUpdateDto.toMatchOperationsJsonObject(): JsonObject = buildJsonObject {
    lifecycle
        ?.toJsonObject()
        ?.takeIf { it.isNotEmpty() }
        ?.let { put("lifecycle", it) }
    segmentOperations
        ?.takeIf { it.isNotEmpty() }
        ?.let { operations -> put("segmentOperations", JsonArray(operations.map(MatchSegmentOperationDto::toJsonObject))) }
    incidentOperations
        ?.takeIf { it.isNotEmpty() }
        ?.let { operations -> put("incidentOperations", JsonArray(operations.map(MatchIncidentOperationDto::toJsonObject))) }
    officialCheckIn?.toJsonObject()?.let { put("officialCheckIn", it) }
    matchAction?.toJsonObject()?.let { put("matchAction", it) }
    finalize?.let { put("finalize", JsonPrimitive(it)) }
    time?.let { put("time", JsonPrimitive(it)) }
    clientOperationId?.let { put("clientOperationId", JsonPrimitive(it)) }
    clientDeviceId?.let { put("clientDeviceId", JsonPrimitive(it)) }
    clientCreatedAt?.let { put("clientCreatedAt", JsonPrimitive(it)) }
    clientSequence?.let { put("clientSequence", JsonPrimitive(it)) }
    sourceDevice?.let { put("sourceDevice", JsonPrimitive(it)) }
}

private fun MatchActionOperationDto.toJsonObject(): JsonObject = buildJsonObject {
    put("action", JsonPrimitive(action))
    forfeitingEventTeamId?.let { put("forfeitingEventTeamId", JsonPrimitive(it)) }
    winnerEventTeamId?.let { put("winnerEventTeamId", JsonPrimitive(it)) }
    reason?.let { put("reason", JsonPrimitive(it)) }
}

private fun MatchLifecycleOperationDto.toJsonObject(): JsonObject = buildJsonObject {
    status?.let { put("status", JsonPrimitive(it)) }
    resultStatus?.let { put("resultStatus", JsonPrimitive(it)) }
    resultType?.let { put("resultType", JsonPrimitive(it)) }
    if (actualStart != null) {
        put("actualStart", JsonPrimitive(actualStart))
    } else if (clearActualStart) {
        put("actualStart", JsonNull)
    }
    if (actualEnd != null) {
        put("actualEnd", JsonPrimitive(actualEnd))
    } else if (clearActualEnd) {
        put("actualEnd", JsonNull)
    }
    statusReason?.let { put("statusReason", JsonPrimitive(it)) }
    winnerEventTeamId?.let { put("winnerEventTeamId", JsonPrimitive(it)) }
}

private fun MatchSegmentOperationDto.toJsonObject(): JsonObject = buildJsonObject {
    id?.let { put("id", JsonPrimitive(it)) }
    put("sequence", JsonPrimitive(sequence))
    status?.let { put("status", JsonPrimitive(it)) }
    scores?.let { values ->
        put("scores", JsonObject(values.mapValues { (_, score) -> JsonPrimitive(score) }))
    }
    if (winnerEventTeamId != null) {
        put("winnerEventTeamId", JsonPrimitive(winnerEventTeamId))
    } else if (clearWinnerEventTeamId) {
        put("winnerEventTeamId", JsonNull)
    }
    if (startedAt != null) {
        put("startedAt", JsonPrimitive(startedAt))
    } else if (clearStartedAt) {
        put("startedAt", JsonNull)
    }
    if (endedAt != null) {
        put("endedAt", JsonPrimitive(endedAt))
    } else if (clearEndedAt) {
        put("endedAt", JsonNull)
    }
    if (resultType != null) {
        put("resultType", JsonPrimitive(resultType))
    } else if (clearResultType) {
        put("resultType", JsonNull)
    }
    if (statusReason != null) {
        put("statusReason", JsonPrimitive(statusReason))
    } else if (clearStatusReason) {
        put("statusReason", JsonNull)
    }
    clientOperationId?.let { put("clientOperationId", JsonPrimitive(it)) }
    clientDeviceId?.let { put("clientDeviceId", JsonPrimitive(it)) }
    clientCreatedAt?.let { put("clientCreatedAt", JsonPrimitive(it)) }
    clientSequence?.let { put("clientSequence", JsonPrimitive(it)) }
    sourceDevice?.let { put("sourceDevice", JsonPrimitive(it)) }
}

private fun MatchIncidentOperationDto.toJsonObject(): JsonObject = buildJsonObject {
    put("action", JsonPrimitive(action))
    id?.let { put("id", JsonPrimitive(it)) }
    segmentId?.let { put("segmentId", JsonPrimitive(it)) }
    eventTeamId?.let { put("eventTeamId", JsonPrimitive(it)) }
    eventRegistrationId?.let { put("eventRegistrationId", JsonPrimitive(it)) }
    participantUserId?.let { put("participantUserId", JsonPrimitive(it)) }
    officialUserId?.let { put("officialUserId", JsonPrimitive(it)) }
    incidentType?.let { put("incidentType", JsonPrimitive(it)) }
    sequence?.let { put("sequence", JsonPrimitive(it)) }
    minute?.let { put("minute", JsonPrimitive(it)) }
    clock?.let { put("clock", JsonPrimitive(it)) }
    clockSeconds?.let { put("clockSeconds", JsonPrimitive(it)) }
    linkedPointDelta?.let { put("linkedPointDelta", JsonPrimitive(it)) }
    note?.let { put("note", JsonPrimitive(it)) }
    clientOperationId?.let { put("clientOperationId", JsonPrimitive(it)) }
    clientDeviceId?.let { put("clientDeviceId", JsonPrimitive(it)) }
    clientCreatedAt?.let { put("clientCreatedAt", JsonPrimitive(it)) }
    clientSequence?.let { put("clientSequence", JsonPrimitive(it)) }
    sourceDevice?.let { put("sourceDevice", JsonPrimitive(it)) }
}

private fun MatchOfficialCheckInOperationDto.toJsonObject(): JsonObject = buildJsonObject {
    positionId?.let { put("positionId", JsonPrimitive(it)) }
    slotIndex?.let { put("slotIndex", JsonPrimitive(it)) }
    userId?.let { put("userId", JsonPrimitive(it)) }
    put("checkedIn", JsonPrimitive(checkedIn))
}

@Serializable
data class BulkMatchUpdateEntryDto(
    val id: String,
    val matchId: Int? = null,
    val team1Points: List<Int>? = null,
    val team2Points: List<Int>? = null,
    val setResults: List<Int>? = null,
    val team1Id: String? = null,
    val team2Id: String? = null,
    val team1Seed: Int? = null,
    val team2Seed: Int? = null,
    val officialId: String? = null,
    val teamOfficialId: String? = null,
    val fieldId: String? = null,
    val previousLeftId: String? = null,
    val previousRightId: String? = null,
    val winnerNextMatchId: String? = null,
    val loserNextMatchId: String? = null,
    val side: String? = null,
    val officialCheckedIn: Boolean? = null,
    val officialIds: List<MatchOfficialAssignment>? = null,
    val start: String? = null,
    val end: String? = null,
    val division: String? = null,
    val losersBracket: Boolean? = null,
    val locked: Boolean? = null,
    val matchRulesSnapshot: ResolvedMatchRulesMVP? = null,
    val resolvedMatchRules: ResolvedMatchRulesMVP? = null,
)

@Serializable
data class BulkMatchUpdateRequestDto(
    val matches: List<BulkMatchUpdateEntryDto>? = null,
    val creates: List<BulkMatchCreateEntryDto>? = null,
    val deletes: List<String>? = null,
)

@Serializable
data class BulkMatchCreateEntryDto(
    val clientId: String,
    val creationContext: String = "bracket",
    val autoPlaceholderTeam: Boolean = true,
    val matchId: Int? = null,
    val team1Points: List<Int>? = null,
    val team2Points: List<Int>? = null,
    val setResults: List<Int>? = null,
    val team1Id: String? = null,
    val team2Id: String? = null,
    val team1Seed: Int? = null,
    val team2Seed: Int? = null,
    val officialId: String? = null,
    val teamOfficialId: String? = null,
    val fieldId: String? = null,
    val previousLeftId: String? = null,
    val previousRightId: String? = null,
    val winnerNextMatchId: String? = null,
    val loserNextMatchId: String? = null,
    val side: String? = null,
    val officialCheckedIn: Boolean? = null,
    val officialIds: List<MatchOfficialAssignment>? = null,
    val start: String? = null,
    val end: String? = null,
    val division: String? = null,
    val losersBracket: Boolean? = null,
    val locked: Boolean? = null,
    val matchRulesSnapshot: ResolvedMatchRulesMVP? = null,
    val resolvedMatchRules: ResolvedMatchRulesMVP? = null,
)

@Serializable
data class BulkMatchesResponseDto(
    val matches: List<MatchApiDto> = emptyList(),
    val created: Map<String, String> = emptyMap(),
    val deleted: List<String> = emptyList(),
)

fun MatchMVP.toBulkMatchUpdateEntryDto(): BulkMatchUpdateEntryDto = BulkMatchUpdateEntryDto(
    id = id,
    matchId = matchId,
    team1Points = team1Points,
    team2Points = team2Points,
    setResults = setResults,
    team1Id = team1Id,
    team2Id = team2Id,
    team1Seed = team1Seed,
    team2Seed = team2Seed,
    officialId = officialId,
    teamOfficialId = teamOfficialId,
    fieldId = fieldId,
    previousLeftId = previousLeftId,
    previousRightId = previousRightId,
    winnerNextMatchId = winnerNextMatchId,
    loserNextMatchId = loserNextMatchId,
    side = side,
    officialCheckedIn = officialCheckedIn,
    officialIds = officialIds,
    start = start?.toString(),
    end = end?.toString(),
    division = division,
    losersBracket = losersBracket,
    locked = locked,
    matchRulesSnapshot = matchRulesSnapshot,
    resolvedMatchRules = resolvedMatchRules,
)

fun MatchMVP.toBulkMatchCreateEntryDto(
    clientId: String,
    creationContext: String,
    autoPlaceholderTeam: Boolean,
): BulkMatchCreateEntryDto = BulkMatchCreateEntryDto(
    clientId = clientId,
    creationContext = creationContext,
    autoPlaceholderTeam = autoPlaceholderTeam,
    matchId = matchId,
    team1Points = team1Points,
    team2Points = team2Points,
    setResults = setResults,
    team1Id = team1Id,
    team2Id = team2Id,
    team1Seed = team1Seed,
    team2Seed = team2Seed,
    officialId = officialId,
    teamOfficialId = teamOfficialId,
    fieldId = fieldId,
    previousLeftId = previousLeftId,
    previousRightId = previousRightId,
    winnerNextMatchId = winnerNextMatchId,
    loserNextMatchId = loserNextMatchId,
    side = side,
    officialCheckedIn = officialCheckedIn,
    officialIds = officialIds,
    start = start?.toString(),
    end = end?.toString(),
    division = division,
    losersBracket = losersBracket,
    locked = locked,
    matchRulesSnapshot = matchRulesSnapshot,
    resolvedMatchRules = resolvedMatchRules,
)
