package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventSearchOccurrence
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.dataTypes.RepeatingTimeSlotValidationException
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant

class EventDetailWeeklyBehaviorTest {

    @Test
    fun weekly_events_do_not_switch_primary_action_to_view_schedule() {
        assertFalse(
            shouldUseViewSchedulePrimaryAction(
                isWeeklyParentEvent = true,
                isAffiliateEvent = false,
                isUserInEvent = true,
                isHost = false,
                isAssistantHost = false,
                isEventOfficial = false,
            ),
        )
    }

    @Test
    fun affiliate_events_do_not_switch_primary_action_to_view_schedule() {
        assertFalse(
            shouldUseViewSchedulePrimaryAction(
                isWeeklyParentEvent = false,
                isAffiliateEvent = true,
                isUserInEvent = true,
                isHost = true,
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
            noFixedEndDateTime = true,
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
    fun planned_end_caps_weekly_schedule_and_session_options_when_slot_has_no_end() {
        val event = Event(
            id = "weekly-fixed-end-event",
            eventType = EventType.WEEKLY_EVENT,
            start = Instant.parse("2099-04-13T00:00:00Z"),
            end = Instant.parse("2099-04-20T23:59:59Z"),
            noFixedEndDateTime = false,
            timeZone = "UTC",
            divisions = listOf("open"),
            timeSlotIds = listOf("slot-fixed-end"),
        )
        val slot = TimeSlot(
            id = "slot-fixed-end",
            dayOfWeek = 0,
            daysOfWeek = listOf(0),
            divisions = listOf("open"),
            startTimeMinutes = 9 * 60,
            endTimeMinutes = 10 * 60,
            startDate = Instant.parse("2099-04-13T00:00:00Z"),
            timeZone = "UTC",
            repeating = true,
            endDate = null,
            scheduledFieldId = "field-1",
            scheduledFieldIds = listOf("field-1"),
            price = null,
        )

        val scheduleOptions = buildWeeklyScheduleOptions(event, listOf(slot))
        val sessionOptions = buildWeeklySessionOptions(event, listOf(slot))

        assertTrue(scheduleOptions.any { option -> option.occurrenceDate == "2099-04-20" })
        assertTrue(sessionOptions.any { option -> option.occurrenceDate == "2099-04-20" })
        assertFalse(scheduleOptions.any { option -> option.occurrenceDate > "2099-04-20" })
        assertFalse(sessionOptions.any { option -> option.occurrenceDate > "2099-04-20" })
    }

    @Test
    fun planned_end_excludes_weekly_occurrence_that_ends_after_exact_end_time() {
        val event = Event(
            id = "weekly-exact-end-event",
            eventType = EventType.WEEKLY_EVENT,
            start = Instant.parse("2099-04-13T00:00:00Z"),
            end = Instant.parse("2099-04-20T09:30:00Z"),
            noFixedEndDateTime = false,
            timeZone = "UTC",
            timeSlotIds = listOf("slot-exact-end"),
        )
        val slot = TimeSlot(
            id = "slot-exact-end",
            dayOfWeek = 0,
            daysOfWeek = listOf(0),
            startTimeMinutes = 9 * 60,
            endTimeMinutes = 10 * 60,
            startDate = Instant.parse("2099-04-13T00:00:00Z"),
            timeZone = "UTC",
            repeating = true,
            endDate = null,
            price = null,
        )

        val scheduleOptions = buildWeeklyScheduleOptions(event, listOf(slot))
        val sessionOptions = buildWeeklySessionOptions(event, listOf(slot))

        assertTrue(scheduleOptions.any { option -> option.occurrenceDate == "2099-04-13" })
        assertFalse(scheduleOptions.any { option -> option.occurrenceDate == "2099-04-20" })
        assertTrue(sessionOptions.any { option -> option.occurrenceDate == "2099-04-13" })
        assertFalse(sessionOptions.any { option -> option.occurrenceDate == "2099-04-20" })
    }

    @Test
    fun given_slot_with_named_time_zone_when_building_weekly_schedule_options_then_uses_slot_local_date_bounds() {
        val event = Event(
            id = "weekly-named-zone-event",
            eventType = EventType.WEEKLY_EVENT,
            start = Instant.parse("2026-04-13T00:30:00Z"),
            end = Instant.parse("2026-04-20T00:30:00Z"),
            timeZone = "UTC",
            divisions = listOf("open"),
        )
        val slot = TimeSlot(
            id = "slot-named-zone",
            dayOfWeek = 6,
            daysOfWeek = listOf(6),
            divisions = listOf("open"),
            startTimeMinutes = 18 * 60,
            endTimeMinutes = 19 * 60,
            startDate = Instant.parse("2026-04-12T07:00:00Z"),
            timeZone = "America/Los_Angeles",
            repeating = true,
            endDate = Instant.parse("2026-04-19T07:00:00Z"),
            scheduledFieldId = "field-1",
            scheduledFieldIds = listOf("field-1"),
            price = null,
        )

        val options = buildWeeklyScheduleOptions(event, listOf(slot))

        assertEquals("2026-04-12", options.first().occurrenceDate)
    }

    @Test
    fun given_mixed_repeating_and_one_time_slots_when_building_weekly_options_then_preserves_one_time_interval() {
        val event = Event(
            id = "weekly-mixed-event",
            eventType = EventType.WEEKLY_EVENT,
            start = Instant.parse("2099-04-13T00:00:00Z"),
            end = Instant.parse("2099-05-31T23:59:59Z"),
            timeZone = "UTC",
            divisions = listOf("open"),
        )
        val repeatingSlot = TimeSlot(
            id = "slot-repeating",
            dayOfWeek = 0,
            daysOfWeek = listOf(0),
            divisions = listOf("open"),
            startTimeMinutes = 9 * 60,
            endTimeMinutes = 10 * 60,
            startDate = Instant.parse("2099-04-13T00:00:00Z"),
            timeZone = "UTC",
            repeating = true,
            endDate = Instant.parse("2099-04-20T00:00:00Z"),
            scheduledFieldId = "field-1",
            scheduledFieldIds = listOf("field-1"),
            price = null,
        )
        val oneTimeSlot = TimeSlot(
            id = "slot-one-time",
            dayOfWeek = null,
            daysOfWeek = null,
            divisions = listOf("open"),
            startTimeMinutes = 11 * 60,
            endTimeMinutes = 12 * 60,
            startDate = Instant.parse("2099-04-14T11:00:00Z"),
            timeZone = "UTC",
            repeating = false,
            endDate = Instant.parse("2099-04-14T12:00:00Z"),
            scheduledFieldId = "field-1",
            scheduledFieldIds = listOf("field-1"),
            price = null,
        )

        val slots = listOf(repeatingSlot, oneTimeSlot)
        val scheduleOptions = buildWeeklyScheduleOptions(event, slots)
        val sessionOptions = buildWeeklySessionOptions(event, slots)

        assertEquals(
            Instant.parse("2099-04-14T11:00:00Z"),
            scheduleOptions.single { option -> option.slotId == "slot-one-time" }.start,
        )
        assertEquals(
            Instant.parse("2099-04-14T11:00:00Z"),
            sessionOptions.single { option -> option.slotId == "slot-one-time" }.start,
        )
    }

    @Test
    fun given_invalid_repeating_slot_when_building_weekly_schedule_options_then_surfaces_resolver_failure() {
        val event = Event(
            id = "weekly-gap-event",
            eventType = EventType.WEEKLY_EVENT,
            start = Instant.parse("2099-03-01T05:00:00Z"),
            end = Instant.parse("2099-03-15T05:00:00Z"),
            timeZone = "UTC",
            divisions = listOf("open"),
        )
        val slot = TimeSlot(
            id = "slot-gap",
            dayOfWeek = 6,
            daysOfWeek = listOf(6),
            divisions = listOf("open"),
            startTimeMinutes = 2 * 60 + 30,
            endTimeMinutes = 4 * 60,
            startDate = Instant.parse("2099-03-01T05:00:00Z"),
            timeZone = "America/New_York",
            repeating = true,
            endDate = Instant.parse("2099-03-15T04:00:00Z"),
            scheduledFieldId = "field-1",
            scheduledFieldIds = listOf("field-1"),
            price = null,
        )

        assertFailsWith<RepeatingTimeSlotValidationException> {
            buildWeeklyScheduleOptions(event, listOf(slot))
        }
    }

    @Test
    fun given_weekly_event_when_building_session_options_then_builds_three_weeks_from_slot_start() {
        val event = Event(
            id = "weekly-session-event",
            name = "Weekly Sessions",
            eventType = EventType.WEEKLY_EVENT,
            start = Instant.parse("2099-04-13T00:00:00Z"),
            end = Instant.parse("2099-05-31T23:59:59Z"),
            timeZone = "UTC",
            divisions = listOf("open"),
            timeSlotIds = listOf("slot-weekly"),
        )
        val slot = TimeSlot(
            id = "slot-weekly",
            dayOfWeek = 0,
            daysOfWeek = (0..6).toList(),
            divisions = listOf("open"),
            startTimeMinutes = 9 * 60,
            endTimeMinutes = 10 * 60 + 30,
            startDate = Instant.parse("2099-04-13T00:00:00Z"),
            repeating = true,
            endDate = Instant.parse("2099-05-31T23:59:59Z"),
            scheduledFieldId = "field-1",
            scheduledFieldIds = listOf("field-1"),
            price = null,
        )

        val options = buildWeeklySessionOptions(event, listOf(slot))

        assertEquals("2099-04-13", options.first().occurrenceDate)
        assertEquals("CoEd Open 18+", options.first().divisionLabel)
        assertEquals(9, options.first().start.toString().substring(11, 13).toInt())
        assertEquals(21, options.size)
        assertEquals(options.map { option -> option.id }.distinct().size, options.size)
    }

    @Test
    fun discover_projection_uses_next_weekly_occurrence_when_parent_start_is_past() {
        val event = Event(
            id = "weekly-discover-event",
            name = "Weekly Discover Event",
            eventType = EventType.WEEKLY_EVENT,
            start = Instant.parse("2026-04-01T00:00:00Z"),
            end = Instant.parse("2026-04-30T23:59:59Z"),
            timeZone = "UTC",
            noFixedEndDateTime = true,
            timeSlotIds = listOf(" slot-weekly "),
            scheduleText = "Every week",
        )
        val slot = TimeSlot(
            id = "slot-weekly",
            dayOfWeek = 0,
            daysOfWeek = (0..6).toList(),
            startTimeMinutes = 9 * 60,
            endTimeMinutes = 10 * 60 + 30,
            startDate = Instant.parse("2026-04-01T00:00:00Z"),
            repeating = true,
            endDate = Instant.parse("2026-05-31T23:59:59Z"),
            price = null,
        )

        val projected = event.withNextWeeklyOccurrenceForDiscover(
            timeSlots = listOf(slot),
            now = Instant.parse("2026-04-15T12:00:00Z"),
        )

        assertEquals("weekly-discover-event", projected.id)
        assertEquals(Instant.parse("2026-04-01T00:00:00Z"), projected.start)
        assertEquals(Instant.parse("2026-04-30T23:59:59Z"), projected.end)
        assertEquals(
            Instant.parse("2026-04-16T09:00:00Z"),
            projected.nextOccurrence?.start,
        )
        assertEquals(
            Instant.parse("2026-04-16T10:30:00Z"),
            projected.nextOccurrence?.end,
        )
        assertNull(projected.scheduleText)

    }

    @Test
    fun discover_projection_skips_in_progress_weekly_occurrence() {
        val event = Event(
            id = "weekly-in-progress-event",
            name = "Weekly In Progress Event",
            eventType = EventType.WEEKLY_EVENT,
            start = Instant.parse("2026-04-01T00:00:00Z"),
            end = Instant.parse("2026-04-30T23:59:59Z"),
            timeZone = "UTC",
            noFixedEndDateTime = true,
        )
        val slot = TimeSlot(
            id = "slot-weekly",
            dayOfWeek = 0,
            daysOfWeek = (0..6).toList(),
            startTimeMinutes = 9 * 60,
            endTimeMinutes = 10 * 60 + 30,
            startDate = Instant.parse("2026-04-01T00:00:00Z"),
            timeZone = "UTC",
            repeating = true,
            endDate = Instant.parse("2026-05-31T23:59:59Z"),
            price = null,
        )

        val projected = event.withNextWeeklyOccurrenceForDiscover(
            timeSlots = listOf(slot),
            now = Instant.parse("2026-04-15T09:30:00Z"),
        )

        assertEquals(
            Instant.parse("2026-04-16T09:00:00Z"),
            projected.nextOccurrence?.start,
        )
        assertEquals(
            Instant.parse("2026-04-16T10:30:00Z"),
            projected.nextOccurrence?.end,
        )
    }

    @Test
    fun discover_projection_recomputes_occurrence_inside_requested_date_range() {
        val event = Event(
            id = "weekly-range-event",
            eventType = EventType.WEEKLY_EVENT,
            start = Instant.parse("2026-04-01T00:00:00Z"),
            end = Instant.parse("2026-04-30T23:59:59Z"),
            timeZone = "UTC",
            noFixedEndDateTime = true,
            timeSlotIds = listOf("slot-range"),
        ).also { weekly ->
            weekly.nextOccurrence = EventSearchOccurrence(
                slotId = "slot-range",
                occurrenceDate = "2026-04-16",
                start = Instant.parse("2026-04-16T09:00:00Z"),
                end = Instant.parse("2026-04-16T10:00:00Z"),
            )
        }
        val slot = TimeSlot(
            id = "slot-range",
            dayOfWeek = 0,
            daysOfWeek = listOf(0),
            startTimeMinutes = 9 * 60,
            endTimeMinutes = 10 * 60,
            startDate = Instant.parse("2026-04-01T00:00:00Z"),
            timeZone = "UTC",
            repeating = true,
            endDate = null,
            price = null,
        )

        val projected = event.withNextWeeklyOccurrenceForDiscover(
            timeSlots = listOf(slot),
            now = Instant.parse("2026-04-15T12:00:00Z"),
            occurrenceRangeStart = Instant.parse("2026-04-20T00:00:00Z"),
            occurrenceRangeEnd = Instant.parse("2026-04-25T23:59:59Z"),
        )

        assertEquals("2026-04-20", projected.nextOccurrence?.occurrenceDate)
        assertEquals(event.start, projected.start)
        assertEquals(event.end, projected.end)
    }

    @Test
    fun archived_weekly_discover_projection_clears_server_next_occurrence_and_display_overrides() {
        val event = Event(
            id = "archived-weekly-discover-event",
            name = "Archived Weekly Discover Event",
            eventType = EventType.WEEKLY_EVENT,
            start = Instant.parse("2026-04-01T00:00:00Z"),
            end = Instant.parse("2026-04-30T23:59:59Z"),
            timeZone = "UTC",
            archivedAt = "2026-04-10T00:00:00Z",
            scheduleText = "Every week",
            dateDisplayMode = "NO_FIXED_DATE",
            dateDisplayText = "Next session",
        ).also { archived ->
            archived.nextOccurrence = EventSearchOccurrence(
                slotId = "slot-weekly",
                occurrenceDate = "2026-04-16",
                start = Instant.parse("2026-04-16T09:00:00Z"),
                end = Instant.parse("2026-04-16T10:30:00Z"),
            )
        }

        val projected = event.withNextWeeklyOccurrenceForDiscover(
            timeSlots = emptyList(),
            now = Instant.parse("2026-04-15T12:00:00Z"),
        )

        assertEquals(event.start, projected.start)
        assertEquals(event.end, projected.end)
        assertNull(projected.nextOccurrence)
        assertNull(projected.scheduleText)
        assertNull(projected.dateDisplayMode)
        assertNull(projected.dateDisplayText)
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
    fun join_confirmation_target_trims_event_and_registrant_ids() {
        val occurrence = EventOccurrenceSelection(
            slotId = "slot-1",
            occurrenceDate = "2026-04-14",
        )

        assertEquals(
            JoinConfirmationTarget(
                eventId = "weekly-event",
                registrantType = JoinConfirmationRegistrantType.TEAM,
                registrantId = "team-1",
                occurrence = occurrence,
            ),
            buildJoinConfirmationTarget(
                eventId = " weekly-event ",
                registrantType = JoinConfirmationRegistrantType.TEAM,
                registrantId = " team-1 ",
                occurrence = occurrence,
            ),
        )
    }

    @Test
    fun join_confirmation_target_requires_event_and_registrant_ids() {
        assertNull(
            buildJoinConfirmationTarget(
                eventId = " ",
                registrantType = JoinConfirmationRegistrantType.SELF,
                registrantId = "user-1",
            ),
        )
        assertNull(
            buildJoinConfirmationTarget(
                eventId = "weekly-event",
                registrantType = JoinConfirmationRegistrantType.SELF,
                registrantId = " ",
            ),
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
    fun cached_join_confirmation_requires_active_participant_registration() {
        val target = JoinConfirmationTarget(
            eventId = "weekly-event",
            registrantType = JoinConfirmationRegistrantType.SELF,
            registrantId = "user-1",
        )
        val activeParticipant = EventRegistrationCacheEntry(
            id = "reg-1",
            eventId = "weekly-event",
            registrantId = "user-1",
            registrantType = "SELF",
            rosterRole = "PARTICIPANT",
            status = "ACTIVE",
        )

        assertTrue(
            registrationMatchesJoinConfirmationTarget(
                registration = activeParticipant,
                target = target,
            ),
        )
        assertFalse(
            registrationMatchesJoinConfirmationTarget(
                registration = activeParticipant.copy(rosterRole = "WAITLIST"),
                target = target,
            ),
        )
        listOf("CANCELLED", "CONSENTFAILED", "PAYMENT_FAILED").forEach { status ->
            assertFalse(
                registrationMatchesJoinConfirmationTarget(
                    registration = activeParticipant.copy(status = status),
                    target = target,
                ),
            )
        }
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

    @Test
    fun given_non_weekly_event_when_building_route_presentation_then_uses_event_start_policy() {
        val event = Event(
            id = "one-off-event",
            eventType = EventType.EVENT,
            address = "123 Main St",
        )

        val presentation = buildEventDetailWeeklyRoutePresentation(
            selectedEvent = EventWithFullRelations(
                event = event,
                players = emptyList(),
                matches = emptyList(),
                teams = emptyList(),
            ),
            selectedWeeklyOccurrence = null,
            sports = emptyList(),
            now = Instant.parse("2026-04-12T12:00:00Z"),
            eventHasStarted = true,
            isUserInEvent = false,
            isHost = false,
            isAssistantHost = false,
            isEventOfficial = false,
        )

        assertFalse(presentation.isWeeklyEvent)
        assertFalse(presentation.isWeeklyParentEvent)
        assertTrue(presentation.joinBlockedByStart)
        assertTrue(presentation.hasDirectionsTarget)
        assertTrue(presentation.weeklySessionOptions.isEmpty())
        assertTrue(presentation.weeklyScheduleOptions.isEmpty())
    }

    @Test
    fun archived_weekly_event_is_not_presented_as_a_weekly_parent() {
        val event = Event(
            id = "archived-weekly-event",
            eventType = EventType.WEEKLY_EVENT,
            state = "ARCHIVED",
            timeSlotIds = listOf("slot-weekly"),
        )
        val occurrence = SelectedWeeklyOccurrenceState(
            slotId = "slot-weekly",
            occurrenceDate = "2026-04-13",
            label = "Archived session",
            sessionStart = Instant.parse("2026-04-13T09:00:00Z"),
            sessionEnd = Instant.parse("2026-04-13T10:00:00Z"),
        )

        val presentation = buildEventDetailWeeklyRoutePresentation(
            selectedEvent = EventWithFullRelations(
                event = event,
                players = emptyList(),
                matches = emptyList(),
                teams = emptyList(),
            ),
            selectedWeeklyOccurrence = occurrence,
            sports = emptyList(),
            now = Instant.parse("2026-04-12T12:00:00Z"),
            eventHasStarted = false,
            isUserInEvent = false,
            isHost = false,
            isAssistantHost = false,
            isEventOfficial = false,
        )

        assertFalse(presentation.isWeeklyParentEvent)
        assertFalse(presentation.selectedWeeklyOccurrenceJoined)
        assertTrue(presentation.weeklySessionOptions.isEmpty())
        assertTrue(presentation.weeklyScheduleOptions.isEmpty())
    }

    @Test
    fun given_weekly_parent_when_building_route_presentation_then_builds_sessions_and_tracks_join() {
        val event = Event(
            id = "weekly-route-event",
            eventType = EventType.WEEKLY_EVENT,
            start = Instant.parse("2099-04-13T00:00:00Z"),
            end = Instant.parse("2099-05-31T23:59:59Z"),
            timeZone = "UTC",
            divisions = listOf("open"),
            timeSlotIds = listOf("slot-weekly"),
        )
        val slot = TimeSlot(
            id = "slot-weekly",
            dayOfWeek = 0,
            daysOfWeek = (0..6).toList(),
            divisions = listOf("open"),
            startTimeMinutes = 9 * 60,
            endTimeMinutes = 10 * 60,
            startDate = Instant.parse("2099-04-13T00:00:00Z"),
            repeating = true,
            endDate = Instant.parse("2099-05-31T23:59:59Z"),
            scheduledFieldId = "field-1",
            scheduledFieldIds = listOf("field-1"),
            price = null,
        )
        val occurrence = SelectedWeeklyOccurrenceState(
            slotId = "slot-weekly",
            occurrenceDate = "2099-04-13",
            label = "Weekly session",
            sessionStart = Instant.parse("2099-04-13T09:00:00Z"),
            sessionEnd = Instant.parse("2099-04-13T10:00:00Z"),
        )

        val presentation = buildEventDetailWeeklyRoutePresentation(
            selectedEvent = EventWithFullRelations(
                event = event,
                players = emptyList(),
                matches = emptyList(),
                teams = emptyList(),
                timeSlots = listOf(slot),
            ),
            selectedWeeklyOccurrence = occurrence,
            sports = emptyList(),
            now = Instant.parse("2099-04-12T12:00:00Z"),
            eventHasStarted = false,
            isUserInEvent = true,
            isHost = false,
            isAssistantHost = false,
            isEventOfficial = false,
        )

        assertTrue(presentation.isWeeklyParentEvent)
        assertFalse(presentation.selectedWeeklyOccurrenceStarted)
        assertFalse(presentation.joinBlockedByStart)
        assertTrue(presentation.selectedWeeklyOccurrenceJoined)
        assertTrue(presentation.weeklySessionOptions.isNotEmpty())
        assertTrue(presentation.weeklyScheduleOptions.isNotEmpty())
        assertEquals(
            presentation.weeklyScheduleOptions.size,
            presentation.weeklyScheduleItems.size,
        )
    }
}
