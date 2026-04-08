package com.razumly.mvp.core.presentation

import android.content.Context
import com.razumly.mvp.BuildConfig
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.util.UrlHandler
import com.stripe.android.core.exception.APIConnectionException
import com.stripe.android.PaymentConfiguration
import com.stripe.android.paymentelement.AddressAutocompletePreview
import com.stripe.android.paymentsheet.PaymentSheet
import com.stripe.android.paymentsheet.PaymentSheetResult
import io.github.aakira.napier.Napier
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.net.UnknownHostException

actual open class PaymentProcessor : IPaymentProcessor {
    private val _paymentSheet = MutableStateFlow<PaymentSheet?>(null)

    private val _paymentResult = MutableStateFlow<PaymentResult?>(null)
    actual override val paymentResult = _paymentResult.asStateFlow()

    private var _customerConfig: PaymentSheet.CustomerConfiguration? = null
    private var purchaseIntent = MutableStateFlow<PurchaseIntent?>(null)
    private var _context: Context? = null

    actual override var urlHandler: UrlHandler? = null

    @OptIn(AddressAutocompletePreview::class)
    actual override fun presentPaymentSheet(email: String, name: String, billingAddress: BillingAddressDraft?) {
        purchaseIntent.value?.let {
            val clientSecret = it.paymentIntent ?: return
            val normalizedBillingAddress = billingAddress?.normalized()
            _paymentSheet.value?.presentWithPaymentIntent(
                paymentIntentClientSecret = clientSecret,
                configuration = PaymentSheet.Configuration.Builder("BracketIQ").apply {
                    _customerConfig?.let(::customer)
                }.allowsDelayedPaymentMethods(true).defaultBillingDetails(
                    PaymentSheet.BillingDetails(
                        email = email,
                        name = name,
                        address = normalizedBillingAddress?.let { address ->
                            PaymentSheet.Address(
                                line1 = address.line1,
                                line2 = address.line2,
                                city = address.city,
                                state = address.state,
                                postalCode = address.postalCode,
                                country = address.countryCode,
                            )
                        },
                    )
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
                val message = paymentSheetResult.error.toUserFacingPaymentMessage()
                Napier.w("Failed Purchase: $message", tag = "Stripe")
                _paymentResult.value = PaymentResult.Failed(
                    message
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

    private fun Throwable.toUserFacingPaymentMessage(): String {
        val rootCause = rootCause()
        return when {
            this is UnknownHostException ||
                rootCause is UnknownHostException ||
                containsDnsResolutionFailure(this.message) ||
                containsDnsResolutionFailure(this.localizedMessage) ||
                containsDnsResolutionFailure(rootCause.message) ||
                containsDnsResolutionFailure(rootCause.localizedMessage) -> {
                "Unable to reach Stripe. Check your internet, VPN/Private DNS, or ad blocker, then try again."
            }

            this is APIConnectionException || rootCause is APIConnectionException -> {
                "Unable to connect to Stripe right now. Please try again."
            }

            else -> {
                val sanitized = sanitizeSensitiveQueryValues(
                    this.localizedMessage ?: this.message.orEmpty()
                ).trim()
                if (sanitized.isNotBlank()) sanitized else "Unable to process payment right now."
            }
        }
    }

    private fun Throwable.rootCause(): Throwable {
        var current: Throwable = this
        while (current.cause != null && current.cause !== current) {
            current = current.cause!!
        }
        return current
    }

    private fun containsDnsResolutionFailure(message: String?): Boolean {
        if (message.isNullOrBlank()) return false
        val normalized = message.lowercase()
        return normalized.contains("unable to resolve host") ||
            normalized.contains("no address associated with hostname") ||
            normalized.contains("android_getaddrinfo failed")
    }

    private fun sanitizeSensitiveQueryValues(message: String): String {
        return message
            .replace(Regex("client_secret=[^&\\s]+", RegexOption.IGNORE_CASE), "client_secret=***")
            .replace(Regex("ephemeral_key=[^&\\s]+", RegexOption.IGNORE_CASE), "ephemeral_key=***")
    }
}
