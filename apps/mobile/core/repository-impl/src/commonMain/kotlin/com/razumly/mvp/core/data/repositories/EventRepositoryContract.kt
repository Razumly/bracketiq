package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import dev.icerock.moko.geo.LatLng
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlin.time.Instant

interface IEventRepository : IMVPRepository {
    fun getCachedEventsFlow(): Flow<Result<List<Event>>>
    fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>>
    fun getCachedEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>> =
        getEventWithRelationsFlow(eventId)
    fun resetCursor()
    suspend fun getEvent(eventId: String): Result<Event>
    suspend fun getLeagueScoringConfig(eventId: String): Result<LeagueScoringConfig?> = Result.success(null)
    suspend fun getEventStaffInvites(eventId: String): Result<List<Invite>>
    suspend fun getEventStaffState(event: Event): Result<EventStaffState> =
        Result.failure(UnsupportedOperationException("Atomic event staff loading is not supported."))
    suspend fun reconcileEventStaff(
        event: Event,
        pendingInvites: List<EventStaffInviteInput>,
        expectedRevision: String,
    ): Result<EventStaffState> =
        Result.failure(UnsupportedOperationException("Atomic event staff reconciliation is not supported."))
    suspend fun getEventsByIds(eventIds: List<String>): Result<List<Event>>
    suspend fun getEventsByOrganization(organizationId: String, limit: Int = 200): Result<List<Event>>
    suspend fun getOrganizationEventsPage(
        organizationId: String,
        limit: Int = 50,
        offset: Int = 0,
    ): Result<OrganizationEventPage> {
        return getEventsByOrganization(organizationId, limit).map { events ->
            OrganizationEventPage(
                events = events,
                nextOffset = offset.coerceAtLeast(0) + events.size,
                hasMore = false,
            )
        }
    }
    suspend fun getRegistrationQuestions(scopeType: String, scopeId: String): Result<List<TeamJoinQuestion>> =
        Result.success(emptyList())
    suspend fun createEvent(
        newEvent: Event,
        requiredTemplateIds: List<String> = emptyList(),
        leagueScoringConfig: LeagueScoringConfigDTO? = null,
        fields: List<Field>? = null,
        timeSlots: List<TimeSlot>? = null,
    ): Result<Event>
    suspend fun scheduleEvent(
        eventId: String,
        participantCount: Int? = null,
        includePlaceholderTeams: Boolean? = null,
    ): Result<Event>
    suspend fun updateEvent(
        newEvent: Event,
        fields: List<Field>? = null,
        timeSlots: List<TimeSlot>? = null,
        leagueScoringConfig: LeagueScoringConfigDTO? = null,
    ): Result<Event>
    suspend fun updateEventPreservingStaff(
        newEvent: Event,
        fields: List<Field>? = null,
        timeSlots: List<TimeSlot>? = null,
        leagueScoringConfig: LeagueScoringConfigDTO? = null,
        expectedStaffRevision: String,
    ): Result<Event> = updateEvent(
        newEvent = newEvent,
        fields = fields,
        timeSlots = timeSlots,
        leagueScoringConfig = leagueScoringConfig,
    )
    suspend fun updateLocalEvent(newEvent: Event): Result<Event>
    fun getEventsInBoundsFlow(bounds: Bounds): Flow<Result<List<Event>>>
    suspend fun getEventsInBounds(bounds: Bounds): Result<Pair<List<Event>, Boolean>>
    suspend fun getEventsInBounds(
        bounds: Bounds,
        dateFrom: Instant? = null,
        dateTo: Instant? = null,
        sports: List<String> = emptyList(),
        tags: List<String> = emptyList(),
        limit: Int = 50,
        offset: Int = 0,
        includeDistanceFilter: Boolean = true,
    ): Result<Pair<List<Event>, Boolean>>
    suspend fun searchEvents(
        searchQuery: String,
        userLocation: LatLng?,
        limit: Int = 8,
        offset: Int = 0,
    ): Result<Pair<List<Event>, Boolean>>
    suspend fun getEventTags(
        query: String? = null,
        filterOnly: Boolean = false,
    ): Result<List<EventTag>> = Result.success(emptyList())
    fun getEventsByHostFlow(hostId: String): Flow<Result<List<Event>>>
    suspend fun getHostEventsPage(
        hostId: String,
        limit: Int = 50,
        offset: Int = 0,
    ): Result<HostEventPage> {
        val safeLimit = limit.coerceAtLeast(1)
        val safeOffset = offset.coerceAtLeast(0)
        return getEventsByHostFlow(hostId).first().map { events ->
            val page = events.drop(safeOffset).take(safeLimit)
            HostEventPage(
                events = page,
                nextOffset = safeOffset + page.size,
                hasMore = safeOffset + page.size < events.size,
            )
        }
    }
    fun getEventTemplatesByHostFlow(hostId: String): Flow<Result<List<EventTemplateSummary>>> =
        flowOf(Result.success(emptyList()))
    suspend fun createEventTemplateFromEvent(sourceEventId: String): Result<EventTemplateSummary> =
        Result.failure(UnsupportedOperationException("Event template creation is not supported."))
    suspend fun seedEventTemplate(
        templateId: String,
        newEventId: String,
        newStartDate: Instant,
    ): Result<SeededEventTemplateDraft> =
        Result.failure(UnsupportedOperationException("Event template seeding is not supported."))
    suspend fun deleteEvent(eventId: String): Result<Unit>
    suspend fun addCurrentUserToEvent(
        event: Event,
        preferredDivisionId: String? = null,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<SelfRegistrationResult>
    suspend fun addCurrentUserToEvent(
        event: Event,
        preferredDivisionId: String? = null,
        occurrence: EventOccurrenceSelection? = null,
        answers: Map<String, String>,
    ): Result<SelfRegistrationResult> = addCurrentUserToEvent(
        event = event,
        preferredDivisionId = preferredDivisionId,
        occurrence = occurrence,
    )
    suspend fun addPlayerToEvent(
        event: Event,
        player: UserData,
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
    suspend fun addTeamToEvent(
        event: Event,
        team: Team,
        preferredDivisionId: String? = null,
        occurrence: EventOccurrenceSelection? = null,
        answers: Map<String, String>,
    ): Result<Unit> = addTeamToEvent(
        event = event,
        team = team,
        preferredDivisionId = preferredDivisionId,
        occurrence = occurrence,
    )
    suspend fun moveTeamParticipantDivision(
        event: Event,
        team: Team,
        preferredDivisionId: String,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<EventParticipantsSyncResult> = Result.failure(NotImplementedError("Team division moves are not implemented."))
    suspend fun syncEventParticipants(
        event: Event,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<EventParticipantsSyncResult>
    suspend fun syncEventDetail(
        event: Event,
        occurrence: EventOccurrenceSelection? = null,
        manage: Boolean = false,
    ): Result<EventDetailSyncResult> = syncEventParticipants(event, occurrence)
        .map { participantResult -> EventDetailSyncResult(participants = participantResult) }
    suspend fun getEventParticipantsSummary(
        eventId: String,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<EventParticipantsSummary> = Result.success(EventParticipantsSummary())
    suspend fun getEventParticipantManagementSnapshot(
        eventId: String,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<EventParticipantManagementSnapshot> = Result.success(EventParticipantManagementSnapshot())
    fun observeEventParticipantManagementSnapshot(
        eventId: String,
        occurrence: EventOccurrenceSelection? = null,
    ): Flow<EventParticipantManagementSnapshot> = flowOf(EventParticipantManagementSnapshot())
    suspend fun getEventTeamCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<List<EventTeamComplianceSummary>> =
        Result.failure(NotImplementedError("Event team compliance is not implemented."))
    fun observeEventTeamCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection? = null,
    ): Flow<List<EventTeamComplianceSummary>> = flowOf(emptyList())
    suspend fun getEventUserCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection? = null,
    ): Result<List<EventComplianceUserSummary>> =
        Result.failure(NotImplementedError("Event user compliance is not implemented."))
    fun observeEventUserCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection? = null,
    ): Flow<List<EventComplianceUserSummary>> = flowOf(emptyList())
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
    suspend fun getMyScheduleNextAction(): Result<UserScheduleNextAction> =
        Result.success(UserScheduleNextAction.CreateEvent)
    suspend fun syncCurrentUserRegistrationCache(): Result<Unit> = Result.success(Unit)
    suspend fun syncCurrentUserRegistrationCacheForEvent(eventId: String): Result<Unit> = Result.success(Unit)
    fun observeCurrentUserRegistrationsForEvent(eventId: String): Flow<List<EventRegistrationCacheEntry>> =
        flowOf(emptyList())
    suspend fun clearCurrentUserRegistrationCache(): Result<Unit> = Result.success(Unit)
suspend fun reportEvent(eventId: String, notes: String? = null): Result<Unit> =
        Result.failure(NotImplementedError("Event reporting is not implemented"))
}
