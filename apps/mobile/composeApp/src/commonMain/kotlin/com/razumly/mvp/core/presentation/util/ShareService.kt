package com.razumly.mvp.core.presentation.util

interface ShareService {
    fun share(title: String, url: String)
}

expect class ShareServiceProvider() {
    fun getShareService(): ShareService
}