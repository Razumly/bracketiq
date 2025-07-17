package com.razumly.mvp.core.presentation.util

import android.content.Intent
import com.razumly.mvp.MvpApp

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
}

actual class ShareServiceProvider {
    actual fun getShareService(): ShareService = AndroidShareService()
}