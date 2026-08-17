package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.EventComplianceUserSummary
import com.razumly.mvp.core.data.repositories.EventDetailSyncResult
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventParticipantManagementSnapshot
import com.razumly.mvp.core.data.repositories.EventParticipantsSummary
import com.razumly.mvp.core.data.repositories.EventParticipantsSyncResult
import com.razumly.mvp.core.data.repositories.EventTeamComplianceSummary
import com.razumly.mvp.core.util.ErrorMessage
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

internal data class EventParticipantBootstrapOperations(
    val getEvent: suspend (String) -> Result<Event>,
    val syncCurrentUserRegistrationCacheForEvent: suspend (String) -> Result<Unit>,
    val syncEventParticipants: suspend (
        event: Event,
        occurrence: EventOccurrenceSelection?,
    ) -> Result<EventParticipantsSyncResult>,
    val syncEventDetail: suspend (
        event: Event,
        occurrence: EventOccurrenceSelection?,
        manage: Boolean,
    ) -> Result<EventDetailSyncResult>,
    val refreshMatches: suspend (String) -> Result<List<MatchMVP>>,
    val observeParticipantManagementSnapshot: (
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ) -> Flow<EventParticipantManagementSnapshot>,
    val observeTeamCompliance: (
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ) -> Flow<List<EventTeamComplianceSummary>>,
    val observeUserCompliance: (
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ) -> Flow<List<EventComplianceUserSummary>>,
    val loadParticipantManagementSnapshot: suspend (
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ) -> Result<EventParticipantManagementSnapshot>,
    val loadTeamCompliance: suspend (
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ) -> Result<List<EventTeamComplianceSummary>>,
    val loadUserCompliance: suspend (
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ) -> Result<List<EventComplianceUserSummary>>,
    val getEventParticipantsSummary: suspend (
        eventId: String,
        occurrence: EventOccurrenceSelection,
    ) -> Result<EventParticipantsSummary>,
)

internal data class EventParticipantBootstrapEffects(
    val canManageParticipantData: (Event) -> Boolean,
    val refreshCurrentUserMembershipState: suspend (Event) -> Unit,
    val applyBootstrapSyncResult: (EventDetailSyncResult) -> Unit,
    val replaceStaffInvites: (List<Invite>, String?) -> Unit,
    val setMatchesLoading: (Boolean) -> Unit,
    val showDetails: () -> Unit,
    val setError: (ErrorMessage) -> Unit,
    val logWarning: (String, Throwable) -> Unit = { message, throwable ->
        Napier.w(message, throwable)
    },
)

/**
 * Owns participant hydration and bootstrap execution while the component remains the
 * lifecycle collector and public-interface boundary. Canonical UI state continues to
 * come from Room through [participantLocalStateFlow].
 */
@OptIn(ExperimentalCoroutinesApi::class)
internal class EventParticipantBootstrapCoordinator(
    private val selectedEvent: StateFlow<Event>,
    private val participantManagementCoordinator: EventParticipantManagementCoordinator,
    private val weeklyOccurrenceCoordinator: EventWeeklyOccurrenceCoordinator,
    private val operations: EventParticipantBootstrapOperations,
    private val effects: EventParticipantBootstrapEffects,
    private val scope: CoroutineScope,
    private val detailHydrationCoordinator: EventDetailHydrationCoordinator = EventDetailHydrationCoordinator(),
) {
    private var eventDetailHydrationJob: Job? = null
    private var weeklyOccurrenceSummaryPrefetchJob: Job? = null

    fun participantLocalStateFlow(): Flow<ParticipantManagementLocalState> =
        combine(
            selectedEvent,
            weeklyOccurrenceCoordinator.selectedWeeklyOccurrence,
        ) { event, occurrenceState ->
            participantManagementRoomTarget(
                event = event,
                occurrence = occurrenceState.toOccurrenceSelection(),
            )
        }
            .distinctUntilChanged()
            .flatMapLatest { target ->
                if (target == null) {
                    flowOf(ParticipantManagementLocalState())
                } else {
                    val occurrence = target.toOccurrence()
                    val snapshotFlow = operations.observeParticipantManagementSnapshot(
                        target.eventId,
                        occurrence,
                    )
                    val complianceFlow = if (target.teamSignup) {
                        operations.observeTeamCompliance(target.eventId, occurrence).map { summaries ->
                            ParticipantManagementLocalState(
                                teamSummaries = summaries.associateBy(EventTeamComplianceSummary::teamId),
                            )
                        }
                    } else {
                        operations.observeUserCompliance(target.eventId, occurrence).map { summaries ->
                            ParticipantManagementLocalState(
                                userSummaries = summaries.associateBy(EventComplianceUserSummary::userId),
                            )
                        }
                    }
                    combine(snapshotFlow, complianceFlow) { snapshot, compliance ->
                        compliance.copy(snapshot = snapshot)
                    }
                }
            }

    fun managedBootstrapTargetFlow(
        currentUser: StateFlow<UserData>,
        eventOrganization: StateFlow<Organization?>,
        canManage: (Event, UserData, Organization?) -> Boolean,
    ): Flow<ParticipantManagementRoomTarget?> =
        combine(
            selectedEvent,
            currentUser,
            eventOrganization,
            weeklyOccurrenceCoordinator.selectedWeeklyOccurrence,
        ) { event, user, organization, occurrenceState ->
            participantManagementRoomTarget(
                event = event,
                occurrence = occurrenceState.toOccurrenceSelection(),
            )?.takeIf { canManage(event, user, organization) }
        }.distinctUntilChanged()

    fun applyLocalState(localState: ParticipantManagementLocalState) {
        participantManagementCoordinator.applyLocalState(localState)
    }

    suspend fun refreshManagedBootstrap(target: ParticipantManagementRoomTarget?) {
        if (!participantManagementCoordinator.beginManagedDetailBootstrap(target)) return
        val bootstrapTarget = target ?: return
        try {
            operations.syncEventDetail(
                selectedEvent.value,
                bootstrapTarget.toOccurrence(),
                true,
            ).onSuccess(::applyEventDetailSyncResult)
                .onFailure { throwable ->
                    participantManagementCoordinator.clearManagedBootstrapRequestIfCurrent(bootstrapTarget)
                    effects.logWarning("Failed to refresh event detail management bootstrap.", throwable)
                }
        } finally {
            participantManagementCoordinator.finishManagedDetailBootstrap()
        }
    }

    suspend fun onWeeklyOccurrenceChanged(selection: SelectedWeeklyOccurrenceState?) {
        val event = selectedEvent.value
        weeklyOccurrenceCoordinator.updateSelectedSummaryFromCache(
            isWeeklyParent = isWeeklyParentEvent(event),
            selection = selection,
        )
        if (!isWeeklyParentEvent(event)) return

        effects.refreshCurrentUserMembershipState(event)
        syncSelectedWeeklyOccurrenceParticipants(
            event = event,
            reportErrors = false,
        )
    }

    fun onSelectedEventChanged(isWeeklyParent: Boolean) {
        weeklyOccurrenceSummaryPrefetchJob?.cancel()
        weeklyOccurrenceCoordinator.handleSelectedEventChanged(isWeeklyParent)
    }

    fun applyParticipantSyncResult(result: EventParticipantsSyncResult) {
        detailHydrationCoordinator.applyParticipantSyncResult(
            result = result,
            isWeeklyParentEvent = ::isWeeklyParentEvent,
            replaceParticipantDivisionWarnings = participantManagementCoordinator::replaceParticipantDivisionWarnings,
            applyOverviewParticipantSummary = weeklyOccurrenceCoordinator::applyOverviewParticipantSummary,
        )
    }

    fun applyEventDetailSyncResult(result: EventDetailSyncResult) {
        detailHydrationCoordinator.applyEventDetailSyncResult(
            result = result,
            applyParticipantSyncResult = ::applyParticipantSyncResult,
            applyBootstrapSyncResult = effects.applyBootstrapSyncResult,
            replaceStaffInvites = { syncResult ->
                effects.replaceStaffInvites(syncResult.staffInvites, syncResult.staffRevision)
            },
        )
    }

    suspend fun syncSelectedWeeklyOccurrenceParticipants(
        event: Event = selectedEvent.value,
        reportErrors: Boolean = true,
    ) {
        val occurrence = weeklyOccurrenceCoordinator.currentSelection()
        val manage = effects.canManageParticipantData(event)
        detailHydrationCoordinator.syncSelectedWeeklyOccurrenceParticipants(
            event = event,
            occurrence = occurrence,
            isWeeklyParentEvent = ::isWeeklyParentEvent,
            manage = manage,
            reportErrors = reportErrors,
            clearSelectedWeeklyOccurrenceSummary = weeklyOccurrenceCoordinator::clearSelectedWeeklyOccurrenceSummary,
            markManagedBootstrapRequested = ::markManagedBootstrapRequested,
            syncEventDetail = operations.syncEventDetail,
            applyEventDetailSyncResult = ::applyEventDetailSyncResult,
            applySelectedOccurrenceParticipantSummary = weeklyOccurrenceCoordinator::applySelectedOccurrenceParticipantSummary,
            clearManagedBootstrapRequestIfCurrent = ::clearManagedBootstrapRequestIfCurrent,
            setError = effects.setError,
            logWarning = effects.logWarning,
        )
    }

    suspend fun refreshSelectedWeeklyOccurrenceSummaryIfNeeded(
        event: Event = selectedEvent.value,
    ) {
        if (isWeeklyParentEvent(event) && weeklyOccurrenceCoordinator.currentSelection() != null) {
            syncSelectedWeeklyOccurrenceParticipants(
                event = event,
                reportErrors = false,
            )
        }
    }

    suspend fun refreshParticipantManagementSnapshotIfNeeded(
        event: Event = selectedEvent.value,
    ) {
        val target = participantManagementRoomTarget(
            event = event,
            occurrence = weeklyOccurrenceCoordinator.currentSelection(),
        ) ?: return
        if (!effects.canManageParticipantData(event)) return

        participantManagementCoordinator.refreshParticipantManagementSnapshot(
            eventId = target.eventId,
            occurrence = target.toOccurrence(),
            reportErrors = false,
            loadSnapshot = operations.loadParticipantManagementSnapshot,
        )?.let(effects.setError)
    }

    suspend fun refreshParticipantComplianceIfNeeded(
        event: Event = selectedEvent.value,
    ) {
        val target = participantManagementRoomTarget(
            event = event,
            occurrence = weeklyOccurrenceCoordinator.currentSelection(),
        ) ?: return
        if (!effects.canManageParticipantData(event)) return

        participantManagementCoordinator.refreshParticipantComplianceSummaries(
            eventId = target.eventId,
            occurrence = target.toOccurrence(),
            teamSignup = target.teamSignup,
            reportErrors = false,
            loadTeamCompliance = operations.loadTeamCompliance,
            loadUserCompliance = operations.loadUserCompliance,
        )?.let(effects.setError)
    }

    suspend fun refreshEventAfterParticipantMutation(
        eventId: String = selectedEvent.value.id,
        warningMessage: String = "Failed to refresh event after participant update.",
    ) {
        detailHydrationCoordinator.refreshEventAfterParticipantMutation(
            eventId = eventId,
            occurrence = weeklyOccurrenceCoordinator.currentSelection(),
            warningMessage = warningMessage,
            getEvent = operations.getEvent,
            syncEventParticipants = operations.syncEventParticipants,
            applyParticipantSyncResult = ::applyParticipantSyncResult,
            refreshSelectedWeeklyOccurrenceSummaryIfNeeded = ::refreshSelectedWeeklyOccurrenceSummaryIfNeeded,
            refreshParticipantManagementSnapshotIfNeeded = ::refreshParticipantManagementSnapshotIfNeeded,
            refreshParticipantComplianceIfNeeded = ::refreshParticipantComplianceIfNeeded,
            logWarning = effects.logWarning,
        )
    }

    fun hydrateMobileEventDetail(
        showDetailsOnSuccess: Boolean,
        showLoading: Boolean,
        reportErrors: Boolean,
    ) {
        val event = selectedEvent.value
        val request = detailHydrationCoordinator.beginMobileHydration(
            event = event,
            showDetailsOnSuccess = showDetailsOnSuccess,
            showLoading = showLoading,
            reportErrors = reportErrors,
            setParticipantLoading = participantManagementCoordinator::setEventTeamsAndParticipantsLoading,
            setMatchesLoading = effects.setMatchesLoading,
            showDetails = effects.showDetails,
        ) ?: return
        val occurrence = weeklyOccurrenceCoordinator.currentSelection()

        // Mark synchronously before launching so the managed-detail observer cannot
        // start an identical bootstrap while mobile hydration is still being scheduled.
        markManagedBootstrapRequested(
            event = event,
            occurrence = occurrence,
            manage = effects.canManageParticipantData(event),
        )
        eventDetailHydrationJob?.cancel()
        eventDetailHydrationJob = scope.launch {
            detailHydrationCoordinator.hydrateMobileEventDetail(
                request = request,
                fallbackEvent = event,
                occurrence = occurrence,
                isWeeklyParentEvent = ::isWeeklyParentEvent,
                getEvent = operations.getEvent,
                syncCurrentUserRegistrationCacheForEvent = operations.syncCurrentUserRegistrationCacheForEvent,
                syncEventParticipants = operations.syncEventParticipants,
                refreshMatches = operations.refreshMatches,
                applyParticipantSyncResult = ::applyParticipantSyncResult,
                applySelectedOccurrenceParticipantSummary = weeklyOccurrenceCoordinator::applySelectedOccurrenceParticipantSummary,
                refreshParticipantManagementSnapshotIfNeeded = ::refreshParticipantManagementSnapshotIfNeeded,
                refreshParticipantComplianceIfNeeded = ::refreshParticipantComplianceIfNeeded,
                setParticipantLoading = participantManagementCoordinator::setEventTeamsAndParticipantsLoading,
                setMatchesLoading = effects.setMatchesLoading,
                showDetails = effects.showDetails,
                setError = effects.setError,
            )
        }
    }

    fun prefetchWeeklyOccurrenceSummaries(occurrences: List<EventOccurrenceSelection>) {
        val event = selectedEvent.value
        if (!isWeeklyParentEvent(event)) return

        val pending = weeklyOccurrenceCoordinator.pendingOccurrenceSummaries(occurrences)
        if (pending.isEmpty()) return

        weeklyOccurrenceSummaryPrefetchJob?.cancel()
        weeklyOccurrenceSummaryPrefetchJob = scope.launch {
            pending.forEach { occurrence ->
                val summary = fetchWeeklyOccurrenceSummary(event, occurrence) ?: return@forEach
                weeklyOccurrenceCoordinator.rememberWeeklyOccurrenceSummary(occurrence, summary)
            }
        }
    }

    fun clearSelectedWeeklySession() {
        weeklyOccurrenceCoordinator.clearSelectedWeeklySession()
        participantManagementCoordinator.clearParticipantManagementState()
    }

    private fun markManagedBootstrapRequested(
        event: Event,
        occurrence: EventOccurrenceSelection?,
        manage: Boolean,
    ) {
        participantManagementCoordinator.markManagedBootstrapRequested(
            target = participantManagementRoomTarget(event, occurrence),
            manage = manage,
        )
    }

    private fun clearManagedBootstrapRequestIfCurrent(
        event: Event,
        occurrence: EventOccurrenceSelection?,
    ) {
        participantManagementCoordinator.clearManagedBootstrapRequestIfCurrent(
            participantManagementRoomTarget(event, occurrence),
        )
    }

    private suspend fun fetchWeeklyOccurrenceSummary(
        event: Event,
        occurrence: EventOccurrenceSelection,
    ): WeeklyOccurrenceSummary? =
        operations.getEventParticipantsSummary(event.id, occurrence)
            .onFailure { throwable ->
                effects.logWarning(
                    "Failed to load weekly occurrence summary for ${occurrence.slotId} on ${occurrence.occurrenceDate}.",
                    throwable,
                )
            }
            .getOrNull()
            ?.takeUnless(EventParticipantsSummary::weeklySelectionRequired)
            ?.let { summary ->
                WeeklyOccurrenceSummary(
                    participantCount = summary.participantCount,
                    participantCapacity = summary.participantCapacity,
                )
            }
}

private fun SelectedWeeklyOccurrenceState?.toOccurrenceSelection(): EventOccurrenceSelection? =
    this?.let { selection ->
        EventOccurrenceSelection(
            slotId = selection.slotId,
            occurrenceDate = selection.occurrenceDate,
            label = selection.label,
        )
    }
