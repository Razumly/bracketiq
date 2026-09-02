package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventEditorSaveOutcome
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceAcceptedResultDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceOperation
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorScheduleWarningDto

internal enum class EventScheduleEditAction(
    val loadingMessage: String,
    val logAction: String,
    val successMessage: String,
    val failureMessage: String,
    val maintenanceOperation: EventEditorMaintenanceOperation,
) {
    RESCHEDULE(
        loadingMessage = "Preparing schedule completion...",
        logAction = "complete_schedule",
        successMessage = "Schedule completed.",
        failureMessage = "Failed to complete schedule.",
        maintenanceOperation = EventEditorMaintenanceOperation.COMPLETE,
    ),
    BUILD_SCHEDULE(
        loadingMessage = "Preparing schedule build...",
        logAction = "build_schedule",
        successMessage = "Schedule built.",
        failureMessage = "Failed to build schedule.",
        maintenanceOperation = EventEditorMaintenanceOperation.BUILD,
    ),
    REBUILD_SCHEDULE(
        loadingMessage = "Preparing schedule rebuild...",
        logAction = "rebuild_schedule",
        successMessage = "Schedule rebuilt.",
        failureMessage = "Failed to rebuild schedule.",
        maintenanceOperation = EventEditorMaintenanceOperation.REBUILD,
    ),
    REBUILD_WITHOUT_PLACEHOLDER_TEAMS(
        loadingMessage = "Preparing rebuild without placeholder teams...",
        logAction = "rebuild_without_placeholders",
        successMessage = "Schedule rebuilt without placeholder teams.",
        failureMessage = "Failed to rebuild without placeholder teams.",
        maintenanceOperation = EventEditorMaintenanceOperation.REBUILD,
    ),
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

enum class EventScheduleMaintenanceReviewPhase {
    PROPOSED,
    ACCEPTING,
    REJECTING,
    STALE,
    REJECTED,
    ACCEPTED_SYNC_PENDING,
}

data class EventScheduleMaintenanceReview(
    val proposal: EventEditorMaintenanceProposalDto,
    val acceptanceOperationId: String,
    val includePlaceholderTeams: Boolean? = null,
    val eventTimeZone: String = "UTC",
    val phase: EventScheduleMaintenanceReviewPhase = EventScheduleMaintenanceReviewPhase.PROPOSED,
    val message: String? = null,
)

internal sealed class EventScheduleMaintenanceActionResult {
    data class Proposed(
        val review: EventScheduleMaintenanceReview,
    ) : EventScheduleMaintenanceActionResult()

    data class Accepted(
        val result: EventEditorMaintenanceAcceptedResultDto,
        val scheduledEvent: Event,
        val message: String,
    ) : EventScheduleMaintenanceActionResult()

    data class Rejected(
        val message: String,
    ) : EventScheduleMaintenanceActionResult()

    data class Failure(
        val throwable: Throwable,
        val fallbackMessage: String,
        val settingsSaved: Boolean,
        val rollbackFailed: Boolean,
    ) : EventScheduleMaintenanceActionResult()
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


    suspend fun runScheduleMaintenanceAction(
        action: EventScheduleEditAction,
        prepareEventForUpdate: () -> PreparedEventForUpdate,
        validatePreparedEvent: (PreparedEventForUpdate) -> Unit = {},
        logPreparedFieldOwnership: (String, PreparedEventForUpdate) -> Unit,
        updateEvent: suspend (PreparedEventForUpdate) -> EventEditorSaveOutcome,
        proposeMaintenance: suspend (EventScheduleEditAction, Event) -> EventEditorMaintenanceResponseDto,
        rollbackEvent: suspend () -> Boolean = { false },
        refreshAcceptedSchedule: suspend (String) -> Event,
        showLoading: (String) -> Unit,
        hideLoading: () -> Unit,
        newOperationId: () -> String,
    ): EventScheduleMaintenanceActionResult {
        showLoading(action.loadingMessage)
        var settingsSaved = false
        var rollbackAttempted = false
        var rollbackFailed = false
        suspend fun rollbackSavedEvent(): Boolean {
            if (!settingsSaved) return true
            if (rollbackAttempted) return false
            rollbackAttempted = true
            val didRollback = try {
                rollbackEvent()
            } catch (throwable: Throwable) {
                rollbackFailed = true
                throw throwable
            }
            if (!didRollback) rollbackFailed = true
            if (didRollback) settingsSaved = false
            return didRollback
        }
        return try {
            val prepared = prepareEventForUpdate()
            validatePreparedEvent(prepared)
            logPreparedFieldOwnership(action.logAction, prepared)
            val saveOutcome = updateEvent(prepared)
            val updated = saveOutcome.session.canonicalState.event
            settingsSaved = true
            when (val response = proposeMaintenance(action, updated)) {
                is EventEditorMaintenanceResponseDto.Proposed ->
                    EventScheduleMaintenanceActionResult.Proposed(
                        review = EventScheduleMaintenanceReview(
                            proposal = response.proposal,
                            acceptanceOperationId = newOperationId(),
                            includePlaceholderTeams = when (action) {
                                EventScheduleEditAction.REBUILD_WITHOUT_PLACEHOLDER_TEAMS -> false
                                EventScheduleEditAction.BUILD_SCHEDULE,
                                EventScheduleEditAction.REBUILD_SCHEDULE -> true
                                EventScheduleEditAction.RESCHEDULE -> null
                            },
                            eventTimeZone = updated.timeZone,
                        ),
                    )
                is EventEditorMaintenanceResponseDto.Accepted -> {
                    settingsSaved = false
                    val scheduledEvent = refreshAcceptedSchedule(updated.id)
                    EventScheduleMaintenanceActionResult.Accepted(
                        result = response.result,
                        scheduledEvent = scheduledEvent,
                        message = maintenanceSuccessMessage(
                            action = action,
                            result = response.result,
                        ),
                    )
                }
                is EventEditorMaintenanceResponseDto.Rejected ->
                    run {
                        if (!rollbackSavedEvent() && settingsSaved) {
                            throw IllegalStateException(
                                "Schedule maintenance failed and the Event changes could not be restored.",
                            )
                        }
                        EventScheduleMaintenanceActionResult.Rejected(
                            message = "The schedule proposal was rejected. Request a new proposal.",
                        )
                    }
            }
        } catch (throwable: Throwable) {
            val failure = try {
                val didRollback = rollbackSavedEvent()
                if (!didRollback && settingsSaved) {
                    rollbackFailed = true
                }
                if (rollbackFailed) {
                    IllegalStateException(
                        "Schedule maintenance failed and the Event changes could not be restored.",
                        throwable,
                    )
                } else {
                    throwable
                }
            } catch (rollbackThrowable: Throwable) {
                rollbackFailed = true
                IllegalStateException(
                    "Schedule maintenance failed and the Event changes could not be restored.",
                    rollbackThrowable,
                )
            }
            EventScheduleMaintenanceActionResult.Failure(
                throwable = failure,
                fallbackMessage = action.failureMessage,
                settingsSaved = settingsSaved,
                rollbackFailed = rollbackFailed,
            )
        } finally {
            hideLoading()
        }
    }

    private fun maintenanceSuccessMessage(
        action: EventScheduleEditAction,
        result: EventEditorMaintenanceAcceptedResultDto,
    ): String {
        val statusMessage = when (result.scheduleOutcome.status) {
            EventEditorMaintenanceScheduleOutcomeStatus.COMPLETE -> action.successMessage
            EventEditorMaintenanceScheduleOutcomeStatus.INCOMPLETE ->
                "${action.successMessage} ${result.scheduleOutcome.unplacedMatchCount} matches remain unplaced."
        }
        val warnings = result.scheduleOutcome.warnings
            .map(EventEditorScheduleWarningDto::message)
            .filter(String::isNotBlank)
        return (listOf(statusMessage) + warnings).joinToString("\n")
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
