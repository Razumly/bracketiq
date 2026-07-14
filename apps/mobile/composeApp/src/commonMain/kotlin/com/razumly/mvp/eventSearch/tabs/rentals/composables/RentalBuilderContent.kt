@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FabPosition
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBarDefaults
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImagePainter
import coil3.compose.rememberAsyncImagePainter
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.composables.NetworkAvatar
import com.razumly.mvp.core.presentation.composables.PullToRefreshContainer
import com.razumly.mvp.core.presentation.composables.SearchBox
import com.razumly.mvp.core.presentation.composables.SearchOverlay
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventSearch.composables.EmptyDiscoverListItem
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.chrisbanes.haze.materials.HazeMaterials
import dev.chrisbanes.haze.rememberHazeState
import dev.icerock.moko.geo.LatLng
import dev.icerock.moko.geo.compose.BindLocationTrackerEffect
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.toInstant
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlin.time.ExperimentalTime
import kotlin.time.Instant
@Composable
internal fun RentalDetailsContent(
    selectedDate: LocalDate,
    fieldOptions: List<RentalFieldOption>,
    busyBlocks: List<RentalBusyBlock>,
    selections: List<RentalSelectionDraft>,
    allSelectionCount: Int,
    totalPriceCents: Int,
    isLoadingFields: Boolean,
    isAvailabilityInteractive: Boolean,
    bottomPadding: Dp,
    canGoNext: Boolean,
    validationMessage: String?,
    onSelectedDateChange: (LocalDate) -> Unit,
    onCreateSelection: (fieldId: String, startMinutes: Int) -> Unit,
    onCanUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
    onUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
    onDeleteSelection: (selectionId: Long) -> Unit,
    onNext: () -> Unit,
) {
    val verticalScrollState = rememberScrollState()
    var viewportBoundsInWindow by remember { mutableStateOf<Rect?>(null) }
    val fabBottomPadding = bottomPadding + 16.dp
    val scrollContentBottomPadding = bottomPadding + 96.dp

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(
                start = 16.dp,
                end = 16.dp,
                top = 0.dp
            )
            .onGloballyPositioned { coordinates ->
                viewportBoundsInWindow = coordinates.boundsInWindow()
            },
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(verticalScrollState)
                .padding(bottom = scrollContentBottomPadding),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "Select rental slots",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 6.dp)
                )
                Text(
                    text = "Tap any available 30-minute cell to add a slot. Drag the handles or use their accessibility actions to resize.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                RentalWeekSelector(
                    selectedDate = selectedDate,
                    fieldOptions = fieldOptions,
                    onSelectedDateChange = onSelectedDateChange
                )

                when {
                    isLoadingFields -> {
                        Text(
                            text = "Loading resources and rental slots...",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    !isAvailabilityInteractive -> {
                        Text(
                            text = "Availability could not be loaded for this week. Try again.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }

                    fieldOptions.isEmpty() -> {
                        Text(
                            text = "No resources are configured for this organization.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    else -> {
                        RentalTimelineGrid(
                            selectedDate = selectedDate,
                            fieldOptions = fieldOptions,
                            busyBlocks = busyBlocks,
                            selections = selections,
                            verticalScrollState = verticalScrollState,
                            viewportBoundsInWindow = viewportBoundsInWindow,
                            onCreateSelection = onCreateSelection,
                            onCanUpdateSelection = onCanUpdateSelection,
                            onUpdateSelection = onUpdateSelection,
                            onDeleteSelection = onDeleteSelection,
                        )
                    }
                }

                Text(
                    text = "Selected slots: $allSelectionCount",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (totalPriceCents > 0) {
                    Text(
                        text = "Total rental: ${(totalPriceCents / 100.0).moneyFormat()}",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }

                validationMessage?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        }

        ExtendedFloatingActionButton(
            text = {
                Text("Next")
            },
            icon = {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null
                )
            },
            onClick = {
                if (canGoNext) {
                    onNext()
                }
            },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(bottom = fabBottomPadding),
            containerColor = if (canGoNext) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            },
            contentColor = if (canGoNext) {
                MaterialTheme.colorScheme.onPrimary
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            expanded = true,
        )
    }
}

@Composable
private fun RentalWeekSelector(
    selectedDate: LocalDate,
    fieldOptions: List<RentalFieldOption>,
    onSelectedDateChange: (LocalDate) -> Unit,
) {
    val fallbackTimeZone = remember { TimeZone.currentSystemDefault() }
    val timeZone = remember(fieldOptions, fallbackTimeZone) {
        fieldOptions.firstOrNull()?.resolvedRentalTimeZone(fallbackTimeZone) ?: fallbackTimeZone
    }
    val now = remember(timeZone) { Clock.System.now() }
    val today = remember(timeZone, now) { now.toLocalDateTime(timeZone).date }
    val boundedSelectedDate = remember(selectedDate, today) {
        if (selectedDate < today) today else selectedDate
    }
    val todayWeekStart = remember(today) { today.startOfWeekMonday() }
    val selectedWeekStart = remember(boundedSelectedDate) { boundedSelectedDate.startOfWeekMonday() }
    val selectedDayOffset = remember(boundedSelectedDate, selectedWeekStart) {
        boundedSelectedDate.toEpochDays() - selectedWeekStart.toEpochDays()
    }
    val weekDates = remember(selectedWeekStart) {
        List(7) { dayOffset ->
            LocalDate.fromEpochDays(selectedWeekStart.toEpochDays() + dayOffset)
        }
    }
    val datesWithRentalAvailability = remember(weekDates, fieldOptions, timeZone) {
        weekDates.filterTo(mutableSetOf()) { date ->
            hasRentalAvailabilityForDate(
                date = date,
                fieldOptions = fieldOptions,
                timeZone = timeZone,
                now = now,
            )
        }
    }

    LaunchedEffect(selectedDate, today) {
        if (selectedDate < today) {
            onSelectedDateChange(today)
        }
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            text = boundedSelectedDate.format(dateFormat),
            style = MaterialTheme.typography.titleSmall
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(
                onClick = {
                    val previousWeekStart = LocalDate.fromEpochDays(selectedWeekStart.toEpochDays() - 7)
                    val shiftedDate = LocalDate.fromEpochDays(previousWeekStart.toEpochDays() + selectedDayOffset)
                    onSelectedDateChange(if (shiftedDate < today) today else shiftedDate)
                },
                enabled = selectedWeekStart > todayWeekStart,
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                    contentDescription = "Previous week",
                )
            }

            Row(
                modifier = Modifier.weight(1f)
            ) {
                weekDates.forEach { date ->
                    val isSelected = date == boundedSelectedDate
                    val isSelectable = date >= today
                    val hasAvailability = datesWithRentalAvailability.contains(date)
                    Card(
                        modifier = Modifier
                            .weight(1f)
                            .padding(horizontal = 2.dp, vertical = 4.dp)
                            .clickable(enabled = isSelectable) {
                                onSelectedDateChange(date)
                            },
                        colors = CardDefaults.cardColors(
                            containerColor = when {
                                isSelected -> MaterialTheme.colorScheme.primary
                                else -> MaterialTheme.colorScheme.surfaceVariant
                            },
                            contentColor = when {
                                isSelected -> MaterialTheme.colorScheme.onPrimary
                                isSelectable -> MaterialTheme.colorScheme.onSurfaceVariant
                                else -> MaterialTheme.colorScheme.outline
                            }
                        )
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(2.dp)
                        ) {
                            Text(
                                text = date.dayOfWeek.toShortLabel(),
                                style = MaterialTheme.typography.labelSmall
                            )
                            Text(
                                text = date.dayOfMonth.toString(),
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Box(
                                modifier = Modifier
                                    .width(14.dp)
                                    .height(2.dp)
                                    .background(
                                        color = when {
                                            !hasAvailability -> Color.Transparent
                                            isSelected -> MaterialTheme.colorScheme.onPrimary
                                            else -> MaterialTheme.colorScheme.primary
                                        },
                                        shape = RoundedCornerShape(50)
                                    )
                            )
                        }
                    }
                }
            }

            IconButton(
                onClick = {
                    val nextWeekStart = LocalDate.fromEpochDays(selectedWeekStart.toEpochDays() + 7)
                    val shiftedDate = LocalDate.fromEpochDays(nextWeekStart.toEpochDays() + selectedDayOffset)
                    onSelectedDateChange(shiftedDate)
                },
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = "Next week",
                )
            }
        }
    }
}

private fun hasRentalAvailabilityForDate(
    date: LocalDate,
    fieldOptions: List<RentalFieldOption>,
    timeZone: TimeZone,
    now: Instant,
): Boolean {
    val timelineEndMinutes = rentalTimelineEndMinutesForDate(date, fieldOptions, timeZone)
    return (RENTAL_TIMELINE_START_MINUTES until timelineEndMinutes step SLOT_INTERVAL_MINUTES)
        .any { startMinutes ->
            val endMinutes = (startMinutes + SLOT_INTERVAL_MINUTES)
                .coerceAtMost(timelineEndMinutes)
            fieldOptions.any { option ->
                val fieldTimeZone = option.resolvedRentalTimeZone(timeZone)
                isUnambiguousRentalTimelineCell(date, startMinutes, fieldTimeZone) &&
                    !isRentalIntervalInPast(date, startMinutes, endMinutes, fieldTimeZone, now) &&
                    isRangeCoveredByRentalAvailability(
                        option = option,
                        date = date,
                        startMinutes = startMinutes,
                        endMinutes = endMinutes,
                        timeZone = fieldTimeZone,
                    )
            }
        }
}

private fun LocalDate.startOfWeekMonday(): LocalDate {
    return LocalDate.fromEpochDays(toEpochDays() - dayOfWeek.toRentalDayIndex())
}

@Composable
private fun RentalTimelineGrid(
    selectedDate: LocalDate,
    fieldOptions: List<RentalFieldOption>,
    busyBlocks: List<RentalBusyBlock>,
    selections: List<RentalSelectionDraft>,
    verticalScrollState: ScrollState,
    viewportBoundsInWindow: Rect?,
    onCreateSelection: (fieldId: String, startMinutes: Int) -> Unit,
    onCanUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
    onUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
    onDeleteSelection: (selectionId: Long) -> Unit,
) {
    val timelineStartMinutes = RENTAL_TIMELINE_START_MINUTES
    val fallbackTimeZone = remember { TimeZone.currentSystemDefault() }
    val timelineEndMinutes = remember(selectedDate, fieldOptions, fallbackTimeZone) {
        rentalTimelineEndMinutesForDate(selectedDate, fieldOptions, fallbackTimeZone)
    }
    val startsByMinute = remember(timelineStartMinutes, timelineEndMinutes) {
        (timelineStartMinutes until timelineEndMinutes step SLOT_INTERVAL_MINUTES).toList()
    }
    val timelineHeight = remember(startsByMinute) {
        RENTAL_FIELD_HEADER_HEIGHT + (RENTAL_TIMELINE_ROW_HEIGHT * startsByMinute.size)
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(timelineHeight)
    ) {
        Column(
            modifier = Modifier.width(RENTAL_TIME_COLUMN_WIDTH)
        ) {
            Spacer(modifier = Modifier.height(RENTAL_FIELD_HEADER_HEIGHT))
            startsByMinute.forEach { startMinutes ->
                Box(
                    modifier = Modifier
                        .height(RENTAL_TIMELINE_ROW_HEIGHT)
                        .fillMaxWidth()
                        .padding(end = 6.dp),
                    contentAlignment = Alignment.TopEnd
                ) {
                    Text(
                        text = startMinutes.toClockLabel().orEmpty(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        LazyRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(fieldOptions, key = { option -> option.field.id }) { option ->
                val fieldTimeZone = remember(option, fallbackTimeZone) {
                    option.resolvedRentalTimeZone(fallbackTimeZone)
                }
                val selectionsForField = selections.filter { selection ->
                    selection.fieldId == option.field.id
                }

                RentalFieldTimelineColumn(
                    option = option,
                    selectedDate = selectedDate,
                    startsByMinute = startsByMinute,
                    timelineStartMinutes = timelineStartMinutes,
                    timelineEndMinutes = timelineEndMinutes,
                    busyBlocks = busyBlocks,
                    selections = selectionsForField,
                    timeZone = fieldTimeZone,
                    verticalScrollState = verticalScrollState,
                    viewportBoundsInWindow = viewportBoundsInWindow,
                    onCreateSelection = onCreateSelection,
                    onCanUpdateSelection = onCanUpdateSelection,
                    onUpdateSelection = onUpdateSelection,
                    onDeleteSelection = onDeleteSelection,
                )
            }
        }
    }
}

@Composable
private fun RentalFieldTimelineColumn(
    option: RentalFieldOption,
    selectedDate: LocalDate,
    startsByMinute: List<Int>,
    timelineStartMinutes: Int,
    timelineEndMinutes: Int,
    busyBlocks: List<RentalBusyBlock>,
    selections: List<RentalSelectionDraft>,
    timeZone: TimeZone,
    verticalScrollState: ScrollState,
    viewportBoundsInWindow: Rect?,
    onCreateSelection: (fieldId: String, startMinutes: Int) -> Unit,
    onCanUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
    onUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
    onDeleteSelection: (selectionId: Long) -> Unit,
) {
    val busyRanges = remember(option.field.id, busyBlocks, selectedDate, timeZone, timelineEndMinutes) {
        busyBlocks
            .asSequence()
            .filter { block -> block.fieldId == option.field.id }
            .mapNotNull { block ->
                block.toBusyRangeOnDate(
                    date = selectedDate,
                    timeZone = timeZone,
                    timelineEndMinutes = timelineEndMinutes,
                )
            }
            .sortedBy { range -> range.startMinutes }
            .toList()
    }
    val selectionSlices = remember(selections, selectedDate, timeZone) {
        selections.mapNotNull { selection ->
            selection.timelineSliceForDate(
                date = selectedDate,
                timeZone = timeZone,
            )
        }
    }
    val now = remember(selectedDate, timeZone) { Clock.System.now() }

    Card(
        modifier = Modifier.width(RENTAL_FIELD_COLUMN_WIDTH),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(RENTAL_FIELD_HEADER_HEIGHT)
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = option.field.displayLabel(),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(RENTAL_TIMELINE_ROW_HEIGHT * startsByMinute.size)
        ) {
            Column(modifier = Modifier.fillMaxWidth()) {
                startsByMinute.forEach { startMinutes ->
                    val endMinutes = startMinutes + SLOT_INTERVAL_MINUTES
                    val elapsedCellMinutes = rentalElapsedMinutesForWallClockRange(
                        date = selectedDate,
                        startMinutes = startMinutes,
                        endMinutes = endMinutes,
                        timeZone = timeZone,
                    )?.takeIf { elapsedMinutes -> elapsedMinutes == SLOT_INTERVAL_MINUTES }
                    val matchingSlot = elapsedCellMinutes?.let {
                        findMatchingSlot(
                            option = option,
                            date = selectedDate,
                            startMinutes = startMinutes,
                            endMinutes = endMinutes,
                            timeZone = timeZone,
                        )
                    }
                    val isAvailable = matchingSlot != null
                    val isBusy = busyRanges.any { range ->
                        rangesOverlap(
                            firstStart = range.startMinutes,
                            firstEnd = range.endMinutes,
                            secondStart = startMinutes,
                            secondEnd = endMinutes,
                        )
                    }
                    val isSelected = selectionSlices.any { slice ->
                        rangesOverlap(
                            firstStart = slice.startMinutes,
                            firstEnd = slice.endMinutes,
                            secondStart = startMinutes,
                            secondEnd = endMinutes,
                        )
                    }
                    val isPast = isRentalIntervalInPast(
                        date = selectedDate,
                        startMinutes = startMinutes,
                        endMinutes = endMinutes,
                        timeZone = timeZone,
                        now = now,
                    )
                    val canSelect = isAvailable && !isBusy && !isSelected && !isPast
                    val accessibilityState = when {
                        isSelected -> RentalSlotAccessibilityState.SELECTED
                        isBusy -> RentalSlotAccessibilityState.BOOKED
                        isPast && isAvailable -> RentalSlotAccessibilityState.PAST
                        isAvailable -> RentalSlotAccessibilityState.AVAILABLE
                        else -> RentalSlotAccessibilityState.UNAVAILABLE
                    }
                    val accessibilityLabel = rentalSlotAccessibilityLabel(
                        fieldLabel = option.field.displayLabel(),
                        date = selectedDate,
                        startMinutes = startMinutes,
                        endMinutes = endMinutes,
                        state = accessibilityState,
                        priceCents = matchingSlot?.price?.let { hourlyPriceCents ->
                            proratedRentalPriceCents(
                                hourlyPriceCents,
                                elapsedCellMinutes,
                            )
                        },
                    )

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(RENTAL_TIMELINE_ROW_HEIGHT)
                            .border(
                                width = when {
                                    isBusy -> 2.dp
                                    isAvailable -> 1.dp
                                    else -> 0.dp
                                },
                                color = when {
                                    isBusy -> MaterialTheme.colorScheme.outline
                                    isAvailable -> MaterialTheme.colorScheme.outlineVariant
                                    else -> Color.Transparent
                                }
                            )
                            .background(
                                when {
                                    isBusy -> MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f)
                                    isPast && isAvailable -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.75f)
                                    isAvailable -> MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.16f)
                                    else -> MaterialTheme.colorScheme.surface
                                }
                            )
                            .semantics {
                                contentDescription = accessibilityLabel
                            }
                            .clickable(
                                enabled = canSelect,
                                role = Role.Button,
                            ) {
                                onCreateSelection(option.field.id, startMinutes)
                            }
                    )
                }
            }

            busyRanges.forEach { busyRange ->
                val topOffset = RENTAL_TIMELINE_ROW_HEIGHT * (
                    (busyRange.startMinutes - timelineStartMinutes).toFloat() /
                        SLOT_INTERVAL_MINUTES.toFloat()
                    )
                val blockHeight = RENTAL_TIMELINE_ROW_HEIGHT * (
                    (busyRange.endMinutes - busyRange.startMinutes).toFloat() /
                        SLOT_INTERVAL_MINUTES.toFloat()
                    )
                if (blockHeight <= 0.dp) {
                    return@forEach
                }

                RentalBusyOverlayBlock(
                    busyRange = busyRange,
                    topOffset = topOffset,
                    height = blockHeight,
                )
            }

            selectionSlices.forEach { slice ->
                val selection = slice.selection
                val offsetRows = (slice.startMinutes - timelineStartMinutes) / SLOT_INTERVAL_MINUTES
                val durationRows = (slice.endMinutes - slice.startMinutes) / SLOT_INTERVAL_MINUTES
                if (durationRows <= 0) {
                    return@forEach
                }

                val topOffset = RENTAL_TIMELINE_ROW_HEIGHT * offsetRows
                val blockHeight = RENTAL_TIMELINE_ROW_HEIGHT * durationRows
                if (slice.isContinuation) {
                    RentalSelectionContinuationOverlayBlock(
                        selection = selection,
                        fieldLabel = option.field.displayLabel(),
                        selectedDate = selectedDate,
                        sliceStartMinutes = slice.startMinutes,
                        sliceEndMinutes = slice.endMinutes,
                        topOffset = topOffset,
                        height = blockHeight,
                        onDeleteSelection = onDeleteSelection,
                    )
                    return@forEach
                }
                val selectedSlot = findMatchingSlot(
                    option = option,
                    date = selectedDate,
                    startMinutes = selection.startMinutes,
                    endMinutes = selection.endMinutes,
                    timeZone = timeZone,
                )
                val resolvedRange = resolveRentalRange(
                    option = option,
                    date = selectedDate,
                    startMinutes = selection.startMinutes,
                    endMinutes = selection.endMinutes,
                    timeZone = timeZone,
                )

                RentalSelectionOverlayBlock(
                    selection = selection,
                    fieldLabel = option.field.displayLabel(),
                    selectedDate = selectedDate,
                    topOffset = topOffset,
                    height = blockHeight,
                    timelineStartMinutes = timelineStartMinutes,
                    timelineEndMinutes = timelineEndMinutes,
                    selectionPriceCents = resolvedRange?.totalPriceCents ?: selectedSlot?.price ?: 0,
                    verticalScrollState = verticalScrollState,
                    viewportBoundsInWindow = viewportBoundsInWindow,
                    onDeleteSelection = onDeleteSelection,
                    onCanUpdateSelection = onCanUpdateSelection,
                    onUpdateSelection = onUpdateSelection,
                )
            }
        }
    }
}

@Composable
private fun RentalSelectionContinuationOverlayBlock(
    selection: RentalSelectionDraft,
    fieldLabel: String,
    selectedDate: LocalDate,
    sliceStartMinutes: Int,
    sliceEndMinutes: Int,
    topOffset: Dp,
    height: Dp,
    onDeleteSelection: (selectionId: Long) -> Unit,
) {
    val selectionLabel = rentalSelectionAccessibilityLabel(
        fieldLabel = fieldLabel,
        date = selectedDate,
        startMinutes = sliceStartMinutes,
        endMinutes = sliceEndMinutes,
    )
    val continuationLabel = "$selectionLabel, overnight continuation"

    Card(
        modifier = Modifier
            .offset(y = topOffset)
            .padding(horizontal = 4.dp, vertical = 2.dp)
            .fillMaxWidth()
            .height(height)
            .semantics {
                contentDescription = continuationLabel
            },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(start = 6.dp, end = 2.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "${sliceStartMinutes.toClockLabel().orEmpty()} - ${sliceEndMinutes.toClockLabel().orEmpty()}",
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (height >= RENTAL_TIMELINE_ROW_HEIGHT * 2) {
                    Text(
                        text = "Overnight continuation",
                        style = MaterialTheme.typography.labelSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            IconButton(
                onClick = { onDeleteSelection(selection.id) },
                modifier = Modifier.size(32.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "Delete $continuationLabel",
                )
            }
        }
    }
}

@Composable
private fun RentalSelectionOverlayBlock(
    selection: RentalSelectionDraft,
    fieldLabel: String,
    selectedDate: LocalDate,
    topOffset: Dp,
    height: Dp,
    timelineStartMinutes: Int,
    timelineEndMinutes: Int,
    selectionPriceCents: Int,
    verticalScrollState: ScrollState,
    viewportBoundsInWindow: Rect?,
    onDeleteSelection: (selectionId: Long) -> Unit,
    onCanUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
    onUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
) {
    val density = LocalDensity.current
    val rowHeightPx = with(density) { RENTAL_TIMELINE_ROW_HEIGHT.toPx() }
    val autoScrollStepPx = with(density) { RENTAL_AUTO_SCROLL_STEP.toPx() }
    var topHandleDragRemainder by remember(selection.id) { mutableStateOf(0f) }
    var bottomHandleDragRemainder by remember(selection.id) { mutableStateOf(0f) }
    var previewStartMinutes by remember(selection.id, selection.startMinutes) {
        mutableStateOf(selection.startMinutes)
    }
    var previewEndMinutes by remember(selection.id, selection.endMinutes) {
        mutableStateOf(selection.endMinutes)
    }
    var activeDragHandle by remember(selection.id) { mutableStateOf<RentalDragHandle?>(null) }
    var dragPointerWindowY by remember(selection.id) { mutableStateOf<Float?>(null) }
    var topHandleBoundsInWindow by remember(selection.id) { mutableStateOf<Rect?>(null) }
    var bottomHandleBoundsInWindow by remember(selection.id) { mutableStateOf<Rect?>(null) }
    val selectionAccessibilityLabel = rentalSelectionAccessibilityLabel(
        fieldLabel = fieldLabel,
        date = selectedDate,
        startMinutes = selection.startMinutes,
        endMinutes = selection.endMinutes,
    )

    fun applyAccessibleHandleStep(handle: RentalDragHandle, deltaMinutes: Int): Boolean {
        val proposedStart = when (handle) {
            RentalDragHandle.TOP -> (selection.startMinutes + deltaMinutes)
                .coerceAtLeast(timelineStartMinutes)
                .coerceAtMost(selection.endMinutes - SLOT_INTERVAL_MINUTES)
            RentalDragHandle.BOTTOM -> selection.startMinutes
        }
        val proposedEnd = when (handle) {
            RentalDragHandle.TOP -> selection.endMinutes
            RentalDragHandle.BOTTOM -> (selection.endMinutes + deltaMinutes)
                .coerceAtLeast(selection.startMinutes + SLOT_INTERVAL_MINUTES)
                .coerceAtMost(timelineEndMinutes)
        }
        if (proposedStart == selection.startMinutes && proposedEnd == selection.endMinutes) {
            return false
        }
        if (!onCanUpdateSelection(selection.id, proposedStart, proposedEnd)) {
            return false
        }
        return onUpdateSelection(selection.id, proposedStart, proposedEnd)
    }

    fun applyHandleDragDelta(handle: RentalDragHandle, dragDeltaPx: Float) {
        if (dragDeltaPx == 0f) {
            return
        }
        when (handle) {
            RentalDragHandle.TOP -> {
                topHandleDragRemainder += dragDeltaPx
                val steps = (topHandleDragRemainder / rowHeightPx).toInt()
                if (steps == 0) {
                    return
                }
                topHandleDragRemainder -= steps * rowHeightPx
                val resized = stepRentalResizeRange(
                    startMinutes = previewStartMinutes,
                    endMinutes = previewEndMinutes,
                    handle = RentalDragHandle.TOP,
                    steps = steps,
                    timelineStartMinutes = timelineStartMinutes,
                    timelineEndMinutes = timelineEndMinutes,
                ) { proposedStart, proposedEnd ->
                    onCanUpdateSelection(selection.id, proposedStart, proposedEnd)
                }
                if (resized.startMinutes == previewStartMinutes) {
                    topHandleDragRemainder = 0f
                }
                previewStartMinutes = resized.startMinutes
                previewEndMinutes = resized.endMinutes
            }

            RentalDragHandle.BOTTOM -> {
                bottomHandleDragRemainder += dragDeltaPx
                val steps = (bottomHandleDragRemainder / rowHeightPx).toInt()
                if (steps == 0) {
                    return
                }
                bottomHandleDragRemainder -= steps * rowHeightPx
                val resized = stepRentalResizeRange(
                    startMinutes = previewStartMinutes,
                    endMinutes = previewEndMinutes,
                    handle = RentalDragHandle.BOTTOM,
                    steps = steps,
                    timelineStartMinutes = timelineStartMinutes,
                    timelineEndMinutes = timelineEndMinutes,
                ) { proposedStart, proposedEnd ->
                    onCanUpdateSelection(selection.id, proposedStart, proposedEnd)
                }
                if (resized.endMinutes == previewEndMinutes) {
                    bottomHandleDragRemainder = 0f
                }
                previewStartMinutes = resized.startMinutes
                previewEndMinutes = resized.endMinutes
            }
        }
    }

    LaunchedEffect(activeDragHandle, dragPointerWindowY, viewportBoundsInWindow, autoScrollStepPx) {
        val handle = activeDragHandle ?: return@LaunchedEffect
        while (isActive && activeDragHandle == handle) {
            val pointerY = dragPointerWindowY ?: break
            val viewport = viewportBoundsInWindow ?: break
            val edgeThreshold = viewport.height * RENTAL_AUTO_SCROLL_EDGE_RATIO
            val scrollDelta = when (handle) {
                RentalDragHandle.TOP -> {
                    if (pointerY <= (viewport.top + edgeThreshold)) -autoScrollStepPx else 0f
                }

                RentalDragHandle.BOTTOM -> {
                    if (pointerY >= (viewport.bottom - edgeThreshold)) autoScrollStepPx else 0f
                }
            }
            if (scrollDelta != 0f) {
                val consumedScrollDelta = verticalScrollState.scrollBy(scrollDelta)
                applyHandleDragDelta(handle, consumedScrollDelta)
            }
            delay(RENTAL_AUTO_SCROLL_FRAME_DELAY_MS)
        }
    }

    fun resetDragState() {
        activeDragHandle = null
        dragPointerWindowY = null
        topHandleDragRemainder = 0f
        bottomHandleDragRemainder = 0f
    }

    fun finishDrag() {
        val hasPendingChange = previewStartMinutes != selection.startMinutes ||
            previewEndMinutes != selection.endMinutes
        if (hasPendingChange) {
            val wasApplied = onUpdateSelection(
                selection.id,
                previewStartMinutes,
                previewEndMinutes
            )
            if (!wasApplied) {
                previewStartMinutes = selection.startMinutes
                previewEndMinutes = selection.endMinutes
            }
        }
        resetDragState()
    }

    Card(
        modifier = Modifier
            .offset(y = topOffset)
            .padding(horizontal = 4.dp, vertical = 2.dp)
            .fillMaxWidth()
            .height(height)
            .semantics {
                contentDescription = selectionAccessibilityLabel
            },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(start = 6.dp, end = 6.dp, top = 10.dp, bottom = 10.dp),
                verticalArrangement = Arrangement.Top
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "${selection.startMinutes.toClockLabel().orEmpty()} - ${selection.endMinutes.toClockLabel().orEmpty()}",
                        style = MaterialTheme.typography.labelSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    IconButton(
                        onClick = { onDeleteSelection(selection.id) },
                        modifier = Modifier.size(32.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Delete $selectionAccessibilityLabel",
                        )
                    }
                }

                selectionPriceCents.takeIf { it > 0 }?.let { priceCents ->
                    Text(
                        text = "Total: ${(priceCents / 100.0).moneyFormat()}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.9f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Box(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = (-RENTAL_DRAG_HANDLE_HALF_HEIGHT))
                    .width(RENTAL_DRAG_HANDLE_WIDTH)
                    .height(RENTAL_DRAG_HANDLE_HEIGHT)
                    .onGloballyPositioned { coordinates ->
                        topHandleBoundsInWindow = coordinates.boundsInWindow()
                    }
                    .background(
                        MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.9f),
                        RoundedCornerShape(3.dp)
                    )
                    .semantics {
                        contentDescription = "Adjust start time for $selectionAccessibilityLabel"
                        role = Role.Button
                        onClick(label = "Move start 30 minutes later") {
                            applyAccessibleHandleStep(RentalDragHandle.TOP, SLOT_INTERVAL_MINUTES)
                        }
                        customActions = listOf(
                            CustomAccessibilityAction("Move start 30 minutes earlier") {
                                applyAccessibleHandleStep(RentalDragHandle.TOP, -SLOT_INTERVAL_MINUTES)
                            },
                            CustomAccessibilityAction("Move start 30 minutes later") {
                                applyAccessibleHandleStep(RentalDragHandle.TOP, SLOT_INTERVAL_MINUTES)
                            },
                        )
                    }
                    .onPreviewKeyEvent { event ->
                        if (event.type != KeyEventType.KeyDown) {
                            false
                        } else {
                            when (event.key) {
                                Key.DirectionUp -> applyAccessibleHandleStep(
                                    RentalDragHandle.TOP,
                                    -SLOT_INTERVAL_MINUTES,
                                )
                                Key.DirectionDown,
                                Key.Enter -> applyAccessibleHandleStep(
                                    RentalDragHandle.TOP,
                                    SLOT_INTERVAL_MINUTES,
                                )
                                else -> false
                            }
                        }
                    }
                    .focusable()
                    .pointerInput(
                        selection.id,
                        rowHeightPx,
                        selection.startMinutes,
                        selection.endMinutes
                    ) {
                        detectVerticalDragGestures(
                            onDragStart = {
                                previewStartMinutes = selection.startMinutes
                                previewEndMinutes = selection.endMinutes
                                activeDragHandle = RentalDragHandle.TOP
                                dragPointerWindowY = topHandleBoundsInWindow?.center?.y
                            },
                            onDragEnd = {
                                finishDrag()
                            },
                            onDragCancel = {
                                previewStartMinutes = selection.startMinutes
                                previewEndMinutes = selection.endMinutes
                                resetDragState()
                            },
                            onVerticalDrag = { change, dragAmount ->
                                change.consume()
                                dragPointerWindowY = topHandleBoundsInWindow?.top?.plus(change.position.y)
                                applyHandleDragDelta(RentalDragHandle.TOP, dragAmount)
                            }
                        )
                    }
            )

            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .offset(y = RENTAL_DRAG_HANDLE_HALF_HEIGHT)
                    .width(RENTAL_DRAG_HANDLE_WIDTH)
                    .height(RENTAL_DRAG_HANDLE_HEIGHT)
                    .onGloballyPositioned { coordinates ->
                        bottomHandleBoundsInWindow = coordinates.boundsInWindow()
                    }
                    .background(
                        MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.9f),
                        RoundedCornerShape(3.dp)
                    )
                    .semantics {
                        contentDescription = "Adjust end time for $selectionAccessibilityLabel"
                        role = Role.Button
                        onClick(label = "Move end 30 minutes later") {
                            applyAccessibleHandleStep(RentalDragHandle.BOTTOM, SLOT_INTERVAL_MINUTES)
                        }
                        customActions = listOf(
                            CustomAccessibilityAction("Move end 30 minutes earlier") {
                                applyAccessibleHandleStep(RentalDragHandle.BOTTOM, -SLOT_INTERVAL_MINUTES)
                            },
                            CustomAccessibilityAction("Move end 30 minutes later") {
                                applyAccessibleHandleStep(RentalDragHandle.BOTTOM, SLOT_INTERVAL_MINUTES)
                            },
                        )
                    }
                    .onPreviewKeyEvent { event ->
                        if (event.type != KeyEventType.KeyDown) {
                            false
                        } else {
                            when (event.key) {
                                Key.DirectionUp -> applyAccessibleHandleStep(
                                    RentalDragHandle.BOTTOM,
                                    -SLOT_INTERVAL_MINUTES,
                                )
                                Key.DirectionDown,
                                Key.Enter -> applyAccessibleHandleStep(
                                    RentalDragHandle.BOTTOM,
                                    SLOT_INTERVAL_MINUTES,
                                )
                                else -> false
                            }
                        }
                    }
                    .focusable()
                    .pointerInput(
                        selection.id,
                        rowHeightPx,
                        selection.startMinutes,
                        selection.endMinutes
                    ) {
                        detectVerticalDragGestures(
                            onDragStart = {
                                previewStartMinutes = selection.startMinutes
                                previewEndMinutes = selection.endMinutes
                                activeDragHandle = RentalDragHandle.BOTTOM
                                dragPointerWindowY = bottomHandleBoundsInWindow?.center?.y
                            },
                            onDragEnd = {
                                finishDrag()
                            },
                            onDragCancel = {
                                previewStartMinutes = selection.startMinutes
                                previewEndMinutes = selection.endMinutes
                                resetDragState()
                            },
                            onVerticalDrag = { change, dragAmount ->
                                change.consume()
                                dragPointerWindowY = bottomHandleBoundsInWindow?.top?.plus(change.position.y)
                                applyHandleDragDelta(RentalDragHandle.BOTTOM, dragAmount)
                            }
                        )
                    }
            )
        }
    }

    if (activeDragHandle != null) {
        val previewOffsetRows = (previewStartMinutes - timelineStartMinutes) / SLOT_INTERVAL_MINUTES
        val previewDurationRows = (previewEndMinutes - previewStartMinutes) / SLOT_INTERVAL_MINUTES
        if (previewDurationRows > 0) {
            val previewTopOffset = RENTAL_TIMELINE_ROW_HEIGHT * previewOffsetRows
            val previewHeight = RENTAL_TIMELINE_ROW_HEIGHT * previewDurationRows
            Card(
                modifier = Modifier
                    .offset(y = previewTopOffset)
                    .padding(horizontal = 4.dp, vertical = 2.dp)
                    .fillMaxWidth()
                    .height(previewHeight),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.22f),
                    contentColor = Color.Transparent
                ),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {}
        }
    }
}

@Composable
private fun RentalBusyOverlayBlock(
    busyRange: RentalBusyRange,
    topOffset: Dp,
    height: Dp,
) {
    Card(
        modifier = Modifier
            .offset(y = topOffset)
            .padding(horizontal = 4.dp, vertical = 2.dp)
            .fillMaxWidth()
            .height(height)
            .border(
                width = 2.dp,
                color = MaterialTheme.colorScheme.outline,
                shape = RoundedCornerShape(12.dp),
            ),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.82f),
            contentColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 6.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = busyRange.eventName,
                style = MaterialTheme.typography.labelSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = "Booked",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.88f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
