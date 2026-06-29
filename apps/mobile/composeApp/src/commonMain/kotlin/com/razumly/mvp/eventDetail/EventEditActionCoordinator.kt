package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.enums.EventType

internal enum class EventScheduleEditAction(
    val loadingMessage: String,
    val logAction: String,
    val successMessage: String,
    val failureMessage: String,
    val deleteMatchesBeforeSchedule: Boolean,
    val resetBracketMatchesAfterSchedule: Boolean,
) {
    RESCHEDULE(
        loadingMessage = "Rescheduling event...",
        logAction = "reschedule",
        successMessage = "Event rescheduled.",
        failureMessage = "Failed to reschedule event.",
        deleteMatchesBeforeSchedule = false,
        resetBracketMatchesAfterSchedule = false,
    ),
    BUILD_BRACKETS(
        loadingMessage = "Building bracket(s)...",
        logAction = "build_brackets",
        successMessage = "Bracket build completed.",
        failureMessage = "Failed to build bracket(s).",
        deleteMatchesBeforeSchedule = true,
        resetBracketMatchesAfterSchedule = true,
    ),
    REBUILD_WITHOUT_PLACEHOLDER_TEAMS(
        loadingMessage = "Rebuilding without placeholder teams...",
        logAction = "rebuild_without_placeholders",
        successMessage = "Schedule rebuilt without placeholder teams.",
        failureMessage = "Failed to rebuild without placeholder teams.",
        deleteMatchesBeforeSchedule = true,
        resetBracketMatchesAfterSchedule = true,
    ),
}

internal sealed class EventScheduleEditResult {
    data class Success(
        val message: String,
        val scheduledEvent: Event,
    ) : EventScheduleEditResult()

    data class Failure(
        val throwable: Throwable,
        val fallbackMessage: String,
    ) : EventScheduleEditResult()
}

internal sealed class EventSaveActionResult {
    data class Success(
        val finalEvent: Event,
        val staffInvites: List<Invite>,
    ) : EventSaveActionResult()

    data class Failure(
        val throwable: Throwable,
        val fallbackMessage: String,
    ) : EventSaveActionResult()
}

internal sealed class EventTemplateCreateResult {
    data class AlreadyTemplate(val message: String) : EventTemplateCreateResult()
    data class OrganizationManaged(val message: String) : EventTemplateCreateResult()
    data class Success(val message: String) : EventTemplateCreateResult()
    data class Failure(
        val throwable: Throwable,
        val fallbackMessage: String,
    ) : EventTemplateCreateResult()
}

internal sealed class EventPublishResult {
    object AlreadyPublished : EventPublishResult()
    object Success : EventPublishResult()
    data class Failure(
        val throwable: Throwable,
        val fallbackMessage: String,
    ) : EventPublishResult()
}

internal class EventEditActionCoordinator {
    suspend fun runSaveEventAction(
        selectedEvent: Event,
        pendingStaffInvites: List<PendingStaffInviteDraft>,
        existingStaffInvites: List<Invite>,
        currentUserId: String?,
        prepareEventForUpdate: () -> PreparedEventForUpdate,
        updatePreparedEvent: suspend (PreparedEventForUpdate) -> Event,
        reconcileStaffInvites: suspend (
            Event,
            List<PendingStaffInviteDraft>,
            List<Invite>,
            Set<String>,
            String?,
        ) -> EventStaffSaveOutcome,
        updateFinalEvent: suspend (Event) -> Event,
        refetchMatchesOfTournament: suspend (String) -> Unit,
        showLoading: (String) -> Unit,
        hideLoading: () -> Unit,
    ): EventSaveActionResult {
        showLoading("Saving event...")
        return try {
            val previouslyAssignedStaffUserIds = selectedEvent.assignedStaffUserIds()
            val prepared = prepareEventForUpdate()
            val updated = updatePreparedEvent(prepared)
            val saveOutcome = reconcileStaffInvites(
                updated,
                pendingStaffInvites,
                existingStaffInvites,
                previouslyAssignedStaffUserIds,
                currentUserId,
            )
            val finalEvent = if (saveOutcome.event == updated) {
                updated
            } else {
                updateFinalEvent(saveOutcome.event)
            }

            if (finalEvent.eventType == EventType.LEAGUE || finalEvent.eventType == EventType.TOURNAMENT) {
                refetchMatchesOfTournament(finalEvent.id)
            }

            EventSaveActionResult.Success(
                finalEvent = finalEvent,
                staffInvites = saveOutcome.staffInvites,
            )
        } catch (throwable: Throwable) {
            EventSaveActionResult.Failure(
                throwable = throwable,
                fallbackMessage = "Unable to save event.",
            )
        } finally {
            hideLoading()
        }
    }

    suspend fun runScheduleEditAction(
        action: EventScheduleEditAction,
        prepareEventForUpdate: () -> PreparedEventForUpdate,
        logPreparedFieldOwnership: (String, PreparedEventForUpdate) -> Unit,
        updateEvent: suspend (PreparedEventForUpdate) -> Event,
        deleteMatchesOfTournament: suspend (String) -> Unit,
        scheduleEvent: suspend (EventScheduleEditAction, Event) -> Event,
        refetchMatchesOfTournament: suspend (String) -> Unit,
        resetBracketMatchesAfterSchedule: suspend (Event) -> Unit,
        refreshLeagueStandingsAfterSchedule: suspend (Event) -> Unit,
        showLoading: (String) -> Unit,
        hideLoading: () -> Unit,
    ): EventScheduleEditResult {
        showLoading(action.loadingMessage)
        return try {
            val prepared = prepareEventForUpdate()
            logPreparedFieldOwnership(action.logAction, prepared)
            val updated = updateEvent(prepared)

            if (action.deleteMatchesBeforeSchedule) {
                deleteMatchesOfTournament(updated.id)
            }

            val scheduledEvent = scheduleEvent(action, updated)

            if (action.resetBracketMatchesAfterSchedule) {
                resetBracketMatchesAfterSchedule(updated)
            } else {
                refetchMatchesOfTournament(updated.id)
            }
            refreshLeagueStandingsAfterSchedule(scheduledEvent)

            EventScheduleEditResult.Success(
                message = action.successMessage,
                scheduledEvent = scheduledEvent,
            )
        } catch (throwable: Throwable) {
            EventScheduleEditResult.Failure(
                throwable = throwable,
                fallbackMessage = action.failureMessage,
            )
        } finally {
            hideLoading()
        }
    }

    suspend fun runCreateTemplateAction(
        sourceEvent: Event,
        createTemplate: suspend (String) -> Unit,
        showLoading: (String) -> Unit,
        hideLoading: () -> Unit,
    ): EventTemplateCreateResult {
        if (sourceEvent.state.equals("TEMPLATE", ignoreCase = true)) {
            return EventTemplateCreateResult.AlreadyTemplate("This event is already a template.")
        }
        if (!sourceEvent.organizationId.isNullOrBlank()) {
            return EventTemplateCreateResult.OrganizationManaged(
                "Create organization event templates from the web app.",
            )
        }

        showLoading("Creating template ...")
        return try {
            createTemplate(sourceEvent.id)
            EventTemplateCreateResult.Success("Template created and added to your templates.")
        } catch (throwable: Throwable) {
            EventTemplateCreateResult.Failure(
                throwable = throwable,
                fallbackMessage = "Failed to create template.",
            )
        } finally {
            hideLoading()
        }
    }

    suspend fun runPublishEventAction(
        currentEvent: Event,
        updateEvent: suspend (Event) -> Result<Event>,
        refreshEvent: suspend (String) -> Unit,
        showLoading: (String) -> Unit,
        hideLoading: () -> Unit,
    ): EventPublishResult {
        if (currentEvent.state == "PUBLISHED") {
            return EventPublishResult.AlreadyPublished
        }

        showLoading("Publishing event...")
        return try {
            val updateResult = updateEvent(currentEvent.copy(state = "PUBLISHED"))
            refreshEvent(currentEvent.id)
            updateResult.fold(
                onSuccess = { EventPublishResult.Success },
                onFailure = { throwable ->
                    EventPublishResult.Failure(
                        throwable = throwable,
                        fallbackMessage = "Failed to publish event.",
                    )
                },
            )
        } catch (throwable: Throwable) {
            EventPublishResult.Failure(
                throwable = throwable,
                fallbackMessage = "Failed to publish event.",
            )
        } finally {
            hideLoading()
        }
    }
}

private fun Event.assignedStaffUserIds(): Set<String> = buildSet {
    addAll(officialIds.map(String::trim).filter(String::isNotBlank))
    addAll(assistantHostIds.map(String::trim).filter(String::isNotBlank))
}
