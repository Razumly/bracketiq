@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FabPosition
import androidx.compose.material3.Icon
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImagePainter
import coil3.compose.rememberAsyncImagePainter
import com.kizitonwose.calendar.compose.WeekCalendar
import com.kizitonwose.calendar.compose.weekcalendar.rememberWeekCalendarState
import com.kizitonwose.calendar.core.Week
import com.kizitonwose.calendar.core.WeekDay
import com.kizitonwose.calendar.core.WeekDayPosition
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
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.toInstant
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlin.time.Duration.Companion.minutes
import kotlin.time.ExperimentalTime
import kotlin.time.Instant
@Composable
internal fun RentalDetailsContent(
    selectedDate: LocalDate,
    fieldOptions: List<RentalFieldOption>,
    busyBlocks: List<RentalBusyBlock>,
    selectionsForSelectedDate: List<RentalSelectionDraft>,
    allSelectionCount: Int,
    totalPriceCents: Int,
    isLoadingFields: Boolean,
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
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(
                start = 16.dp,
                end = 16.dp,
                top = 0.dp,
                bottom = bottomPadding + 16.dp
            )
            .onGloballyPositioned { coordinates ->
                viewportBoundsInWindow = coordinates.boundsInWindow()
            },
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(
            modifier = Modifier
                .weight(1f, fill = false)
                .verticalScroll(verticalScrollState),
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
                    text = "Tap any available 30-minute cell to add a slot. Drag top/bottom handles to resize.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                RentalWeekSelector(
                    selectedDate = selectedDate,
                    onSelectedDateChange = onSelectedDateChange
                )

                when {
                    isLoadingFields -> {
                        Text(
                            text = "Loading fields and rental slots...",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    fieldOptions.isEmpty() -> {
                        Text(
                            text = "No fields/courts are configured for this organization.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    else -> {
                        RentalTimelineGrid(
                            selectedDate = selectedDate,
                            fieldOptions = fieldOptions,
                            busyBlocks = busyBlocks,
                            selectionsForSelectedDate = selectionsForSelectedDate,
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

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp),
            horizontalArrangement = Arrangement.End
        ) {
            Button(
                onClick = onNext,
                enabled = canGoNext,
            ) {
                Text("Next")
            }
        }
    }
}

@Composable
private fun RentalWeekSelector(
    selectedDate: LocalDate,
    onSelectedDateChange: (LocalDate) -> Unit,
) {
    val selectedEpochDay = remember(selectedDate) { selectedDate.toEpochDays() }
    val weekCalendarState = rememberWeekCalendarState(
        startDate = LocalDate.fromEpochDays(selectedEpochDay - 180),
        endDate = LocalDate.fromEpochDays(selectedEpochDay + 180),
        firstVisibleWeekDate = selectedDate,
        firstDayOfWeek = DayOfWeek.MONDAY,
    )

    LaunchedEffect(selectedDate) {
        weekCalendarState.animateScrollToDate(selectedDate)
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            text = selectedDate.format(dateFormat),
            style = MaterialTheme.typography.titleSmall
        )
        WeekCalendar(
            state = weekCalendarState,
            modifier = Modifier.fillMaxWidth(),
            weekHeader = { week ->
                RentalWeekHeader(week = week)
            },
            dayContent = { day ->
                val isSelected = day.date == selectedDate
                val isEnabled = day.position == WeekDayPosition.RangeDate
                Card(
                    modifier = Modifier
                        .padding(horizontal = 2.dp, vertical = 4.dp)
                        .clickable(enabled = isEnabled) {
                            onSelectedDateChange(day.date)
                        },
                    colors = CardDefaults.cardColors(
                        containerColor = when {
                            isSelected -> MaterialTheme.colorScheme.primary
                            else -> MaterialTheme.colorScheme.surfaceVariant
                        },
                        contentColor = when {
                            isSelected -> MaterialTheme.colorScheme.onPrimary
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
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
                            text = day.date.dayOfWeek.toShortLabel(),
                            style = MaterialTheme.typography.labelSmall
                        )
                        Text(
                            text = day.date.dayOfMonth.toString(),
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        )
    }
}

@Composable
private fun RentalWeekHeader(week: Week) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        week.days.forEach { day ->
            Text(
                text = day.date.dayOfWeek.toShortLabel(),
                modifier = Modifier.weight(1f),
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun RentalTimelineGrid(
    selectedDate: LocalDate,
    fieldOptions: List<RentalFieldOption>,
    busyBlocks: List<RentalBusyBlock>,
    selectionsForSelectedDate: List<RentalSelectionDraft>,
    verticalScrollState: ScrollState,
    viewportBoundsInWindow: Rect?,
    onCreateSelection: (fieldId: String, startMinutes: Int) -> Unit,
    onCanUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
    onUpdateSelection: (selectionId: Long, startMinutes: Int, endMinutes: Int) -> Boolean,
    onDeleteSelection: (selectionId: Long) -> Unit,
) {
    val timelineStartMinutes = RENTAL_TIMELINE_START_MINUTES
    val timelineEndMinutes = RENTAL_TIMELINE_END_MINUTES
    val startsByMinute = remember {
        (timelineStartMinutes until timelineEndMinutes step SLOT_INTERVAL_MINUTES).toList()
    }
    val timelineHeight = remember(startsByMinute) {
        RENTAL_FIELD_HEADER_HEIGHT + (RENTAL_TIMELINE_ROW_HEIGHT * startsByMinute.size)
    }
    val timeZone = remember { TimeZone.currentSystemDefault() }

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
                val selectionsForField = selectionsForSelectedDate.filter { selection ->
                    selection.fieldId == option.field.id
                }

                RentalFieldTimelineColumn(
                    option = option,
                    selectedDate = selectedDate,
                    startsByMinute = startsByMinute,
                    busyBlocks = busyBlocks,
                    selections = selectionsForField,
                    timeZone = timeZone,
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
    val busyRanges = remember(option.field.id, busyBlocks, selectedDate, timeZone) {
        busyBlocks
            .asSequence()
            .filter { block -> block.fieldId == option.field.id }
            .mapNotNull { block ->
                block.toBusyRangeOnDate(
                    date = selectedDate,
                    timeZone = timeZone,
                )
            }
            .sortedBy { range -> range.startMinutes }
            .toList()
    }

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
                    val isAvailable = findMatchingSlot(
                        option = option,
                        date = selectedDate,
                        startMinutes = startMinutes,
                        endMinutes = endMinutes,
                        timeZone = timeZone,
                    ) != null
                    val isBusy = busyRanges.any { range ->
                        rangesOverlap(
                            firstStart = range.startMinutes,
                            firstEnd = range.endMinutes,
                            secondStart = startMinutes,
                            secondEnd = endMinutes,
                        )
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(RENTAL_TIMELINE_ROW_HEIGHT)
                            .border(
                                width = 1.dp,
                                color = MaterialTheme.colorScheme.outlineVariant
                            )
                            .background(
                                if (isBusy) {
                                    MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.45f)
                                } else if (isAvailable) {
                                    MaterialTheme.colorScheme.primary.copy(alpha = 0.08f)
                                } else {
                                    MaterialTheme.colorScheme.surface
                                }
                            )
                            .clickable(enabled = isAvailable && !isBusy) {
                                onCreateSelection(option.field.id, startMinutes)
                            }
                    )
                }
            }

            busyRanges.forEach { busyRange ->
                val topOffset = RENTAL_TIMELINE_ROW_HEIGHT * (
                    (busyRange.startMinutes - RENTAL_TIMELINE_START_MINUTES).toFloat() /
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

            selections.forEach { selection ->
                val offsetRows = (selection.startMinutes - RENTAL_TIMELINE_START_MINUTES) / SLOT_INTERVAL_MINUTES
                val durationRows = (selection.endMinutes - selection.startMinutes) / SLOT_INTERVAL_MINUTES
                if (durationRows <= 0) {
                    return@forEach
                }

                val topOffset = RENTAL_TIMELINE_ROW_HEIGHT * offsetRows
                val blockHeight = RENTAL_TIMELINE_ROW_HEIGHT * durationRows
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
                    topOffset = topOffset,
                    height = blockHeight,
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
private fun RentalSelectionOverlayBlock(
    selection: RentalSelectionDraft,
    topOffset: Dp,
    height: Dp,
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
                val proposedStart = (previewStartMinutes + (steps * SLOT_INTERVAL_MINUTES))
                    .coerceAtLeast(RENTAL_TIMELINE_START_MINUTES)
                    .coerceAtMost(previewEndMinutes - SLOT_INTERVAL_MINUTES)
                if (proposedStart != previewStartMinutes) {
                    val canApply = onCanUpdateSelection(
                        selection.id,
                        proposedStart,
                        previewEndMinutes
                    )
                    if (canApply) {
                        previewStartMinutes = proposedStart
                    } else {
                        topHandleDragRemainder = 0f
                    }
                }
            }

            RentalDragHandle.BOTTOM -> {
                bottomHandleDragRemainder += dragDeltaPx
                val steps = (bottomHandleDragRemainder / rowHeightPx).toInt()
                if (steps == 0) {
                    return
                }
                bottomHandleDragRemainder -= steps * rowHeightPx
                val proposedEnd = (previewEndMinutes + (steps * SLOT_INTERVAL_MINUTES))
                    .coerceAtLeast(previewStartMinutes + SLOT_INTERVAL_MINUTES)
                    .coerceAtMost(RENTAL_TIMELINE_END_MINUTES)
                if (proposedEnd != previewEndMinutes) {
                    val canApply = onCanUpdateSelection(
                        selection.id,
                        previewStartMinutes,
                        proposedEnd
                    )
                    if (canApply) {
                        previewEndMinutes = proposedEnd
                    } else {
                        bottomHandleDragRemainder = 0f
                    }
                }
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
            .height(height),
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
                    Text(
                        text = "x",
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.clickable {
                            onDeleteSelection(selection.id)
                        }
                    )
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
        val previewOffsetRows = (previewStartMinutes - RENTAL_TIMELINE_START_MINUTES) / SLOT_INTERVAL_MINUTES
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
            .height(height),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.75f),
            contentColor = MaterialTheme.colorScheme.onErrorContainer
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
                color = MaterialTheme.colorScheme.onErrorContainer.copy(alpha = 0.8f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

