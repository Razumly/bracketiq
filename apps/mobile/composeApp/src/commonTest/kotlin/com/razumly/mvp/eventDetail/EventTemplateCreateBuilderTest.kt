package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Instant

class EventTemplateCreateBuilderTest {
    @Test
    fun event_template_shell_clears_participants_and_remaps_staffing() {
        val result = EventTemplateCreateBuilder.prepare(
            input = EventTemplateCreateInput(
                sourceEvent = Event(
                    id = "event-1",
                    name = "Summer League",
                    state = "PUBLISHED",
                    hostId = "old-host",
                    userIds = listOf("user-1"),
                    teamIds = listOf("team-1"),
                    waitListIds = listOf("wait-1"),
                    freeAgentIds = listOf("free-1"),
                    officialPositions = listOf(EventOfficialPosition(id = "position-1", name = "Referee")),
                    eventOfficials = listOf(
                        EventOfficial(
                            id = "official-1",
                            userId = "official-user",
                            positionIds = listOf("position-1", "missing-position"),
                        ),
                    ),
                ),
                currentUserId = " current-host ",
                sourceSport = null,
                isEditing = false,
                editableFields = emptyList(),
                relationFields = emptyList(),
                editableTimeSlots = emptyList(),
                relationTimeSlots = emptyList(),
                editableLeagueScoringConfig = LeagueScoringConfigDTO(),
                nextId = fixedIds("template-1"),
            ),
        )

        assertEquals("template-1", result.event.id)
        assertEquals("Summer League (TEMPLATE)", result.event.name)
        assertEquals("TEMPLATE", result.event.state)
        assertEquals("current-host", result.event.hostId)
        assertEquals(emptyList(), result.event.userIds)
        assertEquals(emptyList(), result.event.teamIds)
        assertEquals(emptyList(), result.event.waitListIds)
        assertEquals(emptyList(), result.event.freeAgentIds)
        assertEquals("event_pos_template-1_0_referee", result.event.officialPositions.single().id)
        assertEquals(0, result.event.officialPositions.single().order)
        assertEquals("event_official_template-1_official_user", result.event.eventOfficials.single().id)
        assertEquals(listOf("event_pos_template-1_0_referee"), result.event.eventOfficials.single().positionIds)
        assertNull(result.fields)
        assertNull(result.timeSlots)
        assertNull(result.leagueScoringConfig)
    }

    @Test
    fun league_template_clones_fields_slots_and_scoring_config() {
        val scoringConfig = LeagueScoringConfigDTO(pointsForWin = 3, pointsForDraw = 1)
        val result = EventTemplateCreateBuilder.prepare(
            input = EventTemplateCreateInput(
                sourceEvent = Event(
                    id = "event-1",
                    name = "League",
                    eventType = EventType.LEAGUE,
                    divisions = listOf("division-a"),
                    fieldIds = listOf("field-source"),
                ),
                currentUserId = null,
                sourceSport = null,
                isEditing = true,
                editableFields = listOf(
                    Field(
                        id = "field-source",
                        fieldNumber = 5,
                        name = "",
                        divisions = emptyList(),
                        location = "",
                    ),
                ),
                relationFields = emptyList(),
                editableTimeSlots = listOf(
                    slot(
                        id = "slot-source",
                        scheduledFieldIds = listOf("field-source", "missing-field"),
                        divisions = emptyList(),
                    ),
                ),
                relationTimeSlots = emptyList(),
                editableLeagueScoringConfig = scoringConfig,
                nextId = fixedIds("template-1", "field-clone-1", "slot-clone-1"),
            ),
        )

        assertEquals("template-1", result.event.id)
        assertEquals(listOf("field-clone-1"), result.event.fieldIds)
        assertEquals(listOf("slot-clone-1"), result.event.timeSlotIds)
        assertEquals(scoringConfig, result.leagueScoringConfig)

        val clonedField = result.fields?.single()
        assertEquals("field-clone-1", clonedField?.id)
        assertEquals(1, clonedField?.fieldNumber)
        assertEquals("Field 1", clonedField?.name)
        assertEquals(listOf("division_a"), clonedField?.divisions)

        val clonedSlot = result.timeSlots?.single()
        assertEquals("slot-clone-1", clonedSlot?.id)
        assertEquals(listOf("field-clone-1"), clonedSlot?.scheduledFieldIds)
        assertEquals("field-clone-1", clonedSlot?.scheduledFieldId)
        assertEquals(listOf("division_a"), clonedSlot?.divisions)
    }

    @Test
    fun organization_managed_template_keeps_existing_field_ids_and_does_not_clone_fields() {
        val result = EventTemplateCreateBuilder.prepare(
            input = EventTemplateCreateInput(
                sourceEvent = Event(
                    id = "event-1",
                    name = "Org League (TEMPLATE)",
                    eventType = EventType.TOURNAMENT,
                    organizationId = "org-1",
                    fieldIds = listOf(" field-a "),
                ),
                currentUserId = null,
                sourceSport = null,
                isEditing = false,
                editableFields = emptyList(),
                relationFields = listOf(Field(id = "field-a", fieldNumber = 1)),
                editableTimeSlots = emptyList(),
                relationTimeSlots = listOf(slot(id = "slot-source", scheduledFieldIds = listOf("field-a"))),
                editableLeagueScoringConfig = LeagueScoringConfigDTO(pointsForWin = 3),
                nextId = fixedIds("template-1", "slot-clone-1"),
            ),
        )

        assertEquals("Org League (TEMPLATE)", result.event.name)
        assertEquals(listOf("field-a"), result.event.fieldIds)
        assertNull(result.fields)
        assertEquals(listOf("slot-clone-1"), result.event.timeSlotIds)
        assertEquals(listOf("field-a"), result.timeSlots?.single()?.scheduledFieldIds)
        assertNull(result.leagueScoringConfig)
    }

    @Test
    fun template_creation_removes_rental_only_fields_and_keeps_rental_reference_slot() {
        val result = EventTemplateCreateBuilder.prepare(
            input = EventTemplateCreateInput(
                sourceEvent = Event(
                    id = "event-1",
                    name = "Rental League",
                    eventType = EventType.LEAGUE,
                    organizationId = "org-1",
                    fieldIds = listOf("rental-field", "regular-field"),
                ),
                currentUserId = null,
                sourceSport = null,
                isEditing = true,
                editableFields = listOf(
                    Field(
                        id = "rental-field",
                        fieldNumber = 1,
                        name = "Rental Court",
                        organizationId = "org-1",
                    ),
                    Field(
                        id = "regular-field",
                        fieldNumber = 2,
                        name = "Practice Court",
                        organizationId = "org-1",
                    ),
                ),
                relationFields = emptyList(),
                editableTimeSlots = listOf(
                    slot(
                        id = "rental-slot",
                        scheduledFieldIds = listOf("rental-field"),
                    ).copy(
                        sourceType = "RENTAL_BOOKING",
                        rentalBookingId = "booking-1",
                        rentalBookingItemId = "item-1",
                        rentalLocked = true,
                        price = 5000,
                    ),
                    slot(
                        id = "regular-slot",
                        scheduledFieldIds = listOf("regular-field"),
                    ),
                ),
                relationTimeSlots = emptyList(),
                editableLeagueScoringConfig = LeagueScoringConfigDTO(),
                nextId = fixedIds("template-1", "slot-clone-1", "slot-clone-2"),
            ),
        )

        assertEquals(listOf("regular-field"), result.event.fieldIds)
        assertNull(result.fields)
        assertEquals(listOf("slot-clone-1", "slot-clone-2"), result.event.timeSlotIds)

        val rentalSlot = result.timeSlots?.first()
        assertEquals("slot-clone-1", rentalSlot?.id)
        assertNull(rentalSlot?.scheduledFieldId)
        assertEquals(emptyList(), rentalSlot?.scheduledFieldIds)
        assertNull(rentalSlot?.rentalBookingId)
        assertNull(rentalSlot?.rentalBookingItemId)
        assertFalse(rentalSlot?.rentalLocked == true)
        assertNull(rentalSlot?.price)
        assertEquals(
            true,
            rentalSlot?.sourceType?.startsWith("BRACKETIQ_TEMPLATE_RENTAL_RESOURCE:"),
        )

        val regularSlot = result.timeSlots?.last()
        assertEquals(listOf("regular-field"), regularSlot?.scheduledFieldIds)
        assertEquals("regular-field", regularSlot?.scheduledFieldId)
    }

    private fun fixedIds(vararg ids: String): () -> String {
        var index = 0
        return {
            ids.getOrNull(index++) ?: error("No id at index ${index - 1}")
        }
    }

    private fun slot(
        id: String,
        scheduledFieldIds: List<String>,
        divisions: List<String> = listOf("division-a"),
    ): TimeSlot =
        TimeSlot(
            id = id,
            dayOfWeek = 8,
            daysOfWeek = listOf(8, 1),
            divisions = divisions,
            startTimeMinutes = 600,
            endTimeMinutes = 660,
            startDate = Instant.parse("2026-06-22T16:00:00Z"),
            timeZone = "UTC",
            repeating = true,
            endDate = Instant.parse("2026-06-22T17:00:00Z"),
            scheduledFieldId = scheduledFieldIds.firstOrNull(),
            scheduledFieldIds = scheduledFieldIds,
            price = null,
        )
}
