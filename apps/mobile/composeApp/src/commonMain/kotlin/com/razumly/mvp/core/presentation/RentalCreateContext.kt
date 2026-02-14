package com.razumly.mvp.core.presentation

import kotlinx.serialization.Serializable

@Serializable
data class RentalCreateContext(
    val organizationId: String,
    val organizationName: String,
    val organizationLocation: String?,
    val organizationCoordinates: List<Double>?,
    val organizationFieldIds: List<String> = emptyList(),
    val selectedFieldIds: List<String> = emptyList(),
    val selectedTimeSlotIds: List<String> = emptyList(),
    val requiredTemplateIds: List<String> = emptyList(),
    val rentalPriceCents: Int = 0,
    val startEpochMillis: Long,
    val endEpochMillis: Long,
)
