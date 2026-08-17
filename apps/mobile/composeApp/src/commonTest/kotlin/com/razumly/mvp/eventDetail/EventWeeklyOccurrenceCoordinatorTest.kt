package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant

class EventWeeklyOccurrenceCoordinatorTest {
    @Test
    fun select_weekly_session_normalizes_ids_and_rejects_invalid_inputs() {
        val coordinator = EventWeeklyOccurrenceCoordinator()
        val start = Instant.parse("2026-06-22T16:00:00Z")
        val end = Instant.parse("2026-06-22T17:00:00Z")

        val nonWeekly = coordinator.selectWeeklySession(
            isWeeklyParent = false,
            sessionStart = start,
            sessionEnd = end,
            slotId = "slot-1",
            occurrenceDate = "2026-06-22",
            label = "June 22",
        )
        assertEquals(
            "Weekly occurrences are only available from parent weekly events.",
            assertIs<WeeklySessionSelectionResult.Rejected>(nonWeekly).message,
        )

        val selected = assertIs<WeeklySessionSelectionResult.Selected>(
            coordinator.selectWeeklySession(
                isWeeklyParent = true,
                sessionStart = start,
                sessionEnd = end,
                slotId = " slot-1 ",
                occurrenceDate = " 2026-06-22 ",
                label = " ",
            ),
        ).selection

        assertEquals("slot-1", selected.slotId)
        assertEquals("2026-06-22", selected.occurrenceDate)
        assertEquals("2026-06-22", selected.label)
        assertEquals(EventOccurrenceSelection("slot-1", "2026-06-22", "2026-06-22"), coordinator.currentSelection())
        assertTrue(coordinator.hasSelectedOccurrenceStarted(end))
    }

    @Test
    fun remember_summary_updates_selected_summary_and_pending_prefetch_filters_cached_and_selected() {
        val coordinator = EventWeeklyOccurrenceCoordinator()
        val start = Instant.parse("2026-06-22T16:00:00Z")
        val end = Instant.parse("2026-06-22T17:00:00Z")
        coordinator.selectWeeklySession(
            isWeeklyParent = true,
            sessionStart = start,
            sessionEnd = end,
            slotId = "slot-1",
            occurrenceDate = "2026-06-22",
            label = "June 22",
        )
        coordinator.rememberWeeklyOccurrenceSummary(
            occurrence = EventOccurrenceSelection("slot-1", "2026-06-22", "June 22"),
            summary = WeeklyOccurrenceSummary(participantCount = 4, participantCapacity = 6),
        )
        coordinator.rememberWeeklyOccurrenceSummary(
            occurrence = EventOccurrenceSelection("slot-1", "2026-06-23", "June 23"),
            summary = WeeklyOccurrenceSummary(participantCount = 2, participantCapacity = 6),
        )

        assertEquals(4, coordinator.selectedWeeklyOccurrenceSummary.value?.participantCount)
        val pending = coordinator.pendingOccurrenceSummaries(
            listOf(
                EventOccurrenceSelection(" slot-1 ", " 2026-06-22 ", "selected"),
                EventOccurrenceSelection("slot-1", "2026-06-23", "cached"),
                EventOccurrenceSelection("slot-1", "2026-06-24", "pending"),
                EventOccurrenceSelection("", "2026-06-25", "bad"),
                EventOccurrenceSelection("slot-1", "", "bad"),
            ),
        )

        assertEquals(listOf(EventOccurrenceSelection("slot-1", "2026-06-24", "pending")), pending)
    }

    @Test
    fun participant_summaries_update_selected_and_overview_state() {
        val coordinator = EventWeeklyOccurrenceCoordinator()
        val occurrence = EventOccurrenceSelection("slot-1", "2026-06-22", "June 22")

        coordinator.applyOverviewParticipantSummary(
            isWeeklyParent = false,
            weeklySelectionRequired = false,
            participantCount = 3,
            participantCapacity = 10,
        )
        assertEquals(3, coordinator.overviewParticipantSummary.value?.participantCount)

        coordinator.applyOverviewParticipantSummary(
            isWeeklyParent = true,
            weeklySelectionRequired = false,
            participantCount = 3,
            participantCapacity = 10,
        )
        assertNull(coordinator.overviewParticipantSummary.value)

        coordinator.applySelectedOccurrenceParticipantSummary(
            occurrence = occurrence,
            weeklySelectionRequired = false,
            participantCount = 5,
            participantCapacity = 8,
        )
        assertEquals(
            WeeklyOccurrenceSummary(participantCount = 5, participantCapacity = 8),
            coordinator.weeklyOccurrenceSummaries.value["slot-1|2026-06-22"],
        )

        coordinator.applySelectedOccurrenceParticipantSummary(
            occurrence = occurrence,
            weeklySelectionRequired = true,
            participantCount = 5,
            participantCapacity = 8,
        )
        assertNull(coordinator.selectedWeeklyOccurrenceSummary.value)
    }
}
