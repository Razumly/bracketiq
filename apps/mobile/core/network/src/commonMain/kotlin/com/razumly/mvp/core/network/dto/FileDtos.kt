package com.razumly.mvp.core.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class FileUploadResponseDto(
    val file: FileApiDto? = null,
)

@Serializable
data class FileApiDto(
    val id: String? = null,
)

