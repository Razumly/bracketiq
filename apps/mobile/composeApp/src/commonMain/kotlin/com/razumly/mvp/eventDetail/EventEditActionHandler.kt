package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.eventDetail.data.IMatchRepository
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

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
    private val expectedStaffRevision: () -> String?,
    private val setStaffState: (List<Invite>, String) -> Unit,
    private val loadSports: (Boolean) -> Unit,
    private val refreshLeagueStandingsAfterSchedule: suspend (Event) -> Unit,
    private val setError: (String) -> Unit,
) {
    private var editStartRequestId = 0L

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
            val refreshedEvent = eventRepository.getEvent(currentEvent.id)
                .getOrElse { throwable ->
                    if (requestId == editStartRequestId) {
                        setError(throwable.userMessage("Failed to refresh event for editing."))
                    }
                    return@launch
                }
            if (requestId != editStartRequestId || editDraftCoordinator.isEditing.value) {
                return@launch
            }
            setEventEditMode(enabled = true, seedEvent = refreshedEvent)
        }
    }

    fun cancelEditingEvent() {
        editStartRequestId += 1
        setEventEditMode(enabled = false)
    }

    private fun setEventEditMode(
        enabled: Boolean,
        seedEvent: Event? = null,
    ) {
        val selected = seedEvent ?: selectedEvent()
        val unsupportedFeatures = mobileEventEditUnsupportedFeatures(selected)
        if (enabled && unsupportedFeatures.isNotEmpty()) {
            setError(mobileEventEditUnsupportedMessage(unsupportedFeatures))
            return
        }
        if (editDraftCoordinator.isEditing.value == enabled) return
        if (enabled && !sportsCatalogCoordinator.isCatalogLoaded()) {
            loadSports(true)
        }

        val seededEvent = if (enabled && sportsCatalogCoordinator.currentSports().isNotEmpty()) {
            sportsCatalogCoordinator.syncOfficialStaffingForSportTransition(
                previous = selected,
                updated = selected,
            )
        } else {
            selected
        }
        editDraftCoordinator.seedDraftForEditing(
            event = seededEvent,
            sourceFields = eventFields().map { relation -> relation.field },
            timeSlots = eventWithRelations().timeSlots,
            leagueScoringConfig = eventWithRelations().leagueScoringConfig?.toDto()
                ?: LeagueScoringConfigDTO(),
        )
        if (enabled) {
            val changedRentalSelection = rentalResourcesCoordinator.setAttachedResourceSelection(
                slots = editDraftCoordinator.editableLeagueTimeSlots.value,
                eventId = seededEvent.id,
            )
            if (changedRentalSelection && rentalResourcesCoordinator.selectedResourceIds.value.isNotEmpty()) {
                syncSelectedRentalResourcesIntoEditDraft()
            }
        } else {
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
        scope.launch {
            val loadingOperation = loadingHandler().newOperation()
            when (val result = editActionCoordinator.runSaveEventAction(
                pendingStaffInvites = inviteCoordinator.pendingStaffInvites.value,
                expectedStaffRevision = expectedStaffRevision(),
                prepareEventForUpdate = ::prepareEventForUpdate,
                updatePreparedEvent = { prepared, staffRevision ->
                    eventRepository.updateEventPreservingStaff(
                        newEvent = prepared.event,
                        fields = prepared.fields,
                        timeSlots = prepared.timeSlots,
                        leagueScoringConfig = prepared.leagueScoringConfig,
                        expectedStaffRevision = staffRevision,
                    ).getOrThrow()
                },
                refreshStaffState = { event ->
                    eventRepository.getEventStaffState(event).getOrThrow()
                },
                reconcileStaffState = { event, pendingStaffInvites, revision ->
                    reconcileEventStaffState(
                        eventRepository = eventRepository,
                        event = event,
                        pendingStaffInvites = pendingStaffInvites,
                        expectedRevision = revision,
                    ).getOrThrow()
                },
                refetchMatchesOfTournament = { eventId ->
                    matchRepository.getMatchesOfTournament(eventId)
                },
                showLoading = loadingOperation::showLoading,
                hideLoading = loadingOperation::hideLoading,
            )) {
                is EventSaveActionResult.Success -> {
                    setStaffState(result.staffInvites, result.staffRevision)
                    inviteCoordinator.clearPendingStaffInvites()
                    inviteCoordinator.clearSuggestedUsers()
                    cancelEditingEvent()
                }
                is EventSaveActionResult.Failure -> setError(result.userFacingMessage())
            }
        }
    }

    fun rescheduleEvent() = runScheduleEditAction(EventScheduleEditAction.RESCHEDULE)

    fun buildBrackets() = runScheduleEditAction(EventScheduleEditAction.BUILD_BRACKETS)

    fun rebuildWithoutPlaceholderTeams() =
        runScheduleEditAction(EventScheduleEditAction.REBUILD_WITHOUT_PLACEHOLDER_TEAMS)

    private fun runScheduleEditAction(action: EventScheduleEditAction) {
        scope.launch {
            val loadingOperation = loadingHandler().newOperation()
            when (val result = editActionCoordinator.runScheduleEditAction(
                action = action,
                prepareEventForUpdate = ::prepareEventForUpdate,
                validatePreparedEvent = { prepared ->
                    requireNoUnsavedEventStaffChanges(
                        persistedEvent = selectedEvent(),
                        preparedEvent = prepared.event,
                        pendingStaffInvites = inviteCoordinator.pendingStaffInvites.value,
                    )
                },
                logPreparedFieldOwnership = ::logPreparedFieldOwnership,
                updateEvent = { prepared ->
                    eventRepository.updateEvent(
                        newEvent = prepared.event,
                        fields = prepared.fields,
                        timeSlots = prepared.timeSlots,
                        leagueScoringConfig = prepared.leagueScoringConfig,
                    ).getOrThrow()
                },
                deleteMatchesOfTournament = { eventId ->
                    matchRepository.deleteMatchesOfTournament(eventId).getOrThrow()
                },
                scheduleEvent = { scheduleAction, updated ->
                    when (scheduleAction) {
                        EventScheduleEditAction.RESCHEDULE -> {
                            eventRepository.scheduleEvent(updated.id).getOrThrow()
                        }
                        EventScheduleEditAction.BUILD_BRACKETS -> {
                            val participantCount = updated.maxParticipants.takeIf { it > 0 }
                            eventRepository.scheduleEvent(updated.id, participantCount).getOrThrow()
                        }
                        EventScheduleEditAction.REBUILD_WITHOUT_PLACEHOLDER_TEAMS -> {
                            eventRepository.scheduleEvent(
                                eventId = updated.id,
                                includePlaceholderTeams = false,
                            ).getOrThrow()
                        }
                    }
                },
                refetchMatchesOfTournament = { eventId ->
                    matchRepository.getMatchesOfTournament(eventId).getOrThrow()
                },
                resetBracketMatchesAfterSchedule = { updated ->
                    resetBracketMatchesAfterSchedule(
                        event = updated,
                        getMatchesOfTournament = { eventId ->
                            matchRepository.getMatchesOfTournament(eventId).getOrThrow()
                        },
                        updateMatchesBulk = { matches ->
                            matchRepository.updateMatchesBulk(matches).getOrThrow()
                        },
                    )
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
                    setError(result.throwable.userMessage(result.fallbackMessage))
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
                updateEvent = eventRepository::updateEvent,
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
        editEventField { copy(eventType = type) }
    }

    fun selectFieldCount(count: Int) = editDraftCoordinator.selectFieldCount(count)

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

    private fun prepareEventForUpdate(): PreparedEventForUpdate {
        val result = EventEditPayloadBuilder.prepareForUpdate(
            EventEditPayloadInput(
                editedEvent = editDraftCoordinator.editedEvent.value.copy(
                    matchRulesOverride = matchRulesOverrideWithoutSegmentCount(
                        editDraftCoordinator.editedEvent.value.matchRulesOverride,
                    ),
                ),
                editableFields = editDraftCoordinator.editableFields.value,
                editableLeagueTimeSlots = editDraftCoordinator.editableLeagueTimeSlots.value,
                selectedRentalFields = selectedRentalResourceFields(),
                leagueScoringConfig = editDraftCoordinator.editableLeagueScoringConfig.value,
                originalEventStart = eventWithRelations().event.start,
                normalizeSlotResourceSelection = { slot, validFieldIds ->
                    normalizeRentalSlotResourceSelection(slot, validFieldIds)
                },
            ),
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
