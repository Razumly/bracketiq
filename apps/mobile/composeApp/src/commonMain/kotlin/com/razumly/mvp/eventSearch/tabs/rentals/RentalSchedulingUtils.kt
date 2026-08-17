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
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
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
import com.razumly.mvp.core.util.toTimeZoneOrUtc
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
import kotlinx.datetime.offsetAt
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.toInstant
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.time.Clock
import kotlin.time.Duration.Companion.days
import kotlin.time.ExperimentalTime
import kotlin.time.Instant
internal fun resolveRentalSelection(
    selection: RentalSelectionDraft,
    fieldOptions: List<RentalFieldOption>,
    timeZone: TimeZone,
): ResolvedRentalSelection? {
    val option = fieldOptions.firstOrNull { option -> option.field.id == selection.fieldId } ?: return null
    val fieldTimeZone = option.resolvedRentalTimeZone(timeZone)
    val startInstant = selection.date.toInstantAtMinutes(selection.startMinutes, fieldTimeZone)
    val endInstant = selection.date.toInstantAtMinutes(selection.endMinutes, fieldTimeZone)
    if (endInstant <= startInstant) {
        return null
    }

    val resolvedRange = resolveRentalRange(
        option = option,
        date = selection.date,
        startMinutes = selection.startMinutes,
        endMinutes = selection.endMinutes,
        timeZone = fieldTimeZone,
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
    if (!isSupportedRentalMinuteRange(startMinutes, endMinutes)) {
        return null
    }

    val durationMinutes = rentalElapsedMinutesForWallClockRange(
        date = date,
        startMinutes = startMinutes,
        endMinutes = endMinutes,
        timeZone = timeZone,
    ) ?: return null
    val rangeStart = date.toInstantAtMinutes(startMinutes, timeZone)
    val rangeEnd = date.toInstantAtMinutes(endMinutes, timeZone)
    val matchedSlot = selectBestSlotForInterval(
        slots = option.rentalSlots,
        rangeStart = rangeStart,
        rangeEnd = rangeEnd,
        fieldId = option.field.id,
        timeZone = timeZone,
    ) ?: return null

    return ResolvedRentalRange(
        slots = listOf(matchedSlot),
        totalPriceCents = proratedRentalPriceCents(
            priceCents = matchedSlot.price ?: 0,
            durationMinutes = durationMinutes,
        ),
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
                fallbackTimeZone = timeZone,
            )
        }
        .sortedWith(
            compareBy<TimeSlot> { slot -> slot.slotDurationMinutes(timeZone) }
                .thenBy { slot -> slot.price ?: Int.MAX_VALUE }
                .thenBy { slot -> slot.id }
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
    if (!isSupportedRentalMinuteRange(startMinutes, endMinutes)) {
        return null
    }
    val fieldTimeZone = option.resolvedRentalTimeZone(timeZone)
    if (
        rentalElapsedMinutesForWallClockRange(
            date = date,
            startMinutes = startMinutes,
            endMinutes = endMinutes,
            timeZone = fieldTimeZone,
        ) == null
    ) {
        return null
    }
    val startInstant = date.toInstantAtMinutes(startMinutes, fieldTimeZone)
    val endInstant = date.toInstantAtMinutes(endMinutes, fieldTimeZone)
    return selectBestSlotForInterval(
        slots = option.rentalSlots,
        rangeStart = startInstant,
        rangeEnd = endInstant,
        fieldId = option.field.id,
        timeZone = fieldTimeZone,
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

internal data class RentalResizeRange(
    val startMinutes: Int,
    val endMinutes: Int,
)

internal fun stepRentalResizeRange(
    startMinutes: Int,
    endMinutes: Int,
    handle: RentalDragHandle,
    steps: Int,
    timelineStartMinutes: Int,
    timelineEndMinutes: Int,
    canApply: (startMinutes: Int, endMinutes: Int) -> Boolean,
): RentalResizeRange {
    var currentStart = startMinutes
    var currentEnd = endMinutes
    val deltaMinutes = when {
        steps > 0 -> SLOT_INTERVAL_MINUTES
        steps < 0 -> -SLOT_INTERVAL_MINUTES
        else -> return RentalResizeRange(currentStart, currentEnd)
    }

    repeat(abs(steps)) {
        val proposedStart = when (handle) {
            RentalDragHandle.TOP -> (currentStart + deltaMinutes)
                .coerceAtLeast(timelineStartMinutes)
                .coerceAtMost(currentEnd - SLOT_INTERVAL_MINUTES)
            RentalDragHandle.BOTTOM -> currentStart
        }
        val proposedEnd = when (handle) {
            RentalDragHandle.TOP -> currentEnd
            RentalDragHandle.BOTTOM -> (currentEnd + deltaMinutes)
                .coerceAtLeast(currentStart + SLOT_INTERVAL_MINUTES)
                .coerceAtMost(timelineEndMinutes)
        }
        if (
            (proposedStart == currentStart && proposedEnd == currentEnd) ||
            !canApply(proposedStart, proposedEnd)
        ) {
            return RentalResizeRange(currentStart, currentEnd)
        }
        currentStart = proposedStart
        currentEnd = proposedEnd
    }
    return RentalResizeRange(currentStart, currentEnd)
}

internal data class RentalSelectionTimelineSlice(
    val selection: RentalSelectionDraft,
    val startMinutes: Int,
    val endMinutes: Int,
    val isContinuation: Boolean,
)

internal fun RentalSelectionDraft.timelineSliceForDate(
    date: LocalDate,
    timeZone: TimeZone,
): RentalSelectionTimelineSlice? {
    if (!isSupportedRentalMinuteRange(startMinutes, endMinutes)) {
        return null
    }
    if (date == this.date) {
        return RentalSelectionTimelineSlice(
            selection = this,
            startMinutes = startMinutes,
            endMinutes = endMinutes,
            isContinuation = false,
        )
    }

    val selectionStart = this.date.toInstantAtMinutes(startMinutes, timeZone)
    val selectionEnd = this.date.toInstantAtMinutes(endMinutes, timeZone)
    val dayStart = date.toInstantAtMinutes(RENTAL_TIMELINE_START_MINUTES, timeZone)
    val dayEnd = date.toInstantAtMinutes(RENTAL_TIMELINE_END_MINUTES, timeZone)
    val clippedStart = if (selectionStart > dayStart) selectionStart else dayStart
    val clippedEnd = if (selectionEnd < dayEnd) selectionEnd else dayEnd
    if (clippedEnd <= clippedStart) {
        return null
    }

    val sliceStartMinutes = clippedStart.toWallClockMinutesFromDate(
        date = date,
        timeZone = timeZone,
        roundUp = false,
    ).coerceIn(RENTAL_TIMELINE_START_MINUTES, RENTAL_TIMELINE_END_MINUTES)
    val sliceEndMinutes = clippedEnd.toWallClockMinutesFromDate(
        date = date,
        timeZone = timeZone,
        roundUp = true,
    ).coerceIn(RENTAL_TIMELINE_START_MINUTES, RENTAL_TIMELINE_END_MINUTES)
    if (sliceEndMinutes <= sliceStartMinutes) {
        return null
    }
    return RentalSelectionTimelineSlice(
        selection = this,
        startMinutes = sliceStartMinutes,
        endMinutes = sliceEndMinutes,
        isContinuation = true,
    )
}

internal fun rentalSelectionOverlapsRange(
    selection: RentalSelectionDraft,
    date: LocalDate,
    startMinutes: Int,
    endMinutes: Int,
    timeZone: TimeZone,
): Boolean {
    if (!isSupportedRentalMinuteRange(startMinutes, endMinutes) ||
        !isSupportedRentalMinuteRange(selection.startMinutes, selection.endMinutes)
    ) {
        return false
    }
    val rangeStart = date.toInstantAtMinutes(startMinutes, timeZone)
    val rangeEnd = date.toInstantAtMinutes(endMinutes, timeZone)
    val selectionStart = selection.date.toInstantAtMinutes(selection.startMinutes, timeZone)
    val selectionEnd = selection.date.toInstantAtMinutes(selection.endMinutes, timeZone)
    return selectionStart < rangeEnd && rangeStart < selectionEnd
}

internal fun proratedRentalPriceCents(
    priceCents: Int,
    durationMinutes: Int,
): Int {
    if (priceCents <= 0 || durationMinutes <= 0) {
        return 0
    }
    return ((priceCents * durationMinutes) / 60.0).roundToInt()
}

internal fun isRentalIntervalInPast(
    date: LocalDate,
    startMinutes: Int,
    endMinutes: Int,
    timeZone: TimeZone,
    now: Instant = Clock.System.now(),
): Boolean {
    if (endMinutes <= startMinutes) {
        return true
    }
    val intervalStart = date.toInstantAtMinutes(startMinutes, timeZone)
    return intervalStart <= now
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
    if (!isSupportedRentalMinuteRange(startMinutes, endMinutes)) {
        return false
    }

    val fieldOption = fieldOptions.firstOrNull { option ->
        option.field.id == fieldId
    } ?: return false
    val fieldTimeZone = fieldOption.resolvedRentalTimeZone(timeZone)
    if (isRentalIntervalInPast(date, startMinutes, endMinutes, fieldTimeZone)) {
        return false
    }

    val overlapsSelection = selections.any { selection ->
        selection.id != selectionId &&
            selection.fieldId == fieldId &&
            rentalSelectionOverlapsRange(
                selection = selection,
                date = date,
                startMinutes = startMinutes,
                endMinutes = endMinutes,
                timeZone = fieldTimeZone,
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
                timeZone = fieldTimeZone,
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
        timeZone = fieldTimeZone,
    )
}

internal fun isRentalSelectionValidForAvailabilitySnapshot(
    fieldId: String,
    start: Instant,
    end: Instant,
    availabilityWindow: RentalAvailabilityWindow?,
    busyBlocks: List<RentalBusyBlock>,
): Boolean {
    if (availabilityWindow == null || end <= start) {
        return false
    }
    if (start < availabilityWindow.start || end > availabilityWindow.end) {
        return false
    }
    return busyBlocks.none { block ->
        block.fieldId == fieldId && start < block.end && block.start < end
    }
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
    timelineEndMinutes: Int = RENTAL_TIMELINE_END_MINUTES,
): RentalBusyRange? {
    if (end <= start || timelineEndMinutes <= RENTAL_TIMELINE_START_MINUTES) {
        return null
    }

    val timelineStart = date.toInstantAtMinutes(RENTAL_TIMELINE_START_MINUTES, timeZone)
    val timelineEnd = date.toInstantAtMinutes(timelineEndMinutes, timeZone)
    val clippedStart = if (start > timelineStart) start else timelineStart
    val clippedEnd = if (end < timelineEnd) end else timelineEnd
    if (clippedEnd <= clippedStart) {
        return null
    }

    val startMinutes = clippedStart.toWallClockMinutesFromDate(
        date = date,
        timeZone = timeZone,
        roundUp = false,
    )
    val endMinutes = clippedEnd.toWallClockMinutesFromDate(
        date = date,
        timeZone = timeZone,
        roundUp = true,
    )
    val normalizedStart = startMinutes.coerceIn(RENTAL_TIMELINE_START_MINUTES, timelineEndMinutes)
    val normalizedEnd = endMinutes.coerceIn(RENTAL_TIMELINE_START_MINUTES, timelineEndMinutes)
    if (normalizedEnd <= normalizedStart) {
        return null
    }

    return RentalBusyRange(
        eventId = eventId,
        eventName = eventName.ifBlank { RENTAL_UNAVAILABLE_LABEL },
        startMinutes = normalizedStart,
        endMinutes = normalizedEnd,
    )
}

internal fun LocalDate.toInstantAtMinutes(
    minutesFromStartOfDay: Int,
    timeZone: TimeZone,
): Instant {
    require(minutesFromStartOfDay >= 0) {
        "Minutes from start of day must not be negative."
    }
    return localDateTimeAtMinutes(minutesFromStartOfDay).toInstant(timeZone)
}

private fun LocalDate.localDateTimeAtMinutes(minutesFromStartOfDay: Int): LocalDateTime {
    val dayOffset = minutesFromStartOfDay / MINUTES_PER_DAY
    val targetDate = LocalDate.fromEpochDays(toEpochDays() + dayOffset)
    val minuteOfDay = minutesFromStartOfDay % MINUTES_PER_DAY
    return LocalDateTime(
        year = targetDate.year,
        monthNumber = targetDate.monthNumber,
        dayOfMonth = targetDate.dayOfMonth,
        hour = minuteOfDay / 60,
        minute = minuteOfDay % 60,
        second = 0,
        nanosecond = 0,
    )
}

internal fun rentalElapsedMinutesForWallClockRange(
    date: LocalDate,
    startMinutes: Int,
    endMinutes: Int,
    timeZone: TimeZone,
): Int? {
    if (!isSupportedRentalMinuteRange(startMinutes, endMinutes)) {
        return null
    }
    val expectedStart = date.localDateTimeAtMinutes(startMinutes)
    val expectedEnd = date.localDateTimeAtMinutes(endMinutes)
    val rangeStart = expectedStart.toUniqueInstantOrNull(timeZone) ?: return null
    val rangeEnd = expectedEnd.toUniqueInstantOrNull(timeZone) ?: return null
    if (rangeEnd <= rangeStart) {
        return null
    }

    return (rangeEnd - rangeStart).inWholeMinutes
        .takeIf { minutes -> minutes in 1..Int.MAX_VALUE.toLong() }
        ?.toInt()
}

private fun LocalDateTime.toUniqueInstantOrNull(timeZone: TimeZone): Instant? {
    val resolved = toInstant(timeZone)
    if (resolved.toLocalDateTime(timeZone) != this) {
        return null
    }

    // The default conversion chooses the earlier instant during a fall-back
    // overlap. Probe the offsets on both sides and retain every instant that
    // round-trips to the requested wall time; a unique wall time has one.
    val matchingInstants = listOf(
        timeZone.offsetAt(resolved - 1.days),
        timeZone.offsetAt(resolved),
        timeZone.offsetAt(resolved + 1.days),
    )
        .distinct()
        .map { offset -> toInstant(offset) }
        .filter { candidate -> candidate.toLocalDateTime(timeZone) == this }
        .distinct()
    return matchingInstants.singleOrNull()
}

internal fun isUnambiguousRentalTimelineCell(
    date: LocalDate,
    startMinutes: Int,
    timeZone: TimeZone,
): Boolean {
    val endMinutes = startMinutes + SLOT_INTERVAL_MINUTES
    return rentalElapsedMinutesForWallClockRange(
        date = date,
        startMinutes = startMinutes,
        endMinutes = endMinutes,
        timeZone = timeZone,
    ) == SLOT_INTERVAL_MINUTES
}

private fun Instant.toWallClockMinutesFromDate(
    date: LocalDate,
    timeZone: TimeZone,
    roundUp: Boolean,
): Int {
    val local = toLocalDateTime(timeZone)
    val dayOffset = (local.date.toEpochDays() - date.toEpochDays()).toInt()
    val partialMinute = local.second > 0 || local.nanosecond > 0
    return (dayOffset * MINUTES_PER_DAY) +
        (local.hour * 60) +
        local.minute +
        if (roundUp && partialMinute) 1 else 0
}

internal fun rentalTimelineEndMinutesForDate(
    date: LocalDate,
    fieldOptions: List<RentalFieldOption>,
    fallbackTimeZone: TimeZone,
): Int {
    val extendedTimelineEnd = fieldOptions
        .asSequence()
        .flatMap { option -> option.rentalSlots.asSequence() }
        .mapNotNull { slot ->
            val slotTimeZone = slot.timeZone.toTimeZoneOrUtc(fallbackTimeZone)
            val slotStart = slot.startDate.toLocalDateTime(slotTimeZone)
            if (slot.repeating) {
                val slotStartMinutes = slot.startTimeMinutes
                    ?: (slotStart.hour * 60 + slotStart.minute)
                val slotEndMinutes = slot.endTimeMinutes
                    ?: slot.endDate?.toLocalDateTime(slotTimeZone)?.let { endLocal ->
                        endLocal.hour * 60 + endLocal.minute
                    }
                    ?: return@mapNotNull null
                if (slotEndMinutes >= slotStartMinutes) {
                    return@mapNotNull null
                }
                val selectedDayIndex = date.dayOfWeek.toRentalDayIndex()
                val slotDayIndexes = slot.normalizedDaysOfWeek()
                if (slotDayIndexes.isNotEmpty() && selectedDayIndex !in slotDayIndexes) {
                    return@mapNotNull null
                }
                if (date < slotStart.date) {
                    return@mapNotNull null
                }
                val slotEndDate = slot.endDate?.toLocalDateTime(slotTimeZone)?.date
                if (slotEndDate != null && date > slotEndDate) {
                    return@mapNotNull null
                }
                return@mapNotNull (MINUTES_PER_DAY + slotEndMinutes).roundUpToRentalInterval()
            }

            val slotEndInstant = slot.endDate ?: return@mapNotNull null
            val slotEnd = slotEndInstant.toLocalDateTime(slotTimeZone)
            val selectedDayStart = date.toInstantAtMinutes(0, slotTimeZone)
            if (slotEndInstant <= selectedDayStart || slotStart.date > date) {
                return@mapNotNull null
            }

            val endDayOffset = slotEnd.date.toEpochDays() - date.toEpochDays()
            // Multi-day inventory is exposed again on each selected date. Only
            // a slot ending on the following date extends this grid, which
            // keeps long availability windows from materializing huge columns.
            if (endDayOffset <= 0 || endDayOffset > 1) {
                return@mapNotNull null
            }
            val endMinutes = (endDayOffset * MINUTES_PER_DAY.toLong()) +
                (slotEnd.hour * 60) +
                slotEnd.minute
            endMinutes
                .takeIf { minutes -> minutes <= Int.MAX_VALUE.toLong() - SLOT_INTERVAL_MINUTES }
                ?.toInt()
                ?.roundUpToRentalInterval()
        }
        .maxOrNull()
    return extendedTimelineEnd?.coerceAtLeast(RENTAL_TIMELINE_END_MINUTES)
        ?: RENTAL_TIMELINE_END_MINUTES
}

private fun Int.roundUpToRentalInterval(): Int {
    val remainder = this % SLOT_INTERVAL_MINUTES
    return if (remainder == 0) this else this + SLOT_INTERVAL_MINUTES - remainder
}

private fun isSupportedRentalMinuteRange(startMinutes: Int, endMinutes: Int): Boolean {
    return startMinutes >= RENTAL_TIMELINE_START_MINUTES &&
        endMinutes > startMinutes
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
internal const val RENTAL_UNAVAILABLE_LABEL = "Unavailable"
internal const val MINUTES_PER_DAY = 24 * 60
internal const val RENTAL_TIMELINE_START_MINUTES = 0
internal const val RENTAL_TIMELINE_END_MINUTES = MINUTES_PER_DAY
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

internal fun Instant.toDisplayDateTime(timeZone: TimeZone = TimeZone.currentSystemDefault()): String {
    return toLocalDateTime(timeZone).format(dateTimeFormat)
}

internal fun Field.displayLabel(): String {
    val fieldName = name
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?: "Field $fieldNumber"
    val facilityName = facility
        ?.name
        ?.trim()
        ?.takeIf(String::isNotBlank)

    if (facilityName == null) {
        return fieldName
    }

    val normalizedFieldName = fieldName.lowercase()
    val normalizedFacilityName = facilityName.lowercase()
    return if (normalizedFieldName == normalizedFacilityName || normalizedFieldName.contains(normalizedFacilityName)) {
        fieldName
    } else {
        "$facilityName - $fieldName"
    }
}

internal fun TimeSlot.matchesRentalSelection(
    rangeStart: Instant,
    rangeEnd: Instant,
    fieldId: String,
    fallbackTimeZone: TimeZone = TimeZone.currentSystemDefault(),
): Boolean {
    if (rangeEnd <= rangeStart) {
        return false
    }

    val slotTimeZone = this.timeZone.toTimeZoneOrUtc(fallbackTimeZone)
    val slotStartLocal = startDate.toLocalDateTime(slotTimeZone)
    val selectedStartLocal = rangeStart.toLocalDateTime(slotTimeZone)
    val selectedEndLocal = rangeEnd.toLocalDateTime(slotTimeZone)

    if (!repeating) {
        val explicitSlotEnd = endDate ?: return false
        return rangeStart >= startDate && rangeEnd <= explicitSlotEnd
    }

    val selectedDaySpan = selectedEndLocal.date.toEpochDays() - selectedStartLocal.date.toEpochDays()
    if (selectedDaySpan !in 0L..1L) {
        return false
    }
    val selectedStartMinutes = selectedStartLocal.hour * 60 + selectedStartLocal.minute
    val selectedEndMinutes = (selectedDaySpan.toInt() * MINUTES_PER_DAY) +
        selectedEndLocal.hour * 60 +
        selectedEndLocal.minute

    val slotStartMinutes = startTimeMinutes ?: (slotStartLocal.hour * 60 + slotStartLocal.minute)
    val slotEndMinutes = endTimeMinutes ?: endDate
        ?.toLocalDateTime(slotTimeZone)
        ?.let { endLocal -> endLocal.hour * 60 + endLocal.minute }
        ?: return false

    if (slotEndMinutes == slotStartMinutes) {
        return false
    }
    val normalizedSlotEndMinutes = if (slotEndMinutes < slotStartMinutes) {
        MINUTES_PER_DAY + slotEndMinutes
    } else {
        slotEndMinutes
    }
    if (selectedStartMinutes < slotStartMinutes || selectedEndMinutes > normalizedSlotEndMinutes) {
        return false
    }

    val selectedDayIndex = selectedStartLocal.dayOfWeek.toRentalDayIndex()
    val slotDayIndexes = normalizedDaysOfWeek()
    if (slotDayIndexes.isNotEmpty() && selectedDayIndex !in slotDayIndexes) {
        return false
    }

    if (selectedStartLocal.date < slotStartLocal.date) {
        return false
    }
    if (endDate != null && selectedStartLocal.date > endDate!!.toLocalDateTime(slotTimeZone).date) {
        return false
    }
    return true
}

internal fun TimeSlot.toRentalAvailabilityLabel(
    fallbackTimeZone: TimeZone = TimeZone.currentSystemDefault(),
): String {
    val slotTimeZone = timeZone.toTimeZoneOrUtc(fallbackTimeZone)
    val slotStart = startTimeMinutes.toClockLabel()
    val slotEnd = endTimeMinutes.toClockLabel()
    val dayLabel = toMondayBasedDayIndex(slotTimeZone).toDayLabel()
    return if (slotStart != null && slotEnd != null) {
        "$dayLabel $slotStart - $slotEnd"
    } else {
        "Available"
    }
}

internal fun TimeSlot.slotDurationMinutes(timeZone: TimeZone): Int {
    if (!repeating) {
        val explicitSlotEnd = endDate ?: return Int.MAX_VALUE
        return (explicitSlotEnd - startDate).inWholeMinutes
            .takeIf { duration -> duration > 0 }
            ?.coerceAtMost(Int.MAX_VALUE.toLong())
            ?.toInt()
            ?: Int.MAX_VALUE
    }
    val slotTimeZone = this.timeZone.toTimeZoneOrUtc(timeZone)
    val startMinutesValue = startTimeMinutes ?: startDate.toLocalDateTime(slotTimeZone).let { local ->
        local.hour * 60 + local.minute
    }
    val endMinutesValue = endTimeMinutes ?: endDate?.toLocalDateTime(slotTimeZone)?.let { local ->
        local.hour * 60 + local.minute
    } ?: return Int.MAX_VALUE

    if (endMinutesValue == startMinutesValue) {
        return Int.MAX_VALUE
    }
    val normalizedEndMinutes = if (endMinutesValue < startMinutesValue) {
        MINUTES_PER_DAY + endMinutesValue
    } else {
        endMinutesValue
    }
    return normalizedEndMinutes - startMinutesValue
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

internal fun RentalFieldOption.resolvedRentalTimeZone(
    fallback: TimeZone = TimeZone.currentSystemDefault(),
): TimeZone {
    return rentalSlots
        .asSequence()
        .map { slot -> slot.timeZone }
        .firstOrNull { value -> value.isNotBlank() }
        .toTimeZoneOrUtc(fallback)
}

internal fun Int?.toClockLabel(): String? {
    val minutes = this ?: return null
    if (minutes < 0) {
        return null
    }
    val dayOffset = minutes / MINUTES_PER_DAY
    val hour24 = (minutes / 60) % 24
    val minute = minutes % 60
    val hour12 = when (val normalized = hour24 % 12) {
        0 -> 12
        else -> normalized
    }
    val suffix = if (hour24 < 12) "AM" else "PM"
    val minuteText = if (minute < 10) "0$minute" else minute.toString()
    val daySuffix = when (dayOffset) {
        0 -> ""
        1 -> " next day"
        else -> " +$dayOffset days"
    }
    return "$hour12:$minuteText $suffix$daySuffix"
}

internal enum class RentalSlotAccessibilityState(val spokenLabel: String) {
    AVAILABLE("available"),
    BOOKED("booked"),
    PAST("in the past"),
    SELECTED("selected"),
    UNAVAILABLE("unavailable"),
}

internal fun rentalSlotAccessibilityLabel(
    fieldLabel: String,
    date: LocalDate,
    startMinutes: Int,
    endMinutes: Int,
    state: RentalSlotAccessibilityState,
    priceCents: Int? = null,
): String {
    val priceLabel = when {
        priceCents == 0 -> ", free"
        priceCents != null && priceCents > 0 -> ", ${priceCents.toCurrencyAccessibilityLabel()}"
        else -> ""
    }
    return "$fieldLabel, ${date.timelineDateTimeLabel(startMinutes)} to " +
        "${date.timelineDateTimeLabel(endMinutes)}, ${state.spokenLabel}$priceLabel"
}

internal fun rentalSelectionAccessibilityLabel(
    fieldLabel: String,
    date: LocalDate,
    startMinutes: Int,
    endMinutes: Int,
): String {
    return "$fieldLabel rental, ${date.timelineDateTimeLabel(startMinutes)} to " +
        date.timelineDateTimeLabel(endMinutes)
}

private fun LocalDate.timelineDateTimeLabel(minutesFromStartOfDay: Int): String {
    val dayOffset = minutesFromStartOfDay / MINUTES_PER_DAY
    val date = LocalDate.fromEpochDays(toEpochDays() + dayOffset)
    val minuteOfDay = minutesFromStartOfDay % MINUTES_PER_DAY
    return "$date ${minuteOfDay.toClockLabel().orEmpty()}"
}

private fun Int.toCurrencyAccessibilityLabel(): String {
    val dollars = this / 100
    val cents = (this % 100).toString().padStart(2, '0')
    return "\$$dollars.$cents"
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
