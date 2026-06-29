package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Contextual
import kotlinx.serialization.Serializable
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
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
    val zone = runCatching {
        TimeZone.of(timeZone.trim().takeIf(String::isNotBlank) ?: "UTC")
    }.getOrDefault(TimeZone.UTC)
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
    val scheduledFieldId: String?,
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
            scheduledFieldId = scheduledFieldIds?.firstOrNull() ?: scheduledFieldId,
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
