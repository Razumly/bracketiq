package com.razumly.mvp.core.presentation.util

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import com.razumly.mvp.core.data.dataTypes.BillingAddress
import com.stripe.android.paymentsheet.PaymentSheet

@Composable
actual fun getScreenWidth(): Int = LocalConfiguration.current.screenWidthDp

@Composable
actual fun getScreenHeight(): Int = LocalConfiguration.current.screenHeightDp

fun billingAddressFromStripeAddress(result: PaymentSheet.Address): BillingAddress =
    BillingAddress(
        result.line1 ?: "",
        result.line2 ?: "",
        result.city ?: "",
        result.state ?: "",
        result.postalCode ?: "",
        result.country ?: ""
    )