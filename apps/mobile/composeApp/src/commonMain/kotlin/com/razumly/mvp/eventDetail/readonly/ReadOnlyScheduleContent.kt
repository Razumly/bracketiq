package com.razumly.mvp.eventDetail.readonly

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.util.normalizeDivisionDetail
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.presentation.composables.NetworkAvatar
import com.razumly.mvp.core.presentation.composables.OrganizationVerificationBadge
import com.razumly.mvp.core.presentation.composables.PlayerCardWithActions
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.eventDetail.shared.DetailRowSpec
private const val MAX_READ_ONLY_NAME_LIST_ITEMS = 5
private val readOnlyNameListItemHeight = 28.dp
private val readOnlyNameListSpacing = 4.dp
@Composable
internal fun ScheduleTimeslotsReadOnlyList(
    slots: List<TimeSlot>,
    fieldsById: Map<String, Field>,
    divisionDetails: List<DivisionDetail>,
    fallbackDivisionIds: List<String>,
) {
    Spacer(modifier = Modifier.height(8.dp))
    Text(
        text = "Weekly timeslots",
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurface,
    )
    if (slots.isEmpty()) {
        Text(
            text = "No weekly timeslots configured.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }

    val groupedSlots = remember(slots) { buildScheduleTimeslotGroups(slots) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        groupedSlots.forEach { (dayOfWeek, daySlots) ->
            Text(
                text = "${dayOfWeekLabel(dayOfWeek)} (${daySlots.size})",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                daySlots.forEach { slot ->
                    val fieldNames = resolveSlotFieldNames(slot, fieldsById)
                    val divisionNames = resolveSlotDivisionNames(
                        slot = slot,
                        divisionDetails = divisionDetails,
                        fallbackDivisionIds = fallbackDivisionIds,
                    )
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                        ),
                        border = BorderStroke(
                            1.dp,
                            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
                        ),
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text(
                                text = formatSlotTimeRange(slot.startTimeMinutes, slot.endTimeMinutes),
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.Top,
                            ) {
                                TimeslotReadOnlyNameColumn(
                                    title = "Fields",
                                    values = fieldNames,
                                    emptyText = "Fields: Not assigned",
                                    modifier = Modifier.weight(1f),
                                )
                                TimeslotReadOnlyNameColumn(
                                    title = "Divisions",
                                    values = divisionNames,
                                    emptyText = "Divisions: Not assigned",
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TimeslotReadOnlyNameColumn(
    title: String,
    values: List<String>,
    emptyText: String,
    modifier: Modifier = Modifier,
) {
    val maxHeight = (readOnlyNameListItemHeight * MAX_READ_ONLY_NAME_LIST_ITEMS) +
        (readOnlyNameListSpacing * (MAX_READ_ONLY_NAME_LIST_ITEMS - 1).coerceAtLeast(0))
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(readOnlyNameListSpacing),
    ) {
        if (values.isEmpty()) {
            Text(
                text = emptyText,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@Column
        }

        Text(
            text = "$title (${values.size})",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (values.size > MAX_READ_ONLY_NAME_LIST_ITEMS) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = maxHeight),
                verticalArrangement = Arrangement.spacedBy(readOnlyNameListSpacing),
            ) {
                items(values) { value ->
                    Text(
                        text = value,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = readOnlyNameListItemHeight),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(readOnlyNameListSpacing),
            ) {
                values.forEach { value ->
                    Text(
                        text = value,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = readOnlyNameListItemHeight),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
internal fun ReadOnlyNameList(
    title: String,
    singularTitle: String,
    values: List<String>,
    emptyText: String,
) {
    when {
        values.isEmpty() -> {
            Text(
                text = emptyText,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        values.size == 1 -> {
            Text(
                text = "$singularTitle: ${values.first()}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        else -> {
            val visibleItems = values.size.coerceAtMost(MAX_READ_ONLY_NAME_LIST_ITEMS)
            val maxHeight = (readOnlyNameListItemHeight * visibleItems) +
                (readOnlyNameListSpacing * (visibleItems - 1).coerceAtLeast(0))
            Text(
                text = "$title (${values.size})",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = maxHeight),
                verticalArrangement = Arrangement.spacedBy(readOnlyNameListSpacing),
            ) {
                items(values) { value ->
                    Text(
                        text = value,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = readOnlyNameListItemHeight),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

private fun buildScheduleTimeslotGroups(slots: List<TimeSlot>): List<Pair<Int, List<TimeSlot>>> {
    if (slots.isEmpty()) return emptyList()

    val grouped = mutableMapOf<Int, MutableList<TimeSlot>>()
    slots.forEach { slot ->
        val normalizedDays = slot.normalizedDaysOfWeek()
        if (normalizedDays.isEmpty()) {
            grouped.getOrPut(-1) { mutableListOf() } += slot
        } else {
            normalizedDays.forEach { day ->
                grouped.getOrPut(day) { mutableListOf() } += slot
            }
        }
    }

    val dayOrder = listOf(0, 1, 2, 3, 4, 5, 6, -1)
    return grouped.entries
        .sortedBy { entry ->
            dayOrder.indexOf(entry.key).let { index ->
                if (index >= 0) index else Int.MAX_VALUE
            }
        }
        .map { entry ->
            entry.key to entry.value.sortedWith(
                compareBy<TimeSlot>(
                    { it.startTimeMinutes ?: Int.MAX_VALUE },
                    { it.endTimeMinutes ?: Int.MAX_VALUE },
                    { it.id },
                ),
            )
        }
}

private fun resolveSlotFieldNames(
    slot: TimeSlot,
    fieldsById: Map<String, Field>,
): List<String> {
    return slot.normalizedScheduledFieldIds()
        .map { fieldId ->
            val field = fieldsById[fieldId]
            field?.name?.takeIf(String::isNotBlank)
                ?: field?.let { resolved -> "Field ${resolved.fieldNumber}" }
                ?: fieldId
        }
        .distinct()
}

private fun resolveSlotDivisionNames(
    slot: TimeSlot,
    divisionDetails: List<DivisionDetail>,
    fallbackDivisionIds: List<String>,
): List<String> {
    val slotDivisionIds = slot.normalizedDivisionIds().normalizeDivisionIdentifiers()
    val effectiveDivisionIds = if (slotDivisionIds.isNotEmpty()) {
        slotDivisionIds
    } else {
        fallbackDivisionIds
    }
    return effectiveDivisionIds
        .map { divisionId -> divisionId.toDivisionDisplayLabel(divisionDetails) }
        .distinct()
}

private fun dayOfWeekLabel(dayOfWeek: Int): String {
    return when (dayOfWeek) {
        0 -> "Monday"
        1 -> "Tuesday"
        2 -> "Wednesday"
        3 -> "Thursday"
        4 -> "Friday"
        5 -> "Saturday"
        6 -> "Sunday"
        else -> "Unassigned day"
    }
}

private fun formatSlotTimeRange(startMinutes: Int?, endMinutes: Int?): String {
    val startLabel = startMinutes?.let(::formatMinutesTo12Hour) ?: "Start not set"
    val endLabel = endMinutes?.let(::formatMinutesTo12Hour) ?: "End not set"
    return "$startLabel - $endLabel"
}

private fun formatMinutesTo12Hour(totalMinutes: Int): String {
    val normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440
    val hour24 = normalizedMinutes / 60
    val minute = normalizedMinutes % 60
    val meridiem = if (hour24 >= 12) "PM" else "AM"
    val hour12 = when (val value = hour24 % 12) {
        0 -> 12
        else -> value
    }
    return "$hour12:${minute.toString().padStart(2, '0')} $meridiem"
}