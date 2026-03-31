package com.razumly.mvp.core.presentation

import kotlinx.serialization.Serializable

@Serializable
data class RentalCreateContext(
    val organizationId: String,
    val organizationName: String,
    val organizationLocation: String?,
    val organizationAddress: String? = null,
    val organizationCoordinates: List<Double>?,
    val organizationFieldIds: List<String> = emptyList(),
    val selectedFieldIds: List<String> = emptyList(),
    val selectedTimeSlotIds: List<String> = emptyList(),
    val participantRequiredTemplateIds: List<String> = emptyList(),
    val hostRequiredTemplateIds: List<String> = emptyList(),
    val rentalPriceCents: Int = 0,
    val startEpochMillis: Long,
    val endEpochMillis: Long,
)
