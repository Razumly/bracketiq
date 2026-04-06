package com.razumly.mvp.core.presentation.util

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals

class EventTypeWithSportLabelTest {

    @Test
    fun event_type_with_sport_label_includes_sport_when_present() {
        val event = Event(
            eventType = EventType.LEAGUE,
            sportId = "Indoor Volleyball",
        )

        assertEquals("League: Indoor Volleyball", event.eventTypeWithSportLabel())
    }

    @Test
    fun event_type_with_sport_label_falls_back_to_type_when_sport_missing() {
        val event = Event(
            eventType = EventType.WEEKLY_EVENT,
            sportId = "   ",
        )

        assertEquals("Weekly Event", event.eventTypeWithSportLabel())
    }
}
