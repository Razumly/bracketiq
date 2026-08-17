package com.razumly.mvp.core.presentation.composables

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.days
import kotlin.time.Instant

class PlatformDatePickerPolicyTest {

    private val today = 20_000L

    @Test
    fun given_dob_policy_when_selecting_a_date_then_only_past_and_today_are_allowed() {
        assertTrue(
            isPlatformDateSelectable(
                selectedEpochDay = today - 1,
                todayEpochDay = today,
                canSelectPast = true,
                canSelectFuture = false,
            ),
        )
        assertTrue(
            isPlatformDateSelectable(
                selectedEpochDay = today,
                todayEpochDay = today,
                canSelectPast = true,
                canSelectFuture = false,
            ),
        )
        assertFalse(
            isPlatformDateSelectable(
                selectedEpochDay = today + 1,
                todayEpochDay = today,
                canSelectPast = true,
                canSelectFuture = false,
            ),
        )
    }

    @Test
    fun given_existing_future_picker_policy_when_selecting_a_future_date_then_it_stays_allowed() {
        assertTrue(
            isPlatformDateSelectable(
                selectedEpochDay = today + 1,
                todayEpochDay = today,
                canSelectPast = false,
                canSelectFuture = true,
            ),
        )
        assertFalse(
            isPlatformDateSelectable(
                selectedEpochDay = today - 1,
                todayEpochDay = today,
                canSelectPast = false,
                canSelectFuture = true,
            ),
        )
    }

    @Test
    fun given_dob_policy_when_resolving_native_picker_maximum_then_today_is_the_upper_bound() {
        val now = Instant.parse("2026-07-12T15:30:00Z")

        assertEquals(
            now,
            platformDatePickerMaximumDate(
                now = now,
                canSelectFuture = false,
            ),
        )
        assertEquals(
            now + (2 * 365).days,
            platformDatePickerMaximumDate(
                now = now,
                canSelectFuture = true,
            ),
        )
    }
}
