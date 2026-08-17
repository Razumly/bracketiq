package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.TimeSlot
import kotlinx.serialization.Serializable

@Serializable
data class TimeSlotsResponseDto(
    val timeSlots: List<TimeSlot>,
    val pagination: TimeSlotPaginationDto? = null,
)

@Serializable
data class TimeSlotPaginationDto(
    val limit: Int? = null,
    val offset: Int? = null,
    val nextOffset: Int? = null,
    val hasMore: Boolean? = null,
)
