package com.razumly.mvp.eventCreate.presentation.steps

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.util.instantToDateTimeString
import com.razumly.mvp.eventCreate.presentation.CreateEventComponent
import kotlinx.datetime.Instant
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.end_date_time
import mvp.composeapp.generated.resources.select_end_date
import mvp.composeapp.generated.resources.select_end_time
import mvp.composeapp.generated.resources.select_start_date
import mvp.composeapp.generated.resources.select_start_time
import mvp.composeapp.generated.resources.start_date_time
import org.jetbrains.compose.resources.stringResource

@Composable
fun ScheduleStep(component: CreateEventComponent) {
    var startDate by remember { mutableStateOf<Instant?>(null) }
    var endDate by remember { mutableStateOf<Instant?>(null) }
    var showStartDatePicker by remember { mutableStateOf(false) }
    var showStartTimePicker by remember { mutableStateOf(false) }
    var showEndDatePicker by remember { mutableStateOf(false) }
    var showEndTimePicker by remember { mutableStateOf(false) }

    Column(
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Start Date/Time Section
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = stringResource(Res.string.start_date_time),
                style = MaterialTheme.typography.titleMedium
            )

            OutlinedButton(
                onClick = { showStartDatePicker = true },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    startDate?.let { instantToDateTimeString(it) } ?: stringResource(Res.string.select_start_date)
                )
            }

            OutlinedButton(
                onClick = { showStartTimePicker = true },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    startDate?.let { instantToDateTimeString(it) } ?: stringResource(Res.string.select_start_time)
                )
            }
        }

        // End Date/Time Section
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = stringResource(Res.string.end_date_time),
                style = MaterialTheme.typography.titleMedium
            )

            OutlinedButton(
                onClick = { showEndDatePicker = true },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    endDate?.let { instantToDateTimeString(it) } ?: stringResource(Res.string.select_end_date)
                )
            }

            OutlinedButton(
                onClick = { showEndTimePicker = true },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    endDate?.let { instantToDateTimeString(it) } ?: stringResource(Res.string.select_end_time)
                )
            }
        }
    }
//
//    // Date Pickers
//    if (showStartDatePicker) {
//        DatePickerDialog(
//            onDismissRequest = { showStartDatePicker = false },
//            confirmButton = {
//                TextButton(onClick = {
//                    startDatePickerState.selectedDateMillis?.let { millis ->
//                        startDate = Instant.fromEpochMilliseconds(millis)
//                        if (endDate != null) {
//                            component.updateTournamentDates(startDate!!, endDate!!)
//                        }
//                    }
//                    showStartDatePicker = false
//                }) {
//                    Text(stringResource(Res.string.ok))
//                }
//            },
//            dismissButton = {
//                TextButton(onClick = { showStartDatePicker = false }) {
//                    Text(stringResource(Res.string.cancel))
//                }
//            }
//        ) {
//            DatePicker(
//                state = startDatePickerState,
//                modifier = Modifier.padding(16.dp)
//            )
//        }
//    }
//
//    if (showEndDatePicker) {
//        DatePickerDialog(
//            onDismissRequest = { showEndDatePicker = false },
//            confirmButton = {
//                TextButton(onClick = {
//                    endDatePickerState.selectedDateMillis?.let { millis ->
//                        endDate = Instant.fromEpochMilliseconds(millis)
//                        if (startDate != null) {
//                            component.updateTournamentDates(startDate!!, endDate!!)
//                        }
//                    }
//                    showEndDatePicker = false
//                }) {
//                    Text(stringResource(Res.string.ok))
//                }
//            },
//            dismissButton = {
//                TextButton(onClick = { showEndDatePicker = false }) {
//                    Text(stringResource(Res.string.cancel))
//                }
//            }
//        ) {
//            DatePicker(
//                state = endDatePickerState,
//                modifier = Modifier.padding(16.dp)
//            )
//        }
//    }
}
