package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusManager
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged

// PlatformFocusManager.android.kt
class AndroidFocusManager : PlatformFocusManager {
    private val focusRequester = FocusRequester()
    private var _focusState by mutableStateOf(PlatformFocusState())
    private var onFocusChangedCallback: ((Boolean) -> Unit)? = null
    private var onNextCallback: (() -> Unit)? = null
    private var onDoneCallback: (() -> Unit)? = null
    private var composeFocusManager: FocusManager? = null

    override val focusState: PlatformFocusState
        get() = _focusState

    override fun requestFocus() {
        try {
            focusRequester.requestFocus()
        } catch (e: Exception) {
            println("Focus request failed: ${e.message}")
        }
    }

    override fun clearFocus() {
        try {
            focusRequester.freeFocus()
            composeFocusManager?.clearFocus()
        } catch (e: Exception) {
            println("Focus clear failed: ${e.message}")
        }
    }

    override fun setFocusChangeListener(onFocusChanged: (Boolean) -> Unit) {
        onFocusChangedCallback = onFocusChanged
    }

    override fun setOnNextAction(onNext: () -> Unit) {
        onNextCallback = onNext
    }

    override fun setOnDoneAction(onDone: () -> Unit) {
        onDoneCallback = onDone
    }

    override fun clearCallbacks() {
        onFocusChangedCallback = null
        onNextCallback = null
        onDoneCallback = null
    }

    // Internal methods
    internal fun updateFocusState(isFocused: Boolean) {
        _focusState = _focusState.copy(isFocused = isFocused)
        onFocusChangedCallback?.invoke(isFocused)
    }

    internal fun handleNextAction() {
        onNextCallback?.invoke() ?: run {
            composeFocusManager?.moveFocus(FocusDirection.Next)
        }
    }

    internal fun handleDoneAction() {
        onDoneCallback?.invoke() ?: run {
            composeFocusManager?.clearFocus()
        }
    }

    internal fun getFocusRequester() = focusRequester
    internal fun setComposeFocusManager(focusManager: FocusManager) {
        composeFocusManager = focusManager
    }
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