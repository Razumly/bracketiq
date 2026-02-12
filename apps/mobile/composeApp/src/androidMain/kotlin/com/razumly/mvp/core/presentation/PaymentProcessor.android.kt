package com.razumly.mvp.core.presentation

import android.content.Context
import com.razumly.mvp.BuildConfig
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.util.UrlHandler
import com.stripe.android.PaymentConfiguration
import com.stripe.android.paymentelement.AddressAutocompletePreview
import com.stripe.android.paymentsheet.PaymentSheet
import com.stripe.android.paymentsheet.PaymentSheetResult
import io.github.aakira.napier.Napier
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

actual open class PaymentProcessor : IPaymentProcessor {
    private val _paymentSheet = MutableStateFlow<PaymentSheet?>(null)

    private val _paymentResult = MutableStateFlow<PaymentResult?>(null)
    actual override val paymentResult = _paymentResult.asStateFlow()

    private var _customerConfig: PaymentSheet.CustomerConfiguration? = null
    private var purchaseIntent = MutableStateFlow<PurchaseIntent?>(null)
    private var _context: Context? = null

    actual override var urlHandler: UrlHandler? = null

    @OptIn(AddressAutocompletePreview::class)
    actual override fun presentPaymentSheet(email: String, name: String) {
        purchaseIntent.value?.let {
            val clientSecret = it.paymentIntent ?: return
            _paymentSheet.value?.presentWithPaymentIntent(
                paymentIntentClientSecret = clientSecret,
                configuration = PaymentSheet.Configuration.Builder("MVP").apply {
                    _customerConfig?.let(::customer)
                }.allowsDelayedPaymentMethods(true).defaultBillingDetails(
                    PaymentSheet.BillingDetails(email = email, name = name)
                ).googlePlacesApiKey(BuildConfig.MAPS_API_KEY).build()
            )
        }
    }

    actual override suspend fun setPaymentIntent(intent: PurchaseIntent) {
        purchaseIntent.value = intent
        val context = _context ?: return

        val publishableKey = intent.publishableKey
        if (publishableKey.isNullOrBlank()) {
            Napier.e("Missing Stripe publishableKey", tag = "Stripe")
            return
        }
        PaymentConfiguration.init(context, publishableKey)

        _customerConfig = if (!intent.customer.isNullOrBlank() && !intent.ephemeralKey.isNullOrBlank()) {
            PaymentSheet.CustomerConfiguration(
                id = intent.customer,
                ephemeralKeySecret = intent.ephemeralKey,
            )
        } else {
            null
        }
    }

    actual override fun clearPaymentResult() {
        _paymentResult.value = null
    }

    fun onPaymentSheetResult(paymentSheetResult: PaymentSheetResult) {
        when (paymentSheetResult) {
            is PaymentSheetResult.Canceled -> {
                Napier.d("Cancelled Purchase", tag = "Stripe")
                _paymentResult.value = PaymentResult.Canceled
            }

            is PaymentSheetResult.Failed -> {
                Napier.d("Failed Purchase", throwable = paymentSheetResult.error, tag = "Stripe")
                _paymentResult.value = PaymentResult.Failed(
                    paymentSheetResult.error.localizedMessage ?: "Unknown Error"
                )
            }

            is PaymentSheetResult.Completed -> {
                Napier.d("Completed Purchase", tag = "Stripe")
                _paymentResult.value = PaymentResult.Completed
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
