package com.razumly.mvp.wear.auth

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

object WearAuthSyncEvents {
    private val _tokenUpdates = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val tokenUpdates = _tokenUpdates.asSharedFlow()

    fun notifyTokenUpdated() {
        _tokenUpdates.tryEmit(Unit)
    }
}
