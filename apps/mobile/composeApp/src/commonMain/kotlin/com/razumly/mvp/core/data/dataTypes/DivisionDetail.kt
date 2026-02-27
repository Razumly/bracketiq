package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable

@Serializable
data class DivisionDetail(
    val id: String,
    val kind: String? = null,
    val key: String = "",
    val name: String = "",
    val divisionTypeId: String = "",
    val divisionTypeName: String = "",
    val ratingType: String = "",
    val gender: String = "",
    val skillDivisionTypeId: String = "",
    val skillDivisionTypeName: String = "",
    val ageDivisionTypeId: String = "",
    val ageDivisionTypeName: String = "",
    // Stored in cents to match backend event/checkout pricing semantics.
    val price: Int? = null,
    val maxParticipants: Int? = null,
    val playoffTeamCount: Int? = null,
    val allowPaymentPlans: Boolean? = null,
    val installmentCount: Int? = null,
    val installmentDueDates: List<String> = emptyList(),
    val installmentAmounts: List<Int> = emptyList(),
    val sportId: String? = null,
    val ageCutoffDate: String? = null,
    val ageCutoffLabel: String? = null,
    val ageCutoffSource: String? = null,
    val fieldIds: List<String> = emptyList(),
    val playoffPlacementDivisionIds: List<String> = emptyList(),
    val teamIds: List<String> = emptyList(),
)
