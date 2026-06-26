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

private val cancellationErrorPatterns = listOf(
    Regex(
        "(job|task|coroutine|request|scope|operation)\\b.*\\b(cancelled|canceled|cancelling)\\b",
        RegexOption.IGNORE_CASE,
    ),
    Regex(
        "\\b(cancelled|canceled|cancelling)\\b.*\\b(job|task|coroutine|request|scope|operation)\\b",
        RegexOption.IGNORE_CASE,
    ),
)

internal fun String.isCancellationErrorMessage(): Boolean {
    val normalized = trim().takeIf(String::isNotBlank) ?: return false
    val sentence = normalized.trimEnd('.', '!', '?').trim()
    if (sentence.equals("cancelled", ignoreCase = true) || sentence.equals("canceled", ignoreCase = true)) {
        return true
    }

    return cancellationErrorPatterns.any { it.containsMatchIn(normalized) }
}

interface PopupHandler {
    fun showPopup(error: ErrorMessage)
    fun showPopup(message: String)
    fun clearError()
}

class PopupHandlerImpl : PopupHandler {
    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    val errorState: StateFlow<ErrorMessage?> = _errorState.asStateFlow()

    override fun showPopup(error: ErrorMessage) {
        if (error.message.isCancellationErrorMessage()) return
        _errorState.value = error
    }

    override fun showPopup(message: String) {
        if (message.isCancellationErrorMessage()) return
        _errorState.value = ErrorMessage(message)
    }

    override fun clearError() {
        _errorState.value = null
    }
}

val LocalPopupHandler = compositionLocalOf<PopupHandler> {
    error("No ErrorHandler provided")
}
