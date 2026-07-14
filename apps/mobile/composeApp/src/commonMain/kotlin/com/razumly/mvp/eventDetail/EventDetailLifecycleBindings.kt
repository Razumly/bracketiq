package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.presentation.PaymentResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

private data class EventTeamCheckInLifecycleKey(
    val eventId: String,
    val organizationId: String,
    val userId: String,
    val managedTeamId: String,
)

private data class WithdrawTargetsRefreshKey(
    val eventId: String,
    val occurrenceKey: String?,
    val teamSignup: Boolean,
    val eventType: EventType,
    val playerIds: List<String>,
    val waitListIds: List<String>,
    val freeAgentIds: List<String>,
    val teamIds: List<String>,
)

internal data class EventDetailReadOnlyDraftBindingState(
    val relations: EventWithFullRelations,
    val fields: List<Field>,
    val editing: Boolean,
)

/**
 * Starts the component-owned collectors that connect lifecycle state to focused
 * coordinators and side effects. Each binding is intentionally narrow and returns
 * its child [Job] for direct cancellation tests; the supplied component scope still
 * owns every job in production.
 */
internal class EventDetailLifecycleBindings(
    private val scope: CoroutineScope,
) {
    fun bindOrganizationTemplates(
        selectedEvent: Flow<Event>,
        loadTemplates: suspend (String) -> Unit,
    ): Job = scope.launch {
        selectedEvent
            .map { event -> event.organizationId?.trim().orEmpty() }
            .distinctUntilChanged()
            .collect(loadTemplates)
    }

    fun bindSelectedEventResources(
        selectedEvent: Flow<Event>,
        onEventChanged: suspend (String) -> Unit,
    ): Job = scope.launch {
        selectedEvent
            .map { event -> event.id.trim() }
            .distinctUntilChanged()
            .collectLatest(onEventChanged)
    }

    fun bindScheduleTrackedUser(
        currentUser: Flow<UserData>,
        onUserChanged: suspend () -> Unit,
    ): Job = scope.launch {
        currentUser
            .map { user -> user.id }
            .distinctUntilChanged()
            .collect { onUserChanged() }
    }

    fun bindRegistrationScope(
        selectedEvent: Flow<Event>,
        currentUser: Flow<UserData>,
        selectedWeeklyOccurrence: Flow<SelectedWeeklyOccurrenceState?>,
        onMissingScope: () -> Unit,
        onScopeChanged: suspend (eventId: String) -> Unit,
    ): Job = scope.launch {
        combine(
            selectedEvent.map { event -> event.id.trim() },
            currentUser.map { user -> user.id.trim() },
            selectedWeeklyOccurrence,
        ) { eventId, userId, occurrence ->
            Triple(eventId, userId, occurrence)
        }
            .distinctUntilChanged()
            .collectLatest { (eventId, userId, _) ->
                if (eventId.isBlank() || userId.isBlank()) {
                    onMissingScope()
                } else {
                    onScopeChanged(eventId)
                }
            }
    }

    fun bindSelectedEventMode(
        selectedEvent: Flow<Event>,
        onWeeklyParentChanged: (Boolean) -> Unit,
    ): Job = scope.launch {
        selectedEvent
            .map { event -> event.id to isWeeklyParentEvent(event) }
            .distinctUntilChanged()
            .collect { (_, weeklyParent) -> onWeeklyParentChanged(weeklyParent) }
    }

    fun bindEventTeamCheckIns(
        selectedEvent: Flow<Event>,
        eventWithRelations: Flow<EventWithFullRelations>,
        currentUser: Flow<UserData>,
        currentUserManagedEventTeamId: Flow<String?>,
        onScopeChanged: suspend () -> Unit,
    ): Job = scope.launch {
        combine(
            selectedEvent,
            eventWithRelations,
            currentUser,
            currentUserManagedEventTeamId,
        ) { event, relations, user, managedTeamId ->
            EventTeamCheckInLifecycleKey(
                eventId = event.id,
                organizationId = relations.organization?.id.orEmpty(),
                userId = user.id,
                managedTeamId = managedTeamId.orEmpty(),
            )
        }
            .distinctUntilChanged()
            .collect { onScopeChanged() }
    }

    fun bindWeeklyOccurrence(
        selectedWeeklyOccurrence: Flow<SelectedWeeklyOccurrenceState?>,
        onSelectionChanged: suspend (SelectedWeeklyOccurrenceState?) -> Unit,
    ): Job = scope.launch {
        selectedWeeklyOccurrence.collectLatest(onSelectionChanged)
    }

    fun bindParticipantLocalState(
        localStates: Flow<ParticipantManagementLocalState>,
        applyLocalState: (ParticipantManagementLocalState) -> Unit,
    ): Job = scope.launch {
        localStates.collect(applyLocalState)
    }

    fun bindManagedParticipantBootstrap(
        targets: Flow<ParticipantManagementRoomTarget?>,
        refresh: suspend (ParticipantManagementRoomTarget?) -> Unit,
    ): Job = scope.launch {
        targets.collectLatest(refresh)
    }

    fun <RegistrationState, TeamState> bindMembershipSources(
        registrations: Flow<RegistrationState>,
        currentUserTeams: Flow<TeamState>,
        selectedEvent: StateFlow<Event>,
        refreshMembership: suspend (Event) -> Unit,
    ): Job = scope.launch {
        combine(registrations, currentUserTeams) { registrationState, teamState ->
            registrationState to teamState
        }.collect {
            refreshMembership(selectedEvent.value)
        }
    }

    fun bindEditingBackCallback(
        isEditing: Flow<Boolean>,
        setEnabled: (Boolean) -> Unit,
    ): Job = scope.launch {
        isEditing.collect(setEnabled)
    }

    fun bindDetailsBackCallback(
        showDetails: Flow<Boolean>,
        setEnabled: (Boolean) -> Unit,
    ): Job = scope.launch {
        showDetails.collect(setEnabled)
    }

    fun bindPaymentResults(
        paymentResults: Flow<PaymentResult?>,
        onPaymentResult: suspend (PaymentResult) -> Unit,
    ): Job = scope.launch {
        paymentResults.collect { result ->
            if (result != null) {
                onPaymentResult(result)
            }
        }
    }

    fun bindMatchRealtime(
        selectedEventId: Flow<String>,
        isEditing: Flow<Boolean>,
        isEditingMatches: Flow<Boolean>,
        resetIgnoredMatch: () -> Unit,
        subscribe: suspend (String) -> Unit,
        setEditingPaused: (Boolean) -> Unit,
        unsubscribe: suspend () -> Unit,
    ): Job = scope.launch {
        resetIgnoredMatch()
        try {
            combine(
                selectedEventId,
                isEditing,
                isEditingMatches,
            ) { eventId, editing, editingMatches ->
                Triple(eventId, editing, editingMatches)
            }.collectLatest { (eventId, editing, editingMatches) ->
                if (eventId.isBlank()) {
                    setEditingPaused(false)
                    unsubscribe()
                } else {
                    subscribe(eventId)
                    setEditingPaused(editing || editingMatches)
                }
            }
        } finally {
            setEditingPaused(false)
            unsubscribe()
        }
    }

    fun bindEventRelations(
        eventWithRelations: Flow<EventWithFullRelations>,
        onRelationsChanged: suspend (EventWithFullRelations) -> Unit,
    ): Job = scope.launch {
        eventWithRelations.collect(onRelationsChanged)
    }

    fun bindSelectedEventMembership(
        selectedEvent: Flow<Event>,
        refreshMembership: suspend (Event) -> Unit,
    ): Job = scope.launch {
        selectedEvent.collect(refreshMembership)
    }

    fun bindDefaultDivision(
        selectedEvent: Flow<Event>,
        onDefaultDivisionChanged: suspend (String?) -> Unit,
    ): Job = scope.launch {
        selectedEvent
            .map(Event::resolveDefaultSelectedDivisionId)
            .distinctUntilChanged()
            .collect(onDefaultDivisionChanged)
    }

    fun bindWithdrawTargets(
        selectedEvent: Flow<Event>,
        selectedWeeklyOccurrence: Flow<SelectedWeeklyOccurrenceState?>,
        refreshWithdrawTargets: suspend (Event) -> Unit,
    ): Job = scope.launch {
        combine(selectedEvent, selectedWeeklyOccurrence) { event, occurrence ->
            event.toWithdrawTargetsRefreshKey(occurrence) to event
        }
            .distinctUntilChanged { old, new -> old.first == new.first }
            .collect { (_, event) -> refreshWithdrawTargets(event) }
    }

    fun bindReadOnlyDraft(
        eventWithRelations: Flow<EventWithFullRelations>,
        eventFields: Flow<List<FieldWithMatches>>,
        isEditing: Flow<Boolean>,
        onStateChanged: suspend (EventDetailReadOnlyDraftBindingState) -> Unit,
    ): Job = scope.launch {
        combine(eventWithRelations, eventFields, isEditing) { relations, fieldsWithMatches, editing ->
            EventDetailReadOnlyDraftBindingState(
                relations = relations,
                fields = fieldsWithMatches.map { relation -> relation.field },
                editing = editing,
            )
        }.collect(onStateChanged)
    }

    fun bindSelectedDivision(
        selectedDivision: Flow<String?>,
        onSelectedDivisionChanged: suspend (String?) -> Unit,
    ): Job = scope.launch {
        selectedDivision.collect(onSelectedDivisionChanged)
    }

    fun bindLeagueStandings(
        selectedEvent: Flow<Event>,
        selectedDivision: Flow<String?>,
        resolveTarget: (Event, String?) -> LeagueStandingsLoadTarget?,
        loadTarget: suspend (LeagueStandingsLoadTarget?) -> Unit,
    ): Job = scope.launch {
        combine(selectedEvent, selectedDivision, resolveTarget)
            .distinctUntilChanged()
            .collect(loadTarget)
    }

    fun <T> bindDivisionMatches(
        divisionMatches: Flow<T>,
        onMatchesChanged: () -> Unit,
    ): Job = scope.launch {
        divisionMatches.collect { onMatchesChanged() }
    }
}

private fun Event.toWithdrawTargetsRefreshKey(
    occurrence: SelectedWeeklyOccurrenceState?,
): WithdrawTargetsRefreshKey = WithdrawTargetsRefreshKey(
    eventId = id.trim(),
    occurrenceKey = weeklyOccurrenceSummaryKey(
        slotId = occurrence?.slotId,
        occurrenceDate = occurrence?.occurrenceDate,
    ),
    teamSignup = teamSignup,
    eventType = eventType,
    playerIds = playerIds.normalizedDistinctIds(),
    waitListIds = waitList.normalizedDistinctIds(),
    freeAgentIds = freeAgents.normalizedDistinctIds(),
    teamIds = teamIds.normalizedDistinctIds(),
)

private fun List<String>.normalizedDistinctIds(): List<String> =
    map(String::trim)
        .filter(String::isNotBlank)
        .distinct()
