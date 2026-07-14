package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventStaffState
import com.razumly.mvp.core.network.userMessage

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
        val staffRevision: String,
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
        expectedStaffRevision: String?,
        prepareEventForUpdate: () -> PreparedEventForUpdate,
        updatePreparedEvent: suspend (PreparedEventForUpdate, String) -> Event,
        refreshStaffState: suspend (Event) -> EventStaffState,
        reconcileStaffState: suspend (
            Event,
            List<PendingStaffInviteDraft>,
            String,
        ) -> EventStaffState,
        refetchMatchesOfTournament: suspend (String) -> Unit,
        showLoading: (String) -> Unit,
        hideLoading: () -> Unit,
    ): EventSaveActionResult {
        showLoading("Saving event...")
        var generalUpdateCommitted = false
        return try {
            val prepared = prepareEventForUpdate()
            validatePendingStaffInviteDrafts(pendingStaffInvites).getOrThrow()
            val staffRevisionSeed = expectedStaffRevision
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?: error("Reload the event before saving staff changes.")
            val updated = updatePreparedEvent(prepared, staffRevisionSeed)
            generalUpdateCommitted = true
            val currentStaffState = refreshStaffState(updated)
            val validPositionIds = currentStaffState.event.officialPositions
                .map { position -> position.id }
                .toSet()
            val preparedPositionNameById = prepared.event.officialPositions.associate { position ->
                position.id to position.name.trim().lowercase()
            }
            val currentPositionIdByName = currentStaffState.event.officialPositions.associate { position ->
                position.name.trim().lowercase() to position.id
            }
            val validFieldIds = currentStaffState.event.fieldIds.toSet()
            val fallbackPositionId = currentStaffState.event.officialPositions.firstOrNull()?.id
            val desiredOfficials = prepared.event.eventOfficials.mapNotNull { official ->
                val positionIds = official.positionIds.mapNotNull { positionId ->
                    when {
                        positionId in validPositionIds -> positionId
                        else -> preparedPositionNameById[positionId]?.let(currentPositionIdByName::get)
                    }
                }.distinct()
                    .ifEmpty { fallbackPositionId?.let(::listOf).orEmpty() }
                if (positionIds.isEmpty()) {
                    null
                } else {
                    official.copy(
                        positionIds = positionIds,
                        fieldIds = official.fieldIds.filter(validFieldIds::contains),
                    )
                }
            }
            val desiredStaffEvent = currentStaffState.event.copy(
                assistantHostIds = prepared.event.assistantHostIds,
                eventOfficials = desiredOfficials,
                officialIds = desiredOfficials.map { official -> official.userId },
            )
            val staffState = reconcileStaffState(
                desiredStaffEvent,
                pendingStaffInvites,
                staffRevisionSeed,
            )
            val finalEvent = staffState.event

            if (finalEvent.eventType == EventType.LEAGUE || finalEvent.eventType == EventType.TOURNAMENT) {
                refetchMatchesOfTournament(finalEvent.id)
            }

            EventSaveActionResult.Success(
                finalEvent = finalEvent,
                staffInvites = staffState.staffInvites,
                staffRevision = staffState.revision,
            )
        } catch (throwable: Throwable) {
            EventSaveActionResult.Failure(
                throwable = throwable,
                fallbackMessage = if (generalUpdateCommitted) {
                    "Event details were saved, but staff changes were not. Review the staff entries and retry."
                } else {
                    "Unable to save event."
                },
                didSaveEventDetails = generalUpdateCommitted,
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
            validatePreparedEvent(prepared)
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
