package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.time.Instant

class EventEditPayloadBuilderTest {
    @Test
    fun prepareForUpdate_preserves_selected_rental_fields_and_returns_only_custom_field_drafts() {
        val event = leagueEvent(
            divisions = listOf("division-a"),
            fieldIds = emptyList(),
        )
        val rentalField = field(
            id = "rental-field-1",
            fieldNumber = 1,
            divisions = listOf("division-a"),
        )
        val customField = field(
            id = "",
            fieldNumber = 2,
            name = "",
            divisions = emptyList(),
        )

        val result = EventEditPayloadBuilder.prepareForUpdate(
            EventEditPayloadInput(
                editedEvent = event,
                editableFields = listOf(rentalField, customField),
                editableLeagueTimeSlots = emptyList(),
                selectedRentalFields = listOf(rentalField),
                leagueScoringConfig = LeagueScoringConfigDTO(pointsForWin = 3),
                originalEventStart = event.start,
                idFactory = idFactory("custom-field-1"),
            ),
        )

        assertEquals(listOf("rental-field-1", "custom-field-1"), result.prepared.event.fieldIds)
        assertEquals(listOf("custom-field-1"), result.prepared.fields?.map(Field::id))
        assertEquals(listOf("rental-field-1", "custom-field-1"), result.editableFields?.map(Field::id))
        assertEquals(listOf(1, 2), result.editableFields?.map(Field::fieldNumber))
        assertEquals(LeagueScoringConfigDTO(pointsForWin = 3), result.prepared.leagueScoringConfig)
    }

    @Test
    fun buildEditableFieldDrafts_defaults_empty_field_divisions_to_event_divisions() {
        val fields = buildEditableFieldDrafts(
            event = leagueEvent(divisions = listOf("division-a")),
            sourceFields = listOf(field(id = "field-1", divisions = emptyList())),
        )

        assertEquals(listOf("division_a"), fields.single().divisions)
    }

    @Test
    fun buildEditableFieldDrafts_defaults_empty_field_divisions_to_open_when_event_has_no_divisions() {
        val fields = buildEditableFieldDrafts(
            event = leagueEvent(divisions = emptyList()),
            sourceFields = listOf(field(id = "field-1", divisions = emptyList())),
        )

        assertEquals(listOf("open"), fields.single().divisions)
    }

    @Test
    fun buildLeagueSlotDrafts_derives_non_repeating_day_and_minutes_from_datetimes() {
        val event = leagueEvent(
            divisions = listOf("open"),
            fieldIds = listOf("field-1"),
            timeZone = "UTC",
        )
        val slot = slot(
            id = "",
            repeating = false,
            startDate = Instant.parse("2026-04-14T15:30:00Z"),
            endDate = Instant.parse("2026-04-14T17:00:00Z"),
            scheduledFieldIds = listOf("field-1"),
            startTimeMinutes = null,
            endTimeMinutes = null,
            daysOfWeek = emptyList(),
        )

        val result = EventEditPayloadBuilder.buildLeagueSlotDrafts(
            event = event,
            originalEventStart = event.start,
            editableLeagueTimeSlots = listOf(slot),
            idFactory = idFactory("slot-1"),
        )

        val preparedSlot = assertNotNull(result.singleOrNull())
        assertEquals("slot-1", preparedSlot.id)
        assertEquals(1, preparedSlot.dayOfWeek)
        assertEquals(listOf(1), preparedSlot.daysOfWeek)
        assertEquals(15 * 60 + 30, preparedSlot.startTimeMinutes)
        assertEquals(17 * 60, preparedSlot.endTimeMinutes)
        assertEquals("field-1", preparedSlot.scheduledFieldId)
        assertEquals(listOf("field-1"), preparedSlot.scheduledFieldIds)
    }

    @Test
    fun buildLeagueSlotDrafts_preserves_multiple_weekdays_for_repeating_weekly_slots() {
        val event = leagueEvent(
            eventType = EventType.WEEKLY_EVENT,
            divisions = listOf("open"),
            fieldIds = listOf("field-1"),
        )
        val slot = slot(
            id = "slot-1",
            repeating = true,
            daysOfWeek = listOf(1, 3),
            scheduledFieldIds = listOf("field-1"),
            startTimeMinutes = 18 * 60,
            endTimeMinutes = 20 * 60,
        )

        val result = EventEditPayloadBuilder.buildLeagueSlotDrafts(
            event = event,
            originalEventStart = event.start,
            editableLeagueTimeSlots = listOf(slot),
        )

        val preparedSlot = assertNotNull(result.singleOrNull())
        assertEquals(1, preparedSlot.dayOfWeek)
        assertEquals(listOf(1, 3), preparedSlot.daysOfWeek)
        assertEquals(null, preparedSlot.endDate)
    }

    @Test
    fun buildLeagueSlotDrafts_drops_slots_without_valid_fields_or_valid_time_bounds() {
        val event = leagueEvent(
            divisions = listOf("open"),
            fieldIds = listOf("field-1"),
        )
        val missingField = slot(
            id = "missing-field",
            repeating = true,
            scheduledFieldIds = listOf("field-2"),
            startTimeMinutes = 9 * 60,
            endTimeMinutes = 10 * 60,
        )
        val invalidRepeatingTime = slot(
            id = "invalid-repeating",
            repeating = true,
            scheduledFieldIds = listOf("field-1"),
            startTimeMinutes = 10 * 60,
            endTimeMinutes = 9 * 60,
        )
        val invalidNonRepeatingTime = slot(
            id = "invalid-non-repeating",
            repeating = false,
            scheduledFieldIds = listOf("field-1"),
            startDate = Instant.parse("2026-04-14T17:00:00Z"),
            endDate = Instant.parse("2026-04-14T15:30:00Z"),
        )

        val result = EventEditPayloadBuilder.buildLeagueSlotDrafts(
            event = event,
            originalEventStart = event.start,
            editableLeagueTimeSlots = listOf(missingField, invalidRepeatingTime, invalidNonRepeatingTime),
        )

        assertEquals(emptyList(), result)
    }

    private fun leagueEvent(
        eventType: EventType = EventType.LEAGUE,
        divisions: List<String> = listOf("open"),
        fieldIds: List<String> = listOf("field-1"),
        timeZone: String = "UTC",
    ): Event {
        return Event(
            id = "event-1",
            name = "League",
            eventType = eventType,
            divisions = divisions,
            fieldIds = fieldIds,
            start = Instant.parse("2026-04-13T12:00:00Z"),
            end = Instant.parse("2026-05-13T12:00:00Z"),
            timeZone = timeZone,
            singleDivision = true,
        )
    }

    private fun field(
        id: String,
        fieldNumber: Int = 1,
        name: String? = "Field $fieldNumber",
        divisions: List<String> = listOf("open"),
    ): Field {
        return Field(
            id = id,
            fieldNumber = fieldNumber,
            name = name,
            divisions = divisions,
        )
    }

    private fun slot(
        id: String,
        repeating: Boolean,
        daysOfWeek: List<Int> = listOf(1),
        divisions: List<String> = listOf("open"),
        startTimeMinutes: Int? = 9 * 60,
        endTimeMinutes: Int? = 10 * 60,
        startDate: Instant = Instant.parse("2026-04-13T12:00:00Z"),
        endDate: Instant? = Instant.parse("2026-05-13T12:00:00Z"),
        scheduledFieldIds: List<String> = listOf("field-1"),
    ): TimeSlot {
        return TimeSlot(
            id = id,
            dayOfWeek = daysOfWeek.firstOrNull(),
            daysOfWeek = daysOfWeek,
            divisions = divisions,
            startTimeMinutes = startTimeMinutes,
            endTimeMinutes = endTimeMinutes,
            startDate = startDate,
            timeZone = "UTC",
            repeating = repeating,
            endDate = endDate,
            scheduledFieldId = scheduledFieldIds.firstOrNull(),
            scheduledFieldIds = scheduledFieldIds,
            price = null,
        )
    }

    private fun idFactory(vararg ids: String): () -> String {
        var index = 0
        return {
            ids.getOrElse(index) { "generated-${index + 1}" }
                .also { index += 1 }
        }
    }
}
