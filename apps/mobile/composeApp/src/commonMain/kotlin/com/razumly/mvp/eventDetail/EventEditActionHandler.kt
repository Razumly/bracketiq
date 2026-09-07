package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.resolveEventResourceLabels
import com.razumly.mvp.core.data.dataTypes.enums.defaultAutomatedSchedulingForEventType
import com.razumly.mvp.core.data.dataTypes.enums.isScheduleConstructionAutomationType
import com.razumly.mvp.core.data.dataTypes.withDefaultPlayoffTeamCounts
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.withAutomatedScheduling
import com.razumly.mvp.core.data.dataTypes.enums.normalizeAutomatedSchedulingForEventType
import com.razumly.mvp.core.data.repositories.EventEditorCanonicalState
import com.razumly.mvp.core.data.repositories.EventEditorMaintenanceAcceptanceConflictException
import com.razumly.mvp.core.data.repositories.EventEditorProposalStaleException
import com.razumly.mvp.core.data.repositories.EventEditorMaintenanceRejectedException
import com.razumly.mvp.core.data.repositories.EventEditorMaintenanceAcceptedSyncPendingException
import com.razumly.mvp.core.data.repositories.EventEditorMutation
import com.razumly.mvp.core.data.repositories.EventEditorSaveOutcome
import com.razumly.mvp.core.data.repositories.EventEditorSession
import com.razumly.mvp.core.data.repositories.EventEditorSessionMapper
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.network.dto.EVENT_EDITOR_CONTRACT_VERSION
import com.razumly.mvp.core.network.dto.EventEditorAcceptMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceAcceptedResultDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceOperation
import com.razumly.mvp.core.network.dto.EventEditorRejectMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceRequestDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseDto
import com.razumly.mvp.core.network.dto.EventEditorRevisionBindingDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseStatus
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorSaveScheduleTransitionDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleTransitionMode
import com.razumly.mvp.core.network.dto.EventEditorSnapshotDto
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.eventDetail.data.IMatchRepository
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

private const val SCHEDULE_MAINTENANCE_UNAVAILABLE_MESSAGE =
    "Schedule maintenance is not available for this event."
private const val EVENT_TYPE_MATCH_GRAPH_WARNING =
    "The Match Graph has not been rebuilt and does not conform to the new Event Type. " +
        "Use Rebuild Schedule with a supported Event Type to replace the graph."
private const val SCHEDULE_MAINTENANCE_ROLLBACK_REQUIRED_MESSAGE =
    "The Event changes could not be restored. Refresh the editor before continuing."

private class EventScheduleMaintenanceUnavailableException : IllegalStateException(
    SCHEDULE_MAINTENANCE_UNAVAILABLE_MESSAGE,
)
private enum class EventScheduleMaintenanceOperationAttemptStatus {
    PENDING,
    FAILED,
    PROPOSED,
    ACCEPTED_SYNC_PENDING,
}


private data class EventScheduleMaintenanceOperationInput(
    val eventId: String,
    val operation: EventEditorMaintenanceOperation,
    val includePlaceholderTeams: Boolean?,
    val participantCount: Int?,
    val revisionBinding: EventEditorRevisionBindingDto?,
)

private data class EventScheduleMaintenanceOperationAttempt(
    val input: EventScheduleMaintenanceOperationInput,
    val operationId: String,
    val status: EventScheduleMaintenanceOperationAttemptStatus,
)

private fun EventEditorMaintenanceAcceptedResultDto.asMaintenanceProposal(): EventEditorMaintenanceProposalDto =
    EventEditorMaintenanceProposalDto(
        status = EventEditorMaintenanceResponseStatus.PROPOSED,
        contractVersion = contractVersion,
        eventId = eventId,
        operation = operation,
        operationId = operationId,
        proposalRevision = proposalRevision,
        revisionBinding = revisionBinding,
        graph = graph,
        protectedMatchIds = protectedMatchIds,
        scheduleOutcome = scheduleOutcome,
    )

private fun EventScheduleEditAction.isAvailableIn(
    snapshot: EventEditorSnapshotDto,
    viewerId: String,
): Boolean =
    snapshot.mode == "EDIT" &&
        snapshot.capabilities.toDomain().canEditFor(viewerId) &&
        maintenanceOperation in snapshot.scheduleState.availableMaintenanceOperations

private fun EventScheduleMaintenanceReview.requestedAction(): EventScheduleEditAction =
    when (reviewedProposal.operation) {
        EventEditorMaintenanceOperation.BUILD -> EventScheduleEditAction.BUILD_SCHEDULE
        EventEditorMaintenanceOperation.COMPLETE -> EventScheduleEditAction.RESCHEDULE
        EventEditorMaintenanceOperation.REBUILD ->
            if (includePlaceholderTeams == false) {
                EventScheduleEditAction.REBUILD_WITHOUT_PLACEHOLDER_TEAMS
            } else {
                EventScheduleEditAction.REBUILD_SCHEDULE
            }
    }


data class EventTypeTransitionConfirmation(
    val message: String,
    val actionLabel: String,
    val destinationEventType: EventType,
)

data class EventScheduleMaintenanceOptions(
    val isLoading: Boolean = false,
    val operations: List<EventEditorMaintenanceOperation> = emptyList(),
    val message: String? = null,
)

internal class EventEditActionHandler(
    private val currentUserId: () -> String,
    private val scope: CoroutineScope,
    private val editActionCoordinator: EventEditActionCoordinator,
    private val editDraftCoordinator: EventEditDraftCoordinator,
    private val rentalResourcesCoordinator: EventRentalResourcesCoordinator,
    private val sportsCatalogCoordinator: EventSportsCatalogCoordinator,
    private val inviteCoordinator: EventInviteCoordinator,
    private val eventRepository: IEventRepository,
    private val billingRepository: IBillingRepository,
    private val matchRepository: IMatchRepository,
    private val loadingHandler: () -> LoadingHandler,
    private val selectedEvent: () -> Event,
    private val eventWithRelations: () -> EventWithFullRelations,
    private val eventFields: () -> List<FieldWithMatches>,
    private val setStaffState: (List<Invite>, String?) -> Unit,
    private val loadSports: (Boolean) -> Unit,
    private val refreshLeagueStandingsAfterSchedule: suspend (Event) -> Unit,
    private val setError: (String) -> Unit,
) {
    private var editStartRequestId = 0L
    private var editorSession: EventEditorSession? = null
    private val _eventTypeTransitionConfirmation =
        MutableStateFlow<EventTypeTransitionConfirmation?>(null)
    val eventTypeTransitionConfirmation = _eventTypeTransitionConfirmation.asStateFlow()
    private val _eventEditorSnapshot = MutableStateFlow<EventEditorSnapshotDto?>(null)
    val eventEditorSnapshot = _eventEditorSnapshot.asStateFlow()
    private val _scheduleMaintenanceReview = MutableStateFlow<EventScheduleMaintenanceReview?>(null)
    val scheduleMaintenanceReview = _scheduleMaintenanceReview.asStateFlow()
    private val _scheduleMaintenanceOptions = MutableStateFlow<EventScheduleMaintenanceOptions?>(null)
    val scheduleMaintenanceOptions = _scheduleMaintenanceOptions.asStateFlow()
    private var scheduleOptionsRequestGeneration = 0L
    private var maintenanceRequestGeneration = 0L
    private var maintenanceRequestInFlight = false
    private var lastMaintenanceAction: EventScheduleEditAction? = null
    private var maintenanceOperationAttempt: EventScheduleMaintenanceOperationAttempt? = null
    private var maintenanceOriginalSession: EventEditorSession? = null
    private var maintenanceSavedSession: EventEditorSession? = null
    private var acceptedMaintenanceResult: EventEditorMaintenanceAcceptedResultDto? = null
    private var acceptedByAnotherClientSyncPending = false
    private var maintenanceRollbackRecoveryRequired = false
    private fun clearScheduleMaintenanceIdentities(
        clearRollback: Boolean = true,
        clearAttempt: Boolean = true,
    ) {
        if (clearAttempt) {
            maintenanceOperationAttempt = null
        }
        acceptedMaintenanceResult = null
        acceptedByAnotherClientSyncPending = false
        if (clearRollback) {
            maintenanceOriginalSession = null
            maintenanceSavedSession = null
            maintenanceRollbackRecoveryRequired = false
        }
    }
    private fun isScheduleMaintenanceReviewDismissBlocked(): Boolean {
        val phase = _scheduleMaintenanceReview.value?.phase
        return phase?.isBusy == true || acceptedMaintenanceResult != null ||
            phase == EventScheduleMaintenanceReviewPhase.ACCEPTED_SYNC_PENDING
    }

    private fun isCurrentDraftScheduleMaintenanceCapable(): Boolean {
        val event = editDraftCoordinator.editedEvent.value
        return event.isAutomatedScheduling && event.eventType.isScheduleConstructionAutomationType()
    }

    private fun maintenanceParticipantCount(event: Event): Int? =
        event.maxParticipants.takeIf { participantCount -> participantCount > 0 }


    private fun seedEditableDraft(
        selectedEvent: Event,
        canonicalState: EventEditorCanonicalState?,
    ) {
        val normalizedSelected = selectedEvent
            .withAutomatedScheduling(
                normalizeAutomatedSchedulingForEventType(
                    eventType = selectedEvent.eventType,
                    value = selectedEvent.isAutomatedScheduling,
                ),
            )
            .withDefaultPlayoffTeamCounts()
        val seededEvent = if (sportsCatalogCoordinator.currentSports().isNotEmpty()) {
            sportsCatalogCoordinator.syncOfficialStaffingForSportTransition(
                previous = normalizedSelected,
                updated = normalizedSelected,
            )
        } else {
            normalizedSelected
        }
        editDraftCoordinator.seedDraftForEditing(
            event = seededEvent,
            sourceFields = canonicalState?.fields ?: eventFields().map { relation -> relation.field },
            timeSlots = canonicalState?.timeSlots ?: eventWithRelations().timeSlots,
            resourceLabelSingular = resolveEventResourceLabels(
                sportIds = seededEvent.sportIds,
                sports = sportsCatalogCoordinator.currentSports(),
            ).singular,
            leagueScoringConfig = canonicalState?.leagueScoringConfig
                ?: eventWithRelations().leagueScoringConfig?.toDto()
                ?: LeagueScoringConfigDTO(),
        )
        editDraftCoordinator.setControlLocks(
            immutableFieldNames = editorSession?.snapshot?.immutable?.fieldNames?.toSet().orEmpty(),
            eventTypeHasProtectedHistory =
                editorSession?.snapshot?.scheduleState?.hasProtectedHistory == true,
            fallbackEvent = seededEvent,
        )
        val changedRentalSelection = rentalResourcesCoordinator.setAttachedResourceSelection(
            slots = editDraftCoordinator.editableLeagueTimeSlots.value,
            eventId = seededEvent.id,
        )
        if (changedRentalSelection && rentalResourcesCoordinator.selectedResourceIds.value.isNotEmpty()) {
            syncSelectedRentalResourcesIntoEditDraft()
        }
    }


    fun toggleEdit() {
        if (editDraftCoordinator.isEditing.value) {
            cancelEditingEvent()
        } else {
            startEditingEvent()
        }
    }

    fun startEditingEvent() {
        if (editDraftCoordinator.isEditing.value) return
        dismissScheduleMaintenanceOptions()
        val requestId = ++editStartRequestId
        val currentEvent = selectedEvent()
        val viewerId = currentUserId()
        scope.launch {
            val session = eventRepository.getEventEditor(currentEvent.id)
                .getOrElse { throwable ->
                    if (requestId == editStartRequestId) {
                        setError(throwable.userMessage("Failed to load the event editor."))
                    }
                    return@launch
                }
            if (requestId != editStartRequestId || editDraftCoordinator.isEditing.value || viewerId != currentUserId()) {
                return@launch
            }
            if (!session.snapshot.capabilities.toDomain().canEditFor(viewerId)) {
                setError(session.snapshot.capabilities.toDomain().managementRestrictionMessage()
                    ?: "Event management is read-only for this account.")
                return@launch
            }
            setEventEditMode(enabled = true, seedSession = session)
        }
    }

    fun cancelEditingEvent() {
        if (maintenanceRollbackRecoveryRequired) {
            _scheduleMaintenanceReview.value = _scheduleMaintenanceReview.value?.copy(isVisible = true)
            setError(SCHEDULE_MAINTENANCE_ROLLBACK_REQUIRED_MESSAGE)
            return
        }
        if (isScheduleMaintenanceReviewDismissBlocked()) {
            return
        }
        editStartRequestId += 1
        dismissScheduleMaintenanceOptions()
        maintenanceRequestGeneration += 1
        clearScheduleMaintenanceIdentities()
        _scheduleMaintenanceReview.value = null
        _eventTypeTransitionConfirmation.value = null
        setEventEditMode(enabled = false)
    }

    fun invalidateAuthority() {
        editStartRequestId += 1
        scheduleOptionsRequestGeneration += 1
        maintenanceRequestGeneration += 1
        _scheduleMaintenanceOptions.value = null
        _scheduleMaintenanceReview.value = null
        _eventTypeTransitionConfirmation.value = null
        clearScheduleMaintenanceIdentities()
        setEditorSession(null)
        inviteCoordinator.clearPendingStaffInvites()
        editDraftCoordinator.forceExitEditing(selectedEvent())
    }
    private fun setEditorSession(session: EventEditorSession?) {
        editorSession = session
        _eventEditorSnapshot.value = session?.snapshot
    }

    private fun setEventEditMode(
        enabled: Boolean,
        seedEvent: Event? = null,
        seedSession: EventEditorSession? = null,
    ) {
        val selected = seedSession?.canonicalState?.event
            ?: seedEvent
            ?: selectedEvent()
        val normalizedSelected = selected
            .withAutomatedScheduling(
                normalizeAutomatedSchedulingForEventType(
                    eventType = selected.eventType,
                    value = selected.isAutomatedScheduling,
                ),
            )
            .withDefaultPlayoffTeamCounts()
        if (editDraftCoordinator.isEditing.value == enabled) return
        if (enabled && !sportsCatalogCoordinator.isCatalogLoaded()) {
            loadSports(true)
        }

        if (enabled) {
            setEditorSession(seedSession ?: editorSession)
            seedEditableDraft(
                selectedEvent = normalizedSelected,
                canonicalState = editorSession?.canonicalState,
            )
        } else {
            setEditorSession(null)
            inviteCoordinator.clearPendingStaffInvites()
            inviteCoordinator.clearSuggestedUsers()
        }
        editDraftCoordinator.setEditing(enabled)
    }

    fun editEventField(update: Event.() -> Event) {
        editDraftCoordinator.updateEditedEvent { previous ->
            val updated = previous.update()
            if (updated.copy(affiliateUrl = previous.affiliateUrl) == previous) updated
            else sportsCatalogCoordinator.syncOfficialStaffingForSportTransition(
                previous = previous,
                updated = updated.withDefaultPlayoffTeamCounts(),
            )
        }
    }

    fun updateEvent() {
        requestEventUpdate(transitionConfirmed = false)
    }

    fun dismissEventTypeTransitionConfirmation() {
        _eventTypeTransitionConfirmation.value = null
    }

    fun confirmEventTypeTransition() {
        val confirmation = _eventTypeTransitionConfirmation.value ?: return
        if (editDraftCoordinator.editedEvent.value.eventType != confirmation.destinationEventType) {
            _eventTypeTransitionConfirmation.value = null
            requestEventUpdate(transitionConfirmed = false)
            return
        }
        _eventTypeTransitionConfirmation.value = null
        requestEventUpdate(transitionConfirmed = true)
    }

    private fun requestEventUpdate(transitionConfirmed: Boolean) {
        val originalSession = editorSession
        if (maintenanceRequestInFlight || maintenanceRollbackRecoveryRequired) {
            _scheduleMaintenanceReview.value = _scheduleMaintenanceReview.value?.copy(isVisible = true)
            setError("Resolve the pending schedule request before saving Event changes.")
            return
        }
        if (!transitionConfirmed) {
            buildEventTypeTransitionConfirmation()?.let { confirmation ->
                _eventTypeTransitionConfirmation.value = confirmation
                return
            }
        }
        scope.launch {
            val loadingOperation = loadingHandler().newOperation()
            when (val result = editActionCoordinator.runSaveEventAction(
                pendingStaffInvites = inviteCoordinator.pendingStaffInvites.value,
                prepareEventForUpdate = ::prepareEventForUpdate,
                savePreparedEvent = ::savePreparedEventThroughEditor,
                refetchMatchesOfTournament = { eventId ->
                    matchRepository.getMatchesOfTournament(eventId)
                },
                showLoading = loadingOperation::showLoading,
                hideLoading = loadingOperation::hideLoading,
            )) {
                is EventSaveActionResult.Success -> {
                    setStaffState(result.staffInvites, result.staffRevision)
                    val notices = buildList {
                        if (
                            result.staffEmailDelivery.isNotBlank() &&
                            result.staffEmailDelivery.uppercase() !in setOf("SENT", "NOT_REQUESTED")
                        ) {
                            add("Event saved, but staff invite delivery needs attention.")
                        }
                        addAll(result.scheduleWarnings)
                        if (originalSession != null && originalSession.snapshot.scheduleState.matchCount > 0 &&
                            originalSession.baseline.event.eventType != result.finalEvent.eventType) {
                            add(EVENT_TYPE_MATCH_GRAPH_WARNING)
                        }
                    }
                    inviteCoordinator.clearPendingStaffInvites()
                    inviteCoordinator.clearSuggestedUsers()
                    cancelEditingEvent()
                    if (notices.isNotEmpty()) setError(notices.joinToString("\n"))
                }
                is EventSaveActionResult.Failure -> setError(result.userFacingMessage())
            }
        }
    }

    private fun buildEventTypeTransitionConfirmation(): EventTypeTransitionConfirmation? {
        val session = editorSession ?: return null
        val previousType = session.baseline.event.eventType
        val nextType = editDraftCoordinator.editedEvent.value.eventType
        if (previousType == nextType) return null
        val previousLabel = previousType.name
        val nextLabel = nextType.name
        return EventTypeTransitionConfirmation(
            message = "Changing this event from $previousLabel to $nextLabel saves the event settings and " +
                "preserves the current schedule. Settings that do not apply to the new Event Type, " +
                "including pool, playoff, scoring, and Match duration settings, will be cleared. " + if (session.snapshot.scheduleState.matchCount > 0) {
                    EVENT_TYPE_MATCH_GRAPH_WARNING
                } else {
                    "You can request Build explicitly after saving when scheduling is available."
                },
            actionLabel = "Change type",
            destinationEventType = nextType,
        )
    }

    fun openScheduleMaintenance() {
        if (editDraftCoordinator.isEditing.value) return
        _scheduleMaintenanceReview.value?.let { review ->
            _scheduleMaintenanceReview.value = review.copy(isVisible = true)
            return
        }
        if (_scheduleMaintenanceOptions.value?.isLoading == true) return
        val eventId = selectedEvent().id
        val generation = ++scheduleOptionsRequestGeneration
        _scheduleMaintenanceOptions.value = EventScheduleMaintenanceOptions(isLoading = true)
        scope.launch {
            val result = eventRepository.getEventEditor(eventId)
            if (generation != scheduleOptionsRequestGeneration || selectedEvent().id != eventId) return@launch
            result.fold(
                onSuccess = { session ->
                    val event = session.canonicalState.event
                    val snapshot = session.snapshot
                    val operations = snapshot.scheduleState.availableMaintenanceOperations.takeIf {
                        snapshot.mode == "EDIT" && snapshot.eventId == eventId && event.id == eventId &&
                            snapshot.capabilities.toDomain().canEditFor(currentUserId()) && event.isAutomatedScheduling &&
                            event.eventType.isScheduleConstructionAutomationType() &&
                            !event.state.equals("TEMPLATE", ignoreCase = true)
                    }.orEmpty()
                    if (operations.isNotEmpty()) {
                        setEditorSession(session)
                        seedEditableDraft(event, session.canonicalState)
                    }
                    _scheduleMaintenanceOptions.value = EventScheduleMaintenanceOptions(
                        operations = operations,
                        message = if (operations.isEmpty()) snapshot.capabilities.toDomain().managementRestrictionMessage()
                            ?: SCHEDULE_MAINTENANCE_UNAVAILABLE_MESSAGE else null,
                    )
                },
                onFailure = { error ->
                    _scheduleMaintenanceOptions.value = EventScheduleMaintenanceOptions(
                        message = error.userMessage("Unable to load Schedule actions. Try again."),
                    )
                },
            )
        }
    }

    fun dismissScheduleMaintenanceOptions() {
        scheduleOptionsRequestGeneration += 1
        _scheduleMaintenanceOptions.value = null
    }

    fun selectScheduleMaintenanceOperation(operation: EventEditorMaintenanceOperation) {
        if (operation !in _scheduleMaintenanceOptions.value?.operations.orEmpty()) return
        dismissScheduleMaintenanceOptions()
        requestScheduleMaintenanceAction(
            when (operation) {
                EventEditorMaintenanceOperation.BUILD -> EventScheduleEditAction.BUILD_SCHEDULE
                EventEditorMaintenanceOperation.COMPLETE -> EventScheduleEditAction.RESCHEDULE
                EventEditorMaintenanceOperation.REBUILD -> EventScheduleEditAction.REBUILD_SCHEDULE
            },
        )
    }

    fun rescheduleEvent() {
        requestScheduleMaintenanceAction(EventScheduleEditAction.RESCHEDULE)
    }

    fun buildSchedule() {
        val availableOperations = _eventEditorSnapshot.value
            ?.scheduleState
            ?.availableMaintenanceOperations
            .orEmpty()
        val action = when {
            EventEditorMaintenanceOperation.BUILD in availableOperations ->
                EventScheduleEditAction.BUILD_SCHEDULE
            EventEditorMaintenanceOperation.REBUILD in availableOperations ->
                EventScheduleEditAction.REBUILD_SCHEDULE
            else -> null
        }
        if (action == null) {
            setError("Schedule building is not available for this event.")
        } else {
            requestScheduleMaintenanceAction(action)
        }
    }

    fun rebuildWithoutPlaceholderTeams() {
        requestScheduleMaintenanceAction(EventScheduleEditAction.REBUILD_WITHOUT_PLACEHOLDER_TEAMS)
    }

    private fun requestScheduleMaintenanceAction(action: EventScheduleEditAction) {
        if (maintenanceRequestInFlight) return
        if (maintenanceRollbackRecoveryRequired) {
            _scheduleMaintenanceReview.value = _scheduleMaintenanceReview.value?.copy(isVisible = true)
            setError(SCHEDULE_MAINTENANCE_ROLLBACK_REQUIRED_MESSAGE)
            return
        }
        if (
            _scheduleMaintenanceReview.value?.phase ==
            EventScheduleMaintenanceReviewPhase.ACCEPTED_SYNC_PENDING
        ) {
            return
        }
        if (!isCurrentDraftScheduleMaintenanceCapable()) {
            setError(SCHEDULE_MAINTENANCE_UNAVAILABLE_MESSAGE)
            return
        }
        val snapshot = _eventEditorSnapshot.value
        if (snapshot == null || !action.isAvailableIn(snapshot, currentUserId())) {
            setError(SCHEDULE_MAINTENANCE_UNAVAILABLE_MESSAGE)
            return
        }
        if (maintenanceOperationAttempt?.status != EventScheduleMaintenanceOperationAttemptStatus.FAILED) {
            clearScheduleMaintenanceIdentities()
        }
        val requestGeneration = ++maintenanceRequestGeneration
        maintenanceRequestInFlight = true
        lastMaintenanceAction = action
        _scheduleMaintenanceReview.value = EventScheduleMaintenanceReview(
            phase = EventScheduleMaintenanceReviewPhase.REFRESHING,
        )
        scope.launch {
            try {
                handleScheduleMaintenanceActionResult(
                    result = runScheduleMaintenanceAction(action),
                    requestGeneration = requestGeneration,
                )
            } finally {
                maintenanceRequestInFlight = false
            }
        }
    }

    private suspend fun runScheduleMaintenanceAction(
        action: EventScheduleEditAction,
    ): EventScheduleMaintenanceActionResult {
        var preparedSnapshot: EventEditorSnapshotDto? = null
        val loadingOperation = loadingHandler().newOperation()
        return editActionCoordinator.runScheduleMaintenanceAction(
            action = action,
            prepareEventForUpdate = {
                if (editDraftCoordinator.isEditing.value) {
                    prepareEventForUpdate()
                } else {
                    PreparedEventForUpdate(event = requireNotNull(editorSession).canonicalState.event)
                }
            },
            logPreparedFieldOwnership = ::logPreparedFieldOwnership,
            prepareSettings = { prepared ->
                if (!isCurrentDraftScheduleMaintenanceCapable()) {
                    throw EventScheduleMaintenanceUnavailableException()
                }
                if (!editDraftCoordinator.isEditing.value) {
                    val session = requireNotNull(editorSession)
                    preparedSnapshot = session.snapshot
                    EventScheduleMaintenancePreparation(
                        event = session.canonicalState.event,
                        settingsSaved = false,
                    )
                } else {
                    val hadUnsavedChanges = editDraftCoordinator.hasUnsavedChanges()
                    val originalSession = editorSession ?: eventRepository.getEventEditor(prepared.event.id)
                        .getOrThrow()
                        .also { loaded -> setEditorSession(loaded) }
                    savePreparedEventThroughEditor(
                        prepared = prepared,
                        pendingStaffInvites = inviteCoordinator.pendingStaffInvites.value,
                        scheduleTransitionOverride = EventEditorSaveScheduleTransitionDto(
                            mode = EventEditorScheduleTransitionMode.PRESERVE,
                        ),
                        persistLocally = false,
                    ).let { outcome ->
                        preparedSnapshot = outcome.session.snapshot
                        if (hadUnsavedChanges) {
                            maintenanceOriginalSession = originalSession
                            maintenanceSavedSession = outcome.session
                        }
                        EventScheduleMaintenancePreparation(
                            event = outcome.session.canonicalState.event,
                            settingsSaved = true,
                        )
                    }
                }
            },
            proposeMaintenance = { maintenanceAction, updated ->
                val authoritativeSnapshot = preparedSnapshot
                if (
                    authoritativeSnapshot == null ||
                    !maintenanceAction.isAvailableIn(authoritativeSnapshot, currentUserId())
                ) {
                    throw EventScheduleMaintenanceUnavailableException()
                }
                val includePlaceholderTeams = when (maintenanceAction) {
                    EventScheduleEditAction.REBUILD_WITHOUT_PLACEHOLDER_TEAMS -> false
                    EventScheduleEditAction.BUILD_SCHEDULE,
                    EventScheduleEditAction.REBUILD_SCHEDULE -> true
                    EventScheduleEditAction.RESCHEDULE -> null
                }
                val participantCount = maintenanceParticipantCount(updated)
                val operationInput = EventScheduleMaintenanceOperationInput(
                    eventId = updated.id,
                    operation = maintenanceAction.maintenanceOperation,
                    includePlaceholderTeams = includePlaceholderTeams,
                    participantCount = participantCount,
                    revisionBinding = authoritativeSnapshot.revisionBinding,
                )
                val previousAttempt = maintenanceOperationAttempt
                val operationId = if (
                    previousAttempt?.status == EventScheduleMaintenanceOperationAttemptStatus.FAILED &&
                    previousAttempt.input == operationInput
                ) {
                    previousAttempt.operationId
                } else {
                    newId()
                }
                val attempt = EventScheduleMaintenanceOperationAttempt(
                    input = operationInput,
                    operationId = operationId,
                    status = EventScheduleMaintenanceOperationAttemptStatus.PENDING,
                )
                maintenanceOperationAttempt = attempt
                val request = EventEditorMaintenanceRequestDto(
                    contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
                    eventId = updated.id,
                    operation = maintenanceAction.maintenanceOperation,
                    operationId = operationId,
                    expectedRevisions = operationInput.revisionBinding,
                    participantCount = participantCount,
                    includePlaceholderTeams = includePlaceholderTeams,
                )
                val response = try {
                    eventRepository.proposeEventScheduleMaintenance(request).getOrThrow()
                } catch (throwable: Throwable) {
                    if (maintenanceOperationAttempt == attempt) {
                        when (throwable) {
                            is EventEditorMaintenanceAcceptedSyncPendingException -> {
                                acceptedMaintenanceResult = throwable.result
                                maintenanceOperationAttempt = attempt.copy(
                                    status = EventScheduleMaintenanceOperationAttemptStatus.ACCEPTED_SYNC_PENDING,
                                )
                                _scheduleMaintenanceReview.value = EventScheduleMaintenanceReview(
                                    proposal = throwable.result.asMaintenanceProposal(),
                                    acceptanceOperationId = throwable.result.acceptanceOperationId,
                                    includePlaceholderTeams = includePlaceholderTeams,
                                    phase = EventScheduleMaintenanceReviewPhase.ACCEPTED_SYNC_PENDING,
                                    eventTimeZone = updated.timeZone,
                                    message = throwable.userMessage(
                                        "Schedule accepted, but the current schedule could not be synchronized.",
                                    ),
                                )
                            }
                            is EventEditorProposalStaleException,
                            is EventEditorMaintenanceRejectedException,
                            is EventScheduleMaintenanceUnavailableException -> {
                                clearScheduleMaintenanceIdentities(clearRollback = false)
                            }
                            else -> {
                                maintenanceOperationAttempt = attempt.copy(
                                    status = EventScheduleMaintenanceOperationAttemptStatus.FAILED,
                                )
                            }
                        }
                    }
                    throw throwable
                }
                when (response) {
                    is EventEditorMaintenanceResponseDto.Proposed -> {
                        maintenanceOperationAttempt = attempt.copy(
                            status = EventScheduleMaintenanceOperationAttemptStatus.PROPOSED,
                        )
                    }
                    is EventEditorMaintenanceResponseDto.Accepted -> {
                        acceptedMaintenanceResult = response.result
                        maintenanceOperationAttempt = attempt.copy(
                            status = EventScheduleMaintenanceOperationAttemptStatus.ACCEPTED_SYNC_PENDING,
                        )
                        _scheduleMaintenanceReview.value = EventScheduleMaintenanceReview(
                            proposal = response.result.asMaintenanceProposal(),
                            acceptanceOperationId = response.result.acceptanceOperationId,
                            includePlaceholderTeams = includePlaceholderTeams,
                            phase = EventScheduleMaintenanceReviewPhase.ACCEPTED_SYNC_PENDING,
                            eventTimeZone = updated.timeZone,
                        )
                    }
                    is EventEditorMaintenanceResponseDto.Rejected -> {
                        clearScheduleMaintenanceIdentities(clearRollback = false)
                    }
                }
                response
            },
            rollbackEvent = ::rollbackScheduleMaintenanceEvent,
            refreshAcceptedSchedule = ::refreshAcceptedSchedule,
            showLoading = loadingOperation::showLoading,
            hideLoading = loadingOperation::hideLoading,
            newOperationId = ::newId,
        )
    }

    private fun handleScheduleMaintenanceActionResult(
        result: EventScheduleMaintenanceActionResult,
        requestGeneration: Long,
    ) {
        if (requestGeneration != maintenanceRequestGeneration) return
        when (result) {
            is EventScheduleMaintenanceActionResult.Proposed -> {
                clearScheduleMaintenanceIdentities(clearRollback = false)
                _scheduleMaintenanceReview.value = result.review
            }
            is EventScheduleMaintenanceActionResult.Accepted -> {
                clearScheduleMaintenanceIdentities()
                _scheduleMaintenanceReview.value = null
                cancelEditingEvent()
                setError(result.message)
            }
            is EventScheduleMaintenanceActionResult.Rejected -> {
                clearScheduleMaintenanceIdentities()
                _scheduleMaintenanceReview.value = EventScheduleMaintenanceReview(
                    phase = EventScheduleMaintenanceReviewPhase.REJECTED, message = result.message,
                )
                setError(result.message)
            }
            is EventScheduleMaintenanceActionResult.Failure -> {
                val acceptedSyncReview = _scheduleMaintenanceReview.value
                    ?.takeIf { review ->
                        review.phase == EventScheduleMaintenanceReviewPhase.ACCEPTED_SYNC_PENDING
                    }
                if (acceptedSyncReview != null) {
                    val message = result.throwable.userMessage(
                        "Schedule accepted, but the current schedule could not be synchronized.",
                    )
                    _scheduleMaintenanceReview.value = acceptedSyncReview.copy(message = message)
                    setError(message)
                } else {
                    if (result.rollbackFailed) {
                        maintenanceRollbackRecoveryRequired = true
                        maintenanceOperationAttempt = maintenanceOperationAttempt?.copy(
                            status = EventScheduleMaintenanceOperationAttemptStatus.FAILED,
                        )
                        val message = result.throwable.userMessage(
                            SCHEDULE_MAINTENANCE_ROLLBACK_REQUIRED_MESSAGE,
                        )
                        _scheduleMaintenanceReview.value = _scheduleMaintenanceReview.value?.copy(
                            phase = EventScheduleMaintenanceReviewPhase.STALE,
                            message = message,
                        )
                        setError(message)
                        return
                    }
                    if (!result.settingsSaved) {
                        clearScheduleMaintenanceIdentities(clearAttempt = false)
                    }
                    val message = when {
                        result.throwable is EventScheduleMaintenanceUnavailableException ->
                            SCHEDULE_MAINTENANCE_UNAVAILABLE_MESSAGE
                        result.settingsSaved -> result.fallbackMessage
                        else -> result.throwable.userMessage(result.fallbackMessage)
                    }
                    _scheduleMaintenanceReview.value = EventScheduleMaintenanceReview(
                        phase = if (result.throwable is EventEditorProposalStaleException) {
                            EventScheduleMaintenanceReviewPhase.STALE
                        } else {
                            EventScheduleMaintenanceReviewPhase.FAILED
                        },
                        message = message,
                    )
                    setError(message)
                }
            }
        }
    }

    private suspend fun rollbackScheduleMaintenanceEvent(): Boolean {
        val originalSession = maintenanceOriginalSession ?: return true
        val savedSession = maintenanceSavedSession ?: return true
        val mutation = EventEditorMutation(canonicalState = originalSession.canonicalState)
        val command = EventEditorSessionMapper.toSaveCommand(savedSession, mutation).copy(
            scheduleTransition = EventEditorSaveScheduleTransitionDto(
                mode = EventEditorScheduleTransitionMode.PRESERVE,
            ),
        )
        val outcome = try {
            eventRepository.saveEventEditor(
                originalSession.canonicalState.event.id,
                command,
                persistLocally = false,
            ).getOrThrow()
        } catch (throwable: Throwable) {
            maintenanceRollbackRecoveryRequired = true
            throw throwable
        }
        setEditorSession(outcome.session)
        // Restore server settings without replacing the organizer's setup.
        maintenanceOriginalSession = null
        maintenanceSavedSession = null
        return true
    }

    private suspend fun finishTerminalMaintenanceFailure(
        review: EventScheduleMaintenanceReview,
        phase: EventScheduleMaintenanceReviewPhase,
        message: String,
    ): EventScheduleMaintenanceReview {
        val rollbackError = try {
            rollbackScheduleMaintenanceEvent()
            null
        } catch (error: Throwable) {
            error
        }
        return if (rollbackError == null) {
            clearScheduleMaintenanceIdentities()
            review.copy(phase = phase, message = message)
        } else {
            clearScheduleMaintenanceIdentities(clearRollback = false)
            setError(SCHEDULE_MAINTENANCE_ROLLBACK_REQUIRED_MESSAGE)
            review.copy(
                phase = EventScheduleMaintenanceReviewPhase.STALE,
                message = SCHEDULE_MAINTENANCE_ROLLBACK_REQUIRED_MESSAGE,
            )
        }
    }

    fun acceptScheduleMaintenanceProposal() {
        val currentReview = _scheduleMaintenanceReview.value ?: return
        if (
            currentReview.phase !in setOf(EventScheduleMaintenanceReviewPhase.PROPOSED,
                EventScheduleMaintenanceReviewPhase.CONFIRMING_PARTIAL) ||
                maintenanceRequestInFlight
        ) {
            return
        }
        val confirmation = currentReview.requestAcceptanceConfirmation(
            isPartial = !currentReview.reviewedProposal.scheduleOutcome.isComplete,
        )
        if (confirmation != currentReview) {
            _scheduleMaintenanceReview.value = confirmation
            return
        }
        val requestGeneration = maintenanceRequestGeneration
        val acceptingReview = currentReview.copy(
            phase = EventScheduleMaintenanceReviewPhase.ACCEPTING,
            message = null,
        )
        _scheduleMaintenanceReview.value = acceptingReview
        maintenanceRequestInFlight = true
        scope.launch {
            val loadingOperation = loadingHandler().newOperation()
            loadingOperation.showLoading("Accepting schedule proposal...")
            var acceptedResult: EventEditorMaintenanceAcceptedResultDto? = null
            try {
                val proposal = currentReview.reviewedProposal
                val result = eventRepository.acceptEventScheduleMaintenance(
                    EventEditorAcceptMaintenanceProposalDto(
                        contractVersion = proposal.contractVersion,
                        eventId = proposal.eventId,
                        operation = proposal.operation,
                        operationId = proposal.operationId,
                        proposalRevision = proposal.proposalRevision,
                        acceptanceOperationId = currentReview.acceptanceOperationId,
                    ),
                ).getOrThrow().also { accepted ->
                    acceptedResult = accepted
                    acceptedMaintenanceResult = accepted
                    maintenanceOperationAttempt = maintenanceOperationAttempt?.copy(
                        status = EventScheduleMaintenanceOperationAttemptStatus.ACCEPTED_SYNC_PENDING,
                    )
                }
                refreshAcceptedSchedule(proposal.eventId)
                if (
                    requestGeneration != maintenanceRequestGeneration ||
                    _scheduleMaintenanceReview.value != acceptingReview
                ) {
                    return@launch
                }
                clearScheduleMaintenanceIdentities()
                _scheduleMaintenanceReview.value = null
                cancelEditingEvent()
                setError(maintenanceAcceptedMessage(proposal.operation, result))
            } catch (throwable: Throwable) {
                if (
                    requestGeneration != maintenanceRequestGeneration ||
                    _scheduleMaintenanceReview.value != acceptingReview
                ) {
                    return@launch
                }
                if (
                    throwable is EventEditorProposalStaleException ||
                    throwable is EventEditorMaintenanceRejectedException
                ) {
                    try {
                        rollbackScheduleMaintenanceEvent()
                    } catch (_: Throwable) {
                        clearScheduleMaintenanceIdentities(clearRollback = false)
                        val rollbackMessage = SCHEDULE_MAINTENANCE_ROLLBACK_REQUIRED_MESSAGE
                        _scheduleMaintenanceReview.value = currentReview.copy(
                            phase = EventScheduleMaintenanceReviewPhase.STALE,
                            message = rollbackMessage,
                        )
                        setError(rollbackMessage)
                        return@launch
                    }
                }
                val accepted = acceptedResult
                    ?: (throwable as? EventEditorMaintenanceAcceptedSyncPendingException)?.result
                if (throwable is EventEditorMaintenanceAcceptanceConflictException) {
                    recoverAcceptedByAnotherClient(
                        eventId = currentReview.reviewedProposal.eventId,
                        requestGeneration = requestGeneration,
                        expectedReview = acceptingReview,
                        pendingReview = currentReview,
                    )
                    return@launch
                }
                if (accepted != null) {
                    acceptedMaintenanceResult = accepted
                    maintenanceOperationAttempt = maintenanceOperationAttempt?.copy(
                        status = EventScheduleMaintenanceOperationAttemptStatus.ACCEPTED_SYNC_PENDING,
                    )
                    val message = throwable.userMessage(
                        "Schedule accepted, but the current schedule could not be synchronized.",
                    )
                    _scheduleMaintenanceReview.value = EventScheduleMaintenanceReview(
                        proposal = accepted.asMaintenanceProposal(),
                        acceptanceOperationId = accepted.acceptanceOperationId,
                        includePlaceholderTeams = currentReview.includePlaceholderTeams,
                        phase = EventScheduleMaintenanceReviewPhase.ACCEPTED_SYNC_PENDING,
                        eventTimeZone = currentReview.eventTimeZone,
                        message = message,
                    )
                    setError(message)
                } else {
                    val review = when (throwable) {
                        is EventEditorProposalStaleException -> {
                            clearScheduleMaintenanceIdentities()
                            currentReview.copy(
                                phase = EventScheduleMaintenanceReviewPhase.STALE,
                                message = throwable.userMessage(
                                    "The proposal is stale. Refresh the editor and request a new proposal.",
                                ),
                            )
                        }
                        is EventEditorMaintenanceRejectedException -> {
                            clearScheduleMaintenanceIdentities()
                            currentReview.copy(
                                phase = EventScheduleMaintenanceReviewPhase.REJECTED,
                                message = throwable.userMessage("The schedule proposal was rejected."),
                            )
                        }
                        else -> currentReview.copy(
                            phase = EventScheduleMaintenanceReviewPhase.PROPOSED,
                            message = throwable.userMessage("Unable to accept the schedule proposal."),
                        )
                    }
                    _scheduleMaintenanceReview.value = review
                }
            } finally {
                maintenanceRequestInFlight = false
                loadingOperation.hideLoading()
            }
        }
    }
    fun retryAcceptedScheduleSync() {
        val currentReview = _scheduleMaintenanceReview.value ?: return
        if (
            currentReview.phase != EventScheduleMaintenanceReviewPhase.ACCEPTED_SYNC_PENDING ||
                maintenanceRequestInFlight
        ) {
            return
        }
        val accepted = acceptedMaintenanceResult
        if (accepted == null && !acceptedByAnotherClientSyncPending) return
        val requestGeneration = maintenanceRequestGeneration
        val acceptedByAnotherClient = acceptedByAnotherClientSyncPending
        val syncingReview = currentReview.copy(message = null)
        _scheduleMaintenanceReview.value = syncingReview
        maintenanceRequestInFlight = true
        scope.launch {
            val loadingOperation = loadingHandler().newOperation()
            loadingOperation.showLoading("Refreshing accepted schedule...")
            try {
                if (acceptedByAnotherClient) {
                    refreshAcceptedScheduleAndEditor(currentReview.reviewedProposal.eventId)
                } else {
                    refreshAcceptedSchedule(currentReview.reviewedProposal.eventId)
                }
                if (
                    requestGeneration != maintenanceRequestGeneration ||
                    _scheduleMaintenanceReview.value != syncingReview
                ) {
                    return@launch
                }
                val successMessage = if (acceptedByAnotherClient) {
                    acceptedByAnotherClientMessage()
                } else {
                    "Schedule accepted. The current schedule is now shown."
                }
                clearScheduleMaintenanceIdentities()
                _scheduleMaintenanceReview.value = null
                cancelEditingEvent()
                setError(successMessage)
            } catch (throwable: Throwable) {
                if (
                    requestGeneration != maintenanceRequestGeneration ||
                    _scheduleMaintenanceReview.value != syncingReview
                ) {
                    return@launch
                }
                val message = throwable.userMessage(
                    "Schedule accepted, but the current schedule could not be synchronized.",
                )
                _scheduleMaintenanceReview.value = syncingReview.copy(message = message)
                setError(message)
            } finally {
                maintenanceRequestInFlight = false
                loadingOperation.hideLoading()
            }
        }
    }


    fun rejectScheduleMaintenanceProposal() {
        val currentReview = _scheduleMaintenanceReview.value ?: return
        if (
            currentReview.phase != EventScheduleMaintenanceReviewPhase.PROPOSED ||
                maintenanceRequestInFlight
        ) {
            return
        }
        val requestGeneration = maintenanceRequestGeneration
        val rejectingReview = currentReview.copy(
            phase = EventScheduleMaintenanceReviewPhase.REJECTING,
            message = null,
        )
        _scheduleMaintenanceReview.value = rejectingReview
        maintenanceRequestInFlight = true
        scope.launch {
            val loadingOperation = loadingHandler().newOperation()
            loadingOperation.showLoading("Rejecting schedule proposal...")
            try {
                val proposal = currentReview.reviewedProposal
                eventRepository.rejectEventScheduleMaintenance(
                    EventEditorRejectMaintenanceProposalDto(
                        contractVersion = proposal.contractVersion,
                        eventId = proposal.eventId,
                        operation = proposal.operation,
                        operationId = proposal.operationId,
                        proposalRevision = proposal.proposalRevision,
                    ),
                ).getOrThrow()
                rollbackScheduleMaintenanceEvent()
                if (
                    requestGeneration != maintenanceRequestGeneration ||
                    _scheduleMaintenanceReview.value != rejectingReview
                ) {
                    return@launch
                }
                clearScheduleMaintenanceIdentities()
                _scheduleMaintenanceReview.value = currentReview.copy(
                    phase = EventScheduleMaintenanceReviewPhase.REJECTED,
                    message = "The schedule proposal was rejected. Request a new proposal to try again.",
                )
            } catch (throwable: Throwable) {
                if (
                    requestGeneration != maintenanceRequestGeneration ||
                    _scheduleMaintenanceReview.value != rejectingReview
                ) {
                    return@launch
                }
                if (throwable is EventEditorMaintenanceAcceptanceConflictException) {
                    recoverAcceptedByAnotherClient(
                        eventId = currentReview.reviewedProposal.eventId,
                        requestGeneration = requestGeneration,
                        expectedReview = rejectingReview,
                        pendingReview = currentReview,
                    )
                    return@launch
                }
                val review = when (throwable) {
                    is EventEditorProposalStaleException -> {
                        finishTerminalMaintenanceFailure(
                            review = currentReview,
                            phase = EventScheduleMaintenanceReviewPhase.STALE,
                            message = throwable.userMessage(
                                "The proposal is stale. Refresh the editor and request a new proposal.",
                            ),
                        )
                    }
                    is EventEditorMaintenanceRejectedException -> {
                        finishTerminalMaintenanceFailure(
                            review = currentReview,
                            phase = EventScheduleMaintenanceReviewPhase.REJECTED,
                            message = throwable.userMessage("The schedule proposal was already rejected."),
                        )
                    }
                    else -> currentReview.copy(
                        phase = EventScheduleMaintenanceReviewPhase.PROPOSED,
                        message = throwable.userMessage("Unable to reject the schedule proposal."),
                    )
                }
                _scheduleMaintenanceReview.value = review
            } finally {
                maintenanceRequestInFlight = false
                loadingOperation.hideLoading()
            }
        }
    }

    fun dismissScheduleMaintenanceReview() {
        val review = _scheduleMaintenanceReview.value ?: return
        if (review.phase == EventScheduleMaintenanceReviewPhase.CONFIRMING_PARTIAL) {
            _scheduleMaintenanceReview.value = review.cancelConfirmation()
            return
        }
        if (isScheduleMaintenanceReviewDismissBlocked()) {
            return
        }
        _scheduleMaintenanceReview.value = review.copy(isVisible = false)
        if (maintenanceRollbackRecoveryRequired) return
        if (maintenanceOriginalSession != null) {
            maintenanceRequestInFlight = true
            _scheduleMaintenanceReview.value = _scheduleMaintenanceReview.value?.copy(
                phase = EventScheduleMaintenanceReviewPhase.REJECTING,
            )
            scope.launch {
                try {
                    rollbackScheduleMaintenanceEvent()
                    maintenanceRequestGeneration += 1
                    clearScheduleMaintenanceIdentities()
                    _scheduleMaintenanceReview.value = null
                } catch (error: Throwable) {
                    _scheduleMaintenanceReview.value = _scheduleMaintenanceReview.value?.copy(
                        phase = EventScheduleMaintenanceReviewPhase.STALE,
                        message = error.userMessage(SCHEDULE_MAINTENANCE_ROLLBACK_REQUIRED_MESSAGE),
                    )
                } finally {
                    maintenanceRequestInFlight = false
                }
            }
            return
        }
        maintenanceRequestGeneration += 1
        clearScheduleMaintenanceIdentities()
        _scheduleMaintenanceReview.value = null
    }

    fun requestFreshScheduleMaintenanceProposal() {
        val review = _scheduleMaintenanceReview.value ?: return
        if (review.phase == EventScheduleMaintenanceReviewPhase.FAILED && !maintenanceRollbackRecoveryRequired) {
            lastMaintenanceAction?.let(::requestScheduleMaintenanceAction)
            return
        }
        if (
            review.phase != EventScheduleMaintenanceReviewPhase.STALE &&
            review.phase != EventScheduleMaintenanceReviewPhase.REJECTED
        ) {
            return
        }
        if (maintenanceRequestInFlight) return
        val requiresFreshRecovery = maintenanceRollbackRecoveryRequired
        if (!requiresFreshRecovery) {
            clearScheduleMaintenanceIdentities()
        }
        val requestGeneration = ++maintenanceRequestGeneration
        maintenanceRequestInFlight = true
        scope.launch {
            try {
                val eventId = review.proposal?.eventId ?: selectedEvent().id
                val freshSession = eventRepository.getEventEditor(eventId).getOrThrow()
                if (
                    requestGeneration != maintenanceRequestGeneration ||
                    _scheduleMaintenanceReview.value != review
                ) {
                    return@launch
                }
                val action = (if (review.proposal != null) review.requestedAction() else lastMaintenanceAction)
                    ?: return@launch
                setEditorSession(freshSession)
                if (!requiresFreshRecovery) {
                    seedEditableDraft(
                        selectedEvent = freshSession.canonicalState.event,
                        canonicalState = freshSession.canonicalState,
                    )
                }
                if (requiresFreshRecovery) {
                    clearScheduleMaintenanceIdentities()
                }
                if (!action.isAvailableIn(freshSession.snapshot, currentUserId())) {
                    _scheduleMaintenanceReview.value = review.copy(
                        message = SCHEDULE_MAINTENANCE_UNAVAILABLE_MESSAGE,
                    )
                    setError(SCHEDULE_MAINTENANCE_UNAVAILABLE_MESSAGE)
                    return@launch
                }
                _scheduleMaintenanceReview.value = review.copy(phase = EventScheduleMaintenanceReviewPhase.REFRESHING)
                val result = runScheduleMaintenanceAction(action)
                if (requestGeneration != maintenanceRequestGeneration) {
                    return@launch
                }
                handleScheduleMaintenanceActionResult(
                    result = result,
                    requestGeneration = requestGeneration,
                )
            } catch (throwable: Throwable) {
                if (requestGeneration != maintenanceRequestGeneration) {
                    return@launch
                }
                val message = throwable.userMessage("Unable to refresh the schedule proposal.")
                _scheduleMaintenanceReview.value = review.copy(message = message)
                setError(message)
            } finally {
                maintenanceRequestInFlight = false
            }
        }
    }

    private suspend fun refreshAcceptedSchedule(eventId: String): Event {
        val event = selectedEvent()
        require(event.id == eventId) { "The selected Event changed during Schedule recovery." }
        val refreshedEvent = eventRepository.syncEventDetail(event, occurrence = null, manage = true)
            .getOrThrow().event
        refreshLeagueStandingsAfterSchedule(refreshedEvent)
        return refreshedEvent
    }
    private suspend fun refreshAcceptedScheduleAndEditor(eventId: String) {
        refreshAcceptedSchedule(eventId)
        eventRepository.getEventEditor(eventId)
            .getOrThrow()
            .also(::setEditorSession)
    }

    private fun acceptedByAnotherClientMessage(): String =
        "Schedule accepted by another client. The current schedule is now shown."

    private fun acceptedByAnotherClientSyncFailureMessage(throwable: Throwable): String =
        "Schedule was accepted by another client, but the current schedule could not be synchronized. " +
            throwable.userMessage("Retry sync.")
    private suspend fun recoverAcceptedByAnotherClient(
        eventId: String,
        requestGeneration: Long,
        expectedReview: EventScheduleMaintenanceReview,
        pendingReview: EventScheduleMaintenanceReview,
    ) {
        val refreshFailure = runCatching {
            refreshAcceptedScheduleAndEditor(eventId)
        }.exceptionOrNull()
        if (
            requestGeneration != maintenanceRequestGeneration ||
            _scheduleMaintenanceReview.value != expectedReview
        ) {
            return
        }
        if (refreshFailure == null) {
            val message = acceptedByAnotherClientMessage()
            clearScheduleMaintenanceIdentities()
            _scheduleMaintenanceReview.value = null
            cancelEditingEvent()
            setError(message)
        } else {
            acceptedByAnotherClientSyncPending = true
            val message = acceptedByAnotherClientSyncFailureMessage(refreshFailure)
            _scheduleMaintenanceReview.value = pendingReview.copy(
                phase = EventScheduleMaintenanceReviewPhase.ACCEPTED_SYNC_PENDING,
                message = message,
            )
            setError(message)
        }
    }


    private fun maintenanceAcceptedMessage(
        operation: EventEditorMaintenanceOperation,
        result: com.razumly.mvp.core.network.dto.EventEditorMaintenanceAcceptedResultDto,
    ): String {
        val operationMessage = when (operation) {
            EventEditorMaintenanceOperation.BUILD -> "Schedule built."
            EventEditorMaintenanceOperation.COMPLETE -> "Schedule completed."
            EventEditorMaintenanceOperation.REBUILD -> "Schedule rebuilt."
        }
        val outcomeMessage = when (result.scheduleOutcome.status) {
            EventEditorMaintenanceScheduleOutcomeStatus.COMPLETE -> operationMessage
            EventEditorMaintenanceScheduleOutcomeStatus.INCOMPLETE ->
                "$operationMessage ${result.scheduleOutcome.unplacedMatchCount} matches remain unplaced."
        }
        val warnings = result.scheduleOutcome.warnings
            .map { warning -> warning.message }
            .filter(String::isNotBlank)
        return (listOf(outcomeMessage) + warnings).joinToString("\n")
    }

    fun createTemplateFromCurrentEvent() {
        scope.launch {
            val sourceEvent = if (editDraftCoordinator.isEditing.value) {
                editDraftCoordinator.editedEvent.value
            } else {
                selectedEvent()
            }
            val loadingOperation = loadingHandler().newOperation()
            when (val result = editActionCoordinator.runCreateTemplateAction(
                sourceEvent = sourceEvent,
                createTemplate = { sourceEventId ->
                    eventRepository.createEventTemplateFromEvent(sourceEventId).getOrThrow()
                },
                showLoading = loadingOperation::showLoading,
                hideLoading = loadingOperation::hideLoading,
            )) {
                is EventTemplateCreateResult.AlreadyTemplate -> setError(result.message)
                is EventTemplateCreateResult.OrganizationManaged -> setError(result.message)
                is EventTemplateCreateResult.Success -> setError(result.message)
                is EventTemplateCreateResult.Failure -> {
                    setError(result.throwable.userMessage(result.fallbackMessage))
                }
            }
        }
    }

    fun publishEvent() {
        scope.launch {
            val loadingOperation = loadingHandler().newOperation()
            when (val result = editActionCoordinator.runPublishEventAction(
                currentEvent = selectedEvent(),
                updateEvent = ::saveEventThroughEditor,
                refreshEvent = { eventId -> eventRepository.getEvent(eventId) },
                showLoading = loadingOperation::showLoading,
                hideLoading = loadingOperation::hideLoading,
            )) {
                EventPublishResult.AlreadyPublished,
                EventPublishResult.Success -> Unit
                is EventPublishResult.Failure -> {
                    setError(result.throwable.userMessage(result.fallbackMessage))
                }
            }
        }
    }

    fun selectPlace(place: MVPPlace?) {
        editEventField {
            copy(
                coordinates = place?.coordinates ?: listOf(0.0, 0.0),
                location = place?.name ?: "",
                address = place?.address,
            )
        }
    }

    fun onTypeSelected(type: EventType) {
        val previous = editDraftCoordinator.editedEvent.value
        val preserveLeagueTournamentChoice =
            previous.eventType == EventType.LEAGUE || previous.eventType == EventType.TOURNAMENT
        val isAutomatedScheduling = normalizeAutomatedSchedulingForEventType(
            eventType = type,
            value = if (
                preserveLeagueTournamentChoice &&
                    (type == EventType.LEAGUE || type == EventType.TOURNAMENT)
            ) {
                previous.isAutomatedScheduling
            } else {
                defaultAutomatedSchedulingForEventType(type)
            },
        )
        editEventField {
            copy(
                eventType = type,
                isAutomatedScheduling = isAutomatedScheduling,
                noFixedEndDateTime = when {
                    type == EventType.TRYOUT -> false
                    type == EventType.WEEKLY_EVENT -> noFixedEndDateTime
                    isAutomatedScheduling -> noFixedEndDateTime
                    else -> false
                },
            )
        }
    }

    fun selectFieldCount(count: Int) {
        val event = editDraftCoordinator.editedEvent.value
        val resourceLabels = resolveEventResourceLabels(
            sportIds = event.sportIds,
            sports = sportsCatalogCoordinator.currentSports(),
        )
        editDraftCoordinator.selectFieldCount(count, resourceLabels.singular)
    }

    fun updateLocalFieldName(index: Int, name: String) =
        editDraftCoordinator.updateLocalFieldName(index, name)

    fun setRentalResourceSelected(optionId: String, selected: Boolean) {
        if (rentalResourcesCoordinator.setSelected(optionId, selected)) {
            syncSelectedRentalResourcesIntoEditDraft()
        }
    }

    fun updateLeagueScoringConfig(update: LeagueScoringConfigDTO.() -> LeagueScoringConfigDTO) =
        editDraftCoordinator.updateLeagueScoringConfig(update)

    fun addLeagueTimeSlot() = editDraftCoordinator.addLeagueTimeSlot()

    fun updateLeagueTimeSlot(index: Int, update: TimeSlot.() -> TimeSlot) {
        editDraftCoordinator.updateLeagueTimeSlot(
            index = index,
            update = update,
            normalizeSlotResourceSelection = ::normalizeRentalSlotResourceSelection,
        )
    }

    fun removeLeagueTimeSlot(index: Int) = editDraftCoordinator.removeLeagueTimeSlot(index)

    fun loadAvailableRentalResources(eventId: String) {
        scope.launch {
            billingRepository.listRentalResourceOptions(eventId = eventId.takeIf(String::isNotBlank))
                .onSuccess { options ->
                    val changedSelection = rentalResourcesCoordinator.applyLoadedResources(
                        options = options,
                        slots = editorSession?.canonicalState?.timeSlots
                            ?: editDraftCoordinator.editableLeagueTimeSlots.value,
                        eventId = eventId,
                    )
                    if (changedSelection && editDraftCoordinator.isEditing.value) {
                        syncSelectedRentalResourcesIntoEditDraft()
                    }
                }
                .onFailure { error ->
                    Napier.w("Unable to load event rental resources: ${error.message}")
                }
        }
    }

    private fun normalizeRentalSlotResourceSelection(
        slot: TimeSlot,
        validFieldIds: Set<String> = editDraftCoordinator.editableFieldIds(),
    ): TimeSlot = rentalResourcesCoordinator.normalizeSlotResourceSelection(slot, validFieldIds)

    private fun syncSelectedRentalResourcesIntoEditDraft() {
        val draft = rentalResourcesCoordinator.buildEditDraft(
            event = editDraftCoordinator.editedEvent.value,
            currentFields = editDraftCoordinator.editableFields.value,
            currentSlots = editDraftCoordinator.editableLeagueTimeSlots.value,
            defaultDivisionIds = defaultFieldDivisions(editDraftCoordinator.editedEvent.value),
        )
        editDraftCoordinator.applyRentalDraft(draft)
    }

    private fun selectedRentalResourceFields(): List<Field> =
        rentalResourcesCoordinator.selectedFields(rentalResourcesCoordinator.selectedOptions())

    private suspend fun savePreparedEventThroughEditor(
        prepared: PreparedEventForUpdate,
        pendingStaffInvites: List<PendingStaffInviteDraft>,
        scheduleTransitionOverride: EventEditorSaveScheduleTransitionDto? = null,
        persistLocally: Boolean = true,
    ): EventEditorSaveOutcome {
        val session = editorSession ?: eventRepository.getEventEditor(prepared.event.id)
            .getOrThrow()
            .also { loaded -> setEditorSession(loaded) }
        val baseline = session.canonicalState
        val mutation = EventEditorMutation(
            canonicalState = EventEditorCanonicalState(
                event = prepared.event,
                fields = prepared.fields ?: baseline.fields,
                timeSlots = prepared.timeSlots ?: baseline.timeSlots,
                leagueScoringConfig = prepared.leagueScoringConfig ?: baseline.leagueScoringConfig,
                questions = baseline.questions,
                pendingStaffInvites = mergeCanonicalStaffInvites(
                    eventId = prepared.event.id,
                    existing = baseline.pendingStaffInvites,
                    pending = pendingStaffInvites,
                ),
                playoffDivisionDetails = baseline.playoffDivisionDetails,
                divisionFieldIds = baseline.divisionFieldIds,
            ),
        )
        val mappedCommand = EventEditorSessionMapper.toSaveCommand(session, mutation)
        val command = scheduleTransitionOverride?.let { transition ->
            mappedCommand.copy(scheduleTransition = transition)
        } ?: mappedCommand
        val outcome = eventRepository.saveEventEditor(
            prepared.event.id,
            command,
            persistLocally = persistLocally,
        ).getOrThrow()
        setEditorSession(outcome.session)
        if (persistLocally) {
            eventRepository.updateLocalEvent(outcome.session.canonicalState.event).getOrThrow()
        }
        return outcome
    }

    private suspend fun saveEventThroughEditor(event: Event): Result<Event> = runCatching {
        savePreparedEventThroughEditor(
            prepared = PreparedEventForUpdate(event = event),
            pendingStaffInvites = inviteCoordinator.pendingStaffInvites.value,
        ).session.canonicalState.event
    }

    private fun mergeCanonicalStaffInvites(
        eventId: String,
        existing: List<Invite>,
        pending: List<PendingStaffInviteDraft>,
    ): List<Invite> {
        val merged = existing.associateBy { invite -> normalizeStaffInviteEmail(invite.email) }
            .toMutableMap()
        pending.map(PendingStaffInviteDraft::normalized).forEach { draft ->
            if (draft.email.isBlank()) return@forEach
            val current = merged[draft.email]
            merged[draft.email] = Invite(
                type = current?.type?.ifBlank { "STAFF" } ?: "STAFF",
                email = draft.email,
                status = current?.status,
                staffTypes = draft.roles.map(EventStaffRole::toInviteStaffType).distinct().sorted(),
                eventId = eventId,
                organizationId = current?.organizationId,
                teamId = current?.teamId,
                userId = draft.resolvedUserId ?: current?.userId,
                createdBy = current?.createdBy,
                firstName = draft.firstName.ifBlank { current?.firstName },
                lastName = draft.lastName.ifBlank { current?.lastName },
                id = current?.id.orEmpty(),
            )
        }
        return merged.values.toList()
    }

    private fun prepareEventForUpdate(): PreparedEventForUpdate {
        val currentFields = editDraftCoordinator.editableFields.value
        val currentTimeSlots = editDraftCoordinator.editableLeagueTimeSlots.value
        val baseline = editorSession?.canonicalState
        val result = EventEditPayloadBuilder.prepareForUpdate(
            EventEditPayloadInput(
                editedEvent = editDraftCoordinator.editedEvent.value.copy(
                    matchRulesOverride = matchRulesOverrideWithoutSegmentCount(
                        editDraftCoordinator.editedEvent.value.matchRulesOverride,
                    ),
                ),
                editableFields = currentFields,
                editableLeagueTimeSlots = currentTimeSlots,
                selectedRentalFields = selectedRentalResourceFields(),
                leagueScoringConfig = editDraftCoordinator.editableLeagueScoringConfig.value,
                resourceLabelSingular = resolveEventResourceLabels(
                    sportIds = editDraftCoordinator.editedEvent.value.sportIds,
                    sports = sportsCatalogCoordinator.currentSports(),
                ).singular,
                originalEventStart = eventWithRelations().event.start,
                normalizeSlotResourceSelection = { slot, validFieldIds ->
                    normalizeRentalSlotResourceSelection(slot, validFieldIds)
                },
            ),
        ).omitUnchangedManagedCollections(
            currentFields = currentFields,
            baselineFields = baseline?.fields,
            currentTimeSlots = currentTimeSlots,
            baselineTimeSlots = baseline?.timeSlots,
        )
        result.editableFields?.let(editDraftCoordinator::applyPreparedEditableFields)
        return result.prepared
    }

    private fun logPreparedFieldOwnership(action: String, prepared: PreparedEventForUpdate) {
        val eventOrgId = prepared.event.organizationId?.trim()?.takeIf(String::isNotBlank)
        val fieldOwnership = prepared.fields
            .orEmpty()
            .joinToString(separator = ", ") { field ->
                val fieldOrg = field.organizationId?.trim()?.takeIf(String::isNotBlank) ?: "null"
                "${field.id}:$fieldOrg"
            }
        Napier.i(
            "Event ownership payload [$action] eventId=${prepared.event.id} " +
                "eventOrg=${eventOrgId ?: "null"} fieldOwnership=[$fieldOwnership]",
        )
    }
}
