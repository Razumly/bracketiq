package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.util.UrlHandler

internal actual suspend fun openAppUpdateUrl(url: String): Result<Unit> =
    UrlHandler().openUrlInWebView(url).map { }
