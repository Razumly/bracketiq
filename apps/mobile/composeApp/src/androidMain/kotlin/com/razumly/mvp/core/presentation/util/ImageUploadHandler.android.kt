package com.razumly.mvp.core.presentation.util

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.core.net.toUri
import com.razumly.mvp.MvpApp
import io.appwrite.models.InputFile
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult

private fun uriToByteArray(context: Context, uri: Uri): ByteArray {
    return context.contentResolver.openInputStream(uri)?.use { inputStream ->
        inputStream.readBytes()
    } ?: throw IllegalArgumentException("Could not read data from URI: $uri")
}

private fun getFileNameFromUri(context: Context, uri: Uri): String {
    return context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (nameIndex >= 0 && cursor.moveToFirst()) {
            cursor.getString(nameIndex)
        } else null
    } ?: "image_${System.currentTimeMillis()}.jpg"
}

actual fun convertPhotoResultToInputFile(photoResult: GalleryPhotoResult): InputFile {
    val context = MvpApp.applicationContext()

    val uri = photoResult.uri.toUri()
    val bytes = uriToByteArray(context, uri)
    val fileName = getFileNameFromUri(context, uri)
    val mimeType = context.contentResolver.getType(uri) ?: "image/jpeg"

    return InputFile.fromBytes(
        bytes = bytes,
        filename = fileName,
        mimeType = mimeType
    )
}