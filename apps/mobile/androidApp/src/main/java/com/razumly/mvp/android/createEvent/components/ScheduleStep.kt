package com.razumly.mvp.android.createEvent.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.android.instantToDateTimeString
import com.razumly.mvp.eventCreate.presentation.CreateEventViewModel
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScheduleStep(viewModel: CreateEventViewModel) {
    var startDate by remember { mutableStateOf<Instant?>(null) }
    var endDate by remember { mutableStateOf<Instant?>(null) }
    var showStartDatePicker by remember { mutableStateOf(false) }
    var showStartTimePicker by remember { mutableStateOf(false) }
    var showEndDatePicker by remember { mutableStateOf(false) }
    var showEndTimePicker by remember { mutableStateOf(false) }
    val startDatePickerState = rememberDatePickerState()
    val endDatePickerState = rememberDatePickerState()

    Column(
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Start Date/Time Section
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "Start Date & Time",
                style = MaterialTheme.typography.titleMedium
            )

            OutlinedButton(
                onClick = { showStartDatePicker = true },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    startDate?.let { instantToDateTimeString(it) } ?: "Select Start Date"
                )
            }

            OutlinedButton(
                onClick = { showStartTimePicker = true },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    startDate?.let { instantToDateTimeString(it) } ?: "Select Start Time"
                )
            }
        }

        // End Date/Time Section
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "End Date & Time",
                style = MaterialTheme.typography.titleMedium
            )

            OutlinedButton(
                onClick = { showEndDatePicker = true },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    endDate?.let { instantToDateTimeString(it) } ?: "Select End Date"
                )
            }

            OutlinedButton(
                onClick = { showEndTimePicker = true },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    endDate?.let { instantToDateTimeString(it) } ?: "Select End Time"
                )
            }
        }
    }

    // Date Pickers
    if (showStartDatePicker) {
        DatePickerDialog(
            onDismissRequest = { showStartDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    startDatePickerState.selectedDateMillis?.let { millis ->
                        startDate = Instant.fromEpochMilliseconds(millis)
                        if (endDate != null) {
                            viewModel.updateTournamentDates(startDate!!, endDate!!)
                        }
                    }
                    showStartDatePicker = false
                }) {
                    Text("OK")
                }
            },
            dismissButton = {
                TextButton(onClick = { showStartDatePicker = false }) {
                    Text("Cancel")
                }
            }
        ) {
            DatePicker(
                state = startDatePickerState,
                modifier = Modifier.padding(16.dp)
            )
        }
    }

    if (showEndDatePicker) {
        DatePickerDialog(
            onDismissRequest = { showEndDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    endDatePickerState.selectedDateMillis?.let { millis ->
                        endDate = Instant.fromEpochMilliseconds(millis)
                        if (startDate != null) {
                            viewModel.updateTournamentDates(startDate!!, endDate!!)
                        }
                    }
                    showEndDatePicker = false
                }) {
                    Text("OK")
                }
            },
            dismissButton = {
                TextButton(onClick = { showEndDatePicker = false }) {
                    Text("Cancel")
                }
            }
        ) {
            DatePicker(
                state = endDatePickerState,
                modifier = Modifier.padding(16.dp)
            )
        }
    }
}