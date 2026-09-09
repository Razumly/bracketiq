package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.toEventTimeSlotCacheEntry
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalTime::class)
class EventBootstrapResourcesCoordinatorTest {
    @Test
    fun given_room_event_relations_when_read_then_expose_time_slots_in_position_order() {
        val relations = EventWithRelations(
            event = Event(id = "event-1"),
            host = null,
            timeSlotCacheEntries = listOf(
                slot("slot-2").toEventTimeSlotCacheEntry("event-1", position = 1),
                slot("slot-1").toEventTimeSlotCacheEntry("event-1", position = 0),
            ),
        )

        assertEquals(listOf("slot-1", "slot-2"), relations.timeSlots.map(TimeSlot::id))
    }

    @Test
    fun given_matching_bootstrap_config_when_resolving_league_scoring_target_then_use_it() {
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
    fun given_other_event_bootstrap_when_resolving_league_scoring_target_then_ignore_it() {
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
