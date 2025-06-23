package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import com.razumly.mvp.core.presentation.IPaymentProcessor

@Composable
actual fun PaymentProcessorButton(
    onClick: () -> Unit,
    paymentProcessor: IPaymentProcessor,
    text: String
) {
}