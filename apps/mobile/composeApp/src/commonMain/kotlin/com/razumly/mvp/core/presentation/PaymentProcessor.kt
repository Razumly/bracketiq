package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.dataTypes.BillingAddress
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.util.UrlHandler
import kotlinx.coroutines.flow.StateFlow

interface IPaymentProcessor {
    val paymentResult: StateFlow<PaymentResult?>
    var urlHandler: UrlHandler?
    var handleAddressResult: (billingAddress: BillingAddress) -> Unit
    fun presentPaymentSheet()
    fun presentAddressElement(billingAddress: BillingAddress)
    suspend fun setPaymentIntent(intent: PurchaseIntent)
}

expect open class PaymentProcessor(): IPaymentProcessor {
    override val paymentResult: StateFlow<PaymentResult?>
    override var urlHandler: UrlHandler?
    override var handleAddressResult: (billingAddress: BillingAddress)->Unit
    override fun presentPaymentSheet()
    override suspend fun setPaymentIntent(intent: PurchaseIntent)
    override fun presentAddressElement(billingAddress: BillingAddress)
}

sealed class PaymentResult {
    object Completed : PaymentResult()
    object Canceled : PaymentResult()
    data class Failed(val error: String) : PaymentResult()
}