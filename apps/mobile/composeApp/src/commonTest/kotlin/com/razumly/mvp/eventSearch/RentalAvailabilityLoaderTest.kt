@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeEventRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeFieldRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeMatchRepository
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
    fun loadBusyBlocks_convertsLeagueTimeSlotsToRentalBlocks() = runTest {
        val leagueSlot = TimeSlot(
            id = "league_slot_1",
            dayOfWeek = 0,
            daysOfWeek = listOf(0),
            startTimeMinutes = 10 * 60,
            endTimeMinutes = 11 * 60,
            startDate = Instant.parse("2026-06-01T00:00:00Z"),
            timeZone = "UTC",
            repeating = true,
            endDate = Instant.parse("2026-06-15T00:00:00Z"),
            scheduledFieldId = "field_1",
            scheduledFieldIds = listOf("field_1"),
            price = null,
        )
        val rentalSlot = TimeSlot(
            id = "rental_slot_1",
            dayOfWeek = 0,
            daysOfWeek = listOf(0),
            startTimeMinutes = 6 * 60,
            endTimeMinutes = 24 * 60,
            startDate = Instant.parse("2026-06-01T00:00:00Z"),
            timeZone = "UTC",
            repeating = true,
            endDate = Instant.parse("2026-06-15T00:00:00Z"),
            scheduledFieldId = "field_1",
            scheduledFieldIds = listOf("field_1"),
            price = 2500,
        )
        val league = Event(
            id = "league_1",
            name = "Spring League",
            hostId = "host_1",
            organizationId = "org_1",
            fieldIds = listOf("field_1"),
            timeSlotIds = listOf("league_slot_1"),
            start = Instant.parse("2026-06-01T00:00:00Z"),
            end = Instant.parse("2026-06-15T00:00:00Z"),
            eventType = EventType.LEAGUE,
        )
        val loader = RentalAvailabilityLoader(
            eventRepository = CreateEvent_FakeEventRepository(listOf(league)),
            matchRepository = CreateEvent_FakeMatchRepository(),
            fieldRepository = RentalAvailability_FakeFieldRepository(listOf(leagueSlot)),
        )

        val blocks = loader.loadBusyBlocks(
            organizationId = "org_1",
            fieldIds = listOf("field_1"),
        ).getOrThrow()

        assertEquals(
            listOf("2026-06-01T10:00:00Z", "2026-06-08T10:00:00Z"),
            blocks.map { block -> block.start.toString() },
        )
        assertEquals(
            listOf("2026-06-01T11:00:00Z", "2026-06-08T11:00:00Z"),
            blocks.map { block -> block.end.toString() },
        )

        val canSelectOverLeagueSlot = canApplyRentalSelectionRange(
            selectionId = 0L,
            fieldId = "field_1",
            date = LocalDate(2026, 6, 1),
            startMinutes = 10 * 60,
            endMinutes = 10 * 60 + SLOT_INTERVAL_MINUTES,
            selections = emptyList(),
            fieldOptions = listOf(
                RentalFieldOption(
                    field = Field(id = "field_1", fieldNumber = 1, name = "Court 1"),
                    rentalSlots = listOf(rentalSlot),
                )
            ),
            busyBlocks = blocks,
            timeZone = TimeZone.UTC,
        )

        assertFalse(canSelectOverLeagueSlot)
    }
}

private class RentalAvailability_FakeFieldRepository(
    private val slots: List<TimeSlot>,
) : IFieldRepository by CreateEvent_FakeFieldRepository() {
    override suspend fun getTimeSlots(ids: List<String>): Result<List<TimeSlot>> {
        val requestedIds = ids.map { id -> id.trim() }.toSet()
        return Result.success(slots.filter { slot -> requestedIds.contains(slot.id) })
    }
}
