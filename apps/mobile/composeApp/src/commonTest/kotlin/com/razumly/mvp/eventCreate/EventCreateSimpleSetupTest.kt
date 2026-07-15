package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.eventDetail.EventDetailsSectionVisibility
import kotlin.time.ExperimentalTime
import kotlin.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EventCreateSimpleSetupTest {

    @Test
    fun simple_setup_pages_match_the_advanced_event_detail_sections() {
        assertEquals(
            listOf(
                "Basic Information",
                "Event Details",
                "Match Rules",
                "Staff",
                "Divisions",
                "League Scoring Config",
                "Schedule",
            ),
            EventCreateSetupPageId.entries.map(EventCreateSetupPageId::label),
        )
    }

    @Test
    fun standard_events_skip_only_advanced_sections_that_do_not_render() {
        val pages = resolveEventCreateSetupPages(
            event = Event(eventType = EventType.EVENT),
            currentPageId = EventCreateSetupPageId.BASIC_INFORMATION,
            completedPageIds = emptySet(),
        )

        assertFalse(pages.first { it.id == EventCreateSetupPageId.MATCH_RULES }.used)
        assertFalse(pages.first { it.id == EventCreateSetupPageId.LEAGUE_SCORING }.used)
        assertTrue(pages.first { it.id == EventCreateSetupPageId.EVENT_DETAILS }.used)
        assertTrue(pages.first { it.id == EventCreateSetupPageId.STAFF }.used)
        assertTrue(pages.first { it.id == EventCreateSetupPageId.DIVISIONS }.used)
        assertTrue(pages.first { it.id == EventCreateSetupPageId.SCHEDULE }.used)
    }

    @Test
    fun league_setup_includes_every_advanced_section() {
        val pages = resolveEventCreateSetupPages(
            event = Event(eventType = EventType.LEAGUE),
            currentPageId = EventCreateSetupPageId.BASIC_INFORMATION,
            completedPageIds = setOf(EventCreateSetupPageId.BASIC_INFORMATION),
        )

        assertTrue(pages.all(EventCreateSetupPage::used))
        assertEquals(
            EventCreateSetupPageStatus.AVAILABLE,
            pages.first { it.id == EventCreateSetupPageId.EVENT_DETAILS }.status,
        )
    }

    @Test
    fun tournament_setup_includes_match_rules_but_not_league_scoring() {
        val pages = resolveEventCreateSetupPages(
            event = Event(eventType = EventType.TOURNAMENT),
            currentPageId = EventCreateSetupPageId.BASIC_INFORMATION,
            completedPageIds = emptySet(),
        )

        assertTrue(pages.first { it.id == EventCreateSetupPageId.MATCH_RULES }.used)
        assertFalse(pages.first { it.id == EventCreateSetupPageId.LEAGUE_SCORING }.used)
    }

    @Test
    fun navigation_skips_sections_advanced_does_not_render() {
        val pages = resolveEventCreateSetupPages(
            event = Event(eventType = EventType.EVENT),
            currentPageId = EventCreateSetupPageId.EVENT_DETAILS,
            completedPageIds = EventCreateSetupPageId.entries.toSet(),
        )

        assertEquals(
            EventCreateSetupPageId.STAFF,
            nextUsedSetupPage(pages, EventCreateSetupPageId.EVENT_DETAILS),
        )
        assertEquals(
            EventCreateSetupPageId.EVENT_DETAILS,
            previousUsedSetupPage(pages, EventCreateSetupPageId.STAFF),
        )
        assertNull(nextUsedSetupPage(pages, EventCreateSetupPageId.SCHEDULE))
    }

    @Test
    fun each_simple_page_exposes_only_its_advanced_section_content() {
        assertEquals(
            EventDetailsSectionVisibility.None.copy(hero = true, basics = true),
            simpleSetupSectionVisibility(EventCreateSetupPageId.BASIC_INFORMATION),
        )
        assertEquals(
            EventDetailsSectionVisibility.None.copy(registration = true),
            simpleSetupSectionVisibility(EventCreateSetupPageId.EVENT_DETAILS),
        )
        assertEquals(
            EventDetailsSectionVisibility.None.copy(matchRules = true),
            simpleSetupSectionVisibility(EventCreateSetupPageId.MATCH_RULES),
        )
        assertEquals(
            EventDetailsSectionVisibility.None.copy(staff = true),
            simpleSetupSectionVisibility(EventCreateSetupPageId.STAFF),
        )
        assertEquals(
            EventDetailsSectionVisibility.None.copy(divisions = true),
            simpleSetupSectionVisibility(EventCreateSetupPageId.DIVISIONS),
        )
        assertEquals(
            EventDetailsSectionVisibility.None.copy(leagueScoring = true),
            simpleSetupSectionVisibility(EventCreateSetupPageId.LEAGUE_SCORING),
        )
        assertEquals(
            EventDetailsSectionVisibility.None.copy(schedule = true),
            simpleSetupSectionVisibility(EventCreateSetupPageId.SCHEDULE),
        )
    }

    @Test
    fun basic_division_and_schedule_pages_keep_their_minimum_continue_checks() {
        val event = Event(
            name = "Summer League",
            sportId = "basketball",
            location = "Main Gym",
            coordinates = listOf(-122.6, 45.5),
            noFixedEndDateTime = true,
        )

        assertTrue(isSimpleSetupPageComplete(EventCreateSetupPageId.BASIC_INFORMATION, event))
        assertTrue(isSimpleSetupPageComplete(EventCreateSetupPageId.SCHEDULE, event))
        assertFalse(isSimpleSetupPageComplete(EventCreateSetupPageId.DIVISIONS, event))
    }

    @OptIn(ExperimentalTime::class)
    @Test
    fun default_competition_timeslot_uses_the_event_window_and_all_resources_and_divisions() {
        val start = Instant.parse("2026-07-20T18:00:00Z")
        val end = Instant.parse("2026-07-20T20:00:00Z")
        val slot = createSimpleSetupEventRangeSlot(
            event = Event(
                start = start,
                end = end,
                timeZone = "UTC",
                divisions = listOf("open", "competitive"),
            ),
            fields = listOf(
                Field(id = "field-1", fieldNumber = 1),
                Field(id = "field-2", fieldNumber = 2),
            ),
            slotId = "slot-1",
        )

        assertFalse(slot.repeating)
        assertEquals(start, slot.startDate)
        assertEquals(end, slot.endDate)
        assertEquals(listOf("field-1", "field-2"), slot.scheduledFieldIds)
        assertEquals(listOf("open", "competitive"), slot.divisions)
        assertEquals(18 * 60, slot.startTimeMinutes)
        assertEquals(20 * 60, slot.endTimeMinutes)
    }
}
