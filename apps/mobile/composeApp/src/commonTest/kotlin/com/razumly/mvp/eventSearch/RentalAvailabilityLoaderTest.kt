@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.RentalAvailabilityBusyBlock
import com.razumly.mvp.core.data.dataTypes.RentalAvailabilityField
import com.razumly.mvp.core.data.dataTypes.RentalAvailabilitySnapshot
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeFieldRepository
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant

class RentalAvailabilityLoaderTest {
    @Test
    fun resolveRentalRange_requires_one_availability_slot_to_cover_entire_paid_range() {
        val date = LocalDate(2026, 6, 22)
        fun slot(id: String, startMinutes: Int, endMinutes: Int) = rentalSlot(
            id = id,
            startMinutes = startMinutes,
            endMinutes = endMinutes,
        )
        val stitched = RentalFieldOption(
            field = Field(id = "field_1", fieldNumber = 1, name = "Court 1"),
            rentalSlots = listOf(slot("first", 10 * 60, 10 * 60 + 30), slot("second", 10 * 60 + 30, 11 * 60)),
        )
        val continuous = stitched.copy(rentalSlots = listOf(slot("whole", 10 * 60, 11 * 60)))

        assertEquals(null, resolveRentalRange(stitched, date, 10 * 60, 11 * 60, TimeZone.UTC))
        assertEquals(
            listOf("whole"),
            resolveRentalRange(continuous, date, 10 * 60, 11 * 60, TimeZone.UTC)?.slots?.map(TimeSlot::id),
        )
    }

    @Test
    fun rentalPrice_isProratedByDuration() {
        assertEquals(1250, proratedRentalPriceCents(priceCents = 2500, durationMinutes = 30))
        assertEquals(3750, proratedRentalPriceCents(priceCents = 2500, durationMinutes = 90))
    }

    @Test
    fun rentalIntervalInPast_rejectsSelectionsThatStartAtOrBeforeNow() {
        val now = Instant.parse("2026-06-18T10:15:00Z")

        assertTrue(
            isRentalIntervalInPast(
                date = LocalDate(2026, 6, 18),
                startMinutes = 10 * 60,
                endMinutes = 10 * 60 + SLOT_INTERVAL_MINUTES,
                timeZone = TimeZone.UTC,
                now = now,
            )
        )
        assertFalse(
            isRentalIntervalInPast(
                date = LocalDate(2026, 6, 18),
                startMinutes = 10 * 60 + SLOT_INTERVAL_MINUTES,
                endMinutes = 11 * 60,
                timeZone = TimeZone.UTC,
                now = now,
            )
        )
    }

    @Test
    fun rentalAvailabilityWindow_uses_local_week_boundaries_across_daylightSaving() {
        val window = rentalAvailabilityWindowForDate(
            date = LocalDate(2026, 3, 4),
            timeZone = TimeZone.of("America/Los_Angeles"),
        )

        assertEquals(Instant.parse("2026-03-02T08:00:00Z"), window.start)
        assertEquals(Instant.parse("2026-03-09T07:00:00Z"), window.end)
    }

    @Test
    fun rentalAvailabilityFetchWindow_pads_mixed_timezone_week_edges() {
        val selectedDate = LocalDate(2026, 7, 13)
        val westAnchoredWindow = rentalAvailabilityFetchWindowForDate(
            date = selectedDate,
            timeZone = TimeZone.of("Pacific/Pago_Pago"),
        )
        val eastAnchoredWindow = rentalAvailabilityFetchWindowForDate(
            date = selectedDate,
            timeZone = TimeZone.of("Pacific/Kiritimati"),
        )
        val eastMondayMorning = selectedDate.toInstantAtMinutes(
            minutesFromStartOfDay = 6 * 60,
            timeZone = TimeZone.of("Pacific/Kiritimati"),
        )
        val westEndOfSunday = LocalDate(2026, 7, 19).toInstantAtMinutes(
            minutesFromStartOfDay = 24 * 60,
            timeZone = TimeZone.of("Pacific/Pago_Pago"),
        )

        assertEquals(Instant.parse("2026-07-11T11:00:00Z"), westAnchoredWindow.start)
        assertEquals(Instant.parse("2026-07-22T11:00:00Z"), westAnchoredWindow.end)
        assertEquals(Instant.parse("2026-07-10T10:00:00Z"), eastAnchoredWindow.start)
        assertEquals(Instant.parse("2026-07-21T10:00:00Z"), eastAnchoredWindow.end)
        assertTrue(eastMondayMorning >= westAnchoredWindow.start)
        assertTrue(westEndOfSunday <= eastAnchoredWindow.end)
    }

    @Test
    fun rentalWallClockConversion_preserves_springForward_times_and_busy_ranges() {
        val date = LocalDate(2026, 3, 8)
        val timeZone = TimeZone.of("America/Los_Angeles")
        val start = date.toInstantAtMinutes(9 * 60, timeZone)
        val end = date.toInstantAtMinutes(10 * 60, timeZone)

        assertEquals(Instant.parse("2026-03-08T16:00:00Z"), start)
        assertEquals(Instant.parse("2026-03-08T17:00:00Z"), end)
        assertEquals(Instant.parse("2026-03-09T07:00:00Z"), date.toInstantAtMinutes(24 * 60, timeZone))
        assertEquals(
            RentalBusyRange(
                eventId = "",
                eventName = RENTAL_UNAVAILABLE_LABEL,
                startMinutes = 9 * 60,
                endMinutes = 10 * 60,
            ),
            RentalBusyBlock(
                eventId = "",
                eventName = RENTAL_UNAVAILABLE_LABEL,
                fieldId = "field_1",
                start = start,
                end = end,
            ).toBusyRangeOnDate(date, timeZone),
        )
    }

    @Test
    fun rentalWallClockConversion_preserves_fallBack_times_and_busy_ranges() {
        val date = LocalDate(2026, 11, 1)
        val timeZone = TimeZone.of("America/Los_Angeles")
        val start = date.toInstantAtMinutes(9 * 60, timeZone)
        val end = date.toInstantAtMinutes(10 * 60, timeZone)

        assertEquals(Instant.parse("2026-11-01T17:00:00Z"), start)
        assertEquals(Instant.parse("2026-11-01T18:00:00Z"), end)
        assertEquals(Instant.parse("2026-11-02T08:00:00Z"), date.toInstantAtMinutes(24 * 60, timeZone))
        assertEquals(
            RentalBusyRange(
                eventId = "",
                eventName = RENTAL_UNAVAILABLE_LABEL,
                startMinutes = 9 * 60,
                endMinutes = 10 * 60,
            ),
            RentalBusyBlock(
                eventId = "",
                eventName = RENTAL_UNAVAILABLE_LABEL,
                fieldId = "field_1",
                start = start,
                end = end,
            ).toBusyRangeOnDate(date, timeZone),
        )
    }

    @Test
    fun rentalSelectionSnapshotValidation_requires_loaded_coverage_and_no_conflict() {
        val window = RentalAvailabilityWindow(
            start = Instant.parse("2026-07-13T00:00:00Z"),
            end = Instant.parse("2026-07-20T00:00:00Z"),
        )
        val busyBlocks = listOf(
            RentalBusyBlock(
                eventId = "",
                eventName = RENTAL_UNAVAILABLE_LABEL,
                fieldId = "field_1",
                start = Instant.parse("2026-07-14T10:00:00Z"),
                end = Instant.parse("2026-07-14T11:00:00Z"),
            )
        )

        assertTrue(
            isRentalSelectionValidForAvailabilitySnapshot(
                fieldId = "field_1",
                start = Instant.parse("2026-07-14T09:00:00Z"),
                end = Instant.parse("2026-07-14T10:00:00Z"),
                availabilityWindow = window,
                busyBlocks = busyBlocks,
            )
        )
        assertFalse(
            isRentalSelectionValidForAvailabilitySnapshot(
                fieldId = "field_1",
                start = Instant.parse("2026-07-14T10:30:00Z"),
                end = Instant.parse("2026-07-14T11:30:00Z"),
                availabilityWindow = window,
                busyBlocks = busyBlocks,
            )
        )
        assertFalse(
            isRentalSelectionValidForAvailabilitySnapshot(
                fieldId = "field_1",
                start = Instant.parse("2026-07-12T23:30:00Z"),
                end = Instant.parse("2026-07-13T00:30:00Z"),
                availabilityWindow = window,
                busyBlocks = emptyList(),
            )
        )
        assertFalse(
            isRentalSelectionValidForAvailabilitySnapshot(
                fieldId = "field_1",
                start = Instant.parse("2026-07-14T09:00:00Z"),
                end = Instant.parse("2026-07-14T10:00:00Z"),
                availabilityWindow = null,
                busyBlocks = emptyList(),
            )
        )
    }

    @Test
    fun loadAvailability_maps_authoritative_window_snapshot_to_opaque_view_state() = runTest {
        val rangeStart = Instant.parse("2026-06-22T07:00:00Z")
        val rangeEnd = Instant.parse("2026-06-29T07:00:00Z")
        val slot = rentalSlot(id = "rental_slot_1", startMinutes = 9 * 60, endMinutes = 21 * 60)
        val field = Field(
            id = "field_1",
            fieldNumber = 1,
            name = "Court 1",
            organizationId = "org_1",
            rentalSlotIds = listOf(slot.id),
        )
        val repository = RentalAvailability_FakeFieldRepository(
            result = Result.success(
                RentalAvailabilitySnapshot(
                    rangeStart = rangeStart,
                    rangeEnd = rangeEnd,
                    fields = listOf(RentalAvailabilityField(field = field, rentalSlots = listOf(slot))),
                    busyBlocks = listOf(
                        RentalAvailabilityBusyBlock(
                            fieldId = field.id,
                            start = Instant.parse("2026-06-23T17:00:00Z"),
                            end = Instant.parse("2026-06-23T18:00:00Z"),
                        )
                    ),
                )
            ),
        )

        val snapshot = RentalAvailabilityLoader(repository).loadAvailability(
            organizationId = "org_1",
            rangeStart = rangeStart,
            rangeEnd = rangeEnd,
        ).getOrThrow()

        assertEquals(
            listOf(RentalAvailabilityRequest("org_1", rangeStart, rangeEnd)),
            repository.requests,
        )
        assertEquals(listOf(field), snapshot.fieldOptions.map(RentalFieldOption::field))
        assertEquals(listOf(slot), snapshot.fieldOptions.single().rentalSlots)
        assertEquals(listOf(RENTAL_UNAVAILABLE_LABEL), snapshot.busyBlocks.map(RentalBusyBlock::eventName))
        assertTrue(snapshot.busyBlocks.all { block -> block.eventId.isEmpty() })
    }

    @Test
    fun loadAvailability_propagates_snapshot_failure_without_fabricating_empty_state() = runTest {
        val failure = IllegalStateException("offline")
        val repository = RentalAvailability_FakeFieldRepository(Result.failure(failure))

        val result = RentalAvailabilityLoader(repository).loadAvailability(
            organizationId = "org_1",
            rangeStart = Instant.parse("2026-06-22T00:00:00Z"),
            rangeEnd = Instant.parse("2026-06-29T00:00:00Z"),
        )

        assertEquals(failure, result.exceptionOrNull())
    }
}

private data class RentalAvailabilityRequest(
    val organizationId: String,
    val rangeStart: Instant,
    val rangeEnd: Instant,
)

private class RentalAvailability_FakeFieldRepository(
    private val result: Result<RentalAvailabilitySnapshot>,
) : IFieldRepository by CreateEvent_FakeFieldRepository() {
    val requests = mutableListOf<RentalAvailabilityRequest>()

    override suspend fun getRentalAvailability(
        organizationId: String,
        rangeStart: Instant,
        rangeEnd: Instant,
    ): Result<RentalAvailabilitySnapshot> {
        requests += RentalAvailabilityRequest(organizationId, rangeStart, rangeEnd)
        return result
    }
}

private fun rentalSlot(
    id: String,
    startMinutes: Int,
    endMinutes: Int,
): TimeSlot = TimeSlot(
    id = id,
    dayOfWeek = 0,
    daysOfWeek = listOf(0),
    startTimeMinutes = startMinutes,
    endTimeMinutes = endMinutes,
    startDate = Instant.parse("2026-06-01T00:00:00Z"),
    endDate = Instant.parse("2026-07-01T00:00:00Z"),
    timeZone = "UTC",
    repeating = true,
    scheduledFieldId = "field_1",
    scheduledFieldIds = listOf("field_1"),
    price = 2000,
)
