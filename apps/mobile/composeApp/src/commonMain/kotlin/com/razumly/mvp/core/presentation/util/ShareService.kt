package com.razumly.mvp.core.presentation.util

interface ShareService {
    fun share(title: String, url: String)
    fun shareImage(title: String, imageBytes: ByteArray, fileName: String, mimeType: String)
}

expect class ShareServiceProvider() {
    fun getShareService(): ShareService
}
