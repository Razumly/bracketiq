package com.razumly.mvp.core.data.dataTypes

import kotlinx.datetime.DatePeriod
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.offsetAt
import kotlinx.datetime.plus
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import kotlinx.serialization.Contextual
import kotlinx.serialization.Serializable
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private val dateOnlyPattern = Regex("""^\d{4}-\d{2}-\d{2}$""")
private val dateTimeWithoutSecondsPattern = Regex("""^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$""")
private val localDateTimePattern = Regex("""^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$""")

@OptIn(ExperimentalTime::class)
private fun parseSlotInstant(value: String, timeZone: String): Instant {
    val trimmed = value.trim()
    runCatching { Instant.parse(trimmed) }
        .getOrNull()
        ?.let { return it }

    val normalized = when {
        dateOnlyPattern.matches(trimmed) -> "${trimmed}T00:00:00"
        dateTimeWithoutSecondsPattern.matches(trimmed) -> "${trimmed}:00"
        localDateTimePattern.matches(trimmed) -> trimmed
        else -> trimmed
    }
    val zone = TimeZone.of(timeZone.trim().takeIf(String::isNotBlank) ?: "UTC")
    return LocalDateTime.parse(normalized).toInstant(zone)
}

@Serializable
@OptIn(ExperimentalTime::class)
data class TimeSlot(
    val id: String,
    val dayOfWeek: Int?,
    val daysOfWeek: List<Int>? = null,
    val divisions: List<String>? = null,
    val startTimeMinutes: Int?,
    val endTimeMinutes: Int?,
    @Contextual val startDate: Instant,
    val timeZone: String = "UTC",
    val repeating: Boolean,
    @Contextual val endDate: Instant?,
    // Public rental projections intentionally omit field associations. The exact request-to-result
    // association is retained by the Room query snapshot rather than fabricated in this record.
    val scheduledFieldId: String? = null,
    val scheduledFieldIds: List<String>? = null,
    val price: Int?,
    val requiredTemplateIds: List<String> = emptyList(),
    val hostRequiredTemplateIds: List<String> = emptyList(),
    val sourceType: String? = null,
    val rentalBookingId: String? = null,
    val rentalBookingItemId: String? = null,
    val rentalLocked: Boolean? = null,
)

@Serializable
@OptIn(ExperimentalTime::class)
data class TimeSlotDTO(
    val id: String? = null,
    val dayOfWeek: Int? = null,
    val daysOfWeek: List<Int>? = null,
    val divisions: List<String>? = null,
    val startTimeMinutes: Int? = null,
    val endTimeMinutes: Int? = null,
    val startDate: String,
    val timeZone: String = "UTC",
    val repeating: Boolean = false,
    val endDate: String? = null,
    val scheduledFieldId: String? = null,
    val scheduledFieldIds: List<String>? = null,
    val price: Int? = null,
    val requiredTemplateIds: List<String> = emptyList(),
    val hostRequiredTemplateIds: List<String> = emptyList(),
    val sourceType: String? = null,
    val rentalBookingId: String? = null,
    val rentalBookingItemId: String? = null,
    val rentalLocked: Boolean? = null,
) {
    fun toTimeSlot(id: String): TimeSlot =
        TimeSlot(
            id = id,
            dayOfWeek = dayOfWeek,
            daysOfWeek = daysOfWeek ?: dayOfWeek?.let { listOf(it) },
            divisions = divisions
                ?.map(String::trim)
                ?.filter(String::isNotBlank)
                ?.distinct()
                ?: emptyList(),
            startTimeMinutes = startTimeMinutes,
            endTimeMinutes = endTimeMinutes,
            startDate = parseSlotInstant(startDate, timeZone),
            timeZone = timeZone,
            repeating = repeating,
            endDate = endDate?.let { parseSlotInstant(it, timeZone) },
            scheduledFieldId = scheduledFieldId ?: scheduledFieldIds?.firstOrNull(),
            scheduledFieldIds = (scheduledFieldIds ?: scheduledFieldId?.let(::listOf) ?: emptyList())
                .map(String::trim)
                .filter(String::isNotBlank)
                .distinct(),
            price = price,
            requiredTemplateIds = requiredTemplateIds
                .map(String::trim)
                .filter(String::isNotBlank)
                .distinct(),
            hostRequiredTemplateIds = hostRequiredTemplateIds
                .map(String::trim)
                .filter(String::isNotBlank)
                .distinct(),
            sourceType = sourceType?.trim()?.takeIf(String::isNotBlank),
            rentalBookingId = rentalBookingId?.trim()?.takeIf(String::isNotBlank),
            rentalBookingItemId = rentalBookingItemId?.trim()?.takeIf(String::isNotBlank),
            rentalLocked = rentalLocked,
        )
}

fun TimeSlot.normalizedDaysOfWeek(): List<Int> {
    val source = when {
        !daysOfWeek.isNullOrEmpty() -> daysOfWeek
        dayOfWeek != null -> listOf(dayOfWeek)
        else -> emptyList()
    }
    return source
        .map { ((it % 7) + 7) % 7 }
        .distinct()
        .sorted()
}

fun TimeSlot.normalizedScheduledFieldIds(): List<String> {
    val source = when {
        !scheduledFieldIds.isNullOrEmpty() -> scheduledFieldIds
        !scheduledFieldId.isNullOrBlank() -> listOf(scheduledFieldId)
        else -> emptyList()
    }
    return source
        .map(String::trim)
        .filter(String::isNotBlank)
        .distinct()
}

fun TimeSlot.normalizedDivisionIds(): List<String> {
    return (divisions ?: emptyList())
        .map(String::trim)
        .filter(String::isNotBlank)
        .distinct()
}

fun TimeSlot.hasOvernightWindow(): Boolean {
    if (!repeating) return false
    val start = startTimeMinutes ?: return false
    val end = endTimeMinutes ?: return false
    return end == 24 * 60 || end <= start
}

class RepeatingTimeSlotValidationException(message: String) : IllegalArgumentException(message)

@OptIn(ExperimentalTime::class)
data class ResolvedRepeatingTimeSlotInterval(
    val slotId: String,
    val occurrenceDate: LocalDate,
    val endDate: LocalDate,
    val start: Instant,
    val end: Instant,
    val durationMinutes: Long,
    val startTimeMinutes: Int,
    val endTimeMinutes: Int,
    val timeZone: String,
    val isOvernight: Boolean,
    val nextWeekday: String?,
    val resourceIds: List<String>,
    val divisionIds: List<String>,
)

@OptIn(ExperimentalTime::class)
private fun TimeSlot.strictTimeZone(): TimeZone {
    val zoneId = timeZone.trim().takeIf(String::isNotBlank) ?: "UTC"
    return try {
        TimeZone.of(zoneId)
    } catch (error: IllegalArgumentException) {
        throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$id\" has an invalid time zone \"$zoneId\".",
        )
    }
}

@OptIn(ExperimentalTime::class)
private fun resolveStrictLocalDateTime(
    localDateTime: LocalDateTime,
    timeZone: TimeZone,
    slotId: String,
): Instant {
    val localAsUtc = localDateTime.toInstant(TimeZone.UTC)
    val offsets = buildSet {
        for (dayOffset in -3..3) {
            for (hourOffset in 0 until 24 step 6) {
                val probe = Instant.fromEpochSeconds(
                    localAsUtc.epochSeconds +
                        dayOffset.toLong() * 24L * 60L * 60L +
                        hourOffset.toLong() * 60L * 60L,
                )
                add(timeZone.offsetAt(probe))
            }
        }
    }
    val matches = offsets
        .map { offset ->
            Instant.fromEpochSeconds(localAsUtc.epochSeconds - offset.totalSeconds.toLong())
        }
        .filter { candidate -> candidate.toLocalDateTime(timeZone) == localDateTime }
        .distinct()

    return when {
        matches.size == 1 -> matches.single()
        matches.isEmpty() -> throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$slotId\" uses a local time that does not exist on " +
                "${localDateTime.date} in ${timeZone.id}.",
        )
        else -> throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$slotId\" uses an ambiguous local time on " +
                "${localDateTime.date} in ${timeZone.id}. Choose a different time.",
        )
    }
}

@OptIn(ExperimentalTime::class)
fun TimeSlot.resolveRepeatingOccurrence(occurrenceDate: LocalDate): ResolvedRepeatingTimeSlotInterval {
    if (!repeating) {
        throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$id\" is invalid: the slot must be marked as repeating.",
        )
    }
    val zone = strictTimeZone()
    val days = normalizedDaysOfWeek()
    if (days.isEmpty()) {
        throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$id\" is invalid: select at least one weekday.",
        )
    }
    val weekdayIndex = occurrenceDate.dayOfWeek.ordinal
    if (weekdayIndex !in days) {
        throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$id\" is invalid: $occurrenceDate is not a selected weekday.",
        )
    }
    val startMinutes = startTimeMinutes
        ?: throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$id\" is invalid: select a start time.",
        )
    val endMinutes = endTimeMinutes
        ?: throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$id\" is invalid: select an end time.",
        )
    if (startMinutes !in 0 until (24 * 60)) {
        throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$id\" is invalid: select a start time.",
        )
    }
    if (endMinutes !in 0..(24 * 60)) {
        throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$id\" is invalid: select an end time.",
        )
    }
    val configuredStartDate = startDate.toLocalDateTime(zone).date
    val configuredEndDate = endDate?.toLocalDateTime(zone)?.date
    if (configuredEndDate != null && configuredEndDate < configuredStartDate) {
        throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$id\" is invalid: the end date is before the start date.",
        )
    }
    if (occurrenceDate < configuredStartDate) {
        throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$id\" is invalid: the occurrence is before " +
                "the configured start date $configuredStartDate.",
        )
    }
    if (configuredEndDate != null && occurrenceDate > configuredEndDate) {
        throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$id\" is invalid: the occurrence is after " +
                "the configured end date $configuredEndDate.",
        )
    }

    val isOvernight = endMinutes == 24 * 60 || endMinutes <= startMinutes
    val resolvedEndDate = if (isOvernight) {
        occurrenceDate.plus(DatePeriod(days = 1))
    } else {
        occurrenceDate
    }
    val startLocal = LocalDateTime(
        occurrenceDate,
        LocalTime(startMinutes / 60, startMinutes % 60),
    )
    val endLocal = LocalDateTime(
        resolvedEndDate,
        LocalTime(
            if (endMinutes == 24 * 60) 0 else endMinutes / 60,
            if (endMinutes == 24 * 60) 0 else endMinutes % 60,
        ),
    )
    val resolvedStart = resolveStrictLocalDateTime(startLocal, zone, id)
    val resolvedEnd = resolveStrictLocalDateTime(endLocal, zone, id)
    if (resolvedEnd <= resolvedStart) {
        throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$id\" is invalid: the resolved end time is not after " +
                "the resolved start time.",
        )
    }
    val nextWeekday = if (isOvernight) {
        resolvedEndDate.dayOfWeek.name
            .lowercase()
            .replaceFirstChar(Char::uppercase)
    } else {
        null
    }
    return ResolvedRepeatingTimeSlotInterval(
        slotId = id,
        occurrenceDate = occurrenceDate,
        endDate = resolvedEndDate,
        start = resolvedStart,
        end = resolvedEnd,
        durationMinutes = (resolvedEnd - resolvedStart).inWholeMinutes,
        startTimeMinutes = startMinutes,
        endTimeMinutes = endMinutes,
        timeZone = zone.id,
        isOvernight = isOvernight,
        nextWeekday = nextWeekday,
        resourceIds = normalizedScheduledFieldIds(),
        divisionIds = normalizedDivisionIds(),
    )
}

@OptIn(ExperimentalTime::class)
fun TimeSlot.validateRepeatingTimeSlotOccurrences(maxDays: Int = 370) {
    if (!repeating) return
    val zone = strictTimeZone()
    val firstDate = startDate.toLocalDateTime(zone).date
    val configuredEndDate = endDate?.toLocalDateTime(zone)?.date
    if (configuredEndDate != null && configuredEndDate < firstDate) {
        throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$id\" is invalid: the end date is before the start date.",
        )
    }
    val validationEndDate = configuredEndDate
        ?: firstDate.plus(DatePeriod(days = maxDays))
    var currentDate = firstDate
    var daysChecked = 0
    while (currentDate <= validationEndDate && daysChecked <= maxDays) {
        if (normalizedDaysOfWeek().contains(currentDate.dayOfWeek.ordinal)) {
            resolveRepeatingOccurrence(currentDate)
        }
        currentDate = currentDate.plus(DatePeriod(days = 1))
        daysChecked += 1
    }
}

@OptIn(ExperimentalTime::class)
fun TimeSlot.enumerateRepeatingTimeSlotOccurrences(
    windowStart: Instant,
    windowEnd: Instant,
): List<ResolvedRepeatingTimeSlotInterval> {
    if (!repeating || windowEnd <= windowStart) {
        return emptyList()
    }
    val zone = strictTimeZone()
    val selectedDays = normalizedDaysOfWeek()
    val configuredStartDate = startDate.toLocalDateTime(zone).date
    val configuredEndDate = endDate?.toLocalDateTime(zone)?.date
    if (configuredEndDate != null && configuredEndDate < configuredStartDate) {
        throw RepeatingTimeSlotValidationException(
            "Repeating Time Slot \"$id\" is invalid: the end date is before the start date.",
        )
    }
    val firstDate = windowStart.toLocalDateTime(zone).date.minus(DatePeriod(days = 1))
    val lastDate = windowEnd.toLocalDateTime(zone).date.plus(DatePeriod(days = 1))
    val occurrences = mutableListOf<ResolvedRepeatingTimeSlotInterval>()
    var currentDate = firstDate
    while (currentDate <= lastDate) {
        if (
            currentDate >= configuredStartDate &&
                (configuredEndDate == null || currentDate <= configuredEndDate) &&
                selectedDays.contains(currentDate.dayOfWeek.ordinal)
        ) {
            val occurrence = resolveRepeatingOccurrence(currentDate)
            if (occurrence.start < windowEnd && occurrence.end > windowStart) {
                occurrences += occurrence
            }
        }
        currentDate = currentDate.plus(DatePeriod(days = 1))
    }
    return occurrences
}

@OptIn(ExperimentalTime::class)
data class ResolvedOneTimeTimeSlotInterval(
    val slotId: String,
    val start: Instant,
    val end: Instant,
    val localDate: String,
    val startTimeMinutes: Int,
    val endTimeMinutes: Int,
    val timeZone: String,
    val resourceIds: List<String>,
    val divisionIds: List<String>,
)

@OptIn(ExperimentalTime::class)
data class OneTimeTimeSlotConflictEvidence(
    val first: ResolvedOneTimeTimeSlotInterval,
    val second: ResolvedOneTimeTimeSlotInterval,
    val resourceId: String,
    val divisionId: String?,
    val firstDivisionScope: List<String>,
    val secondDivisionScope: List<String>,
)

class OneTimeTimeSlotValidationException(message: String) : IllegalArgumentException(message)

private fun Int.asLocalTime(): String =
    "${(this / 60).toString().padStart(2, '0')}:${(this % 60).toString().padStart(2, '0')}"

private fun ResolvedOneTimeTimeSlotInterval.localDescription(): String =
    "$localDate ${startTimeMinutes.asLocalTime()}–${endTimeMinutes.asLocalTime()} $timeZone"

@OptIn(ExperimentalTime::class)
fun TimeSlot.resolveOneTimeInterval(): ResolvedOneTimeTimeSlotInterval {
    if (repeating) {
        throw OneTimeTimeSlotValidationException(
            "One-Time Time Slot \"$id\" is invalid: the slot must be marked as non-repeating.",
        )
    }
    val zone = runCatching {
        TimeZone.of(timeZone.trim().takeIf(String::isNotBlank) ?: "UTC")
    }.getOrDefault(TimeZone.UTC)
    val startLocal = startDate.toLocalDateTime(zone)
    val endLocal = endDate?.toLocalDateTime(zone)
    val resolvedStartMinutes = startTimeMinutes ?: (startLocal.hour * 60 + startLocal.minute)
    val resolvedEndMinutes = endTimeMinutes ?: endLocal?.let { it.hour * 60 + it.minute }
    if (resolvedStartMinutes !in 0 until (24 * 60)) {
        throw OneTimeTimeSlotValidationException(
            "One-Time Time Slot \"$id\" is invalid: select a start time.",
        )
    }
    if (resolvedEndMinutes == null || resolvedEndMinutes !in 0 until (24 * 60)) {
        throw OneTimeTimeSlotValidationException(
            "One-Time Time Slot \"$id\" is invalid: select an end time.",
        )
    }
    if (resolvedEndMinutes <= resolvedStartMinutes) {
        throw OneTimeTimeSlotValidationException(
            "One-Time Time Slot \"$id\" is invalid: the end time must be after the start time on the same local date.",
        )
    }

    val localDate = startLocal.date.toString()
    val minuteAlignedStart = LocalDateTime
        .parse("${localDate}T${resolvedStartMinutes.asLocalTime()}:00")
        .toInstant(zone)
    val minuteAlignedEnd = LocalDateTime
        .parse("${localDate}T${resolvedEndMinutes.asLocalTime()}:00")
        .toInstant(zone)
    val resolvedStart = if (startLocal.hour * 60 + startLocal.minute == resolvedStartMinutes) {
        startDate
    } else {
        minuteAlignedStart
    }
    val resolvedEnd = if (
        endDate != null &&
        endLocal != null &&
        endLocal.date.toString() == localDate &&
        endLocal.hour * 60 + endLocal.minute == resolvedEndMinutes
    ) {
        endDate
    } else {
        minuteAlignedEnd
    }
    if (resolvedEnd <= resolvedStart) {
        throw OneTimeTimeSlotValidationException(
            "One-Time Time Slot \"$id\" is invalid: the exact interval cannot be resolved.",
        )
    }
    return ResolvedOneTimeTimeSlotInterval(
        slotId = id,
        start = resolvedStart,
        end = resolvedEnd,
        localDate = localDate,
        startTimeMinutes = resolvedStartMinutes,
        endTimeMinutes = resolvedEndMinutes,
        timeZone = zone.id,
        resourceIds = normalizedScheduledFieldIds(),
        divisionIds = normalizedDivisionIds(),
    )
}

@OptIn(ExperimentalTime::class)
fun TimeSlot.canonicalizedOneTime(): TimeSlot {
    if (repeating) return this
    val resolved = resolveOneTimeInterval()
    return copy(
        startDate = resolved.start,
        endDate = resolved.end,
        startTimeMinutes = resolved.startTimeMinutes,
        endTimeMinutes = resolved.endTimeMinutes,
        timeZone = resolved.timeZone,
        scheduledFieldId = resolved.resourceIds.firstOrNull(),
        scheduledFieldIds = resolved.resourceIds,
        divisions = resolved.divisionIds,
    )
}

private fun sharedEligibleId(
    first: List<String>,
    second: List<String>,
    universe: List<String>,
): String? {
    val firstScope = first.ifEmpty { universe }
    val secondScope = second.ifEmpty { universe }
    if (firstScope.isEmpty() && secondScope.isEmpty()) return "GLOBAL"
    if (firstScope.isEmpty()) return secondScope.firstOrNull() ?: "GLOBAL"
    if (secondScope.isEmpty()) return firstScope.firstOrNull() ?: "GLOBAL"
    val secondByKey = secondScope.associateBy { it.lowercase() }
    return firstScope.firstOrNull { secondByKey.containsKey(it.lowercase()) }
}

private fun effectiveEligibleScope(scope: List<String>, universe: List<String>): List<String> =
    scope.ifEmpty { universe.ifEmpty { listOf("GLOBAL") } }

@OptIn(ExperimentalTime::class)
private fun findResolvedOneTimeTimeSlotConflict(
    resolved: List<ResolvedOneTimeTimeSlotInterval>,
    eligibleResourceIds: List<String>,
    eligibleDivisionIds: List<String>,
): OneTimeTimeSlotConflictEvidence? {
    resolved.forEachIndexed { firstIndex, first ->
        for (secondIndex in (firstIndex + 1) until resolved.size) {
            val second = resolved[secondIndex]
            if (first.start >= second.end || first.end <= second.start) continue
            val resourceId = sharedEligibleId(
                first.resourceIds,
                second.resourceIds,
                eligibleResourceIds,
            ) ?: continue
            val divisionId = sharedEligibleId(
                first.divisionIds,
                second.divisionIds,
                eligibleDivisionIds,
            )
            return OneTimeTimeSlotConflictEvidence(
                first = first,
                second = second,
                resourceId = resourceId,
                divisionId = divisionId,
                firstDivisionScope = effectiveEligibleScope(first.divisionIds, eligibleDivisionIds),
                secondDivisionScope = effectiveEligibleScope(second.divisionIds, eligibleDivisionIds),
            )
        }
    }
    return null
}

@OptIn(ExperimentalTime::class)
fun findOneTimeTimeSlotConflict(
    slots: List<TimeSlot>,
    eligibleResourceIds: List<String> = emptyList(),
    eligibleDivisionIds: List<String> = emptyList(),
): OneTimeTimeSlotConflictEvidence? {
    val resolved = slots.filter { !it.repeating }.map { it.resolveOneTimeInterval() }
    return findResolvedOneTimeTimeSlotConflict(
        resolved = resolved,
        eligibleResourceIds = eligibleResourceIds,
        eligibleDivisionIds = eligibleDivisionIds,
    )
}

fun OneTimeTimeSlotConflictEvidence.description(): String {
    val divisionEvidence = divisionId
        ?.let { "for Division \"$it\"" }
        ?: "across disjoint Division scopes \"${firstDivisionScope.joinToString()}\" and \"${secondDivisionScope.joinToString()}\""
    return "One-Time Time Slots \"${first.slotId}\" and \"${second.slotId}\" conflict on Resource " +
        "\"$resourceId\" $divisionEvidence: ${first.localDescription()} overlaps ${second.localDescription()}."
}

@OptIn(ExperimentalTime::class)
fun validateOneTimeTimeSlots(
    slots: List<TimeSlot>,
    eventStart: Instant,
    eventEnd: Instant?,
    eligibleResourceIds: List<String> = emptyList(),
    eligibleDivisionIds: List<String> = emptyList(),
) {
    val resolved = slots.filter { !it.repeating }.map { it.resolveOneTimeInterval() }
    resolved.forEach { slot ->
        if (slot.start < eventStart || (eventEnd != null && slot.end > eventEnd)) {
            val eventRange = eventEnd?.let { "$eventStart–$it" } ?: "starting $eventStart"
            throw OneTimeTimeSlotValidationException(
                "One-Time Time Slot \"${slot.slotId}\" (${slot.localDescription()}) is outside " +
                    "the Event boundary $eventRange; Time Slots are rejected rather than clipped.",
            )
        }
    }
    findResolvedOneTimeTimeSlotConflict(
        resolved = resolved,
        eligibleResourceIds = eligibleResourceIds,
        eligibleDivisionIds = eligibleDivisionIds,
    )?.let { conflict ->
        throw OneTimeTimeSlotValidationException(conflict.description())
    }
}
