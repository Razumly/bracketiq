package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class EventEditActionCoordinatorTest {
    @Test
    fun runScheduleEditAction_reschedules_with_refetch_and_standings_refresh() = runTest {
        val coordinator = EventEditActionCoordinator()
        val draft = Event(id = "event-1", name = "Draft")
        val updated = draft.copy(name = "Updated")
        val scheduled = updated.copy(state = "SCHEDULED")
        val events = mutableListOf<String>()

        val result = coordinator.runScheduleEditAction(
            action = EventScheduleEditAction.RESCHEDULE,
            prepareEventForUpdate = {
                events += "prepare"
                PreparedEventForUpdate(event = draft)
            },
            logPreparedFieldOwnership = { action, prepared ->
                events += "log:$action:${prepared.event.id}"
            },
            updateEvent = { prepared ->
                events += "update:${prepared.event.id}"
                updated
            },
            deleteMatchesOfTournament = { eventId ->
                events += "delete:$eventId"
            },
            scheduleEvent = { action, event ->
                events += "schedule:${action.name}:${event.id}"
                scheduled
            },
            refetchMatchesOfTournament = { eventId ->
                events += "refetch:$eventId"
            },
            resetBracketMatchesAfterSchedule = { event ->
                events += "reset:${event.id}"
            },
            refreshLeagueStandingsAfterSchedule = { event ->
                events += "standings:${event.id}"
            },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
        )

        val success = assertIs<EventScheduleEditResult.Success>(result)
        assertEquals("Event rescheduled.", success.message)
        assertEquals(scheduled, success.scheduledEvent)
        assertEquals(
            listOf(
                "show:Rescheduling event...",
                "prepare",
                "log:reschedule:event-1",
                "update:event-1",
                "schedule:RESCHEDULE:event-1",
                "refetch:event-1",
                "standings:event-1",
                "hide",
            ),
            events,
        )
    }

    @Test
    fun runScheduleEditAction_builds_brackets_with_delete_reset_and_success_message() = runTest {
        val coordinator = EventEditActionCoordinator()
        val draft = Event(id = "event-1", maxParticipants = 12)
        val updated = draft.copy(name = "Updated")
        val scheduled = updated.copy(state = "SCHEDULED")
        val events = mutableListOf<String>()

        val result = coordinator.runScheduleEditAction(
            action = EventScheduleEditAction.BUILD_BRACKETS,
            prepareEventForUpdate = {
                events += "prepare"
                PreparedEventForUpdate(event = draft)
            },
            logPreparedFieldOwnership = { action, prepared ->
                events += "log:$action:${prepared.event.id}"
            },
            updateEvent = { prepared ->
                events += "update:${prepared.event.id}"
                updated
            },
            deleteMatchesOfTournament = { eventId ->
                events += "delete:$eventId"
            },
            scheduleEvent = { action, event ->
                events += "schedule:${action.name}:${event.id}"
                scheduled
            },
            refetchMatchesOfTournament = { eventId ->
                events += "refetch:$eventId"
            },
            resetBracketMatchesAfterSchedule = { event ->
                events += "reset:${event.id}"
            },
            refreshLeagueStandingsAfterSchedule = { event ->
                events += "standings:${event.id}"
            },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
        )

        val success = assertIs<EventScheduleEditResult.Success>(result)
        assertEquals("Bracket build completed.", success.message)
        assertEquals(scheduled, success.scheduledEvent)
        assertEquals(
            listOf(
                "show:Building bracket(s)...",
                "prepare",
                "log:build_brackets:event-1",
                "update:event-1",
                "delete:event-1",
                "schedule:BUILD_BRACKETS:event-1",
                "reset:event-1",
                "standings:event-1",
                "hide",
            ),
            events,
        )
    }

    @Test
    fun runScheduleEditAction_returns_failure_and_hides_loading() = runTest {
        val coordinator = EventEditActionCoordinator()
        val events = mutableListOf<String>()
        val failure = IllegalStateException("boom")

        val result = coordinator.runScheduleEditAction(
            action = EventScheduleEditAction.REBUILD_WITHOUT_PLACEHOLDER_TEAMS,
            prepareEventForUpdate = {
                events += "prepare"
                PreparedEventForUpdate(event = Event(id = "event-1"))
            },
            logPreparedFieldOwnership = { action, _ ->
                events += "log:$action"
            },
            updateEvent = {
                events += "update"
                throw failure
            },
            deleteMatchesOfTournament = { eventId ->
                events += "delete:$eventId"
            },
            scheduleEvent = { action, event ->
                events += "schedule:${action.name}:${event.id}"
                event
            },
            refetchMatchesOfTournament = { eventId ->
                events += "refetch:$eventId"
            },
            resetBracketMatchesAfterSchedule = { event ->
                events += "reset:${event.id}"
            },
            refreshLeagueStandingsAfterSchedule = { event ->
                events += "standings:${event.id}"
            },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
        )

        val error = assertIs<EventScheduleEditResult.Failure>(result)
        assertEquals(failure, error.throwable)
        assertEquals("Failed to rebuild without placeholder teams.", error.fallbackMessage)
        assertEquals(
            listOf(
                "show:Rebuilding without placeholder teams...",
                "prepare",
                "log:rebuild_without_placeholders",
                "update",
                "hide",
            ),
            events,
        )
    }
}
