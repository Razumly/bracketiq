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
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalMaterial3Api::class, ExperimentalTime::class)
@Composable
actual fun PlatformDateTimePicker(
    onDateSelected: (Instant?) -> Unit,
    onDismissRequest: () -> Unit,
    showPicker: Boolean,
    getTime: Boolean,
    showDate: Boolean,
    canSelectPast: Boolean,
    canSelectFuture: Boolean,
    initialDate: Instant?,
) {
    if (showPicker) {
        var showDatePicker by remember(showDate) { mutableStateOf(showDate) }
        var showTimePicker by remember(showDate, getTime) { mutableStateOf(!showDate && getTime) }
        val nowMillis = System.currentTimeMillis()
        val initialMillis = initialDate?.toEpochMilliseconds() ?: nowMillis
        val clampedInitialMillis = when {
            !canSelectPast && initialMillis < nowMillis -> nowMillis
            !canSelectFuture && initialMillis > nowMillis -> nowMillis
            else -> initialMillis
        }
        val initialDateTime = java.time.Instant.ofEpochMilli(clampedInitialMillis)
            .atZone(ZoneId.systemDefault())
            .toLocalDateTime()
        var selectedDate by remember(clampedInitialMillis) {
            mutableStateOf(initialDateTime.toLocalDate())
        }
        val initialDatePickerMillis = remember(selectedDate) {
            selectedDate.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        }

        val timeState = rememberTimePickerState(
            initialHour = initialDateTime.hour,
            initialMinute = initialDateTime.minute,
            is24Hour = false
        )

        if (showDatePicker) {
            val datePickerState = rememberDatePickerState(
                initialSelectedDateMillis = initialDatePickerMillis,
                selectableDates = PastOrFutureSelectableDates(
                    canSelectPast = canSelectPast,
                    canSelectFuture = canSelectFuture,
                )
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

        if (showTimePicker && getTime) {
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
class PastOrFutureSelectableDates(
    private val canSelectPast: Boolean,
    private val canSelectFuture: Boolean = true,
) : SelectableDates {
    override fun isSelectableDate(utcTimeMillis: Long): Boolean {
        // DatePicker supplies a UTC calendar date. Compare calendar days rather
        // than instants so the local current date is always selectable.
        val selectedDateUtc = java.time.Instant.ofEpochMilli(utcTimeMillis)
            .atZone(ZoneOffset.UTC)
            .toLocalDate()
        val today = LocalDate.now(ZoneId.systemDefault())

        return isPlatformDateSelectable(
            selectedEpochDay = selectedDateUtc.toEpochDay(),
            todayEpochDay = today.toEpochDay(),
            canSelectPast = canSelectPast,
            canSelectFuture = canSelectFuture,
        )
    }

    override fun isSelectableYear(year: Int): Boolean {
        val currentYear = LocalDate.now().year
        if (!canSelectPast && year < currentYear) return false
        if (!canSelectFuture && year > currentYear) return false

        // Preserve the existing future scheduling picker ceiling when past dates
        // are disallowed. DOB callers allow past dates and therefore keep all
        // historical years available.
        return canSelectPast || year <= currentYear + 2
    }
}
