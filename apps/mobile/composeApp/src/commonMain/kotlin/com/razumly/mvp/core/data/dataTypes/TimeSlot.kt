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
    val startTimeMinutes: Int?,
    val endTimeMinutes: Int?,
    @Contextual val startDate: Instant,
    val repeating: Boolean,
    @Contextual val endDate: Instant?,
    val scheduledFieldId: String?,
    val price: Int?
)

@Serializable
@OptIn(ExperimentalTime::class)
data class TimeSlotDTO(
    val dayOfWeek: Int? = null,
    val startTimeMinutes: Int? = null,
    val endTimeMinutes: Int? = null,
    val startDate: String,
    val repeating: Boolean = false,
    val endDate: String? = null,
    val scheduledFieldId: String? = null,
    val price: Int? = null
) {
    fun toTimeSlot(id: String): TimeSlot =
        TimeSlot(
            id = id,
            dayOfWeek = dayOfWeek,
            startTimeMinutes = startTimeMinutes,
            endTimeMinutes = endTimeMinutes,
            startDate = Instant.parse(startDate),
            repeating = repeating,
            endDate = endDate?.let(Instant::parse),
            scheduledFieldId = scheduledFieldId,
            price = price
        )
}
