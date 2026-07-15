package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.analytics.AnalyticsEvent
import com.razumly.mvp.core.analytics.AnalyticsTracker
import com.razumly.mvp.core.util.jsonMVP
import dev.icerock.moko.geo.LatLng
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.CreateEventRequestDto
import com.razumly.mvp.core.network.dto.CreateEventTemplateRequestDto
import com.razumly.mvp.core.network.dto.EventApiDto
import com.razumly.mvp.core.network.dto.EventParticipantsSnapshotResponseDto
import com.razumly.mvp.core.network.dto.EventResponseDto
import com.razumly.mvp.core.network.dto.EventStaffPendingInviteDto
import com.razumly.mvp.core.network.dto.EventStaffPutRequestDto
import com.razumly.mvp.core.network.dto.EventStaffStateResponseDto
import com.razumly.mvp.core.network.dto.EventTemplateResponseDto
import com.razumly.mvp.core.network.dto.ProfileScheduleResponseDto
import com.razumly.mvp.core.network.dto.ProfileScheduleNextActionResponseDto
import com.razumly.mvp.core.network.dto.ScheduleEventRequestDto
import com.razumly.mvp.core.network.dto.ScheduleEventResponseDto
import com.razumly.mvp.core.network.dto.SeedEventTemplateRequestDto
import com.razumly.mvp.core.network.dto.StandingsConfirmRequestDto
import com.razumly.mvp.core.network.dto.StandingsConfirmResponseDto
import com.razumly.mvp.core.network.dto.StandingsResponseDto
import com.razumly.mvp.core.network.dto.UpdateEventRequestDto
import com.razumly.mvp.core.network.dto.toEventsOrThrow
import com.razumly.mvp.core.network.dto.toUpdateDto
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
    sportId?.trim()?.takeIf(String::isNotBlank)?.let { put("sport_id", it) }
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

    override suspend fun getEventStaffInvites(eventId: String): Result<List<Invite>> = runCatching {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank) ?: return@runCatching emptyList()
        detailRemoteGateway.fetchEventDto(normalizedEventId).staffInvites.orEmpty()
    }

    override suspend fun getEventStaffState(event: Event): Result<EventStaffState> = runCatching {
        val eventId = event.id.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        val response = api.get<EventStaffStateResponseDto>("api/events/$eventId/staff")
        response.toEventStaffState(event).also { state ->
            cacheEventStaffStateBestEffort(state)
        }
    }

    override suspend fun reconcileEventStaff(
        event: Event,
        pendingInvites: List<EventStaffInviteInput>,
        expectedRevision: String,
    ): Result<EventStaffState> = runCatching {
        val eventId = event.id.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        val revision = expectedRevision.trim().takeIf(String::isNotBlank)
            ?: error("Event staff revision is required.")
        val response = api.put<EventStaffPutRequestDto, EventStaffStateResponseDto>(
            path = "api/events/$eventId/staff",
            body = EventStaffPutRequestDto(
                expectedRevision = revision,
                assistantHostIds = event.assistantHostIds,
                eventOfficials = event.eventOfficials,
                pendingInvites = pendingInvites.map { invite ->
                    EventStaffPendingInviteDto(
                        email = invite.email.trim().lowercase(),
                        firstName = invite.firstName.trim(),
                        lastName = invite.lastName.trim(),
                        roles = invite.roles.map(EventStaffAssignmentRole::name).sorted(),
                        resolvedUserId = invite.resolvedUserId?.trim()?.takeIf(String::isNotBlank),
                    )
                },
            ),
        )
        response.toEventStaffState(event).also { state ->
            cacheEventStaffStateBestEffort(state)
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

    override suspend fun createEvent(
        newEvent: Event,
        requiredTemplateIds: List<String>,
        leagueScoringConfig: LeagueScoringConfigDTO?,
        fields: List<Field>?,
        timeSlots: List<TimeSlot>?,
    ): Result<Event> =
        singleResponse(networkCall = {
            val created = api.post<CreateEventRequestDto, EventResponseDto>(
                path = "api/events",
                body = CreateEventRequestDto(
                    id = newEvent.id,
                    event = newEvent.toUpdateDto(
                        requiredTemplateIdsOverride = requiredTemplateIds,
                        leagueScoringConfigOverride = null,
                        fieldsOverride = null,
                        timeSlotsOverride = null,
                        includeOrganizationId = true,
                        includeFieldObjects = false,
                        includeTimeSlotObjects = false,
                        applyEventDefaultsToMissingDivisionDetails = true,
                    ),
                    newFields = fields,
                    timeSlots = timeSlots,
                    leagueScoringConfig = leagueScoringConfig,
                ),
            ).event?.toEventOrNull() ?: error("Create event response missing event")
            created
        }, saveCall = { event ->
            databaseService.getEventDao.upsertEvent(event)
            participantSyncCoordinator.persistEventRelations(event)
        }, onReturn = { event ->
            AnalyticsTracker.capture(
                AnalyticsEvent.EventCreated,
                event.analyticsProperties(),
            )
            event
        })

    override suspend fun createEventTemplateFromEvent(sourceEventId: String): Result<EventTemplateSummary> = runCatching {
        val normalizedSourceEventId = sourceEventId.trim()
        if (normalizedSourceEventId.isEmpty()) error("Template source event id is required.")

        val response = api.post<CreateEventTemplateRequestDto, EventTemplateResponseDto>(
            path = "api/event-templates",
            body = CreateEventTemplateRequestDto(sourceEventId = normalizedSourceEventId),
        )
        response.template?.toEventTemplateSummaryOrNull() ?: error("Create template response missing template")
    }

    override suspend fun seedEventTemplate(
        templateId: String,
        newEventId: String,
        newStartDate: Instant,
    ): Result<SeededEventTemplateDraft> = runCatching {
        val normalizedTemplateId = templateId.trim()
        val normalizedEventId = newEventId.trim()
        if (normalizedTemplateId.isEmpty()) error("Template id is required.")
        if (normalizedEventId.isEmpty()) error("New event id is required.")

        val response = api.post<SeedEventTemplateRequestDto, EventResponseDto>(
            path = "api/event-templates/${normalizedTemplateId.encodeURLQueryComponent()}/seed",
            body = SeedEventTemplateRequestDto(
                newEventId = normalizedEventId,
                newStartDate = newStartDate.toString(),
            ),
        )
        val eventDto = response.event ?: error("Template seed response missing event")
        val event = eventDto.toEventOrNull() ?: error("Template seed response included an invalid event")
        val seededTimeSlots = eventDto.timeSlots.map { slot ->
            val slotId = slot.id?.trim().orEmpty()
            if (slotId.isEmpty()) {
                error("Template seed response included a time slot without an id")
            }
            slot.toTimeSlot(slotId)
        }
        SeededEventTemplateDraft(
            event = event,
            fields = eventDto.fields,
            timeSlots = seededTimeSlots,
            leagueScoringConfig = eventDto.leagueScoringConfig,
        )
    }

    override suspend fun scheduleEvent(
        eventId: String,
        participantCount: Int?,
        includePlaceholderTeams: Boolean?,
    ): Result<Event> = runCatching {
        val normalizedId = eventId.trim()
        if (normalizedId.isEmpty()) error("Schedule event requires an event id")

        val response = api.post<ScheduleEventRequestDto, ScheduleEventResponseDto>(
            path = "api/events/$normalizedId/schedule",
            body = ScheduleEventRequestDto(
                participantCount = participantCount,
                includePlaceholderTeams = includePlaceholderTeams,
            ),
        )
        val event = response.event?.toEventOrNull()
            ?: error("Schedule event response missing event")
        val matches = response.matches.mapNotNull { match -> match.toMatchOrNull() }

        databaseService.getMatchDao.deleteMatchesOfTournament(event.id)
        if (matches.isNotEmpty()) {
            databaseService.getMatchDao.upsertMatches(matches)
        }
        databaseService.getEventDao.upsertEvent(event)
        participantSyncCoordinator.persistEventRelations(event)
        event
    }

    override suspend fun updateEvent(
        newEvent: Event,
        fields: List<Field>?,
        timeSlots: List<TimeSlot>?,
        leagueScoringConfig: LeagueScoringConfigDTO?,
    ): Result<Event> = updateEventInternal(
        newEvent = newEvent,
        fields = fields,
        timeSlots = timeSlots,
        leagueScoringConfig = leagueScoringConfig,
        expectedStaffRevision = null,
    )

    override suspend fun updateEventPreservingStaff(
        newEvent: Event,
        fields: List<Field>?,
        timeSlots: List<TimeSlot>?,
        leagueScoringConfig: LeagueScoringConfigDTO?,
        expectedStaffRevision: String,
    ): Result<Event> {
        val revision = expectedStaffRevision.trim()
        if (revision.isEmpty()) {
            return Result.failure(IllegalArgumentException("Event staff revision is required."))
        }
        return updateEventInternal(
            newEvent = newEvent,
            fields = fields,
            timeSlots = timeSlots,
            leagueScoringConfig = leagueScoringConfig,
            expectedStaffRevision = revision,
        )
    }

    private suspend fun updateEventInternal(
        newEvent: Event,
        fields: List<Field>?,
        timeSlots: List<TimeSlot>?,
        leagueScoringConfig: LeagueScoringConfigDTO?,
        expectedStaffRevision: String?,
    ): Result<Event> =
        singleResponse(networkCall = {
            val eventDto = newEvent.toUpdateDto(
                leagueScoringConfigOverride = leagueScoringConfig,
                fieldsOverride = fields,
                timeSlotsOverride = timeSlots,
                includeOrganizationId = false,
                includeFieldObjects = fields != null,
                includeTimeSlotObjects = timeSlots != null,
            )
            val encoded = jsonMVP.encodeToJsonElement(UpdateEventRequestDto(eventDto)).jsonObject
            val encodedEvent = JsonObject(
                (encoded["event"] as? JsonObject)
                    .orEmpty()
                    .filterKeys { field ->
                        field !in setOf("assistantHostIds", "eventOfficials", "officialIds")
                    },
            )
            val cachedEvent = databaseService.getEventDao.getEventById(newEvent.id)
            val clearableFields = cachedEvent
                ?.let { existing -> newEvent.explicitlyClearedEventPatchFields(existing) }
                .orEmpty()
            val eventPatch = JsonObject(
                encodedEvent + clearableFields
                    .filterNot(encodedEvent::containsKey)
                    .associateWith { JsonNull },
            )
            val requestBody = buildMap {
                put("event", eventPatch)
                expectedStaffRevision?.let { revision ->
                    put("preserveStaffAssignments", JsonPrimitive(true))
                    put("expectedStaffRevision", JsonPrimitive(revision))
                }
            }
            val updated = api.patch<JsonObject, EventApiDto>(
                path = "api/events/${newEvent.id}",
                body = JsonObject(requestBody),
            ).toEventOrNull() ?: error("Update event response missing event")
            updated
        }, saveCall = { event ->
            if (expectedStaffRevision == null) {
                databaseService.getEventDao.upsertEvent(event)
                participantSyncCoordinator.persistEventRelations(event)
            } else {
                cacheUpdatedEventBestEffort(event)
            }
        }, onReturn = { event ->
            event
        })

    private suspend fun cacheEventStaffStateBestEffort(state: EventStaffState) {
        runCatching {
            databaseService.getEventDao.upsertEvent(state.event)
            participantSyncCoordinator.persistEventRelations(state.event)
        }.onFailure { error ->
            Napier.w("Failed to cache event staff state for ${state.event.id}.", error)
        }
    }

    private suspend fun cacheUpdatedEventBestEffort(event: Event) {
        runCatching {
            databaseService.getEventDao.upsertEvent(event)
            participantSyncCoordinator.persistEventRelations(event)
        }.onFailure { error ->
            Napier.w("Failed to cache staff-preserving event update for ${event.id}.", error)
        }
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

        val events = eventsById.values.toList()
        val matches = matchesById.values.toList()
        val teams = teamsById.values.toList()
        val fields = fieldsById.values.toList()

        if (events.isNotEmpty()) {
            databaseService.getEventDao.upsertEvents(events)
        }
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
