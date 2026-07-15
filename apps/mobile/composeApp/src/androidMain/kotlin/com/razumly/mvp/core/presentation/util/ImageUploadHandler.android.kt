package com.razumly.mvp.core.presentation.util

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.core.net.toUri
import com.razumly.mvp.MvpApp
import com.razumly.mvp.core.network.MvpUploadFile
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import java.io.ByteArrayOutputStream
import java.io.InputStream
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.runInterruptible

private const val IMAGE_READ_BUFFER_BYTES = 8 * 1024

internal data class SelectedImageSource(
    val fileName: String,
    val mimeType: String?,
    val declaredSizeBytes: Long?,
    val description: String,
    val openInputStream: () -> InputStream?,
)

actual suspend fun convertPhotoResultToUploadFile(photoResult: GalleryPhotoResult): MvpUploadFile {
    val context = MvpApp.applicationContext()
    val uri = photoResult.uri.toUri()

    return materializeSelectedImage(provideSource = {
        val metadata = getFileMetadataFromUri(context, uri)
        SelectedImageSource(
            fileName = metadata.fileName
                ?: photoResult.fileName
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?: "image_${System.currentTimeMillis()}",
            mimeType = photoResult.mimeType ?: context.contentResolver.getType(uri),
            declaredSizeBytes = metadata.sizeBytes,
            description = uri.toString(),
            openInputStream = { context.contentResolver.openInputStream(uri) },
        )
    })
}

internal suspend fun materializeSelectedImage(
    provideSource: () -> SelectedImageSource,
    ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
): MvpUploadFile = try {
    runInterruptible(ioDispatcher) {
        val source = provideSource()
        val mimeType = normalizeSelectedImageContentType(source.mimeType)

        if (source.declaredSizeBytes != null && source.declaredSizeBytes > MAX_IMAGE_UPLOAD_BYTES) {
            throw ImageUploadTooLargeException()
        }

        val bytes = source.openInputStream()?.use { inputStream ->
            readImageBytesWithLimit(inputStream)
        }
            ?: throw IllegalArgumentException("Could not read data from URI: ${source.description}")

        MvpUploadFile(
            bytes = bytes,
            filename = source.fileName,
            mimeType = mimeType,
        )
    }
} catch (error: Throwable) {
    currentCoroutineContext().ensureActive()
    throw error
}

internal fun readImageBytesWithLimit(
    inputStream: InputStream,
    maxBytes: Int = MAX_IMAGE_UPLOAD_BYTES,
): ByteArray {
    require(maxBytes >= 0) { "maxBytes must not be negative" }

    val output = ByteArrayOutputStream(minOf(IMAGE_READ_BUFFER_BYTES, maxBytes))
    val buffer = ByteArray(IMAGE_READ_BUFFER_BYTES)
    var totalBytes = 0

    while (true) {
        val remainingBytes = maxBytes - totalBytes
        val readLimit = minOf(
            buffer.size.toLong(),
            remainingBytes.toLong() + 1L,
        ).toInt()
        val readCount = inputStream.read(buffer, 0, readLimit)

        if (readCount < 0) {
            break
        }
        if (readCount == 0) {
            val nextByte = inputStream.read()
            if (nextByte < 0) {
                break
            }
            if (totalBytes == maxBytes) {
                throw ImageUploadTooLargeException()
            }
            output.write(nextByte)
            totalBytes += 1
            continue
        }
        if (readCount > remainingBytes) {
            throw ImageUploadTooLargeException()
        }

        output.write(buffer, 0, readCount)
        totalBytes += readCount
    }

    return output.toByteArray()
}

private data class SelectedFileMetadata(
    val fileName: String?,
    val sizeBytes: Long?,
)

private fun getFileMetadataFromUri(context: Context, uri: Uri): SelectedFileMetadata {
    return context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
        if (!cursor.moveToFirst()) {
            return@use SelectedFileMetadata(fileName = null, sizeBytes = null)
        }

        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
        SelectedFileMetadata(
            fileName = nameIndex
                .takeIf { it >= 0 && !cursor.isNull(it) }
                ?.let(cursor::getString)
                ?.trim()
                ?.takeIf(String::isNotBlank),
            sizeBytes = sizeIndex
                .takeIf { it >= 0 && !cursor.isNull(it) }
                ?.let(cursor::getLong)
                ?.takeIf { it >= 0L },
        )
    } ?: SelectedFileMetadata(fileName = null, sizeBytes = null)
}
