package com.razumly.mvp.core.presentation.util

import com.razumly.mvp.core.network.MvpUploadFile
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult

/** Mirrors the server-side `/api/files/upload` multipart file-size limit. */
const val MAX_IMAGE_UPLOAD_BYTES: Int = 10 * 1024 * 1024

const val IMAGE_UPLOAD_TOO_LARGE_MESSAGE: String =
    "Image must be 10MB or less. Choose a smaller image and try again."

class ImageUploadTooLargeException : IllegalArgumentException(IMAGE_UPLOAD_TOO_LARGE_MESSAGE)

expect suspend fun convertPhotoResultToUploadFile(photoResult: GalleryPhotoResult): MvpUploadFile

private val imageUploadMimeTypesByExtension = mapOf(
    "avif" to "image/avif",
    "jpeg" to "image/jpeg",
    "jpg" to "image/jpeg",
    "png" to "image/png",
    "svg" to "image/svg+xml",
    "webp" to "image/webp",
)

val supportedImageUploadMimeTypes: Set<String> = setOf(
    "image/avif",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/svg+xml",
    "image/webp",
)

fun resolveSupportedImageUploadMimeType(
    fileName: String?,
    mimeType: String?,
): String? {
    val normalizedMimeType = mimeType
        ?.substringBefore(';')
        ?.trim()
        ?.lowercase()
        ?.takeIf(String::isNotBlank)

    if (normalizedMimeType in supportedImageUploadMimeTypes) {
        return if (normalizedMimeType == "image/jpg") "image/jpeg" else normalizedMimeType
    }

    val extension = fileName
        ?.substringAfterLast('.', missingDelimiterValue = "")
        ?.trim()
        ?.lowercase()
        ?.takeIf(String::isNotBlank)

    return extension?.let(imageUploadMimeTypesByExtension::get)
}

fun requireSupportedImageUploadMimeType(
    fileName: String?,
    mimeType: String?,
): String = resolveSupportedImageUploadMimeType(fileName, mimeType)
    ?: throw IllegalArgumentException("Unsupported image type. Please select a PNG, JPEG, WebP, AVIF, or SVG image.")

fun extensionForImageUploadMimeType(mimeType: String?): String? =
    when (mimeType?.substringBefore(';')?.trim()?.lowercase()) {
        "image/avif" -> ".avif"
        "image/jpeg", "image/jpg" -> ".jpg"
        "image/png" -> ".png"
        "image/svg+xml" -> ".svg"
        "image/webp" -> ".webp"
        else -> null
    }
