package com.razumly.mvp.core.data.repositories

import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner

internal actual fun isApplicationInForeground(): Boolean {
    return ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
}
