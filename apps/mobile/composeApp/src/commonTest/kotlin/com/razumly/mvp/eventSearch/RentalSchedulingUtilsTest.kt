@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
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

    @Test
    fun earlyMorningRentalSlot_resolvesWithoutAnArtificialSixAmFloor() {
        val date = LocalDate(2026, 6, 8)
        val option = rentalOption(
            rentalSlot(
                dayOfWeek = 0,
                daysOfWeek = listOf(0),
                startTimeMinutes = 60,
                endTimeMinutes = 120,
                startDate = Instant.parse("2026-06-01T00:00:00Z"),
                endDate = Instant.parse("2026-06-30T00:00:00Z"),
            )
        )

        val resolved = resolveRentalRange(
            option = option,
            date = date,
            startMinutes = 60,
            endMinutes = 90,
            timeZone = TimeZone.UTC,
        )

        assertNotNull(resolved)
        assertEquals(1_000, resolved.totalPriceCents)
    }

    @Test
    fun nonRepeatingOvernightRental_resolvesWithAnExplicitNextDayEnd() {
        val date = LocalDate(2026, 6, 8)
        val option = rentalOption(
            rentalSlot(
                dayOfWeek = null,
                daysOfWeek = null,
                startTimeMinutes = null,
                endTimeMinutes = null,
                startDate = Instant.parse("2026-06-08T22:00:00Z"),
                endDate = Instant.parse("2026-06-09T02:00:00Z"),
                repeating = false,
            )
        )

        val resolved = resolveRentalRange(
            option = option,
            date = date,
            startMinutes = 23 * 60,
            endMinutes = 25 * 60,
            timeZone = TimeZone.UTC,
        )

        assertNotNull(resolved)
        assertEquals(4_000, resolved.totalPriceCents)
        assertEquals(Instant.parse("2026-06-09T01:00:00Z"), resolved.let {
            date.toInstantAtMinutes(25 * 60, TimeZone.UTC)
        })
    }

    @Test
    fun nonRepeatingRentalWithoutExplicitEnd_isRejectedLikeTheServer() {
        val option = rentalOption(
            rentalSlot(
                dayOfWeek = null,
                daysOfWeek = null,
                startTimeMinutes = 10 * 60,
                endTimeMinutes = 11 * 60,
                startDate = Instant.parse("2026-06-08T10:00:00Z"),
                endDate = null,
                repeating = false,
            )
        )

        assertNull(
            resolveRentalRange(
                option = option,
                date = LocalDate(2026, 6, 8),
                startMinutes = 10 * 60,
                endMinutes = 11 * 60,
                timeZone = TimeZone.UTC,
            )
        )
    }

    @Test
    fun overlappingSlots_useTheSameDurationPriceAndIdOrderingAsTheServer() {
        val option = rentalOption(
            rentalSlot(
                id = "z_longer",
                dayOfWeek = null,
                daysOfWeek = null,
                startTimeMinutes = null,
                endTimeMinutes = null,
                startDate = Instant.parse("2026-06-08T08:00:00Z"),
                endDate = Instant.parse("2026-06-08T12:00:00Z"),
                repeating = false,
                price = 1_000,
            ),
            rentalSlot(
                id = "z_shorter",
                dayOfWeek = null,
                daysOfWeek = null,
                startTimeMinutes = null,
                endTimeMinutes = null,
                startDate = Instant.parse("2026-06-08T09:00:00Z"),
                endDate = Instant.parse("2026-06-08T11:00:00Z"),
                repeating = false,
                price = 2_000,
            ),
            rentalSlot(
                id = "a_shorter",
                dayOfWeek = null,
                daysOfWeek = null,
                startTimeMinutes = null,
                endTimeMinutes = null,
                startDate = Instant.parse("2026-06-08T09:00:00Z"),
                endDate = Instant.parse("2026-06-08T11:00:00Z"),
                repeating = false,
                price = 2_000,
            ),
        )

        val resolved = resolveRentalRange(
            option = option,
            date = LocalDate(2026, 6, 8),
            startMinutes = 9 * 60 + 30,
            endMinutes = 10 * 60,
            timeZone = TimeZone.UTC,
        )

        assertNotNull(resolved)
        assertEquals("a_shorter", resolved.slots.single().id)
        assertEquals(1_000, resolved.totalPriceCents)
    }

    @Test
    fun nullableRecurringBounds_areOrderedInEachSlotsOwnTimeZone() {
        val option = rentalOption(
            rentalSlot(
                id = "pacific_three_hours",
                dayOfWeek = 0,
                daysOfWeek = listOf(0),
                startTimeMinutes = null,
                endTimeMinutes = null,
                startDate = Instant.parse("2026-01-05T17:00:00Z"),
                endDate = Instant.parse("2026-07-31T19:00:00Z"),
                timeZone = "America/Los_Angeles",
            ),
            rentalSlot(
                id = "utc_two_and_a_half_hours",
                dayOfWeek = 0,
                daysOfWeek = listOf(0),
                startTimeMinutes = null,
                endTimeMinutes = null,
                startDate = Instant.parse("2026-01-05T17:00:00Z"),
                endDate = Instant.parse("2026-07-31T19:30:00Z"),
                timeZone = "UTC",
            ),
        )

        val resolved = resolveRentalRange(
            option = option,
            date = LocalDate(2026, 7, 13),
            startMinutes = 17 * 60 + 30,
            endMinutes = 18 * 60,
            timeZone = TimeZone.UTC,
        )

        assertNotNull(resolved)
        assertEquals("utc_two_and_a_half_hours", resolved.slots.single().id)
    }

    @Test
    fun overnightRentalAcrossSpringForward_pricesElapsedInstantsLikeTheServer() {
        val timeZone = TimeZone.of("America/Los_Angeles")
        val date = LocalDate(2026, 3, 7)
        val option = RentalFieldOption(
            field = Field(name = "Court A", id = "field_1"),
            rentalSlots = listOf(
                rentalSlot(
                    dayOfWeek = null,
                    daysOfWeek = null,
                    startTimeMinutes = null,
                    endTimeMinutes = null,
                    startDate = Instant.parse("2026-03-08T07:00:00Z"),
                    endDate = Instant.parse("2026-03-08T10:00:00Z"),
                    repeating = false,
                    timeZone = timeZone.id,
                )
            ),
        )

        val resolved = resolveRentalRange(
            option = option,
            date = date,
            startMinutes = 23 * 60,
            endMinutes = 27 * 60,
            timeZone = timeZone,
        )

        assertNotNull(resolved)
        assertEquals(6_000, resolved.totalPriceCents)
    }

    @Test
    fun springForwardGapCells_areRejectedInsteadOfAliasingRealInventory() {
        val timeZone = TimeZone.of("America/Los_Angeles")
        val date = LocalDate(2026, 3, 8)

        assertTrue(isUnambiguousRentalTimelineCell(date, 60, timeZone))
        assertFalse(isUnambiguousRentalTimelineCell(date, 90, timeZone))
        assertFalse(isUnambiguousRentalTimelineCell(date, 120, timeZone))
        assertFalse(isUnambiguousRentalTimelineCell(date, 150, timeZone))
        assertTrue(isUnambiguousRentalTimelineCell(date, 180, timeZone))
    }

    @Test
    fun fallBackOverlapCells_areRejectedInsteadOfChoosingAnUnlabeledOccurrence() {
        val timeZone = TimeZone.of("America/Los_Angeles")
        val date = LocalDate(2026, 11, 1)

        assertTrue(isUnambiguousRentalTimelineCell(date, 0, timeZone))
        assertFalse(isUnambiguousRentalTimelineCell(date, 30, timeZone))
        assertFalse(isUnambiguousRentalTimelineCell(date, 60, timeZone))
        assertFalse(isUnambiguousRentalTimelineCell(date, 90, timeZone))
        assertTrue(isUnambiguousRentalTimelineCell(date, 120, timeZone))
    }

    @Test
    fun pointerResize_stopsAtTheFirstRejectedIntervalInsteadOfJumpingAcrossIt() {
        val attemptedEnds = mutableListOf<Int>()

        val resized = stepRentalResizeRange(
            startMinutes = 60,
            endMinutes = 90,
            handle = RentalDragHandle.BOTTOM,
            steps = 4,
            timelineStartMinutes = 0,
            timelineEndMinutes = 24 * 60,
        ) { _, proposedEnd ->
            attemptedEnds += proposedEnd
            proposedEnd != 120
        }

        assertEquals(listOf(120), attemptedEnds)
        assertEquals(RentalResizeRange(startMinutes = 60, endMinutes = 90), resized)
    }

    @Test
    fun pointerResize_appliesValidIntervalsOneStepAtATime() {
        val attemptedEnds = mutableListOf<Int>()

        val resized = stepRentalResizeRange(
            startMinutes = 60,
            endMinutes = 90,
            handle = RentalDragHandle.BOTTOM,
            steps = 3,
            timelineStartMinutes = 0,
            timelineEndMinutes = 24 * 60,
        ) { _, proposedEnd ->
            attemptedEnds += proposedEnd
            true
        }

        assertEquals(listOf(120, 150, 180), attemptedEnds)
        assertEquals(RentalResizeRange(startMinutes = 60, endMinutes = 180), resized)
    }

    @Test
    fun multiDayRentalInventory_isAvailablePerDayWithoutAnUnboundedTimeline() {
        val option = rentalOption(
            rentalSlot(
                dayOfWeek = null,
                daysOfWeek = null,
                startTimeMinutes = null,
                endTimeMinutes = null,
                startDate = Instant.parse("2026-06-08T22:00:00Z"),
                endDate = Instant.parse("2026-06-12T02:00:00Z"),
                repeating = false,
            )
        )

        assertNotNull(
            resolveRentalRange(
                option = option,
                date = LocalDate(2026, 6, 8),
                startMinutes = 23 * 60,
                endMinutes = 23 * 60 + 30,
                timeZone = TimeZone.UTC,
            )
        )
        assertNotNull(
            resolveRentalRange(
                option = option,
                date = LocalDate(2026, 6, 10),
                startMinutes = 10 * 60,
                endMinutes = 11 * 60,
                timeZone = TimeZone.UTC,
            )
        )
        assertNotNull(
            resolveRentalRange(
                option = option,
                date = LocalDate(2026, 6, 12),
                startMinutes = 60,
                endMinutes = 90,
                timeZone = TimeZone.UTC,
            )
        )
        assertNull(
            resolveRentalRange(
                option = option,
                date = LocalDate(2026, 6, 12),
                startMinutes = 2 * 60,
                endMinutes = 2 * 60 + 30,
                timeZone = TimeZone.UTC,
            )
        )
        assertEquals(
            24 * 60,
            rentalTimelineEndMinutesForDate(LocalDate(2026, 6, 8), listOf(option), TimeZone.UTC),
        )
        assertEquals(
            26 * 60,
            rentalTimelineEndMinutesForDate(LocalDate(2026, 6, 11), listOf(option), TimeZone.UTC),
        )
    }

    @Test
    fun multiDayRangeResolver_hasNoFortyEightHourBusinessCap() {
        val option = rentalOption(
            rentalSlot(
                dayOfWeek = null,
                daysOfWeek = null,
                startTimeMinutes = null,
                endTimeMinutes = null,
                startDate = Instant.parse("2026-06-08T22:00:00Z"),
                endDate = Instant.parse("2026-06-12T02:00:00Z"),
                repeating = false,
            )
        )

        val resolved = resolveRentalRange(
            option = option,
            date = LocalDate(2026, 6, 8),
            startMinutes = 23 * 60,
            endMinutes = 73 * 60,
            timeZone = TimeZone.UTC,
        )

        assertNotNull(resolved)
        assertEquals(100_000, resolved.totalPriceCents)
    }

    @Test
    fun repeatingOvernightRental_resolvesAndExtendsItsAnchorDay() {
        val date = LocalDate(2026, 6, 8)
        val option = rentalOption(
            rentalSlot(
                dayOfWeek = 0,
                daysOfWeek = listOf(0),
                startTimeMinutes = 22 * 60,
                endTimeMinutes = 2 * 60,
                startDate = Instant.parse("2026-06-01T00:00:00Z"),
                endDate = Instant.parse("2026-06-30T00:00:00Z"),
            )
        )

        val resolved = resolveRentalRange(
            option = option,
            date = date,
            startMinutes = 23 * 60,
            endMinutes = 25 * 60,
            timeZone = TimeZone.UTC,
        )

        assertNotNull(resolved)
        assertEquals(4_000, resolved.totalPriceCents)
        assertEquals(
            26 * 60,
            rentalTimelineEndMinutesForDate(date, listOf(option), TimeZone.UTC),
        )
        assertNull(
            resolveRentalRange(
                option = option,
                date = date,
                startMinutes = 24 * 60,
                endMinutes = 24 * 60 + 30,
                timeZone = TimeZone.UTC,
            )
        )
    }

    @Test
    fun repeatingRentalWithNullableWallBounds_derivesThemFromExplicitDates() {
        val date = LocalDate(2026, 6, 8)
        val option = rentalOption(
            rentalSlot(
                dayOfWeek = 0,
                daysOfWeek = listOf(0),
                startTimeMinutes = null,
                endTimeMinutes = null,
                startDate = Instant.parse("2026-06-08T22:00:00Z"),
                endDate = Instant.parse("2026-06-09T02:00:00Z"),
                repeating = true,
            )
        )

        val resolved = resolveRentalRange(
            option = option,
            date = date,
            startMinutes = 23 * 60,
            endMinutes = 25 * 60,
            timeZone = TimeZone.UTC,
        )

        assertNotNull(resolved)
        assertEquals(4_000, resolved.totalPriceCents)
    }

    @Test
    fun repeatingRentalWithEqualStartAndEnd_isNotTreatedAsTwentyFourHours() {
        val option = rentalOption(
            rentalSlot(
                dayOfWeek = 0,
                daysOfWeek = listOf(0),
                startTimeMinutes = 10 * 60,
                endTimeMinutes = 10 * 60,
            )
        )

        assertNull(
            resolveRentalRange(
                option = option,
                date = LocalDate(2026, 6, 8),
                startMinutes = 10 * 60,
                endMinutes = 10 * 60 + 30,
                timeZone = TimeZone.UTC,
            )
        )
    }

    @Test
    fun overnightAvailability_extendsOnlyTheSelectedDatesTimeline() {
        val option = rentalOption(
            rentalSlot(
                dayOfWeek = null,
                daysOfWeek = null,
                startTimeMinutes = null,
                endTimeMinutes = null,
                startDate = Instant.parse("2026-06-08T22:00:00Z"),
                endDate = Instant.parse("2026-06-09T02:00:00Z"),
                repeating = false,
            )
        )

        assertEquals(
            26 * 60,
            rentalTimelineEndMinutesForDate(LocalDate(2026, 6, 8), listOf(option), TimeZone.UTC),
        )
        assertEquals(
            24 * 60,
            rentalTimelineEndMinutesForDate(LocalDate(2026, 6, 9), listOf(option), TimeZone.UTC),
        )
    }

    @Test
    fun overnightBusyBlock_keepsItsNextDayWallClockRange() {
        val block = RentalBusyBlock(
            eventId = "event-1",
            eventName = "Late booking",
            fieldId = "field_1",
            start = Instant.parse("2026-06-08T23:45:00Z"),
            end = Instant.parse("2026-06-09T00:45:00Z"),
        )

        val range = block.toBusyRangeOnDate(
            date = LocalDate(2026, 6, 8),
            timeZone = TimeZone.UTC,
            timelineEndMinutes = 26 * 60,
        )

        assertNotNull(range)
        assertEquals(23 * 60 + 45, range.startMinutes)
        assertEquals(24 * 60 + 45, range.endMinutes)
    }

    @Test
    fun overnightSelection_overlapsTheFollowingDatesEarlyMorningRange() {
        val overnight = RentalSelectionDraft(
            id = 1L,
            fieldId = "field_1",
            date = LocalDate(2026, 6, 8),
            startMinutes = 23 * 60,
            endMinutes = 25 * 60,
        )

        assertTrue(
            rentalSelectionOverlapsRange(
                selection = overnight,
                date = LocalDate(2026, 6, 9),
                startMinutes = 30,
                endMinutes = 90,
                timeZone = TimeZone.UTC,
            )
        )
        assertFalse(
            rentalSelectionOverlapsRange(
                selection = overnight,
                date = LocalDate(2026, 6, 9),
                startMinutes = 60,
                endMinutes = 90,
                timeZone = TimeZone.UTC,
            )
        )
    }

    @Test
    fun overnightSelection_projectsItsAfterMidnightContinuationOntoTheFollowingDate() {
        val selection = RentalSelectionDraft(
            id = 1L,
            fieldId = "field_1",
            date = LocalDate(2026, 6, 8),
            startMinutes = 23 * 60,
            endMinutes = 25 * 60,
        )

        val primary = selection.timelineSliceForDate(LocalDate(2026, 6, 8), TimeZone.UTC)
        val continuation = selection.timelineSliceForDate(LocalDate(2026, 6, 9), TimeZone.UTC)

        assertNotNull(primary)
        assertEquals(23 * 60, primary.startMinutes)
        assertEquals(25 * 60, primary.endMinutes)
        assertFalse(primary.isContinuation)
        assertNotNull(continuation)
        assertEquals(0, continuation.startMinutes)
        assertEquals(60, continuation.endMinutes)
        assertTrue(continuation.isContinuation)
        assertNull(selection.timelineSliceForDate(LocalDate(2026, 6, 10), TimeZone.UTC))
    }

    @Test
    fun nextDayOnlySelection_projectsOntoItsActualLocalDate() {
        val selection = RentalSelectionDraft(
            id = 2L,
            fieldId = "field_1",
            date = LocalDate(2026, 6, 8),
            startMinutes = 25 * 60,
            endMinutes = 25 * 60 + 30,
        )

        val projected = selection.timelineSliceForDate(LocalDate(2026, 6, 9), TimeZone.UTC)

        assertNotNull(projected)
        assertEquals(60, projected.startMinutes)
        assertEquals(90, projected.endMinutes)
        assertTrue(projected.isContinuation)
    }

    @Test
    fun rentalAccessibilityLabels_nameFieldDatesStateAndPrice() {
        val label = rentalSlotAccessibilityLabel(
            fieldLabel = "Court A",
            date = LocalDate(2026, 6, 8),
            startMinutes = 23 * 60 + 30,
            endMinutes = 24 * 60,
            state = RentalSlotAccessibilityState.AVAILABLE,
            priceCents = 1_250,
        )

        assertEquals(
            "Court A, 2026-06-08 11:30 PM to 2026-06-09 12:00 AM, available, \$12.50",
            label,
        )
    }

    private fun rentalSlot(
        id: String = "rental-slot",
        dayOfWeek: Int?,
        daysOfWeek: List<Int>?,
        startTimeMinutes: Int? = 10 * 60,
        endTimeMinutes: Int? = 11 * 60,
        startDate: Instant = Instant.parse("2026-06-01T00:00:00Z"),
        endDate: Instant? = Instant.parse("2026-06-30T00:00:00Z"),
        repeating: Boolean = true,
        timeZone: String = "UTC",
        price: Int = 2_000,
    ): TimeSlot = TimeSlot(
        id = id,
        dayOfWeek = dayOfWeek,
        daysOfWeek = daysOfWeek,
        startTimeMinutes = startTimeMinutes,
        endTimeMinutes = endTimeMinutes,
        startDate = startDate,
        timeZone = timeZone,
        repeating = repeating,
        endDate = endDate,
        scheduledFieldId = "field_1",
        scheduledFieldIds = listOf("field_1"),
        price = price,
    )

    private fun rentalOption(vararg slots: TimeSlot): RentalFieldOption = RentalFieldOption(
        field = Field(name = "Court A", id = "field_1"),
        rentalSlots = slots.toList(),
    )

    private fun TimeSlot.matchesOn(date: String): Boolean = matchesRentalSelection(
        rangeStart = Instant.parse("${date}T10:00:00Z"),
        rangeEnd = Instant.parse("${date}T11:00:00Z"),
        fieldId = "field_1",
        fallbackTimeZone = TimeZone.UTC,
    )
}
