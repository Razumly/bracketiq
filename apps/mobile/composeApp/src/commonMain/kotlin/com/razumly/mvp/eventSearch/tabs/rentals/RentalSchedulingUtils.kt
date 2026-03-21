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
internal fun resolveRentalSelection(
    selection: RentalSelectionDraft,
    fieldOptions: List<RentalFieldOption>,
    timeZone: TimeZone,
): ResolvedRentalSelection? {
    val option = fieldOptions.firstOrNull { option -> option.field.id == selection.fieldId } ?: return null
    val startInstant = selection.date.toInstantAtMinutes(selection.startMinutes, timeZone)
    val endInstant = selection.date.toInstantAtMinutes(selection.endMinutes, timeZone)
    if (endInstant <= startInstant) {
        return null
    }

    val resolvedRange = resolveRentalRange(
        option = option,
        date = selection.date,
        startMinutes = selection.startMinutes,
        endMinutes = selection.endMinutes,
        timeZone = timeZone,
    ) ?: return null

    return ResolvedRentalSelection(
        selection = selection,
        field = option.field,
        slots = resolvedRange.slots,
        startInstant = startInstant,
        endInstant = endInstant,
        totalPriceCents = resolvedRange.totalPriceCents,
    )
}

internal data class ResolvedRentalRange(
    val slots: List<TimeSlot>,
    val totalPriceCents: Int,
)

internal fun resolveRentalRange(
    option: RentalFieldOption,
    date: LocalDate,
    startMinutes: Int,
    endMinutes: Int,
    timeZone: TimeZone,
): ResolvedRentalRange? {
    if (endMinutes <= startMinutes) {
        return null
    }
    if (startMinutes < RENTAL_TIMELINE_START_MINUTES || endMinutes > RENTAL_TIMELINE_END_MINUTES) {
        return null
    }

    var segmentStartMinutes = startMinutes
    val matchedSlots = mutableListOf<TimeSlot>()
    var totalPriceCents = 0

    while (segmentStartMinutes < endMinutes) {
        val segmentEndMinutes = (segmentStartMinutes + SLOT_INTERVAL_MINUTES)
            .coerceAtMost(endMinutes)
        val segmentStart = date.toInstantAtMinutes(segmentStartMinutes, timeZone)
        val segmentEnd = date.toInstantAtMinutes(segmentEndMinutes, timeZone)

        val matchedSlot = selectBestSlotForInterval(
            slots = option.rentalSlots,
            rangeStart = segmentStart,
            rangeEnd = segmentEnd,
            fieldId = option.field.id,
            timeZone = timeZone,
        ) ?: return null

        matchedSlots += matchedSlot
        totalPriceCents += (matchedSlot.price ?: 0).coerceAtLeast(0)
        segmentStartMinutes += SLOT_INTERVAL_MINUTES
    }

    return ResolvedRentalRange(
        slots = matchedSlots.distinctBy { slot -> slot.id },
        totalPriceCents = totalPriceCents,
    )
}

internal fun selectBestSlotForInterval(
    slots: List<TimeSlot>,
    rangeStart: Instant,
    rangeEnd: Instant,
    fieldId: String,
    timeZone: TimeZone,
): TimeSlot? {
    return slots
        .asSequence()
        .filter { slot ->
            slot.matchesRentalSelection(
                rangeStart = rangeStart,
                rangeEnd = rangeEnd,
                fieldId = fieldId,
            )
        }
        .sortedWith(
            compareBy<TimeSlot> { slot -> slot.slotDurationMinutes(timeZone) }
                .thenBy { slot -> slot.price ?: Int.MAX_VALUE }
        )
        .firstOrNull()
}

internal fun findMatchingSlot(
    option: RentalFieldOption,
    date: LocalDate,
    startMinutes: Int,
    endMinutes: Int,
    timeZone: TimeZone,
): TimeSlot? {
    if (endMinutes <= startMinutes) {
        return null
    }
    if (startMinutes < RENTAL_TIMELINE_START_MINUTES || endMinutes > RENTAL_TIMELINE_END_MINUTES) {
        return null
    }
    val startInstant = date.toInstantAtMinutes(startMinutes, timeZone)
    val endInstant = date.toInstantAtMinutes(endMinutes, timeZone)
    return selectBestSlotForInterval(
        slots = option.rentalSlots,
        rangeStart = startInstant,
        rangeEnd = endInstant,
        fieldId = option.field.id,
        timeZone = timeZone,
    )
}

internal fun rangesOverlap(
    firstStart: Int,
    firstEnd: Int,
    secondStart: Int,
    secondEnd: Int,
): Boolean {
    if (firstEnd <= firstStart || secondEnd <= secondStart) {
        return false
    }
    return firstStart < secondEnd && secondStart < firstEnd
}

internal fun canApplyRentalSelectionRange(
    selectionId: Long,
    fieldId: String,
    date: LocalDate,
    startMinutes: Int,
    endMinutes: Int,
    selections: List<RentalSelectionDraft>,
    fieldOptions: List<RentalFieldOption>,
    busyBlocks: List<RentalBusyBlock>,
    timeZone: TimeZone,
): Boolean {
    if (endMinutes <= startMinutes) {
        return false
    }
    if (startMinutes < RENTAL_TIMELINE_START_MINUTES || endMinutes > RENTAL_TIMELINE_END_MINUTES) {
        return false
    }

    val fieldOption = fieldOptions.firstOrNull { option ->
        option.field.id == fieldId
    } ?: return false

    val overlapsSelection = selections.any { selection ->
        selection.id != selectionId &&
            selection.fieldId == fieldId &&
            selection.date == date &&
            rangesOverlap(
                selection.startMinutes,
                selection.endMinutes,
                startMinutes,
                endMinutes,
            )
    }
    if (overlapsSelection) {
        return false
    }

    val overlapsBusyBlock = busyBlocks.any { block ->
        block.fieldId == fieldId &&
            rangeOverlapsBusyBlockOnDate(
                block = block,
                date = date,
                startMinutes = startMinutes,
                endMinutes = endMinutes,
                timeZone = timeZone,
            )
    }
    if (overlapsBusyBlock) {
        return false
    }

    return isRangeCoveredByRentalAvailability(
        option = fieldOption,
        date = date,
        startMinutes = startMinutes,
        endMinutes = endMinutes,
        timeZone = timeZone,
    )
}

internal fun rangeOverlapsBusyBlockOnDate(
    block: RentalBusyBlock,
    date: LocalDate,
    startMinutes: Int,
    endMinutes: Int,
    timeZone: TimeZone,
): Boolean {
    if (endMinutes <= startMinutes) {
        return false
    }
    val rangeStart = date.toInstantAtMinutes(startMinutes, timeZone)
    val rangeEnd = date.toInstantAtMinutes(endMinutes, timeZone)
    return rangeStart < block.end && block.start < rangeEnd
}

internal fun isRangeCoveredByRentalAvailability(
    option: RentalFieldOption,
    date: LocalDate,
    startMinutes: Int,
    endMinutes: Int,
    timeZone: TimeZone,
): Boolean {
    return resolveRentalRange(
        option = option,
        date = date,
        startMinutes = startMinutes,
        endMinutes = endMinutes,
        timeZone = timeZone,
    ) != null
}

internal fun RentalBusyBlock.toBusyRangeOnDate(
    date: LocalDate,
    timeZone: TimeZone,
): RentalBusyRange? {
    if (end <= start) {
        return null
    }

    val dayStart = date.toInstantAtMinutes(0, timeZone)
    val dayEnd = date.toInstantAtMinutes(24 * 60, timeZone)
    val clippedStart = if (start > dayStart) start else dayStart
    val clippedEnd = if (end < dayEnd) end else dayEnd
    if (clippedEnd <= clippedStart) {
        return null
    }

    val startMinutes = (clippedStart - dayStart).inWholeMinutes.toInt()
    val endMinutes = (clippedEnd - dayStart).inWholeMinutes.toInt()
    val normalizedStart = startMinutes.coerceIn(RENTAL_TIMELINE_START_MINUTES, RENTAL_TIMELINE_END_MINUTES)
    val normalizedEnd = endMinutes.coerceIn(RENTAL_TIMELINE_START_MINUTES, RENTAL_TIMELINE_END_MINUTES)
    if (normalizedEnd <= normalizedStart) {
        return null
    }

    return RentalBusyRange(
        eventId = eventId,
        eventName = eventName.ifBlank { "Reserved event" },
        startMinutes = normalizedStart,
        endMinutes = normalizedEnd,
    )
}

internal fun LocalDate.toInstantAtMinutes(
    minutesFromStartOfDay: Int,
    timeZone: TimeZone,
): Instant {
    val startOfDay = LocalDateTime(
        year = year,
        monthNumber = monthNumber,
        dayOfMonth = dayOfMonth,
        hour = 0,
        minute = 0,
        second = 0,
        nanosecond = 0
    ).toInstant(timeZone)
    return startOfDay + minutesFromStartOfDay.minutes
}

internal fun DayOfWeek.toShortLabel(): String {
    return when (this) {
        DayOfWeek.MONDAY -> "Mon"
        DayOfWeek.TUESDAY -> "Tue"
        DayOfWeek.WEDNESDAY -> "Wed"
        DayOfWeek.THURSDAY -> "Thu"
        DayOfWeek.FRIDAY -> "Fri"
        DayOfWeek.SATURDAY -> "Sat"
        DayOfWeek.SUNDAY -> "Sun"
    }
}

internal const val SLOT_INTERVAL_MINUTES = 30
internal const val RENTAL_TIMELINE_START_MINUTES = 6 * 60
internal const val RENTAL_TIMELINE_END_MINUTES = 24 * 60
internal val RENTAL_TIME_COLUMN_WIDTH = 72.dp
internal val RENTAL_FIELD_COLUMN_WIDTH = 180.dp
internal val RENTAL_FIELD_HEADER_HEIGHT = 48.dp
internal val RENTAL_TIMELINE_ROW_HEIGHT = 34.dp
internal val RENTAL_DRAG_HANDLE_WIDTH = 26.dp
internal val RENTAL_DRAG_HANDLE_HEIGHT = 6.dp
internal val RENTAL_DRAG_HANDLE_HALF_HEIGHT = RENTAL_DRAG_HANDLE_HEIGHT / 2
internal val RENTAL_AUTO_SCROLL_STEP = 8.dp
internal const val RENTAL_AUTO_SCROLL_EDGE_RATIO = 0.25f
internal const val RENTAL_AUTO_SCROLL_FRAME_DELAY_MS = 16L

internal fun Instant.toDisplayDateTime(): String {
    return toLocalDateTime(TimeZone.currentSystemDefault()).format(dateTimeFormat)
}

internal fun Field.displayLabel(): String {
    if (!name.isNullOrBlank()) {
        return name
    }
    return "Field $fieldNumber"
}

internal fun TimeSlot.matchesRentalSelection(
    rangeStart: Instant,
    rangeEnd: Instant,
    fieldId: String,
): Boolean {
    if (rangeEnd <= rangeStart) {
        return false
    }

    val timeZone = TimeZone.currentSystemDefault()
    val slotStartLocal = startDate.toLocalDateTime(timeZone)
    val selectedStartLocal = rangeStart.toLocalDateTime(timeZone)
    val selectedEndLocal = rangeEnd.toLocalDateTime(timeZone)

    if (selectedStartLocal.date != selectedEndLocal.date) {
        return false
    }

    val selectedStartMinutes = selectedStartLocal.hour * 60 + selectedStartLocal.minute
    val selectedEndMinutes = selectedEndLocal.hour * 60 + selectedEndLocal.minute

    val slotStartMinutes = startTimeMinutes ?: (slotStartLocal.hour * 60 + slotStartLocal.minute)
    val slotEndMinutes = endTimeMinutes ?: endDate
        ?.toLocalDateTime(timeZone)
        ?.let { endLocal -> endLocal.hour * 60 + endLocal.minute }
        ?: return false

    if (slotEndMinutes <= slotStartMinutes) {
        return false
    }
    if (selectedStartMinutes < slotStartMinutes || selectedEndMinutes > slotEndMinutes) {
        return false
    }

    if (repeating) {
        val selectedDayIndex = selectedStartLocal.dayOfWeek.toRentalDayIndex()
        val slotDayIndex = toMondayBasedDayIndex(timeZone) ?: slotStartLocal.dayOfWeek.toRentalDayIndex()
        if (selectedDayIndex != slotDayIndex) {
            return false
        }

        if (selectedStartLocal.date < slotStartLocal.date) {
            return false
        }
        if (endDate != null && selectedStartLocal.date > endDate!!.toLocalDateTime(timeZone).date) {
            return false
        }
        return true
    }

    val slotDurationMinutes = slotEndMinutes - slotStartMinutes
    if (slotDurationMinutes <= 0) {
        return false
    }

    val slotEndInstant = endDate ?: (startDate + slotDurationMinutes.minutes)

    return rangeStart >= startDate && rangeEnd <= slotEndInstant
}

internal fun TimeSlot.toRentalAvailabilityLabel(): String {
    val slotStart = startTimeMinutes.toClockLabel()
    val slotEnd = endTimeMinutes.toClockLabel()
    val dayLabel = toMondayBasedDayIndex(TimeZone.currentSystemDefault()).toDayLabel()
    return if (slotStart != null && slotEnd != null) {
        "$dayLabel $slotStart - $slotEnd"
    } else {
        "Available"
    }
}

internal fun TimeSlot.slotDurationMinutes(timeZone: TimeZone): Int {
    val startMinutesValue = startTimeMinutes ?: startDate.toLocalDateTime(timeZone).let { local ->
        local.hour * 60 + local.minute
    }
    val endMinutesValue = endTimeMinutes ?: endDate?.toLocalDateTime(timeZone)?.let { local ->
        local.hour * 60 + local.minute
    } ?: return Int.MAX_VALUE

    return if (endMinutesValue > startMinutesValue) {
        endMinutesValue - startMinutesValue
    } else {
        Int.MAX_VALUE
    }
}

internal fun TimeSlot.toMondayBasedDayIndex(timeZone: TimeZone): Int? {
    val startDayIndex = startDate.toLocalDateTime(timeZone).dayOfWeek.toRentalDayIndex()
    val raw = dayOfWeek?.let { value -> ((value % 7) + 7) % 7 } ?: return startDayIndex

    // Support both Monday-based (Mon=0) and Sunday-based (Sun=0) persisted values.
    val sundayBasedStartIndex = (startDayIndex + 1) % 7
    return when {
        raw == startDayIndex -> raw
        raw == sundayBasedStartIndex -> (raw + 6) % 7
        else -> raw
    }
}

internal fun Int?.toClockLabel(): String? {
    val minutes = this ?: return null
    if (minutes !in 0..(24 * 60)) {
        return null
    }
    val hour24 = (minutes / 60) % 24
    val minute = minutes % 60
    val hour12 = when (val normalized = hour24 % 12) {
        0 -> 12
        else -> normalized
    }
    val suffix = if (hour24 < 12) "AM" else "PM"
    val minuteText = if (minute < 10) "0$minute" else minute.toString()
    return "$hour12:$minuteText $suffix"
}

internal fun Int?.toDayLabel(): String {
    return when (this) {
        0 -> "Mon"
        1 -> "Tue"
        2 -> "Wed"
        3 -> "Thu"
        4 -> "Fri"
        5 -> "Sat"
        6 -> "Sun"
        else -> "Mon"
    }
}

internal fun DayOfWeek.toRentalDayIndex(): Int = isoDayNumber - 1
