package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant

class EventBootstrapResourcesCoordinatorTest {
    @Test
    fun time_slot_target_orders_complete_bootstrap_slots_by_event_slot_ids() {
        val target = resolveEventTimeSlotLoadTarget(
            eventId = "event-1",
            slotIds = listOf("slot-1", "slot-2"),
            bootstrap = EventScopedValue(
                eventId = "event-1",
                value = listOf(slot("slot-2"), slot("unused"), slot("slot-1")),
            ),
            bootstrappedEventIds = setOf("event-1"),
        )

        assertEquals(listOf("slot-1", "slot-2"), target.slotIds)
        assertEquals(listOf("slot-1", "slot-2"), target.bootstrapSlots?.map(TimeSlot::id))
        assertTrue(target.bootstrapped)
    }

    @Test
    fun time_slot_target_requires_every_slot_before_using_bootstrap_slots() {
        val target = resolveEventTimeSlotLoadTarget(
            eventId = "event-1",
            slotIds = listOf("slot-1", "slot-2"),
            bootstrap = EventScopedValue(
                eventId = "event-1",
                value = listOf(slot("slot-1")),
            ),
            bootstrappedEventIds = emptySet(),
        )

        assertNull(target.bootstrapSlots)
        assertFalse(target.bootstrapped)
    }

    @Test
    fun time_slot_target_ignores_bootstrap_slots_for_other_events() {
        val target = resolveEventTimeSlotLoadTarget(
            eventId = "event-1",
            slotIds = listOf("slot-1"),
            bootstrap = EventScopedValue(
                eventId = "event-2",
                value = listOf(slot("slot-1")),
            ),
            bootstrappedEventIds = setOf("event-1"),
        )

        assertNull(target.bootstrapSlots)
        assertTrue(target.bootstrapped)
    }

    @Test
    fun league_scoring_target_uses_matching_bootstrap_config() {
        val config = scoringConfig("scoring-1")

        val target = resolveEventLeagueScoringLoadTarget(
            eventId = "event-1",
            scoringConfigId = "scoring-1",
            bootstrap = EventScopedValue(eventId = "event-1", value = config),
            bootstrappedEventIds = setOf("event-1"),
        )

        assertEquals("scoring-1", target.scoringConfigId)
        assertEquals(config, target.bootstrapConfig)
        assertTrue(target.bootstrapped)
    }

    @Test
    fun league_scoring_target_ignores_bootstrap_config_for_other_events() {
        val target = resolveEventLeagueScoringLoadTarget(
            eventId = "event-1",
            scoringConfigId = "scoring-1",
            bootstrap = EventScopedValue(eventId = "event-2", value = scoringConfig("scoring-1")),
            bootstrappedEventIds = setOf("event-1"),
        )

        assertNull(target.bootstrapConfig)
        assertTrue(target.bootstrapped)
    }

    private fun slot(id: String): TimeSlot =
        TimeSlot(
            id = id,
            dayOfWeek = null,
            daysOfWeek = null,
            divisions = emptyList(),
            startTimeMinutes = null,
            endTimeMinutes = null,
            startDate = Instant.parse("2026-06-23T00:00:00Z"),
            timeZone = "UTC",
            repeating = false,
            endDate = null,
            scheduledFieldId = null,
            scheduledFieldIds = emptyList(),
            price = null,
        )

    private fun scoringConfig(id: String): LeagueScoringConfig =
        LeagueScoringConfig(
            id = id,
            pointsForWin = 3,
            pointsForDraw = 1,
            pointsForLoss = 0,
            pointsPerSetWin = null,
            pointsPerSetLoss = null,
            pointsPerGameWin = null,
            pointsPerGameLoss = null,
            pointsPerGoalScored = null,
            pointsPerGoalConceded = null,
        )
}
