package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event

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

internal class EventEditActionCoordinator {
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
}
