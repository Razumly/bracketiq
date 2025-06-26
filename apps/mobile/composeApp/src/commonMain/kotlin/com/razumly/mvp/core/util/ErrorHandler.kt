package com.razumly.mvp.core.util

import androidx.compose.material3.SnackbarDuration
import androidx.compose.runtime.compositionLocalOf
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ErrorMessage(
    val message: String,
    val actionLabel: String? = null,
    val action: (() -> Unit)? = null,
    val duration: SnackbarDuration = SnackbarDuration.Short
)

interface ErrorHandler {
    fun showError(error: ErrorMessage)
    fun showError(message: String)
    fun clearError()
}

class ErrorHandlerImpl : ErrorHandler {
    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    val errorState: StateFlow<ErrorMessage?> = _errorState.asStateFlow()

    override fun showError(error: ErrorMessage) {
        _errorState.value = error
    }

    override fun showError(message: String) {
        _errorState.value = ErrorMessage(message)
    }

    override fun clearError() {
        _errorState.value = null
    }
}

val LocalErrorHandler = compositionLocalOf<ErrorHandler> {
    error("No ErrorHandler provided")
}
