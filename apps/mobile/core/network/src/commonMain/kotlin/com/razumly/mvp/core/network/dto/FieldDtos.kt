package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Field
import kotlinx.serialization.Serializable

@Serializable
data class FieldsResponseDto(
    val fields: List<Field> = emptyList(),
)

