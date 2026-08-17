package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.resolveEventResourceLabels
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventEditorCanonicalState
import com.razumly.mvp.core.data.repositories.EventEditorMutation
import com.razumly.mvp.core.data.repositories.EventEditorSaveOutcome
import com.razumly.mvp.core.data.repositories.EventEditorSession
import com.razumly.mvp.core.data.repositories.EventEditorSessionMapper
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.network.dto.EventEditorScheduleRequestDto
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.eventDetail.data.IMatchRepository
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow


data class EventTypeTransitionConfirmation(
    val message: String,
    val actionLabel: String,
    val destinationEventType: EventType,
)
internal class EventEditActionHandler(
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

    fun toggleEdit() {
        if (editDraftCoordinator.isEditing.value) {
            cancelEditingEvent()
        } else {
            startEditingEvent()
        }
    }

    fun startEditingEvent() {
        if (editDraftCoordinator.isEditing.value) return
        val requestId = ++editStartRequestId
        val currentEvent = selectedEvent()
        scope.launch {
            val session = eventRepository.getEventEditor(currentEvent.id)
                .getOrElse { throwable ->
                    if (requestId == editStartRequestId) {
                        setError(throwable.userMessage("Failed to load the event editor."))
                    }
                    return@launch
                }
            if (requestId != editStartRequestId || editDraftCoordinator.isEditing.value) {
                return@launch
            }
            setEventEditMode(enabled = true, seedSession = session)
        }
    }

    fun cancelEditingEvent() {
        editStartRequestId += 1
        _eventTypeTransitionConfirmation.value = null
        setEventEditMode(enabled = false)
    }

    private fun setEventEditMode(
        enabled: Boolean,
        seedEvent: Event? = null,
        seedSession: EventEditorSession? = null,
    ) {
        val rawSelected = seedSession?.canonicalState?.event ?: seedEvent ?: selectedEvent()
        val selected = if (rawSelected.eventType == EventType.WEEKLY_EVENT) {
            rawSelected.copy(noFixedEndDateTime = false)
        } else {
            rawSelected
        }
        val unsupportedFeatures = mobileEventEditUnsupportedFeatures(selected)
        if (enabled && unsupportedFeatures.isNotEmpty()) {
            setError(mobileEventEditUnsupportedMessage(unsupportedFeatures))
            return
        }
        if (editDraftCoordinator.isEditing.value == enabled) return
        if (enabled && !sportsCatalogCoordinator.isCatalogLoaded()) {
            loadSports(true)
        }

        if (enabled) {
            editorSession = seedSession ?: editorSession
            val canonical = editorSession?.canonicalState
            val seededEvent = if (sportsCatalogCoordinator.currentSports().isNotEmpty()) {
                sportsCatalogCoordinator.syncOfficialStaffingForSportTransition(
                    previous = selected,
                    updated = selected,
                )
            } else {
                selected
            }
            editDraftCoordinator.seedDraftForEditing(
                event = seededEvent,
                sourceFields = canonical?.fields ?: eventFields().map { relation -> relation.field },
                timeSlots = canonical?.timeSlots ?: eventWithRelations().timeSlots,
                resourceLabelSingular = resolveEventResourceLabels(
                    sportIds = seededEvent.sportIds,
                    sports = sportsCatalogCoordinator.currentSports(),
                ).singular,
                leagueScoringConfig = canonical?.leagueScoringConfig
                    ?: eventWithRelations().leagueScoringConfig?.toDto()
                    ?: LeagueScoringConfigDTO(),
            )
            editDraftCoordinator.setControlLocks(
                immutableFieldNames = editorSession?.snapshot?.immutable?.fieldNames?.toSet().orEmpty(),
                eventTypeHasProtectedHistory =
                    editorSession?.snapshot?.scheduleState?.hasProtectedHistory == true,
            )
            val changedRentalSelection = rentalResourcesCoordinator.setAttachedResourceSelection(
                slots = editDraftCoordinator.editableLeagueTimeSlots.value,
                eventId = seededEvent.id,
            )
            if (changedRentalSelection && rentalResourcesCoordinator.selectedResourceIds.value.isNotEmpty()) {
                syncSelectedRentalResourcesIntoEditDraft()
            }
        } else {
            editorSession = null
            inviteCoordinator.clearPendingStaffInvites()
            inviteCoordinator.clearSuggestedUsers()
        }
        editDraftCoordinator.setEditing(enabled)
    }

    fun editEventField(update: Event.() -> Event) {
        editDraftCoordinator.updateEditedEvent { previous ->
            sportsCatalogCoordinator.syncOfficialStaffingForSportTransition(
                previous = previous,
                updated = previous.update(),
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
        val matchCount = session.snapshot.scheduleState.matchCount
        val resourceLabels = resolveEventResourceLabels(
            sportIds = session.canonicalState.event.sportIds,
            sports = sportsCatalogCoordinator.currentSports(),
        )
        return when {
            (nextType == EventType.LEAGUE || nextType == EventType.TOURNAMENT) && matchCount > 0 ->
                EventTypeTransitionConfirmation(
                    message = "Changing this event from $previousLabel to $nextLabel will rebuild " +
                        "its $matchCount scheduled matches. Match times, ${resourceLabels.plural.lowercase()}, seeds, and " +
                        "official assignments can change.",
                    actionLabel = "Change type & rebuild schedule",
                    destinationEventType = nextType,
                )
            nextType == EventType.LEAGUE || nextType == EventType.TOURNAMENT ->
                EventTypeTransitionConfirmation(
                    message = "Changing this event from $previousLabel to $nextLabel will build a schedule.",
                    actionLabel = "Change type & build schedule",
                    destinationEventType = nextType,
                )
            matchCount > 0 ->
                EventTypeTransitionConfirmation(
                    message = "Changing this event from $previousLabel to $nextLabel will delete " +
                        "its $matchCount scheduled matches.",
                    actionLabel = "Change type & delete schedule",
                    destinationEventType = nextType,
                )
            else -> EventTypeTransitionConfirmation(
                message = "Changing this event from $previousLabel to $nextLabel will not create a schedule.",
                actionLabel = "Change type",
                destinationEventType = nextType,
            )
        }
    }

    fun rescheduleEvent() = runScheduleEditAction(EventScheduleEditAction.RESCHEDULE)

    fun buildSchedule() = runScheduleEditAction(
        if (eventWithRelations().matches.isEmpty()) {
            EventScheduleEditAction.BUILD_SCHEDULE
        } else {
            EventScheduleEditAction.REBUILD_SCHEDULE
        },
    )

    fun rebuildWithoutPlaceholderTeams() =
        runScheduleEditAction(EventScheduleEditAction.REBUILD_WITHOUT_PLACEHOLDER_TEAMS)

    private fun runScheduleEditAction(action: EventScheduleEditAction) {
        scope.launch {
            val loadingOperation = loadingHandler().newOperation()
            when (val result = editActionCoordinator.runScheduleEditAction(
                action = action,
                prepareEventForUpdate = ::prepareEventForUpdate,
                logPreparedFieldOwnership = ::logPreparedFieldOwnership,
                updateEvent = { prepared ->
                    savePreparedEventThroughEditor(
                        prepared = prepared,
                        pendingStaffInvites = inviteCoordinator.pendingStaffInvites.value,
                    )
                },
                scheduleEvent = { scheduleAction, updated ->
                    val scheduleRevision = editorSession
                        ?.snapshot
                        ?.scheduleState
                        ?.revision
                        ?.trim()
                        ?.takeIf(String::isNotBlank)
                        ?: error("Reload the event before changing its schedule.")
                    val request = when (scheduleAction) {
                        EventScheduleEditAction.RESCHEDULE ->
                            EventEditorScheduleRequestDto(
                                expectedScheduleRevision = scheduleRevision,
                            )
                        EventScheduleEditAction.BUILD_SCHEDULE ->
                            EventEditorScheduleRequestDto(
                                expectedScheduleRevision = scheduleRevision,
                                participantCount = updated.maxParticipants.takeIf { it > 0 },
                                includePlaceholderTeams = true,
                            )
                        EventScheduleEditAction.REBUILD_SCHEDULE ->
                            EventEditorScheduleRequestDto(
                                expectedScheduleRevision = scheduleRevision,
                                participantCount = updated.maxParticipants.takeIf { it > 0 },
                                includePlaceholderTeams = true,
                                replaceExistingMatches = true,
                            )
                        EventScheduleEditAction.REBUILD_WITHOUT_PLACEHOLDER_TEAMS ->
                            EventEditorScheduleRequestDto(
                                expectedScheduleRevision = scheduleRevision,
                                includePlaceholderTeams = false,
                                replaceExistingMatches = true,
                            )
                    }
                    val outcome = eventRepository.scheduleEventEditor(updated.id, request).getOrThrow()
                    editorSession = eventRepository.getEventEditor(updated.id).getOrThrow()
                    outcome
                },
                refetchMatchesOfTournament = { eventId ->
                    matchRepository.getMatchesOfTournament(eventId).getOrThrow()
                },
                refreshLeagueStandingsAfterSchedule = refreshLeagueStandingsAfterSchedule,
                showLoading = loadingOperation::showLoading,
                hideLoading = loadingOperation::hideLoading,
            )) {
                is EventScheduleEditResult.Success -> {
                    cancelEditingEvent()
                    setError(result.message)
                }
                is EventScheduleEditResult.Failure -> {
                    setError(
                        if (result.settingsSaved) {
                            result.fallbackMessage
                        } else {
                            result.throwable.userMessage(result.fallbackMessage)
                        },
                    )
                }
            }
        }
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
        editEventField {
            copy(
                eventType = type,
                noFixedEndDateTime = if (type == EventType.WEEKLY_EVENT) false else noFixedEndDateTime,
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
                        slots = editDraftCoordinator.editableLeagueTimeSlots.value,
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
    ): EventEditorSaveOutcome {
        val session = editorSession ?: eventRepository.getEventEditor(prepared.event.id)
            .getOrThrow()
            .also { loaded -> editorSession = loaded }
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
        val command = EventEditorSessionMapper.toSaveCommand(session, mutation)
        val outcome = eventRepository.saveEventEditor(prepared.event.id, command).getOrThrow()
        editorSession = outcome.session
        eventRepository.updateLocalEvent(outcome.session.canonicalState.event).getOrThrow()
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
