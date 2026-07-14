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

@Serializable
data class ImageUploadPolicyDto(
    val version: Int,
    val maxBytes: Long,
    val mimeTypes: List<String>,
    val mimeTypesByExtension: Map<String, String>,
    val unsupportedTypeMessage: String,
    val tooLargeMessage: String,
)
