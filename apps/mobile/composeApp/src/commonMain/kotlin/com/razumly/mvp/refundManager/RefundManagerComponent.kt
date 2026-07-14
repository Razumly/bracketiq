package com.razumly.mvp.refundManager

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.coroutines.withLifecycle
import com.arkivanov.essenty.lifecycle.doOnDestroy
import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.RefundRequestWithRelations
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

interface RefundManagerComponent {
    val errorState: StateFlow<ErrorMessage?>
    val refundsWithRelations: StateFlow<List<RefundRequestWithRelations>>
    val isLoading: StateFlow<Boolean>

    fun onBack()
    fun approveRefund(refundRequest: RefundRequest)
    fun rejectRefund(refundId: String)
    fun setLoadingHandler(loadingHandler: LoadingHandler)
    fun refreshRefunds()
}

class DefaultRefundManagerComponent(
    private val componentContext: ComponentContext,
    @Suppress("UNUSED_PARAMETER")
    userRepository: IUserRepository,
    private val billingRepository: IBillingRepository,
    private val navigationHandler: INavigationHandler,
) : ComponentContext by componentContext, RefundManagerComponent {

    private val scope = refundManagerCoroutineScope()

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState.asStateFlow()

    private val _refundsWithRelations = MutableStateFlow<List<RefundRequestWithRelations>>(emptyList())
    override val refundsWithRelations = _refundsWithRelations.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    override val isLoading = _isLoading.asStateFlow()

    private val refreshCoordinator = RefundRefreshCoordinator(
        scope = scope,
        loadRefunds = billingRepository::getRefundsWithRelations,
        onLoadingChanged = { isLoading -> _isLoading.value = isLoading },
        onSuccess = { refunds ->
            _errorState.value = null
            _refundsWithRelations.value = refunds
        },
        onFailure = { error ->
            _errorState.value = ErrorMessage(error.userMessage("Error getting refunds"))
        },
    )

    private var loadingHandler: LoadingHandler? = null
    private var isDestroyed = false

    override fun setLoadingHandler(loadingHandler: LoadingHandler) {
        this.loadingHandler = loadingHandler
    }

    init {
        lifecycle.doOnDestroy {
            isDestroyed = true
            refreshCoordinator.close()
        }
        refreshCoordinator.refresh()
    }

    override fun refreshRefunds() {
        refreshCoordinator.refresh()
    }

    override fun onBack() {
        navigationHandler.navigateBack()
    }

    override fun approveRefund(refundRequest: RefundRequest) {
        if (isDestroyed) return
        scope.launch {
            runRefundMutation(
                loadingHandler = loadingHandler,
                loadingMessage = "Approving refund...",
                operation = { billingRepository.approveRefund(refundRequest) },
                onSuccess = {
                    if (!isDestroyed) {
                        _refundsWithRelations.value = _refundsWithRelations.value.filter {
                            it.refundRequest.id != refundRequest.id
                        }
                    }
                },
                onFailure = { error ->
                    if (!isDestroyed) {
                        _errorState.value = ErrorMessage(error.userMessage("Error approving refund"))
                    }
                },
            )
        }
    }

    override fun rejectRefund(refundId: String) {
        if (isDestroyed) return
        scope.launch {
            runRefundMutation(
                loadingHandler = loadingHandler,
                loadingMessage = "Rejecting refund...",
                operation = { billingRepository.rejectRefund(refundId) },
                onSuccess = {
                    if (!isDestroyed) {
                        _refundsWithRelations.value = _refundsWithRelations.value.filter {
                            it.refundRequest.id != refundId
                        }
                    }
                },
                onFailure = { error ->
                    if (!isDestroyed) {
                        _errorState.value = ErrorMessage(error.userMessage("Error rejecting refund"))
                    }
                },
            )
        }
    }
}

internal fun ComponentContext.refundManagerCoroutineScope(): CoroutineScope =
    CoroutineScope(Dispatchers.Main + SupervisorJob()).withLifecycle(lifecycle)

internal class RefundRefreshCoordinator(
    private val scope: CoroutineScope,
    private val loadRefunds: suspend () -> Result<List<RefundRequestWithRelations>>,
    private val onLoadingChanged: (Boolean) -> Unit,
    private val onSuccess: (List<RefundRequestWithRelations>) -> Unit,
    private val onFailure: (Throwable) -> Unit,
) {
    private var generation = 0L
    private var activeJob: Job? = null
    private var isClosed = false

    fun refresh() {
        if (isClosed) return
        val requestGeneration = ++generation
        activeJob?.cancel()
        onLoadingChanged(true)
        activeJob = scope.launch {
            try {
                val result = try {
                    loadRefunds()
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    Result.failure(error)
                }

                if (isClosed || requestGeneration != generation) {
                    return@launch
                }
                result.fold(
                    onSuccess = onSuccess,
                    onFailure = onFailure,
                )
            } finally {
                if (!isClosed && requestGeneration == generation) {
                    activeJob = null
                    onLoadingChanged(false)
                }
            }
        }
    }

    fun close() {
        if (isClosed) return
        isClosed = true
        generation += 1
        activeJob?.cancel()
        activeJob = null
        onLoadingChanged(false)
    }
}

internal suspend fun runRefundMutation(
    loadingHandler: LoadingHandler?,
    loadingMessage: String,
    operation: suspend () -> Result<Unit>,
    onSuccess: () -> Unit,
    onFailure: (Throwable) -> Unit,
) {
    loadingHandler?.showLoading(loadingMessage)
    try {
        val result = try {
            operation()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            Result.failure(error)
        }
        result.fold(
            onSuccess = { onSuccess() },
            onFailure = onFailure,
        )
    } finally {
        loadingHandler?.hideLoading()
    }
}
