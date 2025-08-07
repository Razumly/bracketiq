package com.razumly.mvp.core.presentation.composables

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.Calendar
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalMaterial3Api::class, ExperimentalTime::class)
@Composable
actual fun PlatformDateTimePicker(
    onDateSelected: (Instant?) -> Unit,
    onDismissRequest: () -> Unit,
    showPicker: Boolean,
    getTime: Boolean,
    canSelectPast: Boolean,
) {
    if (showPicker) {
        var showDatePicker by remember { mutableStateOf(true) }
        var showTimePicker by remember { mutableStateOf(false) }
        var selectedDate by remember { mutableStateOf<LocalDate?>(null) }

        val currentCalendar = Calendar.getInstance()
        val timeState = rememberTimePickerState(
            initialHour = currentCalendar.get(Calendar.HOUR_OF_DAY),
            initialMinute = currentCalendar.get(Calendar.MINUTE),
            is24Hour = true
        )

        if (showDatePicker) {
            val datePickerState = rememberDatePickerState(
                initialSelectedDateMillis = System.currentTimeMillis(),
                selectableDates = PastOrFutureSelectableDates(canSelectPast)
            )

            DatePickerDialog(
                onDismissRequest = onDismissRequest,
                confirmButton = {
                    TextButton(onClick = {
                        datePickerState.selectedDateMillis?.let { millis ->
                            // ✅ FIXED: Proper timezone handling for date conversion
                            selectedDate = java.time.Instant.ofEpochMilli(millis)
                                .atZone(ZoneOffset.UTC) // DatePicker uses UTC
                                .toLocalDate()
                        }
                        showDatePicker = false

                        if (getTime) {
                            showTimePicker = true
                        } else {
                            // Return just the date at start of day as kotlin.time.Instant
                            selectedDate?.let { date ->
                                val javaInstant = date.atStartOfDay(ZoneId.systemDefault()).toInstant()
                                val kotlinInstant = Instant.fromEpochMilliseconds(javaInstant.toEpochMilli())
                                onDateSelected(kotlinInstant)
                            }
                            onDismissRequest()
                        }
                    }) {
                        Text("OK")
                    }
                },
                dismissButton = {
                    TextButton(onClick = onDismissRequest) {
                        Text("Cancel")
                    }
                }
            ) {
                DatePicker(state = datePickerState)
            }
        }

        if (showTimePicker) {
            AlertDialog(
                onDismissRequest = {
                    showTimePicker = false
                    onDismissRequest()
                },
                dismissButton = {
                    TextButton(onClick = onDismissRequest) {
                        Text("Cancel")
                    }
                },
                confirmButton = {
                    TextButton(onClick = {
                        selectedDate?.let { date ->
                            val time = LocalTime.of(timeState.hour, timeState.minute)
                            val dateTime = LocalDateTime.of(date, time)

                            // Convert to java.time.Instant, then to kotlin.time.Instant
                            val javaInstant = dateTime.atZone(ZoneId.systemDefault()).toInstant()
                            val kotlinInstant = Instant.fromEpochMilliseconds(javaInstant.toEpochMilli())
                            onDateSelected(kotlinInstant)
                        }
                        onDismissRequest()
                    }) {
                        Text("OK")
                    }
                },
                text = {
                    TimePicker(state = timeState)
                }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
class PastOrFutureSelectableDates(private val canSelectPast: Boolean) : SelectableDates {
    override fun isSelectableDate(utcTimeMillis: Long): Boolean {
        if (!canSelectPast) {
            // ✅ FIXED: Compare UTC dates directly since DatePicker works in UTC
            val selectedDateUTC = java.time.Instant.ofEpochMilli(utcTimeMillis)
                .atZone(ZoneOffset.UTC)
                .toLocalDate()
            val todayUTC = LocalDate.now(ZoneId.systemDefault())

            return selectedDateUTC >= todayUTC
        }
        return true
    }

    override fun isSelectableYear(year: Int): Boolean {
        if (!canSelectPast) {
            return year >= LocalDate.now().year && year <= LocalDate.now().year + 2
        }
        return true
    }
}
