@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.core.data.dataTypes

import kotlin.time.Instant

data class RentalAvailabilitySnapshot(
    val rangeStart: Instant,
    val rangeEnd: Instant,
    val fields: List<RentalAvailabilityField>,
    val busyBlocks: List<RentalAvailabilityBusyBlock>,
)

data class RentalAvailabilityField(
    val field: Field,
    val rentalSlots: List<TimeSlot>,
)

data class RentalAvailabilityBusyBlock(
    val fieldId: String,
    val start: Instant,
    val end: Instant,
)
