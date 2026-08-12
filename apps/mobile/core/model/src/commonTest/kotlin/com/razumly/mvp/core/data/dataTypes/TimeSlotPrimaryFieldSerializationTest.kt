package com.razumly.mvp.core.data.dataTypes

import kotlin.test.Test
import kotlin.test.assertEquals

class TimeSlotPrimaryFieldSerializationTest {
    @Test
    fun given_multiple_scheduled_fields_when_decoded_then_explicit_primary_field_is_preserved() {
        val slot = TimeSlotDTO(
            id = "slot-1",
            startDate = "2026-08-10T10:00:00Z",
            scheduledFieldId = "field-primary",
            scheduledFieldIds = listOf("field-secondary", "field-primary"),
        ).toTimeSlot("slot-1")

        assertEquals("field-primary", slot.scheduledFieldId)
        assertEquals(listOf("field-secondary", "field-primary"), slot.scheduledFieldIds)
    }
}
