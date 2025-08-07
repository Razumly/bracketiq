package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalFocusManager
import io.github.aakira.napier.Napier

class AndroidFocusManager : PlatformFocusManager {
    private val focusRequester = FocusRequester()
    private var _focusState by mutableStateOf(PlatformFocusState())
    private var onFocusChangedCallback: ((Boolean) -> Unit)? = null

    override val focusState: PlatformFocusState
        get() = _focusState

    override fun requestFocus() {
        try {
            focusRequester.requestFocus()
        } catch (e: Exception) {
            Napier.d("Focus request failed: ${e.message}")
        }
    }

    override fun clearFocus() {
        try {
            focusRequester.freeFocus()
        } catch (e: Exception) {
            Napier.d("Focus clear failed: ${e.message}")
        }
    }

    override fun setFocusChangeListener(onFocusChanged: (Boolean) -> Unit) {
        onFocusChangedCallback = onFocusChanged
    }

    internal fun updateFocusState(isFocused: Boolean) {
        _focusState = _focusState.copy(isFocused = isFocused)
        onFocusChangedCallback?.invoke(isFocused)
    }

    internal fun getFocusRequester() = focusRequester
}

@Composable
actual fun rememberPlatformFocusManager(): PlatformFocusManager {
    return remember { AndroidFocusManager() }
}

actual fun Modifier.platformFocusable(
    focusManager: PlatformFocusManager,
    enabled: Boolean
): Modifier {
    val androidManager = focusManager as AndroidFocusManager
    return this
        .focusRequester(androidManager.getFocusRequester())
        .onFocusChanged { focusState ->
            if (enabled) {
                androidManager.updateFocusState(focusState.isFocused)
            }
        }
}
