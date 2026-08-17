package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.util.resolvedTimeZone
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime

internal data class WeeklySessionOption(
    val id: String,
    val slotId: String?,
    val occurrenceDate: String,
    val start: Instant,
    val end: Instant,
    val label: String,
    val divisionLabel: String,
)

internal fun buildWeeklySessionOptions(
    event: Event,
    timeSlots: List<TimeSlot>,
): List<WeeklySessionOption> {
    if (event.eventType != EventType.WEEKLY_EVENT || timeSlots.isEmpty()) {
        return emptyList()
    }

    val timeZone = event.resolvedTimeZone()
    val today = Clock.System.now().toLocalDateTime(timeZone).date
    val fallbackDivisionIds = event.divisions
        .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .distinct()
    val sessions = mutableListOf<WeeklySessionOption>()
    val safeWeekCount = 3

    timeSlots.forEach { slot ->
        val slotTimeZone = slot.resolvedTimeZone(timeZone)
        val normalizedDays = slot.normalizedDaysOfWeek()
        val startMinutes = slot.startTimeMinutes
        val endMinutes = slot.endTimeMinutes
        if (normalizedDays.isEmpty() || startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
            return@forEach
        }

        val slotStartDate = slot.startDate.toLocalDateTime(slotTimeZone).date
        val rawSlotEndDate = slot.endDate?.toLocalDateTime(slotTimeZone)?.date
        val slotEndDate = rawSlotEndDate?.takeIf { endDate ->
            endDate > slotStartDate
        }
        val anchorDate = if (today > slotStartDate) today else slotStartDate
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

        for (weekOffset in 0 until safeWeekCount) {
            val weekStart = anchorWeekStart.plus(DatePeriod(days = weekOffset * 7))
            normalizedDays.forEach { weekday ->
                val occurrenceDate = weekStart.plus(DatePeriod(days = weekday))
                if (occurrenceDate < anchorDate || occurrenceDate < slotStartDate) {
                    return@forEach
                }
                if (slotEndDate != null && occurrenceDate > slotEndDate) {
                    return@forEach
                }

                val baseInstant = occurrenceDate.atStartOfDayIn(slotTimeZone)
                val sessionStart = baseInstant + startMinutes.minutes
                val sessionEnd = baseInstant + endMinutes.minutes
                if (sessionEnd <= sessionStart) {
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

internal fun buildWeeklyScheduleOptions(
    event: Event,
    timeSlots: List<TimeSlot>,
): List<WeeklySessionOption> {
    if (event.eventType != EventType.WEEKLY_EVENT || timeSlots.isEmpty()) {
        return emptyList()
    }

    val timeZone = event.resolvedTimeZone()
    val eventStartDate = event.start.toLocalDateTime(timeZone).date
    val fallbackScheduleWindowDays = 365
    val fallbackDivisionIds = event.divisions
        .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .distinct()
    val sessions = mutableListOf<WeeklySessionOption>()

    timeSlots.forEach { slot ->
        val slotTimeZone = slot.resolvedTimeZone(timeZone)
        val normalizedDays = slot.normalizedDaysOfWeek()
        val startMinutes = slot.startTimeMinutes
        val endMinutes = slot.endTimeMinutes
        if (normalizedDays.isEmpty() || startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
            return@forEach
        }

        val slotStartDate = slot.startDate.toLocalDateTime(slotTimeZone).date
        val effectiveStartDate = if (eventStartDate > slotStartDate) eventStartDate else slotStartDate
        val slotEndDate = slot.endDate?.toLocalDateTime(slotTimeZone)?.date
            ?.takeIf { endDate -> endDate >= effectiveStartDate }
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

        var weekOffset = 0
        while (true) {
            val weekStart = anchorWeekStart.plus(DatePeriod(days = weekOffset * 7))
            if (weekStart > slotEndDate) {
                break
            }
            normalizedDays.forEach { weekday ->
                val occurrenceDate = weekStart.plus(DatePeriod(days = weekday))
                if (occurrenceDate < effectiveStartDate || occurrenceDate < slotStartDate) {
                    return@forEach
                }
                if (occurrenceDate > slotEndDate) {
                    return@forEach
                }

                val baseInstant = occurrenceDate.atStartOfDayIn(slotTimeZone)
                val sessionStart = baseInstant + startMinutes.minutes
                val sessionEnd = baseInstant + endMinutes.minutes
                if (sessionEnd <= sessionStart) {
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
