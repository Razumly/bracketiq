// PhotoResultConverter.ios.kt (iosMain)
package com.razumly.mvp.core.presentation.util

import io.appwrite.models.InputFile
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import platform.Foundation.NSData
import platform.Foundation.NSURL
import platform.Foundation.dataWithContentsOfURL
import platform.Foundation.getBytes
import kotlin.time.Clock

actual fun convertPhotoResultToInputFile(photoResult: GalleryPhotoResult): InputFile {
    val fileName = photoResult.fileName ?: "image_${Clock.System.now().toEpochMilliseconds()}.jpg"
    val mimeType = when {
        fileName.endsWith(".png", ignoreCase = true) -> "image/png"
        fileName.endsWith(".webp", ignoreCase = true) -> "image/webp"
        else -> "image/jpeg"
    }

    val byteArray = convertUriToByteArray(photoResult.uri!!)

    return InputFile.fromBytes(
        bytes = byteArray,
        filename = fileName,
        mimeType = mimeType
    )
}

@OptIn(ExperimentalForeignApi::class)
private fun convertUriToByteArray(uri: String): ByteArray {
    return try {
        val nsUrl = NSURL.URLWithString(uri)
            ?: throw IllegalArgumentException("Invalid URI: $uri")

        val nsData = NSData.dataWithContentsOfURL(nsUrl)
            ?: throw IllegalArgumentException("Could not read data from URI: $uri")

        val byteArray = ByteArray(nsData.length.toInt())
        byteArray.usePinned { pinned ->
            nsData.getBytes(pinned.addressOf(0), nsData.length)
        }

        byteArray
    } catch (e: Exception) {
        throw IllegalArgumentException("Failed to convert URI to byte array: ${e.message}")
    }
}
