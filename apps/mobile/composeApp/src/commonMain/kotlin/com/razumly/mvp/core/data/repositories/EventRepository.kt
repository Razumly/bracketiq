package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
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
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.data.util.divisionsEquivalent
import com.razumly.mvp.core.data.util.isPlaceholderSlot
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.util.calcDistance
import dev.icerock.moko.geo.LatLng
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.CreateEventRequestDto
import com.razumly.mvp.core.network.dto.CurrentUserEventRegistrationsResponseDto
import com.razumly.mvp.core.network.dto.EventApiDto
import com.razumly.mvp.core.network.dto.EventChildRegistrationRequestDto
import com.razumly.mvp.core.network.dto.EventChildRegistrationResponseDto
import com.razumly.mvp.core.network.dto.EventParticipantEntryDto
import com.razumly.mvp.core.network.dto.EventParticipantRegistrationSectionsDto
import com.razumly.mvp.core.network.dto.EventParticipantsSnapshotResponseDto
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
import com.razumly.mvp.core.network.dto.StandingsConfirmRequestDto
import com.razumly.mvp.core.network.dto.StandingsConfirmResponseDto
import com.razumly.mvp.core.network.dto.StandingsDivisionDto
import com.razumly.mvp.core.network.dto.StandingsResponseDto
import com.razumly.mvp.core.network.dto.UpdateEventRequestDto
import com.razumly.mvp.core.network.dto.toUserDataOrNull
import com.razumly.mvp.core.network.dto.toUpdateDto
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlin.time.Clock
import kotlin.time.Instant

interface IEventRepository : IMVPRepository {
    fun getCachedEventsFlow(): Flow<Result<List<Event>>>
    fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>>
    fun resetCursor()
    suspend fun getEvent(eventId: String): Result<Event>
    suspend fun getLeagueScoringConfig(eventId: String): Result<LeagueScoringConfig?> = Result.success(null)
    suspend fun getEventStaffInvites(eventId: String): Result<List<Invite>>
    suspend fun getEventsByIds(eventIds: List<String>): Result<List<Event>>
    suspend fun getEventsByOrganization(organizationId: String, limit: Int = 200): Result<List<Event>>
    suspend fun createEvent(
        newEvent: Event,
        requiredTemplateIds: List<String> = emptyList(),
        leagueScoringConfig: LeagueScoringConfigDTO? = null,
        fields: List<Field>? = null,
        timeSlots: List<TimeSlot>? = null,
    ): Result<Event>
    suspend fun scheduleEvent(eventId: String, participantCount: Int? = null): Result<Event>
    suspend fun updateEvent(
        newEvent: Event,
        fields: List<Field>? = null,
        timeSlots: List<TimeSlot>? = null,
        leagueScoringConfig: LeagueScoringConfigDTO? = null,
    ): Result<Event>
    suspend fun updateLocalEvent(newEvent: Event): Result<Event>
    fun getEventsInBoundsFlow(bounds: Bounds): Flow<Result<List<Event>>>
    suspend fun getEventsInBounds(bounds: Bounds): Result<Pair<List<Event>, Boolean>>
    suspend fun getEventsInBounds(
        bounds: Bounds,
        dateFrom: Instant? = null,
        dateTo: Instant? = null,
        limit: Int = 50,
        offset: Int = 0,
        includeDistanceFilter: Boolean = true,
    ): Result<Pair<List<Event>, Boolean>>
    suspend fun searchEvents(
        searchQuery: String,
        userLocation: LatLng,
        limit: Int = 8,
        offset: Int = 0,
    ): Result<Pair<List<Event>, Boolean>>
    fun getEventsByHostFlow(hostId: String): Flow<Result<List<Event>>>
    fun getEventTemplatesByHostFlow(hostId: String): Flow<Result<List<Event>>> =
        flowOf(Result.success(emptyList()))
    suspend fun deleteEvent(eventId: String): Result<Unit>
    suspend fun addCurrentUserToEvent(
        event: Event,
        preferredDivisionId: String? = null,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<SelfRegistrationResult>
    suspend fun requestCurrentUserRegistration(
        event: Event,
        preferredDivisionId: String? = null,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<SelfRegistrationResult> = addCurrentUserToEvent(
        event = event,
        preferredDivisionId = preferredDivisionId,
        occurrence = occurrence,
    )
    suspend fun registerChildForEvent(
        eventId: String,
        childUserId: String,
        joinWaitlist: Boolean = false,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<ChildRegistrationResult>
    suspend fun addTeamToEvent(
        event: Event,
        team: Team,
        preferredDivisionId: String? = null,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<Unit>
    suspend fun syncEventParticipants(
        event: Event,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<EventParticipantsSyncResult>
    suspend fun getEventParticipantsSummary(
        eventId: String,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<EventParticipantsSummary> = Result.success(EventParticipantsSummary())
    suspend fun getEventParticipantManagementSnapshot(
        eventId: String,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<EventParticipantManagementSnapshot> = Result.success(EventParticipantManagementSnapshot())
    suspend fun getLeagueDivisionStandings(eventId: String, divisionId: String): Result<LeagueDivisionStandings>
    suspend fun confirmLeagueDivisionStandings(
        eventId: String,
        divisionId: String,
        applyReassignment: Boolean = true,
    ): Result<LeagueStandingsConfirmResult>
    suspend fun removeTeamFromEvent(
        event: Event,
        teamWithPlayers: TeamWithPlayers,
        refundMode: EventParticipantRefundMode? = null,
        refundReason: String? = null,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<Unit>
    suspend fun removeCurrentUserFromEvent(
        event: Event,
        targetUserId: String? = null,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<Unit>
    suspend fun getMySchedule(): Result<UserScheduleSnapshot> = Result.success(UserScheduleSnapshot())
    suspend fun syncCurrentUserRegistrationCache(): Result<Unit> = Result.success(Unit)
    fun observeCurrentUserRegistrationsForEvent(eventId: String): Flow<List<EventRegistrationCacheEntry>> =
        flowOf(emptyList())
    suspend fun clearCurrentUserRegistrationCache(): Result<Unit> = Result.success(Unit)
    suspend fun reportEvent(eventId: String, notes: String? = null): Result<Unit> =
        Result.failure(NotImplementedError("Event reporting is not implemented"))
}

enum class EventParticipantRefundMode(val wireValue: String) {
    AUTO("auto"),
    REQUEST("request"),
}

data class SelfRegistrationResult(
    val requiresParentApproval: Boolean = false,
    val joinedWaitlist: Boolean = false,
)

data class EventOccurrenceSelection(
    val slotId: String,
    val occurrenceDate: String,
    val label: String? = null,
)

data class EventParticipantsSyncResult(
    val event: Event,
    val participantCount: Int = 0,
    val participantCapacity: Int? = null,
    val weeklySelectionRequired: Boolean = false,
)

data class EventParticipantsSummary(
    val participantCount: Int = 0,
    val participantCapacity: Int? = null,
    val weeklySelectionRequired: Boolean = false,
)

data class EventParticipantManagementEntry(
    val registrationId: String,
    val registrantId: String,
    val registrantType: String,
    val rosterRole: String? = null,
    val status: String? = null,
    val parentId: String? = null,
    val divisionId: String? = null,
    val divisionTypeId: String? = null,
    val divisionTypeKey: String? = null,
    val consentDocumentId: String? = null,
    val consentStatus: String? = null,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

data class EventParticipantManagementSnapshot(
    val teamRegistrations: List<EventParticipantManagementEntry> = emptyList(),
    val userRegistrations: List<EventParticipantManagementEntry> = emptyList(),
    val childRegistrations: List<EventParticipantManagementEntry> = emptyList(),
    val waitlistRegistrations: List<EventParticipantManagementEntry> = emptyList(),
    val freeAgentRegistrations: List<EventParticipantManagementEntry> = emptyList(),
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

private fun EventParticipantEntryDto.toManagementEntryOrNull(): EventParticipantManagementEntry? {
    val normalizedRegistrationId = registrationId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val normalizedRegistrantId = registrantId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val normalizedRegistrantType = registrantType?.trim()?.takeIf(String::isNotBlank) ?: return null
    return EventParticipantManagementEntry(
        registrationId = normalizedRegistrationId,
        registrantId = normalizedRegistrantId,
        registrantType = normalizedRegistrantType,
        rosterRole = rosterRole?.trim()?.takeIf(String::isNotBlank),
        status = status?.trim()?.takeIf(String::isNotBlank),
        parentId = parentId?.trim()?.takeIf(String::isNotBlank),
        divisionId = divisionId?.trim()?.takeIf(String::isNotBlank),
        divisionTypeId = divisionTypeId?.trim()?.takeIf(String::isNotBlank),
        divisionTypeKey = divisionTypeKey?.trim()?.takeIf(String::isNotBlank),
        consentDocumentId = consentDocumentId?.trim()?.takeIf(String::isNotBlank),
        consentStatus = consentStatus?.trim()?.takeIf(String::isNotBlank),
        slotId = slotId?.trim()?.takeIf(String::isNotBlank),
        occurrenceDate = occurrenceDate?.trim()?.takeIf(String::isNotBlank),
        createdAt = createdAt?.trim()?.takeIf(String::isNotBlank),
        updatedAt = updatedAt?.trim()?.takeIf(String::isNotBlank),
    )
}

private fun EventParticipantRegistrationSectionsDto?.toManagementSnapshot(): EventParticipantManagementSnapshot {
    if (this == null) {
        return EventParticipantManagementSnapshot()
    }
    return EventParticipantManagementSnapshot(
        teamRegistrations = teams.mapNotNull(EventParticipantEntryDto::toManagementEntryOrNull),
        userRegistrations = users.mapNotNull(EventParticipantEntryDto::toManagementEntryOrNull),
        childRegistrations = children.mapNotNull(EventParticipantEntryDto::toManagementEntryOrNull),
        waitlistRegistrations = waitlist.mapNotNull(EventParticipantEntryDto::toManagementEntryOrNull),
        freeAgentRegistrations = freeAgents.mapNotNull(EventParticipantEntryDto::toManagementEntryOrNull),
    )
}

private fun StandingsDivisionDto.toLeagueDivisionStandings(): LeagueDivisionStandings {
    val confirmedAt = standingsConfirmedAt
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?.let { value -> runCatching { Instant.parse(value) }.getOrNull() }
    val validationMessages = validation.mappingErrors + validation.capacityErrors

    return LeagueDivisionStandings(
        divisionId = divisionId,
        divisionName = divisionName,
        standingsConfirmedAt = confirmedAt,
        standingsConfirmedBy = standingsConfirmedBy?.trim()?.takeIf(String::isNotBlank),
        rows = standings.map { row ->
            LeagueStandingsRow(
                position = row.position,
                teamId = row.teamId,
                teamName = row.teamName,
                wins = row.wins,
                losses = row.losses,
                draws = row.draws,
                goalsFor = row.goalsFor,
                goalsAgainst = row.goalsAgainst,
                goalDifference = row.goalDifference,
                matchesPlayed = row.matchesPlayed,
                basePoints = row.basePoints,
                finalPoints = row.finalPoints,
                pointsDelta = row.pointsDelta,
            )
        },
        validationMessages = validationMessages,
    )
}

class EventRepository(
    private val databaseService: DatabaseService,
    private val api: MvpApiClient,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
    private val currentUserDataSource: CurrentUserDataSource? = null,
) : IEventRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val eventPageSize = 50

    init {
        scope.launch {
            databaseService.getEventDao.deleteAllEvents()
        }
        scope.launch {
            var hasObservedUser = false
            var lastUserId: String? = null
            userRepository.currentUser.collect { currentUserResult ->
                val currentUserId = currentUserResult.getOrNull()
                    ?.id
                    ?.trim()
                    ?.takeIf(String::isNotBlank)
                if (!hasObservedUser) {
                    lastUserId = currentUserId
                    hasObservedUser = true
                    return@collect
                }
                if (currentUserId != lastUserId) {
                    clearEventCacheForSessionChange()
                    lastUserId = currentUserId
                }
            }
        }
    }

    private fun filterHiddenEvents(events: List<Event>, currentUser: UserData?): List<Event> {
        val hiddenEventIds = currentUser?.hiddenEventIds
            ?.map { hiddenId -> hiddenId.trim() }
            ?.filter(String::isNotBlank)
            ?.toSet()
            ?: emptySet()
        if (hiddenEventIds.isEmpty()) {
            return events
        }
        return events.filterNot { event -> hiddenEventIds.contains(event.id) }
    }

    override fun resetCursor() {
        // Paging is currently handled by the UI by re-issuing search calls; keep this as a no-op for now.
    }

    override fun getCachedEventsFlow(): Flow<Result<List<Event>>> =
        combine(
            databaseService.getEventDao.getAllCachedEvents(),
            userRepository.currentUser,
        ) { cached, currentUserResult ->
            Result.success(filterHiddenEvents(cached, currentUserResult.getOrNull()))
        }

    override fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>> =
        callbackFlow {
            val localJob = launch {
                databaseService.getEventDao.getEventWithRelationsFlow(eventId)
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

    private suspend fun fetchRemoteEventDto(eventId: String): EventApiDto {
        return api.get<EventApiDto>("api/events/$eventId")
    }

    private suspend fun fetchRemoteLeagueScoringConfig(scoringConfigId: String): LeagueScoringConfig {
        return api.get<LeagueScoringConfig>("api/league-scoring-configs/$scoringConfigId")
    }

    private suspend fun fetchRemoteEvent(eventId: String): Event {
        val dto = fetchRemoteEventDto(eventId)
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

    private suspend fun fetchRemoteEventsByIds(eventIds: List<String>): List<Event> {
        val ids = eventIds.map(String::trim).filter(String::isNotBlank).distinct()
        if (ids.isEmpty()) return emptyList()

        val encodedIds = ids.joinToString(",").encodeURLQueryComponent()
        val res = api.get<EventsResponseDto>("api/events?ids=$encodedIds&limit=${ids.size.coerceAtLeast(1)}")
        return res.events.mapNotNull { it.toEventOrNull() }
    }

    private suspend fun fetchCurrentUserRegistrations(updatedAfter: Instant?): List<EventRegistrationCacheEntry> {
        val path = buildString {
            append("api/profile/registrations")
            updatedAfter?.let { timestamp ->
                append("?updatedAfter=")
                append(timestamp.toString().encodeURLQueryComponent())
            }
        }
        val response = api.get<CurrentUserEventRegistrationsResponseDto>(path)
        return response.registrations.mapNotNull { dto ->
            val id = dto.id?.trim()?.takeIf(String::isNotBlank) ?: return@mapNotNull null
            val eventId = dto.eventId?.trim()?.takeIf(String::isNotBlank) ?: return@mapNotNull null
            val registrantId = dto.registrantId?.trim()?.takeIf(String::isNotBlank) ?: return@mapNotNull null
            val registrantType = dto.registrantType?.trim()?.takeIf(String::isNotBlank) ?: return@mapNotNull null
            EventRegistrationCacheEntry(
                id = id,
                eventId = eventId,
                registrantId = registrantId,
                parentId = dto.parentId?.trim()?.takeIf(String::isNotBlank),
                registrantType = registrantType,
                rosterRole = dto.rosterRole?.trim()?.takeIf(String::isNotBlank),
                status = dto.status?.trim()?.takeIf(String::isNotBlank),
                eventTeamId = dto.eventTeamId?.trim()?.takeIf(String::isNotBlank),
                sourceTeamRegistrationId = dto.sourceTeamRegistrationId?.trim()?.takeIf(String::isNotBlank),
                divisionId = dto.divisionId?.trim()?.takeIf(String::isNotBlank),
                divisionTypeId = dto.divisionTypeId?.trim()?.takeIf(String::isNotBlank),
                divisionTypeKey = dto.divisionTypeKey?.trim()?.takeIf(String::isNotBlank),
                jerseyNumber = dto.jerseyNumber?.trim()?.takeIf(String::isNotBlank),
                position = dto.position?.trim()?.takeIf(String::isNotBlank),
                isCaptain = dto.isCaptain,
                slotId = dto.slotId?.trim()?.takeIf(String::isNotBlank),
                occurrenceDate = dto.occurrenceDate?.trim()?.takeIf(String::isNotBlank),
                createdAt = dto.createdAt?.trim()?.takeIf(String::isNotBlank),
                updatedAt = dto.updatedAt?.trim()?.takeIf(String::isNotBlank),
            )
        }
    }

    private suspend fun insertEventCrossReferences(
        eventId: String,
        players: List<UserData>,
        teams: List<Team>,
    ) {
        databaseService.getEventDao.deleteEventCrossRefs(eventId)

        databaseService.getEventDao.upsertEventTeamCrossRefs(
            teams.map { EventTeamCrossRef(it.id, eventId) })
        databaseService.getUserDataDao.upsertUserEventCrossRefs(
            (players).map { EventUserCrossRef(it.id, eventId) })
        val validUserIds = players.map { it.id.trim() }
            .filter(String::isNotBlank)
            .toSet()
        databaseService.getTeamDao.upsertTeamPlayerCrossRefs(
            teams.flatMap { team ->
                team.playerIds.mapNotNull { playerId ->
                    val normalizedPlayerId = playerId.trim()
                    if (validUserIds.contains(normalizedPlayerId)) {
                        TeamPlayerCrossRef(team.id, normalizedPlayerId)
                    } else {
                        null
                    }
                }
            })
    }

    private fun appendOccurrenceQuery(
        basePath: String,
        occurrence: EventOccurrenceSelection?,
        extraQueryParams: Map<String, String> = emptyMap(),
    ): String {
        val normalizedSlotId = occurrence?.slotId?.trim()?.takeIf(String::isNotBlank)
        val normalizedOccurrenceDate = occurrence?.occurrenceDate?.trim()?.takeIf(String::isNotBlank)
        val queryParams = linkedMapOf<String, String>()
        if (normalizedSlotId != null && normalizedOccurrenceDate != null) {
            queryParams["slotId"] = normalizedSlotId
            queryParams["occurrenceDate"] = normalizedOccurrenceDate
        }
        extraQueryParams.forEach { (key, value) ->
            val normalizedKey = key.trim()
            val normalizedValue = value.trim()
            if (normalizedKey.isNotBlank() && normalizedValue.isNotBlank()) {
                queryParams[normalizedKey] = normalizedValue
            }
        }
        if (queryParams.isEmpty()) {
            return basePath
        }
        return buildString {
            append(basePath)
            append("?")
            append(
                queryParams.entries.joinToString("&") { (key, value) ->
                    "${key.encodeURLQueryComponent()}=${value.encodeURLQueryComponent()}"
                },
            )
        }
    }

    private fun normalizedParticipantIds(
        ids: List<String>,
    ): List<String> = ids
        .map(String::trim)
        .filter(String::isNotBlank)
        .distinct()

    private suspend fun fetchEventParticipantsSnapshot(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
        manage: Boolean = false,
    ): EventParticipantsSnapshotResponseDto {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        return api.get(
            appendOccurrenceQuery(
                basePath = "api/events/$normalizedEventId/participants",
                occurrence = occurrence,
                extraQueryParams = if (manage) {
                    mapOf("manage" to "true")
                } else {
                    emptyMap()
                },
            ),
        )
    }

    private suspend fun mergeEventParticipantsSnapshot(
        baseEvent: Event,
        snapshot: EventParticipantsSnapshotResponseDto,
    ): EventParticipantsSyncResult {
        snapshot.error?.takeIf(String::isNotBlank)?.let { error(it) }

        if (snapshot.weeklySelectionRequired == true) {
            val clearedEvent = baseEvent.copy(
                teamIds = emptyList(),
                userIds = emptyList(),
                waitListIds = emptyList(),
                freeAgentIds = emptyList(),
            )
            databaseService.getEventDao.upsertEvent(clearedEvent)
            persistEventRelations(
                event = clearedEvent,
                allowWeeklyParticipantRoster = true,
            )
            return EventParticipantsSyncResult(
                event = clearedEvent,
                participantCount = 0,
                participantCapacity = snapshot.participantCapacity,
                weeklySelectionRequired = true,
            )
        }

        val participantIds = snapshot.participants
        val mergedEvent = (snapshot.event?.toEventOrNull() ?: baseEvent).copy(
            teamIds = normalizedParticipantIds(participantIds.teamIds),
            userIds = normalizedParticipantIds(participantIds.userIds),
            waitListIds = normalizedParticipantIds(participantIds.waitListIds),
            freeAgentIds = normalizedParticipantIds(participantIds.freeAgentIds),
        )
        val teams = snapshot.teams.mapNotNull { dto -> dto.toTeamOrNull() }
        val users = snapshot.users.mapNotNull { dto -> dto.toUserDataOrNull() }

        if (teams.isNotEmpty()) {
            databaseService.getTeamDao.upsertTeamsWithRelations(teams)
        }
        if (users.isNotEmpty()) {
            databaseService.getUserDataDao.upsertUsersWithRelations(users)
        }

        databaseService.getEventDao.upsertEvent(mergedEvent)
        persistEventRelations(
            event = mergedEvent,
            allowWeeklyParticipantRoster = true,
        )

        return EventParticipantsSyncResult(
            event = mergedEvent,
            participantCount = snapshot.participantCount ?: 0,
            participantCapacity = snapshot.participantCapacity,
            weeklySelectionRequired = snapshot.weeklySelectionRequired == true,
        )
    }

    override suspend fun getEvent(eventId: String): Result<Event> =
        runCatching {
            val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
                ?: error("Event id is required.")
            val event = try {
                fetchRemoteEvent(normalizedEventId)
            } catch (throwable: Throwable) {
                if (shouldEvictEventFromCache(throwable)) {
                    databaseService.getEventDao.deleteEventWithCrossRefs(normalizedEventId)
                }
                throw throwable
            }
            databaseService.getEventDao.upsertEvent(event)
            persistEventRelations(event)
            databaseService.getEventDao.getEventById(normalizedEventId)
                ?: throw IllegalStateException("Event $normalizedEventId not cached")
        }

    override suspend fun syncEventParticipants(
        event: Event,
        occurrence: EventOccurrenceSelection?,
    ): Result<EventParticipantsSyncResult> = runCatching {
        val snapshot = fetchEventParticipantsSnapshot(event.id, occurrence)
        mergeEventParticipantsSnapshot(
            baseEvent = event,
            snapshot = snapshot,
        )
    }

    override suspend fun getEventParticipantsSummary(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Result<EventParticipantsSummary> = runCatching {
        val snapshot = fetchEventParticipantsSnapshot(eventId, occurrence, manage = false)
        snapshot.error?.takeIf(String::isNotBlank)?.let { error(it) }
        EventParticipantsSummary(
            participantCount = snapshot.participantCount ?: 0,
            participantCapacity = snapshot.participantCapacity,
            weeklySelectionRequired = snapshot.weeklySelectionRequired == true,
        )
    }

    override suspend fun getEventParticipantManagementSnapshot(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Result<EventParticipantManagementSnapshot> = runCatching {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        val snapshot = fetchEventParticipantsSnapshot(
            eventId = normalizedEventId,
            occurrence = occurrence,
            manage = true,
        )
        val baseEvent = databaseService.getEventDao.getEventById(normalizedEventId)
            ?: snapshot.event?.toEventOrNull()
            ?: fetchRemoteEvent(normalizedEventId)
        mergeEventParticipantsSnapshot(
            baseEvent = baseEvent,
            snapshot = snapshot,
        )
        snapshot.registrations.toManagementSnapshot()
    }

    override suspend fun syncCurrentUserRegistrationCache(): Result<Unit> = runCatching {
        val dataSource = currentUserDataSource ?: return@runCatching
        val currentUserId = dataSource.getUserIdNow().trim()
        if (currentUserId.isBlank()) {
            dataSource.clearRegistrationSyncState()
            databaseService.getEventRegistrationDao.clearAll()
            return@runCatching
        }

        val storedUserId = dataSource.getRegistrationSyncUserId()
        val updatedAfter = if (storedUserId == currentUserId) {
            dataSource.getRegistrationSyncStartedAt()
        } else {
            databaseService.getEventRegistrationDao.clearAll()
            null
        }
        val syncStartedAt = Clock.System.now()
        dataSource.saveRegistrationSyncState(
            userId = currentUserId,
            startedAt = syncStartedAt,
        )

        val registrations = fetchCurrentUserRegistrations(updatedAfter = updatedAfter)
        if (registrations.isNotEmpty()) {
            databaseService.getEventRegistrationDao.upsertRegistrations(registrations)
        }
    }

    override fun observeCurrentUserRegistrationsForEvent(eventId: String): Flow<List<EventRegistrationCacheEntry>> {
        val normalizedEventId = eventId.trim()
        if (normalizedEventId.isBlank()) {
            return flowOf(emptyList())
        }
        return databaseService.getEventRegistrationDao.observeRegistrationsForEvent(normalizedEventId)
    }

    override suspend fun clearCurrentUserRegistrationCache(): Result<Unit> = runCatching {
        currentUserDataSource?.clearRegistrationSyncState()
        databaseService.getEventRegistrationDao.clearAll()
    }

    private suspend fun syncEventParticipantsAfterMutation(
        event: Event,
        occurrence: EventOccurrenceSelection?,
    ) {
        syncCurrentUserRegistrationCache().getOrNull()
        syncEventParticipants(event, occurrence)
            .onFailure {
                databaseService.getEventDao.upsertEvent(event)
                persistEventRelations(event)
            }
    }

    override suspend fun getLeagueScoringConfig(eventId: String): Result<LeagueScoringConfig?> = runCatching {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank) ?: return@runCatching null
        val dto = fetchRemoteEventDto(normalizedEventId)
        val scoringConfigId = dto.leagueScoringConfigId
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: databaseService.getEventDao.getEventById(normalizedEventId)
                ?.leagueScoringConfigId
                ?.trim()
                ?.takeIf(String::isNotBlank)
            ?: return@runCatching null
        val embeddedConfig = dto.leagueScoringConfig
        if (embeddedConfig != null) {
            embeddedConfig.toLeagueScoringConfig(scoringConfigId)
        } else {
            fetchRemoteLeagueScoringConfig(scoringConfigId)
        }
    }

    override suspend fun getEventStaffInvites(eventId: String): Result<List<Invite>> = runCatching {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank) ?: return@runCatching emptyList()
        fetchRemoteEventDto(normalizedEventId).staffInvites.orEmpty()
    }

    override suspend fun getEventsByIds(eventIds: List<String>): Result<List<Event>> = runCatching {
        val ids = eventIds.map(String::trim).filter(String::isNotBlank).distinct()
        if (ids.isEmpty()) return@runCatching emptyList()

        val events = fetchRemoteEventsByIds(ids)
        if (events.isNotEmpty()) {
            databaseService.getEventDao.upsertEvents(events)
        }
        val staleIds = ids.toSet() - events.map { event -> event.id }.toSet()
        if (staleIds.isNotEmpty()) {
            databaseService.getEventDao.deleteEventsWithCrossRefs(staleIds.toList())
        }

        val cachedById = databaseService.getEventDao.getEventsByIds(ids).associateBy { it.id }
        ids.mapNotNull { cachedById[it] }
    }

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
                    ),
                    newFields = fields,
                    timeSlots = timeSlots,
                    leagueScoringConfig = leagueScoringConfig,
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

    override suspend fun updateEvent(
        newEvent: Event,
        fields: List<Field>?,
        timeSlots: List<TimeSlot>?,
        leagueScoringConfig: LeagueScoringConfigDTO?,
    ): Result<Event> =
        singleResponse(networkCall = {
            val updated = api.patch<UpdateEventRequestDto, EventApiDto>(
                path = "api/events/${newEvent.id}",
                body = UpdateEventRequestDto(
                    event = newEvent.toUpdateDto(
                        leagueScoringConfigOverride = leagueScoringConfig,
                        fieldsOverride = fields,
                        timeSlotsOverride = timeSlots,
                        includeOrganizationId = false,
                        includeFieldObjects = fields != null,
                        includeTimeSlotObjects = timeSlots != null,
                    ),
                ),
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
        return combine(
            databaseService.getEventDao.getAllCachedEvents(),
            userRepository.currentUser,
        ) { cached, currentUserResult ->
            val visibleEvents = filterHiddenEvents(cached, currentUserResult.getOrNull())
            val inBounds = visibleEvents.filter { event ->
                calcDistance(bounds.center, LatLng(event.lat, event.long)) <= bounds.radiusMiles
            }
            Result.success(inBounds.sortedBy { calcDistance(bounds.center, LatLng(it.lat, it.long)) })
        }
    }

    override suspend fun getEventsInBounds(bounds: Bounds): Result<Pair<List<Event>, Boolean>> {
        return getEventsInBounds(
            bounds = bounds,
            dateFrom = null,
            dateTo = null,
            limit = eventPageSize,
            offset = 0,
            includeDistanceFilter = true,
        )
    }

    override suspend fun getEventsInBounds(
        bounds: Bounds,
        dateFrom: Instant?,
        dateTo: Instant?,
        limit: Int,
        offset: Int,
        includeDistanceFilter: Boolean,
    ): Result<Pair<List<Event>, Boolean>> {
        return runCatching {
            val normalizedLimit = limit.coerceIn(1, 500)
            val normalizedOffset = offset.coerceAtLeast(0)
            val filters = EventSearchFiltersDto(
                maxDistance = bounds.radiusMiles.takeIf { includeDistanceFilter },
                userLocation = if (includeDistanceFilter) {
                    EventSearchUserLocationDto(
                        lat = bounds.center.latitude,
                        long = bounds.center.longitude,
                    )
                } else {
                    null
                },
                dateFrom = dateFrom?.toString(),
                dateTo = dateTo?.toString(),
            )
            val res = api.post<EventSearchRequestDto, EventsResponseDto>(
                path = "api/events/search",
                body = EventSearchRequestDto(
                    filters = filters,
                    limit = normalizedLimit,
                    offset = normalizedOffset,
                ),
            )

            val events = filterHiddenEvents(
                res.events.mapNotNull { it.toEventOrNull() },
                userRepository.currentUser.value.getOrNull(),
            )
            databaseService.getEventDao.upsertEvents(events)
            val orderedEvents = if (includeDistanceFilter) {
                events.sortedBy { calcDistance(bounds.center, LatLng(it.lat, it.long)) }
            } else {
                events
            }

            Pair(
                orderedEvents,
                events.size == normalizedLimit,
            )
        }
    }

    override suspend fun searchEvents(
        searchQuery: String,
        userLocation: LatLng,
        limit: Int,
        offset: Int,
    ): Result<Pair<List<Event>, Boolean>> {
        return runCatching {
            val normalizedLimit = limit.coerceIn(1, 500)
            val normalizedOffset = offset.coerceAtLeast(0)
            val res = api.post<EventSearchRequestDto, EventsResponseDto>(
                path = "api/events/search",
                body = EventSearchRequestDto(
                    filters = EventSearchFiltersDto(query = searchQuery),
                    limit = normalizedLimit,
                    offset = normalizedOffset,
                ),
            )

            val events = filterHiddenEvents(
                res.events.mapNotNull { it.toEventOrNull() },
                userRepository.currentUser.value.getOrNull(),
            )
            databaseService.getEventDao.upsertEvents(events)

            Pair(
                events.sortedBy { calcDistance(userLocation, LatLng(it.lat, it.long)) },
                events.size == normalizedLimit,
            )
        }
    }

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
                        databaseService.getEventDao.deleteEventsWithCrossRefs(staleIds.toList())
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
                        databaseService.getEventDao.deleteEventsWithCrossRefs(staleIds.toList())
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
        occurrence: EventOccurrenceSelection?,
    ): Result<SelfRegistrationResult> =
        runCatching {
            val currentUser = userRepository.currentUser.value.getOrThrow()
            val eventAtCapacity = isEventAtCapacity(
                event = event,
                preferredDivisionId = preferredDivisionId,
                occurrence = occurrence,
            )
            val divisionPayload = resolveRegistrationDivisionPayload(
                event = event,
                preferredDivisionId = preferredDivisionId,
            )
            val request = EventParticipantsRequestDto(
                userId = currentUser.id,
                divisionId = divisionPayload.divisionId,
                divisionTypeId = divisionPayload.divisionTypeId,
                divisionTypeKey = divisionPayload.divisionTypeKey,
                slotId = occurrence?.slotId,
                occurrenceDate = occurrence?.occurrenceDate,
            )
            val response = when {
                eventAtCapacity -> {
                    api.post<EventParticipantsRequestDto, EventParticipantsResponseDto>(
                        path = "api/events/${event.id}/waitlist",
                        body = request,
                    )
                }

                event.teamSignup -> {
                    api.post<EventParticipantsRequestDto, EventParticipantsResponseDto>(
                        path = "api/events/${event.id}/free-agents",
                        body = EventParticipantsRequestDto(
                            userId = currentUser.id,
                            slotId = occurrence?.slotId,
                            occurrenceDate = occurrence?.occurrenceDate,
                        ),
                    )
                }

                else -> {
                    api.post<EventParticipantsRequestDto, EventParticipantsResponseDto>(
                        path = "api/events/${event.id}/participants",
                        body = request,
                    )
                }
            }

            response.error?.takeIf(String::isNotBlank)?.let { errorMessage ->
                error(errorMessage)
            }

            val updatedEvent = response.event?.toEventOrNull() ?: event
            syncEventParticipantsAfterMutation(updatedEvent, occurrence)

            SelfRegistrationResult(
                requiresParentApproval = response.requiresParentApproval == true,
                joinedWaitlist = eventAtCapacity && response.requiresParentApproval != true,
            )
        }

    override suspend fun requestCurrentUserRegistration(
        event: Event,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<SelfRegistrationResult> =
        runCatching {
            val currentUser = userRepository.currentUser.value.getOrThrow()
            val divisionPayload = resolveRegistrationDivisionPayload(
                event = event,
                preferredDivisionId = preferredDivisionId,
            )
            val response = api.post<EventParticipantsRequestDto, EventChildRegistrationResponseDto>(
                path = "api/events/${event.id}/registrations/self",
                body = EventParticipantsRequestDto(
                    userId = currentUser.id,
                    divisionId = divisionPayload.divisionId,
                    divisionTypeId = divisionPayload.divisionTypeId,
                    divisionTypeKey = divisionPayload.divisionTypeKey,
                    slotId = occurrence?.slotId,
                    occurrenceDate = occurrence?.occurrenceDate,
                ),
            )
            response.error?.takeIf(String::isNotBlank)?.let { error(it) }
            val registrationStatus = response.registration?.status
                ?.trim()
                ?.uppercase()
            SelfRegistrationResult(
                requiresParentApproval = response.requiresParentApproval == true,
                joinedWaitlist = registrationStatus == "WAITLISTED",
            )
        }

    override suspend fun registerChildForEvent(
        eventId: String,
        childUserId: String,
        joinWaitlist: Boolean,
        occurrence: EventOccurrenceSelection?,
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
                    body = EventParticipantsRequestDto(
                        userId = normalizedChildUserId,
                        slotId = occurrence?.slotId,
                        occurrenceDate = occurrence?.occurrenceDate,
                    ),
                )
                waitlistResponse.error?.takeIf(String::isNotBlank)?.let { error(it) }
                val baseEvent = waitlistResponse.event?.toEventOrNull()
                    ?: databaseService.getEventDao.getEventById(normalizedEventId)
                    ?: error("Updated event not found after waitlist response.")
                syncEventParticipantsAfterMutation(baseEvent, occurrence)

                return@runCatching ChildRegistrationResult(
                    registrationStatus = if (waitlistResponse.requiresParentApproval == true) {
                        null
                    } else {
                        "WAITLISTED"
                    },
                    requiresParentApproval = waitlistResponse.requiresParentApproval == true,
                    joinedWaitlist = waitlistResponse.requiresParentApproval != true,
                )
            }

            val response = api.post<EventChildRegistrationRequestDto, EventChildRegistrationResponseDto>(
                path = "api/events/$normalizedEventId/registrations/child",
                body = EventChildRegistrationRequestDto(
                    childId = normalizedChildUserId,
                    slotId = occurrence?.slotId,
                    occurrenceDate = occurrence?.occurrenceDate,
                ),
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

    override suspend fun addTeamToEvent(
        event: Event,
        team: Team,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<Unit> =
        runCatching {
            if (event.waitList.contains(team.id)) {
                throw Exception("Team already in waitlist")
            }
            val divisionPreference = preferredDivisionId?.trim()?.takeIf(String::isNotBlank) ?: team.division
            val divisionPayload = resolveRegistrationDivisionPayload(
                event = event,
                preferredDivisionId = divisionPreference,
            )
            val request = EventParticipantsRequestDto(
                teamId = team.id,
                divisionId = divisionPayload.divisionId,
                divisionTypeId = divisionPayload.divisionTypeId,
                divisionTypeKey = divisionPayload.divisionTypeKey,
                slotId = occurrence?.slotId,
                occurrenceDate = occurrence?.occurrenceDate,
            )
            val updated = if (
                isEventAtCapacity(
                    event = event,
                    preferredDivisionId = divisionPreference,
                    occurrence = occurrence,
                )
            ) {
                api.post<EventParticipantsRequestDto, EventResponseDto>(
                    path = "api/events/${event.id}/waitlist",
                    body = request,
                )
            } else {
                api.post<EventParticipantsRequestDto, EventResponseDto>(
                    path = "api/events/${event.id}/participants",
                    body = request,
                )
            }.event?.toEventOrNull() ?: event

            syncEventParticipantsAfterMutation(updated, occurrence)
        }

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
        runCatching {
            val updated = api.delete<EventParticipantsRequestDto, EventResponseDto>(
                path = "api/events/${event.id}/participants",
                body = EventParticipantsRequestDto(
                    teamId = teamWithPlayers.team.id,
                    slotId = occurrence?.slotId,
                    occurrenceDate = occurrence?.occurrenceDate,
                    refundMode = refundMode?.wireValue,
                    refundReason = refundReason
                        ?.trim()
                        ?.takeIf(String::isNotBlank),
                ),
            ).event?.toEventOrNull() ?: event

            syncEventParticipantsAfterMutation(updated, occurrence)
        }

    override suspend fun removeCurrentUserFromEvent(
        event: Event,
        targetUserId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<Unit> {
        val currentUser = userRepository.currentUser.value.getOrThrow()
        val resolvedUserId = targetUserId?.trim()?.takeIf(String::isNotBlank) ?: currentUser.id
        return runCatching {
            val updated = api.delete<EventParticipantsRequestDto, EventResponseDto>(
                path = "api/events/${event.id}/participants",
                body = EventParticipantsRequestDto(
                    userId = resolvedUserId,
                    slotId = occurrence?.slotId,
                    occurrenceDate = occurrence?.occurrenceDate,
                ),
            ).event?.toEventOrNull() ?: event

            syncEventParticipantsAfterMutation(updated, occurrence)
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

    private suspend fun persistEventRelations(
        event: Event,
        allowWeeklyParticipantRoster: Boolean = false,
    ) {
        if (event.eventType == EventType.WEEKLY_EVENT && !allowWeeklyParticipantRoster) {
            return
        }
        val teams = if (event.teamIds.isNotEmpty()) {
            teamRepository.getTeams(event.teamIds).getOrThrow()
        } else {
            emptyList()
        }

        // Keep event-user cross refs aligned with all user ids referenced by event state.
        val teamPlayerIds = teams.flatMap { team -> team.playerIds }
        val relatedUserIds = (
            event.playerIds +
                event.freeAgentIds +
                event.waitListIds +
                event.assistantHostIds +
                event.officialIds +
                event.hostId +
                teamPlayerIds
            )
            .distinct()
            .filter(String::isNotBlank)
        val users = if (relatedUserIds.isNotEmpty()) {
            userRepository.getUsers(
                userIds = relatedUserIds,
                visibilityContext = UserVisibilityContext(eventId = event.id),
            ).getOrThrow()
        } else {
            emptyList()
        }
        val relatedUsers = if (relatedUserIds.isNotEmpty()) {
            val relatedUserIdSet = relatedUserIds.toSet()
            users.filter { it.id in relatedUserIdSet }
        } else {
            emptyList()
        }
        insertEventCrossReferences(event.id, relatedUsers, teams)
    }

    private suspend fun clearEventCacheForSessionChange() {
        databaseService.getEventDao.clearAllEventsWithCrossRefs()
    }

    private fun shouldEvictEventFromCache(throwable: Throwable): Boolean {
        val apiException = throwable as? ApiException ?: return false
        return apiException.statusCode == 403 || apiException.statusCode == 404
    }

    private fun resolveSelectedDivisionDetail(
        event: Event,
        preferredDivisionId: String?,
    ): DivisionDetail? {
        if (event.divisions.isEmpty()) {
            return null
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
            return null
        }

        return if (!normalizedPreferredDivision.isNullOrBlank()) {
            divisionDetails.firstOrNull { detail ->
                divisionsEquivalent(detail.id, normalizedPreferredDivision) ||
                    divisionsEquivalent(detail.key, normalizedPreferredDivision)
            } ?: divisionDetails.firstOrNull()
        } else {
            divisionDetails.firstOrNull()
        }
    }

    private fun resolveRegistrationDivisionPayload(
        event: Event,
        preferredDivisionId: String?,
    ): RegistrationDivisionPayload {
        val selectedDivision = resolveSelectedDivisionDetail(event, preferredDivisionId)
            ?: return RegistrationDivisionPayload()

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

    private suspend fun isEventAtCapacity(
        event: Event,
        preferredDivisionId: String? = null,
        occurrence: EventOccurrenceSelection? = null,
    ): Boolean {
        val participantSnapshot = runCatching {
            fetchEventParticipantsSnapshot(event.id, occurrence)
        }.getOrNull()

        if (participantSnapshot?.weeklySelectionRequired == true) {
            return false
        }

        val maxParticipants = participantSnapshot?.participantCapacity ?: if (event.singleDivision) {
            event.maxParticipants
        } else {
            resolveSelectedDivisionDetail(event, preferredDivisionId)?.maxParticipants ?: event.maxParticipants
        }

        if (maxParticipants <= 0) {
            return false
        }

        val participantCount = participantSnapshot?.participantCount ?: if (event.teamSignup) {
            val teamIds = event.teamIds
                .map(String::trim)
                .filter(String::isNotBlank)
            if (teamIds.isEmpty()) {
                0
            } else {
                val teams = teamRepository.getTeamsWithPlayers(teamIds).getOrElse { emptyList() }
                val selectedDivision = if (event.singleDivision) null else resolveSelectedDivisionDetail(event, preferredDivisionId)
                val divisionId = selectedDivision?.id?.normalizeDivisionIdentifier()?.takeIf(String::isNotBlank)
                val divisionKey = selectedDivision?.key?.normalizeDivisionIdentifier()?.takeIf(String::isNotBlank)
                val shouldFilterDivision = !event.singleDivision && (divisionId != null || divisionKey != null)
                teams.count { teamWithPlayers ->
                    val team = teamWithPlayers.team
                    !team.isPlaceholderSlot(event.eventType) && (
                        !shouldFilterDivision ||
                            (divisionId != null && divisionsEquivalent(team.division, divisionId)) ||
                            (divisionKey != null && divisionsEquivalent(team.division, divisionKey))
                    )
                }
            }
        } else {
            event.playerIds.size
        }
        return participantCount >= maxParticipants
    }
}

@Serializable
private data class EventModerationReportRequestDto(
    val targetType: String,
    val targetId: String,
    val category: String,
    val notes: String? = null,
)

@Serializable
private data class EventModerationReportResponseDto(
    val hiddenEventIds: List<String> = emptyList(),
)
