package com.razumly.mvp.eventDetail

import kotlin.test.Test
import kotlin.test.assertEquals

class EventDetailsFormattingTest {
    @Test
    fun givenRegistrationCutoffHours_whenFormattingSummary_thenUsesHourValueDirectly() {
        assertEquals("No cutoff", 0.toRegistrationCutoffSummary())
        assertEquals("No cutoff", (-1).toRegistrationCutoffSummary())
        assertEquals("1h before start", 1.toRegistrationCutoffSummary())
        assertEquals("2h before start", 2.toRegistrationCutoffSummary())
        assertEquals("48h before start", 48.toRegistrationCutoffSummary())
    }
}
