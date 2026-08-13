package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.analytics.AnalyticsEvent
import com.razumly.mvp.core.analytics.AnalyticsTracker
import dev.icerock.moko.geo.LatLng
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.EventEditorBootstrapQueryDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCommandDto
import com.razumly.mvp.core.network.dto.EventEditorSaveCommandDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleRequestDto
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
import io.github.aakira.napier.Napier
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
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

    private suspend fun mergeScheduleMatchProjections(matches: List<MatchMVP>): List<MatchMVP> {
        if (matches.isEmpty()) return matches
        val cachedMatchesById = databaseService.getMatchDao
            .getMatchesByIds(matches.map(MatchMVP::id))
            .associateBy(MatchMVP::id)
        return matches.map { scheduleMatch ->
            mergeScheduleMatchProjection(
                scheduleMatch = scheduleMatch,
                cachedMatch = cachedMatchesById[scheduleMatch.id],
            )
        }
    }

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
            roomStore.cacheAndReadEvent(
                event = event,
                expectedEventId = normalizedEventId,
            )
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
        val response = editorRemoteGateway.create(command)
        val canonical = EventEditorSessionMapper.canonicalState(
            snapshot = response.snapshot,
            operationId = command.createOperationId,
        )
        EventEditorSaveOutcome(
            session = EventEditorSession(
                snapshot = response.snapshot,
                canonicalState = canonical,
                baseline = canonical,
                createOperationId = command.createOperationId,
            ),
            questionIdMap = response.questionIdMap,
            staffEmailDelivery = response.staffEmailDelivery,
            scheduleOutcome = response.scheduleOutcome,
        )
    }

    override suspend fun getEventEditor(eventId: String): Result<EventEditorSession> = runCatching {
        EventEditorSessionMapper.fromEditSnapshot(editorRemoteGateway.openEdit(eventId))
    }

    override suspend fun saveEventEditor(
        eventId: String,
        command: EventEditorSaveCommandDto,
    ): Result<EventEditorSaveOutcome> = runCatching {
        val response = editorRemoteGateway.save(eventId, command)
        val canonical = EventEditorSessionMapper.canonicalState(response.snapshot)
        EventEditorSaveOutcome(
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

    override suspend fun scheduleEventEditor(
        eventId: String,
        request: EventEditorScheduleRequestDto,
    ): Result<EventScheduleOutcome> = runCatching {
        val response = editorRemoteGateway.schedule(eventId, request)
        val normalizedEventId = eventId.trim()
        val event = response.event?.toEventOrNull()
            ?: error("Event editor schedule response missing event")
        val matches = mergeScheduleMatchProjections(
            response.matches.mapNotNull { match -> match.toMatchOrNull() },
        )
        val persistedEvent = roomStore.cacheAndReadEvent(event, expectedEventId = normalizedEventId)
        persistBootstrapMatches(normalizedEventId, matches)
        EventScheduleOutcome(
            event = persistedEvent,
            matches = matches,
            warnings = response.warnings.map { warning -> warning.message },
            didRebuildSchedule = response.didRebuildSchedule,
        )
    }

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
            ?.toEventOrNull()
        val baseEvent = bootstrapEvent ?: cachedEvent ?: event
        val participantSnapshot = bootstrap.participantSnapshot
            ?: EventParticipantsSnapshotResponseDto(event = bootstrap.event)
        val participantResult = participantSyncCoordinator.mergeParticipantsSnapshot(
            baseEvent = baseEvent,
            snapshot = participantSnapshot,
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

        EventDetailSyncResult(
            participants = participantResult,
            matches = matches,
            fields = fields,
            timeSlots = bootstrap.timeSlots,
            leagueScoringConfig = leagueScoringConfig,
            staffInvites = bootstrap.staffInvites,
            staffRevision = bootstrap.staffRevision?.trim()?.takeIf(String::isNotBlank),
        )
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

    override suspend fun updateLocalEvent(newEvent: Event): Result<Event> {
        databaseService.getEventDao.upsertEvent(newEvent)
        return Result.success(newEvent)
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
        val matches = mergeScheduleMatchProjections(matchesById.values.toList())
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
