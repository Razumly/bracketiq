package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Instant

class EventEditDraftCoordinatorTest {
    @Test
    fun seed_and_refresh_readonly_draft_populates_event_fields_and_scoring() {
        val coordinator = EventEditDraftCoordinator(
            initialEvent = leagueEvent(fieldIds = emptyList()),
            canEditInitial = false,
        )
        val event = leagueEvent(
            divisions = listOf("division-a"),
            fieldIds = listOf("field-1"),
        )

        coordinator.refreshReadOnlyDraft(
            event = event,
            sourceFields = listOf(field(id = "field-1", divisions = emptyList())),
            leagueScoringConfig = LeagueScoringConfigDTO(pointsForWin = 3),
        )

        assertEquals(listOf("field-1"), coordinator.editedEvent.value.fieldIds)
        assertEquals(listOf("division_a"), coordinator.editableFields.value.single().divisions)
        assertEquals(1, coordinator.fieldCount.value)
        assertEquals(3, coordinator.editableLeagueScoringConfig.value.pointsForWin)
    }

    @Test
    fun select_field_count_resizes_fields_and_prunes_slots_to_remaining_fields() {
        val coordinator = EventEditDraftCoordinator(
            initialEvent = leagueEvent(),
            canEditInitial = true,
        )
        coordinator.seedDraftForEditing(
            event = leagueEvent(
                divisions = listOf("division-a"),
                fieldIds = listOf("field-1", "field-2"),
                location = "Main Park",
            ),
            sourceFields = listOf(
                field(id = "field-1", name = "", divisions = emptyList(), location = null),
                field(id = "field-2", name = "Second", divisions = listOf("division-a"), location = "Court"),
            ),
            timeSlots = listOf(slot(id = "slot-1", scheduledFieldIds = listOf("field-1", "field-2"))),
            leagueScoringConfig = LeagueScoringConfigDTO(),
        )

        coordinator.selectFieldCount(1)

        assertEquals(listOf("field-1"), coordinator.editedEvent.value.fieldIds)
        assertEquals(listOf("field-1"), coordinator.editableLeagueTimeSlots.value.single().scheduledFieldIds)
        assertEquals("Field 1", coordinator.editableFields.value.single().name)
        assertEquals("Main Park", coordinator.editableFields.value.single().location)
    }

    @Test
    fun update_edited_event_syncs_field_defaults_and_slot_boundaries() {
        val coordinator = EventEditDraftCoordinator(
            initialEvent = leagueEvent(location = "Old Park"),
            canEditInitial = true,
        )
        coordinator.seedDraftForEditing(
            event = leagueEvent(
                fieldIds = listOf("field-1"),
                location = "Old Park",
                start = Instant.parse("2026-04-13T12:00:00Z"),
                end = Instant.parse("2026-05-13T12:00:00Z"),
            ),
            sourceFields = listOf(field(id = "field-1", location = "Old Park")),
            timeSlots = listOf(
                slot(
                    id = "slot-1",
                    startDate = Instant.parse("2026-04-13T12:00:00Z"),
                    endDate = Instant.parse("2026-05-13T12:00:00Z"),
                ),
            ),
            leagueScoringConfig = LeagueScoringConfigDTO(),
        )

        coordinator.updateEditedEvent { current ->
            current.copy(
                location = "New Park",
                start = Instant.parse("2026-04-20T12:00:00Z"),
                end = Instant.parse("2026-05-20T12:00:00Z"),
            )
        }

        assertEquals("New Park", coordinator.editableFields.value.single().location)
        assertEquals(Instant.DISTANT_PAST, coordinator.editableLeagueTimeSlots.value.single().startDate)
        assertEquals(Instant.parse("2026-05-20T00:00:00Z"), coordinator.editableLeagueTimeSlots.value.single().endDate)
    }

    @Test
    fun local_field_names_league_slots_and_prepared_fields_update_draft_state() {
        val coordinator = EventEditDraftCoordinator(
            initialEvent = leagueEvent(fieldIds = listOf("field-1")),
            canEditInitial = true,
        )
        coordinator.seedDraftForEditing(
            event = leagueEvent(fieldIds = listOf("field-1")),
            sourceFields = listOf(field(id = "field-1")),
            timeSlots = emptyList(),
            leagueScoringConfig = LeagueScoringConfigDTO(),
        )

        coordinator.updateLocalFieldName(0, "Center Court")
        coordinator.addLeagueTimeSlot(
            now = Instant.parse("2026-04-13T12:00:00Z"),
            idFactory = { "slot-1" },
        )
        coordinator.updateLeagueScoringConfig { copy(pointsForWin = 4) }
        coordinator.applyPreparedEditableFields(
            listOf(field(id = "prepared-field", fieldNumber = 1, name = "Center Court")),
        )

        assertEquals("Center Court", coordinator.editableFields.value.single().name)
        assertEquals(listOf("prepared-field"), coordinator.editedEvent.value.fieldIds)
        assertEquals("slot-1", coordinator.editableLeagueTimeSlots.value.single().id)
        assertEquals(4, coordinator.editableLeagueScoringConfig.value.pointsForWin)
    }

    private fun leagueEvent(
        eventType: EventType = EventType.LEAGUE,
        divisions: List<String> = listOf("open"),
        fieldIds: List<String> = listOf("field-1"),
        location: String = "Main Park",
        start: Instant = Instant.parse("2026-04-13T12:00:00Z"),
        end: Instant = Instant.parse("2026-05-13T12:00:00Z"),
    ): Event {
        return Event(
            id = "event-1",
            name = "League",
            eventType = eventType,
            divisions = divisions,
            fieldIds = fieldIds,
            location = location,
            start = start,
            end = end,
            timeZone = "UTC",
            singleDivision = true,
        )
    }

    private fun field(
        id: String,
        fieldNumber: Int = 1,
        name: String? = "Field $fieldNumber",
        divisions: List<String> = listOf("open"),
        location: String? = "Main Park",
    ): Field {
        return Field(
            id = id,
            fieldNumber = fieldNumber,
            name = name,
            divisions = divisions,
            location = location,
        )
    }

    private fun slot(
        id: String,
        startDate: Instant = Instant.parse("2026-04-13T12:00:00Z"),
        endDate: Instant? = Instant.parse("2026-05-13T12:00:00Z"),
        scheduledFieldIds: List<String> = listOf("field-1"),
    ): TimeSlot {
        return TimeSlot(
            id = id,
            dayOfWeek = 1,
            daysOfWeek = listOf(1),
            divisions = listOf("open"),
            startTimeMinutes = 9 * 60,
            endTimeMinutes = 10 * 60,
            startDate = startDate,
            timeZone = "UTC",
            repeating = true,
            endDate = endDate,
            scheduledFieldId = scheduledFieldIds.firstOrNull(),
            scheduledFieldIds = scheduledFieldIds,
            price = null,
        )
    }
}
