package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventEditorSaveOutcome
import com.razumly.mvp.core.data.repositories.EventScheduleOutcome
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeStatus
import com.razumly.mvp.core.network.userMessage

internal enum class EventScheduleEditAction(
    val loadingMessage: String,
    val logAction: String,
    val successMessage: String,
    val failureMessage: String,
) {
    RESCHEDULE(
        loadingMessage = "Rescheduling event...",
        logAction = "reschedule",
        successMessage = "Event rescheduled.",
        failureMessage = "Failed to reschedule event.",
    ),
    BUILD_SCHEDULE(
        loadingMessage = "Building schedule...",
        logAction = "build_schedule",
        successMessage = "Schedule built.",
        failureMessage = "Failed to build schedule.",
    ),
    REBUILD_SCHEDULE(
        loadingMessage = "Rebuilding schedule...",
        logAction = "rebuild_schedule",
        successMessage = "Schedule rebuilt.",
        failureMessage = "Failed to rebuild schedule.",
    ),
    REBUILD_WITHOUT_PLACEHOLDER_TEAMS(
        loadingMessage = "Rebuilding without placeholder teams...",
        logAction = "rebuild_without_placeholders",
        successMessage = "Schedule rebuilt without placeholder teams.",
        failureMessage = "Failed to rebuild without placeholder teams.",
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
        val settingsSaved: Boolean,
    ) : EventScheduleEditResult()
}

internal sealed class EventSaveActionResult {
    data class Success(
        val finalEvent: Event,
        val staffInvites: List<Invite>,
        val staffRevision: String?,
        val staffEmailDelivery: String,
        val scheduleWarnings: List<String>,
    ) : EventSaveActionResult()

    data class Failure(
        val throwable: Throwable,
        val fallbackMessage: String,
        val didSaveEventDetails: Boolean,
    ) : EventSaveActionResult()
}

internal fun EventSaveActionResult.Failure.userFacingMessage(): String = if (didSaveEventDetails) {
    fallbackMessage
} else {
    throwable.userMessage(fallbackMessage)
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
        pendingStaffInvites: List<PendingStaffInviteDraft>,
        prepareEventForUpdate: () -> PreparedEventForUpdate,
        savePreparedEvent: suspend (
            PreparedEventForUpdate,
            List<PendingStaffInviteDraft>,
        ) -> EventEditorSaveOutcome,
        refetchMatchesOfTournament: suspend (String) -> Unit,
        showLoading: (String) -> Unit,
        hideLoading: () -> Unit,
    ): EventSaveActionResult {
        showLoading("Saving event...")
        return try {
            val prepared = prepareEventForUpdate()
            validatePendingStaffInviteDrafts(pendingStaffInvites).getOrThrow()
            val outcome = savePreparedEvent(prepared, pendingStaffInvites)
            val finalEvent = outcome.session.canonicalState.event
            if (finalEvent.eventType == EventType.LEAGUE || finalEvent.eventType == EventType.TOURNAMENT) {
                refetchMatchesOfTournament(finalEvent.id)
            }
            EventSaveActionResult.Success(
                finalEvent = finalEvent,
                staffInvites = outcome.session.canonicalState.pendingStaffInvites,
                staffRevision = outcome.session.snapshot.staffRevision,
                staffEmailDelivery = outcome.staffEmailDelivery,
                scheduleWarnings = outcome.scheduleOutcome.warnings.map { warning -> warning.message },
            )
        } catch (throwable: Throwable) {
            EventSaveActionResult.Failure(
                throwable = throwable,
                fallbackMessage = "Unable to save event.",
                didSaveEventDetails = false,
            )
        } finally {
            hideLoading()
        }
    }

    suspend fun runScheduleEditAction(
        action: EventScheduleEditAction,
        prepareEventForUpdate: () -> PreparedEventForUpdate,
        validatePreparedEvent: (PreparedEventForUpdate) -> Unit = {},
        logPreparedFieldOwnership: (String, PreparedEventForUpdate) -> Unit,
        updateEvent: suspend (PreparedEventForUpdate) -> EventEditorSaveOutcome,
        scheduleEvent: suspend (EventScheduleEditAction, Event) -> EventScheduleOutcome,
        refetchMatchesOfTournament: suspend (String) -> Unit,
        refreshLeagueStandingsAfterSchedule: suspend (Event) -> Unit,
        showLoading: (String) -> Unit,
        hideLoading: () -> Unit,
    ): EventScheduleEditResult {
        showLoading(action.loadingMessage)
        var settingsSaved = false
        return try {
            val prepared = prepareEventForUpdate()
            validatePreparedEvent(prepared)
            logPreparedFieldOwnership(action.logAction, prepared)
            val saveOutcome = updateEvent(prepared)
            val updated = saveOutcome.session.canonicalState.event
            settingsSaved = true

            val saveScheduleOutcome = saveOutcome.scheduleOutcome
            val useSaveScheduleOutcome =
                saveScheduleOutcome.status != EventEditorScheduleOutcomeStatus.NOT_REQUESTED &&
                    action != EventScheduleEditAction.REBUILD_WITHOUT_PLACEHOLDER_TEAMS
            val scheduledEvent: Event
            val warnings: List<String>
            val successMessage: String
            if (useSaveScheduleOutcome) {
                scheduledEvent = updated
                warnings = saveScheduleOutcome.warnings.map { warning -> warning.message }
                successMessage = when (saveScheduleOutcome.status) {
                    EventEditorScheduleOutcomeStatus.BUILT -> "Schedule built."
                    EventEditorScheduleOutcomeStatus.REBUILT -> "Schedule rebuilt."
                    EventEditorScheduleOutcomeStatus.DELETED -> "Schedule deleted."
                    EventEditorScheduleOutcomeStatus.NOT_REQUESTED -> action.successMessage
                }
            } else {
                val scheduleOutcome = scheduleEvent(action, updated)
                scheduledEvent = scheduleOutcome.event
                warnings = scheduleOutcome.warnings
                successMessage = action.successMessage
            }

            refetchMatchesOfTournament(scheduledEvent.id)
            refreshLeagueStandingsAfterSchedule(scheduledEvent)

            EventScheduleEditResult.Success(
                message = (listOf(successMessage) + warnings).joinToString("\n"),
                scheduledEvent = scheduledEvent,
            )
        } catch (throwable: Throwable) {
            EventScheduleEditResult.Failure(
                throwable = throwable,
                fallbackMessage = action.failureMessage,
                settingsSaved = settingsSaved,
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
