package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
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
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.util.Platform
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.toLocalDateTime
import kotlin.math.min
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private const val MAX_VISIBLE_FIELD_ROWS = 5
private const val MAX_VISIBLE_SLOT_ROWS = 2
private const val MAX_PICKER_MINUTES = 23 * 60 + 59
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

internal data class PickerTimeValue(
    val hour: Int,
    val minute: Int,
)

internal fun minutesToPickerTime(minutes: Int?): PickerTimeValue {
    if (minutes == null) {
        return PickerTimeValue(hour = 12, minute = 0)
    }
    val normalizedMinutes = minutes.coerceIn(0, MAX_PICKER_MINUTES)
    return PickerTimeValue(
        hour = normalizedMinutes / 60,
        minute = normalizedMinutes % 60,
    )
}

@Composable
fun LeagueScheduleFields(
    fieldCount: Int,
    fields: List<Field>,
    slots: List<TimeSlot>,
    eventStart: Instant,
    eventEnd: Instant? = null,
    onFieldCountChange: (Int) -> Unit,
    onFieldNameChange: (Int, String) -> Unit,
    onAddSlot: () -> Unit,
    onUpdateSlot: (Int, TimeSlot) -> Unit,
    onRemoveSlot: (Int) -> Unit,
    slotErrors: Map<Int, String>,
    showSlotEditor: Boolean,
    showUseManualTimeSlotsToggle: Boolean = false,
    useManualTimeSlots: Boolean = true,
    onUseManualTimeSlotsChange: (Boolean) -> Unit = {},
    slotDivisionOptions: List<DropdownOption> = emptyList(),
    lockSlotDivisions: Boolean = false,
    lockedDivisionIds: List<String> = emptyList(),
    fieldCountError: String? = null,
    readOnly: Boolean = false,
) {
    var fieldsExpanded by rememberSaveable { mutableStateOf(true) }
    var slotsExpanded by rememberSaveable { mutableStateOf(true) }
    var pendingFieldCountInput by rememberSaveable(fieldCount) {
        mutableStateOf(if (fieldCount <= 0) "" else fieldCount.toString())
    }
    val parsedPendingFieldCount = pendingFieldCountInput.toIntOrNull()
    val canApplyFieldCount = parsedPendingFieldCount != null &&
        parsedPendingFieldCount > 0 &&
        parsedPendingFieldCount != fieldCount

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        StandardTextField(
            modifier = Modifier.weight(1f),
            value = pendingFieldCountInput,
            onValueChange = { value ->
                if (value.all(Char::isDigit)) {
                    pendingFieldCountInput = value
                }
            },
            label = "Field Count",
            placeholder = "Enter number of fields",
            keyboardType = "number",
            enabled = !readOnly,
            isError = fieldCountError != null,
            supportingText = fieldCountError ?: "Enter a value and tap Set Count.",
        )
        Button(
            modifier = Modifier.padding(top = 8.dp),
            onClick = {
                val count = parsedPendingFieldCount ?: return@Button
                onFieldCountChange(count)
            },
            enabled = !readOnly && canApplyFieldCount,
        ) {
            Text("Set Count")
        }
    }

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
                            enabled = !readOnly,
                        )
                    }
                }
            }
        }
    }

    if (!showSlotEditor && !showUseManualTimeSlotsToggle) {
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
    HorizontalDivider(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp, bottom = 8.dp),
        color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.75f),
    )

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Timeslots (${slots.size})", style = MaterialTheme.typography.titleMedium)
        if (showSlotEditor) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Button(
                    onClick = onAddSlot,
                    enabled = !readOnly,
                ) {
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
    }
    if (showUseManualTimeSlotsToggle) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(
                checked = useManualTimeSlots,
                enabled = !readOnly,
                onCheckedChange = onUseManualTimeSlotsChange,
            )
            Text(
                text = "Use timeslots",
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        if (!useManualTimeSlots) {
            Text(
                text = "A single timeslot will use the event start and end date/time.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
    if (readOnly) {
        Text(
            text = "Timeslots are fixed by the selected rental fields.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    if (!showSlotEditor) {
        return
    }

    if (slots.isEmpty()) {
        Text(
            text = if (readOnly) {
                "No rental timeslots were provided."
            } else {
                "Add at least one timeslot for league scheduling."
            },
            style = MaterialTheme.typography.bodySmall,
            color = if (readOnly) {
                MaterialTheme.colorScheme.onSurfaceVariant
            } else {
                MaterialTheme.colorScheme.error
            },
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
                        eventStart = eventStart,
                        eventEnd = eventEnd,
                        fieldOptions = fieldOptions,
                        slotDivisionOptions = slotDivisionOptions,
                        lockSlotDivisions = lockSlotDivisions,
                        lockedDivisionIds = lockedDivisionIds,
                        slotErrors = slotErrors,
                        onUpdateSlot = onUpdateSlot,
                        onRemoveSlot = onRemoveSlot,
                        readOnly = readOnly,
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
                        eventStart = eventStart,
                        eventEnd = eventEnd,
                        fieldOptions = fieldOptions,
                        slotDivisionOptions = slotDivisionOptions,
                        lockSlotDivisions = lockSlotDivisions,
                        lockedDivisionIds = lockedDivisionIds,
                        slotErrors = slotErrors,
                        onUpdateSlot = onUpdateSlot,
                        onRemoveSlot = onRemoveSlot,
                        readOnly = readOnly,
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
    eventStart: Instant,
    eventEnd: Instant?,
    fieldOptions: List<DropdownOption>,
    slotDivisionOptions: List<DropdownOption>,
    lockSlotDivisions: Boolean,
    lockedDivisionIds: List<String>,
    slotErrors: Map<Int, String>,
    onUpdateSlot: (Int, TimeSlot) -> Unit,
    onRemoveSlot: (Int) -> Unit,
    readOnly: Boolean,
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
            val repeating = slot.repeating
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
                    enabled = !readOnly && slots.size > 1,
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
                    if (readOnly) {
                        return@PlatformDropdown
                    }
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
                enabled = !readOnly,
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
                    if (readOnly || lockSlotDivisions) {
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
                enabled = !readOnly && !lockSlotDivisions,
            )

            if (repeating) {
                val repeatingStartDate = slot.startDate.takeUnless { it == Instant.DISTANT_PAST } ?: eventStart
                DatePickerField(
                    label = "Start Date (Optional)",
                    value = repeatingStartDate,
                    onDateSelected = { selected ->
                        onUpdateSlot(index, slot.copy(startDate = selected))
                    },
                    supportingText = "Defaults to the event start date.",
                    enabled = !readOnly,
                )
                if (!readOnly && repeatingStartDate != eventStart) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                    ) {
                        TextButton(onClick = { onUpdateSlot(index, slot.copy(startDate = eventStart)) }) {
                            Text("Use event start date")
                        }
                    }
                }

                OptionalDatePickerField(
                    label = "End Date (Optional)",
                    value = slot.endDate,
                    onDateSelected = { selected ->
                        onUpdateSlot(index, slot.copy(endDate = selected))
                    },
                    supportingText = "Leave empty for no end date.",
                    enabled = !readOnly,
                )
                if (!readOnly && slot.endDate != null) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                    ) {
                        TextButton(onClick = { onUpdateSlot(index, slot.copy(endDate = null)) }) {
                            Text("Clear end date")
                        }
                    }
                }

                PlatformDropdown(
                    selectedValue = "",
                    onSelectionChange = {},
                    options = dayOptions,
                    label = "Days of Week",
                    placeholder = "Select days",
                    multiSelect = true,
                    selectedValues = selectedDays.map(Int::toString),
                    onMultiSelectionChange = { selected ->
                        if (readOnly) {
                            return@PlatformDropdown
                        }
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
                    enabled = !readOnly,
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
                        enabled = !readOnly,
                    )
                    TimeOfDayPickerField(
                        label = "End Time",
                        minutes = slot.endTimeMinutes,
                        onMinutesSelected = { minutes ->
                            onUpdateSlot(index, slot.copy(endTimeMinutes = minutes))
                        },
                        modifier = Modifier.weight(1f),
                        isError = slot.endTimeMinutes == null ||
                            (
                                slot.startTimeMinutes != null &&
                                    slot.endTimeMinutes <= slot.startTimeMinutes
                                ),
                        enabled = !readOnly,
                    )
                }
            } else {
                DateTimePickerField(
                    label = "Start Date & Time",
                    value = slot.startDate.takeUnless { it == Instant.DISTANT_PAST },
                    onDateTimeSelected = { selected ->
                        onUpdateSlot(index, slot.copy(startDate = selected))
                    },
                    isError = slot.startDate == Instant.DISTANT_PAST,
                    enabled = !readOnly,
                )
                DateTimePickerField(
                    label = "End Date & Time",
                    value = slot.endDate,
                    onDateTimeSelected = { selected ->
                        onUpdateSlot(index, slot.copy(endDate = selected))
                    },
                    isError = slot.endDate == null || slot.endDate <= slot.startDate,
                    enabled = !readOnly,
                )
            }

            if (!readOnly) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    TextButton(onClick = {
                        onUpdateSlot(index, slot.toggleRepeating(eventStart = eventStart, eventEnd = eventEnd))
                    }) {
                        Text(if (slot.repeating) "Repeats weekly" else "One-time slot")
                    }
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

@OptIn(ExperimentalTime::class)
private fun TimeSlot.toggleRepeating(eventStart: Instant, eventEnd: Instant?): TimeSlot {
    return if (repeating) {
        toOneTimeSlot(eventStart = eventStart, eventEnd = eventEnd)
    } else {
        toRepeatingSlot(eventStart = eventStart, eventEnd = eventEnd)
    }
}

@OptIn(ExperimentalTime::class)
private fun TimeSlot.toOneTimeSlot(eventStart: Instant, eventEnd: Instant?): TimeSlot {
    val baselineDate = startDate.takeUnless { it == Instant.DISTANT_PAST } ?: eventStart
    val startInstant = startTimeMinutes?.let { baselineDate.withMinutesOfDay(it) } ?: baselineDate
    val fallbackEnd = when {
        endDate != null && endDate > startInstant -> endDate
        endTimeMinutes != null && startTimeMinutes != null && endTimeMinutes > startTimeMinutes ->
            baselineDate.withMinutesOfDay(endTimeMinutes)
        eventEnd != null && eventEnd > startInstant -> eventEnd
        else -> Instant.fromEpochMilliseconds(startInstant.toEpochMilliseconds() + 60L * 60L * 1000L)
    }
    val day = startInstant.toMondayFirstDay()
    return copy(
        repeating = false,
        dayOfWeek = day,
        daysOfWeek = listOf(day),
        startDate = startInstant,
        endDate = fallbackEnd,
        startTimeMinutes = startInstant.toMinutesOfDay(),
        endTimeMinutes = fallbackEnd.toMinutesOfDay(),
    )
}

@OptIn(ExperimentalTime::class)
private fun TimeSlot.toRepeatingSlot(eventStart: Instant, eventEnd: Instant?): TimeSlot {
    val effectiveStart = startDate.takeUnless { it == Instant.DISTANT_PAST } ?: eventStart
    val day = effectiveStart.toMondayFirstDay()
    val resolvedStartMinutes = startTimeMinutes ?: effectiveStart.toMinutesOfDay()
    val resolvedEndDate = (endDate ?: eventEnd)?.toDateOnlyInstant()
    val resolvedEndMinutes = endTimeMinutes ?: resolvedEndDate?.toMinutesOfDay()
    return copy(
        repeating = true,
        dayOfWeek = day,
        daysOfWeek = listOf(day),
        startDate = effectiveStart,
        endDate = resolvedEndDate,
        startTimeMinutes = resolvedStartMinutes,
        endTimeMinutes = resolvedEndMinutes,
    )
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalTime::class)
@Composable
private fun TimeOfDayPickerField(
    label: String,
    minutes: Int?,
    onMinutesSelected: (Int) -> Unit,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
    enabled: Boolean = true,
) {
    var showTimePicker by remember { mutableStateOf(false) }
    var showNativeTimePicker by remember { mutableStateOf(false) }
    val initialPickerTime = minutesToPickerTime(minutes)
    val timeState = rememberTimePickerState(
        initialHour = initialPickerTime.hour,
        initialMinute = initialPickerTime.minute,
        is24Hour = false,
    )
    LaunchedEffect(minutes) {
        val pickerTime = minutesToPickerTime(minutes)
        timeState.hour = pickerTime.hour
        timeState.minute = pickerTime.minute
    }

    StandardTextField(
        value = minutes?.toTimeLabel() ?: "Select time",
        onValueChange = {},
        modifier = modifier,
        label = label,
        enabled = enabled,
        readOnly = true,
        isError = isError,
        trailingIcon = {
            IconButton(
                enabled = enabled,
                onClick = {
                    if (!enabled) {
                        return@IconButton
                    }
                    if (Platform.isIOS) {
                        showNativeTimePicker = true
                    } else {
                        showTimePicker = true
                    }
                },
            ) {
                Icon(Icons.Default.AccessTime, contentDescription = "Select time")
            }
        },
        onTap = {
            if (enabled) {
                if (Platform.isIOS) {
                    showNativeTimePicker = true
                } else {
                    showTimePicker = true
                }
            }
        },
    )

    if (showNativeTimePicker) {
        PlatformDateTimePicker(
            onDateSelected = { selected ->
                selected?.let { selectedInstant ->
                    val localTime = selectedInstant.toLocalDateTime(TimeZone.currentSystemDefault()).time
                    onMinutesSelected(localTime.hour * 60 + localTime.minute)
                }
                showNativeTimePicker = false
            },
            onDismissRequest = { showNativeTimePicker = false },
            showPicker = showNativeTimePicker,
            getTime = true,
            showDate = false,
            canSelectPast = true,
            initialDate = minutes?.toTodayInstant(),
        )
    }

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

@OptIn(ExperimentalTime::class)
@Composable
private fun DatePickerField(
    label: String,
    value: Instant,
    onDateSelected: (Instant) -> Unit,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
    supportingText: String = "",
    enabled: Boolean = true,
) {
    var showPicker by remember { mutableStateOf(false) }
    StandardTextField(
        value = value.toDateLabel(),
        onValueChange = {},
        modifier = modifier,
        label = label,
        enabled = enabled,
        readOnly = true,
        isError = isError,
        supportingText = supportingText,
        trailingIcon = {
            IconButton(
                enabled = enabled,
                onClick = {
                    if (enabled) {
                        showPicker = true
                    }
                },
            ) {
                Icon(Icons.Default.DateRange, contentDescription = "Select date")
            }
        },
        onTap = {
            if (enabled) {
                showPicker = true
            }
        },
    )
    if (showPicker) {
        PlatformDateTimePicker(
            onDateSelected = { selected ->
                selected?.let(onDateSelected)
                showPicker = false
            },
            onDismissRequest = { showPicker = false },
            showPicker = showPicker,
            getTime = false,
            canSelectPast = true,
            initialDate = value,
        )
    }
}

@OptIn(ExperimentalTime::class)
@Composable
private fun OptionalDatePickerField(
    label: String,
    value: Instant?,
    onDateSelected: (Instant?) -> Unit,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
    supportingText: String = "",
    enabled: Boolean = true,
) {
    var showPicker by remember { mutableStateOf(false) }
    StandardTextField(
        value = value?.toDateLabel() ?: "",
        onValueChange = {},
        modifier = modifier,
        label = label,
        placeholder = "Optional",
        enabled = enabled,
        readOnly = true,
        isError = isError,
        supportingText = supportingText,
        trailingIcon = {
            IconButton(
                enabled = enabled,
                onClick = {
                    if (enabled) {
                        showPicker = true
                    }
                },
            ) {
                Icon(Icons.Default.DateRange, contentDescription = "Select date")
            }
        },
        onTap = {
            if (enabled) {
                showPicker = true
            }
        },
    )
    if (showPicker) {
        PlatformDateTimePicker(
            onDateSelected = { selected ->
                onDateSelected(selected)
                showPicker = false
            },
            onDismissRequest = { showPicker = false },
            showPicker = showPicker,
            getTime = false,
            canSelectPast = true,
            initialDate = value ?: Clock.System.now(),
        )
    }
}

@OptIn(ExperimentalTime::class)
@Composable
private fun DateTimePickerField(
    label: String,
    value: Instant?,
    onDateTimeSelected: (Instant) -> Unit,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
    enabled: Boolean = true,
) {
    var showPicker by remember { mutableStateOf(false) }
    StandardTextField(
        value = value?.toDateTimeLabel() ?: "Select date and time",
        onValueChange = {},
        modifier = modifier,
        label = label,
        enabled = enabled,
        readOnly = true,
        isError = isError,
        trailingIcon = {
            IconButton(
                enabled = enabled,
                onClick = {
                    if (enabled) {
                        showPicker = true
                    }
                },
            ) {
                Icon(Icons.Default.DateRange, contentDescription = "Select date and time")
            }
        },
        onTap = {
            if (enabled) {
                showPicker = true
            }
        },
    )
    if (showPicker) {
        PlatformDateTimePicker(
            onDateSelected = { selected ->
                selected?.let(onDateTimeSelected)
                showPicker = false
            },
            onDismissRequest = { showPicker = false },
            showPicker = showPicker,
            getTime = true,
            canSelectPast = true,
            initialDate = value,
        )
    }
}

@OptIn(ExperimentalTime::class)
private fun Int.toTodayInstant(): Instant {
    val timezone = TimeZone.currentSystemDefault()
    val nowLocalDate = Clock.System.now().toLocalDateTime(timezone).date
    val startOfToday = nowLocalDate.atStartOfDayIn(timezone)
    return Instant.fromEpochMilliseconds(
        startOfToday.toEpochMilliseconds() + this.toLong() * 60_000L
    )
}

@OptIn(ExperimentalTime::class)
private fun Instant.toDateLabel(): String = this.toLocalDateTime(TimeZone.currentSystemDefault()).date.toString()

@OptIn(ExperimentalTime::class)
private fun Instant.toDateTimeLabel(): String {
    val local = this.toLocalDateTime(TimeZone.currentSystemDefault())
    val minutes = local.time.hour * 60 + local.time.minute
    return "${local.date} ${minutes.toTimeLabel()}"
}

@OptIn(ExperimentalTime::class)
private fun Instant.withMinutesOfDay(minutes: Int): Instant {
    val timezone = TimeZone.currentSystemDefault()
    val localDate = this.toLocalDateTime(timezone).date
    val clampedMinutes = minutes.coerceIn(0, 23 * 60 + 59)
    val startOfDay = localDate.atStartOfDayIn(timezone)
    return Instant.fromEpochMilliseconds(
        startOfDay.toEpochMilliseconds() + clampedMinutes.toLong() * 60_000L
    )
}

@OptIn(ExperimentalTime::class)
private fun Instant.toMinutesOfDay(): Int {
    val localTime = this.toLocalDateTime(TimeZone.currentSystemDefault()).time
    return localTime.hour * 60 + localTime.minute
}

@OptIn(ExperimentalTime::class)
private fun Instant.toDateOnlyInstant(): Instant {
    val timezone = TimeZone.currentSystemDefault()
    val localDate = this.toLocalDateTime(timezone).date
    return localDate.atStartOfDayIn(timezone)
}

@OptIn(ExperimentalTime::class)
private fun Instant.toMondayFirstDay(): Int {
    val isoDay = this.toLocalDateTime(TimeZone.currentSystemDefault()).date.dayOfWeek.isoDayNumber
    return (isoDay - 1).mod(7)
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
