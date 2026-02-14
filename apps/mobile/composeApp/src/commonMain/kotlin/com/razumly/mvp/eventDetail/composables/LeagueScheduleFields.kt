package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.PlatformTextField

private val dayOptions = listOf(
    DropdownOption("0", "Monday"),
    DropdownOption("1", "Tuesday"),
    DropdownOption("2", "Wednesday"),
    DropdownOption("3", "Thursday"),
    DropdownOption("4", "Friday"),
    DropdownOption("5", "Saturday"),
    DropdownOption("6", "Sunday"),
)

@Composable
fun ColumnScope.LeagueScheduleFields(
    fieldCount: Int,
    fields: List<Field>,
    slots: List<TimeSlot>,
    onFieldCountChange: (Int) -> Unit,
    onFieldNameChange: (Int, String) -> Unit,
    onAddSlot: () -> Unit,
    onUpdateSlot: (Int, TimeSlot) -> Unit,
    onRemoveSlot: (Int) -> Unit,
    slotErrors: Map<Int, String>,
    showSlotEditor: Boolean,
    fieldCountError: String? = null,
) {
    PlatformTextField(
        value = if (fieldCount <= 0) "" else fieldCount.toString(),
        onValueChange = { value ->
            if (value.all(Char::isDigit)) {
                onFieldCountChange(value.toIntOrNull() ?: 0)
            }
        },
        label = "Field Count",
        placeholder = "Enter number of fields",
        keyboardType = "number",
        isError = fieldCountError != null,
        supportingText = fieldCountError ?: "Fields are created with the names below.",
    )

    if (fields.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            fields.forEachIndexed { index, field ->
                TextInputField(
                    value = field.name ?: "",
                    label = "Field ${field.fieldNumber} Name",
                    onValueChange = { onFieldNameChange(index, it) },
                    isError = false,
                )
            }
        }
    }

    if (!showSlotEditor) {
        return
    }

    val fieldOptions = remember(fields) {
        fields.map { field ->
            DropdownOption(
                value = field.id,
                label = field.name?.takeIf(String::isNotBlank) ?: "Field ${field.fieldNumber}",
            )
        }
    }

    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Weekly Timeslots", style = MaterialTheme.typography.titleMedium)
        Button(onClick = onAddSlot) {
            Icon(Icons.Default.Add, contentDescription = null)
            Text("Add", modifier = Modifier.padding(start = 4.dp))
        }
    }

    if (slots.isEmpty()) {
        Text(
            text = "Add at least one timeslot for league scheduling.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        slots.forEachIndexed { index, slot ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Timeslot ${index + 1}", style = MaterialTheme.typography.titleSmall)
                        IconButton(
                            onClick = { onRemoveSlot(index) },
                            enabled = slots.size > 1,
                        ) {
                            Icon(Icons.Default.Delete, contentDescription = "Remove timeslot")
                        }
                    }

                    PlatformDropdown(
                        selectedValue = slot.scheduledFieldId.orEmpty(),
                        onSelectionChange = { selected ->
                            onUpdateSlot(index, slot.copy(scheduledFieldId = selected.ifBlank { null }))
                        },
                        options = fieldOptions,
                        label = "Field",
                        placeholder = "Select a field",
                        isError = slot.scheduledFieldId.isNullOrBlank(),
                    )

                    PlatformDropdown(
                        selectedValue = slot.dayOfWeek?.toString().orEmpty(),
                        onSelectionChange = { selected ->
                            onUpdateSlot(index, slot.copy(dayOfWeek = selected.toIntOrNull()))
                        },
                        options = dayOptions,
                        label = "Day of Week",
                        placeholder = "Select a day",
                        isError = slot.dayOfWeek == null,
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        TimeOfDayPickerField(
                            label = "Start Time",
                            minutes = slot.startTimeMinutes,
                            onMinutesSelected = { minutes ->
                                onUpdateSlot(index, slot.copy(startTimeMinutes = minutes))
                            },
                            modifier = Modifier.weight(1f),
                            isError = slot.startTimeMinutes == null,
                        )
                        TimeOfDayPickerField(
                            label = "End Time",
                            minutes = slot.endTimeMinutes,
                            onMinutesSelected = { minutes ->
                                onUpdateSlot(index, slot.copy(endTimeMinutes = minutes))
                            },
                            modifier = Modifier.weight(1f),
                            isError = slot.endTimeMinutes == null,
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                    ) {
                        TextButton(onClick = { onUpdateSlot(index, slot.copy(repeating = !slot.repeating)) }) {
                            Text(if (slot.repeating) "Repeats weekly" else "One-time slot")
                        }
                    }

                    slotErrors[index]?.let { error ->
                        Text(
                            text = error,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimeOfDayPickerField(
    label: String,
    minutes: Int?,
    onMinutesSelected: (Int) -> Unit,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
) {
    var showTimePicker by remember { mutableStateOf(false) }
    val timeState = rememberTimePickerState(
        initialHour = minutes?.div(60) ?: 12,
        initialMinute = minutes?.rem(60) ?: 0,
        is24Hour = false,
    )
    LaunchedEffect(minutes) {
        minutes?.let {
            timeState.hour = it / 60
            timeState.minute = it % 60
        }
    }

    PlatformTextField(
        value = minutes?.toTimeLabel() ?: "Select time",
        onValueChange = {},
        modifier = modifier,
        label = label,
        readOnly = true,
        isError = isError,
        trailingIcon = {
            IconButton(onClick = { showTimePicker = true }) {
                Icon(Icons.Default.AccessTime, contentDescription = "Select time")
            }
        },
        onTap = { showTimePicker = true },
    )

    if (showTimePicker) {
        AlertDialog(
            onDismissRequest = { showTimePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    onMinutesSelected(timeState.hour * 60 + timeState.minute)
                    showTimePicker = false
                }) {
                    Text("OK")
                }
            },
            dismissButton = {
                TextButton(onClick = { showTimePicker = false }) {
                    Text("Cancel")
                }
            },
            text = {
                TimePicker(state = timeState)
            },
        )
    }
}

private fun Int.toTimeLabel(): String {
    val hour24 = this / 60
    val minutes = this % 60
    val amPm = if (hour24 < 12) "AM" else "PM"
    val hour12 = when (val mod = hour24 % 12) {
        0 -> 12
        else -> mod
    }
    return "$hour12:${minutes.toString().padStart(2, '0')} $amPm"
}
