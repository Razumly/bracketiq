package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EventCreateSimpleSetupTest {

    @Test
    fun mobile_creation_types_exclude_tryouts() {
        assertEquals(
            listOf(EventType.EVENT, EventType.WEEKLY_EVENT, EventType.LEAGUE, EventType.TOURNAMENT),
            mobileCreateEventTypes(),
        )
        assertFalse(EventType.TRYOUT in mobileCreateEventTypes())
    }

    @Test
    fun event_path_marks_competition_and_unselected_optional_pages_unused() {
        val pages = resolveEventCreateSetupPages(
            event = Event(eventType = EventType.EVENT, teamSignup = false),
            choices = EventCreateSetupChoices(),
            currentPageId = EventCreateSetupPageId.FORMAT,
            completedPageIds = emptySet(),
        )

        assertFalse(pages.first { it.id == EventCreateSetupPageId.COMPETITION_RULES }.used)
        assertFalse(pages.first { it.id == EventCreateSetupPageId.DOCUMENTS_QUESTIONS }.used)
        assertFalse(pages.first { it.id == EventCreateSetupPageId.STAFF_OPERATIONS }.used)
    }

    @Test
    fun league_path_keeps_competition_and_team_operations_available() {
        val pages = resolveEventCreateSetupPages(
            event = Event(eventType = EventType.LEAGUE, teamSignup = true),
            choices = EventCreateSetupChoices(),
            currentPageId = EventCreateSetupPageId.FORMAT,
            completedPageIds = setOf(EventCreateSetupPageId.FORMAT),
        )

        assertTrue(pages.first { it.id == EventCreateSetupPageId.COMPETITION_RULES }.used)
        assertTrue(pages.first { it.id == EventCreateSetupPageId.STAFF_OPERATIONS }.used)
        assertEquals(
            EventCreateSetupPageStatus.AVAILABLE,
            pages.first { it.id == EventCreateSetupPageId.BASICS }.status,
        )
    }

    @Test
    fun optional_choices_enable_dependent_pages() {
        val choices = EventCreateSetupChoices(
            useRequiredDocuments = true,
            useDedicatedOfficials = true,
        )
        val pages = resolveEventCreateSetupPages(
            event = Event(eventType = EventType.EVENT),
            choices = choices,
            currentPageId = EventCreateSetupPageId.REGISTRATION_PLAN,
            completedPageIds = EventCreateSetupPageId.entries.toSet(),
        )

        assertTrue(pages.first { it.id == EventCreateSetupPageId.DOCUMENTS_QUESTIONS }.used)
        assertTrue(pages.first { it.id == EventCreateSetupPageId.STAFF_OPERATIONS }.used)
    }

    @Test
    fun next_and_previous_navigation_skip_unused_pages() {
        val pages = resolveEventCreateSetupPages(
            event = Event(eventType = EventType.EVENT),
            choices = EventCreateSetupChoices(),
            currentPageId = EventCreateSetupPageId.SCHEDULE_LOCATION,
            completedPageIds = EventCreateSetupPageId.entries.toSet(),
        )

        assertEquals(
            EventCreateSetupPageId.REGISTRATION_PLAN,
            nextUsedSetupPage(pages, EventCreateSetupPageId.SCHEDULE_LOCATION),
        )
        assertEquals(
            EventCreateSetupPageId.SCHEDULE_LOCATION,
            previousUsedSetupPage(pages, EventCreateSetupPageId.REGISTRATION_PLAN),
        )
        assertNull(nextUsedSetupPage(pages, EventCreateSetupPageId.REVIEW_PUBLISH))
    }

    @Test
    fun basics_and_schedule_completion_use_required_draft_values() {
        val event = Event(
            name = "Summer League",
            sportId = "basketball",
            location = "Main Gym",
            coordinates = listOf(45.5, -122.6),
        )

        assertTrue(isSimpleSetupPageComplete(EventCreateSetupPageId.BASICS, event))
        assertTrue(isSimpleSetupPageComplete(EventCreateSetupPageId.SCHEDULE_LOCATION, event))
        assertFalse(isSimpleSetupPageComplete(EventCreateSetupPageId.DIVISIONS, event))
    }
}
