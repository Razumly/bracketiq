@file:OptIn(ExperimentalCoroutinesApi::class, ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.network.dto.TeamCheckInDto
import com.razumly.mvp.core.network.dto.TeamCheckInsResponseDto
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

class EventTeamCheckInCoordinatorTest {
    @Test
    fun enabled_rule_requires_team_signup_and_event_mode() {
        assertTrue(eventTeamCheckInEnabled(event()))
        assertFalse(eventTeamCheckInEnabled(event(teamSignup = false)))
        assertFalse(eventTeamCheckInEnabled(event(mode = TeamCheckInMode.OFF)))
        assertFalse(eventTeamCheckInEnabled(event(mode = TeamCheckInMode.MATCH)))
    }

    @Test
    fun window_opens_at_configured_time_and_clamps_negative_minutes() {
        val event = event(openMinutesBefore = 60)

        assertFalse(isEventTeamCheckInWindowOpen(event, Instant.parse("2026-07-14T10:59:59Z")))
        assertTrue(isEventTeamCheckInWindowOpen(event, Instant.parse("2026-07-14T11:00:00Z")))
        assertFalse(
            isEventTeamCheckInWindowOpen(
                event(openMinutesBefore = -30),
                Instant.parse("2026-07-14T11:59:59Z"),
            ),
        )
    }

    @Test
    fun refresh_maps_valid_team_ids_loads_once_and_disabled_event_resets_state() = runTest {
        var loadCount = 0
        val coordinator = coordinator(
            getCheckIns = {
                loadCount += 1
                Result.success(
                    TeamCheckInsResponseDto(
                        checkIns = listOf(
                            TeamCheckInDto(eventTeamId = " team-1 ", status = "PENDING"),
                            TeamCheckInDto(eventTeamId = "  ", status = "CHECKED_IN"),
                            TeamCheckInDto(eventTeamId = null, status = "CHECKED_IN"),
                        ),
                    ),
                )
            },
        )

        coordinator.refreshIfAllowed(event(), canViewCheckIns = true)
        advanceUntilIdle()

        assertEquals(1, loadCount)
        assertEquals(setOf("team-1"), coordinator.eventTeamCheckIns.value.keys)

        coordinator.refreshIfAllowed(event(), canViewCheckIns = true)
        advanceUntilIdle()
        assertEquals(1, loadCount)

        coordinator.refreshIfAllowed(event(teamSignup = false), canViewCheckIns = true)
        assertTrue(coordinator.eventTeamCheckIns.value.isEmpty())

        coordinator.refreshIfAllowed(event(), canViewCheckIns = true)
        advanceUntilIdle()
        assertEquals(2, loadCount)
    }

    @Test
    fun unauthorized_refresh_does_not_load() = runTest {
        var loadCount = 0
        val coordinator = coordinator(
            getCheckIns = {
                loadCount += 1
                Result.success(TeamCheckInsResponseDto())
            },
        )

        coordinator.refreshIfAllowed(event(), canViewCheckIns = false)
        advanceUntilIdle()

        assertEquals(0, loadCount)
        assertTrue(coordinator.eventTeamCheckIns.value.isEmpty())
    }

    @Test
    fun prompt_opens_once_after_window_and_dismiss_does_not_reopen() = runTest {
        val coordinator = coordinator(now = Instant.parse("2026-07-14T11:00:00Z"))

        coordinator.evaluatePrompt(event(), "team-1")
        assertTrue(coordinator.showEventTeamCheckInDialog.value)

        coordinator.dismissDialog()
        assertFalse(coordinator.showEventTeamCheckInDialog.value)

        coordinator.evaluatePrompt(event(), "team-1")
        assertFalse(coordinator.showEventTeamCheckInDialog.value)
    }

    @Test
    fun existing_check_in_with_empty_status_suppresses_prompt() = runTest {
        val coordinator = coordinator(
            now = Instant.parse("2026-07-14T11:00:00Z"),
            getCheckIns = {
                Result.success(
                    TeamCheckInsResponseDto(
                        checkIns = listOf(TeamCheckInDto(eventTeamId = "team-1", status = null)),
                    ),
                )
            },
        )

        coordinator.refreshIfAllowed(event(), canViewCheckIns = true)
        advanceUntilIdle()
        coordinator.evaluatePrompt(event(), "team-1")

        assertFalse(coordinator.showEventTeamCheckInDialog.value)
    }

    @Test
    fun confirm_deduplicates_in_flight_request_and_records_success() = runTest {
        var checkInCount = 0
        val errors = mutableListOf<Throwable>()
        val coordinator = coordinator(
            now = Instant.parse("2026-07-14T11:00:00Z"),
            checkIn = { eventId, eventTeamId ->
                checkInCount += 1
                Result.success(
                    TeamCheckInDto(
                        eventId = eventId,
                        eventTeamId = eventTeamId,
                        status = "CHECKED_IN",
                    ),
                )
            },
        )
        coordinator.evaluatePrompt(event(), "team-1")

        coordinator.confirm(event(), "team-1", errors::add)
        assertTrue(coordinator.eventTeamCheckInSaving.value)
        coordinator.confirm(event(), "team-1", errors::add)
        advanceUntilIdle()

        assertEquals(1, checkInCount)
        assertTrue(errors.isEmpty())
        assertFalse(coordinator.eventTeamCheckInSaving.value)
        assertFalse(coordinator.showEventTeamCheckInDialog.value)
        assertEquals("CHECKED_IN", coordinator.eventTeamCheckIns.value["team-1"]?.status)

        coordinator.evaluatePrompt(event(), "team-1")
        assertFalse(coordinator.showEventTeamCheckInDialog.value)
    }

    @Test
    fun failed_confirmation_reports_error_and_keeps_prompt_open() = runTest {
        val failure = IllegalStateException("denied")
        val errors = mutableListOf<Throwable>()
        val coordinator = coordinator(
            now = Instant.parse("2026-07-14T11:00:00Z"),
            checkIn = { _, _ -> Result.failure(failure) },
        )
        coordinator.evaluatePrompt(event(), "team-1")

        coordinator.confirm(event(), "team-1", errors::add)
        advanceUntilIdle()

        assertEquals(listOf<Throwable>(failure), errors)
        assertFalse(coordinator.eventTeamCheckInSaving.value)
        assertTrue(coordinator.showEventTeamCheckInDialog.value)
        assertTrue(coordinator.eventTeamCheckIns.value.isEmpty())
    }

    @Test
    fun invalid_confirmation_dismisses_prompt_without_request() = runTest {
        var checkInCount = 0
        val coordinator = coordinator(
            now = Instant.parse("2026-07-14T11:00:00Z"),
            checkIn = { _, _ ->
                checkInCount += 1
                Result.success(TeamCheckInDto())
            },
        )
        coordinator.evaluatePrompt(event(), "team-1")
        assertTrue(coordinator.showEventTeamCheckInDialog.value)

        coordinator.confirm(event(mode = TeamCheckInMode.OFF), "team-1") {
            error("No failure expected")
        }
        advanceUntilIdle()

        assertEquals(0, checkInCount)
        assertFalse(coordinator.showEventTeamCheckInDialog.value)
        assertFalse(coordinator.eventTeamCheckInSaving.value)
    }

    private fun kotlinx.coroutines.test.TestScope.coordinator(
        now: Instant = Instant.parse("2026-07-14T10:00:00Z"),
        getCheckIns: suspend (String) -> Result<TeamCheckInsResponseDto> = {
            Result.success(TeamCheckInsResponseDto())
        },
        checkIn: suspend (String, String) -> Result<TeamCheckInDto> = { eventId, eventTeamId ->
            Result.success(TeamCheckInDto(eventId = eventId, eventTeamId = eventTeamId))
        },
    ): EventTeamCheckInCoordinator = EventTeamCheckInCoordinator(
        getEventTeamCheckInsRequest = getCheckIns,
        checkInEventTeamRequest = checkIn,
        scope = this,
        now = { now },
    )

    private fun event(
        teamSignup: Boolean = true,
        mode: TeamCheckInMode = TeamCheckInMode.EVENT,
        openMinutesBefore: Int = 60,
    ): Event = Event(
        id = "event-1",
        teamSignup = teamSignup,
        teamCheckInMode = mode,
        teamCheckInOpenMinutesBefore = openMinutesBefore,
        start = Instant.parse("2026-07-14T12:00:00Z"),
    )
}
