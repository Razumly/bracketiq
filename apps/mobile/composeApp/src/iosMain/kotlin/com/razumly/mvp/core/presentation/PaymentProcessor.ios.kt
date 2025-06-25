package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.presentation.composables.NativeViewFactory
import com.razumly.mvp.core.util.UrlHandler
import io.github.aakira.napier.Napier

// In iosMain
actual open class PaymentProcessor : IPaymentProcessor {
    actual override var urlHandler: UrlHandler? = null

    private var purchaseIntent: PurchaseIntent? = null
    private var onPaymentResult: ((PaymentResult) -> Unit)? = null
    private var _nativeViewFactory: NativeViewFactory? = null

    actual override suspend fun setPaymentIntent(intent: PurchaseIntent) {
        purchaseIntent = intent
    }

    actual override fun presentPaymentSheet() {
        val intent = purchaseIntent ?: return

        _nativeViewFactory?.presentStripePaymentSheet(
            publishableKey = intent.publishableKey,
            customerId = intent.customer,
            ephemeralKey = intent.ephemeralKey,
            paymentIntent = intent.paymentIntent,
            onPaymentResult = { result ->
                handlePaymentResult(result)
            }
        )
    }

    private fun handlePaymentResult(result: PaymentResult) {
        when (result) {
            is PaymentResult.Completed -> {
                Napier.d("Completed Purchase", tag = "Stripe")
                // Handle success
            }
            is PaymentResult.Canceled -> {
                Napier.d("Cancelled Purchase", tag = "Stripe")
                // Handle cancellation
            }
            is PaymentResult.Failed -> {
                Napier.d("Failed Purchase: ${result.error}", tag = "Stripe")
                // Handle failure
            }
        }
        onPaymentResult?.invoke(result)
    }

    fun setPaymentResultCallback(callback: (PaymentResult) -> Unit) {
        onPaymentResult = callback
    }

    fun setNativeViewFactory(factory: NativeViewFactory) {
        _nativeViewFactory = factory
        urlHandler = UrlHandler()
    }
}
