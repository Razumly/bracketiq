package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import com.razumly.mvp.core.presentation.IPaymentProcessor

@Composable
expect fun PaymentProcessorButton(
    onClick: () -> Unit,
    paymentProcessor: IPaymentProcessor,
    text: String,
)