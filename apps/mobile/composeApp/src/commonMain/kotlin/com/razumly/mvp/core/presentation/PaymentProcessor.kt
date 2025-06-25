package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.util.UrlHandler

interface IPaymentProcessor {
    var urlHandler: UrlHandler?
    fun presentPaymentSheet()
    suspend fun setPaymentIntent(intent: PurchaseIntent)
}

expect open class PaymentProcessor(): IPaymentProcessor {
    override var urlHandler: UrlHandler?
    override fun presentPaymentSheet()
    override suspend fun setPaymentIntent(intent: PurchaseIntent)
}

sealed class PaymentResult {
    object Completed : PaymentResult()
    object Canceled : PaymentResult()
    data class Failed(val error: String) : PaymentResult()
}