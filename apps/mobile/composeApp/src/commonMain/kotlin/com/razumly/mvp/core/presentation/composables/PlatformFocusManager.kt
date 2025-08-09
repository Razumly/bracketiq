package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

data class PlatformFocusState(
    val isFocused: Boolean = false,
    val canRequestFocus: Boolean = true
)

// PlatformFocusManager.kt
interface PlatformFocusManager {
    val focusState: PlatformFocusState
    fun requestFocus()
    fun clearFocus()

    // New callback methods
    fun setFocusChangeListener(onFocusChanged: (Boolean) -> Unit)
    fun setOnNextAction(onNext: () -> Unit)
    fun setOnDoneAction(onDone: () -> Unit)
    fun clearCallbacks()
}


@Composable
expect fun rememberPlatformFocusManager(): PlatformFocusManager

expect fun Modifier.platformFocusable(
    focusManager: PlatformFocusManager,
    enabled: Boolean = true
): Modifier
