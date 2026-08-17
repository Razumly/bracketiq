package com.razumly.mvp.core.presentation.util

import android.content.Intent
import androidx.core.content.FileProvider
import com.razumly.mvp.MvpApp
import java.io.File

class AndroidShareService : ShareService {
    override fun share(title: String, url: String) {
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, title)
            putExtra(Intent.EXTRA_TEXT, "$title\n$url")
        }
        MvpApp.applicationContext()
            .startActivity(Intent.createChooser(shareIntent, "Share via").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
    }

    override fun shareImage(title: String, imageBytes: ByteArray, fileName: String, mimeType: String) {
        if (imageBytes.isEmpty()) return

        val context = MvpApp.applicationContext()
        val shareDir = File(context.cacheDir, "shared").apply { mkdirs() }
        val imageFile = File(shareDir, fileName).apply {
            writeBytes(imageBytes)
        }
        val imageUri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            imageFile,
        )
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_SUBJECT, title)
            putExtra(Intent.EXTRA_STREAM, imageUri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(shareIntent, "Share QR Code").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }
}

actual class ShareServiceProvider {
    actual fun getShareService(): ShareService = AndroidShareService()
}
