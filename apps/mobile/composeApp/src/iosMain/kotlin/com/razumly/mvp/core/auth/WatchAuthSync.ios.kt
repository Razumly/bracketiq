package com.razumly.mvp.core.auth

import com.razumly.mvp.core.network.MvpApiClient

actual fun createWatchAuthSync(api: MvpApiClient): WatchAuthSync = NoOpWatchAuthSync
