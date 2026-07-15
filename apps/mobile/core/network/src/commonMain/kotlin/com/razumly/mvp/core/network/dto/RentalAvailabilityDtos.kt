package com.razumly.mvp.core.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class RentalAvailabilityResponseDto(
    val range: RentalAvailabilityRangeDto,
    val fields: List<RentalAvailabilityFieldDto> = emptyList(),
    val busyBlocks: List<RentalAvailabilityBusyBlockDto> = emptyList(),
)

@Serializable
data class RentalAvailabilityRangeDto(
    val start: String,
    val end: String,
)

@Serializable
data class RentalAvailabilityFieldDto(
    val id: String,
    val fieldNumber: Int? = null,
    val name: String = "",
    val facilityId: String? = null,
    val facilityName: String? = null,
    val rentalSlots: List<RentalAvailabilitySlotDto> = emptyList(),
)

@Serializable
data class RentalAvailabilitySlotDto(
    val id: String,
    val daysOfWeek: List<Int> = emptyList(),
    val startTimeMinutes: Int? = null,
    val endTimeMinutes: Int? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val timeZone: String? = null,
    val repeating: Boolean = true,
    val price: Int = 0,
)

@Serializable
data class RentalAvailabilityBusyBlockDto(
    val fieldId: String,
    val start: String,
    val end: String,
)
