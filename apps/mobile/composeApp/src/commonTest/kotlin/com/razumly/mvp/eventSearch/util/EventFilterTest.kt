@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventSearch.util

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.days
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

class EventFilterTest {
    private val now = Instant.parse("2026-02-25T00:00:00Z")

    @Test
    fun givenPastEvent_whenIncludePastEventsDisabled_thenFilterReturnsFalse() {
        val filter = EventFilter(date = now to null)
        val event = eventAt(now - 1.days)

        assertFalse(filter.filter(event))
    }

    @Test
    fun givenPastEvent_whenIncludePastEventsEnabled_thenFilterReturnsTrue() {
        val filter = EventFilter(date = now to null)
        val event = eventAt(now - 1.days)

        assertTrue(filter.filter(event, includePastEvents = true))
    }

    @Test
    fun givenEndDate_whenEventStartsAfterEnd_thenFilterReturnsFalse() {
        val filter = EventFilter(date = now to now + 1.days)
        val event = eventAt(now + 2.days)

        assertFalse(filter.filter(event, includePastEvents = true))
    }

    @Test
    fun givenWeeklySeasonSpanningSelectedRange_whenFiltering_thenFilterReturnsTrue() {
        val filter = EventFilter(date = now + 7.days to now + 13.days)
        val event = eventAt(
            start = now,
            end = now + 30.days,
            eventType = EventType.WEEKLY_EVENT,
        )

        assertTrue(filter.filter(event))
    }

    @Test
    fun givenWeeklySeasonAfterSelectedRange_whenFiltering_thenFilterReturnsFalse() {
        val filter = EventFilter(date = now to now + 3.days)
        val event = eventAt(
            start = now + 7.days,
            end = now + 30.days,
            eventType = EventType.WEEKLY_EVENT,
        )

        assertFalse(filter.filter(event))
    }

    @Test
    fun givenNoFixedEndWeeklyEventCoveringSelectedMultiDayRange_whenFiltering_thenFilterReturnsTrue() {
        val filter = EventFilter(date = now to now + 4.days)
        val event = eventAt(
            start = now - 14.days,
            end = now - 14.days,
            eventType = EventType.WEEKLY_EVENT,
            noFixedEndDateTime = true,
        )

        assertTrue(filter.filter(event))
    }

    @Test
    fun givenSportFilter_whenEventSportMatches_thenFilterReturnsTrue() {
        val filter = EventFilter(date = now to null, sportIds = setOf("volleyball"))
        val event = eventAt(now + 1.days, sportId = "volleyball")

        assertTrue(filter.filter(event))
    }

    @Test
    fun givenSportFilter_whenEventSportDiffers_thenFilterReturnsFalse() {
        val filter = EventFilter(date = now to null, sportIds = setOf("volleyball"))
        val event = eventAt(now + 1.days, sportId = "soccer")

        assertFalse(filter.filter(event))
    }

    @Test
    fun givenTagFilter_whenEventTagMatches_thenFilterReturnsTrue() {
        val filter = EventFilter(date = now to null, tagSlugs = setOf("tryouts"))
        val event = eventAt(now + 1.days, tags = listOf(EventTag(name = "Tryouts", slug = "tryouts")))

        assertTrue(filter.filter(event))
    }

    @Test
    fun givenTagFilter_whenEventTagDiffers_thenFilterReturnsFalse() {
        val filter = EventFilter(date = now to null, tagSlugs = setOf("tryouts"))
        val event = eventAt(now + 1.days, tags = listOf(EventTag(name = "Tournament", slug = "tournament")))

        assertFalse(filter.filter(event))
    }

    @Test
    fun divisionFiltersMustMatchTheSameDivision() {
        val filter = EventFilter(
            date = now to null,
            price = 50.0 to 100.0,
            divisionGenders = setOf("WOMENS"),
            skillDivisionTypeIds = setOf("advanced"),
            ageDivisionTypeIds = setOf("u18"),
        )
        val splitAcrossRows = eventAt(now + 1.days).copy(
            divisionDetails = listOf(
                DivisionDetail(
                    id = "women-rec",
                    gender = "WOMENS",
                    skillDivisionTypeId = "recreational",
                    ageDivisionTypeId = "u18",
                    price = 7500,
                ),
                DivisionDetail(
                    id = "men-advanced",
                    gender = "MENS",
                    skillDivisionTypeId = "advanced",
                    ageDivisionTypeId = "u18",
                    price = 7500,
                ),
            ),
        )

        assertFalse(filter.filter(splitAcrossRows))
        assertTrue(
            filter.filter(
                splitAcrossRows.copy(
                    divisionDetails = splitAcrossRows.divisionDetails + DivisionDetail(
                        id = "women-advanced",
                        gender = "WOMENS",
                        skillDivisionTypeId = "advanced",
                        ageDivisionTypeId = "u18",
                        price = 7500,
                    ),
                ),
            ),
        )
    }

    private fun eventAt(
        start: Instant,
        end: Instant = start,
        sportId: String? = null,
        tags: List<EventTag> = emptyList(),
        eventType: EventType = EventType.EVENT,
        noFixedEndDateTime: Boolean = false,
    ): Event = Event(
        name = "Test League",
        start = start,
        end = end,
        sportId = sportId,
        tags = tags,
        eventType = eventType,
        noFixedEndDateTime = noFixedEndDateTime,
        state = "PUBLISHED",
    )
}
