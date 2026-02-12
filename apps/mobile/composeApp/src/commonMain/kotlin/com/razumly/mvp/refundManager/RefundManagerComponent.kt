package com.razumly.mvp.refundManager

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.RefundRequestWithRelations
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

interface RefundManagerComponent {
    val errorState: StateFlow<ErrorMessage?>
    val refundsWithRelations: StateFlow<List<RefundRequestWithRelations>>
    val isLoading: StateFlow<Boolean>

    fun approveRefund(refundRequest: RefundRequest)
    fun rejectRefund(refundId: String)
    fun setLoadingHandler(loadingHandler: LoadingHandler)
    fun refreshRefunds()
}

class DefaultRefundManagerComponent(
    private val componentContext: ComponentContext,
    private val userRepository: IUserRepository,
    private val billingRepository: IBillingRepository,
) : ComponentContext by componentContext, RefundManagerComponent {

    private val scopeMain = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val scopeIO = CoroutineScope(Dispatchers.Default + SupervisorJob())

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState.asStateFlow()

    private val _refundsWithRelations = MutableStateFlow<List<RefundRequestWithRelations>>(emptyList())
    override val refundsWithRelations = _refundsWithRelations.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    override val isLoading = _isLoading.asStateFlow()

    private lateinit var loadingHandler: LoadingHandler

    override fun setLoadingHandler(handler: LoadingHandler) {
        loadingHandler = handler
    }

    init {
        loadRefunds()
    }

    private fun loadRefunds() {
        scopeIO.launch {
            _isLoading.value = true
            billingRepository.getRefundsWithRelations().onSuccess {
                _refundsWithRelations.value = it
            }.onFailure {
                _errorState.value = ErrorMessage(it.message ?: "Error getting refunds")
            }
            _isLoading.value = false
        }
    }

    override fun refreshRefunds() {
        loadRefunds()
    }

    override fun approveRefund(refund: RefundRequest) {
        scopeIO.launch {
            loadingHandler.showLoading("Approving refund...")
            billingRepository.approveRefund(refund).onSuccess {
                _refundsWithRelations.value = _refundsWithRelations.value.filter { it.refundRequest.id != refund.id }
            }.onFailure {
                _errorState.value = ErrorMessage(it.message ?: "Error approving refund")
            }
            loadingHandler.hideLoading()
        }
    }

    override fun rejectRefund(refundId: String) {
        scopeIO.launch {
            loadingHandler.showLoading("Rejecting refund...")
            billingRepository.rejectRefund(refundId).onSuccess {
                _refundsWithRelations.value = _refundsWithRelations.value.filter { it.refundRequest.id != refundId }
            }.onFailure {
                _errorState.value = ErrorMessage(it.message ?: "Error rejecting refund")
            }
            loadingHandler.hideLoading()
        }
    }
}
