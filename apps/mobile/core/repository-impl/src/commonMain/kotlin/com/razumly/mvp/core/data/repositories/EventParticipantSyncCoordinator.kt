package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.BillDiscountSummary
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventParticipantManagementCacheEntry
import com.razumly.mvp.core.data.dataTypes.EventTeamComplianceCacheEntry
import com.razumly.mvp.core.data.dataTypes.EventUserComplianceCacheEntry
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.network.dto.EventComplianceUserSummaryDto
import com.razumly.mvp.core.network.dto.EventParticipantDivisionWarningDto
import com.razumly.mvp.core.network.dto.EventParticipantRegistrationSectionsDto
import com.razumly.mvp.core.network.dto.EventParticipantsSnapshotResponseDto
import com.razumly.mvp.core.network.dto.EventTeamComplianceSummaryDto
import com.razumly.mvp.core.network.dto.toUserDataOrNull
import com.razumly.mvp.core.util.jsonMVP
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

private const val MANAGEMENT_SECTION_TEAM = "TEAM"
private const val MANAGEMENT_SECTION_USER = "USER"
private const val MANAGEMENT_SECTION_CHILD = "CHILD"
private const val MANAGEMENT_SECTION_WAITLIST = "WAITLIST"
private const val MANAGEMENT_SECTION_FREE_AGENT = "FREE_AGENT"
private const val STANDALONE_COMPLIANCE_PARENT_TEAM_ID = ""

private data class EventParticipantCacheScope(
    val eventId: String,
    val cacheSlotId: String,
    val cacheOccurrenceDate: String,
)

private fun eventParticipantCacheScope(
    eventId: String,
    occurrence: EventOccurrenceSelection?,
): EventParticipantCacheScope = EventParticipantCacheScope(
    eventId = eventId.trim(),
    cacheSlotId = occurrence?.slotId?.trim().orEmpty(),
    cacheOccurrenceDate = occurrence?.occurrenceDate?.trim().orEmpty(),
)

private fun EventParticipantManagementEntry.toCacheEntry(
    scope: EventParticipantCacheScope,
    section: String,
    sortOrder: Int,
): EventParticipantManagementCacheEntry = EventParticipantManagementCacheEntry(
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

private fun EventParticipantManagementCacheEntry.toManagementEntry(): EventParticipantManagementEntry =
    EventParticipantManagementEntry(
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

private fun EventParticipantManagementSnapshot.toCacheEntries(
    scope: EventParticipantCacheScope,
): List<EventParticipantManagementCacheEntry> = buildList {
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
): EventTeamComplianceCacheEntry = EventTeamComplianceCacheEntry(
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

private fun EventComplianceUserSummary.toCacheEntry(
    scope: EventParticipantCacheScope,
    parentTeamId: String = STANDALONE_COMPLIANCE_PARENT_TEAM_ID,
): EventUserComplianceCacheEntry = EventUserComplianceCacheEntry(
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

private fun EventTeamComplianceCacheEntry.toTeamComplianceSummary(
    users: List<EventComplianceUserSummary>,
): EventTeamComplianceSummary = EventTeamComplianceSummary(
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

private fun EventUserComplianceCacheEntry.toComplianceUserSummary(): EventComplianceUserSummary =
    EventComplianceUserSummary(
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

/** Owns participant, relation, management, and compliance synchronization for events. */
internal class EventParticipantSyncCoordinator(
    private val databaseService: DatabaseService,
    private val detailRemoteGateway: EventDetailRemoteGateway,
    private val roomStore: EventRoomStore,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
) {
    suspend fun syncParticipants(
        event: Event,
        occurrence: EventOccurrenceSelection?,
    ): EventParticipantsSyncResult {
        val snapshot = detailRemoteGateway.fetchParticipantsSnapshot(event.id, occurrence)
        return mergeParticipantsSnapshot(
            baseEvent = event,
            snapshot = snapshot,
        )
    }

    suspend fun mergeParticipantsSnapshot(
        baseEvent: Event,
        snapshot: EventParticipantsSnapshotResponseDto,
    ): EventParticipantsSyncResult {
        snapshot.error?.takeIf(String::isNotBlank)?.let { error(it) }
        val divisionWarnings = snapshot.divisionWarnings
            .mapNotNull(EventParticipantDivisionWarningDto::toDomainWarningOrNull)

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

    suspend fun persistDetailCaches(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
        manage: Boolean,
        registrations: EventParticipantRegistrationSectionsDto?,
        teamCompliance: List<EventTeamComplianceSummaryDto>?,
        userCompliance: List<EventComplianceUserSummaryDto>?,
    ) {
        val scope = eventParticipantCacheScope(eventId, occurrence)
        if (manage && registrations != null) {
            replaceParticipantManagementSnapshot(scope, registrations)
        }
        teamCompliance
            ?.mapNotNull(EventTeamComplianceSummaryDto::toEventTeamComplianceSummaryOrNull)
            ?.let { summaries -> replaceTeamComplianceSummaries(scope, summaries) }
        userCompliance
            ?.mapNotNull(EventComplianceUserSummaryDto::toEventComplianceUserSummaryOrNull)
            ?.let { summaries -> replaceStandaloneUserComplianceSummaries(scope, summaries) }
    }

    suspend fun getParticipantsSummary(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): EventParticipantsSummary {
        val snapshot = detailRemoteGateway.fetchParticipantsSnapshot(eventId, occurrence, manage = false)
        snapshot.error?.takeIf(String::isNotBlank)?.let { error(it) }
        return EventParticipantsSummary(
            participantCount = snapshot.participantCount ?: 0,
            participantCapacity = snapshot.participantCapacity,
            weeklySelectionRequired = snapshot.weeklySelectionRequired == true,
        )
    }

    suspend fun getManagementSnapshot(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): EventParticipantManagementSnapshot {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        val scope = eventParticipantCacheScope(normalizedEventId, occurrence)
        val snapshot = detailRemoteGateway.fetchParticipantsSnapshot(
            eventId = normalizedEventId,
            occurrence = occurrence,
            manage = true,
        )
        val baseEvent = roomStore.getEvent(normalizedEventId)
            ?: snapshot.event?.toEventOrNull()
            ?: detailRemoteGateway.fetchEvent(normalizedEventId)
        mergeParticipantsSnapshot(
            baseEvent = baseEvent,
            snapshot = snapshot,
        )
        return replaceParticipantManagementSnapshot(scope, snapshot.registrations)
    }

    fun observeManagementSnapshot(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Flow<EventParticipantManagementSnapshot> {
        val normalizedEventId = eventId.trim()
        if (normalizedEventId.isBlank()) return flowOf(EventParticipantManagementSnapshot())
        val scope = eventParticipantCacheScope(normalizedEventId, occurrence)
        return databaseService.getEventParticipantManagementDao.observeEntries(
            eventId = scope.eventId,
            cacheSlotId = scope.cacheSlotId,
            cacheOccurrenceDate = scope.cacheOccurrenceDate,
        ).map { entries -> entries.toManagementSnapshotFromCache() }
    }

    suspend fun getTeamCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): List<EventTeamComplianceSummary> {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        val scope = eventParticipantCacheScope(normalizedEventId, occurrence)
        val summaries = detailRemoteGateway.fetchTeamCompliance(
            eventId = normalizedEventId,
            occurrence = occurrence,
        ).teams.mapNotNull(EventTeamComplianceSummaryDto::toEventTeamComplianceSummaryOrNull)
        return replaceTeamComplianceSummaries(scope, summaries)
    }

    fun observeTeamCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Flow<List<EventTeamComplianceSummary>> {
        val normalizedEventId = eventId.trim()
        if (normalizedEventId.isBlank()) return flowOf(emptyList())
        val scope = eventParticipantCacheScope(normalizedEventId, occurrence)
        return combine(
            databaseService.getEventComplianceDao.observeTeamSummaries(
                eventId = scope.eventId,
                cacheSlotId = scope.cacheSlotId,
                cacheOccurrenceDate = scope.cacheOccurrenceDate,
            ),
            databaseService.getEventComplianceDao.observeTeamUserSummaries(
                eventId = scope.eventId,
                cacheSlotId = scope.cacheSlotId,
                cacheOccurrenceDate = scope.cacheOccurrenceDate,
            ),
        ) { teamRows, userRows ->
            teamComplianceFromCache(teamRows, userRows)
        }
    }

    suspend fun getUserCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): List<EventComplianceUserSummary> {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        val scope = eventParticipantCacheScope(normalizedEventId, occurrence)
        val summaries = detailRemoteGateway.fetchUserCompliance(
            eventId = normalizedEventId,
            occurrence = occurrence,
        ).users.mapNotNull(EventComplianceUserSummaryDto::toEventComplianceUserSummaryOrNull)
        return replaceStandaloneUserComplianceSummaries(scope, summaries)
    }

    fun observeUserCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): Flow<List<EventComplianceUserSummary>> {
        val normalizedEventId = eventId.trim()
        if (normalizedEventId.isBlank()) return flowOf(emptyList())
        val scope = eventParticipantCacheScope(normalizedEventId, occurrence)
        return databaseService.getEventComplianceDao.observeStandaloneUserSummaries(
            eventId = scope.eventId,
            cacheSlotId = scope.cacheSlotId,
            cacheOccurrenceDate = scope.cacheOccurrenceDate,
        ).map { rows -> rows.map(EventUserComplianceCacheEntry::toComplianceUserSummary) }
    }

    suspend fun persistEventRelations(
        event: Event,
        allowWeeklyParticipantRoster: Boolean = false,
        preloadedTeams: List<Team> = emptyList(),
    ) {
        if (event.eventType == EventType.WEEKLY_EVENT && !allowWeeklyParticipantRoster) return
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

    private suspend fun insertEventCrossReferences(
        eventId: String,
        players: List<UserData>,
        teams: List<Team>,
    ) {
        databaseService.getEventDao.deleteEventCrossRefs(eventId)
        databaseService.getEventDao.upsertEventTeamCrossRefs(
            teams.map { EventTeamCrossRef(it.id, eventId) },
        )
        databaseService.getUserDataDao.upsertUserEventCrossRefs(
            players.map { EventUserCrossRef(it.id, eventId) },
        )
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
            },
        )
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

    private fun normalizedParticipantIds(ids: List<String>): List<String> = ids
        .map(String::trim)
        .filter(String::isNotBlank)
        .distinct()
}
