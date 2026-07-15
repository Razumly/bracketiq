package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertContains
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
            noFixedEndDateTime = true,
        )

        assertTrue(isSimpleSetupPageComplete(EventCreateSetupPageId.BASICS, event))
        assertTrue(isSimpleSetupPageComplete(EventCreateSetupPageId.SCHEDULE_LOCATION, event))
        assertFalse(isSimpleSetupPageComplete(EventCreateSetupPageId.DIVISIONS, event))
    }

    @Test
    fun simple_division_upsert_creates_one_canonical_detail_per_selection() {
        val selection = SimpleSetupDivisionSelection(
            gender = "C",
            skillDivisionTypeId = "competitive",
            skillDivisionTypeName = "Competitive",
            ageDivisionTypeId = "adult",
            ageDivisionTypeName = "Adult",
        )
        val event = Event(
            id = "event-1",
            singleDivision = true,
            priceCents = 2_500,
            maxParticipants = 12,
        )

        val firstUpdate = event.upsertSimpleSetupDivision(selection)
        val secondUpdate = firstUpdate.upsertSimpleSetupDivision(selection)

        assertEquals(1, secondUpdate.divisions.size)
        assertEquals(1, secondUpdate.divisionDetails.size)
        assertEquals(firstUpdate.divisionDetails.single().id, secondUpdate.divisionDetails.single().id)
        assertEquals("Coed Competitive Adult", secondUpdate.divisionDetails.single().name)
        assertEquals(2_500, secondUpdate.divisionDetails.single().price)
        assertEquals(12, secondUpdate.divisionDetails.single().maxParticipants)
    }

    @Test
    fun registration_values_are_applied_to_event_and_every_division() {
        val event = Event(
            priceCents = 500,
            maxParticipants = 4,
            divisionDetails = listOf(
                DivisionDetail(id = "open"),
                DivisionDetail(id = "advanced"),
            ),
        )

        val updated = event.withSimpleSetupRegistrationValues(
            priceCents = 3_000,
            maxParticipants = 16,
        )

        assertEquals(3_000, updated.priceCents)
        assertEquals(16, updated.maxParticipants)
        assertTrue(updated.divisionDetails.all { detail -> detail.price == 3_000 })
        assertTrue(updated.divisionDetails.all { detail -> detail.maxParticipants == 16 })
    }

    @Test
    fun review_validation_covers_compact_flow_requirements() {
        val choices = EventCreateSetupChoices(
            paidRegistration = true,
            useRequiredDocuments = true,
        )
        val validDraft = Event(
            name = "Summer League",
            sportId = "volleyball",
            divisions = listOf("open"),
            divisionDetails = listOf(DivisionDetail(id = "open")),
            location = "Main Gym",
            coordinates = listOf(-122.6, 45.5),
            noFixedEndDateTime = true,
            maxParticipants = 12,
            priceCents = 2_500,
            requiredTemplateIds = listOf("waiver"),
        )

        val awaitingQuoteErrors = simpleSetupValidationErrors(
            event = validDraft,
            choices = choices,
            priceQuoteConfirmed = false,
        )

        assertContains(awaitingQuoteErrors, "Wait for the online price quote.")
        assertFalse(
            isSimpleSetupPageComplete(
                EventCreateSetupPageId.REVIEW_PUBLISH,
                validDraft,
                choices,
                priceQuoteConfirmed = false,
            ),
        )
        assertTrue(
            isSimpleSetupPageComplete(
                EventCreateSetupPageId.REVIEW_PUBLISH,
                validDraft,
                choices,
                priceQuoteConfirmed = true,
            ),
        )
    }
}
