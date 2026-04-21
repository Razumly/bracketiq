package com.razumly.mvp.eventDetail.data

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.MatchIncidentMVP
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.OfficialAssignmentHolderType
import com.razumly.mvp.core.data.dataTypes.normalizedMatchOfficialAssignments
import com.razumly.mvp.core.data.repositories.IMVPRepository
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.BulkMatchCreateEntryDto
import com.razumly.mvp.core.network.dto.BulkMatchUpdateEntryDto
import com.razumly.mvp.core.network.dto.BulkMatchUpdateRequestDto
import com.razumly.mvp.core.network.dto.BulkMatchesResponseDto
import com.razumly.mvp.core.network.dto.MatchIncidentOperationDto
import com.razumly.mvp.core.network.dto.MatchLifecycleOperationDto
import com.razumly.mvp.core.network.dto.MatchOfficialCheckInOperationDto
import com.razumly.mvp.core.network.dto.MatchResponseDto
import com.razumly.mvp.core.network.dto.MatchScoreSetDto
import com.razumly.mvp.core.network.dto.MatchSegmentOperationDto
import com.razumly.mvp.core.network.dto.MatchUpdateDto
import com.razumly.mvp.core.network.dto.MatchesResponseDto
import com.razumly.mvp.core.network.dto.toBulkMatchCreateEntryDto
import com.razumly.mvp.core.network.dto.toBulkMatchUpdateEntryDto
import io.ktor.http.encodeURLQueryComponent
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

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
    suspend fun updateMatchesBulk(
        matches: List<MatchMVP>,
        creates: List<StagedMatchCreate> = emptyList(),
        deletes: List<String> = emptyList(),
    ): Result<List<MatchMVP>>
    fun getMatchesOfTournamentFlow(tournamentId: String): Flow<Result<List<MatchWithRelations>>>
    suspend fun updateMatchFinished(match: MatchMVP, time: Instant): Result<Unit>
    suspend fun getMatchesOfTournament(tournamentId: String): Result<List<MatchMVP>>
    suspend fun getMatchesByEventIds(
        eventIds: List<String>,
        fieldIds: List<String>? = null,
        rangeStart: Instant? = null,
        rangeEnd: Instant? = null,
    ): Result<List<MatchMVP>>
    suspend fun deleteMatchesOfTournament(tournamentId: String): Result<Unit>
    suspend fun subscribeToMatches(): Result<Unit>
    suspend fun unsubscribeFromRealtime(): Result<Unit>
    fun setIgnoreMatch(match: MatchMVP?): Result<Unit>
}

@OptIn(ExperimentalTime::class)
class MatchRepository(
    private val api: MvpApiClient,
    private val databaseService: DatabaseService,
) : IMatchRepository {
    private companion object {
        const val CLIENT_MATCH_PREFIX = "client:"
        const val LOCAL_PLACEHOLDER_PREFIX = "placeholder-local:"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var _ignoreMatch = MutableStateFlow<MatchMVP?>(null)

    private fun normalizeOptionalToken(value: String?): String? =
        value?.trim()?.takeIf(String::isNotBlank)

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
            mergePendingLocalIncidents(remote, localMatchesById[remote.id])
        }
    }

    private suspend fun upsertRemoteMatchPreservingPendingIncidents(remoteMatch: MatchMVP) {
        val localMatch = databaseService.getMatchDao.getMatchById(remoteMatch.id)?.match
        databaseService.getMatchDao.upsertMatch(mergePendingLocalIncidents(remoteMatch, localMatch))
    }

    private suspend fun upsertRemoteMatchesPreservingPendingIncidents(remoteMatches: List<MatchMVP>) {
        databaseService.getMatchDao.upsertMatches(mergePendingLocalIncidents(remoteMatches))
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

    private suspend fun fetchRemoteMatches(tournamentId: String): List<MatchMVP> {
        return api.get<MatchesResponseDto>("api/events/$tournamentId/matches")
            .matches
            .mapNotNull { it.toMatchOrNull() }
    }

    private suspend fun fetchRemoteMatch(eventId: String, matchId: String): MatchMVP {
        val detailMatch = runCatching {
            api.get<MatchResponseDto>("api/events/$eventId/matches/$matchId")
                .match
                ?.toMatchOrNull()
        }.onFailure { error ->
            Napier.w(
                "Failed to refresh match $matchId from detail endpoint; falling back to event matches: ${error.message}"
            )
        }.getOrNull()
        if (detailMatch != null) {
            return detailMatch
        }

        val res = api.get<MatchesResponseDto>("api/events/$eventId/matches")
        return res.matches.firstOrNull { (it.id ?: it.legacyId) == matchId }?.toMatchOrNull()
            ?: error("Match $matchId not found")
    }

    private suspend fun refreshMatchesFromRemote(tournamentId: String): List<MatchMVP> {
        val localMatches = databaseService.getMatchDao.getMatchesOfTournament(tournamentId)
        val remoteMatches = mergePendingLocalIncidents(fetchRemoteMatches(tournamentId))
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

    override suspend fun getMatch(matchId: String): Result<MatchMVP> =
        singleResponse(
            networkCall = {
                val local = databaseService.getMatchDao.getMatchById(matchId)?.match
                    ?: error("Match $matchId not cached; fetch matches for the event first")

                val remoteMatch = fetchRemoteMatch(local.eventId, matchId)
                mergePendingLocalIncidents(remoteMatch, local)
            },
            saveCall = { match -> databaseService.getMatchDao.upsertMatch(match) },
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
            api.patch<MatchUpdateDto, MatchResponseDto>(
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
                ),
            ).match?.toMatchOrNull() ?: error("Update match response missing match")
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
        finalize: Boolean,
        time: Instant?,
    ): Result<MatchMVP> = singleResponse(
        networkCall = {
            api.patch<MatchUpdateDto, MatchResponseDto>(
                path = "api/events/${match.eventId}/matches/${match.id}",
                body = MatchUpdateDto(
                    lifecycle = lifecycle,
                    segmentOperations = segmentOperations,
                    incidentOperations = incidentOperations,
                    officialCheckIn = officialCheckIn,
                    finalize = finalize,
                    time = time?.toString(),
                ),
            ).match?.toMatchOrNull() ?: error("Match operations response missing match")
        },
        saveCall = { updatedMatch -> upsertRemoteMatchPreservingPendingIncidents(updatedMatch) },
        onReturn = { it },
    )

    override suspend fun setMatchScore(
        match: MatchMVP,
        segmentId: String?,
        sequence: Int,
        eventTeamId: String,
        points: Int,
    ): Result<MatchMVP> = singleResponse(
        networkCall = {
            api.post<MatchScoreSetDto, MatchResponseDto>(
                path = "api/events/${match.eventId}/matches/${match.id}/score",
                body = MatchScoreSetDto(
                    segmentId = segmentId,
                    sequence = sequence,
                    eventTeamId = eventTeamId,
                    points = points,
                ),
            ).match?.toMatchOrNull() ?: error("Score set response missing match")
        },
        saveCall = { updatedMatch -> upsertRemoteMatchPreservingPendingIncidents(updatedMatch) },
        onReturn = { it },
    )

    override suspend fun addMatchIncident(
        match: MatchMVP,
        operation: MatchIncidentOperationDto,
    ): Result<MatchMVP> = singleResponse(
        networkCall = {
            api.post<MatchIncidentOperationDto, MatchResponseDto>(
                path = "api/events/${match.eventId}/matches/${match.id}/incidents",
                body = operation.copy(action = "CREATE"),
            ).match?.toMatchOrNull() ?: error("Add incident response missing match")
        },
        saveCall = { updatedMatch -> upsertRemoteMatchPreservingPendingIncidents(updatedMatch) },
        onReturn = { it },
    )

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
            val updateEntries: List<BulkMatchUpdateEntryDto> = normalizedUpdates.map { it.toBulkMatchUpdateEntryDto() }
            val createEntries: List<BulkMatchCreateEntryDto> = normalizedCreates.map { create ->
                create.match.toBulkMatchCreateEntryDto(
                    clientId = create.clientId,
                    creationContext = create.creationContext,
                    autoPlaceholderTeam = create.autoPlaceholderTeam,
                )
            }

            val response = api.patch<BulkMatchUpdateRequestDto, BulkMatchesResponseDto>(
                path = "api/events/$eventId/matches",
                body = BulkMatchUpdateRequestDto(
                    matches = updateEntries.ifEmpty { null },
                    creates = createEntries.ifEmpty { null },
                    deletes = normalizedDeletes.ifEmpty { null },
                ),
            )

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

    override suspend fun updateMatchFinished(match: MatchMVP, time: Instant): Result<Unit> =
        singleResponse(
            networkCall = {
                val sanitizedMatch = match.toSanitizedForBulk()
                api.patch<MatchUpdateDto, MatchResponseDto>(
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
                        finalize = true,
                        time = time.toString(),
                        start = sanitizedMatch.start?.toString(),
                        end = sanitizedMatch.end?.toString(),
                        division = sanitizedMatch.division,
                        losersBracket = sanitizedMatch.losersBracket,
                        locked = sanitizedMatch.locked,
                    ),
                ).match?.toMatchOrNull() ?: error("Finalize match response missing match")
            },
            saveCall = { updated -> upsertRemoteMatchPreservingPendingIncidents(updated) },
            onReturn = {},
        )

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
            val fetchedMatches = api.get<MatchesResponseDto>("api/matches?$query")
                .matches
                .mapNotNull { match -> match.toMatchOrNull() }
            aggregatedMatches.addAll(fetchedMatches)
        }

        val dedupedMatches = aggregatedMatches.distinctBy { match -> match.id }
        if (dedupedMatches.isNotEmpty()) {
            upsertRemoteMatchesPreservingPendingIncidents(dedupedMatches)
        }
        dedupedMatches
    }

    override suspend fun deleteMatchesOfTournament(tournamentId: String): Result<Unit> = runCatching {
        val normalizedId = tournamentId.trim()
        if (normalizedId.isEmpty()) {
            error("Delete matches requires a tournament id")
        }
        api.deleteNoResponse("api/events/$normalizedId/matches")
        databaseService.getMatchDao.deleteMatchesOfTournament(normalizedId)
    }

    override suspend fun subscribeToMatches(): Result<Unit> {
        return Result.success(Unit)
    }

    override suspend fun unsubscribeFromRealtime(): Result<Unit> =
        Result.success(Unit)

    override fun setIgnoreMatch(match: MatchMVP?) = runCatching { _ignoreMatch.value = match }
}
