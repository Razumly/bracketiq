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
import com.razumly.mvp.core.network.dto.CreateEventRequestDto
import com.razumly.mvp.core.network.dto.CreateEventTemplateRequestDto
import com.razumly.mvp.core.network.dto.CurrentUserEventRegistrationsResponseDto
import com.razumly.mvp.core.network.dto.EventApiDto
import com.razumly.mvp.core.network.dto.EventChildRegistrationRequestDto
import com.razumly.mvp.core.network.dto.EventChildRegistrationResponseDto
import com.razumly.mvp.core.network.dto.EventComplianceUserSummaryDto
import com.razumly.mvp.core.network.dto.EventDetailBootstrapResponseDto
import com.razumly.mvp.core.network.dto.EventParticipantDivisionWarningDto
import com.razumly.mvp.core.network.dto.EventParticipantRegistrationSectionsDto
import com.razumly.mvp.core.network.dto.EventParticipantsSnapshotResponseDto
import com.razumly.mvp.core.network.dto.EventParticipantsRequestDto
import com.razumly.mvp.core.network.dto.EventParticipantsResponseDto
import com.razumly.mvp.core.network.dto.EventResponseDto
import com.razumly.mvp.core.network.dto.EventSearchFiltersDto
import com.razumly.mvp.core.network.dto.EventSearchRequestDto
import com.razumly.mvp.core.network.dto.EventSearchUserLocationDto
import com.razumly.mvp.core.network.dto.EventStaffPendingInviteDto
import com.razumly.mvp.core.network.dto.EventStaffPutRequestDto
import com.razumly.mvp.core.network.dto.EventStaffStateResponseDto
import com.razumly.mvp.core.network.dto.EventTagsResponseDto
import com.razumly.mvp.core.network.dto.EventTeamComplianceResponseDto
import com.razumly.mvp.core.network.dto.EventTeamComplianceSummaryDto
import com.razumly.mvp.core.network.dto.EventTemplateResponseDto
import com.razumly.mvp.core.network.dto.EventTemplatesResponseDto
import com.razumly.mvp.core.network.dto.EventUserComplianceResponseDto
import com.razumly.mvp.core.network.dto.EventsResponseDto
import com.razumly.mvp.core.network.dto.ProfileScheduleResponseDto
import com.razumly.mvp.core.network.dto.ProfileScheduleNextActionResponseDto
import com.razumly.mvp.core.network.dto.ScheduleEventRequestDto
import com.razumly.mvp.core.network.dto.ScheduleEventResponseDto
import com.razumly.mvp.core.network.dto.SeedEventTemplateRequestDto
import com.razumly.mvp.core.network.dto.StandingsConfirmRequestDto
import com.razumly.mvp.core.network.dto.StandingsConfirmResponseDto
import com.razumly.mvp.core.network.dto.StandingsResponseDto
import com.razumly.mvp.core.network.dto.UpdateEventRequestDto
import com.razumly.mvp.core.network.dto.toUserDataOrNull
import com.razumly.mvp.core.network.dto.hasMoreEventRows
import com.razumly.mvp.core.network.dto.pageContinuationOrThrow
import com.razumly.mvp.core.network.dto.toEventOrThrow
import com.razumly.mvp.core.network.dto.toEventsOrThrow
import com.razumly.mvp.core.network.dto.toUpdateDto
import io.github.aakira.napier.Napier
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
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
import kotlin.time.Clock
import kotlin.time.Duration.Companion.days
import kotlin.time.Instant



private const val MANAGEMENT_SECTION_TEAM = "TEAM"
private const val MANAGEMENT_SECTION_USER = "USER"
private const val MANAGEMENT_SECTION_CHILD = "CHILD"
private const val MANAGEMENT_SECTION_WAITLIST = "WAITLIST"
private const val MANAGEMENT_SECTION_FREE_AGENT = "FREE_AGENT"
private const val STANDALONE_COMPLIANCE_PARENT_TEAM_ID = ""
private const val KILOMETERS_PER_MILE = 1.60934
private const val MY_SCHEDULE_PAGE_SIZE = 200
private const val MY_SCHEDULE_MAX_PAGE_COUNT = 100
private const val MY_SCHEDULE_PAST_DAYS = 90
private const val MY_SCHEDULE_FUTURE_DAYS = 366

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
        return dto.toEventOrThrow("Event $eventId response")
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

    /**
     * The participant endpoint intentionally selects a narrow event projection and therefore
     * cannot authoritatively describe divisions. Keep the known division configuration only for
     * that explicitly partial response. Full event/list/search responses are canonical and must
     * always replace cache state so server-side deletions converge locally.
     */
    private fun Event.withCachedDivisionStateForPartialParticipantSnapshot(cached: Event?): Event {
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

    private suspend fun fetchRemoteEventsByHost(hostId: String): List<Event> {
        val encodedHostId = hostId.encodeURLQueryComponent()
        val res = api.get<EventsResponseDto>("api/events?hostId=$encodedHostId&limit=200")
        return res.events.toEventsOrThrow("Hosted events response")
    }

    private suspend fun fetchRemoteEventsPageByHost(
        hostId: String,
        limit: Int,
        offset: Int,
    ): HostEventPage {
        val encodedHostId = hostId.encodeURLQueryComponent()
        val safeLimit = limit.coerceIn(1, 500)
        val safeOffset = offset.coerceAtLeast(0)
        val response = api.get<EventsResponseDto>(
            "api/events?hostId=$encodedHostId&limit=$safeLimit&offset=$safeOffset",
        )
        val events = response.events.toEventsOrThrow("Hosted events page")
        val continuation = response.pageContinuationOrThrow("Hosted events page", safeOffset)
        return HostEventPage(
            events = events,
            nextOffset = continuation.nextOffset,
            hasMore = continuation.hasMore,
        )
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
        return res.events.toEventsOrThrow("Organization events response")
    }

    private suspend fun fetchRemoteEventsPageByOrganization(
        organizationId: String,
        limit: Int,
        offset: Int,
    ): OrganizationEventPage {
        val encodedOrganizationId = organizationId.encodeURLQueryComponent()
        val safeLimit = limit.coerceIn(1, 500)
        val safeOffset = offset.coerceAtLeast(0)
        val response = api.get<EventsResponseDto>(
            "api/events?organizationId=$encodedOrganizationId&limit=$safeLimit&offset=$safeOffset",
        )
        val events = response.events.toEventsOrThrow("Organization events page")
        val continuation = response.pageContinuationOrThrow("Organization events page", safeOffset)
        return OrganizationEventPage(
            events = events,
            nextOffset = continuation.nextOffset,
            hasMore = continuation.hasMore,
        )
    }

    private suspend fun fetchRemoteEventsByIds(eventIds: List<String>): List<Event> {
        val idChunks = collectionIdChunks(eventIds)
        val ids = idChunks.flatten()
        if (ids.isEmpty()) return emptyList()

        val eventsById = LinkedHashMap<String, Event>()
        for (idChunk in idChunks) {
            val encodedIds = idChunk.joinToString(",").encodeURLQueryComponent()
            val res = api.get<EventsResponseDto>("api/events?ids=$encodedIds&limit=${idChunk.size}")
            res.events.toEventsOrThrow("Event id batch response").forEach { event ->
                eventsById[event.id] = event
            }
        }
        return ids.mapNotNull(eventsById::get)
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
            ?.withCachedDivisionStateForPartialParticipantSnapshot(baseEvent)
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
            val event = try {
                fetchRemoteEvent(normalizedEventId)
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
            ?.mapNotNull(EventTeamComplianceSummaryDto::toEventTeamComplianceSummaryOrNull)
            ?.let { summaries -> replaceTeamComplianceSummaries(cacheScope, summaries) }
        bootstrap.userCompliance?.users
            ?.mapNotNull(EventComplianceUserSummaryDto::toEventComplianceUserSummaryOrNull)
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
            staffRevision = bootstrap.staffRevision?.trim()?.takeIf(String::isNotBlank),
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
        ).teams.mapNotNull(EventTeamComplianceSummaryDto::toEventTeamComplianceSummaryOrNull)
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
        ).users.mapNotNull(EventComplianceUserSummaryDto::toEventComplianceUserSummaryOrNull)
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
        syncCurrentUserRegistrationCache().getOrNull()
        return syncEventParticipants(event, occurrence)
            .onFailure {
                databaseService.getEventDao.upsertEvent(event)
                persistEventRelations(event)
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

    override suspend fun getOrganizationEventsPage(
        organizationId: String,
        limit: Int,
        offset: Int,
    ): Result<OrganizationEventPage> {
        val normalizedOrganizationId = organizationId.trim()
        if (normalizedOrganizationId.isEmpty()) {
            return Result.success(
                OrganizationEventPage(
                    events = emptyList(),
                    nextOffset = 0,
                    hasMore = false,
                ),
            )
        }

        return runCatching {
            val page = fetchRemoteEventsPageByOrganization(
                organizationId = normalizedOrganizationId,
                limit = limit,
                offset = offset,
            )
            if (page.events.isNotEmpty()) {
                databaseService.getEventDao.upsertEvents(page.events)
            }
            page
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
                persistEventRelations(event)
            } else {
                cacheUpdatedEventBestEffort(event)
            }
        }, onReturn = { event ->
            event
        })

    private suspend fun cacheEventStaffStateBestEffort(state: EventStaffState) {
        runCatching {
            databaseService.getEventDao.upsertEvent(state.event)
            persistEventRelations(state.event)
        }.onFailure { error ->
            Napier.w("Failed to cache event staff state for ${state.event.id}.", error)
        }
    }

    private suspend fun cacheUpdatedEventBestEffort(event: Event) {
        runCatching {
            databaseService.getEventDao.upsertEvent(event)
            persistEventRelations(event)
        }.onFailure { error ->
            Napier.w("Failed to cache staff-preserving event update for ${event.id}.", error)
        }
    }

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

            val events = filterHiddenEvents(
                res.events.toEventsOrThrow("Event bounds search response"),
                userRepository.currentUser.value.getOrNull(),
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
                res.hasMoreEventRows(normalizedLimit),
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

            val events = filterHiddenEvents(
                res.events.toEventsOrThrow("Event search response"),
                userRepository.currentUser.value.getOrNull(),
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
                res.hasMoreEventRows(normalizedLimit),
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

    override suspend fun getHostEventsPage(
        hostId: String,
        limit: Int,
        offset: Int,
    ): Result<HostEventPage> {
        val normalizedHostId = hostId.trim()
        if (normalizedHostId.isEmpty()) {
            return Result.success(
                HostEventPage(
                    events = emptyList(),
                    nextOffset = 0,
                    hasMore = false,
                ),
            )
        }

        return runCatching {
            val page = fetchRemoteEventsPageByHost(
                hostId = normalizedHostId,
                limit = limit,
                offset = offset,
            )
            if (page.events.isNotEmpty()) {
                databaseService.getEventDao.upsertEvents(page.events)
            }
            page
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
                answers = answers.toEventRegistrationQuestionAnswerDtos(),
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
                            answers = answers.toEventRegistrationQuestionAnswerDtos(),
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
                answers = answers.toEventRegistrationQuestionAnswerDtos(),
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
