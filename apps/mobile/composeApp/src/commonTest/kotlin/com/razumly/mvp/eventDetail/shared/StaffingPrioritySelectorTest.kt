package com.razumly.mvp.eventDetail.shared

import com.razumly.mvp.core.data.dataTypes.StaffingPriority
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class StaffingPrioritySelectorTest {

    @Test
    fun given_staffing_priorities_when_built_then_each_priority_has_one_description() {
        val choices = staffingPriorityChoices()

        assertEquals(StaffingPriority.entries, choices.map { choice -> choice.priority })
        assertEquals(choices.size, choices.map { choice -> choice.title }.distinct().size)
        assertTrue(choices.all { choice -> choice.description.isNotBlank() })
    }
}
