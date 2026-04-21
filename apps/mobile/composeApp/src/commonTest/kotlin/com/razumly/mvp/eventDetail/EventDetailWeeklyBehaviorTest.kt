package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant

class EventDetailWeeklyBehaviorTest {

    @Test
    fun weekly_events_do_not_switch_primary_action_to_view_schedule() {
        assertFalse(
            shouldUseViewSchedulePrimaryAction(
                isWeeklyParentEvent = true,
                isUserInEvent = true,
                isHost = false,
                isAssistantHost = false,
                isEventOfficial = false,
            ),
        )
    }

    @Test
    fun weekly_events_hide_overview_roster_sections() {
        assertFalse(
            shouldShowOverviewRosterSections(
                Event(
                    eventType = EventType.WEEKLY_EVENT,
                    teamSignup = true,
                ),
            ),
        )
        assertTrue(
            shouldShowOverviewRosterSections(
                Event(
                    eventType = EventType.EVENT,
                    teamSignup = true,
                ),
            ),
        )
    }

    @Test
    fun joined_weekly_occurrence_keeps_join_actions_hidden() {
        assertFalse(
            shouldRenderJoinOptionsActions(
                isWeeklyParentEvent = true,
                selectedWeeklyOccurrenceLabel = "Tue 4/14/26, 9:00 AM-6:00 PM",
                selectedWeeklyOccurrenceJoined = true,
                selectedWeeklyOccurrenceStarted = false,
            ),
        )
        assertTrue(
            shouldRenderJoinOptionsActions(
                isWeeklyParentEvent = true,
                selectedWeeklyOccurrenceLabel = "Wed 4/15/26, 9:00 AM-6:00 PM",
                selectedWeeklyOccurrenceJoined = false,
                selectedWeeklyOccurrenceStarted = false,
            ),
        )
    }

    @Test
    fun weekly_events_do_not_show_schedule_match_management_controls() {
        assertFalse(shouldShowScheduleMatchManagement(EventType.WEEKLY_EVENT))
        assertTrue(shouldShowScheduleMatchManagement(EventType.LEAGUE))
        assertTrue(shouldShowScheduleMatchManagement(EventType.TOURNAMENT))
    }

    @Test
    fun weekly_schedule_options_extend_beyond_same_day_event_end() {
        val event = Event(
            id = "weekly-event",
            name = "Weekly Event",
            hostId = "host-1",
            eventType = EventType.WEEKLY_EVENT,
            start = Instant.parse("2026-04-12T12:00:00Z"),
            end = Instant.parse("2026-04-12T18:00:00Z"),
            divisions = listOf("open"),
            timeSlotIds = listOf("slot-1"),
        )
        val slot = TimeSlot(
            id = "slot-1",
            dayOfWeek = 1,
            daysOfWeek = listOf(1, 2),
            divisions = listOf("open"),
            startTimeMinutes = 9 * 60,
            endTimeMinutes = 13 * 60,
            startDate = Instant.parse("2026-04-12T12:00:00Z"),
            repeating = true,
            endDate = null,
            scheduledFieldId = "field-1",
            scheduledFieldIds = listOf("field-1"),
            price = null,
        )

        val options = buildWeeklyScheduleOptions(
            event = event,
            timeSlots = listOf(slot),
        )

        assertTrue(options.isNotEmpty())
        assertTrue(options.any { option -> option.occurrenceDate == "2026-04-14" })
        assertTrue(options.any { option -> option.occurrenceDate == "2026-04-15" })
    }

    @Test
    fun teams_needing_players_summary_uses_singular_copy_for_single_team_and_player() {
        assertEquals(
            "1 team needs 1 player",
            formatTeamsNeedingPlayersSummary(listOf(1)),
        )
    }

    @Test
    fun teams_needing_players_summary_collapses_identical_ranges() {
        assertEquals(
            "3 teams need 2 players",
            formatTeamsNeedingPlayersSummary(listOf(2, 2, 2)),
        )
        assertEquals(
            "3 teams need 1-3 players",
            formatTeamsNeedingPlayersSummary(listOf(1, 2, 3)),
        )
    }

    @Test
    fun cached_join_confirmation_requires_exact_weekly_occurrence_match() {
        val target = JoinConfirmationTarget(
            eventId = "weekly-event",
            registrantType = JoinConfirmationRegistrantType.TEAM,
            registrantId = "team-1",
            occurrence = EventOccurrenceSelection(
                slotId = "slot-1",
                occurrenceDate = "2026-04-14",
            ),
        )

        assertTrue(
            registrationMatchesJoinConfirmationTarget(
                registration = EventRegistrationCacheEntry(
                    id = "reg-1",
                    eventId = "weekly-event",
                    registrantId = "team-1",
                    registrantType = "TEAM",
                    rosterRole = "PARTICIPANT",
                    status = "ACTIVE",
                    slotId = "slot-1",
                    occurrenceDate = "2026-04-14",
                ),
                target = target,
            ),
        )
        assertFalse(
            registrationMatchesJoinConfirmationTarget(
                registration = EventRegistrationCacheEntry(
                    id = "reg-2",
                    eventId = "weekly-event",
                    registrantId = "team-1",
                    registrantType = "TEAM",
                    rosterRole = "PARTICIPANT",
                    status = "ACTIVE",
                    slotId = "slot-1",
                    occurrenceDate = "2026-04-16",
                ),
                target = target,
            ),
        )
    }

    @Test
    fun event_snapshot_join_confirmation_requires_exact_registrant_type() {
        val selfTarget = JoinConfirmationTarget(
            eventId = "event-1",
            registrantType = JoinConfirmationRegistrantType.SELF,
            registrantId = "user-1",
        )
        val teamTarget = JoinConfirmationTarget(
            eventId = "event-1",
            registrantType = JoinConfirmationRegistrantType.TEAM,
            registrantId = "team-1",
        )
        val event = Event(
            id = "event-1",
            userIds = listOf("user-1"),
            teamIds = listOf("team-1"),
        )

        assertTrue(eventSnapshotMatchesJoinConfirmationTarget(event, selfTarget))
        assertTrue(eventSnapshotMatchesJoinConfirmationTarget(event, teamTarget))
        assertFalse(
            eventSnapshotMatchesJoinConfirmationTarget(
                event.copy(userIds = emptyList()),
                selfTarget,
            ),
        )
        assertFalse(
            eventSnapshotMatchesJoinConfirmationTarget(
                event.copy(teamIds = emptyList()),
                teamTarget,
            ),
        )
    }
}
