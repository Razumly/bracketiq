package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import com.razumly.mvp.core.data.dataTypes.OneTimeTimeSlotValidationException
import kotlin.test.assertNotNull
import kotlin.time.Instant

class EventEditPayloadBuilderTest {
    @Test
    fun given_historical_slot_when_saving_metadata_then_omits_slot_but_rejects_slot_update() {
        val event = leagueEvent()
        val historical = slot(
            id = "historical",
            repeating = false,
            startDate = Instant.parse("2026-04-13T09:00:00Z"),
            endDate = Instant.parse("2026-04-13T10:00:00Z"),
        )
        val fields = listOf(field(id = "field-1"))
        val result = EventEditPayloadBuilder.prepareForUpdate(
            EventEditPayloadInput(
                editedEvent = event,
                editableFields = fields,
                editableLeagueTimeSlots = listOf(historical),
                selectedRentalFields = emptyList(),
                leagueScoringConfig = LeagueScoringConfigDTO(),
                originalEventStart = event.start,
            ),
        )
        val now = Instant.parse("2026-04-14T00:00:00Z")
        val metadataOnly = result.validateAndKeepChangedManagedCollections(
            fields, fields, listOf(historical), listOf(historical), now,
        )
        assertEquals(null, metadataOnly.prepared.timeSlots)
        assertFailsWith<OneTimeTimeSlotValidationException> {
            result.validateAndKeepChangedManagedCollections(
                fields, fields, listOf(historical), emptyList(), now,
            )
        }
    }

    @Test
    fun prepareForUpdate_preserves_generated_end_date_mode_for_weekly_events() {
        val event = leagueEvent(
            eventType = EventType.WEEKLY_EVENT,
            fieldIds = emptyList(),
        ).copy(noFixedEndDateTime = true)

        val result = EventEditPayloadBuilder.prepareForUpdate(
            EventEditPayloadInput(
                editedEvent = event,
                editableFields = emptyList(),
                editableLeagueTimeSlots = emptyList(),
                selectedRentalFields = emptyList(),
                leagueScoringConfig = LeagueScoringConfigDTO(),
                originalEventStart = event.start,
            ),
        )

        assertEquals(true, result.prepared.event.noFixedEndDateTime)
    }

    @Test
    fun prepareForUpdate_preserves_selected_rental_fields_in_the_complete_command_collection() {
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
        assertEquals(listOf("rental-field-1", "custom-field-1"), result.prepared.fields?.map(Field::id))
        assertEquals(rentalField, result.prepared.fields?.first())
        assertEquals(listOf("rental-field-1", "custom-field-1"), result.editableFields?.map(Field::id))
        assertEquals(listOf(1, 2), result.editableFields?.map(Field::fieldNumber))
        assertEquals(LeagueScoringConfigDTO(pointsForWin = 3), result.prepared.leagueScoringConfig)
    }

    @Test
    fun given_unchanged_collections_when_preparing_save_then_omits_fields_and_slots() {
        val event = leagueEvent()
        val currentFields = listOf(field(id = "field-1"))
        val currentTimeSlots = listOf(slot(id = "slot-1", repeating = true))
        val result = EventEditPayloadBuilder.prepareForUpdate(
            EventEditPayloadInput(
                editedEvent = event,
                editableFields = currentFields,
                editableLeagueTimeSlots = currentTimeSlots,
                selectedRentalFields = emptyList(),
                leagueScoringConfig = LeagueScoringConfigDTO(),
                originalEventStart = event.start,
            ),
        ).validateAndKeepChangedManagedCollections(
            currentFields = currentFields,
            baselineFields = currentFields.map { field -> field.copy(fieldNumber = 99) },
            currentTimeSlots = currentTimeSlots,
            baselineTimeSlots = currentTimeSlots,
        )

        assertEquals(null, result.prepared.fields)
        assertEquals(null, result.prepared.timeSlots)
        assertEquals(null, result.editableFields)
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
    fun given_split_league_playoffs_when_field_divisions_are_empty_then_registration_division_stays_eligible() {
        val sourceDivisionId = "event-1__division__open"
        val playoffDivisionId = "event-1__division__playoff_gold"
        val event = leagueEvent(divisions = listOf(sourceDivisionId)).copy(
            includePlayoffs = true,
            splitLeaguePlayoffDivisions = true,
            singleDivision = false,
            divisionDetails = listOf(
                DivisionDetail(id = sourceDivisionId, kind = "LEAGUE"),
                DivisionDetail(id = playoffDivisionId, kind = "PLAYOFF"),
            ),
        )

        val fields = buildEditableFieldDrafts(
            event = event,
            sourceFields = listOf(field(id = "field-1", divisions = emptyList())),
        )

        assertEquals(listOf(sourceDivisionId), fields.single().divisions)
    }

    @Test
    fun given_three_team_tournament_when_edit_payload_is_built_then_field_stays_scheduler_eligible() {
        val divisionId = "event-1__division__open"
        val event = leagueEvent(
            eventType = EventType.TOURNAMENT,
            divisions = listOf(divisionId),
            fieldIds = listOf("field-1"),
        ).copy(
            maxParticipants = 3,
            divisionDetails = listOf(
                DivisionDetail(
                    id = divisionId,
                    kind = "LEAGUE",
                    maxParticipants = 3,
                ),
            ),
        )

        val result = EventEditPayloadBuilder.prepareForUpdate(
            EventEditPayloadInput(
                editedEvent = event,
                editableFields = listOf(field(id = "field-1", divisions = emptyList())),
                editableLeagueTimeSlots = emptyList(),
                selectedRentalFields = emptyList(),
                leagueScoringConfig = LeagueScoringConfigDTO(),
                originalEventStart = event.start,
            ),
        )

        assertEquals(3, result.prepared.event.maxParticipants)
        assertEquals(3, result.prepared.event.divisionDetails.single().maxParticipants)
        assertEquals(listOf(divisionId), assertNotNull(result.prepared.fields).single().divisions)
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
    fun prepareForUpdate_persists_tryout_fields_and_updates_non_repeating_slot_bounds() {
        val previousEvent = leagueEvent(eventType = EventType.TRYOUT)
        val updatedEvent = previousEvent.copy(
            start = Instant.parse("2026-04-20T13:00:00Z"),
            end = Instant.parse("2026-04-20T15:00:00Z"),
        )
        val previousSlot = slot(
            id = "slot-1",
            repeating = false,
            startDate = previousEvent.start,
            endDate = previousEvent.end,
        )
        val syncedSlot = syncEditableLeagueSlotBoundaries(
            previousEvent,
            updatedEvent,
            listOf(previousSlot),
        ).single()

        assertEquals(updatedEvent.start, syncedSlot.startDate)
        assertEquals(updatedEvent.end, syncedSlot.endDate)

        val result = EventEditPayloadBuilder.prepareForUpdate(
            EventEditPayloadInput(
                editedEvent = updatedEvent,
                editableFields = listOf(field(id = "field-1")),
                editableLeagueTimeSlots = listOf(syncedSlot),
                selectedRentalFields = emptyList(),
                leagueScoringConfig = LeagueScoringConfigDTO(),
                originalEventStart = previousEvent.start,
            ),
        )

        val preparedSlot = assertNotNull(result.prepared.timeSlots).single()
        assertEquals(updatedEvent.start, preparedSlot.startDate)
        assertEquals(updatedEvent.end, preparedSlot.endDate)
        assertEquals(listOf("field-1"), result.prepared.event.fieldIds)
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
    fun given_overnight_slots_when_building_drafts_then_keeps_them_and_drops_missing_resources() {
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
        val repeatingOvernight = slot(
            id = "repeating-overnight",
            repeating = true,
            scheduledFieldIds = listOf("field-1"),
            startTimeMinutes = 10 * 60,
            endTimeMinutes = 9 * 60,
        )
        val oneTimeOvernight = slot(
            id = "one-time-overnight",
            repeating = false,
            scheduledFieldIds = listOf("field-1"),
            startDate = Instant.parse("2026-04-14T17:00:00Z"),
            endDate = Instant.parse("2026-04-14T15:30:00Z"),
            startTimeMinutes = 17 * 60,
            endTimeMinutes = 15 * 60 + 30,
        )

        val result = EventEditPayloadBuilder.buildLeagueSlotDrafts(
            event = event,
            originalEventStart = event.start,
            editableLeagueTimeSlots = listOf(missingField, repeatingOvernight, oneTimeOvernight),
        )

        assertEquals(listOf("repeating-overnight", "one-time-overnight"), result.map(TimeSlot::id))
        assertEquals(Instant.parse("2026-04-15T15:30:00Z"), result.last().endDate)
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
