@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.organizationDetail

import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.eventSearch.RentalFieldOption
import com.razumly.mvp.eventSearch.RentalSelectionDraft
import com.razumly.mvp.eventSearch.rentalAvailabilityFetchWindowForDate
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.time.Instant

class OrganizationDetailRentalSelectionRetentionTest {
    @Test
    fun givenSundayOvernightSelection_whenNavigatingToMonday_thenSelectionSurvivesRevalidation() {
        val sunday = LocalDate(2030, 6, 9)
        val monday = LocalDate(2030, 6, 10)
        val selection = RentalSelectionDraft(
            id = 1L,
            fieldId = "field_1",
            date = sunday,
            startMinutes = 23 * 60,
            endMinutes = 25 * 60,
        )
        val fieldOptions = listOf(
            RentalFieldOption(
                field = Field(id = "field_1", name = "Court A"),
                rentalSlots = listOf(
                    TimeSlot(
                        id = "slot_1",
                        dayOfWeek = null,
                        daysOfWeek = null,
                        startTimeMinutes = null,
                        endTimeMinutes = null,
                        startDate = Instant.parse("2030-06-09T22:00:00Z"),
                        endDate = Instant.parse("2030-06-10T02:00:00Z"),
                        timeZone = "UTC",
                        repeating = false,
                        scheduledFieldId = "field_1",
                        scheduledFieldIds = listOf("field_1"),
                        price = 2_000,
                    )
                ),
            )
        )
        val sundayWindow = rentalAvailabilityFetchWindowForDate(sunday, TimeZone.UTC)
        val mondayWindow = rentalAvailabilityFetchWindowForDate(monday, TimeZone.UTC)

        assertNotEquals(sundayWindow, mondayWindow)
        assertEquals(
            listOf(selection),
            retainRentalSelectionsCoveredBySnapshot(
                selections = listOf(selection),
                fieldOptions = fieldOptions,
                availabilityWindow = mondayWindow,
                busyBlocks = emptyList(),
                timeZone = TimeZone.UTC,
            ),
        )
    }
}
