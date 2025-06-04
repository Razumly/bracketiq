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
import com.raedghazal.kotlinx_datetime_ext.now
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime

@OptIn(ExperimentalMaterial3Api::class)
@Composable
actual fun PlatformDateTimePicker(
    onDateSelected: (Instant?) -> Unit,
    onDismissRequest: () -> Unit,
    showPicker: Boolean
) {
    if (showPicker){
        var showDatePicker by remember { mutableStateOf(true) }
        var showTimePicker by remember { mutableStateOf(false) }
        var selectedDateMillis by remember { mutableStateOf<Long?>(null) }
        val timeState = rememberTimePickerState(
            initialHour = LocalDateTime.now().hour,
            initialMinute = LocalDateTime.now().minute,
            is24Hour = true
        )
        val timeZone = TimeZone.currentSystemDefault()

        if (showDatePicker) {
            val datePickerState = rememberDatePickerState(
                initialSelectedDateMillis = System.currentTimeMillis(),
                selectableDates = PastOrPresentSelectableDates,
            )

            DatePickerDialog(
                onDismissRequest = onDismissRequest,
                confirmButton = {
                    TextButton(
                        onClick = {
                            selectedDateMillis = datePickerState.selectedDateMillis
                            showDatePicker = false
                            showTimePicker = true
                        }
                    ) {
                        Text("OK")
                    }
                },
                dismissButton = {
                    TextButton(onClick = onDismissRequest) { Text("Cancel") }
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
                    TextButton(onClick = onDismissRequest) { Text("Cancel") }
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            selectedDateMillis?.let { dateMillis ->
                                // Combine as local date and time, convert to UTC
                                val instant = combineLocalDateTimeAndConvertToUtc(
                                    dateMillis = dateMillis,
                                    hour = timeState.hour,
                                    minute = timeState.minute,
                                    timeZone = timeZone
                                )
                                onDateSelected(instant)
                            }
                            onDismissRequest()
                        }
                    ) {
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

fun combineLocalDateTimeAndConvertToUtc(
    dateMillis: Long,
    hour: Int,
    minute: Int,
    timeZone: TimeZone
): Instant {
    val localDate = Instant.fromEpochMilliseconds(dateMillis)
        .toLocalDateTime(timeZone)
        .date
    val localDateTime = LocalDateTime(localDate, LocalTime(hour, minute))
    return localDateTime.toInstant(timeZone)
}

@OptIn(ExperimentalMaterial3Api::class)
object PastOrPresentSelectableDates: SelectableDates {
    override fun isSelectableDate(utcTimeMillis: Long): Boolean {
        return utcTimeMillis >= System.currentTimeMillis()
    }

    override fun isSelectableYear(year: Int): Boolean {
        return year >= LocalDate.now().year && year <= LocalDate.now().year + 2
    }
}