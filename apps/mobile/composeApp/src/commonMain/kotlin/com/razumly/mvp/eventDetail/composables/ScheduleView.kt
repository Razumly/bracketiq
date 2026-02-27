package com.razumly.mvp.eventDetail.composables

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.kizitonwose.calendar.compose.HorizontalCalendar
import com.kizitonwose.calendar.compose.rememberCalendarState
import com.kizitonwose.calendar.core.CalendarDay
import com.kizitonwose.calendar.core.DayPosition
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.util.getScreenHeight
import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.presentation.util.getScreenWidth
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.core.presentation.util.timeFormat
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import kotlinx.datetime.Month
import kotlinx.datetime.TimeZone
import kotlinx.datetime.YearMonth
import kotlinx.datetime.format
import kotlinx.datetime.number
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant

private enum class ScheduleGroupingMode {
    TIME,
    FIELD,
}

sealed interface ScheduleItem {
    val key: String
    val eventId: String
    val start: Instant
    val end: Instant

    data class MatchEntry(
        val match: MatchWithRelations,
    ) : ScheduleItem {
        override val key: String = "match-${match.match.id}"
        override val eventId: String = match.match.eventId
        override val start: Instant = match.match.start ?: match.match.end ?: Clock.System.now()
        override val end: Instant = normalizeScheduleEnd(start, match.match.end)
    }

    data class EventEntry(
        val event: Event,
    ) : ScheduleItem {
        override val key: String = "event-${event.id}"
        override val eventId: String = event.id
        override val start: Instant = event.start
        override val end: Instant = normalizeScheduleEnd(event.start, event.end)
    }
}

private data class FieldScheduleGroup(
    val key: String,
    val label: String,
    val matches: List<MatchWithRelations>,
)

private const val MOBILE_BREAKPOINT_DP = 600
private const val UNASSIGNED_FIELD_KEY = "__unassigned_field__"
private const val ALL_FIELDS_KEY = "__all_fields__"
private const val BRACKET_CARD_HEIGHT_DP = 90
private const val BRACKET_CARD_VERTICAL_PADDING_DP = 20
private const val BRACKET_CARD_VERTICAL_PADDING_WITH_REF_DP = 28
private const val EVENT_CARD_IMAGE_WIDTH_DP = 96

@Composable
fun ScheduleView(
    items: List<ScheduleItem>,
    fields: List<FieldWithMatches>,
    showFab: (Boolean) -> Unit,
    trackedUserIds: Set<String> = emptySet(),
    canManageMatches: Boolean = false,
    onToggleLockAllMatches: ((Boolean, List<String>) -> Unit)? = null,
    onMatchClick: (MatchWithRelations) -> Unit,
    onEventClick: (Event) -> Unit = {},
    matchCardContent: @Composable (MatchWithRelations, () -> Unit) -> Unit = { match, onClick ->
        ScheduleMatchCard(
            match = match,
            onClick = onClick,
        )
    },
    eventCardContent: @Composable (Event, Instant, Instant, () -> Unit) -> Unit = { event, start, end, onClick ->
        ScheduleEventCard(event = event, start = start, end = end, onClick = onClick)
    },
) {
    if (items.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text("No scheduled entries yet.", style = MaterialTheme.typography.bodyMedium)
        }
        showFab(true)
        return
    }

    val navPadding = LocalNavBarPadding.current
    val timeZone = remember { TimeZone.currentSystemDefault() }
    val sortedItems = remember(items, timeZone) {
        items.sortedBy { it.start }
    }
    var showOnlyMyMatches by rememberSaveable { mutableStateOf(false) }
    val hasTrackedMatches = remember(sortedItems, trackedUserIds) {
        trackedUserIds.isNotEmpty() && sortedItems.any { item ->
            val match = (item as? ScheduleItem.MatchEntry)?.match ?: return@any false
            matchIncludesTrackedUsers(match, trackedUserIds)
        }
    }
    LaunchedEffect(hasTrackedMatches) {
        if (!hasTrackedMatches && showOnlyMyMatches) {
            showOnlyMyMatches = false
        }
    }
    val displayedItems = remember(sortedItems, showOnlyMyMatches, trackedUserIds) {
        if (showOnlyMyMatches && trackedUserIds.isNotEmpty()) {
            sortedItems.filter { item ->
                val match = (item as? ScheduleItem.MatchEntry)?.match ?: return@filter false
                matchIncludesTrackedUsers(match, trackedUserIds)
            }
        } else {
            sortedItems
        }
    }
    val displayedMatches = remember(displayedItems) {
        displayedItems.mapNotNull { item -> (item as? ScheduleItem.MatchEntry)?.match }
    }
    val allVisibleLocked = remember(displayedMatches) {
        displayedMatches.isNotEmpty() && displayedMatches.all { match -> match.match.locked }
    }
    val visibleMatchIds = remember(displayedMatches) {
        displayedMatches.map { match -> match.match.id }.filter { id -> id.isNotBlank() }
    }
    val itemsByDate = remember(displayedItems) {
        displayedItems.groupBy { item -> item.start.toLocalDateTime(timeZone).date }
    }
    val fieldsById = remember(fields) {
        fields.associateBy { it.field.id }
    }
    val sortedDates = remember(itemsByDate) { itemsByDate.keys.sorted() }
    val today = remember { Clock.System.now().toLocalDateTime(timeZone).date }
    val defaultDate = remember(sortedDates, today) {
        sortedDates.firstOrNull { it >= today } ?: sortedDates.firstOrNull() ?: today
    }
    var selectedDate by remember(defaultDate) { mutableStateOf(defaultDate) }
    var groupingMode by rememberSaveable { mutableStateOf(ScheduleGroupingMode.TIME) }
    var selectedFieldKey by rememberSaveable { mutableStateOf(ALL_FIELDS_KEY) }
    val isMobileLayout = getScreenWidth() < MOBILE_BREAKPOINT_DP
    val hasAnyMatches = remember(displayedItems) {
        displayedItems.any { item -> item is ScheduleItem.MatchEntry }
    }
    LaunchedEffect(hasAnyMatches) {
        if (!hasAnyMatches && groupingMode == ScheduleGroupingMode.FIELD) {
            groupingMode = ScheduleGroupingMode.TIME
        }
    }
    LaunchedEffect(sortedDates) {
        if (selectedDate !in itemsByDate.keys) {
            selectedDate = sortedDates.firstOrNull() ?: today
        }
    }
    LaunchedEffect(groupingMode) {
        if (groupingMode != ScheduleGroupingMode.FIELD) {
            selectedFieldKey = ALL_FIELDS_KEY
        }
    }
    val startMonth = remember(sortedDates, selectedDate) {
        sortedDates.firstOrNull()?.toYearMonth() ?: selectedDate.toYearMonth()
    }
    val endMonth = remember(sortedDates, selectedDate) {
        sortedDates.lastOrNull()?.toYearMonth() ?: selectedDate.toYearMonth()
    }
    val calendarState = rememberCalendarState(
        startMonth = startMonth,
        endMonth = endMonth,
        firstVisibleMonth = selectedDate.toYearMonth(),
    )
    val coroutineScope = rememberCoroutineScope()
    val lazyListState = rememberLazyListState()
    val isScrollingUp by lazyListState.isScrollingUp()
    showFab(isScrollingUp)
    val agendaViewportHeight = (getScreenHeight() * 0.75f).dp
    val dayItems = itemsByDate[selectedDate].orEmpty()
    val dayMatches = remember(dayItems) {
        dayItems.mapNotNull { item -> (item as? ScheduleItem.MatchEntry)?.match }
    }
    val dayEvents = remember(dayItems) {
        dayItems.mapNotNull { item -> item as? ScheduleItem.EventEntry }
    }
    val fieldGroups = remember(dayMatches, fieldsById) {
        buildFieldScheduleGroups(dayMatches, fieldsById)
    }
    val selectableFieldKeys = remember(fieldGroups) {
        fieldGroups.map(FieldScheduleGroup::key).toSet()
    }
    LaunchedEffect(selectableFieldKeys) {
        if (selectedFieldKey != ALL_FIELDS_KEY && selectedFieldKey !in selectableFieldKeys) {
            selectedFieldKey = ALL_FIELDS_KEY
        }
    }
    val visibleFieldGroups = remember(fieldGroups, selectedFieldKey) {
        if (selectedFieldKey == ALL_FIELDS_KEY) {
            fieldGroups
        } else {
            fieldGroups.filter { it.key == selectedFieldKey }
        }
    }
    val canLockVisibleMatches =
        canManageMatches && onToggleLockAllMatches != null && visibleMatchIds.isNotEmpty()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            state = lazyListState,
            verticalArrangement = Arrangement.spacedBy(0.dp),
            contentPadding = navPadding
        ) {
            item(key = "schedule_calendar") {
                HorizontalCalendar(
                    state = calendarState,
                    modifier = Modifier.fillMaxWidth(),
                    monthHeader = { calendarMonth ->
                        val currentMonth = calendarMonth.yearMonth
                        SimpleCalendarTitle(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 8.dp),
                            currentMonth = currentMonth,
                            goToPrevious = {
                                val previous = currentMonth.previousMonth()
                                if (previous.toMonthIndex() >= startMonth.toMonthIndex()) {
                                    coroutineScope.launch {
                                        calendarState.animateScrollToMonth(previous)
                                    }
                                }
                            },
                            goToNext = {
                                val next = currentMonth.nextMonth()
                                if (next.toMonthIndex() <= endMonth.toMonthIndex()) {
                                    coroutineScope.launch {
                                        calendarState.animateScrollToMonth(next)
                                    }
                                }
                            }
                        )
                    },
                    dayContent = { day ->
                        ScheduleDay(
                            day = day,
                            isSelected = day.date == selectedDate,
                            hasMatches = itemsByDate.containsKey(day.date),
                            onClick = { selectedDate = day.date }
                        )
                    }
                )
            }
            item(key = "schedule_calendar_spacer") {
                Spacer(modifier = Modifier.height(16.dp))
            }
            item(key = "schedule_day_summary") {
                DaySummaryHeader(selectedDate, dayItems)
            }
            item(key = "schedule_controls") {
                Spacer(modifier = Modifier.height(8.dp))
                if (hasTrackedMatches || canLockVisibleMatches) {
                    ScheduleQuickActions(
                        hasTrackedMatches = hasTrackedMatches,
                        showOnlyMyMatches = showOnlyMyMatches,
                        onToggleShowOnlyMyMatches = { showOnlyMyMatches = !showOnlyMyMatches },
                        canLockVisibleMatches = canLockVisibleMatches,
                        allVisibleLocked = allVisibleLocked,
                        onToggleLockAllMatches = {
                            onToggleLockAllMatches?.invoke(!allVisibleLocked, visibleMatchIds)
                        }
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }
                ScheduleGroupingToggle(
                    selectedMode = groupingMode,
                    onModeSelected = { groupingMode = it },
                    canGroupByField = hasAnyMatches,
                    showFieldSelector = isMobileLayout &&
                        hasAnyMatches &&
                        groupingMode == ScheduleGroupingMode.FIELD &&
                        fieldGroups.isNotEmpty(),
                    fieldGroups = fieldGroups,
                    selectedFieldKey = selectedFieldKey,
                    onFieldSelected = { selectedFieldKey = it },
                )
                Spacer(modifier = Modifier.height(8.dp))
            }

            if (dayItems.isEmpty()) {
                item(key = "schedule_empty_day") {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(if (isMobileLayout) agendaViewportHeight else 320.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "No schedule entries for this day.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            } else {
                item(key = "schedule_agenda_content") {
                    val agendaContentModifier = if (isMobileLayout) {
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = agendaViewportHeight)
                    } else {
                        Modifier.fillMaxWidth()
                    }
                    Column(
                        modifier = agendaContentModifier,
                        verticalArrangement = Arrangement.spacedBy(0.dp)
                    ) {
                        if (groupingMode == ScheduleGroupingMode.TIME || !hasAnyMatches) {
                            dayItems.forEach { item ->
                                when (item) {
                                    is ScheduleItem.MatchEntry -> {
                                        matchCardContent(item.match) { onMatchClick(item.match) }
                                    }

                                    is ScheduleItem.EventEntry -> {
                                        eventCardContent(item.event, item.start, item.end) {
                                            onEventClick(item.event)
                                        }
                                    }
                                }
                            }
                        } else {
                            if (selectedFieldKey == ALL_FIELDS_KEY && dayEvents.isNotEmpty()) {
                                Text(
                                    text = "Events (${dayEvents.size})",
                                    modifier = Modifier.padding(horizontal = 16.dp),
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                dayEvents.forEach { eventEntry ->
                                    eventCardContent(eventEntry.event, eventEntry.start, eventEntry.end) {
                                        onEventClick(eventEntry.event)
                                    }
                                }
                            }
                            visibleFieldGroups.forEach { group ->
                                Text(
                                    text = "${group.label} (${group.matches.size})",
                                    modifier = Modifier.padding(horizontal = 16.dp),
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                group.matches.forEach { match ->
                                    matchCardContent(match) { onMatchClick(match) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ScheduleQuickActions(
    hasTrackedMatches: Boolean,
    showOnlyMyMatches: Boolean,
    onToggleShowOnlyMyMatches: () -> Unit,
    canLockVisibleMatches: Boolean,
    allVisibleLocked: Boolean,
    onToggleLockAllMatches: () -> Unit,
) {
    val scrollState = rememberScrollState()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(scrollState)
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (hasTrackedMatches) {
            FilterChip(
                selected = showOnlyMyMatches,
                onClick = onToggleShowOnlyMyMatches,
                label = {
                    Text(
                        if (showOnlyMyMatches) "Showing my matches" else "Show only my matches"
                    )
                }
            )
        }
        if (canLockVisibleMatches) {
            FilterChip(
                selected = allVisibleLocked,
                onClick = onToggleLockAllMatches,
                label = {
                    Text(if (allVisibleLocked) "Unlock all matches" else "Lock all matches")
                }
            )
        }
    }
}

@Composable
private fun ScheduleDay(
    day: CalendarDay,
    isSelected: Boolean,
    hasMatches: Boolean,
    onClick: () -> Unit
) {
    val enabled = day.position == DayPosition.MonthDate
    val background = if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent
    val contentColor = when {
        !enabled -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
        isSelected -> MaterialTheme.colorScheme.onPrimary
        else -> MaterialTheme.colorScheme.onSurface
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(6.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .background(background)
            .padding(vertical = 6.dp, horizontal = 4.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = day.date.dayOfMonth.toString(),
                color = contentColor,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
            )
            if (hasMatches) {
                Box(
                    modifier = Modifier
                        .padding(top = 4.dp)
                        .height(4.dp)
                        .fillMaxWidth(0.3f)
                        .clip(CircleShape)
                        .background(
                            if (isSelected) MaterialTheme.colorScheme.onPrimary
                            else MaterialTheme.colorScheme.primary
                        )
                )
            }
        }
    }
}

@Composable
private fun DaySummaryHeader(date: LocalDate, dayItems: List<ScheduleItem>) {
    val formattedDate = remember(date) { formatDate(date) }
    val matchCount = remember(dayItems) { dayItems.count { item -> item is ScheduleItem.MatchEntry } }
    val eventCount = remember(dayItems) { dayItems.count { item -> item is ScheduleItem.EventEntry } }
    val summary = when {
        matchCount > 0 && eventCount > 0 -> "${dayItems.size} entries"
        matchCount > 0 -> "$matchCount ${if (matchCount == 1) "match" else "matches"}"
        eventCount > 0 -> "$eventCount ${if (eventCount == 1) "event" else "events"}"
        else -> "0 entries"
    }
    Text(
        text = "$formattedDate - $summary",
        modifier = Modifier.padding(horizontal = 16.dp),
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

@Composable
private fun ScheduleGroupingToggle(
    selectedMode: ScheduleGroupingMode,
    onModeSelected: (ScheduleGroupingMode) -> Unit,
    canGroupByField: Boolean,
    showFieldSelector: Boolean,
    fieldGroups: List<FieldScheduleGroup>,
    selectedFieldKey: String,
    onFieldSelected: (String) -> Unit,
) {
    val scrollState = rememberScrollState()
    Box(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .horizontalScroll(scrollState)
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            FilterChip(
                selected = selectedMode == ScheduleGroupingMode.TIME,
                onClick = { onModeSelected(ScheduleGroupingMode.TIME) },
                label = { Text("By Time") }
            )
            if (canGroupByField) {
                FilterChip(
                    selected = selectedMode == ScheduleGroupingMode.FIELD,
                    onClick = { onModeSelected(ScheduleGroupingMode.FIELD) },
                    label = { Text("By Field") }
                )
                if (showFieldSelector) {
                    FieldSelectorDropdownChip(
                        fieldGroups = fieldGroups,
                        selectedFieldKey = selectedFieldKey,
                        onFieldSelected = onFieldSelected,
                    )
                }
            }
        }
    }
}

@Composable
private fun FieldSelectorDropdownChip(
    fieldGroups: List<FieldScheduleGroup>,
    selectedFieldKey: String,
    onFieldSelected: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = remember(fieldGroups, selectedFieldKey) {
        fieldGroups.firstOrNull { it.key == selectedFieldKey }?.label ?: "All fields"
    }

    Box {
        FilterChip(
            selected = selectedFieldKey != ALL_FIELDS_KEY,
            onClick = { expanded = true },
            label = {
                Text(
                    text = selectedLabel,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            },
            trailingIcon = {
                Icon(
                    imageVector = Icons.Default.ArrowDropDown,
                    contentDescription = "Select field"
                )
            },
        )

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            DropdownMenuItem(
                text = { Text("All fields") },
                onClick = {
                    onFieldSelected(ALL_FIELDS_KEY)
                    expanded = false
                }
            )
            fieldGroups.forEach { group ->
                DropdownMenuItem(
                    text = { Text(group.label) },
                    onClick = {
                        onFieldSelected(group.key)
                        expanded = false
                    }
                )
            }
        }
    }
}

private fun buildFieldScheduleGroups(
    dayMatches: List<MatchWithRelations>,
    fieldsById: Map<String, FieldWithMatches>,
): List<FieldScheduleGroup> {
    if (dayMatches.isEmpty()) return emptyList()

    val grouped = dayMatches.groupBy { match ->
        resolveFieldKey(match)
    }

    return grouped.map { (fieldKey, matchesForField) ->
        FieldScheduleGroup(
            key = fieldKey,
            label = resolveFieldLabel(matchesForField.firstOrNull(), fieldsById),
            matches = matchesForField.sortedBy { it.match.start }
        )
    }.sortedBy { group ->
        if (group.key == UNASSIGNED_FIELD_KEY) {
            "\uFFFF"
        } else {
            group.label.lowercase()
        }
    }
}

private fun resolveFieldKey(match: MatchWithRelations): String {
    val fieldId = match.match.fieldId?.trim().takeUnless { it.isNullOrEmpty() }
        ?: match.field?.id?.trim().takeUnless { it.isNullOrEmpty() }
    return fieldId ?: UNASSIGNED_FIELD_KEY
}

private fun resolveFieldLabel(
    match: MatchWithRelations?,
    fieldsById: Map<String, FieldWithMatches>,
): String {
    if (match == null) return "Field TBD"

    val fieldId = match.match.fieldId?.trim().takeUnless { it.isNullOrEmpty() }
        ?: match.field?.id?.trim().takeUnless { it.isNullOrEmpty() }
    if (fieldId != null) {
        val mappedField = fieldsById[fieldId]?.field
        val mappedName = mappedField?.name?.trim().orEmpty()
        if (mappedName.isNotEmpty()) {
            return mappedName
        }
        val mappedNumber = mappedField?.fieldNumber
        if (mappedNumber != null && mappedNumber > 0) {
            return "Field $mappedNumber"
        }
    }

    val fieldName = match.field?.name?.trim().orEmpty()
    if (fieldName.isNotEmpty()) {
        return fieldName
    }

    val fieldNumber = match.field?.fieldNumber
    if (fieldNumber != null && fieldNumber > 0) {
        return "Field $fieldNumber"
    }

    return "Field TBD"
}

private fun normalizeScheduleEnd(start: Instant, end: Instant?): Instant =
    end?.takeIf { it > start } ?: start.plus(1.hours)

@Composable
private fun ScheduleMatchCard(
    match: MatchWithRelations,
    onClick: () -> Unit,
) {
    val hasAssignedReferee =
        !match.match.refereeId.isNullOrBlank() ||
            !match.match.teamRefereeId.isNullOrBlank() ||
            match.teamReferee != null
    val verticalPadding = if (hasAssignedReferee) {
        BRACKET_CARD_VERTICAL_PADDING_WITH_REF_DP.dp
    } else {
        BRACKET_CARD_VERTICAL_PADDING_DP.dp
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = verticalPadding)
    ) {
        MatchCard(
            match = match,
            onClick = onClick,
            modifier = Modifier
                .fillMaxWidth()
                .height(BRACKET_CARD_HEIGHT_DP.dp),
        )
    }
}

@Composable
private fun ScheduleEventCard(
    event: Event,
    start: Instant,
    end: Instant,
    onClick: () -> Unit,
) {
    val timeZone = remember { TimeZone.currentSystemDefault() }
    val dateTimeLabel = remember(start, end, timeZone) {
        formatScheduleDateTimeWindow(start = start, end = end, timeZone = timeZone)
    }
    val eventImageUrl = remember(event.imageId) {
        event.imageId
            .trim()
            .takeIf { imageId -> imageId.isNotEmpty() }
            ?.let { imageId -> getImageUrl(fileId = imageId, width = 240, height = 180) }
    }
    val location = remember(event.location) { event.location.trim() }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = BRACKET_CARD_VERTICAL_PADDING_DP.dp)
    ) {
        androidx.compose.material3.Card(
            modifier = Modifier
                .fillMaxWidth()
                .height(BRACKET_CARD_HEIGHT_DP.dp),
            shape = RoundedCornerShape(14.dp),
            onClick = onClick,
        ) {
            Row(modifier = Modifier.fillMaxSize()) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(EVENT_CARD_IMAGE_WIDTH_DP.dp)
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center
                ) {
                    if (eventImageUrl == null) {
                        Text(
                            text = "Event",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        AsyncImage(
                            model = eventImageUrl,
                            contentDescription = "${event.name} image",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }
                Column(
                    modifier = Modifier
                        .fillMaxHeight()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Text(
                        text = event.name.ifBlank { "Event" },
                        style = MaterialTheme.typography.titleSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (location.isNotEmpty()) {
                        Text(
                            text = location,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        text = dateTimeLabel,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

private fun formatScheduleDateTimeWindow(
    start: Instant,
    end: Instant,
    timeZone: TimeZone,
): String {
    val localStart = start.toLocalDateTime(timeZone)
    val localEnd = end.toLocalDateTime(timeZone)
    val startTimeLabel = localStart.time.format(timeFormat)
    val endTimeLabel = localEnd.time.format(timeFormat)
    return if (localStart.date == localEnd.date) {
        "${formatDate(localStart.date)} • $startTimeLabel - $endTimeLabel"
    } else {
        "${formatDate(localStart.date)} $startTimeLabel - ${formatDate(localEnd.date)} $endTimeLabel"
    }
}

private fun matchIncludesTrackedUsers(
    match: MatchWithRelations,
    trackedUserIds: Set<String>,
): Boolean {
    if (trackedUserIds.isEmpty()) return false

    if (!match.match.refereeId.isNullOrBlank() && trackedUserIds.contains(match.match.refereeId)) {
        return true
    }

    val teams = listOfNotNull(match.team1, match.team2, match.teamReferee)
    return teams.any { team ->
        trackedUserIds.contains(team.captainId) ||
            (!team.managerId.isNullOrBlank() && trackedUserIds.contains(team.managerId)) ||
            (!team.headCoachId.isNullOrBlank() && trackedUserIds.contains(team.headCoachId)) ||
            team.playerIds.any { playerId -> trackedUserIds.contains(playerId) } ||
            team.coachIds.any { coachId -> trackedUserIds.contains(coachId) }
    }
}

private fun formatDate(date: LocalDate): String {
    val monthName = date.month.displayName()
    return "$monthName ${date.day}, ${date.year}"
}

private fun rememberCalendarLabel(yearMonth: YearMonth): String {
    val month = yearMonth.month.displayName()
    return "$month ${yearMonth.year}"
}

private fun YearMonth.toMonthIndex(): Int = year * 12 + month.number

private fun YearMonth.previousMonth(): YearMonth {
    val prevMonthNumber = if (month.number == 1) 12 else month.number - 1
    val prevYear = if (month.number == 1) year - 1 else year
    return YearMonth(prevYear, prevMonthNumber)
}

private fun YearMonth.nextMonth(): YearMonth {
    val nextMonthNumber = if (month.number == 12) 1 else month.number + 1
    val nextYear = if (month.number == 12) year + 1 else year
    return YearMonth(nextYear, nextMonthNumber)
}

private fun LocalDate.toYearMonth(): YearMonth = YearMonth(year, month.number)

private fun Month.displayName(): String =
    name.lowercase().replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }

@Composable
private fun SimpleCalendarTitle(
    modifier: Modifier,
    currentMonth: YearMonth,
    isHorizontal: Boolean = true,
    goToPrevious: () -> Unit,
    goToNext: () -> Unit,
) {
    Row(
        modifier = modifier.height(40.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CalendarNavigationIcon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
            contentDescription = "Previous",
            onClick = goToPrevious,
            isHorizontal = isHorizontal,
        )
        Text(
            modifier = Modifier
                .weight(1f),
            text = rememberCalendarLabel(currentMonth),
            fontSize = 22.sp,
            textAlign = TextAlign.Center,
            fontWeight = FontWeight.Medium,
        )
        CalendarNavigationIcon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = "Next",
            onClick = goToNext,
            isHorizontal = isHorizontal,
        )
    }
}

@Composable
private fun CalendarNavigationIcon(
    imageVector: ImageVector,
    contentDescription: String,
    isHorizontal: Boolean = true,
    onClick: () -> Unit,
) = Box(
    modifier = Modifier
        .fillMaxHeight()
        .aspectRatio(1f)
        .clip(shape = CircleShape)
        .clickable(role = Role.Button, onClick = onClick),
) {
    val rotation by animateFloatAsState(if (isHorizontal) 0f else 90f)
    Icon(
        modifier = Modifier
            .fillMaxSize()
            .padding(4.dp)
            .align(Alignment.Center)
            .rotate(rotation),
        imageVector = imageVector,
        contentDescription = contentDescription,
    )
}
