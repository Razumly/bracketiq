package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.util.UrlHandler
import kotlinx.coroutines.flow.StateFlow

interface IPaymentProcessor {
    val paymentResult: StateFlow<PaymentResult?>
    var urlHandler: UrlHandler?
    fun presentPaymentSheet(email: String, name: String)
    suspend fun setPaymentIntent(intent: PurchaseIntent)
    fun clearPaymentResult()
}

expect open class PaymentProcessor(): IPaymentProcessor {
    override val paymentResult: StateFlow<PaymentResult?>
    override var urlHandler: UrlHandler?
    override fun presentPaymentSheet(email: String, name: String)
    override suspend fun setPaymentIntent(intent: PurchaseIntent)
    override fun clearPaymentResult()
}

sealed class PaymentResult {
    object Completed : PaymentResult()
    object Canceled : PaymentResult()
    data class Failed(val error: String) : PaymentResult()
}
