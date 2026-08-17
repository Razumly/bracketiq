package com.razumly.mvp.wear.auth

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

object WearMatchSyncEvents {
    private val _matchUpdates = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val matchUpdates = _matchUpdates.asSharedFlow()

    fun notifyMatchUpdated(matchId: String) {
        _matchUpdates.tryEmit(matchId)
    }
}
