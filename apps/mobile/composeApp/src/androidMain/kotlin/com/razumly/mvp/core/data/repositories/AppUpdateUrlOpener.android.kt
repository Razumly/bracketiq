package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.MvpApp
import com.razumly.mvp.core.util.UrlHandler

internal actual suspend fun openAppUpdateUrl(url: String): Result<Unit> =
    UrlHandler(MvpApp.applicationContext()).openUrlInWebView(url).map { }
