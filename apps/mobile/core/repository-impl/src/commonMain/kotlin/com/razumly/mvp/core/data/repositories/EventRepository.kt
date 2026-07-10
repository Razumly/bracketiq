package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.BillDiscountSummary
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.EventParticipantManagementCacheEntry
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.dataTypes.EventTeamComplianceCacheEntry
import com.razumly.mvp.core.data.dataTypes.EventUserComplianceCacheEntry
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
import com.razumly.mvp.core.data.dataTypes.normalizedEventTags
import com.razumly.mvp.core.data.dataTypes.usableLatitudeLongitude
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.analytics.AnalyticsEvent
import com.razumly.mvp.core.analytics.AnalyticsTracker
import com.razumly.mvp.core.data.util.isPlaceholderSlot
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.util.calcDistance
import com.razumly.mvp.core.util.jsonMVP
import dev.icerock.moko.geo.LatLng
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.BillDiscountSummaryDto
import com.razumly.mvp.core.network.dto.CreateEventRequestDto
import com.razumly.mvp.core.network.dto.CreateEventTemplateRequestDto
import com.razumly.mvp.core.network.dto.CurrentUserEventRegistrationsResponseDto
import com.razumly.mvp.core.network.dto.EventApiDto
import com.razumly.mvp.core.network.dto.EventChildRegistrationRequestDto
import com.razumly.mvp.core.network.dto.EventChildRegistrationResponseDto
import com.razumly.mvp.core.network.dto.EventComplianceDocumentCountsDto
import com.razumly.mvp.core.network.dto.EventCompliancePaymentSummaryDto
import com.razumly.mvp.core.network.dto.EventComplianceRequiredDocumentDto
import com.razumly.mvp.core.network.dto.EventComplianceUserSummaryDto
import com.razumly.mvp.core.network.dto.EventDetailBootstrapResponseDto
import com.razumly.mvp.core.network.dto.EventParticipantDivisionWarningDto
import com.razumly.mvp.core.network.dto.EventParticipantEntryDto
import com.razumly.mvp.core.network.dto.EventParticipantRegistrationSectionsDto
import com.razumly.mvp.core.network.dto.EventParticipantsSnapshotResponseDto
import com.razumly.mvp.core.network.dto.EventParticipantsRequestDto
import com.razumly.mvp.core.network.dto.EventParticipantsResponseDto
import com.razumly.mvp.core.network.dto.EventResponseDto
import com.razumly.mvp.core.network.dto.EventSearchFiltersDto
import com.razumly.mvp.core.network.dto.EventSearchRequestDto
import com.razumly.mvp.core.network.dto.EventSearchUserLocationDto
import com.razumly.mvp.core.network.dto.EventTagsResponseDto
import com.razumly.mvp.core.network.dto.EventTeamComplianceResponseDto
import com.razumly.mvp.core.network.dto.EventTeamComplianceSummaryDto
import com.razumly.mvp.core.network.dto.EventTemplateApiDto
import com.razumly.mvp.core.network.dto.EventTemplateResponseDto
import com.razumly.mvp.core.network.dto.EventTemplatesResponseDto
import com.razumly.mvp.core.network.dto.EventUserComplianceResponseDto
import com.razumly.mvp.core.network.dto.EventsResponseDto
import com.razumly.mvp.core.network.dto.ProfileScheduleResponseDto
import com.razumly.mvp.core.network.dto.RegistrationQuestionAnswerDto
import com.razumly.mvp.core.network.dto.RegistrationQuestionAnswerSnapshotDto
import com.razumly.mvp.core.network.dto.ScheduleEventRequestDto
import com.razumly.mvp.core.network.dto.ScheduleEventResponseDto
import com.razumly.mvp.core.network.dto.SeedEventTemplateRequestDto
import com.razumly.mvp.core.network.dto.StandingsConfirmRequestDto
import com.razumly.mvp.core.network.dto.StandingsConfirmResponseDto
import com.razumly.mvp.core.network.dto.StandingsDivisionDto
import com.razumly.mvp.core.network.dto.StandingsResponseDto
import com.razumly.mvp.core.network.dto.UpdateEventRequestDto
import com.razumly.mvp.core.network.dto.toUserDataOrNull
import com.razumly.mvp.core.network.dto.toUpdateDto
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.Serializable
import kotlin.time.Clock
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
    suspend fun getEventsByIds(eventIds: List<String>): Result<List<Event>>
    suspend fun getEventsByOrganization(organizationId: String, limit: Int = 200): Result<List<Event>>
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
    suspend fun syncCurrentUserRegistrationCache(): Result<Unit> = Result.success(Unit)
    suspend fun syncCurrentUserRegistrationCacheForEvent(eventId: String): Result<Unit> = Result.success(Unit)
    fun observeCurrentUserRegistrationsForEvent(eventId: String): Flow<List<EventRegistrationCacheEntry>> =
        flowOf(emptyList())
    suspend fun clearCurrentUserRegistrationCache(): Result<Unit> = Result.success(Unit)
suspend fun reportEvent(eventId: String, notes: String? = null): Result<Unit> =
        Result.failure(NotImplementedError("Event reporting is not implemented"))
}

@Serializable
private data class RegistrationQuestionDto(
    val id: String = "",
    val prompt: String = "",
    val answerType: String = "TEXT",
    val required: Boolean = false,
    val sortOrder: Int = 0,
)

@Serializable
private data class RegistrationQuestionsResponseDto(
    val questions: List<RegistrationQuestionDto> = emptyList(),
    val error: String? = null,
)

private fun RegistrationQuestionDto.toTeamJoinQuestionOrNull(): TeamJoinQuestion? {
    val normalizedId = id.trim().takeIf(String::isNotBlank) ?: return null
    val normalizedPrompt = prompt.trim().takeIf(String::isNotBlank) ?: return null
    return TeamJoinQuestion(
        id = normalizedId,
        prompt = normalizedPrompt,
        answerType = answerType.trim().ifBlank { "TEXT" },
        required = required,
        sortOrder = sortOrder,
    )
}

private fun Map<String, String>.toRegistrationQuestionAnswerDtos(): List<RegistrationQuestionAnswerDto> =
    mapNotNull { (questionId, answer) ->
        val normalizedQuestionId = questionId.trim().takeIf(String::isNotBlank) ?: return@mapNotNull null
        RegistrationQuestionAnswerDto(
            questionId = normalizedQuestionId,
            answer = answer,
        )
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
    val divisionWarnings: List<EventParticipantDivisionWarning> = emptyList(),
    val weeklySelectionRequired: Boolean = false,
)

data class EventDetailSyncResult(
    val participants: EventParticipantsSyncResult,
    val matches: List<MatchMVP> = emptyList(),
    val fields: List<Field> = emptyList(),
    val timeSlots: List<TimeSlot> = emptyList(),
    val leagueScoringConfig: LeagueScoringConfig? = null,
    val staffInvites: List<Invite> = emptyList(),
) {
    val event: Event get() = participants.event
}

data class EventParticipantDivisionWarning(
    val divisionId: String,
    val code: String,
    val message: String,
    val filledCount: Int = 0,
    val slotCount: Int = 0,
    val maxTeams: Int = 0,
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

data class EventCompliancePaymentSummary(
    val hasBill: Boolean = false,
    val billId: String? = null,
    val totalAmountCents: Int = 0,
    val paidAmountCents: Int = 0,
    val originalAmountCents: Int = totalAmountCents,
    val discountAmountCents: Int = 0,
    val discountedAmountCents: Int = totalAmountCents,
    val discounts: List<BillDiscountSummary> = emptyList(),
    val status: String? = null,
    val isPaidInFull: Boolean = false,
    val paymentPending: Boolean = false,
    val inheritedFromTeamBill: Boolean = false,
    val manualPaymentProofStatus: String? = null,
    val manualPaymentProofCount: Int = 0,
)

data class EventComplianceDocumentCounts(
    val signedCount: Int = 0,
    val requiredCount: Int = 0,
)

data class EventTemplateSummary(
    val id: String,
    val name: String,
    val description: String? = null,
    val sourceEventId: String? = null,
    val ownerUserId: String? = null,
    val organizationId: String? = null,
    val sportId: String? = null,
    val eventType: String? = null,
    val createdAt: Instant? = null,
    val updatedAt: Instant? = null,
)

@Serializable
data class SeededEventTemplateDraft(
    val event: Event,
    val fields: List<Field> = emptyList(),
    val timeSlots: List<TimeSlot> = emptyList(),
    val leagueScoringConfig: LeagueScoringConfigDTO? = null,
)

@Serializable
data class EventComplianceRequiredDocument(
    val key: String,
    val templateId: String,
    val title: String,
    val type: String,
    val signerContext: String,
    val signerLabel: String,
    val signOnce: Boolean,
    val status: String,
    val signedDocumentRecordId: String? = null,
    val signedAt: String? = null,
)

@Serializable
data class RegistrationQuestionAnswerSummary(
    val questionId: String,
    val prompt: String,
    val answerType: String = "TEXT",
    val required: Boolean = false,
    val sortOrder: Int = 0,
    val answer: String = "",
)

data class EventComplianceUserSummary(
    val userId: String,
    val fullName: String,
    val userName: String? = null,
    val isMinorAtEvent: Boolean = false,
    val registrationType: String = "ADULT",
    val payment: EventCompliancePaymentSummary = EventCompliancePaymentSummary(),
    val documents: EventComplianceDocumentCounts = EventComplianceDocumentCounts(),
    val requiredDocuments: List<EventComplianceRequiredDocument> = emptyList(),
    val registrationAnswers: List<RegistrationQuestionAnswerSummary> = emptyList(),
)

data class EventTeamComplianceSummary(
    val teamId: String,
    val teamName: String,
    val payment: EventCompliancePaymentSummary = EventCompliancePaymentSummary(),
    val documents: EventComplianceDocumentCounts = EventComplianceDocumentCounts(),
    val users: List<EventComplianceUserSummary> = emptyList(),
    val registrationAnswers: List<RegistrationQuestionAnswerSummary> = emptyList(),
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

private const val MANAGEMENT_SECTION_TEAM = "TEAM"
private const val MANAGEMENT_SECTION_USER = "USER"
private const val MANAGEMENT_SECTION_CHILD = "CHILD"
private const val MANAGEMENT_SECTION_WAITLIST = "WAITLIST"
private const val MANAGEMENT_SECTION_FREE_AGENT = "FREE_AGENT"
private const val STANDALONE_COMPLIANCE_PARENT_TEAM_ID = ""
private const val KILOMETERS_PER_MILE = 1.60934

private fun milesToKilometers(value: Double): Double = value * KILOMETERS_PER_MILE

private fun Event.analyticsProperties(): Map<String, String> = buildMap {
    put("event_id", id)
    put("event_type", eventType.name)
    put("team_signup", teamSignup.toString())
    organizationId?.trim()?.takeIf(String::isNotBlank)?.let { put("organization_id", it) }
    sportId?.trim()?.takeIf(String::isNotBlank)?.let { put("sport_id", it) }
}

private data class EventParticipantCacheScope(
    val eventId: String,
    val cacheSlotId: String,
    val cacheOccurrenceDate: String,
)

private fun eventParticipantCacheScope(
    eventId: String,
    occurrence: EventOccurrenceSelection?,
): EventParticipantCacheScope {
    return EventParticipantCacheScope(
        eventId = eventId.trim(),
        cacheSlotId = occurrence?.slotId?.trim().orEmpty(),
        cacheOccurrenceDate = occurrence?.occurrenceDate?.trim().orEmpty(),
    )
}

private fun EventParticipantManagementEntry.toCacheEntry(
    scope: EventParticipantCacheScope,
    section: String,
    sortOrder: Int,
): EventParticipantManagementCacheEntry {
    return EventParticipantManagementCacheEntry(
        eventId = scope.eventId,
        cacheSlotId = scope.cacheSlotId,
        cacheOccurrenceDate = scope.cacheOccurrenceDate,
        section = section,
        registrationId = registrationId,
        sortOrder = sortOrder,
        registrantId = registrantId,
        registrantType = registrantType,
        rosterRole = rosterRole,
        status = status,
        parentId = parentId,
        divisionId = divisionId,
        divisionTypeId = divisionTypeId,
        divisionTypeKey = divisionTypeKey,
        consentDocumentId = consentDocumentId,
        consentStatus = consentStatus,
        slotId = slotId,
        occurrenceDate = occurrenceDate,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )
}

private fun EventParticipantManagementCacheEntry.toManagementEntry(): EventParticipantManagementEntry {
    return EventParticipantManagementEntry(
        registrationId = registrationId,
        registrantId = registrantId,
        registrantType = registrantType,
        rosterRole = rosterRole,
        status = status,
        parentId = parentId,
        divisionId = divisionId,
        divisionTypeId = divisionTypeId,
        divisionTypeKey = divisionTypeKey,
        consentDocumentId = consentDocumentId,
        consentStatus = consentStatus,
        slotId = slotId,
        occurrenceDate = occurrenceDate,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )
}

private fun EventParticipantManagementSnapshot.toCacheEntries(
    scope: EventParticipantCacheScope,
): List<EventParticipantManagementCacheEntry> {
    return buildList {
        teamRegistrations.forEachIndexed { index, entry ->
            add(entry.toCacheEntry(scope, MANAGEMENT_SECTION_TEAM, index))
        }
        userRegistrations.forEachIndexed { index, entry ->
            add(entry.toCacheEntry(scope, MANAGEMENT_SECTION_USER, index))
        }
        childRegistrations.forEachIndexed { index, entry ->
            add(entry.toCacheEntry(scope, MANAGEMENT_SECTION_CHILD, index))
        }
        waitlistRegistrations.forEachIndexed { index, entry ->
            add(entry.toCacheEntry(scope, MANAGEMENT_SECTION_WAITLIST, index))
        }
        freeAgentRegistrations.forEachIndexed { index, entry ->
            add(entry.toCacheEntry(scope, MANAGEMENT_SECTION_FREE_AGENT, index))
        }
    }
}

private fun List<EventParticipantManagementCacheEntry>.toManagementSnapshotFromCache(): EventParticipantManagementSnapshot {
    fun entriesFor(section: String): List<EventParticipantManagementEntry> =
        asSequence()
            .filter { entry -> entry.section == section }
            .sortedBy { entry -> entry.sortOrder }
            .map(EventParticipantManagementCacheEntry::toManagementEntry)
            .toList()

    return EventParticipantManagementSnapshot(
        teamRegistrations = entriesFor(MANAGEMENT_SECTION_TEAM),
        userRegistrations = entriesFor(MANAGEMENT_SECTION_USER),
        childRegistrations = entriesFor(MANAGEMENT_SECTION_CHILD),
        waitlistRegistrations = entriesFor(MANAGEMENT_SECTION_WAITLIST),
        freeAgentRegistrations = entriesFor(MANAGEMENT_SECTION_FREE_AGENT),
    )
}

private fun EventParticipantDivisionWarningDto.toDomainWarningOrNull(): EventParticipantDivisionWarning? {
    val normalizedDivisionId = divisionId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val normalizedCode = code?.trim()?.takeIf(String::isNotBlank) ?: return null
    val normalizedMessage = message?.trim()?.takeIf(String::isNotBlank) ?: return null
    return EventParticipantDivisionWarning(
        divisionId = normalizedDivisionId,
        code = normalizedCode,
        message = normalizedMessage,
        filledCount = filledCount ?: 0,
        slotCount = slotCount ?: 0,
        maxTeams = maxTeams ?: 0,
    )
}

private fun EventCompliancePaymentSummaryDto?.toCompliancePaymentSummary(): EventCompliancePaymentSummary {
    if (this == null) {
        return EventCompliancePaymentSummary()
    }
    return EventCompliancePaymentSummary(
        hasBill = hasBill == true,
        billId = billId?.trim()?.takeIf(String::isNotBlank),
        totalAmountCents = totalAmountCents ?: 0,
        paidAmountCents = paidAmountCents ?: 0,
        originalAmountCents = originalAmountCents ?: totalAmountCents ?: 0,
        discountAmountCents = discountAmountCents ?: 0,
        discountedAmountCents = discountedAmountCents ?: totalAmountCents ?: 0,
        discounts = discounts.mapNotNull(BillDiscountSummaryDto::toBillDiscountSummaryOrNull),
        status = status?.trim()?.takeIf(String::isNotBlank),
        isPaidInFull = isPaidInFull == true,
        paymentPending = paymentPending == true,
        inheritedFromTeamBill = inheritedFromTeamBill == true,
        manualPaymentProofStatus = manualPaymentProofStatus?.trim()?.takeIf(String::isNotBlank),
        manualPaymentProofCount = manualPaymentProofCount ?: 0,
    )
}

private fun BillDiscountSummaryDto.toBillDiscountSummaryOrNull(): BillDiscountSummary? {
    val resolvedId = id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedDiscountId = discountId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedDiscountCodeId = discountCodeId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedCode = code?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedOriginal = originalAmountCents ?: return null
    val resolvedDiscounted = discountedAmountCents ?: return null
    return BillDiscountSummary(
        id = resolvedId,
        discountId = resolvedDiscountId,
        discountCodeId = resolvedDiscountCodeId,
        code = resolvedCode,
        name = name?.trim()?.takeIf(String::isNotBlank),
        originalAmountCents = resolvedOriginal.coerceAtLeast(0),
        discountedAmountCents = resolvedDiscounted.coerceAtLeast(0),
        discountAmountCents = (discountAmountCents ?: (resolvedOriginal - resolvedDiscounted)).coerceAtLeast(0),
        paymentIntentId = paymentIntentId?.trim()?.takeIf(String::isNotBlank),
        registrationId = registrationId?.trim()?.takeIf(String::isNotBlank),
    )
}

private fun EventComplianceDocumentCountsDto?.toComplianceDocumentCounts(): EventComplianceDocumentCounts {
    if (this == null) {
        return EventComplianceDocumentCounts()
    }
    return EventComplianceDocumentCounts(
        signedCount = signedCount ?: 0,
        requiredCount = requiredCount ?: 0,
    )
}

private fun EventComplianceRequiredDocumentDto.toComplianceRequiredDocumentOrNull(): EventComplianceRequiredDocument? {
    val normalizedKey = key?.trim()?.takeIf(String::isNotBlank)
    val normalizedTemplateId = templateId?.trim()?.takeIf(String::isNotBlank)
    if (normalizedKey == null || normalizedTemplateId == null) {
        return null
    }
    return EventComplianceRequiredDocument(
        key = normalizedKey,
        templateId = normalizedTemplateId,
        title = title?.trim()?.takeIf(String::isNotBlank) ?: "Required document",
        type = type?.trim()?.takeIf(String::isNotBlank) ?: "PDF",
        signerContext = signerContext?.trim()?.takeIf(String::isNotBlank) ?: "participant",
        signerLabel = signerLabel?.trim()?.takeIf(String::isNotBlank) ?: "Participant",
        signOnce = signOnce == true,
        status = status?.trim()?.takeIf(String::isNotBlank) ?: "UNSIGNED",
        signedDocumentRecordId = signedDocumentRecordId?.trim()?.takeIf(String::isNotBlank),
        signedAt = signedAt?.trim()?.takeIf(String::isNotBlank),
    )
}

private fun EventTemplateApiDto.toEventTemplateSummaryOrNull(): EventTemplateSummary? {
    val normalizedId = id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val normalizedName = name?.trim()?.takeIf(String::isNotBlank) ?: "Untitled Template"
    return EventTemplateSummary(
        id = normalizedId,
        name = normalizedName,
        description = description?.trim()?.takeIf(String::isNotBlank),
        sourceEventId = sourceEventId?.trim()?.takeIf(String::isNotBlank),
        ownerUserId = ownerUserId?.trim()?.takeIf(String::isNotBlank),
        organizationId = organizationId?.trim()?.takeIf(String::isNotBlank),
        sportId = sportId?.trim()?.takeIf(String::isNotBlank),
        eventType = eventType?.trim()?.takeIf(String::isNotBlank),
        createdAt = createdAt?.trim()?.takeIf(String::isNotBlank)?.let { raw ->
            runCatching { Instant.parse(raw) }.getOrNull()
        },
        updatedAt = updatedAt?.trim()?.takeIf(String::isNotBlank)?.let { raw ->
            runCatching { Instant.parse(raw) }.getOrNull()
        },
    )
}

private fun RegistrationQuestionAnswerSnapshotDto.toRegistrationQuestionAnswerOrNull(): RegistrationQuestionAnswerSummary? {
    val normalizedQuestionId = questionId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val normalizedPrompt = prompt?.trim()?.takeIf(String::isNotBlank) ?: return null
    return RegistrationQuestionAnswerSummary(
        questionId = normalizedQuestionId,
        prompt = normalizedPrompt,
        answerType = answerType?.trim()?.takeIf(String::isNotBlank) ?: "TEXT",
        required = required == true,
        sortOrder = sortOrder ?: 0,
        answer = answer?.trim().orEmpty(),
    )
}

private fun EventComplianceUserSummaryDto.toComplianceUserSummaryOrNull(): EventComplianceUserSummary? {
    val normalizedUserId = userId?.trim()?.takeIf(String::isNotBlank) ?: return null
    return EventComplianceUserSummary(
        userId = normalizedUserId,
        fullName = fullName?.trim()?.takeIf(String::isNotBlank) ?: normalizedUserId,
        userName = userName?.trim()?.takeIf(String::isNotBlank),
        isMinorAtEvent = isMinorAtEvent == true,
        registrationType = registrationType?.trim()?.takeIf(String::isNotBlank) ?: "ADULT",
        payment = payment.toCompliancePaymentSummary(),
        documents = documents.toComplianceDocumentCounts(),
        requiredDocuments = requiredDocuments.mapNotNull(EventComplianceRequiredDocumentDto::toComplianceRequiredDocumentOrNull),
        registrationAnswers = registrationAnswers.mapNotNull(RegistrationQuestionAnswerSnapshotDto::toRegistrationQuestionAnswerOrNull),
    )
}

private fun EventTeamComplianceSummaryDto.toTeamComplianceSummaryOrNull(): EventTeamComplianceSummary? {
    val normalizedTeamId = teamId?.trim()?.takeIf(String::isNotBlank) ?: return null
    return EventTeamComplianceSummary(
        teamId = normalizedTeamId,
        teamName = teamName?.trim()?.takeIf(String::isNotBlank) ?: "Team",
        payment = payment.toCompliancePaymentSummary(),
        documents = documents.toComplianceDocumentCounts(),
        users = users.mapNotNull(EventComplianceUserSummaryDto::toComplianceUserSummaryOrNull),
        registrationAnswers = registrationAnswers.mapNotNull(RegistrationQuestionAnswerSnapshotDto::toRegistrationQuestionAnswerOrNull),
    )
}

private fun EventTeamComplianceSummary.toCacheEntry(
    scope: EventParticipantCacheScope,
): EventTeamComplianceCacheEntry {
    return EventTeamComplianceCacheEntry(
        eventId = scope.eventId,
        cacheSlotId = scope.cacheSlotId,
        cacheOccurrenceDate = scope.cacheOccurrenceDate,
        teamId = teamId,
        teamName = teamName,
        paymentHasBill = payment.hasBill,
        paymentBillId = payment.billId,
        paymentTotalAmountCents = payment.totalAmountCents,
        paymentPaidAmountCents = payment.paidAmountCents,
        paymentOriginalAmountCents = payment.originalAmountCents,
        paymentDiscountAmountCents = payment.discountAmountCents,
        paymentDiscountedAmountCents = payment.discountedAmountCents,
        paymentDiscountsJson = jsonMVP.encodeToString(payment.discounts),
        paymentStatus = payment.status,
        paymentIsPaidInFull = payment.isPaidInFull,
        paymentPending = payment.paymentPending,
        paymentInheritedFromTeamBill = payment.inheritedFromTeamBill,
        manualPaymentProofStatus = payment.manualPaymentProofStatus,
        manualPaymentProofCount = payment.manualPaymentProofCount,
        documentsSignedCount = documents.signedCount,
        documentsRequiredCount = documents.requiredCount,
        registrationAnswersJson = jsonMVP.encodeToString(registrationAnswers),
    )
}

private fun EventComplianceUserSummary.toCacheEntry(
    scope: EventParticipantCacheScope,
    parentTeamId: String = STANDALONE_COMPLIANCE_PARENT_TEAM_ID,
): EventUserComplianceCacheEntry {
    return EventUserComplianceCacheEntry(
        eventId = scope.eventId,
        cacheSlotId = scope.cacheSlotId,
        cacheOccurrenceDate = scope.cacheOccurrenceDate,
        parentTeamId = parentTeamId,
        userId = userId,
        fullName = fullName,
        userName = userName,
        isMinorAtEvent = isMinorAtEvent,
        registrationType = registrationType,
        paymentHasBill = payment.hasBill,
        paymentBillId = payment.billId,
        paymentTotalAmountCents = payment.totalAmountCents,
        paymentPaidAmountCents = payment.paidAmountCents,
        paymentOriginalAmountCents = payment.originalAmountCents,
        paymentDiscountAmountCents = payment.discountAmountCents,
        paymentDiscountedAmountCents = payment.discountedAmountCents,
        paymentDiscountsJson = jsonMVP.encodeToString(payment.discounts),
        paymentStatus = payment.status,
        paymentIsPaidInFull = payment.isPaidInFull,
        paymentPending = payment.paymentPending,
        paymentInheritedFromTeamBill = payment.inheritedFromTeamBill,
        manualPaymentProofStatus = payment.manualPaymentProofStatus,
        manualPaymentProofCount = payment.manualPaymentProofCount,
        documentsSignedCount = documents.signedCount,
        documentsRequiredCount = documents.requiredCount,
        requiredDocumentsJson = jsonMVP.encodeToString(requiredDocuments),
        registrationAnswersJson = jsonMVP.encodeToString(registrationAnswers),
    )
}

private fun EventTeamComplianceCacheEntry.toTeamComplianceSummary(
    users: List<EventComplianceUserSummary>,
): EventTeamComplianceSummary {
    return EventTeamComplianceSummary(
        teamId = teamId,
        teamName = teamName,
        payment = EventCompliancePaymentSummary(
            hasBill = paymentHasBill,
            billId = paymentBillId,
            totalAmountCents = paymentTotalAmountCents,
            paidAmountCents = paymentPaidAmountCents,
            originalAmountCents = paymentOriginalAmountCents,
            discountAmountCents = paymentDiscountAmountCents,
            discountedAmountCents = paymentDiscountedAmountCents,
            discounts = runCatching {
                jsonMVP.decodeFromString<List<BillDiscountSummary>>(paymentDiscountsJson)
            }.getOrDefault(emptyList()),
            status = paymentStatus,
            isPaidInFull = paymentIsPaidInFull,
            paymentPending = paymentPending,
            inheritedFromTeamBill = paymentInheritedFromTeamBill,
            manualPaymentProofStatus = manualPaymentProofStatus,
            manualPaymentProofCount = manualPaymentProofCount,
        ),
        documents = EventComplianceDocumentCounts(
            signedCount = documentsSignedCount,
            requiredCount = documentsRequiredCount,
        ),
        users = users,
        registrationAnswers = runCatching {
            jsonMVP.decodeFromString<List<RegistrationQuestionAnswerSummary>>(registrationAnswersJson)
        }.getOrDefault(emptyList()),
    )
}

private fun EventUserComplianceCacheEntry.toComplianceUserSummary(): EventComplianceUserSummary {
    return EventComplianceUserSummary(
        userId = userId,
        fullName = fullName,
        userName = userName,
        isMinorAtEvent = isMinorAtEvent,
        registrationType = registrationType,
        payment = EventCompliancePaymentSummary(
            hasBill = paymentHasBill,
            billId = paymentBillId,
            totalAmountCents = paymentTotalAmountCents,
            paidAmountCents = paymentPaidAmountCents,
            originalAmountCents = paymentOriginalAmountCents,
            discountAmountCents = paymentDiscountAmountCents,
            discountedAmountCents = paymentDiscountedAmountCents,
            discounts = runCatching {
                jsonMVP.decodeFromString<List<BillDiscountSummary>>(paymentDiscountsJson)
            }.getOrDefault(emptyList()),
            status = paymentStatus,
            isPaidInFull = paymentIsPaidInFull,
            paymentPending = paymentPending,
            inheritedFromTeamBill = paymentInheritedFromTeamBill,
            manualPaymentProofStatus = manualPaymentProofStatus,
            manualPaymentProofCount = manualPaymentProofCount,
        ),
        documents = EventComplianceDocumentCounts(
            signedCount = documentsSignedCount,
            requiredCount = documentsRequiredCount,
        ),
        requiredDocuments = runCatching {
            jsonMVP.decodeFromString<List<EventComplianceRequiredDocument>>(requiredDocumentsJson)
        }.getOrDefault(emptyList()),
        registrationAnswers = runCatching {
            jsonMVP.decodeFromString<List<RegistrationQuestionAnswerSummary>>(registrationAnswersJson)
        }.getOrDefault(emptyList()),
    )
}

private fun teamComplianceFromCache(
    teamRows: List<EventTeamComplianceCacheEntry>,
    userRows: List<EventUserComplianceCacheEntry>,
): List<EventTeamComplianceSummary> {
    val usersByTeamId = userRows.groupBy(
        keySelector = EventUserComplianceCacheEntry::parentTeamId,
        valueTransform = EventUserComplianceCacheEntry::toComplianceUserSummary,
    )
    return teamRows.map { row ->
        row.toTeamComplianceSummary(usersByTeamId[row.teamId].orEmpty())
    }
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
    coroutineDispatcher: CoroutineDispatcher = Dispatchers.Default,
) : IEventRepository {
    private val scope = CoroutineScope(SupervisorJob() + coroutineDispatcher)
    private val eventPageSize = 50

    init {
        scope.launch {
            databaseService.getEventDao.deleteAllEvents()
        }
        scope.launch(start = CoroutineStart.UNDISPATCHED) {
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

    fun close() {
        scope.cancel()
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

    override suspend fun getRegistrationQuestions(
        scopeType: String,
        scopeId: String,
    ): Result<List<TeamJoinQuestion>> = runCatching {
        val normalizedScopeType = scopeType.trim().uppercase().takeIf(String::isNotBlank)
            ?: error("Question scope type is required.")
        val normalizedScopeId = scopeId.trim().takeIf(String::isNotBlank)
            ?: error("Question scope id is required.")
        val response = api.get<RegistrationQuestionsResponseDto>(
            path = "api/registration-questions?scopeType=${normalizedScopeType.encodeURLQueryComponent()}&scopeId=${normalizedScopeId.encodeURLQueryComponent()}",
        )
        if (!response.error.isNullOrBlank()) {
            error(response.error)
        }
        response.questions
            .mapNotNull(RegistrationQuestionDto::toTeamJoinQuestionOrNull)
            .sortedWith(compareBy<TeamJoinQuestion> { it.sortOrder }.thenBy { it.prompt })
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

    override fun getCachedEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>> {
        val normalizedEventId = eventId.trim()
        if (normalizedEventId.isBlank()) {
            return flowOf(Result.failure(IllegalArgumentException("Event id is required.")))
        }
        return databaseService.getEventDao.getEventWithRelationsFlow(normalizedEventId)
            .map { relations ->
                if (relations != null) {
                    Result.success(relations)
                } else {
                    Result.failure(NoSuchElementException("Event $normalizedEventId not found in local cache"))
                }
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

    private fun List<DivisionDetail>.preservesConfiguredDivisionDetailsFrom(cached: Event): Boolean {
        if (cached.divisionDetails.isEmpty()) return true
        return cached.divisions.normalizeDivisionIdentifiers().all { cachedDivisionId ->
            val cachedDetail = cached.divisionDetails.firstOrNull { detail ->
                detail.id.normalizeDivisionIdentifier() == cachedDivisionId
            }
            val currentDetail = firstOrNull { detail ->
                detail.id.normalizeDivisionIdentifier() == cachedDivisionId
            }
            cachedDetail == null ||
                (
                    currentDetail != null &&
                        (cachedDetail.maxParticipants == null || currentDetail.maxParticipants != null)
                    )
        }
    }

    private fun Event.withPreservedCachedDivisionState(cached: Event?): Event {
        val cachedDivisions = cached?.divisions?.normalizeDivisionIdentifiers().orEmpty()
        if (cached == null || cachedDivisions.isEmpty()) return this

        val currentDivisions = divisions.normalizeDivisionIdentifiers()
        val hasAllCachedDivisions = cachedDivisions.all { cachedDivisionId ->
            cachedDivisionId in currentDivisions
        }
        val preserveDivisions = !hasAllCachedDivisions
        val preserveDivisionDetails = preserveDivisions ||
            !divisionDetails.preservesConfiguredDivisionDetailsFrom(cached)

        if (!preserveDivisions && !preserveDivisionDetails) return this

        return copy(
            divisions = if (preserveDivisions) cached.divisions else divisions,
            divisionDetails = if (preserveDivisionDetails) cached.divisionDetails else divisionDetails,
        )
    }

    private fun Event.withPreservedCachedParticipantRoster(cached: Event?): Event {
        if (cached == null) return this
        return copy(
            teamIds = cached.teamIds,
            userIds = cached.userIds,
            waitListIds = cached.waitListIds,
            freeAgentIds = cached.freeAgentIds,
        )
    }

    private suspend fun preserveCachedDivisionState(event: Event): Event =
        event.withPreservedCachedDivisionState(databaseService.getEventDao.getEventById(event.id))

    private suspend fun preserveCachedDivisionState(events: List<Event>): List<Event> {
        if (events.isEmpty()) return emptyList()
        val cachedById = databaseService.getEventDao
            .getEventsByIds(events.map(Event::id))
            .associateBy(Event::id)
        return events.map { event -> event.withPreservedCachedDivisionState(cachedById[event.id]) }
    }

    private suspend fun fetchRemoteEventsByHost(hostId: String): List<Event> {
        val encodedHostId = hostId.encodeURLQueryComponent()
        val res = api.get<EventsResponseDto>("api/events?hostId=$encodedHostId&limit=200")
        return res.events.mapNotNull { it.toEventOrNull() }
    }

    private suspend fun fetchRemoteEventTemplatesByHost(hostId: String): List<EventTemplateSummary> {
        val encodedHostId = hostId.encodeURLQueryComponent()
        val res = api.get<EventTemplatesResponseDto>(
            "api/event-templates?hostId=$encodedHostId&limit=200"
        )
        return res.templates.mapNotNull { it.toEventTemplateSummaryOrNull() }
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

    private suspend fun fetchCurrentUserRegistrations(
        updatedAfter: Instant?,
        eventId: String? = null,
    ): List<EventRegistrationCacheEntry> {
        val queryParams = mutableListOf<String>()
        updatedAfter?.let { timestamp ->
            queryParams += "updatedAfter=${timestamp.toString().encodeURLQueryComponent()}"
        }
        eventId
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.let { normalizedEventId ->
                queryParams += "eventId=${normalizedEventId.encodeURLQueryComponent()}"
            }
        val path = buildString {
            append("api/profile/registrations")
            if (queryParams.isNotEmpty()) {
                append("?")
                append(queryParams.joinToString("&"))
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

    private suspend fun fetchEventDetailBootstrap(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
        manage: Boolean,
    ): EventDetailBootstrapResponseDto {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        return api.get(
            appendOccurrenceQuery(
                basePath = "api/events/$normalizedEventId/detail",
                occurrence = occurrence,
                extraQueryParams = if (manage) {
                    mapOf("manage" to "true")
                } else {
                    emptyMap()
                },
            ),
        )
    }

    private suspend fun replaceParticipantManagementSnapshot(
        scope: EventParticipantCacheScope,
        registrations: EventParticipantRegistrationSectionsDto?,
    ): EventParticipantManagementSnapshot {
        val managementSnapshot = registrations.toManagementSnapshot()
        databaseService.getEventParticipantManagementDao.replaceEntries(
            eventId = scope.eventId,
            cacheSlotId = scope.cacheSlotId,
            cacheOccurrenceDate = scope.cacheOccurrenceDate,
            entries = managementSnapshot.toCacheEntries(scope),
        )
        return databaseService.getEventParticipantManagementDao.getEntries(
            eventId = scope.eventId,
            cacheSlotId = scope.cacheSlotId,
            cacheOccurrenceDate = scope.cacheOccurrenceDate,
        ).toManagementSnapshotFromCache()
    }

    private suspend fun replaceTeamComplianceSummaries(
        scope: EventParticipantCacheScope,
        summaries: List<EventTeamComplianceSummary>,
    ): List<EventTeamComplianceSummary> {
        databaseService.getEventComplianceDao.replaceTeamCompliance(
            eventId = scope.eventId,
            cacheSlotId = scope.cacheSlotId,
            cacheOccurrenceDate = scope.cacheOccurrenceDate,
            teamSummaries = summaries.map { summary -> summary.toCacheEntry(scope) },
            teamUserSummaries = summaries.flatMap { summary ->
                summary.users.map { userSummary ->
                    userSummary.toCacheEntry(scope, parentTeamId = summary.teamId)
                }
            },
        )
        return teamComplianceFromCache(
            teamRows = databaseService.getEventComplianceDao.getTeamSummaries(
                eventId = scope.eventId,
                cacheSlotId = scope.cacheSlotId,
                cacheOccurrenceDate = scope.cacheOccurrenceDate,
            ),
            userRows = databaseService.getEventComplianceDao.getTeamUserSummaries(
                eventId = scope.eventId,
                cacheSlotId = scope.cacheSlotId,
                cacheOccurrenceDate = scope.cacheOccurrenceDate,
            ),
        )
    }

    private suspend fun replaceStandaloneUserComplianceSummaries(
        scope: EventParticipantCacheScope,
        summaries: List<EventComplianceUserSummary>,
    ): List<EventComplianceUserSummary> {
        databaseService.getEventComplianceDao.replaceStandaloneUserCompliance(
            eventId = scope.eventId,
            cacheSlotId = scope.cacheSlotId,
            cacheOccurrenceDate = scope.cacheOccurrenceDate,
            userSummaries = summaries.map { summary -> summary.toCacheEntry(scope) },
        )
        return databaseService.getEventComplianceDao.getStandaloneUserSummaries(
            eventId = scope.eventId,
            cacheSlotId = scope.cacheSlotId,
            cacheOccurrenceDate = scope.cacheOccurrenceDate,
        ).map(EventUserComplianceCacheEntry::toComplianceUserSummary)
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

    private suspend fun mergeEventParticipantsSnapshot(
        baseEvent: Event,
        snapshot: EventParticipantsSnapshotResponseDto,
    ): EventParticipantsSyncResult {
        snapshot.error?.takeIf(String::isNotBlank)?.let { error(it) }
        val divisionWarnings = snapshot.divisionWarnings.mapNotNull(EventParticipantDivisionWarningDto::toDomainWarningOrNull)

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
                divisionWarnings = divisionWarnings,
                weeklySelectionRequired = true,
            )
        }

        val participantIds = snapshot.participants
        val snapshotEvent = snapshot.event
            ?.toEventOrNull()
            ?.withPreservedCachedDivisionState(baseEvent)
        val mergedEvent = (snapshotEvent ?: baseEvent).copy(
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
            preloadedTeams = teams,
        )

        return EventParticipantsSyncResult(
            event = mergedEvent,
            participantCount = snapshot.participantCount ?: 0,
            participantCapacity = snapshot.participantCapacity,
            divisionWarnings = divisionWarnings,
            weeklySelectionRequired = snapshot.weeklySelectionRequired == true,
        )
    }

    override suspend fun getEvent(eventId: String): Result<Event> =
        runCatching {
            val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
                ?: error("Event id is required.")
            val cachedEvent = databaseService.getEventDao.getEventById(normalizedEventId)
            val event = try {
                fetchRemoteEvent(normalizedEventId)
                    .withPreservedCachedDivisionState(cachedEvent)
                    .withPreservedCachedParticipantRoster(cachedEvent)
            } catch (throwable: Throwable) {
                if (shouldEvictEventFromCache(throwable)) {
                    databaseService.getEventDao.deleteEventWithCrossRefs(normalizedEventId)
                }
                throw throwable
            }
            databaseService.getEventDao.upsertEvent(event)
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

    override suspend fun syncEventDetail(
        event: Event,
        occurrence: EventOccurrenceSelection?,
        manage: Boolean,
    ): Result<EventDetailSyncResult> = runCatching {
        val normalizedEventId = event.id.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        val cacheScope = eventParticipantCacheScope(normalizedEventId, occurrence)
        val bootstrap = fetchEventDetailBootstrap(
            eventId = normalizedEventId,
            occurrence = occurrence,
            manage = manage,
        )
        val cachedEvent = databaseService.getEventDao.getEventById(normalizedEventId)
        val bootstrapEvent = bootstrap.event
            ?.toEventOrNull()
            ?.withPreservedCachedDivisionState(cachedEvent)
            ?.withPreservedCachedParticipantRoster(cachedEvent)
        val baseEvent = bootstrapEvent ?: cachedEvent ?: event
        val participantSnapshot = bootstrap.participantSnapshot
            ?: EventParticipantsSnapshotResponseDto(event = bootstrap.event)
        val participantResult = mergeEventParticipantsSnapshot(
            baseEvent = baseEvent,
            snapshot = participantSnapshot,
        )

        if (manage && participantSnapshot.registrations != null) {
            replaceParticipantManagementSnapshot(cacheScope, participantSnapshot.registrations)
        }

        bootstrap.teamCompliance?.teams
            ?.mapNotNull(EventTeamComplianceSummaryDto::toTeamComplianceSummaryOrNull)
            ?.let { summaries -> replaceTeamComplianceSummaries(cacheScope, summaries) }
        bootstrap.userCompliance?.users
            ?.mapNotNull(EventComplianceUserSummaryDto::toComplianceUserSummaryOrNull)
            ?.let { summaries -> replaceStandaloneUserComplianceSummaries(cacheScope, summaries) }

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
        val cacheScope = eventParticipantCacheScope(normalizedEventId, occurrence)
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
        replaceParticipantManagementSnapshot(cacheScope, snapshot.registrations)
    }

    override fun observeEventParticipantManagementSnapshot(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Flow<EventParticipantManagementSnapshot> {
        val normalizedEventId = eventId.trim()
        if (normalizedEventId.isBlank()) {
            return flowOf(EventParticipantManagementSnapshot())
        }
        val cacheScope = eventParticipantCacheScope(normalizedEventId, occurrence)
        return databaseService.getEventParticipantManagementDao.observeEntries(
            eventId = cacheScope.eventId,
            cacheSlotId = cacheScope.cacheSlotId,
            cacheOccurrenceDate = cacheScope.cacheOccurrenceDate,
        ).map { entries -> entries.toManagementSnapshotFromCache() }
    }

    override suspend fun getEventTeamCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Result<List<EventTeamComplianceSummary>> = runCatching {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        val cacheScope = eventParticipantCacheScope(normalizedEventId, occurrence)
        val summaries = api.get<EventTeamComplianceResponseDto>(
            path = appendOccurrenceQuery(
                basePath = "api/events/$normalizedEventId/teams/compliance",
                occurrence = occurrence,
            ),
        ).teams.mapNotNull(EventTeamComplianceSummaryDto::toTeamComplianceSummaryOrNull)
        replaceTeamComplianceSummaries(cacheScope, summaries)
    }

    override fun observeEventTeamCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Flow<List<EventTeamComplianceSummary>> {
        val normalizedEventId = eventId.trim()
        if (normalizedEventId.isBlank()) {
            return flowOf(emptyList())
        }
        val cacheScope = eventParticipantCacheScope(normalizedEventId, occurrence)
        return combine(
            databaseService.getEventComplianceDao.observeTeamSummaries(
                eventId = cacheScope.eventId,
                cacheSlotId = cacheScope.cacheSlotId,
                cacheOccurrenceDate = cacheScope.cacheOccurrenceDate,
            ),
            databaseService.getEventComplianceDao.observeTeamUserSummaries(
                eventId = cacheScope.eventId,
                cacheSlotId = cacheScope.cacheSlotId,
                cacheOccurrenceDate = cacheScope.cacheOccurrenceDate,
            ),
        ) { teamRows, userRows ->
            teamComplianceFromCache(teamRows, userRows)
        }
    }

    override suspend fun getEventUserCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Result<List<EventComplianceUserSummary>> = runCatching {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        val cacheScope = eventParticipantCacheScope(normalizedEventId, occurrence)
        val summaries = api.get<EventUserComplianceResponseDto>(
            path = appendOccurrenceQuery(
                basePath = "api/events/$normalizedEventId/users/compliance",
                occurrence = occurrence,
            ),
        ).users.mapNotNull(EventComplianceUserSummaryDto::toComplianceUserSummaryOrNull)
        replaceStandaloneUserComplianceSummaries(cacheScope, summaries)
    }

    override fun observeEventUserCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Flow<List<EventComplianceUserSummary>> {
        val normalizedEventId = eventId.trim()
        if (normalizedEventId.isBlank()) {
            return flowOf(emptyList())
        }
        val cacheScope = eventParticipantCacheScope(normalizedEventId, occurrence)
        return databaseService.getEventComplianceDao.observeStandaloneUserSummaries(
            eventId = cacheScope.eventId,
            cacheSlotId = cacheScope.cacheSlotId,
            cacheOccurrenceDate = cacheScope.cacheOccurrenceDate,
        ).map { rows -> rows.map(EventUserComplianceCacheEntry::toComplianceUserSummary) }
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

    override suspend fun syncCurrentUserRegistrationCacheForEvent(eventId: String): Result<Unit> = runCatching {
        val normalizedEventId = eventId.trim()
        if (normalizedEventId.isBlank()) {
            return@runCatching
        }

        val dataSource = currentUserDataSource ?: return@runCatching
        val currentUserId = dataSource.getUserIdNow().trim()
        if (currentUserId.isBlank()) {
            databaseService.getEventRegistrationDao.deleteRegistrationsForEvent(normalizedEventId)
            return@runCatching
        }

        val registrations = fetchCurrentUserRegistrations(
            updatedAfter = null,
            eventId = normalizedEventId,
        )
        databaseService.getEventRegistrationDao.deleteRegistrationsForEvent(normalizedEventId)
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
    ): EventParticipantsSyncResult? {
        val eventWithStableDivisions = preserveCachedDivisionState(event)
        syncCurrentUserRegistrationCache().getOrNull()
        return syncEventParticipants(eventWithStableDivisions, occurrence)
            .onFailure {
                databaseService.getEventDao.upsertEvent(eventWithStableDivisions)
                persistEventRelations(eventWithStableDivisions)
            }
            .getOrNull()
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

        val events = preserveCachedDivisionState(fetchRemoteEventsByIds(ids))
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
            val events = preserveCachedDivisionState(fetchRemoteEventsByOrganization(normalizedOrganizationId, limit))
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
            persistEventRelations(event)
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
        persistEventRelations(event)
        event
    }

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
            sports = emptyList(),
            tags = emptyList(),
            limit = eventPageSize,
            offset = 0,
            includeDistanceFilter = true,
        )
    }

    override suspend fun getEventsInBounds(
        bounds: Bounds,
        dateFrom: Instant?,
        dateTo: Instant?,
        sports: List<String>,
        tags: List<String>,
        limit: Int,
        offset: Int,
        includeDistanceFilter: Boolean,
    ): Result<Pair<List<Event>, Boolean>> {
        return runCatching {
            val normalizedLimit = limit.coerceIn(1, 500)
            val normalizedOffset = offset.coerceAtLeast(0)
            val filters = EventSearchFiltersDto(
                maxDistance = bounds.radiusMiles.takeIf { includeDistanceFilter }?.let(::milesToKilometers),
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
                sports = sports
                    .mapNotNull { sport -> sport.trim().takeIf(String::isNotBlank) }
                    .takeIf { it.isNotEmpty() },
                tags = tags
                    .mapNotNull { tag -> tag.trim().takeIf(String::isNotBlank) }
                    .takeIf { it.isNotEmpty() },
            )
            val res = api.post<EventSearchRequestDto, EventsResponseDto>(
                path = "api/events/search",
                body = EventSearchRequestDto(
                    filters = filters,
                    limit = normalizedLimit,
                    offset = normalizedOffset,
                ),
            )

            val events = preserveCachedDivisionState(
                filterHiddenEvents(
                    res.events.mapNotNull { it.toEventOrNull() },
                    userRepository.currentUser.value.getOrNull(),
                ),
            )
            databaseService.getEventDao.upsertEvents(events)
            val orderedEvents = if (includeDistanceFilter) {
                events.sortedBy { event ->
                    event.usableLatitudeLongitude()
                        ?.let { (latitude, longitude) -> calcDistance(bounds.center, LatLng(latitude, longitude)) }
                        ?: Double.MAX_VALUE
                }
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
        userLocation: LatLng?,
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

            val events = preserveCachedDivisionState(
                filterHiddenEvents(
                    res.events.mapNotNull { it.toEventOrNull() },
                    userRepository.currentUser.value.getOrNull(),
                ),
            )
            databaseService.getEventDao.upsertEvents(events)

            val orderedEvents = userLocation
                ?.let { location ->
                    events.sortedBy { event ->
                        event.usableLatitudeLongitude()
                            ?.let { (latitude, longitude) -> calcDistance(location, LatLng(latitude, longitude)) }
                            ?: Double.MAX_VALUE
                    }
                }
                ?: events

            Pair(
                orderedEvents,
                events.size == normalizedLimit,
            )
        }
    }

    override suspend fun getEventTags(query: String?, filterOnly: Boolean): Result<List<EventTag>> = runCatching {
        val normalizedQuery = query?.trim().orEmpty()
        val path = buildString {
            append("api/event-tags")
            val params = buildList {
                if (normalizedQuery.isNotEmpty()) {
                    add("query=${normalizedQuery.encodeURLQueryComponent()}")
                }
                if (filterOnly) {
                    add("filterOnly=true")
                }
            }
            if (params.isNotEmpty()) {
                append("?")
                append(params.joinToString("&"))
            }
        }
        api.get<EventTagsResponseDto>(path).tags
            .normalizedEventTags()
            .sortedWith(
                compareByDescending<EventTag> { tag -> tag.eventCount }
                    .thenBy { tag -> tag.name.lowercase() },
            )
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
                    val remote = preserveCachedDivisionState(fetchRemoteEventsByHost(hostId))

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

    override fun getEventTemplatesByHostFlow(hostId: String): Flow<Result<List<EventTemplateSummary>>> =
        flow {
            emit(runCatching { fetchRemoteEventTemplatesByHost(hostId) })
        }

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
        runCatching {
            val currentUser = userRepository.currentUser.value.getOrThrow()
            val eventAtCapacity = if (event.teamSignup) {
                false
            } else {
                isEventAtCapacity(
                    event = event,
                    preferredDivisionId = preferredDivisionId,
                    occurrence = occurrence,
                )
            }
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
                answers = answers.toRegistrationQuestionAnswerDtos(),
            )
            AnalyticsTracker.capture(
                AnalyticsEvent.EventRegistrationStarted,
                event.analyticsProperties() + mapOf(
                    "registration_type" to if (event.teamSignup) "free_agent" else "self",
                    "joined_waitlist" to eventAtCapacity.toString(),
                ),
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
                            answers = answers.toRegistrationQuestionAnswerDtos(),
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

            AnalyticsTracker.capture(
                AnalyticsEvent.EventRegistrationCompleted,
                event.analyticsProperties() + mapOf(
                    "registration_type" to "self",
                    "joined_waitlist" to (eventAtCapacity && response.requiresParentApproval != true).toString(),
                    "requires_parent_approval" to (response.requiresParentApproval == true).toString(),
                ),
            )
            SelfRegistrationResult(
                requiresParentApproval = response.requiresParentApproval == true,
                joinedWaitlist = eventAtCapacity && response.requiresParentApproval != true,
            )
        }

    override suspend fun addPlayerToEvent(
        event: Event,
        player: UserData,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<SelfRegistrationResult> =
        runCatching {
            val normalizedUserId = player.id.trim()
            if (normalizedUserId.isBlank()) {
                error("User id is required.")
            }
            val divisionPayload = resolveRegistrationDivisionPayload(
                event = event,
                preferredDivisionId = preferredDivisionId,
            )
            val response = api.post<EventParticipantsRequestDto, EventParticipantsResponseDto>(
                path = "api/events/${event.id}/participants",
                body = EventParticipantsRequestDto(
                    userId = normalizedUserId,
                    divisionId = divisionPayload.divisionId,
                    divisionTypeId = divisionPayload.divisionTypeId,
                    divisionTypeKey = divisionPayload.divisionTypeKey,
                    slotId = occurrence?.slotId,
                    occurrenceDate = occurrence?.occurrenceDate,
                ),
            )
            response.error?.takeIf(String::isNotBlank)?.let { error(it) }

            val updatedEvent = response.event?.toEventOrNull() ?: event
            syncEventParticipantsAfterMutation(updatedEvent, occurrence)

            SelfRegistrationResult(
                requiresParentApproval = response.requiresParentApproval == true,
                joinedWaitlist = false,
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
            AnalyticsTracker.capture(
                AnalyticsEvent.EventRegistrationStarted,
                event.analyticsProperties() + mapOf(
                    "registration_type" to "self",
                    "requires_parent_approval" to "true",
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
                AnalyticsTracker.capture(
                    AnalyticsEvent.EventRegistrationStarted,
                    mapOf(
                        "event_id" to normalizedEventId,
                        "registration_type" to "waitlist",
                        "requires_parent_approval" to "true",
                    ),
                )
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

                AnalyticsTracker.capture(
                    AnalyticsEvent.EventRegistrationCompleted,
                    mapOf(
                        "event_id" to normalizedEventId,
                        "registration_type" to "child",
                        "joined_waitlist" to (waitlistResponse.requiresParentApproval != true).toString(),
                        "requires_parent_approval" to (waitlistResponse.requiresParentApproval == true).toString(),
                    ),
                )
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

            AnalyticsTracker.capture(
                AnalyticsEvent.EventRegistrationStarted,
                mapOf(
                    "event_id" to normalizedEventId,
                    "registration_type" to "child",
                    "requires_parent_approval" to "true",
                ),
            )
            val response = api.post<EventChildRegistrationRequestDto, EventChildRegistrationResponseDto>(
                path = "api/events/$normalizedEventId/registrations/child",
                body = EventChildRegistrationRequestDto(
                    childId = normalizedChildUserId,
                    slotId = occurrence?.slotId,
                    occurrenceDate = occurrence?.occurrenceDate,
                ),
            )
            response.error?.takeIf(String::isNotBlank)?.let { error(it) }
            AnalyticsTracker.capture(
                AnalyticsEvent.EventRegistrationCompleted,
                mapOf(
                    "event_id" to normalizedEventId,
                    "registration_type" to "child",
                    "joined_waitlist" to "false",
                    "requires_parent_approval" to (response.requiresParentApproval == true).toString(),
                    "requires_child_email" to (response.consent?.requiresChildEmail == true).toString(),
                ),
            )
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
                answers = answers.toRegistrationQuestionAnswerDtos(),
            )
            AnalyticsTracker.capture(
                AnalyticsEvent.EventRegistrationStarted,
                event.analyticsProperties() + mapOf(
                    "registration_type" to "team",
                    "team_id" to team.id,
                ),
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
            AnalyticsTracker.capture(
                AnalyticsEvent.EventRegistrationCompleted,
                event.analyticsProperties() + mapOf(
                    "registration_type" to "team",
                    "joined_waitlist" to updated.waitList.contains(team.id).toString(),
                ),
            )
        }

    override suspend fun moveTeamParticipantDivision(
        event: Event,
        team: Team,
        preferredDivisionId: String,
        occurrence: EventOccurrenceSelection?,
    ): Result<EventParticipantsSyncResult> =
        runCatching {
            val normalizedTeamId = team.id.trim().takeIf(String::isNotBlank)
                ?: error("Team id is required.")
            val divisionPreference = preferredDivisionId.trim().takeIf(String::isNotBlank)
                ?: error("Division id is required.")
            val divisionPayload = resolveRegistrationDivisionPayload(
                event = event,
                preferredDivisionId = divisionPreference,
            )
            val updated = api.post<EventParticipantsRequestDto, EventResponseDto>(
                path = "api/events/${event.id}/participants",
                body = EventParticipantsRequestDto(
                    teamId = normalizedTeamId,
                    divisionId = divisionPayload.divisionId,
                    divisionTypeId = divisionPayload.divisionTypeId,
                    divisionTypeKey = divisionPayload.divisionTypeKey,
                    slotId = occurrence?.slotId,
                    occurrenceDate = occurrence?.occurrenceDate,
                ),
            ).event?.toEventOrNull() ?: event

            syncEventParticipantsAfterMutation(updated, occurrence)
                ?: error("Failed to refresh event participants after moving team division.")
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
        val events = preserveCachedDivisionState(response.events.mapNotNull { it.toEventOrNull() })
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
        preloadedTeams: List<Team> = emptyList(),
    ) {
        if (event.eventType == EventType.WEEKLY_EVENT && !allowWeeklyParticipantRoster) {
            return
        }
        val teamIds = event.teamIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
        val teams = if (teamIds.isNotEmpty()) {
            val preloadedById = preloadedTeams
                .mapNotNull { team ->
                    team.id.trim()
                        .takeIf(String::isNotBlank)
                        ?.lowercase()
                        ?.let { teamId -> teamId to team }
                }
                .toMap()
            val missingTeamIds = teamIds.filter { teamId -> preloadedById[teamId.lowercase()] == null }
            val fetchedTeams = if (missingTeamIds.isNotEmpty()) {
                teamRepository.getTeams(missingTeamIds).getOrThrow()
            } else {
                emptyList()
            }
            val teamsById = (preloadedTeams + fetchedTeams)
                .mapNotNull { team ->
                    team.id.trim()
                        .takeIf(String::isNotBlank)
                        ?.lowercase()
                        ?.let { teamId -> teamId to team }
                }
                .toMap()
            teamIds.mapNotNull { teamId -> teamsById[teamId.lowercase()] }
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
        databaseService.getEventParticipantManagementDao.clearAll()
        databaseService.getEventComplianceDao.clearAll()
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

        val normalizedDivisionIds = event.divisions.normalizeDivisionIdentifiers()
        val divisionDetails = normalizedDivisionIds.mapNotNull { divisionId ->
            event.divisionDetails.firstOrNull { detail ->
                detail.id.normalizeDivisionIdentifier() == divisionId
            }
        }
        if (divisionDetails.isEmpty()) {
            return null
        }

        return if (!normalizedPreferredDivision.isNullOrBlank()) {
            divisionDetails.firstOrNull { detail ->
                detail.id.normalizeDivisionIdentifier() == normalizedPreferredDivision
            }
                ?: divisionDetails.firstOrNull()
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

        val divisionId = selectedDivision.id.normalizeDivisionIdentifier().ifEmpty { null }
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

        val selectedDivision = if (event.divisions.isEmpty()) {
            null
        } else {
            resolveSelectedDivisionDetail(event, preferredDivisionId)
        }
        val missingCapacityMessage =
            "Set ${if (event.teamSignup) "max teams" else "max participants"} for this division before joining."
        val maxParticipants = participantSnapshot?.participantCapacity?.takeIf { value -> value > 0 }
            ?: if (event.divisions.isEmpty()) {
                event.maxParticipants.takeIf { value -> value > 0 }
            } else {
                selectedDivision?.maxParticipants?.takeIf { value -> value > 0 }
            }
            ?: throw IllegalStateException(missingCapacityMessage)

        val participantCount = participantSnapshot?.participantCount ?: if (event.teamSignup) {
            val teamIds = event.teamIds
                .map(String::trim)
                .filter(String::isNotBlank)
            if (teamIds.isEmpty()) {
                0
            } else {
                val teams = teamRepository.getTeamsWithPlayers(teamIds).getOrElse { emptyList() }
                val divisionId = selectedDivision?.id?.normalizeDivisionIdentifier()?.takeIf(String::isNotBlank)
                val shouldFilterDivision = event.divisions.isNotEmpty() && divisionId != null
                teams.count { teamWithPlayers ->
                    val team = teamWithPlayers.team
                    val teamDivision = team.division.normalizeDivisionIdentifier()
                    !team.isPlaceholderSlot(event.eventType) && (
                        !shouldFilterDivision ||
                            (divisionId != null && teamDivision == divisionId)
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
