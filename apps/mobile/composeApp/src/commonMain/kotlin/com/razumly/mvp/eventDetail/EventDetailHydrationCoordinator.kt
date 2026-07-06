package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.repositories.EventDetailSyncResult
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventParticipantDivisionWarning
import com.razumly.mvp.core.data.repositories.EventParticipantsSyncResult
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.util.ErrorMessage

internal data class EventDetailHydrationRequest(
    val eventId: String,
    val token: Long,
    val showDetailsOnSuccess: Boolean,
    val showLoading: Boolean,
    val reportErrors: Boolean,
)

internal class EventDetailHydrationCoordinator {
    private var hydrationToken: Long = 0L

    fun beginMobileHydration(
        event: Event,
        showDetailsOnSuccess: Boolean,
        showLoading: Boolean,
        reportErrors: Boolean,
        setParticipantLoading: (Boolean) -> Unit,
        setMatchesLoading: (Boolean) -> Unit,
        showDetails: () -> Unit,
    ): EventDetailHydrationRequest? {
        val eventId = event.id.trim()
        if (eventId.isEmpty()) {
            if (showDetailsOnSuccess) {
                showDetails()
            }
            return null
        }

        hydrationToken += 1
        if (showLoading) {
            setParticipantLoading(true)
        }
        setMatchesLoading(true)
        return EventDetailHydrationRequest(
            eventId = eventId,
            token = hydrationToken,
            showDetailsOnSuccess = showDetailsOnSuccess,
            showLoading = showLoading,
            reportErrors = reportErrors,
        )
    }

    fun isCurrentHydrationRequest(request: EventDetailHydrationRequest): Boolean =
        request.token == hydrationToken

    fun applyParticipantSyncResult(
        result: EventParticipantsSyncResult,
        isWeeklyParentEvent: (Event) -> Boolean,
        replaceParticipantDivisionWarnings: (List<EventParticipantDivisionWarning>) -> Unit,
        applyOverviewParticipantSummary: (
            isWeeklyParent: Boolean,
            weeklySelectionRequired: Boolean,
            participantCount: Int,
            participantCapacity: Int?,
        ) -> Unit,
    ) {
        replaceParticipantDivisionWarnings(result.divisionWarnings)
        applyOverviewParticipantSummary(
            isWeeklyParentEvent(result.event),
            result.weeklySelectionRequired,
            result.participantCount,
            result.participantCapacity,
        )
    }

    fun applyEventDetailSyncResult(
        result: EventDetailSyncResult,
        applyParticipantSyncResult: (EventParticipantsSyncResult) -> Unit,
        applyBootstrapSyncResult: (EventDetailSyncResult) -> Unit,
        replaceStaffInvites: (EventDetailSyncResult) -> Unit,
    ) {
        applyParticipantSyncResult(result.participants)
        applyBootstrapSyncResult(result)
        replaceStaffInvites(result)
    }

    suspend fun prefetchNonWeeklyParticipants(
        event: Event,
        isWeeklyParentEvent: (Event) -> Boolean,
        manage: Boolean,
        markManagedBootstrapRequested: (Event, EventOccurrenceSelection?, Boolean) -> Unit,
        syncEventDetail: suspend (Event, EventOccurrenceSelection?, Boolean) -> Result<EventDetailSyncResult>,
        applyEventDetailSyncResult: (EventDetailSyncResult) -> Unit,
        clearManagedBootstrapRequestIfCurrent: (Event, EventOccurrenceSelection?) -> Unit,
        setError: (ErrorMessage) -> Unit,
    ) {
        if (isWeeklyParentEvent(event)) {
            return
        }
        markManagedBootstrapRequested(event, null, manage)
        syncEventDetail(event, null, manage)
            .onSuccess(applyEventDetailSyncResult)
            .onFailure { throwable ->
                clearManagedBootstrapRequestIfCurrent(event, null)
                setError(
                    ErrorMessage(
                        throwable.userMessage("Failed to load teams and participants."),
                    )
                )
            }
    }

    suspend fun syncSelectedWeeklyOccurrenceParticipants(
        event: Event,
        occurrence: EventOccurrenceSelection?,
        isWeeklyParentEvent: (Event) -> Boolean,
        manage: Boolean,
        reportErrors: Boolean,
        clearSelectedWeeklyOccurrenceSummary: () -> Unit,
        markManagedBootstrapRequested: (Event, EventOccurrenceSelection?, Boolean) -> Unit,
        syncEventDetail: suspend (Event, EventOccurrenceSelection?, Boolean) -> Result<EventDetailSyncResult>,
        applyEventDetailSyncResult: (EventDetailSyncResult) -> Unit,
        applySelectedOccurrenceParticipantSummary: (
            occurrence: EventOccurrenceSelection?,
            weeklySelectionRequired: Boolean,
            participantCount: Int,
            participantCapacity: Int?,
        ) -> Unit,
        clearManagedBootstrapRequestIfCurrent: (Event, EventOccurrenceSelection?) -> Unit,
        setError: (ErrorMessage) -> Unit,
        logWarning: (String, Throwable) -> Unit,
    ) {
        if (!isWeeklyParentEvent(event)) {
            clearSelectedWeeklyOccurrenceSummary()
            return
        }

        markManagedBootstrapRequested(event, occurrence, manage)
        syncEventDetail(event, occurrence, manage)
            .onSuccess { result ->
                applyEventDetailSyncResult(result)
                val participantResult = result.participants
                applySelectedOccurrenceParticipantSummary(
                    occurrence,
                    participantResult.weeklySelectionRequired,
                    participantResult.participantCount,
                    participantResult.participantCapacity,
                )
            }
            .onFailure { throwable ->
                clearManagedBootstrapRequestIfCurrent(event, occurrence)
                if (reportErrors) {
                    setError(
                        ErrorMessage(
                            throwable.userMessage("Failed to load occurrence participants."),
                        )
                    )
                } else {
                    logWarning("Failed to refresh selected weekly occurrence participants.", throwable)
                }
            }
    }

    suspend fun refreshEventAfterParticipantMutation(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
        warningMessage: String,
        getEvent: suspend (String) -> Result<Event>,
        syncEventParticipants: suspend (Event, EventOccurrenceSelection?) -> Result<EventParticipantsSyncResult>,
        applyParticipantSyncResult: (EventParticipantsSyncResult) -> Unit,
        refreshSelectedWeeklyOccurrenceSummaryIfNeeded: suspend (Event) -> Unit,
        refreshParticipantManagementSnapshotIfNeeded: suspend (Event) -> Unit,
        refreshParticipantComplianceIfNeeded: suspend (Event) -> Unit,
        logWarning: (String, Throwable) -> Unit,
    ) {
        getEvent(eventId)
            .onSuccess { refreshed ->
                val syncResult = syncEventParticipants(refreshed, occurrence)
                    .onFailure { throwable ->
                        logWarning(warningMessage, throwable)
                    }
                    .getOrNull()
                if (syncResult != null) {
                    applyParticipantSyncResult(syncResult)
                }
                val eventForRefresh = syncResult?.event ?: refreshed
                refreshSelectedWeeklyOccurrenceSummaryIfNeeded(eventForRefresh)
                refreshParticipantManagementSnapshotIfNeeded(eventForRefresh)
                refreshParticipantComplianceIfNeeded(eventForRefresh)
            }
            .onFailure { throwable ->
                logWarning(warningMessage, throwable)
            }
    }

    suspend fun hydrateMobileEventDetail(
        request: EventDetailHydrationRequest,
        fallbackEvent: Event,
        occurrence: EventOccurrenceSelection?,
        isWeeklyParentEvent: (Event) -> Boolean,
        getEvent: suspend (String) -> Result<Event>,
        syncCurrentUserRegistrationCacheForEvent: suspend (String) -> Result<*>,
        syncEventParticipants: suspend (Event, EventOccurrenceSelection?) -> Result<EventParticipantsSyncResult>,
        refreshMatches: suspend (String) -> Result<List<MatchMVP>>,
        applyParticipantSyncResult: (EventParticipantsSyncResult) -> Unit,
        applySelectedOccurrenceParticipantSummary: (
            occurrence: EventOccurrenceSelection?,
            weeklySelectionRequired: Boolean,
            participantCount: Int,
            participantCapacity: Int?,
        ) -> Unit,
        refreshParticipantManagementSnapshotIfNeeded: suspend (Event) -> Unit,
        refreshParticipantComplianceIfNeeded: suspend (Event) -> Unit,
        setParticipantLoading: (Boolean) -> Unit,
        setMatchesLoading: (Boolean) -> Unit,
        showDetails: () -> Unit,
        setError: (ErrorMessage) -> Unit,
    ) {
        try {
            val refreshedEvent = getEvent(request.eventId)
                .onFailure { throwable ->
                    if (!isCurrentHydrationRequest(request)) return@onFailure
                    if (request.reportErrors) {
                        setError(
                            ErrorMessage(
                                throwable.userMessage("Failed to load teams and participants."),
                            )
                        )
                    }
                }
                .getOrElse { fallbackEvent }
            if (!isCurrentHydrationRequest(request)) return

            syncCurrentUserRegistrationCacheForEvent(request.eventId)
            if (!isCurrentHydrationRequest(request)) return

            syncEventParticipants(refreshedEvent, occurrence)
                .onSuccess { result ->
                    if (!isCurrentHydrationRequest(request)) return@onSuccess
                    applyParticipantSyncResult(result)
                    applySelectedOccurrenceParticipantSummary(
                        occurrence.takeIf { isWeeklyParentEvent(result.event) },
                        result.weeklySelectionRequired,
                        result.participantCount,
                        result.participantCapacity,
                    )
                    refreshParticipantManagementSnapshotIfNeeded(result.event)
                    refreshParticipantComplianceIfNeeded(result.event)
                }
                .onFailure { throwable ->
                    if (!isCurrentHydrationRequest(request)) return@onFailure
                    if (request.reportErrors) {
                        setError(
                            ErrorMessage(
                                throwable.userMessage("Failed to load teams and participants."),
                            )
                        )
                    }
                }

            if (request.showLoading) {
                setParticipantLoading(false)
            }

            refreshMatches(request.eventId)
                .onFailure { throwable ->
                    if (!isCurrentHydrationRequest(request)) return@onFailure
                    if (request.reportErrors) {
                        setError(
                            ErrorMessage(
                                throwable.userMessage("Failed to load schedule matches."),
                            )
                        )
                    }
                }

            if (request.showDetailsOnSuccess && isCurrentHydrationRequest(request)) {
                showDetails()
            }
        } finally {
            if (isCurrentHydrationRequest(request)) {
                if (request.showLoading) {
                    setParticipantLoading(false)
                }
                setMatchesLoading(false)
            }
        }
    }
}
