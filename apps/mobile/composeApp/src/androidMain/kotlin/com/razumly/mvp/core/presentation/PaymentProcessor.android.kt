package com.razumly.mvp.core.presentation

import android.content.Context
import com.razumly.mvp.BuildConfig
import com.razumly.mvp.core.data.dataTypes.BillingAddress
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.presentation.util.billingAddressFromStripeAddress
import com.razumly.mvp.core.util.UrlHandler
import com.stripe.android.PaymentConfiguration
import com.stripe.android.paymentelement.AddressElementSameAsBillingPreview
import com.stripe.android.paymentsheet.PaymentSheet
import com.stripe.android.paymentsheet.PaymentSheetResult
import com.stripe.android.paymentsheet.addresselement.AddressLauncher
import com.stripe.android.paymentsheet.addresselement.AddressLauncherResult
import io.github.aakira.napier.Napier
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

actual open class PaymentProcessor : IPaymentProcessor {
    private val _paymentSheet = MutableStateFlow<PaymentSheet?>(null)

    private val _paymentResult = MutableStateFlow<PaymentResult?>(null)
    actual override val paymentResult = _paymentResult.asStateFlow()

    actual override var handleAddressResult = { billingAddress: BillingAddress -> }
    private var _addressLauncher = MutableStateFlow<AddressLauncher?>(null)
    private var _customerConfig: PaymentSheet.CustomerConfiguration? = null
    private var purchaseIntent = MutableStateFlow<PurchaseIntent?>(null)
    private var _context: Context? = null

    actual override var urlHandler: UrlHandler? = null

    @OptIn(AddressElementSameAsBillingPreview::class)
    actual override fun presentAddressElement(
        billingAddress: BillingAddress
    ) {
        val config =
            AddressLauncher.Configuration.Builder().googlePlacesApiKey(BuildConfig.MAPS_API_KEY)
                .billingAddress(
                    PaymentSheet.BillingDetails(
                        PaymentSheet.Address(
                            line1 = billingAddress.line1,
                            line2 = billingAddress.line2,
                            city = billingAddress.city,
                            state = billingAddress.state,
                            country = billingAddress.country,
                            postalCode = billingAddress.postalCode
                        )
                    )
                ).build()

        _addressLauncher.value?.present(BuildConfig.STRIPE_KEY, config)
    }

    actual override fun presentPaymentSheet() {
        purchaseIntent.value?.let {
            _paymentSheet.value?.presentWithPaymentIntent(
                it.paymentIntent!!, PaymentSheet.Configuration(
                    merchantDisplayName = "MVP",
                    customer = _customerConfig,
                    allowsDelayedPaymentMethods = true,
                    billingDetailsCollectionConfiguration = PaymentSheet.BillingDetailsCollectionConfiguration(
                        name = PaymentSheet.BillingDetailsCollectionConfiguration.CollectionMode.Always,
                        email = PaymentSheet.BillingDetailsCollectionConfiguration.CollectionMode.Always,
                        phone = PaymentSheet.BillingDetailsCollectionConfiguration.CollectionMode.Never,
                        address = PaymentSheet.BillingDetailsCollectionConfiguration.AddressCollectionMode.Full,
                        attachDefaultsToPaymentMethod = true
                    )
                )
            )
        }
    }

    actual override suspend fun setPaymentIntent(intent: PurchaseIntent) {
        purchaseIntent.value = intent
        if (purchaseIntent.value == null || _context == null) return
        _customerConfig = PaymentSheet.CustomerConfiguration(
            id = purchaseIntent.value!!.customer!!,
            ephemeralKeySecret = purchaseIntent.value!!.ephemeralKey!!
        )
        PaymentConfiguration.init(_context!!, purchaseIntent.value!!.publishableKey!!)
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

    fun onAddressLauncherResult(addressLauncherResult: AddressLauncherResult) {
        when (addressLauncherResult) {
            is AddressLauncherResult.Canceled -> {
                Napier.d("Cancelled Address", tag = "Stripe")
            }

            is AddressLauncherResult.Succeeded -> {
                Napier.d("Completed Address", tag = "Stripe")
                val billingAddress = addressLauncherResult.address.address?.let {
                    billingAddressFromStripeAddress(it)
                }
                billingAddress?.let { handleAddressResult(billingAddress) }
            }
        }
    }

    fun setPaymentSheet(newPaymentSheet: PaymentSheet) {
        _paymentSheet.value = newPaymentSheet
    }

    fun setAddressLauncher(addressLauncher: AddressLauncher) {
        _addressLauncher.value = addressLauncher
    }

    fun setContext(context: Context) {
        _context = context
        urlHandler = UrlHandler(context)
    }
}