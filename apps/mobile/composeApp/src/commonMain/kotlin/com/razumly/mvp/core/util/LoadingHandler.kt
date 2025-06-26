package com.razumly.mvp.core.util

import androidx.compose.runtime.compositionLocalOf
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class LoadingState(
    val isLoading: Boolean = false,
    val message: String = "Loading...",
    val progress: Float? = null // For determinate progress
)

interface LoadingHandler {
    fun showLoading(message: String, progress: Float? = null)
    fun hideLoading()
    fun updateProgress(progress: Float)
}

class LoadingHandlerImpl : LoadingHandler {
    private val _loadingState = MutableStateFlow(LoadingState())
    val loadingState: StateFlow<LoadingState> = _loadingState.asStateFlow()

    override fun showLoading(message: String, progress: Float?) {
        _loadingState.value = LoadingState(true, message, progress)
    }

    override fun hideLoading() {
        _loadingState.value = LoadingState()
    }

    override fun updateProgress(progress: Float) {
        _loadingState.value = _loadingState.value.copy(progress = progress)
    }
}

val LocalLoadingHandler = compositionLocalOf<LoadingHandler> {
    error("No LoadingHandler provided")
}
