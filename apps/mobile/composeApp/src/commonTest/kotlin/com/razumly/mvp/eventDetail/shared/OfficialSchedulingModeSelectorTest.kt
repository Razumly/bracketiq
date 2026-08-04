package com.razumly.mvp.eventDetail.shared

import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class OfficialSchedulingModeSelectorTest {

    @Test
    fun given_scheduling_choices_when_built_then_each_mode_has_one_description() {
        val choices = officialSchedulingModeChoices()

        assertEquals(OfficialSchedulingMode.entries, choices.map { choice -> choice.mode })
        assertEquals(choices.size, choices.map { choice -> choice.title }.distinct().size)
        assertTrue(choices.all { choice -> choice.description.isNotBlank() })
    }
}
