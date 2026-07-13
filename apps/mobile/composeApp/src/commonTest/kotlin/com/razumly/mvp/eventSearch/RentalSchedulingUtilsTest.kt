@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import com.razumly.mvp.core.data.dataTypes.TimeSlot
import kotlinx.datetime.TimeZone
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant

class RentalSchedulingUtilsTest {
    @Test
    fun repeatingRentalSlot_usesEveryDeclaredMondayBasedDay() {
        val slot = rentalSlot(
            dayOfWeek = 0,
            daysOfWeek = listOf(0, 2),
        )

        assertTrue(slot.matchesOn("2026-06-01")) // Monday
        assertTrue(slot.matchesOn("2026-06-03")) // Wednesday
        assertFalse(slot.matchesOn("2026-06-02")) // Tuesday
    }

    @Test
    fun repeatingRentalSlot_usesLegacyDayWhenDaysArrayIsAbsentOrEmpty() {
        val legacySlot = rentalSlot(
            dayOfWeek = 2,
            daysOfWeek = null,
        )
        val emptyDaysSlot = rentalSlot(
            dayOfWeek = 2,
            daysOfWeek = emptyList(),
        )
        val explicitDaysSlot = rentalSlot(
            dayOfWeek = 0,
            daysOfWeek = listOf(2),
        )

        assertTrue(legacySlot.matchesOn("2026-06-03")) // Wednesday
        assertFalse(legacySlot.matchesOn("2026-06-01")) // Monday
        assertTrue(emptyDaysSlot.matchesOn("2026-06-03"))
        assertFalse(emptyDaysSlot.matchesOn("2026-06-01"))
        assertTrue(explicitDaysSlot.matchesOn("2026-06-03"))
        assertFalse(explicitDaysSlot.matchesOn("2026-06-01"))
    }

    private fun rentalSlot(
        dayOfWeek: Int?,
        daysOfWeek: List<Int>?,
    ): TimeSlot = TimeSlot(
        id = "rental-slot",
        dayOfWeek = dayOfWeek,
        daysOfWeek = daysOfWeek,
        startTimeMinutes = 10 * 60,
        endTimeMinutes = 11 * 60,
        startDate = Instant.parse("2026-06-01T00:00:00Z"),
        timeZone = "UTC",
        repeating = true,
        endDate = Instant.parse("2026-06-30T00:00:00Z"),
        scheduledFieldId = "field_1",
        scheduledFieldIds = listOf("field_1"),
        price = 2000,
    )

    private fun TimeSlot.matchesOn(date: String): Boolean = matchesRentalSelection(
        rangeStart = Instant.parse("${date}T10:00:00Z"),
        rangeEnd = Instant.parse("${date}T11:00:00Z"),
        fieldId = "field_1",
        fallbackTimeZone = TimeZone.UTC,
    )
}
