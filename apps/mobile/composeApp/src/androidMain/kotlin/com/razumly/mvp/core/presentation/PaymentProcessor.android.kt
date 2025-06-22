package com.razumly.mvp.core.presentation

import android.content.Context
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.util.UrlHandler
import com.stripe.android.PaymentConfiguration
import com.stripe.android.paymentsheet.PaymentSheet
import com.stripe.android.paymentsheet.PaymentSheetResult
import io.github.aakira.napier.Napier
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

actual open class PaymentProcessor: IPaymentProcessor {
    private val _paymentSheet = MutableStateFlow<PaymentSheet?>(null)
    val paymentSheet = _paymentSheet.asStateFlow()

    private var _customerConfig: PaymentSheet.CustomerConfiguration? = null
    private var purchaseIntent = MutableStateFlow<PurchaseIntent?>(null)
    private var _context: Context? = null

    actual override var urlHandler: UrlHandler? = null

    actual override fun presentPaymentSheet() {
        purchaseIntent.value?.let {
            paymentSheet.value?.presentWithPaymentIntent(
                it. paymentIntent,
                PaymentSheet.Configuration(
                    merchantDisplayName = "MVP",
                    customer = _customerConfig,
                    allowsDelayedPaymentMethods = true
                )
            )
        }
    }

    actual override suspend fun setPaymentIntent(intent: PurchaseIntent) {
        purchaseIntent.value = intent
        if (purchaseIntent.value == null || _context == null) return
        _customerConfig = PaymentSheet.CustomerConfiguration(
            id = purchaseIntent.value!!.customer,
            ephemeralKeySecret = purchaseIntent.value!!.ephemeralKey
        )
        PaymentConfiguration.init(_context!!, purchaseIntent.value!!.publishableKey)
    }

    fun onPaymentSheetResult(paymentSheetResult: PaymentSheetResult) {
        when (paymentSheetResult) {
            is PaymentSheetResult.Canceled -> {
                Napier.d("Cancelled Purchase", tag = "Stripe")
            }
            is PaymentSheetResult.Failed -> {
                Napier.d("Failed Purchase", throwable = paymentSheetResult.error, tag = "Stripe")
            }
            is PaymentSheetResult.Completed -> {
                Napier.d("Completed Purchase", tag = "Stripe")
            }
        }
    }

    fun setPaymentSheet(newPaymentSheet: PaymentSheet) {
        _paymentSheet.value = newPaymentSheet
    }

    fun setContext(context: Context) {
        _context = context
        urlHandler = UrlHandler(context)
    }
}