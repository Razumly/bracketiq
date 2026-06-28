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
import androidx.compose.material3.CardDefaults
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
import com.razumly.mvp.core.data.repositories.RentalResourceOption
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.util.Platform
import com.razumly.mvp.core.util.toTimeZoneOrUtc
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.toInstant
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

private data class ResourceListItem(
    val index: Int,
    val field: Field,
)

private data class FacilityResourceGroup(
    val key: String,
    val label: String,
    val description: String?,
    val hasFacility: Boolean,
    val resources: List<ResourceListItem>,
)

private data class RentalResourceListItem(
    val option: RentalResourceOption,
)

private data class FacilityRentalResourceGroup(
    val key: String,
    val label: String,
    val description: String?,
    val resources: List<RentalResourceListItem>,
)

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

private fun String?.cleanLabel(): String? = this
    ?.trim()
    ?.takeIf(String::isNotBlank)

private fun Field.resourceLabel(): String {
    val rawLabel = name.cleanLabel() ?: "Resource $fieldNumber"
    val facility = facilityLabel() ?: return rawLabel
    val separators = listOf(" - ", " – ", ": ", " / ")
    val redundantPrefix = separators.firstOrNull { separator ->
        rawLabel.startsWith("$facility$separator", ignoreCase = true)
    } ?: return rawLabel
    return rawLabel
        .drop(facility.length + redundantPrefix.length)
        .trim()
        .takeIf(String::isNotBlank)
        ?: rawLabel
}

private fun Field.facilityLabel(): String? {
    return facility?.name.cleanLabel()
        ?: facility?.location.cleanLabel()
        ?: facility?.address.cleanLabel()
}

private fun Field.facilityDescription(): String? {
    return facility?.address.cleanLabel()
        ?: facility?.location.cleanLabel()
        ?: location.cleanLabel()
}

private fun Field.facilityGroupKey(): String {
    return facilityId.cleanLabel()
        ?: facility?.resolvedId?.cleanLabel()
        ?: facilityLabel()
        ?: "ungrouped"
}

private fun buildFacilityResourceGroups(fields: List<Field>): List<FacilityResourceGroup> {
    return fields
        .mapIndexed { index, field -> ResourceListItem(index = index, field = field) }
        .groupBy { item -> item.field.facilityGroupKey() }
        .map { (key, resources) ->
            val firstField = resources.firstOrNull()?.field
            val facilityLabel = firstField?.facilityLabel()
            FacilityResourceGroup(
                key = key,
                label = facilityLabel ?: "Resources",
                description = firstField?.facilityDescription(),
                hasFacility = facilityLabel != null || firstField?.facilityId.cleanLabel() != null,
                resources = resources.sortedBy { item -> item.field.resourceLabel().lowercase() },
            )
        }
        .sortedWith(compareBy<FacilityResourceGroup> { !it.hasFacility }.thenBy { it.label.lowercase() })
}

private fun buildFacilityRentalResourceGroups(options: List<RentalResourceOption>): List<FacilityRentalResourceGroup> {
    return options
        .map { option -> RentalResourceListItem(option = option) }
        .groupBy { item -> item.option.field.facilityGroupKey() }
        .map { (key, resources) ->
            val firstOption = resources.firstOrNull()?.option
            val firstField = firstOption?.field
            FacilityRentalResourceGroup(
                key = key,
                label = firstField?.facilityLabel()
                    ?: firstOption?.organizationName.cleanLabel()
                    ?: "Rented resources",
                description = firstField?.facilityDescription(),
                resources = resources.sortedWith(
                    compareBy<RentalResourceListItem> { item -> item.option.field.resourceLabel().lowercase() }
                        .thenBy { item -> item.option.start }
                ),
            )
        }
        .sortedBy { group -> group.label.lowercase() }
}

private fun TimeSlot.isRentalBacked(): Boolean =
    rentalLocked == true ||
        !rentalBookingId.isNullOrBlank() ||
        sourceType?.trim()?.equals("RENTAL_BOOKING", ignoreCase = true) == true

private fun TimeSlot.matchesRentalWindow(option: RentalResourceOption): Boolean =
    !repeating &&
        startDate == option.start &&
        endDate == option.end

private fun TimeSlot.matchesRentalResource(option: RentalResourceOption): Boolean =
    rentalBookingItemId == option.bookingItemId || matchesRentalWindow(option)

private fun TimeSlot.primaryRentalFieldIds(options: List<RentalResourceOption>): List<String> {
    val matchingOptionFieldIds = options
        .filter { option -> matchesRentalResource(option) }
        .map { option -> option.field.id.trim() }
        .filter(String::isNotBlank)
    val fallbackFieldId = scheduledFieldId?.trim()?.takeIf(String::isNotBlank)
    return (matchingOptionFieldIds + listOfNotNull(fallbackFieldId)).distinct()
}

private fun buildFieldOptionsForSlot(
    slot: TimeSlot,
    baseOptions: List<DropdownOption>,
    rentalOptionsByFieldId: Map<String, RentalResourceOption>,
): List<DropdownOption> {
    if (!slot.isRentalBacked()) {
        return baseOptions.map { option ->
            if (rentalOptionsByFieldId.containsKey(option.value)) {
                option.copy(enabled = false)
            } else {
                option
            }
        }
    }
    val primaryRentalFieldIds = slot.primaryRentalFieldIds(rentalOptionsByFieldId.values.toList()).toSet()
    return baseOptions.map { option ->
        val rentalOption = rentalOptionsByFieldId[option.value]
        val enabled = when {
            rentalOption == null -> option.enabled
            primaryRentalFieldIds.contains(option.value) -> false
            slot.matchesRentalResource(rentalOption) -> option.enabled
            else -> false
        }
        option.copy(enabled = enabled)
    }
}

private fun normalizeSlotFieldSelection(
    slot: TimeSlot,
    selected: List<String>,
    rentalOptionsByFieldId: Map<String, RentalResourceOption>,
): List<String> {
    val normalized = selected
        .map(String::trim)
        .filter(String::isNotBlank)
        .distinct()
    if (!slot.isRentalBacked()) {
        return normalized.filterNot { fieldId -> rentalOptionsByFieldId.containsKey(fieldId) }
    }
    val primaryRentalFieldIds = slot.primaryRentalFieldIds(rentalOptionsByFieldId.values.toList())
    val allowed = normalized.filter { fieldId ->
        val rentalOption = rentalOptionsByFieldId[fieldId]
        rentalOption == null || slot.matchesRentalResource(rentalOption)
    }
    return (primaryRentalFieldIds + allowed).distinct()
}

private fun RentalResourceOption.rentalTimeLabel(timeZone: TimeZone): String {
    val startLocal = start.toLocalDateTime(timeZone)
    val endLocal = end.toLocalDateTime(timeZone)
    fun timeText(value: kotlinx.datetime.LocalTime): String {
        val hour = value.hour
        val displayHour = when {
            hour == 0 -> 12
            hour > 12 -> hour - 12
            else -> hour
        }
        val minute = value.minute.toString().padStart(2, '0')
        val suffix = if (hour >= 12) "PM" else "AM"
        return "$displayHour:$minute $suffix"
    }
    val date = startLocal.date
    val dateText = "${date.monthNumber}/${date.dayOfMonth}/${date.year}"
    return "$dateText ${timeText(startLocal.time)} - ${timeText(endLocal.time)}"
}

@Composable
fun LeagueScheduleFields(
    fieldCount: Int,
    fields: List<Field>,
    slots: List<TimeSlot>,
    availableRentalResources: List<RentalResourceOption> = emptyList(),
    selectedRentalResourceIds: Set<String> = emptySet(),
    onRentalResourceSelectionChange: (String, Boolean) -> Unit = { _, _ -> },
    eventStart: Instant,
    eventEnd: Instant? = null,
    eventTimeZone: TimeZone = TimeZone.currentSystemDefault(),
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
    showSlotDivisions: Boolean = true,
    lockSlotDivisions: Boolean = false,
    lockedDivisionIds: List<String> = emptyList(),
    allowDivisionEditsWhenReadOnly: Boolean = false,
    allowLocalResourceCreationWithRentalResources: Boolean = false,
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
    val resourceGroups = remember(fields) { buildFacilityResourceGroups(fields) }
    val rentalResourceGroups = remember(availableRentalResources) {
        buildFacilityRentalResourceGroups(availableRentalResources)
    }
    val hasRentalResourceOptions = availableRentalResources.isNotEmpty()
    val rentalOptionsByFieldId = remember(availableRentalResources) {
        availableRentalResources
            .mapNotNull { option ->
                option.field.id.trim().takeIf(String::isNotBlank)?.let { fieldId -> fieldId to option }
            }
            .toMap()
    }
    val rentalBackedFieldIds = remember(slots, availableRentalResources) {
        val selectedRentalFieldIds = availableRentalResources.map { option -> option.field.id.trim() }
        val slotPrimaryRentalFieldIds = slots
            .filter(TimeSlot::isRentalBacked)
            .flatMap { slot -> slot.primaryRentalFieldIds(availableRentalResources) }
        (selectedRentalFieldIds + slotPrimaryRentalFieldIds)
            .filter(String::isNotBlank)
            .toSet()
    }
    val showFacilityResourceGroups = resourceGroups.size > 1 || resourceGroups.any { group -> group.hasFacility }
    var expandedResourceGroupKeys by rememberSaveable(resourceGroups.joinToString("|") { it.key }) {
        mutableStateOf(resourceGroups.map { group -> group.key })
    }
    var expandedRentalResourceGroupKeys by rememberSaveable(rentalResourceGroups.joinToString("|") { it.key }) {
        mutableStateOf(rentalResourceGroups.map { group -> group.key })
    }
    val showResourceCountControls = !hasRentalResourceOptions || allowLocalResourceCreationWithRentalResources

    if (showResourceCountControls) {
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
                label = "Resource Count",
                placeholder = "Enter number of resources",
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
    }

    if (hasRentalResourceOptions) {
        RentalResourceGroupList(
            groups = rentalResourceGroups,
            selectedIds = selectedRentalResourceIds,
            expandedKeys = expandedRentalResourceGroupKeys,
            onToggleGroup = { groupKey ->
                expandedRentalResourceGroupKeys = if (groupKey in expandedRentalResourceGroupKeys) {
                    expandedRentalResourceGroupKeys - groupKey
                } else {
                    expandedRentalResourceGroupKeys + groupKey
                }
            },
            enabled = !readOnly,
            onSelectionChange = onRentalResourceSelectionChange,
        )
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
            Text("Resources (${fields.size})", style = MaterialTheme.typography.titleMedium)
            IconButton(onClick = { fieldsExpanded = !fieldsExpanded }) {
                Icon(
                    imageVector = if (fieldsExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = if (fieldsExpanded) "Collapse resources" else "Expand resources",
                )
            }
        }
        if (fieldsExpanded) {
            if (showFacilityResourceGroups) {
                FacilityResourceGroupList(
                    groups = resourceGroups,
                    expandedKeys = expandedResourceGroupKeys,
                    onToggleGroup = { groupKey ->
                        expandedResourceGroupKeys = if (groupKey in expandedResourceGroupKeys) {
                            expandedResourceGroupKeys - groupKey
                        } else {
                            expandedResourceGroupKeys + groupKey
                        }
                    },
                    readOnly = readOnly,
                    rentalBackedFieldIds = rentalBackedFieldIds,
                    onFieldNameChange = onFieldNameChange,
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = fieldListMaxHeight),
                    verticalArrangement = Arrangement.spacedBy(fieldListItemSpacing),
                ) {
                    itemsIndexed(fields, key = { _, field -> field.id }) { index, field ->
                        ResourceRow(
                            item = ResourceListItem(index = index, field = field),
                            readOnly = readOnly || rentalBackedFieldIds.contains(field.id),
                            onFieldNameChange = onFieldNameChange,
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
                label = field.resourceLabel(),
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
            text = "Timeslots are fixed by the selected rental resources.",
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
                            eventTimeZone = eventTimeZone,
                            fieldOptions = fieldOptions,
                            rentalOptionsByFieldId = rentalOptionsByFieldId,
                            slotDivisionOptions = slotDivisionOptions,
                            showSlotDivisions = showSlotDivisions,
                            lockSlotDivisions = lockSlotDivisions,
                        lockedDivisionIds = lockedDivisionIds,
                        allowDivisionEditsWhenReadOnly = allowDivisionEditsWhenReadOnly,
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
                            eventTimeZone = eventTimeZone,
                            fieldOptions = fieldOptions,
                            rentalOptionsByFieldId = rentalOptionsByFieldId,
                            slotDivisionOptions = slotDivisionOptions,
                            showSlotDivisions = showSlotDivisions,
                            lockSlotDivisions = lockSlotDivisions,
                        lockedDivisionIds = lockedDivisionIds,
                        allowDivisionEditsWhenReadOnly = allowDivisionEditsWhenReadOnly,
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
private fun FacilityResourceGroupList(
    groups: List<FacilityResourceGroup>,
    expandedKeys: List<String>,
    onToggleGroup: (String) -> Unit,
    readOnly: Boolean,
    rentalBackedFieldIds: Set<String>,
    onFieldNameChange: (Int, String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(fieldListItemSpacing)) {
        groups.forEach { group ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    val expanded = group.key in expandedKeys
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onToggleGroup(group.key) },
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(group.label, style = MaterialTheme.typography.titleSmall)
                            val summary = buildList {
                                add("${group.resources.size} resources")
                                group.description?.let(::add)
                            }.joinToString(" • ")
                            Text(
                                text = summary,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        IconButton(onClick = { onToggleGroup(group.key) }) {
                            Icon(
                                imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                contentDescription = if (expanded) "Collapse facility resources" else "Expand facility resources",
                            )
                        }
                    }

                    if (expanded) {
                        group.resources.forEach { item ->
                            ResourceRow(
                                item = item,
                                readOnly = readOnly || rentalBackedFieldIds.contains(item.field.id),
                                onFieldNameChange = onFieldNameChange,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RentalResourceGroupList(
    groups: List<FacilityRentalResourceGroup>,
    selectedIds: Set<String>,
    expandedKeys: List<String>,
    onToggleGroup: (String) -> Unit,
    enabled: Boolean,
    onSelectionChange: (String, Boolean) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(fieldListItemSpacing)) {
        Text("Rented resources", style = MaterialTheme.typography.titleMedium)
        groups.forEach { group ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    val expanded = group.key in expandedKeys
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onToggleGroup(group.key) },
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(group.label, style = MaterialTheme.typography.titleSmall)
                            val summary = buildList {
                                add("${group.resources.size} rentals")
                                group.description?.let(::add)
                            }.joinToString(" • ")
                            Text(
                                text = summary,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        IconButton(onClick = { onToggleGroup(group.key) }) {
                            Icon(
                                imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                contentDescription = if (expanded) "Collapse rented resources" else "Expand rented resources",
                            )
                        }
                    }

                    if (expanded) {
                        group.resources.forEach { item ->
                            RentalResourceRow(
                                item = item,
                                selected = selectedIds.contains(item.option.id),
                                enabled = enabled,
                                onSelectionChange = onSelectionChange,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RentalResourceRow(
    item: RentalResourceListItem,
    selected: Boolean,
    enabled: Boolean,
    onSelectionChange: (String, Boolean) -> Unit,
) {
    val option = item.option
    val rowTimeZone = remember(option.timeZone) {
        option.timeZone.toTimeZoneOrUtc(TimeZone.currentSystemDefault())
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled) { onSelectionChange(option.id, !selected) }
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Checkbox(
            checked = selected,
            enabled = enabled,
            onCheckedChange = { checked -> onSelectionChange(option.id, checked) },
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(option.field.resourceLabel(), style = MaterialTheme.typography.titleSmall)
            Text(
                text = option.rentalTimeLabel(rowTimeZone),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ResourceRow(
    item: ResourceListItem,
    readOnly: Boolean,
    onFieldNameChange: (Int, String) -> Unit,
) {
    val field = item.field
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = fieldRowMinHeight),
        verticalArrangement = Arrangement.Center,
    ) {
        if (readOnly) {
            Text(field.resourceLabel(), style = MaterialTheme.typography.titleSmall)
            field.location.cleanLabel()?.let { location ->
                Text(
                    text = location,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = "Rental resource",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            TextInputField(
                modifier = Modifier.fillMaxWidth(),
                value = field.name ?: "",
                label = "Resource ${field.fieldNumber} Name",
                onValueChange = { onFieldNameChange(item.index, it) },
                isError = false,
                enabled = true,
            )
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
    eventTimeZone: TimeZone,
    fieldOptions: List<DropdownOption>,
    rentalOptionsByFieldId: Map<String, RentalResourceOption>,
    slotDivisionOptions: List<DropdownOption>,
    showSlotDivisions: Boolean,
    lockSlotDivisions: Boolean,
    lockedDivisionIds: List<String>,
    allowDivisionEditsWhenReadOnly: Boolean,
    slotErrors: Map<Int, String>,
    onUpdateSlot: (Int, TimeSlot) -> Unit,
    onRemoveSlot: (Int) -> Unit,
    readOnly: Boolean,
) {
    val timeslotContainerColor = MaterialTheme.colorScheme.surfaceContainerLow
    val timeslotColorScheme = MaterialTheme.colorScheme.copy(
        surface = timeslotContainerColor,
        surfaceContainerLow = timeslotContainerColor,
        outline = timeslotContainerColor,
        outlineVariant = timeslotContainerColor,
    )
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = timeslotContainerColor),
    ) {
        MaterialTheme(colorScheme = timeslotColorScheme) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                val selectedDays = slot.normalizedDaysOfWeek()
                val selectedFieldIds = slot.normalizedScheduledFieldIds()
                val normalizedLockedDivisionIds = lockedDivisionIds.normalizeDivisionIdentifiers()
                val selectedDivisionIds = slot.normalizedDivisionIds().normalizeDivisionIdentifiers()
                val repeating = slot.repeating
                val slotTimeZone = slot.timeZone.toTimeZoneOrUtc(eventTimeZone)
                val slotIsRentalBacked = slot.isRentalBacked()
                val slotTimingReadOnly = readOnly || slotIsRentalBacked
                val slotResourceReadOnly = readOnly
                val fieldOptionsForSlot = remember(slot, fieldOptions, rentalOptionsByFieldId) {
                    buildFieldOptionsForSlot(slot, fieldOptions, rentalOptionsByFieldId)
                }
                val effectiveDivisionIds = if (lockSlotDivisions && normalizedLockedDivisionIds.isNotEmpty()) {
                    normalizedLockedDivisionIds
                } else {
                    selectedDivisionIds
                }
                val divisionsReadOnly = slotTimingReadOnly && !allowDivisionEditsWhenReadOnly
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
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Timeslot ${index + 1}", style = MaterialTheme.typography.titleSmall)
                        if (slotIsRentalBacked) {
                            Text(
                                text = "Rental",
                                color = MaterialTheme.colorScheme.primary,
                                style = MaterialTheme.typography.labelMedium,
                            )
                        }
                    }
                    IconButton(
                        onClick = { onRemoveSlot(index) },
                        enabled = !slotTimingReadOnly && slots.size > 1,
                    ) {
                        Icon(Icons.Default.Delete, contentDescription = "Remove timeslot")
                    }
                }

                PlatformDropdown(
                    selectedValue = "",
                    onSelectionChange = {},
                    options = fieldOptionsForSlot,
                    label = "Resources",
                    placeholder = "Select resources",
                    multiSelect = true,
                    selectedValues = selectedFieldIds,
                    onMultiSelectionChange = { selected ->
                        if (slotResourceReadOnly) {
                            return@PlatformDropdown
                        }
                        val normalized = normalizeSlotFieldSelection(slot, selected, rentalOptionsByFieldId)
                        onUpdateSlot(index, slot.copy(
                            scheduledFieldId = normalized.firstOrNull(),
                            scheduledFieldIds = normalized,
                        ))
                    },
                    isError = selectedFieldIds.isEmpty(),
                    supportingText = if (slotIsRentalBacked) {
                        "Rental date and time are locked. Add regular resources here; rentals with different times are disabled."
                    } else {
                        ""
                    },
                    enabled = !slotResourceReadOnly,
                )

                if (showSlotDivisions) {
                    PlatformDropdown(
                        selectedValue = "",
                        onSelectionChange = {},
                        options = divisionOptionsForSlot,
                        label = "Divisions",
                        placeholder = "Select one or more divisions",
                        multiSelect = true,
                        selectedValues = effectiveDivisionIds,
                        onMultiSelectionChange = { selected ->
                            if (divisionsReadOnly || lockSlotDivisions) {
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
                        enabled = !divisionsReadOnly && !lockSlotDivisions,
                    )
                }

                if (repeating) {
                    val repeatingStartDate = slot.startDate.takeUnless { it == Instant.DISTANT_PAST } ?: eventStart
                    DatePickerField(
                        label = "Start Date (Optional)",
                        value = repeatingStartDate,
                        onDateSelected = { selected ->
                            onUpdateSlot(index, slot.copy(startDate = selected))
                        },
                        timeZone = slotTimeZone,
                        supportingText = "Defaults to the event start date.",
                        enabled = !slotTimingReadOnly,
                    )
                    if (!slotTimingReadOnly && repeatingStartDate != eventStart) {
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
                        timeZone = slotTimeZone,
                        supportingText = "Leave empty for no end date.",
                        enabled = !slotTimingReadOnly,
                    )
                    if (!slotTimingReadOnly && slot.endDate != null) {
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
                            if (slotTimingReadOnly) {
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
                        enabled = !slotTimingReadOnly,
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
                            enabled = !slotTimingReadOnly,
                        )
                        TimeOfDayPickerField(
                            label = "End Time",
                            minutes = slot.endTimeMinutes,
                            onMinutesSelected = { minutes ->
                                onUpdateSlot(index, slot.copy(endTimeMinutes = minutes))
                            },
                            modifier = Modifier.weight(1f),
                            isError = run {
                                val startTimeMinutes = slot.startTimeMinutes
                                val endTimeMinutes = slot.endTimeMinutes
                                endTimeMinutes == null ||
                                    (
                                        startTimeMinutes != null &&
                                            endTimeMinutes <= startTimeMinutes
                                        )
                            },
                            enabled = !slotTimingReadOnly,
                        )
                    }
                } else {
                    DateTimePickerField(
                        label = "Start Date & Time",
                        value = slot.startDate.takeUnless { it == Instant.DISTANT_PAST },
                        onDateTimeSelected = { selected ->
                            onUpdateSlot(index, slot.copy(startDate = selected))
                        },
                        timeZone = slotTimeZone,
                        isError = slot.startDate == Instant.DISTANT_PAST,
                        enabled = !slotTimingReadOnly,
                    )
                    DateTimePickerField(
                        label = "End Date & Time",
                        value = slot.endDate,
                        onDateTimeSelected = { selected ->
                            onUpdateSlot(index, slot.copy(endDate = selected))
                        },
                        timeZone = slotTimeZone,
                        isError = slot.endDate?.let { endDate -> endDate <= slot.startDate } ?: true,
                        enabled = !slotTimingReadOnly,
                    )
                }

                if (!slotTimingReadOnly) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                    ) {
                        TextButton(onClick = {
                            onUpdateSlot(
                                index,
                                slot.toggleRepeating(
                                    eventStart = eventStart,
                                    eventEnd = eventEnd,
                                    eventTimeZone = eventTimeZone,
                                ),
                            )
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
}

@OptIn(ExperimentalTime::class)
private fun TimeSlot.toggleRepeating(
    eventStart: Instant,
    eventEnd: Instant?,
    eventTimeZone: TimeZone,
): TimeSlot {
    return if (repeating) {
        toOneTimeSlot(eventStart = eventStart, eventEnd = eventEnd, eventTimeZone = eventTimeZone)
    } else {
        toRepeatingSlot(eventStart = eventStart, eventEnd = eventEnd, eventTimeZone = eventTimeZone)
    }
}

@OptIn(ExperimentalTime::class)
private fun TimeSlot.toOneTimeSlot(
    eventStart: Instant,
    eventEnd: Instant?,
    eventTimeZone: TimeZone,
): TimeSlot {
    val slotTimeZone = timeZone.toTimeZoneOrUtc(eventTimeZone)
    val baselineDate = startDate.takeUnless { it == Instant.DISTANT_PAST } ?: eventStart
    val startInstant = startTimeMinutes?.let { baselineDate.withMinutesOfDay(it, slotTimeZone) } ?: baselineDate
    val currentEndDate = endDate
    val currentStartTimeMinutes = startTimeMinutes
    val currentEndTimeMinutes = endTimeMinutes
    val fallbackEnd = when {
        currentEndDate != null && currentEndDate > startInstant -> currentEndDate
        currentEndTimeMinutes != null &&
            currentStartTimeMinutes != null &&
            currentEndTimeMinutes > currentStartTimeMinutes ->
            baselineDate.withMinutesOfDay(currentEndTimeMinutes, slotTimeZone)
        eventEnd != null && eventEnd > startInstant -> eventEnd
        else -> Instant.fromEpochMilliseconds(startInstant.toEpochMilliseconds() + 60L * 60L * 1000L)
    }
    val day = startInstant.toMondayFirstDay(slotTimeZone)
    return copy(
        repeating = false,
        dayOfWeek = day,
        daysOfWeek = listOf(day),
        startDate = startInstant,
        endDate = fallbackEnd,
        startTimeMinutes = startInstant.toMinutesOfDay(slotTimeZone),
        endTimeMinutes = fallbackEnd.toMinutesOfDay(slotTimeZone),
    )
}

@OptIn(ExperimentalTime::class)
private fun TimeSlot.toRepeatingSlot(
    eventStart: Instant,
    eventEnd: Instant?,
    eventTimeZone: TimeZone,
): TimeSlot {
    val slotTimeZone = timeZone.toTimeZoneOrUtc(eventTimeZone)
    val effectiveStart = startDate.takeUnless { it == Instant.DISTANT_PAST } ?: eventStart
    val day = effectiveStart.toMondayFirstDay(slotTimeZone)
    val resolvedStartMinutes = startTimeMinutes ?: effectiveStart.toMinutesOfDay(slotTimeZone)
    val endSource = endDate ?: eventEnd
    val resolvedEndDate = endSource?.toDateOnlyInstant(slotTimeZone)
    val resolvedEndMinutes = endTimeMinutes ?: endSource?.toMinutesOfDay(slotTimeZone)
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
    timeZone: TimeZone,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
    supportingText: String = "",
    enabled: Boolean = true,
) {
    var showPicker by remember { mutableStateOf(false) }
    StandardTextField(
        value = value.toDateLabel(timeZone),
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
                selected?.reinterpretSystemLocalSelectionIn(timeZone)?.let(onDateSelected)
                showPicker = false
            },
            onDismissRequest = { showPicker = false },
            showPicker = showPicker,
            getTime = false,
            canSelectPast = true,
            initialDate = value.asSystemLocalPickerInstant(timeZone),
        )
    }
}

@OptIn(ExperimentalTime::class)
@Composable
private fun OptionalDatePickerField(
    label: String,
    value: Instant?,
    onDateSelected: (Instant?) -> Unit,
    timeZone: TimeZone,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
    supportingText: String = "",
    enabled: Boolean = true,
) {
    var showPicker by remember { mutableStateOf(false) }
    StandardTextField(
        value = value?.toDateLabel(timeZone) ?: "",
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
                onDateSelected(selected?.reinterpretSystemLocalSelectionIn(timeZone))
                showPicker = false
            },
            onDismissRequest = { showPicker = false },
            showPicker = showPicker,
            getTime = false,
            canSelectPast = true,
            initialDate = (value ?: Clock.System.now()).asSystemLocalPickerInstant(timeZone),
        )
    }
}

@OptIn(ExperimentalTime::class)
@Composable
private fun DateTimePickerField(
    label: String,
    value: Instant?,
    onDateTimeSelected: (Instant) -> Unit,
    timeZone: TimeZone,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
    enabled: Boolean = true,
) {
    var showPicker by remember { mutableStateOf(false) }
    StandardTextField(
        value = value?.toDateTimeLabel(timeZone) ?: "Select date and time",
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
                selected?.reinterpretSystemLocalSelectionIn(timeZone)?.let(onDateTimeSelected)
                showPicker = false
            },
            onDismissRequest = { showPicker = false },
            showPicker = showPicker,
            getTime = true,
            canSelectPast = true,
            initialDate = value?.asSystemLocalPickerInstant(timeZone),
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
private fun Instant.toDateLabel(timeZone: TimeZone): String = this.toLocalDateTime(timeZone).date.toString()

@OptIn(ExperimentalTime::class)
private fun Instant.toDateTimeLabel(timeZone: TimeZone): String {
    val local = this.toLocalDateTime(timeZone)
    val minutes = local.time.hour * 60 + local.time.minute
    return "${local.date} ${minutes.toTimeLabel()}"
}

@OptIn(ExperimentalTime::class)
private fun Instant.withMinutesOfDay(minutes: Int, timeZone: TimeZone): Instant {
    val localDate = this.toLocalDateTime(timeZone).date
    val clampedMinutes = minutes.coerceIn(0, 23 * 60 + 59)
    val startOfDay = localDate.atStartOfDayIn(timeZone)
    return Instant.fromEpochMilliseconds(
        startOfDay.toEpochMilliseconds() + clampedMinutes.toLong() * 60_000L
    )
}

@OptIn(ExperimentalTime::class)
private fun Instant.toMinutesOfDay(timeZone: TimeZone): Int {
    val localTime = this.toLocalDateTime(timeZone).time
    return localTime.hour * 60 + localTime.minute
}

@OptIn(ExperimentalTime::class)
private fun Instant.toDateOnlyInstant(timeZone: TimeZone): Instant {
    val localDate = this.toLocalDateTime(timeZone).date
    return localDate.atStartOfDayIn(timeZone)
}

@OptIn(ExperimentalTime::class)
private fun Instant.toMondayFirstDay(timeZone: TimeZone): Int {
    val isoDay = this.toLocalDateTime(timeZone).date.dayOfWeek.isoDayNumber
    return (isoDay - 1).mod(7)
}

@OptIn(ExperimentalTime::class)
private fun Instant.reinterpretSystemLocalSelectionIn(timeZone: TimeZone): Instant {
    val local = toLocalDateTime(TimeZone.currentSystemDefault())
    return LocalDateTime(local.date, local.time).toInstant(timeZone)
}

@OptIn(ExperimentalTime::class)
private fun Instant.asSystemLocalPickerInstant(timeZone: TimeZone): Instant {
    val local = toLocalDateTime(timeZone)
    return LocalDateTime(local.date, local.time).toInstant(TimeZone.currentSystemDefault())
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
