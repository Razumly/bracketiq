package com.razumly.mvp.wear.ui

import kotlin.test.Test
import kotlin.test.assertEquals

class WearMatchClockFormatTest {
    @Test
    fun givenMatchDurations_whenFormatted_thenMinutesAreNotZeroPadded() {
        assertEquals("0:00", formatMatchClockDuration(0))
        assertEquals("73:52", formatMatchClockDuration(73 * 60L + 52))
        assertEquals("100:04", formatMatchClockDuration(100 * 60L + 4))
    }
}
