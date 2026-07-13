package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.util.UrlHandler
import kotlinx.coroutines.flow.StateFlow

interface IPaymentProcessor {
    val paymentResult: StateFlow<PaymentResult?>
    var urlHandler: UrlHandler?
    fun presentPaymentSheet(email: String, name: String, billingAddress: BillingAddressDraft?)
    suspend fun setPaymentIntent(intent: PurchaseIntent)
    fun clearPaymentResult()
}

expect open class PaymentProcessor(): IPaymentProcessor {
    override val paymentResult: StateFlow<PaymentResult?>
    override var urlHandler: UrlHandler?
    override fun presentPaymentSheet(email: String, name: String, billingAddress: BillingAddressDraft?)
    override suspend fun setPaymentIntent(intent: PurchaseIntent)
    override fun clearPaymentResult()
}

sealed class PaymentResult {
    object Completed : PaymentResult()
    object Canceled : PaymentResult()
    data class Failed(val error: String) : PaymentResult()
}

/**
 * Both platform PaymentSheet implementations must resolve a checkout attempt with a result.
 *
 * A payment caller registers its result observer before asking the platform to present the
 * sheet. Returning early here would leave that observer (and its loading UI) waiting forever,
 * so the platform implementations turn each validation error into [PaymentResult.Failed].
 */
internal fun paymentSheetLaunchError(intent: PurchaseIntent?): String? = when {
    intent == null -> "Payment details are unavailable. Please try again."
    intent.publishableKey.isNullOrBlank() -> "Payment setup is unavailable. Please try again."
    intent.paymentIntent.isNullOrBlank() -> "Payment details are incomplete. Please refresh and try again."
    else -> null
}
