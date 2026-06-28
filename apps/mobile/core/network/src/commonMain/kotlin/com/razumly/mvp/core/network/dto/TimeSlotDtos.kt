package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.TimeSlot
import kotlinx.serialization.Serializable

@Serializable
data class TimeSlotsResponseDto(
    val timeSlots: List<TimeSlot> = emptyList(),
)
