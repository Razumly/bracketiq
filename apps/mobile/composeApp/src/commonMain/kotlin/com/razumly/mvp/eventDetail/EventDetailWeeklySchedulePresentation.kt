package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.EventSearchOccurrence
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.resolveOneTimeInterval
import com.razumly.mvp.core.data.dataTypes.resolveRepeatingOccurrence
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.util.resolvedTimeZone
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Clock
import kotlin.time.Instant

internal data class WeeklySessionOption(
    val id: String,
    val slotId: String?,
    val occurrenceDate: String,
    val start: Instant,
    val end: Instant,
    val label: String,

    val divisionLabel: String,
)
private fun EventSearchOccurrence.isWithinRange(
    rangeStart: Instant?,
    rangeEnd: Instant?,
): Boolean {
    if (rangeStart != null && end <= rangeStart) {
        return false
    }
    if (rangeEnd != null && start > rangeEnd) {
        return false
    }
    return true
}

private fun buildOneTimeSessionOption(
    slot: TimeSlot,
    slotTimeZone: TimeZone,
    divisionLabel: String,
): WeeklySessionOption? {
    val resolved = runCatching { slot.resolveOneTimeInterval() }.getOrNull() ?: return null
    val slotId = slot.id.trim().takeIf(String::isNotBlank)
    return WeeklySessionOption(
        id = "${slotId ?: "slot"}-${resolved.localDate}",
        slotId = slotId,
        occurrenceDate = resolved.localDate,
        start = resolved.start,
        end = resolved.end,
        label = formatWeeklySessionLabel(resolved.start, resolved.end, slotTimeZone),
        divisionLabel = divisionLabel,
    )
}

internal fun buildWeeklySessionOptions(
    event: Event,
    timeSlots: List<TimeSlot>,
    now: Instant = Clock.System.now(),
): List<WeeklySessionOption> {
    if (
        event.eventType != EventType.WEEKLY_EVENT ||
            event.isArchived() ||
            timeSlots.isEmpty()
    ) {
        return emptyList()
    }

    val timeZone = event.resolvedTimeZone()
    val fallbackDivisionIds = event.divisions
        .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .distinct()
    val sessions = mutableListOf<WeeklySessionOption>()
    val safeWeekCount = 3

    timeSlots.forEach { slot ->
        val slotTimeZone = slot.resolvedTimeZone(timeZone)
        val today = now.toLocalDateTime(slotTimeZone).date
        val normalizedDays = slot.normalizedDaysOfWeek()
        if (slot.repeating && normalizedDays.isEmpty()) {
            return@forEach
        }

        val slotStartDate = slot.startDate.toLocalDateTime(slotTimeZone).date
        val eventStartDate = runCatching {
            event.start.toLocalDateTime(slotTimeZone).date
        }.getOrNull()
        val slotEndDate = slot.endDate
            ?.toLocalDateTime(slotTimeZone)
            ?.date
            ?.takeIf { endDate -> endDate >= slotStartDate }
        val eventEndDate = if (!event.noFixedEndDateTime) {
            event.end.toLocalDateTime(slotTimeZone).date
        } else {
            null
        }
        val occurrenceEndDate = listOfNotNull(slotEndDate, eventEndDate).minOrNull()
        val anchorDate = listOfNotNull(today, slotStartDate, eventStartDate).maxOrNull()
            ?: slotStartDate
        val anchorWeekStart = startOfWeekMonday(anchorDate)

        val slotDivisionIds = slot.normalizedDivisionIds()
            .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
            .filter(String::isNotBlank)
            .distinct()
        val effectiveDivisionIds = if (slotDivisionIds.isNotEmpty()) {
            slotDivisionIds
        } else {
            fallbackDivisionIds
        }
        val divisionLabel = effectiveDivisionIds
            .map { divisionId -> divisionId.toDivisionDisplayLabel(event.divisionDetails) }
            .filter(String::isNotBlank)
            .distinct()
            .joinToString(", ")
            .ifBlank { "All divisions" }

        if (!slot.repeating) {
            val option = buildOneTimeSessionOption(slot, slotTimeZone, divisionLabel)
            val occurrenceDate = option?.occurrenceDate?.let(LocalDate::parse)
            val rangeEnd = anchorDate.plus(DatePeriod(days = safeWeekCount * 7))
            if (
                option != null &&
                    occurrenceDate != null &&
                    occurrenceDate >= anchorDate &&
                    occurrenceDate < rangeEnd &&
                    (occurrenceEndDate == null || occurrenceDate <= occurrenceEndDate) &&
                    (eventStartDate == null || option.start >= event.start) &&
                    (event.noFixedEndDateTime || option.end <= event.end)
            ) {
                sessions += option
            }
            return@forEach
        }

        for (weekOffset in 0 until safeWeekCount) {
            val weekStart = anchorWeekStart.plus(DatePeriod(days = weekOffset * 7))
            normalizedDays.forEach { weekday ->
                val occurrenceDate = weekStart.plus(DatePeriod(days = weekday))
                if (occurrenceDate < anchorDate || occurrenceDate < slotStartDate) {
                    return@forEach
                }
                if (occurrenceEndDate != null && occurrenceDate > occurrenceEndDate) {
                    return@forEach
                }
                val resolved = slot.resolveRepeatingOccurrence(occurrenceDate)
                val sessionStart = resolved.start
                val sessionEnd = resolved.end
                if (eventStartDate != null && sessionStart < event.start) {
                    return@forEach
                }
                if (!event.noFixedEndDateTime && sessionEnd > event.end) {
                    return@forEach
                }
                val slotId = slot.id.trim().takeIf(String::isNotBlank)
                sessions += WeeklySessionOption(
                    id = "${slotId ?: "slot"}-${occurrenceDate}",
                    slotId = slotId,
                    occurrenceDate = occurrenceDate.toString(),
                    start = sessionStart,
                    end = sessionEnd,
                    label = formatWeeklySessionLabel(sessionStart, sessionEnd, slotTimeZone),
                    divisionLabel = divisionLabel,
                )
            }
        }
    }


    return sessions
        .distinctBy { session -> session.id }
        .sortedBy { session -> session.start }
}

internal fun Event.withNextWeeklyOccurrenceForDiscover(
    timeSlots: List<TimeSlot>,
    now: Instant = Clock.System.now(),
    occurrenceRangeStart: Instant? = null,
    occurrenceRangeEnd: Instant? = null,
): Event {
    if (eventType != EventType.WEEKLY_EVENT) {
        return this
    }
    if (isArchived()) {
        return copy(
            scheduleText = null,
            dateDisplayMode = null,
            dateDisplayText = null,
        ).also { projected ->
            projected.nextOccurrence = null
        }
    }
    val serverOccurrence = nextOccurrence
        ?.takeIf { occurrence ->
            occurrence.end > now &&
                occurrence.isWithinRange(occurrenceRangeStart, occurrenceRangeEnd)
        }
    if (serverOccurrence != null) {
        return copy(
            scheduleText = null,
            dateDisplayMode = null,
            dateDisplayText = null,
        ).also { projected ->
            projected.nextOccurrence = serverOccurrence
        }
    }

    val localAnchor = if (occurrenceRangeStart != null && occurrenceRangeStart > now) {
        occurrenceRangeStart
    } else {
        now
    }
    val localOccurrence = runCatching {
        buildWeeklySessionOptions(
            event = this,
            timeSlots = timeSlots.filter { slot -> slot.repeating },
            now = localAnchor,
        ).firstOrNull { option ->
            option.end > now &&
                option.start >= now &&
                (occurrenceRangeStart == null || option.end > occurrenceRangeStart) &&
                (occurrenceRangeEnd == null || option.start <= occurrenceRangeEnd)
        }
    }.getOrNull()
    if (localOccurrence == null) {
        return copy(
            scheduleText = null,
            dateDisplayMode = null,
            dateDisplayText = null,
        ).also { projected ->
            projected.nextOccurrence = null
        }
    }
    val occurrenceSlotId = localOccurrence.slotId
        ?: return copy(
            scheduleText = null,
            dateDisplayMode = null,
            dateDisplayText = null,
        ).also { projected ->
            projected.nextOccurrence = null
        }
    return copy(
        scheduleText = null,
        dateDisplayMode = null,
        dateDisplayText = null,
    ).also { projected ->
        projected.nextOccurrence = EventSearchOccurrence(
            slotId = occurrenceSlotId,
            occurrenceDate = localOccurrence.occurrenceDate,
            start = localOccurrence.start,
            end = localOccurrence.end,
            timeZone = timeSlots
                .firstOrNull { slot -> slot.id == occurrenceSlotId }
                ?.timeZone
                ?: timeZone,
        )
    }
}

internal fun buildWeeklyScheduleOptions(
    event: Event,
    timeSlots: List<TimeSlot>,
): List<WeeklySessionOption> {
    if (
        event.eventType != EventType.WEEKLY_EVENT ||
            event.isArchived() ||
            timeSlots.isEmpty()
    ) {
        return emptyList()
    }

    val timeZone = event.resolvedTimeZone()
    val fallbackScheduleWindowDays = 365
    val fallbackDivisionIds = event.divisions
        .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .distinct()
    val sessions = mutableListOf<WeeklySessionOption>()

    timeSlots.forEach { slot ->
        val slotTimeZone = slot.resolvedTimeZone(timeZone)
        val eventStartDate = event.start.toLocalDateTime(slotTimeZone).date
        val normalizedDays = slot.normalizedDaysOfWeek()
        if (slot.repeating && normalizedDays.isEmpty()) {
            return@forEach
        }

        val slotStartDate = slot.startDate.toLocalDateTime(slotTimeZone).date
        val effectiveStartDate = if (eventStartDate > slotStartDate) eventStartDate else slotStartDate
        val slotEndDate = slot.endDate
            ?.toLocalDateTime(slotTimeZone)
            ?.date
            ?.takeIf { endDate -> endDate >= effectiveStartDate }
        val eventEndDate = if (!event.noFixedEndDateTime) {
            event.end.toLocalDateTime(slotTimeZone).date
        } else {
            null
        }
        val effectiveEndDate = listOfNotNull(slotEndDate, eventEndDate).minOrNull()
            ?: effectiveStartDate.plus(DatePeriod(days = fallbackScheduleWindowDays))
        val anchorWeekStart = startOfWeekMonday(effectiveStartDate)

        val slotDivisionIds = slot.normalizedDivisionIds()
            .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
            .filter(String::isNotBlank)
            .distinct()
        val effectiveDivisionIds = if (slotDivisionIds.isNotEmpty()) {
            slotDivisionIds
        } else {
            fallbackDivisionIds
        }
        val divisionLabel = effectiveDivisionIds
            .map { divisionId -> divisionId.toDivisionDisplayLabel(event.divisionDetails) }
            .filter(String::isNotBlank)
            .distinct()
            .joinToString(", ")
            .ifBlank { "All divisions" }

        if (!slot.repeating) {
            val option = buildOneTimeSessionOption(slot, slotTimeZone, divisionLabel)
            val occurrenceDate = option?.occurrenceDate?.let(LocalDate::parse)
            if (
                option != null &&
                    occurrenceDate != null &&
                    occurrenceDate >= effectiveStartDate &&
                    occurrenceDate <= effectiveEndDate &&
                    option.start >= event.start &&
                    (event.noFixedEndDateTime || option.end <= event.end)
            ) {
                sessions += option
            }
            return@forEach
        }

        var weekOffset = 0
        while (true) {
            val weekStart = anchorWeekStart.plus(DatePeriod(days = weekOffset * 7))
            if (weekStart > effectiveEndDate) {
                break
            }
            normalizedDays.forEach { weekday ->
                val occurrenceDate = weekStart.plus(DatePeriod(days = weekday))
                if (occurrenceDate < effectiveStartDate || occurrenceDate < slotStartDate) {
                    return@forEach
                }
                if (occurrenceDate > effectiveEndDate) {
                    return@forEach
                }
                val resolved = slot.resolveRepeatingOccurrence(occurrenceDate)
                val sessionStart = resolved.start
                val sessionEnd = resolved.end
                if (sessionStart < event.start) {
                    return@forEach
                }
                if (!event.noFixedEndDateTime && sessionEnd > event.end) {
                    return@forEach
                }
                val slotId = slot.id.trim().takeIf(String::isNotBlank)
                sessions += WeeklySessionOption(
                    id = "${slotId ?: "slot"}-${occurrenceDate}",
                    slotId = slotId,
                    occurrenceDate = occurrenceDate.toString(),
                    start = sessionStart,
                    end = sessionEnd,
                    label = formatWeeklySessionLabel(sessionStart, sessionEnd, slotTimeZone),
                    divisionLabel = divisionLabel,
                )
            }
            weekOffset += 1
        }
    }

    return sessions
        .distinctBy { session -> session.id }
        .sortedBy { session -> session.start }
}

private fun startOfWeekMonday(date: LocalDate): LocalDate {
    val offsetFromMonday = date.dayOfWeek.toWeeklyDayIndex()
    return date.minus(DatePeriod(days = offsetFromMonday))
}

private fun formatWeeklySessionLabel(
    start: Instant,
    end: Instant,
    timeZone: TimeZone,
): String {
    val localStart = start.toLocalDateTime(timeZone)
    val localEnd = end.toLocalDateTime(timeZone)
    val weekdayLabel = weekdayShortLabel(localStart.date)
    val yearSuffix = (localStart.year % 100).toString().padStart(2, '0')
    val monthNumber = localStart.month.ordinal + 1
    val dateLabel = "$monthNumber/${localStart.day}/$yearSuffix"
    val startLabel = formatMinutesTo12Hour(localStart.hour * 60 + localStart.minute)
    val endLabel = formatMinutesTo12Hour(localEnd.hour * 60 + localEnd.minute)
    return "$weekdayLabel $dateLabel, $startLabel-$endLabel"
}

private fun weekdayShortLabel(date: LocalDate): String =
    when (date.dayOfWeek) {
        DayOfWeek.MONDAY -> "Mon"
        DayOfWeek.TUESDAY -> "Tue"
        DayOfWeek.WEDNESDAY -> "Wed"
        DayOfWeek.THURSDAY -> "Thu"
        DayOfWeek.FRIDAY -> "Fri"
        DayOfWeek.SATURDAY -> "Sat"
        DayOfWeek.SUNDAY -> "Sun"
    }

private fun DayOfWeek.toWeeklyDayIndex(): Int =
    when (this) {
        DayOfWeek.MONDAY -> 0
        DayOfWeek.TUESDAY -> 1
        DayOfWeek.WEDNESDAY -> 2
        DayOfWeek.THURSDAY -> 3
        DayOfWeek.FRIDAY -> 4
        DayOfWeek.SATURDAY -> 5
        DayOfWeek.SUNDAY -> 6
    }

private fun formatMinutesTo12Hour(totalMinutes: Int): String {
    val normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440
    val hour24 = normalizedMinutes / 60
    val minute = normalizedMinutes % 60
    val meridiem = if (hour24 >= 12) "PM" else "AM"
    val hour12 = when (val normalizedHour = hour24 % 12) {
        0 -> 12
        else -> normalizedHour
    }
    return "$hour12:${minute.toString().padStart(2, '0')} $meridiem"
}
