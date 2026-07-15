package com.razumly.mvp.core.presentation.util

import com.razumly.mvp.core.network.MvpUploadFile
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult

/** Device-side read guard. The server capability remains the upload authority. */
const val MAX_IMAGE_UPLOAD_BYTES: Int = 10 * 1024 * 1024

const val IMAGE_UPLOAD_TOO_LARGE_MESSAGE: String =
    "Image must be 10MB or less. Choose a smaller image and try again."

class ImageUploadTooLargeException : IllegalArgumentException(IMAGE_UPLOAD_TOO_LARGE_MESSAGE)

expect suspend fun convertPhotoResultToUploadFile(photoResult: GalleryPhotoResult): MvpUploadFile

/**
 * Preserves picker metadata without duplicating the backend format allowlist.
 * The repository upload boundary resolves this value against the versioned
 * server policy immediately before upload.
 */
fun normalizeSelectedImageContentType(mimeType: String?): String =
    mimeType
        ?.substringBefore(';')
        ?.trim()
        ?.lowercase()
        ?.takeIf(String::isNotBlank)
        ?: "application/octet-stream"
