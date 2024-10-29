package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Match

data class FieldDTO(
    val inUse: Boolean,
    val fieldNumber: Int,
    val divisions: List<String>,
    val matches: List<String>,
    val tournament: String,
    val id: String,
)