package com.razumly.mvp.core.network

/**
 * Minimal cross-platform file payload for multipart uploads to the Next.js API.
 */
data class MvpUploadFile(
    val bytes: ByteArray,
    val filename: String,
    val mimeType: String,
)

