package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable

@Serializable
data class DivisionDetail(
    val id: String,
    val key: String = "",
    val name: String = "",
    val divisionTypeId: String = "",
    val divisionTypeName: String = "",
    val ratingType: String = "",
    val gender: String = "",
    val sportId: String? = null,
    val ageCutoffDate: String? = null,
    val ageCutoffLabel: String? = null,
    val ageCutoffSource: String? = null,
    val fieldIds: List<String> = emptyList(),
)
