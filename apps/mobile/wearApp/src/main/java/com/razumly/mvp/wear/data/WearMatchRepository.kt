package com.razumly.mvp.wear.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.URLEncoder
import java.time.Duration
import java.time.Instant
import java.util.UUID

private const val WEAR_SCHEDULE_PAGE_SIZE = 200
private const val WEAR_SCHEDULE_MAX_PAGES = 100
private const val WEAR_SCHEDULE_PAST_DAYS = 90L
private const val WEAR_SCHEDULE_FUTURE_DAYS = 366L

internal suspend fun loadCompleteWearSchedule(
    windowFrom: Instant,
    windowTo: Instant,
    loadPage: suspend (String) -> WearScheduleResponseDto,
    pageSize: Int = WEAR_SCHEDULE_PAGE_SIZE,
    maxPages: Int = WEAR_SCHEDULE_MAX_PAGES,
): WearScheduleResponseDto {
    require(pageSize > 0) { "Wear schedule page size must be positive." }
    require(maxPages > 0) { "Wear schedule page limit must be positive." }

    val encodedWindowFrom = URLEncoder.encode(windowFrom.toString(), "UTF-8")
    val encodedWindowTo = URLEncoder.encode(windowTo.toString(), "UTF-8")
    val basePath = "api/profile/schedule?from=$encodedWindowFrom&to=$encodedWindowTo&limit=$pageSize"
    val eventsById = linkedMapOf<String, WearEventDto>()
    val matchesById = linkedMapOf<String, WearMatchDto>()
    val teamsById = linkedMapOf<String, WearTeamDto>()
    val fieldsById = linkedMapOf<String, WearFieldDto>()
    val seenCursors = mutableSetOf<String>()
    var cursor: String? = null

    fun mergedSchedule(pagination: WearSchedulePaginationDto?): WearScheduleResponseDto =
        WearScheduleResponseDto(
            events = eventsById.values.toList(),
            matches = matchesById.values.toList(),
            teams = teamsById.values.toList(),
            fields = fieldsById.values.toList(),
            pagination = pagination,
        )

    fun validateWindow(pagination: WearSchedulePaginationDto) {
        pagination.windowFrom?.let { returnedFrom ->
            check(Instant.parse(returnedFrom) == windowFrom) {
                "Wear schedule response window changed while paging."
            }
        }
        pagination.windowTo?.let { returnedTo ->
            check(Instant.parse(returnedTo) == windowTo) {
                "Wear schedule response window changed while paging."
            }
        }
    }

    repeat(maxPages) { pageIndex ->
        val pagePath = cursor?.let { value ->
            "$basePath&cursor=${URLEncoder.encode(value, "UTF-8")}"
        } ?: basePath
        val page = loadPage(pagePath)

        page.events.forEachIndexed { index, event ->
            eventsById[event.resolvedId() ?: "$pageIndex:event:$index"] = event
        }
        page.matches.forEachIndexed { index, match ->
            matchesById[match.resolvedId() ?: "$pageIndex:match:$index"] = match
        }
        page.teams.forEachIndexed { index, team ->
            teamsById[team.resolvedId() ?: "$pageIndex:team:$index"] = team
        }
        page.fields.forEachIndexed { index, field ->
            fieldsById[field.resolvedId() ?: "$pageIndex:field:$index"] = field
        }

        val pagination = page.pagination
        if (pagination == null) {
            check(pageIndex == 0) {
                "Wear schedule response dropped pagination metadata during continuation."
            }
            check(page.events.size < pageSize) {
                "Wear schedule response reached the legacy server cap without completeness metadata."
            }
            return mergedSchedule(pagination = null)
        }

        validateWindow(pagination)
        if (!pagination.hasMore) {
            check(pagination.isComplete != false) {
                "Wear schedule response declared an incomplete final page."
            }
            return mergedSchedule(pagination)
        }

        check(pagination.isComplete != true) {
            "Wear schedule response marked a page complete while returning a continuation."
        }
        val nextCursor = pagination.nextCursor
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: error("Wear schedule page is incomplete but did not provide a continuation cursor.")
        check(seenCursors.add(nextCursor)) {
            "Wear schedule pagination repeated a continuation cursor."
        }
        cursor = nextCursor
    }

    error("Wear schedule endpoint exceeded the safe pagination limit.")
}

class WearMatchRepository(
    private val api: WearApiClient,
    private val tokenStore: WearAuthTokenStore,
    private val operationStore: WearMatchOperationStore,
    private val phoneSync: WearMatchPhoneSync? = null,
    private val json: Json = createWearJson(),
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    suspend fun bootstrapSession(): WearSession? {
        if (tokenStore.token().isBlank()) return null
        val cachedUserId = tokenStore.currentUserId()
        if (cachedUserId != null) {
            scope.launch { runCatching { refreshSession() } }
            return WearSession(
                userId = cachedUserId,
                label = tokenStore.currentUserLabel() ?: cachedUserId,
            )
        }
        return refreshSession()
    }

    private suspend fun refreshSession(): WearSession? {
        val response = api.get<WearAuthResponseDto>("api/auth/me")
        val userId = response.resolveUserId()
        if (userId == null) {
            tokenStore.clear()
            return null
        }
        val label = response.profile?.label()
            ?: response.user?.name.normalizedText()
            ?: tokenStore.currentUserLabel()
            ?: userId
        tokenStore.save(response.token.normalizedText() ?: tokenStore.token(), userId, label)
        return WearSession(userId = userId, label = label)
    }

    suspend fun login(email: String, password: String): WearSession {
        val response = api.post<WearLoginRequestDto, WearAuthResponseDto>(
            path = "api/auth/login",
            body = WearLoginRequestDto(email = email.trim(), password = password),
        )
        if (!response.error.isNullOrBlank()) {
            throw WearApiException(response.error)
        }
        val token = response.token.normalizedText()
            ?: throw WearApiException("Sign in did not return a session token.")
        val userId = response.resolveUserId()
            ?: throw WearApiException("Sign in did not return a user id.")
        val label = response.profile?.label()
            ?: response.user?.name.normalizedText()
            ?: response.user?.email.normalizedText()
            ?: userId
        tokenStore.save(token, userId, label)
        return WearSession(userId = userId, label = label)
    }

    fun logout() {
        tokenStore.clear()
        operationStore.clear()
    }

    suspend fun loadOfficialSchedule(): List<WearMatch> {
        val sessionUserId = tokenStore.currentUserId()
            ?: bootstrapSession()?.userId
            ?: throw WearApiException("Sign in again before loading matches.")
        val schedule = loadScheduleWithCache(sessionUserId)
        val localOverlayMatchIds = operationStore.localOverlayOperations().mapNotNull { it.matchId.normalizedId() }.toSet()
        val cachedMatches = operationStore.cachedMatches()
        val remoteMatchesById = schedule.matches
            .mapNotNull { match -> match.resolvedId()?.let { it to match } }
            .toMap()
        val allMatches = remoteMatchesById
            .mapValues { (matchId, remoteMatch) ->
                if (matchId in localOverlayMatchIds) {
                    cachedMatches[matchId] ?: remoteMatch
                } else {
                    remoteMatch
                }
            }
            .plus(cachedMatches.filterKeys { matchId -> matchId !in remoteMatchesById })
            .values
            .toList()
        val teamsById = hydrateWearTeams(schedule.teams, ::fetchUsers)
        val eventsById = schedule.events.mapNotNull { event -> event.resolvedId()?.let { it to event } }.toMap()
        val fieldsById = schedule.fields.mapNotNull { field -> field.resolvedId()?.let { it to field } }.toMap()

        val assignedMatches = allMatches.filter { match -> match.isAssignedOfficial(sessionUserId) }
        operationStore.pruneCachedMatches(
            assignedMatches.mapNotNull { match -> match.resolvedId() }.toSet() + localOverlayMatchIds,
        )

        return assignedMatches
            .mapNotNull { match ->
                val matchId = match.resolvedId() ?: return@mapNotNull null
                val eventId = match.eventId.normalizedId() ?: return@mapNotNull null
                val event = eventsById[eventId]
                WearMatch(
                    id = matchId,
                    number = match.matchId ?: 0,
                    eventId = eventId,
                    eventName = event?.name.normalizedText() ?: "Match",
                    startIso = match.start,
                    endIso = match.end,
                    fieldLabel = match.fieldId.normalizedId()?.let { fieldsById[it]?.label() },
                    division = match.division.normalizedText(),
                    status = match.status,
                    team1 = match.team1Id.normalizedId()?.let(teamsById::get),
                    team2 = match.team2Id.normalizedId()?.let(teamsById::get),
                    officialCheckedIn = match.isUserCheckedIn(sessionUserId),
                    rules = match.matchRulesSnapshot
                        ?: match.resolvedMatchRules
                        ?: event?.resolvedMatchRules?.copy(
                            pointIncidentRequiresParticipant = event.autoCreatePointMatchIncidents
                                ?: event.resolvedMatchRules.pointIncidentRequiresParticipant,
                        )
                        ?: WearResolvedMatchRulesDto(),
                    raw = match,
                )
            }
            .sortedWith(compareBy<WearMatch> { it.startIso ?: "" }.thenBy { it.number })
    }

    suspend fun checkIn(match: WearMatch): WearMatchDto =
        patchMatch(
            match,
            buildJsonObject {
                put(
                    "officialCheckIn",
                    buildJsonObject {
                        match.raw.assignmentForUser(tokenStore.currentUserId()).let { assignment ->
                            assignment?.positionId.normalizedId()?.let { put("positionId", JsonPrimitive(it)) }
                            assignment?.slotIndex?.let { put("slotIndex", JsonPrimitive(it)) }
                        }
                        tokenStore.currentUserId()?.let { put("userId", JsonPrimitive(it)) }
                        put("checkedIn", JsonPrimitive(true))
                    },
                )
            },
        )

    suspend fun startCurrentSegment(match: WearMatch): WearMatchDto {
        val now = Instant.now().toString()
        val segment = match.raw.activeSegment()
            ?: match.raw.nextPlayableSegment(match.rules)
        val sequence = segment?.sequence
            ?: match.raw.nextPlayableSequence(match.rules)
            ?: if (match.shouldOfferFinishAndStart()) {
                (match.raw.segments.maxOfOrNull { it.sequence } ?: 0) + 1
            } else {
                throw WearApiException("No remaining segment is available.")
            }
        return patchMatch(
            match,
            buildJsonObject {
                put(
                    "lifecycle",
                    buildJsonObject {
                        put("status", JsonPrimitive("IN_PROGRESS"))
                        if (match.raw.actualStart.isNullOrBlank()) {
                            put("actualStart", JsonPrimitive(now))
                        }
                    },
                )
                put(
                    "segmentOperations",
                    JsonArray(
                        listOf(
                            segmentOperationJson(
                                segment = segment,
                                match = match,
                                sequence = sequence,
                                status = "IN_PROGRESS",
                                startedAt = now,
                                clearEndedAt = true,
                            ),
                        ),
                    ),
                )
            },
        )
    }

    suspend fun resetCurrentSegment(match: WearMatch): WearMatchDto {
        val segment = match.raw.activeSegment()
            ?: match.raw.nextPlayableSegment(match.rules)
            ?: return match.raw
        return patchMatch(
            match,
            buildJsonObject {
                if (segment.sequence == 1 && match.raw.segments.none { it.sequence < segment.sequence && it.status == "COMPLETE" }) {
                    put(
                        "lifecycle",
                        buildJsonObject {
                            put("status", JsonPrimitive("SCHEDULED"))
                            put("actualStart", JsonNull)
                            put("actualEnd", JsonNull)
                        },
                    )
                }
                put(
                    "segmentOperations",
                    JsonArray(
                        listOf(
                            segmentOperationJson(
                                segment = segment,
                                match = match,
                                sequence = segment.sequence,
                                status = "NOT_STARTED",
                                clearStartedAt = true,
                                clearEndedAt = true,
                                clearWinner = true,
                            ),
                        ),
                    ),
                )
            },
        )
    }

    suspend fun endCurrentSegment(match: WearMatch): WearMatchDto {
        val segment = match.raw.activeSegment()
            ?: throw WearApiException("Start a segment before ending it.")
        val winnerEventTeamId = segmentWinnerTeamId(match, segment)
        return patchMatch(
            match,
            buildJsonObject {
                put(
                    "segmentOperations",
                    JsonArray(
                        listOf(
                            segmentOperationJson(
                                segment = segment,
                                match = match,
                                sequence = segment.sequence,
                                status = "COMPLETE",
                                endedAt = Instant.now().toString(),
                                winnerEventTeamId = winnerEventTeamId,
                                writeWinner = true,
                            ),
                        ),
                    ),
                )
            },
        )
    }

    suspend fun startNextSegmentOrOvertime(match: WearMatch): WearMatchDto {
        if (match.raw.activeSegment() != null) {
            throw WearApiException("End the active segment before starting the next one.")
        }
        val segment = match.raw.nextPlayableSegment(match.rules)
        val sequence = segment?.sequence
            ?: match.raw.nextPlayableSequence(match.rules)
            ?: if (match.rules.supportsOvertime || match.rules.canUseOvertime) {
                (match.raw.segments.maxOfOrNull { it.sequence } ?: 0) + 1
            } else {
                throw WearApiException("No remaining segment is available.")
            }
        return patchMatch(
            match,
            buildJsonObject {
                put(
                    "lifecycle",
                    buildJsonObject {
                        put("status", JsonPrimitive("IN_PROGRESS"))
                        if (match.raw.actualStart.isNullOrBlank()) {
                            put("actualStart", JsonPrimitive(Instant.now().toString()))
                        }
                    },
                )
                put(
                    "segmentOperations",
                    JsonArray(
                        listOf(
                            segmentOperationJson(
                                segment = segment,
                                match = match,
                                sequence = sequence,
                                status = "IN_PROGRESS",
                                startedAt = Instant.now().toString(),
                                clearEndedAt = true,
                            ),
                        ),
                    ),
                )
            },
        )
    }

    suspend fun endMatch(match: WearMatch): WearMatchDto {
        val active = match.raw.activeSegment()
        val now = Instant.now().toString()
        return patchMatch(
            match,
            buildJsonObject {
                put("finalize", JsonPrimitive(true))
                put("time", JsonPrimitive(now))
                put(
                    "lifecycle",
                    buildJsonObject {
                        put("actualEnd", JsonPrimitive(now))
                    },
                )
                if (active != null) {
                    val winnerEventTeamId = segmentWinnerTeamId(match, active)
                    put(
                        "segmentOperations",
                        JsonArray(
                            listOf(
                                segmentOperationJson(
                                    segment = active,
                                    match = match,
                                    sequence = active.sequence,
                                    status = "COMPLETE",
                                    endedAt = now,
                                    winnerEventTeamId = winnerEventTeamId,
                                    writeWinner = true,
                                ),
                            ),
                        ),
                    )
                }
            },
        )
    }

    suspend fun recordIncident(
        match: WearMatch,
        teamId: String,
        incidentType: WearIncidentTypeDefinitionDto,
        player: WearPlayer?,
        minute: Int,
        clockSeconds: Int = secondsForMinute(minute),
    ): WearMatchDto {
        val linkedPointDelta = incidentType.linkedPointDelta.takeIf { it != 0 }
        val isScoring = incidentType.isScoring()
        if (isScoring && linkedPointDelta != null && !match.rules.pointIncidentRequiresParticipant) {
            return incrementScore(match = match, teamId = teamId, delta = linkedPointDelta)
        }

        val segment = match.raw.activeSegment()
            ?: match.raw.nextPlayableSegment(match.rules)
            ?: throw WearApiException("Start a segment before recording an incident.")
        val clockDetails = incidentClockDetails(
            clockSeconds = clockSeconds,
            segment = segment,
            rules = match.rules,
        )
        return patchMatch(
            match,
            buildJsonObject {
                put(
                    "incidentOperations",
                    JsonArray(
                        listOf(
                            buildJsonObject {
                                put("action", JsonPrimitive("CREATE"))
                                put("id", JsonPrimitive("wear_${UUID.randomUUID()}"))
                                put("segmentId", JsonPrimitive(segment.resolvedId()))
                                put("eventTeamId", JsonPrimitive(teamId))
                                player?.eventRegistrationId.normalizedId()?.let {
                                    put("eventRegistrationId", JsonPrimitive(it))
                                }
                                player?.participantUserId.normalizedId()?.let {
                                    put("participantUserId", JsonPrimitive(it))
                                }
                                tokenStore.currentUserId()?.let { put("officialUserId", JsonPrimitive(it)) }
                                put("incidentType", JsonPrimitive(incidentType.code))
                                put("minute", JsonPrimitive(clockDetails.minute))
                                put("clock", JsonPrimitive(clockDetails.clock))
                                put("clockSeconds", JsonPrimitive(clockDetails.clockSeconds))
                                linkedPointDelta?.let { put("linkedPointDelta", JsonPrimitive(it)) }
                            },
                        ),
                    ),
                )
            },
        )
    }

    suspend fun updateIncident(
        match: WearMatch,
        incident: WearMatchIncidentDto,
        teamId: String,
        incidentType: WearIncidentTypeDefinitionDto,
        player: WearPlayer?,
        minute: Int,
        clockSeconds: Int,
    ): WearMatchDto {
        val segment = incident.segmentId.normalizedId()?.let { segmentId ->
            match.raw.segments.firstOrNull { it.resolvedId() == segmentId }
        } ?: match.raw.activeSegment()
        ?: match.raw.nextPlayableSegment(match.rules)
        ?: throw WearApiException("Start a segment before editing an incident.")
        val linkedPointDelta = incidentType.linkedPointDelta
            .takeIf { incidentType.isScoring() && incidentType.requiresPlayer(match.rules) && it != 0 }
        val clockDetails = incidentClockDetails(
            clockSeconds = clockSeconds,
            segment = segment,
            rules = match.rules,
        )
        return patchMatch(
            match,
            buildJsonObject {
                put(
                    "incidentOperations",
                    JsonArray(
                        listOf(
                            buildJsonObject {
                                put("action", JsonPrimitive("UPDATE"))
                                put("id", JsonPrimitive(incident.resolvedId()))
                                put("segmentId", JsonPrimitive(segment.resolvedId()))
                                put("eventTeamId", JsonPrimitive(teamId))
                                player?.eventRegistrationId.normalizedId()?.let {
                                    put("eventRegistrationId", JsonPrimitive(it))
                                } ?: put("eventRegistrationId", JsonNull)
                                player?.participantUserId.normalizedId()?.let {
                                    put("participantUserId", JsonPrimitive(it))
                                } ?: put("participantUserId", JsonNull)
                                tokenStore.currentUserId()?.let { put("officialUserId", JsonPrimitive(it)) }
                                put("incidentType", JsonPrimitive(incidentType.code))
                                put("minute", JsonPrimitive(clockDetails.minute))
                                put("clock", JsonPrimitive(clockDetails.clock))
                                put("clockSeconds", JsonPrimitive(clockDetails.clockSeconds))
                                linkedPointDelta?.let {
                                    put("linkedPointDelta", JsonPrimitive(it))
                                } ?: put("linkedPointDelta", JsonNull)
                            },
                        ),
                    ),
                )
            },
        )
    }

    fun defaultIncidentClockSeconds(match: WearMatch): Int {
        val segment = match.raw.activeSegment() ?: return 0
        val startedAt = runCatching { Instant.parse(segment.startedAt) }.getOrNull() ?: return 0
        val endedAt = runCatching { segment.endedAt?.let(Instant::parse) }.getOrNull() ?: Instant.now()
        val elapsedSeconds = Duration.between(startedAt, endedAt).seconds.coerceAtLeast(0)
        val durationSeconds = (
            match.rules.timekeeping.segmentDurationMinutesBySequence.getOrNull(segment.sequence - 1)
                ?: match.rules.timekeeping.segmentDurationMinutes
            )?.takeIf { it > 0 }?.times(60)
        val boundedSeconds = if (
            match.rules.timekeeping.stopAtRegulationEnd &&
            !match.rules.timekeeping.addedTimeEnabled &&
            durationSeconds != null
        ) {
            elapsedSeconds.coerceAtMost(durationSeconds.toLong())
        } else {
            elapsedSeconds
        }
        val regulationOffsetSeconds = if (match.rules.timekeeping.addedTimeEnabled) {
            regulationOffsetSeconds(segment, match.rules)
        } else {
            0
        }
        return (regulationOffsetSeconds + boundedSeconds.toInt()).coerceAtLeast(0)
    }

    fun defaultIncidentMinute(match: WearMatch): Int {
        return minuteForClockSeconds(defaultIncidentClockSeconds(match))
    }

    private suspend fun incrementScore(match: WearMatch, teamId: String, delta: Int): WearMatchDto {
        val segment = match.raw.activeSegment()
            ?: match.raw.nextPlayableSegment(match.rules)
        val sequence = segment?.sequence ?: match.raw.nextPlayableSequence(match.rules) ?: 1
        if (segment == null) {
            startCurrentSegment(match)
        }
        val currentPoints = segment?.scores?.get(teamId) ?: 0
        val provisionalScoreSet = WearScoreSetDto(
            segmentId = segment?.resolvedId(),
            sequence = sequence,
            eventTeamId = teamId,
            points = (currentPoints + delta).coerceAtLeast(0),
        )
        val provisionalOperation = operationStore.newOperation(
            eventId = match.eventId,
            matchId = match.id,
            kind = WEAR_MATCH_OPERATION_KIND_SCORE_SET,
            payloadJson = "{}",
        )
        val scoreSet = provisionalScoreSet.withClientOperation(provisionalOperation)
        val operation = provisionalOperation.copy(payloadJson = json.encodeToString(scoreSet))
        val localMatch = match.raw.applyLocalScoreSet(scoreSet)
        operationStore.cacheMatch(localMatch)
        operationStore.upsertOperation(operation)
        schedulePhoneSync(operation)
        scheduleOperationSync(match.id)
        return localMatch
    }

    private suspend fun patchMatch(match: WearMatch, body: JsonObject): WearMatchDto {
        val provisionalOperation = operationStore.newOperation(
            eventId = match.eventId,
            matchId = match.id,
            kind = WEAR_MATCH_OPERATION_KIND_PATCH,
            payloadJson = "{}",
        )
        val payload = body.withClientOperation(provisionalOperation)
        val operation = provisionalOperation.copy(payloadJson = payload.toString())
        val localMatch = match.raw.applyLocalPatch(payload)
        operationStore.cacheMatch(localMatch)
        operationStore.upsertOperation(operation)
        schedulePhoneSync(operation)
        scheduleOperationSync(match.id)
        return localMatch
    }

    private suspend fun loadScheduleWithCache(sessionUserId: String): WearScheduleResponseDto {
        val cachedSchedule = operationStore.cachedSchedule()
        if (cachedSchedule != null) {
            val trimmedSchedule = cachedSchedule.trimForOfficial(sessionUserId)
            if (trimmedSchedule.matches.size != cachedSchedule.matches.size) {
                operationStore.cacheSchedule(trimmedSchedule)
            }
            scope.launch { runCatching { refreshRemoteSchedule(sessionUserId) } }
            return trimmedSchedule
        }
        return refreshRemoteSchedule(sessionUserId)
    }

    private suspend fun refreshRemoteSchedule(sessionUserId: String): WearScheduleResponseDto {
        val requestedAt = Instant.ofEpochMilli(Instant.now().toEpochMilli())
        val schedule = loadCompleteWearSchedule(
            windowFrom = requestedAt.minus(Duration.ofDays(WEAR_SCHEDULE_PAST_DAYS)),
            windowTo = requestedAt.plus(Duration.ofDays(WEAR_SCHEDULE_FUTURE_DAYS)),
            loadPage = { path -> api.get<WearScheduleResponseDto>(path) },
        )
        val mergedAndTrimmedSchedule = schedule.trimForOfficial(sessionUserId)
        val remoteSchedule = reconcileAuthoritativeWearSchedule(
            remoteSchedule = mergedAndTrimmedSchedule,
            operationStore = operationStore,
            applyOperation = { match, operation -> match.applyLocalOperation(operation) },
        )
        operationStore.cacheSchedule(remoteSchedule)
        remoteSchedule.matches.forEach(operationStore::cacheMatch)
        return remoteSchedule
    }

    private fun scheduleOperationSync(matchId: String) {
        scope.launch { syncPendingOperations(matchId) }
    }

    private fun schedulePhoneSync(operation: WearPendingMatchOperation) {
        val sync = phoneSync ?: return
        scope.launch {
            runCatching { sync.sendOperation(operation) }
        }
    }

    fun cachedMatch(matchId: String): WearMatchDto? {
        val normalizedMatchId = matchId.normalizedId() ?: return null
        return operationStore.cachedMatches()[normalizedMatchId]
    }

    fun importPhoneOperation(operation: WearPendingMatchOperation): Boolean {
        val matchId = operation.matchId.normalizedId() ?: return false
        val importedOperation = operation.copy(
            status = WEAR_MATCH_OPERATION_STATUS_IMPORTED,
            lastError = null,
            lastAttemptAt = null,
        )
        val cachedMatch = operationStore.cachedSchedule()
            ?.matches
            ?.firstOrNull { it.resolvedId() == matchId }
            ?: operationStore.cachedMatches()[matchId]
            ?: return false
        operationStore.upsertOperation(importedOperation)
        val updatedMatch = cachedMatch.applyLocalOperation(importedOperation)
        operationStore.cacheMatch(updatedMatch)
        operationStore.cachedSchedule()?.let { schedule ->
            val updatedSchedule = schedule.copy(
                matches = schedule.matches.map { match ->
                    if (match.resolvedId() == matchId) updatedMatch else match
                },
            )
            operationStore.cacheSchedule(updatedSchedule)
        }
        return true
    }

    suspend fun syncPendingOperations(matchId: String? = null): Int {
        var syncedCount = 0
        for (operation in operationStore.pendingOperations(matchId)) {
            operationStore.markAttempting(operation.id)
            val remoteMatch = try {
                sendOperation(operation)
            } catch (error: Throwable) {
                operationStore.markFailed(
                    operationId = operation.id,
                    error = error.toUserMessage(),
                )
                break
            }
            operationStore.markAcked(operation.id)
            val cachedMatch = reconcileAuthoritativeWearMatch(
                remoteMatch = remoteMatch,
                operationStore = operationStore,
                applyOperation = { current, pending -> current.applyLocalOperation(pending) },
            )
            operationStore.cacheMatch(cachedMatch)
            syncedCount += 1
        }
        return syncedCount
    }

    private suspend fun sendOperation(operation: WearPendingMatchOperation): WearMatchDto {
        val response = when (operation.kind) {
            WEAR_MATCH_OPERATION_KIND_SCORE_SET -> {
                val scoreSet = json.decodeFromString<WearScoreSetDto>(operation.payloadJson)
                api.post<WearScoreSetDto, WearMatchResponseDto>(
                    path = "api/events/${operation.eventId}/matches/${operation.matchId}/score",
                    body = scoreSet,
                )
            }
            else -> {
                val payload = json.parseToJsonElement(operation.payloadJson).jsonObject
                api.patchJson<WearMatchResponseDto>(
                    path = "api/events/${operation.eventId}/matches/${operation.matchId}",
                    body = payload,
                )
            }
        }
        return response.match ?: throw WearApiException("Match response did not include the updated match.")
    }

    private fun WearScoreSetDto.withClientOperation(operation: WearPendingMatchOperation): WearScoreSetDto =
        copy(
            clientOperationId = operation.id,
            clientDeviceId = operation.clientDeviceId,
            clientCreatedAt = operation.clientCreatedAt,
            clientSequence = operation.clientSequence,
            sourceDevice = operation.sourceDevice,
        )

    private fun JsonObject.withClientOperation(operation: WearPendingMatchOperation): JsonObject =
        buildJsonObject {
            this@withClientOperation.forEach { (key, value) ->
                when (key) {
                    "segmentOperations" -> put(
                        key,
                        JsonArray(value.arrayOrEmpty().map { item ->
                            item.objectOrNull()?.withClientOperationFields(operation) ?: item
                        }),
                    )
                    "incidentOperations" -> put(
                        key,
                        JsonArray(value.arrayOrEmpty().map { item ->
                            item.objectOrNull()?.withClientOperationFields(operation) ?: item
                        }),
                    )
                    else -> put(key, value)
                }
            }
            put("clientOperationId", JsonPrimitive(operation.id))
            put("clientDeviceId", JsonPrimitive(operation.clientDeviceId))
            put("clientCreatedAt", JsonPrimitive(operation.clientCreatedAt))
            put("clientSequence", JsonPrimitive(operation.clientSequence))
            put("sourceDevice", JsonPrimitive(operation.sourceDevice))
        }

    private fun JsonObject.withClientOperationFields(operation: WearPendingMatchOperation): JsonObject =
        buildJsonObject {
            this@withClientOperationFields.forEach { (key, value) -> put(key, value) }
            put("clientOperationId", JsonPrimitive(operation.id))
            put("clientDeviceId", JsonPrimitive(operation.clientDeviceId))
            put("clientCreatedAt", JsonPrimitive(operation.clientCreatedAt))
            put("clientSequence", JsonPrimitive(operation.clientSequence))
            put("sourceDevice", JsonPrimitive(operation.sourceDevice))
        }

    private fun WearMatchDto.applyLocalOperation(operation: WearPendingMatchOperation): WearMatchDto =
        when (operation.kind) {
            WEAR_MATCH_OPERATION_KIND_SCORE_SET -> {
                val scoreSet = json.decodeFromString<WearScoreSetDto>(operation.payloadJson)
                applyLocalScoreSet(scoreSet)
            }
            else -> applyLocalPatch(json.parseToJsonElement(operation.payloadJson).jsonObject)
        }

    private fun WearMatchDto.applyLocalPatch(payload: JsonObject): WearMatchDto {
        var next = this
        payload["lifecycle"]?.objectOrNull()?.let { lifecycle ->
            next = next.copy(
                status = lifecycle["status"].stringOrNull() ?: next.status,
                resultStatus = if (lifecycle.containsKey("resultStatus")) lifecycle["resultStatus"].stringOrNull() else next.resultStatus,
                resultType = if (lifecycle.containsKey("resultType")) lifecycle["resultType"].stringOrNull() else next.resultType,
                actualStart = if (lifecycle.containsKey("actualStart")) lifecycle["actualStart"].stringOrNull() else next.actualStart,
                actualEnd = if (lifecycle.containsKey("actualEnd")) lifecycle["actualEnd"].stringOrNull() else next.actualEnd,
                winnerEventTeamId = if (lifecycle.containsKey("winnerEventTeamId")) {
                    lifecycle["winnerEventTeamId"].stringOrNull()
                } else {
                    next.winnerEventTeamId
                },
            )
        }
        payload["officialCheckIn"]?.objectOrNull()?.let { checkIn ->
            val userId = checkIn["userId"].stringOrNull() ?: tokenStore.currentUserId()
            val checkedIn = checkIn["checkedIn"]?.jsonPrimitive?.booleanOrNull ?: true
            val updatedAssignments = next.officialIds.map { assignment ->
                if (
                    userId != null &&
                    assignment.userId.normalizedId() == userId.normalizedId() &&
                    (checkIn["positionId"].stringOrNull() == null ||
                        assignment.positionId.normalizedId() == checkIn["positionId"].stringOrNull().normalizedId()) &&
                    (checkIn["slotIndex"]?.jsonPrimitive?.intOrNull == null ||
                        assignment.slotIndex == checkIn["slotIndex"]?.jsonPrimitive?.intOrNull)
                ) {
                    assignment.copy(checkedIn = checkedIn)
                } else {
                    assignment
                }
            }
            next = next.copy(
                officialIds = updatedAssignments,
                officialCheckedIn = updatedAssignments.any { it.checkedIn == true } || checkedIn,
            )
        }
        payload["segmentOperations"]?.arrayOrEmpty()?.mapNotNull { it.objectOrNull() }?.let { operations ->
            if (operations.isNotEmpty()) {
                next = next.applyLocalSegmentOperations(operations)
            }
        }
        payload["incidentOperations"]?.arrayOrEmpty()?.mapNotNull { it.objectOrNull() }?.let { operations ->
            if (operations.isNotEmpty()) {
                next = next.applyLocalIncidentOperations(operations)
            }
        }
        if (payload["finalize"]?.jsonPrimitive?.booleanOrNull == true) {
            next = next.copy(
                status = "COMPLETE",
                resultStatus = next.resultStatus ?: "FINAL",
                actualEnd = payload["time"].stringOrNull() ?: next.actualEnd,
            )
        }
        return next.syncLegacyScoresFromSegments()
    }

    private fun WearMatchDto.applyLocalScoreSet(scoreSet: WearScoreSetDto): WearMatchDto {
        val targetIndex = segments.indexOfFirst { segment ->
            segment.resolvedId() == scoreSet.segmentId.normalizedId() || segment.sequence == scoreSet.sequence
        }
        val target = segments.getOrNull(targetIndex) ?: WearMatchSegmentDto(
            id = scoreSet.segmentId.normalizedId() ?: "${resolvedId()}_segment_${scoreSet.sequence}",
            eventId = eventId,
            matchId = resolvedId().orEmpty(),
            sequence = scoreSet.sequence,
            status = "NOT_STARTED",
        )
        val nextScores = target.scores + (scoreSet.eventTeamId to scoreSet.points.coerceAtLeast(0))
        val nextSegment = target.copy(
            status = if (nextScores.values.any { it > 0 } && target.status != "COMPLETE") {
                "IN_PROGRESS"
            } else {
                target.status
            },
            scores = nextScores,
        )
        val nextSegments = segments.toMutableList().apply {
            if (targetIndex >= 0) this[targetIndex] = nextSegment else add(nextSegment)
        }
        return copy(segments = nextSegments.sortedBy { it.sequence }).syncLegacyScoresFromSegments()
    }

    private fun WearMatchDto.applyLocalSegmentOperations(operations: List<JsonObject>): WearMatchDto {
        val matchId = resolvedId().orEmpty()
        val updated = segments.toMutableList()
        operations.forEach { operation ->
            val sequence = operation["sequence"]?.jsonPrimitive?.intOrNull ?: return@forEach
            val operationId = operation["id"].stringOrNull()
            val index = updated.indexOfFirst { segment ->
                (operationId != null && segment.resolvedId() == operationId) || segment.sequence == sequence
            }
            val existing = updated.getOrNull(index) ?: WearMatchSegmentDto(
                id = operationId ?: "${matchId}_segment_$sequence",
                eventId = eventId,
                matchId = matchId,
                sequence = sequence,
                status = "NOT_STARTED",
            )
            val nextScores = operation["scores"]?.objectOrNull()
                ?.mapValues { (_, value) -> value.jsonPrimitive.intOrNull ?: 0 }
                ?: existing.scores
            val nextSegment = existing.copy(
                id = operationId ?: existing.id,
                status = operation["status"].stringOrNull() ?: existing.status,
                scores = nextScores,
                winnerEventTeamId = if (operation.containsKey("winnerEventTeamId")) {
                    operation["winnerEventTeamId"].stringOrNull()
                } else {
                    existing.winnerEventTeamId
                },
                startedAt = if (operation.containsKey("startedAt")) operation["startedAt"].stringOrNull() else existing.startedAt,
                endedAt = if (operation.containsKey("endedAt")) operation["endedAt"].stringOrNull() else existing.endedAt,
                resultType = if (operation.containsKey("resultType")) operation["resultType"].stringOrNull() else existing.resultType,
                statusReason = if (operation.containsKey("statusReason")) operation["statusReason"].stringOrNull() else existing.statusReason,
            )
            if (index >= 0) updated[index] = nextSegment else updated += nextSegment
        }
        return copy(segments = updated.sortedBy { it.sequence })
    }

    private fun WearMatchDto.applyLocalIncidentOperations(operations: List<JsonObject>): WearMatchDto {
        var next = this
        val incidents = incidents.toMutableList()
        operations.forEach { operation ->
            when (operation["action"].stringOrNull()?.uppercase()) {
                "DELETE" -> {
                    val id = operation["id"].stringOrNull() ?: return@forEach
                    val index = incidents.indexOfFirst { it.resolvedId() == id }
                    if (index >= 0) {
                        next = next.applyIncidentScoreDelta(incidents[index], -1)
                        incidents.removeAt(index)
                    }
                }
                "CREATE" -> {
                    val id = operation["id"].stringOrNull() ?: "wear_${UUID.randomUUID()}"
                    val existingIndex = incidents.indexOfFirst { it.resolvedId() == id }
                    val incident = operation.toLocalIncident(
                        match = next,
                        id = id,
                        fallbackSequence = if (existingIndex >= 0) {
                            incidents[existingIndex].sequence
                        } else {
                            (incidents.maxOfOrNull { it.sequence } ?: 0) + 1
                        },
                    )
                    if (existingIndex >= 0) {
                        next = next.applyIncidentScoreDelta(incidents[existingIndex], -1)
                        incidents[existingIndex] = incident
                    } else {
                        incidents += incident
                    }
                    next = next.applyIncidentScoreDelta(incident, 1)
                }
                "UPDATE" -> {
                    val id = operation["id"].stringOrNull() ?: return@forEach
                    val index = incidents.indexOfFirst { it.resolvedId() == id }
                    if (index < 0) return@forEach
                    next = next.applyIncidentScoreDelta(incidents[index], -1)
                    incidents[index] = operation.toLocalIncident(
                        match = next,
                        id = id,
                        previous = incidents[index],
                        fallbackSequence = incidents[index].sequence,
                    )
                    next = next.applyIncidentScoreDelta(incidents[index], 1)
                }
            }
        }
        return next.copy(incidents = incidents.sortedWith(compareBy<WearMatchIncidentDto> { it.sequence }.thenBy { it.id }))
    }

    private fun JsonObject.toLocalIncident(
        match: WearMatchDto,
        id: String,
        previous: WearMatchIncidentDto? = null,
        fallbackSequence: Int,
    ): WearMatchIncidentDto =
        WearMatchIncidentDto(
            id = id,
            eventId = match.eventId,
            matchId = match.resolvedId().orEmpty(),
            segmentId = if (containsKey("segmentId")) this["segmentId"].stringOrNull() else previous?.segmentId,
            eventTeamId = if (containsKey("eventTeamId")) this["eventTeamId"].stringOrNull() else previous?.eventTeamId,
            eventRegistrationId = if (containsKey("eventRegistrationId")) {
                this["eventRegistrationId"].stringOrNull()
            } else {
                previous?.eventRegistrationId
            },
            participantUserId = if (containsKey("participantUserId")) this["participantUserId"].stringOrNull() else previous?.participantUserId,
            officialUserId = if (containsKey("officialUserId")) this["officialUserId"].stringOrNull() else previous?.officialUserId,
            incidentType = this["incidentType"].stringOrNull() ?: previous?.incidentType ?: "NOTE",
            sequence = this["sequence"]?.jsonPrimitive?.intOrNull ?: previous?.sequence ?: fallbackSequence,
            minute = if (containsKey("minute")) this["minute"]?.jsonPrimitive?.intOrNull else previous?.minute,
            clock = if (containsKey("clock")) this["clock"].stringOrNull() else previous?.clock,
            clockSeconds = if (containsKey("clockSeconds")) this["clockSeconds"]?.jsonPrimitive?.intOrNull else previous?.clockSeconds,
            linkedPointDelta = if (containsKey("linkedPointDelta")) {
                this["linkedPointDelta"]?.jsonPrimitive?.intOrNull
            } else {
                previous?.linkedPointDelta
            },
            note = if (containsKey("note")) this["note"].stringOrNull() else previous?.note,
        )

    private fun WearMatchDto.applyIncidentScoreDelta(
        incident: WearMatchIncidentDto,
        multiplier: Int,
    ): WearMatchDto {
        val delta = incident.linkedPointDelta ?: return this
        if (delta == 0) return this
        val teamId = incident.eventTeamId.normalizedId() ?: return this
        val segmentId = incident.segmentId.normalizedId() ?: return this
        val segmentIndex = segments.indexOfFirst { it.resolvedId() == segmentId }
        if (segmentIndex < 0) return this
        val updated = segments.toMutableList()
        val segment = updated[segmentIndex]
        val nextScore = ((segment.scores[teamId] ?: 0) + delta * multiplier).coerceAtLeast(0)
        updated[segmentIndex] = segment.copy(
            status = if (segment.status == "NOT_STARTED" && nextScore > 0) "IN_PROGRESS" else segment.status,
            scores = segment.scores + (teamId to nextScore),
        )
        return copy(segments = updated)
    }

    private fun WearMatchDto.syncLegacyScoresFromSegments(): WearMatchDto {
        val ordered = segments.sortedBy { it.sequence }
        return copy(
            segments = ordered,
            team1Points = ordered.map { segment -> team1Id?.let { segment.scores[it] ?: 0 } ?: 0 },
            team2Points = ordered.map { segment -> team2Id?.let { segment.scores[it] ?: 0 } ?: 0 },
            setResults = ordered.map { segment ->
                when (segment.winnerEventTeamId) {
                    team1Id -> 1
                    team2Id -> 2
                    else -> 0
                }
            },
        )
    }

    private fun JsonElement?.stringOrNull(): String? =
        if (this == null || this is JsonNull) {
            null
        } else {
            runCatching { jsonPrimitive.content }.getOrNull()?.normalizedText()
        }

    private fun JsonElement.objectOrNull(): JsonObject? =
        runCatching { jsonObject }.getOrNull()

    private fun JsonElement?.arrayOrEmpty(): List<JsonElement> =
        (this as? JsonArray)?.toList().orEmpty()

    private suspend fun fetchUsers(userIds: List<String>): Map<String, WearUserProfileDto> {
        if (userIds.isEmpty()) return emptyMap()
        return runCatching {
            userIds.distinct().chunked(50)
            .flatMap { chunk ->
                val encoded = chunk.joinToString(",") { id -> URLEncoder.encode(id, "UTF-8") }
                api.get<WearUsersResponseDto>("api/users?ids=$encoded").users
            }
            .mapNotNull { user -> user.resolvedId()?.let { it to user } }
            .toMap()
        }.getOrDefault(emptyMap())
    }

}

data class WearSession(
    val userId: String,
    val label: String,
)

internal fun reconcileAuthoritativeWearSchedule(
    remoteSchedule: WearScheduleResponseDto,
    operationStore: WearMatchOperationStore,
    applyOperation: (WearMatchDto, WearPendingMatchOperation) -> WearMatchDto,
): WearScheduleResponseDto {
    operationStore.removeImportedOperations()
    val operationsByMatchId = operationStore.localOverlayOperations()
        .mapNotNull { operation -> operation.matchId.normalizedId()?.let { it to operation } }
        .groupBy({ it.first }, { it.second })
    if (operationsByMatchId.isEmpty()) return remoteSchedule
    return remoteSchedule.copy(
        matches = remoteSchedule.matches.map { match ->
            val matchId = match.resolvedId() ?: return@map match
            operationsByMatchId[matchId]
                .orEmpty()
                .fold(match) { current, operation -> applyOperation(current, operation) }
        },
    )
}

internal fun reconcileAuthoritativeWearMatch(
    remoteMatch: WearMatchDto,
    operationStore: WearMatchOperationStore,
    applyOperation: (WearMatchDto, WearPendingMatchOperation) -> WearMatchDto,
): WearMatchDto {
    val matchId = remoteMatch.resolvedId() ?: return remoteMatch
    operationStore.removeImportedOperations(matchId)
    return operationStore.localOverlayOperations(matchId)
        .fold(remoteMatch) { current, operation -> applyOperation(current, operation) }
}

fun WearIncidentTypeDefinitionDto.isScoring(): Boolean =
    (linkedPointDelta ?: 0) != 0 ||
        kind.equals("SCORING", ignoreCase = true) ||
        code.equals("POINT", ignoreCase = true) ||
        code.equals("GOAL", ignoreCase = true) ||
        code.equals("RUN", ignoreCase = true)

fun WearIncidentTypeDefinitionDto.requiresPlayer(rules: WearResolvedMatchRulesDto): Boolean =
    requiresParticipant == true || (isScoring() && rules.pointIncidentRequiresParticipant)

internal suspend fun hydrateWearTeams(
    teams: List<WearTeamDto>,
    fetchUsers: suspend (List<String>) -> Map<String, WearUserProfileDto>,
): Map<String, WearTeam> {
    val usersById = fetchUsers(
        teams
            .flatMap(WearTeamDto::participantUserIds)
            .distinct(),
    )
    return teams
        .mapNotNull { team -> team.resolvedId()?.let { it to team.toWearTeam(usersById) } }
        .toMap()
}

private fun WearTeamDto.participantUserIds(): List<String> {
    val registrationUserIds = playerRegistrations.orEmpty()
        .mapNotNull(WearTeamRegistrationDto::participantUserId)
    return registrationUserIds.ifEmpty {
        playerIds.orEmpty().mapNotNull { userId -> userId.normalizedId() }
    }
}

private fun WearTeamDto.toWearTeam(usersById: Map<String, WearUserProfileDto>): WearTeam {
    val registrations = playerRegistrations.orEmpty()
    val players = registrations
        .mapNotNull { registration ->
            val userId = registration.participantUserId() ?: return@mapNotNull null
            WearPlayer(
                participantUserId = userId,
                eventRegistrationId = registration.id.normalizedId(),
                label = usersById[userId]?.label() ?: userId,
                jerseyNumber = registration.jerseyNumber.normalizedText(),
            )
        }
        .ifEmpty {
            playerIds.orEmpty().mapNotNull { rawUserId ->
                val userId = rawUserId.normalizedId() ?: return@mapNotNull null
                WearPlayer(
                    participantUserId = userId,
                    eventRegistrationId = null,
                    label = usersById[userId]?.label() ?: userId,
                )
            }
        }
    return WearTeam(
        id = resolvedId().orEmpty(),
        label = label(),
        players = players.distinctBy(WearPlayer::participantUserId),
    )
}

private fun WearMatchDto.isAssignedOfficial(userId: String): Boolean {
    val normalizedUserId = userId.normalizedId() ?: return false
    if (officialId.normalizedId() == normalizedUserId) return true
    return officialIds.any { assignment -> assignment.userId.normalizedId() == normalizedUserId }
}

private fun WearMatchDto.isUserCheckedIn(userId: String): Boolean {
    val normalizedUserId = userId.normalizedId() ?: return false
    return officialIds.firstOrNull { assignment -> assignment.userId.normalizedId() == normalizedUserId }
        ?.checkedIn == true ||
        (officialId.normalizedId() == normalizedUserId && officialCheckedIn == true)
}

private fun WearMatchDto.assignmentForUser(userId: String?): WearOfficialAssignmentDto? {
    val normalizedUserId = userId.normalizedId() ?: return null
    return officialIds.firstOrNull { assignment -> assignment.userId.normalizedId() == normalizedUserId }
}

private fun WearScheduleResponseDto.trimForOfficial(userId: String): WearScheduleResponseDto {
    val assignedMatches = matches.filter { match -> match.isAssignedOfficial(userId) }
    val eventIds = assignedMatches.mapNotNull { match -> match.eventId.normalizedId() }.toSet()
    val teamIds = assignedMatches
        .flatMap { match -> listOf(match.team1Id.normalizedId(), match.team2Id.normalizedId()) }
        .filterNotNull()
        .toSet()
    val fieldIds = assignedMatches.mapNotNull { match -> match.fieldId.normalizedId() }.toSet()
    return copy(
        events = events.filter { event -> event.resolvedId() in eventIds },
        matches = assignedMatches,
        teams = teams.filter { team -> team.resolvedId() in teamIds },
        fields = fields.filter { field -> field.resolvedId() in fieldIds },
    )
}

fun WearMatchDto.orderedSegments(): List<WearMatchSegmentDto> =
    segments.sortedBy { it.sequence }

fun WearMatchDto.activeSegment(): WearMatchSegmentDto? =
    orderedSegments().firstOrNull { segment -> segment.status.equals("IN_PROGRESS", ignoreCase = true) }

fun WearMatchDto.nextPlayableSegment(rules: WearResolvedMatchRulesDto): WearMatchSegmentDto? {
    val ordered = orderedSegments()
    return ordered.firstOrNull { segment -> !segment.status.equals("COMPLETE", ignoreCase = true) }
}

fun WearMatchDto.nextPlayableSequence(rules: WearResolvedMatchRulesDto): Int? {
    val ordered = orderedSegments()
    if (ordered.isEmpty()) return 1
    ordered.firstOrNull { segment -> !segment.status.equals("COMPLETE", ignoreCase = true) }?.let {
        return it.sequence
    }
    val maxSequence = ordered.maxOfOrNull { it.sequence } ?: 0
    return if (maxSequence < rules.segmentCount.coerceAtLeast(1)) {
        maxSequence + 1
    } else {
        null
    }
}

private fun segmentOperationJson(
    segment: WearMatchSegmentDto?,
    match: WearMatch,
    sequence: Int,
    status: String,
    startedAt: String? = null,
    endedAt: String? = null,
    clearStartedAt: Boolean = false,
    clearEndedAt: Boolean = false,
    clearWinner: Boolean = false,
    winnerEventTeamId: String? = null,
    writeWinner: Boolean = false,
): JsonObject = buildJsonObject {
    segment?.resolvedId()?.takeIf(String::isNotBlank)?.let { put("id", JsonPrimitive(it)) }
    put("sequence", JsonPrimitive(sequence))
    put("status", JsonPrimitive(status))
    if (!match.rules.pointIncidentRequiresParticipant) {
        val nextScores = buildMap {
            match.team1?.id?.let { put(it, segment?.scores?.get(it) ?: 0) }
            match.team2?.id?.let { put(it, segment?.scores?.get(it) ?: 0) }
            segment?.scores.orEmpty().forEach { (teamId, score) -> putIfAbsent(teamId, score) }
        }
        put("scores", JsonObject(nextScores.mapValues { JsonPrimitive(it.value) }))
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
    if (clearWinner) {
        put("winnerEventTeamId", JsonNull)
    } else if (writeWinner) {
        winnerEventTeamId.normalizedId()?.let { put("winnerEventTeamId", JsonPrimitive(it)) }
            ?: put("winnerEventTeamId", JsonNull)
    } else {
        segment?.winnerEventTeamId.normalizedId()?.let { put("winnerEventTeamId", JsonPrimitive(it)) }
    }
}

private fun segmentWinnerTeamId(match: WearMatch, segment: WearMatchSegmentDto): String? {
    val team1Id = match.team1?.id ?: return null
    val team2Id = match.team2?.id ?: return null
    val team1Score = segment.scores[team1Id] ?: 0
    val team2Score = segment.scores[team2Id] ?: 0
    return when {
        team1Score > team2Score -> team1Id
        team2Score > team1Score -> team2Id
        else -> null
    }
}

fun WearMatch.segmentUnitLabel(): String {
    val rawLabel = rules.segmentLabel.normalizedText()?.trim().orEmpty()
    return when {
        rawLabel.isBlank() -> "Segment"
        rawLabel.equals("Total", ignoreCase = true) -> "Segment"
        else -> rawLabel.replaceFirstChar { char -> char.uppercaseChar() }
    }
}

fun WearMatch.canUseTieBreaker(): Boolean =
    rules.supportsOvertime ||
        rules.canUseOvertime ||
        rules.supportsShootout ||
        rules.canUseShootout

fun WearMatch.displayScoreFor(teamId: String?): Int {
    val normalizedTeamId = teamId.normalizedId() ?: return 0
    return if (rules.scoringModel.equals("SETS", ignoreCase = true)) {
        (raw.activeSegment() ?: raw.nextPlayableSegment(rules))
            ?.scores
            ?.get(normalizedTeamId)
            ?: 0
    } else {
        raw.orderedSegments().sumOf { segment -> segment.scores[normalizedTeamId] ?: 0 }
    }
}

fun WearMatch.regulationComplete(): Boolean {
    val regulationCount = rules.segmentCount.coerceAtLeast(1)
    val regulationSegments = raw.orderedSegments().filter { it.sequence <= regulationCount }
    return regulationSegments.size >= regulationCount &&
        regulationSegments.all { it.status.equals("COMPLETE", ignoreCase = true) }
}

fun WearMatch.isTiedForContinuation(): Boolean {
    val team1Id = team1?.id ?: return false
    val team2Id = team2?.id ?: return false
    return if (rules.scoringModel.equals("SETS", ignoreCase = true)) {
        val team1Wins = raw.orderedSegments().count { it.winnerEventTeamId.normalizedId() == team1Id }
        val team2Wins = raw.orderedSegments().count { it.winnerEventTeamId.normalizedId() == team2Id }
        team1Wins == team2Wins
    } else {
        val team1Score = raw.orderedSegments().sumOf { it.scores[team1Id] ?: 0 }
        val team2Score = raw.orderedSegments().sumOf { it.scores[team2Id] ?: 0 }
        team1Score == team2Score
    }
}

fun WearMatch.shouldOfferFinishAndStart(): Boolean =
    raw.activeSegment() == null &&
        regulationComplete() &&
        isTiedForContinuation() &&
        canUseTieBreaker()

fun WearMatch.canStartSegmentFromDetail(): Boolean {
    if (raw.activeSegment() != null) return false
    val nextSegment = raw.nextPlayableSegment(rules)
    if (nextSegment != null) return true
    return raw.nextPlayableSequence(rules) != null || shouldOfferFinishAndStart()
}

fun WearMatch.startSegmentActionLabel(): String =
    "Start ${nextStartUnitLabel()}"

private fun WearMatch.nextStartUnitLabel(): String {
    val regulationCount = rules.segmentCount.coerceAtLeast(1)
    val sequence = raw.nextPlayableSegment(rules)?.sequence
        ?: raw.nextPlayableSequence(rules)
        ?: (raw.segments.maxOfOrNull { it.sequence } ?: regulationCount) + 1
    return when {
        sequence <= regulationCount -> regulationStartLabel(sequence)
        rules.supportsOvertime || rules.canUseOvertime -> {
            val overtimeSequence = sequence - regulationCount
            if (overtimeSequence <= 1) "Overtime" else "Overtime $overtimeSequence"
        }
        rules.supportsShootout || rules.canUseShootout -> "Penalties"
        else -> segmentUnitLabel()
    }
}

private fun WearMatch.regulationStartLabel(sequence: Int): String {
    val unit = segmentUnitLabel()
    return if (unit.equals("Half", ignoreCase = true)) {
        when (sequence) {
            1 -> "First Half"
            2 -> "Second Half"
            else -> "Half $sequence"
        }
    } else {
        "$unit $sequence"
    }
}

private fun secondsForMinute(minute: Int): Int = (minute.coerceAtLeast(1) - 1) * 60

private fun minuteForClockSeconds(seconds: Int): Int = (seconds.coerceAtLeast(0) / 60) + 1

private data class IncidentClockDetails(
    val minute: Int,
    val clock: String,
    val clockSeconds: Int,
)

private fun formatClock(seconds: Int): String {
    val safeSeconds = seconds.coerceAtLeast(0)
    val hours = safeSeconds / 3600
    val minutes = (safeSeconds % 3600) / 60
    val remainder = safeSeconds % 60
    return if (hours > 0) {
        "$hours:${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}"
    } else {
        "${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}"
    }
}

private fun formatClockAsMinutes(seconds: Int): String {
    val safeSeconds = seconds.coerceAtLeast(0)
    val minutes = safeSeconds / 60
    val remainder = safeSeconds % 60
    return "$minutes:${remainder.toString().padStart(2, '0')}"
}

private fun durationSecondsForSegmentSequence(
    rules: WearResolvedMatchRulesDto,
    sequence: Int,
): Int? {
    val durationMinutes = rules.timekeeping.segmentDurationMinutesBySequence.getOrNull(sequence - 1)
        ?: rules.timekeeping.segmentDurationMinutes
    return durationMinutes?.takeIf { it > 0 }?.times(60)
}

private fun regulationOffsetSeconds(
    segment: WearMatchSegmentDto,
    rules: WearResolvedMatchRulesDto,
): Int {
    if (!rules.timekeeping.addedTimeEnabled) return 0
    val sequence = segment.sequence.coerceAtLeast(1)
    var offsetSeconds = 0
    for (index in 1 until sequence) {
        offsetSeconds += durationSecondsForSegmentSequence(rules, index) ?: 0
    }
    return offsetSeconds
}

private fun formatAddedTimeIncidentClock(regulationEndSeconds: Int, addedSeconds: Int): String {
    val regulationMinute = (regulationEndSeconds / 60).coerceAtLeast(0)
    val addedMinute = (addedSeconds.coerceAtLeast(0) / 60) + 1
    return "$regulationMinute+$addedMinute"
}

private fun incidentClockDetails(
    clockSeconds: Int,
    segment: WearMatchSegmentDto,
    rules: WearResolvedMatchRulesDto,
): IncidentClockDetails {
    val safeClockSeconds = clockSeconds.coerceAtLeast(0)
    if (!rules.timekeeping.addedTimeEnabled) {
        return IncidentClockDetails(
            minute = minuteForClockSeconds(safeClockSeconds),
            clock = formatClock(safeClockSeconds),
            clockSeconds = safeClockSeconds,
        )
    }
    val durationSeconds = durationSecondsForSegmentSequence(rules, segment.sequence)
    val regulationOffsetSeconds = regulationOffsetSeconds(segment, rules)
    val regulationEndSeconds = regulationOffsetSeconds + (durationSeconds ?: 0)
    return IncidentClockDetails(
        minute = minuteForClockSeconds(safeClockSeconds),
        clock = if (durationSeconds != null && safeClockSeconds >= regulationEndSeconds) {
            formatAddedTimeIncidentClock(regulationEndSeconds, safeClockSeconds - regulationEndSeconds)
        } else {
            formatClockAsMinutes(safeClockSeconds)
        },
        clockSeconds = safeClockSeconds,
    )
}
