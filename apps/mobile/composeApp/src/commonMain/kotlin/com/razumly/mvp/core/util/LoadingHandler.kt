package com.razumly.mvp.core.util

import androidx.compose.runtime.compositionLocalOf
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

private const val DEFAULT_LOADING_MESSAGE = "Loading..."

internal data class ActiveLoadingOperation(
    val owner: Any,
    val message: String,
    val progress: Float?,
)

class LoadingState internal constructor(
    internal val activeOperations: List<ActiveLoadingOperation> = emptyList(),
    internal val registryRevision: Long = 0L,
) {
    private val visibleOperation: ActiveLoadingOperation?
        get() = activeOperations.firstOrNull()

    val isLoading: Boolean
        get() = activeOperations.isNotEmpty()

    val message: String
        get() = visibleOperation?.message ?: DEFAULT_LOADING_MESSAGE

    val progress: Float?
        get() = visibleOperation?.progress

    val activeOperationCount: Int
        get() = activeOperations.size

    override fun equals(other: Any?): Boolean =
        other is LoadingState &&
            activeOperations == other.activeOperations &&
            registryRevision == other.registryRevision

    override fun hashCode(): Int =
        31 * activeOperations.hashCode() + registryRevision.hashCode()

    override fun toString(): String =
        "LoadingState(isLoading=$isLoading, message=$message, progress=$progress, " +
            "activeOperationCount=$activeOperationCount)"
}

interface LoadingOperation {
    /**
     * Shows this operation or updates its current message and progress. Calling this more than
     * once never acquires another loading slot.
     */
    fun showLoading(message: String, progress: Float? = null)

    /** Completes this operation. Completion is idempotent and terminal. */
    fun hideLoading()

    /** Updates only this operation's progress while it remains active. */
    fun updateProgress(progress: Float)
}

interface LoadingHandler {
    val loadingState: StateFlow<LoadingState>
    fun newOperation(): LoadingOperation
}

internal fun <K> MutableMap<K, LoadingOperation>.finishAllLoadingOperations() {
    val ownedOperations = values.toList()
    clear()
    ownedOperations.forEach(LoadingOperation::hideLoading)
}

internal data class LoadingHandlerTestHooks(
    val beforeShowStateCommit: (() -> Unit)? = null,
    val beforeProgressStateCommit: (() -> Unit)? = null,
)

class LoadingHandlerImpl private constructor(
    private val testHooks: LoadingHandlerTestHooks,
) : LoadingHandler {
    constructor() : this(LoadingHandlerTestHooks())

    internal companion object {
        fun withTestHooks(testHooks: LoadingHandlerTestHooks): LoadingHandlerImpl =
            LoadingHandlerImpl(testHooks)
    }

    private val _loadingState = MutableStateFlow(LoadingState())
    override val loadingState: StateFlow<LoadingState> = _loadingState.asStateFlow()

    override fun newOperation(): LoadingOperation = OwnedLoadingOperation(
        owner = Any(),
        show = ::show,
        hide = ::hide,
        updateProgress = ::updateProgress,
    )

    private fun show(
        owner: Any,
        message: String,
        progress: Float?,
        isClosed: () -> Boolean,
    ) {
        _loadingState.update { state ->
            if (isClosed()) return@update state
            testHooks.beforeShowStateCommit?.invoke()

            val existingIndex = state.activeOperations.indexOfFirst { operation ->
                operation.owner === owner
            }
            val updatedOperation = ActiveLoadingOperation(owner, message, progress)
            val updatedOperations = if (existingIndex < 0) {
                state.activeOperations + updatedOperation
            } else {
                state.activeOperations.toMutableList().apply {
                    this[existingIndex] = updatedOperation
                }
            }
            LoadingState(
                activeOperations = updatedOperations,
                registryRevision = state.registryRevision,
            )
        }
    }

    private fun hide(owner: Any) {
        _loadingState.update { state ->
            val updatedOperations = state.activeOperations.filterNot { operation ->
                operation.owner === owner
            }
            // Advance the revision even when this owner has not entered the registry yet. This
            // forces an in-flight show/update CAS to retry and observe the terminal owner state.
            LoadingState(
                activeOperations = updatedOperations,
                registryRevision = state.registryRevision + 1,
            )
        }
    }

    private fun updateProgress(
        owner: Any,
        progress: Float,
        isClosed: () -> Boolean,
    ) {
        _loadingState.update { state ->
            if (isClosed()) return@update state
            testHooks.beforeProgressStateCommit?.invoke()

            val existingIndex = state.activeOperations.indexOfFirst { operation ->
                operation.owner === owner
            }
            if (existingIndex < 0) return@update state

            LoadingState(
                activeOperations = state.activeOperations.toMutableList().apply {
                    this[existingIndex] = this[existingIndex].copy(progress = progress)
                },
                registryRevision = state.registryRevision,
            )
        }
    }

    private class OwnedLoadingOperation(
        private val owner: Any,
        private val show: (Any, String, Float?, () -> Boolean) -> Unit,
        private val hide: (Any) -> Unit,
        private val updateProgress: (Any, Float, () -> Boolean) -> Unit,
    ) : LoadingOperation {
        private val isClosed = MutableStateFlow(false)

        override fun showLoading(message: String, progress: Float?) {
            show(owner, message, progress) { isClosed.value }
        }

        override fun hideLoading() {
            if (isClosed.compareAndSet(expect = false, update = true)) {
                hide(owner)
            }
        }

        override fun updateProgress(progress: Float) {
            updateProgress(owner, progress) { isClosed.value }
        }
    }
}

val LocalLoadingHandler = compositionLocalOf<LoadingHandler> {
    error("No LoadingHandler provided")
}
