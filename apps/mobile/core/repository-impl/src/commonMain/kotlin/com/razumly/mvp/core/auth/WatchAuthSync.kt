package com.razumly.mvp.core.auth

import com.razumly.mvp.core.network.MvpApiClient

interface WatchAuthSync {
    suspend fun syncAuthenticatedWatch()
}

object NoOpWatchAuthSync : WatchAuthSync {
    override suspend fun syncAuthenticatedWatch() = Unit
}

expect fun createWatchAuthSync(api: MvpApiClient): WatchAuthSync
