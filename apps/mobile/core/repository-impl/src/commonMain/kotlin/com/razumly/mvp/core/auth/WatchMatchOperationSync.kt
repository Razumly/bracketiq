package com.razumly.mvp.core.auth

import com.razumly.mvp.core.data.dataTypes.MatchOperationOutboxEntry

interface WatchMatchOperationSync {
    suspend fun sendOperation(operation: MatchOperationOutboxEntry)
}

object NoOpWatchMatchOperationSync : WatchMatchOperationSync {
    override suspend fun sendOperation(operation: MatchOperationOutboxEntry) = Unit
}

expect fun createWatchMatchOperationSync(): WatchMatchOperationSync
