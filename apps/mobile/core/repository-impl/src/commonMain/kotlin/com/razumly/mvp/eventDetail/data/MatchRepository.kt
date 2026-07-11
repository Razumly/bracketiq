package com.razumly.mvp.eventDetail.data

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchIncidentMVP
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_KIND_SCORE_SET
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_KIND_UPDATE
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_FAILED
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_RECONCILING
import com.razumly.mvp.core.data.dataTypes.MatchOperationOutboxEntry
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.OfficialAssignmentHolderType
import com.razumly.mvp.core.data.dataTypes.normalizedMatchOfficialAssignments
import com.razumly.mvp.core.auth.NoOpWatchMatchOperationSync
import com.razumly.mvp.core.auth.WatchMatchOperationSync
import com.razumly.mvp.core.data.repositories.IMVPRepository
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.BulkMatchCreateEntryDto
import com.razumly.mvp.core.network.dto.BulkMatchUpdateEntryDto
import com.razumly.mvp.core.network.dto.BulkMatchUpdateRequestDto
import com.razumly.mvp.core.network.dto.BulkMatchesResponseDto
import com.razumly.mvp.core.network.dto.MatchRosterAddPlayerRequestDto
import com.razumly.mvp.core.network.dto.MatchRosterDto
import com.razumly.mvp.core.network.dto.MatchRosterOperationRequestDto
import com.razumly.mvp.core.network.dto.MatchRosterPlayerRequestDto
import com.razumly.mvp.core.network.dto.MatchRosterResponseDto
import com.razumly.mvp.core.network.dto.MatchRostersResponseDto
import com.razumly.mvp.core.network.dto.MatchApiDto
import com.razumly.mvp.core.network.dto.MatchActionOperationDto
import com.razumly.mvp.core.network.dto.MatchIncidentOperationDto
import com.razumly.mvp.core.network.dto.MatchLifecycleOperationDto
import com.razumly.mvp.core.network.dto.MatchOfficialCheckInOperationDto
import com.razumly.mvp.core.network.dto.MatchRealtimeMessageDto
import com.razumly.mvp.core.network.dto.MatchRealtimeTokenResponseDto
import com.razumly.mvp.core.network.dto.MatchResponseDto
import com.razumly.mvp.core.network.dto.MatchScoreSetDto
import com.razumly.mvp.core.network.dto.MatchSegmentOperationDto
import com.razumly.mvp.core.network.dto.MatchUpdateDto
import com.razumly.mvp.core.network.dto.MatchesResponseDto
import com.razumly.mvp.core.network.dto.TeamCheckInDto
import com.razumly.mvp.core.network.dto.TeamCheckInRequestDto
import com.razumly.mvp.core.network.dto.TeamCheckInResponseDto
import com.razumly.mvp.core.network.dto.TeamCheckInsResponseDto
import com.razumly.mvp.core.network.dto.toBulkMatchCreateEntryDto
import com.razumly.mvp.core.network.dto.toBulkMatchUpdateEntryDto
import com.razumly.mvp.core.network.dto.toMatchOperationsJsonObject
import com.razumly.mvp.core.util.jsonMVP
import com.razumly.mvp.core.util.newId
import io.ktor.http.encodeURLQueryComponent
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlin.time.ExperimentalTime
import kotlin.time.Instant
import kotlin.time.Clock

data class StagedMatchCreate(
    val clientId: String,
    val match: MatchMVP,
    val creationContext: String = "bracket",
    val autoPlaceholderTeam: Boolean = true,
)

@OptIn(ExperimentalTime::class)
interface IMatchRepository : IMVPRepository {
    suspend fun getMatch(matchId: String): Result<MatchMVP>
    fun getMatchFlow(matchId: String): Flow<Result<MatchWithRelations>>
    suspend fun saveMatchLocally(match: MatchMVP): Result<Unit>
    suspend fun updateMatch(match: MatchMVP): Result<Unit>
    suspend fun updateMatchOperations(
        match: MatchMVP,
        lifecycle: MatchLifecycleOperationDto? = null,
        segmentOperations: List<MatchSegmentOperationDto>? = null,
        incidentOperations: List<MatchIncidentOperationDto>? = null,
        officialCheckIn: MatchOfficialCheckInOperationDto? = null,
        matchAction: MatchActionOperationDto? = null,
        finalize: Boolean = false,
        time: Instant? = null,
    ): Result<MatchMVP>
    suspend fun setMatchScore(
        match: MatchMVP,
        segmentId: String?,
        sequence: Int,
        eventTeamId: String,
        points: Int,
    ): Result<MatchMVP>
    suspend fun addMatchIncident(
        match: MatchMVP,
        operation: MatchIncidentOperationDto,
    ): Result<MatchMVP>
    suspend fun syncPendingMatchOperations(matchId: String? = null): Result<Int>
    suspend fun updateMatchesBulk(
        matches: List<MatchMVP>,
        creates: List<StagedMatchCreate> = emptyList(),
        deletes: List<String> = emptyList(),
    ): Result<List<MatchMVP>>
    fun getMatchesOfTournamentFlow(tournamentId: String): Flow<Result<List<MatchWithRelations>>>
    fun getCachedMatchesOfTournamentFlow(tournamentId: String): Flow<Result<List<MatchWithRelations>>> =
        getMatchesOfTournamentFlow(tournamentId)
    suspend fun updateMatchFinished(match: MatchMVP, time: Instant): Result<Unit>
    suspend fun getMatchesOfTournament(tournamentId: String): Result<List<MatchMVP>>
    suspend fun getMatchesByEventIds(
        eventIds: List<String>,
        fieldIds: List<String>? = null,
        rangeStart: Instant? = null,
        rangeEnd: Instant? = null,
    ): Result<List<MatchMVP>>
    suspend fun getEventTeamCheckIns(eventId: String): Result<TeamCheckInsResponseDto>
    suspend fun checkInEventTeam(eventId: String, eventTeamId: String): Result<TeamCheckInDto>
    suspend fun getMatchTeamCheckIns(eventId: String, matchId: String): Result<TeamCheckInsResponseDto>
    suspend fun checkInMatchTeam(eventId: String, matchId: String, eventTeamId: String): Result<TeamCheckInDto>
    suspend fun getMatchRosters(eventId: String, matchId: String): Result<MatchRostersResponseDto>
    suspend fun removeMatchRosterPlayer(
        eventId: String,
        matchId: String,
        eventTeamId: String,
        userId: String,
    ): Result<MatchRosterDto>
    suspend fun restoreMatchRosterPlayer(
        eventId: String,
        matchId: String,
        eventTeamId: String,
        userId: String,
    ): Result<MatchRosterDto>
    suspend fun addTemporaryMatchRosterPlayer(
        eventId: String,
        matchId: String,
        eventTeamId: String,
        firstName: String?,
        lastName: String?,
        email: String? = null,
        entryId: String? = null,
    ): Result<MatchRosterDto>
    suspend fun deleteMatchesOfTournament(tournamentId: String): Result<Unit>
    suspend fun subscribeToMatches(eventId: String): Result<Unit>
    suspend fun unsubscribeFromRealtime(): Result<Unit>
    fun setRealtimePaused(reason: String, paused: Boolean): Result<Unit>
    fun setIgnoreMatch(match: MatchMVP?): Result<Unit>
}

@OptIn(ExperimentalTime::class)
class MatchRepository(
    private val api: MvpApiClient,
    private val databaseService: DatabaseService,
    private val watchMatchOperationSync: WatchMatchOperationSync = NoOpWatchMatchOperationSync,
    private val autoSyncOperations: Boolean = true,
    private val currentUserDataSource: CurrentUserDataSource? = null,
) : IMatchRepository {
    private companion object {
        const val CLIENT_MATCH_PREFIX = "client:"
        const val LOCAL_PLACEHOLDER_PREFIX = "placeholder-local:"
        const val LOCAL_OPERATION_SOURCE_DEVICE = "PHONE"
        val processOutboxEnqueueMutex = Mutex()
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val outboxSyncMutex = Mutex()
    private var outboxRetryJob: Job? = null
    private var _ignoreMatch = MutableStateFlow<MatchMVP?>(null)
    private val realtimePauseReasons = MutableStateFlow<Set<String>>(emptySet())
    private var realtimeJob: Job? = null
    private var realtimeEventId: String? = null
    private var activeRealtimeEventId: String? = null
    private var fallbackClientDeviceId: String? = null

    init {
        if (autoSyncOperations) {
            scope.launch { syncPendingMatchOperations() }
        }
    }

    private fun normalizeOptionalToken(value: String?): String? =
        value?.trim()?.takeIf(String::isNotBlank)

    private fun isRealtimePaused(): Boolean = realtimePauseReasons.value.isNotEmpty()

    private fun cancelRealtimeJob() {
        realtimeJob?.cancel()
        realtimeJob = null
        activeRealtimeEventId = null
    }

    private fun startRealtimeJobIfAllowed(refreshBeforeConnect: Boolean = false) {
        val eventId = realtimeEventId
        if (eventId.isNullOrBlank() || isRealtimePaused()) {
            cancelRealtimeJob()
            return
        }
        if (activeRealtimeEventId == eventId && realtimeJob?.isActive == true) {
            return
        }
        cancelRealtimeJob()
        activeRealtimeEventId = eventId
        realtimeJob = scope.launch {
            if (refreshBeforeConnect) {
                runCatching { refreshMatchesFromRemote(eventId) }
                    .onFailure { error ->
                        Napier.w(
                            "Failed to refresh matches before realtime reconnect for event $eventId: ${error.message}"
                        )
                    }
            }
            runMatchRealtimeLoop(eventId)
        }
    }

    private fun sanitizeTeamId(value: String?): String? {
        val normalized = normalizeOptionalToken(value) ?: return null
        if (normalized.startsWith(LOCAL_PLACEHOLDER_PREFIX)) {
            return null
        }
        return normalized
    }

    private fun sanitizeMatchRef(value: String?): String? = normalizeOptionalToken(value)

    private fun MatchMVP.normalizedOfficialAssignmentsForSync() =
        officialIds.normalizedMatchOfficialAssignments()

    private fun MatchIncidentMVP.isPendingLocalCreate(): Boolean =
        uploadStatus == "PENDING" || uploadStatus == "FAILED"

    private fun MatchIncidentMVP.isPendingLocalDelete(): Boolean =
        uploadStatus == "DELETE_PENDING" || uploadStatus == "DELETE_FAILED"

    private fun MatchIncidentMVP.matchesIncident(other: MatchIncidentMVP): Boolean {
        if (id.isNotBlank() && id == other.id) return true
        if (!legacyId.isNullOrBlank() && legacyId == other.legacyId) return true
        return segmentId == other.segmentId &&
            eventTeamId == other.eventTeamId &&
            eventRegistrationId == other.eventRegistrationId &&
            participantUserId == other.participantUserId &&
            incidentType == other.incidentType &&
            linkedPointDelta == other.linkedPointDelta &&
            minute == other.minute &&
            note == other.note
    }

    private fun preserveIgnoredMatchScoreFields(remoteMatch: MatchMVP, localMatch: MatchMVP?): MatchMVP {
        val ignoredMatchId = normalizeOptionalToken(_ignoreMatch.value?.id)
        if (localMatch == null || ignoredMatchId == null || ignoredMatchId != remoteMatch.id) {
            return remoteMatch
        }
        return remoteMatch.copy(
            segments = localMatch.segments,
            team1Points = localMatch.team1Points,
            team2Points = localMatch.team2Points,
            setResults = localMatch.setResults,
        )
    }

    private fun mergeLocalMatchState(remoteMatch: MatchMVP, localMatch: MatchMVP?): MatchMVP =
        preserveIgnoredMatchScoreFields(
            remoteMatch = mergePendingLocalIncidents(remoteMatch, localMatch),
            localMatch = localMatch,
        )

    private fun mergePendingLocalIncidents(remoteMatch: MatchMVP, localMatch: MatchMVP?): MatchMVP {
        val pendingLocalCreates = localMatch?.incidents
            .orEmpty()
            .filter { incident -> incident.isPendingLocalCreate() }
            .filterNot { pending ->
                remoteMatch.incidents.any { remote -> remote.matchesIncident(pending) }
            }
        val pendingLocalDeletes = localMatch?.incidents
            .orEmpty()
            .filter { incident -> incident.isPendingLocalDelete() }
        if (pendingLocalCreates.isEmpty() && pendingLocalDeletes.isEmpty()) {
            return remoteMatch
        }
        val pendingDeleteIds = pendingLocalDeletes.map { incident -> incident.id }.toSet()
        val remoteIncidents = remoteMatch.incidents.filterNot { remote ->
            remote.id in pendingDeleteIds || pendingLocalDeletes.any { pending -> remote.matchesIncident(pending) }
        }
        return remoteMatch.copy(
            incidents = (remoteIncidents + pendingLocalCreates + pendingLocalDeletes)
                .sortedWith(compareBy<MatchIncidentMVP> { it.sequence }.thenBy { it.id }),
        )
    }

    private suspend fun mergePendingLocalIncidents(remoteMatches: List<MatchMVP>): List<MatchMVP> {
        if (remoteMatches.isEmpty()) return remoteMatches
        val localMatchesById = remoteMatches
            .mapNotNull { remote -> databaseService.getMatchDao.getMatchById(remote.id)?.match }
            .associateBy { local -> local.id }
        return remoteMatches.map { remote ->
            mergeLocalMatchState(remote, localMatchesById[remote.id])
        }
    }

    private suspend fun applyPendingLocalOperations(
        match: MatchMVP,
        excludedOperationId: String? = null,
    ): MatchMVP {
        val operations = databaseService.getMatchOperationOutboxDao
            .getPendingOperationsForMatch(match.id)
            .filterNot { operation ->
                operation.id == excludedOperationId ||
                    operation.status == MATCH_OPERATION_STATUS_RECONCILING
            }
        return operations.fold(match) { current, operation ->
            applyOutboxOperationLocally(current, operation)
        }
    }

    private suspend fun mergePendingLocalState(
        remoteMatch: MatchMVP,
        localMatch: MatchMVP?,
        excludedOperationId: String? = null,
    ): MatchMVP =
        applyPendingLocalOperations(
            match = mergeLocalMatchState(remoteMatch, localMatch),
            excludedOperationId = excludedOperationId,
        )

    private suspend fun mergePendingLocalState(remoteMatches: List<MatchMVP>): List<MatchMVP> {
        if (remoteMatches.isEmpty()) return remoteMatches
        val localMatchesById = remoteMatches
            .mapNotNull { remote -> databaseService.getMatchDao.getMatchById(remote.id)?.match }
            .associateBy { local -> local.id }
        return remoteMatches.map { remote ->
            mergePendingLocalState(remote, localMatchesById[remote.id])
        }
    }

    private suspend fun upsertRemoteMatchPreservingPendingIncidents(
        remoteMatch: MatchMVP,
        excludedOperationId: String? = null,
    ) {
        val localMatch = databaseService.getMatchDao.getMatchById(remoteMatch.id)?.match
        databaseService.getMatchDao.upsertMatch(
            mergePendingLocalState(
                remoteMatch = remoteMatch,
                localMatch = localMatch,
                excludedOperationId = excludedOperationId,
            ),
        )
    }

    private suspend fun upsertRemoteMatchesPreservingPendingIncidents(remoteMatches: List<MatchMVP>) {
        databaseService.getMatchDao.upsertMatches(mergePendingLocalState(remoteMatches))
    }

    private suspend fun persistEmbeddedField(matchDto: MatchApiDto) {
        matchDto.field
            ?.toFieldOrNull()
            ?.let { field -> databaseService.getFieldDao.upsertField(field) }
    }

    private suspend fun persistEmbeddedFields(matchDtos: List<MatchApiDto>) {
        val embeddedFields = matchDtos
            .mapNotNull { matchDto ->
                matchDto.field?.toFieldOrNull()
            }
            .distinctBy(Field::id)
        if (embeddedFields.isNotEmpty()) {
            databaseService.getFieldDao.upsertFields(embeddedFields)
        }
    }

    private fun MatchMVP.toSanitizedForBulk(): MatchMVP {
        val normalizedAssignments = normalizedOfficialAssignmentsForSync()
        val primaryOfficial = normalizedAssignments
            .firstOrNull { assignment -> assignment.holderType == OfficialAssignmentHolderType.OFFICIAL }
        return copy(
            team1Id = sanitizeTeamId(team1Id),
            team2Id = sanitizeTeamId(team2Id),
            teamOfficialId = sanitizeTeamId(teamOfficialId),
            officialId = if (normalizedAssignments.isNotEmpty()) {
                primaryOfficial?.userId
            } else {
                normalizeOptionalToken(officialId)
            },
            fieldId = normalizeOptionalToken(fieldId),
            previousLeftId = sanitizeMatchRef(previousLeftId),
            previousRightId = sanitizeMatchRef(previousRightId),
            winnerNextMatchId = sanitizeMatchRef(winnerNextMatchId),
            loserNextMatchId = sanitizeMatchRef(loserNextMatchId),
            division = normalizeOptionalToken(division),
            officialCheckedIn = if (normalizedAssignments.isNotEmpty()) {
                primaryOfficial?.checkedIn == true
            } else {
                officialCheckedIn
            },
            officialIds = normalizedAssignments,
        )
    }

    /**
     * Bulk PATCH must not turn every absent nullable field into a clear. Since MatchMVP does not
     * carry presence bits, a null is sent only when this edit changed a cached non-null value to
     * null. A missing cache entry remains omission-only.
     */
    private fun MatchMVP.explicitlyClearedBulkFields(
        cached: MatchMVP?,
        submitted: MatchMVP,
    ): Set<String> {
        if (cached == null) return emptySet()
        return buildSet {
            fun addWhenCleared(
                field: String,
                previous: Any?,
                current: Any?,
                explicitlyCleared: Boolean = true,
            ) {
                if (previous != null && current == null && explicitlyCleared) add(field)
            }

            // Sanitizing a local placeholder must omit it rather than clearing a persisted team.
            addWhenCleared(
                "team1Id",
                cached.team1Id,
                team1Id,
                submitted.team1Id.isNullOrBlank(),
            )
            addWhenCleared(
                "team2Id",
                cached.team2Id,
                team2Id,
                submitted.team2Id.isNullOrBlank(),
            )
            addWhenCleared("team1Seed", cached.team1Seed, team1Seed)
            addWhenCleared("team2Seed", cached.team2Seed, team2Seed)
            addWhenCleared("officialId", cached.officialId, officialId)
            addWhenCleared("teamOfficialId", cached.teamOfficialId, teamOfficialId)
            addWhenCleared("fieldId", cached.fieldId, fieldId)
            addWhenCleared("previousLeftId", cached.previousLeftId, previousLeftId)
            addWhenCleared("previousRightId", cached.previousRightId, previousRightId)
            addWhenCleared("winnerNextMatchId", cached.winnerNextMatchId, winnerNextMatchId)
            addWhenCleared("loserNextMatchId", cached.loserNextMatchId, loserNextMatchId)
            addWhenCleared("side", cached.side, side)
            addWhenCleared("officialCheckedIn", cached.officialCheckedIn, officialCheckedIn)
            addWhenCleared("start", cached.start, start)
            addWhenCleared("end", cached.end, end)
            addWhenCleared("division", cached.division, division)
            addWhenCleared("matchRulesSnapshot", cached.matchRulesSnapshot, matchRulesSnapshot)
            addWhenCleared("resolvedMatchRules", cached.resolvedMatchRules, resolvedMatchRules)
        }
    }

    private fun BulkMatchUpdateEntryDto.toPresenceAwareJson(clearFields: Set<String>): JsonObject {
        val encoded = jsonMVP.encodeToJsonElement(this).jsonObject
        if (clearFields.isEmpty()) return encoded
        return buildJsonObject {
            encoded.forEach { (key, value) -> put(key, value) }
            clearFields.filterNot(encoded::containsKey).forEach { field -> put(field, JsonNull) }
        }
    }

    private fun MatchMVP.toSegmentOperations(): List<MatchSegmentOperationDto>? =
        segments
            .takeIf { it.isNotEmpty() }
            ?.map { segment ->
                MatchSegmentOperationDto(
                    id = segment.id,
                    sequence = segment.sequence,
                    status = segment.status,
                    scores = segment.scores,
                    winnerEventTeamId = segment.winnerEventTeamId,
                    startedAt = segment.startedAt,
                    endedAt = segment.endedAt,
                    resultType = segment.resultType,
                    statusReason = segment.statusReason,
                )
            }

    private suspend fun nextClientSequence(): Long =
        databaseService.getMatchOperationOutboxDao.maxClientSequence() + 1L

    private fun MatchSegmentOperationDto.withClientOperation(entry: MatchOperationOutboxEntry): MatchSegmentOperationDto =
        copy(
            clientOperationId = entry.id,
            clientDeviceId = entry.clientDeviceId,
            clientCreatedAt = entry.clientCreatedAt,
            clientSequence = entry.clientSequence,
            sourceDevice = entry.sourceDevice,
        )

    private fun MatchIncidentOperationDto.withClientOperation(entry: MatchOperationOutboxEntry): MatchIncidentOperationDto =
        copy(
            id = id ?: if (action.equals("CREATE", ignoreCase = true)) entry.id else id,
            clientOperationId = entry.id,
            clientDeviceId = entry.clientDeviceId,
            clientCreatedAt = entry.clientCreatedAt,
            clientSequence = entry.clientSequence,
            sourceDevice = entry.sourceDevice,
        )

    private fun MatchUpdateDto.withClientOperation(entry: MatchOperationOutboxEntry): MatchUpdateDto =
        copy(
            segmentOperations = segmentOperations?.map { operation -> operation.withClientOperation(entry) },
            incidentOperations = incidentOperations?.map { operation -> operation.withClientOperation(entry) },
            clientOperationId = entry.id,
            clientDeviceId = entry.clientDeviceId,
            clientCreatedAt = entry.clientCreatedAt,
            clientSequence = entry.clientSequence,
            sourceDevice = entry.sourceDevice,
        )

    private fun MatchScoreSetDto.withClientOperation(entry: MatchOperationOutboxEntry): MatchScoreSetDto =
        copy(
            clientOperationId = entry.id,
            clientDeviceId = entry.clientDeviceId,
            clientCreatedAt = entry.clientCreatedAt,
            clientSequence = entry.clientSequence,
            sourceDevice = entry.sourceDevice,
        )

    private suspend fun newOutboxEntry(
        match: MatchMVP,
        operationKind: String,
        payloadJson: String,
    ): MatchOperationOutboxEntry {
        val sequence = nextClientSequence()
        val now = Clock.System.now().toString()
        val clientDeviceId = currentUserDataSource?.getOrCreateMatchOperationDeviceId()
            ?: (fallbackClientDeviceId ?: newId().also { fallbackClientDeviceId = it })
        return MatchOperationOutboxEntry(
            id = "$clientDeviceId:${match.id}:$sequence",
            eventId = match.eventId,
            matchId = match.id,
            operationKind = operationKind,
            payloadJson = payloadJson,
            sourceDevice = LOCAL_OPERATION_SOURCE_DEVICE,
            clientDeviceId = clientDeviceId,
            clientSequence = sequence,
            clientCreatedAt = now,
        )
    }

    private suspend fun enqueueMatchUpdate(
        match: MatchMVP,
        update: MatchUpdateDto,
    ): MatchMVP = processOutboxEnqueueMutex.withLock {
        val provisional = newOutboxEntry(
            match = match,
            operationKind = MATCH_OPERATION_KIND_UPDATE,
            payloadJson = "{}",
        )
        val payload = update.withClientOperation(provisional)
        val entry = provisional.copy(payloadJson = payload.toMatchOperationsJsonObject().toString())
        val localMatch = match.applyLocalMatchUpdate(payload)
        databaseService.enqueueMatchOperationAndOptimisticMatch(entry, localMatch)
        scheduleWatchOperationSync(entry)
        scheduleMatchOperationSync(match.id)
        return localMatch
    }

    private suspend fun enqueueScoreSet(
        match: MatchMVP,
        scoreSet: MatchScoreSetDto,
    ): MatchMVP = processOutboxEnqueueMutex.withLock {
        val provisional = newOutboxEntry(
            match = match,
            operationKind = MATCH_OPERATION_KIND_SCORE_SET,
            payloadJson = "{}",
        )
        val payload = scoreSet.withClientOperation(provisional)
        val entry = provisional.copy(payloadJson = jsonMVP.encodeToString(payload))
        val localMatch = match.applyLocalScoreSet(payload)
        databaseService.enqueueMatchOperationAndOptimisticMatch(entry, localMatch)
        scheduleWatchOperationSync(entry)
        scheduleMatchOperationSync(match.id)
        return localMatch
    }

    private fun scheduleWatchOperationSync(operation: MatchOperationOutboxEntry) {
        scope.launch {
            runCatching { watchMatchOperationSync.sendOperation(operation) }
                .onFailure { error ->
                    Napier.d("Skipping phone-to-watch match operation ${operation.id}: ${error.message}")
                }
        }
    }

    private fun scheduleMatchOperationSync(matchId: String) {
        if (autoSyncOperations) {
            scope.launch { syncPendingMatchOperations(matchId) }
        }
    }

    private fun scheduleMatchOperationRetry() {
        if (!autoSyncOperations || outboxRetryJob?.isActive == true) return
        outboxRetryJob = scope.launch {
            while (currentCoroutineContext().isActive) {
                delay(5_000)
                syncPendingMatchOperations()
                if (databaseService.getMatchOperationOutboxDao.pendingOperationCount() == 0) {
                    return@launch
                }
            }
        }
    }

    private fun applyOutboxOperationLocally(match: MatchMVP, operation: MatchOperationOutboxEntry): MatchMVP =
        when (operation.operationKind) {
            MATCH_OPERATION_KIND_SCORE_SET -> {
                val scoreSet = jsonMVP.decodeFromString<MatchScoreSetDto>(operation.payloadJson)
                match.applyLocalScoreSet(scoreSet)
            }
            else -> {
                val update = matchUpdateDtoFromPayload(operation.payloadJson)
                match.applyLocalMatchUpdate(update)
            }
        }

    private fun matchUpdateDtoFromPayload(payloadJson: String): MatchUpdateDto {
        val payload = jsonMVP.parseToJsonElement(payloadJson).jsonObject
        val decoded = jsonMVP.decodeFromJsonElement(MatchUpdateDto.serializer(), payload)
        return decoded.copy(
            lifecycle = decoded.lifecycle?.withExplicitNullFlags(payload["lifecycle"] as? JsonObject),
            segmentOperations = decoded.segmentOperations?.mapIndexed { index, operation ->
                val operationPayload = (payload["segmentOperations"] as? JsonArray)
                    ?.getOrNull(index) as? JsonObject
                operation.withExplicitNullFlags(operationPayload)
            },
        )
    }

    private fun JsonObject.hasExplicitNull(key: String): Boolean = this[key] == JsonNull

    private fun MatchLifecycleOperationDto.withExplicitNullFlags(payload: JsonObject?): MatchLifecycleOperationDto =
        if (payload == null) {
            this
        } else {
            copy(
                clearActualStart = payload.hasExplicitNull("actualStart"),
                clearActualEnd = payload.hasExplicitNull("actualEnd"),
            )
        }

    private fun MatchSegmentOperationDto.withExplicitNullFlags(payload: JsonObject?): MatchSegmentOperationDto =
        if (payload == null) {
            this
        } else {
            copy(
                clearStartedAt = payload.hasExplicitNull("startedAt"),
                clearEndedAt = payload.hasExplicitNull("endedAt"),
                clearWinnerEventTeamId = payload.hasExplicitNull("winnerEventTeamId"),
                clearResultType = payload.hasExplicitNull("resultType"),
                clearStatusReason = payload.hasExplicitNull("statusReason"),
            )
        }

    private suspend fun syncOutboxOperation(operation: MatchOperationOutboxEntry): Boolean {
        val dao = databaseService.getMatchOperationOutboxDao
        if (operation.status == MATCH_OPERATION_STATUS_RECONCILING) {
            return reconcileRejectedOperation(dao, operation)
        }
        val attemptAt = Clock.System.now().toString()
        dao.markAttempting(operation.id, attemptAt)
        return try {
            val remoteMatch = sendOutboxOperation(operation)
            // Persist canonical state before ACK. If the process dies after this write, the
            // durable operation is safely replayed through the server receipt rather than
            // leaving a stale optimistic match with no reconciliation path.
            upsertRemoteMatchPreservingPendingIncidents(
                remoteMatch = remoteMatch,
                excludedOperationId = operation.id,
            )
            dao.markAcked(operation.id, Clock.System.now().toString())
            true
        } catch (error: CancellationException) {
            throw error
        } catch (error: ApiException) {
            if (isTerminalMatchActionConflict(operation, error)) {
                val rejectedOperation = markOutboxOperationReconciling(
                    dao = dao,
                    operation = operation,
                    message = "Match action was rejected because the match is already completed or cancelled",
                )
                reconcileRejectedOperation(
                    dao = dao,
                    operation = rejectedOperation,
                )
            } else if (error.statusCode in 400..499 && error.statusCode !in setOf(408, 429)) {
                val message = error.message ?: "Match operation was rejected"
                val rejectedOperation = markOutboxOperationReconciling(dao, operation, message)
                val reconciled = reconcileRejectedOperation(dao, rejectedOperation)
                Napier.w("Rejected terminal match operation ${operation.id}: $message")
                reconciled
            } else {
                markOutboxOperationFailed(dao, operation, error)
                false
            }
        } catch (error: Throwable) {
            markOutboxOperationFailed(dao, operation, error)
            false
        }
    }

    /** Persist terminal rejection before the network read so relaunches never re-POST it. */
    private suspend fun markOutboxOperationReconciling(
        dao: com.razumly.mvp.core.data.dataTypes.daos.MatchOperationOutboxDao,
        operation: MatchOperationOutboxEntry,
        message: String,
    ): MatchOperationOutboxEntry {
        dao.markFailed(
            id = operation.id,
            error = message,
            failedAt = Clock.System.now().toString(),
            status = MATCH_OPERATION_STATUS_RECONCILING,
        )
        return operation.copy(
            status = MATCH_OPERATION_STATUS_RECONCILING,
            lastError = message,
        )
    }

    /** A terminal write failure must never be replayed; retry only the authoritative read. */
    private suspend fun reconcileRejectedOperation(
        dao: com.razumly.mvp.core.data.dataTypes.daos.MatchOperationOutboxDao,
        operation: MatchOperationOutboxEntry,
    ): Boolean = runCatching {
        val remoteMatch = fetchRemoteMatch(operation.eventId, operation.matchId)
        // Exclude the rejected overlay while it is still durable, then ACK only after the
        // canonical replacement is stored. Either crash point remains reconcilable.
        upsertRemoteMatchPreservingPendingIncidents(
            remoteMatch = remoteMatch,
            excludedOperationId = operation.id,
        )
        dao.markAcked(operation.id, Clock.System.now().toString())
        true
    }.getOrElse { fetchError ->
        if (fetchError is CancellationException) throw fetchError
        val message = operation.lastError
            ?: "Match operation was rejected and awaits reconciliation"
        dao.markFailed(
            id = operation.id,
            error = "$message; reconciliation failed: ${fetchError.message.orEmpty()}",
            failedAt = Clock.System.now().toString(),
            status = MATCH_OPERATION_STATUS_RECONCILING,
        )
        Napier.w("Unable to reconcile rejected match operation ${operation.id}: ${fetchError.message}")
        false
    }

    private suspend fun markOutboxOperationFailed(
        dao: com.razumly.mvp.core.data.dataTypes.daos.MatchOperationOutboxDao,
        operation: MatchOperationOutboxEntry,
        error: Throwable,
    ) {
        val message = error.message ?: error::class.simpleName ?: "Match operation sync failed"
        dao.markFailed(
            id = operation.id,
            error = message,
            failedAt = Clock.System.now().toString(),
            status = MATCH_OPERATION_STATUS_FAILED,
        )
        Napier.w("Failed to sync match operation ${operation.id}: $message")
    }

    private fun isTerminalMatchActionConflict(
        operation: MatchOperationOutboxEntry,
        error: ApiException,
    ): Boolean {
        if (operation.operationKind != MATCH_OPERATION_KIND_UPDATE) return false
        if (error.statusCode != 409) return false
        val responseBody = error.responseBody.orEmpty()
        if (!responseBody.contains("Completed or cancelled matches cannot be changed from match actions", ignoreCase = true)) {
            return false
        }
        return runCatching {
            jsonMVP.parseToJsonElement(operation.payloadJson)
                .jsonObject["matchAction"] is JsonObject
        }.getOrDefault(false)
    }

    private suspend fun sendOutboxOperation(operation: MatchOperationOutboxEntry): MatchMVP {
        val responseMatch = when (operation.operationKind) {
            MATCH_OPERATION_KIND_SCORE_SET -> {
                val scoreSet = jsonMVP.decodeFromString<MatchScoreSetDto>(operation.payloadJson)
                api.post<MatchScoreSetDto, MatchResponseDto>(
                    path = "api/events/${operation.eventId}/matches/${operation.matchId}/score",
                    body = scoreSet,
                ).match ?: error("Score set response missing match")
            }
            else -> {
                val payload = jsonMVP.parseToJsonElement(operation.payloadJson).jsonObject
                api.patch<JsonObject, MatchResponseDto>(
                    path = "api/events/${operation.eventId}/matches/${operation.matchId}",
                    body = payload,
                ).match ?: error("Match operations response missing match")
            }
        }
        persistEmbeddedField(responseMatch)
        return responseMatch.toMatchOrNull() ?: error("Match operations response missing match")
    }

    private suspend fun fetchRemoteMatches(tournamentId: String): List<MatchMVP> {
        val responseMatches = api.get<MatchesResponseDto>("api/events/$tournamentId/matches").matches
        persistEmbeddedFields(responseMatches)
        return responseMatches.mapNotNull { it.toMatchOrNull() }
    }

    private suspend fun fetchRemoteMatch(eventId: String, matchId: String): MatchMVP {
        val detailMatch = runCatching {
            val responseMatch = api.get<MatchResponseDto>("api/events/$eventId/matches/$matchId").match
            if (responseMatch != null) {
                persistEmbeddedField(responseMatch)
            }
            responseMatch?.toMatchOrNull()
        }.onFailure { error ->
            Napier.w(
                "Failed to refresh match $matchId from detail endpoint; falling back to event matches: ${error.message}"
            )
        }.getOrNull()
        if (detailMatch != null) {
            return detailMatch
        }

        val res = api.get<MatchesResponseDto>("api/events/$eventId/matches")
        persistEmbeddedFields(res.matches)
        return res.matches.firstOrNull { (it.id ?: it.legacyId) == matchId }?.toMatchOrNull()
            ?: error("Match $matchId not found")
    }

    private suspend fun refreshMatchesFromRemote(tournamentId: String): List<MatchMVP> {
        val localMatches = databaseService.getMatchDao.getMatchesOfTournament(tournamentId)
        val remoteMatches = mergePendingLocalState(fetchRemoteMatches(tournamentId))
        val staleIds = localMatches.map { it.id }.toSet() - remoteMatches.map { it.id }.toSet()
        if (staleIds.isNotEmpty()) {
            databaseService.getMatchDao.deleteMatchesById(staleIds.toList())
        }
        if (remoteMatches.isNotEmpty()) {
            databaseService.getMatchDao.upsertMatches(remoteMatches)
            return remoteMatches
        }
        return localMatches
    }

    private suspend fun fetchMatchRealtimeToken(eventId: String): String {
        val response = api.get<MatchRealtimeTokenResponseDto>(
            "api/realtime/matches/token?eventId=${eventId.encodeURLQueryComponent()}"
        )
        return normalizeOptionalToken(response.token)
            ?: error("Match realtime token response missing token")
    }

    private suspend fun handleMatchRealtimeMessage(eventId: String, text: String) {
        val message = runCatching {
            jsonMVP.decodeFromString<MatchRealtimeMessageDto>(text)
        }.getOrElse { error ->
            Napier.w("Ignoring malformed match realtime message: ${error.message}")
            return
        }
        if (message.type != "match.changed") {
            return
        }
        if (normalizeOptionalToken(message.eventId) != eventId) {
            return
        }

        persistEmbeddedFields(message.matches)
        val remoteMatches = message.matches.mapNotNull { match -> match.toMatchOrNull() }
        if (remoteMatches.isNotEmpty()) {
            upsertRemoteMatchesPreservingPendingIncidents(remoteMatches)
        }

        val deletedIds = message.deleted.mapNotNull { id -> normalizeOptionalToken(id) }
        if (deletedIds.isNotEmpty()) {
            databaseService.getMatchDao.deleteMatchesById(deletedIds)
        }
    }

    private suspend fun runMatchRealtimeLoop(eventId: String) {
        var reconnectDelayMs = 1_000L
        while (
            currentCoroutineContext().isActive &&
            realtimeEventId == eventId &&
            activeRealtimeEventId == eventId &&
            !isRealtimePaused()
        ) {
            try {
                val token = fetchMatchRealtimeToken(eventId)
                val path = buildString {
                    append("api/realtime/matches?eventId=")
                    append(eventId.encodeURLQueryComponent())
                    append("&token=")
                    append(token.encodeURLQueryComponent())
                }
                api.webSocket(path) {
                    reconnectDelayMs = 1_000L
                    for (frame in incoming) {
                        if (frame is Frame.Text) {
                            handleMatchRealtimeMessage(eventId, frame.readText())
                        }
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: ApiException) {
                if (error.statusCode == 401 || error.statusCode == 403 || error.statusCode == 404) {
                    Napier.w(
                        "Match realtime subscription stopped for event $eventId: HTTP ${error.statusCode}"
                    )
                    if (realtimeEventId == eventId) {
                        realtimeEventId = null
                    }
                    if (activeRealtimeEventId == eventId) {
                        activeRealtimeEventId = null
                    }
                    return
                }
                Napier.w("Match realtime socket disconnected for event $eventId: ${error.message}")
            } catch (error: Throwable) {
                Napier.w("Match realtime socket disconnected for event $eventId: ${error.message}")
            }

            if (
                currentCoroutineContext().isActive &&
                realtimeEventId == eventId &&
                activeRealtimeEventId == eventId &&
                !isRealtimePaused()
            ) {
                runCatching { refreshMatchesFromRemote(eventId) }
                    .onFailure { error ->
                        Napier.w(
                            "Failed to refresh matches after realtime disconnect for event $eventId: ${error.message}"
                        )
                    }
                delay(reconnectDelayMs)
                reconnectDelayMs = (reconnectDelayMs * 2).coerceAtMost(30_000L)
            }
        }
    }

    override suspend fun getMatch(matchId: String): Result<MatchMVP> =
        singleResponse(
            networkCall = {
                val local = databaseService.getMatchDao.getMatchById(matchId)?.match
                    ?: error("Match $matchId not cached; fetch matches for the event first")

                val remoteMatch = fetchRemoteMatch(local.eventId, matchId)
                mergePendingLocalState(remoteMatch, local)
            },
            saveCall = { match -> upsertRemoteMatchPreservingPendingIncidents(match) },
            onReturn = { it },
        )

    override suspend fun saveMatchLocally(match: MatchMVP): Result<Unit> = runCatching {
        databaseService.getMatchDao.upsertMatch(match)
    }

    override fun getMatchFlow(matchId: String): Flow<Result<MatchWithRelations>> {
        val localFlow =
            databaseService.getMatchDao.getMatchFlowById(matchId).map { relation ->
                relation?.let { Result.success(it) }
                    ?: Result.failure(
                        NoSuchElementException("Match $matchId is no longer available in local cache")
                    )
            }
        scope.launch {
            getMatch(matchId)
        }
        return localFlow
    }

    override suspend fun updateMatch(match: MatchMVP): Result<Unit> = singleResponse(
        networkCall = {
            val sanitizedMatch = match.toSanitizedForBulk()
            val responseMatch = api.patch<MatchUpdateDto, MatchResponseDto>(
                path = "api/events/${match.eventId}/matches/${match.id}",
                body = MatchUpdateDto(
                    team1Points = sanitizedMatch.team1Points,
                    team2Points = sanitizedMatch.team2Points,
                    setResults = sanitizedMatch.setResults,
                    segmentOperations = sanitizedMatch.toSegmentOperations(),
                    team1Id = sanitizedMatch.team1Id,
                    team2Id = sanitizedMatch.team2Id,
                    team1Seed = sanitizedMatch.team1Seed,
                    team2Seed = sanitizedMatch.team2Seed,
                    officialId = sanitizedMatch.officialId,
                    officialIds = sanitizedMatch.officialIds,
                    teamOfficialId = sanitizedMatch.teamOfficialId,
                    fieldId = sanitizedMatch.fieldId,
                    previousLeftId = sanitizedMatch.previousLeftId,
                    previousRightId = sanitizedMatch.previousRightId,
                    winnerNextMatchId = sanitizedMatch.winnerNextMatchId,
                    loserNextMatchId = sanitizedMatch.loserNextMatchId,
                    side = sanitizedMatch.side,
                    officialCheckedIn = sanitizedMatch.officialCheckedIn,
                    matchId = sanitizedMatch.matchId,
                    start = sanitizedMatch.start?.toString(),
                    end = sanitizedMatch.end?.toString(),
                    division = sanitizedMatch.division,
                    losersBracket = sanitizedMatch.losersBracket,
                    locked = sanitizedMatch.locked,
                    matchRulesSnapshot = sanitizedMatch.matchRulesSnapshot,
                    resolvedMatchRules = sanitizedMatch.resolvedMatchRules,
                ),
            ).match ?: error("Update match response missing match")
            persistEmbeddedField(responseMatch)
            responseMatch.toMatchOrNull() ?: error("Update match response missing match")
        },
        saveCall = { updatedMatch -> upsertRemoteMatchPreservingPendingIncidents(updatedMatch) },
        onReturn = {},
    )

    override suspend fun updateMatchOperations(
        match: MatchMVP,
        lifecycle: MatchLifecycleOperationDto?,
        segmentOperations: List<MatchSegmentOperationDto>?,
        incidentOperations: List<MatchIncidentOperationDto>?,
        officialCheckIn: MatchOfficialCheckInOperationDto?,
        matchAction: MatchActionOperationDto?,
        finalize: Boolean,
        time: Instant?,
    ): Result<MatchMVP> = runCatching {
        enqueueMatchUpdate(
            match = match,
            update = MatchUpdateDto(
                lifecycle = lifecycle,
                segmentOperations = segmentOperations,
                incidentOperations = incidentOperations,
                officialCheckIn = officialCheckIn,
                matchAction = matchAction,
                finalize = finalize,
                time = time?.toString(),
            ),
        )
    }

    override suspend fun setMatchScore(
        match: MatchMVP,
        segmentId: String?,
        sequence: Int,
        eventTeamId: String,
        points: Int,
    ): Result<MatchMVP> = runCatching {
        enqueueScoreSet(
            match = match,
            scoreSet = MatchScoreSetDto(
                segmentId = segmentId,
                sequence = sequence,
                eventTeamId = eventTeamId,
                points = points,
            ),
        )
    }

    override suspend fun addMatchIncident(
        match: MatchMVP,
        operation: MatchIncidentOperationDto,
    ): Result<MatchMVP> =
        updateMatchOperations(
            match = match,
            incidentOperations = listOf(operation.copy(action = "CREATE")),
        )

    override suspend fun syncPendingMatchOperations(matchId: String?): Result<Int> = runCatching {
        outboxSyncMutex.withLock {
        val dao = databaseService.getMatchOperationOutboxDao
        val pendingOperations = if (matchId == null) {
            dao.getPendingOperations()
        } else {
            dao.getPendingOperationsForMatch(matchId)
        }
        var syncedCount = 0
        for (operation in pendingOperations) {
            val didSync = syncOutboxOperation(operation)
            if (!didSync) {
                scheduleMatchOperationRetry()
                break
            }
            syncedCount += 1
        }
        syncedCount
        }
    }

    override suspend fun updateMatchesBulk(
        matches: List<MatchMVP>,
        creates: List<StagedMatchCreate>,
        deletes: List<String>,
    ): Result<List<MatchMVP>> {
        val normalizedUpdates = matches
            .filter { match -> match.id.isNotBlank() && !match.id.startsWith(CLIENT_MATCH_PREFIX) }
            .map { match -> match.toSanitizedForBulk() }
        val normalizedCreates = creates
            .filter { create -> create.clientId.isNotBlank() }
            .map { create -> create.copy(match = create.match.toSanitizedForBulk()) }
        val normalizedDeletes = deletes
            .mapNotNull { deleteId -> normalizeOptionalToken(deleteId) }
            .filterNot { deleteId -> deleteId.startsWith(CLIENT_MATCH_PREFIX) }
            .distinct()
        if (normalizedUpdates.isEmpty() && normalizedCreates.isEmpty() && normalizedDeletes.isEmpty()) {
            return Result.success(emptyList())
        }

        val eventIds = (normalizedUpdates.map { it.eventId } + normalizedCreates.map { it.match.eventId })
            .distinct()
            .filter(String::isNotBlank)
            .toMutableSet()
        if (eventIds.isEmpty() && normalizedDeletes.isNotEmpty()) {
            normalizedDeletes
                .mapNotNull { deleteId ->
                    databaseService.getMatchDao.getMatchById(deleteId)?.match?.eventId
                        ?.trim()
                        ?.takeIf(String::isNotBlank)
                }
                .forEach { cachedEventId -> eventIds.add(cachedEventId) }
        }
        if (eventIds.size != 1) {
            return Result.failure(IllegalArgumentException("Bulk match update requires matches from one event."))
        }
        val eventId = eventIds.first()

        return runCatching {
            val submittedUpdatesById = matches
                .filter { match -> match.id.isNotBlank() && !match.id.startsWith(CLIENT_MATCH_PREFIX) }
                .associateBy(MatchMVP::id)
            val updateEntries: List<Pair<BulkMatchUpdateEntryDto, Set<String>>> = normalizedUpdates.map { match ->
                val cached = databaseService.getMatchDao.getMatchById(match.id)?.match
                val submitted = submittedUpdatesById[match.id] ?: match
                match.toBulkMatchUpdateEntryDto() to match.explicitlyClearedBulkFields(cached, submitted)
            }
            val createEntries: List<BulkMatchCreateEntryDto> = normalizedCreates.map { create ->
                create.match.toBulkMatchCreateEntryDto(
                    clientId = create.clientId,
                    creationContext = create.creationContext,
                    autoPlaceholderTeam = create.autoPlaceholderTeam,
                )
            }

            val requestBody = buildJsonObject {
                if (updateEntries.isNotEmpty()) {
                    put(
                        "matches",
                        JsonArray(updateEntries.map { (entry, clearFields) ->
                            entry.toPresenceAwareJson(clearFields)
                        }),
                    )
                }
                if (createEntries.isNotEmpty()) {
                    put(
                        "creates",
                        JsonArray(createEntries.map { entry -> jsonMVP.encodeToJsonElement(entry) }),
                    )
                }
                if (normalizedDeletes.isNotEmpty()) {
                    put("deletes", JsonArray(normalizedDeletes.map(::JsonPrimitive)))
                }
            }
            val response = api.patch<JsonObject, BulkMatchesResponseDto>(
                path = "api/events/$eventId/matches",
                body = requestBody,
            )

            persistEmbeddedFields(response.matches)
            val updatedMatches = response.matches.mapNotNull { it.toMatchOrNull() }
            if (updatedMatches.isNotEmpty()) {
                upsertRemoteMatchesPreservingPendingIncidents(updatedMatches)
            }
            val deletedIds = response.deleted
                .mapNotNull { deletedId -> normalizeOptionalToken(deletedId) }
                .ifEmpty { normalizedDeletes }
            if (deletedIds.isNotEmpty()) {
                databaseService.getMatchDao.deleteMatchesById(deletedIds)
            }

            val requestedIds = buildSet {
                normalizedUpdates.forEach { add(it.id) }
                response.created.values
                    .mapNotNull { createdId -> normalizeOptionalToken(createdId) }
                    .forEach { persistedId -> add(persistedId) }
                updatedMatches.forEach { match -> add(match.id) }
            }.toMutableSet().apply { removeAll(deletedIds.toSet()) }
            if (requestedIds.isEmpty()) {
                emptyList()
            } else {
                databaseService.getMatchDao.getMatchesOfTournament(eventId)
                    .filter { match -> requestedIds.contains(match.id) }
            }
        }
    }

    override fun getMatchesOfTournamentFlow(tournamentId: String): Flow<Result<List<MatchWithRelations>>> =
        callbackFlow {
            val localJob = launch {
                databaseService.getMatchDao.getMatchesFlowOfTournament(tournamentId)
                    .collect { trySend(Result.success(it)) }
            }

            val remoteJob = launch {
                runCatching { refreshMatchesFromRemote(tournamentId) }
                    .onFailure { error ->
                        Napier.w(
                            "Failed to refresh matches for event $tournamentId; keeping cached matches: ${error.message}"
                        )
                    }
            }

            awaitClose {
                localJob.cancel()
                remoteJob.cancel()
            }
        }

    override fun getCachedMatchesOfTournamentFlow(tournamentId: String): Flow<Result<List<MatchWithRelations>>> {
        val normalizedTournamentId = tournamentId.trim()
        if (normalizedTournamentId.isEmpty()) {
            return flowOf(Result.success(emptyList()))
        }
        return databaseService.getMatchDao.getMatchesFlowOfTournament(normalizedTournamentId)
            .map { matches -> Result.success(matches) }
    }

    override suspend fun updateMatchFinished(match: MatchMVP, time: Instant): Result<Unit> =
        updateMatchOperations(
            match = match,
            segmentOperations = match.toSegmentOperations(),
            finalize = true,
            time = time,
        )
            .map { }

    override suspend fun getMatchesOfTournament(tournamentId: String): Result<List<MatchMVP>> =
        runCatching {
            refreshMatchesFromRemote(tournamentId)
        }.recoverCatching { error ->
            Napier.w(
                "Remote matches load failed for event $tournamentId; returning cached matches: ${error.message}"
            )
            databaseService.getMatchDao.getMatchesOfTournament(tournamentId)
        }

    override suspend fun getMatchesByEventIds(
        eventIds: List<String>,
        fieldIds: List<String>?,
        rangeStart: Instant?,
        rangeEnd: Instant?,
    ): Result<List<MatchMVP>> = runCatching {
        val normalizedEventIds = eventIds
            .mapNotNull { eventId -> normalizeOptionalToken(eventId) }
            .distinct()
        if (normalizedEventIds.isEmpty()) {
            return@runCatching emptyList()
        }

        val normalizedFieldIds = fieldIds
            .orEmpty()
            .mapNotNull { fieldId -> normalizeOptionalToken(fieldId) }
            .distinct()

        val aggregatedMatches = mutableListOf<MatchMVP>()
        normalizedEventIds.chunked(100).forEach { eventIdChunk ->
            val query = buildList {
                add(
                    "eventIds=${
                        eventIdChunk.joinToString(",").encodeURLQueryComponent()
                    }"
                )
                if (normalizedFieldIds.isNotEmpty()) {
                    add(
                        "fieldIds=${
                            normalizedFieldIds.joinToString(",").encodeURLQueryComponent()
                        }"
                    )
                }
                rangeStart?.let { start -> add("start=${start.toString().encodeURLQueryComponent()}") }
                rangeEnd?.let { end -> add("end=${end.toString().encodeURLQueryComponent()}") }
            }.joinToString("&")
            val responseMatches = api.get<MatchesResponseDto>("api/matches?$query").matches
            persistEmbeddedFields(responseMatches)
            val fetchedMatches = responseMatches.mapNotNull { match -> match.toMatchOrNull() }
            aggregatedMatches.addAll(fetchedMatches)
        }

        val dedupedMatches = mergePendingLocalState(aggregatedMatches.distinctBy { match -> match.id })
        if (dedupedMatches.isNotEmpty()) {
            databaseService.getMatchDao.upsertMatches(dedupedMatches)
        }
        dedupedMatches
    }

    override suspend fun getEventTeamCheckIns(eventId: String): Result<TeamCheckInsResponseDto> = runCatching {
        val normalizedEventId = normalizeOptionalToken(eventId)
            ?: error("Event check-ins require an event id")
        api.get("api/events/$normalizedEventId/team-check-ins")
    }

    override suspend fun checkInEventTeam(eventId: String, eventTeamId: String): Result<TeamCheckInDto> = runCatching {
        val normalizedEventId = normalizeOptionalToken(eventId)
            ?: error("Event check-in requires an event id")
        val normalizedEventTeamId = normalizeOptionalToken(eventTeamId)
            ?: error("Event check-in requires an event team id")
        api.post<TeamCheckInRequestDto, TeamCheckInResponseDto>(
            path = "api/events/$normalizedEventId/team-check-ins",
            body = TeamCheckInRequestDto(eventTeamId = normalizedEventTeamId),
        ).checkIn ?: error("Event check-in response missing check-in")
    }

    override suspend fun getMatchTeamCheckIns(eventId: String, matchId: String): Result<TeamCheckInsResponseDto> =
        runCatching {
            val normalizedEventId = normalizeOptionalToken(eventId)
                ?: error("Match check-ins require an event id")
            val normalizedMatchId = normalizeOptionalToken(matchId)
                ?: error("Match check-ins require a match id")
            api.get("api/events/$normalizedEventId/matches/$normalizedMatchId/team-check-ins")
        }

    override suspend fun checkInMatchTeam(
        eventId: String,
        matchId: String,
        eventTeamId: String,
    ): Result<TeamCheckInDto> = runCatching {
        val normalizedEventId = normalizeOptionalToken(eventId)
            ?: error("Match check-in requires an event id")
        val normalizedMatchId = normalizeOptionalToken(matchId)
            ?: error("Match check-in requires a match id")
        val normalizedEventTeamId = normalizeOptionalToken(eventTeamId)
            ?: error("Match check-in requires an event team id")
        api.post<TeamCheckInRequestDto, TeamCheckInResponseDto>(
            path = "api/events/$normalizedEventId/matches/$normalizedMatchId/team-check-ins",
            body = TeamCheckInRequestDto(eventTeamId = normalizedEventTeamId),
        ).checkIn ?: error("Match check-in response missing check-in")
    }

    override suspend fun getMatchRosters(eventId: String, matchId: String): Result<MatchRostersResponseDto> =
        runCatching {
            val normalizedEventId = normalizeOptionalToken(eventId)
                ?: error("Match rosters require an event id")
            val normalizedMatchId = normalizeOptionalToken(matchId)
                ?: error("Match rosters require a match id")
            api.get("api/events/$normalizedEventId/matches/$normalizedMatchId/roster")
        }

    override suspend fun removeMatchRosterPlayer(
        eventId: String,
        matchId: String,
        eventTeamId: String,
        userId: String,
    ): Result<MatchRosterDto> = updateMatchRoster(
        eventId = eventId,
        matchId = matchId,
    ) {
        MatchRosterOperationRequestDto(
            eventTeamId = requireRosterEventTeamId(eventTeamId),
            removePlayer = MatchRosterPlayerRequestDto(userId = requireRosterUserId(userId)),
        )
    }

    override suspend fun restoreMatchRosterPlayer(
        eventId: String,
        matchId: String,
        eventTeamId: String,
        userId: String,
    ): Result<MatchRosterDto> = updateMatchRoster(
        eventId = eventId,
        matchId = matchId,
    ) {
        MatchRosterOperationRequestDto(
            eventTeamId = requireRosterEventTeamId(eventTeamId),
            restorePlayer = MatchRosterPlayerRequestDto(userId = requireRosterUserId(userId)),
        )
    }

    override suspend fun addTemporaryMatchRosterPlayer(
        eventId: String,
        matchId: String,
        eventTeamId: String,
        firstName: String?,
        lastName: String?,
        email: String?,
        entryId: String?,
    ): Result<MatchRosterDto> = updateMatchRoster(
        eventId = eventId,
        matchId = matchId,
    ) {
        MatchRosterOperationRequestDto(
            eventTeamId = requireRosterEventTeamId(eventTeamId),
            addPlayer = MatchRosterAddPlayerRequestDto(
                firstName = firstName?.trim()?.takeIf(String::isNotEmpty),
                lastName = lastName?.trim()?.takeIf(String::isNotEmpty),
                email = email?.trim()?.takeIf(String::isNotEmpty),
                entryId = entryId?.trim()?.takeIf(String::isNotEmpty),
            ),
        )
    }

    private suspend fun updateMatchRoster(
        eventId: String,
        matchId: String,
        buildOperation: () -> MatchRosterOperationRequestDto,
    ): Result<MatchRosterDto> = runCatching {
        val normalizedEventId = normalizeOptionalToken(eventId)
            ?: error("Match roster update requires an event id")
        val normalizedMatchId = normalizeOptionalToken(matchId)
            ?: error("Match roster update requires a match id")
        api.post<MatchRosterOperationRequestDto, MatchRosterResponseDto>(
            path = "api/events/$normalizedEventId/matches/$normalizedMatchId/roster",
            body = buildOperation(),
        ).roster ?: error("Match roster response missing roster")
    }

    private fun requireRosterEventTeamId(eventTeamId: String): String =
        normalizeOptionalToken(eventTeamId) ?: error("Match roster update requires an event team id")

    private fun requireRosterUserId(userId: String): String =
        normalizeOptionalToken(userId) ?: error("Match roster update requires a user id")

    override suspend fun deleteMatchesOfTournament(tournamentId: String): Result<Unit> = runCatching {
        val normalizedId = tournamentId.trim()
        if (normalizedId.isEmpty()) {
            error("Delete matches requires a tournament id")
        }
        api.deleteNoResponse("api/events/$normalizedId/matches")
        databaseService.getMatchDao.deleteMatchesOfTournament(normalizedId)
    }

    override suspend fun subscribeToMatches(eventId: String): Result<Unit> = runCatching {
        val normalizedEventId = normalizeOptionalToken(eventId)
            ?: error("Match realtime subscription requires an event id")
        if (realtimeEventId == normalizedEventId && realtimeJob?.isActive == true) {
            return@runCatching
        }
        realtimeEventId = normalizedEventId
        startRealtimeJobIfAllowed()
    }

    override suspend fun unsubscribeFromRealtime(): Result<Unit> = runCatching {
        realtimeEventId = null
        cancelRealtimeJob()
    }

    override fun setRealtimePaused(reason: String, paused: Boolean): Result<Unit> = runCatching {
        val normalizedReason = normalizeOptionalToken(reason)
            ?: error("Match realtime pause requires a reason")
        val wasPaused = isRealtimePaused()
        realtimePauseReasons.update { reasons ->
            if (paused) {
                reasons + normalizedReason
            } else {
                reasons - normalizedReason
            }
        }
        val isPaused = isRealtimePaused()
        if (isPaused) {
            cancelRealtimeJob()
        } else {
            startRealtimeJobIfAllowed(refreshBeforeConnect = wasPaused)
        }
    }

    override fun setIgnoreMatch(match: MatchMVP?) = runCatching { _ignoreMatch.value = match }
}
