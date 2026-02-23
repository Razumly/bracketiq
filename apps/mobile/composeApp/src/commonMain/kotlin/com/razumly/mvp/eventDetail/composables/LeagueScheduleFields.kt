package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import kotlin.math.min

private const val MAX_VISIBLE_FIELD_ROWS = 5
private const val MAX_VISIBLE_SLOT_ROWS = 2
private val fieldListItemSpacing = 4.dp
private val slotListItemSpacing = 8.dp
private val fieldRowMinHeight = 84.dp
private val slotListMaxHeight = 760.dp

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
    slotDivisionOptions: List<DropdownOption> = emptyList(),
    lockSlotDivisions: Boolean = false,
    lockedDivisionIds: List<String> = emptyList(),
    fieldCountError: String? = null,
) {
    var fieldsExpanded by rememberSaveable { mutableStateOf(true) }
    var slotsExpanded by rememberSaveable { mutableStateOf(true) }

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
        val visibleFieldRows = min(fields.size, MAX_VISIBLE_FIELD_ROWS)
        val fieldListMaxHeight = (fieldRowMinHeight * visibleFieldRows) +
            (fieldListItemSpacing * (visibleFieldRows - 1).coerceAtLeast(0))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { fieldsExpanded = !fieldsExpanded },
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Fields (${fields.size})", style = MaterialTheme.typography.titleMedium)
            IconButton(onClick = { fieldsExpanded = !fieldsExpanded }) {
                Icon(
                    imageVector = if (fieldsExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = if (fieldsExpanded) "Collapse fields" else "Expand fields",
                )
            }
        }
        if (fieldsExpanded) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = fieldListMaxHeight),
                verticalArrangement = Arrangement.spacedBy(fieldListItemSpacing),
            ) {
                itemsIndexed(fields, key = { _, field -> field.id }) { index, field ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = fieldRowMinHeight),
                    ) {
                        TextInputField(
                            modifier = Modifier.fillMaxWidth(),
                            value = field.name ?: "",
                            label = "Field ${field.fieldNumber} Name",
                            onValueChange = { onFieldNameChange(index, it) },
                            isError = false,
                        )
                    }
                }
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
        Text("Weekly Timeslots (${slots.size})", style = MaterialTheme.typography.titleMedium)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Button(onClick = onAddSlot) {
                Icon(Icons.Default.Add, contentDescription = null)
                Text("Add", modifier = Modifier.padding(start = 4.dp))
            }
            IconButton(onClick = { slotsExpanded = !slotsExpanded }) {
                Icon(
                    imageVector = if (slotsExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = if (slotsExpanded) "Collapse timeslots" else "Expand timeslots",
                )
            }
        }
    }

    if (slots.isEmpty()) {
        Text(
            text = "Add at least one timeslot for league scheduling.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }

    if (slotsExpanded) {
        if (slots.size <= MAX_VISIBLE_SLOT_ROWS) {
            Column(verticalArrangement = Arrangement.spacedBy(slotListItemSpacing)) {
                slots.forEachIndexed { index, slot ->
                    TimeslotCard(
                        index = index,
                        slot = slot,
                        slots = slots,
                        fieldOptions = fieldOptions,
                        slotDivisionOptions = slotDivisionOptions,
                        lockSlotDivisions = lockSlotDivisions,
                        lockedDivisionIds = lockedDivisionIds,
                        slotErrors = slotErrors,
                        onUpdateSlot = onUpdateSlot,
                        onRemoveSlot = onRemoveSlot,
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = slotListMaxHeight),
                verticalArrangement = Arrangement.spacedBy(slotListItemSpacing),
            ) {
                itemsIndexed(slots, key = { index, slot -> "${slot.id}:$index" }) { index, slot ->
                    TimeslotCard(
                        index = index,
                        slot = slot,
                        slots = slots,
                        fieldOptions = fieldOptions,
                        slotDivisionOptions = slotDivisionOptions,
                        lockSlotDivisions = lockSlotDivisions,
                        lockedDivisionIds = lockedDivisionIds,
                        slotErrors = slotErrors,
                        onUpdateSlot = onUpdateSlot,
                        onRemoveSlot = onRemoveSlot,
                    )
                }
            }
        }
    }
}

@Composable
private fun TimeslotCard(
    index: Int,
    slot: TimeSlot,
    slots: List<TimeSlot>,
    fieldOptions: List<DropdownOption>,
    slotDivisionOptions: List<DropdownOption>,
    lockSlotDivisions: Boolean,
    lockedDivisionIds: List<String>,
    slotErrors: Map<Int, String>,
    onUpdateSlot: (Int, TimeSlot) -> Unit,
    onRemoveSlot: (Int) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val selectedDays = slot.normalizedDaysOfWeek()
            val selectedFieldIds = slot.normalizedScheduledFieldIds()
            val normalizedLockedDivisionIds = lockedDivisionIds.normalizeDivisionIdentifiers()
            val selectedDivisionIds = slot.normalizedDivisionIds().normalizeDivisionIdentifiers()
            val effectiveDivisionIds = if (lockSlotDivisions && normalizedLockedDivisionIds.isNotEmpty()) {
                normalizedLockedDivisionIds
            } else {
                selectedDivisionIds
            }
            val divisionOptionsForSlot = (
                slotDivisionOptions +
                    effectiveDivisionIds.map { divisionId ->
                        DropdownOption(value = divisionId, label = divisionId.toDivisionDisplayLabel())
                    }
                ).associateBy(DropdownOption::value)
                .values
                .toList()
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
                selectedValue = "",
                onSelectionChange = {},
                options = fieldOptions,
                label = "Fields",
                placeholder = "Select fields",
                multiSelect = true,
                selectedValues = selectedFieldIds,
                onMultiSelectionChange = { selected ->
                    val normalized = selected
                        .map(String::trim)
                        .filter(String::isNotBlank)
                        .distinct()
                    onUpdateSlot(index, slot.copy(
                        scheduledFieldId = normalized.firstOrNull(),
                        scheduledFieldIds = normalized,
                    ))
                },
                isError = selectedFieldIds.isEmpty(),
            )

            PlatformDropdown(
                selectedValue = "",
                onSelectionChange = {},
                options = divisionOptionsForSlot,
                label = "Divisions",
                placeholder = "Select one or more divisions",
                multiSelect = true,
                selectedValues = effectiveDivisionIds,
                onMultiSelectionChange = { selected ->
                    if (lockSlotDivisions) {
                        return@PlatformDropdown
                    }
                    onUpdateSlot(
                        index,
                        slot.copy(divisions = selected.normalizeDivisionIdentifiers())
                    )
                },
                supportingText = if (lockSlotDivisions) {
                    "Single division is enabled, so every timeslot uses all selected event divisions."
                } else {
                    ""
                },
                enabled = !lockSlotDivisions,
            )

            PlatformDropdown(
                selectedValue = "",
                onSelectionChange = {},
                options = dayOptions,
                label = "Days of Week",
                placeholder = "Select days",
                multiSelect = true,
                selectedValues = selectedDays.map(Int::toString),
                onMultiSelectionChange = { selected ->
                    val days = selected
                        .mapNotNull(String::toIntOrNull)
                        .map { ((it % 7) + 7) % 7 }
                        .distinct()
                        .sorted()
                    onUpdateSlot(
                        index,
                        slot.copy(
                            dayOfWeek = days.firstOrNull(),
                            daysOfWeek = days,
                        )
                    )
                },
                isError = selectedDays.isEmpty(),
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
