package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Contextual
import kotlinx.serialization.Serializable
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

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
    val repeating: Boolean,
    @Contextual val endDate: Instant?,
    val scheduledFieldId: String?,
    val scheduledFieldIds: List<String>? = null,
    val price: Int?,
    val requiredTemplateIds: List<String> = emptyList(),
)

@Serializable
@OptIn(ExperimentalTime::class)
data class TimeSlotDTO(
    val dayOfWeek: Int? = null,
    val daysOfWeek: List<Int>? = null,
    val divisions: List<String>? = null,
    val startTimeMinutes: Int? = null,
    val endTimeMinutes: Int? = null,
    val startDate: String,
    val repeating: Boolean = false,
    val endDate: String? = null,
    val scheduledFieldId: String? = null,
    val scheduledFieldIds: List<String>? = null,
    val price: Int? = null,
    val requiredTemplateIds: List<String> = emptyList(),
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
            startDate = Instant.parse(startDate),
            repeating = repeating,
            endDate = endDate?.let(Instant::parse),
            scheduledFieldId = scheduledFieldIds?.firstOrNull() ?: scheduledFieldId,
            scheduledFieldIds = (scheduledFieldIds ?: scheduledFieldId?.let(::listOf) ?: emptyList())
                .map(String::trim)
                .filter(String::isNotBlank)
                .distinct(),
            price = price,
            requiredTemplateIds = requiredTemplateIds
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
