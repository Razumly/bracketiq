package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.data.util.divisionsEquivalent
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.util.calcDistance
import dev.icerock.moko.geo.LatLng
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.CreateEventRequestDto
import com.razumly.mvp.core.network.dto.EventApiDto
import com.razumly.mvp.core.network.dto.EventChildRegistrationRequestDto
import com.razumly.mvp.core.network.dto.EventChildRegistrationResponseDto
import com.razumly.mvp.core.network.dto.EventParticipantsRequestDto
import com.razumly.mvp.core.network.dto.EventParticipantsResponseDto
import com.razumly.mvp.core.network.dto.EventResponseDto
import com.razumly.mvp.core.network.dto.EventSearchFiltersDto
import com.razumly.mvp.core.network.dto.EventSearchRequestDto
import com.razumly.mvp.core.network.dto.EventSearchUserLocationDto
import com.razumly.mvp.core.network.dto.EventsResponseDto
import com.razumly.mvp.core.network.dto.ProfileScheduleResponseDto
import com.razumly.mvp.core.network.dto.ScheduleEventRequestDto
import com.razumly.mvp.core.network.dto.ScheduleEventResponseDto
import com.razumly.mvp.core.network.dto.UpdateEventRequestDto
import com.razumly.mvp.core.network.dto.toUpdateDto
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlin.time.Instant

interface IEventRepository : IMVPRepository {
    fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>>
    fun resetCursor()
    suspend fun getEvent(eventId: String): Result<Event>
    suspend fun getEventsByOrganization(organizationId: String, limit: Int = 200): Result<List<Event>>
    suspend fun createEvent(
        newEvent: Event,
        requiredTemplateIds: List<String> = emptyList(),
        leagueScoringConfig: LeagueScoringConfigDTO? = null,
    ): Result<Event>
    suspend fun scheduleEvent(eventId: String, participantCount: Int? = null): Result<Event>
    suspend fun updateEvent(newEvent: Event): Result<Event>
    suspend fun updateLocalEvent(newEvent: Event): Result<Event>
    fun getEventsInBoundsFlow(bounds: Bounds): Flow<Result<List<Event>>>
    suspend fun getEventsInBounds(bounds: Bounds): Result<Pair<List<Event>, Boolean>>
    suspend fun getEventsInBounds(
        bounds: Bounds,
        dateFrom: Instant? = null,
        dateTo: Instant? = null,
    ): Result<Pair<List<Event>, Boolean>>
    suspend fun searchEvents(
        searchQuery: String,
        userLocation: LatLng
    ): Result<Pair<List<Event>, Boolean>>
    fun getEventsByHostFlow(hostId: String): Flow<Result<List<Event>>>
    fun getEventTemplatesByHostFlow(hostId: String): Flow<Result<List<Event>>> =
        flowOf(Result.success(emptyList()))
    suspend fun deleteEvent(eventId: String): Result<Unit>
    suspend fun addCurrentUserToEvent(
        event: Event,
        preferredDivisionId: String? = null,
    ): Result<SelfRegistrationResult>
    suspend fun registerChildForEvent(
        eventId: String,
        childUserId: String,
        joinWaitlist: Boolean = false,
    ): Result<ChildRegistrationResult>
    suspend fun addTeamToEvent(event: Event, team: Team): Result<Unit>
    suspend fun removeTeamFromEvent(event: Event, teamWithPlayers: TeamWithPlayers): Result<Unit>
    suspend fun removeCurrentUserFromEvent(event: Event, targetUserId: String? = null): Result<Unit>
    suspend fun getMySchedule(): Result<UserScheduleSnapshot> = Result.success(UserScheduleSnapshot())
}

data class SelfRegistrationResult(
    val requiresParentApproval: Boolean = false,
    val joinedWaitlist: Boolean = false,
)

data class ChildRegistrationResult(
    val registrationStatus: String? = null,
    val consentStatus: String? = null,
    val requiresParentApproval: Boolean = false,
    val requiresChildEmail: Boolean = false,
    val joinedWaitlist: Boolean = false,
    val warnings: List<String> = emptyList(),
)

data class UserScheduleSnapshot(
    val events: List<Event> = emptyList(),
    val matches: List<MatchMVP> = emptyList(),
    val teams: List<Team> = emptyList(),
    val fields: List<Field> = emptyList(),
)

private data class RegistrationDivisionPayload(
    val divisionId: String? = null,
    val divisionTypeId: String? = null,
    val divisionTypeKey: String? = null,
)

class EventRepository(
    private val databaseService: DatabaseService,
    private val api: MvpApiClient,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
) : IEventRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    init {
        scope.launch {
            databaseService.getEventDao.deleteAllEvents()
        }
    }

    override fun resetCursor() {
        // Paging is currently handled by the UI by re-issuing search calls; keep this as a no-op for now.
    }

    override fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>> =
        callbackFlow {
            val localJob = launch {
                databaseService.getEventDao.getEventWithRelationsFlow(eventId)
                    .collect { local ->
                        trySend(Result.success(local))
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

    private suspend fun fetchRemoteEvent(eventId: String): Event {
        val dto = api.get<EventApiDto>("api/events/$eventId")
        return dto.toEventOrNull() ?: error("Event $eventId response missing required fields")
    }

    private suspend fun fetchRemoteEventsByHost(hostId: String): List<Event> {
        val encodedHostId = hostId.encodeURLQueryComponent()
        val res = api.get<EventsResponseDto>("api/events?hostId=$encodedHostId&limit=200")
        return res.events.mapNotNull { it.toEventOrNull() }
    }

    private suspend fun fetchRemoteEventTemplatesByHost(hostId: String): List<Event> {
        val encodedHostId = hostId.encodeURLQueryComponent()
        val res = api.get<EventsResponseDto>(
            "api/events?hostId=$encodedHostId&state=TEMPLATE&limit=200"
        )
        return res.events.mapNotNull { it.toEventOrNull() }
    }

    private suspend fun fetchRemoteEventsByOrganization(organizationId: String, limit: Int): List<Event> {
        val encodedOrganizationId = organizationId.encodeURLQueryComponent()
        val safeLimit = limit.coerceIn(1, 500)
        val res = api.get<EventsResponseDto>(
            "api/events?organizationId=$encodedOrganizationId&limit=$safeLimit"
        )
        return res.events.mapNotNull { it.toEventOrNull() }
    }

    private suspend fun insertEventCrossReferences(
        eventId: String, players: List<UserData>, host: List<UserData>, teams: List<Team>
    ) {
        databaseService.getEventDao.deleteEventCrossRefs(eventId)

        databaseService.getEventDao.upsertEventTeamCrossRefs(
            teams.map { EventTeamCrossRef(it.id, eventId) })
        databaseService.getUserDataDao.upsertUserEventCrossRefs(
            (players).map { EventUserCrossRef(it.id, eventId) })
        databaseService.getTeamDao.upsertTeamPlayerCrossRefs(
            teams.flatMap { team ->
                team.playerIds.map { playerId ->
                    TeamPlayerCrossRef(team.id, playerId)
                }
            })
    }

    override suspend fun getEvent(eventId: String): Result<Event> =
        singleResponse(networkCall = {
            fetchRemoteEvent(eventId)
        }, saveCall = { event ->
            databaseService.getEventDao.upsertEvent(event)
            persistEventRelations(event)
        }, onReturn = {
            databaseService.getEventDao.getEventById(eventId)
                ?: throw IllegalStateException("Event $eventId not cached")
        })

    override suspend fun getEventsByOrganization(
        organizationId: String,
        limit: Int,
    ): Result<List<Event>> {
        val normalizedOrganizationId = organizationId.trim()
        if (normalizedOrganizationId.isEmpty()) {
            return Result.success(emptyList())
        }

        return runCatching {
            val events = fetchRemoteEventsByOrganization(normalizedOrganizationId, limit)
            if (events.isNotEmpty()) {
                databaseService.getEventDao.upsertEvents(events)
            }
            events
        }
    }

    override suspend fun createEvent(
        newEvent: Event,
        requiredTemplateIds: List<String>,
        leagueScoringConfig: LeagueScoringConfigDTO?,
    ): Result<Event> =
        singleResponse(networkCall = {
            val created = api.post<CreateEventRequestDto, EventResponseDto>(
                path = "api/events",
                body = CreateEventRequestDto(
                    id = newEvent.id,
                    event = newEvent.toUpdateDto(
                        requiredTemplateIdsOverride = requiredTemplateIds,
                        leagueScoringConfigOverride = leagueScoringConfig,
                    ),
                ),
            ).event?.toEventOrNull() ?: error("Create event response missing event")
            created
        }, saveCall = { event ->
            databaseService.getEventDao.upsertEvent(event)
            persistEventRelations(event)
        }, onReturn = { event ->
            event
        })

    override suspend fun scheduleEvent(eventId: String, participantCount: Int?): Result<Event> =
        singleResponse(
            networkCall = {
                val normalizedId = eventId.trim()
                if (normalizedId.isEmpty()) error("Schedule event requires an event id")
                api.post<ScheduleEventRequestDto, ScheduleEventResponseDto>(
                    path = "api/events/$normalizedId/schedule",
                    body = ScheduleEventRequestDto(participantCount = participantCount),
                ).event?.toEventOrNull() ?: error("Schedule event response missing event")
            },
            saveCall = { event ->
                databaseService.getMatchDao.deleteMatchesOfTournament(event.id)
                databaseService.getEventDao.upsertEvent(event)
                persistEventRelations(event)
            },
            onReturn = { event -> event },
        )

    override suspend fun updateEvent(newEvent: Event): Result<Event> =
        singleResponse(networkCall = {
            val updated = api.patch<UpdateEventRequestDto, EventApiDto>(
                path = "api/events/${newEvent.id}",
                body = UpdateEventRequestDto(event = newEvent.toUpdateDto()),
            ).toEventOrNull() ?: error("Update event response missing event")
            updated
        }, saveCall = { event ->
            databaseService.getEventDao.upsertEvent(event)
            persistEventRelations(event)
        }, onReturn = { event ->
            event
        })

    override suspend fun updateLocalEvent(newEvent: Event): Result<Event> {
        databaseService.getEventDao.upsertEvent(newEvent)
        return Result.success(newEvent)
    }

    override fun getEventsInBoundsFlow(bounds: Bounds): Flow<Result<List<Event>>> {
        return databaseService.getEventDao.getAllCachedEvents().map { cached ->
            val inBounds = cached.filter { event ->
                calcDistance(bounds.center, LatLng(event.lat, event.long)) <= bounds.radiusMiles
            }
            Result.success(inBounds.sortedBy { calcDistance(bounds.center, LatLng(it.lat, it.long)) })
        }
    }

    override suspend fun getEventsInBounds(bounds: Bounds): Result<Pair<List<Event>, Boolean>> {
        return getEventsInBounds(bounds = bounds, dateFrom = null, dateTo = null)
    }

    override suspend fun getEventsInBounds(
        bounds: Bounds,
        dateFrom: Instant?,
        dateTo: Instant?,
    ): Result<Pair<List<Event>, Boolean>> {
        return runCatching {
            val res = api.post<EventSearchRequestDto, EventsResponseDto>(
                path = "api/events/search",
                body = EventSearchRequestDto(
                    filters = EventSearchFiltersDto(
                        maxDistance = bounds.radiusMiles,
                        userLocation = EventSearchUserLocationDto(
                            lat = bounds.center.latitude,
                            long = bounds.center.longitude,
                        ),
                        dateFrom = dateFrom?.toString(),
                        dateTo = dateTo?.toString(),
                    ),
                    limit = 200,
                    offset = 0,
                ),
            )

            val events = res.events.mapNotNull { it.toEventOrNull() }
            databaseService.getEventDao.upsertEvents(events)

            Pair(
                events.sortedBy { calcDistance(bounds.center, LatLng(it.lat, it.long)) },
                true,
            )
        }
    }

    override suspend fun searchEvents(
        searchQuery: String,
        userLocation: LatLng
    ): Result<Pair<List<Event>, Boolean>> {
        return runCatching {
            val res = api.post<EventSearchRequestDto, EventsResponseDto>(
                path = "api/events/search",
                body = EventSearchRequestDto(
                    filters = EventSearchFiltersDto(query = searchQuery),
                    limit = 50,
                    offset = 0,
                ),
            )

            val events = res.events.mapNotNull { it.toEventOrNull() }
            databaseService.getEventDao.upsertEvents(events)

            Pair(
                events.sortedBy { calcDistance(userLocation, LatLng(it.lat, it.long)) },
                true,
            )
        }
    }

    override fun getEventsByHostFlow(hostId: String): Flow<Result<List<Event>>> =
        callbackFlow {
            val localJob = launch {
                databaseService.getEventDao.getAllCachedEvents().collect { cached ->
                    trySend(Result.success(cached.filter { it.hostId == hostId }))
                }
            }

            val remoteJob = launch {
                runCatching {
                    val remote = fetchRemoteEventsByHost(hostId)

                    val localHostEvents = databaseService.getEventDao.getAllCachedEvents().first()
                        .filter { it.hostId == hostId }
                    val staleIds = localHostEvents.map { it.id }.toSet() - remote.map { it.id }.toSet()
                    if (staleIds.isNotEmpty()) {
                        databaseService.getEventDao.deleteEventsById(staleIds.toList())
                    }

                    databaseService.getEventDao.upsertEvents(remote)
                }.onFailure { error -> trySend(Result.failure(error)) }
            }

            awaitClose {
                localJob.cancel()
                remoteJob.cancel()
            }
        }

    override fun getEventTemplatesByHostFlow(hostId: String): Flow<Result<List<Event>>> =
        callbackFlow {
            val localJob = launch {
                databaseService.getEventDao.getAllCachedEvents().collect { cached ->
                    trySend(
                        Result.success(
                            cached.filter { event ->
                                event.hostId == hostId && event.state.equals("TEMPLATE", ignoreCase = true)
                            },
                        ),
                    )
                }
            }

            val remoteJob = launch {
                runCatching {
                    val remote = fetchRemoteEventTemplatesByHost(hostId)

                    val localTemplateEvents = databaseService.getEventDao.getAllCachedEvents().first()
                        .filter { event ->
                            event.hostId == hostId && event.state.equals("TEMPLATE", ignoreCase = true)
                        }
                    val staleIds = localTemplateEvents.map { it.id }.toSet() - remote.map { it.id }.toSet()
                    if (staleIds.isNotEmpty()) {
                        databaseService.getEventDao.deleteEventsById(staleIds.toList())
                    }

                    databaseService.getEventDao.upsertEvents(remote)
                }.onFailure { error -> trySend(Result.failure(error)) }
            }

            awaitClose {
                localJob.cancel()
                remoteJob.cancel()
            }
        }

    override suspend fun addCurrentUserToEvent(
        event: Event,
        preferredDivisionId: String?,
    ): Result<SelfRegistrationResult> =
        runCatching {
            val currentUser = userRepository.currentUser.value.getOrThrow()
            val eventAtCapacity = isEventAtCapacity(event)
            val divisionPayload = resolveRegistrationDivisionPayload(
                event = event,
                preferredDivisionId = preferredDivisionId,
            )
            val request = EventParticipantsRequestDto(
                userId = currentUser.id,
                divisionId = divisionPayload.divisionId,
                divisionTypeId = divisionPayload.divisionTypeId,
                divisionTypeKey = divisionPayload.divisionTypeKey,
            )
            val response = if (eventAtCapacity) {
                api.post<EventParticipantsRequestDto, EventParticipantsResponseDto>(
                    path = "api/events/${event.id}/waitlist",
                    body = request,
                )
            } else {
                api.post<EventParticipantsRequestDto, EventParticipantsResponseDto>(
                    path = "api/events/${event.id}/participants",
                    body = request,
                )
            }

            response.error?.takeIf(String::isNotBlank)?.let { errorMessage ->
                error(errorMessage)
            }

            response.event?.toEventOrNull()?.let { updated ->
                databaseService.getEventDao.upsertEvent(updated)
                persistEventRelations(updated)
            }

            SelfRegistrationResult(
                requiresParentApproval = response.requiresParentApproval == true,
                joinedWaitlist = eventAtCapacity && response.requiresParentApproval != true,
            )
        }

    override suspend fun registerChildForEvent(
        eventId: String,
        childUserId: String,
        joinWaitlist: Boolean,
    ): Result<ChildRegistrationResult> =
        runCatching {
            val normalizedEventId = eventId.trim()
            val normalizedChildUserId = childUserId.trim()
            if (normalizedEventId.isBlank() || normalizedChildUserId.isBlank()) {
                error("Event id and child user id are required.")
            }

            if (joinWaitlist) {
                val waitlistResponse = api.post<EventParticipantsRequestDto, EventParticipantsResponseDto>(
                    path = "api/events/$normalizedEventId/waitlist",
                    body = EventParticipantsRequestDto(userId = normalizedChildUserId),
                )
                waitlistResponse.error?.takeIf(String::isNotBlank)?.let { error(it) }
                waitlistResponse.event?.toEventOrNull()?.let { updated ->
                    databaseService.getEventDao.upsertEvent(updated)
                    persistEventRelations(updated)
                }

                return@runCatching ChildRegistrationResult(
                    registrationStatus = if (waitlistResponse.requiresParentApproval == true) {
                        "PENDINGCONSENT"
                    } else {
                        "WAITLISTED"
                    },
                    requiresParentApproval = waitlistResponse.requiresParentApproval == true,
                    joinedWaitlist = waitlistResponse.requiresParentApproval != true,
                )
            }

            val response = api.post<EventChildRegistrationRequestDto, EventChildRegistrationResponseDto>(
                path = "api/events/$normalizedEventId/registrations/child",
                body = EventChildRegistrationRequestDto(childId = normalizedChildUserId),
            )
            response.error?.takeIf(String::isNotBlank)?.let { error(it) }
            ChildRegistrationResult(
                registrationStatus = response.registration?.status,
                consentStatus = response.consent?.status ?: response.registration?.consentStatus,
                requiresParentApproval = response.requiresParentApproval == true,
                requiresChildEmail = response.consent?.requiresChildEmail == true,
                joinedWaitlist = false,
                warnings = response.warnings,
            )
        }

    override suspend fun addTeamToEvent(event: Event, team: Team): Result<Unit> =
        runCatching {
            if (event.waitList.contains(team.id)) {
                throw Exception("Team already in waitlist")
            }
            val updated = if (isEventAtCapacity(event)) {
                api.post<EventParticipantsRequestDto, EventResponseDto>(
                    path = "api/events/${event.id}/waitlist",
                    body = EventParticipantsRequestDto(teamId = team.id),
                )
            } else {
                api.post<EventParticipantsRequestDto, EventResponseDto>(
                    path = "api/events/${event.id}/participants",
                    body = EventParticipantsRequestDto(teamId = team.id),
                )
            }.event?.toEventOrNull() ?: error("Participant update response missing event")

            databaseService.getEventDao.upsertEvent(updated)
            persistEventRelations(updated)
        }

    override suspend fun removeTeamFromEvent(
        event: Event,
        teamWithPlayers: TeamWithPlayers
    ): Result<Unit> =
        runCatching {
            val updated = api.delete<EventParticipantsRequestDto, EventResponseDto>(
                path = "api/events/${event.id}/participants",
                body = EventParticipantsRequestDto(teamId = teamWithPlayers.team.id),
            ).event?.toEventOrNull() ?: error("Participant update response missing event")

            databaseService.getEventDao.upsertEvent(updated)
            persistEventRelations(updated)
        }

    override suspend fun removeCurrentUserFromEvent(event: Event, targetUserId: String?): Result<Unit> {
        val currentUser = userRepository.currentUser.value.getOrThrow()
        val resolvedUserId = targetUserId?.trim()?.takeIf(String::isNotBlank) ?: currentUser.id
        return runCatching {
            val updated = api.delete<EventParticipantsRequestDto, EventResponseDto>(
                path = "api/events/${event.id}/participants",
                body = EventParticipantsRequestDto(userId = resolvedUserId),
            ).event?.toEventOrNull() ?: error("Participant update response missing event")

            databaseService.getEventDao.upsertEvent(updated)
            persistEventRelations(updated)
        }
    }

    override suspend fun getMySchedule(): Result<UserScheduleSnapshot> = runCatching {
        val response = api.get<ProfileScheduleResponseDto>("api/profile/schedule")
        val events = response.events.mapNotNull { it.toEventOrNull() }
        val matches = response.matches.mapNotNull { it.toMatchOrNull() }
        val teams = response.teams.mapNotNull { it.toTeamOrNull() }
        val fields = response.fields

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

    override suspend fun deleteEvent(eventId: String): Result<Unit> = runCatching {
        api.deleteNoResponse("api/events/$eventId")
        databaseService.getEventDao.deleteEventWithCrossRefs(eventId)
    }

    private suspend fun persistEventRelations(event: Event) {
        val teams = if (event.teamIds.isNotEmpty()) {
            teamRepository.getTeams(event.teamIds).getOrThrow()
        } else {
            emptyList()
        }

        // Team-player cross refs require user rows for every player id.
        val teamPlayerIds = teams.flatMap { team -> team.playerIds }
        val allUserIds = (event.playerIds + event.hostId + teamPlayerIds).distinct().filter(String::isNotBlank)
        val users = if (allUserIds.isNotEmpty()) userRepository.getUsers(allUserIds).getOrThrow() else emptyList()

        val players = if (event.playerIds.isNotEmpty()) users.filter { it.id in event.playerIds } else emptyList()
        val host = users.filter { it.id == event.hostId }

        insertEventCrossReferences(event.id, players, host, teams)
    }

    private fun resolveRegistrationDivisionPayload(
        event: Event,
        preferredDivisionId: String?,
    ): RegistrationDivisionPayload {
        if (event.divisions.isEmpty()) {
            return RegistrationDivisionPayload()
        }

        val normalizedPreferredDivision = preferredDivisionId
            ?.normalizeDivisionIdentifier()
            ?.ifEmpty { null }

        val divisionDetails = mergeDivisionDetailsForDivisions(
            divisions = event.divisions,
            existingDetails = event.divisionDetails,
            eventId = event.id,
        )
        if (divisionDetails.isEmpty()) {
            return RegistrationDivisionPayload()
        }

        val selectedDivision = if (!normalizedPreferredDivision.isNullOrBlank()) {
            divisionDetails.firstOrNull { detail ->
                divisionsEquivalent(detail.id, normalizedPreferredDivision) ||
                    divisionsEquivalent(detail.key, normalizedPreferredDivision)
            } ?: divisionDetails.firstOrNull()
        } else {
            divisionDetails.firstOrNull()
        } ?: return RegistrationDivisionPayload()

        val divisionId = selectedDivision.id.normalizeDivisionIdentifier().ifEmpty {
            selectedDivision.key.normalizeDivisionIdentifier()
        }.ifEmpty { null }
        val divisionTypeId = selectedDivision.divisionTypeId.normalizeDivisionIdentifier().ifEmpty { null }
        val divisionTypeKey = selectedDivision.key.normalizeDivisionIdentifier().ifEmpty { null }

        return RegistrationDivisionPayload(
            divisionId = divisionId,
            divisionTypeId = divisionTypeId,
            divisionTypeKey = divisionTypeKey,
        )
    }

    private fun isEventAtCapacity(event: Event): Boolean {
        return if (event.teamSignup) {
            event.maxParticipants <= event.teamIds.size
        } else {
            event.maxParticipants <= event.playerIds.size
        }
    }
}
