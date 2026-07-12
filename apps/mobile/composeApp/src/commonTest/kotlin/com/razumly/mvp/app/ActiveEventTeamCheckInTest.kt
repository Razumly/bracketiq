package com.razumly.mvp.app

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.UserScheduleSnapshot
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Instant

class ActiveEventTeamCheckInTest {
    @Test
    fun active_event_prompt_candidates_include_managed_teams_inside_the_check_in_window() {
        val event = Event(
            id = "event-1",
            name = "Summer Tournament",
            start = Instant.parse("2026-07-12T12:00:00Z"),
            end = Instant.parse("2026-07-12T20:00:00Z"),
            teamIds = listOf("team-1"),
            teamCheckInMode = TeamCheckInMode.EVENT,
            teamCheckInOpenMinutesBefore = 60,
        )
        val team = Team(captainId = "captain-1").copy(
            id = "team-1",
            name = "Riverside",
            managerId = "manager-1",
        )

        val candidates = resolveActiveEventTeamCheckInCandidates(
            snapshot = UserScheduleSnapshot(events = listOf(event), teams = listOf(team)),
            user = UserData().copy(id = "manager-1"),
            now = Instant.parse("2026-07-12T11:30:00Z"),
        )

        assertEquals(
            listOf(ActiveEventTeamCheckInPrompt("event-1", "Summer Tournament", "team-1", "Riverside")),
            candidates,
        )
    }

    @Test
    fun active_event_prompt_candidates_exclude_players_and_events_before_the_window() {
        val event = Event(
            id = "event-1",
            start = Instant.parse("2026-07-12T12:00:00Z"),
            end = Instant.parse("2026-07-12T20:00:00Z"),
            teamIds = listOf("team-1"),
            teamCheckInMode = TeamCheckInMode.EVENT,
            teamCheckInOpenMinutesBefore = 30,
        )
        val team = Team(captainId = "captain-1").copy(
            id = "team-1",
            playerIds = listOf("player-1"),
        )
        val snapshot = UserScheduleSnapshot(events = listOf(event), teams = listOf(team))

        assertTrue(resolveActiveEventTeamCheckInCandidates(
            snapshot = snapshot,
            user = UserData().copy(id = "player-1"),
            now = Instant.parse("2026-07-12T11:45:00Z"),
        ).isEmpty())
        assertTrue(resolveActiveEventTeamCheckInCandidates(
            snapshot = snapshot,
            user = UserData().copy(id = "captain-1"),
            now = Instant.parse("2026-07-12T11:00:00Z"),
        ).isEmpty())
    }
}
