package com.razumly.mvp.core.presentation.composables

import androidx.compose.material3.ExperimentalMaterial3Api
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@OptIn(ExperimentalMaterial3Api::class)
class PastOrFutureSelectableDatesTest {

    @Test
    fun given_dob_policy_when_android_date_picker_checks_dates_then_future_dates_are_disabled() {
        val today = LocalDate.now(ZoneId.systemDefault())
        val selectableDates = PastOrFutureSelectableDates(
            canSelectPast = true,
            canSelectFuture = false,
        )

        assertTrue(selectableDates.isSelectableDate(today.asPickerUtcMillis()))
        assertTrue(selectableDates.isSelectableDate(today.minusDays(1).asPickerUtcMillis()))
        assertFalse(selectableDates.isSelectableDate(today.plusDays(1).asPickerUtcMillis()))
        assertFalse(selectableDates.isSelectableYear(today.year + 1))
    }

    private fun LocalDate.asPickerUtcMillis(): Long =
        atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
}
