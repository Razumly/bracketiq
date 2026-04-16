package com.razumly.mvp.eventDetail.composables

import kotlin.test.Test
import kotlin.test.assertEquals

class LeagueScheduleFieldsTimePickerTest {

    @Test
    fun minutes_to_picker_time_defaults_null_to_noon() {
        assertEquals(PickerTimeValue(hour = 12, minute = 0), minutesToPickerTime(null))
    }

    @Test
    fun minutes_to_picker_time_clamps_negative_values_to_midnight() {
        assertEquals(PickerTimeValue(hour = 0, minute = 0), minutesToPickerTime(-15))
    }

    @Test
    fun minutes_to_picker_time_clamps_end_of_day_sentinel_to_last_picker_minute() {
        assertEquals(PickerTimeValue(hour = 23, minute = 59), minutesToPickerTime(24 * 60))
    }

    @Test
    fun minutes_to_picker_time_preserves_valid_values() {
        assertEquals(PickerTimeValue(hour = 10, minute = 30), minutesToPickerTime(10 * 60 + 30))
    }
}
