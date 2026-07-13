package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.repositories.RentalResourceOption
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant

class EventRentalResourcesCoordinatorTest {
    @Test
    fun loaded_resources_keep_available_ids_and_attach_existing_event_rentals() {
        val coordinator = EventRentalResourcesCoordinator()
        val option = rentalOption(
            id = "resource-1",
            bookingId = "booking-1",
            bookingItemId = "item-1",
            eventId = "event-1",
            field = field("rental-field"),
        )

        assertTrue(
            coordinator.applyLoadedResources(
                options = listOf(option, rentalOption(id = "resource-2")),
                slots = emptyList(),
                eventId = "event-1",
            ),
        )

        assertEquals(listOf(option, rentalOption(id = "resource-2")), coordinator.availableResources.value)
        assertEquals(setOf("resource-1"), coordinator.selectedResourceIds.value)
    }

    @Test
    fun selection_changes_only_when_option_exists_and_state_changes() {
        val coordinator = EventRentalResourcesCoordinator()
        coordinator.applyLoadedResources(
            options = listOf(rentalOption(id = "resource-1")),
            slots = emptyList(),
            eventId = "event-1",
        )

        assertFalse(coordinator.setSelected("missing", selected = true))
        assertTrue(coordinator.setSelected(" resource-1 ", selected = true))
        assertFalse(coordinator.setSelected("resource-1", selected = true))
        assertEquals(setOf("resource-1"), coordinator.selectedResourceIds.value)

        assertTrue(coordinator.setSelected("resource-1", selected = false))
        assertEquals(emptySet(), coordinator.selectedResourceIds.value)
    }

    @Test
    fun normalize_slot_selection_removes_rental_fields_from_regular_slots() {
        val coordinator = EventRentalResourcesCoordinator()
        coordinator.applyLoadedResources(
            options = listOf(rentalOption(id = "resource-1", field = field("rental-field"))),
            slots = emptyList(),
            eventId = "event-1",
        )

        val normalized = coordinator.normalizeSlotResourceSelection(
            slot = slot(
                id = "slot-1",
                scheduledFieldIds = listOf("custom-field", "rental-field"),
            ),
            validFieldIds = setOf("custom-field", "rental-field"),
        )

        assertEquals(listOf("custom-field"), normalized.normalizedScheduledFieldIds())
        assertEquals("custom-field", normalized.scheduledFieldId)
    }

    @Test
    fun edit_draft_merges_selected_rental_fields_and_slots_with_custom_resources() {
        val coordinator = EventRentalResourcesCoordinator()
        val rentalField = field("rental-field")
        val option = rentalOption(
            id = "resource-1",
            bookingId = "booking-1",
            bookingItemId = "item-1",
            field = rentalField,
            eventTimeSlotId = "server-slot-1",
            requiredTemplateIds = listOf(" template-1 ", "", "template-1"),
        )
        coordinator.applyLoadedResources(options = listOf(option), slots = emptyList(), eventId = "event-1")
        coordinator.setSelected("resource-1", selected = true)

        val customField = field("custom-field", fieldNumber = 3)
        val customSlot = slot(
            id = "custom-slot",
            scheduledFieldIds = listOf("custom-field", "rental-field"),
        )

        val draft = coordinator.buildEditDraft(
            event = Event(id = "event-1", timeZone = "UTC"),
            currentFields = listOf(customField),
            currentSlots = listOf(customSlot),
            defaultDivisionIds = listOf("division-a"),
        )

        assertEquals(listOf("rental-field", "custom-field"), draft.fields.map { field -> field.id })
        assertEquals(listOf(1, 2), draft.fields.map { field -> field.fieldNumber })
        assertEquals(listOf("custom-slot", "server-slot-1"), draft.timeSlots.map { slot -> slot.id })

        val rentalSlot = draft.timeSlots.first { slot -> slot.sourceType == "RENTAL_BOOKING" }
        assertEquals("RENTAL_BOOKING", rentalSlot.sourceType)
        assertEquals("booking-1", rentalSlot.rentalBookingId)
        assertEquals("item-1", rentalSlot.rentalBookingItemId)
        assertEquals(listOf("template-1"), rentalSlot.requiredTemplateIds)
        assertEquals(listOf("division-a"), rentalSlot.divisions)

        assertEquals(listOf("rental-field", "custom-field"), draft.event.fieldIds)
        assertEquals(listOf("custom-slot", "server-slot-1"), draft.event.timeSlotIds)
        assertEquals(listOf("custom-field"), draft.timeSlots.first().normalizedScheduledFieldIds())
    }

    @Test
    fun deselecting_rental_resource_removes_its_field_and_custom_slot_references() {
        val coordinator = EventRentalResourcesCoordinator()
        val rentalField = field("rental-field")
        val rentalOption = rentalOption(
            id = "resource-1",
            bookingId = "booking-1",
            bookingItemId = "item-1",
            field = rentalField,
            eventTimeSlotId = "rental-slot",
        )
        coordinator.applyLoadedResources(
            options = listOf(rentalOption),
            slots = emptyList(),
            eventId = "event-1",
        )
        coordinator.setSelected("resource-1", selected = true)
        coordinator.setSelected("resource-1", selected = false)

        val draft = coordinator.buildEditDraft(
            event = Event(id = "event-1", timeZone = "UTC"),
            currentFields = listOf(rentalField, field("custom-field", fieldNumber = 2)),
            currentSlots = listOf(
                slot(
                    id = "custom-slot",
                    scheduledFieldIds = listOf("rental-field", "custom-field"),
                ),
                slot(
                    id = "rental-slot",
                    scheduledFieldIds = listOf("rental-field"),
                    rentalBookingId = "booking-1",
                    rentalBookingItemId = "item-1",
                ),
            ),
            defaultDivisionIds = listOf("division-a"),
        )

        assertEquals(listOf("custom-field"), draft.fields.map { field -> field.id })
        assertEquals(listOf("custom-field"), draft.event.fieldIds)
        assertEquals(listOf("custom-slot"), draft.timeSlots.map { slot -> slot.id })
        assertEquals(listOf("custom-field"), draft.timeSlots.single().normalizedScheduledFieldIds())
    }

    private fun rentalOption(
        id: String,
        bookingId: String = "booking-$id",
        bookingItemId: String = "item-$id",
        eventId: String? = null,
        field: Field = field("field-$id"),
        eventTimeSlotId: String? = null,
        requiredTemplateIds: List<String> = emptyList(),
    ): RentalResourceOption =
        RentalResourceOption(
            id = id,
            bookingId = bookingId,
            bookingItemId = bookingItemId,
            organizationId = "org-1",
            field = field,
            start = Instant.parse("2026-06-22T16:00:00Z"),
            end = Instant.parse("2026-06-22T17:00:00Z"),
            timeZone = "UTC",
            priceCents = 1000,
            eventId = eventId,
            eventTimeSlotId = eventTimeSlotId,
            requiredTemplateIds = requiredTemplateIds,
        )

    private fun field(id: String, fieldNumber: Int = 1): Field =
        Field(
            id = id,
            fieldNumber = fieldNumber,
            name = id,
        )

    private fun slot(
        id: String,
        scheduledFieldIds: List<String>,
        rentalBookingId: String? = null,
        rentalBookingItemId: String? = null,
    ): TimeSlot =
        TimeSlot(
            id = id,
            dayOfWeek = 1,
            daysOfWeek = listOf(1),
            divisions = listOf("division-a"),
            startTimeMinutes = 600,
            endTimeMinutes = 660,
            startDate = Instant.parse("2026-06-22T16:00:00Z"),
            timeZone = "UTC",
            repeating = false,
            endDate = Instant.parse("2026-06-22T17:00:00Z"),
            scheduledFieldId = scheduledFieldIds.firstOrNull(),
            scheduledFieldIds = scheduledFieldIds,
            price = null,
            rentalBookingId = rentalBookingId,
            rentalBookingItemId = rentalBookingItemId,
        )
}
